import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radii, Spacing, useColors } from '@/constants/theme';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  placeholder = 'Any',
  onChange,
}: {
  label: string;
  value: T | null;
  options: SelectOption<T>[];
  placeholder?: string;
  onChange: (value: T | null) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const data: { value: T | null; label: string }[] = [{ value: null, label: placeholder }, ...options];

  return (
    <>
      <Pressable style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => setOpen(true)}>
        <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
        <View style={styles.valueRow}>
          <Text style={[styles.value, { color: colors.muted }]} numberOfLines={1}>
            {selected?.label ?? placeholder}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.muted} />
        </View>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sheetTitle, { color: colors.muted }]}>{label.toUpperCase()}</Text>
            <FlatList
              data={data}
              keyExtractor={(item) => item.value ?? '__any__'}
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <Pressable
                    style={[styles.option, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.optionLabel, { color: colors.ink }]}>{item.label}</Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                  </Pressable>
                );
              }}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 14, fontWeight: '600' },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  value: { fontSize: 14, maxWidth: 180 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radii.lg,
    borderTopRightRadius: Radii.lg,
    maxHeight: '60%',
    paddingTop: Spacing.md,
  },
  sheetTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionLabel: { fontSize: 15 },
});
