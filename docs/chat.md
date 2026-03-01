# Chat System — Architecture & Tool Reference

## Overview

The chat feature provides a conversational interface for querying the candidate database. It uses an LLM (OpenAI o4-mini) with function calling (tool use) to translate natural-language questions into database queries, then synthesizes the results into readable answers.

Conversations are persisted in the database so users can resume previous chats and review history.

## Request Flow

```
Browser                    Server                         OpenAI              Database
  │                          │                              │                    │
  │  POST /api/chat          │                              │                    │
  │  { messages, sessionId } │                              │                    │
  │ ─────────────────────►   │                              │                    │
  │                          │  Create/reuse session         │                    │
  │                          │  Save user message            │                    │
  │                          │ ─────────────────────────────────────────────────► │
  │                          │                              │                    │
  │                          │  ┌─── Tool Loop (max 5 iterations) ───┐           │
  │                          │  │                            │                    │
  │                          │  │  LLM call with tools       │                    │
  │                          │  │  ─────────────────────►    │                    │
  │                          │  │                            │                    │
  │                          │  │  ◄── tool_calls response   │                    │
  │                          │  │                            │                    │
  │   SSE: tool_call event   │  │  Execute tool (DB query)   │                    │
  │ ◄─────────────────────   │  │  ─────────────────────────────────────────────► │
  │   SSE: tool_result event │  │  ◄─── query results ──────────────────────────  │
  │ ◄─────────────────────   │  │                            │                    │
  │                          │  │  Feed results back to LLM  │                    │
  │                          │  │  ─────────────────────►    │                    │
  │                          │  │                            │                    │
  │                          │  └─── repeat until no more tool calls ─────────┘   │
  │                          │                              │                    │
  │                          │  Stream final response        │                    │
  │                          │  ─────────────────────────►   │                    │
  │   SSE: text chunks       │  ◄──── streamed tokens ─────  │                    │
  │ ◄─────────────────────   │                              │                    │
  │                          │  Save assistant message        │                    │
  │                          │  Update session totals         │                    │
  │                          │ ─────────────────────────────────────────────────► │
  │   SSE: done + cost       │                              │                    │
  │ ◄─────────────────────   │                              │                    │
```

## Detailed Steps

### 1. Session Management

When the client sends `POST /api/chat`:

- If no `sessionId` is provided, a new `chat_sessions` row is created. The title is auto-generated from the first 60 characters of the user's message.
- If a `sessionId` is provided, the existing session is reused.
- The user message is saved to `chat_messages` before processing begins.

### 2. Tool Loop (Non-Streaming)

The LLM is called with the full conversation history plus the list of available tools. This loop runs up to **5 iterations**:

1. Send messages + tool definitions to the LLM (non-streaming `chat()` call).
2. If the LLM returns **no tool calls**, exit the loop — the LLM has enough information.
3. If the LLM returns **one or more tool calls**:
   - Each tool call is executed against the database.
   - Tool call events (`tool_call`, `tool_result`) are sent to the client via SSE so the UI can show what the LLM is doing.
   - The tool results are appended to the conversation as `tool` messages.
   - Loop back to step 1 with the updated conversation.

The LLM can call multiple tools in a single iteration. For example, it might call both `search_by_skills` and `semantic_search` to cross-reference results.

### 3. Final Streaming Response

After the tool loop, the full conversation (including all tool results) is sent to the LLM one more time, this time using **streaming** (`chatStream()`). The streamed text chunks are forwarded to the client as SSE events in real time.

### 4. Persistence

After streaming completes:

- The full assistant response is saved to `chat_messages` (including any tool call metadata as JSON).
- The session's `total_cost` and `total_tokens` are updated.
- Every LLM call (both tool-loop calls and the final stream) is logged to the `llm_calls` table.

### 5. Done Event

A final SSE event of type `done` is sent with the cost summary and `sessionId`, so the client can track the session going forward.

## SSE Event Types

| Event Type     | Payload                                          | When                        |
|----------------|--------------------------------------------------|-----------------------------|
| `tool_call`    | `{ id, name, arguments }`                        | LLM requests a tool call    |
| `tool_result`  | `{ id, name, result }`                           | Tool execution completes    |
| `text`         | `{ text }`                                       | Streamed response token     |
| `done`         | `{ cost: { totalCost, totalTokens, sessionId } }`| Response fully complete     |
| `error`        | `{ message }`                                    | Unrecoverable error         |

## System Prompt

The LLM is instructed to act as a **recruitment assistant** with these guidelines:

- Use the most appropriate search tool(s) for the query
- Call multiple tools if needed for comprehensive results
- Present results in a clear, readable format
- Suggest alternative criteria if no results are found
- Be specific (names, skills, experience levels)
- Be objective when comparing candidates

## Available Tools

### `search_by_skills`

Search for candidates who have specific skills.

| Parameter               | Type       | Required | Description                                    |
|-------------------------|------------|----------|------------------------------------------------|
| `skills`                | `string[]` | Yes      | Skill names (e.g., `["JavaScript", "Python"]`) |
| `min_years_experience`  | `number`   | No       | Minimum total years of professional experience |

**How it works**: Joins `candidates` with `skills` table, matches by lowercase skill name. If `min_years_experience` is set, filters by summing experience durations. Returns up to 20 candidates sorted by number of matched skills.

### `search_by_experience`

Search for candidates by work experience.

| Parameter   | Type     | Required | Description                            |
|-------------|----------|----------|----------------------------------------|
| `job_title` | `string` | No       | Job title (partial match, e.g., "Engineer") |
| `min_years` | `number` | No       | Minimum years in the role              |
| `company`   | `string` | No       | Company name (partial match)           |

**How it works**: Joins `candidates` with `experiences`, applies ILIKE filters. Calculates years from `start_date` to `end_date` (or current date). Returns up to 20 candidates sorted by years descending.

### `search_by_education`

Search for candidates by educational background.

| Parameter     | Type     | Required | Description                            |
|---------------|----------|----------|----------------------------------------|
| `degree`      | `string` | No       | Degree type (e.g., "Master", "PhD")    |
| `field`       | `string` | No       | Field of study (e.g., "Computer Science") |
| `institution` | `string` | No       | Institution name                       |

**How it works**: Joins `candidates` with `education`, applies ILIKE filters on degree, field, and institution. Returns up to 20 candidates.

### `search_by_location`

Search for candidates by location.

| Parameter  | Type     | Required | Description                              |
|------------|----------|----------|------------------------------------------|
| `location` | `string` | Yes      | Location (e.g., "Paris", "New York")     |

**How it works**: ILIKE match on the candidate's `location` field. Returns up to 20 candidates.

### `semantic_search`

Perform a vector similarity search across all candidate profiles.

| Parameter | Type     | Required | Description                                    |
|-----------|----------|----------|------------------------------------------------|
| `query`   | `string` | Yes      | Natural language description of ideal candidate |
| `limit`   | `number` | No       | Max results (default 10)                       |

**How it works**: Embeds the query using `text-embedding-3-small`, then performs a cosine similarity search (`<=>` operator) against stored candidate embeddings via pgvector. Returns candidates ranked by similarity score.

This is the most powerful search tool — it works well for vague or compound queries like "senior backend developer with cloud experience who speaks French".

### `get_candidate_detail`

Get the full profile of a specific candidate.

| Parameter      | Type     | Required | Description           |
|----------------|----------|----------|-----------------------|
| `candidate_id` | `string` | Yes      | The candidate's UUID  |

**Returns**: All candidate fields plus full lists of experiences, education, skills, languages, and certifications. The LLM typically calls this after finding candidates via search to provide detailed information.

### `list_all_candidates`

List all candidates with pagination.

| Parameter | Type     | Required | Description                 |
|-----------|----------|----------|-----------------------------|
| `page`    | `number` | No       | Page number (default 1)     |
| `limit`   | `number` | No       | Results per page (default 20) |

**Returns**: Paginated list of candidates with total count. Sorted by creation date (newest first).

## Example Interaction

**User**: "Find me senior developers with Python and AWS experience"

**LLM decides to call two tools**:
1. `search_by_skills({ skills: ["Python", "AWS"] })`
2. `search_by_experience({ job_title: "Senior Developer" })`

**LLM receives results**, cross-references them, then calls:
3. `get_candidate_detail({ candidate_id: "abc-123" })` for the top match

**LLM streams** a final response summarizing the findings with specific candidate details.

## Database Tables

| Table            | Purpose                                    |
|------------------|--------------------------------------------|
| `chat_sessions`  | Session metadata (title, cost totals)      |
| `chat_messages`  | Individual messages (user + assistant)     |
| `llm_calls`      | Every LLM API call with token/cost tracking |

## Cost Tracking

Every LLM API call is tracked individually:

- **Tool loop calls** are logged as `chat_tool_use`
- **Final streaming call** is logged as `chat_response`
- Per-message cost is stored on `chat_messages.cost`
- Session-level totals are maintained on `chat_sessions.total_cost` and `chat_sessions.total_tokens`

The model used is `o4-mini` with `reasoning_effort: 'low'` to minimize latency and cost.
