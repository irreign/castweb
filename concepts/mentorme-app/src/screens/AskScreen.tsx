import React, { useState } from 'react';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme';
import { useAppState } from '../state/AppState';
import {
  distanceToPriorityBanking,
  estimateTaxSaved,
  formatCurrency,
  marginalRate,
  milesCardValue,
  cashbackCardValue,
} from '../utils/finance';

const SRS_EXAMPLE_TOPUP = 6000;

type QKey = 'priority' | 'srs' | 'miles';

export default function AskScreen() {
  const c = useTheme();
  const { savings, annualIncome, cardMonthlySpend, isPro, askAnswered, freeAskLimit, markAskAnswered, setIsPro } =
    useAppState();
  const [open, setOpen] = useState<QKey | null>(null);
  const haveNumbers = savings > 0 || annualIncome > 0;

  const questions: { key: QKey; q: string }[] = [
    { key: 'priority', q: 'How far am I from Priority Banking?' },
    { key: 'srs', q: 'Should I top up my SRS this year?' },
    { key: 'miles', q: 'Is my card spend better in miles or cashback?' },
  ];

  const usedCount = askAnswered.length;
  const atFreeLimit = !isPro && usedCount >= freeAskLimit;

  function answerFor(key: QKey): string {
    if (key === 'priority') {
      if (savings === 0) return "You haven't entered your savings yet — do that on the Grow tab and I'll compute this for you.";
      const gap = distanceToPriorityBanking(savings);
      return gap === 0
        ? "You're already past the ~$200k mark most banks use for Priority Banking — worth checking your eligibility with them directly."
        : `You're ${formatCurrency(gap)} away from the ~$200k most banks ask for, based on the ${formatCurrency(savings)} you entered on Grow.`;
    }
    if (key === 'srs') {
      if (annualIncome === 0) return "You haven't entered your income yet — do that on the Grow tab and I'll compute this for you.";
      const saved = estimateTaxSaved(annualIncome, SRS_EXAMPLE_TOPUP);
      const rate = Math.round(marginalRate(annualIncome) * 1000) / 10;
      return `At your income, you're in the ${rate}% marginal bracket — topping up $${SRS_EXAMPLE_TOPUP.toLocaleString()} to SRS this year would save you an estimated ${formatCurrency(saved)} in tax. (Estimate only — SRS cap is $15,300/year for citizens & PRs.)`;
    }
    if (cardMonthlySpend === 0) return "You haven't entered your card spend yet — do that on the Cards tab and I'll compute this for you.";
    const miles = milesCardValue(cardMonthlySpend);
    const cashback = cashbackCardValue(cardMonthlySpend);
    const winner = miles >= cashback ? "Woman's World (miles)" : '365 Cashback';
    return `On your ${formatCurrency(cardMonthlySpend)}/month spend: miles are worth ${formatCurrency(miles)}, cashback is worth ${formatCurrency(cashback)}. ${winner} wins — but only if you'll actually redeem the miles, not let them expire.`;
  }

  function handleOpen(key: QKey) {
    if (open === key) {
      setOpen(null);
      return;
    }
    if (atFreeLimit && !askAnswered.includes(key)) return; // locked — don't reveal or consume another slot
    markAskAnswered(key);
    setOpen(key);
  }

  return (
    <Screen>
      <Text style={[styles.title, { color: c.ink }]}>Ask MentorMe</Text>
      <Text style={[styles.sub, { color: c.inkSoft }]}>
        Real answers computed from what you've entered — not generic tips everyone already knows.
      </Text>
      {!haveNumbers ? (
        <View style={[styles.nudge, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text style={{ color: c.inkSoft, fontSize: 12.5, lineHeight: 18 }}>
            Tip: answer the Grow tab's quick questions first — the answers below get specific once you have.
          </Text>
        </View>
      ) : null}
      {!isPro ? (
        <Text style={[styles.limitLine, { color: c.inkFaint }]}>
          {Math.max(0, freeAskLimit - usedCount)} of {freeAskLimit} free questions left
        </Text>
      ) : null}

      {questions.map(({ key, q }) => {
        const isLocked = atFreeLimit && !askAnswered.includes(key);
        return (
          <View key={key} style={{ marginTop: 10 }}>
            <TouchableOpacity
              style={[styles.qBtn, { backgroundColor: c.surface, borderColor: open === key ? c.gold : c.line }]}
              onPress={() => handleOpen(key)}
              activeOpacity={0.75}
            >
              <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13.5, flex: 1 }}>{q}</Text>
              <Text style={{ color: c.inkFaint, fontSize: 13 }}>{isLocked ? '🔒' : open === key ? '−' : '+'}</Text>
            </TouchableOpacity>
            {open === key ? (
              <View style={[styles.answer, { backgroundColor: c.surfaceSunk }]}>
                <Text style={{ color: c.inkSoft, fontSize: 13, lineHeight: 19 }}>{answerFor(key)}</Text>
              </View>
            ) : null}
          </View>
        );
      })}

      {atFreeLimit ? (
        <View style={[styles.wrap, { borderColor: c.gold, backgroundColor: c.gold + '14' }]}>
          <Text style={{ color: c.goldStrong, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, marginBottom: 6 }}>
            🔒 PRO
          </Text>
          <Text style={[styles.cardBody, { color: c.inkSoft, marginBottom: 10 }]}>
            You've used your {freeAskLimit} free questions. Unlock Pro for unlimited answers, computed the same way,
            every time.
          </Text>
          <TouchableOpacity style={[styles.unlockBtn, { backgroundColor: c.gold }]} onPress={() => setIsPro(true)} activeOpacity={0.85}>
            <Text style={styles.unlockText}>Unlock Pro (demo) →</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  sub: { fontSize: 12.5, marginBottom: 6, lineHeight: 18 },
  nudge: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  limitLine: { fontSize: 11.5, fontWeight: '700', marginTop: 8 },
  qBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, padding: 13, gap: 8 },
  answer: { borderRadius: 12, padding: 13, marginTop: 6 },
  wrap: { borderWidth: 1.5, borderRadius: 14, padding: 14, marginTop: 16 },
  cardBody: { fontSize: 13, lineHeight: 19 },
  unlockBtn: { paddingVertical: 11, borderRadius: 12, alignItems: 'center' },
  unlockText: { color: '#201404', fontWeight: '800', fontSize: 13 },
});
