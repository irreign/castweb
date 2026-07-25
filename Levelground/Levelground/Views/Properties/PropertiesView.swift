import SwiftUI

struct PropertiesView: View {
    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(SGPropertyData.all) { property in
                        NavigationLink {
                            PropertyReportView(property: property)
                        } label: {
                            PropertyRow(property: property)
                        }
                    }
                } footer: {
                    Text("Sample properties for demonstration. Coordinates and lease data are illustrative, not sourced from HDB/URA records — a real build would pull this from URA/OneMap or a geocoded address you enter.")
                }
            }
            .navigationTitle("Properties")
            .navigationDestination(for: String.self) { id in
                if let item = KnowledgeContent.item(id: id) {
                    ArticleDetailView(item: item)
                }
            }
        }
    }
}

private struct PropertyRow: View {
    let property: SGProperty

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(property.name)
                    .font(.subheadline.weight(.semibold))
                HStack(spacing: 6) {
                    Text(property.type.title)
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.accentColor.opacity(0.15)))
                        .foregroundStyle(Color.accentColor)
                    Text(property.town)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("· \(property.tenure.title)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    PropertiesView()
}
