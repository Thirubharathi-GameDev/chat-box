import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const LOVE = ['❤', '♥', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '❣', '💋', '😍', '🥰', '😘', '😻', '💑', '💏', '💌', '🌹', '🫶', '💍', '💐'];
const CHAT = ['😂', '🤣', '😭', '😊', '😀', '😁', '😄', '😆', '😅', '😉', '🙂', '🤗', '🤔', '😎', '😢', '😮', '👍', '👎', '🙏', '🔥', '✨', '🎉', '💯', '👋', '👏', '💪', '🥳', '🤝', '👌', '🙌'];

const seen = new Set();

function graphemes(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)]
        .map((part) => part.segment)
        .filter((part) => part.trim());
    }
  } catch {
    return [];
  }
  return [...trimmed].filter((part) => part.trim());
}

function matches(part, list) {
  return list.some((item) => part.includes(item));
}

export function emojiMoment(text) {
  if (!text || /[A-Za-z0-9]/.test(text)) return null;
  const parts = graphemes(text);
  if (!parts.length || parts.length > 3) return null;
  if (parts.every((part) => matches(part, LOVE))) return { kind: 'love', parts };
  if (parts.every((part) => matches(part, CHAT))) return { kind: 'chat', parts };
  return null;
}

export function EmojiMoment({ moment, messageKey }) {
  const size = moment.parts.length === 1 ? 52 : moment.parts.length === 2 ? 40 : 32;
  const play = !seen.has(messageKey);
  const scales = useRef(moment.parts.map(() => new Animated.Value(play ? 0.2 : 1))).current;
  const bursts = useRef(
    moment.kind === 'love'
      ? Array.from({ length: 7 }, () => ({
          x: new Animated.Value(0),
          y: new Animated.Value(8),
          opacity: new Animated.Value(play ? 0.95 : 0),
          scale: new Animated.Value(0.4),
        }))
      : []
  ).current;

  useEffect(() => {
    if (!play) return undefined;
    seen.add(messageKey);
    const pop = Animated.stagger(
      70,
      scales.map((scale) =>
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 130, useNativeDriver: true })
      )
    );
    if (moment.kind !== 'love') {
      pop.start();
      return undefined;
    }
    const float = Animated.stagger(
      45,
      bursts.map((piece, index) => {
        const angle = -Math.PI / 2 + (index - 3) * 0.42;
        return Animated.parallel([
          Animated.timing(piece.x, {
            toValue: Math.cos(angle) * (36 + index * 4),
            duration: 780,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(piece.y, {
            toValue: Math.sin(angle) * 52 - 10,
            duration: 780,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(piece.opacity, {
            toValue: 0,
            duration: 780,
            delay: 180,
            useNativeDriver: true,
          }),
          Animated.timing(piece.scale, {
            toValue: 1.15,
            duration: 420,
            useNativeDriver: true,
          }),
        ]);
      })
    );
    Animated.parallel([pop, float]).start();
    return undefined;
  }, [bursts, messageKey, moment.kind, play, scales]);

  return (
    <View style={styles.wrap}>
      {moment.kind === 'love'
        ? bursts.map((piece, index) => (
            <Animated.Text
              key={index}
              style={[
                styles.burst,
                {
                  opacity: piece.opacity,
                  transform: [{ translateX: piece.x }, { translateY: piece.y }, { scale: piece.scale }],
                },
              ]}
            >
              {moment.parts[index % moment.parts.length]}
            </Animated.Text>
          ))
        : null}
      <View style={styles.row}>
        {moment.parts.map((part, index) => (
          <Animated.Text key={`${part}-${index}`} style={{ fontSize: size, transform: [{ scale: scales[index] }] }}>
            {part}
          </Animated.Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minWidth: 64,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  burst: {
    position: 'absolute',
    fontSize: 22,
  },
});
