# Phase B — 登入＋進度同步（後端接線 runbook）

> 目標：作答進度從「只存瀏覽器 localStorage」升級為「登入＋Cloudflare D1 跨裝置同步」。
> 登入方式：**Google OAuth ＋ email magic-link 兩條都做**，以 email 當主鍵串成同一帳號。
> **這份文件是接線藍圖＋你要先在 Cloudflare／Google／寄信服務開好的東西**；真正寫程式在你備好下方「provisioning 清單」之後。

## 0) 現況偵察結論（為什麼現在不先寫 adapter）

引擎的進度存取**已經是乾淨的單一接縫**，不需要先重構：

- `web/app.js`：`loadState()`（讀）、`saveState(next)`（寫）、`patchState()`／`patchSettings()`（都走 saveState）。
- `web/progress.js`：reset 清除（`STATE_KEY` 移除）。
- 其餘 localStorage 命中是「當前考試 key」（`exams.js`，屬 UI 偏好、不同步）與說明文案。

→ Phase B 的改動就**集中在這兩個函式**：未登入時行為不變（localStorage），登入時改走 API。先寫一個獨立 adapter 檔屬於 premature scaffolding，故不做。

## 1) 前端接線（等後端就緒後改，小 diff）

- `loadState()`：未登入 → 同現在讀 localStorage；**登入 → 先 `GET /api/progress?exam=<key>` 取雲端，與本機合併**（首次登入把本機進度上傳遷移；之後以每科 `updated_at` last-write-wins）。
- `saveState(next)`：**永遠先寫 localStorage（離線快取不丟）**；登入時再 debounced `PUT /api/progress?exam=<key>` 寫回雲端。
- 登入 UI：頁面放兩顆按鈕「用 Google 登入」「用 email 收登入連結」；右上角名牌沿用 `naming.js`，登入後顯示 email／名字。

## 2) D1 schema（`docs/schema.sql`，provision 時套用）

```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY,        -- 隨機 id
  email       TEXT UNIQUE NOT NULL,    -- 主鍵身分：Google 與 magic-link 都對應到這裡
  created_at  INTEGER NOT NULL
);

CREATE TABLE magic_links (
  token_hash  TEXT PRIMARY KEY,        -- 只存 token 的 hash，不存明文
  email       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,        -- 簽發後約 15 分鐘
  used        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE progress (
  user_id     TEXT NOT NULL,
  exam_key    TEXT NOT NULL,           -- social-worker / lawyer / ...
  blob_json   TEXT NOT NULL,           -- 該科整包進度 JSON（= 現在的 state）
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, exam_key)
);
```

> session 用**無狀態 httpOnly 簽章 cookie**（HMAC，密鑰放 CF 環境變數），MVP 不建 sessions 表；日後若要伺服器端強制登出再加。

## 3) API 契約（Pages Functions，放 `functions/api/`）

| 方法 | 路徑 | 作用 |
|------|------|------|
| POST | `/api/auth/email/start` | 收 `{email}` → 建 magic_link、寄信（**rate-limit**） |
| GET | `/api/auth/email/verify?token=` | 驗 token（一次性、未過期）→ 依 email upsert user → 發 cookie → 轉址 |
| GET | `/api/auth/google/start` | 轉去 Google 授權 |
| GET | `/api/auth/google/callback` | 換 code → 取 email → 依 email upsert user → 發 cookie |
| POST | `/api/auth/logout` | 清 cookie |
| GET | `/api/progress?exam=<key>` | 回該使用者該科 blob（需登入） |
| PUT | `/api/progress?exam=<key>` | upsert 該科 blob（需登入） |
| DELETE | `/api/account` | 刪帳號＋其所有 progress（隱私承諾：可自助刪除） |

## 4) 安全檢查（B5，過 security-reviewer 才上）

- cookie：`HttpOnly`＋`Secure`＋`SameSite=Lax`＋HMAC 簽章；**絕不存密碼**（passwordless／OAuth）。
- magic-link：只存 token hash、TTL 約 15 分鐘、**一次性**（used 旗標）、隨機不可猜；start 端點對 email／IP **rate-limit**。
- CSRF：狀態變更（PUT／DELETE）加自訂標頭檢查或 double-submit token（SameSite=Lax 擋掉多數跨站）。
- 輸入驗證：email 格式、blob 大小上限；錯誤訊息不洩漏內部。

## 5) 🔧 要你先開好的東西（provisioning 清單）—— 這是目前的卡點

> 這幾項需要你的帳號／密鑰，我無法代開。備好後把產出的值給我（密鑰走 CF 環境變數，**不要貼進聊天或檔案**），我就接 B1～B5。

1. **Cloudflare**：有帳號；本機裝 `wrangler`、跑 `wrangler login`。
2. **建 D1**：`wrangler d1 create obig-progress` → 把回傳的 `database_id` 填進 `wrangler.toml`（binding 名 `DB`）；再 `wrangler d1 execute obig-progress --file=docs/schema.sql` 套表。
3. **Google OAuth**：到 console.cloud.google.com → APIs & Services → Credentials → 建 OAuth client ID（類型 Web）→ Authorized redirect URI 填 `https://<你的 pages 網域>/api/auth/google/callback` → 取得 **Client ID＋Secret**。
4. **寄信服務（magic-link 用）**：註冊 Resend（resend.com）→ 驗證寄件網域（測試期可用它的 onboarding 網域）→ 取得 **API key**。
5. **在 CF Pages 專案設環境變數／Secrets**：`COOKIE_SECRET`（一段夠長的隨機字串）、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`RESEND_API_KEY`、`MAIL_FROM`、`APP_ORIGIN`。
6. **Pages 建置設定**：Framework＝None、Root directory＝repo 根目錄、無 build command；綁定 D1（`DB`）。

## 6) 建置順序（你備好上方後我照這個走）

B1 schema 套表 → B3 progress API（先做、可單測讀寫）→ B2 兩條登入 → B4 前端 `loadState/saveState` 接 API＋首次登入遷移 → B5 安全（security-reviewer）→ B6 刪帳號＋隱私落地 → 本機 `wrangler pages dev` 全流程 smoke → 交你連線上。
