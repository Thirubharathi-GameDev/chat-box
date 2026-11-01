import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { durationLabel, timeLabel } from '../format';
import { colors } from '../theme';

export function MessageBubble({ message, mine, playing, onToggleVoice, onOpenImage, onRetry }) {
  const pending = Boolean(message.pending);
  const failed = Boolean(message.failed);

  return (
    <View style={[styles.row, mine ? styles.mineRow : styles.theirRow]}>
      <Pressable
        onPress={failed ? onRetry : undefined}
        style={[styles.bubble, mine ? styles.mine : styles.theirs, pending && styles.pending]}
      >
        {message.type === 'image' && message.mediaUrl ? (
          <Pressable onPress={() => onOpenImage(message.mediaUrl)}>
            <Image source={{ uri: message.mediaUrl }} style={styles.image} />
          </Pressable>
        ) : null}
        {message.type === 'voice' ? (
          <Pressable style={styles.voice} onPress={() => onToggleVoice(message)}>
            <Ionicons name={playing ? 'pause' : 'play'} size={22} color={colors.header} />
            <View style={styles.wave}>
              {Array.from({ length: 14 }, (_, index) => (
                <View
                  key={index}
                  style={[styles.bar, { height: 6 + ((index * 7) % 14) }]}
                />
              ))}
            </View>
            <Text style={styles.duration}>{durationLabel(message.durationMs)}</Text>
          </Pressable>
        ) : null}
        {message.type === 'text' ? <Text style={styles.text}>{message.text}</Text> : null}
        <View style={styles.meta}>
          {failed ? <Text style={styles.failed}>Failed · tap to retry</Text> : null}
          <Text style={styles.time}>{pending && !failed ? 'Sending' : timeLabel(message.createdAt)}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
  bubble: {
    maxWidth: '80%',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
  },
  mine: {
    backgroundColor: colors.outgoing,
    borderTopRightRadius: 2,
  },
  theirs: {
    backgroundColor: colors.incoming,
    borderTopLeftRadius: 2,
  },
  pending: {
    opacity: 0.72,
  },
  text: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 21,
    paddingHorizontal: 2,
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
    minWidth: 180,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  wave: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginHorizontal: 8,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.teal,
  },
  duration: {
    color: colors.muted,
    fontSize: 12,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  time: {
    color: colors.muted,
    fontSize: 11,
  },
  failed: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '700',
  },
});
