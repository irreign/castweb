import React from 'react';
import { Text, TextInput, View, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export function TextField({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
  placeholder?: string;
}) {
  const c = useTheme();
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={[styles.label, { color: c.inkFaint }]}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.inkFaint}
        keyboardType={keyboardType}
        style={[styles.input, { borderColor: c.line, color: c.ink, backgroundColor: c.surface }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontSize: 14 },
});
