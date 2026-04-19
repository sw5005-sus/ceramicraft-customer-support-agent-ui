<script setup lang="ts">
import { startLogin } from '../services/auth'
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <div class="logo">🏺</div>
      <h1>CeramiCraft</h1>
      <p class="subtitle">Customer Support</p>
      <button class="login-btn" @click="startLogin">
        Sign in with Zitadel
      </button>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #f5f5f5;
}

.login-card {
  text-align: center;
  background: #fff;
  border-radius: 12px;
  padding: 48px 40px;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.08);
  max-width: 400px;
  width: 100%;
}

.logo {
  font-size: 64px;
  margin-bottom: 16px;
}

h1 {
  margin: 0;
  font-size: 28px;
  color: #1a1a1a;
}

.subtitle {
  color: #666;
  margin: 8px 0 32px;
  font-size: 16px;
}

.login-btn {
  width: 100%;
  padding: 12px 24px;
  font-size: 16px;
  background: #4a90d9;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.login-btn:hover {
  background: #3a7bc8;
}
</style>
