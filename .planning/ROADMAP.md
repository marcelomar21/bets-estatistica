# Roadmap: GuruBet

## Overview

Stabilize the existing posting pipeline (4 production bugs), then enhance the queue UI with individual bet selection, then deliver the league upsell checkout feature. Bug fixes first to protect active clients, new features after.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Posting Fixes** - Fix tone-of-voice, confirmation routing, and victory post rendering bugs
- [ ] **Phase 2: Queue Selection** - Individual bet selection in the posting queue UI
- [ ] **Phase 3: League Upsell** - Configuration, checkout, pricing, and discounts for extra leagues

## Phase Details

### Phase 1: Posting Fixes
**Goal**: Posting pipeline delivers correct, well-formatted messages to the right channels with the right tone
**Depends on**: Nothing (first phase)
**Requirements**: POST-01, POST-02, POST-03, POST-04
**Success Criteria** (what must be TRUE):
  1. Automated posts use the tone of voice configured for each group/influencer (not a generic default)
  2. Send confirmations appear only in the admin group, never in client-facing groups
  3. Victory posts do not display CTA labels when no CTA applies
  4. Victory posts show the correct odds values from the original bet
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Tone enforcement in template mode + dailyWinsRecap fresh toneConfig + confirmation routing audit
- [x] 01-02-PLAN.md — CTA label sanitization in LLM prompts + victory post odds reading fix

### Phase 2: Queue Selection
**Goal**: Super admin has granular control over which bets get posted from the queue
**Depends on**: Phase 1
**Requirements**: QUEUE-01
**Success Criteria** (what must be TRUE):
  1. Super admin sees a list of queued bets with individual checkboxes (all selected by default)
  2. Super admin can deselect specific bets and post only the selected ones
**Plans**: 1 plan
**UI hint**: yes

Plans:
- [x] 02-01-PLAN.md — Add checkbox selection to PostingQueueTable + wire selection state in postagem page

### Phase 3: League Upsell
**Goal**: Influencers can monetize extra leagues as paid add-ons, with flexible pricing and per-client discounts
**Depends on**: Phase 1
**Requirements**: LEAGUE-01, LEAGUE-02, LEAGUE-03, LEAGUE-04
**Success Criteria** (what must be TRUE):
  1. Super admin can classify each league as standard (included) or extra (upsell) in the admin panel
  2. Clients can purchase extra leagues through a checkout flow at the configured price (default R$200/month)
  3. Super admin can change the price of any individual extra league
  4. Super admin can apply a discount on extra leagues for a specific client
**Plans**: 4 plans
**UI hint**: yes

Plans:
- [x] 03-01-PLAN.md — Database schema (tier column, pricing, subscriptions, discounts tables) + admin APIs
- [x] 03-02-PLAN.md — Super admin league management UI (tier classification, pricing, discounts tabs)
- [x] 03-03-PLAN.md — Group admin checkout flow (checkout API, subscriptions API, checkout UI page)
- [x] 03-04-PLAN.md — Distribution enforcement (webhook processor for activation/cancellation, subscription check in distribution)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Posting Fixes | 0/2 | Not started | - |
| 2. Queue Selection | 0/1 | Not started | - |
| 3. League Upsell | 0/4 | Not started | - |
