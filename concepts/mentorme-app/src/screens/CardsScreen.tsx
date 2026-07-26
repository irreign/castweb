import React, { useState } from 'react';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Screen } from '../components/Screen';
import { Gate } from '../components/Gate';
import { EnrollRow } from '../components/EnrollRow';
import { OfferRow } from '../components/OfferRow';
import { CompareTable } from '../components/CompareTable';
import { useTheme } from '../theme';
import { enrollments, cardOffers, milesVsCashback, cardFields } from '../data/mock';

export default function CardsScreen() {
  const c = useTheme();
  const [setUp, setSetUp] = useState(false);

  if (!setUp) {
    return (
      <Gate
        title="Quick one about your cards"
        sub="Two questions, asked here because they only matter for this screen."
        fields={cardFields}
        cta="Show my cards"
        onContinue={() => setSetUp(true)}
      />
    );
  }

  return (
    <Screen>
      <Text style={[styles.title, { color: c.ink }]}>Your cards</Text>
      <Text style={[styles.sub, { color: c.inkSoft }]}>Every card you've signed up for, and when you can again.</Text>

      {enrollments.map((e, i) => (
        <EnrollRow
          key={i}
          name={e.name}
          status={e.status}
          meta1={e.status === 'active' ? `Signed up ${e.signedUp}` : `Cancelled ${e.cancelled}`}
          meta2={`Gift: ${e.gift}`}
          note={e.reactivateFrom ? `Eligible again from ${e.reactivateFrom}` : undefined}
        />
      ))}

      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: c.inkFaint }]}>OFFERS WORTH SIGNING UP FOR</Text>
        <Text style={{ fontSize: 10.5, color: c.inkFaint }}>Updated 3d ago</Text>
      </View>
      {cardOffers.map((o, i) => (
        <OfferRow key={i} name={o.name} ends={o.ends} gift={o.gift} meta={o.meta} />
      ))}
      <Text style={[styles.footnote, { color: c.inkFaint }]}>
        Sourced from public bank, MoneySmart & SingSaver promotions as of Jul 2026 — "Ongoing" means no published end
        date, not that it won't change. Confirm current terms before applying.
      </Text>

      <Text style={[styles.label, { color: c.inkFaint, marginTop: 18 }]}>MILES VS CASHBACK, THIS MONTH</Text>
      <CompareTable
        headers={['Card', 'On $2,000 spend', 'Value']}
        rows={milesVsCashback.map((m) => [m.card, m.basis, m.value])}
      />
      <Text style={[styles.footnote, { color: c.inkFaint }]}>
        Miles valued at ≈2¢ each for a Krisflyer transfer — actual redemption value depends on the flight.
      </Text>

      <TouchableOpacity style={[styles.outlineBtn, { borderColor: c.line }]} activeOpacity={0.7}>
        <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13.5 }}>Compare all your cards</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  sub: { fontSize: 12.5, marginBottom: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 18 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9 },
  footnote: { fontSize: 11, lineHeight: 15, marginTop: 4, marginBottom: 4 },
  outlineBtn: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
});
