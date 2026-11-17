#!/usr/bin/env node
// Claude Code Themes: open the Studio, or preview, make and install themes from the terminal.
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { isLight, toHex, rgb, slug, sanitize, stringify, resolve, generate, check, unpack } from './docs/lib.js'
import { SCENES, recipe, plugin, unpackRecipe } from './docs/scenes.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const site = path.join(root, 'docs')
const shipped = path.join(root, 'themes')
const config = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
const home = path.join(config, 'themes')
// Backdrops are plugins; they live in a small marketplace of their own on this machine.
const market = path.join(config, 'claude-code-themes')
const MARKET = 'my-themes'
const tokens = JSON.parse(readFileSync(path.join(site, 'tokens.json'), 'utf8'))

const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf('--' + name); if (i < 0) return false; args.splice(i, 1); return true }
const option = (name) => { const i = args.indexOf('--' + name); if (i < 0) return null; const [, v] = args.splice(i, 2); return v ?? null }
const fail = (text) => { console.error(text); process.exit(1) }

const colour = process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb'
const fg = (hex, s) => (colour ? `\x1b[38;2;${rgb(hex).join(';')}m${s}\x1b[39m` : s)
const bg = (hex, s) => (colour ? `\x1b[48;2;${rgb(hex).join(';')}m${s}\x1b[49m` : s)
const dim = (s) => (colour ? `\x1b[2m${s}\x1b[22m` : s)

const readTheme = (file) => { try { return sanitize(JSON.parse(readFileSync(file, 'utf8'))) } catch { return null } }
const readRecipe = (file) => { try { return recipe(JSON.parse(readFileSync(file, 'utf8'))) } catch { return null } }
const names = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort() : [])
/** A file path, a theme in this collection, an installed theme, or a code copied from the Studio. */
function find(ref) {
  if (!ref) fail('Which theme? Give a name, a file or a Studio code.')
  const safe = /^[\w-]{1,64}$/.test(ref)
  const hit = [existsSync(ref) && ref, safe && path.join(shipped, ref + '.json'), safe && path.join(home, ref + '.json')].find((p) => p && existsSync(p))
  const made = hit ? readRecipe(hit) : unpackRecipe(ref)
  if (made) return { backdrop: made, slug: slug(made.name) }
  const theme = hit ? readTheme(hit) : unpack(ref)
  if (!theme) fail(hit ? `${hit} is not a theme file.` : `No theme called "${ref}". Try: claude-code-themes list`)
  return { theme, slug: hit ? path.basename(hit, '.json') : slug(theme.name) }
}

/** Writes the theme into Claude Code's themes folder. Returns the path, or null if it exists and force is off. */
function install(theme, name, force) {
  if (!/^[\w-]{1,64}$/.test(name)) throw new Error('Bad theme name')
  const file = path.join(home, name + '.json')
  if (existsSync(file) && !force) return null
  mkdirSync(home, { recursive: true })
  const tmp = file + '.' + randomBytes(4).toString('hex') + '.tmp'
  writeFileSync(tmp, stringify(theme))
  renameSync(tmp, file)
  return file
}

const claude = (...a) => spawnSync('claude', a.map((x) => (process.platform === 'win32' && /\s/.test(x) ? '"' + x + '"' : x)), { shell: process.platform === 'win32', encoding: 'utf8' })
const listed = () => { try { return JSON.parse(readFileSync(path.join(market, '.claude-plugin', 'marketplace.json'), 'utf8')).plugins ?? [] } catch { return [] } }
const list = (plugins) => { mkdirSync(path.join(market, '.claude-plugin'), { recursive: true }); writeFileSync(path.join(market, '.claude-plugin', 'marketplace.json'), JSON.stringify({ name: MARKET, owner: { name: os.userInfo().username }, plugins }, null, 2) + '\n') }

/** Builds the backdrop as a plugin on this machine and installs it into Claude Code. */
function installBackdrop(made) {
  // Installed plugins are cached by version, so every build gets a new one.
  const { id, files } = plugin(made, '1.0.' + Math.floor(Date.now() / 1000))
  const dir = path.join(market, id)
  rmSync(dir, { recursive: true, force: true })
  for (const [name, text] of Object.entries(files)) { const file = path.join(dir, name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text) }
  list([...listed().filter((p) => p.name !== id), { name: id, source: './' + id, description: made.name + ' backdrop' }])
  const commands = ['claude plugin marketplace add "' + market + '"', 'claude plugin install ' + id + '@' + MARKET]
  if (claude('--version').status !== 0) return { id, dir, ok: false, commands, message: 'Built ' + made.name + ' in ' + dir + '. Claude Code was not found on the PATH, so run these two commands:' }
  if (claude('plugin', 'marketplace', 'add', market).status !== 0) claude('plugin', 'marketplace', 'update', MARKET)
  let done = claude('plugin', 'install', id + '@' + MARKET)
  if (done.status !== 0) done = claude('plugin', 'update', id + '@' + MARKET)
  return done.status === 0
    ? { id, dir, ok: true, message: 'Installed ' + made.name + '. Restart the Claude desktop app (2.1.323 or newer) to see it. /' + id + ' off turns it off.' }
    : { id, dir, ok: false, commands, message: 'Built ' + made.name + ' in ' + dir + ' but Claude Code would not install it: ' + (done.stderr || done.stdout || '').trim().split('\n').pop() }
}
function removeBackdrop(id) {
  if (!listed().some((p) => p.name === id)) return false
  claude('plugin', 'uninstall', id + '@' + MARKET)
  rmSync(path.join(market, id), { recursive: true, force: true })
  list(listed().filter((p) => p.name !== id))
  return true
}
const say = (out) => { console.log(out.message); for (const c of out.commands ?? []) console.log('  ' + c) }

function preview(theme) {
  const c = resolve(theme, tokens)
  const line = (s = '') => console.log(bg(c.terminal, ' ' + s.padEnd(54) + ' '))
  const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length))
  const on = (back, s) => bg(back, fg(c.text, pad(s, 54)))
  const row = (s, plain) => console.log(bg(c.terminal, ' ' + s + ' '.repeat(Math.max(0, 54 - plain.length)) + ' '))
  console.log()
  row(fg(c.claude, '✻') + fg(c.text, ` ${theme.name}`) + fg(c.inactive, `  ${theme.base}`), `✻ ${theme.name}  ${theme.base}`)
  line()
  console.log(bg(c.terminal, ' ') + on(c.userMessageBackground, ' > fix the login bug') + bg(c.terminal, ' '))
  row(fg(c.claude, '●') + fg(c.text, " I'll update the check in auth.ts."), "● I'll update the check in auth.ts.")
  row(fg(c.success, '●') + fg(c.text, ' Update(src/auth.ts)'), '● Update(src/auth.ts)')
  console.log(bg(c.terminal, ' ') + on(c.diffRemoved, '  13 - const ok = false') + bg(c.terminal, ' '))
  console.log(bg(c.terminal, ' ') + on(c.diffAdded, '  13 + const ok = true') + bg(c.terminal, ' '))
  row(fg(c.bashBorder, '!') + fg(c.text, ' npm test'), '! npm test')
  row(fg(c.success, '● 12 passed') + '  ' + fg(c.error, '● 1 failed') + '  ' + fg(c.warning, '▲ 2 warnings'), '● 12 passed  ● 1 failed  ▲ 2 warnings')
  row(fg(c.permission, 'Do you want to make this edit?') + fg(c.suggestion, '  ❯ Yes'), 'Do you want to make this edit?  ❯ Yes')
  row(fg(c.promptBorder, '╭' + '─'.repeat(52) + '╮'), '╭' + '─'.repeat(52) + '╮')
  row(fg(c.promptBorder, '│') + fg(c.inactive, pad(' > Try "write a test"', 52)) + fg(c.promptBorder, '│'), '│' + ' '.repeat(52) + '│')
  row(fg(c.promptBorder, '╰' + '─'.repeat(52) + '╯'), '╰' + '─'.repeat(52) + '╯')
  row(fg(c.planMode, '⏸ plan mode') + '  ' + fg(c.autoAccept, '⏵⏵ accept edits') + '  ' + fg(c.fastMode, '↯ fast'), '⏸ plan mode  ⏵⏵ accept edits  ↯ fast')
  console.log()
  const bad = check(c)
  for (const p of bad) console.log(`  ${fg(c[p.fg], '■')} ${p.fg} on ${p.bg}: contrast ${p.ratio.toFixed(1)}, wants ${p.min}`)
  if (bad.length) console.log()
  return bad
}

function studio() {
  const key = randomBytes(16).toString('hex')
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' }
  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    const origin = `http://127.0.0.1:${server.address().port}`
    // Only this machine's own Studio page may reach the API: right host, same origin, and the session cookie.
    if (req.headers.host !== origin.slice(7)) { res.writeHead(403); return res.end() }
    if (url.pathname.startsWith('/api/')) {
      const mine = (req.headers.cookie ?? '').split(/;\s*/).includes('k=' + key) && (!req.headers.origin || req.headers.origin === origin)
      if (!mine) return json(res, 403, { error: 'Open the Studio from the link this command printed.' })
      if (url.pathname === '/api/status') return json(res, 200, { dir: home, installed: names(home) })
      if (url.pathname === '/api/install' && req.method === 'POST') {
        let body = ''
        for await (const chunk of req) { body += chunk; if (body.length > 262144) return json(res, 413, { error: 'Theme too large' }) }
        try {
          const { theme, slug: name, force } = JSON.parse(body)
          const clean = sanitize(theme)
          if (!clean) return json(res, 400, { error: 'Not a theme' })
          const file = install(clean, slug(name), force === true)
          return file ? json(res, 200, { path: file }) : json(res, 409, { exists: true })
        } catch (e) { return json(res, 400, { error: String(e.message ?? e) }) }
      }
      if (url.pathname === '/api/install-desktop' && req.method === 'POST') {
        let body = ''
        for await (const chunk of req) { body += chunk; if (body.length > 16384) return json(res, 413, { error: 'Too large' }) }
        try {
          const made = recipe(JSON.parse(body).recipe)
          return made ? json(res, 200, installBackdrop(made)) : json(res, 400, { error: 'Not a backdrop' })
        } catch (e) { return json(res, 400, { error: String(e.message ?? e) }) }
      }
      return json(res, 404, { error: 'Not found' })
    }
    const rel = path.normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname))
    const file = path.join(site, rel)
    if (!file.startsWith(site + path.sep) || !existsSync(file)) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'set-cookie': `k=${key}; HttpOnly; SameSite=Strict; Path=/`, 'cache-control': 'no-store' })
    res.end(readFileSync(file))
  })
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}/studio.html`
    console.log(`\n  Studio     ${url}\n  Backdrops  ${url.replace('studio', 'backdrop')}\n  Themes install to ${home}\n  Ctrl+C to stop\n`)
    if (quiet) return
    const [cmd, ...rest] = process.platform === 'win32' ? ['cmd', '/c', 'start', '', url] : [process.platform === 'darwin' ? 'open' : 'xdg-open', url]
    spawn(cmd, rest, { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
  })
}

const HELP = `
  claude-code-themes                    open the Studio in your browser
  claude-code-themes list [word]        themes in the collection, ● marks installed ones
  claude-code-themes preview <theme>    show a theme in this terminal
  claude-code-themes install <theme>    add it to Claude Code      [--as name] [--force]
  claude-code-themes uninstall <name>   remove an installed theme
  claude-code-themes new <#colour>      make a theme from one colour [--light] [--name "…"] [--install]
                                        add --scene <name> for a desktop backdrop:
                                        cat, dog, anime, pinboard, koi, petals, aurora,
                                        fireflies, stars, snow, rain
  claude-code-themes check <theme>      report colour pairs that are hard to read

  <theme> is a name from the list, a .json file, or a code copied from the Studio.
  Themes colour the terminal. Backdrops are animated scenes for the desktop app.
`

const quiet = flag('no-open'), port = +(option('port') ?? 0)
const command = args.shift()
if (!command || command === 'studio') studio()
else if (command === 'list') {
  const word = (args[0] ?? '').toLowerCase(), mine = new Set(names(home))
  const all = [...new Set([...names(shipped), ...mine])].sort().filter((n) => n.includes(word))
  for (const n of all) {
    const file = [path.join(shipped, n + '.json'), path.join(home, n + '.json')].find(existsSync)
    const t = readTheme(file)
    if (!t) continue
    const c = resolve(t, tokens)
    const dots = ['claude', 'success', 'error', 'warning', 'permission', 'planMode'].map((k) => fg(c[k], '■')).join('')
    console.log(`${mine.has(n) ? '●' : ' '} ${dots} ${n.padEnd(28)} ${dim(t.name)}`)
  }
  console.log(dim(`\n${all.length} themes, ${mine.size} installed`))
} else if (command === 'preview') { const f = find(args[0]); f.backdrop ? console.log(`${f.backdrop.name}: a ${f.backdrop.scene} backdrop for the desktop app. Open the Studio to see it move.`) : preview(f.theme) }
else if (command === 'check') { const f = find(args[0]); if (f.backdrop) fail('Backdrops have nothing to check.'); const bad = preview(f.theme); console.log(bad.length ? `${bad.length} pairs are hard to read.` : 'Every pair is readable.'); process.exit(bad.length ? 1 : 0) }
else if (command === 'install') {
  const as = option('as'), force = flag('force'), { theme, backdrop, slug: found } = find(args[0])
  if (backdrop) { const out = installBackdrop(as ? { ...backdrop, name: as } : backdrop); say(out); process.exit(out.ok ? 0 : 1) }
  const name = slug(as ?? found), file = install(theme, name, force)
  if (!file) fail(`${name} is already installed. Add --force to replace it, or --as another-name.`)
  preview(theme)
  console.log(`Installed to ${file}\nRun /theme in Claude Code and pick "${theme.name}".`)
} else if (command === 'uninstall') {
  const name = args[0] ?? '', file = path.join(home, name + '.json')
  if (/^[\w-]{1,64}$/.test(name) && removeBackdrop(name)) { console.log(`Removed the ${name} backdrop`); process.exit(0) }
  if (!/^[\w-]{1,64}$/.test(name) || !existsSync(file)) fail(`"${name}" is not installed.`)
  rmSync(file)
  console.log(`Removed ${file}`)
} else if (command === 'new') {
  const light = flag('light'), name = option('name'), add = flag('install'), scene = option('scene'), seed = toHex(args[0] ?? '')
  if (!seed) fail('Give a colour, for example: claude-code-themes new "#3b82f6"')
  if (scene) {
    const made = recipe({ scene, name, color: seed, light, n: Math.floor(Math.random() * 999999) })
    if (!made) fail('Scenes: ' + SCENES.map((s) => s.id).join(', '))
    if (add) { const out = installBackdrop(made); say(out); process.exit(out.ok ? 0 : 1) }
    const file = slug(made.name) + '.backdrop.json'
    writeFileSync(file, JSON.stringify(made, null, 2) + '\n')
    console.log('Wrote ' + file + '. Install it with: claude-code-themes install ' + file)
    process.exit(0)
  }
  const theme = sanitize(generate(seed, { light, name: name ?? 'My Theme' }))
  preview(theme)
  const id = slug(theme.name)
  if (add) { const file = install(theme, id, true); console.log(`Installed to ${file}\nRun /theme in Claude Code and pick "${theme.name}".`) }
  else { writeFileSync(id + '.json', stringify(theme)); console.log(`Wrote ${id}.json. Install it with: claude-code-themes install ${id}.json`) }
} else if (['help', '--help', '-h'].includes(command)) console.log(HELP)
else fail(`Unknown command "${command}".\n${HELP}`)
