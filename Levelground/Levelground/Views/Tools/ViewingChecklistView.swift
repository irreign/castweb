import SwiftUI

private struct ChecklistItem: Identifiable {
    let id: String
    let text: String
}

private let checklistItems: [ChecklistItem] = [
    ChecklistItem(id: "why-selling", text: "Asked why the seller is selling"),
    ChecklistItem(id: "time-listed", text: "Asked how long it's been listed and whether the price has changed"),
    ChecklistItem(id: "water-damage", text: "Checked ceilings, walls, and windows for water stains or dampness"),
    ChecklistItem(id: "unauthorized-work", text: "Asked about unauthorized renovations or extensions"),
    ChecklistItem(id: "signal-noise", text: "Checked mobile signal and noise levels (consider revisiting at a different time of day)"),
    ChecklistItem(id: "disputes", text: "Asked about disputes with neighbors or building management"),
    ChecklistItem(id: "included-items", text: "Confirmed exactly what's included in the sale (fixtures, fittings, appliances)"),
    ChecklistItem(id: "maintenance-history", text: "Asked for recent maintenance or repair history"),
    ChecklistItem(id: "floor-area", text: "Verified the actual floor area against the listing"),
    ChecklistItem(id: "photos", text: "Took photos of any visible defects, just in case")
]

struct ViewingChecklistView: View {
    @State private var checked: Set<String> = []

    private var progress: Double {
        checklistItems.isEmpty ? 0 : Double(checked.count) / Double(checklistItems.count)
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(checked.count) of \(checklistItems.count) checked")
                        .font(.subheadline.weight(.semibold))
                    ProgressView(value: progress)
                        .tint(.accentColor)
                }
                .padding(.vertical, 4)
            }

            Section {
                ForEach(checklistItems) { item in
                    Button {
                        toggle(item.id)
                    } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: checked.contains(item.id) ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(checked.contains(item.id) ? Color.accentColor : .secondary)
                                .font(.system(size: 20))
                            Text(item.text)
                                .foregroundStyle(.primary)
                                .multilineTextAlignment(.leading)
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                }
            } footer: {
                Text("Run through this while you're actually standing in the property — it's easy to forget half these questions once you're back home.")
            }

            if !checked.isEmpty {
                Section {
                    Button("Reset for next viewing", role: .destructive) {
                        checked.removeAll()
                    }
                }
            }
        }
        .navigationTitle("Viewing Checklist")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func toggle(_ id: String) {
        if checked.contains(id) {
            checked.remove(id)
        } else {
            checked.insert(id)
        }
    }
}

#Preview {
    NavigationStack { ViewingChecklistView() }
}
