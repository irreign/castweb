import SwiftUI

struct ToolsView: View {
    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink {
                        SchoolPriorityCheckView()
                    } label: {
                        ToolRow(title: "School Priority Check", subtitle: "See a school's P1 registration priority band for an area — no property search needed", icon: "graduationcap.fill")
                    }

                    NavigationLink {
                        MortgageCalculatorView()
                    } label: {
                        ToolRow(title: "Affordability & Mortgage", subtitle: "Estimate your monthly payment and total interest", icon: "banknote.fill")
                    }

                    NavigationLink {
                        RentalYieldCalculatorView()
                    } label: {
                        ToolRow(title: "Rental Yield", subtitle: "Compare gross and net yield across properties", icon: "chart.pie.fill")
                    }

                    NavigationLink {
                        ViewingChecklistView()
                    } label: {
                        ToolRow(title: "Viewing Checklist", subtitle: "Questions to ask while you're at the property", icon: "checklist")
                    }
                } footer: {
                    Text("These tools give estimates to help you ask better questions — they aren't financial, legal, or property advice, and nothing here is a substitute for a licensed financial adviser, bank, or MOE's official guidance. Always confirm real numbers before committing.")
                }
            }
            .navigationTitle("Tools")
        }
    }
}

private struct ToolRow: View {
    let title: String
    let subtitle: String
    let icon: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .frame(width: 32, height: 32)
                .background(Circle().fill(Color.accentColor.opacity(0.12)))
                .foregroundStyle(Color.accentColor)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    ToolsView()
}
