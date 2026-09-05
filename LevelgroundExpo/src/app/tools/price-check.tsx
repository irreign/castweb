import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SelectField } from '@/components/SelectField';
import { Spacing, useColors } from '@/constants/theme';
import { formatCurrency } from '@/lib/format';
import { DISTRICT_INFO, PROPERTY_TYPE_TITLE, districtLabel, type PropertyType } from '@/lib/models';
import { PROPERTIES, averageIndicativePrice, averagePsf } from '@/lib/properties';

const PROPERTY_TYPES: PropertyType[] = ['hdb', 'condo', 'landed'];
const DISTRICTS = Array.from(new Set(PROPERTIES.map((p) => p.district))).sort((a, b) => a - b);

export default function PriceCheckScreen() {
  const colors = useColors();
  const [propertyType, setPropertyType] = useState<PropertyType | null>(null);
  const [district, setDistrict] = useState<string | null>(null);

  const districtNum = district ? Number(district) : null;
  const psf = propertyType === 'condo' && districtNum != null ? averagePsf(districtNum) : undefined;
  const avgPrice = propertyType && districtNum != null ? averageIndicativePrice(propertyType, districtNum) : undefined;
  const hasResult = propertyType != null && districtNum != null;
  const hasData = psf != null || avgPrice != null;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.intro, { color: colors.muted }]}>
        Get an instant price benchmark for an area — no listing needed. Pick a property type and
        district to see how it compares to similar sample properties.
      </Text>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SelectField
          label="Property type"
          value={propertyType}
          options={PROPERTY_TYPES.map((t) => ({ value: t, label: PROPERTY_TYPE_TITLE[t] }))}
          onChange={setPropertyType}
        />
        <SelectField
          label="District"
          value={district}
          options={DISTRICTS.map((d) => ({ value: String(d), label: districtLabel(d) }))}
          onChange={setDistrict}
        />
      </View>

      {hasResult && !hasData && (
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          Not enough sample data for {PROPERTY_TYPE_TITLE[propertyType].toLowerCase()} in{' '}
          {DISTRICT_INFO[districtNum!]?.code ?? `district ${districtNum}`} to show a benchmark yet.
        </Text>
      )}

      {hasResult && hasData && (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.resultTitle, { color: colors.ink }]}>
            {PROPERTY_TYPE_TITLE[propertyType]} in {DISTRICT_INFO[districtNum!]?.code ?? `District ${districtNum}`}
          </Text>
          {psf != null && (
            <View style={styles.resultRow}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Average psf, sample data</Text>
              <Text style={{ color: colors.accentStrong, fontSize: 18, fontWeight: '800' }}>${psf}/sqft</Text>
            </View>
          )}
          {avgPrice != null && (
            <View style={styles.resultRow}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Average indicative price</Text>
              <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>{formatCurrency(avgPrice)}</Text>
            </View>
          )}
        </View>
      )}

      <Text style={[styles.disclaimer, { color: colors.muted }]}>
        This benchmark is averaged from Levelground's small illustrative sample dataset, not from real URA caveat
        transactions or HDB resale records — treat it as a rough starting point, not a valuation. For a real
        transaction-based estimate, check URA's Realis or HDB's resale price portal directly.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2, gap: Spacing.md },
  intro: { fontSize: 13, lineHeight: 18 },
  card: { borderRadius: 14, borderWidth: 1, padding: Spacing.md },
  resultTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  disclaimer: { fontSize: 11, lineHeight: 16 },
});
