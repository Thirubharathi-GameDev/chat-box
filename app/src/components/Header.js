import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

export function Header({ title, subtitle, onBack, right }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 10 }]}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </Pressable>
        ) : null}
        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.header,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  back: {
    marginRight: 8,
    padding: 4,
  },
  titles: {
    flex: 1,
  },
  title: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginTop: 2,
  },
});
