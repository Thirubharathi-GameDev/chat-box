import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { EMOJIS } from '../emojis';
import { colors } from '../theme';

export function EmojiPanel({ onPick }) {
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

const styles = StyleSheet.create({
  panel: {
    maxHeight: 220,
    backgroundColor: colors.white,
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
