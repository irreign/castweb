import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SelectField } from '@/components/SelectField';
import { Spacing, useColors } from '@/constants/theme';
import { formatKm } from '@/lib/format';
import { distanceKm } from '@/lib/geo';
import {
  BAND_INFO,
  DISTRICT_CENTROID,
  DISTRICT_INFO,
  REGISTRATION_PHASES,
  districtLabel,
  type SchoolPriorityBand,
} from '@/lib/models';
import { SCHOOLS } from '@/lib/schools';

const BAND_TINT: Record<SchoolPriorityBand, string> = {
  within1km: '#2F6F4E',
  within2km: '#C98A2E',
  beyond2km: '#8A8F86',
};

function bandFor(km: number): SchoolPriorityBand {
  if (km <= 1.0) return 'within1km';
  if (km <= 2.0) return 'within2km';
  return 'beyond2km';
}

const DISTRICTS = Object.keys(DISTRICT_INFO)
  .map(Number)
  .sort((a, b) => a - b);

export default function SchoolPriorityCheckScreen() {
  const colors = useColors();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const school = schoolId ? SCHOOLS.find((s) => s.id === schoolId) : undefined;
  const centroid = district ? DISTRICT_CENTROID[Number(district)] : undefined;
  const km = school && centroid ? distanceKm(school.location, centroid) : undefined;
  const band = km != null ? bandFor(km) : undefined;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.intro, { color: colors.muted }]}>
        Check how close an area is to a Primary 1 school priority band — no property search
        needed. This works standalone, before you've even started looking at homes.
      </Text>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SelectField
          label="School"
          value={schoolId}
          options={SCHOOLS.map((s) => ({ value: s.id, label: s.name }))}
          onChange={setSchoolId}
        />
        <SelectField
          label="Your area"
          value={district}
          options={DISTRICTS.map((d) => ({ value: String(d), label: districtLabel(d) }))}
          onChange={setDistrict}
        />
      </View>

      {school && centroid && km != null && band && (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.resultHeader}>
            <View>
              <Text style={[styles.schoolName, { color: colors.ink }]}>{school.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{school.area}</Text>
            </View>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{formatKm(km)}</Text>
          </View>
          <View style={[styles.bandBadge, { backgroundColor: `${BAND_TINT[band]}22` }]}>
            <Text style={[styles.bandBadgeText, { color: BAND_TINT[band] }]}>{BAND_INFO[band].title}</Text>
          </View>
          <Text style={[styles.note, { color: colors.muted }]}>{BAND_INFO[band].phaseNote}</Text>
        </View>
      )}

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable onPress={() => setExpanded((v) => !v)} style={styles.phaseToggle}>
          <Text style={{ color: colors.accentStrong, fontSize: 12, fontWeight: '700' }}>
            {expanded ? 'Hide' : 'See'} all registration phases
          </Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accentStrong} />
        </Pressable>
        {expanded && (
          <View style={{ marginTop: 8 }}>
            {REGISTRATION_PHASES.map((phase, index) => (
              <View
                key={phase.id}
                style={[styles.phaseRow, index === 0 && { borderTopWidth: 0 }, { borderTopColor: colors.border }]}
              >
                <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '700', width: 132 }}>{phase.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, flex: 1, lineHeight: 16 }}>{phase.whoQualifies}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Text style={[styles.disclaimer, { color: colors.muted }]}>
        Your area here is the approximate center of the district, not your exact address — the real distance from
        your actual home may differ. This tool uses illustrative coordinates, not verified against MOE or OneMap. It
        does not collect, store, or transmit any personal or child information — everything is calculated on your
        device. Always verify against MOE's official school search before registration; priority bands and
        balloting rules can change year to year.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2, gap: Spacing.md },
  intro: { fontSize: 13, lineHeight: 18 },
  card: { borderRadius: 14, borderWidth: 1, padding: Spacing.md },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  schoolName: { fontSize: 15, fontWeight: '700' },
  bandBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 6 },
  bandBadgeText: { fontSize: 13, fontWeight: '700' },
  note: { fontSize: 12, lineHeight: 17 },
  phaseToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  phaseRow: { flexDirection: 'row', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  disclaimer: { fontSize: 11, lineHeight: 16 },
});
