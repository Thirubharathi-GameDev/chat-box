import { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { initial } from '../format';
import { font, useColors } from '../theme';

export function Avatar({ name, photoUrl, size = 48, online = false }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const radius = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <View style={{ backgroundColor: colors.shell, padding: 3, borderRadius: radius, width: size, height: size }}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={{ width: size - 6, height: size - 6, borderRadius: radius }}
          />
        ) : (
          <View style={[styles.fallback, { width: size - 6, height: size - 6, borderRadius: radius }]}>
            <Text style={[styles.letter, { fontSize: size * 0.36 }]}>{initial(name)}</Text>
          </View>
        )}
      </View>
      {online ? <View style={styles.dot} /> : null}
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    fallback: {
      backgroundColor: colors.teal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    letter: {
      color: colors.onHeader,
      fontFamily: font.bold,
    },
    dot: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.green,
      borderWidth: 2,
      borderColor: colors.surface,
    },
  });
}
