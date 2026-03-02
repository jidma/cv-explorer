<template>
  <div class="min-h-screen bg-gray-50">
    <nav class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <span class="text-xl font-bold text-gray-900">CV Explorer</span>
          </div>
          <div class="flex items-center space-x-4">
            <router-link
              to="/upload"
              class="px-3 py-2 rounded-md text-sm font-medium"
              :class="$route.path === '/upload' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'"
            >
              Upload
            </router-link>
            <router-link
              to="/chat"
              class="px-3 py-2 rounded-md text-sm font-medium"
              :class="$route.path === '/chat' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'"
            >
              Chat
            </router-link>
            <router-link
              to="/candidates"
              class="px-3 py-2 rounded-md text-sm font-medium"
              :class="$route.path === '/candidates' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'"
            >
              Candidates
            </router-link>

            <!-- Provider switcher -->
            <div v-if="availableProviders.length > 1" class="flex items-center gap-1.5 ml-4 pl-4 border-l border-gray-200">
              <label class="text-xs text-gray-400">LLM</label>
              <select
                :value="currentProvider"
                @change="switchProvider(($event.target as HTMLSelectElement).value)"
                class="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option v-for="p in availableProviders" :key="p" :value="p">{{ providerLabel(p) }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const currentProvider = ref('');
const availableProviders = ref<string[]>([]);

const providerLabel = (p: string) => ({ openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini' }[p] ?? p);

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    currentProvider.value = data.provider;
    availableProviders.value = data.availableProviders;
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

async function switchProvider(provider: string) {
  try {
    const res = await fetch('/api/settings/provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    const data = await res.json();
    currentProvider.value = data.provider;
  } catch (err) {
    console.error('Failed to switch provider:', err);
  }
}

onMounted(loadSettings);
</script>
