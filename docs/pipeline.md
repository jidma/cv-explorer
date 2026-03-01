# Resume Processing Pipeline

## Overview

When a user uploads a resume (PDF or DOCX), it goes through a multi-stage pipeline of LLM agents that extract, structure, enrich, and index the data for search.

```
Upload (PDF/DOCX)
  |
  v
[1. Parser] ---- local libs (pdf-parse, mammoth)
  |                 \--- fallback: LLM vision (for scanned/complex PDFs)
  v
Raw Text
  |
  v
[2. Extractor] -- LLM call (structured JSON output)
  |
  v
Extracted CV (JSON)
  |
  v
[3. Enricher] --- LLM call (normalization + categorization)
  |
  v
Enriched CV (JSON)
  |
  v
[4. Embedder] --- Embedding API (OpenAI text-embedding-3-small)
  |
  v
Vector (1536-dim)
  |
  v
[5. Store] ------ PostgreSQL (candidate + relations + vector + original doc)
```

## Stage Details

### 1. Parser (`server/src/pipeline/parser.ts`)

Converts the uploaded file into raw text.

- **PDF**: Uses `pdf-parse` to extract text from the PDF buffer.
- **DOCX**: Uses `mammoth` to extract raw text from the Word document.
- **Vision fallback**: If local parsing yields fewer than 100 characters (typical for scanned or image-heavy PDFs), the file is sent to the LLM as an image for OCR-style extraction.

**Input**: File path on disk
**Output**: Raw text string

### 2. Extractor (`server/src/pipeline/extractor.ts`)

Sends the raw text to the LLM with a structured extraction prompt. The LLM returns JSON matching the `ExtractedCV` schema:

```typescript
{
  full_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  experiences: Array<{
    company, title, start_date, end_date, is_current, description, location
  }>;
  education: Array<{
    institution, degree, field_of_study, start_date, end_date, description
  }>;
  skills: Array<{ name, category, proficiency }>;
  languages: Array<{ name, proficiency }>;
  certifications: Array<{ name, issuer, issue_date }>;
}
```

The prompt instructs the LLM to:
- Use `YYYY-MM-DD` date format (partial dates filled as `YYYY-01-01`)
- Return `null` for missing fields
- Extract ALL entries (not just the first few)
- Return only valid JSON

**LLM settings**: `temperature: 0`, `responseFormat: json`

### 3. Enricher (`server/src/pipeline/enricher.ts`)

Takes the extracted JSON and runs a second LLM call to normalize and categorize:

- **Skill names**: Standardizes abbreviations (`JS` -> `JavaScript`, `k8s` -> `Kubernetes`)
- **Skill categories**: Assigns each skill a category: `programming_language`, `framework`, `database`, `cloud`, `devops`, `tool`, `methodology`, `soft_skill`, `other`
- **Job titles**: Normalizes to standard forms (`Sr. Dev` -> `Senior Developer`, `SWE` -> `Software Engineer`)
- **Proficiency levels**: Infers from context where possible (`expert`, `advanced`, `intermediate`, `beginner`)

**LLM settings**: `temperature: 0`, `responseFormat: json`

### 4. Embedder (`server/src/pipeline/embedder.ts`)

Generates a 1536-dimensional vector embedding for semantic search.

Builds a searchable text from key fields:
- Full name and summary
- Experience titles and companies
- Education degrees and institutions
- Skill names
- Language names

This concatenated text (max 8000 chars) is sent to the embedding model (OpenAI `text-embedding-3-small`).

**Note**: Embeddings always use OpenAI regardless of the `LLM_PROVIDER` setting, as Anthropic does not offer a native embedding API.

### 5. Store (`server/src/pipeline/index.ts`)

Inserts all data into PostgreSQL within a single transaction:

1. `candidates` row — personal info, raw text, embedding vector, original document bytes
2. `experiences` rows — one per work experience
3. `education` rows — one per education entry
4. `skills` rows — one per skill
5. `languages` rows — one per language
6. `certifications` rows — one per certification

If any insert fails, the entire transaction is rolled back.

The original uploaded file (PDF/DOCX) is stored as `bytea` in the `original_document` column alongside its MIME type, so it can be viewed or downloaded later from the UI.

## LLM Provider Abstraction

The pipeline uses whichever LLM provider is configured via `LLM_PROVIDER` env var:

| Provider | Chat model | Embedding model |
|----------|-----------|----------------|
| `openai` | `gpt-4o` | `text-embedding-3-small` |
| `anthropic` | `claude-sonnet-4-20250514` | Falls back to OpenAI |

The abstraction layer (`server/src/llm/`) normalizes:
- Message formats (system/user/assistant/tool roles)
- Tool definitions and tool call handling
- Streaming responses
- Vision (image) inputs

## Error Handling

- If parsing fails, the error propagates to the upload endpoint which returns a 500.
- If the LLM returns invalid JSON in extraction/enrichment, `JSON.parse` throws and the upload fails.
- Database insert failures trigger a transaction rollback — no partial data is stored.
- The upload endpoint returns the error message to the client for display.

## Configuration

| Env var | Description | Default |
|---------|-------------|---------|
| `LLM_PROVIDER` | Which LLM to use for extraction/enrichment | `openai` |
| `OPENAI_API_KEY` | OpenAI API key (required for embeddings) | — |
| `ANTHROPIC_API_KEY` | Anthropic API key (if using Claude) | — |
| `EMBEDDING_DIMENSION` | Embedding vector dimension | `1536` |
