export type Category = 'income' | 'commitment' | 'reward';

export const stations = [
  { key: 'starting_out', name: 'Starting Out', category: 'income' as Category },
  { key: 'first_card', name: 'First Card', category: 'reward' as Category },
  { key: 'new_parents', name: 'New Parents', category: 'commitment' as Category },
  { key: 'twins_arrived', name: 'Twins Arrived', category: 'interchange' as const, current: true },
  { key: 'priority_banking', name: 'Priority Banking', category: 'reward' as Category },
  { key: 'school_years', name: 'School Years', category: 'commitment' as Category },
  { key: 'career_peak', name: 'Career Peak', category: 'income' as Category },
];

export const activeCards = [
  {
    kicker: 'Commitment — Twins arrived',
    body: 'Two dependents at once means real ongoing costs — diapers, childcare and insurance premiums typically double. Worth budgeting a buffer now, before the squeeze later.',
    cta: 'See a twins budget guide',
    variant: 'commitment' as const,
    goesTo: 'StationDetail' as const,
  },
  {
    kicker: 'Reward — Priority Banking',
    body: "Your income band suggests you may already be close to the ~$200k in deposits/investments most banks ask for. We can't see your actual balance — worth a quick check with your bank.",
    cta: 'See what that unlocks',
    variant: 'default' as const,
  },
  {
    kicker: 'Renewal reminder',
    body: 'Your OCBC 365 fee waiver ends in 19 days — spend $888 in the next 3 weeks to keep it free.',
    cta: 'Got it',
    variant: 'alert' as const,
  },
];

export const twinsGuide = {
  tips: [
    { text: 'Stagger feeds by 30–45 min so you’re never doing both at once', gold: false },
    { text: 'Batch-prep bottles once night feeds hit 3am', gold: false },
    { text: 'Baby Bonus & Child Development Account apply per child — claim both', gold: true },
    { text: 'A twins parent group beats generic advice — shared experience matters', gold: false },
  ],
};

export const enrollments = [
  {
    name: "DBS Woman's World Card",
    status: 'active' as const,
    signedUp: '12 Mar 2025',
    gift: '20,000 miles',
  },
  {
    name: 'Citi Rewards Card',
    status: 'cancelled' as const,
    cancelled: '10 Feb 2025',
    gift: '16,000 miles',
    reactivateFrom: '10 Feb 2026',
  },
];

export const cardOffers = [
  {
    name: 'HSBC Revolution',
    ends: 'Ends 31 Jul',
    gift: 'S$400 cash or 6,140 points, plus a shot at a 10g gold bar',
    meta: 'Min spend $500 by end of following month · no annual fee',
  },
  {
    name: 'OCBC 90°N Visa',
    ends: 'Ends 2 Aug',
    gift: '$400 cash, 25,000 Max Miles, or a Dyson Airstrait',
    meta: 'Min spend $400 within 30 days',
  },
  {
    name: 'UOB One',
    ends: 'Ends 30 Sep',
    gift: "Up to 20% quarterly cashback (McDonald's, Grab, Shopee, SimplyGo, groceries) + $100 Samsung e-voucher",
    meta: 'Min spend $1,000 in first month',
  },
  {
    name: 'Amex KrisFlyer',
    ends: "Ends 31 Jan '27",
    gift: '16,000 miles + 2,200 base miles on local spend',
    meta: 'Min spend $2,000 within 90 days',
  },
  {
    name: 'Citi Rewards Card',
    ends: 'Ongoing',
    gift: 'S$420 cash or 16,000 miles',
    meta: 'Min spend $500 within 30 days',
  },
  {
    name: 'DBS Altitude (code ALTS38)',
    ends: 'Ongoing',
    gift: '38,000 bonus miles',
    meta: '$196.20 annual fee · spend $800 within 60 days',
  },
  {
    name: 'StanChart Visa Infinite',
    ends: 'Ongoing',
    gift: '50,000 bonus miles',
    meta: '$599.50 annual fee · spend $2,000 within 60 days',
  },
];

export const milesVsCashback = [
  { card: "Woman's World", basis: '8,000 miles', value: '≈$144' },
  { card: '365 Cashback', basis: '1.5% cashback', value: '$30' },
];

export const growInputs = {
  cashBalance: '$20,000',
  fdRate: '1.60% p.a. (12-mth)',
};

export const growComparison = [
  { where: 'Best FD', rate: '1.60% p.a.', perMonth: '$26.67' },
  { where: 'SGX ES3 (STI ETF)', rate: '~7.0% p.a.*', perMonth: '$116.67' },
  { where: 'Diversified portfolio', rate: '~5.5% p.a.*', perMonth: '$91.67' },
];

export const profile = {
  name: 'Mei Lin Tan',
  mobile: '+65 9123 4567',
  email: 'meilin.tan@mail.com',
};

// Shown on Home, first visit only — placing you on the line.
export const lineFields = [
  { label: 'Housing', options: ['HDB', 'Condo', 'Landed', 'Renting'], active: 'HDB' },
  { label: 'Household', options: ['Single', 'Married', 'Married + kids'], active: 'Married' },
  { label: 'Children', options: ['None', 'Expecting', 'One child', 'Twins / multiples'], active: 'Twins / multiples' },
  { label: "Oldest child's age", options: ['Newborn', 'Toddler', 'School-age', 'Teen'], active: 'Newborn' },
  { label: 'Career stage', options: ['Just started', 'Building up', 'Established', 'Own business'], active: 'Building up' },
  { label: 'Annual income', options: ['Under $50k', '$50k–100k', '$100k–200k', '$200k+'], active: '$100k–200k' },
];

// Shown on the Cards tab, first visit only.
export const cardFields = [
  { label: 'Do you have any credit cards already?', options: ['None', '1 card', '2–3 cards', '4+ cards'], active: '2–3 cards' },
  { label: 'Which bank do you use most?', options: ['DBS', 'OCBC', 'UOB', 'Other'], active: 'DBS' },
];

// Shown on the Grow tab, first visit only.
export const growFields = [
  { label: 'Roughly how much do you have in savings?', options: ['Under $10k', '$10k–50k', '$50k–150k', '$150k+'], active: '$10k–50k' },
  { label: 'Do you have a fixed deposit already?', options: ['No', 'Yes'], active: 'No' },
];
