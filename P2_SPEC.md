# P2 實作規格 — 帳號登入 ＋ 端到端加密備份（Cloudflare）

> Fable 設計，2026-07-05 夜。**crypto 高風險：此規格須使用者審過才實作**（不夜間 auto-ship）。
> 上位文件：`ARCHITECTURE.md`（六承諾、紅線）。此檔把 P2 具體到可動手。
> 目標：加密雲端備份（需求 2）＋雲端刪除（需求 6），**伺服器只見密文**（需求 5 技術保證）。

## 0. 威脅模型（先講清楚防誰）
- **防**：Cloudflare／團隊／任何取得 D1+R2 的人讀到使用者進度；被拖庫；被要求交出資料。
- **不防**（能力邊界，誠實）：使用者自己的裝置被入侵（明文在本機）；使用者把密碼/復原碼交給釣魚者。
- **核心不變式**：明文與金鑰**永不離開瀏覽器**。伺服器收到的一律是密文＋不敏感中繼。

## 1. 金鑰方案（信封加密 ＋ 雙復原）
```
DEK  = 隨機 AES-GCM-256（一次性產生，真正加密進度的金鑰）
KEK_pw   = PBKDF2-SHA256(password, salt_pw, 600_000)     # OWASP 2023 下限；WebCrypto 原生
KEK_rec  = PBKDF2-SHA256(recovery_code, salt_rec, 600_000)
wrappedDEK_pw  = AES-KW(KEK_pw,  DEK)   # 或 AES-GCM 包
wrappedDEK_rec = AES-KW(KEK_rec, DEK)
```
- 伺服器只存 `wrappedDEK_pw`、`wrappedDEK_rec`、`salt_pw`、`salt_rec`。**沒有 password、recovery_code、KEK、DEK。**
- 使用者用**密碼或復原碼**任一解開 DEK。團隊兩者皆無 → 讀不到。
- **登入（auth）與加密（KEK）分離**：別讓伺服器收到任何能推回 KEK 的東西。
  - MVP：auth 用**獨立 verifier** = PBKDF2(password, salt_auth≠salt_pw) → 只送這個 hash 當登入證明，伺服器存其 hash。KEK 用 salt_pw 那條、永不送出。
  - 升級：**passkey（WebAuthn）當 auth**（完全不送密碼），若裝置支援 **PRF extension** 就用 passkey PRF 直接派生 KEK（無密碼可忘，最優雅）；不支援 PRF 才退回密碼派生 KEK。
- **Argon2id 升級路徑**：PBKDF2 是 WebCrypto 原生、無依賴的 MVP；日後可換 Argon2id（需 WASM lib），salt/版本欄位預留 `kdf` 標記以便遷移。

## 2. 資料模型（D1，全部無明文內容）
```sql
users(
  id TEXT PRIMARY KEY,           -- 隨機 uuid
  auth_verifier_hash TEXT,       -- MVP 密碼 verifier 的伺服器端 hash；passkey 版改存 credential
  salt_pw TEXT, salt_rec TEXT, salt_auth TEXT,
  wrapped_dek_pw TEXT, wrapped_dek_rec TEXT,
  kdf TEXT DEFAULT 'pbkdf2-600k',
  created_at INTEGER
)
sync_meta(
  user_id TEXT, record_id TEXT,  -- record_id = 不敏感（如 exam key＋類別，或 opaque uuid）
  version INTEGER, updated_at INTEGER,
  PRIMARY KEY(user_id, record_id)
)
```
- R2：`r2://<user_id>/<record_id>` = 密文（AES-GCM(DEK, plaintext)，含 iv）。**開 R2 版本控制**（救回用）。
- 注意：record_id 不得洩題目內容/科目敏感度；用 opaque id 或粗粒度分類即可。

## 3. API（Workers / Pages Functions，全部 HTTPS）
| 端點 | 作用 | 伺服器可見 |
|---|---|---|
| `POST /api/signup` | 建帳號：收 auth_verifier_hash、salts、wrapped_dek_pw/rec | 只密文＋hash |
| `POST /api/login` | 驗 auth verifier → 發 session token（KV，短效）；回 wrapped_dek + salts | 只密文 |
| `GET /api/sync?since=<ts>` | 回該用戶自 ts 後變動的密文記錄＋version | 只密文 |
| `PUT /api/record/<id>` | 上傳一筆密文＋version（樂觀鎖：version 衝突回 409） | 只密文 |
| `POST /api/report` | 疑義回報：**明文單題**，使用者明確同意才送（與主庫分離） | 使用者自選的那一小塊 |
| `DELETE /api/account` | 刪 D1 列＋R2 全物件（含版本）→ 加密粉碎 | — |
- 限流（KV 計數）＋ CSRF（同源＋token）＋ 輸入驗證（每個 body 用 schema 驗）。

## 4. 同步（每筆 LWW，需求 3、4）
- 本機 IndexedDB 為真相 → 對每筆進度記錄：`ciphertext = AES-GCM(DEK, JSON(record))` → `PUT /api/record/<id>`。
- 拉：`GET /api/sync?since=lastSyncTs` → 本機解密 → **每筆比 updated_at，新的贏**（單調計數用 max/union）→ 合併 → 更新 lastSyncTs。
- 衝突（同筆兩裝置改）：LWW 取新；MVP 可加「較舊版本被覆蓋」提示。CRDT 留到有真需求（YAGNI）。
- PWA 即 App（P0 已做）→ App 與網頁同一 API、自動同步（需求 4）。

## 5. 復原與維護（需求 2 的「團隊不可讀但可救」）
- **忘密碼**：用復原碼 → KEK_rec → 解 DEK → 重設密碼（重算 wrappedDEK_pw）。
- **進度損毀**：團隊從 **R2 版本控制**取回較早**密文**版本給使用者，使用者自解。團隊全程不解密。
- **疑義回報**：`/api/report` 明文單題、opt-in。主庫維持 E2E。
- **兩者皆失**（密碼＋復原碼都丟）→ 無人可救。**註冊流程須白紙黑字告知**，不設團隊後門金鑰。

## 6. 紅線（每個 P2 PR 對照，違反即擋）
1. 伺服器端程式碼**不得出現**明文進度、password、DEK、KEK、recovery_code。
2. 加密/派生**只在瀏覽器**（WebCrypto）；伺服器只搬密文。
3. 不接第三方分析/廣告；不把任何使用者內容送外部 API（含 LLM）。
4. `DELETE /api/account` 必須真刪 R2 全版本＋wrappedDEK（加密粉碎），非軟刪。
5. 匯出（P1）必須離線可用、不依賴此後端。
6. 新增任何伺服器欄位前自問：能是密文嗎？不能→真的必要嗎？

## 7. 分步實作順序（P2 內部，逐步可測）
1. D1 schema ＋ signup/login（先密碼 verifier，passkey 後補）＋ session。
2. 瀏覽器 crypto 模組（WebCrypto：PBKDF2、AES-GCM、AES-KW；含 KAT 自我測試向量）。
3. 單筆 PUT/GET record ＋ 本機加密/解密往返測試（明文→密文→R2→取回→解密＝原文）。
4. 全量同步 ＋ LWW 合併（兩裝置模擬）。
5. 復原碼流程 ＋ DELETE account（加密粉碎驗證）。
6. passkey/PRF 升級（可選，之後）。

## 8. 驗收（實作後，須人審）
- 拖庫演練：只給 D1+R2 dump，**證明無法還原任一使用者進度**（缺 KEK）。
- crypto KAT：PBKDF2/AES-GCM 對已知測試向量。
- 往返：明文 == 解密(加密(明文))；跨裝置 LWW 收斂。
- 刪帳號後殘留密文永久不可解。
- **獨立第二眼複審 crypto 程式碼**（driver.md §6：高風險判斷換一個 model 複審）。

---
**狀態：設計完成，待使用者審。實作前請確認金鑰方案（PBKDF2 vs Argon2id、passkey vs 密碼）與威脅模型符合期待。**
