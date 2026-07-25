import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { IconBadge } from '@/components/IconBadge';
import { Radii, Spacing, useColors } from '@/constants/theme';
import { useReading } from '@/context/ReadingContext';
import { ARTICLES } from '@/lib/knowledgeContent';
import { CATEGORY_INFO, KNOWLEDGE_CATEGORIES, type KnowledgeCategory } from '@/lib/models';

export default function LibraryScreen() {
  const colors = useColors();
  const { isRead, isBookmarked } = useReading();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<KnowledgeCategory | null>(null);

  const filtered = useMemo(() => {
    let items = ARTICLES;
    if (category) items = items.filter((a) => a.category === category);
    const q = search.trim().toLowerCase();
    if (q) items = items.filter((a) => a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q));
    return items;
  }, [search, category]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.searchWrap}>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={15} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search topics"
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { color: colors.ink }]}
          />
        </View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: null, title: 'All' }, ...KNOWLEDGE_CATEGORIES.map((c) => ({ id: c, title: CATEGORY_INFO[c].title }))]}
          keyExtractor={(item) => item.id ?? '__all__'}
          contentContainerStyle={{ gap: Spacing.sm, paddingVertical: Spacing.sm }}
          renderItem={({ item }) => (
            <Chip
              label={item.title}
              selected={category === item.id}
              onPress={() => setCategory((prev) => (prev === item.id ? null : (item.id as KnowledgeCategory | null)))}
            />
          )}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', marginTop: Spacing.xl }}>No articles match your search.</Text>}
        renderItem={({ item }) => (
          <Link href={`/article/${item.id}`} asChild>
            <Pressable>
              <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <IconBadge icon={CATEGORY_INFO[item.category].icon} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.ink }]}>{item.title}</Text>
                  <Text style={[styles.rowSummary, { color: colors.muted }]} numberOfLines={2}>
                    {item.summary}
                  </Text>
                </View>
                <View style={{ gap: 6, alignItems: 'flex-end' }}>
                  {isBookmarked(item.id) && <Ionicons name="bookmark" size={14} color={colors.accent} />}
                  {isRead(item.id) && <Ionicons name="checkmark-circle" size={14} color={colors.accent} />}
                </View>
              </View>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 14 },
  listContent: { padding: Spacing.lg, paddingTop: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
  },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowSummary: { fontSize: 12, marginTop: 2 },
});
