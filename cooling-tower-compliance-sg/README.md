# Cooling Tower & Legionella Compliance SG — validation landing page

This is the single-page MVP for the 30-day validation test agreed on for the
cooling tower / Legionella compliance niche (see conversation history for the
full stress-test that led here). It is **not live** yet — deliberately.

## What's in this folder

- `index.html` — the full landing page: on-page SEO (title/meta/OG tags),
  FAQPage JSON-LD schema for both Google rich results and AI-answer-engine
  visibility, the NEA requirements table, the liability/fear-angle content,
  and a lead capture form.
- The page currently has `<meta name="robots" content="noindex, nofollow">`
  and a black "draft / validation build" banner. Both are intentional guards
  against this page getting indexed on the wrong domain before it's ready.

## Why I didn't just "make it live" myself

Three things are missing that only you can provide, and faking them would
make the page dishonest or would burn your one shot at a good first crawl:

1. **A real domain.** This page is deliberately domain-agnostic. Hosting it
   as a subpath of castweb's own site would mismatch topics on castweb's
   existing domain (bad for castweb's SEO) and would put a cooling-tower
   compliance business under a web-design agency's domain (bad for this
   business's credibility with B2B buyers). It needs its own domain —
   even a cheap `.sg` or `.com` bought for ~S$10-15/yr is far better than
   living on someone else's domain.
2. **A real contact point.** The lead form currently opens a `mailto:` to a
   placeholder address (`REPLACE_WITH_REAL_CONTACT_EMAIL` in the `<script>`
   at the bottom of `index.html`) so it never silently sends real leads
   nowhere. Swap that for the address you want leads to land in before this
   goes live.
3. **Ads/GSC access**, if you want a paid push in addition to organic. I have
   no ads account or Search Console access — those need your login or an
   invite added as a user.

## Go-live checklist (in order)

1. Buy/point a domain (or a free subdomain from your host of choice) at
   wherever you'll host this — GitHub Pages, Cloudflare Pages, Netlify, or
   any static host all work with this file as-is.
2. Replace `REPLACE_WITH_REAL_CONTACT_EMAIL` in `index.html` with the inbox
   you want leads sent to.
3. Update the `<link rel="canonical">` href to the real URL.
4. Remove the `<meta name="robots" content="noindex, nofollow">` line and
   the validation banner `<div>` at the top of `<body>`.
5. Add a Google Search Console property for the domain and submit the URL
   for indexing.
6. Call 2-3 real cooling tower contractors (Eindec, Techtimia, JS Creates
   were named in the research) to get real pricing before quoting lead
   prices to anyone.
7. Only then, if you want a paid push: set up Google Ads with a small
   (S$300-500) budget on the 5-8 keywords from the stress-test, tracking
   cost-per-lead.

## Checking rank once it's live

Ask me to check again once it's on a real domain and indexed — I'll re-run
the SERP searches from the stress-test periodically. Realistic expectation:
meaningful organic movement on a brand-new domain typically takes weeks to
months, not days, even with solid on-page SEO.
