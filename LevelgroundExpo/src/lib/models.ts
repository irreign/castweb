import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// ---------- Onboarding profile ----------

export type Goal = 'buyFirstHome' | 'buyToInvest' | 'sellOrUpgrade' | 'justExploring';

export const GOALS: Goal[] = ['buyFirstHome', 'buyToInvest', 'sellOrUpgrade', 'justExploring'];

export const GOAL_INFO: Record<Goal, { title: string; icon: IconName }> = {
  buyFirstHome: { title: 'Buy my first home', icon: 'home-outline' },
  buyToInvest: { title: 'Buy a property to invest', icon: 'trending-up-outline' },
  sellOrUpgrade: { title: 'Sell or upgrade', icon: 'swap-horizontal-outline' },
  justExploring: { title: 'Just exploring, no plan yet', icon: 'compass-outline' },
};

export type ExperienceLevel = 'new' | 'someExperience' | 'experienced';

export const EXPERIENCE_LEVELS: ExperienceLevel[] = ['new', 'someExperience', 'experienced'];

export const EXPERIENCE_INFO: Record<ExperienceLevel, { title: string }> = {
  new: { title: 'First time, know very little' },
  someExperience: { title: 'Done some research' },
  experienced: { title: 'Bought or sold before' },
};

export type KnowledgeCategory =
  | 'financing'
  | 'legalProcess'
  | 'valuation'
  | 'negotiation'
  | 'redFlags'
  | 'investmentMetrics'
  | 'marketCycles'
  | 'taxes'
  | 'schoolsAndLocation';

export const KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  'financing',
  'legalProcess',
  'valuation',
  'negotiation',
  'redFlags',
  'investmentMetrics',
  'marketCycles',
  'taxes',
  'schoolsAndLocation',
];

export const CATEGORY_INFO: Record<KnowledgeCategory, { title: string; icon: IconName }> = {
  financing: { title: 'Financing', icon: 'cash-outline' },
  legalProcess: { title: 'Legal & Contracts', icon: 'document-text-outline' },
  valuation: { title: 'Valuation & Pricing', icon: 'pricetag-outline' },
  negotiation: { title: 'Negotiation', icon: 'chatbubbles-outline' },
  redFlags: { title: 'Spotting Red Flags', icon: 'warning-outline' },
  investmentMetrics: { title: 'Investment Returns', icon: 'pie-chart-outline' },
  marketCycles: { title: 'Market Cycles', icon: 'pulse-outline' },
  taxes: { title: 'Taxes & Fees', icon: 'receipt-outline' },
  schoolsAndLocation: { title: 'Schools & Location', icon: 'business-outline' },
};

export interface UserProfile {
  goal: Goal;
  experience: ExperienceLevel;
  market: string;
  interests: KnowledgeCategory[];
  completedOnboarding: boolean;
}

export const DEFAULT_PROFILE: UserProfile = {
  goal: 'justExploring',
  experience: 'new',
  market: '',
  interests: [],
  completedOnboarding: false,
};

// ---------- Knowledge library ----------

export interface KnowledgeItem {
  id: string;
  title: string;
  category: KnowledgeCategory;
  level: ExperienceLevel;
  summary: string;
  body: string[];
  readMinutes: number;
}

// ---------- Geo ----------

export interface GeoPoint {
  lat: number;
  lon: number;
}

// ---------- Schools ----------

export interface SGSchool {
  id: string;
  name: string;
  area: string;
  location: GeoPoint;
}

export type SchoolPriorityBand = 'within1km' | 'within2km' | 'beyond2km';

export const BAND_INFO: Record<SchoolPriorityBand, { title: string; phaseNote: string }> = {
  within1km: {
    title: 'Within 1km',
    phaseNote:
      'Top priority in whichever phase you register in — most families with no tie to the school register in Phase 2C, where this is the strongest tier available.',
  },
  within2km: {
    title: '1km – 2km',
    phaseNote: 'Still ahead of beyond-2km applicants in your registration phase, but not ahead of anyone closer.',
  },
  beyond2km: {
    title: 'Beyond 2km',
    phaseNote: 'No distance-based edge — you compete islandwide within your phase, usually settled by ballot.',
  },
};

/** Singapore's Primary 1 registration phases, in order. Distance priority
 * (see SchoolPriorityBand) is the tiebreaker used *within* a phase when
 * that phase has more applicants for a school than places left — it isn't
 * a phase of its own, and it mostly matters in Phase 2C, since that's
 * where families with no other tie to the school register. */
export interface RegistrationPhase {
  id: string;
  title: string;
  whoQualifies: string;
}

export const REGISTRATION_PHASES: RegistrationPhase[] = [
  { id: 'phase1', title: 'Phase 1', whoQualifies: 'A sibling is currently studying at the school.' },
  {
    id: 'phase2a1',
    title: 'Phase 2A(1)',
    whoQualifies: "A parent sits on the school's board/management committee, or works at the school.",
  },
  {
    id: 'phase2a2',
    title: 'Phase 2A(2)',
    whoQualifies: "A parent is an alumnus registered with the school's alumni association.",
  },
  {
    id: 'phase2b',
    title: 'Phase 2B',
    whoQualifies:
      'A parent is a recognised community leader or school volunteer, or the child is endorsed by a religious/clan body affiliated with the school.',
  },
  {
    id: 'phase2c',
    title: 'Phase 2C',
    whoQualifies:
      "Everyone else — every remaining Singapore Citizen or PR child. This is where distance priority (1km / 1-2km / beyond) actually decides most outcomes.",
  },
  {
    id: 'phase2csupp',
    title: 'Phase 2C Supplementary',
    whoQualifies: "For children not yet placed anywhere — choose from schools that still have vacancies.",
  },
  {
    id: 'phase3',
    title: 'Phase 3',
    whoQualifies: 'Children who are not Singapore Citizens or PRs, if places remain.',
  },
];

export interface SchoolDistance {
  school: SGSchool;
  distanceKm: number;
  band: SchoolPriorityBand;
}

// ---------- Singapore districts ----------

/** Singapore's 28 postal districts, used the way local agents and buyers actually talk about area. */
export const DISTRICT_INFO: Record<number, { code: string; name: string }> = {
  1: { code: 'D01', name: 'Raffles Place, Cecil, Marina, People\'s Park' },
  2: { code: 'D02', name: 'Anson, Tanjong Pagar' },
  3: { code: 'D03', name: 'Queenstown, Tiong Bahru, Alexandra' },
  4: { code: 'D04', name: 'Telok Blangah, Harbourfront' },
  5: { code: 'D05', name: 'Pasir Panjang, Clementi, West Coast' },
  6: { code: 'D06', name: 'City Hall, Beach Road' },
  7: { code: 'D07', name: 'Bugis, Golden Mile' },
  8: { code: 'D08', name: 'Little India, Farrer Park' },
  9: { code: 'D09', name: 'Orchard, River Valley, Cairnhill' },
  10: { code: 'D10', name: 'Bukit Timah, Holland, Tanglin' },
  11: { code: 'D11', name: 'Novena, Thomson, Watten Estate' },
  12: { code: 'D12', name: 'Balestier, Toa Payoh, Serangoon' },
  13: { code: 'D13', name: 'Macpherson, Braddell' },
  14: { code: 'D14', name: 'Geylang, Eunos, Paya Lebar' },
  15: { code: 'D15', name: 'Katong, Joo Chiat, Marine Parade' },
  16: { code: 'D16', name: 'Bedok, Upper East Coast' },
  17: { code: 'D17', name: 'Loyang, Changi' },
  18: { code: 'D18', name: 'Tampines, Pasir Ris' },
  19: { code: 'D19', name: 'Hougang, Punggol, Sengkang, Serangoon Garden' },
  20: { code: 'D20', name: 'Bishan, Ang Mo Kio' },
  21: { code: 'D21', name: 'Upper Bukit Timah, Beauty World, Clementi Park' },
  22: { code: 'D22', name: 'Jurong, Boon Lay, Tuas' },
  23: { code: 'D23', name: 'Bukit Batok, Bukit Panjang, Choa Chu Kang, Hillview' },
  24: { code: 'D24', name: 'Lim Chu Kang, Tengah' },
  25: { code: 'D25', name: 'Woodlands, Kranji' },
  26: { code: 'D26', name: 'Upper Thomson, Springleaf' },
  27: { code: 'D27', name: 'Yishun, Sembawang' },
  28: { code: 'D28', name: 'Seletar, Yio Chu Kang' },
};

export function districtLabel(district: number): string {
  const info = DISTRICT_INFO[district];
  return info ? `${info.code} · ${info.name}` : `District ${district}`;
}

/**
 * Approximate district-center coordinates, for the standalone School Priority Check tool
 * only (letting someone check a school without a specific address). These are rough
 * geographic centers of each district's named area, not a real or exact address — never
 * use them as a stand-in for property search accuracy.
 */
export const DISTRICT_CENTROID: Record<number, GeoPoint> = {
  1: { lat: 1.2839, lon: 103.8517 },
  2: { lat: 1.2762, lon: 103.844 },
  3: { lat: 1.29, lon: 103.81 },
  4: { lat: 1.2653, lon: 103.8221 },
  5: { lat: 1.314, lon: 103.7649 },
  6: { lat: 1.293, lon: 103.852 },
  7: { lat: 1.299, lon: 103.856 },
  8: { lat: 1.3123, lon: 103.8547 },
  9: { lat: 1.304, lon: 103.8318 },
  10: { lat: 1.3225, lon: 103.7969 },
  11: { lat: 1.3255, lon: 103.84 },
  12: { lat: 1.3345, lon: 103.847 },
  13: { lat: 1.339, lon: 103.862 },
  14: { lat: 1.318, lon: 103.8925 },
  15: { lat: 1.302, lon: 103.905 },
  16: { lat: 1.33, lon: 103.94 },
  17: { lat: 1.36, lon: 103.98 },
  18: { lat: 1.347, lon: 103.935 },
  19: { lat: 1.37, lon: 103.89 },
  20: { lat: 1.3555, lon: 103.848 },
  21: { lat: 1.3411, lon: 103.7759 },
  22: { lat: 1.34, lon: 103.705 },
  23: { lat: 1.3496, lon: 103.749 },
  24: { lat: 1.38, lon: 103.72 },
  25: { lat: 1.436, lon: 103.786 },
  26: { lat: 1.38, lon: 103.83 },
  27: { lat: 1.4295, lon: 103.835 },
  28: { lat: 1.395, lon: 103.85 },
};

// ---------- Properties ----------

export type PropertyType = 'hdb' | 'condo' | 'landed';

export const PROPERTY_TYPE_TITLE: Record<PropertyType, string> = {
  hdb: 'HDB',
  condo: 'Condo',
  landed: 'Landed',
};

export type TenureType = 'freehold' | 'leasehold99' | 'leasehold999';

export interface Tenure {
  type: TenureType;
  leaseStartYear?: number;
}

export function tenureTitle(tenure: Tenure): string {
  switch (tenure.type) {
    case 'freehold':
      return 'Freehold';
    case 'leasehold999':
      return '999-year leasehold';
    case 'leasehold99':
      return tenure.leaseStartYear ? `99-year leasehold (from ${tenure.leaseStartYear})` : '99-year leasehold';
  }
}

export type FacilitiesLevel = 'basic' | 'full' | 'premium';

export const FACILITIES_ORDER: FacilitiesLevel[] = ['basic', 'full', 'premium'];

export const FACILITIES_INFO: Record<FacilitiesLevel, { title: string; description: string }> = {
  basic: { title: 'Basic', description: 'Pool and gym.' },
  full: {
    title: 'Full',
    description: 'Pool, gym, BBQ pits, function room, and a sports court.',
  },
  premium: {
    title: 'Premium',
    description: 'Full facilities plus concierge, multiple pools, and a landscaped clubhouse or sky terrace.',
  },
};

export function facilitiesAtLeast(level: FacilitiesLevel, min: FacilitiesLevel): boolean {
  return FACILITIES_ORDER.indexOf(level) >= FACILITIES_ORDER.indexOf(min);
}

export interface SGProperty {
  id: string;
  name: string;
  type: PropertyType;
  town: string;
  /** Singapore postal district (1–28). See DISTRICT_INFO. */
  district: number;
  tenure: Tenure;
  location: GeoPoint;
  /** Historic transacted price per square foot (SGD). Condos only. */
  pricePsfHistoric?: number;
  /** Indicative unit size backing pricePsfHistoric. Condos only. */
  unitSizeSqft?: number;
  /** Monthly MCST maintenance fee. Condos only — HDB pays S&CC instead. */
  mcstFeeMonthly?: number;
  facilities?: FacilitiesLevel;
  /** Indicative total price, for budget comparisons across all property types. */
  indicativePrice: number;
}

export type LeaseBandKind = 'notApplicable' | 'healthy' | 'caution' | 'highRisk';

export interface LeaseBand {
  kind: LeaseBandKind;
  yearsRemaining?: number;
  title: string;
  note: string;
}

export function leaseBandFor(property: SGProperty, asOfYear: number = new Date().getFullYear()): LeaseBand {
  if (property.tenure.type !== 'leasehold99' || !property.tenure.leaseStartYear) {
    return {
      kind: 'notApplicable',
      title: 'No material lease decay',
      note: "Freehold and 999-year leases don't run down in any way that affects your lifetime or financing.",
    };
  }
  const remaining = 99 - (asOfYear - property.tenure.leaseStartYear);
  if (remaining >= 60) {
    return {
      kind: 'healthy',
      yearsRemaining: remaining,
      title: `${remaining} years remaining`,
      note: 'Comfortably above the 60-year mark most banks and CPF use as a threshold — financing should be straightforward.',
    };
  }
  if (remaining >= 30) {
    return {
      kind: 'caution',
      yearsRemaining: remaining,
      title: `${remaining} years remaining`,
      note: 'Below 60 years remaining, banks typically cut the loan-to-value ratio and shorten the loan tenure, and CPF usage starts to face restrictions. Confirm the actual numbers with a bank before committing.',
    };
  }
  return {
    kind: 'highRisk',
    yearsRemaining: remaining,
    title: `${remaining} years remaining`,
    note: 'Below 30 years remaining, financing and CPF usage get significantly more restricted, and resale demand tends to be thinner. Get professional advice before proceeding.',
  };
}
