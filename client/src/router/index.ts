import { createRouter, createWebHistory } from 'vue-router';
import UploadView from '../views/UploadView.vue';
import ChatView from '../views/ChatView.vue';
import CandidatesView from '../views/CandidatesView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/upload' },
    { path: '/upload', component: UploadView },
    { path: '/chat', component: ChatView },
    { path: '/candidates', component: CandidatesView },
  ],
});

export default router;
