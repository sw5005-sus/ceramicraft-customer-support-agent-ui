import { describe, it, expect, vi, beforeEach } from 'vitest'
import { chatStream, resetThread } from '../src/services/chat'

vi.mock('../src/services/config', () => ({
  config: {
    agentBaseUrl: 'http://localhost:8080',
  },
}))

vi.mock('../src/services/auth', () => ({
  getIdToken: vi.fn().mockResolvedValue('test-token'),
}))

function createSSEResponse(events: Array<{ event: string; data: Record<string, unknown> }>): Response {
  const text = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('')
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('chat service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('chatStream', () => {
    it('parses SSE events and calls callbacks', async () => {
      const events = [
        { event: 'guarding', data: {} },
        { event: 'classifying', data: {} },
        { event: 'processing', data: { intent: 'browse', stage: 'browse' } },
        { event: 'reply', data: { content: 'Hello!' } },
        { event: 'done', data: { thread_id: 'tid-123' } },
      ]

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createSSEResponse(events))

      const stages: string[] = []
      let reply = ''
      let doneId = ''

      const tid = await chatStream('hello', null, {
        onStage(s) { stages.push(s) },
        onReply(c) { reply = c },
        onDone(t) { doneId = t },
      })

      expect(stages).toEqual(['guarding', 'classifying', 'processing'])
      expect(reply).toBe('Hello!')
      expect(doneId).toBe('tid-123')
      expect(tid).toBe('tid-123')
    })

    it('calls onError for error events', async () => {
      const events = [
        { event: 'error', data: { message: 'something broke' } },
        { event: 'done', data: { thread_id: 'tid-456' } },
      ]

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createSSEResponse(events))

      let errorMsg = ''
      await chatStream('test', null, {
        onError(m) { errorMsg = m },
      })

      expect(errorMsg).toBe('something broke')
    })

    it('sends Authorization header with token', async () => {
      const events = [{ event: 'done', data: { thread_id: 'tid' } }]
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createSSEResponse(events))

      await chatStream('hi', null, {})

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8080/chat/stream',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        }),
      )
    })

    it('includes thread_id in request body when provided', async () => {
      const events = [{ event: 'done', data: { thread_id: 'existing' } }]
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(createSSEResponse(events))

      await chatStream('hi', 'existing-thread', {})

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.thread_id).toBe('existing-thread')
    })

    it('throws on non-OK response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Internal Error', { status: 500 }),
      )

      await expect(chatStream('hi', null, {})).rejects.toThrow('Chat request failed')
    })
  })

  describe('resetThread', () => {
    it('sends POST to /reset with thread_id', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('', { status: 200 }),
      )

      await resetThread('my-thread')

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:8080/reset?thread_id=my-thread',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('throws on failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('', { status: 500 }),
      )

      await expect(resetThread('tid')).rejects.toThrow('Reset failed')
    })
  })
})
