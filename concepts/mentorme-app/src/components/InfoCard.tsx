import React from 'react';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

type Variant = 'default' | 'commitment' | 'alert';

export function InfoCard({
  kicker,
  body,
  cta,
  variant = 'default',
  onPress,
}: {
  kicker: string;
  body: string;
  cta: string;
  variant?: Variant;
  onPress?: () => void;
}) {
  const c = useTheme();
  const kickerColor = variant === 'alert' ? c.critical : variant === 'commitment' ? c.plum : c.goldStrong;
  const ctaColor = variant === 'alert' ? c.critical : c.teal;

  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}
    >
      <Text style={[styles.kicker, { color: kickerColor }]}>{kicker.toUpperCase()}</Text>
      <Text style={[styles.body, { color: c.inkSoft }]}>{body}</Text>
      <Text style={[styles.cta, { color: ctaColor }]}>{cta} →</Text>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 12 },
  kicker: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6 },
  body: { fontSize: 13, lineHeight: 18.5, marginBottom: 10 },
  cta: { fontSize: 12.5, fontWeight: '800' },
});
