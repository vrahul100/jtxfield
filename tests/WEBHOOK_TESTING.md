# Webhook Testing Guide

## Overview

This directory contains automated test suites for the Twilio webhook endpoint that processes incoming WhatsApp messages.

## Test Modes

### 1. Standard Mode (Auto-Cleanup)
Runs tests and automatically deletes all test data after completion.

```bash
npm run test:webhook
```

### 2. Persist Mode ✨ NEW
Runs tests and **keeps** all test buckets in the database for manual review in the UI.

```bash
npm run test:webhook:persist
```

**Use cases:**
- Review AI extraction quality in the Tickets UI
- Debug specific test cases
- Verify conversational flows
- Manual QA before deployment

**Test identification:**
- All persisted test messages are tagged with `[TEST_RUN:<timestamp>]`
- View them in the Tickets page alongside real data
- Each test run has a unique ID for easy filtering

### 3. Cleanup Mode ✨ NEW
Delete all test buckets from previous persist mode runs.

```bash
# Interactive cleanup with confirmation
npm run test:cleanup

# Preview what will be deleted (dry-run)
npm run test:cleanup -- --dry-run

# Force delete without confirmation
npm run test:cleanup -- --force
```

## Test Files

### `webhook-test-cases.csv`
Defines individual test cases with expected outcomes.

**Columns:**
- `phone_number`: Test phone number
- `message_text`: Message content to send
- `image_url`: Optional image URL
- `audio_url`: Optional audio URL (requires transcription)
- `expected_hours`: Expected hours extracted
- `expected_materials`: Expected materials extracted
- `description`: Test case description

### `run-webhook-tests.ts`
Main test runner that:
1. Reads test cases from CSV
2. Simulates Twilio webhook calls
3. Waits for async LLM processing
4. Verifies bucket and transaction creation
5. Validates extracted data
6. (Optional) Cleans up or persists test data

### `cleanup-test-buckets.ts`
Utility script to delete test data created by persist mode:
- Finds all buckets with `[TEST_RUN:]` marker
- Shows preview of what will be deleted
- Requires confirmation (unless `--force`)
- Deletes buckets and associated transactions

## Running Tests

### Quick Test (Auto-cleanup)
```bash
npm run test:webhook
```

### Test + UI Review Workflow
```bash
# 1. Run tests in persist mode
npm run test:webhook:persist

# 2. Review in UI at /tickets
#    Look for messages with [TEST_RUN:...] tag

# 3. Clean up when done
npm run test:cleanup
```

### Adding New Test Cases

1. Add a new row to `webhook-test-cases.csv`:
```csv
+15102198037,New test message,,,2,steel,Description of test
```

2. Run tests:
```bash
npm run test:webhook
```

## Test Features

### Automatic Transcription
- Audio URLs are automatically transcribed using Groq Whisper
- Transcripts are validated and stored
- Test cases can verify transcription output

### LLM Extraction
- All messages processed through AI extraction pipeline
- Tests verify `extracted_data` is populated
- Validates hours, materials, location extraction

### Transaction Creation
- Verifies work logs (transactions) are created
- Validates extracted data flows to transactions
- Tests project inference logic

### ForceNewBucket
- Each test creates a fresh bucket
- Prevents test interference
- Ensures clean state per test

## Debugging Failed Tests

1. **Check logs:** Test output shows detailed step-by-step progress
2. **Use persist mode:** Keep test data for manual inspection
3. **Review UI:** Check Tickets page to see actual extraction results
4. **Check timestamps:** Verify LLM processing completed
5. **Inspect database:** Query `buckets` table for `extracted_data`

## Best Practices

✅ **Do:**
- Use persist mode when debugging
- Clean up test data after manual review
- Add diverse test cases (audio, images, edge cases)
- Test Spanish messages for i18n
- Verify both text and media handling

❌ **Don't:**
- Leave test data in production database long-term
- Use real Twilio URLs (they expire)
- Skip cleanup after persist mode
- Test with real user phone numbers

## Example Workflow

```bash
# 1. Add new test case to CSV
# 2. Run in persist mode
npm run test:webhook:persist

# 3. Check Tickets UI - find buckets with [TEST_RUN:...] tag
# 4. Verify extraction looks correct
# 5. Clean up test data
npm run test:cleanup

# 6. Once satisfied, run normal tests
npm run test:webhook
```

## Environment

Set `TEST_BASE_URL` if testing against non-local server:

```bash
TEST_BASE_URL=https://staging.example.com npm run test:webhook
```

## Example Output

```
🧪 Webhook Test Runner
Mode: PERSIST (buckets will remain for review)
Test Run ID: 2026-01-03T08:48:00.000Z

🚀 Running 7 test cases...

📋 Test 1: Simple text with hours
   Phone: +15102198037
   ✅ Bucket created: #123
   ✅ Transaction created: #45

...

📦 PERSIST MODE: Test buckets preserved for UI review
   Test Run ID: 2026-01-03T08:48:00.000Z
   Created 7 buckets
   To clean up later, run: npm run test:cleanup

============================================================
📊 TEST SUMMARY
============================================================
Total: 7
✅ Passed: 7
❌ Failed: 0
```
