import SwiftUI

struct ArticleDetailView: View {
    @EnvironmentObject var readingStore: ReadingStore
    let item: KnowledgeItem

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Label(item.category.title, systemImage: item.category.icon)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.accentColor)
                    Spacer()
                    Text("\(item.readMinutes) min read")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Text(item.title)
                    .font(.title.bold())

                Text(item.summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Divider()

                VStack(alignment: .leading, spacing: 14) {
                    ForEach(item.body, id: \.self) { paragraph in
                        Text(paragraph)
                            .font(.body)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding()
        }
        .navigationTitle(item.category.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    readingStore.toggleBookmark(item.id)
                } label: {
                    Image(systemName: readingStore.isBookmarked(item.id) ? "bookmark.fill" : "bookmark")
                }
            }
        }
        .onAppear {
            readingStore.markRead(item.id)
        }
    }
}

#Preview {
    NavigationStack {
        ArticleDetailView(item: KnowledgeContent.all[0])
    }
    .environmentObject(ReadingStore())
}
