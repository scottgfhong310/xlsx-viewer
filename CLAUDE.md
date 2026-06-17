# xlsx-viewer — Session context

在瀏覽器內**檢視試算表（`.xlsx`/`.xlsm`/`.xls`/`.csv`）**的單頁 WebApp：用 **SheetJS** 解析，把每張工作表渲染成 HTML 表格——多工作表分頁、合併儲存格、欄寬、型別著色。輕量 Express 後端（上傳 / 列表 / 清空）。由 `docx-viewer` 起手式複製改名而來（Path A，docx-viewer ← html-viewer ← markdown-reader），共用家族 canon（主題 / i18n / 四件式 / side-tool）。

本 app 屬於 **nodeapp WebApp 家族**；共同規範與流程在
<https://github.com/scottgfhong310/nodeapp-webapp-family>（`DESIGN_GUIDELINES.md` 規範、`WORKFLOW.md` 流程、`PLAYBOOK.md` 逐步劇本）。**改動前請先讀那幾份，照其中 canon 做。**

**設計細節（架構 / 逐模組 / 決策 / 限制）見 [DESIGN.md](./DESIGN.md)。**

## 結構

```
app.js                              # Express 入口：port 3000；/ → 302 /apps/xlsx-viewer/
routes/upload.js                    # POST /api/upload?folder=xlsx-viewer（共用最小版）
routes/xlsx-viewer.js               # GET /files、POST /clear
public/apps/xlsx-viewer/            # 前端（服務於 /apps/xlsx-viewer/）
├─ index.html · xlsx-viewer.css · xlsx-viewer.js · xlsx-viewer-lib.js
├─ materialize-dark.css             # 家族共用（Materialize 深色；materialize.css 之後載入）
├─ side-tool.css                    # 〔正統〕flex .side-tools 版（§5.5）
├─ thinking-dot.css                 # 共用載入點 utility（與 markdown-library 同步、本份消費）
├─ i18n.js · locales/{zh-Hant,en,ja}.js
public/upload/xlsx-viewer/          # 上傳的試算表（內容不進版控；附一個 .xlsx sample）
```

## 執行 / 驗證

```bash
npm install && node app.js          # → http://localhost:3000/apps/xlsx-viewer/
```

## 本 app 的 canon 重點

- **解析引擎是 SheetJS**：CDN 載入 `xlsx@0.18.5`（`xlsx.full.min.js`），`XLSX.read(buf, {type:'array', cellDates:true, cellNF:true})` 解析成 workbook。
- **lib 邊界（與 docx 不同！）**：SheetJS 解析出的是**純資料物件**，「組 HTML 表格」是純字串運算，所以 **`buildSheetTable(ws)→string`、`readWorkbook`、`colLetter`、`renderCell` 全進 lib**（docx-preview 會直接寫 DOM 故留控制器；這支不會）。`xlsx-viewer-lib.js`（`window.XlsxViewerLib`）依賴全域 `XLSX` 但**不碰 document**。控制器只把字串塞進 DOM、接 Materialize tabs。
  - `parseQuery(search)`：穩健解析 `?xlsx=`（避開 `URLSearchParams` 把 `+` 變空白）。
  - `isSafeLink()`：擋 `..`、反斜線、scheme、protocol-relative `//`；絕對路徑須命中 `ALLOWED_ABSOLUTE_PREFIXES`（預設 `['/upload/xlsx-viewer/']`）。
  - `encodePath(link)` 逐段編碼；`fileUrl(name)` 回**原始**靜態路徑，fetch / 下載時才 `encodePath`。
  - `fetchArrayBuffer`（給 `XLSX.read`）/ `listFiles` / `uploadFile` / `clearFolder`；`basename` / `formatSize` / `timestamp`。
- **控制器** `xlsx-viewer.js`（碰 DOM）：主題切換、i18n、拖拉 / 上傳、檔案清單、`renderWorkbook(wb)`（多 sheet → Materialize tabs + `.sheet-panel`，**單一工作表隱藏 tab bar**；手動切換 `.active` + `M.Tabs.init` 顯示 indicator）、`?xlsx=` 深連結。切檔時 `clearOutput()` 再渲染。
- **主題（含「表格」）**：CSS 變數 light/dark，**預設 dark**（`localStorage('xlsx-viewer-theme')||'dark'`）；防閃爍開機腳本同時 toggle `dark-mode`/`light-mode` class 驅動 `materialize-dark.css`（§5.1）。表格在 **light DOM**，故由本頁 CSS 著色——`--tbl-*` 一組（bg/cell-fg/border/head/zebra/hover + 型別色 bool/date/error）兩主題各一份，**深色時表格也轉深**；切主題只翻 `data-theme`、**不必重建表格**。列印 `@media print` 一律白底黑字、所有 sheet 展開。
- **全視窗版面**：`#xv-doc` 是撐滿 `100vh` 的 flex 欄（toolbar/tabs 固定、`#xv-container` `flex:1`），表格 edge-to-edge、**單一捲動區在 `.sheet-panel`**（`height:100%; overflow:auto`，表頭/列頭面板內 sticky）；`.app-container` 滿版（無 max-width 卡片框）；`body:not(.is-empty){overflow:hidden}` 避免雙捲軸；控制器 `showDoc` 顯示時設 `display:flex`（非 block）。空狀態仍置中（`.empty-state{max-width:720px;margin:0 auto}`）。
- **i18n**：`i18n.js` + `locales/*.js`，`data-i18n`，預設 `zh-Hant`。儲存格內容是 **data，永不翻譯**。
- **side-tool**：`#setting-menu`（檔案清單）/ `#setting-mode` / `#setting-lang` / `#setting-download`（下載原始檔，只在開檔時顯示、臨時 `<a download>` + check 回饋、href 經 `encodePath`）/ `#setting-clear`（清空，hover 轉紅）；〔正統〕flex `.side-tools`。**下載走側鍵、toolbar 不放操作鍵**（家族 §4.7）。
- **工具列開關（本 app 特有）**：右上角**無外框** icon `#tools-toggle`（`more_vert`，垂直對齊 toolbar 檔名列）→ `body.tools-hidden` 隱藏 `.side-tools`，存 `localStorage('xlsx-viewer-tools')`、預設顯示；toggle 恆在可再開、側欄開啟時淡出。樣式只在 `xlsx-viewer.css`，**不動共用 `side-tool.css`**。
- **欄多橫向捲動**：`table.xlsx-table { width:max-content; min-width:100% }`——欄超過視窗時整表變寬、`.sheet-panel` 橫向捲動（欄不壓扁），列頭/corner `sticky` 在橫捲時固定；欄少時仍填滿面板。
- **安全**：上傳白名單 `.xlsx`/`.xlsm`/`.xls`/`.csv`（picker accept + 前端 `isUploadable` 再驗）；後端操作目標寫死、`{ ok }` 信封；危險操作 `confirm()`。jQuery 3.7.1，後端不依賴 lodash。
- **呈現範圍**：值 + 基本結構（合併、欄寬、數值格式 `cell.w`）；**不含**完整儲存格樣式（字型 / 填色 / 框線）。
- **InProgress 鏡像**：同名前端回灌到 `InProgress/public/apps/xlsx-viewer/`，route 掛在 InProgress 的 `/api/xlsx-viewer`；上傳沿用 InProgress 共用 `/api/upload?folder=xlsx-viewer`（雙鍵 `{ ok, success }`，前端查 `resp.ok`）。
- **preview**：`GitHub/.claude/launch.json` 有一筆 `xlsx-viewer`（`node xlsx-viewer/app.js`，port 3000）。
