import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, Image, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { displayUri } from '../cache';
import { durationLabel, timeLabel } from '../format';
import { useSpeaker } from '../speaker';
import { font, useColors } from '../theme';
import { EmojiMoment, emojiMoment } from './EmojiMoment';
import { Waveform } from './Waveform';

function Receipt({ status, pending, failed }) {
  const colors = useColors();
  if (pending || failed) return null;
  if (status === 'read') return <Ionicons name="checkmark-done" size={16} color="#53BDEB" />;
  if (status === 'delivered') return <Ionicons name="checkmark-done" size={16} color={colors.muted} />;
  return <Ionicons name="checkmark" size={16} color={colors.muted} />;
}

function Quote({ reply, mine, partnerName, onPress }) {
  const colors = useColors();
  if (!reply?.messageId) return null;
  const name = reply.senderId && reply.senderName
    ? reply.senderName
    : partnerName;
  const voice = reply.type === 'voice';
  const label = reply.type === 'image' ? 'Photo' : voice ? reply.text || 'Voice message' : reply.text;
  return (
    <Pressable
      onPress={() => onPress?.(reply.messageId)}
      style={{
        backgroundColor: colors.quote,
        borderLeftColor: mine ? colors.header : colors.teal,
        borderLeftWidth: 3,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginBottom: 4,
      }}
    >
      <Text style={{ color: colors.teal, fontFamily: font.bold, fontSize: 13 }} numberOfLines={1}>
        {name || 'Message'}
      </Text>
      {voice ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="mic" size={14} color={colors.muted} />
          <Text style={{ color: colors.muted, fontFamily: font.medium, fontSize: 13 }} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : (
        <Text style={{ color: colors.muted, fontFamily: font.medium, fontSize: 13 }} numberOfLines={2}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function MessageBubble({
  message,
  mine,
  myId,
  partnerName,
  playing,
  progress,
  onToggleVoice,
  onDownloadVoice,
  voiceReady,
  voiceDownloading,
  onToggleSpeaker,
  onOpenImage,
  onRetry,
  onReply,
  onJump,
  onHold,
  highlight,
}) {
  const pending = Boolean(message.pending);
  const failed = Boolean(message.failed);
  const waiting = Boolean(message.waiting);
  const moment = message.type === 'text' ? emojiMoment(message.text) : null;
  const speaker = useSpeaker();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const drag = useRef(new Animated.Value(0)).current;
  const replyRef = useRef(onReply);
  const messageRef = useRef(message);
  const mineRef = useRef(mine);
  replyRef.current = onReply;
  messageRef.current = message;
  mineRef.current = mine;

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        const horizontal = Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4;
        if (!horizontal || messageRef.current?.deleted) return false;
        return mineRef.current ? gesture.dx < -10 : gesture.dx > 10;
      },
      onPanResponderMove: (_, gesture) => {
        drag.setValue(mineRef.current
          ? Math.max(-76, Math.min(0, gesture.dx))
          : Math.max(0, Math.min(gesture.dx, 76)));
      },
      onPanResponderRelease: (_, gesture) => {
        const triggered = mineRef.current ? gesture.dx < -52 : gesture.dx > 52;
        if (triggered && messageRef.current?.id && !messageRef.current.deleted) replyRef.current?.(messageRef.current);
        Animated.spring(drag, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(drag, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
      },
    })
  ).current;

  const replyName = message.replyTo?.senderId === myId ? 'You' : partnerName;
  const iconOpacity = drag.interpolate({
    inputRange: mine ? [-52, -20, 0] : [0, 20, 52],
    outputRange: mine ? [1, 0.35, 0] : [0, 0.35, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.row, mine ? styles.mineRow : styles.theirRow, message.reactions?.length ? styles.reacting : null]}>
      <View>
        <Animated.View style={[styles.swipeIcon, mine ? styles.swipeIconMine : styles.swipeIconTheirs, { opacity: iconOpacity }]}>
          <Ionicons name="arrow-undo" size={16} color={colors.teal} style={mine ? { transform: [{ scaleX: -1 }] } : null} />
        </Animated.View>
        <Animated.View style={{ transform: [{ translateX: drag }] }} {...pan.panHandlers}>
        <Pressable
          onPress={failed ? onRetry : undefined}
          onLongPress={() => onHold?.(message)}
          delayLongPress={280}
          style={[styles.bubble, mine ? styles.mine : styles.theirs, pending && styles.pending, highlight && styles.highlight]}
        >
          {message.deleted ? (
            <View style={styles.deleted}>
              <Ionicons name="ban-outline" size={16} color={colors.muted} />
              <Text style={styles.deletedText}>This message was deleted</Text>
            </View>
          ) : (
            <>
          <Quote
            reply={message.replyTo ? { ...message.replyTo, senderName: replyName } : null}
            mine={mine}
            partnerName={partnerName}
            onPress={onJump}
          />
          {message.type === 'image' && message.mediaUrl ? (
            <Pressable onPress={() => onOpenImage(displayUri(message))} onLongPress={() => onHold?.(message)} delayLongPress={280}>
              <Image source={{ uri: displayUri(message) }} style={styles.image} />
            </Pressable>
          ) : null}
          {message.type === 'voice' ? (
            <View style={styles.voice}>
              {voiceDownloading ? (
                <ActivityIndicator size="small" color={colors.header} style={styles.voiceAction} />
              ) : voiceReady ? (
                <Pressable onPress={() => onToggleVoice(message)} hitSlop={6} style={styles.voiceAction}>
                  <Ionicons name={playing ? 'pause' : 'play'} size={26} color={colors.header} />
                </Pressable>
              ) : (
                <Pressable onPress={() => onDownloadVoice?.(message)} hitSlop={6} style={styles.voiceAction}>
                  <Ionicons name="download-outline" size={24} color={colors.header} />
                </Pressable>
              )}
              <Waveform
                levels={message.waveform}
                progress={voiceReady && playing ? progress : 0}
                color={colors.teal}
                dim={colors.shell}
              />
              <Text style={styles.duration}>{durationLabel(message.durationMs)}</Text>
              {voiceReady ? (
                <Pressable onPress={onToggleSpeaker} hitSlop={8} style={styles.speaker}>
                  <Ionicons name={speaker ? 'volume-high' : 'ear-outline'} size={18} color={colors.header} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {moment ? (
            <EmojiMoment moment={moment} messageKey={message.id || message.clientId} />
          ) : message.type === 'text' ? (
            <Text style={styles.text}>{message.text}</Text>
          ) : null}
            </>
          )}
          <View style={styles.meta}>
            {message.type === 'voice' && pending && !failed && !waiting ? (
              <ActivityIndicator size="small" color={colors.teal} />
            ) : null}
            {failed ? <Text style={styles.failed}>Failed · tap to retry</Text> : null}
            {message.edited && !message.deleted ? <Text style={styles.edited}>Edited</Text> : null}
            <Text style={[styles.time, waiting && { color: colors.teal }]}>
              {waiting ? 'Waiting' : pending && !failed ? 'Sending' : timeLabel(message.createdAt)}
            </Text>
            {!message.deleted && !mine && message.removedForSender ? (
              <Ionicons name="trash-outline" size={13} color={colors.muted} />
            ) : null}
            {!message.deleted && message.starred ? <Ionicons name="star" size={12} color={colors.teal} /> : null}
            {mine && !message.deleted ? <Receipt status={message.status} pending={pending} failed={failed} /> : null}
          </View>
        </Pressable>
        {!message.deleted && Array.isArray(message.reactions) && message.reactions.length ? (
          <View style={[styles.reactions, mine ? styles.reactionsMine : styles.reactionsTheirs]}>
            {groupReactions(message.reactions).map((item) => (
              <Text key={item.emoji} style={styles.reaction}>
                {item.emoji}
                {item.count > 1 ? ` ${item.count}` : ''}
              </Text>
            ))}
          </View>
        ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

function groupReactions(reactions) {
  const counts = new Map();
  reactions.forEach((item) => {
    if (!item?.emoji) return;
    counts.set(item.emoji, (counts.get(item.emoji) || 0) + 1);
  });
  return [...counts.entries()].map(([emoji, count]) => ({ emoji, count }));
}

function makeStyles(colors) {
  return StyleSheet.create({
  row: {
    paddingHorizontal: 10,
    marginVertical: 2,
    flexDirection: 'row',
  },
  mineRow: {
    justifyContent: 'flex-end',
  },
  theirRow: {
    justifyContent: 'flex-start',
  },
  reacting: {
    marginBottom: 12,
  },
  deleted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  edited: {
    color: colors.muted,
    fontFamily: font.medium,
    fontSize: 11,
    marginRight: 4,
  },
  deletedText: {
    color: colors.muted,
    fontFamily: font.medium,
    fontStyle: 'italic',
    fontSize: 14,
  },
  swipeIcon: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  swipeIconTheirs: {
    left: 0,
  },
  swipeIconMine: {
    right: 0,
  },
  highlight: {
    borderWidth: 1,
    borderColor: colors.teal,
  },
  reactions: {
    position: 'absolute',
    bottom: -10,
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  reactionsMine: {
    right: 8,
  },
  reactionsTheirs: {
    left: 8,
  },
  reaction: {
    fontSize: 12,
  },
  bubble: {
    maxWidth: 280,
    borderRadius: 10,
    overflow: 'visible',
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
  },
  mine: {
    backgroundColor: colors.outgoing,
    borderTopRightRadius: 4,
  },
  theirs: {
    backgroundColor: colors.incoming,
    borderTopLeftRadius: 4,
  },
  pending: {
    opacity: 0.72,
  },
  quote: {
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
  quoteName: {
    fontFamily: font.bold,
    fontSize: 13,
  },
  quoteText: {
    fontFamily: font.medium,
    fontSize: 13,
  },
  text: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 2,
    fontFamily: font.medium,
  },
  image: {
    width: 220,
    height: 220,
    borderRadius: 8,
    backgroundColor: '#D8D2C8',
  },
  voice: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 230,
    paddingVertical: 4,
    gap: 6,
  },
  voiceAction: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speaker: {
    padding: 2,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  time: {
    color: colors.muted,
    fontSize: 11,
    fontFamily: font.medium,
  },
  duration: {
    color: colors.muted,
    fontSize: 12,
    minWidth: 32,
    fontFamily: font.medium,
  },
  failed: {
    color: colors.danger,
    fontSize: 11,
    fontFamily: font.bold,
  },
  });
}
