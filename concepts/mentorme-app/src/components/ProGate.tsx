import React from 'react';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { useAppState } from '../state/AppState';

/** Wraps a computed figure that's part of the paid tier. Shows a blurred-style teaser and an unlock action until isPro is set. */
export function ProGate({ title, teaser, children }: { title: string; teaser: string; children: React.ReactNode }) {
  const c = useTheme();
  const { isPro, setIsPro } = useAppState();

  return (
    <View style={[styles.wrap, { borderColor: c.gold, backgroundColor: color(c.gold) }]}>
      <View style={styles.topRow}>
        <Text style={[styles.lock, { color: c.goldStrong }]}>🔒 PRO</Text>
        <Text style={[styles.title, { color: c.ink }]}>{title}</Text>
      </View>

      {isPro ? (
        children
      ) : (
        <>
          <Text style={[styles.teaser, { color: c.inkSoft }]}>{teaser}</Text>
          <TouchableOpacity
            style={[styles.unlockBtn, { backgroundColor: c.gold }]}
            onPress={() => setIsPro(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.unlockText}>Unlock Pro (demo) →</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function color(hex: string) {
  return hex + '14';
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1.5, borderRadius: 14, padding: 14, marginTop: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lock: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 },
  title: { fontSize: 13.5, fontWeight: '800', flexShrink: 1 },
  teaser: { fontSize: 12.5, lineHeight: 18, marginBottom: 10 },
  unlockBtn: { paddingVertical: 11, borderRadius: 12, alignItems: 'center' },
  unlockText: { color: '#201404', fontWeight: '800', fontSize: 13 },
});
