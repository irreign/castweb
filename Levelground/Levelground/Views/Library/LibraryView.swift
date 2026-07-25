import SwiftUI

struct LibraryView: View {
    @EnvironmentObject var readingStore: ReadingStore
    @State private var searchText = ""
    @State private var selectedCategory: KnowledgeCategory?

    private var filtered: [KnowledgeItem] {
        var items = KnowledgeContent.all
        if let category = selectedCategory {
            items = items.filter { $0.category == category }
        }
        if !searchText.trimmingCharacters(in: .whitespaces).isEmpty {
            let query = searchText.lowercased()
            items = items.filter {
                $0.title.lowercased().contains(query) || $0.summary.lowercased().contains(query)
            }
        }
        return items
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    categoryFilterRow

                    VStack(spacing: 10) {
                        ForEach(filtered) { item in
                            NavigationLink(value: item.id) {
                                LibraryRow(item: item, isRead: readingStore.isRead(item.id), isBookmarked: readingStore.isBookmarked(item.id))
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if filtered.isEmpty {
                        Text("No articles match your search.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 40)
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Library")
            .searchable(text: $searchText, prompt: "Search topics")
            .navigationDestination(for: String.self) { id in
                if let item = KnowledgeContent.item(id: id) {
                    ArticleDetailView(item: item)
                }
            }
        }
    }

    private var categoryFilterRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                CategoryChip(title: "All", isSelected: selectedCategory == nil) {
                    selectedCategory = nil
                }
                ForEach(KnowledgeCategory.allCases) { category in
                    CategoryChip(title: category.title, isSelected: selectedCategory == category) {
                        selectedCategory = (selectedCategory == category) ? nil : category
                    }
                }
            }
        }
    }
}

private struct CategoryChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Capsule().fill(isSelected ? Color.accentColor : Color(.secondarySystemGroupedBackground)))
                .foregroundStyle(isSelected ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }
}

private struct LibraryRow: View {
    let item: KnowledgeItem
    let isRead: Bool
    let isBookmarked: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: item.category.icon)
                .frame(width: 32, height: 32)
                .background(Circle().fill(Color.accentColor.opacity(0.12)))
                .foregroundStyle(Color.accentColor)

            VStack(alignment: .leading, spacing: 3) {
                Text(item.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(item.summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer(minLength: 8)

            VStack(spacing: 6) {
                if isBookmarked {
                    Image(systemName: "bookmark.fill").foregroundStyle(Color.accentColor)
                }
                if isRead {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                }
            }
            .font(.caption)
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemGroupedBackground)))
    }
}

#Preview {
    LibraryView().environmentObject(ReadingStore())
}
