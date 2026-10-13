# Pilot checklist — first maid agency

**Before the pilot (Nexus Logic)**
- [ ] Production deployed per `DEPLOYMENT.md`; smoke test passed; `PLATFORM_ADMIN_TOKEN` stored in a password manager.
- [ ] Decide AI mode: set `ANTHROPIC_API_KEY` (composed answers) or run extractive-only. Review a week of transcripts either way.
- [ ] Email provider configured (`RESEND_API_KEY`, `EMAIL_FROM`) with a verified sending domain — otherwise bookings show "Email off" and staff must watch the dashboard.
- [ ] Agency provisioned; owner invited; owner's own phone used for a dry run.
- [ ] Legal: agency's privacy policy link added in Branding; agency understands it is the data controller and Nexus Logic the processor (get a short data-processing agreement reviewed by counsel). Confirm PDPA notice wording with counsel.

**Agency setup (30–45 min with the owner)**
- [ ] Settings: profile (public phone/email, EA licence no.), business hours, consultation length/buffer/notice, team + each consultant's availability.
- [ ] Knowledge Base: ≥10 FAQs the agency is happy to be quoted on (hours, how consultations work, documents to bring, fee *explanations they approve*, transfer process, contact). **No promises** about availability, outcomes or refunds. Test each in the test console, then publish.
- [ ] Branding: name, colour, welcome message, 3–5 suggested questions, allowed origins.
- [ ] Embed snippet on the agency's site; test on a phone.
- [ ] Optional: WhatsApp connected (templates approved), tested in test mode then live.
- [ ] Escalation keywords reviewed (AI Assistant page); alert email set (Settings → Agency profile).

**Week 1 (daily 10-minute review)**
- [ ] Overview: "Awaiting first contact" should be ≈0 each morning; reply to handoffs the same day.
- [ ] Skim Conversations for wrong/unhelpful answers → fix by editing/adding knowledge (edits are un-published until re-approved).
- [ ] Check Bookings notifications column (`sent` / `Email off` / `failed`).
- [ ] Record every miss: unanswered questions, wrong slot, confusing step.

**Pilot success measures (agree upfront)**: median first-reply time; % of enquiries that reach a booked consultation; handoff rate; staff time saved (agency's own estimate); incidents (wrong answer, missed handoff, double booking — target zero).
**Exit review (week 4)**: use Reports (30 days) + provider cost from Settings → Usage; decide price and limits from *measured* cost.
