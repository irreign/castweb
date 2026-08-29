import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { IconBadge } from '@/components/IconBadge';
import { Radii, Spacing, useColors } from '@/constants/theme';
import { useProfile } from '@/context/ProfileContext';
import { useReading } from '@/context/ReadingContext';
import { CATEGORY_INFO } from '@/lib/models';
import { ARTICLES } from '@/lib/knowledgeContent';

const GREETINGS: Record<string, string> = {
  buyFirstHome: "Let's get you ready to buy",
  buyToInvest: "Let's sharpen your investing edge",
  sellOrUpgrade: "Let's get you ready to sell or move up",
  justExploring: "Let's explore, no pressure",
};

export default function HomeScreen() {
  const colors = useColors();
  const { profile } = useProfile();
  const { readIds, isRead } = useReading();

  const recommended = useMemo(() => {
    const pool =
      profile.interests.length === 0
        ? ARTICLES
        : ARTICLES.filter((a) => profile.interests.includes(a.category));
    const leveled = [...pool.filter((a) => a.level === profile.experience), ...pool.filter((a) => a.level !== profile.experience)];
    const seen = new Set<string>();
    const deduped = leveled.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
    const unread = deduped.filter((a) => !readIds.has(a.id));
    const read = deduped.filter((a) => readIds.has(a.id));
    return [...unread, ...read].slice(0, 5);
  }, [profile.interests, profile.experience, readIds]);

  const termOfTheDay = useMemo(() => {
    if (ARTICLES.length === 0) return undefined;
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000
    );
    return ARTICLES[dayOfYear % ARTICLES.length];
  }, []);

  const market = profile.market.trim();
  const subheading = market && market.toLowerCase() !== 'not sure yet' ? `Focused on ${market}` : 'Picking up where you left off';

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.greeting, { color: colors.ink }]}>{GREETINGS[profile.goal]}</Text>
      <Text style={[styles.subheading, { color: colors.muted }]}>{subheading}</Text>

      <Link href="/tools/school-priority" asChild>
        <Pressable>
          <Card style={{ backgroundColor: colors.accentWash, borderColor: colors.border, marginTop: Spacing.lg }}>
            <Text style={[styles.eyebrow, { color: colors.accentStrong }]}>NO PROPERTY SEARCH NEEDED</Text>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Check a school's P1 priority band</Text>
            <Text style={[styles.cardSummary, { color: colors.muted }]}>
              Pick a school and your area — see its registration priority band in seconds.
            </Text>
          </Card>
        </Pressable>
      </Link>

      {termOfTheDay && (
        <Link href={`/article/${termOfTheDay.id}`} asChild>
          <Pressable>
            <Card style={{ backgroundColor: colors.surface, borderColor: colors.border, marginTop: Spacing.md }}>
              <Text style={[styles.eyebrow, { color: colors.brass }]}>TODAY'S TOPIC</Text>
              <Text style={[styles.cardTitle, { color: colors.ink }]}>{termOfTheDay.title}</Text>
              <Text style={[styles.cardSummary, { color: colors.muted }]} numberOfLines={2}>
                {termOfTheDay.summary}
              </Text>
            </Card>
          </Pressable>
        </Link>
      )}

      <Text style={[styles.sectionTitle, { color: colors.ink }]}>Recommended for you</Text>
      {recommended.length === 0 ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>Add some interests in your profile to get tailored picks.</Text>
      ) : (
        <View style={{ gap: Spacing.sm }}>
          {recommended.map((item) => (
            <Link key={item.id} href={`/article/${item.id}`} asChild>
              <Pressable>
                <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <IconBadge icon={CATEGORY_INFO[item.category].icon} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.ink }]}>{item.title}</Text>
                    <Text style={[styles.rowMeta, { color: colors.muted }]}>
                      {CATEGORY_INFO[item.category].title} · {item.readMinutes} min
                    </Text>
                  </View>
                  {isRead(item.id) && <Ionicons name="checkmark-circle" size={18} color={colors.accent} />}
                </View>
              </Pressable>
            </Link>
          ))}
        </View>
      )}

      <Text style={[styles.sectionTitle, { color: colors.ink }]}>Quick tools</Text>
      <View style={styles.quickRow}>
        <QuickTool href="/tools/mortgage" icon="cash-outline" label="Affordability" />
        <QuickTool href="/tools/yield" icon="pie-chart-outline" label="Rental Yield" />
        <QuickTool href="/tools/checklist" icon="checkbox-outline" label="Checklist" />
      </View>
    </ScrollView>
  );
}

function QuickTool({ href, icon, label }: { href: Href; icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const colors = useColors();
  return (
    <Link href={href} asChild>
      <Pressable style={styles.quickToolFlex}>
        <View style={[styles.quickTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name={icon} size={22} color={colors.accentStrong} />
          <Text style={[styles.quickToolLabel, { color: colors.ink }]}>{label}</Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2 },
  greeting: { fontSize: 22, fontWeight: '800' },
  subheading: { fontSize: 13, marginTop: 2 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardSummary: { fontSize: 13, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: Spacing.xl, marginBottom: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowMeta: { fontSize: 12, marginTop: 2 },
  quickRow: { flexDirection: 'row', gap: Spacing.sm },
  quickToolFlex: { flex: 1 },
  quickTool: {
    alignItems: 'center',
    gap: Spacing.xs + 2,
    paddingVertical: Spacing.lg,
    borderRadius: Radii.lg,
    borderWidth: 1,
  },
  quickToolLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
