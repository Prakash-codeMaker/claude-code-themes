// Rebuilds the collection from sources.json.
//   GITHUB_TOKEN=$(gh auth token) node scripts/sync.mjs
// Writes themes/, licenses/, docs/themes.json, docs/gallery.svg and the README stats block.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const ME = 'anhnt256/claude-code-themes'
const root = new URL('..', import.meta.url)
const at = (p) => new URL(p, root)
const token = process.env.GITHUB_TOKEN
const headers = { 'user-agent': 'claude-code-themes-sync', ...(token && { authorization: `Bearer ${token}` }) }

// Licences that allow copying a theme file into this repo. Anything else is linked, never copied.
const OPEN = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'Unlicense', 'CC0-1.0'])
const BASES = ['dark', 'light', 'dark-daltonized', 'light-daltonized', 'dark-ansi', 'light-ansi']
const SKIP = /(^|\/)(node_modules|__tests__|tests?|golden|fixtures|examples?|schemas?|\.github|\.claude)\//i
const TOKEN = /^(claude|text|inverseText|inactive|subtle|success|error|warning|merged|remember|promptBorder|bashBorder|permission|planMode|autoAccept|fastMode|suggestion|diff(Added|Removed)(Dimmed|Word)?|userMessageBackground|bashMessageBackgroundColor|background|\w+_FOR_SUBAGENTS_ONLY|rainbow_\w+)$/
const COLOR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|ansi256\(\s*\d{1,3}\s*\)|ansi:[a-zA-Z]+)$/i

// What a theme inherits when it leaves a token out, for the tokens the preview draws.
const DEFAULTS = {
  dark: { bg: '#17171a', claude: '#d77757', text: '#ffffff', inactive: '#999999', subtle: '#505050', success: '#4eba65', error: '#ff6b80', warning: '#ffc107', promptBorder: '#888888', permission: '#b1b9f9', planMode: '#48968c', autoAccept: '#af87ff', bashBorder: '#fd5db1', diffAdded: '#225c2b', diffRemoved: '#7a2936', userMessageBackground: '#373737' },
  light: { bg: '#fbfbfa', claude: '#d77757', text: '#000000', inactive: '#666666', subtle: '#afafaf', success: '#2c7a39', error: '#ab2b3f', warning: '#966c1e', promptBorder: '#999999', permission: '#5769f7', planMode: '#006666', autoAccept: '#8700ff', bashBorder: '#ff0087', diffAdded: '#69db7c', diffRemoved: '#ffa8b4', userMessageBackground: '#f0f0f0' },
}
const ANSI = { black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510', blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5', blackbright: '#666666', redbright: '#f14c4c', greenbright: '#23d18b', yellowbright: '#f5f543', bluebright: '#3b8eea', magentabright: '#d670d6', cyanbright: '#29b8db', whitebright: '#ffffff' }
const ANSI16 = Object.values(ANSI)

const hex2 = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
function toHex(v) {
  v = v.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + [...v.slice(1)].map((c) => c + c).join('')
  let m = v.match(/^rgb\((.+)\)$/)
  if (m) return '#' + m[1].split(',').map((n) => hex2(+n)).join('')
  m = v.match(/^ansi256\((.+)\)$/)
  if (m) {
    const n = +m[1]
    if (n < 16) return ANSI16[n]
    if (n > 231) return '#' + hex2(8 + (n - 232) * 10).repeat(3)
    const step = (i) => (i ? 55 + i * 40 : 0)
    return '#' + [Math.floor((n - 16) / 36), Math.floor((n - 16) / 6) % 6, (n - 16) % 6].map((i) => hex2(step(i))).join('')
  }
  return ANSI[v.slice(5)] ?? null
}

async function gh(path) {
  const res = await fetch('https://api.github.com/' + path, { headers })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json()
}
async function pool(items, size, fn) {
  const out = []
  let i = 0
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const n = i++; out[n] = await fn(items[n]) } }))
  return out
}

// A theme file is a JSON object whose `overrides` names real colour tokens.
// Only name, base and well-formed colours are kept, so nothing else can ride along.
function parseTheme(text, fallbackName) {
  let d
  try { d = JSON.parse(text) } catch { return null }
  if (!d || typeof d.overrides !== 'object' || !d.overrides || Array.isArray(d.overrides)) return null
  const overrides = {}
  for (const [k, v] of Object.entries(d.overrides)) if (/^\w{1,48}$/.test(k) && typeof v === 'string' && COLOR.test(v.trim())) overrides[k] = v.trim()
  if (Object.keys(overrides).filter((k) => TOKEN.test(k)).length < 3) return null
  const name = (typeof d.name === 'string' ? d.name : fallbackName).replace(/[^\p{L}\p{N} .,+&'()_\-–·:/]/gu, '').replace(/s+/g, ' ').trim().slice(0, 48) || fallbackName
  return { name, base: BASES.includes(d.base) ? d.base : 'dark', overrides }
}

async function readSource(repo) {
  const info = await gh(`repos/${repo}`)
  if (!info) return null
  const license = info.license?.spdx_id && info.license.spdx_id !== 'NOASSERTION' ? info.license.spdx_id : null
  const tree = await gh(`repos/${repo}/git/trees/${info.default_branch}?recursive=1`)
  const paths = (tree?.tree ?? []).map((t) => t.path).filter((p) => /\.json$/i.test(p) && !SKIP.test('/' + p) && !/(^|\/)(package(-lock)?|tsconfig|plugin|marketplace|hooks|settings)[^/]*\.json$/i.test(p)).slice(0, 400)
  const seen = new Set()
  const themes = (await pool(paths, 8, async (path) => {
    const res = await fetch(`https://raw.githubusercontent.com/${repo}/${info.default_branch}/${path.split('/').map(encodeURIComponent).join('/')}`)
    if (!res.ok) return null
    const file = path.split('/').pop().replace(/\.json$/i, '')
    const theme = parseTheme(await res.text(), file)
    return theme && { theme, path, file }
  })).filter((t) => {
    if (!t) return false
    const hash = createHash('sha1').update(JSON.stringify([t.theme.base, t.theme.overrides])).digest('hex')
    t.hash = hash
    return !seen.has(hash) && seen.add(hash)
  })
  let licenseText = null
  if (themes.length && OPEN.has(license)) {
    const lic = await gh(`repos/${repo}/license`)
    if (lic?.content) licenseText = Buffer.from(lic.content, 'base64').toString('utf8')
  }
  return { repo, branch: info.default_branch, stars: info.stargazers_count, license, licenseText, themes, description: info.description ?? '' }
}

const sources = JSON.parse(await readFile(at('sources.json'), 'utf8'))
const found = (await pool(sources.terminal.filter((r) => r !== ME), 4, readSource)).filter((s) => s?.themes.length)
found.sort((a, b) => b.stars - a.stars || a.repo.localeCompare(b.repo))

await rm(at('themes/'), { recursive: true, force: true })
await rm(at('licenses/'), { recursive: true, force: true })
await mkdir(at('themes/'), { recursive: true })
await mkdir(at('licenses/'), { recursive: true })

const slugs = new Set()
const hashes = new Set()
const themes = []
for (const s of found) {
  s.copied = Boolean(s.licenseText)
  const owner = s.repo.split('/')[0]
  if (!s.copied) continue
  await writeFile(at(`licenses/${s.repo.replace('/', '--')}.txt`), `${s.repo} (${s.license})\nhttps://github.com/${s.repo}\n\n${s.licenseText}`)
  for (const t of s.themes) {
    if (hashes.has(t.hash)) continue
    hashes.add(t.hash)
    s.kept = (s.kept ?? 0) + 1
    const clean = t.file.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme'
    let slug = clean
    if (slugs.has(slug)) slug = `${clean}-${owner.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    for (let n = 2; slugs.has(slug); n++) slug = `${clean}-${n}`
    slugs.add(slug)
    await writeFile(at(`themes/${slug}.json`), JSON.stringify(t.theme, null, 2) + '\n')
    const light = t.theme.base.startsWith('light')
    const colors = { ...DEFAULTS[light ? 'light' : 'dark'] }
    for (const k of Object.keys(colors)) if (t.theme.overrides[k]) colors[k] = toHex(t.theme.overrides[k]) ?? colors[k]
    themes.push({ slug, name: t.theme.name, author: owner, repo: s.repo, url: `https://github.com/${s.repo}/blob/${s.branch}/${t.path}`, license: s.license, light, colors, base: t.theme.base, overrides: t.theme.overrides })
  }
}
themes.sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug))

const linked = found.filter((s) => !s.copied).map((s) => ({ repo: s.repo, count: s.themes.length, stars: s.stars, license: s.license }))
const data = { repo: ME, defaults: DEFAULTS, themes, linked, desktop: sources.desktop, tools: sources.tools }
await writeFile(at('docs/themes.json'), JSON.stringify(data) + '\n')

// README hero: the same mock terminal the site draws, as one static SVG.
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const byRepo = Object.values(Object.groupBy(themes, (t) => t.repo))
const picks = []
for (let i = 0; picks.length < 24 && byRepo.some((g) => g[i]); i++) for (const g of byRepo) if (g[i] && picks.length < 24) picks.push(g[i])
const W = 208, H = 132, GAP = 12, COLS = 4
const rows = Math.ceil(picks.length / COLS)
const card = (t, i) => {
  const c = t.colors, x = (i % COLS) * (W + GAP), y = Math.floor(i / COLS) * (H + GAP)
  return `<g transform="translate(${x} ${y})" font-size="10">
<rect width="${W}" height="${H}" rx="8" fill="${c.bg}" stroke="#80808040"/>
<text x="12" y="20" fill="${c.claude}">✻ <tspan fill="${c.text}" font-weight="600">${esc(t.name)}</tspan></text>
<rect x="8" y="28" width="${W - 16}" height="15" rx="2" fill="${c.userMessageBackground}"/><text x="12" y="39" fill="${c.text}">&gt; fix the login bug</text>
<text x="12" y="56" fill="${c.success}">● <tspan fill="${c.text}">Update(auth.ts)</tspan></text>
<rect x="20" y="61" width="${W - 28}" height="13" fill="${c.diffRemoved}"/><text x="24" y="71" fill="${c.text}">- const ok = false</text>
<rect x="20" y="74" width="${W - 28}" height="13" fill="${c.diffAdded}"/><text x="24" y="84" fill="${c.text}">+ const ok = true</text>
<rect x="8" y="94" width="${W - 16}" height="17" rx="4" fill="none" stroke="${c.promptBorder}"/><text x="14" y="106" fill="${c.inactive}">&gt; </text>
<text x="12" y="124" fill="${c.autoAccept}">⏵⏵ accept edits <tspan fill="${c.planMode}">⏸ plan</tspan> <tspan fill="${c.warning}">▲</tspan> <tspan fill="${c.error}">✗</tspan></text>
</g>`
}
await writeFile(at('docs/gallery.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="${COLS * (W + GAP) - GAP}" height="${rows * (H + GAP) - GAP}" viewBox="0 0 ${COLS * (W + GAP) - GAP} ${rows * (H + GAP) - GAP}" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">\n${picks.map(card).join('\n')}\n</svg>\n`)

const table = [
  `**${themes.length} terminal themes** in one install · **${linked.reduce((n, s) => n + s.count, 0)} more** linked · **${sources.desktop.length} desktop themes** linked`,
  '',
  '| Source | Themes | Licence | |',
  '| --- | ---: | --- | --- |',
  ...found.filter((s) => !s.copied || s.kept).map((s) => `| [${s.repo}](https://github.com/${s.repo}) | ${s.copied ? s.kept : s.themes.length} | ${s.license ?? 'none'} | ${s.copied ? 'included' : 'linked'} |`),
].join('\n')
await writeFile(at('THEMES.md'), ['# Themes', '', 'Every included theme, its author and where it came from.', '', '| Theme | Author | Source | Licence |', '| --- | --- | --- | --- |', ...themes.map((t) => `| [${t.name}](themes/${t.slug}.json) | [${t.author}](https://github.com/${t.author}) | [${t.repo}](${t.url}) | [${t.license}](licenses/${t.repo.replace('/', '--')}.txt) |`)].join('\n') + '\n')

const readme = await readFile(at('README.md'), 'utf8')
await writeFile(at('README.md'), readme.replace(/(<!-- stats -->)[\s\S]*(<!-- \/stats -->)/, `$1\n${table}\n$2`))

console.log(`${themes.length} included, ${linked.length} sources linked, ${sources.desktop.length} desktop`)
for (const s of found) console.log(`${s.copied ? '+' : '·'} ${s.repo}  ${s.themes.length}  ${s.license ?? 'none'}  ★${s.stars}`)
