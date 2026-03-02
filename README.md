# CV Explorer

An AI-powered candidate database that ingests resumes through a multi-stage LLM pipeline, stores structured profiles with vector embeddings, and provides conversational search via tool-equipped LLM assistants.

Upload PDFs or DOCX files, let the AI extract and normalize candidate data, then search using natural language or structured filters.

## Features

- **Batch CV upload** with drag-and-drop, duplicate detection (MD5), and retry on failure
- **AI extraction pipeline** - parses, extracts, enriches, and embeds resume data in 4 stages
- **Semantic search** via pgvector embeddings for natural language queries
- **Conversational search** - chat with an LLM assistant that queries the database using tools
- **Multi-provider LLM** - OpenAI, Anthropic (Claude), and Google Gemini with runtime switching
- **Cost tracking** per upload, chat message, and session
- **Candidate profiles** with experiences, education, skills, languages, and certifications

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16 + pgvector |
| ORM | Drizzle ORM |
| AI/LLM | OpenAI, Anthropic, Google Gemini SDKs |
| Document parsing | pdf-parse, mammoth |
| Infrastructure | Docker Compose |

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- At least one LLM API key (OpenAI, Anthropic, or Gemini)

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API key(s)

# Start everything (DB + migrations + server + client + Drizzle Studio)
npm run dev
```

This starts:
- PostgreSQL on `localhost:5436`
- Backend API on `localhost:3035`
- Frontend on `localhost:5135`
- Drizzle Studio on `localhost:4983`

Open **http://localhost:5135** in your browser.

To start fresh with a clean database:

```bash
npm run dev:fresh
```

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5436/cv_explorer

# LLM Provider: "openai", "anthropic", or "gemini"
LLM_PROVIDER=openai

# API Keys (configure at least one)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...

# Server
PORT=3035

# Embedding dimension (1536 for OpenAI/Gemini)
EMBEDDING_DIMENSION=1536
```

## Project Structure

```
cv-explorer/
├── client/                   # Vue 3 frontend
│   └── src/
│       ├── views/            # Upload, Chat, Candidates pages
│       └── composables/      # useChat, useMultiUpload
├── server/                   # Express backend
│   └── src/
│       ├── db/               # Drizzle schema, migrations, client
│       ├── llm/              # Provider abstraction (OpenAI, Anthropic, Gemini)
│       ├── pipeline/         # Resume processing (parse → extract → enrich → embed)
│       ├── routes/           # REST API (uploads, candidates, chat, settings)
│       ├── search/           # Tool definitions, structured & semantic search
│       └── uploadWorker.ts   # Background processing loop
├── shared/                   # Shared TypeScript types
├── infra/postgres/           # PostgreSQL + pgvector Dockerfile
├── docs/                     # Architecture docs (pipeline, chat)
└── scripts/                  # dev.sh, dev-fresh.sh
```

## Resume Processing Pipeline

Each uploaded CV goes through 4 stages:

1. **Parse** - Extract raw text from PDF/DOCX (with OCR fallback for scanned documents)
2. **Extract** - LLM call to produce structured JSON (name, experiences, education, skills, etc.)
3. **Enrich** - Second LLM call to normalize skill names, categorize skills, standardize job titles
4. **Embed** - Generate a 1536-dimensional vector embedding for semantic search

All data is stored in a single transaction. Cost and token usage are tracked per operation.

## Chat System

The chat interface provides conversational access to the candidate database. The LLM is equipped with these tools:

| Tool | Purpose |
|------|---------|
| `search_by_skills` | Find candidates by skill names |
| `search_by_experience` | Search by job title, company, years of experience |
| `search_by_education` | Search by degree, field, or institution |
| `search_by_location` | Search by candidate location |
| `semantic_search` | Vector similarity search with natural language |
| `get_candidate_detail` | Retrieve full candidate profile |
| `list_all_candidates` | Paginated candidate listing |

Responses are streamed via SSE. Tool calls are visible in the UI for transparency.

## API Endpoints

### Uploads
- `GET /api/uploads` - List uploads
- `POST /api/uploads` - Upload files (multipart, PDF/DOCX, max 10MB)
- `POST /api/uploads/:id/retry` - Retry failed upload
- `DELETE /api/uploads/:id` - Remove upload

### Candidates
- `GET /api/candidates` - List candidates (supports `?skill=`, `?location=`, `?title=`, `?degree=` filters)
- `GET /api/candidates/filters` - Available filter values
- `GET /api/candidates/:id` - Full candidate detail
- `GET /api/candidates/:id/document` - Download original document

### Chat
- `GET /api/chat/sessions` - List chat sessions
- `GET /api/chat/sessions/:id` - Load session with messages
- `POST /api/chat` - Send message (SSE streaming response)
- `DELETE /api/chat/sessions/:id` - Delete session

### Settings
- `GET /api/settings` - Current and available LLM providers
- `POST /api/settings/provider` - Switch LLM provider at runtime

## NPM Scripts

```bash
npm run dev           # Start DB + server + client + Drizzle Studio
npm run dev:fresh     # Same but with DB reset first
npm run dev:server    # Server only
npm run dev:client    # Client only
npm run build         # Build all packages
npm run db:generate   # Generate Drizzle migrations
npm run db:migrate    # Run migrations
npm run db:reset      # Reset database
npm run db:studio     # Open Drizzle Studio
```

## LLM Providers

| Provider | Chat | Embeddings | Streaming | Tool Use |
|----------|------|------------|-----------|----------|
| OpenAI | gpt-4o, o4-mini | text-embedding-3-small | Yes | Yes |
| Anthropic | Claude Sonnet 4, Haiku 4.5 | Falls back to OpenAI | Yes | Yes |
| Gemini | gemini-2.5-flash/pro | gemini-embedding-001 | Yes | Yes |

Switch providers at runtime from the UI dropdown or via `POST /api/settings/provider`.

## Database

PostgreSQL 16 with pgvector extension. The schema includes:

- **candidates** - profiles with vector embeddings
- **experiences**, **education**, **skills**, **languages**, **certifications** - candidate relations
- **uploads** - file tracking with status and MD5 hash
- **chat_sessions** / **chat_messages** - conversation persistence
- **llm_calls** - API call audit log with cost tracking

See [docs/pipeline.md](docs/pipeline.md) and [docs/chat.md](docs/chat.md) for detailed architecture documentation.
