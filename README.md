# 🌙 Tab Sleeper

**A Chrome extension that actually unloads inactive tabs to free up RAM — not just Chrome's built-in "discard".**

Tab Sleeper navigates idle tabs to a lightweight internal sleep page instead of merely suspending them. That means the original page's DOM, JavaScript, and cached images are fully released from memory, not just paused. Waking a tab is a deliberate action (click the Wake button) — no accidental reloads from a stray click, unlike Chrome's default tab discarding.

---

## Features

- 🛌 **Real memory savings** — sleeping tabs are navigated away entirely, not just suspended
- 🖱️ **Wake only on purpose** — clicking a sleeping tab does nothing; you must press the Wake button
- ⏱️ **Configurable idle timeout** — put tabs to sleep after N minutes of inactivity
- 📌 **Smart exclusions** — pinned tabs and tabs playing audio are skipped by default
- 🚫 **Whitelist** — exclude specific domains from ever sleeping
- ⌨️ **Keyboard shortcut** (`Alt+S`) — sleep the current tab instantly
- 🖱️ **Right-click menu** — "Sleep this tab now" from the tab strip
- 🔴 **Badge counter** — see at a glance how many tabs are asleep
- 🎬 **YouTube resume** — remembers video playback position and resumes exactly there on wake
- 🔁 **Survives browser restarts** — sleep state is encoded in the tab's own URL, not tied to Chrome's (unstable) tab IDs
- 📊 **Popup dashboard** — list of sleeping tabs, "Wake All", and simple stats (currently sleeping / total ever slept / estimated savings)

## Installation

Not yet on the Chrome Web Store — install manually:

1. Download or clone this repository
2. Open `chrome://extensions` (also works in Edge, Brave, and other Chromium browsers)
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the project folder
5. Done — the icon appears in your toolbar

## Usage

Click the extension icon to open the settings popup:

| Setting | Description |
|---|---|
| Idle timeout | Minutes of inactivity before a tab is put to sleep |
| Whitelist | Comma-separated domains that should never sleep |
| Exclude pinned tabs | Skip pinned tabs (on by default) |
| Exclude tabs playing audio | Skip tabs with active sound (on by default) |

Sleeping tabs show a small card in the popup with a **Wake** button, or wake them directly from the sleep page itself. **Wake All** clears every sleeping tab at once.

### Keyboard shortcut
`Alt+S` puts the current tab to sleep immediately (customizable at `chrome://extensions/shortcuts`).

## How it works

Chrome's built-in `tabs.discard()` API frees *some* memory but keeps enough state around that a stray click silently reloads the page — which defeats the purpose if you didn't mean to wake it. Tab Sleeper instead:

1. Reads the tab's URL, title, favicon, and (on YouTube) current video timestamp
2. Encodes all of that into the query string of a tiny internal `sleep.html` page
3. Navigates the tab there — the original page is completely torn down, no residual state
4. On Wake, rebuilds the original URL (with the YouTube timestamp appended, if applicable) and navigates back

Because all the info needed to restore a tab lives in that tab's own URL rather than in `chrome.storage` keyed by tab ID, sleeping tabs survive a full browser restart — Chrome assigns new tab IDs on every launch, which would otherwise break any ID-based bookkeeping.

The background service worker keeps its own bookkeeping (last-active timestamps, which tabs are currently asleep) in memory and only persists to `chrome.storage.local` on real state changes or once a minute — not on every tab switch or page load — to avoid the extension itself becoming a source of overhead.

## Permissions

| Permission | Why it's needed |
|---|---|
| `tabs` | Read tab URLs/titles and navigate tabs to sleep/wake them |
| `storage` | Save settings and lightweight state (idle timestamps, sleeping-tab list) |
| `alarms` | Periodic check (once a minute) for tabs that have gone idle |
| `contextMenus` | The "Sleep this tab now" right-click entry |
| `scripting` | Read the current playback time from a YouTube `<video>` element before sleeping the tab |
| `host_permissions: *://*.youtube.com/*` | Scoped exclusively to the YouTube timestamp feature above |

No data ever leaves your browser — there's no network activity, telemetry, or external server involved.

## Contributing

Issues and pull requests are welcome. If a specific site's tab behaves unexpectedly (e.g. doesn't sleep cleanly or breaks on wake), please open an issue with the URL pattern involved.

## License

MIT — see [LICENSE](LICENSE).
