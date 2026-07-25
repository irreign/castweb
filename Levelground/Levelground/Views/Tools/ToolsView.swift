import SwiftUI

struct ToolsView: View {
    var body: some View {
        NavigationStack {
            List {
                Section {
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
                } footer: {
                    Text("These tools give estimates to help you ask better questions. They aren't financial advice — always confirm real numbers with a lender or advisor before committing.")
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
