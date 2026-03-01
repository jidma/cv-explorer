<template>
  <div>
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Candidates</h1>

    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
      <p class="mt-2 text-gray-500">Loading candidates...</p>
    </div>

    <div v-else-if="candidates.length === 0" class="text-center py-12 text-gray-500">
      <p class="text-lg">No candidates yet</p>
      <router-link to="/upload" class="mt-2 inline-block text-indigo-600 hover:text-indigo-800">
        Upload a resume &rarr;
      </router-link>
    </div>

    <div v-else>
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="candidate in candidates"
          :key="candidate.id"
          class="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow cursor-pointer"
          @click="selectCandidate(candidate.id)"
        >
          <h3 class="font-semibold text-gray-900">{{ candidate.full_name }}</h3>
          <p v-if="candidate.location" class="text-sm text-gray-500 mt-1">{{ candidate.location }}</p>
          <p v-if="candidate.summary" class="text-sm text-gray-600 mt-2 line-clamp-3">{{ candidate.summary }}</p>
          <p class="text-xs text-gray-400 mt-3">Added {{ formatDate(candidate.created_at) }}</p>
        </div>
      </div>
    </div>

    <!-- Detail modal -->
    <div v-if="selected" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" @click.self="selected = null">
      <div class="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h2 class="text-2xl font-bold text-gray-900">{{ selected.full_name }}</h2>
            <div class="flex gap-3 text-sm text-gray-500 mt-1">
              <span v-if="selected.email">{{ selected.email }}</span>
              <span v-if="selected.phone">{{ selected.phone }}</span>
              <span v-if="selected.location">{{ selected.location }}</span>
            </div>
          </div>
          <button class="text-gray-400 hover:text-gray-600 text-2xl" @click="selected = null">&times;</button>
        </div>

        <p v-if="selected.summary" class="text-gray-700 mb-4">{{ selected.summary }}</p>

        <!-- Document actions -->
        <div v-if="selected.document_mime_type" class="flex gap-2 mb-6">
          <button
            class="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
            @click="showDocument = !showDocument"
          >
            {{ showDocument ? 'Hide Document' : 'View Document' }}
          </button>
          <a
            :href="`/api/candidates/${selected.id}/document`"
            download
            class="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
          >
            Download ({{ selected.original_filename }})
          </a>
        </div>

        <!-- Embedded document viewer -->
        <div v-if="showDocument && selected.document_mime_type" class="mb-6">
          <iframe
            v-if="selected.document_mime_type === 'application/pdf'"
            :src="`/api/candidates/${selected.id}/document`"
            class="w-full h-[600px] border border-gray-200 rounded-lg"
          />
          <div v-else class="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
            Preview not available for this file type. Use the download button above.
          </div>
        </div>

        <!-- Skills -->
        <div v-if="selected.skills?.length" class="mb-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-2">Skills</h3>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="skill in selected.skills"
              :key="skill.id"
              class="px-3 py-1 bg-indigo-50 text-indigo-700 text-sm rounded-full"
            >
              {{ skill.name }}
              <span v-if="skill.category" class="text-indigo-400 ml-1">({{ skill.category }})</span>
            </span>
          </div>
        </div>

        <!-- Experience -->
        <div v-if="selected.experiences?.length" class="mb-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-2">Experience</h3>
          <div class="space-y-3">
            <div v-for="exp in selected.experiences" :key="exp.id" class="border-l-2 border-indigo-200 pl-4">
              <p class="font-medium text-gray-900">{{ exp.title }}</p>
              <p class="text-sm text-gray-600">{{ exp.company }} <span v-if="exp.location">- {{ exp.location }}</span></p>
              <p class="text-xs text-gray-400">{{ formatDateRange(exp.start_date, exp.end_date, exp.is_current) }}</p>
              <p v-if="exp.description" class="text-sm text-gray-600 mt-1">{{ exp.description }}</p>
            </div>
          </div>
        </div>

        <!-- Education -->
        <div v-if="selected.education?.length" class="mb-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-2">Education</h3>
          <div class="space-y-3">
            <div v-for="edu in selected.education" :key="edu.id" class="border-l-2 border-green-200 pl-4">
              <p class="font-medium text-gray-900">{{ edu.degree }} <span v-if="edu.field_of_study">in {{ edu.field_of_study }}</span></p>
              <p class="text-sm text-gray-600">{{ edu.institution }}</p>
              <p class="text-xs text-gray-400">{{ formatDateRange(edu.start_date, edu.end_date) }}</p>
            </div>
          </div>
        </div>

        <!-- Languages -->
        <div v-if="selected.languages?.length" class="mb-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-2">Languages</h3>
          <div class="flex flex-wrap gap-2">
            <span v-for="lang in selected.languages" :key="lang.id" class="px-3 py-1 bg-green-50 text-green-700 text-sm rounded-full">
              {{ lang.name }} <span v-if="lang.proficiency" class="text-green-400">({{ lang.proficiency }})</span>
            </span>
          </div>
        </div>

        <!-- Certifications -->
        <div v-if="selected.certifications?.length">
          <h3 class="text-lg font-semibold text-gray-900 mb-2">Certifications</h3>
          <div class="space-y-2">
            <div v-for="cert in selected.certifications" :key="cert.id">
              <p class="font-medium text-gray-900">{{ cert.name }}</p>
              <p class="text-sm text-gray-500">{{ cert.issuer }} <span v-if="cert.issue_date">- {{ cert.issue_date }}</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { Candidate, CandidateDetail } from '../types';

const candidates = ref<Candidate[]>([]);
const selected = ref<CandidateDetail | null>(null);
const loading = ref(true);
const showDocument = ref(false);

onMounted(async () => {
  try {
    const res = await fetch('/api/candidates');
    const data = await res.json();
    candidates.value = data.candidates;
  } catch (err) {
    console.error('Failed to load candidates:', err);
  } finally {
    loading.value = false;
  }
});

async function selectCandidate(id: string) {
  showDocument.value = false;
  try {
    const res = await fetch(`/api/candidates/${id}`);
    selected.value = await res.json();
  } catch (err) {
    console.error('Failed to load candidate:', err);
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

function formatDateRange(start: string | null, end: string | null, isCurrent?: boolean): string {
  const parts: string[] = [];
  if (start) parts.push(new Date(start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
  if (isCurrent) parts.push('Present');
  else if (end) parts.push(new Date(end).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
  return parts.join(' - ');
}
</script>
