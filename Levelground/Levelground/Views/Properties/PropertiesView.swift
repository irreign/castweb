import MapKit
import SwiftUI

struct PropertiesView: View {
    @EnvironmentObject var shortlistStore: ShortlistStore

    private enum Mode: String, CaseIterable {
        case search = "Search"
        case shortlist = "Shortlist"
    }

    private enum ResultsView {
        case list, map
    }

    @State private var mode: Mode = .search
    @State private var compareMode = false
    @State private var filters = PropertySearchFilters.default
    @State private var filtersLoaded = false
    @State private var keyword = ""
    @State private var resultsView: ResultsView = .list
    @State private var selectedPropertyID: String?

    @State private var savedSearches: [SavedPropertySearch] = []
    @State private var showSaveSearchAlert = false
    @State private var saveSearchName = ""

    private var districts: [Int] {
        Array(Set(SGPropertyData.all.map { $0.district })).sorted()
    }

    private var selectedSchool: SGSchool? {
        guard let id = filters.schoolID else { return nil }
        return SGSchoolData.all.first { $0.id == id }
    }

    private var filteredResults: [(property: SGProperty, distanceKm: Double?)] {
        var pool = SGPropertyData.all
        if let propertyType = filters.propertyType {
            pool = pool.filter { $0.type == propertyType }
        }
        if let district = filters.district {
            pool = pool.filter { $0.district == district }
        }
        let query = keyword.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !query.isEmpty {
            pool = pool.filter { property in
                property.name.lowercased().contains(query)
                    || property.town.lowercased().contains(query)
                    || SGDistrict.label(property.district).lowercased().contains(query)
            }
        }
        pool = pool.filter { $0.indicativePrice <= Int(filters.maxBudget) }
        if let minFacilities = filters.minFacilities {
            pool = pool.filter { ($0.facilities ?? .basic) >= minFacilities }
        }
        pool = pool.filter { ($0.mcstFeeMonthly ?? 0) <= Int(filters.maxMcstFee) }
        if filters.minLeaseYears > 0 {
            pool = pool.filter { property in
                let band = property.leaseBand()
                switch band {
                case .notApplicable: return true
                case .healthy(let years), .caution(let years), .highRisk(let years):
                    return Double(years) >= filters.minLeaseYears
                }
            }
        }

        var withDistance: [(property: SGProperty, distanceKm: Double?)] = pool.map { property in
            if let school = selectedSchool {
                return (property, property.location.distanceKm(to: school.location))
            }
            return (property, nil)
        }

        if selectedSchool != nil {
            withDistance = withDistance.filter { ($0.distanceKm ?? .infinity) <= 2.0 }
        }

        let effectiveSort: PropertySortOption = (filters.sortOption == .nearestSchool && selectedSchool == nil) ? .priceLowHigh : filters.sortOption
        switch effectiveSort {
        case .nearestSchool:
            withDistance.sort { ($0.distanceKm ?? 0) < ($1.distanceKm ?? 0) }
        case .priceLowHigh:
            withDistance.sort { $0.property.indicativePrice < $1.property.indicativePrice }
        case .priceHighLow:
            withDistance.sort { $0.property.indicativePrice > $1.property.indicativePrice }
        case .psfLowHigh:
            withDistance.sort { ($0.property.pricePsfHistoric ?? Int.max) < ($1.property.pricePsfHistoric ?? Int.max) }
        case .psfHighLow:
            withDistance.sort { lhs, rhs in
                switch (lhs.property.pricePsfHistoric, rhs.property.pricePsfHistoric) {
                case (nil, nil): return false
                case (nil, _): return false
                case (_, nil): return true
                case let (l?, r?): return l > r
                }
            }
        case .nameAZ:
            withDistance.sort { $0.property.name < $1.property.name }
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
                    shortlistBody
                }
            }
            .navigationTitle("Properties")
            .navigationDestination(for: String.self) { id in
                if let item = KnowledgeContent.item(id: id) {
                    ArticleDetailView(item: item)
                }
            }
            .onAppear {
                if !filtersLoaded {
                    filters = PropertySearchFilters.load()
                    savedSearches = SavedSearchStore.load()
                    filtersLoaded = true
                }
            }
            .onChange(of: filters) { _, newValue in
                if filtersLoaded { newValue.save() }
            }
            .alert("Save Search", isPresented: $showSaveSearchAlert) {
                TextField("Search name", text: $saveSearchName)
                Button("Save") {
                    let name = saveSearchName.trimmingCharacters(in: .whitespaces)
                    guard !name.isEmpty else { return }
                    savedSearches.append(SavedPropertySearch(name: name, filters: filters))
                    SavedSearchStore.save(savedSearches)
                    saveSearchName = ""
                }
                Button("Cancel", role: .cancel) { saveSearchName = "" }
            }
        }
    }

    // MARK: - Search

    private var searchList: some View {
        List {
            Section {
                Label {
                    Text("Sample data — these are illustrative properties, not real listings. Built to show how the tools work.")
                        .font(.caption.weight(.semibold))
                } icon: {
                    Image(systemName: "flask")
                }
                .foregroundStyle(.orange)
                .listRowBackground(Color.orange.opacity(0.12))
            }

            Section("Saved searches") {
                Button {
                    showSaveSearchAlert = true
                } label: {
                    Label("Save current search", systemImage: "plus.circle")
                }
                ForEach(savedSearches) { saved in
                    Button {
                        filters = saved.filters
                    } label: {
                        HStack {
                            Text(saved.name)
                                .foregroundStyle(.primary)
                            Spacer()
                            Image(systemName: "arrow.uturn.right.circle")
                                .foregroundStyle(.secondary)
                        }
                    }
                    .swipeActions {
                        Button("Delete", role: .destructive) {
                            savedSearches.removeAll { $0.id == saved.id }
                            SavedSearchStore.save(savedSearches)
                        }
                    }
                }
            }

            Section("Find a property") {
                Picker("Type", selection: $filters.propertyType) {
                    Text("Any").tag(PropertyType?.none)
                    ForEach([PropertyType.hdb, .condo, .landed], id: \.self) { type in
                        Text(type.title).tag(Optional(type))
                    }
                }

                Picker("District", selection: $filters.district) {
                    Text("Any").tag(Int?.none)
                    ForEach(districts, id: \.self) { district in
                        Text(SGDistrict.label(district)).tag(Optional(district))
                    }
                }

                Picker("Near school", selection: $filters.schoolID) {
                    Text("Any").tag(String?.none)
                    ForEach(SGSchoolData.all) { school in
                        Text(school.name).tag(Optional(school.id))
                    }
                }
                if selectedSchool != nil {
                    Text("Showing properties within 2km — beyond that, distance gives no registration priority.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                sliderRow(label: "Budget up to", value: $filters.maxBudget, range: 400_000...4_000_000, step: 50_000) { Double($0).currencyString }

                Picker("Facilities, at least", selection: $filters.minFacilities) {
                    Text("Any").tag(FacilitiesLevel?.none)
                    ForEach(FacilitiesLevel.allCases, id: \.self) { level in
                        Text(level.title).tag(Optional(level))
                    }
                }

                sliderRow(label: "MCST fee up to", value: $filters.maxMcstFee, range: 200...700, step: 25) { "$\(Int($0))/mo" }

                sliderRow(label: "Lease remaining, at least", value: $filters.minLeaseYears, range: 0...90, step: 5) { $0 == 0 ? "Any" : "\(Int($0)) yrs" }

                Picker("Sort by", selection: $filters.sortOption) {
                    ForEach(PropertySortOption.allCases, id: \.self) { option in
                        Text(option.title).tag(option)
                    }
                }
            }

            Section {
                Picker("View", selection: $resultsView) {
                    Text("List").tag(ResultsView.list)
                    Text("Map").tag(ResultsView.map)
                }
                .pickerStyle(.segmented)
                .padding(.vertical, 4)
                .listRowSeparator(.hidden)

                if filteredResults.isEmpty {
                    Text("No properties in the sample data meet all of these — try loosening a filter.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else if resultsView == .map {
                    PropertyMapView(results: filteredResults, school: selectedSchool, selection: $selectedPropertyID)
                        .frame(height: 320)
                        .listRowInsets(EdgeInsets())

                    if let selectedPropertyID, let entry = filteredResults.first(where: { $0.property.id == selectedPropertyID }) {
                        NavigationLink {
                            PropertyReportView(property: entry.property)
                        } label: {
                            PropertyRow(
                                property: entry.property,
                                distanceKm: entry.distanceKm,
                                isShortlisted: shortlistStore.isShortlisted(entry.property.id),
                                onToggleStar: { shortlistStore.toggle(entry.property.id) }
                            )
                        }
                    }
                } else {
                    ForEach(filteredResults, id: \.property.id) { entry in
                        NavigationLink {
                            PropertyReportView(property: entry.property)
                        } label: {
                            PropertyRow(
                                property: entry.property,
                                distanceKm: entry.distanceKm,
                                isShortlisted: shortlistStore.isShortlisted(entry.property.id),
                                onToggleStar: { shortlistStore.toggle(entry.property.id) }
                            )
                        }
                    }
                }
            } header: {
                Text("\(filteredResults.count) match\(filteredResults.count == 1 ? "" : "es")")
            } footer: {
                Text("Sample properties for demonstration — coordinates, psf and fees are illustrative, not sourced from URA/HDB/MCST records.")
            }
        }
        .searchable(text: $keyword, prompt: "Search by name or area")
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

    private var shortlistBody: some View {
        List {
            if shortlistedProperties.isEmpty {
                Text("Nothing shortlisted yet — star a property from Search to save it here.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                if shortlistedProperties.count >= 2 {
                    Button(compareMode ? "✕ Close comparison" : "⇔ Compare shortlisted") {
                        compareMode.toggle()
                    }
                }

                if compareMode && shortlistedProperties.count >= 2 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: 12) {
                            ForEach(shortlistedProperties) { property in
                                NavigationLink {
                                    PropertyReportView(property: property)
                                } label: {
                                    CompareCard(property: property)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                } else {
                    ForEach(shortlistedProperties) { property in
                        NavigationLink {
                            PropertyReportView(property: property)
                        } label: {
                            PropertyRow(
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
}

private struct PropertyMapView: View {
    let results: [(property: SGProperty, distanceKm: Double?)]
    let school: SGSchool?
    @Binding var selection: String?

    @State private var cameraPosition = MapCameraPosition.region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 1.35, longitude: 103.82),
            span: MKCoordinateSpan(latitudeDelta: 0.35, longitudeDelta: 0.35)
        )
    )

    var body: some View {
        Map(position: $cameraPosition, selection: $selection) {
            ForEach(results, id: \.property.id) { entry in
                Marker(entry.property.name, coordinate: entry.property.location.clCoordinate)
                    .tag(entry.property.id)
            }
            if let school {
                Marker(school.name, systemImage: "graduationcap.fill", coordinate: school.location.clCoordinate)
                    .tint(.blue)
            }
        }
        .mapStyle(.standard)
    }
}

private struct PropertyRow: View {
    let property: SGProperty
    let distanceKm: Double?
    let isShortlisted: Bool
    let onToggleStar: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(property.name)
                    .font(.subheadline.weight(.semibold))
                Text("\(SGDistrict.code(property.district)) · \(property.town) · \(property.tenure.title)")
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

private struct CompareCard: View {
    let property: SGProperty

    private var nearest: SchoolDistance? {
        SGSchoolData.nearest(to: property.location, limit: 1).first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(property.name)
                .font(.caption.weight(.bold))
                .foregroundStyle(.primary)
                .frame(minHeight: 30, alignment: .top)
                .multilineTextAlignment(.leading)
            Text("\(SGDistrict.code(property.district)) · \(property.type.title)")
                .font(.caption2)
                .foregroundStyle(.secondary)

            compareRow("Tenure", property.tenure.title)
            if let psf = property.pricePsfHistoric {
                compareRow("Psf", "$\(psf)")
            }
            compareRow("Price", Double(property.indicativePrice).currencyString)
            if let facilities = property.facilities {
                compareRow("Facilities", facilities.title)
            }
            if let mcst = property.mcstFeeMonthly {
                compareRow("MCST", "$\(mcst)/mo")
            }
            compareRow("Lease", property.leaseBand().title)
            if let nearest {
                compareRow("Nearest school", "\(nearest.school.name), \(String(format: "%.1f km", nearest.distanceKm))")
            }
        }
        .padding(12)
        .frame(width: 190, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemGroupedBackground)))
    }

    @ViewBuilder
    private func compareRow(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption.weight(.semibold))
        }
        .padding(.top, 6)
        .overlay(alignment: .top) {
            Divider()
        }
    }
}

#Preview {
    PropertiesView()
        .environmentObject(ShortlistStore())
}
