'use strict';
/* ============================================================
   Service Worker — P0 PWA(離線可用＋可安裝)。

   放在站台**根目錄**(即 repo 根),服務於 /sw.js → 預設 scope = /,
   同時涵蓋根 landing(/index.html)、app(/web/)與題庫(/data/)。
   (放 web/ 下 scope 只到 /web/,雖然仍能攔到 app 頁發出的 /data/ 子請求,
    但根 landing /index.html 會落在 scope 外、離線變白頁;移到根一次解決。)

   兩種快取策略:
   1) APP_SHELL_FILES(engine 本體 + 兩個 index,~908K,全部 precache):
      install 時整批存好,離線時 app 殼 100% 可用。改版時把 CACHE_VERSION
      的數字往上加一,啟用(activate)時會自動刪掉舊版本 cache。
   2) data/(題庫,單科可達數十 MB、全站 328MB,絕不整批抓):
      runtime stale-while-revalidate,「造訪過的科目才離線
      可用」——使用者打開某科練習時,fetch 到的 bank.json /
      explanations.json / figures/*.png 才會被存進 DATA_CACHE。
      選配檔(relations.json / essay_samples.json)缺檔時,
      SW 不把失敗回應存進 cache、也不視為錯誤。
   ============================================================ */

var CACHE_VERSION = 'v27';  /* v27:可作答改白名單（IDR-0033）——只有 official／free／multi 可作答，其餘任何值（含未知值）一律唯讀、不進分數與能力雷達；`none_published`（官方沒給）與 `unread`（我們沒讀出來）文案刻意寫成兩句不同的話。缺詳解不再靜默隱藏，改顯示「尚未上線」佔位（IDR-0028 倒敘產線的必然狀態，隱藏會讓它跟「站壞了」長得一樣）。本次動到 grading.js／app.js／run.js／explain.js 四個殼檔，**不升版既有使用者會續用舊殼**；實測混合狀態（新 app.js ＋ 舊 grading.js）會 ReferenceError 讓 rebuildUsable 整個拋錯，故呼叫端一律加 `typeof` 護欄。 v26:開機只抓 bank.json,詳解／關聯／申論三包延後到 bank 落地後才起跑——原本四個 fetch 同時發射,但只有 bank 擋第一畫面(social-worker 開機共 5.9MB、bank 只佔 17.8%)。配套:歷屆原卷面板是唯一讀全域 ESSAYS 卻沒自己 resolve 的地方,補一次性自癒,否則整卷申論會靜默消失。 v25:診斷第一步的預設勾選補上「濾掉已不存在的舊類科/舊科目名」防呆(制度改版更名後的殘留),與 activeCategories 的既有姿勢對齊。 v24:學習藍圖的診斷狀態未完成時一律寫「尚未做過」,不再標「（先前略過）」——從沒遇過診斷的人看到那句是錯的。 v23:入學診斷改兩步(先勾類科／科目、再選簡短或完整)——教檢原本不收斂就是 21 科／簡短 84 題,學習藍圖的重做入口又直接跳簡短版、整個跳過範圍選擇;第一步就標出兩種份量的題數與所需時間,寫入只發生在點下卡片那刻(返回／取消零寫入)。設定頁說明文字的 **強調** 改為真的粗體,不再原樣印出星號。 v22:作答表改吃框線網格 schema(headers[].span 跨欄、cell.rowspan 合併列、hints 印出原卷格內文字、輸入框只給 input_cols)——原本 9 題因表頭偵測失敗畫不出來,合併儲存格也被切成多格。 v21:非選「勾選＋說明」作答表(q.answer_table)——原卷的表壓平成一行後勾選框沒有可點的對象,等於不能作答;還原成可勾選、可輸入的表格(15 題)。 v20:藍圖選項列補上縱向間距(原本四列 margin 為 0,是兩次「加大間距」都只改到 column-gap 的漏網之魚)。 v19:入學診斷入口統一到學習藍圖（單題練習改為指路）＋略過後在診斷首屏與設定頁指路＋進度列改序（學習藍圖優先）＋藍圖按鈕間距再加大。 v18:parse 新增終局值 noanswer（官方未公布答案），狀態列與待校數分開計。 v17:入學診斷先問應考類科（教檢 84→16 題）＋所需時間由題數推導（十個考試原本都寫死「約 10 分鐘」）；completionCount／allYears／出題側範圍一致性修正。 v16:年份範圍選擇(settings.years)＋送分題兩套帳(整卷分數含、能力估計不含)＋雷達寬度隨 viewBox 縮放(教檢 21 科不再被壓小)＋時段樣本不足時不再顯示「還差 N 題」。本次動到 app.js/charts.js/stats.js/run.js/settings.js/blueprint.js/tempo2.js/app.css 共 8 個殼檔,不升版既有使用者會續用舊殼。 v15:data/ 快取由 cache-first 改 stale-while-revalidate(＋_headers 的 /data/* no-cache)——資料更新此後**免升版**即可在下次載入收斂;本次升版是一次性清掉舊資料快取,讓全體使用者立即拿到最新詳解。v14:ADR-0003 標記／儲存分階段——標記(橘折角)只在整卷作答＋題號導覽列,交卷隨歷史紀錄保存,歷史詳情可增刪;儲存只在詳解檢視,遷出至 obig_saved_<考試key> 專屬 key。v13:停考科目全域開關(state.settings.includeDeprecated,預設排除)——manifest 標 deprecatedSubjects 的科目預設移出練習/統計/歷屆,設定頁「停考科目」區可切「納入練習」全站復原;社工「社會工作管理」比照。v12:完全同題改同場輪替互斥(跨場可練到不同年份的同題)、社工「社會工作管理」115 年起停考標示(模擬考預設不勾)。v11:應考類科個人設定(教師檢定等分組考試可複選類科,過濾進度/雷達/出題/藍圖/模擬選科,reload 生效)。v10:標記折角回歸回顧介面（錯題列表／歷史詳情／儲存題頁），整卷與逐題卡片折角天然沿用；同題幹互斥加通用題幹豁免。v9:儲存題獨立頁、模擬考同題幹互斥、錯題排序與本月窗、標記降級為作答內記號。v8:詳解 justify＋pre-line、模擬考內容去重、題組鏈聚攏與鏈式情境框、標記／儲存、錯題篩選、單題出題演算法升級。v7:封面／選科主題切換 theme-boot.js（預設白底、與內部考科共用 obig:theme 偏好）。v6:預快取改 {cache:'reload'} 繞過 HTTP 快取,修「v5 殼烤進舊 exams.js → 切換跳回原科」。v5=類科兩級選科。v4=教師檢定改名+setExam 導航修正 */
var SHELL_CACHE = 'obig-shell-' + CACHE_VERSION;
var DATA_CACHE = 'obig-data-' + CACHE_VERSION;

/* app shell 清單:站根解析(路徑皆相對 /,含 web/ 前綴)。
   兩個 index 都要進 shell cache:web/index.html(app 頁)+ index.html(根 landing)。
   無 build 工具、手動維護——新增引擎檔案時記得補這裡。 */
var APP_SHELL_FILES = [
  './',
  'index.html',
  'web/',
  'web/index.html',
  'web/app.css',
  'web/app.js',
  'web/blueprint.js',
  'web/charts.js',
  'web/coach.js',
  'web/diagnostic.js',
  'web/essays.js',
  'web/exams.js',
  'web/explain.js',
  'web/feedback.js',
  'web/help.js',
  'web/history.js',
  'web/loader.js',
  'web/modes.js',
  'web/naming.js',
  'web/progress.js',
  'web/run.js',
  'web/settings.js',
  'web/srs.js',
  'web/stats.js',
  'web/theme-boot.js',
  'web/manifest.webmanifest',
  'web/katex/katex.min.css',
  'web/katex/katex.min.js',
  'web/katex/auto-render.min.js',
  'web/katex/fonts/KaTeX_AMS-Regular.woff2',
  'web/katex/fonts/KaTeX_Caligraphic-Bold.woff2',
  'web/katex/fonts/KaTeX_Caligraphic-Regular.woff2',
  'web/katex/fonts/KaTeX_Fraktur-Bold.woff2',
  'web/katex/fonts/KaTeX_Fraktur-Regular.woff2',
  'web/katex/fonts/KaTeX_Main-Bold.woff2',
  'web/katex/fonts/KaTeX_Main-BoldItalic.woff2',
  'web/katex/fonts/KaTeX_Main-Italic.woff2',
  'web/katex/fonts/KaTeX_Main-Regular.woff2',
  'web/katex/fonts/KaTeX_Math-BoldItalic.woff2',
  'web/katex/fonts/KaTeX_Math-Italic.woff2',
  'web/katex/fonts/KaTeX_SansSerif-Bold.woff2',
  'web/katex/fonts/KaTeX_SansSerif-Italic.woff2',
  'web/katex/fonts/KaTeX_SansSerif-Regular.woff2',
  'web/katex/fonts/KaTeX_Script-Regular.woff2',
  'web/katex/fonts/KaTeX_Size1-Regular.woff2',
  'web/katex/fonts/KaTeX_Size2-Regular.woff2',
  'web/katex/fonts/KaTeX_Size3-Regular.woff2',
  'web/katex/fonts/KaTeX_Size4-Regular.woff2',
  'web/katex/fonts/KaTeX_Typewriter-Regular.woff2'
];


self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      /* {cache:'reload'} 強制繞過瀏覽器 HTTP 快取 —— 避免把 max-age(JS 快取一天)內的舊資產烤進殼。
         經典 PWA 陷阱:修正發佈後 SW 重裝,cache.addAll 卻從 HTTP 快取抓到舊 JS,SW 從此餵舊碼。
         逐檔 fetch+put,任一失敗即整體 reject(維持 addAll 的原子性:不裝半殘的殼)。 */
      return Promise.all(APP_SHELL_FILES.map(function (u) {
        return fetch(new Request(u, { cache: 'reload' })).then(function (resp) {
          if (!resp || !resp.ok) { throw new Error('precache 失敗: ' + u); }
          return cache.put(u, resp);
        });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return key !== SHELL_CACHE && key !== DATA_CACHE;
        }).map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isDataRequest(url) {
  return url.pathname.indexOf('/data/') !== -1;
}


/* data/ 的 stale-while-revalidate:命中先回快取(首屏速度與 cache-first 相同),
   同時在背景重新驗證並更新快取(下次載入即最新);未命中才等網路。離線行為不變。

   為何從 cache-first 改過來(2026-07-25):cache-first 命中即回、永不 revalidate,
   資料一進 DATA_CACHE 就凍結到升 CACHE_VERSION 為止——更新詳解後重整仍看到舊版,
   誤以為「無詳解」。SWR 讓資料更新此後免升版自然收斂。

   三個不可省略的細節(Fable 裁決 2026-07-25,原提案漏了全部三個):
   ① event.waitUntil 保命——respondWith 一回快取,瀏覽器隨時可終止 SW(行動裝置尤甚),
      不掛 waitUntil 的背景 fetch 會被砍在半途,更新靜默丟失。
   ② {cache:'no-cache'} 強制條件式驗證——SW 內 fetch 預設走 HTTP 快取,新鮮期內
      「驗證」會直接拿回舊副本、一個 byte 都沒上網,SWR 形同虛設。帶此旗標後每次都發
      If-None-Match:內容沒變回 304(近零流量)、由 HTTP 快取層重組成 200 交給 SW
      (304 不會傳進來,response.ok 檢查照常有效);真的變了才傳全檔。
      與 _headers 的 no-cache 互補:header 管所有非 SW 路徑,此旗標管 SW 自己、不依賴部署狀態。
   ③ 背景失敗吞錯——離線時背景驗證必然 reject,快取版照常服務,不噴 console 錯、
      也不讓 waitUntil 收到 rejected promise 而記為 SW 錯誤。

   選配檔(relations.json / essay_samples.json)缺檔:404 不通過 response.ok,不存進
   cache,由呼叫端 fetchJson 的 .catch 接手,行為與原版一致。 */
function handleDataRequest(event, request) {
  return caches.open(DATA_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var revalidate = fetch(new Request(request.url, { cache: 'no-cache' }))
        .then(function (response) {
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        });
      if (cached) {
        event.waitUntil(revalidate.catch(function () { /* 離線/伺服器錯:下次再驗 */ }));
        return cached;
      }
      return revalidate.catch(function () {
        /* 離線且本機無快取:回一個 404,讓呼叫端 fetchJson 的 .catch 接手
           (必要檔如 bank.json 走既有 load-error fallback;選配檔安靜略過)。 */
        return new Response(null, { status: 404, statusText: 'offline, not cached' });
      });
    });
  });
}

/* navigation(整頁載入):先網路(拿最新頁),離線再回退。
   回退順序:先給該頁自身的快取版本(命中即回原頁),落空再回退 app 殼
   web/index.html(讓 SPA 引擎先跑起來,再由前端 JS 走 data cache 復原可用科目)。
   根 landing(/、/index.html)本身已在 shell cache,第一步 cache.match 就會命中。 */
function handleNavigationRequest(request) {
  return fetch(request).catch(function () {
    return caches.open(SHELL_CACHE).then(function (cache) {
      return cache.match(request).then(function (cached) {
        /* 絕對路徑,避免相對解析歧義(precache key 就是 /web/index.html)。 */
        return cached || cache.match('/web/index.html');
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') { return; }

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) { return; }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  if (isDataRequest(url)) {
    event.respondWith(handleDataRequest(event, request));
    return;
  }

  /* app shell 檔案:cache-first,沒有才 network(理論上 install 已存全,
     這裡是保險絲——例如新增檔案忘記加進清單時,至少 online 還能用)。 */
  event.respondWith(
    caches.match(request).then(function (cached) {
      return cached || fetch(request);
    })
  );
});
