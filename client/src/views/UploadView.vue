<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- LEFT: Upload Card -->
    <div>
      <h1 class="text-2xl font-bold text-gray-900 mb-6">Upload Resumes</h1>

      <div
        class="border-2 border-dashed rounded-lg p-12 text-center transition-colors"
        :class="dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-white'"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="handleDrop"
      >
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p class="mt-4 text-lg text-gray-600">Drag & drop resumes here, or</p>
        <label class="mt-2 inline-block cursor-pointer">
          <span class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors">
            Browse files
          </span>
          <input type="file" class="hidden" accept=".pdf,.docx" multiple @change="handleFileSelect" />
        </label>
        <p class="mt-2 text-sm text-gray-500">PDF or DOCX, up to 10MB each</p>
      </div>

      <!-- Skipped files banner -->
      <div v-if="skippedFiles.length" class="mt-3 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <span>{{ skippedFiles.length }} file{{ skippedFiles.length > 1 ? 's' : '' }} skipped (already uploaded): {{ skippedFiles.join(', ') }}</span>
        <button @click="clearSkipped" class="ml-auto text-amber-500 hover:text-amber-700">&times;</button>
      </div>

      <div v-if="pendingCount > 0 || processingCount > 0" class="mt-3 text-sm text-gray-500">
        <span v-if="processingCount > 0">Processing {{ processingCount }} file{{ processingCount > 1 ? 's' : '' }}</span>
        <span v-if="processingCount > 0 && pendingCount > 0"> &middot; </span>
        <span v-if="pendingCount > 0">{{ pendingCount }} pending</span>
      </div>
    </div>

    <!-- RIGHT: Status Feed -->
    <div>
      <h2 class="text-lg font-semibold text-gray-900 mb-4">Upload History</h2>

      <div class="space-y-2 max-h-[70vh] overflow-y-auto">
        <div
          v-for="item in uploadList"
          :key="item.id"
          class="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200"
        >
          <!-- Status icon -->
          <div class="flex-shrink-0">
            <div v-if="item.status === 'pending'" class="w-3 h-3 bg-gray-300 rounded-full"></div>
            <div v-else-if="item.status === 'processing'" class="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <div v-else-if="item.status === 'completed'" class="text-green-500 text-sm font-bold">&#10003;</div>
            <div v-else-if="item.status === 'error'" class="text-red-500 text-sm font-bold">&#10007;</div>
          </div>

          <!-- File info -->
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">{{ item.original_filename }}</p>
            <p class="text-xs" :class="statusTextClass(item.status)">
              {{ statusText(item.status) }}
              <span v-if="item.error_message" class="text-red-500"> &mdash; {{ item.error_message }}</span>
            </p>
            <p v-if="item.candidates.length" class="text-xs text-gray-400 mt-0.5">
              {{ item.candidates.map(c => c.candidate_name).join(', ') }}
            </p>
          </div>

          <!-- Cost badge -->
          <span v-if="item.ingestion_cost" class="text-xs text-gray-400 flex-shrink-0">{{ formatCost(item.ingestion_cost) }}</span>

          <!-- Action buttons -->
          <div class="flex items-center gap-1 flex-shrink-0">
            <!-- Retry button for errored uploads -->
            <button
              v-if="item.status === 'error'"
              @click="retryUpload(item.id)"
              class="text-xs text-indigo-500 hover:text-indigo-700 px-1.5 py-0.5 rounded hover:bg-indigo-50 transition-colors"
              title="Retry"
            >Retry</button>

            <!-- Delete button for non-processing uploads -->
            <button
              v-if="item.status !== 'processing'"
              @click="removeUpload(item.id)"
              class="text-gray-400 hover:text-red-500 text-lg leading-none"
              title="Delete"
            >&times;</button>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="!uploadList.length" class="text-center py-8 text-gray-400">
          <p class="text-sm">No uploads yet. Drop some resumes to get started.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useMultiUpload } from '../composables/useMultiUpload';
import type { Upload } from '../types';

const {
  uploads: uploadList, skippedFiles,
  loadUploads, enqueueFiles, removeUpload, retryUpload, clearSkipped,
  startPolling, stopPolling, ensurePolling,
} = useMultiUpload();
const dragOver = ref(false);

const pendingCount = computed(() => uploadList.value.filter(u => u.status === 'pending').length);
const processingCount = computed(() => uploadList.value.filter(u => u.status === 'processing').length);

onMounted(async () => {
  await loadUploads();
  ensurePolling();
});

onUnmounted(() => {
  stopPolling();
});

function handleDrop(e: DragEvent) {
  dragOver.value = false;
  const files = e.dataTransfer?.files;
  if (files?.length) {
    enqueueFiles(files);
    startPolling();
  }
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = input.files;
  if (files?.length) {
    enqueueFiles(files);
    startPolling();
  }
  input.value = '';
}

function statusText(status: Upload['status']): string {
  switch (status) {
    case 'pending': return 'Waiting...';
    case 'processing': return 'Processing with AI...';
    case 'completed': return 'Ingested successfully';
    case 'error': return 'Failed';
  }
}

function statusTextClass(status: Upload['status']): string {
  switch (status) {
    case 'pending': return 'text-gray-400';
    case 'processing': return 'text-indigo-500';
    case 'completed': return 'text-green-600';
    case 'error': return 'text-red-500';
  }
}

function formatCost(cost: string): string {
  const n = parseFloat(cost);
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}
</script>
