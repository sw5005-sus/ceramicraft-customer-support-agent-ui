import { describe, it, expect } from 'vitest'

// Test config with default values (no env vars set)
describe('config', () => {
  it('exports config with default values', async () => {
    const { config } = await import('../src/services/config')
    expect(config.agentBaseUrl).toBeTruthy()
    expect(config.zitadel.host).toContain('zitadel')
    expect(config.zitadel.clientId).toBeTruthy()
    expect(config.zitadel.scopes).toContain('openid')
    expect(config.userMsBaseUrl).toBeTruthy()
  })
})
