import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Palette } from '../types'
import { PALETTES } from './palettes'

// Claude Desktop loads the extension in its React DevTools slot when REACT_PROFILE=1. The slot lives under its
// userData: %APPDATA%\Claude or %LOCALAPPDATA%\Claude-Data\<id> on Windows, ~/Library/Application Support/Claude on
// macOS. Other mods (themes-for-claude among them) may share the slot, so only our own entries go in and come out.
const SLOT = ['extensions', 'fmkadmapgofadopljbjfkapdkoienihi']
const SCRIPT = 'palettes.js'
const DATA = 'palettes.json'
const AGENT = 'com.github.desktop-palettes'
const QUIT = { windows: 'also from the tray', macos: 'Cmd+Q' } as const
const BY_HAND = {
  windows: 'Set the user environment variable REACT_PROFILE=1 by hand',
  macos: 'Run launchctl setenv REACT_PROFILE 1 in Terminal',
} as const

const current = atom({ plugin: 'desktop-palettes', key: 'current' } as const, 'claude')
type Setup = 'missing' | 'restart' | 'ready'
const setup = atom({ plugin: 'desktop-palettes', key: 'setup' } as const, 'missing' as Setup)
const isStripOpen = atom({ plugin: 'desktop-palettes', key: 'isStripOpen' } as const, false)
type Tab = 'dark' | 'light'
const tab = atom({ plugin: 'desktop-palettes', key: 'tab' } as const, 'dark' as Tab)
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
  version: '0.1.0',
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
  $.ui.toast('Desktop Palettes is updated. Restart Claude Desktop to load the new version.')
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

const pick = async ($: EngineInterface, p: Palette | undefined) => {
  const dir = await slot($)
  if (!dir) return
  await $.fs.write(join(dir, DATA), fileOf(p))
  await update($, current, () => p?.id ?? 'claude')
  $.ui.toast(p ? `Palette: ${p.name}` : 'Back to Claude\'s own colors')
}

const mixHex = (a: string, b: string, k: number) =>
  '#' + [1, 3, 5].map(i => {
    const x = parseInt(a.slice(i, i + 2), 16), y = parseInt(b.slice(i, i + 2), 16)
    return Math.round(x + (y - x) * k).toString(16).padStart(2, '0')
  }).join('')

// a small picture of Claude Desktop in the palette: sidebar, a message, the composer, and the status swatches
export const preview = (p: Palette, on: boolean) => {
  const side = mixHex(p.bg, p.text, .05), bubble = mixHex(p.bg, p.text, .1), muted = mixHex(p.text, p.bg, .55)
  const swatches = [p.accent, p.success, p.warning, p.error].filter((c): c is string => !!c)
    .map((c, i) => `<rect x="${44 + i * 13}" y="44" width="9" height="9" rx="2" fill="${c}"/>`).join('')
  const ring = on ? `<rect x="1.5" y="1.5" width="117" height="67" rx="8" fill="none" stroke="${p.accent}" stroke-width="3"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="70" viewBox="0 0 120 70">
<clipPath id="w"><rect width="120" height="70" rx="8"/></clipPath><g clip-path="url(#w)">
<rect width="120" height="70" fill="${p.bg}"/>
<rect width="30" height="70" fill="${side}"/>
<rect x="5" y="8" width="20" height="4" rx="2" fill="${p.accent}"/>
<rect x="5" y="17" width="16" height="3" rx="1.5" fill="${muted}"/>
<rect x="5" y="24" width="18" height="3" rx="1.5" fill="${muted}"/>
<rect x="74" y="7" width="40" height="11" rx="4" fill="${bubble}"/>
<rect x="38" y="24" width="60" height="4" rx="2" fill="${p.text}"/>
<rect x="38" y="32" width="46" height="3" rx="1.5" fill="${muted}"/>
${swatches}
<rect x="36" y="56" width="80" height="10" rx="5" fill="${bubble}"/>
<circle cx="110" cy="61" r="3.5" fill="${p.accent}"/>
</g>${ring}</svg>`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'palettes', description: 'Pick a ccthemes color palette for Claude Desktop' })
    try {
      const dir = await slot($)
      const saved = dir ? JSON.parse(String(await $.fs.read(join(dir, DATA)))) : {}
      await update($, current, () => (typeof saved.id === 'string' ? saved.id : 'claude'))
    } catch {}
    return next(e)
  })

  on('command.run', { command: 'palettes' }, async $ => {
    await check($).catch(() => {})
    await refresh($).catch(() => {})
    const open = await update($, isStripOpen, o => !o)
    if (open) {
      const id = await read($, current)
      const worn = PALETTES.find(p => p.id === id)
      await update($, tab, t => (worn ? worn.base : t))
      await update($, confirmRemove, () => false)
    }
    return { text: open ? 'Palette strip opened above the prompt.' : 'Palette strip closed.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isStripOpen))) return next(e)
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Svg = 'Svg' in els ? els.Svg : undefined
    const now = await read($, current)
    const stage = await read($, setup)
    const showing = await read($, tab)
    const asking = await read($, confirmRemove)
    const os = (await hostOf($))?.os ?? 'windows'
    const worn = PALETTES.find(p => p.id === now)
    const shown = PALETTES.filter(p => p.base === showing)
    const count = (b: Tab) => PALETTES.filter(p => p.base === b).length
    const removeButton = <Button key="remove" label="Remove extension" dimColor onPress={() => update($, confirmRemove, () => true)} />
    const tileOf = (p: Palette) => (
      <Box key={`tile-${p.id}`} flexDirection="column" alignItems="center" gap="xs">
        {Svg ? <Svg source={preview(p, p.id === now)} alt={`Preview of ${p.name}`} width={96} /> : null}
        <Button key={`use-${p.id}`} label={p.id === now ? `✓ ${p.name}` : p.name} dimColor={p.id !== now}
          variant={p.id === now ? 'primary' : undefined} hover={{ dimColor: false }} onPress={() => pick($, p)} />
      </Box>
    )
    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Box flexDirection="row" flexShrink={1} gap={1} alignItems="center">
            <Text weight="semibold">Palettes</Text>
            <Text dimColor>Wearing</Text>
            <Text weight="semibold">{worn ? worn.name : 'Claude (default)'}</Text>
          </Box>
          <Button key="close" role="dismiss" label="Close" onPress={() => update($, isStripOpen, () => false)} />
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
            <Box flexDirection="row" justifyContent="flex-end">{asking ? null : removeButton}</Box>
          </Box>
        ) : (
          <Box key="tabs" flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
            <Box flexDirection="row" gap="xs">
              {(['dark', 'light'] as Tab[]).map(k => (
                <Button key={`tab-${k}`} label={`${k === 'dark' ? 'Dark' : 'Light'} (${count(k)})`}
                  variant={k === showing ? 'primary' : undefined} dimColor={k !== showing} onPress={() => update($, tab, () => k)} />
              ))}
              <Button key="default" label={now === 'claude' ? '✓ Claude default' : 'Claude default'} dimColor={now !== 'claude'}
                onPress={() => pick($, undefined)} />
            </Box>
            {asking ? null : removeButton}
          </Box>
        )}
        {asking ? (
          <Box key="confirm" flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
            <Text color="warning">Remove the extension? Claude Desktop goes back to its own look after a restart.</Text>
            <Button key="remove-yes" label="Remove" onPress={() => remove($)} />
            <Button key="remove-no" label="Cancel" dimColor onPress={() => update($, confirmRemove, () => false)} />
          </Box>
        ) : null}
        {stage === 'ready' ? (
          <Box key="tiles" flexDirection="row" flexWrap="wrap" gap={1}>
            {shown.map(tileOf)}
          </Box>
        ) : null}
      </Box>
    )
  })
}
