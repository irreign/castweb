import SwiftUI

struct PropertyReportView: View {
    let property: SGProperty
    @EnvironmentObject var shortlistStore: ShortlistStore

    private var nearestSchools: [SchoolDistance] {
        SGSchoolData.nearest(to: property.location, limit: 4)
    }

    private var leaseBand: LeaseBand {
        property.leaseBand()
    }

    private var districtAveragePsf: Int? {
        SGPropertyData.averagePsf(inDistrict: property.district)
    }

    private static let affordDownPercent: Double = 20
    private static let affordRate: Double = 4.0
    private static let affordTermYears: Double = 25

    private var affordabilityEstimate: (loan: Double, monthly: Double) {
        let price = Double(property.indicativePrice)
        let loan = price * (1 - Self.affordDownPercent / 100)
        let monthlyRate = Self.affordRate / 100 / 12
        let n = Self.affordTermYears * 12
        guard n > 0 else { return (loan, 0) }
        if monthlyRate == 0 { return (loan, loan / n) }
        let factor = pow(1 + monthlyRate, n)
        return (loan, loan * (monthlyRate * factor) / (factor - 1))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Label("Sample data, not a real listing.", systemImage: "flask")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(Color.orange.opacity(0.12)))

                header

                if property.type == .condo {
                    priceSection
                }

                reportSection(
                    title: "School priority",
                    icon: "building.2.fill",
                    learnMoreID: "school-priority-explained"
                ) {
                    if let closest = nearestSchools.first {
                        BandBadge(band: closest.band)
                        Text(closest.band.phaseNote)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    VStack(spacing: 8) {
                        ForEach(nearestSchools) { entry in
                            SchoolDistanceRow(entry: entry)
                        }
                    }
                    .padding(.top, 4)

                    PhaseDisclosure()
                }

                reportSection(
                    title: "Lease decay",
                    icon: "hourglass",
                    learnMoreID: "lease-decay-explained"
                ) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(leaseBand.title)
                            .font(.title3.weight(.bold))
                        Spacer()
                        Text(property.tenure.title)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    LeaseBar(band: leaseBand)
                    Text(leaseBand.note)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                reportSection(title: "Affordability", icon: "banknote.fill", learnMoreID: nil) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Est. monthly payment")
                            .font(.subheadline.weight(.semibold))
                        Spacer()
                        Text(affordabilityEstimate.monthly.currencyString)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(Color.accentColor)
                    }
                    Text("Loan amount (\(Int(100 - Self.affordDownPercent))% LTV): \(affordabilityEstimate.loan.currencyString)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("Assumes \(Int(Self.affordDownPercent))% down payment, \(String(format: "%.1f", Self.affordRate))% interest, \(Int(Self.affordTermYears))-year term — adjust to your own numbers. An illustrative estimate, not a loan offer or financial advice.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    NavigationLink {
                        MortgageCalculatorView(initialPrice: Double(property.indicativePrice))
                    } label: {
                        Text("Open full calculator")
                            .font(.caption.weight(.semibold))
                    }
                }

                reportSection(title: "Coming soon", icon: "clock.arrow.circlepath", learnMoreID: nil) {
                    ComingSoonRow(title: "Transit distance", detail: "Walk time to the nearest MRT station or bus interchange.")
                }

                Text("This report uses illustrative sample data to demonstrate the idea. Before relying on the school-priority read for actual Primary 1 registration, always verify against MOE's official school search — priority bands and balloting rules can change year to year.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
            }
            .padding()
        }
        .navigationTitle(property.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    shortlistStore.toggle(property.id)
                } label: {
                    Image(systemName: shortlistStore.isShortlisted(property.id) ? "star.fill" : "star")
                        .foregroundStyle(shortlistStore.isShortlisted(property.id) ? .yellow : Color.accentColor)
                }
            }
        }
    }

    private var priceSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Price", systemImage: "dollarsign.circle.fill")
                    .font(.headline)
                Spacer()
            }

            HStack(alignment: .firstTextBaseline, spacing: 6) {
                if let psf = property.pricePsfHistoric {
                    Text("$\(psf)")
                        .font(.title3.weight(.bold).monospacedDigit())
                    Text("/ sqft, historic")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let sqft = property.unitSizeSqft {
                Text("~\(Double(property.indicativePrice).currencyString) indicative, for a ~\(sqft) sqft unit")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if let avg = districtAveragePsf, let psf = property.pricePsfHistoric {
                let delta = psf - avg
                let districtCode = SGDistrict.code(property.district)
                if abs(delta) < 25 {
                    Text("In line with the sample average for \(districtCode) ($\(avg)/sqft).")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("$\(abs(delta))/sqft \(delta > 0 ? "above" : "below") the sample average for \(districtCode) ($\(avg)/sqft).")
                        .font(.caption)
                        .foregroundStyle(delta > 0 ? .orange : .green)
                }
            }

            if let facilities = property.facilities {
                Divider()
                HStack {
                    Text("Facilities")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(facilities.title)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Color.accentColor)
                }
                Text(facilities.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let mcst = property.mcstFeeMonthly {
                Divider()
                HStack {
                    Text("MCST fee")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text("$\(mcst)/month")
                        .font(.subheadline.weight(.bold))
                }
                Text("Paid to the Management Corporation for upkeep of shared facilities and common property — separate from property tax.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemGroupedBackground)))
    }

    @ViewBuilder
    private func reportSection<Content: View>(
        title: String,
        icon: String,
        learnMoreID: String?,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(title, systemImage: icon)
                    .font(.headline)
                Spacer()
                if let id = learnMoreID {
                    NavigationLink(value: id) {
                        Text("Learn more")
                            .font(.caption.weight(.semibold))
                    }
                }
            }
            content()
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemGroupedBackground)))
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text(property.type.title)
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Color.accentColor.opacity(0.15)))
                    .foregroundStyle(Color.accentColor)
                Text("\(SGDistrict.code(property.district)) · \(property.town)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Text(property.name)
                .font(.title2.bold())
        }
    }
}

private struct BandBadge: View {
    let band: SchoolPriorityBand

    private var tint: Color {
        switch band {
        case .within1km: return .green
        case .within2km: return .orange
        case .beyond2km: return .secondary
        }
    }

    var body: some View {
        Text(band.title)
            .font(.subheadline.weight(.bold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(tint.opacity(0.15)))
            .foregroundStyle(tint)
    }
}

private struct SchoolDistanceRow: View {
    let entry: SchoolDistance

    private var tint: Color {
        switch entry.band {
        case .within1km: return .green
        case .within2km: return .orange
        case .beyond2km: return .secondary
        }
    }

    var body: some View {
        HStack {
            Circle()
                .fill(tint)
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.school.name)
                    .font(.subheadline.weight(.medium))
                Text(entry.school.area)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(String(format: "%.1f km", entry.distanceKm))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
        }
    }
}

private struct PhaseDisclosure: View {
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation { expanded.toggle() }
            } label: {
                HStack(spacing: 4) {
                    Text(expanded ? "Hide registration phases" : "See all registration phases")
                        .font(.caption.weight(.bold))
                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .font(.caption2)
                }
                .foregroundStyle(Color.accentColor)
            }
            .buttonStyle(.plain)

            if expanded {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(RegistrationPhaseData.all) { phase in
                        HStack(alignment: .top, spacing: 8) {
                            Text(phase.title)
                                .font(.caption.weight(.bold))
                                .frame(width: 130, alignment: .leading)
                            Text(phase.whoQualifies)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 6)
                        Divider()
                    }
                }
                Text("There's no fixed nationwide split of seats per phase — it varies by school and year. Some schools fill most places before Phase 2C even opens; most still have the bulk of seats open at that point. MOE publishes each school's actual Phase 2C starting vacancy count annually — that's worth more than any general rule of thumb.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.top, 6)
    }
}

private struct LeaseBar: View {
    let band: LeaseBand

    private var fraction: Double {
        switch band {
        case .notApplicable: return 1.0
        case .healthy(let years): return min(Double(years) / 99.0, 1.0)
        case .caution(let years): return min(Double(years) / 99.0, 1.0)
        case .highRisk(let years): return min(Double(years) / 99.0, 1.0)
        }
    }

    private var tint: Color {
        switch band {
        case .notApplicable, .healthy: return .green
        case .caution: return .orange
        case .highRisk: return .red
        }
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color(.tertiarySystemFill))
                Capsule().fill(tint).frame(width: proxy.size.width * fraction)
            }
        }
        .frame(height: 8)
    }
}

private struct ComingSoonRow: View {
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "circle.dashed")
                .foregroundStyle(.tertiary)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium))
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

#Preview {
    NavigationStack {
        PropertyReportView(property: SGPropertyData.all.first { $0.id == "trilinq-clementi" }!)
    }
    .environmentObject(ShortlistStore())
}
