import React, { useState } from 'react';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Screen } from '../components/Screen';
import { ChipRow } from '../components/Chip';
import { TextField } from '../components/TextField';
import { EnrollRow } from '../components/EnrollRow';
import { OfferRow } from '../components/OfferRow';
import { CompareTable } from '../components/CompareTable';
import { ProGate } from '../components/ProGate';
import { useTheme } from '../theme';
import { useAppState } from '../state/AppState';
import { cardOffers, cardFields } from '../data/mock';
import { milesCardValue, cashbackCardValue, formatCurrency, parseCurrencyInput } from '../utils/finance';

export default function CardsScreen() {
  const c = useTheme();
  const [spendInput, setSpendInput] = useState('');
  const [hasCards, setHasCards] = useState(cardFields[0].active);
  const [bank, setBank] = useState(cardFields[1].active);

  const { enrollments, cardMonthlySpend, setCardSpend, gatesCompleted, markGateComplete } = useAppState();

  if (!gatesCompleted.cards) {
    return (
      <Screen>
        <Text style={[styles.title, { color: c.ink }]}>Quick one about your cards</Text>
        <Text style={[styles.sub, { color: c.inkSoft }]}>
          Three questions, asked here because they only matter for this screen.
        </Text>

        <ChipRow label={cardFields[0].label} options={cardFields[0].options} active={hasCards} />
        <ChipRow label={cardFields[1].label} options={cardFields[1].options} active={bank} />
        <TextField
          label="Roughly how much do you spend on cards monthly?"
          value={spendInput}
          onChangeText={setSpendInput}
          keyboardType="numeric"
          placeholder="e.g. 2500"
        />

        <TouchableOpacity
          style={[styles.button, { backgroundColor: c.gold }]}
          onPress={() => {
            setCardSpend(parseCurrencyInput(spendInput));
            markGateComplete('cards');
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Show my cards →</Text>
        </TouchableOpacity>
      </Screen>
    );
  }

  const milesValue = milesCardValue(cardMonthlySpend);
  const cashbackValue = cashbackCardValue(cardMonthlySpend);
  const milesWins = milesValue >= cashbackValue;
  const annualGap = Math.abs(milesValue - cashbackValue) * 12;

  return (
    <Screen>
      <Text style={[styles.title, { color: c.ink }]}>Your cards</Text>
      <Text style={[styles.sub, { color: c.inkSoft }]}>Every card you've signed up for, and when you can again.</Text>

      {enrollments.length === 0 ? (
        <View style={[styles.empty, { borderColor: c.line, backgroundColor: c.surface }]}>
          <Text style={{ color: c.inkSoft, fontSize: 13, lineHeight: 19 }}>
            No cards yet. Enrol in one of the offers below and it'll show up here — including its gift, and the date
            you'd be eligible to get a bonus again if you ever cancel it.
          </Text>
        </View>
      ) : (
        enrollments.map((e, i) => (
          <EnrollRow
            key={i}
            name={e.name}
            status={e.status}
            meta1={e.status === 'active' ? `Signed up ${e.signedUp}` : `Cancelled ${e.cancelled}`}
            meta2={`Gift: ${e.gift}`}
            note={e.reactivateFrom ? `Eligible again from ${e.reactivateFrom}` : undefined}
          />
        ))
      )}

      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: c.inkFaint }]}>OFFERS WORTH SIGNING UP FOR</Text>
        <Text style={{ fontSize: 10.5, color: c.inkFaint }}>Updated 3d ago</Text>
      </View>
      {cardOffers.map((o, i) => (
        <OfferRow key={i} name={o.name} ends={o.ends} gift={o.gift} meta={o.meta} url={o.url} />
      ))}
      <Text style={[styles.footnote, { color: c.inkFaint }]}>
        Sourced from public bank, MoneySmart & SingSaver promotions as of Jul 2026 — "Ongoing" means no published end
        date, not that it won't change. Confirm current terms before applying.
      </Text>

      <Text style={[styles.label, { color: c.inkFaint, marginTop: 18 }]}>MILES VS CASHBACK ON YOUR {formatCurrency(cardMonthlySpend)}/MONTH</Text>
      <CompareTable
        headers={['Card', 'Structure', 'Value']}
        rows={[
          ["Woman's World (miles)", '4 mpd to $2k, then 0.4', formatCurrency(milesValue)],
          ['365 Cashback', '1.5% blended', formatCurrency(cashbackValue)],
        ]}
      />
      <Text style={[styles.footnote, { color: c.inkFaint }]}>
        Miles valued at ≈2¢ each for a Krisflyer transfer — actual redemption value depends on the flight.
      </Text>

      <ProGate
        title="Which card actually wins for you"
        teaser="We can tell you exactly which structure wins on your real spend, and what that's worth over a full year — not just a per-month snapshot."
      >
        <Text style={[styles.cardBody, { color: c.inkSoft }]}>
          At {formatCurrency(cardMonthlySpend)}/month, <Text style={{ fontWeight: '800', color: c.ink }}>{milesWins ? "Woman's World" : '365 Cashback'}</Text>{' '}
          wins — worth an estimated <Text style={{ fontWeight: '800', color: c.ink }}>{formatCurrency(annualGap)}</Text> more per year than the other option.
        </Text>
      </ProGate>

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
  button: { paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#201404', fontWeight: '800', fontSize: 15 },
  outlineBtn: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  empty: { borderWidth: 1, borderRadius: 14, padding: 15, marginTop: 12 },
  cardBody: { fontSize: 13, lineHeight: 19 },
});
