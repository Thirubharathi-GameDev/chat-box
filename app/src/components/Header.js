import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, useColors } from '../theme';

export function Header({ title, subtitle, subtitleStyle, onBack, onTitlePress, leading, right }) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} style={({ pressed }) => [styles.back, { opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons name="arrow-back" size={22} color={colors.onHeader} />
          </Pressable>
        ) : null}
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <Pressable style={styles.titles} onPress={onTitlePress} disabled={!onTitlePress}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, subtitleStyle]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </Pressable>
        {right}
      </View>
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    bar: {
      backgroundColor: colors.header,
      paddingHorizontal: 14,
      paddingBottom: 14,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 42,
    },
    back: {
      marginRight: 6,
      padding: 4,
    },
    leading: {
      marginRight: 10,
    },
    titles: {
      flex: 1,
    },
    title: {
      color: colors.onHeader,
      fontSize: 20,
      fontFamily: font.bold,
    },
    subtitle: {
      color: 'rgba(247,244,238,0.78)',
      fontSize: 13,
      marginTop: 2,
      fontFamily: font.medium,
    },
  });
}
