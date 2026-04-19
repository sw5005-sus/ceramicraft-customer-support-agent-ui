<script setup lang="ts">
import { ref, nextTick, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { chatStream, resetThread } from '../services/chat'
import { clearTokens } from '../services/auth'
import { saveSession, loadSession, clearSession } from '../services/session'
import type { ChatMessage, AgentStage } from '../types'

const router = useRouter()

const messages = ref<ChatMessage[]>([])
const input = ref('')
const threadId = ref<string | null>(null)
const stage = ref<AgentStage>('idle')
const sending = ref(false)
const lastFailedMessage = ref<string | null>(null)
const chatContainer = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const stageLabels: Record<AgentStage, string> = {
  idle: '',
  guarding: 'Checking input safety...',
  classifying: 'Understanding your request...',
  processing: 'Working on it...',
  done: '',
}

function renderMarkdown(text: string): string {
  const raw = marked.parse(text, { async: false }) as string
  return DOMPurify.sanitize(raw)
}

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
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
  lastFailedMessage.value = null
  scrollToBottom()

  // Reset textarea height
  nextTick(autoResize)

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
    lastFailedMessage.value = text
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
    saveSession(threadId.value, messages.value)
  }
}

async function newConversation() {
  lastFailedMessage.value = null
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
  clearSession()
}

function retryLastMessage() {
  if (!lastFailedMessage.value) return
  // Remove the last error message
  const last = messages.value[messages.value.length - 1]
  if (last?.role === 'assistant' && last.content.startsWith('⚠️')) {
    messages.value.pop()
  }
  // Also remove the failed user message
  const userMsg = messages.value[messages.value.length - 1]
  if (userMsg?.role === 'user') {
    messages.value.pop()
  }
  input.value = lastFailedMessage.value
  lastFailedMessage.value = null
  nextTick(sendMessage)
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

watch(input, () => nextTick(autoResize))

onMounted(() => {
  // Restore previous session
  const saved = loadSession()
  if (saved) {
    messages.value = saved.messages
    threadId.value = saved.threadId
  }
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
        <div class="empty-icon">🏺</div>
        <h2>Welcome to CeramiCraft Support</h2>
        <p>Ask about products, orders, or anything we can help with.</p>
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        class="message"
        :class="msg.role"
      >
        <div class="message-avatar">
          {{ msg.role === 'user' ? '👤' : '🤖' }}
        </div>
        <div class="message-bubble">
          <div v-if="msg.role === 'assistant'" class="markdown-body" v-html="renderMarkdown(msg.content)" />
          <template v-else>{{ msg.content }}</template>
        </div>
      </div>

      <!-- Stage indicator -->
      <div v-if="stage !== 'idle' && stage !== 'done'" class="stage-indicator">
        <div class="stage-dots">
          <span class="dot" />
          <span class="dot" />
          <span class="dot" />
        </div>
        <span>{{ stageLabels[stage] }}</span>
      </div>

      <!-- Retry button -->
      <div v-if="lastFailedMessage && !sending" class="retry-bar">
        <button class="retry-btn" @click="retryLastMessage">
          ↻ Retry
        </button>
      </div>
    </div>

    <!-- Input -->
    <div class="chat-input-area">
      <textarea
        ref="textareaRef"
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
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: #f8f9fa;
  max-width: 960px;
  margin: 0 auto;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.06);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-logo {
  font-size: 28px;
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
  gap: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #888;
  text-align: center;
  padding: 40px 20px;
}

.empty-state .empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-state h2 {
  font-size: 20px;
  color: #444;
  margin-bottom: 8px;
  font-weight: 600;
}

.empty-state p {
  font-size: 15px;
  color: #888;
}

.message {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  font-size: 20px;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.message-bubble {
  max-width: 75%;
  padding: 10px 16px;
  border-radius: 16px;
  line-height: 1.6;
  word-break: break-word;
  font-size: 15px;
}

.user .message-bubble {
  background: #4a90d9;
  color: #fff;
  border-bottom-right-radius: 4px;
  white-space: pre-wrap;
}

.assistant .message-bubble {
  background: #fff;
  color: #1a1a1a;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

/* Markdown content styling */
.markdown-body :deep(p) {
  margin: 0 0 8px;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 4px 0;
  padding-left: 20px;
}

.markdown-body :deep(code) {
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}

.markdown-body :deep(pre) {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
}

.markdown-body :deep(strong) {
  font-weight: 600;
}

.markdown-body :deep(a) {
  color: #4a90d9;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 14px;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid #ddd;
  padding: 6px 12px;
}

.markdown-body :deep(th) {
  background: #f5f5f5;
}

.stage-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px 8px 52px;
  color: #888;
  font-size: 14px;
}

.stage-dots {
  display: flex;
  gap: 4px;
}

.dot {
  width: 6px;
  height: 6px;
  background: #bbb;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}

.dot:nth-child(1) { animation-delay: -0.32s; }
.dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.retry-bar {
  display: flex;
  justify-content: center;
  padding: 8px 16px 0 52px;
}

.retry-btn {
  padding: 6px 16px;
  font-size: 14px;
  color: #4a90d9;
  background: #f0f7ff;
  border: 1px solid #c5ddf5;
  border-radius: 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.retry-btn:hover {
  background: #dfeeff;
}

.chat-input-area {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px 20px 16px;
  background: #fff;
  border-top: 1px solid #e8e8e8;
  flex-shrink: 0;
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
  transition: border-color 0.2s;
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

/* Mobile responsive */
@media (max-width: 600px) {
  .chat-layout {
    max-width: 100%;
  }

  .chat-messages {
    padding: 12px;
  }

  .message-bubble {
    max-width: 85%;
  }

  .chat-input-area {
    padding: 8px 12px 12px;
  }

  .header-title {
    font-size: 16px;
  }
}
</style>
