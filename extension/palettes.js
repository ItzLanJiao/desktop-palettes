// Desktop Palettes: content script in Claude Desktop's React DevTools slot (loaded when REACT_PROFILE=1).
// Reads palettes.json, which the mod writes when a palette is picked: { id, bg, text, accent, success?, error?, warning? }
// or {} for Claude's own look, and repaints Claude Desktop's design tokens from it.
(() => {
  const read = name => fetch(chrome.runtime.getURL(name), { cache: 'no-store' }).then(r => r.text());
  const root = document.documentElement;

  const ok = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  const hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const hsl = ([r, g, b]) => {
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b), l = (hi + lo) / 2, d = hi - lo;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    const h = !d ? 0 : hi === r ? ((g - b) / d + 6) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return `${Math.round(h * 60)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`;
  };
  const luma = ([r, g, b]) => .2126 * r + .7152 * g + .0722 * b;
  const wl = c => luma(c.map(v => (v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)));
  const wcag = (a, b) => { const x = wl(a), y = wl(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  // the text colour eased toward the background by up to k, kept at 4.5:1 or more against it
  const readable = (tx, bg, k) => { for (let f = k; f > 0; f -= .05) if (wcag(mix(tx, bg, f), bg) >= 4.5) return hex(mix(tx, bg, f)); return hex(tx); };
  const rgba = (c, a) => `rgba(${c.map(v => Math.round(v * 255)).join(', ')}, ${a})`;

  const varsOf = t => {
    const bg = rgb(t.bg), tx = rgb(t.text), ac = rgb(t.accent);
    const at = (a, b, k) => hex(mix(a, b, k));
    const second = readable(tx, bg, .35), muted = readable(tx, bg, .55), hover = at(ac, tx, .15), tint = at(bg, ac, .15);
    const on = luma(ac) > .55 ? '#000000' : '#ffffff';
    const cds = {
      'page-bg': t.bg, 'surface-0': t.bg, 'surface-1': at(bg, tx, .03), 'surface-2': at(bg, tx, .06), 'surface-3': at(bg, tx, .09),
      'neutral-900': t.text, 'neutral-600': second, 'neutral-400': muted,
      'text-primary': t.text, 'undimmed-text-primary': t.text,
      'text-secondary': second, 'undimmed-text-secondary': second, 'text-stays-secondary': second, 'undimmed-text-stays-secondary': second,
      'text-muted': muted, 'undimmed-text-muted': muted,
      'role-accent-450': t.accent, 'role-accent-fill': t.accent, 'fill-accent': t.accent, 'text-accent': t.accent,
      'clay': t.accent, 'clay-emphasized': t.accent, 'fill-brand': t.accent,
      'role-accent-400': hover, 'role-accent-fill-hover': hover, 'fill-accent-hover': hover, 'fill-brand-hover': hover,
      'role-accent-on': on, 'on-accent': on, 'on-brand': on,
      'bg-accent': tint, 'role-accent-100': tint, 'role-accent-800': tint,
    };
    const vars = Object.entries(cds).map(([k, v]) => [`cds-${k}`, v]);
    [.06, 0, .03, .05, .08, .1].forEach((k, i) => vars.push([`bg-${i}00`, hsl(mix(bg, tx, k))]));
    [0, 0, .25, .25, .5, .5].forEach((k, i) => vars.push([`text-${i}00`, hsl(mix(tx, bg, k))]));
    for (const k of ['accent-brand', 'brand-100', 'accent-000', 'accent-100', 'accent-200']) vars.push([k, hsl(ac)]);
    if (ok(t.success)) vars.push(['success-100', hsl(rgb(t.success))], ['success-000', hsl(rgb(t.success))]);
    if (ok(t.error)) vars.push(['danger-100', hsl(rgb(t.error))], ['danger-000', hsl(rgb(t.error))]);
    if (ok(t.warning)) vars.push(['warning-100', hsl(rgb(t.warning))]);
    // the sidebar card, its selected and hovered rows, and popovers have colours of their own in Claude Desktop
    const side = at(bg, tx, .05);
    vars.push(['desktop-palette-side', side], ['cds-fizzy-lake-color-sidebar', side], ['df-sidebar-bg', side],
      ['df-web-sidebar-bg', side], ['cds-surface-popover', at(bg, tx, .1)],
      ['cds-fill-ghost-selected', rgba(mix(tx, ac, .5), .16)], ['cds-fill-ghost-hover', rgba(tx, .07)],
      ['cds-alpha-1', rgba(tx, .07)], ['cds-alpha-2', rgba(tx, .14)]);
    [0, .05, .09, .13, .17, .21, .25].forEach((k, i) => vars.push([`df-z${i}`, hsl(mix(bg, tx, k))]));
    return vars;
  };

  const sheetOf = t => {
    const ac = rgb(t.accent);
    return `*{${varsOf(t).map(([k, v]) => `--${k}:${v} !important`).join(';')}}
.dframe-root:not([data-collapsed]) .dframe-sidebar { background-color: var(--desktop-palette-side) !important; }
.dframe-root[data-collapsed] .dframe-sidebar-body { --df-web-sidebar-bg: var(--desktop-palette-side) !important; }
.dframe-chrome-peek-band { background-color: var(--desktop-palette-side) !important; }
diffs-container { --diffs-light-bg: var(--cds-surface-2) !important; --diffs-dark-bg: var(--cds-surface-2) !important;
  --diffs-light: var(--cds-text-primary) !important; --diffs-dark: var(--cds-text-primary) !important; }
::selection { background: ${rgba(ac, .35)}; }
::-webkit-scrollbar-thumb { background: ${rgba(ac, .3)}; border-radius: 9px; }`;
  };

  // Claude Desktop picks light or dark parts by data-mode; follow the palette's own background
  let mode;
  const MODES = '[data-mode=light],[data-mode=dark],[data-mode=system]';
  const syncMode = () => {
    for (const el of document.querySelectorAll(MODES)) {
      if (mode && el.dataset.mode !== mode) {
        if (el.dataset.mode !== el.getAttribute('data-palette-set-mode')) el.setAttribute('data-palette-was-mode', el.dataset.mode);
        el.dataset.mode = mode;
        el.setAttribute('data-palette-set-mode', mode);
      } else if (!mode && el.hasAttribute('data-palette-was-mode')) {
        el.dataset.mode = el.getAttribute('data-palette-was-mode');
        el.removeAttribute('data-palette-was-mode');
        el.removeAttribute('data-palette-set-mode');
      }
    }
  };
  let queued = false;
  new MutationObserver(() => {
    if (queued || !mode) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; syncMode(); });
  }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-mode'] });

  const paint = t => {
    document.getElementById('desktop-palette')?.remove();
    const on = ok(t.bg) && ok(t.text) && ok(t.accent);
    mode = on ? (luma(rgb(t.bg)) > .5 ? 'light' : 'dark') : undefined;
    syncMode();
    if (!on) return void delete root.dataset.desktopPalette;
    if (typeof t.id === 'string' && /^[a-z0-9-]{1,40}$/.test(t.id)) root.dataset.desktopPalette = t.id;
    const style = document.createElement('style');
    style.id = 'desktop-palette';
    style.textContent = sheetOf(t);
    document.head.append(style); // (last: after Claude's own sheets)
  };

  let last, warned = false, painted = false;
  const tick = async () => {
    let text;
    try {
      text = await read('palettes.json');
    } catch (err) {
      if (!warned) console.warn('desktop-palettes: cannot read palettes.json', err);
      warned = true;
      return;
    }
    if (text === last) return;
    last = text;
    try {
      const t = JSON.parse(text);
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (painted && document.startViewTransition && !calm) document.startViewTransition(() => paint(t));
      else paint(t);
      painted = true;
    } catch (err) {
      console.warn('desktop-palettes: palettes.json is not JSON', err);
    }
  };
  tick();
  setInterval(tick, 1000);
})();
