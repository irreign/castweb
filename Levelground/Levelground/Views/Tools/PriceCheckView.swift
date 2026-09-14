import SwiftUI

struct PriceCheckView: View {
    @State private var propertyType: PropertyType?
    @State private var district: Int?

    private var districts: [Int] {
        Array(Set(SGPropertyData.all.map { $0.district })).sorted()
    }

    private var psf: Int? {
        guard propertyType == .condo, let district else { return nil }
        return SGPropertyData.averagePsf(inDistrict: district)
    }

    private var avgPrice: Int? {
        guard let propertyType, let district else { return nil }
        return SGPropertyData.averageIndicativePrice(type: propertyType, district: district)
    }

    private var hasResult: Bool { propertyType != nil && district != nil }
    private var hasData: Bool { psf != nil || avgPrice != nil }

    var body: some View {
        Form {
            Section {
                Text("Get an instant price benchmark for an area — no listing needed. Pick a property type and district to see how it compares to similar sample properties.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section {
                Picker("Property type", selection: $propertyType) {
                    Text("Choose a type").tag(PropertyType?.none)
                    ForEach([PropertyType.hdb, .condo, .landed], id: \.self) { type in
                        Text(type.title).tag(Optional(type))
                    }
                }
                Picker("District", selection: $district) {
                    Text("Choose a district").tag(Int?.none)
                    ForEach(districts, id: \.self) { d in
                        Text(SGDistrict.label(d)).tag(Optional(d))
                    }
                }
            }

            if hasResult && !hasData {
                Section {
                    Text("Not enough sample data for \(propertyType!.title.lowercased()) in \(SGDistrict.code(district!)) to show a benchmark yet.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            if hasResult && hasData {
                Section("\(propertyType!.title) in \(SGDistrict.code(district!))") {
                    if let psf {
                        HStack {
                            Text("Average psf, sample data")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Spacer()
                            Text("$\(psf)/sqft")
                                .font(.title3.weight(.heavy))
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                    if let avgPrice {
                        HStack {
                            Text("Average indicative price")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Spacer()
                            Text(Double(avgPrice).currencyString)
                                .font(.subheadline.weight(.bold))
                        }
                    }
                }
            }

            Section {
                Text("This benchmark is averaged from Levelground's small illustrative sample dataset, not from real URA caveat transactions or HDB resale records — treat it as a rough starting point, not a valuation. For a real transaction-based estimate, check URA's Realis or HDB's resale price portal directly.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Price Check")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack { PriceCheckView() }
}
