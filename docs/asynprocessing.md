# Async Message Processing Flow

Internal system flow for bucket-based message accumulation and processing.

```mermaid
sequenceDiagram
    participant App as 🖥️ Webhook
    participant DB as 🗄️ PostgreSQL
    participant AI as 🤖 Groq AI
    participant Queue as 📥 Queue
    participant Worker as ⚙️ Worker

    %% === Incoming Message ===
    App->>App: normalize & validate
    App->>DB: SELECT member by phone
    
    alt Unknown User
        App->>DB: INSERT holding_tank
    else Known Member
        App->>DB: Get last_confirmed_project (< 4hrs)
        App->>DB: Find open bucket (member + project)
        
        alt Has Open Bucket
            App->>DB: Append to bucket
        else No Open Bucket
            App->>DB: CREATE bucket (status=open)
        end
        
        App->>AI: validateBucket()
        AI-->>App: {isComplete, errors}
        
        alt Complete
            App->>DB: UPDATE status=closed
            App->>DB: UPDATE last_confirmed_project
            App->>Queue: enqueue(bucket)
            Note over App: "Logged to X. Type N if wrong."
        else Incomplete
            Note over App: Keep open, wait for more
        end
    end

    %% === Async Worker ===
    Worker->>DB: Get next closed bucket
    Worker->>DB: UPDATE status=processing
    Worker->>AI: Process with domain prompt
    AI-->>Worker: Result
    Worker->>DB: INSERT txn
    Worker->>DB: UPDATE status=completed
```

## Bucket States

```mermaid
stateDiagram-v2
    [*] --> open: Message received
    open --> open: More messages
    open --> closed: AI validates complete
    closed --> processing: Worker picks up
    processing --> completed: Success
    processing --> failed: Error
    
    note right of open: Accumulating messages
    note right of closed: Ready for processing
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Last Project** | Member's project confirmed < 4 hours ago |
| **Open Bucket** | Accumulating messages, not yet complete |
| **Closed Bucket** | AI validated, ready for queue |
| **Holding Tank** | Unknown users for admin review |

## Constraints (MVP)

| Constraint | Limit | Post-MVP |
|------------|-------|----------|
| **Bucket timeout** | 30 min | Cron to close stale buckets |
| **Images per bucket** | 5 max | - |
| **Project correction** | Retroactive fix if "N" after queue | - |