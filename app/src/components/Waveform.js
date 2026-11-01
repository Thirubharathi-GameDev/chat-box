import { useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

export function normalizeMeter(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.08;
  if (value < 0) {
    const db = Math.max(-50, Math.min(0, value));
    return (db + 50) / 50;
  }
  if (value <= 1) return value;
  return Math.max(0, Math.min(1, value / 100));
}

export function downsampleLevels(samples, count = 36) {
  if (!samples.length) return [];
  if (samples.length <= count) return samples.map((level) => Math.max(0.06, Math.min(1, level)));
  const bars = [];
  const size = samples.length / count;
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor(index * size);
    const end = Math.max(start + 1, Math.floor((index + 1) * size));
    let peak = 0;
    for (let cursor = start; cursor < end; cursor += 1) peak = Math.max(peak, samples[cursor] || 0);
    bars.push(Math.max(0.06, Math.min(1, peak)));
  }
  return bars;
}

export function Waveform({ levels, progress = 0, color = '#1F6F62', dim = '#D5D0C8', onSeek }) {
  const bars = levels?.length ? levels : [0.18, 0.28, 0.16, 0.34, 0.2, 0.3, 0.14, 0.26];
  const seekRef = useRef(onSeek);
  const widthRef = useRef(1);
  seekRef.current = onSeek;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => Boolean(seekRef.current),
      onMoveShouldSetPanResponder: () => Boolean(seekRef.current),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const ratio = event.nativeEvent.locationX / widthRef.current;
        seekRef.current?.(Math.max(0, Math.min(1, ratio)));
      },
      onPanResponderMove: (event) => {
        const ratio = event.nativeEvent.locationX / widthRef.current;
        seekRef.current?.(Math.max(0, Math.min(1, ratio)));
      },
    })
  ).current;
  return (
    <View
      style={styles.row}
      onLayout={(event) => {
        widthRef.current = event.nativeEvent.layout.width || 1;
      }}
      {...pan.panHandlers}
    >
      {bars.map((level, index) => {
        const amount = typeof level === 'number' && level > 1 ? level / 100 : level;
        const played = progress > 0 && (index + 0.5) / bars.length <= progress;
        return (
          <View
            key={index}
            style={[styles.bar, { height: 4 + Math.max(0, Math.min(1, amount)) * 18, backgroundColor: played ? color : dim }]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 26,
  },
  bar: {
    flex: 1,
    maxWidth: 4,
    borderRadius: 2,
  },
});
