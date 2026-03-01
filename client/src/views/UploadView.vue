<template>
  <div class="max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Upload Resume</h1>

    <div
      class="border-2 border-dashed rounded-lg p-12 text-center transition-colors"
      :class="dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-white'"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="handleDrop"
    >
      <div v-if="!uploading">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p class="mt-4 text-lg text-gray-600">Drag & drop a resume here, or</p>
        <label class="mt-2 inline-block cursor-pointer">
          <span class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors">
            Browse files
          </span>
          <input type="file" class="hidden" accept=".pdf,.docx" @change="handleFileSelect" />
        </label>
        <p class="mt-2 text-sm text-gray-500">PDF or DOCX, up to 10MB</p>
      </div>

      <div v-else class="py-4">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto"></div>
        <p class="mt-4 text-gray-600">Processing resume...</p>
        <p class="text-sm text-gray-500">Extracting data with AI. This may take a moment.</p>
      </div>
    </div>

    <div v-if="error" class="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
      <p class="text-red-700">{{ error }}</p>
    </div>

    <div v-if="result" class="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
      <p class="text-green-700 font-medium">{{ result.message }}</p>

      <div v-if="result.cost" class="mt-3 text-sm text-gray-600">
        <p class="font-medium text-gray-700 mb-1">Processing cost</p>
        <div class="flex gap-4">
          <span>Total: {{ formatCost(result.cost.total) }}</span>
          <span>Tokens: {{ result.cost.tokens.toLocaleString() }}</span>
        </div>
        <div v-if="result.cost.breakdown?.length" class="mt-2 space-y-1">
          <div v-for="(step, i) in result.cost.breakdown" :key="i" class="flex justify-between text-xs text-gray-500 bg-white rounded px-2 py-1">
            <span>{{ step.operation }} <span class="text-gray-400">({{ step.model }})</span></span>
            <span>{{ formatCost(step.cost) }} &middot; {{ step.tokens.toLocaleString() }} tokens</span>
          </div>
        </div>
      </div>

      <router-link
        :to="`/candidates`"
        class="mt-3 inline-block text-indigo-600 hover:text-indigo-800 text-sm"
      >
        View all candidates &rarr;
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useUpload } from '../composables/useUpload';

const { uploading, error, result, uploadFile } = useUpload();
const dragOver = ref(false);

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  return `$${cost.toFixed(4)}`;
}

function handleDrop(e: DragEvent) {
  dragOver.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) uploadFile(file);
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) uploadFile(file);
}
</script>
