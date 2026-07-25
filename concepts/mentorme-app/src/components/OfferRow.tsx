import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export function OfferRow({ name, ends, gift, meta }: { name: string; ends: string; gift: string; meta: string }) {
  const c = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: c.surface, borderColor: c.line, borderLeftColor: c.gold }]}>
      <View style={styles.top}>
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: c.ink, flexShrink: 1 }}>{name}</Text>
        <Text style={{ fontSize: 11, color: c.inkFaint, fontWeight: '600' }}>{ends}</Text>
      </View>
      <Text style={[styles.gift, { color: c.goldStrong }]}>{gift}</Text>
      <Text style={{ fontSize: 10.5, color: c.inkFaint }}>{meta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderLeftWidth: 3, borderRadius: 10, padding: 12, marginTop: 10 },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 5 },
  gift: { fontSize: 12, fontWeight: '700', lineHeight: 16.5, marginBottom: 4 },
});
