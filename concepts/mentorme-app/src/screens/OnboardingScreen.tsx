import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { ChipRow } from '../components/Chip';
import { useTheme } from '../theme';
import { onboardingFields } from '../data/mock';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

export default function OnboardingScreen({ navigation }: Props) {
  const c = useTheme();
  return (
    <Screen>
      <Text style={[styles.title, { color: c.ink }]}>Let's map your stage</Text>
      <Text style={[styles.sub, { color: c.inkSoft }]}>Six quick questions. Nothing is saved until you say so.</Text>

      {onboardingFields.map((f) => (
        <ChipRow key={f.label} label={f.label} options={f.options} active={f.active} />
      ))}

      <TouchableOpacity
        style={[styles.button, { backgroundColor: c.gold }]}
        onPress={() => navigation.replace('Main')}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>Show my line →</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  sub: { fontSize: 13, marginBottom: 8 },
  button: { paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 24 },
  buttonText: { color: '#201404', fontWeight: '800', fontSize: 15 },
});
