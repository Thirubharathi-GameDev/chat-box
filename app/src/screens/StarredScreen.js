import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { applyMarks, loadMarks, loadMessages, localMediaUri, persistMedia } from '../cache';
import { Header } from '../components/Header';
import { Waveform } from '../components/Waveform';
import { durationLabel, listTime, previewLabel } from '../format';
import { useChat } from '../state/ChatContext';
import { font, useColors } from '../theme';
import { createVoiceController } from '../voicePlayback';

export function StarredScreen({ navigation }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { token, user } = useAuth();
  const { conversation } = useChat();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [busyId, setBusyId] = useState('');
  const playbackRef = useRef(null);

  useEffect(() => {
    if (!conversation?.id || !user?.id) {
      setLoading(false);
      return undefined;
    }
    let cancel = false;
    Promise.all([
      loadMessages(user.id, conversation.id),
      loadMarks(user.id, conversation.id),
      api(`/api/conversation/${conversation.id}/starred`, { token }).catch(() => ({ messages: [] })),
    ]).then(async ([cached, marks, remote]) => {
      if (cancel) return;
      const hidden = new Set(marks.hidden);
      const map = new Map();
      applyMarks(cached, marks)
        .filter((message) => message.starred && message.id)
        .forEach((message) => map.set(message.id, message));
      (remote.messages || []).forEach((message) => {
        if (hidden.has(message.id) || marks.unstarred.includes(message.id)) return;
        map.set(message.id, { ...map.get(message.id), ...message, starred: true });
      });
      let list = [...map.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      list = await Promise.all(
        list.map(async (message) => {
          if (message.type !== 'voice' || localMediaUri(message) || !message.mediaUrl) return message;
          const localPath = await persistMedia(message.mediaUrl, message.id, 'voice');
          return localPath ? { ...message, localPath } : message;
        })
      );
      if (cancel) return;
      setItems(list);
      setLoading(false);
    });
    return () => {
      cancel = true;
      playbackRef.current?.stop();
      playbackRef.current = null;
    };
  }, [conversation?.id, token, user?.id]);

  async function toggleVoice(message) {
    const id = message.id;
    if (playingId === id) {
      playbackRef.current?.pause();
      setPlayingId(null);
      return;
    }
    let uri = localMediaUri(message);
    if (!uri && message.mediaUrl) {
      setBusyId(id);
      uri = await persistMedia(message.mediaUrl, message.id, 'voice');
      if (uri) {
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, localPath: uri } : item)));
      }
      setBusyId('');
    }
    if (!uri) {
      Alert.alert('Voice message', 'Connect to download this voice note.');
      return;
    }
    try {
      playbackRef.current?.stop();
      const controller = createVoiceController({
        uri,
        onUpdate: (status) => {
          if (status.didFinish) {
            setPlayingId(null);
            setProgress(0);
            return;
          }
          const duration = status.duration || (message.durationMs || 0) / 1000;
          if (duration > 0) setProgress(Math.max(0, Math.min(1, status.position / duration)));
        },
      });
      playbackRef.current = controller;
      await controller.play(false, 0);
      setPlayingId(id);
      setProgress(0);
    } catch {
      playbackRef.current?.stop();
      playbackRef.current = null;
      Alert.alert('Voice message', 'Could not play that recording.');
    }
  }

  return (
    <View style={styles.screen}>
      <Header title="Starred" onBack={() => navigation.goBack()} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.teal} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="star-outline" size={56} color={colors.teal} />
          <Text style={styles.empty}>No starred messages yet</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {items.map((message) => (
            <View key={message.id} style={styles.row}>
              <Ionicons name="star" size={16} color={colors.teal} style={styles.star} />
              <Pressable
                style={styles.body}
                onPress={() => navigation.navigate('Chat', { focusId: message.id, seedMessage: message })}
              >
                {message.type === 'voice' ? (
                  <View style={styles.voice}>
                    {busyId === message.id ? (
                      <ActivityIndicator size="small" color={colors.header} />
                    ) : (
                      <Pressable onPress={() => toggleVoice(message)} hitSlop={8} style={styles.play}>
                        <Ionicons
                          name={playingId === message.id ? 'pause' : 'play'}
                          size={24}
                          color={colors.header}
                        />
                      </Pressable>
                    )}
                    <Waveform
                      levels={message.waveform}
                      progress={playingId === message.id ? progress : 0}
                      color={colors.teal}
                      dim={colors.shell}
                    />
                    <Text style={styles.duration}>{durationLabel(message.durationMs)}</Text>
                  </View>
                ) : message.type === 'image' ? (
                  <Text style={styles.text}>Photo</Text>
                ) : (
                  <Text style={styles.text}>{message.text || previewLabel(message)}</Text>
                )}
                <Text style={styles.time}>{listTime(message.createdAt)}</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    empty: {
      marginTop: 14,
      color: colors.muted,
      fontFamily: font.semibold,
      fontSize: 16,
    },
    list: {
      padding: 16,
      gap: 10,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    star: {
      marginTop: 4,
    },
    body: {
      flex: 1,
    },
    text: {
      color: colors.text,
      fontFamily: font.medium,
      fontSize: 15,
      lineHeight: 22,
    },
    voice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 36,
    },
    play: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    duration: {
      color: colors.muted,
      fontSize: 12,
      minWidth: 32,
      fontFamily: font.medium,
    },
    time: {
      marginTop: 6,
      color: colors.muted,
      fontFamily: font.medium,
      fontSize: 12,
    },
  });
}
