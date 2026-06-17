/**
 * xlsx-viewer — 頁面控制器（glue）
 *
 * DOM 行為：主題切換、i18n、開檔（?xlsx= 或側欄清單）、上傳 / 拖拉 / 清空，
 * 把 lib 組好的工作表 HTML 表格塞進畫面、接 Materialize tabs。
 * query 解析、路徑安全 / 編碼、伺服器溝通、**試算表→表格字串** 都在 xlsx-viewer-lib.js；
 * i18n 引擎在 i18n.js，語言字典在 locales/<code>.js。
 *
 * 依賴（皆於 index.html 先載入）：jQuery / Materialize / Lodash / SheetJS(XLSX)
 *   / XlsxViewerLib / I18n（+ locales）。
 *
 * 註：表格是 lib 產出的純 HTML 字串，渲染在 light DOM、受本頁 CSS 影響；深色主題下表格由
 *     xlsx-viewer.css 重新著色，切主題只翻 data-theme、不必重新讀檔 / 重建表格。
 */

(function () {
  'use strict';

  var L = window.XlsxViewerLib;
  var THEME_KEY = 'xlsx-viewer-theme';
  var TOOLS_KEY = 'xlsx-viewer-tools';

  var emptyState = document.getElementById('empty-state');
  var docBox = document.getElementById('xv-doc');
  var tabsWrap = document.getElementById('xv-tabs-wrap');
  var tabs = document.getElementById('xv-tabs');
  var container = document.getElementById('xv-container');
  var docName = document.getElementById('xv-doc-name');
  var downloadBtn = document.getElementById('setting-download');
  var sideNav = document.getElementById('side-nav');
  var dropOverlay = document.getElementById('drop-overlay');
  var filePicker = document.getElementById('file-picker');
  var toolsToggle = document.getElementById('tools-toggle');

  var state = {
    theme: 'dark',
    current: null,   // 目前開啟的連結（原始 / 解碼後）
    name: '',
    files: []
  };

  /* ---------- 主題（light / dark） ---------- */

  function applyTheme(theme) {
    theme = theme === 'light' ? 'light' : 'dark';
    state.theme = theme;
    var r = document.documentElement;
    r.setAttribute('data-theme', theme);
    r.classList.toggle('dark-mode', theme === 'dark');
    r.classList.toggle('light-mode', theme === 'light');
    var icon = document.querySelector('#setting-mode i');
    if (icon) icon.textContent = theme === 'dark' ? 'dark_mode' : 'light_mode';
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }

  function toggleTheme() {
    // 表格著色由 CSS 依 data-theme 切換；不必重建表格。
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  /* ---------- 右側工具列開關（右上角 icon） ---------- */

  function applyToolsVisible(show) {
    document.body.classList.toggle('tools-hidden', !show);
    if (toolsToggle) toolsToggle.classList.toggle('active', show);
    try { localStorage.setItem(TOOLS_KEY, show ? 'on' : 'off'); } catch (e) {}
  }

  function toggleTools() {
    applyToolsVisible(document.body.classList.contains('tools-hidden'));
  }

  /* ---------- 顯示切換 ---------- */

  function showDoc(show) {
    // 全視窗版面：#xv-doc 是撐滿 100vh 的 flex 欄（CSS）；顯示時給明確 'flex'（'' 會落回 CSS 的 none）
    docBox.style.display = show ? 'flex' : 'none';
    emptyState.style.display = show ? 'none' : '';
    document.body.classList.toggle('is-empty', !show);
    // 下載側鍵只在有開檔時出現（.side-tool 預設 flex）
    if (downloadBtn) downloadBtn.style.display = show ? 'flex' : 'none';
  }

  // 「已執行」微回饋：icon 暫時變 check 800ms（家族 §5.5）
  function setIconDone(el) {
    var i = el && el.querySelector('i');
    if (!i) return;
    var orig = i.textContent;
    i.textContent = 'check';
    setTimeout(function () { i.textContent = orig; }, 800);
  }

  // 下載目前開啟的原始檔（逐段編碼 href + 原檔名 download）
  function downloadCurrent() {
    if (!state.current) return;
    var a = document.createElement('a');
    a.href = L.encodePath(state.current);
    a.download = state.name || L.basename(state.current);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setIconDone(downloadBtn);
  }

  function clearOutput() {
    tabs.innerHTML = '';
    container.innerHTML = '';
    tabsWrap.style.display = 'none';
  }

  /* ---------- loading 動畫 ---------- */
  var loadingTimer = null;
  function showLoading() {
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(function () {
      var el = document.getElementById('loading');
      if (el) el.classList.add('show');
    }, 180);
  }
  function hideLoading() {
    clearTimeout(loadingTimer);
    var el = document.getElementById('loading');
    if (el) el.classList.remove('show');
  }

  /* ---------- 渲染 workbook（多工作表 → tabs + 表格） ---------- */

  function renderWorkbook(wb) {
    var names = L.sheetNames(wb);
    var multi = names.length > 1;
    var tabsHtml = '';
    var panelsHtml = '';
    names.forEach(function (name, idx) {
      var id = 'xv-sheet-' + idx;
      var act = idx === 0 ? ' active' : '';
      tabsHtml += '<li class="tab"><a href="#' + id + '" class="' + (idx === 0 ? 'active' : '') + '">' + _.escape(name) + '</a></li>';
      panelsHtml += '<div class="sheet-panel' + act + '" id="' + id + '">' + L.buildSheetTable(wb.Sheets[name]) + '</div>';
    });
    tabs.innerHTML = tabsHtml;
    container.innerHTML = panelsHtml;

    if (multi) {
      // 手動切換（toggle .active；CSS 以 .sheet-panel:not(.active) 隱藏）
      $(tabs).off('click', 'a').on('click', 'a', function (e) {
        e.preventDefault();
        var t = $(this).attr('href').slice(1);
        $(tabs).find('a').removeClass('active');
        $(this).addClass('active');
        $(container).find('.sheet-panel').removeClass('active');
        var p = document.getElementById(t);
        if (p) p.classList.add('active');
      });
      try { M.Tabs.init(tabs, { duration: 200 }); } catch (e) {}
      tabsWrap.style.display = '';
    } else {
      tabsWrap.style.display = 'none';   // 單一工作表：免顯示 tab bar
    }
  }

  /* ---------- 開檔 ---------- */

  function loadAndShow(link, displayName) {
    if (!L.isSafeLink(link)) {
      state.current = null; state.name = '';
      M.toast({ html: I18n.t('toast.badLink'), classes: 'red' });
      showDoc(false);
      return Promise.resolve();
    }
    if (!window.XLSX) {
      M.toast({ html: I18n.t('toast.engineMissing'), classes: 'red' });
      return Promise.resolve();
    }
    state.current = link;
    state.name = displayName || L.basename(link);
    document.title = state.name + ' | ' + I18n.t('title.suffix');
    docName.textContent = state.name;
    docName.title = state.name;
    markActive(link);
    showDoc(true);
    showLoading();
    clearOutput();
    return L.fetchArrayBuffer(link)
      .then(function (buf) {
        var wb = L.readWorkbook(buf);
        if (!L.sheetNames(wb).length) throw new Error(I18n.t('toast.noSheets'));
        renderWorkbook(wb);
      })
      .catch(function (err) {
        clearOutput();
        M.toast({ html: I18n.t('toast.loadFail', { n: state.name, m: err.message }), classes: 'red' });
        showDoc(false);
      })
      .then(function () { hideLoading(); });
  }

  function navigate(link, displayName) {
    try {
      history.pushState({ link: link }, '', '?xlsx=' + encodeURIComponent(link));
    } catch (e) {}
    loadAndShow(link, displayName);
  }

  /* ---------- 檔案清單 ---------- */

  function markActive(link) {
    $('#side-nav li').removeClass('active');
    if (!link) return;
    var esc = window.CSS && CSS.escape ? CSS.escape(link) : link;
    $('#side-nav li[data-link="' + esc + '"]').addClass('active');
  }

  function renderSideNav(files) {
    if (!files.length) {
      sideNav.innerHTML = '<li><a style="color:var(--muted)!important;">' + I18n.t('side.noFiles') + '</a></li>';
      return;
    }
    sideNav.innerHTML = files.map(function (f) {
      var link = L.fileUrl(f.name);
      return '<li data-link="' + _.escape(link) + '">' +
        '<a href="#!" class="file-item" data-name="' + _.escape(f.name) + '">' +
        '<i class="material-icons">grid_on</i>' +
        '<span style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _.escape(f.name) + '</span>' +
        '<span class="file-meta">' + L.formatSize(f.size) + '</span>' +
        '</a></li>';
    }).join('');
    markActive(state.current);
  }

  function refreshFiles(selectName, autoOpen) {
    return L.listFiles().then(function (files) {
      state.files = files;
      renderSideNav(files);
      if (selectName) {
        var hit = files.filter(function (f) { return f.name === selectName; })[0];
        if (hit) return navigate(L.fileUrl(hit.name), hit.name);
      }
      if (autoOpen && !state.current && files.length) {
        return loadAndShow(L.fileUrl(files[0].name), files[0].name);
      }
    }).catch(function (err) {
      M.toast({ html: I18n.t('toast.listFail', { m: err.message }), classes: 'red' });
    });
  }

  /* ---------- 上傳 ---------- */

  function uploadFiles(fileList) {
    var arr = Array.prototype.slice.call(fileList).filter(function (f) { return L.isUploadable(f.name); });
    if (!arr.length) {
      M.toast({ html: I18n.t('toast.notXlsx'), classes: 'orange' });
      return;
    }
    var lastName = null;
    var chain = Promise.resolve();
    arr.forEach(function (file) {
      chain = chain.then(function () {
        return L.uploadFile(file).then(function () {
          lastName = file.name;
          M.toast({ html: I18n.t('toast.uploaded', { n: file.name }), classes: 'green' });
        }).catch(function (err) {
          M.toast({ html: I18n.t('toast.uploadFail', { n: file.name, m: err.message }), classes: 'red' });
        });
      });
    });
    chain.then(function () { return refreshFiles(lastName); });
  }

  /* ---------- 清空 ---------- */

  function clearFolder() {
    if (!confirm(I18n.t('confirm.clear'))) return;
    L.clearFolder().then(function (d) {
      M.toast({ html: I18n.t('toast.cleared', { n: d.removed || 0 }), classes: 'teal' });
      state.current = null; state.name = '';
      clearOutput();
      try { history.replaceState({}, '', './'); } catch (e) {}
      showDoc(false);
      document.title = I18n.t('title.suffix');
      return refreshFiles();
    }).catch(function (err) {
      M.toast({ html: I18n.t('toast.clearFail', { m: err.message }), classes: 'red' });
    });
  }

  /* ---------- 全頁拖拉 ---------- */

  function hasFiles(e) {
    var dt = e.dataTransfer;
    if (!dt || !dt.types) return false;
    for (var i = 0; i < dt.types.length; i++) if (dt.types[i] === 'Files') return true;
    return false;
  }

  function bindDragDrop() {
    var depth = 0;
    window.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth++; dropOverlay.classList.add('show');
    });
    window.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', function (e) {
      if (!hasFiles(e)) return;
      depth--; if (depth <= 0) { depth = 0; dropOverlay.classList.remove('show'); }
    });
    window.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; dropOverlay.classList.remove('show');
      var dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) uploadFiles(dt.files);
    });
  }

  /* ---------- 語系（i18n） ---------- */

  function cycleLang() {
    var langs = I18n.langs;
    var i = langs.indexOf(I18n.lang);
    I18n.set(langs[(i + 1) % langs.length]);
    M.toast({ html: I18n.name(I18n.lang) });
  }

  function onLangChanged() {
    renderSideNav(state.files);
    document.title = state.current
      ? (state.name + ' | ' + I18n.t('title.suffix'))
      : I18n.t('title.suffix');
    // 表格內容是 data，永不翻譯、不重建。
  }

  /* ---------- 事件繫結 ---------- */

  function deepLink() {
    return L.parseQuery(location.search).xlsx || '';
  }

  function bindEvents() {
    $(document).on('click', '#side-nav a.file-item', function (e) {
      e.preventDefault();
      var name = String($(this).data('name'));
      navigate(L.fileUrl(name), name);
      var inst = M.Sidenav.getInstance(document.getElementById('slide-out'));
      if (inst && inst.isOpen) inst.close();
    });

    emptyState.addEventListener('click', function () { filePicker.click(); });
    filePicker.addEventListener('change', function (e) {
      if (e.target.files && e.target.files.length) uploadFiles(e.target.files);
      filePicker.value = '';
    });

    document.getElementById('setting-menu').addEventListener('click', function () {
      var inst = M.Sidenav.getInstance(document.getElementById('slide-out'));
      if (inst) inst.open();
    });
    document.getElementById('setting-mode').addEventListener('click', toggleTheme);
    document.getElementById('setting-lang').addEventListener('click', cycleLang);
    document.getElementById('setting-download').addEventListener('click', downloadCurrent);
    document.getElementById('setting-clear').addEventListener('click', clearFolder);
    if (toolsToggle) toolsToggle.addEventListener('click', toggleTools);

    window.addEventListener('popstate', function () {
      var link = deepLink();
      if (link) { loadAndShow(link); }
      else { state.current = null; state.name = ''; clearOutput(); showDoc(false); document.title = I18n.t('title.suffix'); markActive(null); }
    });
  }

  /* ---------- 初始化 ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    M.Sidenav.init(document.querySelectorAll('.sidenav'), {
      edge: 'right',
      onOpenStart: function () { document.body.classList.add('sidenav-open'); },
      onCloseEnd: function () { document.body.classList.remove('sidenav-open'); }
    });

    var saved = 'dark';
    try { saved = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
    applyTheme(saved === 'light' ? 'light' : 'dark');

    var savedTools = 'on';
    try { savedTools = localStorage.getItem(TOOLS_KEY) || 'on'; } catch (e) {}
    applyToolsVisible(savedTools !== 'off');

    I18n.apply(document);
    document.addEventListener('i18n:changed', onLangChanged);
    document.title = I18n.t('title.suffix');

    bindEvents();
    bindDragDrop();

    var param = deepLink();
    if (param) {
      loadAndShow(param);
      refreshFiles(null, false);
    } else {
      refreshFiles(null, true);
    }
  });
})();
