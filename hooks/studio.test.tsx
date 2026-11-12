import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'desktop-palettes',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 40, bodyColumns: 120 },
} as const

const STATE: Record<string, unknown> = {
  isStripOpen: true, setup: 'ready', current: 'nord', view: 'favorites', mood: 'any', query: '',
  size: 'compact', favorites: ['nord', 'dracula'], recent: [], daily: false, showSettings: true, confirmRemove: false,
}

test('the studio draws the worn palette, the favorites and the settings', async ($, on) => {
  on('state.get', (_, e) => ({ value: { value: STATE[(e as { key: string }).key] } }))
  on('env.get', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: false }))

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /Palette Studio/ }))?.text).toBe('🎨 Palette Studio')
    expect((await ui.find({ type: 'Text', text: /^Nord$/ }))?.text).toBe('Nord')
    expect(await ui.find({ type: 'Button', key: 'use-dracula' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'use-gruvbox' })).toBeFalsy()
    expect(await ui.find({ type: 'Button', key: 'daily' })).toBeTruthy()
    await ui.unmount()
  }
})
