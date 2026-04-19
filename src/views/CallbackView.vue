<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { handleCallback } from '../services/auth'

const router = useRouter()
const error = ref('')
const loading = ref(true)

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')

  if (!code || !state) {
    error.value = 'Missing authorization code or state'
    loading.value = false
    return
  }

  try {
    await handleCallback(code, state)
    router.replace('/')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Authentication failed'
    loading.value = false
  }
})
</script>

<template>
  <div class="callback-container">
    <div class="callback-card">
      <template v-if="loading">
        <div class="spinner" />
        <p>Signing you in...</p>
      </template>
      <template v-else>
        <p class="error">{{ error }}</p>
        <button @click="router.replace('/')">Back to login</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.callback-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #f5f5f5;
}

.callback-card {
  text-align: center;
  background: #fff;
  border-radius: 12px;
  padding: 48px;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.08);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #eee;
  border-top-color: #4a90d9;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error {
  color: #e53e3e;
}

button {
  margin-top: 16px;
  padding: 8px 24px;
  background: #4a90d9;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
</style>
