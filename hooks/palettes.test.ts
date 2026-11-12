import { expect, test } from 'claude-code/testing'

import { PALETTES } from './palettes'
import { fileOf, preview, withOurs, withoutOurs } from './register'

test('every palette is complete and unique', async () => {
  expect(PALETTES.length).toBe(48)
  expect(new Set(PALETTES.map(p => p.id)).size).toBe(48)
  for (const p of PALETTES) {
    expect(/^[a-z][a-z0-9-]{1,40}$/.test(p.id)).toBe(true)
    for (const c of [p.bg, p.text, p.accent]) expect(/^#[0-9a-f]{6}$/.test(c)).toBe(true)
  }
})

test('the slot manifest keeps what another mod put there', async () => {
  const other = {
    manifest_version: 3, name: 'Other',
    content_scripts: [{ matches: ['<all_urls>'], js: ['theme.js'] }],
    web_accessible_resources: [{ resources: ['theme.json'], matches: ['<all_urls>'] }],
  }
  const both = withOurs(other)
  expect(both.content_scripts?.map(s => s.js?.[0])).toEqual(['theme.js', 'palettes.js'])
  expect(withOurs(both).content_scripts?.length).toBe(2)
  expect(withoutOurs(both)).toEqual(other)
  expect(withoutOurs(withOurs(undefined))).toBe(undefined)
})

test('the page file and the preview', async () => {
  const p = PALETTES.find(x => x.id === 'dracula')!
  expect(JSON.parse(fileOf(p)).bg).toBe('#282a36')
  expect(fileOf(undefined)).toBe('{}')
  expect(preview(p, true).includes(p.accent)).toBe(true)
})
