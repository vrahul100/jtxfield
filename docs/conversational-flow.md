# Conversational Flow System

## Overview

The JField application uses an **intent-driven conversational flow** to handle incoming WhatsApp/SMS messages from construction workers. Instead of a rigid linear flow, each message is classified by intent, allowing for natural, out-of-sequence responses.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    INCOMING MESSAGE                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              1. AUTHENTICATE MEMBER                          │
│    Verify phone number exists in members table               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│         2. GET/CREATE OPEN TICKET                            │
│    Find existing open bucket for member, or create new       │
│    Load conversation history from bucket                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│         3. INTENT CLASSIFICATION (LLM)                       │
│    Analyze message with conversation context                 │
│    Returns: intent + extracted data (hours, project, etc.)   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│         4. WORKFLOW HANDLER                                  │
│    Route to appropriate handler based on intent              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│         5. STORE CONVERSATION + RESPOND                      │
│    Append user message + system response to history          │
└─────────────────────────────────────────────────────────────┘
```

## Intent Types

| Intent | Trigger Examples | Behavior |
|--------|------------------|----------|
| `ADD_CONTENT` | "Worked 4 hours", [photo], "electrical panel" | Append content to ticket, validate |
| `CONFIRM` | "ok", "yes", "correct", "si", "that's right" | Submit ticket if complete |
| `CORRECTION` | "wrong photo", "actually...", "let me redo" | Clear pending issue, await new input |
| `CANCEL` | "cancel", "never mind", "forget it" | Mark ticket as cancelled |

## Key Design Decisions

### 1. Conversation State is Per-Ticket
- Each bucket/ticket stores its own `conversation_history` as JSONB
- History persists across messages until ticket is closed
- Provides context for LLM intent classification

### 2. "OK" Always Means Confirmation
- Short affirmative responses trigger `CONFIRM` intent
- System asks for confirmation before submitting: "Does this look correct?"
- User responds "ok" → ticket submitted

### 3. Rigid System Behavior
- Acts as an office manager assistant
- Validates work reports thoroughly
- Sends to `pending_review` if validation issues persist after 5 attempts

### 4. Out-of-Sequence Handling
- If user provides hours before being asked, it's detected via `extractedData`
- LLM understands conversation context
- Example: "4 hours" sent before hours question → still captured

## Database Schema

### Bucket Table Additions

```sql
-- Conversation history (JSONB array)
conversation_history JSONB DEFAULT '[]'

-- Status now includes 'cancelled'
status VARCHAR -- 'open' | 'submitted' | 'pending_review' | 'rejected' | 'cancelled'
```

### Conversation History Format

```json
[
  {
    "role": "user",
    "content": "Worked on electrical panel",
    "media": ["https://..."],
    "timestamp": "2024-01-15T10:30:00Z"
  },
  {
    "role": "assistant", 
    "content": "Ticket #42 opened. How many hours did you work?",
    "timestamp": "2024-01-15T10:30:01Z"
  }
]
```

## Code Structure

### Files

| File | Purpose |
|------|---------|
| `src/services/conversationEngine.ts` | Intent classification, history management, response generation |
| `src/controllers/webhook.ts` | Main message handler, routes to intent handlers |
| `src/services/bucketService.ts` | Bucket CRUD, validation |

### Key Functions

```typescript
// Intent Classification
classifyIntent(
  conversationHistory: ConversationMessage[],
  currentMessage: { text: string; hasMedia: boolean }
): Promise<IntentResult>

// History Management
getConversationHistory(bucket: Bucket): ConversationMessage[]
appendConversation(sql, bucketId, messages): Promise<void>

// Bucket Operations
cancelBucket(sql, bucketId): Promise<void>
submitBucket(sql, bucketId, hasIssues): Promise<void>
```

## Example Conversation Flows

### Happy Path
```
User: [photo] Finished electrical panel work
System: ✅ Ticket #42 opened. How many hours did you work?
User: 4 hours
System: Got it - 4 hours on electrical. Does this look correct?
User: ok
System: ✅ Ticket #42 submitted for Downtown Project!
```

### Out-of-Sequence (Hours provided early)
```
User: [photo] Worked 4 hours on wiring
System: ✅ Ticket #43 opened. Logged 4 hours. Does this look correct?
User: yes
System: ✅ Ticket #43 submitted!
```

### Correction Flow
```
User: [blurry photo]
System: Ticket #44 opened. The photo looks blurry - can you resend?
User: no it's fine
System: Understood, keeping the photo. How many hours did you work?
User: 3 hours
System: 3 hours logged. Does this look correct?
User: ok
System: ✅ Ticket #44 submitted!
```

### User Wants to Correct
```
User: [wrong photo]
System: Ticket #45 opened. What work does this show?
User: wrong photo let me resend
System: No problem! Send the corrected info or photo.
User: [correct photo]
System: Got it! What work did you do?
```

### Cancel Flow
```
User: Started work report
System: Ticket #46 opened. Please describe your work.
User: never mind
System: 🚫 Ticket #46 cancelled. Send a new message when ready.
```

## LLM Prompt

The intent classification uses Groq's `llama-3.1-8b-instant` model with this prompt structure:

```
You are analyzing a WhatsApp message from a construction worker.

CONVERSATION HISTORY:
[Previous messages]

CURRENT MESSAGE:
Text: "[user's message]"
Has attachments: true/false

Classify intent as: ADD_CONTENT | CONFIRM | CORRECTION | CANCEL
Extract data if ADD_CONTENT: hours, projectHint, workDescription
```

## Frontend Display

The Tickets page shows conversation history in the expanded view:
- Chat-style bubbles (user = right/indigo, assistant = left/white)
- Shows timestamps and attachment counts
- Scrollable container for long conversations

## Future Improvements

1. **Multi-turn clarification** - Smart follow-up questions
2. **Intent confidence thresholds** - Ask for clarification if confidence < 0.7
3. **Project learning** - Auto-create project aliases from common mentions
4. **Voice transcription context** - Include audio context in intent classification
