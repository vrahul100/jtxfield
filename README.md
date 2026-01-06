# AIField - Construction Ticket System

A zero-app field worklog system for construction workers and recovery teams. Workers send messages via WhatsApp/SMS, AI extracts structured data, and office managers review and assign work through a web dashboard.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL database
- Twilio account (for WhatsApp/SMS)
- Groq API key (for AI extraction)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Run migrations
npx tsx drizzle/0000_careless_centennial.sql
npx tsx drizzle/0001_add_inbox_system.ts
npx tsx drizzle/0002_add_users_table.ts
npm run db:generate
npm run db:migrate

# Seed test data
npx tsx scripts/seed-test-data.ts
```

### Running the Application

```bash
# Backend API (port 3000)
npm run dev

# Frontend UI (port 5173)
cd frontend && npm run dev
```

---

## 🔐 Test Credentials

### Super User (Full Access)
- **Email:** `admin@jtxfield.com`
- **Password:** `admin123`
- **Access:** All nodes, all features

### Office Manager #1 (Downtown Construction)
- **Email:** `manager1@downtown.com`
- **Password:** `manager123`
- **Access:** Downtown Construction node only

### Office Manager #2 (Westside Builders)
- **Email:** `manager2@westside.com`
- **Password:** `manager123`
- **Access:** Westside Builders node only

### Test Workers (WhatsApp/SMS)
- `+15551234567` - Mike Foreman
- `+15551234568` - Carlos Rodriguez
- `+15559876543` - David Builder

---

## 📱 Core Features

### For Field Workers (Zero-App)
- **WhatsApp/SMS Integration:** Send work updates via text + photos + voice notes
- **AI Data Extraction:** Automatic extraction of work type, hours, materials, location
- **Smart Project Routing:** Fuzzy matching with aliases, falls back to Inbox
- **Soft Confirmations:** "✅ (Tag: East Wing School) Logged to: Inbox"
- **Consistency Checks:** AI verifies image matches description
- **Multi-Language:** Support for English, Spanish, etc.

### For Office Managers (Web Dashboard)
- **Ticket View:** Filter/sort all buckets (open, closed, completed)
- **Members Management:** Approve orphan workers, add new members
- **Projects CRUD:** Create, update, delete projects with aliases
- **Inbox Workflow:** 
  - View entries grouped by suspected project tag
  - Bulk assign tagged items to projects
  - Auto-learn aliases for future routing
- **Revenue Recovery:** No work falls through cracks

### For Super Users (Admin)
- **All OM Features** across all nodes
- **Nodes Management:** Create/update construction companies
- **Users Management:** Create Office Managers, assign to nodes
- **Cross-Node Analytics**

---

## 🏗️ Architecture

```
┌─────────────────┐
│  Field Workers  │ (WhatsApp/SMS)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Twilio Webhook │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AI Extraction  │ (Groq/Llama 3.2)
│  - Transcription│
│  - Vision       │
│  - Consistency  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Bucket System   │
│ - Open → Closed │
│ - Validation    │
│ - Inbox Routing │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │
└─────────────────┘
         ▲
         │
┌─────────────────┐
│ Web Dashboard   │
│ (React + Vite)  │
└─────────────────┘
```

---

## 🛠️ Tech Stack

### Backend
- **Framework:** Hono (fast, lightweight)
- **Database:** PostgreSQL + Drizzle ORM
- **Auth:** bcrypt + cookie sessions
- **AI:** Groq SDK (Llama 3.2)
- **Messaging:** Twilio API
- **Runtime:** Node.js 20+

### Frontend
- **Framework:** React 18 + TypeScript
- **Build:** Vite
- **Styling:** Tailwind CSS
- **Routing:** React Router v6
- **State:** React Context + Hooks

---

## 📁 Project Structure

```
src/
├── controllers/      # API route handlers
│   ├── auth.ts      # Login, logout, session
│   ├── webhook.ts   # Twilio message handling
│   ├── worklog.ts   # Bucket filtering/sorting
│   ├── members.ts   # Worker CRUD + approval
│   ├── projects.ts  # Project CRUD + aliases
│   ├── nodes.ts     # Company management (SU)
│   ├── users.ts     # User management (SU)
│   └── inbox.ts     # Inbox workflow
├── services/
│   ├── auth.ts      # User auth + bcrypt
│   ├── bucketService.ts # Bucket state machine
│   ├── extractionService.ts # AI extraction
│   ├── transcribe.ts # Audio → text
│   └── twilio.ts    # Send messages
├── middleware/
│   └── auth.ts      # RBAC (requireOM, requireSU)
├── db/
│   └── schema.ts    # Database schema
└── app.ts           # App setup

frontend/
├── src/
│   ├── components/  # Reusable UI
│   │   ├── Header.tsx    # Logo + logout
│   │   ├── Sidebar.tsx   # Navigation
│   │   └── Layout.tsx    # 2-column structure
│   ├── pages/       # Route pages
│   │   ├── Login.tsx
│   │   ├── Ticket.tsx
│   │   ├── Members.tsx
│   │   └── Projects.tsx
│   └── hooks/
│       └── useAuth.tsx   # Auth context
└── vite.config.ts   # API proxy config
```

---

## 🔄 Inbox Project System

**Problem:** Workers sometimes mention vague project names ("the school", "mall project") that don't match existing projects.

**Solution:**
1. **AI Tagging:** Always extract suspected project name
2. **Fuzzy Matching:** Try to match against project aliases
3. **Fallback Chain:** Alias → Last confirmed → Inbox
4. **OM Workflow:**
   - View Inbox entries grouped by tag
   - Bulk assign "East Wing School" → Project "Washington High School"
   - Auto-learn: Add "East Wing School" as alias
5. **Future Auto-Routing:** Next message with "East Wing School" → auto-routes!

---

## 🚢 AWS Lambda Deployment

This app is designed for serverless deployment:

- **Stateless Architecture:** Each request is independent
- **Session Store:** Use DynamoDB or ElastiCache (see `docs/AWS_LAMBDA.md`)
- **Hono Adapter:** Use `@hono/aws-lambda`
- **Environment:** Node.js 20.x runtime

See [AWS Lambda Migration Guide](docs/AWS_LAMBDA.md) for details.

---

## 📝 API Endpoints

### Auth (Public)
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/logout` - Logout
- `GET /api/auth/session` - Check session

### Ticket (OM & SU)
- `GET /api/worklog?status=closed&sortBy=created_at&order=desc`

### Members (OM & SU)
- `GET /api/members?status=pending`
- `POST /api/members/:id/approve` - Approve orphan worker
- `POST /api/members` - Manually add worker
- `PUT /api/members/:id` - Update worker

### Projects (OM & SU)
- `GET /api/projects`
- `POST /api/projects` - Create project
- `PUT /api/projects/:id` - Update (including aliases)
- `DELETE /api/projects/:id` - Soft delete

### Inbox (OM & SU)
- `GET /api/inbox/:nodeId` - View tagged entries
- `POST /api/inbox/bulk-assign` - Move tag → project
- `POST /api/inbox/add-alias` - Add alias to project

### Nodes (SU only)
- `GET /api/nodes` - List all companies
- `POST /api/nodes` - Create company
- `PUT /api/nodes/:id` - Update company

### Users (SU only)
- `GET /api/users` - List all users
- `POST /api/users` - Create OM or SU
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Soft delete

---

## 🧪 Testing

```bash
# Seed test data
npx tsx scripts/seed-test-data.ts

# Test login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@jtxfield.com","password":"admin123"}'

# Test webhook (simulate worker message)
curl -X POST http://localhost:3000/twhook \
  -d "From=whatsapp:+15551234567" \
  -d "Body=Installed 20 outlets at the mall. Took 3 hours."
```

---

## 📊 Database Schema

- **nodes** - Construction companies/entities
- **users** - Web dashboard users (OM, SU)
- **members** - Field workers (WhatsApp/SMS)
- **projects** - Construction projects (with aliases, isInbox)
- **buckets** - Message accumulation (open → closed)
- **txns** - Completed work transactions
- **holdingTank** - Unknown user messages

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🆘 Support

For issues or questions:
- Check existing issues on GitHub
- Create a new issue with detailed description
- Include error logs and steps to reproduce

---

**Built with ❤️ for construction teams**