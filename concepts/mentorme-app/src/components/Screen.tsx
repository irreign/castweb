import React from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export function Screen({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 48 },
});
