import { Ionicons } from '@expo/vector-icons';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '@/components/ProgressBar';
import { StarButton } from '@/components/StarButton';
import { Radii, Spacing, useColors } from '@/constants/theme';
import { useShortlist } from '@/context/ShortlistContext';
import { formatCurrency, formatKm } from '@/lib/format';
import { nearestSchools } from '@/lib/geo';
import {
  BAND_INFO,
  DISTRICT_INFO,
  FACILITIES_INFO,
  leaseBandFor,
  PROPERTY_TYPE_TITLE,
  REGISTRATION_PHASES,
  tenureTitle,
  type SchoolPriorityBand,
} from '@/lib/models';
import { averagePsf, propertyById } from '@/lib/properties';
import { SCHOOLS } from '@/lib/schools';

const BAND_TINT: Record<SchoolPriorityBand, string> = {
  within1km: '#2F6F4E',
  within2km: '#C98A2E',
  beyond2km: '#8A8F86',
};

const AFFORD_DOWN_PERCENT = 20;
const AFFORD_RATE_PERCENT = 4.0;
const AFFORD_TERM_YEARS = 25;

function estimateMortgage(price: number, downPercent: number, ratePercent: number, termYears: number) {
  const loan = price * (1 - downPercent / 100);
  const monthlyRate = ratePercent / 100 / 12;
  const n = termYears * 12;
  if (n <= 0) return { loan, monthly: 0 };
  const monthly =
    monthlyRate === 0 ? loan / n : (loan * (monthlyRate * (1 + monthlyRate) ** n)) / ((1 + monthlyRate) ** n - 1);
  return { loan, monthly };
}

export default function PropertyReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { isShortlisted, toggle } = useShortlist();
  const property = propertyById(id);

  if (!property) {
    return (
      <View style={[styles.notFound, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.muted }}>Property not found.</Text>
      </View>
    );
  }

  const starred = isShortlisted(property.id);
  const schools = nearestSchools(property.location, SCHOOLS, 4);
  const closest = schools[0];
  const lease = leaseBandFor(property);
  const avgPsf = averagePsf(property.district);
  const districtInfo = DISTRICT_INFO[property.district];

  return (
    <>
      <Stack.Screen
        options={{
          title: property.name,
          headerRight: () => <StarButton filled={starred} onPress={() => toggle(property.id)} />,
        }}
      />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <View style={[styles.sampleBanner, { backgroundColor: colors.brassWash, borderColor: colors.brass }]}>
          <Ionicons name="flask-outline" size={15} color={colors.brass} />
          <Text style={[styles.sampleBannerText, { color: colors.brass }]}>Sample data, not a real listing.</Text>
        </View>
        <View style={styles.headerRow}>
          <View style={[styles.typeBadge, { backgroundColor: colors.accentWash }]}>
            <Text style={[styles.typeBadgeText, { color: colors.accentStrong }]}>{PROPERTY_TYPE_TITLE[property.type]}</Text>
          </View>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {districtInfo?.code} · {property.town}
          </Text>
        </View>
        <Text style={[styles.title, { color: colors.ink }]}>{property.name}</Text>

        {property.type === 'condo' && (
          <ReportCard title="Price" icon="cash-outline">
            <View style={styles.priceBig}>
              <Text style={[styles.priceNum, { color: colors.ink }]}>${property.pricePsfHistoric}</Text>
              <Text style={[styles.priceUnit, { color: colors.muted }]}>/ sqft, historic</Text>
            </View>
            {property.unitSizeSqft != null && (
              <Text style={[styles.note, { color: colors.muted }]}>
                ~{formatCurrency(property.indicativePrice)} indicative, for a ~{property.unitSizeSqft} sqft unit
              </Text>
            )}
            {avgPsf != null && property.pricePsfHistoric != null && (
              <PsfCompare psf={property.pricePsfHistoric} avg={avgPsf} districtCode={districtInfo?.code ?? 'this district'} />
            )}
            <Divider />
            <RowLine label="Facilities" value={property.facilities ? FACILITIES_INFO[property.facilities].title : '—'} strong />
            {property.facilities && <Text style={[styles.note, { color: colors.muted }]}>{FACILITIES_INFO[property.facilities].description}</Text>}
            <Divider />
            <RowLine label="MCST fee" value={property.mcstFeeMonthly != null ? `$${property.mcstFeeMonthly}/month` : '—'} strong />
            <Text style={[styles.note, { color: colors.muted }]}>
              Paid to the Management Corporation for upkeep of shared facilities and common property — separate from
              property tax.
            </Text>
          </ReportCard>
        )}

        <ReportCard title="School priority" icon="business-outline" learnMoreId="school-priority-explained">
          {closest && (
            <>
              <View style={[styles.bandBadge, { backgroundColor: `${BAND_TINT[closest.band]}22` }]}>
                <Text style={[styles.bandBadgeText, { color: BAND_TINT[closest.band] }]}>{BAND_INFO[closest.band].title}</Text>
              </View>
              <Text style={[styles.note, { color: colors.muted, marginTop: 8 }]}>{BAND_INFO[closest.band].phaseNote}</Text>
            </>
          )}
          <View style={{ marginTop: Spacing.sm }}>
            {schools.map((s) => (
              <View key={s.school.id} style={styles.schoolRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '500' }}>{s.school.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>{s.school.area}</Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{formatKm(s.distanceKm)}</Text>
              </View>
            ))}
          </View>
          <PhaseDisclosure />
        </ReportCard>

        <ReportCard title="Lease decay" icon="hourglass-outline" learnMoreId="lease-decay-explained">
          <View style={styles.leaseRow}>
            <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>{lease.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{tenureTitle(property.tenure)}</Text>
          </View>
          <View style={{ marginTop: 8 }}>
            <ProgressBar
              progress={(lease.yearsRemaining ?? 99) / 99}
              color={lease.kind === 'highRisk' ? colors.flag : lease.kind === 'caution' ? colors.warn : colors.accent}
            />
          </View>
          <Text style={[styles.note, { color: colors.muted }]}>{lease.note}</Text>
        </ReportCard>

        <ReportCard title="Affordability" icon="calculator-outline">
          {(() => {
            const { loan, monthly } = estimateMortgage(
              property.indicativePrice,
              AFFORD_DOWN_PERCENT,
              AFFORD_RATE_PERCENT,
              AFFORD_TERM_YEARS
            );
            return (
              <>
                <RowLine label="Est. monthly payment" value={formatCurrency(monthly)} strong />
                <Text style={[styles.note, { color: colors.muted }]}>
                  Loan amount ({100 - AFFORD_DOWN_PERCENT}% LTV): {formatCurrency(loan)}
                </Text>
                <Text style={[styles.note, { color: colors.muted }]}>
                  Assumes {AFFORD_DOWN_PERCENT}% down payment, {AFFORD_RATE_PERCENT.toFixed(1)}% interest,{' '}
                  {AFFORD_TERM_YEARS}-year term — adjust to your own numbers. An illustrative estimate, not a loan
                  offer or financial advice.
                </Text>
                <Link href={{ pathname: '/tools/mortgage', params: { price: String(property.indicativePrice) } }} asChild>
                  <Pressable style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                    <Text style={{ color: colors.accentStrong, fontSize: 12, fontWeight: '700' }}>Open full calculator</Text>
                  </Pressable>
                </Link>
              </>
            );
          })()}
        </ReportCard>

        <ReportCard title="Coming soon" icon="time-outline">
          <View style={styles.comingSoonRow}>
            <Ionicons name="ellipse-outline" size={16} color={colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '500' }}>Transit distance</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Walk time to the nearest MRT station or bus interchange.</Text>
            </View>
          </View>
        </ReportCard>

        <Text style={[styles.disclaimer, { color: colors.muted }]}>
          This report uses illustrative sample data to demonstrate the idea. Before relying on the school-priority
          read for actual Primary 1 registration, always verify against MOE's official school search — priority
          bands and balloting rules can change year to year.
        </Text>
      </ScrollView>
    </>
  );
}

function ReportCard({
  title,
  icon,
  learnMoreId,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  learnMoreId?: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLabel}>
          <Ionicons name={icon} size={16} color={colors.brass} />
          <Text style={[styles.cardTitle, { color: colors.ink }]}>{title}</Text>
        </View>
        {learnMoreId && (
          <Link href={`/article/${learnMoreId}`} asChild>
            <Pressable>
              <Text style={{ color: colors.accentStrong, fontSize: 12, fontWeight: '700' }}>Learn more</Text>
            </Pressable>
          </Link>
        )}
      </View>
      {children}
    </View>
  );
}

function RowLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.rowLine}>
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: strong ? '700' : '400' }}>{value}</Text>
    </View>
  );
}

function Divider() {
  const colors = useColors();
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />;
}

function PhaseDisclosure() {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={{ marginTop: Spacing.sm }}>
      <Pressable onPress={() => setExpanded((v) => !v)} style={styles.phaseToggle}>
        <Text style={{ color: colors.accentStrong, fontSize: 12, fontWeight: '700' }}>
          {expanded ? 'Hide' : 'See all'} registration phases
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accentStrong} />
      </Pressable>
      {expanded && (
        <View style={{ marginTop: 8 }}>
          {REGISTRATION_PHASES.map((phase, index) => (
            <View key={phase.id} style={[styles.phaseRow, index === 0 && { borderTopWidth: 0 }, { borderTopColor: colors.border }]}>
              <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '700', width: 132 }}>{phase.title}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, flex: 1, lineHeight: 16 }}>{phase.whoQualifies}</Text>
            </View>
          ))}
          <Text style={[styles.note, { color: colors.muted, marginTop: 8 }]}>
            There's no fixed nationwide split of seats per phase — it varies by school and year. Some schools fill
            most places before Phase 2C even opens; most still have the bulk of seats open at that point. MOE
            publishes each school's actual Phase 2C starting vacancy count annually — that's worth more than any
            general rule of thumb.
          </Text>
        </View>
      )}
    </View>
  );
}

function PsfCompare({ psf, avg, districtCode }: { psf: number; avg: number; districtCode: string }) {
  const colors = useColors();
  const delta = psf - avg;
  if (Math.abs(delta) < 25) {
    return (
      <Text style={[styles.note, { color: colors.muted }]}>
        In line with the sample average for {districtCode} (${avg}/sqft).
      </Text>
    );
  }
  return (
    <Text style={[styles.note, { color: delta > 0 ? colors.flag : colors.accentStrong }]}>
      ${Math.abs(delta)}/sqft {delta > 0 ? 'above' : 'below'} the sample average for {districtCode} (${avg}/sqft).
    </Text>
  );
}

const styles = StyleSheet.create({
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2, gap: Spacing.md },
  sampleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: Spacing.sm,
  },
  sampleBannerText: { fontSize: 12, fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  title: { fontSize: 20, fontWeight: '800', marginBottom: Spacing.xs },
  card: { borderRadius: Radii.lg, borderWidth: 1, padding: Spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  cardHeaderLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  priceBig: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  priceNum: { fontSize: 22, fontWeight: '800' },
  priceUnit: { fontSize: 12 },
  note: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  rowLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bandBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  bandBadgeText: { fontSize: 13, fontWeight: '700' },
  schoolRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  phaseToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  phaseRow: { flexDirection: 'row', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  leaseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  comingSoonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  disclaimer: { fontSize: 11, lineHeight: 16, marginTop: Spacing.sm },
});
