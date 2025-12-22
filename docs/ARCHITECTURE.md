# JTXField System Architecture

## Overview

JTXField is an asynchronous media processing application built with Hono (TypeScript) that handles SMS and WhatsApp messages via Twilio webhooks. It performs AI-powered domain-specific processing using Groq LLM and supports both local development and AWS production environments.

---

## System Architecture Diagram

```mermaid
flowchart TB
    subgraph External["External Services"]
        Twilio["📱 Twilio<br>(SMS/WhatsApp)"]
        Groq["🤖 Groq AI<br>(LLM)"]
        S3["☁️ AWS S3<br>(Media Storage)"]
    end

    subgraph App["Hono Application"]
        Webhook["POST /twhook<br>Webhook Controller"]
        Validator["MediaValidator"]
        Normalize["normalizeTwilioPayload"]
        MediaStorage["copyTwilioMedia"]
        Transcribe["transcribeAudio"]
    end

    subgraph Queue["Queue System"]
        QueueFactory["getQueue()"]
        LocalQueue["LocalQueue<br>(Dev)"]
        SQSQueue["SQSQueue<br>(Prod)"]
    end

    subgraph Processing["Message Processing"]
        Worker["QueueWorker<br>(Local Dev)"]
        Lambda["SQS Lambda Handler<br>(Production)"]
        Registry["ProcessorRegistry"]
        BaseProc["BaseProcessor"]
        ConsProc["ConstructionProcessor"]
        LogiProc["LogisticsProcessor"]
    end

    subgraph Data["Data Layer"]
        Postgres["PostgreSQL<br>Database"]
        TwilioAPI["Twilio API<br>(Reply)"]
    end

    Twilio --> Webhook
    Webhook --> Validator
    Webhook --> Normalize
    Webhook --> MediaStorage
    MediaStorage --> S3
    Webhook --> Transcribe
    Transcribe --> Groq
    Webhook --> QueueFactory
    QueueFactory --> LocalQueue
    QueueFactory --> SQSQueue

    LocalQueue --> Worker
    SQSQueue --> Lambda

    Worker --> Registry
    Lambda --> Registry
    Registry --> BaseProc
    BaseProc --> ConsProc
    BaseProc --> LogiProc
    ConsProc --> Groq
    LogiProc --> Groq

    Worker --> Postgres
    Lambda --> Postgres
    Worker --> TwilioAPI
    Lambda --> TwilioAPI
```

---

## Request Flow Diagram

```mermaid
sequenceDiagram
    participant User as 📱 User (SMS/WhatsApp)
    participant Twilio as 📲 Twilio
    participant App as 🖥️ Hono App
    participant S3 as ☁️ S3
    participant Queue as 📥 Queue
    participant Worker as ⚙️ Worker/Lambda
    participant AI as 🤖 Groq AI
    participant DB as 🗄️ PostgreSQL

    User->>Twilio: Send Message + Media
    Twilio->>App: POST /twhook

    Note over App: Quick Validation
    App->>App: normalizeTwilioPayload()

    Note over App: Authenticate User
    App->>DB: SELECT user by phone

    Note over App: Copy Media (before expiry)
    App->>S3: Upload Images/Audio

    opt Has Audio
        App->>AI: Transcribe Audio
        AI-->>App: Transcript
    end

    App->>Queue: enqueue(message)
    App-->>Twilio: TwiML: "Processing..."
    Twilio-->>User: Acknowledgment

    Note over Worker: Async Processing
    Worker->>Queue: dequeue()
    Worker->>Worker: Get Processor (domain)
    Worker->>AI: Process with System Prompt (prompt is from domain, domain is from user(KEEP IT SIMPLE, , intent(log or recovery)) KEEP IT SIMPLE(INtent is from USER)))
    Note over Worker:  stage the message into a bucket in pending state IFF not clear what the project is about 
    Note over Worker: get (project name), send a question to user to confirm the project name to user
    

    AI-->>Worker: AI Result (JSON)
    Worker->>DB: INSERT txn
    Worker->>Twilio: Send Reply
    Twilio-->>User: Final Response  
```

---

## Component Details

### Entry Points

| File | Description |
|------|-------------|
| [index.ts](file:///Users/rahulv/sw/jtxfield/src/index.ts) | Main entry point. Starts Hono server and local QueueWorker |
| [app.ts](file:///Users/rahulv/sw/jtxfield/src/app.ts) | Hono app setup with `/twhook` route |

### Controllers

| File | Description |
|------|-------------|
| [webhook.ts](file:///Users/rahulv/sw/jtxfield/src/controllers/webhook.ts) | Handles Twilio webhooks: validates, copies media, transcribes audio, queues message |

### Services

| File | Description |
|------|-------------|
| [mediaStorage.ts](file:///Users/rahulv/sw/jtxfield/src/services/mediaStorage.ts) | Copies Twilio media to S3 before URLs expire |
| [transcribe.ts](file:///Users/rahulv/sw/jtxfield/src/services/transcribe.ts) | Audio transcription via Groq |
| [twilio.ts](file:///Users/rahulv/sw/jtxfield/src/services/twilio.ts) | Sends SMS/WhatsApp replies via Twilio API |
| [ai.ts](file:///Users/rahulv/sw/jtxfield/src/services/ai.ts) | Legacy AI parsing service |

### Queue System

| File | Description |
|------|-------------|
| [types.ts](file:///Users/rahulv/sw/jtxfield/src/queue/types.ts) | Queue interface and message types |
| [index.ts](file:///Users/rahulv/sw/jtxfield/src/queue/index.ts) | Queue factory (`getQueue()`) |
| [LocalQueue.ts](file:///Users/rahulv/sw/jtxfield/src/queue/LocalQueue.ts) | In-memory queue for local dev |
| [SQSQueue.ts](file:///Users/rahulv/sw/jtxfield/src/queue/SQSQueue.ts) | AWS SQS queue for production |

### Processors

| File | Description |
|------|-------------|
| [BaseProcessor.ts](file:///Users/rahulv/sw/jtxfield/src/processors/BaseProcessor.ts) | Abstract base with shared AI logic |
| [ConstructionProcessor.ts](file:///Users/rahulv/sw/jtxfield/src/processors/ConstructionProcessor.ts) | Construction domain prompts |
| [LogisticsProcessor.ts](file:///Users/rahulv/sw/jtxfield/src/processors/LogisticsProcessor.ts) | Logistics domain prompts |
| [ProcessorRegistry.ts](file:///Users/rahulv/sw/jtxfield/src/processors/ProcessorRegistry.ts) | Domain→Processor mapping |

### Workers & Handlers

| File | Description |
|------|-------------|
| [QueueWorker.ts](file:///Users/rahulv/sw/jtxfield/src/workers/QueueWorker.ts) | Local polling worker for dev |
| [sqsHandler.ts](file:///Users/rahulv/sw/jtxfield/src/handlers/sqsHandler.ts) | AWS Lambda SQS handler for prod |

---

## Environment-Specific Behavior

```mermaid
flowchart LR
    subgraph Local["🏠 Local Development"]
        L1["NODE_ENV != production"]
        L2["LocalQueue (in-memory)"]
        L3["QueueWorker (polling)"]
        L4["Twilio URLs used directly"]
        L1 --> L2 --> L3
        L1 --> L4
    end

    subgraph Prod["☁️ AWS Production"]
        P1["NODE_ENV = production"]
        P2["SQSQueue (FIFO)"]
        P3["Lambda Handler"]
        P4["Media copied to S3"]
        P1 --> P2 --> P3
        P1 --> P4
    end
```

---

## Processor Class Hierarchy

```mermaid
classDiagram
    class DomainProcessor {
        <<interface>>
        +domain: string
        +process(message, sql) ProcessorResult
        +getSystemPrompt() string
    }

    class BaseProcessor {
        <<abstract>>
        +domain: string
        +process(message, sql) ProcessorResult
        #buildUserContent(message) any[]
        #callAI(userContent) AIResult
        #postProcess(result, message, sql) AIResult
    }

    class ConstructionProcessor {
        +domain = "construction"
        +getSystemPrompt() string
    }

    class LogisticsProcessor {
        +domain = "logistics"
        +getSystemPrompt() string
    }

    class ProcessorRegistry {
        -processors: Map
        -defaultDomain: string
        +register(processor)
        +get(domain) DomainProcessor
    }

    DomainProcessor <|.. BaseProcessor
    BaseProcessor <|-- ConstructionProcessor
    BaseProcessor <|-- LogisticsProcessor
    ProcessorRegistry o-- DomainProcessor
```

---

## Key Technologies

| Technology | Purpose |
|------------|---------|
| **Hono** | Lightweight web framework |
| **TypeScript** | Type-safe JavaScript |
| **Groq SDK** | AI inference (Llama 4) |
| **Twilio** | SMS/WhatsApp messaging |
| **AWS S3** | Media storage |
| **AWS SQS** | Production queue |
| **AWS Lambda** | Serverless processing |
| **PostgreSQL** | Database (Drizzle ORM) |
| **esbuild** | Lambda bundling |

---

## Adding a New Domain

1. Create `src/processors/MyDomainProcessor.ts`:
```typescript
import { BaseProcessor } from './BaseProcessor.js';

export class MyDomainProcessor extends BaseProcessor {
    readonly domain = 'mydomain';

    getSystemPrompt(): string {
        return `You are a MyDomain assistant...`;
    }
}
```

2. Register in [ProcessorRegistry.ts](file:///Users/rahulv/sw/jtxfield/src/processors/ProcessorRegistry.ts):
```typescript
import { MyDomainProcessor } from './MyDomainProcessor.js';
// In constructor:
this.register(new MyDomainProcessor());
```
