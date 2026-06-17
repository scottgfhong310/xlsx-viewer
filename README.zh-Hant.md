# xlsx-viewer

[English](README.md) · **中文** · [日本語](README.ja.md)

在瀏覽器內**檢視試算表（`.xlsx` / `.xlsm` / `.xls` / `.csv`）**的單頁 WebApp。以 [SheetJS](https://sheetjs.com/) 解析，把每張工作表渲染成 HTML 表格——**多工作表分頁、合併儲存格、欄寬、型別著色**（數值右對齊、布林 / 日期 / 錯誤分色）。後端是輕量 Express（上傳 / 列表 / 清空）。

- 📊 **忠實表格** — A/B/C 欄頭與 1/2/3 列頭（捲動時 sticky）、合併儲存格（rowspan/colspan）、欄寬、SheetJS 格式化字串（`cell.w`）
- 🗂️ **多工作表** — 每張表一個 Materialize tab（單一工作表時自動隱藏 tab bar）
- 📥 **拖拉上傳** — 把試算表拖到頁面任意位置；**同名覆寫**
- 🔗 **深連結** — 用 `?xlsx=<路徑>` 開任一檔（相對 viewer 目錄，或允許清單內的絕對路徑）；可分享、支援上一頁／下一頁。穩健的 query 解析避免 `+` 被當成空白
- 🌗 **淺色 / 深色** 切換（存 localStorage）——**外殼與表格都跟著主題**（深色時連表格也轉深）；列印一律白底黑字、所有工作表展開
- 🌐 **三語 UI** — 繁體中文 / English / 日本語（預設繁體中文，存 localStorage）。儲存格內容是 data，**永不翻譯**
- 🛡️ **路徑安全** — 擋 `..`、反斜線、`javascript:` / `file:` 協定、protocol-relative `//`，以及非允許清單的絕對路徑
- 🗂️ 檔案清單側欄、下載原始檔、清空資料夾

> 第三方前端庫（jQuery、Materialize、Lodash、Material Icons、SheetJS）走 CDN——零打包、零 build。`npm install` 只裝後端依賴。

## 快速開始

需要 Node.js 18+。

```bash
npm install
npm start
# 開啟 http://localhost:3000/apps/xlsx-viewer/
```

以 `PORT` 改 port：`PORT=8080 npm start`。

## 目錄結構

```
xlsx-viewer/
├── app.js                          # 獨立 Express 伺服器（static + 兩支 API）
├── package.json
├── routes/
│   ├── upload.js                   # POST /api/upload?folder=xlsx-viewer（multer、多檔、覆寫）
│   └── xlsx-viewer.js              # GET /files、POST /clear
└── public/
    ├── apps/xlsx-viewer/           # 前端（服務於 /apps/xlsx-viewer/）
    │   ├── index.html              # 純結構
    │   ├── xlsx-viewer.css         # 主題 token（含表格 token）+ 本頁樣式
    │   ├── xlsx-viewer.js          # 控制器（膠水）：主題 / i18n / 上傳 / tabs
    │   ├── xlsx-viewer-lib.js      # XlsxViewerLib：query 解析 / 路徑安全 / 伺服器溝通 / 工作表→HTML（純邏輯、不碰 DOM）
    │   ├── materialize-dark.css    # 家族共用資產（Materialize 深色）
    │   ├── side-tool.css           # 右側浮動工具列
    │   ├── thinking-dot.css        # 共用載入點 utility
    │   ├── i18n.js                 # i18n 引擎
    │   └── locales/{zh-Hant,en,ja}.js
    └── upload/xlsx-viewer/         # 上傳的試算表（內容不進版控；附一個 sample）
```

## API

| Method / Path | 說明 |
|---|---|
| `POST /api/upload?folder=xlsx-viewer` | 上傳（form 欄位 `myFiles`、多檔；指定 `folder` 時保留原檔名 → 覆寫）|
| `GET /api/xlsx-viewer/files` | 列出 `public/upload/xlsx-viewer/` 下可見檔（新→舊）|
| `POST /api/xlsx-viewer/clear` | 刪除該資料夾下所有可見檔（保留資料夾與隱藏檔）|

靜態讀檔：`/upload/xlsx-viewer/<name>`。所有 API 一律 `{ ok }` 信封。

`GET /api/xlsx-viewer/files` 回傳：

```jsonc
{
  "ok": true,
  "files": [
    { "name": "string", "size": 0, "mtime": 0 }   // mtime = epoch ms；依新→舊排序
  ]
}
```

## 核心 library（`XlsxViewerLib`）

純邏輯、不碰 DOM，可獨立嵌入。由於 SheetJS 解析出的是純資料物件、「組 HTML 表格」是純字串運算，故表格產生器放在 **library 內**（不像某些 viewer 的引擎會直接寫 DOM）。它依賴全域 `XLSX`，但不碰 `document`。

```jsonc
// XlsxViewerLib.readWorkbook(arrayBuffer) → workbook        （XLSX.read 包裝）
// XlsxViewerLib.sheetNames(workbook)      → string[]
// XlsxViewerLib.buildSheetTable(worksheet)→ string          （一張工作表的 <table> HTML）
```

其他工具：`parseQuery`（穩健解析 `?xlsx=`）、`isSafeLink`、`isUploadable`（`.xlsx`/`.xlsm`/`.xls`/`.csv`）、`basename`、`encodePath`、`fileUrl`、`colLetter`、`fetchArrayBuffer`、`listFiles`、`uploadFile`、`clearFolder`、`formatSize`、`timestamp`。

## 備註

- 前端以**絕對路徑**呼叫 API（`/api/...`、`/upload/...`），須由本專案 Node 伺服器從**站台根**提供。**不相容 GitHub Pages**（純靜態託管跑不了上傳 / 列表 / 清空 API）。
- 渲染呈現的是**值與基本結構**（合併儲存格、欄寬、數值格式），**不含**完整儲存格樣式（工作簿的字型 / 填色 / 框線）。需要像素級格式請以試算表軟體開啟。
- 本 app 屬 **nodeapp WebApp 家族**；共同規範見 [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family)。

## 授權

[MIT](./LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
