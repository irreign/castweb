import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SliderField } from '@/components/SliderField';
import { Spacing, useColors } from '@/constants/theme';
import { formatCurrency } from '@/lib/format';

function initialPriceFrom(param: string | undefined): number {
  const parsed = param ? Number(param) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 500_000;
  return Math.min(5_000_000, Math.max(50_000, parsed));
}

export default function MortgageScreen() {
  const colors = useColors();
  const { price: priceParam } = useLocalSearchParams<{ price?: string }>();
  const [price, setPrice] = useState(() => initialPriceFrom(priceParam));
  const [downPaymentPercent, setDownPaymentPercent] = useState(20);
  const [interestRate, setInterestRate] = useState(4.0);
  const [termYears, setTermYears] = useState(25);

  const { loanAmount, monthlyPayment, totalInterest, totalPaid } = useMemo(() => {
    const loan = price * (1 - downPaymentPercent / 100);
    const monthlyRate = interestRate / 100 / 12;
    const n = termYears * 12;
    const payment =
      n <= 0 ? 0 : monthlyRate === 0 ? loan / n : (loan * (monthlyRate * (1 + monthlyRate) ** n)) / ((1 + monthlyRate) ** n - 1);
    const paid = payment * n;
    return { loanAmount: loan, monthlyPayment: payment, totalInterest: Math.max(paid - loan, 0), totalPaid: paid };
  }, [price, downPaymentPercent, interestRate, termYears]);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.sectionLabel, { color: colors.muted }]}>PROPERTY</Text>
      <SliderField
        label="Price"
        value={price}
        minimumValue={50_000}
        maximumValue={5_000_000}
        step={10_000}
        formatValue={formatCurrency}
        onValueChange={setPrice}
      />
      <SliderField
        label="Down payment"
        value={downPaymentPercent}
        minimumValue={0}
        maximumValue={90}
        step={1}
        formatValue={(v) => `${v.toFixed(0)}%`}
        onValueChange={setDownPaymentPercent}
      />

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>LOAN</Text>
      <SliderField
        label="Interest rate"
        value={interestRate}
        minimumValue={0}
        maximumValue={15}
        step={0.1}
        formatValue={(v) => `${v.toFixed(1)}%`}
        onValueChange={setInterestRate}
      />
      <SliderField
        label="Term"
        value={termYears}
        minimumValue={5}
        maximumValue={35}
        step={1}
        formatValue={(v) => `${v.toFixed(0)} yrs`}
        onValueChange={setTermYears}
      />

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>ESTIMATE</Text>
      <View style={[styles.results, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ResultLine label="Loan amount" value={formatCurrency(loanAmount)} />
        <ResultLine label="Monthly payment" value={formatCurrency(monthlyPayment)} highlight />
        <ResultLine label="Total interest" value={formatCurrency(totalInterest)} />
        <ResultLine label="Total paid over term" value={formatCurrency(totalPaid)} last />
      </View>

      <Text style={[styles.note, { color: colors.muted }]}>
        Excludes taxes, insurance and fees. Assumes a fixed rate for the full term.
      </Text>
    </ScrollView>
  );
}

function ResultLine({ label, value, highlight, last }: { label: string; value: string; highlight?: boolean; last?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.resultLine, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text style={{ color: colors.ink, fontSize: 13 }}>{label}</Text>
      <Text
        style={{
          color: highlight ? colors.accentStrong : colors.ink,
          fontWeight: highlight ? '800' : '600',
          fontSize: highlight ? 16 : 13,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: Spacing.lg, marginBottom: Spacing.xs },
  results: { borderRadius: 14, borderWidth: 1, paddingHorizontal: Spacing.md },
  resultLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm + 2 },
  note: { fontSize: 12, marginTop: Spacing.md, lineHeight: 17 },
});
