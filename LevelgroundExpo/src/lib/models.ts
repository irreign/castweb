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
    phaseNote: "Phase 2A(1) priority — the strongest priority tier open to non-alumni families.",
  },
  within2km: {
    title: '1km – 2km',
    phaseNote:
      "Phase 2A(1) priority doesn't apply, but you still get Phase 2B priority ahead of the general public ballot.",
  },
  beyond2km: {
    title: 'Beyond 2km',
    phaseNote: "No distance-based priority. You'd register in Phase 2C, competing island-wide by ballot.",
  },
};

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
