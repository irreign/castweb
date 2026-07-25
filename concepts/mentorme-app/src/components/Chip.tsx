import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export function ChipRow({ label, options, active }: { label: string; options: string[]; active: string }) {
  const c = useTheme();
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={[styles.fieldLabel, { color: c.inkFaint }]}>{label.toUpperCase()}</Text>
      <View style={styles.row}>
        {options.map((opt) => {
          const isActive = opt === active;
          return (
            <View
              key={opt}
              style={[
                styles.chip,
                { borderColor: isActive ? c.gold : c.line, backgroundColor: isActive ? c.gold + '22' : c.surface },
              ]}
            >
              <Text style={{ fontSize: 12.5, fontWeight: isActive ? '700' : '400', color: isActive ? c.goldStrong : c.inkSoft }}>
                {opt}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1.5 },
});
