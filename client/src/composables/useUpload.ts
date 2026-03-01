import { ref } from 'vue';

export function useUpload() {
  const uploading = ref(false);
  const error = ref<string | null>(null);
  const result = ref<{ candidateId: string; message: string } | null>(null);

  async function uploadFile(file: File) {
    uploading.value = true;
    error.value = null;
    result.value = null;

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || 'Upload failed');
      }

      const data = await response.json();
      result.value = { candidateId: data.candidateId, message: data.message };
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Upload failed';
    } finally {
      uploading.value = false;
    }
  }

  return { uploading, error, result, uploadFile };
}
