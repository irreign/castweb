import SwiftUI

struct MortgageCalculatorView: View {
    @State private var price: Double
    @State private var downPaymentPercent: Double = 20
    @State private var interestRate: Double = 4.0
    @State private var termYears: Double = 25

    init(initialPrice: Double = 500_000) {
        _price = State(initialValue: initialPrice)
    }

    private var loanAmount: Double {
        price * (1 - downPaymentPercent / 100)
    }

    private var monthlyPayment: Double {
        let monthlyRate = interestRate / 100 / 12
        let n = termYears * 12
        guard n > 0 else { return 0 }
        if monthlyRate == 0 { return loanAmount / n }
        let factor = pow(1 + monthlyRate, n)
        return loanAmount * (monthlyRate * factor) / (factor - 1)
    }

    private var totalPaid: Double { monthlyPayment * termYears * 12 }
    private var totalInterest: Double { max(totalPaid - loanAmount, 0) }

    var body: some View {
        Form {
            Section("Property") {
                LabeledStepper(label: "Price", value: $price, range: 50_000...5_000_000, step: 10_000, format: .currency)
                LabeledStepper(label: "Down payment", value: $downPaymentPercent, range: 0...90, step: 1, format: .percent)
            }

            Section("Loan") {
                LabeledStepper(label: "Interest rate", value: $interestRate, range: 0...15, step: 0.1, format: .percentFine)
                LabeledStepper(label: "Term (years)", value: $termYears, range: 5...35, step: 1, format: .years)
            }

            Section("Estimate") {
                ResultRow(title: "Loan amount", value: loanAmount.currencyString)
                ResultRow(title: "Monthly payment", value: monthlyPayment.currencyString, highlighted: true)
                ResultRow(title: "Total interest paid", value: totalInterest.currencyString)
                ResultRow(title: "Total paid over term", value: totalPaid.currencyString)
            }

            Section {
                Text("This is a simplified estimate — it excludes taxes, insurance, and fees, and assumes a fixed rate for the full term. It's for your own reference, not financial advice or a loan offer — actual eligibility, rates and CPF usage depend on a bank's underwriting. Speak to a bank or a licensed financial adviser before committing.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Affordability")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private enum StepperFormat {
    case currency, percent, percentFine, years

    func string(_ value: Double) -> String {
        switch self {
        case .currency: return value.currencyString
        case .percent: return String(format: "%.0f%%", value)
        case .percentFine: return String(format: "%.1f%%", value)
        case .years: return String(format: "%.0f yrs", value)
        }
    }
}

private struct LabeledStepper: View {
    let label: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double
    let format: StepperFormat

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(label)
                Spacer()
                Text(format.string(value))
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

extension Double {
    var currencyString: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencySymbol = "$"
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: self)) ?? "$0"
    }
}

#Preview {
    NavigationStack { MortgageCalculatorView() }
}
