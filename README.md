# Claude Code Themes

Every theme for Claude Code, in one place.

[![Gallery](docs/gallery.svg)](https://anhnt256.github.io/claude-code-themes/)

**[Browse the gallery →](https://anhnt256.github.io/claude-code-themes/)**

## Install

```
/plugin marketplace add anhnt256/claude-code-themes
/plugin install themes@claude-code-themes
```

Then run `/theme`.

To take one theme only, copy its file from [`themes/`](themes) into `~/.claude/themes/`.

## Sources

<!-- stats -->
**193 terminal themes** in one install · **264 more** linked · **37 desktop themes** linked

| Source | Themes | Licence | |
| --- | ---: | --- | --- |
| [matcra587/claude-themes](https://github.com/matcra587/claude-themes) | 106 | none | linked |
| [livlign/ccthemes](https://github.com/livlign/ccthemes) | 48 | MIT | included |
| [CodySpooner/ClaudeCodeThemes](https://github.com/CodySpooner/ClaudeCodeThemes) | 6 | MIT | included |
| [Shahfarzane/claude-code-themes](https://github.com/Shahfarzane/claude-code-themes) | 2 | MIT | included |
| [bgmacris/claude-code-themes](https://github.com/bgmacris/claude-code-themes) | 2 | MIT | included |
| [kamegg13/claude-code-themes](https://github.com/kamegg13/claude-code-themes) | 20 | MIT | included |
| [notgabriels-sys/claude-code-50-dark-themes](https://github.com/notgabriels-sys/claude-code-50-dark-themes) | 62 | MIT | included |
| [rezzminator/claude-code-tokyo-night](https://github.com/rezzminator/claude-code-tokyo-night) | 1 | none | linked |
| [amondnet/claude-code-themes](https://github.com/amondnet/claude-code-themes) | 10 | MIT | included |
| [chrisathook/claude-code-cli-themes](https://github.com/chrisathook/claude-code-cli-themes) | 3 | MIT | included |
| [codigrate/claude-code-themes](https://github.com/codigrate/claude-code-themes) | 12 | MIT | included |
| [khtdr/claude-code-themes](https://github.com/khtdr/claude-code-themes) | 76 | none | linked |
| [LinXiaoTao/themecc](https://github.com/LinXiaoTao/themecc) | 27 | MIT | included |
| [nils44344/claude-code-themes](https://github.com/nils44344/claude-code-themes) | 81 | none | linked |
| [stefangruehn/claude-code-theme](https://github.com/stefangruehn/claude-code-theme) | 1 | MIT | included |
<!-- /stats -->

Themes under an open licence are included, each with its licence in [`licenses/`](licenses). The rest are linked from the gallery and stay in their own repos. Desktop app themes are listed in the gallery with their install commands.

## Make your own

- `/theme` → **New custom theme**, built into Claude Code
- [claude-backdrops](https://github.com/AkkiCode06/claude-backdrops), custom backdrops for the desktop app
- [claude-code-theme-editor](https://github.com/FEIF-L/claude-code-theme-editor), a visual editor for every colour token
- [claude-code-theme-generator](https://github.com/denesszabo/claude-code-theme-generator), a browser editor with JSON export
- [tweakcc](https://github.com/Piebald-AI/tweakcc), for deeper changes to Claude Code itself

## Add a theme

Add your repo to `terminal` in [`sources.json`](sources.json) and open a pull request. The next sync picks up every theme file in it.

```
GITHUB_TOKEN=$(gh auth token) node scripts/sync.mjs
```

## Licence

[MIT](LICENSE) for this repo. Each included theme keeps its author's licence. The desktop list started from [buildwithclaude](https://github.com/davepoon/buildwithclaude) (MIT).
