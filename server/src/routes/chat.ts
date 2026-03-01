import { Router } from 'express';
import { eq, desc, sql, asc } from 'drizzle-orm';
import { db } from '../db/client';
import { chatSessions, chatMessages } from '../db/schema';
import { chatWithTools } from '../search/chat';

const router = Router();

// GET /api/chat/sessions — list recent sessions
router.get('/sessions', async (_req, res) => {
  try {
    const sessions = await db
      .select({
        id: chatSessions.id,
        title: chatSessions.title,
        total_cost: chatSessions.totalCost,
        total_tokens: chatSessions.totalTokens,
        created_at: chatSessions.createdAt,
        updated_at: chatSessions.updatedAt,
        message_count: sql<number>`(SELECT COUNT(*) FROM chat_messages WHERE session_id = ${chatSessions.id})`.as('message_count'),
      })
      .from(chatSessions)
      .orderBy(desc(chatSessions.updatedAt))
      .limit(30);

    res.json({ sessions });
  } catch (err) {
    console.error('Error listing chat sessions:', err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// GET /api/chat/sessions/:id — load session messages
router.get('/sessions/:id', async (req, res) => {
  try {
    const [session] = await db
      .select({
        id: chatSessions.id,
        title: chatSessions.title,
        total_cost: chatSessions.totalCost,
        total_tokens: chatSessions.totalTokens,
        created_at: chatSessions.createdAt,
        updated_at: chatSessions.updatedAt,
      })
      .from(chatSessions)
      .where(eq(chatSessions.id, req.params.id));

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const messages = await db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        cost: chatMessages.cost,
        tokens: chatMessages.tokens,
        tool_calls: chatMessages.toolCalls,
        created_at: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, req.params.id))
      .orderBy(asc(chatMessages.createdAt));

    res.json({ session, messages });
  } catch (err) {
    console.error('Error loading chat session:', err);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

// DELETE /api/chat/sessions/:id — delete a session
router.delete('/sessions/:id', async (req, res) => {
  try {
    await db.delete(chatSessions).where(eq(chatSessions.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting chat session:', err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// POST /api/chat — send a message (with optional session persistence)
router.post('/', async (req, res) => {
  const { messages, sessionId: clientSessionId } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // Get the latest user message for title generation
  const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === 'user');

  let sessionId = clientSessionId;

  try {
    // Create or reuse session
    if (!sessionId) {
      const title = lastUserMessage
        ? lastUserMessage.content.slice(0, 60) + (lastUserMessage.content.length > 60 ? '...' : '')
        : 'New conversation';

      const [session] = await db.insert(chatSessions).values({
        title,
      }).returning({ id: chatSessions.id });
      sessionId = session.id;
    }

    // Save user message to DB
    if (lastUserMessage) {
      await db.insert(chatMessages).values({
        sessionId,
        role: 'user',
        content: lastUserMessage.content,
      });
    }
  } catch (err) {
    console.error('Error creating session/saving message:', err);
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Collect assistant response and tool calls for persistence
  let assistantContent = '';
  const toolCallsData: Array<{ id: string; name: string; arguments: string; result?: string; status: string }> = [];

  try {
    const cost = await chatWithTools(
      messages,
      sessionId,
      (text) => {
        assistantContent += text;
        res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
      },
      (event) => {
        if (event.type === 'tool_call') {
          toolCallsData.push({
            id: event.id,
            name: event.name,
            arguments: event.arguments || '{}',
            status: 'calling',
          });
        } else if (event.type === 'tool_result') {
          const tc = toolCallsData.find(t => t.id === event.id);
          if (tc) {
            tc.result = event.result;
            tc.status = 'done';
          }
        }
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    );

    // Save assistant message to DB
    try {
      await db.insert(chatMessages).values({
        sessionId,
        role: 'assistant',
        content: assistantContent,
        cost: cost.totalCost.toFixed(6),
        tokens: cost.totalTokens,
        toolCalls: toolCallsData.length > 0 ? JSON.stringify(toolCallsData) : null,
      });

      // Update session totals
      await db.update(chatSessions)
        .set({
          totalCost: sql`COALESCE(${chatSessions.totalCost}, 0) + ${cost.totalCost.toFixed(6)}::numeric`,
          totalTokens: sql`COALESCE(${chatSessions.totalTokens}, 0) + ${cost.totalTokens}`,
          updatedAt: new Date(),
        })
        .where(eq(chatSessions.id, sessionId));
    } catch (err) {
      console.error('Error saving assistant message:', err);
    }

    res.write(`data: ${JSON.stringify({ type: 'done', cost: { ...cost, sessionId } })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Chat error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'An error occurred' })}\n\n`);
    res.end();
  }
});

export default router;
