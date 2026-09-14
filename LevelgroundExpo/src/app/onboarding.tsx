import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressBar } from '@/components/ProgressBar';
import { Radii, Spacing, useColors } from '@/constants/theme';
import { useProfile } from '@/context/ProfileContext';
import {
  DEFAULT_PROFILE,
  EXPERIENCE_INFO,
  EXPERIENCE_LEVELS,
  GOAL_INFO,
  GOALS,
  KNOWLEDGE_CATEGORIES,
  CATEGORY_INFO,
  type IconName,
  type KnowledgeCategory,
  type UserProfile,
} from '@/lib/models';

const TOTAL_STEPS = 4;
const MARKET_SUGGESTIONS = ['Singapore', 'United States', 'United Kingdom', 'Not sure yet'];

export default function OnboardingScreen() {
  const colors = useColors();
  const { setProfile } = useProfile();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<UserProfile>(DEFAULT_PROFILE);

  const finish = () => {
    setProfile({ ...draft, completedOnboarding: true });
    router.replace('/');
  };

  const toggleInterest = (category: KnowledgeCategory) => {
    setDraft((prev) => ({
      ...prev,
      interests: prev.interests.includes(category)
        ? prev.interests.filter((c) => c !== category)
        : [...prev.interests, category],
    }));
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <View style={styles.progressWrap}>
        <ProgressBar progress={(step + 1) / TOTAL_STEPS} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {step === 0 && (
          <Step title="What brings you here?" subtitle="We'll tailor what you see based on your answer.">
            {GOALS.map((goal) => (
              <SelectableRow
                key={goal}
                icon={GOAL_INFO[goal].icon}
                label={GOAL_INFO[goal].title}
                selected={draft.goal === goal}
                onPress={() => setDraft((prev) => ({ ...prev, goal }))}
              />
            ))}
          </Step>
        )}

        {step === 1 && (
          <Step title="How much do you already know?" subtitle="No wrong answers — this just sets the starting difficulty.">
            {EXPERIENCE_LEVELS.map((level) => (
              <SelectableRow
                key={level}
                icon="speedometer-outline"
                label={EXPERIENCE_INFO[level].title}
                selected={draft.experience === level}
                onPress={() => setDraft((prev) => ({ ...prev, experience: level }))}
              />
            ))}
          </Step>
        )}

        {step === 2 && (
          <Step title="Where are you looking?" subtitle="Optional — helps us frame examples closer to your market.">
            <TextInput
              value={draft.market}
              onChangeText={(market) => setDraft((prev) => ({ ...prev, market }))}
              placeholder="e.g. Singapore, London, anywhere"
              placeholderTextColor={colors.muted}
              style={[styles.input, { borderColor: colors.border, color: colors.ink, backgroundColor: colors.surface }]}
            />
            <View style={styles.suggestionWrap}>
              {MARKET_SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  onPress={() => setDraft((prev) => ({ ...prev, market: suggestion }))}
                  style={[
                    styles.suggestionChip,
                    {
                      backgroundColor: draft.market === suggestion ? colors.accentWash : colors.surface,
                      borderColor: draft.market === suggestion ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          </Step>
        )}

        {step === 3 && (
          <Step title="What's on your mind most?" subtitle="Pick as many as you like — we'll surface these topics first.">
            {KNOWLEDGE_CATEGORIES.map((category) => (
              <SelectableRow
                key={category}
                icon={CATEGORY_INFO[category].icon}
                label={CATEGORY_INFO[category].title}
                selected={draft.interests.includes(category)}
                onPress={() => toggleInterest(category)}
              />
            ))}
          </Step>
        )}
      </ScrollView>

      <View style={styles.navBar}>
        {step > 0 && (
          <Pressable style={[styles.backBtn, { borderColor: colors.border }]} onPress={() => setStep((s) => s - 1)}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>Back</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable
          style={[styles.nextBtn, { backgroundColor: colors.accent }]}
          onPress={() => (step === TOTAL_STEPS - 1 ? finish() : setStep((s) => s + 1))}
        >
          <Text style={styles.nextBtnLabel}>{step === TOTAL_STEPS - 1 ? 'Get started' : 'Next'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Step({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View>
      <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
      <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>{children}</View>
    </View>
  );
}

function SelectableRow({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        {
          backgroundColor: selected ? colors.accentWash : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
        },
      ]}
    >
      <Ionicons name={icon} size={18} color={selected ? colors.accentStrong : colors.muted} style={{ width: 26 }} />
      <Text style={[styles.rowLabel, { color: colors.ink }]}>{label}</Text>
      {selected && <Ionicons name="checkmark-circle" size={20} color={colors.accentStrong} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  progressWrap: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xl },
  title: { fontSize: 22, fontWeight: '800', marginTop: Spacing.lg },
  subtitle: { fontSize: 14, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1.5,
  },
  rowLabel: { fontSize: 15, fontWeight: '500', flex: 1 },
  input: {
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: 15,
  },
  suggestionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  suggestionChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm - 1,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  backBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
  nextBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm + 4,
    borderRadius: Radii.md,
  },
  nextBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
