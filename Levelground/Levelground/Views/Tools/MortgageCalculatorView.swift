import SwiftUI

private let tdsrLimit: Double = 0.55
private let msrLimit: Double = 0.30

private enum LoanPropertyType: String, CaseIterable {
    case hdb, `private`

    var title: String {
        switch self {
        case .hdb: return "HDB / EC (new)"
        case .private: return "Private (condo / landed)"
        }
    }
}

struct MortgageCalculatorView: View {
    @State private var price: Double
    @State private var downPaymentPercent: Double = 20
    @State private var interestRate: Double = 4.0
    @State private var termYears: Double = 25
    @State private var propertyType: LoanPropertyType = .private
    @State private var age: Double = 35
    @State private var monthlyIncome: Double = 8_000
    @State private var monthlyDebts: Double = 0

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

    /// MAS lending limits, assuming this is a first housing loan (the common case for a
    /// first-time buyer) — a second or subsequent property loan faces stricter LTV caps.
    private var ltvCap: Double {
        (termYears > 30 || age + termYears > 65) ? 0.55 : 0.75
    }
    private var minDownPaymentPercent: Double { (1 - ltvCap) * 100 }
    private var msrCapMonthly: Double? { propertyType == .hdb ? monthlyIncome * msrLimit : nil }
    private var tdsrCapMonthly: Double { max(monthlyIncome * tdsrLimit - monthlyDebts, 0) }
    private var effectiveCapMonthly: Double {
        if let msrCapMonthly { return min(msrCapMonthly, tdsrCapMonthly) }
        return tdsrCapMonthly
    }
    private var meetsLtv: Bool { downPaymentPercent >= minDownPaymentPercent - 0.05 }
    private var meetsDebtRatio: Bool { monthlyPayment <= effectiveCapMonthly + 1 }
    private var withinLimits: Bool { meetsLtv && meetsDebtRatio }

    var body: some View {
        Form {
            Section("Property") {
                Picker("Type", selection: $propertyType) {
                    ForEach(LoanPropertyType.allCases, id: \.self) { Text($0.title).tag($0) }
                }
                LabeledStepper(label: "Price", value: $price, range: 50_000...5_000_000, step: 10_000, format: .currency)
                LabeledStepper(label: "Down payment", value: $downPaymentPercent, range: 0...90, step: 1, format: .percent)
            }

            Section("Loan") {
                LabeledStepper(label: "Interest rate", value: $interestRate, range: 0...15, step: 0.1, format: .percentFine)
                LabeledStepper(label: "Term (years)", value: $termYears, range: 5...35, step: 1, format: .years)
                LabeledStepper(label: "Your age", value: $age, range: 21...65, step: 1, format: .age)
            }

            Section("Your finances") {
                LabeledStepper(label: "Gross monthly income", value: $monthlyIncome, range: 2_000...40_000, step: 500, format: .currency)
                LabeledStepper(label: "Other monthly debt repayments", value: $monthlyDebts, range: 0...10_000, step: 100, format: .currency)
            }

            Section("Estimate") {
                ResultRow(title: "Loan amount", value: loanAmount.currencyString)
                ResultRow(title: "Monthly payment", value: monthlyPayment.currencyString, highlighted: true)
                ResultRow(title: "Total interest paid", value: totalInterest.currencyString)
                ResultRow(title: "Total paid over term", value: totalPaid.currencyString)
            }

            Section {
                Text(withinLimits ? "Within MAS limits for a first home loan" : "Outside MAS limits for a first home loan")
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .foregroundStyle(withinLimits ? .green : .red)
                    .listRowBackground((withinLimits ? Color.green : Color.red).opacity(0.12))

                ResultRow(title: "Min down payment (LTV cap)", value: "\(Int(minDownPaymentPercent.rounded()))%", flagged: !meetsLtv)
                if let msrCapMonthly {
                    ResultRow(title: "MSR cap (30% of income)", value: msrCapMonthly.currencyString)
                }
                ResultRow(title: "TDSR cap (55% of income, less debts)", value: tdsrCapMonthly.currencyString, flagged: !meetsDebtRatio)
            } header: {
                Text("MAS lending limits")
            } footer: {
                Text("Assumes this is your first home loan — a second or subsequent property loan faces a lower LTV cap. MSR (Mortgage Servicing Ratio) only applies to HDB flats and new ECs; TDSR (Total Debt Servicing Ratio) applies to all housing loans and includes your other debts.")
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
    case currency, percent, percentFine, years, age

    func string(_ value: Double) -> String {
        switch self {
        case .currency: return value.currencyString
        case .percent: return String(format: "%.0f%%", value)
        case .percentFine: return String(format: "%.1f%%", value)
        case .years: return String(format: "%.0f yrs", value)
        case .age: return String(format: "%.0f", value)
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
    var flagged: Bool = false

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
                .fontWeight(highlighted || flagged ? .bold : .regular)
                .foregroundStyle(flagged ? .red : (highlighted ? Color.accentColor : .primary))
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
