import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mood, Palette, Size, View } from '../types'
import { PALETTES } from './palettes'

// Claude Desktop loads the extension in its React DevTools slot when REACT_PROFILE=1. The slot lives under its
// userData: %APPDATA%\Claude or %LOCALAPPDATA%\Claude-Data\<id> on Windows, ~/Library/Application Support/Claude on
// macOS. Other mods may share the slot, so only our own entries go in and come out.
const SLOT = ['extensions', 'fmkadmapgofadopljbjfkapdkoienihi']
const SCRIPT = 'palettes.js'
const DATA = 'palettes.json'
const AGENT = 'com.github.desktop-palettes'
const QUIT = { windows: 'also from the tray', macos: 'Cmd+Q' } as const
const BY_HAND = {
  windows: 'Set the user environment variable REACT_PROFILE=1 by hand',
  macos: 'Run launchctl setenv REACT_PROFILE 1 in Terminal',
} as const

export const MOODS: Record<Mood, string> = {
  warm: '🔥 Warm', cool: '❄️ Cool', neon: '⚡ Neon', nature: '🌿 Nature', pastel: '🌸 Pastel', retro: '📼 Retro', mono: '◐ Mono',
}
const VIEWS: Record<View, string> = { all: 'All', dark: '🌙 Dark', light: '☀️ Light', favorites: '★ Favorites', recent: '🕘 Recent' }
const RECENT_MAX = 8

const current = atom({ plugin: 'desktop-palettes', key: 'current' } as const, 'claude')
type Setup = 'missing' | 'restart' | 'ready'
const setup = atom({ plugin: 'desktop-palettes', key: 'setup' } as const, 'missing' as Setup)
const isStripOpen = atom({ plugin: 'desktop-palettes', key: 'isStripOpen' } as const, false)
const view = atom({ plugin: 'desktop-palettes', key: 'view' } as const, 'all' as View)
const mood = atom({ plugin: 'desktop-palettes', key: 'mood' } as const, 'any' as Mood | 'any')
const query = atom({ plugin: 'desktop-palettes', key: 'query' } as const, '')
const size = atom({ plugin: 'desktop-palettes', key: 'size' } as const, 'compact' as Size)
const favorites = atom({ plugin: 'desktop-palettes', key: 'favorites' } as const, [] as string[])
const recent = atom({ plugin: 'desktop-palettes', key: 'recent' } as const, [] as string[])
const daily = atom({ plugin: 'desktop-palettes', key: 'daily' } as const, false)
const showSettings = atom({ plugin: 'desktop-palettes', key: 'showSettings' } as const, false)
const confirmRemove = atom({ plugin: 'desktop-palettes', key: 'confirmRemove' } as const, false)

const join = (base: string, ...parts: string[]) => [base, ...parts].join(base.includes('\\') ? '\\' : '/')

// Newer Windows installs keep their data in %LOCALAPPDATA%\Claude-Data\<package id>: the one holding Local State
const claudeData = async ($: EngineInterface) => {
  const local = await $.env.get('LOCALAPPDATA')
  const root = local && join(local, 'Claude-Data')
  if (!root || !(await $.fs.exists(root))) return undefined
  for (const d of await $.fs.list(root))
    if (d.kind !== 'file' && (await $.fs.exists(join(root, d.name, 'Local State')))) return join(root, d.name)
  return undefined
}

type Host = { os: 'windows' | 'macos'; home: string; userData: string }
const hostOf = async ($: EngineInterface): Promise<Host | undefined> => {
  const appData = await $.env.get('APPDATA')
  if (appData) {
    const userData = (await claudeData($).catch(() => undefined)) ?? join(appData, 'Claude')
    return { os: 'windows', home: (await $.env.get('USERPROFILE')) ?? '', userData }
  }
  const home = await $.env.get('HOME')
  const userData = home && join(home, 'Library', 'Application Support', 'Claude')
  return userData && (await $.fs.exists(userData)) ? { os: 'macos', home: home!, userData } : undefined
}
const slot = async ($: EngineInterface) => {
  const host = await hostOf($)
  return host && join(host.userData, ...SLOT)
}

type Manifest = {
  manifest_version?: number; name?: string; version?: string; description?: string
  content_scripts?: { matches?: string[]; js?: string[] }[]
  web_accessible_resources?: { resources?: string[]; matches?: string[] }[]
}
const FRESH: Manifest = {
  manifest_version: 3,
  name: 'Desktop Palettes',
  version: '0.2.1',
  description: 'Paints the palette picked with /palettes over Claude Desktop. Sits in the React DevTools slot, loaded when REACT_PROFILE=1.',
  content_scripts: [{ matches: ['<all_urls>'], js: [SCRIPT] }],
  web_accessible_resources: [{ resources: [DATA], matches: ['<all_urls>'] }],
}
export const withOurs = (m: Manifest | undefined): Manifest => {
  if (!m) return FRESH
  const scripts = [...(m.content_scripts ?? [])]
  if (!scripts.some(s => s.js?.includes(SCRIPT))) scripts.push(FRESH.content_scripts![0]!)
  const war = [...(m.web_accessible_resources ?? [])]
  if (!war.some(w => w.resources?.includes(DATA))) war.push(FRESH.web_accessible_resources![0]!)
  return { ...m, content_scripts: scripts, web_accessible_resources: war }
}
// undefined when nothing but ours was there
export const withoutOurs = (m: Manifest): Manifest | undefined => {
  const scripts = (m.content_scripts ?? []).filter(s => !s.js?.includes(SCRIPT))
  if (!scripts.length) return undefined
  const war = (m.web_accessible_resources ?? [])
    .map(w => ({ ...w, resources: w.resources?.filter(r => r !== DATA) }))
    .filter(w => w.resources?.length)
  return { ...m, content_scripts: scripts, web_accessible_resources: war }
}

const manifestIn = async ($: EngineInterface, dir: string): Promise<Manifest | undefined> => {
  try {
    return JSON.parse(String(await $.fs.read(join(dir, 'manifest.json'))))
  } catch {
    return undefined
  }
}

export const fileOf = (p: Palette | undefined) =>
  JSON.stringify(p ? { id: p.id, bg: p.bg, text: p.text, accent: p.accent, success: p.success, error: p.error, warning: p.warning } : {})

// the palettes a view, a mood and a search leave, in the order the view keeps
export const filtered = (v: View, m: Mood | 'any', q: string, favs: string[], recents: string[]) => {
  const byId = (ids: string[]) => ids.map(id => PALETTES.find(p => p.id === id)).filter((p): p is Palette => !!p)
  const base = v === 'favorites' ? byId(favs) : v === 'recent' ? byId(recents)
    : PALETTES.filter(p => v === 'all' || p.base === v)
  const words = q.trim().toLowerCase()
  return base.filter(p => (m === 'any' || p.mood === m) && (!words || p.name.toLowerCase().includes(words) || p.mood.includes(words)))
}

// the same palette all day, a new one the next: from the favorites when there are any
export const dailyPick = (day: string, favs: string[]) => {
  const pool = favs.length ? PALETTES.filter(p => favs.includes(p.id)) : PALETTES
  let h = 2166136261
  for (const c of day) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return pool[(h >>> 0) % pool.length]!
}
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

const check = async ($: EngineInterface) => {
  const dir = await slot($)
  const m = dir ? await manifestIn($, dir) : undefined
  const has = !!m?.content_scripts?.some(s => s.js?.includes(SCRIPT))
  // setx and launchctl setenv reach only processes started after them: REACT_PROFILE shows here once Claude Desktop restarted
  const loaded = (await $.env.get('REACT_PROFILE')) === '1'
  await update($, setup, was => (!has ? 'missing' : loaded && was !== 'restart' ? 'ready' : 'restart'))
}

// after a mod update: the new content script in place (the page loads it at start)
const refresh = async ($: EngineInterface) => {
  const dir = await slot($)
  if (!dir || (await read($, setup)) === 'missing') return
  const js = String(await $.fs.read(`${$.plugin.root}/extension/${SCRIPT}`))
  if (String(await $.fs.read(join(dir, SCRIPT)).catch(() => '')) === js) return
  await $.fs.write(join(dir, SCRIPT), js)
  $.ui.toast('Palette Studio is updated. Restart Claude Desktop to load the new version.')
}

const install = async ($: EngineInterface) => {
  const host = await hostOf($)
  const dir = await slot($)
  if (!host || !dir) return $.ui.toast('Only Windows and macOS are supported for now.')
  await $.fs.write(join(dir, SCRIPT), String(await $.fs.read(`${$.plugin.root}/extension/${SCRIPT}`)))
  if (!(await $.fs.exists(join(dir, DATA)))) await $.fs.write(join(dir, DATA), '{}')
  await $.fs.write(join(dir, 'manifest.json'), JSON.stringify(withOurs(await manifestIn($, dir)), null, 2))
  let exitCode = 0
  if ((await $.env.get('REACT_PROFILE')) !== '1') {
    if (host.os === 'windows') exitCode = (await $.process.run(['setx', 'REACT_PROFILE', '1'])).exitCode ?? 1
    else {
      await $.fs.write(join(host.home, 'Library', 'LaunchAgents', `${AGENT}.plist`), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${AGENT}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/launchctl</string><string>setenv</string><string>REACT_PROFILE</string><string>1</string></array>
  <key>RunAtLoad</key><true/>
</dict></plist>
`)
      exitCode = (await $.process.run(['launchctl', 'setenv', 'REACT_PROFILE', '1'])).exitCode ?? 1
    }
  }
  await update($, setup, () => 'restart')
  $.ui.toast(exitCode === 0
    ? `Installed. Quit Claude Desktop fully (${QUIT[host.os]}) and open it again, then type /palettes.`
    : 'The extension is copied, but REACT_PROFILE=1 could not be set.')
}

const remove = async ($: EngineInterface) => {
  const host = await hostOf($)
  const dir = await slot($)
  await update($, confirmRemove, () => false)
  if (!host || !dir) return $.ui.toast('Claude Desktop\'s data folder was not found, so there is nothing to remove.')
  const m = await manifestIn($, dir)
  const rest = m && withoutOurs(m)
  const files = [SCRIPT, DATA].map(f => join(dir, f))
  const run = async (cmd: string[]) => (await $.process.run(cmd)).exitCode
  let exitCode: number | null
  let note = ''
  if (!m || rest) {
    // another mod still uses the slot (or its manifest is unreadable): take out only our part
    if (rest) await $.fs.write(join(dir, 'manifest.json'), JSON.stringify(rest, null, 2))
    exitCode = await run(host.os === 'windows' ? ['cmd', '/c', 'del', '/q', ...files] : ['rm', '-f', '--', ...files])
  } else {
    exitCode = await run(host.os === 'windows' ? ['cmd', '/c', 'rmdir', '/s', '/q', dir] : ['rm', '-rf', dir])
    if (host.os === 'windows') {
      await run(['setx', 'REACT_PROFILE', ''])
      await run(['reg', 'delete', 'HKCU\\Environment', '/v', 'REACT_PROFILE', '/f'])
    } else {
      await run(['launchctl', 'unsetenv', 'REACT_PROFILE'])
      await run(['rm', '-f', join(host.home, 'Library', 'LaunchAgents', `${AGENT}.plist`)])
    }
    note = ' REACT_PROFILE is cleared too.'
  }
  await update($, setup, () => 'missing')
  await update($, current, () => 'claude')
  $.ui.toast(exitCode !== 0 ? `Could not remove every file. Delete them by hand in ${dir}`
    : `Extension removed.${note} Restart Claude Desktop; then you can uninstall the plugin.`)
}

// favorites, recents and settings last across sessions in the store; the atoms mirror them for drawing
const saveList = async ($: EngineInterface, key: 'favorites' | 'recent', list: string[]) => {
  if (key === 'favorites') await update($, favorites, () => list)
  else await update($, recent, () => list)
  await $.store.set(key, list)
}
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

const pick = async ($: EngineInterface, p: Palette | undefined, quiet = false) => {
  const dir = await slot($)
  if (!dir) return
  await $.fs.write(join(dir, DATA), fileOf(p))
  await update($, current, () => p?.id ?? 'claude')
  if (p) await saveList($, 'recent', [p.id, ...(await read($, recent)).filter(id => id !== p.id)].slice(0, RECENT_MAX))
  if (!quiet) $.ui.toast(p ? `${MOODS[p.mood].split(' ')[0]} ${p.name}` : 'Back to Claude\'s own colors')
}

const toggleFavorite = async ($: EngineInterface, id: string) => {
  const favs = await read($, favorites)
  await saveList($, 'favorites', favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id])
}

const surprise = async ($: EngineInterface) => {
  const now = await read($, current)
  const pool = filtered(await read($, view), await read($, mood), await read($, query), await read($, favorites), await read($, recent))
    .filter(p => p.id !== now)
  const from = pool.length ? pool : PALETTES.filter(p => p.id !== now)
  await pick($, from[Math.floor(Math.random() * from.length)])
}

const mixHex = (a: string, b: string, k: number) =>
  '#' + [1, 3, 5].map(i => {
    const x = parseInt(a.slice(i, i + 2), 16), y = parseInt(b.slice(i, i + 2), 16)
    return Math.round(x + (y - x) * k).toString(16).padStart(2, '0')
  }).join('')

// a small Claude window in the palette: sidebar, messages, a code line, the composer, and the status swatches
export const preview = (p: Palette, on: boolean) => {
  const side = mixHex(p.bg, p.text, .05), bubble = mixHex(p.bg, p.text, .1), muted = mixHex(p.text, p.bg, .55)
  const code = mixHex(p.bg, p.text, .07)
  const dots = [p.success, p.warning, p.error].filter((c): c is string => !!c)
    .map((c, i) => `<circle cx="${100 + i * 7}" cy="9" r="2.4" fill="${c}"/>`).join('')
  const ring = on ? `<rect x="1.5" y="1.5" width="117" height="73" rx="9" fill="none" stroke="${p.accent}" stroke-width="3"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="76" viewBox="0 0 120 76">
<clipPath id="w"><rect width="120" height="76" rx="9"/></clipPath><g clip-path="url(#w)">
<rect width="120" height="76" fill="${p.bg}"/>
<rect width="28" height="76" fill="${side}"/>
<circle cx="9" cy="9" r="3.5" fill="${p.accent}"/>
<rect x="5" y="18" width="18" height="3" rx="1.5" fill="${muted}"/>
<rect x="5" y="25" width="14" height="3" rx="1.5" fill="${muted}"/>
<rect x="5" y="32" width="16" height="3" rx="1.5" fill="${muted}"/>
${dots}
<rect x="72" y="15" width="42" height="10" rx="4" fill="${bubble}"/>
<rect x="35" y="31" width="58" height="3.5" rx="1.75" fill="${p.text}"/>
<rect x="35" y="38" width="44" height="3" rx="1.5" fill="${muted}"/>
<rect x="35" y="45" width="76" height="9" rx="2.5" fill="${code}"/>
<rect x="39" y="48" width="14" height="3" rx="1.5" fill="${p.accent}"/>
<rect x="56" y="48" width="22" height="3" rx="1.5" fill="${p.success ?? muted}"/>
<rect x="33" y="61" width="82" height="11" rx="5.5" fill="${bubble}"/>
<circle cx="109" cy="66.5" r="3.6" fill="${p.accent}"/>
</g>${ring}</svg>`
}

// the worn palette, large: its colors as a ribbon under the window
export const hero = (p: Palette) => {
  const chips = [p.bg, p.text, p.accent, p.success, p.warning, p.error].filter((c): c is string => !!c)
  const w = 240 / chips.length
  return preview(p, false)
    .replace('width="120" height="76" viewBox="0 0 120 76"', 'width="240" height="172" viewBox="0 0 120 86"')
    .replace('</svg>', `${chips.map((c, i) => `<rect x="${(i * w) / 2}" y="79" width="${w / 2}" height="7" fill="${c}"/>`).join('')}</svg>`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'palettes', description: 'Open Palette Studio: pick a color palette for Claude Desktop' })
    try {
      const [favs, recents, isDaily, tile] = await Promise.all(['favorites', 'recent', 'daily', 'size'].map(k => $.store.get(k)))
      await update($, favorites, () => strings(favs))
      await update($, recent, () => strings(recents))
      await update($, daily, () => isDaily === true)
      await update($, size, () => (tile === 'comfy' ? 'comfy' : 'compact'))
      const dir = await slot($)
      const saved = dir ? JSON.parse(String(await $.fs.read(join(dir, DATA)))) : {}
      await update($, current, () => (typeof saved.id === 'string' ? saved.id : 'claude'))
      // palette of the day: once a day, when the extension is in place
      if (dir && isDaily === true && (await $.store.get('dailyOn')) !== today()) {
        await $.store.set('dailyOn', today())
        await pick($, dailyPick(today(), strings(favs)), true)
      }
    } catch {}
    return next(e)
  })

  on('command.run', { command: 'palettes' }, async $ => {
    await check($).catch(() => {})
    await refresh($).catch(() => {})
    const open = await update($, isStripOpen, o => !o)
    if (open) {
      await update($, confirmRemove, () => false)
      await update($, showSettings, () => false)
    }
    return { text: open ? 'Palette Studio opened above the prompt.' : 'Palette Studio closed.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isStripOpen))) return next(e)
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Svg = 'Svg' in els ? els.Svg : undefined
    const Select = 'Select' in els ? els.Select : undefined
    const Input = 'Input' in els ? els.Input : undefined
    const [now, stage, v, m, q, tile, favs, recents, isDaily, settings, asking] = await Promise.all([
      read($, current), read($, setup), read($, view), read($, mood), read($, query), read($, size),
      read($, favorites), read($, recent), read($, daily), read($, showSettings), read($, confirmRemove),
    ])
    const os = (await hostOf($))?.os ?? 'windows'
    const worn = PALETTES.find(p => p.id === now)
    const shown = filtered(v, m, q, favs, recents)
    const width = tile === 'comfy' ? 150 : 104
    const star = (id: string) => (favs.includes(id) ? '★' : '☆')

    const tileOf = (p: Palette) => (
      <Box key={`tile-${p.id}`} flexDirection="column" alignItems="center" gap="xs">
        {Svg ? <Svg source={preview(p, p.id === now)} alt={`Preview of ${p.name}`} width={width} /> : null}
        <Box flexDirection="row" alignItems="center" gap="xs">
          <Button key={`use-${p.id}`} label={p.id === now ? `✓ ${p.name}` : p.name} dimColor={p.id !== now}
            variant={p.id === now ? 'primary' : undefined} hover={{ dimColor: false }} onPress={() => pick($, p)} />
          <Button key={`fav-${p.id}`} label={star(p.id)} plain dimColor={!favs.includes(p.id)}
            onPress={() => toggleFavorite($, p.id)} />
        </Box>
      </Box>
    )

    const heroCard = (
      <Box key="hero" flexDirection="row" gap={1} alignItems="center" padding={1} borderStyle="round">
        {Svg && worn ? <Svg source={hero(worn)} alt={`${worn.name}, worn now`} width={180} /> : null}
        <Box flexDirection="column" gap="xs" flexShrink={1}>
          <Text dimColor>Wearing now</Text>
          <Text weight="semibold">{worn ? worn.name : 'Claude (default colors)'}</Text>
          {worn ? <Text dimColor>{`${MOODS[worn.mood]} · ${worn.base === 'dark' ? 'Dark' : 'Light'}`}</Text> : null}
          <Box flexDirection="row" gap="xs" flexWrap="wrap">
            <Button key="surprise" label="🎲 Surprise me" variant="primary" onPress={() => surprise($)} />
            {worn ? <Button key="hero-fav" label={favs.includes(worn.id) ? '★ Favorited' : '☆ Favorite'}
              onPress={() => toggleFavorite($, worn.id)} /> : null}
            <Button key="default" label="Claude default" dimColor={now !== 'claude'} onPress={() => pick($, undefined)} />
          </Box>
        </Box>
      </Box>
    )

    const filters = (
      <Box key="filters" flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
        <Box flexDirection="row" gap="xs" flexWrap="wrap">
          {(Object.keys(VIEWS) as View[]).map(k => (
            <Button key={`view-${k}`} label={k === 'favorites' ? `${VIEWS[k]} (${favs.length})` : VIEWS[k]}
              variant={k === v ? 'primary' : undefined} dimColor={k !== v} onPress={() => update($, view, () => k)} />
          ))}
        </Box>
        {Select ? (
          <Select key="mood" label="Mood" value={m}
            options={[{ value: 'any', label: '✨ Any mood' }, ...(Object.keys(MOODS) as Mood[]).map(k => ({ value: k, label: MOODS[k] }))]}
            onSelect={x => update($, mood, () => (x in MOODS ? (x as Mood) : 'any'))} />
        ) : null}
        {Input ? (
          <Input key="search" placeholder="Search palettes…" value={q}
            onInput={x => update($, query, () => x)} onSubmit={x => update($, query, () => x)} />
        ) : null}
      </Box>
    )

    const settingsRow = settings ? (
      <Box key="settings" flexDirection="column" gap="xs" padding={1} borderStyle="round">
        <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
          <Button key="daily" label={isDaily ? '☑ Palette of the day' : '☐ Palette of the day'}
            onPress={async () => {
              const turnOn = !isDaily
              await update($, daily, () => turnOn)
              await $.store.set('daily', turnOn)
              $.ui.toast(turnOn ? 'A new palette each day, from your favorites when you have some.' : 'Palette of the day is off.')
            }} />
          {Select ? (
            <Select key="size" label="Tiles" value={tile}
              options={[{ value: 'compact', label: 'Compact' }, { value: 'comfy', label: 'Large' }]}
              onSelect={x => {
                const s: Size = x === 'comfy' ? 'comfy' : 'compact'
                void update($, size, () => s)
                void $.store.set('size', s)
              }} />
          ) : null}
          <Button key="clear-recent" label="Clear recent" dimColor onPress={() => saveList($, 'recent', [])} />
          {asking ? null : <Button key="remove" label="Remove extension" dimColor onPress={() => update($, confirmRemove, () => true)} />}
        </Box>
        {asking ? (
          <Box key="confirm" flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
            <Text color="warning">Remove the extension? Claude Desktop goes back to its own look after a restart.</Text>
            <Button key="remove-yes" label="Remove" onPress={() => remove($)} />
            <Button key="remove-no" label="Cancel" dimColor onPress={() => update($, confirmRemove, () => false)} />
          </Box>
        ) : null}
      </Box>
    ) : null

    const empty = v === 'favorites' && !favs.length ? 'No favorites yet: press ☆ on any palette to keep it here.'
      : v === 'recent' && !recents.length ? 'Nothing worn yet.'
      : 'No palette matches. Try another mood or search.'

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Box flexDirection="row" gap={1} alignItems="center" flexShrink={1}>
            <Text weight="semibold">🎨 Palette Studio</Text>
            <Text dimColor>{`${PALETTES.length} palettes`}</Text>
          </Box>
          <Box flexDirection="row" gap="xs">
            {stage === 'missing' ? null : (
              <Button key="settings-toggle" label={settings ? '⚙ Done' : '⚙ Settings'} dimColor={!settings}
                onPress={() => update($, showSettings, s => !s)} />
            )}
            <Button key="close" role="dismiss" label="Close" onPress={() => update($, isStripOpen, () => false)} />
          </Box>
        </Box>
        {stage === 'missing' ? (
          <Box key="notice" flexDirection="column" gap="xs" padding={1} borderStyle="round" borderColor="warning">
            <Text color="warning" weight="semibold">One step first: install the extension</Text>
            <Text>It paints the palettes on Claude Desktop. After it is installed, restart Claude Desktop.</Text>
            <Box flexDirection="row">
              <Button key="install" label="Install extension" variant="primary" onPress={() => install($)} />
            </Box>
          </Box>
        ) : stage === 'restart' ? (
          <Box key="notice" flexDirection="column" gap="xs" padding={1} borderStyle="round" borderColor="success">
            <Text color="success" weight="semibold">Installed. Now restart Claude Desktop</Text>
            <Text>{`Quit Claude Desktop fully (${QUIT[os]}), open it again, then type /palettes.`}</Text>
            <Text dimColor>{`Still nothing after a restart? ${BY_HAND[os]}, then restart again.`}</Text>
          </Box>
        ) : null}
        {settingsRow}
        {stage === 'ready' ? heroCard : null}
        {stage === 'ready' ? filters : null}
        {stage === 'ready' ? (
          shown.length ? (
            <Box key="tiles" flexDirection="row" flexWrap="wrap" gap={1}>{shown.map(tileOf)}</Box>
          ) : <Text key="empty" dimColor>{empty}</Text>
        ) : null}
      </Box>
    )
  })
}
