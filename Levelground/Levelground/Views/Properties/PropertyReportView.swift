import SwiftUI

struct PropertyReportView: View {
    let property: SGProperty

    private var nearestSchools: [SchoolDistance] {
        SGSchoolData.nearest(to: property.location, limit: 4)
    }

    private var leaseBand: LeaseBand {
        property.leaseBand()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header

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

                reportSection(title: "Coming soon", icon: "clock.arrow.circlepath", learnMoreID: nil) {
                    ComingSoonRow(title: "Transit distance", detail: "Walk time to the nearest MRT station or bus interchange.")
                    ComingSoonRow(title: "Price sanity check", detail: "How the asking psf compares to recent transactions nearby.")
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
                Text(property.town)
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
        PropertyReportView(property: SGPropertyData.all[1])
    }
}
