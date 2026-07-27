import React, { useState } from 'react';
import { Text, View, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme';
import { useAppState } from '../state/AppState';

export default function ProfileScreen() {
  const c = useTheme();
  const [notify, setNotify] = useState(true);
  const { profile } = useAppState();

  return (
    <Screen>
      <Text style={[styles.title, { color: c.ink }]}>Your profile</Text>
      <Text style={[styles.sub, { color: c.inkSoft }]}>This is the only screen that stores contact details.</Text>

      <Row label="Name" value={profile.name || '—'} />
      <Row label="Mobile number" value={profile.mobile || '—'} />
      <Row label="Email" value={profile.email || '—'} />

      <View style={[styles.toggleRow, { borderBottomColor: c.line }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ color: c.ink, fontWeight: '700', fontSize: 14 }}>Notify me about new milestones</Text>
          <Text style={{ color: c.inkSoft, fontSize: 12, marginTop: 3 }}>Only sent when your stage changes. Off anytime.</Text>
        </View>
        <Switch
          value={notify}
          onValueChange={setNotify}
          trackColor={{ true: c.gold, false: c.surfaceSunk }}
          thumbColor="#fff"
        />
      </View>

      <TouchableOpacity style={styles.link}>
        <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13 }}>Download my data</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.link}>
        <Text style={{ color: c.critical, fontWeight: '700', fontSize: 13 }}>Delete my account</Text>
      </TouchableOpacity>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const c = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: c.line }]}>
      <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: c.inkFaint, marginBottom: 3 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: c.ink }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  sub: { fontSize: 12.5, marginBottom: 6 },
  row: { paddingVertical: 13, borderBottomWidth: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  link: { paddingVertical: 12 },
});
