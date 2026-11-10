# Project Management Tools

An interactive, single-page study site for the Project Management course taught by **Dr. Ramita Abdul Rahim**. It walks through 13 chapters of PM theory with hands-on tools — a critical-path timeline, a work-breakdown tree, a risk heat map, a cost/EVM calculator and more — running entirely in the browser with no backend.

**Live site:** https://saifsirhan.github.io/OM-Web-tools/

## Chapters
01 Project Fundamentals · 02 Identification & Selection · 03 Proposals & Contracts · 04 Scope & WBS · 05 Scheduling · 06 Resources · 07 Cost & EVM · 08 Risk · 09 Closing · 10 PM Role · 11 Teams · 12 Comms · 13 Org Structure

## Features
- 13 chapters of notes with interactive widgets
- Light / dark theme (the toggle remembers your choice)
- Scroll-driven "cinematic" chapter intros and card reveals
- **Teacher Mode** — a split-screen card builder (see below)
- Fully static: no accounts, no server, and nothing leaves the browser

## Run locally
No build step and no dependencies. Open `index.html` directly, or serve the folder:

```bash
# from the project root
python -m http.server 8000
# then open http://localhost:8000
```

## Teacher Mode
Append `?admin=true` to the URL (or click **Teacher Mode** in the footer) to open the card builder:

https://saifsirhan.github.io/OM-Web-tools/?admin=true

Compose a title, definition and bullet list, watch the exact card preview live, then **Copy HTML** and paste it into `index.html`. This screen only builds markup — it cannot change the site. Use **← Back to Site** to return.

## Project structure
```
index.html          all chapters and tools (single page)
css/
  theme.css         design tokens, light/dark themes, base elements
  layout.css        page layout, cinematic bands, teacher mode, tools
  notes.css         chapter note cards
js/
  app.js            tabs, interactions, timeline, WBS, risk map, teacher mode
  ch03-eval.js      chapter 03 widget
  ch07-evm.js       chapter 07 EVM chart
.nojekyll           serve files as-is on GitHub Pages
```

## Deployment
The site is plain HTML/CSS/JS, so GitHub Pages serves it directly:

- Source: branch **`main`**, folder **`/ (root)`**
- Any push to `main` republishes automatically (about a minute).
