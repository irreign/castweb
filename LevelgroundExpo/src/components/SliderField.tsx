import Slider from '@react-native-community/slider';
import { StyleSheet, Text, View } from 'react-native';

import { Spacing, useColors } from '@/constants/theme';

export function SliderField({
  label,
  value,
  minimumValue,
  maximumValue,
  step,
  formatValue,
  onValueChange,
}: {
  label: string;
  value: number;
  minimumValue: number;
  maximumValue: number;
  step: number;
  formatValue: (value: number) => string;
  onValueChange: (value: number) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.accentStrong }]}>{formatValue(value)}</Text>
      </View>
      <Slider
        value={value}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        minimumTrackTintColor={colors.brass}
        maximumTrackTintColor={colors.surface2}
        thumbTintColor={colors.brass}
        onValueChange={onValueChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: Spacing.xs },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 14, fontWeight: '600' },
  value: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
