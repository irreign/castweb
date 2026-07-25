import React from 'react';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Screen } from '../components/Screen';
import { CompareTable } from '../components/CompareTable';
import { useTheme } from '../theme';
import { growInputs, growComparison } from '../data/mock';

export default function GrowScreen() {
  const c = useTheme();
  return (
    <Screen>
      <Text style={[styles.title, { color: c.ink }]}>Grow your money</Text>
      <Text style={[styles.sub, { color: c.inkSoft }]}>Same $20,000, three ways — for comparison only.</Text>

      <Text style={[styles.label, { color: c.inkFaint }]}>YOUR INPUTS</Text>
      <CompareTable
        rows={[
          ['Cash balance', growInputs.cashBalance],
          ['Current FD rate', growInputs.fdRate],
        ]}
      />

      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: c.inkFaint, marginTop: 0 }]}>IF IT SAT IN…</Text>
        <Text style={{ fontSize: 10.5, color: c.inkFaint }}>Rates checked 12d ago</Text>
      </View>
      <CompareTable
        headers={['Where', 'Rate', 'Per month']}
        rows={growComparison.map((g) => [g.where, g.rate, g.perMonth])}
      />
      <Text style={[styles.footnote, { color: c.inkFaint }]}>
        *5-year historical average, not a promise. FD is a contract; ES3 and the portfolio can lose value — past
        performance isn't a projection of future returns.
      </Text>

      <TouchableOpacity style={[styles.outlineBtn, { borderColor: c.line }]} activeOpacity={0.7}>
        <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13.5 }}>See the full comparison</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  sub: { fontSize: 12.5, marginBottom: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, marginTop: 14, marginBottom: 4 },
  footnote: { fontSize: 11, lineHeight: 15, marginTop: 4 },
  outlineBtn: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
});
