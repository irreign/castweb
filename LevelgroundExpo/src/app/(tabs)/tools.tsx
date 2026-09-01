import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IconBadge } from '@/components/IconBadge';
import { Radii, Spacing, useColors } from '@/constants/theme';

const TOOLS = [
  {
    href: '/tools/school-priority' as const,
    icon: 'school-outline' as const,
    title: 'School Priority Check',
    subtitle: "See a school's P1 registration priority band for an area — no property search needed",
  },
  {
    href: '/tools/mortgage' as const,
    icon: 'cash-outline' as const,
    title: 'Affordability & Mortgage',
    subtitle: 'Estimate your monthly payment and total interest',
  },
  {
    href: '/tools/yield' as const,
    icon: 'pie-chart-outline' as const,
    title: 'Rental Yield',
    subtitle: 'Compare gross and net yield across properties',
  },
  {
    href: '/tools/checklist' as const,
    icon: 'checkbox-outline' as const,
    title: 'Viewing Checklist',
    subtitle: "Questions to ask while you're at the property",
  },
];

export default function ToolsScreen() {
  const colors = useColors();
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      {TOOLS.map((tool) => (
        <Link key={tool.href} href={tool.href} asChild>
          <Pressable>
            <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <IconBadge icon={tool.icon} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.ink }]}>{tool.title}</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>{tool.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </View>
          </Pressable>
        </Link>
      ))}
      <Text style={[styles.footer, { color: colors.muted }]}>
        These tools give estimates to help you ask better questions — they aren't financial, legal, or property
        advice, and nothing here is a substitute for a licensed financial adviser, bank, or MOE's official guidance.
        Always confirm real numbers before committing.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
  title: { fontSize: 14, fontWeight: '600' },
  subtitle: { fontSize: 12, marginTop: 2 },
  footer: { fontSize: 12, lineHeight: 17, marginTop: Spacing.md },
});
