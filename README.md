# Movie English Study

Chrome/Edge extension for learning English while watching movies online. It
shows your local English subtitles in sync with the video, adds a floating
current subtitle at the bottom center of the page, and keeps a small local
subtitle library.

No files are uploaded. The extension reads only the video time from the page and
the subtitle files you select.

To install it in Chrome or Edge:

1. Open `chrome://extensions`.
2. Turn on `Developer mode`.
3. Choose `Load unpacked`.
4. Select the `extension` folder.
5. Open the video page.
6. Click the extension icon to show or hide the subtitle panel.
7. Load your local `.srt` or `.vtt` file from the panel.

## Features

- Floating current subtitle at the bottom center of the page.
- Side panel with transcript, current line highlight, and click-to-seek.
- Click the extension icon to show/hide the UI only when needed.
- Play/pause, repeat line, loop line, fullscreen toggle, and timeline seek.
- Quick subtitle timing controls with `Sub -`, `Sub +`, and reset.
- Local subtitle library via `CC` import and `Lib` management.
- Subtitle suggestions based on page title/URL and saved subtitle filenames.

If the video is inside an iframe, the extension also runs a small bridge inside
frames so the panel can follow the real video time and seek the player when you
click the timeline or a subtitle line.

### Local subtitle suggestions

The `CC` button can import one or more `.srt` / `.vtt` files. Imported subtitles
are saved in Chrome/Edge extension storage. When you open a movie page later,
the extension compares the page title/URL with your saved subtitle filenames and
shows a `Suggested` row when it finds a likely match.

Use the `Lib` button in the panel to open your saved subtitle library. From
there you can load a saved subtitle with `Use`, remove one with `Del`, or clear
the whole library.

This suggestion system uses only subtitles you imported yourself. It does not
search the internet or download subtitle files.
