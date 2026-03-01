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
          </div>
        </div>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <router-view />
    </main>
  </div>
</template>
