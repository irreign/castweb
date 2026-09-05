import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SelectField } from '@/components/SelectField';
import { SliderField } from '@/components/SliderField';
import { Radii, Spacing, useColors } from '@/constants/theme';
import { formatCurrency } from '@/lib/format';

function initialPriceFrom(param: string | undefined): number {
  const parsed = param ? Number(param) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 500_000;
  return Math.min(5_000_000, Math.max(50_000, parsed));
}

type LoanPropertyType = 'hdb' | 'private';

const TDSR_LIMIT = 0.55;
const MSR_LIMIT = 0.3;

export default function MortgageScreen() {
  const colors = useColors();
  const { price: priceParam } = useLocalSearchParams<{ price?: string }>();
  const [price, setPrice] = useState(() => initialPriceFrom(priceParam));
  const [downPaymentPercent, setDownPaymentPercent] = useState(20);
  const [interestRate, setInterestRate] = useState(4.0);
  const [termYears, setTermYears] = useState(25);
  const [propertyType, setPropertyType] = useState<LoanPropertyType>('private');
  const [age, setAge] = useState(35);
  const [monthlyIncome, setMonthlyIncome] = useState(8000);
  const [monthlyDebts, setMonthlyDebts] = useState(0);

  const { loanAmount, monthlyPayment, totalInterest, totalPaid } = useMemo(() => {
    const loan = price * (1 - downPaymentPercent / 100);
    const monthlyRate = interestRate / 100 / 12;
    const n = termYears * 12;
    const payment =
      n <= 0 ? 0 : monthlyRate === 0 ? loan / n : (loan * (monthlyRate * (1 + monthlyRate) ** n)) / ((1 + monthlyRate) ** n - 1);
    const paid = payment * n;
    return { loanAmount: loan, monthlyPayment: payment, totalInterest: Math.max(paid - loan, 0), totalPaid: paid };
  }, [price, downPaymentPercent, interestRate, termYears]);

  // MAS lending limits, assuming this is a first housing loan (the common case for a
  // first-time buyer) — a second or subsequent property loan faces stricter LTV caps.
  const masCheck = useMemo(() => {
    const ltvCap = termYears > 30 || age + termYears > 65 ? 0.55 : 0.75;
    const minDownPaymentPercent = (1 - ltvCap) * 100;
    const msrCapMonthly = propertyType === 'hdb' ? monthlyIncome * MSR_LIMIT : null;
    const tdsrCapMonthly = Math.max(monthlyIncome * TDSR_LIMIT - monthlyDebts, 0);
    const effectiveCapMonthly = msrCapMonthly != null ? Math.min(msrCapMonthly, tdsrCapMonthly) : tdsrCapMonthly;
    const meetsLtv = downPaymentPercent >= minDownPaymentPercent - 0.05;
    const meetsDebtRatio = monthlyPayment <= effectiveCapMonthly + 1;
    return { ltvCap, minDownPaymentPercent, msrCapMonthly, tdsrCapMonthly, effectiveCapMonthly, meetsLtv, meetsDebtRatio };
  }, [termYears, age, propertyType, monthlyIncome, monthlyDebts, downPaymentPercent, monthlyPayment]);

  const withinLimits = masCheck.meetsLtv && masCheck.meetsDebtRatio;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.sectionLabel, { color: colors.muted }]}>PROPERTY</Text>
      <SelectField
        label="Type"
        value={propertyType}
        options={[
          { value: 'hdb', label: 'HDB / EC (new)' },
          { value: 'private', label: 'Private (condo / landed)' },
        ]}
        onChange={(v) => setPropertyType(v ?? 'private')}
      />
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
      <SliderField
        label="Your age"
        value={age}
        minimumValue={21}
        maximumValue={65}
        step={1}
        formatValue={(v) => `${v.toFixed(0)}`}
        onValueChange={setAge}
      />

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>YOUR FINANCES</Text>
      <SliderField
        label="Gross monthly income"
        value={monthlyIncome}
        minimumValue={2_000}
        maximumValue={40_000}
        step={500}
        formatValue={formatCurrency}
        onValueChange={setMonthlyIncome}
      />
      <SliderField
        label="Other monthly debt repayments"
        value={monthlyDebts}
        minimumValue={0}
        maximumValue={10_000}
        step={100}
        formatValue={formatCurrency}
        onValueChange={setMonthlyDebts}
      />

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>ESTIMATE</Text>
      <View style={[styles.results, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ResultLine label="Loan amount" value={formatCurrency(loanAmount)} />
        <ResultLine label="Monthly payment" value={formatCurrency(monthlyPayment)} highlight />
        <ResultLine label="Total interest" value={formatCurrency(totalInterest)} />
        <ResultLine label="Total paid over term" value={formatCurrency(totalPaid)} last />
      </View>

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>MAS LENDING LIMITS</Text>
      <View
        style={[
          styles.masBanner,
          { backgroundColor: withinLimits ? colors.accentWash : colors.flagWash, borderColor: withinLimits ? colors.accent : colors.flag },
        ]}
      >
        <Text style={[styles.masBannerText, { color: withinLimits ? colors.accentStrong : colors.flag }]}>
          {withinLimits ? 'Within MAS limits for a first home loan' : 'Outside MAS limits for a first home loan'}
        </Text>
      </View>
      <View style={[styles.results, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ResultLine
          label="Min down payment (LTV cap)"
          value={`${masCheck.minDownPaymentPercent.toFixed(0)}%`}
          flagged={!masCheck.meetsLtv}
        />
        {masCheck.msrCapMonthly != null && (
          <ResultLine label="MSR cap (30% of income)" value={formatCurrency(masCheck.msrCapMonthly)} />
        )}
        <ResultLine label="TDSR cap (55% of income, less debts)" value={formatCurrency(masCheck.tdsrCapMonthly)} last flagged={!masCheck.meetsDebtRatio} />
      </View>
      <Text style={[styles.note, { color: colors.muted }]}>
        Assumes this is your first home loan — a second or subsequent property loan faces a lower LTV cap. MSR
        (Mortgage Servicing Ratio) only applies to HDB flats and new ECs; TDSR (Total Debt Servicing Ratio) applies
        to all housing loans and includes your other debts.
      </Text>

      <Text style={[styles.note, { color: colors.muted }]}>
        Excludes taxes, insurance and fees. Assumes a fixed rate for the full term. This is an illustrative estimate
        for your own reference, not financial advice or a loan offer — actual eligibility, rates and CPF usage
        depend on a bank's underwriting. Speak to a bank or a licensed financial adviser before committing.
      </Text>
    </ScrollView>
  );
}

function ResultLine({
  label,
  value,
  highlight,
  last,
  flagged,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  last?: boolean;
  flagged?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.resultLine, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text style={{ color: colors.ink, fontSize: 13 }}>{label}</Text>
      <Text
        style={{
          color: flagged ? colors.flag : highlight ? colors.accentStrong : colors.ink,
          fontWeight: highlight || flagged ? '800' : '600',
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
  masBanner: { borderRadius: Radii.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.sm },
  masBannerText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  note: { fontSize: 12, marginTop: Spacing.md, lineHeight: 17 },
});
