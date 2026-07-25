import type { GeoPoint, SGSchool, SchoolDistance, SchoolPriorityBand } from './models';

/** Great-circle distance in kilometres (haversine formula). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const earthRadiusKm = 6371.0;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dPhi = ((b.lat - a.lat) * Math.PI) / 180;
  const dLambda = ((b.lon - a.lon) * Math.PI) / 180;

  const x = Math.sin(dPhi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return earthRadiusKm * c;
}

export function bandForDistance(km: number): SchoolPriorityBand {
  if (km <= 1.0) return 'within1km';
  if (km <= 2.0) return 'within2km';
  return 'beyond2km';
}

export function nearestSchools(point: GeoPoint, schools: SGSchool[], limit = 4): SchoolDistance[] {
  return schools
    .map((school) => {
      const km = distanceKm(point, school.location);
      return { school, distanceKm: km, band: bandForDistance(km) };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}
