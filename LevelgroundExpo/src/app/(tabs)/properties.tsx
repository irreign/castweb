import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SelectField } from '@/components/SelectField';
import { SliderField } from '@/components/SliderField';
import { StarButton } from '@/components/StarButton';
import { Radii, Spacing, useColors } from '@/constants/theme';
import { useShortlist } from '@/context/ShortlistContext';
import { formatCurrency, formatKm } from '@/lib/format';
import { distanceKm, nearestSchools } from '@/lib/geo';
import {
  DISTRICT_INFO,
  FACILITIES_INFO,
  FACILITIES_ORDER,
  PROPERTY_TYPE_TITLE,
  districtLabel,
  facilitiesAtLeast,
  leaseBandFor,
  tenureTitle,
  type FacilitiesLevel,
  type PropertyType,
  type SGProperty,
} from '@/lib/models';
import { PROPERTIES, propertyById } from '@/lib/properties';
import { SCHOOLS } from '@/lib/schools';
import { loadJSON, saveJSON } from '@/lib/storage';

const DISTRICTS = Array.from(new Set(PROPERTIES.map((p) => p.district))).sort((a, b) => a - b);
const PROPERTY_TYPES: PropertyType[] = ['hdb', 'condo', 'landed'];

interface SearchFilters {
  propertyType: PropertyType | null;
  district: string | null;
  schoolId: string | null;
  maxBudget: number;
  minFacilities: FacilitiesLevel | null;
  maxMcst: number;
  minLeaseYears: number;
}

const DEFAULT_FILTERS: SearchFilters = {
  propertyType: null,
  district: null,
  schoolId: null,
  maxBudget: 3_000_000,
  minFacilities: null,
  maxMcst: 700,
  minLeaseYears: 0,
};

const FILTERS_KEY = 'levelground.propertySearchFilters';

type Mode = 'search' | 'shortlist';

export default function PropertiesScreen() {
  const colors = useColors();
  const { shortlistedIds, toggle, isShortlisted } = useShortlist();
  const [mode, setMode] = useState<Mode>('search');
  const [compareMode, setCompareMode] = useState(false);

  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  useEffect(() => {
    loadJSON(FILTERS_KEY, DEFAULT_FILTERS).then((saved) => {
      setFilters(saved);
      setFiltersLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (filtersLoaded) saveJSON(FILTERS_KEY, filters);
  }, [filters, filtersLoaded]);

  const patchFilters = (patch: Partial<SearchFilters>) => setFilters((prev) => ({ ...prev, ...patch }));

  const school = filters.schoolId ? SCHOOLS.find((s) => s.id === filters.schoolId) : undefined;

  const results = useMemo(() => {
    let pool = PROPERTIES;
    if (filters.propertyType) pool = pool.filter((p) => p.type === filters.propertyType);
    if (filters.district) pool = pool.filter((p) => p.district === Number(filters.district));
    pool = pool.filter((p) => p.indicativePrice <= filters.maxBudget);
    if (filters.minFacilities) {
      pool = pool.filter((p) => facilitiesAtLeast(p.facilities ?? 'basic', filters.minFacilities!));
    }
    pool = pool.filter((p) => (p.mcstFeeMonthly ?? 0) <= filters.maxMcst);
    if (filters.minLeaseYears > 0) {
      pool = pool.filter((p) => {
        const band = leaseBandFor(p);
        return band.kind === 'notApplicable' || (band.yearsRemaining ?? 0) >= filters.minLeaseYears;
      });
    }

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
  }, [filters, school]);

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
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>FIND A PROPERTY</Text>
          <View style={[styles.filterCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SelectField
              label="Type"
              value={filters.propertyType}
              options={PROPERTY_TYPES.map((t) => ({ value: t, label: PROPERTY_TYPE_TITLE[t] }))}
              onChange={(v) => patchFilters({ propertyType: v })}
            />
            <SelectField
              label="District"
              value={filters.district}
              options={DISTRICTS.map((d) => ({ value: String(d), label: districtLabel(d) }))}
              onChange={(v) => patchFilters({ district: v })}
            />
            <SelectField
              label="Near school"
              value={filters.schoolId}
              options={SCHOOLS.map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => patchFilters({ schoolId: v })}
            />
            {school && (
              <Text style={[styles.hint, { color: colors.muted }]}>
                Showing properties within 2km — beyond that, distance gives no registration priority.
              </Text>
            )}
            <SliderField
              label="Budget up to"
              value={filters.maxBudget}
              minimumValue={400_000}
              maximumValue={4_000_000}
              step={50_000}
              formatValue={formatCurrency}
              onValueChange={(v) => patchFilters({ maxBudget: v })}
            />
            <SelectField
              label="Facilities, at least"
              value={filters.minFacilities}
              options={FACILITIES_ORDER.map((f) => ({ value: f, label: FACILITIES_INFO[f].title }))}
              onChange={(v) => patchFilters({ minFacilities: v })}
            />
            <SliderField
              label="MCST fee up to"
              value={filters.maxMcst}
              minimumValue={200}
              maximumValue={700}
              step={25}
              formatValue={(v) => `$${v.toFixed(0)}/mo`}
              onValueChange={(v) => patchFilters({ maxMcst: v })}
            />
            <SliderField
              label="Lease remaining, at least"
              value={filters.minLeaseYears}
              minimumValue={0}
              maximumValue={90}
              step={5}
              formatValue={(v) => (v === 0 ? 'Any' : `${v.toFixed(0)} yrs`)}
              onValueChange={(v) => patchFilters({ minLeaseYears: v })}
            />
          </View>

          <Text style={[styles.sectionLabel, { color: colors.muted }]}>
            {results.length} MATCH{results.length === 1 ? '' : 'ES'}
          </Text>
          {results.length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              No properties in the sample data meet all of these — try loosening a filter.
            </Text>
          ) : (
            <View style={{ gap: Spacing.sm }}>
              {results.map((r) => (
                <PropertyRow
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
            Sample properties for demonstration — coordinates, psf and fees are illustrative, not sourced from
            URA/HDB/MCST records.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {shortlistedProperties.length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Nothing shortlisted yet — star a property from Search to save it here.
            </Text>
          ) : (
            <>
              {shortlistedProperties.length >= 2 && (
                <Pressable onPress={() => setCompareMode((v) => !v)} style={styles.compareToggle}>
                  <Text style={{ color: colors.accentStrong, fontSize: 13, fontWeight: '700' }}>
                    {compareMode ? '✕ Close comparison' : '⇔ Compare shortlisted'}
                  </Text>
                </Pressable>
              )}
              {compareMode && shortlistedProperties.length >= 2 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
                  {shortlistedProperties.map((property) => (
                    <CompareCard key={property.id} property={property} />
                  ))}
                </ScrollView>
              ) : (
                <View style={{ gap: Spacing.sm }}>
                  {shortlistedProperties.map((property) => (
                    <PropertyRow
                      key={property.id}
                      property={property}
                      distanceKm={undefined}
                      starred
                      onToggleStar={() => toggle(property.id)}
                    />
                  ))}
                </View>
              )}
            </>
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

function PropertyRow({
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
            {DISTRICT_INFO[property.district]?.code} · {property.town} · {tenureTitle(property.tenure)}
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

function CompareCard({ property }: { property: SGProperty }) {
  const colors = useColors();
  const nearest = nearestSchools(property.location, SCHOOLS, 1)[0];
  const lease = leaseBandFor(property);

  return (
    <Link href={`/property/${property.id}`} asChild>
      <Pressable style={[styles.compareCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.compareName, { color: colors.ink }]} numberOfLines={2}>
          {property.name}
        </Text>
        <Text style={[styles.condoMeta, { color: colors.muted, marginBottom: 8 }]}>
          {DISTRICT_INFO[property.district]?.code} · {PROPERTY_TYPE_TITLE[property.type]}
        </Text>
        <CompareRow label="Tenure" value={tenureTitle(property.tenure)} />
        {property.pricePsfHistoric != null && <CompareRow label="Psf" value={`$${property.pricePsfHistoric}`} />}
        <CompareRow label="Price" value={formatCurrency(property.indicativePrice)} />
        {property.facilities && <CompareRow label="Facilities" value={FACILITIES_INFO[property.facilities].title} />}
        {property.mcstFeeMonthly != null && <CompareRow label="MCST" value={`$${property.mcstFeeMonthly}/mo`} />}
        <CompareRow label="Lease" value={lease.title} />
        {nearest && <CompareRow label="Nearest school" value={`${nearest.school.name}, ${formatKm(nearest.distanceKm)}`} />}
      </Pressable>
    </Link>
  );
}

function CompareRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.compareRow}>
      <Text style={{ color: colors.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '600' }}>{value}</Text>
    </View>
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
  compareToggle: { alignSelf: 'flex-start', marginBottom: Spacing.md },
  compareCard: {
    width: 190,
    padding: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
  compareName: { fontSize: 13, fontWeight: '700', minHeight: 32 },
  compareRow: {
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.25)',
    gap: 1,
  },
});
