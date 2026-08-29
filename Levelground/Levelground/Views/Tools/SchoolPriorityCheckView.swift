import SwiftUI

struct SchoolPriorityCheckView: View {
    @State private var schoolID: String?
    @State private var district: Int?
    @State private var expanded = false

    private var school: SGSchool? {
        guard let schoolID else { return nil }
        return SGSchoolData.all.first { $0.id == schoolID }
    }

    private var centroid: GeoPoint? {
        guard let district else { return nil }
        return SGDistrict.centroid[district]
    }

    private var distanceKm: Double? {
        guard let school, let centroid else { return nil }
        return school.location.distanceKm(to: centroid)
    }

    private var band: SchoolPriorityBand? {
        guard let distanceKm else { return nil }
        if distanceKm <= 1.0 { return .within1km }
        if distanceKm <= 2.0 { return .within2km }
        return .beyond2km
    }

    private var districts: [Int] {
        Array(SGDistrict.info.keys).sorted()
    }

    var body: some View {
        Form {
            Section {
                Text("Check how close an area is to a Primary 1 school priority band — no property search needed. This works standalone, before you've even started looking at homes.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section {
                Picker("School", selection: $schoolID) {
                    Text("Choose a school").tag(String?.none)
                    ForEach(SGSchoolData.all) { s in
                        Text(s.name).tag(Optional(s.id))
                    }
                }
                Picker("Your area", selection: $district) {
                    Text("Choose an area").tag(Int?.none)
                    ForEach(districts, id: \.self) { d in
                        Text(SGDistrict.label(d)).tag(Optional(d))
                    }
                }
            }

            if let school, let distanceKm, let band {
                Section {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(school.name)
                                .font(.subheadline.weight(.semibold))
                            Text(school.area)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(String(format: "%.1f km", distanceKm))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                    BandBadge(band: band)
                    Text(band.phaseNote)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                Button {
                    withAnimation { expanded.toggle() }
                } label: {
                    HStack(spacing: 4) {
                        Text(expanded ? "Hide registration phases" : "See all registration phases")
                            .font(.caption.weight(.bold))
                        Image(systemName: expanded ? "chevron.up" : "chevron.down")
                            .font(.caption2)
                    }
                }
                if expanded {
                    ForEach(RegistrationPhaseData.all) { phase in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(phase.title)
                                .font(.caption.weight(.bold))
                            Text(phase.whoQualifies)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }

            Section {
                Text("Your area here is the approximate center of the district, not your exact address — the real distance from your actual home may differ. This tool uses illustrative coordinates, not verified against MOE or OneMap. It does not collect, store, or transmit any personal or child information — everything is calculated on your device. Always verify against MOE's official school search before registration; priority bands and balloting rules can change year to year.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("School Priority Check")
        .navigationBarTitleDisplayMode(.inline)
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

#Preview {
    NavigationStack { SchoolPriorityCheckView() }
}
