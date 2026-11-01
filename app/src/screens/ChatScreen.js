import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, uploadMedia } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Composer } from '../components/Composer';
import { Header } from '../components/Header';
import { MessageBubble } from '../components/MessageBubble';
import { dayLabel } from '../format';
import { useChat } from '../state/ChatContext';
import { colors } from '../theme';

function clientId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function dayKey(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function ChatScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { socket, connected, conversation } = useChat();
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [viewer, setViewer] = useState(null);
  const loadingOlder = useRef(false);
  const allowOlder = useRef(false);
  const playerRef = useRef(null);

  const conversationId = conversation?.id;

  const upsert = useCallback((message, pendingId) => {
    setMessages((prev) => {
      const stripped = pendingId ? prev.filter((item) => item.clientId !== pendingId) : prev;
      if (message.id && stripped.some((item) => item.id === message.id)) {
        return stripped.map((item) => (item.id === message.id ? message : item));
      }
      return [...stripped, message];
    });
  }, []);

  useEffect(() => {
    if (!conversationId) return undefined;
    let cancel = false;
    allowOlder.current = false;
    setLoading(true);
    api(`/api/conversation/${conversationId}/messages?limit=30`, { token })
      .then((data) => {
        if (cancel) return;
        setMessages(data.messages);
        setHasMore(data.hasMore);
      })
      .catch((err) => {
        if (!cancel) Alert.alert('Chat', err.message);
      })
      .finally(() => {
        if (!cancel) {
          setLoading(false);
          setTimeout(() => {
            allowOlder.current = true;
          }, 600);
        }
      });
    return () => {
      cancel = true;
    };
  }, [conversationId, token]);

  useEffect(() => {
    if (!socket) return undefined;
    const onMessage = ({ message, clientId: pendingId }) => {
      if (message.conversationId !== conversationId) return;
      upsert(message, pendingId);
    };
    socket.on('message:new', onMessage);
    return () => socket.off('message:new', onMessage);
  }, [socket, conversationId, upsert]);

  useEffect(() => {
    return () => {
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, []);

  const feed = useMemo(() => {
    const items = [];
    let lastDay = '';
    messages.forEach((message) => {
      const key = dayKey(message.createdAt);
      if (key !== lastDay) {
        items.push({ kind: 'day', key: `day-${key}`, label: dayLabel(message.createdAt) });
        lastDay = key;
      }
      items.push({ kind: 'message', key: message.id || message.clientId, message });
    });
    return items.reverse();
  }, [messages]);

  async function loadOlder() {
    if (!allowOlder.current || !hasMore || loadingOlder.current || messages.length === 0) return;
    loadingOlder.current = true;
    try {
      const oldest = messages[0].createdAt;
      const data = await api(
        `/api/conversation/${conversationId}/messages?limit=30&before=${encodeURIComponent(oldest)}`,
        { token }
      );
      setMessages((prev) => {
        const ids = new Set(prev.map((item) => item.id));
        return [...data.messages.filter((item) => !ids.has(item.id)), ...prev];
      });
      setHasMore(data.hasMore);
    } catch {
      // Keep the messages already on screen.
    } finally {
      loadingOlder.current = false;
    }
  }

  function markFailed(pendingId, local) {
    setMessages((prev) =>
      prev.map((item) => (item.clientId === pendingId ? { ...item, pending: false, failed: true, local } : item))
    );
  }

  async function emitMessage(payload) {
    if (!socket?.connected) throw new Error('Not connected.');
    return new Promise((resolve, reject) => {
      socket.emit('message:send', payload, (ack) => {
        if (!ack?.ok) reject(new Error(ack?.error || 'Could not send.'));
        else resolve(ack.message);
      });
    });
  }

  async function sendPayload(local, pendingId = clientId()) {
    const optimistic = {
      clientId: pendingId,
      senderId: user.id,
      conversationId,
      type: local.type,
      text: local.text || '',
      mediaUrl: local.uri || '',
      durationMs: local.durationMs || 0,
      createdAt: new Date().toISOString(),
      pending: true,
      failed: false,
      local,
    };
    setMessages((prev) => [...prev.filter((item) => item.clientId !== pendingId), optimistic]);

    try {
      let mediaUrl = local.mediaUrl || '';
      if ((local.type === 'image' || local.type === 'voice') && local.uri && !mediaUrl) {
        const uploaded = await uploadMedia(token, local.uri, local.type);
        mediaUrl = uploaded.url;
      }
      const saved = await emitMessage({
        conversationId,
        clientId: pendingId,
        type: local.type,
        text: local.text,
        mediaUrl,
        durationMs: local.durationMs,
      });
      upsert(saved, pendingId);
    } catch (err) {
      markFailed(pendingId, local);
      Alert.alert('Message', err.message);
    }
  }

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos', 'Allow photo access to send pictures.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    await sendPayload({ type: 'image', uri: result.assets[0].uri });
  }

  async function toggleVoice(message) {
    const id = message.id || message.clientId;
    if (playingId === id) {
      playerRef.current?.pause();
      setPlayingId(null);
      return;
    }
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      playerRef.current?.remove();
      const player = createAudioPlayer(message.mediaUrl);
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) setPlayingId(null);
      });
      playerRef.current = player;
      player.play();
      setPlayingId(id);
    } catch {
      Alert.alert('Voice message', 'Could not play that recording.');
    }
  }

  if (!conversation) {
    return (
      <View style={styles.screen}>
        <Header title="Chat" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Text style={styles.empty}>Connect with someone to start chatting.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title={conversation.partner.displayName}
        subtitle={connected ? undefined : 'Connecting…'}
        onBack={() => navigation.goBack()}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.teal} />
        </View>
      ) : (
        <FlatList
          inverted
          data={feed}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadOlder}
          onEndReachedThreshold={0.2}
          renderItem={({ item }) =>
            item.kind === 'day' ? (
              <View style={styles.dayWrap}>
                <Text style={styles.day}>{item.label}</Text>
              </View>
            ) : (
              <MessageBubble
                message={item.message}
                mine={item.message.senderId === user.id}
                playing={playingId === (item.message.id || item.message.clientId)}
                onToggleVoice={toggleVoice}
                onOpenImage={setViewer}
                onRetry={() => item.message.local && sendPayload(item.message.local, item.message.clientId)}
              />
            )
          }
        />
      )}
      {!loading && messages.length === 0 ? <Text style={styles.hello}>Say hello.</Text> : null}
      <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
        <Composer
          onSendText={(text) => sendPayload({ type: 'text', text })}
          onPickImage={pickImage}
          onVoice={(uri, durationMs) => sendPayload({ type: 'voice', uri, durationMs })}
        />
      </View>
      <Modal visible={Boolean(viewer)} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)}>
          {viewer ? (
            <Image pointerEvents="none" source={{ uri: viewer }} style={styles.fullImage} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingVertical: 10,
    flexGrow: 1,
  },
  dayWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  day: {
    backgroundColor: colors.day,
    color: colors.muted,
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  hello: {
    position: 'absolute',
    top: '46%',
    alignSelf: 'center',
    color: colors.muted,
    backgroundColor: colors.day,
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImage: {
    width: '100%',
    height: '80%',
  },
});
