'use strict';
/* ============================================================
   開卷有益｜國考自學系統(統一站) — 核心(orchestrator)
   一份引擎跑多科;當前考試與其專屬常數由 exams.js 的全域 EXAM 提供。
   全 client-side、無外部依賴、無追蹤。進度只存 localStorage(前綴依考試,如 swk_/law_)。

   設計骨幹(內部設計文件另存,不在公開 repo):全程「作答」而非「閱讀」、
     弱點優先、間隔重複到期複習、即時對錯回饋、相似/相悖對照建立直覺、
     單題聚焦版面、真實考卷形式練(歷屆原卷/模擬考)、公式全透明可調。

   底層原則:可解釋(每題都說「為何出這題」)、不操弄
   (無連勝/紅點等成癮設計)、進度只留在使用者的瀏覽器、不上傳、
   對限制誠實(不保證上榜,只揭露為上榜而設計的工作量)。

   檔案分工:loader.js 載入資料、charts.js 純 SVG 圖、diagnostic.js 入學診斷、
   modes.js 原卷/模擬/弱點。本檔提供共用 API(startDrill / startSheet /
   recordAnswer / 共用工具),其餘檔在函式內以全域呼叫,載入順序安全。
   ============================================================ */

/* ===================== 常數 ===================== */
var PREFIX = EXAM.prefix;                 /* localStorage 命名空間,依考試隔離(exams.js) */
var STATE_KEY = PREFIX + 'state_v1';
var SUBJECTS = EXAM.subjects;             /* 當前考試的科目清單(exams.js) */
var LETTERS = ['A', 'B', 'C', 'D', 'E'];   /* 會計師等部分科目為五選項;四選項題自然只用前四個 */
var MODE_WEEKS = { m6: 26, m12: 52 };   /* 舊單維模式對照(僅供狀態遷移 fallback) */
var MASTER_REPS = 3;      /* 連續答對次數達此值視為「已掌握」(fallback;實際門檻見 masterRepsFor) */

/* 精熟門檻隨程度而變:無基礎連對 3 次、有基礎 2 次才算掌握。無基礎者未掌握更多更久、
   每週量自然較高(公式透明、可解釋)。 */
function masterRepsFor() { return (state.settings.planBasis === 'none') ? 3 : 2; }
var DRILL_CAP = 30;       /* 關聯補強佇列上限 */
var RECENT_LOG = 300;     /* 弱項計算採用的近期作答筆數 */
var TREND_DAYS = 30;
var PASS_LINE = 0.6;      /* 答對率自我對照線(60%);非官方錄取標準,各考試錄取制不同 */

var SUBJECT_NOTES = EXAM.notes;          /* 當前考試的各科說明(exams.js) */

/* ===================== 小工具 ===================== */
function $(id) { return document.getElementById(id); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
/* 時間戳(nowStamp/dayPart)與落點統計(recordExam/examStats/completionCount)在 stats.js。 */
function addDays(iso, n) {
  var p = iso.split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function diffDays(a, b) {
  var pa = a.split('-'), pb = b.split('-');
  var da = new Date(Number(pa[0]), Number(pa[1]) - 1, Number(pa[2]));
  var db = new Date(Number(pb[0]), Number(pb[1]) - 1, Number(pb[2]));
  return Math.round((db - da) / 86400000);
}
function el(tag, attrs, text) {
  var node = document.createElement(tag);
  if (attrs) { Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); }); }
  if (text !== undefined) { node.textContent = text; }
  return node;
}
function pct(x) { return Math.round(x * 100) + '%'; }

/* 無障礙:把訊息寫進 #sr-announce(aria-live)讓螢幕報讀器念出 ——
   答對/答錯、評分結果等。為了讓「連續相同訊息」也能被重新朗讀,
   附加 0–3 個零寬空白(\u200B,報讀器不發音)使 textContent 每次都不同。 */
var _annCount = 0;
function announce(msg) {
  var region = $('sr-announce');
  if (!region) { return; }
  /* pad 長度循環 1→2→3→4→1(永遠 ≥1、連續必相異)→ 連續相同訊息也會被重新朗讀 */
  _annCount = (_annCount % 4) + 1;
  var pad = '';
  for (var i = 0; i < _annCount; i++) { pad += '\u200B'; }
  region.textContent = String(msg || '') + pad;
}
function shuffle(arr) { /* Fisher–Yates(就地洗,呼叫端先 copy)*/
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/* ===================== 狀態(localStorage,不可變更新) ===================== */
function defaultState() {
  return {
    srs: {},        /* qid → {ef,reps,interval,lapses,due,last} */
    log: [],        /* {t,ts,qid,subject,correct,mode}(ts=24h 時間戳,供時段分析/歷史) */
    drill: [],      /* {qid,why,from} 答錯觸發的關聯補強佇列 */
    exams: [],      /* 考試形式整卷成績 {ts,mode,total,ok}:落點/平均唯一來源(原卷/完整模擬/完整診斷才入) */
    settings: {
      /* 備考模式 2×2:程度 planBasis(影響精熟門檻)× 時程 planWeeks(每週量分母),兩維獨立。 */
      planBasis: 'has', planWeeks: 26, start: todayStr(), includeReview: false,
      includeLegacy: false,  /* 舊年度(101-109)歷史題庫:預設不計入正式練習 */
      diagnosedAt: null, examGoal: null,  /* 入學診斷後寫入 */
      userName: '', namePromptedAt: null  /* 命名功能(naming.js):學習者名字、是否問過 */
    }
  };
}
/* 狀態遷移:舊單維 mode → 兩維度。m6→有基礎・26 週、m12→無基礎・52 週,遷移後移除 mode。 */
function migrateModeSettings(s) {
  if (!s) { return; }
  var hasNew = (typeof s.planWeeks !== 'undefined') && (typeof s.planBasis !== 'undefined');
  if (typeof s.mode !== 'undefined' && !hasNew) {
    if (s.mode === 'm12') { s.planWeeks = 52; s.planBasis = 'none'; }
    else { s.planWeeks = 26; s.planBasis = 'has'; }
  }
  if (typeof s.planWeeks === 'undefined') { s.planWeeks = 26; }
  if (typeof s.planBasis === 'undefined') { s.planBasis = 'has'; }
  delete s.mode;
}
function loadState() {
  try {
    var raw = localStorage.getItem(STATE_KEY);
    /* 含進度副本:本機無紀錄但檔案被注入 window.__SEED_STATE__ 時以種子為起點(已有紀錄不覆蓋) */
    if (!raw && window.__SEED_STATE__ && typeof window.__SEED_STATE__ === 'object') {
      raw = JSON.stringify(window.__SEED_STATE__);
    }
    if (!raw) { return defaultState(); }
    var st = JSON.parse(raw);
    if (!st || typeof st.srs !== 'object' || !Array.isArray(st.log)) { return defaultState(); }
    var def = defaultState();
    if (!st.settings) { st.settings = def.settings; }
    else { st.settings = Object.assign({}, def.settings, st.settings); }
    migrateModeSettings(st.settings);   /* 舊版單維 mode → 新版 (planBasis, planWeeks) */
    if (!Array.isArray(st.drill)) { st.drill = []; }
    if (!Array.isArray(st.exams)) { st.exams = []; }   /* 舊資料無 exams → 補空 */
    return st;
  } catch (e) { return defaultState(); }
}
var state = loadState();

function saveState(next) {
  state = next;
  try { localStorage.setItem(STATE_KEY, JSON.stringify(next)); }
  catch (e) { /* 容量滿時靜默失敗,匯出按鈕仍可救資料 */ }
}
function patchState(patch) { saveState(Object.assign({}, state, patch)); }
function patchSettings(patch) {
  patchState({ settings: Object.assign({}, state.settings, patch) });
}

/* ===================== SRS 引擎(簡化 SM-2)=====================
   說明:web 端實際採用此內建引擎(可重現、已驗證可運作)。scripts/srs.py 與
   web/srs.js 為對拍版本,供 tests/ 的逐位元一致性測試;兩者保持獨立不互相干擾。 */
function reviewCard(card, correct) {
  var c = card || { ef: 2.5, reps: 0, interval: 0, lapses: 0 };
  var q = correct ? 5 : 2;
  var ef = c.ef, reps = c.reps, interval = c.interval, lapses = c.lapses || 0;
  if (q < 3) { reps = 0; interval = 1; lapses += 1; }
  else {
    reps += 1;
    interval = (reps === 1) ? 1 : (reps === 2) ? 6 : Math.round(interval * ef);
  }
  ef = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return {
    ef: Math.round(ef * 100) / 100, reps: reps, interval: interval,
    lapses: lapses, due: addDays(todayStr(), interval), last: todayStr()
  };
}

/* ===================== 題庫(由 loader.js 餵入) ===================== */
var bank = null;        /* 原始 bank.json 物件 */
var relations = null;   /* qid → {similar,opposite,related}(可選) */
var usable = [];        /* 可練題(parse ok + 有答案;設定可納入待校題) */
var byQid = {};
var papersIndex = [];   /* [{year,round,subject,qids:[...]}] 供「歷屆原卷」 */

function rebuildUsable() {
  var inclReview = state.settings.includeReview;
  var inclLegacy = !!state.settings.includeLegacy;   /* 舊存檔無此欄 → false */
  usable = []; byQid = {};
  if (!bank) { return; }
  bank.questions.forEach(function (q) {
    byQid[q.qid] = q;   /* byQid 保留全題庫,讓歷史紀錄能還原已答過的舊年題 */
    if (q.legacy === true && !inclLegacy) { return; }   /* 預設排除 101-109 歷史題庫 */
    var parseOk = (q.parse === 'ok') || (inclReview && q.parse === 'review');
    /* 可練＝有答案＋至少 2 選項。寫死「恰 4 選項」會誤排 5 選項自然/社會、10 選項英文
       克漏字等「非 4 選項的單選題」(gsat 約 258 題);多選題(type=多選,gsat 213 題)亦納入
       ——多選 UI／集合評分已支援(run.js wireMultiToggle/markMCQCard、recordAnswer 排序比對)。 */
    if (parseOk && q.answer && q.options.length >= 2) { usable.push(q); }
  });
  buildPapersIndex();
}
function buildPapersIndex() {
  var groups = {};
  function add(q) {
    var key = q.year + '|' + q.round + '|' + q.subject;
    if (!groups[key]) { groups[key] = { year: q.year, round: q.round, subject: q.subject, qids: [] }; }
    groups[key].qids.push(q.qid);
  }
  usable.forEach(add);
  /* 非選(簡答)inline 入原卷:與選擇同卷同時間,題組可選擇＋簡答混合,按 no 排序自然交錯。
     不入 usable→不進弱點/模擬/單題練習池、不汙染落點;只在「歷屆原卷」整卷出現。 */
  if (bank) {
    var inclLegacy = !!state.settings.includeLegacy;
    bank.questions.forEach(function (q) {
      if (q.type !== '非選' || q.parse !== 'ok') { return; }
      if (q.legacy === true && !inclLegacy) { return; }
      add(q);
    });
  }
  papersIndex = Object.keys(groups).map(function (k) {
    var g = groups[k];
    g.qids.sort(function (a, b) { return byQid[a].no - byQid[b].no; });
    return g;
  }).sort(function (a, b) {
    if (a.year !== b.year) { return b.year - a.year; }
    if (a.round !== b.round) { return a.round < b.round ? -1 : 1; }
    return SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject);
  });
}
function setBank(obj) {
  bank = obj;
  rebuildUsable();
  $('load-error').hidden = true;
  renderAll();
  startToday();
  maybeAskName();   /* naming.js:首次先問名字 → 完成後才進入學診斷 */
}
function setRelations(map) { relations = map; renderStatus(); }

/* ===================== 統計:科目正確率、弱項權重 ===================== */
function subjectStats(recentOnly) {
  var slice = recentOnly ? state.log.slice(-RECENT_LOG) : state.log;
  var s = {};
  SUBJECTS.forEach(function (sub) { s[sub] = { n: 0, ok: 0 }; });
  slice.forEach(function (e) {
    if (e.mode === 'essay') { return; }  /* 申論以涵蓋度計分,不混入選擇題正確率雷達 */
    if (!s[e.subject]) { return; }       /* 略過非預期科目(匯入的舊紀錄),避免冒出意外鍵 */
    s[e.subject].n += 1;
    if (e.correct) { s[e.subject].ok += 1; }
  });
  return s;
}

/* 申論作答紀錄(coverage 0..1 涵蓋度;selfRating 1..5 論述自評)。
   獨立計分,不進選擇題正確率;essays.js 與每日摘要會用到。 */
function recordEssay(q, coverage, selfRating) {
  var logNext = state.log.concat([{
    t: todayStr(), ts: nowStamp(), qid: q.qid, subject: q.subject, mode: 'essay',
    coverage: (coverage == null ? null : Math.round(coverage * 100) / 100),
    selfRating: selfRating || null
  }]);
  saveState(Object.assign({}, state, { log: logNext }));
}
function essayStats() {
  /* covN 與 n 分開:平均涵蓋度 = cov / covN(只算有涵蓋度的);平均自評 = rateSum / rated */
  var by = {}; SUBJECTS.forEach(function (s) { by[s] = { n: 0, cov: 0, covN: 0, rated: 0, rateSum: 0 }; });
  state.log.forEach(function (e) {
    if (e.mode !== 'essay' || !by[e.subject]) { return; }
    by[e.subject].n += 1;
    if (typeof e.coverage === 'number') { by[e.subject].cov += e.coverage; by[e.subject].covN += 1; }
    if (e.selfRating) { by[e.subject].rated += 1; by[e.subject].rateSum += e.selfRating; }
  });
  return by;
}
function weakWeights() {
  var s = subjectStats(true), w = {};
  SUBJECTS.forEach(function (sub) {
    var t = s[sub];
    w[sub] = (t.n === 0) ? 1.0 : (1 - t.ok / t.n) + 0.15;
  });
  return w;
}
function weakestSubject() {
  /* 有作答資料中正確率最低者;全無資料 → 回傳 null(交由呼叫端處理) */
  var s = subjectStats(true), worst = null, worstAcc = 2;
  SUBJECTS.forEach(function (sub) {
    var t = s[sub];
    if (t.n >= 3) { var acc = t.ok / t.n; if (acc < worstAcc) { worstAcc = acc; worst = sub; } }
  });
  return worst;
}
function weightedSubjectPick(weights, pool) {
  var avail = SUBJECTS.filter(function (sub) {
    return pool.some(function (q) { return q.subject === sub; });
  });
  if (avail.length === 0) { return null; }
  var total = avail.reduce(function (a, sub) { return a + weights[sub]; }, 0);
  var r = Math.random() * total;
  for (var i = 0; i < avail.length; i++) {
    r -= weights[avail[i]];
    if (r <= 0) { return avail[i]; }
  }
  return avail[avail.length - 1];
}

/* ===================== 統一計分:寫入 log + SRS(不可變) =====================
   所有作答路徑(單題練習 / 原卷 / 模擬 / 弱點 / 診斷)都經這裡,確保雷達、趨勢、
   錯題本、藍圖一致。countSrs=false 時只記 log 不排程(目前未使用,保留彈性)。 */
/* 評分:送分題(#)一律給分;其餘排序後比對 → 單選('A'=='A')與多選('DB'→'BD'=='BD')共用,
   未作答('_')自然不等。pickedLetter 一律字母字串(單選一字、多選排序字串)。 */
function sortLetters(s) { return String(s).split('').sort().join(''); }
function recordAnswer(q, pickedLetter, opts) {
  opts = opts || {};
  // 送分題（官方答案 #）：一律給分，計為答對，不污染統計與弱項佇列。
  var correct = (q.answer === '#') ? true : (sortLetters(pickedLetter) === sortLetters(q.answer));
  var srsNext = state.srs;
  if (opts.countSrs !== false) {
    var card = reviewCard(state.srs[q.qid], correct);
    srsNext = Object.assign({}, state.srs);
    srsNext[q.qid] = card;
  }
  var logNext = state.log.concat([{
    t: todayStr(), ts: nowStamp(), qid: q.qid, subject: q.subject,
    correct: correct, pick: pickedLetter, mode: opts.mode || 'practice'
  }]);
  saveState(Object.assign({}, state, { srs: srsNext, log: logNext }));
  if (!correct && opts.enqueueRel !== false) { enqueueRelated(q); }
  return correct;
}

function enqueueRelated(q) {
  var adds = [];
  var rel = relations ? relations[q.qid] : null;
  function relIds(list, cap) {
    return (list || []).slice(0, cap).map(function (x) { return x && x.qid ? x.qid : x; });
  }
  function push(ids, why) {
    ids.forEach(function (qid) {
      if (qid && qid !== q.qid && byQid[qid]) { adds.push({ qid: qid, why: why, from: q.qid }); }
    });
  }
  if (rel) {
    push(relIds(rel.opposite, 2), '相悖');
    push(relIds(rel.similar, 2), '相似');
    push(relIds(rel.related, 1), '關聯');
  } else {
    var pool = usable.filter(function (x) {
      return x.subject === q.subject && x.qid !== q.qid &&
        (!state.srs[x.qid] || state.srs[x.qid].reps < masterRepsFor());
    });
    if (pool.length > 0) {
      adds.push({ qid: pool[Math.floor(Math.random() * pool.length)].qid, why: '同科補強（無關聯資料）', from: q.qid });
    }
  }
  if (adds.length === 0) { return; }
  var seen = {};
  state.drill.forEach(function (d) { seen[d.qid] = true; });
  var merged = state.drill.concat(adds.filter(function (d) {
    if (seen[d.qid]) { return false; } seen[d.qid] = true; return true;
  })).slice(0, DRILL_CAP);
  saveState(Object.assign({}, state, { drill: merged }));
}

/* ===================== 作答引擎 ===================== */
/* 共用題卡 buildMCQCard / markMCQCard、逐題引擎 startDrill、整卷引擎 startSheet、
   返回連結 backLink 皆在 run.js(作答節奏自成一格,獨立成檔)。 */

/* ===================== 單題練習(自適應、無限、即時回饋) ===================== */
var overrideQueue = [];   /* 錯題本「重練此組」的臨時佇列 */
var current = null;
var session = { n: 0, ok: 0 };

function dueCards() {
  var t = todayStr();
  return Object.keys(state.srs).filter(function (qid) {
    return byQid[qid] && state.srs[qid].due <= t;
  }).sort(function (a, b) { return state.srs[a].due < state.srs[b].due ? -1 : 1; });
}
function unseenPool() { return usable.filter(function (q) { return !state.srs[q.qid]; }); }

function pickNext() {
  if (overrideQueue.length > 0) {
    var oq = overrideQueue.shift();
    if (byQid[oq]) { return { q: byQid[oq], reasonTag: '錯題重練', reason: '你在錯題複習點了「重練此組」，趁印象重新提取。' }; }
  }
  var drill = state.drill.filter(function (d) { return byQid[d.qid]; });
  if (drill.length > 0) {
    var d0 = drill[0];
    saveState(Object.assign({}, state, { drill: drill.slice(1) }));
    return { q: byQid[d0.qid], reasonTag: '弱點補強',
      reason: '關聯補強(' + d0.why + ')：剛答錯「' + shortStem(d0.from) + '」，趁記憶熱複習相關概念。' };
  }
  /* SRS 到期複習不在單題練習搶位(時間有限);集中於弱點殲滅,此處以弱項加權新題為主。 */
  var pool = unseenPool();
  if (pool.length === 0) {
    var all = usable.slice();
    if (all.length === 0) { return null; }
    var reps = function (qid) { return (state.srs[qid] && state.srs[qid].reps) || 0; };
    all.sort(function (a, b) { return reps(a.qid) - reps(b.qid); });
    var weakest = all[Math.floor(Math.random() * Math.min(20, all.length))];
    return { q: weakest, reasonTag: '弱點補強', reason: '全題庫皆已練過：挑掌握度最低的題再鞏固。' };
  }
  var w = weakWeights();
  var sub = weightedSubjectPick(w, pool);
  var subset = pool.filter(function (q) { return q.subject === sub; });
  var q = subset[Math.floor(Math.random() * subset.length)];
  var s = subjectStats(true)[sub];
  var why = (s.n === 0)
    ? '新題：此科尚無作答紀錄，先建立基準（先量出起點）。'
    : '弱項加權：「' + sub + '」近期正確率 ' + pct(s.ok / Math.max(s.n, 1)) + '，加重練習（弱點優先）。';
  return { q: q, reasonTag: (s.n === 0 ? '建立基準' : '弱點補強'), reason: why };
}
function shortStem(qid) {
  var q = byQid[qid];
  if (!q) { return '某題'; }
  return q.stem.length > 16 ? q.stem.slice(0, 16) + '…' : q.stem;
}

function startToday() {
  if (usable.length === 0) { return; }
  current = pickNext();
  renderToday();
}
function renderToday() {
  var host = $('today-card');
  host.textContent = '';
  if (!current) { $('practice-empty').hidden = false; return; }
  $('practice-empty').hidden = true;
  /* 作答畫面保持乾淨:不顯示「為何出這題」等提示(自適應邏輯照常運作,只是不外露) */
  /* 題組題拆到單題練習時,仍帶題組路徑指示＋本體,單看一題也答得了。 */
  if (typeof groupHeaderEl === 'function') { var _gh = groupHeaderEl(current.q); if (_gh) { host.appendChild(_gh); } }
  if (typeof passageEl === 'function') { var _pg = passageEl(current.q.passage); if (_pg) { host.appendChild(_pg); } }
  var card = buildMCQCard(current.q, null);
  wireAnswerCard(card, current.q, function (picked) { todayAnswer(card, picked); });
  host.appendChild(card);
}
function todayAnswer(card, picked) {
  var q = current.q;
  var correct = recordAnswer(q, picked, { mode: 'practice' });
  session = { n: session.n + 1, ok: session.ok + (correct ? 1 : 0) };
  markMCQCard(card, q, picked);
  var fbText = (q.answer === '#') ? '本題送分（考選部公告一律給分）。'
    : (correct ? '答對。正解(' + q.answer + ')。'
      : '答錯。正解(' + q.answer + ')。');
  var fb = el('p', { 'class': 'feedback ' + (correct ? 'good' : 'bad') }, fbText);
  card.appendChild(fb);
  /* 螢幕報讀器朗讀對錯。作答畫面只列對錯與正解,不掛教練金句(金句只在能力雷達/學習藍圖出現),避免壓力與干擾 */
  announce(fbText);
  var _ex = (typeof explEl === 'function') ? explEl(q.qid) : null;
  if (_ex) { card.appendChild(_ex); }   /* 本題解釋(AI 整理,explain.js) */
  var nextBtn = el('button', { type: 'button' }, '下一題');
  nextBtn.addEventListener('click', function () { startToday(); });
  card.appendChild(qaActionRow(q.qid, nextBtn));   /* 左疑義回報、右下一題,同列 */
  nextBtn.focus();
  renderPracticeHead();
}
/* 每日使用個人化摘要 —— 讀 localStorage 裡累積的作答歷史(=記憶),
   轉成「今天/本週練況、學習天數、今日建議重點」。不做連勝壓力,只給資訊與方向。 */
function renderDailySummary() {
  var box = $('daily-summary');
  if (!box) { return; }
  box.textContent = '';
  if (usable.length === 0) { return; }
  var today = todayStr();
  var weekAgo = addDays(today, -6);
  var days = {}, subjCount = {};
  var todayN = 0, todayOk = 0, todayEssay = 0, weekN = 0;
  SUBJECTS.forEach(function (s) { subjCount[s] = 0; });
  state.log.forEach(function (e) {
    days[e.t] = true;
    if (e.t >= weekAgo) { weekN += 1; }
    if (subjCount[e.subject] !== undefined && e.t >= weekAgo) { subjCount[e.subject] += 1; }
    if (e.t === today) {
      if (e.mode === 'essay') { todayEssay += 1; }
      else { todayN += 1; if (e.correct) { todayOk += 1; } }
    }
  });
  var activeDays = Object.keys(days).length;
  if (activeDays === 0) {
    var hint = el('div', { 'class': 'daily-hint' });
    hint.appendChild(el('p', null,
      '還沒有作答紀錄。你可以先四處看看（學習藍圖、各種練習模式），準備好再做入學測驗抓出強弱；' +
      '或直接從下面這題開始。你的進度預設存在這台裝置（不上傳，登入雲端同步規劃中）。'));
    var row = el('p', { 'class': 'hint-actions' });
    var diagBtn = el('button', { type: 'button' }, '做入學測驗');
    diagBtn.addEventListener('click', function () {
      if (typeof showDiagOverlay === 'function') { showDiagOverlay(); }
    });
    row.appendChild(diagBtn);
    hint.appendChild(row);
    box.appendChild(hint);
    return;
  }
  var line1 = '今天 ' + (todayN + todayEssay) + ' 題';
  if (todayN > 0) { line1 += '(選擇題 ' + todayN + '，答對 ' + todayOk + ',' + pct(todayOk / todayN) + ')'; }
  if (todayEssay > 0) { line1 += '・申論 ' + todayEssay + ' 題'; }
  var topSub = null, topN = 0;
  SUBJECTS.forEach(function (s) { if (subjCount[s] > topN) { topN = subjCount[s]; topSub = s; } });
  var line2 = '本週 ' + weekN + ' 題' + (topSub ? '・最常練「' + topSub + '」' : '') + '・累計學習 ' + activeDays + ' 天';

  var card = el('div', { 'class': 'daily-summary-card' });
  card.appendChild(el('div', { 'class': 'daily-line strong' }, line1));
  card.appendChild(el('div', { 'class': 'daily-line' }, line2));

  /* 今日建議重點(個人化) */
  var weak = weakestSubject();
  var focus, focusBtn = null;
  var totalAns = state.log.filter(function (e) { return e.mode !== 'essay'; }).length;
  if (totalAns < 12) {
    focus = '今日重點：先把各科各練幾題（或做入學診斷），系統才能準確找出你的弱項。';
  } else if (weak) {
    var s = subjectStats(true)[weak];
    focus = '今日重點：你最弱的是「' + weak + '」(' + pct(s.ok / Math.max(s.n, 1)) + ')—— 直擊弱點 CP 值最高。';
    focusBtn = { label: '去弱點殲滅', panel: 'cluster' };
  } else {
    focus = '今日重點：各科都在水準之上，維持間隔複習，並用模擬考檢驗實戰手感。';
    focusBtn = { label: '去模擬考', panel: 'mock' };
  }
  var fline = el('div', { 'class': 'daily-line focus' });
  fline.appendChild(document.createTextNode(focus));
  if (focusBtn) {
    fline.appendChild(document.createTextNode(' '));
    var b = el('a', { 'class': 'jump', role: 'button' }, focusBtn.label + ' →');
    b.addEventListener('click', function () { showPanel(focusBtn.panel); });
    fline.appendChild(b);
  }
  card.appendChild(fline);
  box.appendChild(card);
}

function renderPracticeHead() {
  if (usable.length === 0) {
    $('daily-goal').textContent = '題庫未載入';
    $('due-count').textContent = ''; $('session-stats').textContent = '';
    return;
  }
  var wt = weeklyTarget();
  /* 量多時把每日建議取整到 5,數字更好讀;備考初期通常落在 40 ≈ 一份考古卷 */
  var rawDaily = Math.max(1, Math.ceil(wt.perWeek / 7));
  var daily = rawDaily >= 10 ? Math.round(rawDaily / 5) * 5 : rawDaily;
  var paperish = (daily >= 35 && daily <= 45) ? '（約一份考古卷）' : '';
  $('daily-goal').textContent = '今日建議 ' + daily + ' 題' + paperish +
    '・週目標約 ' + wt.perWeek + ' 題（未掌握 ÷ 剩餘週數）';
  var _due = dueCards().length;   /* 單題練習不以 SRS 到期為主;只留輕量提醒導向弱點殲滅 */
  $('due-count').textContent = '補強佇列 ' + state.drill.length + ' 題' +
    (_due > 0 ? '・到期複習 ' + _due + ' 題（在「弱點殲滅」）' : '');
  $('session-stats').textContent = '本次：' + session.n + ' 題，答對 ' + session.ok + ' 題';
}

/* ===================== 錯題複習(科目為概念代理) ===================== */
function wrongMap() {
  var m = {};
  state.log.forEach(function (e) { if (!e.correct && byQid[e.qid]) { m[e.qid] = (m[e.qid] || 0) + 1; } });
  return m;
}
function renderWrongbook() {
  var box = $('wrongbook-list');
  box.textContent = '';
  var wm = wrongMap();
  var qids = Object.keys(wm);
  $('wrongbook-empty').hidden = qids.length > 0;
  if (qids.length === 0) { return; }
  SUBJECTS.forEach(function (sub) {
    var group = qids.filter(function (qid) { return byQid[qid].subject === sub; });
    if (group.length === 0) { return; }
    var sec = el('div', { 'class': 'wrong-group' });
    var head = el('header');
    head.appendChild(el('span', { 'class': 'gname' }, sub + '(' + group.length + ' 題)'));
    var btn = el('button', { type: 'button' }, '重練此組');
    btn.addEventListener('click', function () {
      overrideQueue = shuffle(group.slice());
      showPanel('practice'); startToday();
      announce('開始重練「' + sub + '」的錯題組，共 ' + group.length + ' 題。');
    });
    head.appendChild(btn); sec.appendChild(head);
    var ul = el('ul');
    group.slice(0, 12).forEach(function (qid) {
      var q = byQid[qid];
      ul.appendChild(el('li', null, '【誤 ' + wm[qid] + ' 次】' + q.year + ' 年第 ' + q.no + ' 題：' + q.stem));
    });
    if (group.length > 12) { ul.appendChild(el('li', null, '……其餘 ' + (group.length - 12) + ' 題重練時會出現。')); }
    sec.appendChild(ul); box.appendChild(sec);
  });
}

/* ===================== 學習藍圖 =====================
   masteredSet / weeklyTarget / planPolicyText / renderBlueprint /
   renderCoverage / renderSubjectNotes / setBasis / setWeeks 已切至 blueprint.js
   (維持本檔 <800 行)。皆為全域函式,仍可被本檔 renderAll/diagnostic 直接呼叫。 */

/* ===================== 進度匯出/匯入/副本/重置 =====================
   exportProgress / importProgress / downloadProgressCopy / resetProgress
   皆移至 progress.js(進度操作集中一處);本檔保留載入題庫/
   關聯檔的 handleDataFile(開發版拖放 fallback,依賴 loader.js 的形狀判斷)。 */
function handleDataFile(file) {
  var rd = new FileReader();
  rd.onload = function () {
    try {
      var obj = JSON.parse(String(rd.result));
      if (isBankShape(obj)) { setBank(obj); }
      else if (looksLikeRelations(obj)) { setRelations(relationsMap(obj)); }
      else { alert('看不懂這個 JSON：既不是題庫也不是關聯檔。'); }
    } catch (e) { alert('JSON 解析失敗：' + e.message); }
  };
  rd.readAsText(file);
}

/* ===================== 導覽與整體渲染 ===================== */
var PANELS = ['practice', 'paper', 'mock', 'cluster', 'essay', 'wrongbook',
  'radar', 'trend', 'history', 'blueprint', 'run', 'sheet'];
var NAV_TABS = ['practice', 'paper', 'mock', 'cluster', 'essay', 'wrongbook', 'radar', 'trend', 'history', 'blueprint'];

function showPanel(name) {
  PANELS.forEach(function (p) {
    var panel = $('panel-' + p);
    if (panel) { panel.hidden = (p !== name); }
  });
  /* 用 aria-current="page" 標示所在分頁(<nav> 按鈕語意該用 aria-current 而非 aria-selected)。
     run 高亮回入口 cluster;sheet 多入口、無單一正確分頁 → active=null(不高亮,合規)。 */
  var active = (name === 'run') ? 'cluster' : (name === 'sheet') ? null : name;
  NAV_TABS.forEach(function (p) {
    var tab = $('tab-' + p);
    if (!tab) { return; }
    if (p === active) { tab.setAttribute('aria-current', 'page'); }
    else { tab.removeAttribute('aria-current'); }
  });
  if (name === 'practice') { renderDailySummary(); renderPracticeHead(); if (!current) { startToday(); } }
  if (name === 'paper') { renderPaperPicker(); }
  if (name === 'mock') { renderMockPicker(); }
  if (name === 'cluster') { renderClusterPicker(); }
  if (name === 'essay') { resolveEssays(renderEssayPicker); }
  if (name === 'wrongbook') { renderWrongbook(); }
  if (name === 'radar') { renderRadar(); renderCoachAdvice($('coach-advice')); }
  if (name === 'trend') { renderTrend(); }
  if (name === 'history') { renderHistory(); }
  if (name === 'blueprint') { renderBlueprint(); }
}
function renderStatus() {
  var parts = [];
  if (bank) {
    var reviewN = bank.questions.filter(function (q) { return q.parse === 'review'; }).length;
    parts.push('題庫可練 ' + usable.length + ' 題(全 ' + bank.questions.length +
      ' 題；另 ' + reviewN + ' 題因無官方答案或解析不完整，暫不列入)');
  } else { parts.push('題庫未載入'); }
  parts.push(relations ? '關聯資料：已載入' : '關聯資料：未載入（答錯改以同科補強）');
  $('status-line').textContent = parts.join('｜');
}
function renderAll() {
  renderStatus();
  if (typeof renderNameTag === 'function') { renderNameTag(); }   /* naming.js */
  renderDailySummary();
  renderPracticeHead();
  renderRadar();
  renderTrend();
  renderBlueprint();
  renderWrongbook();
}

/* ===================== 事件繫結 ===================== */
function wireNav() {
  NAV_TABS.forEach(function (p) {
    var tab = $('tab-' + p);
    if (tab) { tab.addEventListener('click', function () { showPanel(p); }); }
  });
}
function wireDrop() {
  var dz = $('drop-zone');
  if (!dz) { return; }
  ['dragover', 'dragenter'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('dragover'); });
  });
  dz.addEventListener('dragleave', function () { dz.classList.remove('dragover'); });
  dz.addEventListener('drop', function (e) {
    e.preventDefault(); dz.classList.remove('dragover');
    Array.prototype.forEach.call(e.dataTransfer.files, handleDataFile);
  });
  $('file-input').addEventListener('change', function (e) {
    Array.prototype.forEach.call(e.target.files, handleDataFile);
  });
}
function wireControls() {
  var help = $('btn-help');
  if (help) { help.addEventListener('click', openHelp); }   /* 使用說明覆蓋層(help.js) */
  var home = $('home-title');
  if (home) { home.addEventListener('click', function () { window.location.href = '../index.html'; }); }   /* 標題回最初首頁(國考／升學選擇) */
  var setBtn = $('btn-settings');
  if (setBtn) { setBtn.addEventListener('click', openSettings); }   /* 設定覆蓋層(settings.js:字體大小／顯示名稱;改名沿用 naming.js showNameOverlay) */
  /* 統一站(線上)不提供進度匯出／匯入／含進度副本(屬離線單檔機制);進度走 localStorage,
     跨裝置同步規畫中。progress.js 的 exportProgress/importProgress 函式保留供未來使用。
     「重置進度」已移入設定面板(settings.js),不再放標頭。 */
  $('basis-has').addEventListener('click', function () { setBasis('has'); });
  $('basis-none').addEventListener('click', function () { setBasis('none'); });
  $('weeks-26').addEventListener('click', function () { setWeeks(26); });
  $('weeks-52').addEventListener('click', function () { setWeeks(52); });
  $('include-review').addEventListener('change', function (e) {
    patchSettings({ includeReview: e.target.checked });
    rebuildUsable(); renderAll();
  });
  var legacyChk = $('include-legacy');
  if (legacyChk) {
    legacyChk.addEventListener('change', function (e) {
      patchSettings({ includeLegacy: e.target.checked });
      rebuildUsable(); renderAll();
    });
  }
  var rd = $('btn-rediagnose');
  if (rd) { rd.addEventListener('click', function () { startDiagnostic('short'); }); }
  var ed = $('exam-date');
  if (ed) { ed.addEventListener('change', function (e) { setExamDate(e.target.value); }); }   /* P4 預計考試日期 */
  var edc = $('exam-date-clear');
  if (edc) { edc.addEventListener('click', function () { setExamDate(''); }); }
}
/* setBasis / setWeeks(備考模式兩維度)在 blueprint.js。 */

/* 鍵盤作答 wireKeyboard 在 run.js(屬作答流程)。 */

/* ===================== 開機 ===================== */
function boot() {
  resolveBank(setBank, function () {
    $('load-error').hidden = false;
    $('practice-empty').hidden = false;
    renderStatus();
  });
  resolveRelations(setRelations);
  resolveEssays();
  if (typeof resolveExpl === 'function') { resolveExpl(); }   /* 本題解釋(explain.js) */
}

document.addEventListener('DOMContentLoaded', function () {
  if (typeof initSettingsPrefs === 'function') { initSettingsPrefs(); }   /* 套用已存字體偏好(settings.js) */
  wireNav(); wireDrop(); wireControls(); wireKeyboard();
  showPanel('practice');
  renderAll();
  boot();
});

/* ===================== PWA:註冊 Service Worker(離線可用＋可安裝) =====================
   溫和更新:新版 SW 裝好後不強制立即 reload(避免打斷正在作答的使用者),
   只在狀態列悄悄提示「重新整理套用新版」,使用者自己選擇時機;下次自然載入也會生效。
   file:// 開啟或瀏覽器不支援時安靜跳過,不影響其餘功能。 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) { return; }
  if (location.protocol !== 'http:' && location.protocol !== 'https:') { return; }

  /* 絕對路徑 /sw.js:script 在站根 → scope 自動為 /,一次涵蓋 /web/(app)與
     /data/(題庫)與根 landing,免設 Service-Worker-Allowed 標頭。 */
  navigator.serviceWorker.register('/sw.js').then(function (reg) {
    reg.addEventListener('updatefound', function () {
      var installing = reg.installing;
      if (!installing) { return; }
      installing.addEventListener('statechange', function () {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          /* 新版已就緒、舊版仍在服務中 —— 悄悄提示,不打斷作答 */
          var line = $('status-line');
          if (line) {
            var note = el('span', { 'class': 'sw-update-note' }, '　（新版已就緒，重新整理即可套用）');
            line.appendChild(note);
          }
        }
      });
    });
  }).catch(function () { /* SW 註冊失敗不影響站台其餘功能,安靜略過 */ });

  /* controllerchange:新 SW 接手時不主動 reload —— 讓使用者下次造訪自然生效,
     避免作答到一半被強制重整。僅記錄狀態供除錯,不做任何 UI 打斷動作。 */
  var refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (refreshing) { return; }
    refreshing = true;
  });
}
registerServiceWorker();
