# Vellura 0.5

Vellura is a Windows-first desktop browser built with Electron and Chromium. It combines a real multi-tab browsing engine with custom, privacy-conscious browser chrome and profile-scoped data.

## Highlights

- Real Chromium pages rendered in isolated `WebContentsView` tabs
- Modern Vellura chrome with Midnight, Aurora, and Daylight themes
- Pinned, draggable, duplicable, closable, and reopenable tabs
- Tab audio status and per-tab mute controls
- Searchable Command Center with `Ctrl+K`
- Integrated address search, site information, find in page, print, save, zoom, and developer tools
- Distinctive, customizable `vellura://newtab/` launchpad
- Persistent profiles plus private browsing windows
- Profile-scoped history, bookmarks, settings, downloads, and browsing storage
- Download manager with open, reveal, pause, resume, and cancel actions
- Unpacked Chromium extension management
- Explicit website permission prompts and webpage context menus
- Responsive browser chrome and keyboard-accessible controls
- Windows NSIS installer configuration

## Run locally

Use an active Node.js LTS release.

```powershell
npm ci
npm run check
npm run dev
```

Launch without the development watcher:

```powershell
npm start
```

Build the Windows installer:

```powershell
npm run dist
```

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Command Center | `Ctrl+K` |
| Focus address bar | `Ctrl+L` |
| New / close / reopen tab | `Ctrl+T` / `Ctrl+W` / `Ctrl+Shift+T` |
| Switch tabs | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Find in page | `Ctrl+F` |
| History / downloads | `Ctrl+H` / `Ctrl+J` |
| Bookmarks / extensions | `Ctrl+Shift+B` / `Ctrl+Shift+A` |
| Zoom page | `Ctrl++` / `Ctrl+-` / `Ctrl+0` |
| Repair browser UI zoom | `Ctrl+Shift+0` |

Tab controls are also keyboard-accessible: use the arrow keys to move between focused tabs and Delete to close one.

## Security architecture

- Remote pages run with `contextIsolation: true`, `nodeIntegration: false`, and sandboxing enabled.
- The browser UI communicates with the main process through an explicit preload bridge.
- Internal pages use the privileged `vellura://` protocol and restrictive Content Security Policies.
- Private windows use in-memory sessions and do not save history.
- Website permissions are surfaced through Vellura-owned prompts instead of being silently granted.

Electron supports a subset of Chrome extension APIs, so unpacked extension compatibility is not identical to Chrome.

## Branding

Vellura intentionally uses the existing PNG and Windows icon assets:

- `assets/vellura-logo.png`
- `assets/vellura.ico`

Do not replace the PNG reference with an SVG. The application and verification script enforce this branding constraint.
