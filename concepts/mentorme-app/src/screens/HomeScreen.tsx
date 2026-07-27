import React, { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Gate } from '../components/Gate';
import { LineMap } from '../components/LineMap';
import { InfoCard } from '../components/InfoCard';
import { useTheme } from '../theme';
import { useAppState } from '../state/AppState';
import { activeCards, lineFields } from '../data/mock';
import type { HomeStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const c = useTheme();
  const { profile } = useAppState();
  const firstName = profile.name.split(' ')[0] || 'there';
  const [setUp, setSetUp] = useState(false);

  if (!setUp) {
    return (
      <Gate
        title="Let's map your stage"
        sub="Six quick questions, just for the line below — nothing else needed yet."
        fields={lineFields}
        cta="Show my line"
        onContinue={() => setSetUp(true)}
      />
    );
  }

  return (
    <Screen>
      <Text style={[styles.greet, { color: c.inkSoft }]}>
        Hi, <Text style={{ color: c.ink, fontWeight: '700' }}>{firstName}</Text> — updated today
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
