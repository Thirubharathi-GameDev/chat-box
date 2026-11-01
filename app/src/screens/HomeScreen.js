import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { PrimaryButton } from '../components/Field';
import { Header } from '../components/Header';
import { PairModal } from '../components/PairModal';
import { listTime, partnerTitle, presenceLabel, previewLabel } from '../format';
import { useChat } from '../state/ChatContext';
import { font, useColors } from '../theme';

export function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => makeHomeStyles(colors), [colors]);
  const { token, user, logout } = useAuth();
  const { conversation, conversationReady, socket, connected, setConversation, draft, partnerActivity, refreshConversation } = useChat();
  const [pairOpen, setPairOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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

  useFocusEffect(
    useCallback(() => {
      refreshConversation();
    }, [refreshConversation])
  );

  function confirmLogout() {
    Alert.alert('Log out', 'You can log back in with the same user ID.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  }

  const title = partnerTitle(conversation?.partner);
  const preview = conversation?.lastMessage;
  const stats = conversation?.stats || { total: 0, sent: 0, received: 0, unread: 0 };
  const draftLine = draft.text.trim().replace(/\s+/g, ' ');
  const mine = preview?.senderId === user.id;
  const status = conversation
    ? presenceLabel({
        online: conversation.partner.online,
        activity: partnerActivity,
        lastSeenAt: conversation.partner.lastSeenAt,
      })
    : '';
  const live = Boolean(conversation?.partner.online || partnerActivity);
  const lastText = !preview ? 'No messages yet' : preview.deleted ? 'This message was deleted' : previewLabel(preview);
  const unreadText = conversation?.unreadMessage ? previewLabel(conversation.unreadMessage) : '';
  const hasUnread = stats.unread > 0 && Boolean(unreadText);
  const activity = partnerActivity === 'recording' ? 'recording audio…' : partnerActivity === 'typing' ? 'typing…' : '';
  const shownText = activity || (hasUnread ? unreadText : lastText);
  const shownTime = hasUnread ? listTime(conversation.unreadMessage.createdAt) : listTime(preview?.createdAt);
  const shownLabel = hasUnread
    ? `${stats.unread} unread`
    : preview
      ? mine
        ? 'You sent'
        : `${title} sent`
      : 'Last message';

  return (
    <View style={styles.screen}>
      <Header
        title="Chats"
        subtitle={connected ? undefined : 'Connecting…'}
        leading={
          <Pressable onPress={() => navigation.navigate('Profile')} hitSlop={6}>
            <Avatar name={user.displayName || user.userId} photoUrl={user.photoUrl} size={36} />
          </Pressable>
        }
        right={
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={8} style={styles.menuButton}>
            <Ionicons name="ellipsis-vertical" size={22} color={colors.onHeader} />
          </Pressable>
        }
      />
      {!conversationReady ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.teal} />
        </View>
      ) : conversation ? (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}>
          <View style={styles.card}>
            <View style={styles.band} />
            <Pressable style={styles.avatarWrap} onPress={() => navigation.navigate('Partner')}>
              <Avatar name={title} photoUrl={conversation.partner.photoUrl} size={96} online={Boolean(conversation.partner.online)} />
            </Pressable>
            <Text style={styles.name}>{title}</Text>
            <Text style={[styles.status, live && styles.statusLive]}>{status || 'Last seen unavailable'}</Text>

            <View style={styles.stats}>
              <Stat label="Total" value={stats.total} colors={colors} />
              <Stat label="Sent" value={stats.sent} colors={colors} />
              <Stat label="Received" value={stats.received} colors={colors} />
            </View>

            <View style={styles.block}>
              <View style={styles.blockTop}>
                <Text style={[styles.blockLabel, hasUnread && styles.blockLabelUnread]}>{shownLabel}</Text>
                <Text style={styles.time}>{shownTime}</Text>
              </View>
              <View style={styles.messageRow}>
                {!activity && !hasUnread && preview?.deleted ? (
                  <Ionicons name="ban-outline" size={16} color={colors.muted} />
                ) : null}
                <Text style={[styles.message, !activity && !hasUnread && preview?.deleted && styles.deletedMessage]} numberOfLines={3}>
                  {shownText}
                </Text>
              </View>
            </View>

            {draftLine ? (
              <Text style={styles.draft} numberOfLines={2}>
                Draft: {draftLine}
              </Text>
            ) : (
              <View style={styles.buttonGap} />
            )}

            <PrimaryButton label="Open chat" onPress={() => navigation.navigate('Chat')} />
          </View>
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={64} color={colors.teal} />
          <Text style={styles.emptyTitle}>No chat yet</Text>
          <Text style={styles.emptyBody}>Tap + and share your code with one person.</Text>
        </View>
      )}

      {!conversation && conversationReady ? (
        <Pressable style={[styles.fab, { bottom: insets.bottom + 22 }]} onPress={() => setPairOpen(true)}>
          <Ionicons name="add" size={34} color={colors.onAccent} />
        </Pressable>
      ) : null}

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={[styles.menu, { top: insets.top + 56 }]} onPress={() => {}}>
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setMenuOpen(false);
                navigation.navigate('Starred');
              }}
            >
              <Ionicons name="star-outline" size={20} color={colors.text} />
              <Text style={styles.menuLabel}>Starred messages</Text>
            </Pressable>
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                setMenuOpen(false);
                confirmLogout();
              }}
            >
              <Ionicons name="log-out-outline" size={20} color={colors.danger} />
              <Text style={[styles.menuLabel, styles.menuDanger]}>Log out</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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

function Stat({ label, value, colors }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
      <Text style={{ color: colors.text, fontFamily: font.bold, fontSize: 22 }}>{value}</Text>
      <Text style={{ color: colors.muted, fontFamily: font.semibold, fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function makeHomeStyles(colors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      padding: 16,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 28,
      paddingHorizontal: 18,
      paddingBottom: 18,
      overflow: 'hidden',
    },
    band: {
      height: 92,
      marginHorizontal: -18,
      backgroundColor: colors.header,
    },
    avatarWrap: {
      alignSelf: 'center',
      marginTop: -48,
    },
    name: {
      marginTop: 12,
      textAlign: 'center',
      color: colors.text,
      fontFamily: font.bold,
      fontSize: 26,
    },
    status: {
      marginTop: 4,
      textAlign: 'center',
      color: colors.muted,
      fontFamily: font.medium,
      fontSize: 14,
    },
    statusLive: {
      color: colors.green,
    },
    stats: {
      flexDirection: 'row',
      marginTop: 18,
      backgroundColor: colors.background,
      borderRadius: 18,
    },
    block: {
      marginTop: 14,
      padding: 14,
      borderRadius: 18,
      backgroundColor: colors.background,
    },
    blockTop: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    blockLabel: {
      flex: 1,
      color: colors.teal,
      fontFamily: font.bold,
      fontSize: 13,
    },
    blockLabelUnread: {
      color: colors.green,
    },
    time: {
      color: colors.muted,
      fontFamily: font.medium,
      fontSize: 12,
    },
    messageRow: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
    },
    message: {
      flex: 1,
      color: colors.text,
      fontFamily: font.medium,
      fontSize: 16,
      lineHeight: 22,
    },
    deletedMessage: {
      color: colors.muted,
      fontStyle: 'italic',
    },
    buttonGap: {
      height: 16,
    },
    draft: {
      marginTop: 12,
      marginBottom: 12,
      color: colors.green,
      fontFamily: font.semibold,
      fontSize: 14,
    },
    menuButton: {
      padding: 4,
    },
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
    },
    menu: {
      position: 'absolute',
      right: 14,
      minWidth: 220,
      backgroundColor: colors.surface,
      borderRadius: 18,
      paddingVertical: 6,
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    menuLabel: {
      color: colors.text,
      fontFamily: font.semibold,
      fontSize: 16,
    },
    menuDanger: {
      color: colors.danger,
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
      fontFamily: font.bold,
      color: colors.text,
    },
    emptyBody: {
      marginTop: 8,
      textAlign: 'center',
      color: colors.muted,
      lineHeight: 20,
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
}
