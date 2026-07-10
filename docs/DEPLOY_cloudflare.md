# 部署到 Cloudflare Pages — 開卷有益｜國考統一站

> 這是「資料驅動的純前端靜態站」：無 build、無後端、無追蹤。一份引擎（`web/`）
> 跑五科，資料按考試分檔（`data/<考試>/*.json`）。部署 = 把 repo 根目錄
> 當靜態網站丟上 Cloudflare Pages 即可。

## 架構速覽

```
open-book-is-good-platform/ ← 部署根目錄(Cloudflare Pages 的 root)
├── index.html            ← landing(五科入口卡片)
├── _headers              ← 安全標頭 + 快取策略(Pages 自動套用)
├── web/                  ← 統一引擎(一份,跑五科)
│   ├── exams.js          ← 考試清單 manifest + 當前考試決定(最先載入)
│   ├── app.js / loader.js / run.js / modes.js / ...(其餘引擎)
│   └── index.html        ← 引擎入口(?exam=<考試> 深連結指定科)
└── data/                 ← 題庫資料,每科一子目錄
    ├── social-worker/{bank,relations,explanations,essays,essay_samples}.json
    ├── lawyer/ ・ counseling/ ・ clinical/ ・ cpa/
```

- 使用者首訪 `/` → landing；點某科 → `/web/index.html?exam=<考試>`。
- 站內頂端的考試選擇器可隨時切換；各科進度以 localStorage 前綴（`swk_`/`law_`/
  `cou_`/`clin_`/`cpa_`）天然隔離。
- **每檔皆 < 25 MiB**（Cloudflare Pages 單檔上限）；目前最大單檔約 3.5 MB（社工 bank）。

## 部署步驟（GUI，最簡單）

1. 把 repo 根目錄推到 GitHub（本專案即 `open-book-is-good-platform`）。
   - `index.html`、`web/`、`data/`、`_headers` 應位在 repo 根目錄。
   - 不再使用 `_platform` 子目錄。
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git → 選該 repo。
3. 設定：
   - **Framework preset**：`None`
   - **Root directory**：留空（使用 repo 根目錄）
   - **Build command**：留空（無 build）
   - **Build output directory**：指向 repo 根目錄（不要填 `_platform`）
4. Deploy。完成後得到 `https://<專案>.pages.dev`。

### 或：直接上傳（不接 Git）

Pages → Create → Upload assets → 把 repo 根目錄的靜態檔拖上去。

## 部署後檢查

- 開 `https://<站>/` 看到 landing 五科卡片。
- 點任一科 → 題庫載入、能作答、能力雷達正常、0 console error。
- 切換考試 → 題庫換、進度各自獨立。
- DevTools → Network 看 `data/<考試>/bank.json` 為 200、`Cache-Control` 依 `_headers` 生效。

## 自訂網域（可選）

Pages 專案 → Custom domains → 加網域 → 依指示設 CNAME。HTTPS 由 Cloudflare 自動簽發。

## 注意

- **單檔離線版（含進度副本／進度碼匯出匯入）不在本站**：那屬離線單檔 HTML 機制，
  線上站進度走 localStorage（跨裝置同步為未來工作）。
- 資料更新：改 `data/<考試>/*.json` 後重新部署即可；`_headers` 已設 data 快取 1 小時 +
  must-revalidate，HTML 不快取（改版即時生效）。
- 寫作範本（essay_samples）為 AI 整理的學習輔助，非官方標準答案。
