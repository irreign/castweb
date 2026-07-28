import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

/** A simple bar trend for a short history of amounts — no charting library needed for this few points. */
export function TrendBars({ values }: { values: number[] }) {
  const c = useTheme();
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return (
    <View style={styles.row}>
      {values.map((v, i) => {
        const heightPct = 18 + ((v - min) / range) * 82; // keep a visible sliver even at the minimum
        const isLast = i === values.length - 1;
        return (
          <View key={i} style={styles.col}>
            <View
              style={[
                styles.bar,
                { height: `${heightPct}%`, backgroundColor: isLast ? c.gold : c.line },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', height: 46, gap: 5, marginTop: 8, marginBottom: 4 },
  col: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4, minHeight: 4 },
});
