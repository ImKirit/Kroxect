<div align="center">

<img src="build/icon.png" width="96" alt="Krate logo">

# Krate

**Every project, packed and findable.**

A local-first project organizer for Windows. Tag your projects, template their
folder structure, nickname the files that matter, and pull any of them up from
anywhere with one hotkey. View your library as a graph, link your cloud drives,
and ask the built-in AI agent about your own projects.

[![Release](https://img.shields.io/github/v/release/ImKirit/Krate?color=15151a&label=download)](https://github.com/ImKirit/Krate/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-70706a)](LICENSE)
[![Website](https://img.shields.io/badge/website-imkirit.dev%2Fkrate-15151a)](https://imkirit.dev/krate)

<img src="docs/main-home.png" width="800" alt="Krate library view">

</div>

---

## Why?

Started as a tool for organizing video edits: footage, SFX, project files and
renders scattered everywhere, never findable when needed. Krate grew into a
general project organizer. **Every project is a normal folder on your disk**,
plus a small `krate.json` that Krate uses to store its metadata. No database,
no cloud, no lock-in. Delete Krate and your files are exactly where they
always were.

## Features

**Projects as folders.** Pick a default projects folder once; every new
project lives there, or anywhere else you choose per project. Projects found
on disk are picked up automatically.

**Tags and statuses.** Preset tags (Edit, Video, App, Web, Design, and more)
plus your own tags with custom colors. Filter by tag or by status
(Idea / Active / Paused / Done / Archived). The tag list in the sidebar is
collapsible.

**Folder templates.** Build folder structures in a visual tree editor and
attach starter files that get copied into every new project created from the
template. You can also save any existing project's structure as a template.

**Favorites.** Pin the projects you are working on. They float to the top of
the grid and get their own sidebar filter.

**Cloud links and related projects.** Attach Google Drive folders, Dropbox
shares, OneDrive files or repos to a project. Link projects to each other;
the connections show up in the graph. All of it is searchable.

**Built-in AI agent.** An AI panel inside the app, like in your code editor.
The agent answers questions about your library using real tools: it lists
projects, runs searches and reads text files. Use a Claude API key (official
Anthropic SDK), a Groq key, or any OpenAI-style endpoint. Prefer signing in
with an account instead? Web mode embeds Claude, ChatGPT, Gemini or Copilot
in the panel. The agent is also available inside the quick search bar.

**Graph view.** See one project or your whole library as an interactive
graph: projects, tags, folders, files, links, and dashed edges between
related projects. Drag nodes, zoom, click to open.

**Quick search overlay.** Press the global hotkey (default `Ctrl+Alt+K`)
anywhere in Windows. A compact bar opens and expands as results come in.
It searches all projects, files, nicknames and links at once, browses your
folder structure in browse mode, and answers questions in AI mode.

<div align="center">
<img src="docs/overlay-search.png" width="620" alt="Quick search overlay">
</div>

**File nicknames.** Name a file what it *is* ("main clip", "the track",
"final render") instead of what it is called (`render_v7_FINAL2.mp4`).

**Notes, covers, descriptions.** A description plus timestamped notes per
project, a cover image and an accent color, stored right in the project
folder.

**Stats.** Projects per status and tag, total size, biggest projects. The
optional duplicate finder spots identical files across the whole library.

**Trash.** Deleted projects go to a restorable Krate trash first. Restore
them with one click or delete them forever.

**Watch folder.** Optionally watch a folder (Downloads by default). New files
trigger a notification and one click sorts them into the right project.

**ZIP export.** Export any project as a ZIP, metadata included.

**Themes.** Light (white with black accents, the default), Dark (black with
white accents) and the classic Krate Purple. A custom accent color can
override any theme. English and German interface.

**Portable mode and krate:// links.** Put a `krate-portable.txt` next to
`Krate.exe` and all data lives in a `data` folder beside it. `krate://` links
(for example `krate://neon-skies-amv`) open a project directly from Discord,
Notion or anywhere else.

**Drag and drop, both ways.** Drop files onto Krate to copy them into a
project; drag results out of the overlay straight into Premiere, Discord,
your browser, anywhere.

<div align="center">
<img src="docs/main-graph.png" width="800" alt="Graph view">
<img src="docs/main-ai.png" width="800" alt="AI panel">
</div>

## Install

Grab the installer from **[Releases](https://github.com/ImKirit/Krate/releases/latest)** and run it.

Or run from source:

```bash
git clone https://github.com/ImKirit/Krate.git
cd Krate
npm install
npm start
```

## Quick search keys

| Key | Action |
| --- | --- |
| `Ctrl+Alt+K` | Open / close the overlay (configurable in Settings) |
| `↑` `↓` | Select result |
| `Enter` | Open file / enter folder / send AI question |
| `Ctrl+Enter` | Show in Explorer |
| `Shift+Enter` | Open in the Krate main window |
| `Tab` | Toggle search / browse mode |
| `Ctrl+Space` | Toggle AI mode |
| `←` / `Backspace` | Up one folder (browse mode) |
| `Esc` | Close |
| Drag a row | Drop the file anywhere |

## How data is stored

```
MyProject/
├─ krate.json        title, tags, notes, links, related, nicknames, status
├─ .krate/           cover image
└─ your files, exactly as you put them
```

Global settings (projects folder, tags, templates, hotkey, theme, language,
AI configuration) live in `%APPDATA%/krate/config.json`. Files attached to
templates live in `%APPDATA%/krate/template-files/`, the trash in
`%APPDATA%/krate/trash/`. In portable mode all of this moves to the `data`
folder next to the exe. API keys are stored locally and only sent to the
provider you configured. The web mode login uses its own persistent browser
session on your machine.

## Development

```bash
npm start          # run the app
npm run smoke      # headless startup check
npm run icon       # regenerate build/icon.{png,ico}
npm run dist       # build the NSIS installer into dist/
node scripts/screenshot.js   # re-render the README screenshots (via npx electron)
```

Plain Electron with one runtime dependency (`@anthropic-ai/sdk` for the AI
agent). `src/main` is the main process (store, search indexer, AI agent,
windows, IPC), `src/renderer` the main window UI, `src/overlay` the quick
search overlay.

## License

[MIT](LICENSE) © ImKirit
