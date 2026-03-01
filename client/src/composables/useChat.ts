import { ref } from 'vue';
import type { ChatMessage } from '../types';

export function useChat() {
  const messages = ref<ChatMessage[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function sendMessage(content: string) {
    error.value = null;
    messages.value.push({ role: 'user', content });
    messages.value.push({ role: 'assistant', content: '' });

    loading.value = true;
    const assistantIdx = messages.value.length - 1;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
          } else if (data.type === 'error') {
            error.value = data.message;
          }
        }
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to send message';
      messages.value.pop(); // Remove empty assistant message
    } finally {
      loading.value = false;
    }
  }

  function clearMessages() {
    messages.value = [];
  }

  return { messages, loading, error, sendMessage, clearMessages };
}
