# 3. Screen Map

```
Root
├── Auth flow (no session)
│   ├── Welcome / Sign in
│   ├── Sign up (email + password, or magic link)
│   └── Onboarding
│       ├── Create Family  (name, timezone)
│       └── Join Family    (via invite link/token, or manual code entry)
│
└── Main (TabView, session + family established)
    │
    ├── Tab 1 · Chat
    │   ├── Chat (the family's single conversation)
    │   │   ├── Message bubble (text, reply/quote, edited flag, read receipts)
    │   │   ├── Inline AI Suggestion Card (Add / Edit / Ignore)
    │   │   ├── Inline AI Update Card (correction — Update / Ignore)
    │   │   ├── Inline AI Confirmation state (✓ Added — View Event)
    │   │   ├── Inline AI Clarification Card (question + quick replies)
    │   │   ├── Assistant reply bubble (grounded Q&A, distinct styling)
    │   │   └── Composer (text field, reply preview, send, [image – disabled V1])
    │   ├── Edit Suggested Event (sheet, from "Edit" on a card)
    │   └── Jump-to-message (from Calendar "Created from chat")
    │
    ├── Tab 2 · Calendar
    │   ├── Month view (default)
    │   ├── Agenda / list view
    │   ├── Day view
    │   ├── Event Detail (sheet)
    │   │   ├── Created from chat → source message link
    │   │   └── Edit / Delete (role-gated)
    │   └── New Event (manual creation sheet)
    │
    ├── Tab 3 · Family
    │   ├── Member list (avatar, name, role, last active)
    │   ├── Member detail (view only in V1, self-edit for own profile)
    │   ├── Invite (share link / QR)
    │   └── Pending invites (Owner only)
    │
    └── Tab 4 · Settings
        ├── Account (profile, avatar, sign out, delete account)
        ├── Notifications (per-category toggles from doc 1 R10)
        ├── AI Behaviour (auto-add toggle + threshold, per brief §2)
        ├── Calendar Preferences (family timezone, week start, default view)
        └── Privacy & Data (what the AI sees, export, family deletion)
```

## Navigation notes

- Four tabs are always present once a family exists; there is deliberately
  no fifth "AI" tab — the AI lives inside Chat and Calendar, per brief §2/§12
  ("part of the conversation, not a separate workflow").
- A push notification for a new event deep-links to Calendar → Day view →
  Event Detail. A push for a new message deep-links to Chat scrolled to that
  message. A clarification-request push deep-links to Chat at the card.
- Onboarding is the only flow reachable without a family; once a user has
  ≥1 family, app launch goes straight to Main.
