# 2. User Journeys

## 2.1 Family creation and first invite (Owner)

1. Dad downloads Hearth, signs up with email (Supabase Auth, magic link or
   password — see doc 7).
2. No family yet → onboarding: "Create a family" → name it ("The Tans"),
   pick a timezone (defaults to device timezone, editable later in Settings).
3. Dad is created as the family's first member with role `owner`.
4. Dad taps "Invite" → gets a shareable link
   (`hearth://invite/<token>`, also as a universal link) with a 7-day
   expiry and optional max-uses.
5. Mum opens the link on her phone → if she has no account, signs up first
   → lands directly in the family's chat as role `adult`.

## 2.2 The core magic: message → calendar (brief §29 demo)

1. Mum sends: *"Baby's birthday celebration is on 11 October."*
2. Message appears instantly for her (optimistic) and realtime for everyone
   else.
3. Within ~1-2s a system-authored card appears under the message:
   *"📅 I found a calendar event — Baby's Birthday Celebration, 11 October
   · Add / Edit / Ignore"*.
4. Dad taps **Add**. The card updates in place for everyone to
   *"✓ Added to Family Calendar"* with a **View Event** link.
5. Later, Grandma opens the **Calendar** tab → sees "🎂 Baby's Birthday
   Celebration — 11 October" on the correct day, with a small avatar
   showing who confirmed it.
6. Grandma taps the event → **Created from chat** → taps it → jumps to the
   exact message in Chat, scrolled into view and highlighted.

## 2.3 Multi-message context

1. Person A: *"Grandma's birthday is on 24 October."* → card appears,
   confirmed → event created.
2. Person B: *"What time are we going?"* → no card (question, not a
   statement; also no new date/time yet).
3. Person A: *"Let's do lunch at 12."* → the extractor is given the last
   ~15 messages of context including the just-created event → it recognises
   "12" as a time attaching to the existing Grandma's Birthday event, not a
   new event, and proposes an **update** card ("Add lunch time, 12:00pm, to
   Grandma's Birthday?") rather than a new-event card.

## 2.4 Ambiguity and clarification

1. *"Let's meet Mum on Saturday."* → multiple upcoming Saturdays are not
   ambiguous (nearest future Saturday is used per doc 6 date resolution),
   but the event itself is low-confidence (no clear title/category, casual
   phrasing) → card reads *"Do you want me to add this to the Family
   Calendar? — Meet Mum, Sat 3 Oct"* with **Add / Ignore** only (no
   auto-add regardless of family settings).
2. If the date genuinely can't be resolved (e.g. "sometime in spring") →
   no card; nothing is added silently.

## 2.5 Correction

1. Existing event: Grandma's Birthday Dinner, 24 Oct.
2. *"Actually Grandma's birthday dinner is on the 25th, not the 24th."*
3. Extractor matches this against the existing event (same title family,
   same participants, temporal proximity) and proposes an **update** card:
   *"🔄 Update Family Calendar? — Grandma's Birthday Dinner: 24 Oct → 25
   Oct"* with **Update / Ignore**.
4. On confirm, the event row is updated (not duplicated); `updated_at`
   and an audit trail entry record the change and the message that caused
   it.

## 2.6 Duplicate confirmation (no-op)

1. *"Just confirming Grandma's birthday is 24 October."*
2. Extractor finds an existing event with the same normalized title,
   category, and exact date within the family → returns `is_event: true`
   but `duplicate_of_event_id` set → no new card, no new event. Optionally
   a subtle "✓ Already on the calendar" reaction on the message, no
   notification spam.

## 2.7 Asking the family assistant

1. Someone types *"What's happening in October?"* in chat.
2. The client recognises this as a question addressed to the assistant
   (see doc 6 §6.6 for the heuristic) and calls the assistant endpoint
   directly (not the passive per-message extractor).
3. Assistant replies, as a distinct message bubble authored by "Hearth"
   with a bot-style avatar: a short grounded summary listing real events
   from `calendar_events` in that date range, each linking to the event.
4. If nothing matches, it says so plainly — never invents an event.

## 2.8 Settings: tuning automation

1. In Settings → AI Behaviour, the Owner can toggle "Auto-add high
   confidence events" and drag a threshold slider (bounded 0.90–0.99,
   default off / 0.95 when on).
2. Turning this on changes future extraction outcomes from "always show a
   card" to "auto-create + confirmation-only card" for extractions at or
   above the threshold; everything below the threshold still surfaces as a
   normal suggestion card regardless of this setting.

## 2.9 Editing / deleting a manually or AI-created event

1. From Calendar, any Adult/Owner can open an event and edit any field, or
   delete it. Children (role `child`) can view but not edit/delete by
   default (see doc 7 roles).
2. Edits update `updated_at`, `last_modified_by`; the AI provenance fields
   (`source_message_id`, `ai_confidence`) are preserved even after a human
   edits the event, so "created from chat" remains true and traceable.
