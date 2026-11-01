import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { EMOJIS } from '../emojis';
import { useColors } from '../theme';

const COLUMNS = 8;

export function EmojiPanel({ onPick }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [width, setWidth] = useState(0);
  const cellWidth = width ? Math.floor(width / COLUMNS) : 0;

  return (
    <FlatList
      style={styles.panel}
      data={EMOJIS}
      keyExtractor={(emoji) => emoji}
      numColumns={COLUMNS}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={40}
      windowSize={7}
      onLayout={(event) => {
        const next = Math.floor(event.nativeEvent.layout.width);
        if (next !== width) setWidth(next);
      }}
      renderItem={({ item }) => (
        <Pressable
          style={[styles.cell, cellWidth ? { width: cellWidth } : null]}
          onPress={() => onPick(item)}
        >
          <Text style={styles.emoji}>{item}</Text>
        </Pressable>
      )}
    />
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    panel: {
      height: 280,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    cell: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
    },
    emoji: {
      fontSize: 26,
    },
  });
}
