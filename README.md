# Vellura 0.4.2 — Real Browser Feature Upgrade

Windows-first Electron + Chromium browser implementation.

## Main improvements

- Single Vellura V brand asset, using `assets/vellura-logo.png`
- Windows ICO derived from the same V brand
- Responsive custom browser chrome
- New-tab `vellura://newtab/` page
- Real Chromium tabs through WebContentsView
- New-tab + button sits directly after the tab strip and before window controls
- Tab switching, closing and reopen
- Profile button and persistent browser profiles
- New Window and New Private Window
- History and bookmarks per profile
- Download manager with open/folder/pause/resume/cancel actions
- Unpacked Chromium extension manager
- Real permission request prompts
- Context menu on webpage content
- Save page
- Print
- Find in page
- Developer Tools
- Full screen
- Clear browsing data
- Search engine settings
- Zoom controls and keyboard shortcuts
- Ctrl+= / Ctrl++ / Ctrl+- / Ctrl+0
- Responsive layout at smaller window widths
- Nodemon development mode
- Quiet normal start
- Windows NSIS packaging configuration with the Vellura icon

## Run

```powershell
npm install
npm run check
npm run dev
```

Normal quiet launch:

```powershell
npm start
```

Build Windows installer:

```powershell
npm run dist
```

## Branding

Vellura's UI references only:

- `assets/vellura-logo.png`
- `assets/vellura.ico`

The SVG logo is intentionally not used by this build. Replace `assets/vellura-logo.png` with your own edited Vellura PNG at any time; the browser UI will continue to use it.

## Extension support

Vellura can load unpacked extensions from a folder containing `manifest.json`.
Electron supports a subset of the Chrome extension APIs, so extension compatibility is not identical to Chrome.

## Feature status

The menu mirrors the requested browser-style layout. The Cast menu entry is present, but Chromium screen-casting discovery is not exposed as a generic Electron API; the UI explains that state rather than pretending a cast connection exists.

This project keeps remote page renderers sandboxed and does not expose Node.js APIs directly to web pages.


## Important update note

This update package intentionally does not include an `assets/` directory. Keep the user's existing `assets/vellura-logo.png` exactly as it is. The Vellura application continues to use that PNG; do not replace it with an SVG. Keep the existing `assets/vellura.ico` as well.

### Fixes in 0.4.2

- Vellura UI zoom is isolated from webpage zoom and locked to 100%.
- Ctrl+= / Ctrl++ / Ctrl+- / Ctrl+0 act on the webpage only.
- Ctrl+Shift+0 repairs the browser chrome if an older build left it zoomed.
- Hamburger menu, profile menu, history/bookmarks/downloads/extensions panels can expand beyond the 116px toolbar without being clipped.
- The + new-tab button stays directly after the scrollable tab strip and before the Windows controls.
- New-tab JavaScript is separated into `src/pages/newtab.js` to avoid inline-code corruption.
- Middle-click closes a tab.
- Context-menu link operations are improved.
- Chromium page zoom supports a broader range.
