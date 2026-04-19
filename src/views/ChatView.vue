<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { chatStream, resetThread } from '../services/chat'
import { clearTokens } from '../services/auth'
import type { ChatMessage, AgentStage } from '../types'

const router = useRouter()

const messages = ref<ChatMessage[]>([])
const input = ref('')
const threadId = ref<string | null>(null)
const stage = ref<AgentStage>('idle')
const sending = ref(false)
const chatContainer = ref<HTMLElement | null>(null)

const stageLabels: Record<AgentStage, string> = {
  idle: '',
  guarding: 'Checking input...',
  classifying: 'Understanding your request...',
  processing: 'Working on it...',
  done: '',
}

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}

async function sendMessage() {
  const text = input.value.trim()
  if (!text || sending.value) return

  const userMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: text,
    timestamp: Date.now(),
  }
  messages.value.push(userMsg)
  input.value = ''
  sending.value = true
  stage.value = 'guarding'
  scrollToBottom()

  try {
    const returnedThreadId = await chatStream(text, threadId.value, {
      onStage(s) {
        stage.value = s
        scrollToBottom()
      },
      onReply(content) {
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content,
          timestamp: Date.now(),
        }
        messages.value.push(assistantMsg)
        scrollToBottom()
      },
      onError(message) {
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `⚠️ ${message}`,
          timestamp: Date.now(),
        }
        messages.value.push(errorMsg)
        scrollToBottom()
      },
      onDone(tid) {
        threadId.value = tid
      },
    })

    if (!threadId.value) {
      threadId.value = returnedThreadId
    }
  } catch (e) {
    const errorMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `⚠️ ${e instanceof Error ? e.message : 'Connection failed'}`,
      timestamp: Date.now(),
    }
    messages.value.push(errorMsg)
  } finally {
    stage.value = 'idle'
    sending.value = false
    scrollToBottom()
  }
}

async function newConversation() {
  if (threadId.value) {
    try {
      await resetThread(threadId.value)
    } catch {
      // Non-fatal
    }
  }
  messages.value = []
  threadId.value = null
  stage.value = 'idle'
}

function logout() {
  clearTokens()
  router.replace('/login')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

onMounted(() => {
  scrollToBottom()
})
</script>

<template>
  <div class="chat-layout">
    <!-- Header -->
    <header class="chat-header">
      <div class="header-left">
        <span class="header-logo">🏺</span>
        <span class="header-title">CeramiCraft Support</span>
      </div>
      <div class="header-actions">
        <button class="action-btn" @click="newConversation" title="New conversation">
          ✚
        </button>
        <button class="action-btn logout-btn" @click="logout" title="Sign out">
          ↗
        </button>
      </div>
    </header>

    <!-- Messages -->
    <div ref="chatContainer" class="chat-messages">
      <div v-if="messages.length === 0" class="empty-state">
        <div class="empty-icon">💬</div>
        <p>How can we help you today?</p>
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        class="message"
        :class="msg.role"
      >
        <div class="message-bubble">
          {{ msg.content }}
        </div>
      </div>

      <!-- Stage indicator -->
      <div v-if="stage !== 'idle' && stage !== 'done'" class="stage-indicator">
        <div class="stage-spinner" />
        <span>{{ stageLabels[stage] }}</span>
      </div>
    </div>

    <!-- Input -->
    <div class="chat-input-area">
      <textarea
        v-model="input"
        class="chat-input"
        placeholder="Type your message..."
        rows="1"
        :disabled="sending"
        @keydown="handleKeydown"
      />
      <button
        class="send-btn"
        :disabled="!input.trim() || sending"
        @click="sendMessage"
      >
        ➤
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f5f5;
  max-width: 800px;
  margin: 0 auto;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e5e5e5;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-logo {
  font-size: 24px;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: #f0f0f0;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.action-btn:hover {
  background: #e0e0e0;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #999;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.message {
  display: flex;
}

.message.user {
  justify-content: flex-end;
}

.message.assistant {
  justify-content: flex-start;
}

.message-bubble {
  max-width: 70%;
  padding: 10px 16px;
  border-radius: 16px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.user .message-bubble {
  background: #4a90d9;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.assistant .message-bubble {
  background: #fff;
  color: #1a1a1a;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.stage-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  color: #888;
  font-size: 14px;
}

.stage-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #ddd;
  border-top-color: #4a90d9;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.chat-input-area {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 12px 20px;
  background: #fff;
  border-top: 1px solid #e5e5e5;
}

.chat-input {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid #ddd;
  border-radius: 20px;
  font-size: 15px;
  resize: none;
  outline: none;
  font-family: inherit;
  line-height: 1.4;
  max-height: 120px;
}

.chat-input:focus {
  border-color: #4a90d9;
}

.send-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: #4a90d9;
  color: #fff;
  border-radius: 50%;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  flex-shrink: 0;
}

.send-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.send-btn:not(:disabled):hover {
  background: #3a7bc8;
}
</style>
