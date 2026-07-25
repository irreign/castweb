import SwiftUI

struct PropertiesView: View {
    @EnvironmentObject var shortlistStore: ShortlistStore

    private enum Mode: String, CaseIterable {
        case search = "Search"
        case shortlist = "Shortlist"
    }

    @State private var mode: Mode = .search

    // Filters
    @State private var selectedArea: String?
    @State private var selectedSchoolID: String?
    @State private var maxBudget: Double = 3_000_000
    @State private var minFacilities: FacilitiesLevel?
    @State private var maxMcstFee: Double = 700

    private var condos: [SGProperty] {
        SGPropertyData.all.filter { $0.type == .condo }
    }

    private var areas: [String] {
        Array(Set(condos.map { $0.town })).sorted()
    }

    private var selectedSchool: SGSchool? {
        guard let id = selectedSchoolID else { return nil }
        return SGSchoolData.all.first { $0.id == id }
    }

    private var filteredResults: [(property: SGProperty, distanceKm: Double?)] {
        var pool = condos
        if let area = selectedArea {
            pool = pool.filter { $0.town == area }
        }
        pool = pool.filter { $0.indicativePrice <= Int(maxBudget) }
        if let minFacilities {
            pool = pool.filter { ($0.facilities ?? .basic) >= minFacilities }
        }
        pool = pool.filter { ($0.mcstFeeMonthly ?? 0) <= Int(maxMcstFee) }

        var withDistance: [(property: SGProperty, distanceKm: Double?)] = pool.map { property in
            if let school = selectedSchool {
                return (property, property.location.distanceKm(to: school.location))
            }
            return (property, nil)
        }

        if selectedSchool != nil {
            withDistance = withDistance.filter { ($0.distanceKm ?? .infinity) <= 2.0 }
            withDistance.sort { ($0.distanceKm ?? 0) < ($1.distanceKm ?? 0) }
        } else {
            withDistance.sort { $0.property.indicativePrice < $1.property.indicativePrice }
        }
        return withDistance
    }

    private var shortlistedProperties: [SGProperty] {
        SGPropertyData.all.filter { shortlistStore.shortlistedIDs.contains($0.id) }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Mode", selection: $mode) {
                    ForEach(Mode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding()

                if mode == .search {
                    searchList
                } else {
                    shortlistList
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

    // MARK: - Search

    private var searchList: some View {
        List {
            Section("Find a condo") {
                Picker("Area", selection: $selectedArea) {
                    Text("Any").tag(String?.none)
                    ForEach(areas, id: \.self) { Text($0).tag(Optional($0)) }
                }

                Picker("Near school", selection: $selectedSchoolID) {
                    Text("Any").tag(String?.none)
                    ForEach(SGSchoolData.all) { school in
                        Text(school.name).tag(Optional(school.id))
                    }
                }
                if selectedSchool != nil {
                    Text("Showing condos within 2km — beyond that, distance gives no registration priority.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                sliderRow(label: "Budget up to", value: $maxBudget, range: 800_000...3_000_000, step: 50_000) { Double($0).currencyString }

                Picker("Facilities, at least", selection: $minFacilities) {
                    Text("Any").tag(FacilitiesLevel?.none)
                    ForEach(FacilitiesLevel.allCases, id: \.self) { level in
                        Text(level.title).tag(Optional(level))
                    }
                }

                sliderRow(label: "MCST fee up to", value: $maxMcstFee, range: 200...700, step: 25) { "$\(Int($0))/mo" }
            }

            Section("\(filteredResults.count) match\(filteredResults.count == 1 ? "" : "es")") {
                if filteredResults.isEmpty {
                    Text("No condos in the sample data meet all of these — try loosening a filter.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(filteredResults, id: \.property.id) { entry in
                        NavigationLink {
                            PropertyReportView(property: entry.property)
                        } label: {
                            CondoRow(
                                property: entry.property,
                                distanceKm: entry.distanceKm,
                                isShortlisted: shortlistStore.isShortlisted(entry.property.id),
                                onToggleStar: { shortlistStore.toggle(entry.property.id) }
                            )
                        }
                    }
                }
            } footer: {
                Text("Sample condos for demonstration — coordinates, psf and fees are illustrative, not sourced from URA/MCST records.")
            }
        }
    }

    @ViewBuilder
    private func sliderRow(
        label: String,
        value: Binding<Double>,
        range: ClosedRange<Double>,
        step: Double,
        format: @escaping (Double) -> String
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                Spacer()
                Text(format(value.wrappedValue))
                    .foregroundStyle(.secondary)
                    .font(.subheadline.monospacedDigit())
            }
            Slider(value: value, in: range, step: step)
        }
        .padding(.vertical, 2)
    }

    // MARK: - Shortlist

    private var shortlistList: some View {
        List {
            if shortlistedProperties.isEmpty {
                Text("Nothing shortlisted yet — star a condo from Search to save it here.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(shortlistedProperties) { property in
                    NavigationLink {
                        PropertyReportView(property: property)
                    } label: {
                        CondoRow(
                            property: property,
                            distanceKm: nil,
                            isShortlisted: true,
                            onToggleStar: { shortlistStore.toggle(property.id) }
                        )
                    }
                }
            }
        }
    }
}

private struct CondoRow: View {
    let property: SGProperty
    let distanceKm: Double?
    let isShortlisted: Bool
    let onToggleStar: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(property.name)
                    .font(.subheadline.weight(.semibold))
                Text("\(property.town) · \(property.tenure.title)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    if let psf = property.pricePsfHistoric {
                        Text("$\(psf)/sqft")
                            .font(.caption.monospacedDigit().weight(.medium))
                    }
                    if let facilities = property.facilities {
                        Text(facilities.title)
                            .font(.caption2.weight(.bold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.accentColor.opacity(0.15)))
                            .foregroundStyle(Color.accentColor)
                    }
                    if let mcst = property.mcstFeeMonthly {
                        Text("$\(mcst)/mo MCST")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                Text(Double(property.indicativePrice).currencyString)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 6) {
                Button(action: onToggleStar) {
                    Image(systemName: isShortlisted ? "star.fill" : "star")
                        .foregroundStyle(isShortlisted ? .yellow : .secondary)
                }
                .buttonStyle(.borderless)

                if let distanceKm {
                    Text(String(format: "%.1f km", distanceKm))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    PropertiesView()
        .environmentObject(ShortlistStore())
}
