import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export function EnrollRow({
  name,
  status,
  meta1,
  meta2,
  note,
}: {
  name: string;
  status: 'active' | 'cancelled';
  meta1: string;
  meta2: string;
  note?: string;
}) {
  const c = useTheme();
  const isActive = status === 'active';
  return (
    <View style={[styles.wrap, { backgroundColor: c.surface, borderColor: c.line }]}>
      <View style={styles.top}>
        <Text style={[styles.name, { color: c.ink }]}>{name}</Text>
        <View
          style={[
            styles.badge,
            { backgroundColor: isActive ? c.success + '29' : c.surfaceSunk },
          ]}
        >
          <Text style={{ fontSize: 9.5, fontWeight: '800', color: isActive ? c.success : c.inkFaint, letterSpacing: 0.4 }}>
            {isActive ? 'ACTIVE' : 'CANCELLED'}
          </Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: c.inkSoft }]}>{meta1}</Text>
        <Text style={[styles.meta, { color: c.inkSoft }]}>{meta2}</Text>
      </View>
      {note ? <Text style={[styles.note, { color: c.goldStrong }]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 12 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 },
  name: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  badge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  meta: { fontSize: 11.5 },
  note: { fontSize: 11.5, fontWeight: '700', marginTop: 7 },
});
