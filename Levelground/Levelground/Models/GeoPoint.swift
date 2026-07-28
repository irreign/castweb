import CoreLocation
import Foundation

struct GeoPoint: Codable, Equatable {
    let lat: Double
    let lon: Double

    var clCoordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    /// Great-circle distance in kilometres (haversine formula).
    func distanceKm(to other: GeoPoint) -> Double {
        let earthRadiusKm = 6371.0
        let p1 = lat * .pi / 180
        let p2 = other.lat * .pi / 180
        let dPhi = (other.lat - lat) * .pi / 180
        let dLambda = (other.lon - lon) * .pi / 180

        let a = sin(dPhi / 2) * sin(dPhi / 2)
            + cos(p1) * cos(p2) * sin(dLambda / 2) * sin(dLambda / 2)
        let c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return earthRadiusKm * c
    }
}
