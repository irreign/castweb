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

export const cardOffers = [
  {
    name: 'HSBC Revolution',
    ends: 'Ends 31 Jul',
    gift: 'S$400 cash or 6,140 points, plus a shot at a 10g gold bar',
    meta: 'Min spend $500 by end of following month · no annual fee',
    url: 'https://www.hsbc.com.sg/credit-cards/products/revolution/',
  },
  {
    name: 'OCBC 90°N Visa',
    ends: 'Ends 2 Aug',
    gift: '$400 cash, 25,000 Max Miles, or a Dyson Airstrait',
    meta: 'Min spend $400 within 30 days',
    url: 'https://www.ocbc.com/personal-banking/cards/90-n-card',
  },
  {
    name: 'UOB One',
    ends: 'Ends 30 Sep',
    gift: "Up to 20% quarterly cashback (McDonald's, Grab, Shopee, SimplyGo, groceries) + $100 Samsung e-voucher",
    meta: 'Min spend $1,000 in first month',
    url: 'https://www.uob.com.sg/personal/cards/cashback/one-card.page',
  },
  {
    name: 'Amex KrisFlyer',
    ends: "Ends 31 Jan '27",
    gift: '16,000 miles + 2,200 base miles on local spend',
    meta: 'Min spend $2,000 within 90 days',
    url: 'https://www.americanexpress.com/en-sg/credit-cards/krisflyer-credit-card/',
  },
  {
    name: 'Citi Rewards Card',
    ends: 'Ongoing',
    gift: 'S$420 cash or 16,000 miles',
    meta: 'Min spend $500 within 30 days',
    url: 'https://www.citibank.com.sg/gcb/credit_cards/rewards-card.htm',
  },
  {
    name: 'DBS Altitude (code ALTS38)',
    ends: 'Ongoing',
    gift: '38,000 bonus miles',
    meta: '$196.20 annual fee · spend $800 within 60 days',
    url: 'https://www.dbs.com.sg/personal/cards/credit-cards/dbs-altitude-visa-card',
  },
  {
    name: 'StanChart Visa Infinite',
    ends: 'Ongoing',
    gift: '50,000 bonus miles',
    meta: '$599.50 annual fee · spend $2,000 within 60 days',
    url: 'https://www.sc.com/sg/credit-cards/visa-infinite-card/',
  },
];

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

