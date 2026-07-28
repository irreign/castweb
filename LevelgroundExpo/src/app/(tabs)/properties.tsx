import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/Chip';
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
  type GeoPoint,
  type PropertyType,
  type SGProperty,
  type SGSchool,
} from '@/lib/models';
import { PROPERTIES, propertyById } from '@/lib/properties';
import { SCHOOLS } from '@/lib/schools';
import { loadJSON, saveJSON } from '@/lib/storage';

const DISTRICTS = Array.from(new Set(PROPERTIES.map((p) => p.district))).sort((a, b) => a - b);
const PROPERTY_TYPES: PropertyType[] = ['hdb', 'condo', 'landed'];

type SortOption = 'nearestSchool' | 'priceLowHigh' | 'priceHighLow' | 'psfLowHigh' | 'psfHighLow' | 'nameAZ';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'nearestSchool', label: 'Nearest school' },
  { value: 'priceLowHigh', label: 'Price: Low-High' },
  { value: 'priceHighLow', label: 'Price: High-Low' },
  { value: 'psfLowHigh', label: 'PSF: Low-High' },
  { value: 'psfHighLow', label: 'PSF: High-Low' },
  { value: 'nameAZ', label: 'Name A–Z' },
];

interface SearchFilters {
  propertyType: PropertyType | null;
  district: string | null;
  schoolId: string | null;
  maxBudget: number;
  minFacilities: FacilitiesLevel | null;
  maxMcst: number;
  minLeaseYears: number;
  sortOption: SortOption;
}

const DEFAULT_FILTERS: SearchFilters = {
  propertyType: null,
  district: null,
  schoolId: null,
  maxBudget: 3_000_000,
  minFacilities: null,
  maxMcst: 700,
  minLeaseYears: 0,
  sortOption: 'nearestSchool',
};

const FILTERS_KEY = 'levelground.propertySearchFilters';

interface SavedSearch {
  id: string;
  name: string;
  filters: SearchFilters;
  createdAt: number;
}

const SAVED_SEARCHES_KEY = 'levelground.savedSearches';

// Rough mainland bounding box, used only to place dots on the schematic map — not a real projection.
const SG_BOUNDS = { minLat: 1.15, maxLat: 1.47, minLon: 103.6, maxLon: 104.05 };

function projectPoint(point: GeoPoint) {
  const left = ((point.lon - SG_BOUNDS.minLon) / (SG_BOUNDS.maxLon - SG_BOUNDS.minLon)) * 100;
  const top = ((SG_BOUNDS.maxLat - point.lat) / (SG_BOUNDS.maxLat - SG_BOUNDS.minLat)) * 100;
  return { left: Math.min(96, Math.max(4, left)), top: Math.min(94, Math.max(6, top)) };
}

type Mode = 'search' | 'shortlist';
type ResultsView = 'list' | 'map';

export default function PropertiesScreen() {
  const colors = useColors();
  const { shortlistedIds, toggle, isShortlisted } = useShortlist();
  const [mode, setMode] = useState<Mode>('search');
  const [compareMode, setCompareMode] = useState(false);
  const [resultsView, setResultsView] = useState<ResultsView>('list');
  const [keyword, setKeyword] = useState('');

  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState('');

  useEffect(() => {
    loadJSON(FILTERS_KEY, DEFAULT_FILTERS).then((saved) => {
      setFilters({ ...DEFAULT_FILTERS, ...saved });
      setFiltersLoaded(true);
    });
    loadJSON<SavedSearch[]>(SAVED_SEARCHES_KEY, []).then(setSavedSearches);
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
    const q = keyword.trim().toLowerCase();
    if (q) {
      pool = pool.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.town.toLowerCase().includes(q) ||
          districtLabel(p.district).toLowerCase().includes(q)
      );
    }
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
    }

    const effectiveSort: SortOption = filters.sortOption === 'nearestSchool' && !school ? 'priceLowHigh' : filters.sortOption;
    withDistance = [...withDistance].sort((a, b) => {
      switch (effectiveSort) {
        case 'nearestSchool':
          return (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
        case 'priceLowHigh':
          return a.property.indicativePrice - b.property.indicativePrice;
        case 'priceHighLow':
          return b.property.indicativePrice - a.property.indicativePrice;
        case 'psfLowHigh':
          return (a.property.pricePsfHistoric ?? Infinity) - (b.property.pricePsfHistoric ?? Infinity);
        case 'psfHighLow': {
          const ap = a.property.pricePsfHistoric;
          const bp = b.property.pricePsfHistoric;
          if (ap == null && bp == null) return 0;
          if (ap == null) return 1;
          if (bp == null) return -1;
          return bp - ap;
        }
        case 'nameAZ':
          return a.property.name.localeCompare(b.property.name);
        default:
          return 0;
      }
    });
    return withDistance;
  }, [filters, school, keyword]);

  const shortlistedProperties = Array.from(shortlistedIds)
    .map((id) => propertyById(id))
    .filter((p): p is SGProperty => !!p);

  const handleSaveSearch = () => {
    const name = saveName.trim();
    if (!name) return;
    const entry: SavedSearch = { id: `${Date.now()}`, name, filters, createdAt: Date.now() };
    setSavedSearches((prev) => {
      const next = [...prev, entry];
      saveJSON(SAVED_SEARCHES_KEY, next);
      return next;
    });
    setSaveName('');
    setShowSaveInput(false);
  };

  const confirmDeleteSavedSearch = (saved: SavedSearch) => {
    Alert.alert(saved.name, 'Delete this saved search?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setSavedSearches((prev) => {
            const next = prev.filter((s) => s.id !== saved.id);
            saveJSON(SAVED_SEARCHES_KEY, next);
            return next;
          });
        },
      },
    ]);
  };

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
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" size={15} color={colors.muted} />
            <TextInput
              value={keyword}
              onChangeText={setKeyword}
              placeholder="Search by name or area"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { color: colors.ink }]}
            />
          </View>

          <Text style={[styles.sectionLabel, { color: colors.muted }]}>SAVED SEARCHES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm, alignItems: 'center' }}>
            {savedSearches.map((s) => (
              <Chip key={s.id} label={s.name} onPress={() => setFilters({ ...DEFAULT_FILTERS, ...s.filters })} onLongPress={() => confirmDeleteSavedSearch(s)} />
            ))}
            {showSaveInput ? (
              <View style={[styles.saveInputRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <TextInput
                  value={saveName}
                  onChangeText={setSaveName}
                  placeholder="Search name"
                  placeholderTextColor={colors.muted}
                  style={[styles.saveInput, { color: colors.ink }]}
                  autoFocus
                  onSubmitEditing={handleSaveSearch}
                />
                <Pressable onPress={handleSaveSearch} hitSlop={8}>
                  <Ionicons name="checkmark" size={18} color={colors.accentStrong} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    setShowSaveInput(false);
                    setSaveName('');
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={18} color={colors.muted} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setShowSaveInput(true)} style={[styles.addSavedChip, { borderColor: colors.border }]}>
                <Ionicons name="add" size={14} color={colors.accentStrong} />
                <Text style={{ color: colors.accentStrong, fontSize: 12, fontWeight: '700' }}>Save search</Text>
              </Pressable>
            )}
          </ScrollView>

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

          <Text style={[styles.sectionLabel, { color: colors.muted }]}>SORT BY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
            {SORT_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                selected={filters.sortOption === opt.value}
                onPress={() => patchFilters({ sortOption: opt.value })}
              />
            ))}
          </ScrollView>

          <View style={styles.resultsHeaderRow}>
            <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 0 }]}>
              {results.length} MATCH{results.length === 1 ? '' : 'ES'}
            </Text>
            {results.length > 0 && (
              <View style={[styles.viewToggle, { backgroundColor: colors.surface2 }]}>
                <ViewToggleButton label="List" active={resultsView === 'list'} onPress={() => setResultsView('list')} />
                <ViewToggleButton label="Map" active={resultsView === 'map'} onPress={() => setResultsView('map')} />
              </View>
            )}
          </View>
          {results.length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              No properties in the sample data meet all of these — try loosening a filter.
            </Text>
          ) : resultsView === 'map' ? (
            <SchematicMap results={results} school={school} />
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

function ViewToggleButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={[styles.viewToggleBtn, active && { backgroundColor: colors.surface }]}>
      <Text style={{ color: active ? colors.ink : colors.muted, fontWeight: '700', fontSize: 11 }}>{label}</Text>
    </Pressable>
  );
}

function SchematicMap({ results, school }: { results: { property: SGProperty; distanceKm?: number }[]; school?: SGSchool }) {
  const colors = useColors();
  const schoolPos = school ? projectPoint(school.location) : null;
  return (
    <View>
      <View style={[styles.mapBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        {results.map((r) => {
          const pos = projectPoint(r.property.location);
          return (
            <Link key={r.property.id} href={`/property/${r.property.id}`} asChild>
              <Pressable
                style={[
                  styles.mapDot,
                  { left: `${pos.left}%`, top: `${pos.top}%`, backgroundColor: colors.accent, borderColor: colors.surface },
                ]}
              />
            </Link>
          );
        })}
        {schoolPos && (
          <View
            style={[
              styles.mapSchoolDot,
              { left: `${schoolPos.left}%`, top: `${schoolPos.top}%`, borderColor: colors.ink },
            ]}
          />
        )}
      </View>
      <Text style={[styles.mapLegend, { color: colors.muted }]}>
        Schematic layout by coordinates — approximate, not to scale. Cross-check with a real map before visiting.
        {school ? ' Diamond marks the selected school.' : ''}
      </Text>
    </View>
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 14 },
  saveInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.md,
    height: 34,
  },
  saveInput: { fontSize: 13, minWidth: 100 },
  addSavedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.md,
    height: 34,
  },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  filterCard: { borderRadius: Radii.lg, borderWidth: 1, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  hint: { fontSize: 11, lineHeight: 15, marginTop: -4, marginBottom: Spacing.sm },
  footer: { fontSize: 11, lineHeight: 16, marginTop: Spacing.lg },
  resultsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  viewToggle: { flexDirection: 'row', borderRadius: Radii.sm, padding: 2, gap: 2 },
  viewToggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radii.sm - 2 },
  mapBox: {
    height: 260,
    borderRadius: Radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  mapDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, marginLeft: -6, marginTop: -6, borderWidth: 2 },
  mapSchoolDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    marginLeft: -7,
    marginTop: -7,
    borderWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
  mapLegend: { fontSize: 11, lineHeight: 15, marginTop: Spacing.sm },
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
