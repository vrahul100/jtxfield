# Bucket Formation Test Plan

Focus: User-message interaction for open/closed bucket lifecycle.

---

## Test Scenarios

### 1. New Bucket Creation

| # | Scenario | Input | Expected | Status |
|---|----------|-------|----------|--------|
| 1.1 | First message from user | "Fixed wiring on floor 3" | New bucket created, status=open | ⬜ |
| 1.2 | Message with image | Text + photo | Bucket with image_urls populated | ⬜ |
| 1.3 | Voice note only | Audio attachment | Bucket with transcripts populated | ⬜ |
| 1.4 | Unknown user | Message from unregistered phone | Goes to holding_tank, not buckets | ⬜ |

---

### 2. Bucket Accumulation (Open State)

| # | Scenario | Input | Expected | Status |
|---|----------|-------|----------|--------|
| 2.1 | Second message appends | "Also replaced 2 outlets" | raw_text appended with separator | ⬜ |
| 2.2 | Multiple images | Send 3 photos | image_urls = ["url1", "url2", "url3"] | ⬜ |
| 2.3 | Mix text + voice | Text then voice note | raw_text + transcripts both filled | ⬜ |
| 2.4 | Max 5 images | Send 6th photo | Reject or start new bucket? (TBD) | ⬜ |

---

### 3. Bucket Closing (AI Validation)

| # | Scenario | Input | Expected | Status |
|---|----------|-------|----------|--------|
| 3.1 | Clear complete message | "Fixed wiring on Acme Tower, floor 3, took 2 hours" | status=closed, queued | ⬜ |
| 3.2 | Vague message | "Did some work" | status=open, "Send more details" | ⬜ |
| 3.3 | Noise/unclear audio | Garbled voice note | status=open, validation_errors set | ⬜ |

---

### 4. Project Context

| # | Scenario | Input | Expected | Status |
|---|----------|-------|----------|--------|
| 4.1 | No last project | First-time user sends message | project_id=null, still processes | ⬜ |
| 4.2 | Use last project | User with confirmed project=Acme | Bucket created with project_id=Acme | ⬜ |
| 4.3 | Expired project (>4hrs) | Send after 5 hours | project_id=null | ⬜ |

---

### 5. Project Correction ("N" Flow)

| # | Scenario | Input | Expected | Status |
|---|----------|-------|----------|--------|
| 5.1 | Type N after bucket | "N" | Bucket status=awaiting_correction, project list sent | ⬜ |
| 5.2 | Select project | "2" | Bucket project_id updated, status=completed | ⬜ |
| 5.3 | Invalid selection | "99" | "Invalid selection" message | ⬜ |
| 5.4 | N with no recent bucket | "N" after 1 hour | "No recent activity to correct" | ⬜ |

---

### 6. Edge Cases

| # | Scenario | Input | Expected | Status |
|---|----------|-------|----------|--------|
| 6.1 | Empty message | Just whitespace | Quick validation fails, empty TwiML | ⬜ |
| 6.2 | Very long message | 10,000 chars | Truncated or handled gracefully | ⬜ |
| 6.3 | Rapid messages | 5 messages in 10 sec | All append to same open bucket | ⬜ |
| 6.4 | Number without correction | "1" (no pending N) | Treated as normal message | ⬜ |

---

## How to Run

```bash
# Start server
npm run dev

# Send test messages via WhatsApp to your Twilio number
# Check database state:
npx tsx -e "
import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();
const sql = postgres(process.env.DATABASE_URL);
const buckets = await sql\`SELECT id, status, raw_text, project_id FROM buckets ORDER BY id DESC LIMIT 5\`;
console.table(buckets);
await sql.end();
"
```

## Pass Criteria

- [ ] All 1.x tests pass (bucket creation)
- [ ] All 2.x tests pass (accumulation)
- [ ] All 3.x tests pass (closing logic)
- [ ] All 4.x tests pass (project context)
- [ ] All 5.x tests pass (correction flow)
- [ ] No crashes on edge cases
