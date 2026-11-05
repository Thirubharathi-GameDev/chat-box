import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_REACTIONS, loadRecentReactions, rememberReaction } from '../recentReactions';
import { font, useColors } from '../theme';
import { EmojiPanel } from './EmojiPanel';

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export function MessageActions({ message, myId, onClose, onReact, onCopy, onStar, onEdit, onResend, onDelete }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [recent, setRecent] = useState(DEFAULT_REACTIONS);
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    setPicker(false);
    loadRecentReactions().then(setRecent);
  }, [message?.id]);

  async function choose(emoji) {
    const next = await rememberReaction(emoji);
    setRecent(next);
    setPicker(false);
    onReact(emoji);
  }

  if (!message) return null;
  const canCopy = message.type === 'text' && Boolean(message.text) && !message.deleted;
  const canResend = !message.deleted && (message.type === 'text' ? Boolean(message.text) : Boolean(message.mediaUrl || message.localPath || message.local?.uri));
  const saved = Boolean(message.id) && !message.deleted;
  const canEdit = saved
    && message.senderId === myId
    && message.type === 'text'
    && Date.now() - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { marginBottom: Math.max(insets.bottom, 16) }]} onPress={() => {}}>
          {saved && picker ? <EmojiPanel onPick={choose} /> : null}
          {saved ? (
            <View style={styles.reactions}>
              {recent.map((emoji) => {
                const mine = (message.reactions || []).some((item) => item.userId === myId && item.emoji === emoji);
                return (
                  <Pressable key={emoji} style={[styles.reaction, mine && styles.reactionOn]} onPress={() => choose(emoji)}>
                    <Text style={styles.emoji}>{emoji}</Text>
                  </Pressable>
                );
              })}
              <Pressable style={styles.reaction} onPress={() => setPicker((open) => !open)}>
                <Ionicons name={picker ? 'close' : 'add'} size={22} color={colors.muted} />
              </Pressable>
            </View>
          ) : null}
          {canEdit ? (
            <Pressable style={styles.row} onPress={onEdit}>
              <Ionicons name="pencil-outline" size={20} color={colors.text} />
              <Text style={styles.label}>Edit</Text>
            </Pressable>
          ) : null}
          {canCopy ? (
            <Pressable style={styles.row} onPress={onCopy}>
              <Ionicons name="copy-outline" size={20} color={colors.text} />
              <Text style={styles.label}>Copy</Text>
            </Pressable>
          ) : null}
          {saved ? (
            <Pressable style={styles.row} onPress={onStar}>
              <Ionicons name={message.starred ? 'star' : 'star-outline'} size={20} color={colors.text} />
              <Text style={styles.label}>{message.starred ? 'Unstar' : 'Star'}</Text>
            </Pressable>
          ) : null}
          {canResend ? (
            <Pressable style={styles.row} onPress={onResend}>
              <Ionicons name="arrow-redo-outline" size={20} color={colors.text} />
              <Text style={styles.label}>Resend</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.row} onPress={onDelete}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={[styles.label, styles.danger]}>Delete for me</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
      paddingHorizontal: 16,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderRadius: 22,
      padding: 12,
    },
    reactions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: colors.background,
      borderRadius: 18,
      paddingHorizontal: 8,
      paddingVertical: 8,
      marginBottom: 8,
    },
    reaction: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reactionOn: {
      backgroundColor: colors.shell,
    },
    emoji: {
      fontSize: 24,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 10,
      paddingVertical: 14,
    },
    label: {
      color: colors.text,
      fontFamily: font.semibold,
      fontSize: 16,
    },
    danger: {
      color: colors.danger,
    },
  });
}
