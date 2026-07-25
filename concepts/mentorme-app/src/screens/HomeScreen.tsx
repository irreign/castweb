import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { LineMap } from '../components/LineMap';
import { InfoCard } from '../components/InfoCard';
import { useTheme } from '../theme';
import { activeCards } from '../data/mock';
import type { HomeStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const c = useTheme();
  return (
    <Screen>
      <Text style={[styles.greet, { color: c.inkSoft }]}>
        Hi, <Text style={{ color: c.ink, fontWeight: '700' }}>Mei</Text> — updated today
      </Text>

      <Text style={[styles.label, { color: c.inkFaint }]}>YOUR LINE</Text>
      <LineMap />

      <View style={styles.activeRow}>
        <Text style={[styles.label, { color: c.inkFaint, marginTop: 0 }]}>ACTIVE FOR YOU NOW (3)</Text>
      </View>

      {activeCards.map((card, i) => (
        <InfoCard
          key={i}
          kicker={card.kicker}
          body={card.body}
          cta={card.cta}
          variant={card.variant}
          onPress={card.goesTo ? () => navigation.navigate('StationDetail') : undefined}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  greet: { fontSize: 14, marginBottom: 4 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, marginTop: 18, marginBottom: 4 },
  activeRow: { marginTop: 4 },
});
