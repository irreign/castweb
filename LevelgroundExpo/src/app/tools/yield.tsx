import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SliderField } from '@/components/SliderField';
import { Spacing, useColors } from '@/constants/theme';
import { formatCurrency } from '@/lib/format';

export default function RentalYieldScreen() {
  const colors = useColors();
  const [price, setPrice] = useState(500_000);
  const [monthlyRent, setMonthlyRent] = useState(2_200);
  const [annualExpenses, setAnnualExpenses] = useState(4_000);

  const { annualRent, grossYield, netYield } = useMemo(() => {
    const annual = monthlyRent * 12;
    const gross = price > 0 ? (annual / price) * 100 : 0;
    const net = price > 0 ? ((annual - annualExpenses) / price) * 100 : 0;
    return { annualRent: annual, grossYield: gross, netYield: net };
  }, [price, monthlyRent, annualExpenses]);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.sectionLabel, { color: colors.muted }]}>PROPERTY</Text>
      <SliderField
        label="Purchase price"
        value={price}
        minimumValue={50_000}
        maximumValue={5_000_000}
        step={10_000}
        formatValue={formatCurrency}
        onValueChange={setPrice}
      />
      <SliderField
        label="Monthly rent"
        value={monthlyRent}
        minimumValue={0}
        maximumValue={50_000}
        step={100}
        formatValue={formatCurrency}
        onValueChange={setMonthlyRent}
      />
      <SliderField
        label="Annual expenses"
        value={annualExpenses}
        minimumValue={0}
        maximumValue={100_000}
        step={250}
        formatValue={formatCurrency}
        onValueChange={setAnnualExpenses}
      />

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>ESTIMATE</Text>
      <View style={[styles.results, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ResultLine label="Annual rent" value={formatCurrency(annualRent)} />
        <ResultLine label="Gross yield" value={`${grossYield.toFixed(2)}%`} />
        <ResultLine label="Net yield" value={`${netYield.toFixed(2)}%`} highlight last />
      </View>

      <Text style={[styles.note, { color: colors.muted }]}>
        Gross yield ignores costs; net yield subtracts annual expenses (maintenance, taxes, insurance, management,
        vacancy). Always compare net to net across properties.
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
