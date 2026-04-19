<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch, computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { chatStream } from '../services/chat'
import { clearTokens, isAuthenticated, startLogin } from '../services/auth'
import {
  listSessions,
  saveSession,
  getSession,
  deleteSession,
  clearActiveSession,
  getActiveSessionId,
  migrateOldSession,
} from '../services/session'
import type { ChatMessage, AgentStage } from '../types'
import type { ConversationSession } from '../services/session'

// Auth state
const loggedIn = ref(isAuthenticated())

// Chat state
const messages = ref<ChatMessage[]>([])
const input = ref('')
const threadId = ref<string | null>(null)
const currentSessionId = ref<string>(crypto.randomUUID())
const stage = ref<AgentStage>('idle')
const sending = ref(false)
const lastFailedMessage = ref<string | null>(null)
const chatContainer = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// Sidebar state
const sidebarOpen = ref(true)
const sessions = ref<ConversationSession[]>([])
const isMobile = ref(window.innerWidth < 768)

const stageLabels: Record<AgentStage, string> = {
  idle: '',
  guarding: 'Checking input safety...',
  classifying: 'Understanding your request...',
  processing: 'Working on it...',
  done: '',
}

function refreshSessions() {
  sessions.value = listSessions()
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

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (diff < 604800000) {
    return d.toLocaleDateString([], { weekday: 'short' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
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
    saveSession(currentSessionId.value, threadId.value, messages.value)
    refreshSessions()
  }
}

function newConversation() {
  lastFailedMessage.value = null
  messages.value = []
  threadId.value = null
  stage.value = 'idle'
  currentSessionId.value = crypto.randomUUID()
  clearActiveSession()
  if (isMobile.value) sidebarOpen.value = false
}

function switchToSession(session: ConversationSession) {
  currentSessionId.value = session.id
  threadId.value = session.threadId
  messages.value = [...session.messages]
  lastFailedMessage.value = null
  stage.value = 'idle'
  scrollToBottom()
  if (isMobile.value) sidebarOpen.value = false
}

function removeSession(e: Event, id: string) {
  e.stopPropagation()
  deleteSession(id)
  refreshSessions()
  if (currentSessionId.value === id) {
    newConversation()
  }
}

function retryLastMessage() {
  if (!lastFailedMessage.value) return
  const last = messages.value[messages.value.length - 1]
  if (last?.role === 'assistant' && last.content.startsWith('⚠️')) {
    messages.value.pop()
  }
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
  loggedIn.value = false
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function handleResize() {
  const wasMobile = isMobile.value
  isMobile.value = window.innerWidth < 768
  // Auto-close sidebar when switching to mobile
  if (!wasMobile && isMobile.value) {
    sidebarOpen.value = false
  }
  // Auto-open sidebar when switching to desktop
  if (wasMobile && !isMobile.value) {
    sidebarOpen.value = true
  }
}

watch(input, () => nextTick(autoResize))

onMounted(() => {
  window.addEventListener('resize', handleResize)
  // Set initial sidebar state based on screen size
  sidebarOpen.value = !isMobile.value

  // Migrate old single-session format
  migrateOldSession()
  refreshSessions()

  // Restore active session
  const activeId = getActiveSessionId()
  if (activeId) {
    const session = getSession(activeId)
    if (session) {
      currentSessionId.value = session.id
      threadId.value = session.threadId
      messages.value = [...session.messages]
    }
  }
  scrollToBottom()
})

const isActiveSession = computed(() => (id: string) => id === currentSessionId.value)

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div class="app-layout">
    <!-- Sidebar overlay for mobile -->
    <div
      v-if="isMobile && sidebarOpen"
      class="sidebar-overlay"
      @click="sidebarOpen = false"
    />

    <!-- Sidebar -->
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <span class="sidebar-title">Conversations</span>
        <button class="sidebar-new-btn" @click="newConversation" title="New conversation">
          ✚
        </button>
      </div>

      <div class="sidebar-sessions">
        <div
          v-for="s in sessions"
          :key="s.id"
          class="session-item"
          :class="{ active: isActiveSession(s.id) }"
          @click="switchToSession(s)"
        >
          <div class="session-info">
            <div class="session-title">{{ s.title }}</div>
            <div class="session-time">{{ formatTime(s.updatedAt) }}</div>
          </div>
          <button
            class="session-delete"
            @click="(e) => removeSession(e, s.id)"
            title="Delete"
          >
            ×
          </button>
        </div>
        <div v-if="sessions.length === 0" class="no-sessions">
          No conversations yet
        </div>
      </div>

      <!-- Future nav items placeholder -->
      <!--
      <nav class="sidebar-nav">
        <a href="#" class="nav-item">📦 Orders</a>
        <a href="#" class="nav-item">❓ FAQ</a>
        <a href="#" class="nav-item">⚙️ Settings</a>
      </nav>
      -->

      <div class="sidebar-footer">
        <button v-if="loggedIn" class="logout-sidebar-btn" @click="logout">
          ↗ Sign Out
        </button>
        <button v-else class="login-sidebar-btn" @click="startLogin">
          Sign In
        </button>
      </div>
    </aside>

    <!-- Main chat area -->
    <div class="chat-main">
      <!-- Header -->
      <header class="chat-header">
        <div class="header-left">
          <button class="menu-btn" @click="toggleSidebar" title="Toggle sidebar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <span class="header-title">CeramiCraft Support</span>
        </div>
      </header>

      <!-- Messages -->
      <div ref="chatContainer" class="chat-messages">
        <div v-if="messages.length === 0" class="empty-state">
          <div class="empty-icon">🏺</div>
          <h2>Welcome to CeramiCraft Support</h2>
          <p v-if="loggedIn">Ask about products, orders, or anything we can help with.</p>
          <p v-else>Sign in from the sidebar to chat with our support assistant.</p>
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
      <div v-if="loggedIn" class="chat-input-area">
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
  </div>
</template>

<style scoped>
/* ─── Layout ─── */
.app-layout {
  display: flex;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

/* ─── Sidebar ─── */
.sidebar {
  width: 280px;
  min-width: 280px;
  background: #1e1e2e;
  color: #cdd6f4;
  display: flex;
  flex-direction: column;
  transition: margin-left 0.3s ease;
  z-index: 20;
}

.sidebar:not(.open) {
  margin-left: -280px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #313244;
}

.sidebar-title {
  font-size: 15px;
  font-weight: 600;
}

.sidebar-new-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: #313244;
  color: #cdd6f4;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.sidebar-new-btn:hover {
  background: #45475a;
}

.sidebar-sessions {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  gap: 8px;
}

.session-item:hover {
  background: #313244;
}

.session-item.active {
  background: #45475a;
}

.session-info {
  flex: 1;
  min-width: 0;
}

.session-title {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-time {
  font-size: 11px;
  color: #6c7086;
  margin-top: 2px;
}

.session-delete {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: #6c7086;
  border-radius: 4px;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}

.session-item:hover .session-delete {
  opacity: 1;
}

.session-delete:hover {
  color: #f38ba8;
}

.no-sessions {
  text-align: center;
  color: #6c7086;
  font-size: 13px;
  padding: 24px 12px;
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid #313244;
}

.logout-sidebar-btn {
  width: 100%;
  padding: 8px;
  border: none;
  background: #313244;
  color: #cdd6f4;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.logout-sidebar-btn:hover {
  background: #45475a;
}

.login-sidebar-btn {
  width: 100%;
  padding: 8px;
  border: none;
  background: #313244;
  color: #cdd6f4;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.login-sidebar-btn:hover {
  background: #45475a;
}

/* ─── Mobile overlay ─── */
.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 15;
}

/* ─── Chat Main ─── */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #f8f9fa;
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

.menu-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: #f0f0f0;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  color: #444;
}

.menu-btn:hover {
  background: #e0e0e0;
}

.header-logo {
  font-size: 28px;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
}

/* ─── Messages ─── */
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
  max-width: 800px;
}

.message.user {
  flex-direction: row-reverse;
  align-self: flex-end;
}

.message.assistant {
  align-self: flex-start;
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
  max-width: 640px;
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

/* Markdown */
.markdown-body :deep(p) { margin: 0 0 8px; }
.markdown-body :deep(p:last-child) { margin-bottom: 0; }
.markdown-body :deep(ul),
.markdown-body :deep(ol) { margin: 4px 0; padding-left: 20px; }
.markdown-body :deep(code) { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
.markdown-body :deep(pre) { background: #f5f5f5; padding: 12px; border-radius: 8px; overflow-x: auto; margin: 8px 0; }
.markdown-body :deep(pre code) { background: none; padding: 0; }
.markdown-body :deep(strong) { font-weight: 600; }
.markdown-body :deep(a) { color: #4a90d9; }
.markdown-body :deep(table) { border-collapse: collapse; margin: 8px 0; font-size: 14px; }
.markdown-body :deep(th),
.markdown-body :deep(td) { border: 1px solid #ddd; padding: 6px 12px; }
.markdown-body :deep(th) { background: #f5f5f5; }

/* Stage indicator */
.stage-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px 8px 52px;
  color: #888;
  font-size: 14px;
}

.stage-dots { display: flex; gap: 4px; }

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

/* Retry */
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
.retry-btn:hover { background: #dfeeff; }

/* Input */
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

.chat-input:focus { border-color: #4a90d9; }

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

.send-btn:disabled { background: #ccc; cursor: not-allowed; }
.send-btn:not(:disabled):hover { background: #3a7bc8; }

/* ─── Mobile ─── */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    margin-left: 0;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .sidebar:not(.open) {
    margin-left: 0;
  }

  .chat-messages { padding: 12px; }
  .message-bubble { max-width: 85%; }
  .chat-input-area { padding: 8px 12px 12px; }
  .header-title { font-size: 16px; }
}
</style>
