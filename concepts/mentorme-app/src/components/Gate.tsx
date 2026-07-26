import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Screen } from './Screen';
import { ChipRow } from './Chip';
import { useTheme } from '../theme';

export function Gate({
  title,
  sub,
  fields,
  cta,
  onContinue,
}: {
  title: string;
  sub: string;
  fields: { label: string; options: string[]; active: string }[];
  cta: string;
  onContinue: () => void;
}) {
  const c = useTheme();
  return (
    <Screen>
      <Text style={[styles.title, { color: c.ink }]}>{title}</Text>
      <Text style={[styles.sub, { color: c.inkSoft }]}>{sub}</Text>

      {fields.map((f) => (
        <ChipRow key={f.label} label={f.label} options={f.options} active={f.active} />
      ))}

      <TouchableOpacity style={[styles.button, { backgroundColor: c.gold }]} onPress={onContinue} activeOpacity={0.85}>
        <Text style={styles.buttonText}>{cta} →</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  sub: { fontSize: 13, marginBottom: 8 },
  button: { paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 24 },
  buttonText: { color: '#201404', fontWeight: '800', fontSize: 15 },
});
