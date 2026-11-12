import { expect, test } from 'claude-code/testing'

import { PALETTES } from './palettes'
import { MOODS, dailyPick, fileOf, filtered, hero, preview, withOurs, withoutOurs } from './register'

const lum = (h: string) => {
  const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4))
  return .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!
}
const contrast = (a: string, b: string) => {
  const x = lum(a), y = lum(b)
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05)
}

test('every palette is complete, unique and readable', async () => {
  expect(PALETTES.length).toBe(78)
  expect(new Set(PALETTES.map(p => p.id)).size).toBe(78)
  for (const p of PALETTES) {
    expect(/^[a-z][a-z0-9-]{1,40}$/.test(p.id)).toBe(true)
    expect(Object.hasOwn(MOODS, p.mood)).toBe(true)
    for (const c of [p.bg, p.text, p.accent]) expect(/^#[0-9a-f]{6}$/.test(c)).toBe(true)
    expect(contrast(p.text, p.bg) >= 4.5).toBe(true)
    expect(contrast(p.accent, p.bg) >= 3).toBe(true)
  }
})

test('views, moods and search narrow the list', async () => {
  expect(filtered('all', 'any', '', [], []).length).toBe(78)
  expect(filtered('light', 'any', '', [], []).every(p => p.base === 'light')).toBe(true)
  expect(filtered('all', 'neon', '', [], []).every(p => p.mood === 'neon')).toBe(true)
  expect(filtered('all', 'any', 'nord', [], []).map(p => p.id)).toEqual(['nord'])
  expect(filtered('favorites', 'any', '', ['nord', 'gone', 'dracula'], []).map(p => p.id)).toEqual(['nord', 'dracula'])
  expect(filtered('recent', 'any', '', [], ['vesper']).map(p => p.id)).toEqual(['vesper'])
})

test('palette of the day is steady for a day and keeps to favorites', async () => {
  expect(dailyPick('2026-11-13', []).id).toBe(dailyPick('2026-11-13', []).id)
  expect(['nord', 'dracula']).toContain(dailyPick('2026-11-14', ['nord', 'dracula']).id)
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

test('the page file and the pictures', async () => {
  const p = PALETTES.find(x => x.id === 'dracula')!
  expect(JSON.parse(fileOf(p)).bg).toBe('#282a36')
  expect(fileOf(undefined)).toBe('{}')
  expect(preview(p, true).includes(p.accent)).toBe(true)
  expect(hero(p).includes('viewBox="0 0 120 86"')).toBe(true)
})
