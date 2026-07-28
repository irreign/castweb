import React, { useState } from 'react';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Screen } from '../components/Screen';
import { ChipRow } from '../components/Chip';
import { TextField } from '../components/TextField';
import { CompareTable } from '../components/CompareTable';
import { ProGate } from '../components/ProGate';
import { useTheme } from '../theme';
import { useAppState } from '../state/AppState';
import {
  distanceToPriorityBanking,
  estimateTaxSaved,
  formatCurrency,
  parseCurrencyInput,
  marginalRate,
} from '../utils/finance';

const FD_RATE = 0.016;
const ES3_RATE = 0.07;
const PORTFOLIO_RATE = 0.055;
const SRS_EXAMPLE_TOPUP = 6000;

export default function GrowScreen() {
  const c = useTheme();
  const [setUp, setSetUp] = useState(false);
  const [savingsInput, setSavingsInput] = useState('');
  const [incomeInput, setIncomeInput] = useState('');
  const [hasFd, setHasFd] = useState('No');

  const { savings, annualIncome, setMoneyInputs, netWorthHistory, addNetWorthCheckIn } = useAppState();
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInValue, setCheckInValue] = useState('');

  if (!setUp) {
    return (
      <Screen>
        <Text style={[styles.title, { color: c.ink }]}>Quick one about your savings</Text>
        <Text style={[styles.sub, { color: c.inkSoft }]}>
          Real numbers, not bands — everything below is computed specifically from these.
        </Text>

        <TextField
          label="Your approximate savings & investments"
          value={savingsInput}
          onChangeText={setSavingsInput}
          keyboardType="numeric"
          placeholder="e.g. 20000"
        />
        <TextField
          label="Your approximate annual income"
          value={incomeInput}
          onChangeText={setIncomeInput}
          keyboardType="numeric"
          placeholder="e.g. 90000"
        />
        <ChipRow label="Do you have a fixed deposit already?" options={['No', 'Yes']} active={hasFd} />

        <TouchableOpacity
          style={[styles.button, { backgroundColor: c.gold }]}
          onPress={() => {
            setMoneyInputs(parseCurrencyInput(savingsInput), parseCurrencyInput(incomeInput));
            setSetUp(true);
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>See my comparison →</Text>
        </TouchableOpacity>
      </Screen>
    );
  }

  const gap = distanceToPriorityBanking(savings);
  const taxSaved = estimateTaxSaved(annualIncome, SRS_EXAMPLE_TOPUP);
  const rate = Math.round(marginalRate(annualIncome) * 1000) / 10;
  const lastEntry = netWorthHistory[netWorthHistory.length - 1];
  const prevEntry = netWorthHistory[netWorthHistory.length - 2];
  const delta = prevEntry ? lastEntry.amount - prevEntry.amount : null;

  return (
    <Screen>
      <Text style={[styles.title, { color: c.ink }]}>Grow your money</Text>
      <Text style={[styles.sub, { color: c.inkSoft }]}>Computed from what you entered — not a generic example.</Text>

      <Text style={[styles.label, { color: c.inkFaint }]}>YOUR INPUTS</Text>
      <CompareTable
        rows={[
          ['Savings & investments', formatCurrency(savings)],
          ['Annual income', formatCurrency(annualIncome)],
        ]}
      />

      {gap > 0 ? (
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text style={[styles.kicker, { color: c.goldStrong }]}>REWARD — PRIORITY BANKING GAP</Text>
          <Text style={[styles.cardBody, { color: c.inkSoft }]}>
            You're <Text style={{ fontWeight: '800', color: c.ink }}>{formatCurrency(gap)}</Text> away from the
            ~$200k in deposits/investments most banks ask for, based on what you entered.
          </Text>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text style={[styles.kicker, { color: c.goldStrong }]}>REWARD — PRIORITY BANKING</Text>
          <Text style={[styles.cardBody, { color: c.inkSoft }]}>
            You're already past the ~$200k mark most banks use — worth checking if you qualify now.
          </Text>
        </View>
      )}

      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: c.inkFaint, marginTop: 0 }]}>IF YOUR {formatCurrency(savings)} SAT IN…</Text>
        <Text style={{ fontSize: 10.5, color: c.inkFaint }}>Rates checked 12d ago</Text>
      </View>
      <CompareTable
        headers={['Where', 'Rate', 'Per month']}
        rows={[
          ['Best FD', '1.60% p.a.', formatCurrency((savings * FD_RATE) / 12)],
          ['SGX ES3 (STI ETF)', '~7.0% p.a.*', formatCurrency((savings * ES3_RATE) / 12)],
          ['Diversified portfolio', '~5.5% p.a.*', formatCurrency((savings * PORTFOLIO_RATE) / 12)],
        ]}
      />
      <Text style={[styles.footnote, { color: c.inkFaint }]}>
        *5-year historical average, not a promise. FD is a contract; ES3 and the portfolio can lose value — past
        performance isn't a projection of future returns.
      </Text>

      <ProGate
        title="Your SRS top-up tax savings"
        teaser={`Based on your income, we can compute exactly what a $${SRS_EXAMPLE_TOPUP.toLocaleString()} SRS top-up would save you in tax this year — not a generic "$8,000 relief" tip everyone already knows.`}
      >
        <Text style={[styles.cardBody, { color: c.inkSoft }]}>
          At your income, a ${SRS_EXAMPLE_TOPUP.toLocaleString()} SRS top-up sits in your {rate}% marginal bracket —
          that's an estimated <Text style={{ fontWeight: '800', color: c.ink }}>{formatCurrency(taxSaved)}</Text> saved
          in tax this year.
        </Text>
        <Text style={[styles.footnote, { color: c.inkFaint, marginTop: 8 }]}>
          Estimate only — ignores other reliefs and the $80,000 total relief cap. SRS cap is $15,300/year for
          citizens & PRs; CPF cash top-up relief is capped separately at $8,000 (self) + $8,000 (loved ones).
        </Text>
      </ProGate>

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line, marginTop: 14 }]}>
        <Text style={[styles.kicker, { color: c.teal }]}>NET WORTH CHECK-IN</Text>
        {lastEntry ? (
          <Text style={[styles.cardBody, { color: c.inkSoft }]}>
            Last recorded: <Text style={{ fontWeight: '800', color: c.ink }}>{formatCurrency(lastEntry.amount)}</Text>
            {delta !== null ? (
              <Text style={{ color: delta >= 0 ? c.success : c.critical, fontWeight: '700' }}>
                {'  '}
                {delta >= 0 ? '+' : ''}
                {formatCurrency(delta)} since last check-in
              </Text>
            ) : (
              '  — check in again next month to see your trend'
            )}
          </Text>
        ) : null}

        {checkInOpen ? (
          <View style={{ marginTop: 8 }}>
            <TextField
              label="New savings amount"
              value={checkInValue}
              onChangeText={setCheckInValue}
              keyboardType="numeric"
              placeholder="e.g. 22000"
            />
            <TouchableOpacity
              style={[styles.button, { backgroundColor: c.gold, marginTop: 8 }]}
              onPress={() => {
                addNetWorthCheckIn(parseCurrencyInput(checkInValue));
                setCheckInValue('');
                setCheckInOpen(false);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.buttonText}>Save check-in →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={[styles.outlineBtn, { borderColor: c.line, marginTop: 10 }]} onPress={() => setCheckInOpen(true)}>
            <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13.5 }}>Update my savings</Text>
          </TouchableOpacity>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  sub: { fontSize: 12.5, marginBottom: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, marginTop: 14, marginBottom: 4 },
  footnote: { fontSize: 11, lineHeight: 15, marginTop: 4 },
  button: { paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#201404', fontWeight: '800', fontSize: 15 },
  outlineBtn: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 12 },
  kicker: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6 },
  cardBody: { fontSize: 13, lineHeight: 19 },
});
