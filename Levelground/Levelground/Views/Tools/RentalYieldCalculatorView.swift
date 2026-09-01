import SwiftUI

struct RentalYieldCalculatorView: View {
    @State private var price: Double = 500_000
    @State private var monthlyRent: Double = 2_200
    @State private var annualExpenses: Double = 4_000

    private var annualRent: Double { monthlyRent * 12 }

    private var grossYield: Double {
        guard price > 0 else { return 0 }
        return (annualRent / price) * 100
    }

    private var netYield: Double {
        guard price > 0 else { return 0 }
        return ((annualRent - annualExpenses) / price) * 100
    }

    var body: some View {
        Form {
            Section("Property") {
                LabeledField(label: "Purchase price", value: $price, range: 50_000...5_000_000, step: 10_000)
                LabeledField(label: "Monthly rent", value: $monthlyRent, range: 0...50_000, step: 100)
                LabeledField(label: "Annual expenses", value: $annualExpenses, range: 0...100_000, step: 250)
            }

            Section("Estimate") {
                ResultRow(title: "Annual rent", value: annualRent.currencyString)
                ResultRow(title: "Gross yield", value: String(format: "%.2f%%", grossYield))
                ResultRow(title: "Net yield", value: String(format: "%.2f%%", netYield), highlighted: true)
            }

            Section {
                Text("Gross yield ignores costs; net yield subtracts annual expenses (maintenance, taxes, insurance, management, vacancy). Always compare net to net across properties.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Rental Yield")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct LabeledField: View {
    let label: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(label)
                Spacer()
                Text(value.currencyString)
                    .foregroundStyle(.secondary)
            }
            Slider(value: $value, in: range, step: step)
        }
        .padding(.vertical, 2)
    }
}

private struct ResultRow: View {
    let title: String
    let value: String
    var highlighted: Bool = false

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
                .fontWeight(highlighted ? .bold : .regular)
                .foregroundStyle(highlighted ? Color.accentColor : .primary)
        }
    }
}

#Preview {
    NavigationStack { RentalYieldCalculatorView() }
}
