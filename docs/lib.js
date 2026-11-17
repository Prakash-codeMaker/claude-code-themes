// Theme logic shared by the Studio (browser) and the CLI (Node). No dependencies.

export const BASES = ['dark', 'light', 'dark-daltonized', 'light-daltonized', 'dark-ansi', 'light-ansi']
export const isLight = (base) => String(base).startsWith('light')
// What the terminal behind Claude Code is assumed to look like. A theme cannot set it.
export const TERMINAL = { dark: '#1e1e1e', light: '#ffffff' }

const ANSI = { black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510', blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5', blackbright: '#666666', redbright: '#f14c4c', greenbright: '#23d18b', yellowbright: '#f5f543', bluebright: '#3b8eea', magentabright: '#d670d6', cyanbright: '#29b8db', whitebright: '#ffffff' }
const ANSI16 = Object.values(ANSI)
const COLOR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|ansi256\(\s*\d{1,3}\s*\)|ansi:[a-z]+)$/i
const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')

/** Any colour a theme file may hold -> "#rrggbb", or null. ANSI names are approximated. */
export function toHex(value) {
  const v = String(value ?? '').trim().toLowerCase()
  if (!COLOR.test(v)) return null
  if (v[0] === '#') return v.length === 7 ? v : '#' + [...v.slice(1)].map((c) => c + c).join('')
  if (v.startsWith('rgb')) { const n = v.match(/\d+/g).map(Number); return n.some((x) => x > 255) ? null : '#' + n.map(hex2).join('') }
  if (v.startsWith('ansi256')) {
    const n = +v.match(/\d+/)[0]
    if (n > 255) return null
    if (n < 16) return ANSI16[n]
    if (n > 231) return '#' + hex2(8 + (n - 232) * 10).repeat(3)
    const step = (i) => (i ? 55 + i * 40 : 0)
    return '#' + [Math.floor((n - 16) / 36), Math.floor((n - 16) / 6) % 6, (n - 16) % 6].map((i) => hex2(step(i))).join('')
  }
  return ANSI[v.slice(5)] ?? null
}
export const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

// OKLCH, so that equal lightness looks equally light across hues.
const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const gam = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
export function toOklch(hex) {
  const [r, g, b] = rgb(hex).map(lin)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360]
}
function oklchRgb(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
}
/** OKLCH -> "#rrggbb", lowering chroma until the colour fits sRGB. */
export function oklch(L, C, H) {
  L = Math.max(0, Math.min(1, L))
  for (let c = C; ; c -= 0.005) {
    const out = oklchRgb(L, Math.max(0, c), H)
    if (c <= 0 || out.every((x) => x >= -0.0005 && x <= 1.0005)) return '#' + out.map((x) => hex2(gam(Math.max(0, Math.min(1, x))))).join('')
  }
}

const luminance = (hex) => { const [r, g, b] = rgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
/** WCAG contrast ratio between two hex colours, 1 to 21. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export const slug = (name) => String(name ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'my-theme'

/** Keeps only what a theme file may contain: a name, a base and well-formed colours. Returns null if it is not a theme. */
export function sanitize(input) {
  if (!input || typeof input !== 'object' || !input.overrides || typeof input.overrides !== 'object' || Array.isArray(input.overrides)) return null
  const overrides = {}
  for (const [k, v] of Object.entries(input.overrides)) if (/^\w{1,48}$/.test(k) && typeof v === 'string' && COLOR.test(v.trim())) overrides[k] = v.trim()
  const name = (typeof input.name === 'string' ? input.name : '').replace(/[^\p{L}\p{N} .,+&'()_\-–·:/]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 64)
  return { name: name || 'My Theme', base: BASES.includes(input.base) ? input.base : 'dark', overrides }
}
export const stringify = (theme) => JSON.stringify({ name: theme.name, base: theme.base, overrides: theme.overrides }, null, 2) + '\n'

/** Every token as a hex colour: the theme's override, or what its base gives. `tokens` is tokens.json. */
export function resolve(theme, tokens) {
  const side = isLight(theme.base) ? 'light' : 'dark'
  const out = { terminal: TERMINAL[side] }
  for (const t of tokens) out[t.token] = toHex(theme.overrides[t.token]) ?? t[side]
  return out
}

// A whole theme from one colour. Hues are placed relative to the seed; status colours keep their meaning.
const SEMANTIC = { red: 25, orange: 55, yellow: 95, green: 148, cyan: 200, blue: 255, indigo: 280, purple: 305, violet: 315, pink: 350 }
export function generate(seedHex, { light = false, name } = {}) {
  const [, seedC, h] = toOklch(seedHex)
  const vivid = Math.max(0.09, Math.min(0.19, seedC * 1.1))
  const tint = Math.min(0.03, seedC * 0.25)
  // L for: accents, text, quiet text, faint, surfaces, diff line, diff word, diff dim
  const L = light
    ? { accent: 0.52, text: 0.22, quiet: 0.5, faint: 0.76, surface: 0.94, hover: 0.9, line: 0.9, word: 0.76, dim: 0.95, select: 0.82, shimmer: 0.1, inverse: 0.98 }
    : { accent: 0.76, text: 0.95, quiet: 0.7, faint: 0.46, surface: 0.3, hover: 0.36, line: 0.36, word: 0.52, dim: 0.28, select: 0.42, shimmer: 0.08, inverse: 0.16 }
  const accent = (hue, c = vivid) => oklch(L.accent, c, hue)
  const shimmer = (hue, c = vivid) => oklch(L.accent + L.shimmer, c * 0.85, hue)
  const o = {
    claude: accent(h), claudeShimmer: shimmer(h),
    text: oklch(L.text, tint * 0.5, h), inverseText: oklch(L.inverse, tint * 0.5, h),
    inactive: oklch(L.quiet, tint, h), inactiveShimmer: oklch(L.quiet + L.shimmer, tint, h), subtle: oklch(L.faint, tint, h),
    suggestion: accent(h + 150), permission: accent(h + 150), permissionShimmer: shimmer(h + 150), remember: accent(h + 60),
    success: accent(SEMANTIC.green, 0.16), error: accent(SEMANTIC.red, 0.17), warning: accent(SEMANTIC.yellow, 0.15), warningShimmer: shimmer(SEMANTIC.yellow, 0.15), merged: accent(SEMANTIC.purple, 0.15),
    promptBorder: oklch(light ? 0.62 : 0.58, tint * 1.6, h), promptBorderShimmer: oklch(light ? 0.72 : 0.68, tint * 1.6, h),
    planMode: accent(h - 90), autoAccept: accent(h + 105), bashBorder: accent(h + 180), ide: accent(h - 60), fastMode: accent(h + 30), fastModeShimmer: shimmer(h + 30), effortUltra: accent(h - 45),
    diffAdded: oklch(L.line, 0.07, SEMANTIC.green), diffRemoved: oklch(L.line, 0.08, SEMANTIC.red),
    diffAddedWord: oklch(L.word, 0.13, SEMANTIC.green), diffRemovedWord: oklch(L.word, 0.14, SEMANTIC.red),
    diffAddedDimmed: oklch(L.dim, 0.04, SEMANTIC.green), diffRemovedDimmed: oklch(L.dim, 0.04, SEMANTIC.red),
    userMessageBackground: oklch(L.surface, tint, h), userMessageBackgroundHover: oklch(L.hover, tint, h),
    bashMessageBackgroundColor: oklch(L.surface, 0.035, h + 180), memoryBackgroundColor: oklch(L.surface, 0.035, h + 60), selectionBg: oklch(L.select, 0.09, h),
    briefLabelYou: accent(h + 150), briefLabelClaude: accent(h), rate_limit_fill: accent(h), rate_limit_empty: oklch(L.faint, tint, h),
  }
  for (const c of ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink']) o[c + '_FOR_SUBAGENTS_ONLY'] = accent(SEMANTIC[c], 0.15)
  for (const c of ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet']) { o['rainbow_' + c] = accent(SEMANTIC[c], 0.17); o[`rainbow_${c}_shimmer`] = shimmer(SEMANTIC[c], 0.17) }
  return { name: name || 'My Theme', base: light ? 'light' : 'dark', overrides: o }
}

// Pairs a reader must be able to tell apart: [foreground, background, minimum ratio].
const PAIRS = [
  ['text', 'terminal', 4.5], ['text', 'userMessageBackground', 4.5], ['text', 'userMessageBackgroundHover', 4.5], ['text', 'bashMessageBackgroundColor', 4.5], ['text', 'memoryBackgroundColor', 4.5],
  ['text', 'diffAdded', 4.5], ['text', 'diffRemoved', 4.5], ['text', 'diffAddedWord', 3], ['text', 'diffRemovedWord', 3], ['text', 'selectionBg', 3],
  ['inactive', 'terminal', 3], ['claude', 'terminal', 3], ['success', 'terminal', 3], ['error', 'terminal', 3], ['warning', 'terminal', 3], ['permission', 'terminal', 3],
  ['planMode', 'terminal', 3], ['autoAccept', 'terminal', 3], ['suggestion', 'terminal', 3], ['briefLabelYou', 'userMessageBackground', 3], ['inverseText', 'claude', 3],
]
/** Pairs that are too close to read, worst first. `colors` comes from resolve(); `terminal` overrides the assumed background. */
export function check(colors, terminal) {
  const c = { ...colors, ...(terminal && { terminal }) }
  return PAIRS.map(([fg, bg, min]) => ({ fg, bg, min, ratio: contrast(c[fg], c[bg]) })).filter((p) => p.ratio < p.min).sort((a, b) => a.ratio / a.min - b.ratio / b.min)
}
/** Moves `fg` lighter or darker, keeping its hue, until it reaches `min` against `bg`. */
export function fix(fg, bg, min) {
  const [L0, C, H] = toOklch(fg)
  const up = luminance(bg) < 0.4
  for (let L = L0; L >= 0 && L <= 1; L += up ? 0.01 : -0.01) { const hex = oklch(L, C, H); if (contrast(hex, bg) >= min) return hex }
  return up ? '#ffffff' : '#000000'
}

// A theme packed into a string that survives a URL or a shell argument.
const b64 = { enc: (s) => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')), dec: (s) => (typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary')) }
export function pack(theme) {
  const bytes = new TextEncoder().encode(JSON.stringify([theme.name, theme.base, theme.overrides]))
  return b64.enc(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function unpack(code) {
  try {
    const bin = b64.dec(String(code).replace(/-/g, '+').replace(/_/g, '/'))
    const [name, base, overrides] = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
    return sanitize({ name, base, overrides })
  } catch { return null }
}
