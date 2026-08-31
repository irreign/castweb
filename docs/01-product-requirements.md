# 1. Product Requirements

## 1.1 Vision

Families coordinate almost entirely over chat already. Hearth's bet is that a
family should never have to leave the conversation to keep itself organized —
the AI reads the room, and the calendar builds itself from what people
naturally say, with the family always in control of what actually lands on
it.

## 1.2 Non-goals (V1)

- Not a general-purpose messenger. No public profiles, no discovery, no
  cross-family contacts, no group chats beyond one family space.
- Not an "AI does everything" product. The AI *proposes*; a human (or an
  explicit auto-add rule the family opted into) *decides*.
- Not a calendar sync product. No Apple/Google Calendar import/export in V1
  (architected for it, not built — see §30 and doc 9).
- Not a media-rich chat app. Text is the V1 payload; images are schema-ready
  but not implemented (per brief §5/§30).

## 1.3 Core functional requirements

| # | Requirement | Priority |
|---|---|---|
| R1 | Family creation, invite-link join, member profiles, roles (Owner/Adult/Child) | P0 |
| R2 | Realtime one-conversation-per-family chat: send, receive, edit, delete, reply/quote, pagination, read state | P0 |
| R3 | Every inbound message is evaluated for calendar-event content by an AI extraction pipeline | P0 |
| R4 | High-confidence, unambiguous extractions render an inline confirmation card in-chat; family can Add / Edit / Ignore | P0 |
| R5 | Families may opt into auto-add for extractions above a configurable confidence threshold | P1 |
| R6 | Every calendar event created from chat stores its source message id and is navigable back to it | P0 |
| R7 | Shared calendar: month, agenda, day views; manual create/edit/delete; categories; participant avatars | P0 |
| R8 | AI recognizes corrections to and confirmations of existing events instead of duplicating them | P0 |
| R9 | AI answers natural-language questions about the family's real messages/events, grounded, with "I don't know" as a valid answer | P1 |
| R10 | Push notifications for messages, event creation, upcoming events, event changes, clarification requests — configurable per category | P1 |
| R11 | Row-level security: a user can only ever read/write data in families they belong to | P0 |

## 1.4 Product principle: optimize for trust

Restated from the brief because it drives most architectural decisions in
doc 6: **a wrong calendar event is worse than a missed one.** Concretely this
means:

- The extraction pipeline has three outcomes, never two: **auto-add**,
  **suggest** (default — a card, no DB write until a human taps Add), and
  **silent** (below the suggestion floor — nothing shown). There is no
  "silently add" path unless the family explicitly enabled auto-add *and*
  confidence clears a second, higher bar.
- Confidence thresholds are server-side constants the client cannot
  influence, and are per-family configurable only within a bounded range
  (Settings → AI behaviour), never below a hard floor.
- Ambiguity (an unresolvable date, an unclear "that day" reference) always
  degrades to a clarification question or a lower confidence score — never
  to a guess.

## 1.5 Success criteria for the MVP demo

The exact flow in brief §29 must work end-to-end: two independent event
extractions confirmed via the chat card, both visible on the shared calendar
from a second family member's device in realtime, and a natural-language
"what's happening in October" question answered from real data.
