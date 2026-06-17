# xlsx-viewer

[English](README.md) · [中文](README.zh-Hant.md) · **日本語**

**スプレッドシート（`.xlsx` / `.xlsm` / `.xls` / `.csv`）をブラウザで表示**する単一ページ Web アプリ。[SheetJS](https://sheetjs.com/) で解析し、各ワークシートを HTML テーブルとして描画します——**複数シートのタブ、結合セル、列幅、型に応じたセル書式**（数値は右寄せ、真偽値 / 日付 / エラーは色分け）。バックエンドは軽量な Express（アップロード / 一覧 / クリア）。

- 📊 **忠実なテーブル** — A/B/C 列・1/2/3 行ヘッダー（スクロール時 sticky）、結合セル（rowspan/colspan）、列幅、SheetJS の書式済み値（`cell.w`）
- 🗂️ **複数シート** — ワークシートごとに Materialize タブ（単一シートのときはタブバー非表示）
- 📥 **ドラッグ＆ドロップ** — スプレッドシートをページ上にドロップ；**同名は上書き**
- 🔗 **ディープリンク** — `?xlsx=<パス>` で任意のファイルを開く（ビューア相対、または許可リストの絶対パス）；共有可・戻る／進む対応。堅牢なクエリ解析で `+` が空白に化けません
- 🌗 **ライト / ダーク**切替（localStorage 保存）——**外殻とテーブルの両方がテーマに追従**（ダーク時はグリッドも暗くなる）；印刷は常に白背景・黒文字・全シート展開
- 🌐 **多言語 UI** — 繁體中文 / English / 日本語（既定は繁體中文、localStorage 保存）。セルの内容はデータであり**翻訳されません**
- 🛡️ **パス安全性** — `..`・バックスラッシュ・`javascript:` / `file:` スキーム・protocol-relative `//`・許可リスト外の絶対パスを遮断
- 🗂️ ファイル一覧サイドバー、元ファイルをダウンロード、フォルダを空にする

> サードパーティのフロントエンドライブラリ（jQuery、Materialize、Lodash、Material Icons、SheetJS）は CDN から読み込み——バンドルもビルドも不要。`npm install` はバックエンド依存のみを取得します。

## クイックスタート

Node.js 18+ が必要です。

```bash
npm install
npm start
# http://localhost:3000/apps/xlsx-viewer/ を開く
```

ポート変更は `PORT`：`PORT=8080 npm start`。

## ディレクトリ構成

```
xlsx-viewer/
├── app.js                          # スタンドアロン Express サーバ（static + API 2 本）
├── package.json
├── routes/
│   ├── upload.js                   # POST /api/upload?folder=xlsx-viewer（multer・複数・上書き）
│   └── xlsx-viewer.js              # GET /files、POST /clear
└── public/
    ├── apps/xlsx-viewer/           # フロントエンド（/apps/xlsx-viewer/ で配信）
    │   ├── index.html              # 構造のみ
    │   ├── xlsx-viewer.css         # テーマ token（テーブル token 含む）+ ページスタイル
    │   ├── xlsx-viewer.js          # コントローラ（グルー）：テーマ / i18n / アップロード / タブ
    │   ├── xlsx-viewer-lib.js      # XlsxViewerLib：クエリ解析 / パス安全性 / サーバ通信 / シート→HTML（純ロジック・DOM 非依存）
    │   ├── materialize-dark.css    # ファミリー共有アセット（Materialize ダーク）
    │   ├── side-tool.css           # 右側フローティングツールバー
    │   ├── thinking-dot.css        # 共有ローディングドット utility
    │   ├── i18n.js                 # i18n エンジン
    │   └── locales/{zh-Hant,en,ja}.js
    └── upload/xlsx-viewer/         # アップロードされたスプレッドシート（内容は git 管理外；サンプルを 1 つ同梱）
```

## API

| Method / Path | 説明 |
|---|---|
| `POST /api/upload?folder=xlsx-viewer` | アップロード（form フィールド `myFiles`・複数；`folder` 指定時は元の名前を保持 → 上書き）|
| `GET /api/xlsx-viewer/files` | `public/upload/xlsx-viewer/` 内の可視ファイルを一覧（新しい順）|
| `POST /api/xlsx-viewer/clear` | そのフォルダ内の可視ファイルをすべて削除（フォルダと隠しファイルは保持）|

静的読み取り：`/upload/xlsx-viewer/<name>`。すべての API は `{ ok }` エンベロープ。

`GET /api/xlsx-viewer/files` の戻り値：

```jsonc
{
  "ok": true,
  "files": [
    { "name": "string", "size": 0, "mtime": 0 }   // mtime = epoch ms；新→旧でソート
  ]
}
```

## コアライブラリ（`XlsxViewerLib`）

純ロジック・DOM 非依存で単体組み込み可能。SheetJS は純粋なデータオブジェクトを返し、HTML テーブルの生成は純粋な文字列処理のため、テーブル生成器は**ライブラリ内**にあります（エンジンが直接 DOM を書くタイプのビューアとは異なります）。グローバルの `XLSX` に依存しますが `document` には触れません。

```jsonc
// XlsxViewerLib.readWorkbook(arrayBuffer) → workbook        （XLSX.read ラッパ）
// XlsxViewerLib.sheetNames(workbook)      → string[]
// XlsxViewerLib.buildSheetTable(worksheet)→ string          （1 シートの <table> HTML）
```

その他のヘルパ：`parseQuery`（堅牢な `?xlsx=`）、`isSafeLink`、`isUploadable`（`.xlsx`/`.xlsm`/`.xls`/`.csv`）、`basename`、`encodePath`、`fileUrl`、`colLetter`、`fetchArrayBuffer`、`listFiles`、`uploadFile`、`clearFolder`、`formatSize`、`timestamp`。

## 備考

- フロントエンドは API を**絶対パス**（`/api/...`、`/upload/...`）で呼ぶため、本プロジェクトの Node サーバが**サイトルート**から配信する必要があります。**GitHub Pages 非対応**（静的ホスティングではアップロード / 一覧 / クリア API を実行できません）。
- 描画は**値と基本構造**（結合セル・列幅・数値書式）を反映しますが、ワークブックの完全なセル書式（フォント / 塗りつぶし / 罫線）は**含みません**。ピクセル精度の書式が必要な場合はスプレッドシートアプリで開いてください。
- 本アプリは **nodeapp WebApp ファミリー**に属します。共通規約は [nodeapp-webapp-family](https://github.com/scottgfhong310/nodeapp-webapp-family) を参照。

## ライセンス

[MIT](./LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
