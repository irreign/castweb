import React, { useState } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { useTheme } from '../theme';
import { profile } from '../data/mock';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

export default function OnboardingScreen({ navigation }: Props) {
  const c = useTheme();
  const [name, setName] = useState(profile.name);
  const [mobile, setMobile] = useState(profile.mobile);
  const [email, setEmail] = useState(profile.email);

  return (
    <Screen>
      <Text style={[styles.title, { color: c.ink }]}>Create your account</Text>
      <Text style={[styles.sub, { color: c.inkSoft }]}>
        That's it for now — we'll only ask about your situation when it's actually relevant, one screen at a time.
      </Text>

      <TextField label="Name" value={name} onChangeText={setName} placeholder="Your name" />
      <TextField label="Mobile number" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" placeholder="+65 9xxx xxxx" />
      <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@email.com" />

      <TouchableOpacity
        style={[styles.button, { backgroundColor: c.gold }]}
        onPress={() => navigation.replace('Main')}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>Continue →</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  sub: { fontSize: 13, marginBottom: 8, lineHeight: 18 },
  button: { paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 24 },
  buttonText: { color: '#201404', fontWeight: '800', fontSize: 15 },
});
