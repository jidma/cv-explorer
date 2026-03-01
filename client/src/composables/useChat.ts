import { ref } from 'vue';
import type { ChatMessage, ChatCost, ChatSession } from '../types';

// Module-level state so it survives route navigation
const messages = ref<ChatMessage[]>([]);
const sessions = ref<ChatSession[]>([]);
const sessionId = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const lastCost = ref<ChatCost | null>(null);

export function useChat() {

  async function loadSessions() {
    try {
      const res = await fetch('/api/chat/sessions');
      const data = await res.json();
      sessions.value = data.sessions ?? [];
    } catch (err) {
      console.error('Failed to load chat sessions:', err);
    }
  }

  async function loadSession(id: string) {
    try {
      const res = await fetch(`/api/chat/sessions/${id}`);
      if (!res.ok) throw new Error('Session not found');
      const data = await res.json();

      sessionId.value = id;
      messages.value = (data.messages ?? []).map((m: Record<string, unknown>) => ({
        role: m.role as string,
        content: m.content as string,
        cost: m.cost ? { totalCost: parseFloat(m.cost as string), totalTokens: m.tokens as number, sessionId: id } : undefined,
        toolCalls: m.tool_calls ? JSON.parse(m.tool_calls as string) : undefined,
      }));
      lastCost.value = null;
      error.value = null;
    } catch (err) {
      console.error('Failed to load session:', err);
      error.value = 'Failed to load conversation';
    }
  }

  async function deleteSession(id: string) {
    try {
      await fetch(`/api/chat/sessions/${id}`, { method: 'DELETE' });
      if (sessionId.value === id) {
        newChat();
      }
      await loadSessions();
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }

  function newChat() {
    sessionId.value = null;
    messages.value = [];
    lastCost.value = null;
    error.value = null;
  }

  async function sendMessage(content: string) {
    error.value = null;
    lastCost.value = null;
    messages.value.push({ role: 'user', content });
    messages.value.push({ role: 'assistant', content: '' });

    loading.value = true;
    const assistantIdx = messages.value.length - 1;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId.value,
          messages: messages.value.slice(0, -1).map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'text') {
            messages.value[assistantIdx].content += data.text;
          } else if (data.type === 'tool_call') {
            if (!messages.value[assistantIdx].toolCalls) {
              messages.value[assistantIdx].toolCalls = [];
            }
            messages.value[assistantIdx].toolCalls!.push({
              id: data.id,
              name: data.name,
              arguments: JSON.parse(data.arguments || '{}'),
              status: 'calling',
            });
          } else if (data.type === 'tool_result') {
            const tc = messages.value[assistantIdx].toolCalls?.find(t => t.id === data.id);
            if (tc) {
              try { tc.result = JSON.parse(data.result); } catch { tc.result = data.result; }
              tc.status = 'done';
            }
          } else if (data.type === 'done' && data.cost) {
            const cost: ChatCost = data.cost;
            messages.value[assistantIdx].cost = cost;
            lastCost.value = cost;
            // Capture session ID from server (for new sessions)
            if (cost.sessionId) {
              sessionId.value = cost.sessionId;
            }
          } else if (data.type === 'error') {
            error.value = data.message;
          }
        }
      }

      // Refresh sessions list after a successful message
      await loadSessions();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to send message';
      messages.value.pop();
    } finally {
      loading.value = false;
    }
  }

  return {
    messages, sessions, sessionId, loading, error, lastCost,
    loadSessions, loadSession, deleteSession, newChat, sendMessage,
  };
}
