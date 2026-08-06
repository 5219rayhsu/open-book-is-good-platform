# 部署到 Cloudflare — 開卷有益｜國考統一站

## 🔴 線上網址（正本，2026-08-06 補記）

```
https://open-book-is-good-platform.1003ray1003.workers.dev/
```

驗活一行（上線後的「驗使用者那一面」從這裡開始，不要憑印象）：

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://open-book-is-good-platform.1003ray1003.workers.dev/exam/nursing/
```

### 🔴 `publish_platform.sh --push` **不等於上線**（2026-08-06 實測補記）

那支腳本只推 GitHub，**本身不含任何部署步驟**。真正的部署是 Cloudflare
**Workers Builds** 從 repo 自動觸發的——設定在 Cloudflare 的儀表板，**不在這個 repo 裡**
（沒有 `.github/workflows/`、`publish_platform.sh` 也沒有 `wrangler deploy`），
所以在程式碼裡怎麼找都找不到，只能靠這一段記著。

**實測延遲約 3 分鐘**（21:19:5x 推送 → 21:22:55 線上資料更新）。推完立刻 `curl`
會拿到**舊資料**，那不是失敗、是還沒建置完。

所以驗收不能只看 HTTP 200——**首頁在部署前後都是 200**。要驗「內容真的換了」：

```bash
B=https://open-book-is-good-platform.1003ray1003.workers.dev
curl -s "$B/data/nursing/explanations.json" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["explanations"]),"則")'
```

輪詢到數字改變才算上線。**「推了」與「上線了」是兩件事**，中間那 3 分鐘足夠讓
一個 session 誤報完成。

⚠️ **實際跑的是 Workers Assets，不是 Pages**——`_platform/wrangler.jsonc` 的
`name: open-book-is-good-platform` ＋ `assets.directory: "."`，網域因此是
`<name>.<帳號子網域>.workers.dev`，不是本文下面步驟寫的 `<專案>.pages.dev`。
下面的 GUI 步驟是當初評估 Pages 時寫的，**保留當備援路徑，但它不是現況**。

🔴 **為什麼這一格值得存在**：2026-08-06 稽核發現網址在 repo 裡**只**出現在
`_platform/llms.txt` 與 `robots.txt`——**兩份都是寫給機器讀的檔案**。於是
「上線後要驗使用者那一面」這條硬規則，在執行上依賴某個 session 剛好記得網址，
而 session 會結束。**寫給機器的正本不等於寫給接手者的正本**；一條無法在新 session
裡執行的驗證規則，觀測上等同於不存在。

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
   - `index.html`、`web/`、`data/`、`_headers` 應位在 repo 根目錄，沒有額外的子目錄層。
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git → 選該 repo。
3. 設定：
   - **Framework preset**：`None`
   - **Root directory**：留空（使用 repo 根目錄）
   - **Build command**：留空（無 build）
   - **Build output directory**：留空或填 `/`（即 repo 根目錄）
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
