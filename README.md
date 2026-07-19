<div align="center">

<img src="build/icon.png" width="96" alt="Krate logo">

# Krate

**Every project, packed and findable.**

A local-first project organizer for Windows — tag your projects, template their
folder structure, nickname the files that matter, and pull any of them up
from anywhere with one hotkey. View your library as a graph, link your cloud
drives, and hand a project's full context to your AI of choice.

[![Release](https://img.shields.io/github/v/release/ImKirit/Krate?color=a855f7&label=download)](https://github.com/ImKirit/Krate/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-7c3aed)](LICENSE)
[![Website](https://img.shields.io/badge/website-imkirit.dev%2Fkrate-a855f7)](https://imkirit.dev/krate)

<img src="docs/main-home.png" width="800" alt="Krate library view">

</div>

---

## Why?

Started as a tool for organizing video edits — footage, SFX, project files and
renders scattered everywhere, never findable when you need them. Krate grew
into a general project organizer: **every project is a normal folder on your
disk**, plus a small `krate.json` that Krate uses to store its metadata.
No database, no cloud, no lock-in. Delete Krate and your files are exactly
where they always were.

## Features

📦 **Projects as folders** — pick a default projects folder once; every new
project lives there (or anywhere else you choose per project). Projects found
on disk are picked up automatically.

🏷 **Tags** — preset tags (Edit, Video, App, Web, Design, …) plus your own
custom tags with custom colors. Filter your library by tag or by status
(Idea / Active / Paused / Done / Archived).

🗂 **Folder templates** — build folder structures in a **visual tree editor**
("Video Edit" ships with `Footage/Raw`, `Audio/SFX`, `Exports`, …) and
**attach starter files** that are copied into every new project created from
the template. You can also save any existing project's structure as a template.

⭐ **Favorites** — pin the projects you're working on; they float to the top
of the grid and get their own sidebar filter.

🔗 **Cloud links** — attach Google Drive folders, Dropbox shares, OneDrive
files or repos to a project. Links are searchable in the overlay and open in
your browser.

🕸 **Graph view** — see one project (or your whole library) as an interactive
Obsidian-style force graph: projects cluster around shared tags, folders and
files fan out, nicknamed files glow. Drag nodes, zoom, click to open.

🤖 **AI assistant** — sign in to Claude, ChatGPT, Gemini or Copilot **with
your own account** (no API keys) in a built-in window. "Ask AI" on a project
copies its full context — file tree, nicknames, notes, links — ready to paste
into the chat.

📝 **Descriptions & notes** — a description plus timestamped notes/comments
per project, stored right in the project folder.

🖼 **Covers** — give each project a cover image and accent color so the
library is scannable at a glance.

✎ **File nicknames** — name a file what it *is* ("main clip", "the track",
"final render") instead of what it's called (`render_v7_FINAL2.mp4`).

⚡ **Quick-search overlay** — press the global hotkey (default `Ctrl+Alt+K`)
anywhere in Windows and search all projects, files and nicknames at once —
or flip into browse mode (`Tab`) and arrow-key through the folder structure.

<div align="center">
<img src="docs/overlay-search.png" width="620" alt="Quick-search overlay">
</div>

🖱 **Drag & drop both ways** — drop files onto Krate to copy them into a
project; drag results out of the overlay straight into Premiere, Discord,
your browser, anywhere.

🔎 More: fuzzy search, open/reveal in Explorer, tray icon, single-instance,
projects portable between machines, hand-drawn SVG icon set, and a switchable
animation system (Settings → *Smooth animations*, or classic v1.0 feel).

<div align="center">
<img src="docs/main-graph.png" width="800" alt="Graph view">
<img src="docs/main-files.png" width="800" alt="Files view with nicknames">
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

## Quick-search overlay keys

| Key | Action |
| --- | --- |
| `Ctrl+Alt+K` | Open / close the overlay (configurable in Settings) |
| `↑` `↓` | Select result |
| `Enter` | Open file / enter folder |
| `Ctrl+Enter` | Show in Explorer |
| `Shift+Enter` | Open in the Krate main window |
| `Tab` | Toggle search ⇄ browse mode |
| `←` / `Backspace` | Up one folder (browse mode) |
| `Esc` | Close |
| Drag a row | Drop the file anywhere |

## How data is stored

```
MyProject/
├─ krate.json        ← title, tags, notes, links, nicknames, status …
├─ .krate/           ← cover image
└─ …your files, exactly as you put them
```

Global settings (default projects folder, tags, templates, hotkey, AI
provider) live in `%APPDATA%/krate/config.json`; files attached to templates
are stored in `%APPDATA%/krate/template-files/`. The AI window uses its own
persistent browser session — your login stays on your machine.

## Development

```bash
npm start          # run the app
npm run smoke      # headless startup check
npm run icon       # regenerate build/icon.{png,ico}
npm run dist       # build the NSIS installer into dist/
node scripts/screenshot.js   # re-render the README screenshots (via npx electron)
```

Plain Electron, zero runtime dependencies, no build step. `src/main` is the
main process (store, search indexer, windows, IPC), `src/renderer` the main
window UI, `src/overlay` the quick-search overlay.

## License

[MIT](LICENSE) © ImKirit
