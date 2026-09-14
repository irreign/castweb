import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '@/components/ProgressBar';
import { Spacing, useColors } from '@/constants/theme';

const CHECKLIST_ITEMS = [
  { id: 'why-selling', text: 'Asked why the seller is selling' },
  { id: 'time-listed', text: "Asked how long it's been listed and whether the price has changed" },
  { id: 'water-damage', text: 'Checked ceilings, walls, and windows for water stains or dampness' },
  { id: 'unauthorized-work', text: 'Asked about unauthorized renovations or extensions' },
  { id: 'signal-noise', text: 'Checked mobile signal and noise levels (consider revisiting at a different time of day)' },
  { id: 'disputes', text: 'Asked about disputes with neighbors or building management' },
  { id: 'included-items', text: "Confirmed exactly what's included in the sale (fixtures, fittings, appliances)" },
  { id: 'maintenance-history', text: 'Asked for recent maintenance or repair history' },
  { id: 'floor-area', text: 'Verified the actual floor area against the listing' },
  { id: 'photos', text: 'Took photos of any visible defects, just in case' },
];

export default function ChecklistScreen() {
  const colors = useColors();
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.progressLabel, { color: colors.ink }]}>
        {checked.size} of {CHECKLIST_ITEMS.length} checked
      </Text>
      <ProgressBar progress={checked.size / CHECKLIST_ITEMS.length} />

      <View style={{ marginTop: Spacing.lg }}>
        {CHECKLIST_ITEMS.map((item) => {
          const isChecked = checked.has(item.id);
          return (
            <Pressable
              key={item.id}
              onPress={() => toggle(item.id)}
              style={[styles.item, { borderBottomColor: colors.border }]}
            >
              <Ionicons
                name={isChecked ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={isChecked ? colors.accentStrong : colors.muted}
              />
              <Text
                style={[
                  styles.itemText,
                  { color: isChecked ? colors.muted : colors.ink },
                  isChecked && styles.itemTextChecked,
                ]}
              >
                {item.text}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.note, { color: colors.muted }]}>
        Run through this while you're actually standing in the property — it's easy to forget half these questions
        once you're back home.
      </Text>

      {checked.size > 0 && (
        <Pressable onPress={() => setChecked(new Set())} style={styles.resetBtn}>
          <Text style={{ color: colors.flag, fontWeight: '700', fontSize: 14 }}>Reset for next viewing</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2 },
  progressLabel: { fontSize: 14, fontWeight: '700', marginBottom: Spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm + 2,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemText: { flex: 1, fontSize: 14, lineHeight: 20 },
  itemTextChecked: { textDecorationLine: 'line-through' },
  note: { fontSize: 12, marginTop: Spacing.lg, lineHeight: 17 },
  resetBtn: { marginTop: Spacing.xl, alignItems: 'center' },
});
