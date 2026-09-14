import { StyleSheet, View } from 'react-native';

import { useColors } from '@/constants/theme';

export function ProgressBar({ progress, color }: { progress: number; color?: string }) {
  const colors = useColors();
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={[styles.track, { backgroundColor: colors.surface2 }]}>
      <View style={[styles.fill, { width: `${clamped * 100}%`, backgroundColor: color ?? colors.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
