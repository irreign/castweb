import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing, useColors } from '@/constants/theme';
import { useProfile } from '@/context/ProfileContext';
import { useReading } from '@/context/ReadingContext';
import { ARTICLES } from '@/lib/knowledgeContent';
import { CATEGORY_INFO, EXPERIENCE_INFO, GOAL_INFO } from '@/lib/models';

export default function ProfileScreen() {
  const colors = useColors();
  const { profile, resetOnboarding } = useProfile();
  const { readIds, bookmarkedIds } = useReading();

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.sectionLabel, { color: colors.muted }]}>YOUR ANSWERS</Text>
      <AnswerLine label="Goal" value={GOAL_INFO[profile.goal].title} />
      <AnswerLine label="Experience" value={EXPERIENCE_INFO[profile.experience].title} />
      <AnswerLine label="Market" value={profile.market || 'Not set'} />
      <AnswerLine
        label="Interests"
        value={profile.interests.length ? profile.interests.map((c) => CATEGORY_INFO[c].title).join(', ') : 'None selected'}
      />

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>YOUR PROGRESS</Text>
      <AnswerLine label="Articles read" value={`${readIds.size} of ${ARTICLES.length}`} />
      <AnswerLine label="Bookmarked" value={`${bookmarkedIds.size}`} />

      <Pressable style={[styles.retakeBtn, { borderColor: colors.border }]} onPress={resetOnboarding}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Retake the questions</Text>
      </Pressable>

      <Text style={[styles.footer, { color: colors.muted }]}>
        What you tell us only shapes what we show you — nothing is shared, and there's nothing to buy.
      </Text>
    </ScrollView>
  );
}

function AnswerLine({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={[styles.answerLine, { borderBottomColor: colors.border }]}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: Spacing.lg, marginBottom: Spacing.xs },
  answerLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  retakeBtn: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.sm + 4,
    borderRadius: Radii.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  footer: { fontSize: 12, lineHeight: 17, marginTop: Spacing.lg },
});
