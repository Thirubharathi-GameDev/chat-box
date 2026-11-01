import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { Header } from '../components/Header';
import { PairModal } from '../components/PairModal';
import { initial, listTime, previewLabel } from '../format';
import { useChat } from '../state/ChatContext';
import { colors } from '../theme';

export function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { token, user, logout } = useAuth();
  const { conversation, conversationReady, socket, connected, setConversation } = useChat();
  const [pairOpen, setPairOpen] = useState(false);
  const openChat = useRef(false);

  useEffect(() => {
    if (!socket) return undefined;
    const onPair = () => {
      openChat.current = true;
      setPairOpen(false);
    };
    socket.on('pair:joined', onPair);
    return () => socket.off('pair:joined', onPair);
  }, [socket]);

  useEffect(() => {
    if (openChat.current && conversation) {
      openChat.current = false;
      navigation.navigate('Chat');
    }
  }, [conversation, navigation]);

  function confirmLogout() {
    Alert.alert('Log out', 'You can log back in with the same user ID.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  }

  const preview = conversation?.lastMessage;
  const previewText = preview
    ? `${preview.senderId === user.id ? 'You: ' : ''}${previewLabel(preview)}`
    : 'No messages yet';

  return (
    <View style={styles.screen}>
      <Header
        title="Chats"
        subtitle={connected ? undefined : 'Connecting…'}
        right={
          <Pressable onPress={confirmLogout} hitSlop={10} style={styles.logout}>
            <Ionicons name="log-out-outline" size={24} color={colors.white} />
          </Pressable>
        }
      />
      {!conversationReady ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.teal} />
        </View>
      ) : conversation ? (
        <Pressable style={styles.row} onPress={() => navigation.navigate('Chat')}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial(conversation.partner.displayName)}</Text>
          </View>
          <View style={styles.rowBody}>
            <View style={styles.rowTop}>
              <Text style={styles.name} numberOfLines={1}>
                {conversation.partner.displayName}
              </Text>
              <Text style={styles.time}>{listTime(preview?.createdAt)}</Text>
            </View>
            <Text style={styles.preview} numberOfLines={1}>
              {previewText}
            </Text>
          </View>
        </Pressable>
      ) : (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={64} color={colors.teal} />
          <Text style={styles.emptyTitle}>No chat yet</Text>
          <Text style={styles.emptyBody}>Tap + and share your code with one person.</Text>
        </View>
      )}

      {!conversation && conversationReady ? (
        <Pressable
          style={[styles.fab, { bottom: insets.bottom + 22 }]}
          onPress={() => setPairOpen(true)}
        >
          <Ionicons name="add" size={34} color={colors.white} />
        </Pressable>
      ) : null}

      <PairModal
        visible={pairOpen}
        token={token}
        onClose={() => setPairOpen(false)}
        onConnected={(next) => {
          setConversation(next);
          openChat.current = true;
          setPairOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  logout: {
    padding: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: colors.background,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  emptyBody: {
    marginTop: 8,
    textAlign: 'center',
    color: colors.muted,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.white,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
  },
  rowBody: {
    flex: 1,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  time: {
    color: colors.muted,
    fontSize: 12,
    marginLeft: 8,
  },
  preview: {
    color: colors.muted,
    marginTop: 3,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});
