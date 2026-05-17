# Jentyx Field — v1.2 Spec Recap + Detailed View Specs

**Date:** April 19, 2026
**Purpose:** Consolidated reference for build & ship. Full v1.2 requirements followed by detailed UX specs for three views that need design work: Work Ticket, Timesheets, Reports.

---

# Part 1: V1.2 Requirements Recap

## 1. Core Principles

- **Fluid work model.** No clock-in/clock-out. Tickets are the single source of truth for billable hours and payroll hours. Workers are paid for work performed.
- **Hours-only for workers.** No dollar values shown to workers by the bot. Rate conversations happen between manager and worker outside Jentyx.
- **WhatsApp-first.** SMS deferred until WhatsApp traction proven (P2).
- **Workers never hit dead ends.** Every uncertain AI state degrades to one additional question.
- **Tickets are atomic. Everything else is a view or an approval snapshot.**
- **Evidence is immutable.** Every ticket carries photo, GPS, timestamps, worker identity, original message thread.

## 2. Worker-Facing Flow (WhatsApp)

**Message initiation:** Worker sends photo, voice, or text (implemented).

**AI classification with tiered fallback:**
- ≥75% confidence: proceed silently
- 50–74%: one confirmation question
- <50%: ask directly with numbered options

**Material inference:** Never uses "or" in final ticket. Below 80% confidence triggers one clarifying question (max 3 options).

**Project assignment (three layers):**
1. GPS within project radius → auto-assign with confirmation
2. Same project as last 3 days → default with confirmation
3. Numbered list (capped at 5) if above fail or multiple projects overlap

**Language:** Per-message mirroring. Spanish in → Spanish out. English in → English out. No sticky company default.

**Location capture:**
- WhatsApp native "Share Location" on first ticket of day (primary anchor)
- Cached for the work session, inherited by subsequent tickets within project radius
- No EXIF reliance (WhatsApp strips it)
- Consent captured at onboarding with state-specific language

**Ticket confirmation:** Shows ticket ID, work type, hours (regular + OT split), project, materials, today's hours, this week's hours. **No dollars.**

**Non-scope time:** Worker can text "MEETING 1h", "WAIT 2h", "TRAVEL 30min" — logs payable-but-non-billable hours.

**Offline/queued messages:** System detects gap between device-send and server-receive timestamps. Categories: Green (<5 min), Yellow (5 min–4 hr), Red (>4 hr). Red triggers worker confirmation: "I got your message at 5 PM — did you do this now or earlier?"

**Manager adjustment notifications:** When manager edits a ticket's hours, worker gets a WhatsApp message within 1 hour: "Ticket adjusted to 4h. Today revised: 5h. Reason: [note]."

**Orphan flow:** Unknown numbers are accepted, tickets stored and locked. On claim, history transfers to the worker record.

## 3. Manager App — Navigation

Primary nav: Work Captured, Flagged, Timesheets, CO Packets, Projects, Members, Reports.

Global header: company, user, **running billable $ for current week**.

## 4. Manager App — Core Features

**Work Captured:** Ticket grid with review status chips, dollar values, location status, time integrity indicators. Multi-select → CO packet or batch actions. Inline edit triggers worker notification.

**Flagged:** Dedicated queue with flag categories (Scope Mismatch, Time Integrity, Location Unverified, Daily Hours Exceeded, Overlapping Tickets). Three manager actions: Approve, Adjust, or Ask for Clarification (structured multi-choice, never requests new photo). Flags never block billing or payout.

**CO Packets:** Multi-ticket packaging per project. Generated PDF includes cover, per-ticket evidence pages, summary, and message transcript appendix. Downloadable and directly emailable to GC. Non-scope tickets cannot be packaged.

**Timesheets:** Worker × week grid with weekly approval. Full spec in Part 2.

**Members:** Active Workers + Unclaimed Numbers. Claim flow transfers orphan tickets.

**Projects:** Required radius (no default). Per-project billable dashboard.

**Reports:** Analytics, not timesheet aggregation. Full spec in Part 2.

## 5. Data Model

**Persisted entities:** Company, Worker, Project, Ticket, WeeklyTimesheet (approval snapshots only), COPacket, ConsentRecord, AuditLogEntry.

**Derived views (not stored):** Draft timesheets, Daily Report content, Reports analytics, dashboard counters.

**Principle:** Tickets are the source of truth. Anything displayed is either a ticket field or a live aggregation over tickets. Only approval events create persisted snapshots.

## 6. Auditor / Flag Categories

- **Scope Mismatch:** Photo evidence doesn't match claimed scope/hours
- **Time Integrity:** Message sent-vs-received gap >4 hours
- **Location Unverified:** No GPS captured for this ticket
- **Daily Hours Exceeded:** Worker logged >14h in a single day
- **Overlapping Tickets:** Two tickets from same worker with overlapping time ranges
- **Rate Missing:** Worker has no rate card configured (doesn't block logging, just surfaces for manager)

## 7. Compliance & Evidence

- Consent captured at worker onboarding (location, AI processing, data retention)
- Workers can revoke via STOP keyword; historical records preserved
- Terms of Service state Jentyx is a work-capture and billing tool; customers responsible for payroll compliance
- Every ticket evidence record is immutable; edits logged separately

## 8. Priority Counts

~58 P0 requirements · ~13 P1 · ~7 P2

---

# Part 2: Detailed View Specs

## View 1: Work Ticket (expanded detail view)

### Purpose

Single source of truth for one ticket. Every piece of evidence, every status transition, every edit. This is what a manager opens when they need to understand, verify, or act on a specific ticket.

### Entry points

- Click any ticket card in Work Captured grid
- Click any ticket ID in Flagged queue
- Click any ticket reference from Timesheets drilldown
- Click any ticket in a CO Packet draft/detail view

### Layout structure

The view is a two-column layout on desktop, single-column stacked on mobile-responsive.

**Left column (primary — 60% width):**
1. Ticket header
2. Evidence panel (photos)
3. Conversation thread
4. AI summary block
5. Location panel

**Right column (sidebar — 40% width):**
1. Status & actions
2. Scope & materials
3. Hours & labor breakdown
4. Billable summary
5. Flags (if any)
6. Audit trail

### Section 1.1 — Ticket header

At the top of the view, always visible.

Fields:
- Ticket ID (large, e.g., `ACE-10247`)
- Review status chip (Auto-approved / Needs review / Flagged)
- Worker name + phone (e.g., `Mike Hernandez · +1 510-219-8037`)
- Project name with location pin (clickable → Project view)
- Timestamp (e.g., `Logged Fri Apr 17, 4:12 PM PT`)
- Time integrity indicator (green dot / yellow dot / red dot with tooltip)

Close/back button, "Edit" button, "Flag for review" button (if not already flagged).

### Section 1.2 — Evidence panel (photos)

Grid of attached photos, clickable to expand lightbox. Shows:
- Primary photo first (largest)
- Secondary photos smaller below
- For each photo: filename, file size, upload timestamp
- Badge indicating EXIF availability: "GPS data available" / "No GPS data" / "EXIF stripped by WhatsApp"

If worker sent a voice note, show a waveform player with transcription below. Transcription shows original language + English translation if Spanish.

Empty state: "No photos attached. Worker submitted text-only."

### Section 1.3 — Conversation thread

Chronological, bot and worker turns clearly distinguished. Renders multilingual content properly.

Format:
```
Fri Apr 17, 4:11 PM
[Worker] 📸 photo + "trellis instalado"

Fri Apr 17, 4:11 PM
[Bot] Got it — gardening/landscaping work. How many hours?

Fri Apr 17, 4:12 PM
[Worker] 6

Fri Apr 17, 4:12 PM
[Bot] Which project?
1. City Mall Project
2. Downtown Office Renovation

Fri Apr 17, 4:12 PM
[Worker] 2

Fri Apr 17, 4:12 PM
[Bot] ✅ Logged ACE-10247 — 6h at Downtown Office
```

Each message includes:
- Sender label (Worker / Bot)
- Timestamp
- Message content (text, photo thumbnail, or both)
- Language tag if mixed-language

Collapsible if thread is long (>10 turns).

### Section 1.4 — AI summary block

A rewritten, cleaned summary of what was captured. Different from the raw conversation.

Example:
> Worker installed plant protection/trellis structure at Downtown Office Renovation, 6 hours. Materials used: wooden posts, netting, trellis frame. Evidence photo shows completed installation.

If AI confidence on any element was below threshold, inline tags indicate:
> Worker installed **[trellis / plant support — 70% confidence]** at Downtown Office Renovation, 6 hours.

Manager can regenerate the summary or edit it manually.

### Section 1.5 — Location panel

Mini-map (embedded) showing:
- Pin at the ticket's GPS coordinates
- Circle showing project radius
- Address (reverse-geocoded)

Below the map:
- Verification method: "WhatsApp Share Location" / "Inherited from previous ticket (3h ago, 120m away)" / "Browser geolocation (magic link)" / "Not verified"
- Coordinates: `32.7767° N, 96.7970° W`
- Distance from project center: `45m inside site radius`

If no GPS, show empty map with message: "Location not captured for this ticket. Inherited location was unavailable."

### Section 1.6 — Status & actions (sidebar)

Status breadcrumb:
```
Logged → Reviewed → Packaged → Submitted to GC → Paid
  ●        ●          ○            ○               ○
```

Current status highlighted. Hover each to see timestamp and actor.

Action buttons (contextual, change based on status):
- If Logged: "Mark Reviewed", "Package as CO", "Flag for Review"
- If Reviewed: "Package as CO", "Flag for Review", "Unreview"
- If Packaged: "Open Packet", "Remove from Packet"
- If Submitted: read-only status, "Log GC Response"
- All statuses: "Edit", "Add to Flagged"

### Section 1.7 — Scope & materials (sidebar)

Two editable fields:

**Work scope:**
> Installation of plant protection / support structures

**Materials:**
> Wooden posts, netting, trellis frame

Both are inline-editable (click to edit, save on blur). Changes logged to audit trail and trigger worker notification if hours change separately.

### Section 1.8 — Hours & labor breakdown (sidebar)

```
Hours logged            6.0h
  Regular               4.0h
  Overtime              2.0h
  Non-scope             0.0h

Rate card               Journeyman Electrician
  Regular rate          $52.00 / hr
  OT rate               $78.00 / hr

Labor cost
  Regular (4h × $52)    $208.00
  OT (2h × $78)         $156.00
  ────────────────────────────
  Total labor           $364.00
```

Hours are inline-editable. Changes recompute labor cost and billable amount instantly. Edit triggers worker notification.

### Section 1.9 — Billable summary (sidebar)

```
Labor cost              $364.00
Materials (est.)         $85.00
                         ──────
Subtotal                $449.00
Markup (1.5x)           $224.50
                         ──────
Billable                $673.50
```

Markup is inline-adjustable per ticket (overrides project default).

If ticket is non-scope: shows "Non-billable" in place of billable summary.

### Section 1.10 — Flags (sidebar, conditional)

Only visible if ticket has active flags.

```
⚠ Flags (2)

Scope Mismatch
"Photo shows single trellis frame; 6h claimed may be
excessive for scope visible."
Confidence: Medium
[Approve as-is] [Adjust hours] [Ask worker]

Time Integrity
"Message sent 4h after implied work time. Worker
confirmed: 'did this earlier today, around 12 PM.'"
Confidence: High
[Accept confirmation] [Mark unverified]
```

Each flag has its own actions. Flag resolutions are tracked separately in the audit trail.

### Section 1.11 — Audit trail (sidebar, collapsible)

Chronological log of every event touching this ticket:

```
Apr 17, 4:12 PM · System · Ticket logged
Apr 17, 4:13 PM · System · Auto-flag: Scope Mismatch
Apr 17, 4:45 PM · Downtown Manager · Edited hours: 6 → 5
Apr 17, 4:45 PM · System · Worker notified of adjustment
Apr 17, 5:01 PM · Downtown Manager · Flag resolved: Approved with adjustment
Apr 17, 5:02 PM · Downtown Manager · Status: Logged → Reviewed
```

Each entry: timestamp, actor, action, details (expandable). Export as CSV option.

---

## View 2: Timesheets (rebuilt — worker × week grid)

### Purpose

Answer one question: **"How many hours do I pay each worker this week?"**

Replace the current ticket-card "Timesheets" view (which duplicates Work Captured). Ticket-level detail lives in Work Captured and the Work Ticket view; Timesheets is about worker-week aggregation and weekly approval for payroll.

### Layout structure

Full-width table layout. Filter/action bar on top, week navigation, main grid, expandable rows.

### Section 2.1 — Header & week navigation

Top of page:
```
Timesheets                                     [Export Approved Weeks ▾]

← Week of April 14–20, 2026 →              [This Week] [Jump to date ▾]
```

Prev/next week buttons, current week indicator, jump-to-date picker for historical weeks.

### Section 2.2 — Filters & summary bar

```
┌────────────────────────────────────────────────────────────────────┐
│ Search workers...          Status: All ▾    Project: All ▾         │
│                                                                    │
│ Week summary:   7 workers · 243 hours · 2 approved · 5 draft      │
│                 228 billable · 15 non-scope                        │
└────────────────────────────────────────────────────────────────────┘
```

### Section 2.3 — Main grid

One row per worker. Columns:

| Worker | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Total | Billable | Non-scope | Projects | Status | Action |

Example rows:

```
Mike Hernandez          5.0  6.0  —   7.0 10.0  —   —   28.0h  26.0h  2.0h  City Mall +1       Draft        [Approve Week]
MH · +1 510-219-8037

Juan Martinez           8.0  8.0  8.0  8.0  4.0  —   —   36.0h  34.0h  2.0h  Downtown Office   Approved ✓   [View]
JM · +1 415-555-0123                                                                            Apr 19, 2pm

⚠ +1 555-123-4567        4.0  —   —   —   —   —   —    4.0h   4.0h   —    City Mall          Unclaimed    [Claim worker]
(unclaimed orphan)
```

Row details:
- Worker name + phone + initials
- Hours per day (blank if zero, actual value if >0)
- Total for the week
- Split into Billable vs Non-scope
- Projects worked (up to 2 shown, "+N" if more — clickable to expand)
- Status chip
- Action button (context-dependent)

Aggregate row at bottom:
```
Total                  25.0 22.0 16.0 23.0 27.0  —    —   113.0h 108.0h 5.0h
```

### Section 2.4 — Row expansion (drilldown)

Click any worker row to expand inline. Shows:

**Daily breakdown for the expanded worker:**

```
▼ Mike Hernandez — Week of April 14–20

  Monday, April 14                                    5.0h  [$260]
    09:15 · ACE-10240 · City Mall · 3h · Electrical rough-in
    14:00 · ACE-10241 · City Mall · 2h · Panel mount
    
  Tuesday, April 15                                   6.0h  [$312]
    08:45 · ACE-10242 · City Mall · 6h · Conduit run
    
  Wednesday, April 16                                 Not worked
  
  Thursday, April 17                                  7.0h  [$364]
    10:30 · ACE-10246 · Downtown Office · 5h · Trellis install
    15:30 · ACE-10247 · Downtown Office · 2h · Cleanup
    MEETING · 1h · Safety briefing  (non-scope)
    
  Friday, April 18                                   10.0h  [$572]
    07:00 · ACE-10250 · Downtown Office · 8h · Irrigation
    WAIT · 1h · Materials delivery delay  (non-scope)
    
  Flags this week:
    ⚠ ACE-10250 — Daily hours approaching limit (10h logged)
    
  [Collapse]      [Approve Week]      [View all tickets in Work Captured]
```

Ticket IDs are clickable, opening the Work Ticket detail view in a side panel or new tab.

### Section 2.5 — Approval flow

Click "Approve Week" on a worker row → modal:

```
┌─────────────────────────────────────────────────┐
│  Approve Week for Payroll                       │
│                                                 │
│  Worker:         Mike Hernandez                 │
│  Week:           Apr 14–20, 2026                │
│                                                 │
│  Total hours:    28.0h                          │
│    Billable:     26.0h  ($1,508)                │
│    Non-scope:    2.0h   ($104)                  │
│                                                 │
│  Projects:       City Mall Project, Downtown    │
│                  Office Renovation              │
│                                                 │
│  Tickets:        7 tickets (click to review)    │
│  Flags resolved: 1 Scope Mismatch (approved)    │
│                                                 │
│  ☐ I've reviewed these hours and approve for    │
│    payroll. This action locks the week.         │
│                                                 │
│  Optional note: [                    ]          │
│                                                 │
│  [Cancel]                          [Approve →]  │
└─────────────────────────────────────────────────┘
```

On approve:
- WeeklyTimesheet record created with snapshot
- Week locked (shown with ✓ Approved chip + timestamp + approver)
- Can be exported to CSV/PDF
- Subsequent ticket edits to that week's tickets create "Post-approval adjustment" entries

### Section 2.6 — Post-approval adjustments

If a ticket from a locked week is edited, the row shows:

```
Mike Hernandez          5.0  6.0  —   7.0 10.0  —   —   28.0h  26.0h  2.0h   City Mall +1     Approved ✓     [View]
                                                                                                ⚠ 1 adjustment
```

Clicking the adjustment notice shows:

```
Post-approval adjustments to Apr 14–20 (locked)

Apr 22 · Downtown Manager · ACE-10247 hours: 2.0 → 1.5
  Change: -0.5h  ($-26.00 billable)
  
  [Re-approve week with adjustments]    [Process as correction]
  [Dismiss adjustment — keep original]
```

Three resolution options:
- **Re-approve:** Invalidates old lock, creates new WeeklyTimesheet snapshot with adjusted values
- **Process as correction:** Keeps original locked week; creates separate adjustment record for next payroll cycle
- **Dismiss:** Reverts the ticket edit, keeps locked week as-is

### Section 2.7 — Empty states

- **No workers this week:** "No activity logged this week. When workers send tickets, they'll appear here."
- **All workers approved:** "✓ All 7 workers approved for payroll. Ready to export."
- **Unclaimed orphan rows:** Shown with warning icon, inline "Claim worker" action that navigates to Members tab with the phone pre-selected.

### Section 2.8 — Export

"Export Approved Weeks" dropdown offers:
- CSV (payroll format — one row per worker per week)
- PDF (signed weekly timesheet per worker, includes evidence summary)
- Both require the week to be in Approved status; unlocked weeks are not exportable.

### What this view does NOT show

- Per-ticket cards (that's Work Captured)
- Photos, scope descriptions, or detailed evidence (that's Work Ticket view)
- Dollar values to workers (this is manager-side only)
- Analytics or trends (that's Reports)

---

## View 3: Reports (analytics, reclassified)

### Purpose

Answer three questions distinct from Timesheets:
1. **Am I actually recovering money?** (the hero narrative)
2. **Where is work happening and how much?** (operational visibility)
3. **How well is the system working?** (quality & flag signals)

The current UI labeled "Reports" (showing hours by worker/project) is **moved to Timesheets** as the aggregation view. Real Reports is analytical.

### Layout structure

Dashboard with tiles at top, tab selector below, chart/table area.

### Section 3.1 — Hero tile: Recovered Revenue

Top of page, full-width or large tile:

```
┌───────────────────────────────────────────────────────────────────┐
│  💰 Recovered Revenue — Last 90 Days                              │
│                                                                   │
│     $47,230                                                       │
│     Change orders submitted and paid via Jentyx                   │
│                                                                   │
│     ▲ 23% vs. prior 90 days                                       │
│                                                                   │
│     Submitted: $68,400 · Approved: $52,100 · Paid: $47,230        │
│     Recovery rate: 69%                                            │
└───────────────────────────────────────────────────────────────────┘
```

This is the renewal-conversation number. Should always be visible first.

### Section 3.2 — Summary tiles row

Four secondary tiles:

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Tickets      │  │ CO Packets   │  │ Active       │  │ Active       │
│ This week    │  │ Submitted    │  │ Workers      │  │ Projects     │
│              │  │ This month   │  │ This week    │  │              │
│    47        │  │    12        │  │    8         │  │    3         │
│ ▲ 8 vs last  │  │ 7 paid       │  │ of 10 total  │  │              │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

### Section 3.3 — Tab selector

Four tabs below summary:
- **Revenue Recovery** (default)
- **Operations**
- **Quality & Flags**
- **Exports**

### Section 3.4 — Tab: Revenue Recovery

**Chart 1 — CO Packet funnel (Sankey or stacked bar)**

Shows month-over-month:
- Tickets packaged
- Packets submitted to GC
- Packets approved
- Packets paid

Visual conversion at each stage. Hover to see count and dollar amount.

**Chart 2 — Recovered revenue over time (line chart)**

Monthly recovered revenue for last 12 months. Overlay with tickets-logged count for context.

**Table — Top recovering projects**

| Project | Tickets | Submitted $ | Paid $ | Recovery Rate |
|---|---|---|---|---|
| Downtown Office Renovation | 34 | $28,400 | $24,100 | 85% |
| City Mall Project | 52 | $31,200 | $18,800 | 60% |
| Highway 5 Electrical | 18 | $8,800 | $4,330 | 49% |

Sortable columns.

**Table — GC acceptance rates**

For customers with multiple GCs:

| GC | Packets Submitted | Approval Rate | Avg Days to Pay |
|---|---|---|---|
| Turner Construction | 8 | 88% | 22 |
| Skanska USA | 4 | 75% | 35 |
| Local GC | 6 | 50% | 58 |

Useful for identifying slow-paying or high-rejection GCs.

### Section 3.5 — Tab: Operations

**Chart 1 — Hours logged per day (line or bar, last 30 days)**

Daily stacked bar showing billable vs non-scope hours across all workers.

**Chart 2 — Hours by project (pie or horizontal bar, last 30 days)**

Visualizes where the work is concentrated.

**Chart 3 — Hours by worker (horizontal bar, last 30 days)**

Top workers by hours logged.

**Table — Project activity**

| Project | Hours (30d) | Workers | Tickets | Billable $ |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

### Section 3.6 — Tab: Quality & Flags

This tab is where the system reveals its own health.

**Tile — Flag rate**

```
Flag rate last 30 days: 12%
  Scope Mismatch: 5%
  Time Integrity: 3%
  Location Unverified: 2%
  Daily Hours Exceeded: 1%
  Overlapping Tickets: 1%
```

**Chart — Flag resolution outcomes**

Pie or bar showing: Approved as-is, Adjusted, Clarified by worker, Unresolved. Helps manager understand whether flags are noise or signal.

**Tile — AI classification accuracy**

```
Classification accuracy last 30 days: 78%
  (% of tickets where manager did not override AI work-type
   within 48 hours)
```

If below 60%, shows warning: "Below target — review flagged tickets for patterns."

**Tile — Time integrity**

```
Ticket delivery timing:
  Green (<5 min):     82%
  Yellow (5m–4h):     14%
  Red (>4h):           4%
```

**Table — Workers with unusual patterns**

Lists any worker with elevated flag rates, missing locations, or consistently delayed deliveries. Informational only — surfaces patterns the manager might want to address.

### Section 3.7 — Tab: Exports

Pre-built exports:
- All tickets (CSV, date range)
- Approved timesheets (CSV, date range — this mirrors Timesheets export but with historical scope)
- CO packets summary (CSV)
- Flagged tickets log (CSV)
- Worker roster + rate cards (CSV)

Each with date range picker and download button.

### Section 3.8 — Date range selector

Persistent in top-right (was "Last 30 Days" in current implementation, expand to):
- Last 7 days
- Last 30 days
- Last 90 days
- This month
- Last month
- This quarter
- Custom range

Applies across all tabs. Date range is separate from Timesheets week navigation (different purposes).

### What Reports does NOT do

- Individual ticket detail (that's Work Ticket view)
- Weekly payroll approval (that's Timesheets)
- Ticket list with cards (that's Work Captured)
- CO packet creation (that's CO Packets tab)

Reports is read-only analytics. Every drilldown link navigates to the appropriate operational tab.

---

# Part 3: Cross-View Consistency Rules

Applying across Work Ticket, Timesheets, and Reports:

**Navigation:**
- Ticket IDs are always clickable and always open the Work Ticket detail view
- Worker names are always clickable and open that worker's record in Members
- Project names are always clickable and open Project detail

**Dollar display:**
- Manager-side views show labor $, billable $, markup — always
- Worker-side (bot messages) shows hours only — never dollars
- Worker records in Members show rate cards but these are never exposed to the worker

**Status consistency:**
- Status chip colors: green (approved/paid), blue (in progress), yellow (needs review), red (flagged/rejected), gray (draft/not started)
- Status terms are identical across all views: Logged, Reviewed, Packaged, Submitted, Approved, Rejected, Paid

**Time display:**
- All timestamps show in company-configured timezone
- Date format: "Apr 17" for current year, "Apr 17, 2025" for prior years
- Relative times for recent events ("3h ago") up to 24h, absolute beyond

**Empty states:**
- All empty states have helpful copy, not just blank areas
- Actionable empty states include a CTA ("Log your first ticket" / "Claim a worker")

---

# Part 4: Build Order Recommendation

If you're shipping in sequence:

1. **Work Ticket view** — the most-used detail surface, referenced by every other view
2. **Work Captured grid updates** — confidence display fix, dollar values, multi-select (covered in v1.2 spec)
3. **Timesheets rebuild** — replace current ticket-card view with worker × week grid
4. **Reports restructure** — rename current "Reports" → move to Timesheets, build new analytical Reports
5. **CO Packets** — build packet generation flow
6. **Flagged queue** — can be last since flags are soft signals and workflow works without it initially

---

## What This Document Does Not Cover

- Visual design / style guide
- Responsive breakpoints for mobile
- Keyboard shortcuts
- Bulk actions beyond multi-select basics
- Notification preferences
- Error states for system failures
- Accessibility specifics (WCAG targets)

These belong in a design system doc and QA spec, not here.

---
 