import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Chat',
      component: () => import('../views/ChatView.vue'),
    },
    {
      path: '/callback',
      name: 'Callback',
      component: () => import('../views/CallbackView.vue'),
    },
  ],
})

export default router
