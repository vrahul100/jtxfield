# Jentyx Field — Final v1.2 Spec + Phased Development Plan

**Date:** April 19, 2026 **Purpose:** Build-ready artifact. This is what you're
shipping.

---

# PART A: V1.2 REQUIREMENTS SPEC (FINAL)

---

## 1. Scope & Principles

**In scope:** Worker WhatsApp flow, Manager web app, Daily Report email, CO
Packet PDF export, Weekly payroll approval, Integrations surface (CSV + interest
capture for future connectors).

**Out of scope:** SMS (P2), native mobile app, real-time accounting integrations
(post-launch), GC-facing portal, shift-based clock-in/out.

**Design principles:**

- Worker side optimizes for **zero taps beyond necessary**.
- Manager side optimizes for **answering one question per screen**: "What's
  ready to bill?" "What needs review?" "Who do I pay this week?"
- Every ticket carries **auditable evidence** (who, when, where, what, with what
  materials) suitable for GC submission.
- **Workers are paid for work performed, not time on a clock.** Tickets are the
  single source of truth for both billing and payroll hours.
- **Workers see hours, not dollars.** Rate/pay conversations happen between
  manager and worker outside Jentyx.
- **Workers never hit a dead end.** Every uncertain AI state degrades to one
  additional question.
- **Tickets are atomic.** Timesheets, reports, and packets are views or approval
  artifacts derived from tickets.
- **Integrations are a first-class concern**, even when not yet built.

---

## 2. Worker-Facing Requirements (WhatsApp)

### 2.1 Channel Support

| ID      | Requirement                                                                                                                                                                       | Priority | Status      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| W-CH-01 | WhatsApp Business API is primary and only launch channel.                                                                                                                         | P0       | Implemented |
| W-CH-02 | SMS support (Twilio A2P 10DLC) deferred until WhatsApp traction proven.                                                                                                           | P2       | Not Started |
| W-CH-03 | Single worker identifiable by phone across channels (when SMS added).                                                                                                             | P2       | Not Started |
| W-CH-04 | Bot responds in the language of the incoming message, per-message. No sticky default. For mixed-language input, respond in dominant language; if ambiguous, mirror previous turn. | P0       | Implemented |

### 2.2 Ticket Logging Flow

| ID      | Requirement                                                                                                                                                                                           | Priority | Status                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| W-TK-01 | Worker can initiate ticket via photo, voice note, or text.                                                                                                                                            | P0       | Implemented                                       |
| W-TK-02 | AI classification with tiered fallback: ≥75% proceed silently; 50–74% single confirmation question; <50% ask directly with numbered options (top 2 AI guesses + "type it out"). Worker never blocked. | P0       | Implemented                                       |
| W-TK-03 | Material inference never uses "or" in final ticket. Below 80% confidence triggers one clarifying question (max 3 options).                                                                            | P0       | Needs Fix                                         |
| W-TK-04 | Hours prompt accepts: "5", "5.5", "5 and a half", "cinco horas", "6h".                                                                                                                                | P0       | Implemented                                       |
| W-TK-05 | Project assignment uses Jentyx's existing fuzzy-match + alias routing → Inbox fallback. GPS-based inference can augment this in future; current Inbox + alias learning flow is preserved.             | P0       | Implemented                                       |
| W-TK-06 | Ticket confirmation displays: ticket ID, work type, hours (regular + OT split), project, materials, **today's running hours**, **this week's running hours**. No dollar values.                       | P0       | Partial (hours shown; running totals need adding) |
| W-TK-07 | Natural-language ticket corrections: "#122 change hours to 6", "#122 city mall" → AI infers intent, sends confirmation prompt, applies on confirm.                                                    | P0       | Implemented                                       |
| W-TK-08 | Worker self-service onboarding via "JOIN" or "JOIN JTX" keyword triggers automated workflow.                                                                                                          | P0       | Implemented                                       |
| W-TK-09 | When system detects a delayed/queued message (see X-AU-04), bot asks worker to confirm work time.                                                                                                     | P0       | Not Started                                       |
| W-TK-10 | Non-scope time via keywords: "MEETING 1h", "WAIT 2h", "TRAVEL 30min". No photo required. Logs as non-scope ticket.                                                                                    | P1       | Not Started                                       |

### 2.3 Location Capture

| ID       | Requirement                                                                                                                                    | Priority | Status      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| W-GPS-01 | Capture GPS via WhatsApp native "Share Location" on first ticket of day per worker per project. Primary location anchor. No EXIF reliance.     | P0       | Not Started |
| W-GPS-02 | Location cached for work session; inherited by subsequent tickets within project radius.                                                       | P0       | Not Started |
| W-GPS-03 | Magic link with browser geolocation retained for consent capture and optional re-verification. Not used for clock-in/out. Link expires 10 min. | P1       | Not Started |
| W-GPS-04 | WhatsApp Live Location "Pro Mode" (8-hour share).                                                                                              | P2       | Not Started |
| W-GPS-05 | Worker onboarding captures explicit location-sharing consent per CA, IL, NY requirements. Timestamped, retrievable.                            | P0       | Not Started |
| W-GPS-06 | Tickets without GPS log successfully, flagged "Location not verified." Never silently dropped.                                                 | P0       | Not Started |

### 2.4 Ticket Identifier

| ID      | Requirement                                                                                                | Priority | Status    |
| ------- | ---------------------------------------------------------------------------------------------------------- | -------- | --------- |
| W-ID-01 | Ticket IDs follow `[CompanyCode]-[Sequence]` with per-company sequence starting at 10,000. Single ID only. | P0       | Needs Fix |
| W-ID-02 | Internal database ID may remain globally sequential but never exposed.                                     | P0       | Needs Fix |

### 2.5 Worker-Side Hours Display (Option B — hours only)

| ID     | Requirement                                                                                                                                                 | Priority | Status      |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| W-$-01 | Ticket confirmation shows hours logged today and this week. No dollar values.                                                                               | P0       | Partial     |
| W-$-02 | "TOTAL" / "TOTAL HOY" keyword returns today + week hours. No dollars.                                                                                       | P0       | Not Started |
| W-$-03 | Rate card absence does not block ticket logging.                                                                                                            | P0       | Implemented |
| W-$-04 | Manager edit triggers WhatsApp notification to worker within 1 hour: "Ticket ACE-10247: hours adjusted to 4 by manager. Today revised: 5h. Reason: [note]." | P0       | Not Started |

### 2.6 Orphan Worker Flow

| ID      | Requirement                                                                     | Priority | Status      |
| ------- | ------------------------------------------------------------------------------- | -------- | ----------- |
| W-OR-01 | Unknown numbers accepted; tickets logged under Orphan status.                   | P0       | Implemented |
| W-OR-02 | Orphan tickets stored with full evidence but locked from billing until claimed. | P0       | Implemented |
| W-OR-03 | Orphan worker receives confirmation message.                                    | P0       | Implemented |
| W-OR-04 | On claim, all historical orphan tickets transfer to worker record.              | P0       | Implemented |

---

## 3. Manager Web App Requirements

### 3.1 Navigation & Global Elements

| ID       | Requirement                                                                                                   | Priority | Status                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| M-NAV-01 | Primary nav: Work Captured, Inbox, Flagged, Timesheets, CO Packets, Projects, Members, Reports, Integrations. | P0       | Partial (need to add Flagged, CO Packets, Integrations; rename Transactions to Timesheets with rebuild) |
| M-NAV-02 | Global header shows: company name, user, running billable $ for current week.                                 | P0       | Not Started                                                                                             |
| M-NAV-03 | Persistent "Generate CO Packet" action when 1+ tickets selected.                                              | P0       | Not Started                                                                                             |

### 3.2 Work Captured (Ticket Grid)

| ID      | Requirement                                                                                                                                                                                                  | Priority | Status      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------- |
| M-WC-01 | Remove "AI Confidence %" placeholder. Replace with Review Status chip: Auto-approved (green) / Needs review (yellow) / Flagged (red).                                                                        | P0       | Needs Fix   |
| M-WC-02 | Replace "⚠ No Issues" with green check + "Verified."                                                                                                                                                         | P0       | Needs Fix   |
| M-WC-03 | Ticket card displays: ticket ID, status, project, scope, hours, labor $, billable $, location status, evidence count, worker, timestamp, time integrity indicator. Non-scope tickets labeled "Non-billable." | P0       | Partial     |
| M-WC-04 | Multi-select checkboxes + floating action bar (Package as CO / Flag / Mark Reviewed).                                                                                                                        | P0       | Not Started |
| M-WC-05 | Aggregate bar at top: total tickets, hours, billable $, ready-to-submit $, flagged count. Respects filters.                                                                                                  | P0       | Not Started |
| M-WC-06 | Filters: Status, Project, Worker, Date range, Flagged only, Location unverified only, Time integrity issues only, Non-scope only/exclude.                                                                    | P0       | Partial     |
| M-WC-07 | Inline edit for hours and materials. Triggers recalculation + worker notification (W-$-04).                                                                                                                  | P0       | Partial     |
| M-WC-08 | Expanded ticket view (Work Ticket detail — see Part B).                                                                                                                                                      | P0       | Not Started |
| M-WC-09 | Conversation thread renders multilingual content properly. No truncated fragments.                                                                                                                           | P0       | Needs Fix   |

### 3.3 Inbox Workflow (Existing Feature — Preserved)

| ID      | Requirement                                                        | Priority | Status      |
| ------- | ------------------------------------------------------------------ | -------- | ----------- |
| M-IB-01 | Inbox displays messages that couldn't be auto-routed to a project. | P0       | Implemented |
| M-IB-02 | Entries grouped by suspected project tag.                          | P0       | Implemented |
| M-IB-03 | Bulk assign to project; system learns alias for future routing.    | P0       | Implemented |
| M-IB-04 | Alias learning is node-scoped (company-level).                     | P0       | Implemented |

### 3.4 Flagged Queue

| ID      | Requirement                                                                                                                                                                                                                                       | Priority | Status      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| M-FL-01 | Dedicated Flagged tab with count badge.                                                                                                                                                                                                           | P0       | Not Started |
| M-FL-02 | Each flag displays: category (Scope Mismatch / Time Integrity / Location Unverified / Daily Hours Exceeded / Overlapping Tickets / Rate Missing), plain-language reason, suggested alternative values.                                            | P0       | Not Started |
| M-FL-03 | Three manager actions: Approve as-is, Adjust and approve (worker notified per W-$-04), Ask worker for clarification (structured multi-choice, max 3 options, never requests new photo). 24-hr timeout → manager decides with "Unverified" marker. | P0       | Not Started |
| M-FL-04 | System tracks flag resolution outcomes for model training.                                                                                                                                                                                        | P1       | Not Started |
| M-FL-05 | Flags never block billing or worker payout.                                                                                                                                                                                                       | P0       | Not Started |

### 3.5 CO Packets

| ID      | Requirement                                                                                                                                                                                                                                                                  | Priority | Status      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| M-CO-01 | CO Packets tab with status tabs: Draft / Submitted / Approved / Rejected / Paid.                                                                                                                                                                                             | P0       | Not Started |
| M-CO-02 | Multi-ticket packaging from Work Captured. Same-project validation. Non-scope tickets cannot be included.                                                                                                                                                                    | P0       | Not Started |
| M-CO-03 | Packet creation form: title, GC contact, cover note, markup adjustment per packet.                                                                                                                                                                                           | P0       | Not Started |
| M-CO-04 | Generated PDF includes: cover page, per-ticket detail pages (photo, GPS + address, timestamp, time integrity note if applicable, worker, scope, labor breakdown, materials, total), summary page (line items, markup, grand total), evidence appendix (message transcripts). | P0       | Not Started |
| M-CO-05 | PDF downloadable and emailable to GC from within app.                                                                                                                                                                                                                        | P0       | Not Started |
| M-CO-06 | On send, status auto-updates to Submitted with timestamp and recipient record.                                                                                                                                                                                               | P0       | Not Started |
| M-CO-07 | Manager logs outcome (Approved / Rejected / Partial / Paid) with optional notes and attached GC response.                                                                                                                                                                    | P1       | Not Started |

### 3.6 Status Progression

| ID      | Requirement                                                                                                                                 | Priority | Status       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ |
| M-ST-01 | Ticket lifecycle: Logged → Reviewed → Packaged → Submitted to GC → Approved/Rejected → Invoiced → Paid. Non-scope tickets stop at Reviewed. | P0       | Needs Update |
| M-ST-02 | Status transitions timestamped with actor.                                                                                                  | P0       | Partial      |
| M-ST-03 | Dashboard filterable by status.                                                                                                             | P0       | Partial      |
| M-ST-04 | Invoiced and Paid are manual-entry in v1.                                                                                                   | P1       | Not Started  |

### 3.7 Members

| ID      | Requirement                                                                                                                                                       | Priority | Status      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| M-MB-01 | Members tab: Active Workers + Unclaimed Numbers sections.                                                                                                         | P0       | Implemented |
| M-MB-02 | Unclaimed Numbers shows phone, ticket count, locked billable $, first/last seen, recent scope preview.                                                            | P0       | Partial     |
| M-MB-03 | Claim action: assign to existing worker OR create new worker record. Orphan tickets transfer and become billable.                                                 | P0       | Implemented |
| M-MB-04 | Active worker record: name, phone, rate card, tickets week/month, total hours paid, avg daily hours.                                                              | P1       | Partial     |
| M-MB-05 | Inline rate card editor per worker: regular rate, OT rate, OT threshold, prevailing wage flag, trade classification. Manager-side only — never exposed to worker. | P0       | Partial     |
| M-MB-06 | Bulk rate card CSV import for onboarding.                                                                                                                         | P1       | Not Started |

### 3.8 Projects

| ID      | Requirement                                                                                                                                                      | Priority | Status             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------ |
| M-PJ-01 | Project record: name, address (geocoded), site radius (required, no default) with guidance copy, GC contact, active/inactive, default markup %, start/end dates. | P0       | Needs Fix (radius) |
| M-PJ-02 | Project detail view: all tickets, total hours, total billable $, total submitted $, total paid $, outstanding $.                                                 | P0       | Partial            |
| M-PJ-03 | Pre-assign crews to projects for following day.                                                                                                                  | P2       | Not Started        |
| M-PJ-04 | Polygon-based boundaries for irregular sites.                                                                                                                    | P2       | Not Started        |

### 3.9 Timesheets (Rebuild — worker × week grid)

| ID      | Requirement                                                                                                                                                                                                              | Priority | Status                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------- |
| M-TS-00 | Timesheets view structured as worker × week, not ticket-per-row. Ticket-level detail lives in Work Captured and Work Ticket view. Current ticket-card "Transactions/Timesheets" replaced.                                | P0       | Not Started (rebuild) |
| M-TS-01 | Primary view: one row per worker per week. Columns: Worker, Mon–Sun hours, Total, Billable, Non-scope, Projects, Approval status, Action. Week navigation.                                                               | P0       | Not Started           |
| M-TS-02 | Row expansion shows: daily breakdown, tickets per day (links to Work Captured), flags, approval history.                                                                                                                 | P0       | Not Started           |
| M-TS-03 | Manager adjusts individual ticket hours via navigation to Work Captured edit. Worker notified per W-$-04.                                                                                                                | P0       | Not Started           |
| M-TS-04 | "Approve Week for Payroll" action. On approval, WeeklyTimesheet record created with snapshot: worker, week, total hours, billable/non-scope split, daily breakdown, project breakdown, ticket IDs, approver, timestamps. | P0       | Not Started           |
| M-TS-05 | Ticket edits to tickets in locked weeks create Post-approval adjustment records. Manager resolves: re-approve / process as correction / dismiss.                                                                         | P0       | Not Started           |
| M-TS-06 | Weekly payroll export (CSV + PDF) from locked WeeklyTimesheet only.                                                                                                                                                      | P1       | Not Started           |
| M-TS-07 | Pre-approval: weekly hours = live aggregation over tickets (no storage). On approval: WeeklyTimesheet snapshot persisted. Tickets remain source of truth.                                                                | P0       | Not Started           |

### 3.10 Reports (Analytics)

| ID      | Requirement                                                                                                                                      | Priority | Status        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------- |
| M-RP-00 | Current "Reports" tab (aggregation by project/worker) moves to Timesheets. New Reports tab is analytical.                                        | P0       | Needs Rebuild |
| M-RP-01 | In-app preview of today's Daily Report before 5 PM send.                                                                                         | P0       | Not Started   |
| M-RP-02 | Daily Report email: tickets logged, hours (billable + non-scope), billable $, flagged count, active workers, new orphans, time integrity issues. | P0       | Not Started   |
| M-RP-03 | Weekly summary: billable $ by project, by worker, CO packets submitted/approved/rejected, recovery ratio, hours approved for payroll.            | P1       | Not Started   |
| M-RP-04 | Recovered Revenue counter: total $ billed via Jentyx-generated COs that were approved and paid. Hero metric.                                     | P0       | Not Started   |
| M-RP-05 | Dashboard tiles: Recovered Revenue (90-day hero), Tickets this week, CO Packets submitted this month, Active Workers, Active Projects.           | P0       | Not Started   |
| M-RP-06 | Revenue Recovery tab: CO packet funnel chart, top recovering projects table, GC acceptance rates table.                                          | P0       | Not Started   |
| M-RP-07 | Operations, Quality & Flags, Exports tabs.                                                                                                       | P1       | Not Started   |

### 3.11 Integrations

| ID      | Requirement                                                                                                                                                                                                                      | Priority | Status                                |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------- |
| M-IN-01 | Dedicated Integrations tab in left nav.                                                                                                                                                                                          | P0       | Not Started                           |
| M-IN-02 | Available Integrations section: CSV Export (active links to ticket, timesheet, CO packet exports).                                                                                                                               | P0       | Partial (CSV exists; needs surfacing) |
| M-IN-03 | Coming Soon section with cards for: QuickBooks Online, QuickBooks Desktop (Contractor), Procore, Sage 300 CRE, Foundation Software, ADP Run, Gusto, Zapier/Webhooks. Each with logo, description, "Request Early Access" button. | P0       | Not Started                           |
| M-IN-04 | "Request Early Access" captures company, user, integration name, notes. Emails founder. Logs to internal table.                                                                                                                  | P0       | Not Started                           |
| M-IN-05 | Integrations page states current status honestly — no false claims of functionality.                                                                                                                                             | P0       | Not Started                           |

### 3.12 Super User / Admin (Existing — Preserved)

| ID      | Requirement                                                  | Priority | Status      |
| ------- | ------------------------------------------------------------ | -------- | ----------- |
| M-SU-01 | Super Users have access to all OM features across all nodes. | P0       | Implemented |
| M-SU-02 | Nodes Management: create/update construction companies.      | P0       | Implemented |
| M-SU-03 | Users Management: create Office Managers, assign to nodes.   | P0       | Implemented |
| M-SU-04 | Cross-Node Analytics view.                                   | P1       | Implemented |

---

## 4. Cross-Cutting Requirements

### 4.1 Dollar Visibility

| ID     | Requirement                                                         | Priority | Status      |
| ------ | ------------------------------------------------------------------- | -------- | ----------- |
| X-$-01 | Manager-side views surface dollar values (labor, billable, markup). | P0       | Partial     |
| X-$-02 | Currency formatting respects company locale (default USD).          | P0       | Partial     |
| X-$-03 | Worker-facing displays show hours only. No dollars.                 | P0       | Implemented |

### 4.2 Evidence & Audit Trail

| ID      | Requirement                                                                                                                                                                                                                               | Priority | Status      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| X-AU-01 | Ticket evidence record: photos as received (EXIF where available, not relied upon), GPS + source, both sent/received timestamps, worker phone + verified name, original message thread.                                                   | P0       | Partial     |
| X-AU-02 | Any manager edit logged with before/after values, editor identity, timestamp, optional reason.                                                                                                                                            | P0       | Not Started |
| X-AU-03 | Audit log exportable per ticket and per project.                                                                                                                                                                                          | P1       | Not Started |
| X-AU-04 | Time integrity computation: compare `wa_sent_timestamp` vs. `wa_received_timestamp`. Categories: Green <5 min, Yellow 5 min–4 hr, Red >4 hr (triggers W-TK-09). Missing sent timestamp → "Time source: received only," treated as Yellow. | P0       | Not Started |
| X-AU-05 | Daily hours sanity check: >14h logged in a day (configurable) → auto-flag.                                                                                                                                                                | P0       | Not Started |
| X-AU-06 | Overlapping ticket detection: same worker, overlapping time ranges → auto-flag.                                                                                                                                                           | P0       | Not Started |

### 4.3 Multilingual Support

| ID      | Requirement                                                           | Priority | Status              |
| ------- | --------------------------------------------------------------------- | -------- | ------------------- |
| X-LN-01 | English and Spanish at launch. Portuguese within 90 days post-launch. | P0       | Implemented (EN+ES) |
| X-LN-02 | AI parses mixed-language input.                                       | P0       | Implemented         |
| X-LN-03 | Manager app UI English-only at launch.                                | P1       | Implemented         |

### 4.4 Consent & Compliance

| ID      | Requirement                                                                                                                                            | Priority | Status      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------- |
| X-CP-01 | Worker onboarding captures explicit consent for: location sharing, AI processing, data retention. Timestamped, retrievable.                            | P0       | Partial     |
| X-CP-02 | STOP keyword revokes consent. Historical records preserved.                                                                                            | P0       | Not Started |
| X-CP-03 | Location data retention default 2 years, configurable.                                                                                                 | P1       | Not Started |
| X-CP-04 | Terms of Service states Jentyx is a work-capture and billing tool; customers responsible for payroll compliance, wage-hour law, worker classification. | P0       | Not Started |

### 4.5 Performance & Reliability

| ID      | Requirement                                                 | Priority | Status      |
| ------- | ----------------------------------------------------------- | -------- | ----------- |
| X-PF-01 | Bot acknowledgment ≤3s from server receipt.                 | P0       | Assumed Met |
| X-PF-02 | Full ticket confirmation ≤10s.                              | P0       | Assumed Met |
| X-PF-03 | Manager dashboard load ≤2s for up to 500 tickets.           | P1       | —           |
| X-PF-04 | CO Packet PDF generation ≤15s for packets up to 20 tickets. | P1       | Not Started |

### 4.6 Operational Metrics

| ID      | Requirement                                                                                                                                                  | Priority | Status      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------- |
| X-OP-01 | Track per-company AI classification accuracy (manager override rate within 48 hrs). Surface weekly to Jentyx ops. <60% on 50+ tickets triggers model review. | P0       | Not Started |
| X-OP-02 | Track flag resolution distribution.                                                                                                                          | P1       | Not Started |
| X-OP-03 | Track per-worker time integrity distribution.                                                                                                                | P2       | Not Started |

---

## 5. Data Model

**First-class persisted entities:**

- **Node** (construction company tenant)
- **Worker** — name, phone, rate card ref, active/orphan status
- **Project** — name, address, radius, aliases, GC contact, markup %
- **Ticket** — worker, project, type (change_order/non_scope), timestamps
  (sent + received), hours, work type, materials, attachments, GPS, status,
  audit log. **Source of truth.**
- **WeeklyTimesheet** — approval snapshot. Immutable. Created only on manager
  approval.
- **COPacket** — packet metadata, ticket refs, GC contact, markup, outcome, PDF.
- **ConsentRecord** — per-worker timestamped captures.
- **AuditLogEntry** — every edit, status change, approval, revocation.
- **ProjectAlias** — learned aliases mapped to projects per node.
- **IntegrationInterest** — "Request Early Access" captures.

**Derived views (not stored):**

- Draft timesheet grid (pre-approval)
- Daily Report content
- Reports analytics
- Dashboard counters

**Principle:** If a number appears on screen, it's either a stored field or a
live aggregation over tickets. Only approvals create snapshots.

---

## 6. Priority Summary

- **P0 (launch-blocking):** ~62 requirements
- **P1 (post-launch within 90 days):** ~15
- **P2 (future iteration):** ~8

---

# PART B: VIEW SPECS (REFERENCE)

View specs for Work Ticket detail, Timesheets worker × week grid, and Reports
analytics are documented in the view spec document. These are the three views
that require new design work. Everything else builds against existing UI
patterns.

**Summary of views to build:**

1. **Work Ticket detail view** — 11 sections across 2-column layout. Primary
   surface for per-ticket evidence, edit, flag resolution.
2. **Timesheets (worker × week grid)** — replaces current ticket-card view.
   Supports weekly payroll approval with snapshot persistence.
3. **Reports analytics** — Recovered Revenue hero + 4 summary tiles + 4 tabs
   (Revenue Recovery, Operations [P1], Quality & Flags [P1], Exports [P1]).

---

# PART C: PHASED DEVELOPMENT PLAN

---

## Sequencing Rationale

1. **CO Packets is the product.** Everything revolves around it. GC validation
   of the PDF format starts week 1, in parallel with engineering.
2. **Existing screens get polish before new screens get built.** Phase 0
   addresses all known issues in the current app (confidence display, dollar
   columns, ticket IDs, project radius).
3. **Work Ticket detail view is the second-biggest net-new build.** Required for
   flag resolution, evidence review, and demo polish.
4. **Timesheets rebuild and Reports restructure come later** because they're
   refinements, not revenue drivers.
5. **Integrations page is cheap but important** — ships in Phase 0 as a half-day
   build.
6. **Flagged queue ships late** because flags are soft signals; the product
   works without the dedicated tab initially (flags can surface inline on
   tickets).

---

## Phase 0: Foundation, Polish, GC Validation (Week 1)

**Goal:** Close known gaps in existing screens. Start GC validation in parallel.
Set up data model for later phases.

### Engineering work

**Worker flow:**

- Add "today: Xh, this week: Yh" running totals to ticket confirmations
  (W-$-01, W-$-02)
- Add "TOTAL" / "TOTAL HOY" keyword response

**Work Captured grid fixes:**

- Remove "AI Confidence 50%" placeholder → Review Status chip (M-WC-01)
- Fix "⚠ No Issues" → green check + "Verified" (M-WC-02)
- Add labor $ and billable $ columns (M-WC-03)
- Add running billable $ to global header (M-NAV-02)
- Add aggregate bar at top of grid (M-WC-05)
- Fix conversation thread rendering (no truncated "6 hora 1" fragments)
  (M-WC-09)

**Ticket ID format:**

- Migrate to `[CompanyCode]-[Sequence]` starting at 10,000 per node (W-ID-01,
  W-ID-02)

**Projects:**

- Remove 200m default radius; require field with guidance copy (M-PJ-01)

**Data model preparation:**

- Add `type` field to Ticket (default `change_order`, supports `non_scope`)
- Add `wa_sent_timestamp` and `wa_received_timestamp` columns
- Add structured flag fields (category, reason, resolution)
- Add COPacket entity scaffolding (tables, no UI yet)
- Add WeeklyTimesheet entity scaffolding
- Add IntegrationInterest table

**Integrations page (half-day build):**

- New nav item "Integrations"
- Static cards: CSV Export (active), QuickBooks Online, QuickBooks Desktop,
  Procore, Sage 300, Foundation, ADP Run, Gusto, Zapier/Webhooks
- "Request Early Access" capture + founder email

### Founder work (parallel, non-engineering)

- Draft CO Packet PDF mockup in Figma/Google Doc (cover, per-ticket detail,
  summary, evidence appendix)
- Identify 3 GCs through your design-partner customers
- Send mockup, ask: "Would you accept this as a CO submission? What's missing?"
- Iterate format based on feedback

### Exit criteria

- Demo of Work Captured grid looks professional, shows dollars, has aggregate
  totals
- Ticket IDs are in new format
- Projects require radius
- Integrations page live with interest capture working
- CO Packet mockup has feedback from ≥2 GCs

---

## Phase 1: CO Packets MVP (Weeks 2–4)

**Goal:** Build the revenue-recovery feature. This is the biggest single build.

### Build

**CO Packets tab:**

- Left nav item
- Status tabs: Draft / Submitted / Approved / Rejected / Paid
- Packet list with filtering

**Packet creation flow:**

- Multi-select tickets from Work Captured (M-CO-02)
- Same-project validation
- Packet form: title, GC contact (from project), cover note, markup override
  (M-CO-03)
- Preview before generation

**PDF generation (Puppeteer or similar):**

- Cover page: customer logo placeholder, project info, CO number, total $,
  signature block
- Per-ticket pages: photo, GPS + reverse-geocoded address, timestamp, time
  integrity note (once Phase 4 ships), worker name, scope, labor breakdown
  (hours × rate), materials, ticket total
- Summary page: line items, markup, grand total
- Evidence appendix: original message thread transcripts, Spanish preserved

**Delivery:**

- Download PDF
- Email to GC contact (SendGrid or Postmark)
- Status auto-update Draft → Submitted on send (M-CO-06)

**Outcome logging:**

- Manager logs GC response (Approved / Rejected / Partial / Paid) with notes +
  attached GC response file (M-CO-07)
- Feeds Recovered Revenue counter

**Status progression updates:**

- Ticket status: Packaged when added to a draft packet
- Ticket status: Submitted when packet is sent
- Ticket status: Approved/Rejected when packet outcome is logged
- Ticket status: Paid when manually marked

### Exit criteria

- Manager can create a CO packet end-to-end: select tickets → fill form →
  generate PDF → send to GC → log outcome
- PDF format has been approved by ≥2 GCs in pilot
- Recovered Revenue logic exists (even if counter isn't displayed yet)

---

## Phase 2: Work Ticket Detail View (Weeks 5–6)

**Goal:** Build the detailed per-ticket view. Required for flag resolution,
evidence review, demo polish.

### Build

All 11 sections per the view spec:

**Main column:**

- Ticket header (ID, status chip, worker, project, timestamp, time integrity
  indicator, actions)
- Evidence panel (photo grid, EXIF badges, voice transcription if present)
- Conversation thread (chronological, multilingual)
- AI summary block (regeneratable)
- Location panel (mini-map via Mapbox, reverse-geocoded address, verification
  method)

**Sidebar:**

- Status & actions (breadcrumb, contextual buttons)
- Scope & materials (inline edit)
- Hours & labor breakdown (inline edit, auto-recalc)
- Billable summary (markup override)
- Flags (conditional, per-flag actions)
- Audit trail (collapsible, CSV export)

### Supporting features

**Manager edit → worker notification (W-$-04):**

- On any ticket edit that changes hours, system queues WhatsApp message to
  worker
- Sent within 1 hour of edit
- Format: "Ticket [ID]: hours adjusted to [N]h by manager. Today revised: [X]h.
  Reason: [note if provided]."

**Audit log (X-AU-02):**

- Every edit logged with before/after, editor, timestamp, optional reason
- Displayed in audit trail section

**Map integration:**

- Mapbox tiles and geocoding
- Reverse geocode on ticket creation, cache address

**Time integrity indicators:**

- Compute green/yellow/red per ticket using sent vs. received timestamps
  (X-AU-04)
- Display on ticket cards (Phase 0 placeholder → real data now)

### Exit criteria

- Demo opens any ticket, shows complete evidence bundle
- Edit hours → see recalculation + worker receives WhatsApp notification
- Audit trail shows all changes
- Time integrity indicator reflects real data

---

## Phase 3: Timesheets Rebuild (Week 7)

**Goal:** Replace the broken "Transactions/Timesheets" ticket-card view with the
worker × week grid.

### Build

**Delete old view.** The current ticket-card "Timesheets/Transactions"
implementation is replaced.

**Worker × week grid (M-TS-01):**

- Row per worker per week
- Columns: Worker, Mon–Sun, Total, Billable, Non-scope, Projects, Status, Action
- Aggregate row at bottom
- Week navigation (prev/next/jump-to-date)
- Filter/search bar

**Row expansion (M-TS-02):**

- Daily breakdown with tickets per day
- Ticket IDs clickable → Work Ticket detail view
- Flags this week section
- "Approve Week" / "View" action

**Approval flow (M-TS-04):**

- "Approve Week for Payroll" modal: summary + checkbox + optional note
- WeeklyTimesheet record creation on approve
- Lock state display
- Approved chip with timestamp + approver

**Post-approval adjustments (M-TS-05):**

- Detect ticket edits to locked-week tickets
- Create PostApprovalAdjustment record
- Display inline as "⚠ 1 adjustment"
- Three resolution options: re-approve / process as correction / dismiss

**Exports (M-TS-06):**

- CSV export of approved weeks (payroll format)
- PDF export per worker per approved week

### Exit criteria

- Manager walks through full payroll workflow: review week → approve each worker
  → export CSV → see locked state → handle an adjustment
- Screen answers "who do I pay this week" in under 10 seconds
- No redundancy with Work Captured

---

## Phase 4: Reports Restructure (Week 8)

**Goal:** Move aggregation into Timesheets (done in Phase 3). Build new
analytical Reports.

### Build

**Move existing:**

- Current "Reports" By Project / By Member aggregation → absorbed into
  Timesheets row expansion and weekly aggregate row

**Build new Reports tab:**

**Hero tile (M-RP-04, M-RP-05):**

- Recovered Revenue — Last 90 Days
- Large dollar display
- Breakdown: Submitted / Approved / Paid / Recovery Rate
- Delta vs. prior 90 days

**Summary tiles (M-RP-05):**

- Tickets this week
- CO Packets submitted this month
- Active Workers this week
- Active Projects

**Revenue Recovery tab (M-RP-06):**

- CO packet funnel chart (packaged → submitted → approved → paid)
- Recovered revenue over time (line chart, 12 months)
- Top recovering projects table
- GC acceptance rates table

**Date range selector:**

- Persistent in top-right: Last 7/30/90 days, This/Last Month, This Quarter,
  Custom

**Deferred to post-launch (P1):**

- Operations tab
- Quality & Flags tab
- Exports tab

### Exit criteria

- Reports tab shows Recovered Revenue hero prominently
- Funnel chart shows the CO lifecycle
- Date range selector works across tab

---

## Phase 5: Flagged Queue + Auditor (Week 9)

**Goal:** Surface the anti-bluff feature that's been promised but invisible.

### Build

**Auditor server-side logic:**

- Scope Mismatch: heuristic combining AI classification confidence + claimed
  hours sanity. MVP, not production-grade.
- Time Integrity: already computed in Phase 2
- Location Unverified: already tracked
- Daily Hours Exceeded: >14h configurable per company (X-AU-05)
- Overlapping Tickets: time range overlap detection (X-AU-06)
- Rate Missing: worker has no rate card

**Flagged queue view:**

- Dedicated tab with count badge (M-FL-01)
- Flag card per ticket: category, reason, confidence, suggested alternative
  (M-FL-02)
- Three actions per flag (M-FL-03):
  - Approve as-is
  - Adjust and approve (triggers W-$-04 notification)
  - Ask worker for clarification

**Ask worker flow:**

- Manager picks from templated multi-choice questions OR writes custom (max 3
  options)
- Bot sends structured question via WhatsApp
- Worker response captured in conversation thread
- 24-hour timeout → manager decides unilaterally with "Unverified" marker

**Delayed message handling (W-TK-09):**

- When time integrity = Red (>4 hrs), bot asks: "I got your message at 5 PM —
  did you do this now or earlier?"
- Worker responds; ticket timestamped accordingly or flagged "Time unverified"

### Exit criteria

- Demo shows flagged ticket, walks through structured clarification flow, shows
  worker response back on desktop
- Auditor is finally visible as a feature

---

## Phase 6: Launch Readiness (Week 10)

**Goal:** Everything that isn't a feature but blocks launch.

### Compliance & legal

- Terms of Service with payroll compliance disclaimer (X-CP-04)
- Privacy policy
- Consent capture validation at worker onboarding — English + Spanish (X-CP-01)
- State-specific consent language for CA, IL, NY (W-GPS-05)
- STOP keyword revocation (X-CP-02)

### Infrastructure

- WhatsApp Business API production credentials confirmed
- Error monitoring (Sentry)
- Product analytics (PostHog) — instrument key events from day one
- Database backup strategy
- Basic rate limiting on API endpoints
- Daily Report email at 5 PM via cron (M-RP-01, M-RP-02)

### Operational metrics instrumentation (X-OP-01)

- Per-company AI classification accuracy tracking
- Weekly internal report generation

### Onboarding playbook (non-software, blocking)

- Rate card intake template (CSV or form)
- Project setup walkthrough script
- Worker claim walkthrough script
- First-customer-onboarding checklist (2-hour founder-led session)

### Pre-launch QA

End-to-end test coverage:

- New company → first project → first worker → first ticket → first CO packet →
  first approval
- Spanish-language worker flow
- Orphan claim flow
- Delayed/queued message handling
- Flag flow (trigger each flag category, resolve via each action)
- Multi-tenant isolation (node A cannot see node B data)

### Sales readiness

- One-page product sheet
- Demo script (10 min, rehearsed)
- Pricing page copy
- 3 reference customers willing to take calls

### Exit criteria

- Can sign up a new customer from scratch; they produce their first CO packet
  within 48 hours
- Demo flow runs without incident
- Analytics captures every key event

---

## Phase 7: Launch + Support (Week 11+)

**Launch activities:**

- First 3 paying customers onboarded in person (founder-led calls)
- Daily check-ins with early customers for first 2 weeks
- Bug triage queue

**Post-launch priorities (derived from real feedback, not pre-committed):**

- Top 5 missing/broken things
- First integration build (QuickBooks Online likely)
- Operations and Quality & Flags Reports tabs
- Weekly report emails
- Bulk CSV import for rate cards
- Non-scope keyword logging (W-TK-10)

---

## Parallel Workstreams (if 2 engineers)

**Workstream A — Frontend:** Phase 0 grid fixes → Phase 1 CO Packet UI → Phase 2
Work Ticket view → Phase 3 Timesheets rebuild → Phase 4 Reports tiles

**Workstream B — Backend:** Phase 0 data model → Phase 1 PDF generation engine +
email delivery → Phase 2 map integration, geocoding, audit log → Phase 5 Auditor
logic

**Workstream C — Worker flow + integrations:** Phase 0 running totals,
Integrations page → Phase 2 W-$-04 notifications → Phase 5 delayed-message
handling, structured clarification → Phase 6 analytics instrumentation

---

## Risk Register

| Risk                                             | Likelihood | Impact   | Mitigation                                                      |
| ------------------------------------------------ | ---------- | -------- | --------------------------------------------------------------- |
| PDF rejected by GCs                              | Medium     | Critical | Validate with 3 GCs in Phase 0 before building                  |
| AI accuracy below 60% in production              | Medium     | High     | X-OP-01 tracking from day one; model review if threshold missed |
| Rate card onboarding >2 hrs/customer             | High       | High     | Template-driven intake; wizard by customer #10 if slow          |
| WhatsApp Business API issues                     | Low        | Critical | Confirm production-ready in Phase 0                             |
| Worker notification spam                         | Medium     | Medium   | Monitor support; add batching if noisy                          |
| Time integrity false positives annoying managers | Medium     | Low      | Adjust thresholds after first 1,000 tickets                     |
| Scope creep from prospect feedback               | High       | Medium   | Maintain discipline: no new features pre-launch                 |

---

## Metrics to Instrument from Day One (Phase 0)

**Product health:**

- Tickets logged per worker per day
- AI classification accuracy (X-OP-01)
- Time to first CO packet per customer
- CO packet acceptance rate by GC
- Recovered revenue per customer per month

**User engagement:**

- Daily active workers
- Daily active managers
- Weekly timesheet approval rate
- Flag resolution time (median)

**Operational:**

- WhatsApp delivery success rate
- AI inference latency
- PDF generation latency
- Time integrity distribution

**Business:**

- Customers activated (first CO packet submitted)
- Retention at 30/60/90 days
- NPS at day 30
- Referral attribution

---

## Technology Decisions (Locked)

- **LLM:** Llama 3.2 (current)
- **WhatsApp:** Business API via Twilio
- **Frontend:** Next.js/React (jtxfield.vercel.app)
- **Map provider:** Mapbox (Phase 2)
- **PDF generation:** Puppeteer (Phase 1)
- **Email delivery:** SendGrid or Postmark (Phase 1)
- **Error monitoring:** Sentry (Phase 6)
- **Product analytics:** PostHog (Phase 6)
- **Database:** existing (assumed Postgres)

---

## Timeline Summary

| Phase | Weeks | Deliverable                                                  |
| ----- | ----- | ------------------------------------------------------------ |
| 0     | 1     | Polish + data model prep + GC validation + Integrations page |
| 1     | 2–4   | CO Packets MVP                                               |
| 2     | 5–6   | Work Ticket detail view                                      |
| 3     | 7     | Timesheets rebuild                                           |
| 4     | 8     | Reports restructure                                          |
| 5     | 9     | Flagged queue + Auditor                                      |
| 6     | 10    | Launch readiness                                             |
| 7     | 11+   | Launch + support                                             |

**Solo founder timeline:** 14–16 weeks realistic **Founder + 1 engineer:** 10–11
weeks realistic **Founder + 2 engineers:** 8–9 weeks realistic

---

## What This Plan Is Not

- Sprint-level tickets (convert phases to your task tool at implementation time)
- Database schema (derivable from Section 5 entity model, needs DDL pass)
- API contracts (document as you build)
- Hiring plan
- Financial model
- Marketing launch plan

---

## Build Discipline Reminders

1. **CO Packets is the product.** Don't let anything else delay it.
2. **GC validation starts in week 1, not week 4.** Show mockups to GCs before
   writing PDF code.
3. **Polish before features.** Fix Work Captured grid issues in Phase 0 —
   they're visible in every demo.
4. **Don't overbuild Timesheets/Reports.** They're supporting, not hero.
5. **Flagged queue can slip.** If timeline compresses, it's the first thing to
   defer to post-launch.
6. **Don't build integrations, surface them.** The Integrations page is a sales
   tool, not a feature build.
7. **No new ideas get added to v1.2.** Every "what if we also..." goes to a
   post-launch file.
8. **Ship to 3 paying customers before iterating further.** Reality > opinion.

---

**This is v1.2. Ship it.**
