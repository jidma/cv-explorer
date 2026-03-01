import { ref } from 'vue';
import type { Upload } from '../types';

// Module-level state so it survives route navigation
const uploads = ref<Upload[]>([]);
const isProcessing = ref(false);

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

      // Start processing if not already running
      if (!isProcessing.value) {
        processNext();
      }
    } catch (err) {
      console.error('Failed to enqueue files:', err);
    }
  }

  async function processNext() {
    isProcessing.value = true;

    while (true) {
      const pending = uploads.value.find(u => u.status === 'pending');
      if (!pending) break;

      // Optimistically mark as processing in the UI
      pending.status = 'processing';

      try {
        const res = await fetch(`/api/uploads/${pending.id}/process`, {
          method: 'POST',
        });

        if (!res.ok) {
          console.error('Failed to process upload:', pending.id);
        }

        // Refresh from DB to get accurate state
        await loadUploads();
      } catch (err) {
        console.error('Error processing upload:', err);
        await loadUploads();
      }
    }

    isProcessing.value = false;
  }

  async function removeUpload(id: string) {
    try {
      await fetch(`/api/uploads/${id}`, { method: 'DELETE' });
      await loadUploads();
    } catch (err) {
      console.error('Failed to remove upload:', err);
    }
  }

  return { uploads, isProcessing, loadUploads, enqueueFiles, removeUpload };
}
