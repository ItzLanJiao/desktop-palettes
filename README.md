# 🎨 Palette Studio for Claude Desktop

**78 color palettes for the Claude Desktop app's Code tab**, picked live from a studio strip above the prompt with
`/palettes`. Keep your favorites, browse by mood, search by name, let the dice choose, or wake up to a new palette
every day.

## What's inside

- **78 palettes**, 58 dark and 20 light, each with its own background, text, accent, and success / warning / error colors.
- **Wearing now**: a large preview of the current palette with its full color ribbon.
- **★ Favorites**: star any palette; your favorites get their own tab and last across sessions.
- **🕘 Recent**: the last 8 palettes you wore.
- **Moods**: 🔥 Warm · ❄️ Cool · ⚡ Neon · 🌿 Nature · 🌸 Pastel · 📼 Retro · ◐ Mono.
- **Search** by name or mood.
- **🎲 Surprise me**: a random palette from whatever you are browsing.
- **Palette of the day**: switch it on in ⚙ Settings, and each day starts with a new palette, picked from your
  favorites when you have some.
- **Compact or large tiles**, and **Claude default** to go back to the app's own colors at any time.

## The palettes

| Mood | Dark | Light |
|---|---|---|
| 🔥 Warm | Ayu Mirage · Bong · Flexoki Dark · Forge Ember · Gruvbox Dark · Horizon Dark · Melange · Monokai Pro Spectrum · Oxblood | Ayu Light · Daybreak · Flexoki Light · Gruvbox Light |
| ❄️ Cool | Ayu Dark · Bluloco Dark · Deep Sea · Eclipse · Halcyon · Iceberg · Material Ocean · Moonlight · Night Owl Deep · Nightfox · Nord · Palenight · Poimandres · Tokyo Night | Frostbyte · Porcelain · Snow Storm · Tokyo Night Day |
| ⚡ Neon | Acid Lime · Andromeda · Cobalt Two · Cyberpunk Neon · Dracula Vivid · Miami Heat · Nebula Drift · Prism · Sonokai · Synthwave '84 Neon | — |
| 🌿 Nature | Citrus Ink · Driftwood · Everforest Dark · Kanagawa Wave · Midnight Matcha · Patina · Verdigris | Everforest Light · Kanagawa Lotus · Matcha Zen |
| 🌸 Pastel | Catppuccin Mocha · Lavender Haze · Opaline · Rosé Pine Main · Velvet Court | Aubade · Catppuccin Latte · Dawnfox · Rosé Pine Dawn · Sakura Milk |
| 📼 Retro | Amber CRT Retro · Campbell · Green Phosphor CRT · Solarized Dark · Zenburn | Letterpress · Solarized Light |
| ◐ Mono | Carbonfox · GitHub Dark · Graphite · High Contrast · One Dark Atom · Oxocarbon Dark · Tomorrow Night · Vesper | GitHub Light · One Light |

## Install

At the prompt of a Claude Code session:

```
/plugin install desktop-palettes --marketplace ItzLanJiao/desktop-palettes
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```bash
claude plugin install desktop-palettes --marketplace ItzLanJiao/desktop-palettes
```

In Claude Desktop you can also open **Settings → Plugins → Add → Add marketplace**, enter
`https://github.com/ItzLanJiao/desktop-palettes.git`, and install **desktop-palettes** from it.

## First use

1. In a Claude Code session in Claude Desktop, type `/palettes`. (If it does not show, run `/reload-plugins`.)
2. The first time, the studio shows an **Install extension** button. Press it. It copies a small content script into
   Claude Desktop's React DevTools extension slot and, if it is not set yet, sets `REACT_PROFILE=1` for your user
   account so Claude Desktop loads that slot:
   - Windows: `%APPDATA%\Claude\extensions\…` or `%LOCALAPPDATA%\Claude-Data\<id>\extensions\…`, and `setx REACT_PROFILE 1`.
   - macOS: `~/Library/Application Support/Claude/extensions/…`, `launchctl setenv`, plus a LaunchAgent that sets it again at login.
   - Linux: `~/.config/Claude/extensions/…`, `systemctl --user set-environment`, plus `~/.config/environment.d/desktop-palettes.conf` that sets it again at login.
3. Quit Claude Desktop fully (Windows: also from the tray; macOS: Cmd+Q) and open it again.
4. Type `/palettes` again and pick a palette. It applies within a second, no restart.

## How the colors are built

Each palette has three core colors: background, text, and accent. The extension derives every surface, secondary
and muted text (kept at 4.5:1 contrast or better), hover state and tint from those three, and switches the app between
its light and dark parts to match. Body text is checked at 7:1 on most dark palettes and at least 4.5:1 everywhere;
accents at 3:1 or better.

## Removing it

`/palettes` → **⚙ Settings** → **Remove extension** takes out only this mod's files. If nothing else uses the slot, it
also clears `REACT_PROFILE`. Restart Claude Desktop, then uninstall the plugin.

## Notes

- **Unofficial.** This is a community mod, not made or endorsed by Anthropic. It styles Claude Desktop's own design
  tokens, which a future app update may rename.
- Windows, macOS and Linux (systemd desktops such as GNOME and KDE).
- If another mod also repaints Claude Desktop, use one at a time: the last one painted wins.

## License

MIT, see [LICENSE](LICENSE).
