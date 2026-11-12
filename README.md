# Desktop Palettes

**48 hand-tuned color palettes for the Claude Desktop app's Code tab** — Dracula, Nord, Gruvbox, Tokyo Night,
Catppuccin, Solarized, Rosé Pine, Synthwave '84, Amber CRT and many more — picked live from a strip above the prompt
with `/palettes`. A standalone mod: no other theme plugin is needed.

The palettes come from the [ccthemes](https://github.com/livlign/ccthemes) gallery, which themes the Claude Code
*terminal*. Terminal themes cannot touch the window's background or main text (your terminal owns those), so this mod
gives each palette a full background, keeps the original accent and text colors, and paints the whole desktop app.

| Dark (38) | Light (10) |
|---|---|
| Acid Lime · Amber CRT Retro · Ayu Dark · Bong · Campbell · Catppuccin Mocha · Citrus Ink · Cyberpunk Neon · Dracula Vivid · Driftwood · Eclipse · Everforest Dark · Forge Ember · GitHub Dark · Graphite · Green Phosphor CRT · Gruvbox Dark · Halcyon · High Contrast · Horizon Dark · Kanagawa Wave · Miami Heat · Monokai Pro Spectrum · Nebula Drift · Night Owl Deep · Nord · One Dark Atom · Opaline · Oxblood · Oxocarbon Dark · Patina · Prism · Rosé Pine Main · Solarized Dark · Synthwave '84 Neon · Tokyo Night · Velvet Court · Verdigris | Aubade · Catppuccin Latte · Daybreak · Frostbyte · GitHub Light · Letterpress · Matcha Zen · Porcelain · Rosé Pine Dawn · Solarized Light |

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
2. The first time, the strip shows an **Install extension** button. Press it. It copies a small content script into
   Claude Desktop's React DevTools extension slot and, if it is not set yet, sets `REACT_PROFILE=1` for your user
   account so Claude Desktop loads that slot:
   - Windows: `%APPDATA%\Claude\extensions\…` or `%LOCALAPPDATA%\Claude-Data\<id>\extensions\…`, and `setx REACT_PROFILE 1`.
   - macOS: `~/Library/Application Support/Claude/extensions/…`, `launchctl setenv`, plus a LaunchAgent that sets it again at login.
3. Quit Claude Desktop fully (Windows: also from the tray; macOS: Cmd+Q) and open it again.
4. Type `/palettes` again and pick a palette from the **Dark** or **Light** tab. It applies within a second, no restart.
   **Claude default** goes back to the app's own colors.

## How the colors are built

Each palette has three core colors: background, text, and accent (the ccthemes `claude` token). The extension derives
every surface, secondary and muted text (kept at 4.5:1 contrast or better), hover and tint from those three, and
switches the app between its light and dark parts to match. Success, error and warning colors are carried over too.

Backgrounds: well-known schemes use their canonical editor background (Dracula `#282a36`, Nord `#2e3440`, …); the
original ccthemes palettes get one derived from their own message background, pushed until the body text reaches
7:1 contrast. `tools/convert.py` rebuilds `hooks/palettes.ts` from the ccthemes theme files.

## Removing it

`/palettes` → **Remove extension** takes out only this mod's files. If nothing else uses the slot, it also clears
`REACT_PROFILE`. Restart Claude Desktop, then uninstall the plugin.

## Notes

- **Unofficial.** This is a community mod, not made or endorsed by Anthropic. It styles Claude Desktop's own design
  tokens, which a future app update may rename.
- Windows and macOS only.
- Can share the extension slot with [themes-for-claude](https://github.com/0toshigami/claude-desktop-themes); use one
  of them at a time (set the other to its default), or the last one painted wins.

## Credits

- Palettes: [ccthemes](https://github.com/livlign/ccthemes) by the ccthemes contributors (MIT).
- The extension-slot approach and color derivation follow
  [claude-desktop-themes](https://github.com/0toshigami/claude-desktop-themes) by 0toshigami (MIT).

## License

MIT, see [LICENSE](LICENSE).
