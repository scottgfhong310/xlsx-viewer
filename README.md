# xlsx-viewer

**English** · [中文](README.zh-Hant.md) · [日本語](README.ja.md)

A single-page web app to **view spreadsheets (`.xlsx` / `.xlsm` / `.xls` / `.csv`) in the browser**. It parses with [SheetJS](https://sheetjs.com/) and renders each worksheet as an HTML table — **multi-sheet tabs, merged cells, column widths, and type-aware cell formatting** (numbers right-aligned, booleans / dates / errors color-coded). Backed by a lightweight Express server for upload / list / clear.

- 📊 **Faithful tables** — column (A/B/C) & row (1/2/3) headers with sticky scroll, merged cells (rowspan/colspan), column widths, and SheetJS formatted values (`cell.w`)
- 🗂️ **Multi-sheet** — one Materialize tab per worksheet (hidden when a workbook has a single sheet)
- 📥 **Drag & drop upload** — drop a spreadsheet anywhere on the page; **same name overwrites**
- 🔗 **Deep links** — open any file with `?xlsx=<path>` (relative to the viewer, or an allow-listed absolute path); shareable & back/forward aware. Robust query parsing keeps `+` from turning into spaces
- 🌗 **Light / Dark** toggle (saved in localStorage) — the **shell and the table both follow the theme** (dark mode darkens the grid too); printing is always white background / black text, all sheets expanded
- 🌐 **Multilingual UI** — 繁體中文 / English / 日本語 (default 繁體中文, saved in localStorage). Cell data is data and is **never translated**
- 🛡️ **Path safety** — blocks `..`, backslashes, `javascript:` / `file:` schemes, protocol-relative `//`, and non-allow-listed absolute paths
- 🗂️ File-list sidebar, download the original file, empty folder

> Third-party front-end libraries (jQuery, Materialize, Lodash, Material Icons, SheetJS) load from CDN — no bundling or build step. `npm install` only pulls the backend dependencies.

## Quick start

Requires Node.js 18+.

```bash
npm install
npm start
# open http://localhost:3000/apps/xlsx-viewer/
```

Set `PORT` to change the port: `PORT=8080 npm start`.

## Directory structure

```
xlsx-viewer/
├── app.js                          # Standalone Express server (static + 2 APIs)
├── package.json
├── routes/
│   ├── upload.js                   # POST /api/upload?folder=xlsx-viewer (multer, multi-file, overwrite)
│   └── xlsx-viewer.js              # GET /files, POST /clear
└── public/
    ├── apps/xlsx-viewer/           # Front end (served at /apps/xlsx-viewer/)
    │   ├── index.html              # Structure only
    │   ├── xlsx-viewer.css         # Theme tokens (incl. table tokens) + page styles
    │   ├── xlsx-viewer.js          # Controller (glue): theme / i18n / upload / tabs
    │   ├── xlsx-viewer-lib.js      # XlsxViewerLib: query parse / path safety / server I/O / sheet→HTML (pure, no DOM)
    │   ├── materialize-dark.css    # Shared family asset (Materialize dark)
    │   ├── side-tool.css           # Right-side floating toolbar
    │   ├── thinking-dot.css        # Shared loading-dot utility
    │   ├── i18n.js                 # i18n engine
    │   └── locales/{zh-Hant,en,ja}.js
    └── upload/xlsx-viewer/         # Uploaded spreadsheets (contents are git-ignored; one sample shipped)
```

## API

| Method / Path | Description |
|---|---|
| `POST /api/upload?folder=xlsx-viewer` | Upload (form field `myFiles`, multi-file; keeps the original name when `folder` is set → overwrites) |
| `GET /api/xlsx-viewer/files` | List visible files in `public/upload/xlsx-viewer/` (newest first) |
| `POST /api/xlsx-viewer/clear` | Delete all visible files in that folder (keeps the folder & hidden files) |

Static read: `/upload/xlsx-viewer/<name>`. All API responses use the `{ ok }` envelope.

`GET /api/xlsx-viewer/files` returns:

```jsonc
{
  "ok": true,
  "files": [
    { "name": "string", "size": 0, "mtime": 0 }   // mtime = epoch ms; sorted newest → oldest
  ]
}
```

## Core library (`XlsxViewerLib`)

Pure logic, no DOM — embeddable on its own. Because SheetJS produces a plain data object and building the HTML table is a pure string operation, the table renderer lives **in the library** (unlike viewers whose engine writes the DOM directly). It depends on the global `XLSX` but never touches `document`.

```jsonc
// XlsxViewerLib.readWorkbook(arrayBuffer) → workbook        (XLSX.read wrapper)
// XlsxViewerLib.sheetNames(workbook)      → string[]
// XlsxViewerLib.buildSheetTable(worksheet)→ string          (a sheet's <table> HTML)
```

Other helpers: `parseQuery` (robust `?xlsx=`), `isSafeLink`, `isUploadable` (`.xlsx`/`.xlsm`/`.xls`/`.csv`), `basename`, `encodePath`, `fileUrl`, `colLetter`, `fetchArrayBuffer`, `listFiles`, `uploadFile`, `clearFolder`, `formatSize`, `timestamp`.

## Notes

- The front end calls APIs with **absolute paths** (`/api/...`, `/upload/...`), so it must be served from the **site root** by this project's Node server. **Not GitHub-Pages-compatible** (static hosting can't run the upload / list / clear APIs).
- Rendering reflects values and basic structure (merged cells, column widths, number formats), **not** full cell styling (fonts, fills, borders from the workbook). For pixel-exact formatting, open the file in a spreadsheet app.
- This app belongs to the **nodeapp WebApp family**; shared conventions live in [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family).

## License

[MIT](./LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
