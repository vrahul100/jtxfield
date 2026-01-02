# Multi-Turn Conversation Testing

## The Problem
The original `test:webhook` runs single isolated webhook calls - it doesn't simulate the back-and-forth of a real conversation.

## The Solution: `test:conversations`

This enhanced test suite simulates **full WhatsApp conversations** with multiple turns.

## How It Works

### 1. CSV Format
Each row represents one turn in a conversation:

```csv
conversation_id,turn_number,phone_number,message_text,image_url,audio_url,expected_bucket_status,expected_hours,expected_materials,description
conv1,1,+15555550101,Did wiring work,,,,pending_clarification,,,AI should ask for hours
conv1,2,+15555550101,3 hours,,,,submitted,3,,User provides hours
```

### 2. Conversation Flow
- Turns with the same `conversation_id` are grouped together
- Executed in order by `turn_number`
- Each turn:
  1. Sends webhook call
  2. Captures AI response
  3. Waits for processing (2s)
  4. Verifies bucket state
  5. Checks extracted data against expectations

### 3. Multi-Turn Example

**Conversation 1: Hours Clarification**
```
Turn 1:
  User: "Did wiring work"
  AI: "How many hours did this take?"
  Status: pending_clarification ✓

Turn 2:
  User: "3 hours"
  AI: "✅ Ticket #123 submitted!"
  Status: submitted ✓
  Extracted hours: 3 ✓
  Transaction created ✓
```

## Run Tests

```bash
# Single-turn tests (original)
npm run test:webhook

# Multi-turn conversation tests (new!)
npm run test:conversations
```

## Example Output

```
🚀 Starting Conversation Test Suite

Found 5 conversations with 13 total turns

======================================================================
🗣️  Conversation: conv1
======================================================================

📱 Turn 1: AI should ask for hours
   User: "Did wiring work"
   🤖 AI: "How many hours did this take?"
   📦 Bucket #123 - Status: pending_clarification
   ✅ Status matches: pending_clarification

📱 Turn 2: User provides hours
   User: "3 hours"
   🤖 AI: "✅ Ticket #123 submitted for Downtown Office! Thanks for your report."
   📦 Bucket #123 - Status: submitted
   ✅ Status matches: submitted
   ⏱️  Extracted hours: 3
   ✅ Hours match: 3
   💰 Transaction #45 created - 3hrs

✅ Conversation conv1: PASSED
```

## Test Scenarios Included

1. **Hours clarification** - AI asks, user provides
2. **Material extraction** - From image
3. **Inconsistency resolution** - AI detects mismatch, user clarifies
4. **Project selection** - AI asks for project
5. **Complete multi-step** - Vague → clarify → complete

## Key Differences

| Feature | `test:webhook` | `test:conversations` |
|---------|----------------|---------------------|
| Turns per test | 1 | Multiple |
| AI Response | ❌ Not captured | ✅ Captured & shown |
| Conversation state | ❌ No tracking | ✅ Tracked across turns |
| Real-world simulation | Basic | High fidelity |

## Adding Custom Conversations

```csv
# Test: Multi-step material + hours clarification
mytest,1,+15555550101,Used some materials,,,,,,,Initial vague message
mytest,2,+15555550101,Rebar and concrete,,,,pending_clarification,,rebar;concrete,AI asks for hours
mytest,3,+15555550101,5 hours,,,,submitted,5,rebar;concrete,Complete conversation
```

This properly tests the conversational AI flow end-to-end!
