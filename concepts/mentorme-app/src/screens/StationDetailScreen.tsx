import React from 'react';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme';
import { twinsGuide } from '../data/mock';
import type { HomeStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'StationDetail'>;

export default function StationDetailScreen({ navigation }: Props) {
  const c = useTheme();
  return (
    <Screen>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={{ color: c.inkSoft, fontSize: 13, marginBottom: 10 }}>← Back</Text>
      </TouchableOpacity>

      <View style={[styles.pill, { backgroundColor: c.plum + '24' }]}>
        <Text style={{ color: c.plum, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 }}>COMMITMENT</Text>
      </View>

      <Text style={[styles.title, { color: c.ink }]}>Caring for Twins</Text>
      <Text style={[styles.body, { color: c.inkSoft }]}>
        The first three months are the hardest — feeds roughly every 2–3 hours, for two. Parents who make it through
        say a staggered schedule and one extra pair of hands a week made the biggest difference.
      </Text>

      {twinsGuide.tips.map((tip, i) => (
        <View key={i} style={[styles.tipRow, { borderBottomColor: c.line, borderBottomWidth: i === twinsGuide.tips.length - 1 ? 0 : 1 }]}>
          <View style={[styles.dot, { backgroundColor: tip.gold ? c.gold : c.teal }]} />
          <Text style={[styles.tipText, { color: c.inkSoft }]}>{tip.text}</Text>
        </View>
      ))}

      <Text style={[styles.footnote, { color: c.inkFaint }]}>
        General guidance from community experience, not medical advice — check with your paediatrician for anything
        health-related.
      </Text>

      <TouchableOpacity style={[styles.outlineBtn, { borderColor: c.line }]} activeOpacity={0.7}>
        <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13.5 }}>Open the full twins guide</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, marginBottom: 10 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  body: { fontSize: 13.5, lineHeight: 20, marginBottom: 14 },
  tipRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  tipText: { fontSize: 12.5, flex: 1, lineHeight: 18 },
  footnote: { fontSize: 11, marginTop: 12, marginBottom: 16, lineHeight: 16 },
  outlineBtn: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
});
