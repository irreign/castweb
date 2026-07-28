// Singapore resident individual income tax brackets (IRAS, stable since YA2024).
// Source: https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-residency-and-tax-rates/individual-income-tax-rates
const BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 20_000, rate: 0 },
  { upTo: 30_000, rate: 0.02 },
  { upTo: 40_000, rate: 0.035 },
  { upTo: 80_000, rate: 0.07 },
  { upTo: 120_000, rate: 0.115 },
  { upTo: 160_000, rate: 0.15 },
  { upTo: 200_000, rate: 0.18 },
  { upTo: 240_000, rate: 0.19 },
  { upTo: 280_000, rate: 0.195 },
  { upTo: 320_000, rate: 0.2 },
  { upTo: 500_000, rate: 0.22 },
  { upTo: 1_000_000, rate: 0.23 },
  { upTo: Infinity, rate: 0.24 },
];

/** Marginal tax rate at a given chargeable income (approximate — ignores reliefs beyond the one being estimated). */
export function marginalRate(chargeableIncome: number): number {
  const bracket = BRACKETS.find((b) => chargeableIncome <= b.upTo);
  return bracket ? bracket.rate : 0.24;
}

export const SRS_CAP_CITIZEN_PR = 15_300;
export const CPF_CASH_TOPUP_CAP_SELF = 8_000;
export const PRIORITY_BANKING_THRESHOLD = 200_000;

/** Estimated tax saved from a relief-generating contribution (SRS or CPF cash top-up), at the user's marginal rate. */
export function estimateTaxSaved(annualIncome: number, contribution: number): number {
  return Math.round(contribution * marginalRate(annualIncome));
}

export function distanceToPriorityBanking(savings: number): number {
  return Math.max(0, PRIORITY_BANKING_THRESHOLD - savings);
}

/** Lenient parse of user-typed currency text ("$20,000", "20000", "20k") into a plain number. */
export function parseCurrencyInput(text: string): number {
  const cleaned = text.trim().toLowerCase();
  const isK = cleaned.endsWith('k');
  const digits = cleaned.replace(/[^0-9.]/g, '');
  const n = parseFloat(digits) || 0;
  return isK ? n * 1000 : n;
}

/** Comma-formatted dollar string, avoiding a dependency on Intl/toLocaleString support in Hermes. */
export function formatCurrency(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return sign + '$' + Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
