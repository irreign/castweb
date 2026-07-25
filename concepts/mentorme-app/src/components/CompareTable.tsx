import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export function CompareTable({ headers, rows }: { headers?: string[]; rows: string[][] }) {
  const c = useTheme();
  return (
    <View style={[styles.table, { borderColor: c.line }]}>
      {headers ? (
        <View style={[styles.row, { borderBottomColor: c.line }]}>
          {headers.map((h, i) => (
            <Text key={i} style={[styles.headCell, { color: c.inkFaint, flex: i === 0 ? 1.3 : 1 }]}>
              {h.toUpperCase()}
            </Text>
          ))}
        </View>
      ) : null}
      {rows.map((r, ri) => (
        <View key={ri} style={[styles.row, { borderBottomColor: c.line, borderBottomWidth: ri === rows.length - 1 ? 0 : 1 }]}>
          {r.map((cell, ci) => (
            <Text key={ci} style={[styles.cell, { color: c.ink, flex: ci === 0 ? 1.3 : 1 }]}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { borderRadius: 10, marginTop: 8, marginBottom: 6, overflow: 'hidden' },
  row: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1 },
  headCell: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  cell: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
