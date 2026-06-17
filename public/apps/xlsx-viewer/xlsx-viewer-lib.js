/**
 * XlsxViewerLib — xlsx-viewer 前端核心 library（可嵌入式、純邏輯、不碰 DOM）
 *
 * 把「query string 解析」「路徑安全檢查 / 逐段編碼」「與伺服器溝通」
 * 以及 **試算表 → HTML 表格字串** 的轉換抽成一支 library；
 * index.html / xlsx-viewer.js 只負責 DOM（把字串塞進畫面、接 Materialize tabs、事件、toast）。
 *
 * 設計重點：
 *   - 解析用 SheetJS（全域 `XLSX`，純資料、零 DOM）。「把工作表組成 HTML 表格」是純字串運算，
 *     因此放在 lib（不像 docx-preview 會直接寫 DOM）。lib 依賴全域 `XLSX` 但不碰 document。
 *   - 開檔來源有二：①側欄清單（上傳進來的檔）②網址深連結 ?xlsx=<路徑>。
 *     深連結沿用原型的穩健解析：避開 URLSearchParams 把 '+' 變空白。
 *
 * 後端對應：
 *   - 上傳： POST /api/upload?folder=xlsx-viewer   （form 欄位 myFiles，多檔）
 *   - 列表： GET  /api/xlsx-viewer/files
 *   - 清空： POST /api/xlsx-viewer/clear
 *   - 靜態讀檔： /upload/xlsx-viewer/<name>
 *
 * 依賴：SheetJS（全域 `XLSX`）+ 原生 fetch / URL / location。建議與 jQuery / Materialize / Lodash 並存。
 *
 * Public API：
 *   XlsxViewerLib.FOLDER                    → 'xlsx-viewer'
 *   XlsxViewerLib.ALLOWED_ABSOLUTE_PREFIXES → string[]
 *   XlsxViewerLib.escapeHtml(s)             → string
 *   XlsxViewerLib.parseQuery(search)        → { xlsx?:string, ... }  穩健解析 ?xlsx=
 *   XlsxViewerLib.isSafeLink(link)          → boolean
 *   XlsxViewerLib.isUploadable(name)        → boolean   .xlsx / .xlsm / .xls / .csv
 *   XlsxViewerLib.basename(link)            → string
 *   XlsxViewerLib.encodePath(link)          → string    逐段 encodeURIComponent，保留 '/'
 *   XlsxViewerLib.fileUrl(name)             → string    /upload/xlsx-viewer/<name>（原始、未編碼）
 *   XlsxViewerLib.fetchArrayBuffer(link)    → Promise<ArrayBuffer>
 *   XlsxViewerLib.readWorkbook(buf)         → workbook  XLSX.read 包裝
 *   XlsxViewerLib.sheetNames(wb)            → string[]
 *   XlsxViewerLib.colLetter(n)              → 'A' | 'B' | ... （0-based）
 *   XlsxViewerLib.buildSheetTable(ws)       → string    一張工作表的 <table> HTML
 *   XlsxViewerLib.uploadFile(file)          → Promise<resp>
 *   XlsxViewerLib.listFiles()               → Promise<Array<{name,size,mtime}>>
 *   XlsxViewerLib.clearFolder()             → Promise<{ok,removed}>
 *   XlsxViewerLib.timestamp(date)           → 'yyyyMMddHHmmss'
 *   XlsxViewerLib.formatSize(bytes)         → 'xx KB'
 */
(function (window) {
  'use strict';

  var FOLDER = 'xlsx-viewer';
  var UPLOAD_API = '/api/upload?folder=' + FOLDER;
  var FILES_API = '/api/xlsx-viewer/files';
  var CLEAR_API = '/api/xlsx-viewer/clear';
  var STATIC_BASE = '/upload/' + FOLDER + '/';

  var ALLOWED_ABSOLUTE_PREFIXES = [
    STATIC_BASE   // '/upload/xlsx-viewer/' — 上傳進來的檔
  ];

  // 可上傳 / 可檢視的副檔名（SheetJS 皆能讀）
  var UPLOADABLE_RE = /\.(xlsx|xlsm|xls|csv)$/i;

  function pad2(n) { return ('0' + n).slice(-2); }

  function bust(url) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 穩健解析 query string（取代 URLSearchParams：它會把 '+' 變空白，檔名含 '+' 時會壞）。
  function parseQuery(search) {
    var out = {};
    var s = String(search || '');
    if (s.charAt(0) === '?') s = s.slice(1);
    if (!s) return out;
    s.split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      var k = i === -1 ? pair : pair.slice(0, i);
      var val = i === -1 ? '' : pair.slice(i + 1);
      try { out[decodeURIComponent(k)] = decodeURIComponent(val); }
      catch (e) { out[k] = val; }
    });
    return out;
  }

  // 路徑安全：擋穿越（..）、反斜線、任意 scheme、protocol-relative（//）；
  // 絕對路徑須命中允許清單，相對路徑（相對 viewer 目錄）一律放行。
  function isSafeLink(link) {
    if (!link || typeof link !== 'string') return false;
    if (link.indexOf('..') !== -1) return false;
    if (link.charAt(0) === '\\') return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(link)) return false;
    if (link.indexOf('//') === 0) return false;
    if (link.charAt(0) === '/') {
      return ALLOWED_ABSOLUTE_PREFIXES.some(function (p) { return link.indexOf(p) === 0; });
    }
    return true;
  }

  function isUploadable(name) {
    return UPLOADABLE_RE.test(String(name || ''));
  }

  function basename(link) {
    var seg = String(link || '').split('?')[0].split('/').pop();
    try { seg = decodeURIComponent(seg); } catch (e) {}
    return seg || String(link || '');
  }

  // 逐段 encodeURIComponent，保留 '/'——只對「原始（解碼後）」路徑用。
  function encodePath(link) {
    return String(link || '').split('/').map(encodeURIComponent).join('/');
  }

  function fileUrl(name) {
    return STATIC_BASE + name;
  }

  /* ---------- 試算表 → HTML（純字串運算，依賴全域 XLSX） ---------- */

  function xlsx() {
    var X = window.XLSX;
    if (!X) throw new Error('SheetJS (XLSX) not loaded');
    return X;
  }

  // 0-based 欄索引 → 'A' / 'B' / ... / 'AA' …
  function colLetter(n) {
    var s = '';
    n = n + 1;
    while (n > 0) {
      var m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  // SheetJS cell → { text, cls }。優先用格式化字串 w，再退到原始 v；附型別 class。
  function renderCell(cell) {
    if (!cell) return { text: '', cls: '' };
    if (cell.w !== undefined && cell.w !== null) {
      var cls = '';
      if (cell.t === 'n') cls = 'cell-num';
      else if (cell.t === 'b') cls = 'cell-bool';
      else if (cell.t === 'd') cls = 'cell-date';
      else if (cell.t === 'e') cls = 'cell-error';
      return { text: String(cell.w), cls: cls };
    }
    if (cell.v === undefined || cell.v === null) return { text: '', cls: '' };
    if (cell.t === 'b') return { text: cell.v ? 'TRUE' : 'FALSE', cls: 'cell-bool' };
    if (cell.t === 'n') return { text: String(cell.v), cls: 'cell-num' };
    if (cell.t === 'd') return { text: new Date(cell.v).toLocaleString(), cls: 'cell-date' };
    if (cell.t === 'e') return { text: String(cell.v), cls: 'cell-error' };
    return { text: String(cell.v), cls: '' };
  }

  // 把一張工作表組成 <table> HTML 字串（含欄/列頭、合併儲存格、欄寬、型別著色）。
  function buildSheetTable(ws) {
    var X = xlsx();
    var ref = ws && ws['!ref'];
    if (!ref) return '<div class="sheet-empty"></div>';

    var range = X.utils.decode_range(ref);
    var merges = ws['!merges'] || [];
    var cols = ws['!cols'] || [];

    // 標記被合併覆蓋（origin 以外）的儲存格
    var skip = {};
    var span = {};
    merges.forEach(function (m) {
      span[m.s.r + ',' + m.s.c] = { rs: m.e.r - m.s.r + 1, cs: m.e.c - m.s.c + 1 };
      for (var r = m.s.r; r <= m.e.r; r++) {
        for (var c = m.s.c; c <= m.e.c; c++) {
          if (r === m.s.r && c === m.s.c) continue;
          skip[r + ',' + c] = true;
        }
      }
    });

    var html = '<table class="xlsx-table"><thead><tr><th class="corner"></th>';
    for (var hc = range.s.c; hc <= range.e.c; hc++) {
      var w = (cols[hc] && cols[hc].wpx) ? ' style="min-width:' + Math.max(40, cols[hc].wpx) + 'px"' : '';
      html += '<th' + w + '>' + colLetter(hc) + '</th>';
    }
    html += '</tr></thead><tbody>';

    for (var r2 = range.s.r; r2 <= range.e.r; r2++) {
      html += '<tr><th class="row-head">' + (r2 + 1) + '</th>';
      for (var c2 = range.s.c; c2 <= range.e.c; c2++) {
        if (skip[r2 + ',' + c2]) continue;
        var cell = ws[X.utils.encode_cell({ r: r2, c: c2 })];
        var rc = renderCell(cell);
        var sp = span[r2 + ',' + c2];
        var attrs = '';
        if (rc.cls) attrs += ' class="' + rc.cls + '"';
        if (sp) {
          if (sp.rs > 1) attrs += ' rowspan="' + sp.rs + '"';
          if (sp.cs > 1) attrs += ' colspan="' + sp.cs + '"';
        }
        html += '<td' + attrs + '>' + escapeHtml(rc.text) + '</td>';
      }
      html += '</tr>';
    }
    return html + '</tbody></table>';
  }

  var XlsxViewerLib = {

    FOLDER: FOLDER,
    ALLOWED_ABSOLUTE_PREFIXES: ALLOWED_ABSOLUTE_PREFIXES,

    escapeHtml: escapeHtml,
    parseQuery: parseQuery,
    isSafeLink: isSafeLink,
    isUploadable: isUploadable,
    basename: basename,
    encodePath: encodePath,
    fileUrl: fileUrl,

    colLetter: colLetter,
    buildSheetTable: buildSheetTable,

    /** 讀取連結的二進位內容（ArrayBuffer）供 XLSX.read */
    fetchArrayBuffer: function (link) {
      return fetch(bust(encodePath(link)), { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.arrayBuffer();
        });
    },

    /** 解析成 workbook（cellDates：日期成 Date；cellNF：保留數值格式 → cell.w） */
    readWorkbook: function (buf) {
      return xlsx().read(buf, { type: 'array', cellDates: true, cellNF: true, cellStyles: false });
    },

    sheetNames: function (wb) {
      return (wb && wb.SheetNames) || [];
    },

    /** 上傳單一檔案到 /upload/xlsx-viewer（同名覆寫）。回傳伺服器 JSON；失敗 reject。 */
    uploadFile: function (file) {
      var fd = new FormData();
      fd.append('myFiles', file);
      return fetch(UPLOAD_API, { method: 'POST', body: fd })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (resp) {
          if (!resp || !resp.ok) throw new Error((resp && resp.error) || '上傳失敗');
          return resp;
        });
    },

    /** 列出資料夾內檔案（依修改時間新→舊） */
    listFiles: function () {
      return fetch(bust(FILES_API), { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('列表載入失敗 (' + r.status + ')');
          return r.json();
        })
        .then(function (d) { return (d && d.files) || []; });
    },

    /** 清空資料夾下所有可見檔案 */
    clearFolder: function () {
      return fetch(CLEAR_API, { method: 'POST' })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (d) {
          if (!d || !d.ok) throw new Error((d && d.error) || '清空失敗');
          return d;
        });
    },

    /** 本地時間 yyyyMMddHHmmss */
    timestamp: function (date) {
      var d = date || new Date();
      return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
        pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
    },

    /** 人類可讀的檔案大小 */
    formatSize: function (bytes) {
      bytes = Number(bytes) || 0;
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }
  };

  window.XlsxViewerLib = XlsxViewerLib;
})(window);
