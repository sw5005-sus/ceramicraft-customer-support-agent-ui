/** Chat message in the conversation. */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

/** SSE event from /chat/stream. */
export interface StreamEvent {
  event: 'guarding' | 'classifying' | 'processing' | 'reply' | 'error' | 'done'
  data: Record<string, unknown>
}

/** Agent processing stage for UI display. */
export type AgentStage = 'idle' | 'guarding' | 'classifying' | 'processing' | 'done'

/** Auth token pair stored locally. */
export interface TokenPair {
  idToken: string
  refreshToken: string
  expiresAt: number
}
