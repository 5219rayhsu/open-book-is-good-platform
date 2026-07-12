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
      runtime cache-first + network fallback,「造訪過的科目才離線
      可用」——使用者打開某科練習時,fetch 到的 bank.json /
      explanations.json / figures/*.png 才會被存進 DATA_CACHE。
      選配檔(relations.json / essay_samples.json)缺檔時,
      SW 不把失敗回應存進 cache、也不視為錯誤。
   ============================================================ */

var CACHE_VERSION = 'v7';  /* v7:封面／選科主題切換 theme-boot.js（預設白底、與內部考科共用 obig:theme 偏好）。v6:預快取改 {cache:'reload'} 繞過 HTTP 快取,修「v5 殼烤進舊 exams.js → 切換跳回原科」。v5=類科兩級選科。v4=教師檢定改名+setExam 導航修正 */
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

/* 選配、可能缺檔的資料檔名——命中就不視為錯誤、也不快取失敗回應。 */
var OPTIONAL_DATA_FILES = ['relations.json', 'essay_samples.json'];

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

function isOptionalDataFile(url) {
  return OPTIONAL_DATA_FILES.some(function (name) {
    return url.pathname.slice(-name.length) === name;
  });
}

/* data/ 的 cache-first:先看本機有沒有,沒有才打網路,打到才存起來。
   選配檔缺檔時直接把「找不到」往上丟給呼叫端的 fetchJson 去吞
   (它本來就有 .catch 容錯),不快取這個失敗回應、也不印額外錯誤。 */
function handleDataRequest(request, url) {
  return caches.open(DATA_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) { return cached; }
      return fetch(request).then(function (response) {
        if (response && response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function () {
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
    event.respondWith(handleDataRequest(request, url));
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
