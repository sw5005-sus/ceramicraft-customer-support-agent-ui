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
      path: '/login',
      redirect: '/',
    },
    {
      path: '/callback',
      name: 'Callback',
      component: () => import('../views/CallbackView.vue'),
    },
    {
      path: '/chat',
      redirect: '/',
    },
  ],
})

export default router
