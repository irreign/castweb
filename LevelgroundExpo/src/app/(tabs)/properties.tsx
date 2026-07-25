import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SelectField } from '@/components/SelectField';
import { SliderField } from '@/components/SliderField';
import { StarButton } from '@/components/StarButton';
import { Radii, Spacing, useColors } from '@/constants/theme';
import { useShortlist } from '@/context/ShortlistContext';
import { formatCurrency, formatKm } from '@/lib/format';
import { distanceKm } from '@/lib/geo';
import { FACILITIES_INFO, FACILITIES_ORDER, facilitiesAtLeast, tenureTitle, type FacilitiesLevel, type SGProperty } from '@/lib/models';
import { PROPERTIES, propertyById } from '@/lib/properties';
import { SCHOOLS } from '@/lib/schools';

const CONDOS = PROPERTIES.filter((p) => p.type === 'condo');
const AREAS = Array.from(new Set(CONDOS.map((p) => p.town))).sort();

type Mode = 'search' | 'shortlist';

export default function PropertiesScreen() {
  const colors = useColors();
  const { shortlistedIds, toggle, isShortlisted } = useShortlist();
  const [mode, setMode] = useState<Mode>('search');

  const [area, setArea] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [maxBudget, setMaxBudget] = useState(3_000_000);
  const [minFacilities, setMinFacilities] = useState<FacilitiesLevel | null>(null);
  const [maxMcst, setMaxMcst] = useState(700);

  const school = schoolId ? SCHOOLS.find((s) => s.id === schoolId) : undefined;

  const results = useMemo(() => {
    let pool = CONDOS;
    if (area) pool = pool.filter((p) => p.town === area);
    pool = pool.filter((p) => p.indicativePrice <= maxBudget);
    if (minFacilities) pool = pool.filter((p) => facilitiesAtLeast(p.facilities ?? 'basic', minFacilities));
    pool = pool.filter((p) => (p.mcstFeeMonthly ?? 0) <= maxMcst);

    let withDistance = pool.map((p) => ({
      property: p,
      distanceKm: school ? distanceKm(p.location, school.location) : undefined,
    }));

    if (school) {
      withDistance = withDistance.filter((r) => (r.distanceKm ?? Infinity) <= 2.0);
      withDistance.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    } else {
      withDistance.sort((a, b) => a.property.indicativePrice - b.property.indicativePrice);
    }
    return withDistance;
  }, [area, school, maxBudget, minFacilities, maxMcst]);

  const shortlistedProperties = Array.from(shortlistedIds)
    .map((id) => propertyById(id))
    .filter((p): p is SGProperty => !!p);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.segWrap}>
        <View style={[styles.seg, { backgroundColor: colors.surface2 }]}>
          <SegButton label="Search" active={mode === 'search'} onPress={() => setMode('search')} />
          <SegButton label="Shortlist" active={mode === 'shortlist'} onPress={() => setMode('shortlist')} />
        </View>
      </View>

      {mode === 'search' ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>FIND A CONDO</Text>
          <View style={[styles.filterCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SelectField
              label="Area"
              value={area}
              options={AREAS.map((a) => ({ value: a, label: a }))}
              onChange={setArea}
            />
            <SelectField
              label="Near school"
              value={schoolId}
              options={SCHOOLS.map((s) => ({ value: s.id, label: s.name }))}
              onChange={setSchoolId}
            />
            {school && (
              <Text style={[styles.hint, { color: colors.muted }]}>
                Showing condos within 2km — beyond that, distance gives no registration priority.
              </Text>
            )}
            <SliderField
              label="Budget up to"
              value={maxBudget}
              minimumValue={800_000}
              maximumValue={3_000_000}
              step={50_000}
              formatValue={formatCurrency}
              onValueChange={setMaxBudget}
            />
            <SelectField
              label="Facilities, at least"
              value={minFacilities}
              options={FACILITIES_ORDER.map((f) => ({ value: f, label: FACILITIES_INFO[f].title }))}
              onChange={setMinFacilities}
            />
            <SliderField
              label="MCST fee up to"
              value={maxMcst}
              minimumValue={200}
              maximumValue={700}
              step={25}
              formatValue={(v) => `$${v.toFixed(0)}/mo`}
              onValueChange={setMaxMcst}
            />
          </View>

          <Text style={[styles.sectionLabel, { color: colors.muted }]}>
            {results.length} MATCH{results.length === 1 ? '' : 'ES'}
          </Text>
          {results.length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              No condos in the sample data meet all of these — try loosening a filter.
            </Text>
          ) : (
            <View style={{ gap: Spacing.sm }}>
              {results.map((r) => (
                <CondoRow
                  key={r.property.id}
                  property={r.property}
                  distanceKm={r.distanceKm}
                  starred={isShortlisted(r.property.id)}
                  onToggleStar={() => toggle(r.property.id)}
                />
              ))}
            </View>
          )}
          <Text style={[styles.footer, { color: colors.muted }]}>
            Sample condos for demonstration — coordinates, psf and fees are illustrative, not sourced from URA/MCST
            records.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {shortlistedProperties.length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Nothing shortlisted yet — star a condo from Search to save it here.
            </Text>
          ) : (
            <View style={{ gap: Spacing.sm }}>
              {shortlistedProperties.map((property) => (
                <CondoRow
                  key={property.id}
                  property={property}
                  distanceKm={undefined}
                  starred
                  onToggleStar={() => toggle(property.id)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function SegButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segBtn, active && { backgroundColor: colors.surface, shadowOpacity: 0.12 }]}
    >
      <Text style={{ color: active ? colors.ink : colors.muted, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function CondoRow({
  property,
  distanceKm: km,
  starred,
  onToggleStar,
}: {
  property: SGProperty;
  distanceKm?: number;
  starred: boolean;
  onToggleStar: () => void;
}) {
  const colors = useColors();
  return (
    <Link href={`/property/${property.id}`} asChild>
      <Pressable style={[styles.condoRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.condoName, { color: colors.ink }]}>{property.name}</Text>
          <Text style={[styles.condoMeta, { color: colors.muted }]}>
            {property.town} · {tenureTitle(property.tenure)}
          </Text>
          <View style={styles.badgeRow}>
            {property.pricePsfHistoric != null && (
              <Text style={[styles.psf, { color: colors.ink }]}>${property.pricePsfHistoric}/sqft</Text>
            )}
            {property.facilities && (
              <View style={[styles.facPill, { backgroundColor: colors.accent }]}>
                <Text style={styles.facPillText}>{FACILITIES_INFO[property.facilities].title}</Text>
              </View>
            )}
            {property.mcstFeeMonthly != null && (
              <Text style={[styles.mcstText, { color: colors.muted }]}>${property.mcstFeeMonthly}/mo MCST</Text>
            )}
          </View>
          <Text style={[styles.priceLine, { color: colors.muted }]}>{formatCurrency(property.indicativePrice)} indicative</Text>
        </View>
        <View style={styles.trailStack}>
          <StarButton filled={starred} onPress={onToggleStar} />
          {km != null && <Text style={[styles.kmText, { color: colors.muted }]}>{formatKm(km)}</Text>}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  segWrap: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  seg: { flexDirection: 'row', borderRadius: Radii.md - 2, padding: 3, gap: 3 },
  segBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radii.sm - 2,
  },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  filterCard: { borderRadius: Radii.lg, borderWidth: 1, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  hint: { fontSize: 11, lineHeight: 15, marginTop: -4, marginBottom: Spacing.sm },
  footer: { fontSize: 11, lineHeight: 16, marginTop: Spacing.lg },
  condoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
  condoName: { fontSize: 14, fontWeight: '700' },
  condoMeta: { fontSize: 12, marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  psf: { fontSize: 12, fontWeight: '700' },
  facPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  facPillText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  mcstText: { fontSize: 11 },
  priceLine: { fontSize: 11, marginTop: 4 },
  trailStack: { alignItems: 'flex-end', gap: 8 },
  kmText: { fontSize: 11 },
});
