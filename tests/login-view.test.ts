import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LoginView from '../src/views/LoginView.vue'

describe('LoginView.vue', () => {
  it('renders login button', () => {
    const wrapper = mount(LoginView)
    expect(wrapper.find('.login-btn').exists()).toBe(true)
    expect(wrapper.text()).toContain('Sign in')
  })

  it('renders CeramiCraft branding', () => {
    const wrapper = mount(LoginView)
    expect(wrapper.text()).toContain('CeramiCraft')
  })
})
