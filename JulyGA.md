P0 — Fix before next demo (lost billable detail / broken routing) Capture
materials from unprompted worker input. Worker wrote "4 logs" — never appeared
in the ticket. Extraction should pull materials whenever mentioned, not just
when explicitly asked. This is the single biggest gap in the screenshot. Fix
"Inbox" fallback for real project terms. "Parapet" is legitimate construction
vocabulary and still routed to Inbox. Check the fuzzy-match/alias table — either
the alias isn't learned yet or the match threshold is too strict. A ticket stuck
in Inbox isn't billable until manually triaged, which defeats the "instant
capture" promise. Preserve specific scope language in the structured fields, not
just the trailing quote. "Parapet" and "wooden railing" only show up as a
disconnected italic footer — the "Work" field just says generic "carpentry." The
scope line should carry the specific term ("carpentry — parapet/railing"), not a
category. Fix ticket ID format. Still showing #11, #12 — not the
[CompanyCode]-[Sequence starting at 10,000] format from spec. Flagged before,
still live. Fast fix, real credibility cost in a demo. P1 — Agentic upgrade
(from W-TK-02 discussion) Ask one targeted follow-up only when materials are
visible but unconfirmed. Photo shows a built structure, worker didn't state
materials beyond "4 logs" — a smart agent asks "anything else used — hardware,
fasteners?" once, not zero times and not five times. Use the photo to
sanity-check the scope description, not just the hours (Auditor already does
hours vs. photo). If the photo shows a completed railing and the ticket says
generic "carpentry," that's a missed chance to auto-fill a sharper scope from
the image. Confidence-gate the confirmation step. Right now every ticket gets
"Is this correct? Reply Y or N" regardless of how confident the extraction was.
High-confidence, fully-specific tickets (like this one, once fixed) shouldn't
need a confirm step — reserve it for genuinely ambiguous cases, per the tiered
W-TK-02 design.
