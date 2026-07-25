import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { stations } from '../data/mock';

function nodeColor(category: string, c: ReturnType<typeof useTheme>) {
  if (category === 'income') return c.teal;
  if (category === 'commitment') return c.plum;
  if (category === 'reward') return c.gold;
  return c.gold; // interchange
}

export function LineMap() {
  const c = useTheme();
  return (
    <View style={{ marginTop: 6 }}>
      <View style={[styles.rail, { backgroundColor: c.line }]} />
      {stations.map((s) => {
        const isCurrent = 'current' in s && s.current;
        const isInterchange = s.category === 'interchange';
        return (
          <View key={s.key} style={styles.row}>
            <View
              style={[
                styles.node,
                {
                  borderColor: isCurrent ? c.gold : nodeColor(s.category, c),
                  backgroundColor: isCurrent ? c.gold : isInterchange ? c.gold + '33' : c.surface,
                },
              ]}
            />
            <View>
              {isCurrent ? <Text style={[styles.here, { color: c.goldStrong }]}>YOU ARE HERE</Text> : null}
              <Text style={[styles.name, { color: isCurrent ? c.ink : c.inkSoft, fontWeight: isCurrent ? '800' : '600' }]}>
                {s.name}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { position: 'absolute', left: 15, top: 8, bottom: 8, width: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 10 },
  node: { width: 30, height: 30, borderRadius: 15, borderWidth: 2.5 },
  here: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6, marginBottom: 1 },
  name: { fontSize: 13.5 },
});
