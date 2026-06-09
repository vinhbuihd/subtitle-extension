# Project Structure

This project is a Chrome/Edge extension for studying English while watching
movies online. It overlays local subtitles on streaming pages and keeps a local
subtitle library.

## Root Files

### `README.md`

User-facing guide for installing and using the extension.

### `structure.md`

This file. It explains what each file and folder is for.

## `extension/`

Chrome/Edge extension source.

### `extension/manifest.json`

Extension manifest.

Important parts:

- Uses Manifest V3.
- Adds the `storage` permission for saved subtitle library data.
- Injects `content.js` and `content.css` into all pages and frames.
- Uses `all_frames` so it can detect videos inside iframe players.
- Defines an extension toolbar action backed by `background.js`.

### `extension/background.js`

Small service worker for the extension toolbar icon. When you click the icon, it
sends a toggle message to the active tab so the subtitle UI appears or hides on
demand.

### `extension/content.js`

Main extension logic.

Main responsibilities:

- Inject the subtitle control panel into the top page.
- Keep the UI hidden until the extension icon is clicked.
- Detect HTML5 videos in the page or iframe players.
- Bridge video status from iframe players back to the panel.
- Sync subtitles with the real video time.
- Show the floating current subtitle at the bottom center of the page.
- Keep subtitles visible during supported fullscreen modes.
- Provide controls for play/pause, repeat, loop, timeline seek, fullscreen,
  offset adjustment, and subtitle library.
- Save imported subtitles into extension storage.
- Suggest saved subtitles by comparing page title/URL with subtitle filenames.

### `extension/content.css`

Styles for the extension UI.

Main areas:

- Side subtitle panel.
- Compact toolbar buttons.
- Offset controls.
- Subtitle library list.
- Transcript list and active subtitle highlight.
- Floating bottom-center subtitle overlay.
- Mobile layout adjustments.

## Typical Workflow

1. Load `extension/` as an unpacked extension.
2. Open a movie page.
3. Click the extension icon to show the panel.
4. Press `CC` to import subtitle files.
5. Use the panel controls or hide the panel and read the floating subtitle.
6. Use `Lib` later to load saved subtitles.
