import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Spacing, useColors } from '@/constants/theme';
import { useReading } from '@/context/ReadingContext';
import { articleById } from '@/lib/knowledgeContent';
import { CATEGORY_INFO } from '@/lib/models';

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { markRead, toggleBookmark, isBookmarked } = useReading();
  const item = articleById(id);

  useEffect(() => {
    if (item) markRead(item.id);
  }, [item?.id]);

  if (!item) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.muted }}>Article not found.</Text>
      </View>
    );
  }

  const bookmarked = isBookmarked(item.id);

  return (
    <>
      <Stack.Screen
        options={{
          title: CATEGORY_INFO[item.category].title,
          headerRight: () => (
            <Pressable onPress={() => toggleBookmark(item.id)} hitSlop={10}>
              <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={colors.accent} />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
        <View style={styles.metaRow}>
          <View style={styles.tagRow}>
            <Ionicons name={CATEGORY_INFO[item.category].icon} size={13} color={colors.accentStrong} />
            <Text style={[styles.tag, { color: colors.accentStrong }]}>{CATEGORY_INFO[item.category].title}</Text>
          </View>
          <Text style={[styles.mins, { color: colors.muted }]}>{item.readMinutes} min read</Text>
        </View>

        <Text style={[styles.title, { color: colors.ink }]}>{item.title}</Text>
        <Text style={[styles.summary, { color: colors.muted }]}>{item.summary}</Text>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {item.body.map((paragraph, index) => (
          <Text key={index} style={[styles.paragraph, { color: colors.ink }]}>
            {paragraph}
          </Text>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  mins: { fontSize: 12 },
  title: { fontSize: 22, fontWeight: '800', marginTop: Spacing.sm },
  summary: { fontSize: 14, marginTop: Spacing.sm, lineHeight: 20 },
  divider: { height: 1, marginVertical: Spacing.lg },
  paragraph: { fontSize: 15, lineHeight: 23, marginBottom: Spacing.md },
});
