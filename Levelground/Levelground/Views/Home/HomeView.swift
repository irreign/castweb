import SwiftUI

struct HomeView: View {
    @EnvironmentObject var profileStore: ProfileStore
    @EnvironmentObject var readingStore: ReadingStore

    private var profile: UserProfile { profileStore.profile }

    private var recommended: [KnowledgeItem] {
        let pool = profile.interests.isEmpty
            ? KnowledgeContent.all
            : KnowledgeContent.all.filter { profile.interests.contains($0.category) }

        let leveled = pool.filter { $0.level == profile.experience } + pool.filter { $0.level != profile.experience }

        var seen = Set<String>()
        let deduped = leveled.filter { seen.insert($0.id).inserted }

        let unread = deduped.filter { !readingStore.isRead($0.id) }
        let read = deduped.filter { readingStore.isRead($0.id) }
        return Array((unread + read).prefix(5))
    }

    private var termOfTheDay: KnowledgeItem? {
        guard !KnowledgeContent.all.isEmpty else { return nil }
        let dayIndex = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 0
        return KnowledgeContent.all[dayIndex % KnowledgeContent.all.count]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header

                    if let term = termOfTheDay {
                        NavigationLink(value: term.id) {
                            TermOfTheDayCard(item: term)
                        }
                        .buttonStyle(.plain)
                    }

                    recommendedSection

                    quickToolsSection
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Levelground")
            .navigationDestination(for: String.self) { id in
                if let item = KnowledgeContent.item(id: id) {
                    ArticleDetailView(item: item)
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(greeting)
                .font(.title2.bold())
            Text(subheading)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var greeting: String {
        switch profile.goal {
        case .buyFirstHome: return "Let's get you ready to buy"
        case .buyToInvest: return "Let's sharpen your investing edge"
        case .sellOrUpgrade: return "Let's get you ready to sell or move up"
        case .justExploring: return "Let's explore, no pressure"
        }
    }

    private var subheading: String {
        let market = profile.market.trimmingCharacters(in: .whitespaces)
        if market.isEmpty || market.lowercased() == "not sure yet" {
            return "Picking up where you left off"
        }
        return "Focused on \(market)"
    }

    private var recommendedSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recommended for you")
                .font(.headline)

            if recommended.isEmpty {
                Text("Add some interests in your profile to get tailored picks.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                VStack(spacing: 10) {
                    ForEach(recommended) { item in
                        NavigationLink(value: item.id) {
                            ArticleRow(item: item, isRead: readingStore.isRead(item.id))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var quickToolsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Quick tools")
                .font(.headline)

            HStack(spacing: 12) {
                NavigationLink {
                    MortgageCalculatorView()
                } label: {
                    QuickToolCard(title: "Affordability", icon: "banknote.fill")
                }
                .buttonStyle(.plain)

                NavigationLink {
                    RentalYieldCalculatorView()
                } label: {
                    QuickToolCard(title: "Rental Yield", icon: "chart.pie.fill")
                }
                .buttonStyle(.plain)

                NavigationLink {
                    ViewingChecklistView()
                } label: {
                    QuickToolCard(title: "Checklist", icon: "checklist")
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct TermOfTheDayCard: View {
    let item: KnowledgeItem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("TODAY'S TOPIC")
                .font(.caption.bold())
                .foregroundStyle(.secondary)
            Text(item.title)
                .font(.headline)
                .foregroundStyle(.primary)
            Text(item.summary)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(LinearGradient(colors: [Color.accentColor.opacity(0.18), Color.accentColor.opacity(0.05)], startPoint: .topLeading, endPoint: .bottomTrailing))
        )
    }
}

private struct ArticleRow: View {
    let item: KnowledgeItem
    let isRead: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: item.category.icon)
                .frame(width: 32, height: 32)
                .background(Circle().fill(Color.accentColor.opacity(0.12)))
                .foregroundStyle(Color.accentColor)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                Text("\(item.category.title) · \(item.readMinutes) min")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if isRead {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemGroupedBackground)))
    }
}

private struct QuickToolCard: View {
    let title: String
    let icon: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(Color.accentColor)
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.secondarySystemGroupedBackground)))
    }
}

#Preview {
    HomeView()
        .environmentObject(ProfileStore())
        .environmentObject(ReadingStore())
}
