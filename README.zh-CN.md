# Omni Collector

[English](README.md) · **简体中文**

**Turn scattered favorites into a searchable library in Obsidian.**

Sync saved items from **Bilibili, YouTube, Xiaohongshu, MakerWorld and Xiaoheihe** into your vault. Find them in one place, organize them with tags and topics, and connect them to your own notes.

[![Release](https://img.shields.io/github/v/release/simonemuller6127-png/omni-collector)](https://github.com/simonemuller6127-png/omni-collector/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Obsidian desktop](https://img.shields.io/badge/Obsidian-desktop-7C3AED)](https://obsidian.md)

[Get started](#installation) · [Features](#features) · [Privacy and limitations](#privacy-and-limitations) · [Report an issue](https://github.com/simonemuller6127-png/omni-collector/issues)

> [!IMPORTANT]
> This is an early-stage **desktop-only** plugin with a **required local Node.js engine**. Installing the three plugin files alone does not complete setup. AI is optional and off by default.
>
> This guide describes release **0.9.0**. The default branch's application code may be older; use the release assets and matching source tag, not the root `main.js`, for installation.

## Why Omni Collector?

A tutorial on Bilibili, a reference on Xiaohongshu, and a guide on Xiaoheihe may all belong to the same project. Instead of searching each platform separately:

1. **Collect:** sync the titles, source links and covers of your saved items.
2. **Find:** search across platforms and filter by status, priority, tag or topic.
3. **Connect:** group related items into a topic and link them to your own Obsidian notes.
4. **Revisit:** use review and overdue reminders to return to items you saved for later.

This is a library of saved references, **not a complete offline archive of every original post or video**.

## Supported platforms

| Platform | Collection scope |
| --- | --- |
| Bilibili | Favorite folders and Watch Later |
| YouTube | Liked videos; requires yt-dlp and separate cookie-file setup |
| Xiaohongshu | Favorites and likes |
| MakerWorld | Favorites and optional likes |
| Xiaoheihe | Saved posts; unavailable items are retained and marked |

Initial sync collects lightweight metadata: titles, URLs and covers. Details are retrieved on demand where supported. Availability depends on platform changes, permissions and a valid login session; not all platforms support the same detail fields.

## Features

### Find and organize

- Text and thumbnail-card views, keyword search, filters and bulk link copying.
- Smart views for unorganized items, recent additions, high-priority items, rated items and Watch Later.
- Organization states, priorities, 1–5 star ratings, selected comments and bulk operations.
- Theme-aware cards with platform colors and status indicators.
- Embedded Bilibili / YouTube players and on-demand content previews where supported.

### Connect your knowledge

- **Tag Atlas:** extracted platform tags, aliases and duplicate-tag merging.
- **Topics:** hub notes with wikilinks and Dataview indexes; topic merging and renaming.
- **Series:** automatic recognition plus manual membership and progress tracking.
- Related items through content groups, shared entities and optional local TF-IDF similarity.
- Index local Markdown / PDF files and link them to saved items by source URL. Optional file-hash tracking helps recover moved-file associations.
- Separate generated and user-written Markdown sections so updates preserve your own notes.

### Optional AI assistance

- Suggestions for tags, topics, groups and summaries, **reviewed by you before application**.
- Manual mode: copy a single-item or batch prompt into your chosen AI tool, then paste the response back for review. No API key is required by the plugin in this mode.
- Existing tags and topics guide manual prompts toward consistent naming.
- API mode supports DeepSeek and OpenAI-compatible services, with feature switches and daily limits.

### Keep the library useful

- Daily review, overdue reminders and a separate Watch Later workflow.
- Per-platform sync schedules, daily limits and a rule center; automatic scheduling is off by default.
- Platform health indicators and counts for unavailable items, sync failures and missing files.

## Installation

### 1. Check requirements

- Obsidian **desktop 1.5.0+**. This is not a mobile plugin.
- Git, **Node.js 24 LTS (24.12+)** and **pnpm 9** for the source-based engine setup below. The locked dependencies require a newer Node version than the repository's older `>=20` declaration suggests.
- Playwright Chromium for browser-backed features; yt-dlp separately if using YouTube.
- An account with access to the saved items on each platform you enable.

The current deployment script uses local dependency junctions. Keep the source checkout and its `node_modules` on the same machine; the deployed engine directory is **not a portable standalone package**. The steps below include Windows path examples; other operating systems have not been verified by this documentation update.

### 2. Install the plugin

**BRAT:** install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat), add `simonemuller6127-png/omni-collector`, and select release `0.9.0` when prompted for a version. Verify that the installed plugin version matches your engine source.

**Manual:** download `main.js`, `manifest.json` and `styles.css` from the [0.9.0 release](https://github.com/simonemuller6127-png/omni-collector/releases/tag/0.9.0). Place all three in `<vault>/.obsidian/plugins/omni-collector/`, then enable the plugin in Obsidian's community plugin settings.

Open its settings once to initialize saved settings, then close Obsidian before the configuration step below. The release assets contain the plugin only, not the engine or its dependencies.

### 3. Build and deploy the matching engine

Run in a terminal. Use a new checkout directory; do not switch branches in a checkout containing work you need to preserve.

```bash
git clone --branch 0.9.0 --depth 1 https://github.com/simonemuller6127-png/omni-collector.git omni-collector-0.9.0
cd omni-collector-0.9.0
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @omni/engine exec playwright install chromium
node apps/engine/scripts/deploy.mjs --data-dir "<absolute-data-directory>"
```

Replace `<absolute-data-directory>` with your own local directory, for example `D:/OmniCollectorData`. Build before deploying. Chromium must be installed for the OS account that runs Obsidian; Linux may also need Playwright system dependencies.

### 4. Point the plugin at the engine

In 0.9.0, the data-directory and engine-script fields are stored settings, **not controls in the settings UI**. With Obsidian closed, back up `<vault>/.obsidian/plugins/omni-collector/data.json`, then update these fields while preserving all other settings:

```json
{
  "dataDir": "D:/OmniCollectorData",
  "engineScript": "D:/OmniCollectorData/engine/engine.cjs",
  "nodeBin": "C:/Program Files/nodejs/node.exe"
}
```

This is a field example, **not a replacement for the entire file**. Use your real absolute paths and valid JSON. Deployment creates `engine.cjs`, whereas the plugin's initial default points to `index.js`; these must be aligned. Set an explicit Node executable path rather than leaving it blank.

Reopen Obsidian and start the engine from the Omni Collector sidebar. The plugin can launch the local engine itself once setup is complete.

### 5. Sign in and sync

In plugin settings, select a platform under the cookie section and open its **login window**. Sign in yourself on the platform page; the engine captures the resulting session locally. Alternatively, import Cookie-Editor JSON or a `k=v; k2=v2` cookie string. Never send cookies to the project author or include them in an issue.

Start with one platform and confirm that the engine connects, sync finishes, and a saved item's source link opens correctly before enabling schedules.

**YouTube has an extra requirement:** install yt-dlp separately and make it available to the engine. Version 0.9.0 reads `<dataDir>/ytdl_cookies.txt` in yt-dlp's Netscape cookie-file format; generic cookie import does not automatically create this file. Treat it as a sensitive plaintext credential file. Consult [yt-dlp's documentation](https://github.com/yt-dlp/yt-dlp#readme) for installation and cookie-file requirements.

## Privacy and limitations

- The library and engine data are stored locally. Requests to source platforms still use your login session; “local” does not mean “offline.”
- Cookies managed by the cookie store are encrypted with AES-256-GCM under `<dataDir>/cookies/*.enc`. Browser profiles and the separate yt-dlp cookie file are also sensitive; do not assume every session file has the same encryption protection.
- Optional API-based AI sends the content being processed to your configured provider. Manual mode shares whichever content you paste into an external AI tool. Review it first.
- Sync is not a guarantee of permanent full-text or video preservation. Deleted content, expired sessions and platform changes can affect results.
- Use only your own account or content you are authorized to access, and follow each platform's terms and applicable content rights. This project is not affiliated with the supported platforms.
- Back up your vault before large sync or organization operations. Keep engine databases, cookies, browser profiles and plugin credentials out of public repositories and shared sync folders.

## Works with Obsidian

Generated notes use frontmatter tags and wikilinks. Dataview can render dynamic indexes; Breadcrumbs can support your own topic hierarchy. Prefer the plugin's Tag Atlas for renaming or merging tags to keep its database and notes aligned.

You can sync generated notes using your preferred vault-sync tool. Keep each device's engine data and credentials separate. Other Obsidian plugins have their own privacy behavior and configuration requirements.

## Architecture and development

```text
Obsidian desktop plugin
  └── Local IPC / WebSocket
        └── Node.js engine
              ├── Platform adapters
              ├── Optional AI suggestion queue
              ├── SQLite library and local file index
              └── Markdown generation and sync scheduler
```

The plugin lives in `apps/obsidian-plugin`, the engine in `apps/engine`, and shared packages in `packages/`. For development, use the `dev` branch; for a reproducible release setup, use the matching tag as above.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

## Feedback and support

[Open an issue](https://github.com/simonemuller6127-png/omni-collector/issues) with your plugin version, operating system, affected platform, expected behavior and sanitized reproduction steps. Remove cookies, tokens, login QR codes and personal information from logs and screenshots.

If Omni Collector helps you rediscover your saved items, a star or a real-world workflow write-up helps others find the project. Bug reports, documentation improvements and translations are welcome too.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=simonemuller6127-png/omni-collector&type=Date)](https://star-history.com/#simonemuller6127-png/omni-collector&Date)

The chart is provided by Star History and may be cached. [Open the interactive chart](https://star-history.com/#simonemuller6127-png/omni-collector&Date) if the image does not load.

## License

[MIT](LICENSE)
