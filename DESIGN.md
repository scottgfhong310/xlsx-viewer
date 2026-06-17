# xlsx-viewer — 設計文件

> 開發者面向的設計與實作參考。使用說明見 [README](./README.md)；快速定位 / canon 重點見 [CLAUDE.md](./CLAUDE.md)；
> 家族共同規範見 [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family)（`DESIGN_GUIDELINES.md` / `WORKFLOW.md` / `PLAYBOOK.md`）。
> 本 app 屬「**viewer 類**」家族成員，與 `html-/docx-/pptx-viewer` 共用同一套骨架（見 §6 與家族 §4.7）。

---

## 1. 定位與目標

在瀏覽器內**檢視試算表（`.xlsx` / `.xlsm` / `.xls` / `.csv`）**：以 SheetJS 解析，把每張工作表渲染成 HTML 表格，呈現多工作表分頁、合併儲存格、欄寬、型別著色。
零打包、CDN-first；薄後端；核心抽成可嵌入 lib。**本支最能體現「可嵌入 lib」理想**——連「表格組字串」都在 lib（見 §5、§6）。

## 2. 架構與資料流

```
使用者
  │  拖拉 / 點選 / ?xlsx=<路徑> / 側欄點擊
  ▼
xlsx-viewer.js（控制器，碰 DOM）
  │  loadAndShow(link)
  ├─ XlsxViewerLib.isSafeLink(link)            // 路徑安全（純）
  ├─ XlsxViewerLib.fetchArrayBuffer(link)      // GET → ArrayBuffer
  ├─ XlsxViewerLib.readWorkbook(buf)           // XLSX.read → workbook（純資料）
  ├─ XlsxViewerLib.buildSheetTable(ws) → HTML  // ★ 純字串運算，在 lib
  ▼
控制器把字串塞進 #xv-container + 接 Materialize tabs（多工作表）
```

- **依賴載入順序**：jQuery → Materialize → Lodash → `xlsx.full.min.js`（SheetJS）→ `xlsx-viewer-lib.js` → `i18n.js` → `locales/*` → `xlsx-viewer.js`。
- lib 依賴全域 `XLSX`，但**只在函式內引用、不碰 `document`**（載入順序只要 XLSX 在呼叫前就緒即可）。

## 3. 後端（Express）

與家族一致：`app.js`（static + `/api/upload` + `/api/xlsx-viewer`、`/`→302、JSON 404、`PORT||3000`）、`routes/upload.js`（共用最小版）、`routes/xlsx-viewer.js`（`/files`、`/clear`）。

| Method / Path | 說明 | 回應 |
|---|---|---|
| `POST /api/upload?folder=xlsx-viewer` | 上傳（多檔、覆寫）| `{ ok, ... }` |
| `GET /api/xlsx-viewer/files` | 列出 `public/upload/xlsx-viewer/` | `{ ok, files:[{name,size,mtime}] }` |
| `POST /api/xlsx-viewer/clear` | 清空該資料夾 | `{ ok, removed }` |

**安全**：操作目標寫死為 `public/upload/xlsx-viewer`，不收外部路徑。

## 4. 前端四件式

### 4.1 `index.html`（純結構）
- 防閃爍開機腳本（`localStorage('xlsx-viewer-theme')||'dark'`）。
- 結構：側欄、空狀態、`#xv-doc`（toolbar：icon + 檔名；`#xv-tabs-wrap > #xv-tabs`：工作表分頁；`#xv-container`：表格面板）、loading、drop-overlay、`#file-picker`（accept `.xlsx,.xlsm,.xls,.csv`）、side-tools。

### 4.2 `xlsx-viewer.css`（主題 token + 樣式）
- 家族標準 token + `--mz-*` 映射。
- **表格 token**：`--tbl-bg / --tbl-cell-fg / --tbl-border / --tbl-head-bg / --tbl-head-fg / --tbl-zebra / --tbl-hover` + 型別色 `--cell-bool / --cell-date / --cell-error`，兩主題各一份——**深色主題下表格也轉深**。
- sticky 欄頭（`thead th`）/ 列頭（`th.row-head`，橫向捲動時 `left:0` 固定；corner 兩軸固定）；斑馬紋；型別 class（`.cell-num` 右對齊 tabular-nums…）。
- **表格寬度**：`table.xlsx-table { width: max-content; min-width: 100% }`——依內容自然寬度排，**欄多到超過視窗時整表變寬、`.sheet-panel` 橫向捲動**（而非把欄壓扁）；欄少時 `min-width:100%` 仍填滿面板。單格 `max-width:480px` + `pre-wrap`/`word-break` 讓長內容換行不撐爆。
- **全視窗版面**：`#xv-doc` 是撐滿 `100vh` 的 flex 欄（`.xv-toolbar` / `#xv-tabs-wrap` `flex:0 0 auto`、`#xv-container` `flex:1; min-height:0`），表格 edge-to-edge、**單一捲動區在 `.sheet-panel`**（`height:100%; overflow:auto`，表頭/列頭在面板內 sticky）；`.app-container` 滿版（無 max-width 卡片框）；`body:not(.is-empty){overflow:hidden}` 避免頁面 + 面板雙捲軸；空狀態仍置中（`.empty-state{max-width:720px;margin:0 auto}`）。
- `@media print`：解除全視窗鎖定（`#xv-doc` height auto、`body`/`#xv-container` overflow visible）、白底黑字、所有 sheet 展開。

### 4.3 `xlsx-viewer-lib.js`（核心 library，`window.XlsxViewerLib`，純邏輯、不碰 DOM）
除了家族共通的 `parseQuery` / `isSafeLink` / `isUploadable`（`/\.(xlsx|xlsm|xls|csv)$/i`）/ `encodePath` / `fileUrl` / `listFiles` / `uploadFile` / `clearFolder` / `basename` / `formatSize` / `timestamp`，本支額外把**解析與表格產生**也放進 lib：

| 成員 | 說明 |
|---|---|
| `fetchArrayBuffer(link)` | `encodePath` + cache-bust → `GET` → `ArrayBuffer`（供 `XLSX.read`）|
| `readWorkbook(buf)` | `XLSX.read(buf,{type:'array', cellDates:true, cellNF:true, cellStyles:false})` → workbook |
| `sheetNames(wb)` | `wb.SheetNames` |
| `colLetter(n)` | 0-based 欄索引 → `A`/`B`/…/`AA` |
| `buildSheetTable(ws)` | **一張工作表 → `<table>` HTML 字串**：欄/列頭、合併儲存格（`!merges`→rowspan/colspan + skip）、欄寬（`!cols`）、型別著色（優先用格式化字串 `cell.w`，退到 `cell.v`）、`escapeHtml` 內容 |

### 4.4 `xlsx-viewer.js`（控制器，碰 DOM）
- `renderWorkbook(wb)`：每張 sheet → `<li class="tab">` + `.sheet-panel`（內含 `L.buildSheetTable`）；**多工作表**才顯示 tab bar（手動切換 `.active` + `M.Tabs.init` 顯示 indicator），**單一工作表隱藏 tab bar**。
- `applyTheme/toggleTheme`：切 `data-theme`，**不重建表格**（表格由 CSS 著色）。
- **工具列開關**：右上角**無外框** icon `#tools-toggle`（`more_vert`）切換 `body.tools-hidden`（隱藏整排 `.side-tools`），狀態存 `localStorage('xlsx-viewer-tools')`、預設顯示；toggle 本身恆顯示可再開啟，側欄開啟時連同 toggle 淡出。**本 app 特有**——樣式只在 `xlsx-viewer.css`，**不動共用 `side-tool.css`**。
- 其餘同家族：清單 / 上傳 / 清空 / 拖拉 / i18n / `?xlsx=` 深連結 / `#setting-download` 下載側鍵（§4.7）。

## 5. 關鍵設計決策（與理由 / 替代方案）

1. **解析引擎：SheetJS。** 零打包、純資料、副檔名覆蓋廣（xlsx/xlsm/xls/csv 一把抓）。原型已採用。
2. **「表格組字串」進 lib（與 docx/pptx 不同）。** SheetJS 解析出的是**純資料物件**，「工作表 → HTML 字串」是純字串運算 → 依家族 §4.7 應放 lib（`buildSheetTable`）。控制器只負責塞 DOM + 接 tabs。這是本支與 docx-preview/PPTXjs（引擎寫 DOM、渲染留控制器）的關鍵差異。
3. **表格跟主題（深色表格）。** 以 `--tbl-*` 兩主題供色；型別色、斑馬紋、邊框都有深色變體。
4. **白名單 xlsx/xlsm/xls/csv。** SheetJS 本就能讀，多收成本低（一條 regex），更實用；app 名與 folder 維持 `xlsx-viewer`。
5. **多工作表 UI：Materialize tabs。** 單一工作表時隱藏 tab bar（避免單顆 fixed-width tab 佔滿一列的突兀）。
6. **下載走側鍵**（家族 §4.7）。
7. **全視窗版面（非置中卡片）。** 試算表常欄多、列長，置中 `max-width` 卡片浪費橫向空間且雙捲軸卡頓 → 改 edge-to-edge 滿版：`#xv-doc` 撐滿 `100vh`、toolbar/tabs 固定、表格面板填滿下方並**單一內部捲動**（表頭/列頭 sticky）。空狀態維持置中卡片感。控制器 `showDoc` 顯示時設 `display:flex`（非 `block`）。
8. **工具列開關（本 app 特有）。** 全視窗下浮動側鍵會疊在表格上 → 右上角加一顆**無外框** icon（`more_vert`）切換 `.side-tools` 顯示、狀態持久化。樣式只在 `xlsx-viewer.css`、**不動共用 `side-tool.css`**（避免家族資產分歧）；其他 viewer 若要比照再各自加。

## 6. lib / 控制器邊界（家族 §4.7）

xlsx-viewer 落在「**引擎回純資料**」這側——是三支「引擎類」viewer 中**唯一連渲染（組表格）都進 lib**的。對照：`docx-viewer`/`pptx-viewer` 的引擎直接寫 DOM，渲染只能留控制器。

## 7. 主題 / i18n / 安全

- **主題**：CSS 變數 light/dark，預設 dark；防閃爍；Materialize 深色交給共用 `materialize-dark.css`。
- **i18n**：引擎 + locales×3，預設 `zh-Hant`；**儲存格內容是 data，永不翻譯**。
- **安全**：上傳白名單（picker + `isUploadable`）；`isSafeLink`；前端輸出一律 `escapeHtml`／`_.escape`（表格內容、檔名）；後端操作目標寫死、`{ok}` 信封、5mb 上限、`confirm`。

## 8. 已知限制與取捨

- **呈現範圍**：值 + 基本結構（合併、欄寬、數值格式 `cell.w`）；**不含**完整儲存格樣式（工作簿的字型 / 填色 / 框線 / 條件式格式）。需要像素級格式請用試算表軟體。
- **公式**：顯示計算後的值（`cell.w`/`cell.v`），不重算公式。
- **超大表**：全量渲染為 HTML 表格，極大工作表可能較慢。

## 9. 參考

- 家族規範：`DESIGN_GUIDELINES.md`（§4.1 拆分、§4.7 viewer 引擎與 lib 邊界、§5 視覺、§6 i18n、§8 安全）。
- 流程：`WORKFLOW.md`、`PLAYBOOK.md`。
- 上游：[SheetJS](https://sheetjs.com/)。
