import type { SGProperty } from './models';

/**
 * Illustrative sample coordinates, psf and lease data for demo purposes — not sourced from
 * HDB/URA records. A real build should pull this from URA's REALIS/OneMap API or user-entered
 * address geocoding, and psf from actual caveat transactions rather than hand-authored numbers.
 */
export const PROPERTIES: SGProperty[] = [
  {
    id: 'dawson-queenstown',
    name: 'Dawson Road, Queenstown',
    type: 'hdb',
    town: 'Queenstown',
    tenure: { type: 'leasehold99', leaseStartYear: 2015 },
    location: { lat: 1.2967, lon: 103.8034 },
    indicativePrice: 780_000,
  },
  {
    id: 'bishan-st-near-aitong',
    name: 'Bishan Street 22',
    type: 'hdb',
    town: 'Bishan',
    tenure: { type: 'leasehold99', leaseStartYear: 1990 },
    location: { lat: 1.3506, lon: 103.83 },
    indicativePrice: 650_000,
  },
  {
    id: 'serangoon-north-hdb',
    name: 'Serangoon North Avenue 1',
    type: 'hdb',
    town: 'Serangoon',
    tenure: { type: 'leasehold99', leaseStartYear: 1985 },
    location: { lat: 1.362, lon: 103.872 },
    indicativePrice: 550_000,
  },
  {
    id: 'bukit-timah-landed',
    name: 'Bukit Timah Terrace House',
    type: 'landed',
    town: 'Bukit Timah',
    tenure: { type: 'freehold' },
    location: { lat: 1.32, lon: 103.805 },
    indicativePrice: 3_800_000,
  },
  {
    id: 'trilinq-clementi',
    name: 'The Trilinq, Clementi',
    type: 'condo',
    town: 'Clementi',
    tenure: { type: 'leasehold99', leaseStartYear: 2014 },
    location: { lat: 1.314, lon: 103.7649 },
    pricePsfHistoric: 1450,
    unitSizeSqft: 1050,
    mcstFeeMonthly: 380,
    facilities: 'full',
    indicativePrice: 1_522_500,
  },
  {
    id: 'marine-parade-condo',
    name: 'Marine Parade Freehold Condo',
    type: 'condo',
    town: 'Marine Parade',
    tenure: { type: 'freehold' },
    location: { lat: 1.302, lon: 103.905 },
    pricePsfHistoric: 2100,
    unitSizeSqft: 950,
    mcstFeeMonthly: 550,
    facilities: 'premium',
    indicativePrice: 1_995_000,
  },
  {
    id: 'sky-habitat-bishan',
    name: 'Sky Habitat, Bishan',
    type: 'condo',
    town: 'Bishan',
    tenure: { type: 'leasehold99', leaseStartYear: 2015 },
    location: { lat: 1.3555, lon: 103.848 },
    pricePsfHistoric: 1750,
    unitSizeSqft: 1100,
    mcstFeeMonthly: 480,
    facilities: 'premium',
    indicativePrice: 1_925_000,
  },
  {
    id: 'trevista-toa-payoh',
    name: 'Trevista, Toa Payoh',
    type: 'condo',
    town: 'Toa Payoh',
    tenure: { type: 'leasehold99', leaseStartYear: 2012 },
    location: { lat: 1.3345, lon: 103.847 },
    pricePsfHistoric: 1550,
    unitSizeSqft: 900,
    mcstFeeMonthly: 350,
    facilities: 'full',
    indicativePrice: 1_395_000,
  },
  {
    id: 'clement-canopy-clementi',
    name: 'The Clement Canopy, Clementi',
    type: 'condo',
    town: 'Clementi',
    tenure: { type: 'leasehold99', leaseStartYear: 2017 },
    location: { lat: 1.333, lon: 103.7745 },
    pricePsfHistoric: 1650,
    unitSizeSqft: 980,
    mcstFeeMonthly: 400,
    facilities: 'full',
    indicativePrice: 1_617_000,
  },
  {
    id: 'parc-riviera-west-coast',
    name: 'Parc Riviera, West Coast',
    type: 'condo',
    town: 'West Coast',
    tenure: { type: 'leasehold99', leaseStartYear: 2016 },
    location: { lat: 1.3115, lon: 103.7645 },
    pricePsfHistoric: 1350,
    unitSizeSqft: 1150,
    mcstFeeMonthly: 280,
    facilities: 'basic',
    indicativePrice: 1_552_500,
  },
  {
    id: 'garden-residences-serangoon',
    name: 'The Garden Residences, Serangoon',
    type: 'condo',
    town: 'Serangoon North',
    tenure: { type: 'leasehold99', leaseStartYear: 2018 },
    location: { lat: 1.358, lon: 103.8695 },
    pricePsfHistoric: 1500,
    unitSizeSqft: 1020,
    mcstFeeMonthly: 360,
    facilities: 'full',
    indicativePrice: 1_530_000,
  },
  {
    id: 'tampines-grande',
    name: 'Tampines Grande',
    type: 'condo',
    town: 'Tampines',
    tenure: { type: 'leasehold99', leaseStartYear: 2013 },
    location: { lat: 1.347, lon: 103.935 },
    pricePsfHistoric: 1250,
    unitSizeSqft: 1100,
    mcstFeeMonthly: 250,
    facilities: 'basic',
    indicativePrice: 1_375_000,
  },
  {
    id: 'nim-collection-novena',
    name: 'Nim Collection, Novena',
    type: 'condo',
    town: 'Novena',
    tenure: { type: 'freehold' },
    location: { lat: 1.3255, lon: 103.84 },
    pricePsfHistoric: 2300,
    unitSizeSqft: 850,
    mcstFeeMonthly: 600,
    facilities: 'premium',
    indicativePrice: 1_955_000,
  },
];

export function propertyById(id: string): SGProperty | undefined {
  return PROPERTIES.find((p) => p.id === id);
}

/**
 * Average historic psf among sample condos in the same town — a rough "is this psf typical"
 * reference point. With a bigger dataset this would be a real transaction-based comparable.
 */
export function averagePsf(town: string): number | undefined {
  const psfs = PROPERTIES.filter((p) => p.type === 'condo' && p.town === town && p.pricePsfHistoric != null).map(
    (p) => p.pricePsfHistoric as number
  );
  if (psfs.length === 0) return undefined;
  return Math.round(psfs.reduce((a, b) => a + b, 0) / psfs.length);
}
