<template>
  <div class="max-w-3xl mx-auto flex flex-col h-[calc(100vh-10rem)]">
    <h1 class="text-2xl font-bold text-gray-900 mb-4">Ask about CVs</h1>

    <!-- Messages -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto space-y-4 mb-4">
      <div v-if="messages.length === 0" class="text-center text-gray-500 py-12">
        <p class="text-lg">Ask me anything about your candidates</p>
        <p class="mt-2 text-sm">Examples:</p>
        <div class="mt-3 space-y-2">
          <button
            v-for="example in examples"
            :key="example"
            class="block mx-auto px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            @click="input = example"
          >
            {{ example }}
          </button>
        </div>
      </div>

      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="flex"
        :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[80%] px-4 py-3 rounded-lg"
          :class="msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-800'"
        >
          <!-- Tool calls -->
          <div v-if="msg.toolCalls?.length" class="mb-2 space-y-1">
            <div v-for="tc in msg.toolCalls" :key="tc.id">
              <button
                @click="toggleToolCall(tc.id)"
                class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <span v-if="tc.status === 'calling'" class="inline-block w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></span>
                <span v-else class="text-green-500 text-sm">&#10003;</span>
                <span class="font-mono">{{ tc.name }}</span>
                <span class="text-gray-400 text-[10px]">{{ isToolCallExpanded(tc.id) ? '&#9660;' : '&#9654;' }}</span>
              </button>
              <div v-if="isToolCallExpanded(tc.id)" class="mt-1 ml-5 text-xs bg-gray-50 rounded p-2 overflow-x-auto border border-gray-100">
                <div class="mb-1">
                  <span class="font-semibold text-gray-600">Args: </span>
                  <pre class="text-gray-500 whitespace-pre-wrap inline">{{ JSON.stringify(tc.arguments, null, 2) }}</pre>
                </div>
                <div v-if="tc.result !== undefined">
                  <span class="font-semibold text-gray-600">Result: </span>
                  <pre class="text-gray-500 whitespace-pre-wrap max-h-40 overflow-y-auto">{{ formatToolResult(tc.result) }}</pre>
                </div>
              </div>
            </div>
          </div>

          <div class="whitespace-pre-wrap">{{ msg.content }}</div>
          <div v-if="msg.role === 'assistant' && !msg.content && !msg.toolCalls?.length && loading" class="flex space-x-1">
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
          </div>
          <div v-if="msg.cost" class="mt-1 text-xs opacity-60">
            {{ formatCost(msg.cost.totalCost) }} &middot; {{ msg.cost.totalTokens.toLocaleString() }} tokens
          </div>
        </div>
      </div>
    </div>

    <!-- Input -->
    <div class="flex gap-2">
      <input
        v-model="input"
        type="text"
        placeholder="Ask about your candidates..."
        class="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        :disabled="loading"
        @keydown.enter="send"
      />
      <button
        class="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        :disabled="loading || !input.trim()"
        @click="send"
      >
        Send
      </button>
    </div>

    <div v-if="error" class="mt-2 text-red-600 text-sm">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue';
import { useChat } from '../composables/useChat';

const { messages, loading, error, sendMessage, lastCost } = useChat();
const input = ref('');
const messagesContainer = ref<HTMLElement>();

const examples = [
  'Show me all candidates with Java experience',
  'Who has a Master\'s degree in Computer Science?',
  'Find developers with more than 5 years of experience',
  'List all candidates',
];

const expandedToolCalls = ref<Set<string>>(new Set());

function toggleToolCall(id: string) {
  if (expandedToolCalls.value.has(id)) {
    expandedToolCalls.value.delete(id);
  } else {
    expandedToolCalls.value.add(id);
  }
  // Trigger reactivity
  expandedToolCalls.value = new Set(expandedToolCalls.value);
}

function isToolCallExpanded(id: string): boolean {
  return expandedToolCalls.value.has(id);
}

function formatToolResult(result: unknown): string {
  const str = JSON.stringify(result, null, 2);
  if (str.length > 500) return str.slice(0, 500) + '\n... (truncated)';
  return str;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  return `$${cost.toFixed(4)}`;
}

async function send() {
  const text = input.value.trim();
  if (!text || loading.value) return;
  input.value = '';
  await sendMessage(text);
}

watch(messages, async () => {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}, { deep: true });
</script>
