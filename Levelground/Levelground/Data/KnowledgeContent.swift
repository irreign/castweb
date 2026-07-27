import Foundation

enum KnowledgeContent {
    static let all: [KnowledgeItem] = [
        KnowledgeItem(
            id: "fin-mortgage-basics",
            title: "How Mortgages Actually Work",
            category: .financing,
            level: .new,
            summary: "The four numbers that decide your monthly payment, explained without jargon.",
            body: [
                "A mortgage is just a loan secured against the property you're buying. If you stop paying, the lender can take the property back — that's why the rate is lower than an unsecured loan.",
                "Four numbers drive your monthly payment: the loan amount (price minus your down payment), the interest rate, the loan term (usually 20-30 years), and whether the rate is fixed or floating.",
                "A longer term lowers your monthly payment but increases total interest paid. A shorter term does the opposite. There's no universally 'right' answer — it depends on your cash flow needs versus how much interest you're willing to pay over time.",
                "Lenders also cap how much they'll lend relative to the property's value (loan-to-value) and relative to your income (debt servicing ratio). Knowing both limits before you shop for a property saves you from falling in love with something you can't finance."
            ],
            readMinutes: 4
        ),
        KnowledgeItem(
            id: "fin-fixed-vs-floating",
            title: "Fixed vs Floating Interest Rates",
            category: .financing,
            level: .someExperience,
            summary: "Why the 'safer sounding' option isn't automatically the cheaper one.",
            body: [
                "A fixed rate stays the same for a set period (often 2-5 years), then usually reverts to a floating rate unless you refinance. It gives predictability: your payment won't change even if market rates spike.",
                "A floating rate moves with a reference rate. It's often lower to start, but your payment can rise — sometimes significantly — if rates climb.",
                "The trade you're making is predictability versus potential savings. If you have little buffer in your monthly budget, that predictability is worth paying for. If you can absorb payment swings, floating has historically cost less over long horizons — but 'historically' is not a guarantee.",
                "Read the fine print on fixed-rate deals: many have a penalty for breaking the loan early, which matters if you plan to sell or refinance before the fixed period ends."
            ],
            readMinutes: 4
        ),
        KnowledgeItem(
            id: "fin-ltv",
            title: "What Loan-to-Value (LTV) Really Means",
            category: .financing,
            level: .new,
            summary: "The ratio that decides your minimum down payment — and your risk cushion.",
            body: [
                "LTV is the loan amount divided by the property's value. An LTV of 80% means you're borrowing 80% of the value and putting down 20%.",
                "Regulators and lenders cap LTV to limit risk — for both you and them. A lower LTV (bigger down payment) usually gets you a better interest rate and protects you if prices dip, because you're less likely to owe more than the property is worth.",
                "Watch which number LTV is calculated against: purchase price or valuation. If the bank's valuation comes in below the price you agreed to pay, your effective down payment just got bigger — a common surprise for first-time buyers."
            ],
            readMinutes: 3
        ),
        KnowledgeItem(
            id: "legal-process-overview",
            title: "The Buying Process, Step by Step",
            category: .legalProcess,
            level: .new,
            summary: "From offer to keys-in-hand — what actually happens and in what order.",
            body: [
                "Roughly: you make an offer, it's accepted, you pay an initial deposit and sign an option or agreement, you arrange financing and due diligence (valuation, inspections, title checks), you sign the final sale agreement and pay the balance deposit, then complete — pay the remaining balance and get the keys.",
                "Each stage has different points of no return. An early-stage deposit is sometimes refundable if you walk away; later-stage deposits usually aren't. Know exactly which stage forfeits your money before you sign anything.",
                "Due diligence is where knowledge imbalance costs buyers the most — title issues, outstanding liens, unauthorized renovations, or disputes can all hide in documents you're not used to reading. This is worth paying a lawyer or conveyancer for, even when it feels like an avoidable expense."
            ],
            readMinutes: 5
        ),
        KnowledgeItem(
            id: "legal-sale-agreement",
            title: "What's Actually in a Sale & Purchase Agreement",
            category: .legalProcess,
            level: .someExperience,
            summary: "The clauses that matter more than the price on the cover page.",
            body: [
                "Beyond price, look for: the completion date and what happens if either side misses it, what's included in the sale (fixtures, fittings, appliances), and any conditions the deal is contingent on (financing approval, inspection results).",
                "Default and penalty clauses tell you what happens if you or the seller pulls out. These are negotiable more often than buyers assume — don't treat the template as fixed.",
                "If anything is promised verbally but not in the document, assume it doesn't exist. Get it written in, or don't rely on it."
            ],
            readMinutes: 4
        ),
        KnowledgeItem(
            id: "legal-title-checks",
            title: "Why Title Checks Matter More Than the Photos",
            category: .legalProcess,
            level: .experienced,
            summary: "The unglamorous paperwork that prevents you from inheriting someone else's problem.",
            body: [
                "A title check confirms the seller actually has the legal right to sell, and reveals anything attached to the property — mortgages not yet discharged, caveats, disputes, or easements that restrict what you can do with it.",
                "Unauthorized renovations are a quiet but common issue: an extension or structural change done without approval can create liability for the new owner, not just the seller.",
                "This is a case where paying for professional due diligence is cheap insurance against a problem that could cost far more than the fee, or that could take years to unwind."
            ],
            readMinutes: 4
        ),
        KnowledgeItem(
            id: "val-how-valued",
            title: "How Agents & Banks Value a Property",
            category: .valuation,
            level: .new,
            summary: "Two different numbers, calculated two different ways, often confused for one.",
            body: [
                "An agent's suggested asking price is usually based on recent comparable sales nearby, adjusted for condition, floor level, and features — partly data, partly art, and shaped by the seller's incentive to price high.",
                "A bank's valuation is done by an independent valuer whose job is to protect the lender from over-lending. It tends to be more conservative and is what actually determines your maximum loan amount.",
                "When these two numbers disagree, the bank's number usually wins for financing purposes — you may need to cover the gap in cash. Asking for a valuation early, before you're deep into a deal, avoids this surprise."
            ],
            readMinutes: 4
        ),
        KnowledgeItem(
            id: "val-asking-vs-market",
            title: "Asking Price vs Market Value: Not the Same Thing",
            category: .valuation,
            level: .new,
            summary: "One is a starting position. The other is what buyers are actually willing to pay.",
            body: [
                "Asking price is a number the seller (or their agent) chooses, often anchored to what they want, not what the market supports. Market value is closer to what similar properties have actually sold for recently.",
                "Look at sold prices, not other listings' asking prices, to judge whether a property is fairly priced — active listings tell you what sellers hope for, not what buyers agreed to pay.",
                "A property sitting on the market far longer than similar ones nearby is a signal it's priced above what buyers are willing to pay, regardless of how the listing is worded."
            ],
            readMinutes: 3
        ),
        KnowledgeItem(
            id: "val-reading-report",
            title: "How to Read a Valuation Report",
            category: .valuation,
            level: .someExperience,
            summary: "The sections that tell you whether the number is trustworthy.",
            body: [
                "Check the comparables used — are they genuinely similar in size, age, and location, or is the valuer stretching to justify a number?",
                "Look at any adjustments applied (for renovation, floor level, view) and whether they seem reasonable relative to the base comparables.",
                "Note the valuation date. Prices move; a report even a few months old in a fast-moving market may already be stale."
            ],
            readMinutes: 3
        ),
        KnowledgeItem(
            id: "neg-first-offer",
            title: "Why the First Offer Is Never the Real Price",
            category: .negotiation,
            level: .new,
            summary: "Understanding the opening move changes how you should respond to it.",
            body: [
                "Listed and initial offer prices are anchors, not facts. Both sides typically build in room to move — sellers price above their true minimum, buyers often (though not always) offer below their true maximum.",
                "Anchoring works on you too: a high initial asking price can make a still-expensive counteroffer feel like a bargain. Base your judgment on comparable sold prices, not on how much has been 'knocked off' the original number.",
                "Silence is a valid negotiating move. You don't owe an immediate counter to every offer."
            ],
            readMinutes: 3
        ),
        KnowledgeItem(
            id: "neg-motivated-seller",
            title: "Signs a Seller Is Motivated to Move Quickly",
            category: .negotiation,
            level: .someExperience,
            summary: "Reading context clues most buyers miss.",
            body: [
                "Long time on market, price already reduced once, a seller who has already bought their next place, or a listing that mentions relocation or urgency are all signals of leverage you can use.",
                "Ask your agent (or the seller's, carefully) how long the property has been listed and whether the price has changed. Public listing history often shows this too.",
                "Motivated doesn't mean desperate — treat it as one input among several, not a reason to lowball aggressively and risk souring the negotiation."
            ],
            readMinutes: 3
        ),
        KnowledgeItem(
            id: "neg-beyond-price",
            title: "Negotiating Beyond Just the Price",
            category: .negotiation,
            level: .someExperience,
            summary: "Completion date, included items, and repair credits are all on the table.",
            body: [
                "If a seller won't move on price, ask about flexibility elsewhere: a later or earlier completion date, included furniture or appliances, or a credit toward a repair found during inspection.",
                "These concessions can be worth as much as a price cut without either side feeling like they 'lost' the headline number — useful when both parties are anchored on price publicly.",
                "Decide your priorities before you negotiate. If timing matters more to you than price, say so — clarity speeds up deals more often than it weakens your position."
            ],
            readMinutes: 3
        ),
        KnowledgeItem(
            id: "flag-pressure-tactics",
            title: "Common Tactics That Pressure Buyers to Decide Fast",
            category: .redFlags,
            level: .new,
            summary: "Urgency is sometimes real. It's also sometimes manufactured.",
            body: [
                "'Another buyer is interested' can be true or a script. Ask to see evidence — a second viewing request, a competing offer in writing — before letting it rush your decision.",
                "Deadlines set right before a weekend or holiday, when you have less time to get advice, are worth noticing as a pattern.",
                "A good rule: any decision that gets meaningfully worse the moment you ask for 24 hours to think about it was probably not a great decision to begin with."
            ],
            readMinutes: 3
        ),
        KnowledgeItem(
            id: "flag-questions-agents-avoid",
            title: "Questions Worth Asking Even If They Feel Awkward",
            category: .redFlags,
            level: .new,
            summary: "A short list that surfaces problems before they become your problems.",
            body: [
                "Why is the seller selling? How long has it been listed, and has the price changed? Have there been any disputes with neighbors or the building management? Any unauthorized renovations?",
                "Has this property flooded, had pest issues, or needed major repairs? What's included and what's excluded from the sale?",
                "An agent representing the seller isn't obligated to volunteer negative information — but is generally obligated not to lie if asked directly. Ask directly."
            ],
            readMinutes: 3
        ),
        KnowledgeItem(
            id: "flag-overpriced-listing",
            title: "Spotting an Overpriced Listing",
            category: .redFlags,
            level: .someExperience,
            summary: "Patterns that show up before you even view the property.",
            body: [
                "Compare price-per-square-foot (or per-square-meter) against recently sold comparables, not other active listings, which may be similarly overpriced.",
                "Listing photos that avoid certain angles or rooms, vague descriptions of condition, or a description leaning heavily on 'potential' can signal something the photos are working around.",
                "A property relisted repeatedly under a different agent, sometimes with a slightly changed price, is a pattern worth searching for before you get emotionally invested."
            ],
            readMinutes: 3
        ),
        KnowledgeItem(
            id: "inv-gross-vs-net-yield",
            title: "Gross vs Net Rental Yield",
            category: .investmentMetrics,
            level: .new,
            summary: "The one number agents quote and the one number that actually matters.",
            body: [
                "Gross yield = annual rent ÷ property price. It's simple and it's the number most commonly advertised — and it's also the most flattering, because it ignores costs.",
                "Net yield subtracts operating costs (maintenance, taxes, insurance, management fees, vacancy periods) before dividing by price. It's almost always meaningfully lower than gross, sometimes by 20-30%.",
                "When comparing properties, always compare net to net. A property with a high gross yield but heavy maintenance fees or taxes can easily underperform one with a lower headline number."
            ],
            readMinutes: 4
        ),
        KnowledgeItem(
            id: "inv-cap-rate",
            title: "What Cap Rate Tells You (and What It Doesn't)",
            category: .investmentMetrics,
            level: .someExperience,
            summary: "A quick screening tool, not a substitute for real due diligence.",
            body: [
                "Cap rate = net operating income ÷ current property value. It lets you compare income-generating properties independent of how they're financed.",
                "It says nothing about financing costs, future appreciation, or how income might change over time — two properties with identical cap rates can have very different risk profiles.",
                "Use cap rate to screen a list of options quickly, then dig into cash flow projections and market fundamentals for anything that passes the first filter."
            ],
            readMinutes: 3
        ),
        KnowledgeItem(
            id: "inv-cashflow-vs-appreciation",
            title: "Cash Flow vs Capital Appreciation: Pick Your Bet",
            category: .investmentMetrics,
            level: .someExperience,
            summary: "Most properties lean toward one or the other. Know which one you're buying.",
            body: [
                "A cash-flow property generates rent well above its costs from day one — steady income, often in less glamorous locations, usually slower to appreciate.",
                "An appreciation-focused property may run at breakeven or a slight loss on rent, with the thesis that the price itself will rise — common in high-growth or supply-constrained areas.",
                "Problems arise when investors buy an appreciation-style property while needing cash-flow-style income, or vice versa. Decide which you actually need before you shop, not after you own one."
            ],
            readMinutes: 4
        ),
        KnowledgeItem(
            id: "cycle-understanding",
            title: "Understanding Property Cycles",
            category: .marketCycles,
            level: .someExperience,
            summary: "Markets move in phases. Knowing which one you're in changes your strategy.",
            body: [
                "Broadly: recovery (prices flat or falling, low activity), expansion (rising prices, rising activity), hyper-supply (construction catches up, growth slows), and recession (oversupply, falling prices).",
                "No two cycles are identical, and timing them precisely is close to impossible — but recognizing the broad phase helps calibrate expectations: buying at the top of expansion carries different risk than buying in recovery.",
                "Interest rates, construction/completion volumes, and vacancy rates are more useful leading signals than headlines, which tend to lag the actual turn in the market."
            ],
            readMinutes: 4
        ),
        KnowledgeItem(
            id: "cycle-leading-indicators",
            title: "Leading Indicators Worth Tracking",
            category: .marketCycles,
            level: .experienced,
            summary: "What to watch instead of yesterday's headline transaction price.",
            body: [
                "Construction starts and completions show future supply before it hits the market. A wave of upcoming completions can pressure prices and rents even while current numbers look strong.",
                "Vacancy rates and time-on-market are earlier signals of demand softening than price itself, which tends to be sticky and slow to adjust.",
                "Credit conditions — how easily and cheaply buyers can borrow — often move before prices do, since financing availability directly gates how much buyers can bid."
            ],
            readMinutes: 4
        ),
        KnowledgeItem(
            id: "tax-property-basics",
            title: "Property Tax Basics",
            category: .taxes,
            level: .new,
            summary: "The recurring cost that's easy to forget when comparing monthly budgets.",
            body: [
                "Most jurisdictions charge an annual property tax based on an assessed value, which may differ from market value or purchase price. Rates and assessment methods vary widely by location.",
                "Owner-occupied properties often get a lower rate or rebate than investment properties — worth confirming, since it changes the true cost of holding a second property.",
                "Budget for this as a recurring cost, not a one-time closing expense — it's easy to model correctly at purchase and then forget it compounds every year you hold."
            ],
            readMinutes: 3
        ),
        KnowledgeItem(
            id: "tax-transaction-costs",
            title: "The Full Cost of Buying (Beyond the Price Tag)",
            category: .taxes,
            level: .new,
            summary: "Stamp duties, legal fees, and agent commissions add up faster than most buyers expect.",
            body: [
                "Beyond the purchase price, budget for stamp or transfer duties, legal/conveyancing fees, valuation fees, and possibly agent commission depending on local convention for who pays.",
                "Some jurisdictions add extra duties for investment properties or for buyers who already own property — this can materially change the math on a second purchase.",
                "A rough rule of thumb: transaction costs can run from low single digits to well over 5-8% of price depending on jurisdiction. Get a real number for your specific location before you commit, not after."
            ],
            readMinutes: 4
        ),
        KnowledgeItem(
            id: "tax-capital-gains",
            title: "Capital Gains: What to Check Before You Sell",
            category: .taxes,
            level: .experienced,
            summary: "The tax bill on the way out can be larger than the one on the way in.",
            body: [
                "Many places tax the profit on sale differently depending on how long you've held the property, whether it was your primary residence, and whether you're a resident or foreign owner.",
                "Some jurisdictions offer exemptions or reductions for a primary residence that don't apply to investment properties — know which bucket your property falls into before assuming a rate.",
                "Rules here change relatively often and vary enormously by location — treat anything general (including this) as a starting point for a conversation with a local tax professional, not a final answer."
            ],
            readMinutes: 4
        ),
        KnowledgeItem(
            id: "school-priority-explained",
            title: "How School-Distance Priority Actually Works",
            category: .schoolsAndLocation,
            level: .new,
            summary: "Living within 1km or 2km of a popular school changes your odds at Primary 1 registration — here's the mechanism, and the phases it actually sits inside.",
            body: [
                "Singapore's Primary 1 registration runs through a sequence of phases, each opening a school to a different group before it's finally open to everyone: Phase 1 (a sibling already at the school), Phase 2A(1) (a parent on the board or staff), Phase 2A(2) (a parent who's a registered alumnus), Phase 2B (a recognised community leader or school volunteer, or a child endorsed by a religious/clan body tied to the school), then Phase 2C — every remaining Singapore Citizen or PR child, which is where most families with no specific tie to the school actually register.",
                "The 1km / 1km-2km / beyond-2km distance priority isn't a phase of its own — it's the tiebreaker used inside whichever phase you're in, whenever that phase has more applicants for a school than places left. It matters most in Phase 2C, since that's where nearly everyone without an alumni or volunteer connection ends up. Being within 1km doesn't guarantee a place if the school is oversubscribed even within that ring — it just puts you ahead of everyone farther away in your phase.",
                "If a school still isn't fully placed after Phase 2C, there's a Phase 2C Supplementary round from schools with remaining vacancies, and finally Phase 3 for children who aren't Singapore Citizens or PRs.",
                "This is exactly why some popular schools show a visible price premium on nearby homes: parents are effectively paying for a better position in the priority queue, years before their child is old enough to enroll.",
                "The distance is measured from your registered residential address to the school, not from where you happen to be living temporarily — so this only works if you actually live there, not just hold a lease on paper.",
                "There's no fixed nationwide split of how many seats go to each phase — it depends entirely on how many siblings, alumni, and volunteers apply to that specific school that year. A handful of highly sought-after schools fill most of their intake before Phase 2C even opens, leaving only a few seats for everyone else; most schools still have the bulk of their seats open at Phase 2C. MOE publishes each school's actual starting vacancy count for Phase 2C every year after registration closes — that real, school-specific number is worth far more than any general rule of thumb."
            ],
            readMinutes: 5
        ),
        KnowledgeItem(
            id: "balloting-phases-explained",
            title: "What Happens When a Phase Is Oversubscribed",
            category: .schoolsAndLocation,
            level: .someExperience,
            summary: "Distance gets you into the right tier. Balloting decides who wins when that tier is still too full.",
            body: [
                "Within any given registration phase, applicants are grouped by distance band first. If a band has more children than remaining places, a computerized ballot decides among that band — distance doesn't break ties beyond getting you into the right group.",
                "This means two families both within 1km of a sought-after school can have very different outcomes purely on luck, once that 1km group itself is oversubscribed. Being closer within the 1km ring doesn't count for more than being just barely inside it.",
                "Because of this, treat the 1km ring as improving your odds meaningfully, not as a guarantee. For an extremely popular school, even 1km families sometimes miss out and move to their next-priority school."
            ],
            readMinutes: 3
        ),
        KnowledgeItem(
            id: "lease-decay-explained",
            title: "Why Remaining Lease Years Change What You Can Borrow",
            category: .schoolsAndLocation,
            level: .someExperience,
            summary: "The same flat can be much harder to finance once its lease crosses certain age thresholds.",
            body: [
                "A 99-year leasehold property doesn't lose value in a straight line as the lease runs down — the drop tends to accelerate once remaining lease crosses thresholds that banks and retirement-savings schemes use to restrict financing.",
                "As remaining lease shortens, banks typically reduce how much they'll lend against the property and shorten the loan tenure they'll offer, and rules around using retirement savings toward the purchase tend to tighten as well.",
                "This matters most for buyers who plan to hold long-term or who might need to sell to a younger buyer eventually — a shrinking pool of financeable buyers puts downward pressure on resale demand well before the lease is actually close to zero.",
                "Always check the current thresholds and figures with a bank directly — they get revised periodically, and a rule of thumb that was true a few years ago may already be out of date."
            ],
            readMinutes: 4
        )
    ]

    static func items(for category: KnowledgeCategory) -> [KnowledgeItem] {
        all.filter { $0.category == category }
    }

    static func item(id: String) -> KnowledgeItem? {
        all.first { $0.id == id }
    }
}
