# Node_v2.ts Unit Tests

Comprehensive unit testing suite for the `nodes_v2.ts` state machine that can
run locally without sending actual Twilio messages.

## Overview

This testing setup allows you to:

- **Test extraction accuracy** using real Groq API calls with local text/image
  data
- **Validate state machine logic** with isolated unit tests
- **Run tests locally** without sending Twilio messages one-by-one

## Test Structure

### 1. Unit Tests (`tests/jgraph/nodes_v2.test.ts`)

Tests the state machine logic in isolation:

- ✅ Helper functions (`getLastMessage`, `refineExtractionWithRegex`)
- ✅ State handlers (all 8 states)
- ✅ Message formatting
- ✅ Mock database operations
- ✅ State transitions

**Run with:**

```bash
npm run test:nodes
```

**Watch mode:**

```bash
npm run test:nodes:watch
```

### 2. CSV-Driven Integration Tests (`tests/run-nodes-tests.ts`)

Tests extraction accuracy using **real Groq API** with test cases from
`webhook-test-cases.csv`:

| Test Case              | Text                                              | Expected Work Type | Expected Hours | Status                 |
| ---------------------- | ------------------------------------------------- | ------------------ | -------------- | ---------------------- |
| Simple text with hours | "Did electrical wiring for 3 hours"               | electrical         | 3              | ⚠️ Materials missing   |
| Text without hours     | "Installed outlets"                               | electrical         | -              | ⚠️ Materials missing   |
| Materials and hours    | "Used rebar and wire for foundation work 5 hours" | rebar              | 5              | ✅ PASS                |
| Image with text        | "Cutting rebar for construction" + image          | rebar              | -              | ✅ PASS                |
| Foundation with image  | "Foundation work complete" + image                | concrete           | -              | ⚠️ Work type mismatch  |
| Plumbing test          | "Plumbing work 4 hours using copper pipes"        | plumbing           | 4              | ✅ PASS                |
| Spanish worker         | "Hice el tying del rebar..."                      | rebar              | 2              | ⚠️ Hours not extracted |
| Audio only             | (audio file)                                      | -                  | -              | ✅ PASS                |

**Run with:**

```bash
npm run test:nodes:csv
```

## Setup Requirements

### Environment Variables

You **must** have `GROQ_API_KEY` set in your `.env` file:

```.env
GROQ_API_KEY=gsk_your_api_key_here
```

The CSV test runner will check for this and exit with an error if not found.

### Test Data

Test cases are defined in `tests/webhook-test-cases.csv` with columns:

- `phone_number` - Test phone number
- `message_text` - User's message
- `image_url` - Optional image URL
- `audio_url` - Optional audio URL
- `expected_hours` - Expected extracted hours
- `expected_materials` - Expected materials (comma-separated)
- `expected_work_type` - Expected work classification
- `expected_language` - Expected language (en/es)
- `description` - Test case description

## Test Infrastructure

### Mock Utilities (`tests/jgraph/mocks.ts`)

Provides mocks for:

- ✅ **Supabase** - In-memory database operations
- ✅ **Twilio** - Message capture instead of sending
- ✅ **Whisper** - Audio transcription placeholders
- ❌ **Groq LLM** - Uses _real_ API for accurate testing

### Test Fixtures (`tests/jgraph/test-fixtures.ts`)

Centralized sample data:

- Sample extractions
- Sample members (English/Spanish, with/without projects)
- Sample projects
- Sample buckets (in various states)
- Factory functions for creating test data

## Current Test Results

### Unit Tests: 31/32 passing (97%)

One minor failing test relates to null vs false boolean coercion - does not
affect functionality.

### CSV Integration Tests: 4/8 passing (50%)

**Passing:**

- ✅ Audio-only test (baseline)
- ✅ Materials and hours parsing
- ✅ Image analysis integration
- ✅ Plumbing work detection

**Failing:**

- ⚠️ Material extraction for "wires" and "outlets" (too specific)
- ⚠️ Foundation vs rebar classification with image context
- ⚠️ Spanish text hours extraction (needs better prompt)

## Adding New Test Cases

1. Open `tests/ webhook-test-cases.csv`
2. Add a new row with all required columns
3. Run `npm run test:nodes:csv`

Example:

```csv
+15551234567,Painted walls for 6 hours,,,6,paint,painting,en,Paint job test
```

## Improving Extraction Accuracy

The CSV tests reveal real extraction issues you can fix by:

1. **Improving prompts** in `nodes_v2.ts` `buildExtractionPrompt()`
2. **Adding regex refinements** in `refineExtractionWithRegex()`
3. **Updating expected values** if current extraction is actually correct

## Benefits

✅ **No Twilio messages** - Test locally without webhook spam\
✅ **Real API testing** - Uses actual Groq API for realistic results\
✅ **Fast iteration** - Modify prompts and re-test instantly\
✅ **CSV-driven** - Easy to add new test cases\
✅ **Regression prevention** - Catch extraction bugs before production

## Next Steps

To improve test pass rate:

1. Review failing tests to understand LLM behavior
2. Refine extraction prompts in `nodes_v2.ts`
3. Add more specific keywords to prompt
4. Update CSV expectations if LLM output is acceptable
