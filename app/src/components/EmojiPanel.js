import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { EMOJIS } from '../emojis';
import { useColors } from '../theme';

export function EmojiPanel({ onPick }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ScrollView style={styles.panel} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {EMOJIS.map((emoji) => (
        <Pressable key={emoji} style={styles.cell} onPress={() => onPick(emoji)}>
          <Text style={styles.emoji}>{emoji}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  panel: {
    maxHeight: 220,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  content: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  cell: {
    width: '12.5%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  emoji: {
    fontSize: 26,
  },
  });
}
