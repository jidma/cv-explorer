import { ref, computed } from 'vue';
import type { Upload } from '../types';

// Module-level state so it survives route navigation
const uploads = ref<Upload[]>([]);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollListeners = 0;

export function useMultiUpload() {

  async function loadUploads() {
    try {
      const res = await fetch('/api/uploads');
      const data = await res.json();
      uploads.value = data.uploads ?? [];
    } catch (err) {
      console.error('Failed to load uploads:', err);
    }
  }

  async function enqueueFiles(files: FileList | File[]) {
    const formData = new FormData();
    for (const file of Array.from(files)) {
      formData.append('resume', file);
    }

    try {
      const res = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Upload failed' }));
        console.error('Failed to enqueue files:', data.error);
        return;
      }

      // Refresh list to show new pending items
      await loadUploads();
    } catch (err) {
      console.error('Failed to enqueue files:', err);
    }
  }

  async function removeUpload(id: string) {
    try {
      await fetch(`/api/uploads/${id}`, { method: 'DELETE' });
      await loadUploads();
    } catch (err) {
      console.error('Failed to remove upload:', err);
    }
  }

  const hasActiveUploads = computed(() =>
    uploads.value.some(u => u.status === 'pending' || u.status === 'processing')
  );

  /** Start polling for status updates. Call stopPolling() on unmount. */
  function startPolling(intervalMs = 2000) {
    pollListeners++;
    if (pollTimer) return; // already polling
    pollTimer = setInterval(async () => {
      await loadUploads();
      // Stop polling if nothing is active
      if (!hasActiveUploads.value && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, intervalMs);
  }

  function stopPolling() {
    pollListeners = Math.max(0, pollListeners - 1);
    if (pollListeners === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /** Ensure polling is running if there are active uploads */
  function ensurePolling() {
    if (hasActiveUploads.value && !pollTimer) {
      startPolling();
    }
  }

  return { uploads, hasActiveUploads, loadUploads, enqueueFiles, removeUpload, startPolling, stopPolling, ensurePolling };
}
