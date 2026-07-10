'use strict';
/* ============================================================
   題庫 / 關聯資料載入 — 線上 fetch 為主路徑(Cloudflare Pages),三層回退:

   1) window.__BANK__ / window.__REL__:歷史相容分支(離線單檔內嵌);線上站不存在此變數,自動略過。
   2) fetch dataUrl(...)(../data/<考試>/*.json):**線上站與 http server 開發版的主路徑**。
      在 file:// 直接開啟時瀏覽器會擋 fetch(拋例外),我們吞掉後落到第 3 層。
   3) 拖放 / 選檔 fallback:前兩層都拿不到時(暫時性網路問題或 file:// 開啟),讓使用者手動餵 JSON。

   本檔只負責「解析來源」,不碰畫面與狀態;命中後回呼 app.js 的 setBank /
   setRelations。函式皆為全域(與既有 ES5 全域腳本風格一致,無 import/export,
   故可在 file:// 下以 <script src> 直接載入)。
   ============================================================ */

function isBankShape(obj) {
  return !!obj && Array.isArray(obj.questions) && obj.questions.length > 0 &&
    typeof obj.questions[0].qid === 'string' && Array.isArray(obj.questions[0].options);
}

/* 關聯檔:{meta, relations:{qid:{similar,opposite,related}}} 或直接是 {qid:{...}} */
function looksLikeRelations(obj) {
  if (!obj || typeof obj !== 'object' || isBankShape(obj)) { return false; }
  var map = obj.relations && typeof obj.relations === 'object' ? obj.relations : obj;
  var keys = Object.keys(map);
  if (keys.length === 0) { return false; }
  var sample = map[keys[0]];
  return !!sample && (Array.isArray(sample.similar) || Array.isArray(sample.opposite) ||
    Array.isArray(sample.related));
}

/* 取出關聯 map(攤平 {relations:{...}} 與直接 {qid:{...}} 兩種形狀) */
function relationsMap(obj) {
  if (!obj) { return null; }
  return (obj.relations && typeof obj.relations === 'object') ? obj.relations : obj;
}

function fetchJson(url) {
  try {
    return fetch(url).then(function (r) {
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      return r.json();
    }).catch(function () { return null; });
  } catch (e) {
    return Promise.resolve(null); // file:// 下 fetch 可能同步拋例外
  }
}

/* 解析題庫:命中 → onBank(bankObj);全部失敗 → onFail() */
function resolveBank(onBank, onFail) {
  if (isBankShape(window.__BANK__)) { onBank(window.__BANK__); return; }
  fetchJson(dataUrl('bank.json')).then(function (b) {
    if (isBankShape(b)) { onBank(b); } else { onFail(); }
  });
}

/* 解析關聯(可選):命中 → onRel(map);拿不到就不呼叫(answer 退化成同科補強) */
function resolveRelations(onRel) {
  if (window.__REL__ && looksLikeRelations(window.__REL__)) {
    onRel(relationsMap(window.__REL__));
    return;
  }
  fetchJson(dataUrl('relations.json')).then(function (r) {
    if (r && looksLikeRelations(r)) { onRel(relationsMap(r)); }
  });
}
