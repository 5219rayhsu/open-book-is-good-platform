# 開卷有益 Open-Book-Is-Good

> 國家考試的歷屆試題本就是公共財。本專案所做的，是把這份公共資源，長成一套開源、人人可用、可 fork、可檢驗的數位公共基礎建設（open-source digital public infrastructure）。

> ⚠️ **這是 beta。** 資料儲存與圖片都還有不少問題，見下方〈beta：已知問題〉。公開它不是因為它做完了，而是因為做到一半的東西也應該可被檢查。

## 專案立場

考選部以 Open Data 釋出歷屆試題；題目屬於眾人，然而把它整理成「能練習、有詳解、看得見自己弱點」的這段工夫，過去往往要付費才換得到。本專案認為，既然題目是 commons，那麼讓題目便於使用並且好用的這一段路程，也應當回到 commons。正如 Elinor Ostrom 所提醒的，公共資源能否長久，取決於社群是否擁有共同治理它的規則；因此我們把這套規則寫成可讀、可 fork 的 running code，而非鎖進任何單一機構。

## 設計原則

radical transparency，而非 attention extraction。本專案不放連勝、紅點、徽章這類為了把人留在畫面前而設計的機制；使用者的時間屬於使用者。每一條備考工作量的推估公式都攤開、可檢驗。作答進度**預設只留在本機瀏覽器**（localStorage）；唯有你主動登入，才會同步到帳號（詳見〈進度與隱私〉）。不做行為追蹤、不投放廣告、不販售資料，也誠實說明：沒有任何系統能保證考試結果。

## 結構

本專案分為 **platform** 與 **skill** 兩個互補層次：

- **platform**：running code 與 data，已經在線上跑、各科共用的自學系統。
- **skill**：方法層，一份給 AI agent 載入的判斷式手冊，讓任何人在任何地方都能從官方開放試題，以 clean-room 的方式長出屬於自己的版本。

題庫資料可由 [`open-book-is-good-skill`](https://github.com/5219rayhsu/open-book-is-good-skill) 所描述的方法產生；若你想從官方開源試題建立自己的題庫，請參考該 skill。

前者證明它可行，後者讓它可被分叉。platform repo 目錄：

```
open-book-is-good-platform/ 部署根目錄（Cloudflare Pages 的 root）
├── index.html             首頁（考試卡片由 manifest 動態生成）
├── _headers               安全標頭 + 快取策略（Pages 自動套用）
├── README.md / docs/      本檔 + 部署 / Phase3 / 思考文件
├── web/                   統一引擎（一份，跑各科）
│   ├── exams.js           ★ 考試 manifest + 當前考試決定（最先載入）
│   ├── index.html         引擎入口（?exam=<考試> 深連結指定科）
│   └── app.js loader.js run.js modes.js srs.js charts.js …（其餘引擎）
└── data/<考試>/           題庫，每科一子目錄
    └── {bank,relations,explanations,essays,essay_samples}.json
```

考試 key：`social-worker`（社會工作師）/ `lawyer`（律師）/ `counseling`（諮商心理師）/ `clinical`（臨床心理師）/ `cpa`（會計師）/ `nursing`（護理師）等，持續新增中。

## fork 一個新考試（甚至不同國家）

各科的差異，包括科目清單、各科說明、localStorage 前綴、主管機關、法規體系、題庫出處，全部收斂在一份 manifest（`web/exams.js` 的 `EXAMS`）。引擎本身不寫死任何一科的字眼：科目數由 `subjects.length` 動態長出，「考選部」「中華民國法規」這類詞也由 manifest 提供，並透過 HTML 的 `data-exam-field` 在載入時填入當前考試的值。

1. 在 `web/exams.js` 的 `EXAMS` 加一筆，填 `key / prefix / name / subjects / notes`，以及隨考試或國家而不同的 `authority`（主管機關）、`jurisdiction`（法規查證對象）、`sourceName`（題庫出處）、`category / count / blurb`（首頁卡片）。
2. 把題庫放進 `data/<key>/bank.json`，頂層為 `{ "questions": [ … ] }`；每筆題目欄位為 `qid / year / round / subject / no / stem / options / answer / parse`（loader 以 questions 陣列與首題 qid、options 判斷題庫合法；答案務必對齊官方標準答案）。
3. 完成。首頁卡片、考試選擇器、科目數文案、機構與法規字眼都會自動長出來，引擎一行不改。

這正是我們設想的 plurality：同一套基礎建設，容得下許多人各自的版本。

> 同一題跨考試共用的情況，見 `docs/PHASE3_shared_leverage.md`；其中也記錄了遇過的坑，像是**科目名稱相同不代表題目相同**，共用前請先以實測確認是否為同一份考卷。

## 本機預覽

```bash
cd open-book-is-good-platform
python3 -m http.server 8753
# 首頁       → http://localhost:8753/
# 直接進某科 → http://localhost:8753/web/index.html?exam=lawyer
```

題庫以 fetch 載入，`file://` 直接開啟無法取得資料，因此需要一個 http server。

## 部署到 Cloudflare Pages

完整步驟見 `docs/DEPLOY_cloudflare.md`。要點：Framework preset 選 **None**、無 build command、部署根目錄指向 repo 根目錄。每個題庫檔都在 25 MiB 的單檔上限之內（目前最大的 `data/doctor/bank.json` 約 6 MB）。

## 進度與隱私

**現在（beta）**：不需要登入即可完整使用。作答進度只存在你的瀏覽器（localStorage），不上傳、沒有第三方分析、沒有追蹤用 cookie。

**建置中**：Google 登入 ＋ Cloudflare R2 雲端備份，用於跨裝置接續與避免進度遺失。它上線時，本節會同步更新，並且明講以下三件事——因為它們都是真的：

1. 你一旦用 Google 登入，Google 就會知道你登入了本站。「無第三方」這句話對已登入的使用者不再成立，本專案不會假裝它還成立。
2. 備份存放在本專案的 R2 儲存桶，維運者技術上讀得到。我們只存讓你接續所需的最小資料——一個帳號識別碼，加上「哪一題答對或答錯、什麼時候」；不存姓名、不記錄 IP、不接任何分析服務。
3. 「別人駭進來也讀不到」與「你忘記密碼時我能幫你救回」，在數學上不可能同時絕對成立：我救得回，就代表我具備解密能力，取得這份能力的攻擊者亦然。beta 選擇可救援，因此**不是**端對端加密。若你不接受這個取捨，**就不要登入**——本機模式的功能完全一樣。

登入與否由你決定。資料主權屬於你，登入功能上線時將一併提供匯出與刪除。

## beta：已知問題

公開這份清單，是因為使用者有權知道自己在用什麼。

- **圖片**：部分題目的圖表尚未接上或曾經錯置。已知會誤導的題目已被標為 `parse:'review'`、退出練習池——寧可讓題目消失，也不要讓它安靜地渲染一張錯的圖。教師資格考試約 30 張幾何圖仍待補。
- **資料儲存**：目前只有 localStorage，沒有後端。清瀏覽器資料等於進度歸零。登入與備份見上節。
- **repo 很大**：裁切自官方 PDF 的圖檔（約 40 MB，含醫師臨床影像）直接放在 repo 裡，clone 會很重。這些圖是**衍生物**，理論上可由抽圖管線從官方 PDF 重生；把「開放」與「可用」同時做好，是尚未解決的問題。
- **詳解覆蓋不均**：社工師、律師、會計師、學測、會考接近全覆蓋；護理師、諮商心理師、臨床心理師覆蓋率偏低；醫師與教師資格考試尚無詳解。
- **約 680 題 `parse:'review'`**：來源 PDF 的文字層損毀（造字選項標記塌陷、圖片選項被抽成空字串、LaTeX 跨題錯切）。這些題已被引擎隔離、不進作答，是**涵蓋缺口**而非顯示錯誤。

發現新問題，歡迎開 issue。

## 資料來源與免責聲明

題庫出自考選部「國家考試試題及測驗式試題答案」開放資料（OGDL 授權），以及大考中心（學測）、臺師大心測中心（會考）等官方歷屆試題；依著作權法第 9 條，依法令舉行之考試試題不得為著作權之標的、得自由利用，引用仍請註明出處。選擇題詳解與申論參考要點為 AI 整理的學習輔助，以及開源工作者與公眾的協助解答，**並非官方標準答案**；法規會修訂，作答與引用前請對照現行法規查證。任何備考工作量的推估，都是「為上榜而設計」的估計，而非上榜的保證。

## 授權

本 repo 的內容分三層，授權各自不同（完整條文見 [`LICENSE`](LICENSE) 與 [`NOTICE`](NOTICE)）：

| 層 | 內容 | 授權 |
|---|---|---|
| 程式碼 | `web/`、`sw.js`、`_headers`、`index.html`、`docs/` | **MIT** |
| 試題本文 | `data/*/bank.json` 的題幹、選項、標準答案 | 依**著作權法第 9 條**不得為著作權之標的，得自由利用（引用請註明出處） |
| 衍生物 | `explanations.json`、申論參考要點、`relations.json`、`data/*/figures/`（自官方 PDF 裁切） | **CC0 1.0**（公眾領域貢獻） |

衍生物選 CC0，理由與試題本身自由利用同一條：讓題目好用的那段工夫，也應該回到 commons。你不需要問我，也不需要標示我。

## 協作邀請

本專案無意把它定義為「最好用的考試 App」；與其競爭注意力，更希望它是一塊任何人都能踩上去、再往外長的地基。倘若你手上有另一批公開試題、另一個國家的考試、或一種我們沒想到的學習法則，歡迎加入到本專案之platform，讓一個網頁就能同時練習多種考試，也歡迎 fork 它，讓它長成你需要的樣子。
