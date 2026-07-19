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
/* 題目內容指紋:題幹＋選項(去空白、選項排序後)組成,用來判斷「內容是否相同」而非只看 qid——
   跨年重複收錄的考古題(換年份/題號但文字相同)也能被認出。pickNext 冷卻與模擬考去重共用。 */
function qFingerprint(q) {
  if (!q) { return ''; }
  var stem = String(q.stem || '').replace(/\s+/g, '');
  var opts = (q.options || []).slice().map(function (o) { return String(o).replace(/\s+/g, ''); }).sort();
  return stem + '|' + opts.join('|');
}
/* 題幹指紋(模擬考同場互斥用):題幹去除所有空白;回傳 null 不參與互斥。門檻 <13 字
   涵蓋兩層豁免:(1) 空／極短題幹(如 gsat 詞彙單題),(2) 通用萬用題幹——真實考卷本就
   常見多題共用同一句泛用問法(如「下列敘述何者錯誤？」僅 10 字,社工庫組1／組4 等
   同場共用 10 題屬合法情形,不該被互斥擋下);實質孿生題幹(同題幹、不同選項
   的跨年孿生題)跨庫最短為 13 字(律師庫),恰落在互斥側、餘裕為零;通用萬用題幹最長
   12 字——調整此門檻前先重跑十庫孿生分析,別假設有緩衝。同一題幹、不同選項的跨年
   孿生題(社工庫等常見)技術上是不同題,dedupByContent 的內容指紋擋不住,但考生
   同場遇到體感就是重複,故另立此指紋在抽題時做「同場不得出現兩題同指紋」的互斥
   (見 modes.js)。 */
function stemFingerprint(q) {
  if (!q) { return null; }
  var stem = String(q.stem || '').replace(/\s+/g, '');
  if (stem.length < 13) { return null; }
  return stem;
}
/* 內容指紋(模擬考/完整診斷同場互斥第二層):題幹去空白長度 <8 回 null——護欄,與
   dedupByContent 同款,避免 gsat 克漏字共用選項題組被誤塌成同一把指紋;否則回
   qFingerprint(q)(題幹＋選項全內容)。與 stemFingerprint 是兩種粒度的同場互斥:
   stemFingerprint 擋「同題幹、不同選項」的孿生題,這裡擋「內容完全相同」的跨年
   重複收錄題。兩層都只保證「同一場不重複出現」,不同場之間仍各自有機會被抽到——
   即輪替,不像舊版直接用 dedupByContent 把舊年份整個砍出候選池(見 modes.js／
   diagnostic.js 的呼叫端)。 */
function contentFingerprint(q) {
  if (!q) { return null; }
  var stemLen = String(q.stem || '').replace(/\s+/g, '').length;
  if (stemLen < 8) { return null; }
  return qFingerprint(q);
}
/* 內容去重(單題練習冷卻等仍在用;模擬考/完整診斷已改走「同場互斥＋跨場輪替」,
   見 contentFingerprint／stemFingerprint，此函式目前無呼叫端，保留供工具使用):同內容題(跨年重複收錄,換年份/題號但文字相同)
   只留一筆,避免同一次抽題裡出現兩份「同一題」。先依年份新到舊排序(留最新版本),
   短題幹(去空白後 <8 字,如 gsat 詞彙單題)不受去重影響——護欄,避免誤殺合法的短題。 */
function dedupByContent(list) {
  var src = (list || []).slice();
  src.sort(function (a, b) { return String(b.year).localeCompare(String(a.year)); });
  var seen = {}, out = [];
  src.forEach(function (q) {
    var stemLen = String(q.stem || '').replace(/\s+/g, '').length;
    if (stemLen < 8) { out.push(q); return; }   /* 護欄:短題幹一律保留,不判重 */
    var key = qFingerprint(q);
    if (seen[key]) { return; }
    seen[key] = true;
    out.push(q);
  });
  return out;
}

/* ===================== 狀態(localStorage,不可變更新) ===================== */
function defaultState() {
  return {
    srs: {},        /* qid → {ef,reps,interval,lapses,due,last} */
    log: [],        /* {t,ts,qid,subject,correct,mode}(ts=24h 時間戳,供時段分析/歷史) */
    drill: [],      /* {qid,why,from} 答錯觸發的關聯補強佇列 */
    exams: [],      /* 考試形式整卷成績 {ts,mode,total,ok}:落點/平均唯一來源(原卷/完整模擬/完整診斷才入) */
    flags: {},      /* qid → true,使用者手動標記(與對錯無關) */
    saved: {},      /* qid → 時間戳字串,使用者手動收進「儲存專練」 */
    settings: {
      /* 備考模式 2×2:程度 planBasis(影響精熟門檻)× 時程 planWeeks(每週量分母),兩維獨立。 */
      planBasis: 'has', planWeeks: 26, start: todayStr(), includeReview: false,
      includeLegacy: false,  /* 舊年度(101-109)歷史題庫:預設不計入正式練習 */
      includeDeprecated: false,  /* 停考科目(manifest deprecatedSubjects):預設排除出練習/統計/歷屆,打開即全站復原 */
      diagnosedAt: null, examGoal: null,  /* 入學診斷後寫入 */
      userName: '', namePromptedAt: null,  /* 命名功能(naming.js):學習者名字、是否問過 */
      examCategories: []  /* 應考類科(空=全部類科,向下相容);僅分組考試(subjectGroupSep)生效 */
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
    if (!st.flags || typeof st.flags !== 'object') { st.flags = {}; }   /* 舊存檔無 flags → 補空物件 */
    if (!st.saved || typeof st.saved !== 'object') { st.saved = {}; }   /* 舊存檔無 saved → 補空物件 */
    return st;
  } catch (e) { return defaultState(); }
}
var state = loadState();

/* ===================== 應考類科(分組考試如教師檢定,可複選要報考的類科) =====================
   只在 EXAM.subjectGroupSep 有設(allCategoryNames() 非 null)的考試生效;其餘考試恆回 null
   (=不過濾、全部科目),向下相容。examCategories 空陣列(預設,見 defaultState)＝全部類科。 */
function activeCategories() {
  var all = (typeof allCategoryNames === 'function') ? allCategoryNames() : null;
  if (all === null) { return null; }   /* 非分組考試:不套用類科過濾 */
  var sel = state.settings.examCategories;
  if (!Array.isArray(sel) || sel.length === 0) { return null; }   /* 未設定/清空 = 全部類科 */
  var valid = sel.filter(function (c) { return all.indexOf(c) >= 0; });   /* 濾掉已不存在的舊值 */
  return valid.length ? valid : null;
}
/* 依 activeCategories() 收斂 EXAM.subjects:null 回全部科目;否則只留類科前綴落在生效類科內者。 */
function computeActiveSubjects() {
  var cats = activeCategories();
  var base;
  if (cats === null) { base = EXAM.subjects.slice(); }
  else {
    var sep = EXAM.subjectGroupSep;
    base = EXAM.subjects.filter(function (s) {
      var i = s.indexOf(sep);
      var g = (i >= 0) ? s.slice(0, i) : s;
      return cats.indexOf(g) >= 0;
    });
  }
  /* 停考科目過濾:includeDeprecated 為假(預設)時,把 manifest 標了 deprecatedSubjects 的科目
     移出生效 SUBJECTS —— 單題練習/弱點/診斷/雷達/藍圖/模擬/統計/歷屆全站自動排除;
     為真時全部保留(模擬考選科器仍會標註並預設不勾,見 modes.js 既有邏輯)。 */
  if (!(state.settings && state.settings.includeDeprecated)) {
    base = base.filter(function (s) {
      return !(typeof subjectDeprecationNote === 'function' && subjectDeprecationNote(s));
    });
  }
  return base;
}
/* SUBJECTS 依應考類科收斂後的實際生效清單(載入期算定一次;設定頁儲存後靠 reload 重算,
   不做執行期動態切換 —— 各面板/圖表在載入時已讀 SUBJECTS,reload 最簡單可靠)。
   ACTIVE_SUBJ_SET:qid 對應科目是否在生效範圍內的查表,供 inScope() 用。 */
var ACTIVE_SUBJ_SET = {};
function refreshActiveSubjects() {
  SUBJECTS = computeActiveSubjects();
  ACTIVE_SUBJ_SET = {};
  SUBJECTS.forEach(function (s) { ACTIVE_SUBJ_SET[s] = true; });
}
refreshActiveSubjects();
/* 某 qid 是否落在目前生效的應考類科範圍內(byQid 仍是全量題庫,查完再判斷科目)。 */
function inScope(qid) {
  var q = byQid[qid];
  return !!(q && ACTIVE_SUBJ_SET[q.subject]);
}
/* 科目顯示名:只在「恰選一個類科」時省去類科前綴(同分組內科目已無混淆之虞);
   其餘情況(全部類科／選多個類科／非分組考試)照原樣顯示,避免同名科目混淆(如「國語文能力測驗」)。 */
function subjectDisplayLabel(sub) {
  var cats = activeCategories();
  if (cats && cats.length === 1 && typeof subjectShortLabel === 'function') { return subjectShortLabel(sub); }
  return sub;
}

function saveState(next) {
  state = next;
  try { localStorage.setItem(STATE_KEY, JSON.stringify(next)); }
  catch (e) { /* 容量滿時靜默失敗,匯出按鈕仍可救資料 */ }
}
function patchState(patch) { saveState(Object.assign({}, state, patch)); }
function patchSettings(patch) {
  patchState({ settings: Object.assign({}, state.settings, patch) });
}

/* ===================== 儲存(收藏,長期資料;見 ADR-0003) =====================
   儲存只在詳解檢視按「儲存」,收進「儲存題」清單長期保留。
   key 依考試隔離:obig_saved_<考試 key>,值＝qid 陣列,陣列順序＝儲存順序(新的在後)。
   （「標記」是另一件事——卷內暫時記號,只存在 run.js 的 startSheet() 內部記憶體,
   交卷即棄,不寫 localStorage、不在這裡管理。） */
var SAVED_KEY = 'obig_saved_' + EXAM.key;
function _loadSavedIds() {
  try {
    var raw = localStorage.getItem(SAVED_KEY);
    if (raw) { var arr = JSON.parse(raw); if (Array.isArray(arr)) { return arr; } }
  } catch (e) { /* 壞資料當作沒有,不擋作答 */ }
  /* 舊版相容:改版前 saved 曾夾在大 state blob 裡(qid→時間戳),沒有專屬 key 時取一次舊資料當初始值。 */
  if (state.saved && typeof state.saved === 'object') {
    return Object.keys(state.saved).sort(function (a, b) {
      return (state.saved[a] || '') < (state.saved[b] || '') ? -1 : 1;
    });
  }
  return [];
}
var savedIds = _loadSavedIds();
function _persistSaved() {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(savedIds)); }
  catch (e) { /* 容量滿時靜默失敗 */ }
}
function toggleSaved(qid) {
  var i = savedIds.indexOf(qid);
  if (i >= 0) { savedIds.splice(i, 1); } else { savedIds.push(qid); }
  _persistSaved();
  return savedIds.indexOf(qid) >= 0;
}
function isSaved(qid) { return savedIds.indexOf(qid) >= 0; }
/* 詳解檢視的「儲存」按鈕(唯一出處;見 ADR-0003:標記與儲存永不同畫面出現)。
   掛在 explEl() 之後——本題解釋出現的當下就是「詳解檢視」那一刻。 */
function saveButtonEl(qid) {
  var saved0 = isSaved(qid);
  var b = el('button', { type: 'button', 'class': 'q-mark-btn q-save-btn' + (saved0 ? ' active' : ''),
    'aria-pressed': String(saved0) }, saved0 ? '已儲存' : '儲存這題');
  b.addEventListener('click', function () {
    var on = toggleSaved(qid);
    b.textContent = on ? '已儲存' : '儲存這題';
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  var p = el('p', { 'class': 'q-save-row' });
  p.appendChild(b);
  return p;
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
    if (!ACTIVE_SUBJ_SET[q.subject]) { return; }   /* 應考類科過濾;byQid 仍全量 */
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
/* TODO:未來若出現「分組＋申論」考試,essayStats/essaySubjects 需一併按應考類科 scope(今日無此組合,無害)。 */
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
  /* Laplace 平滑(ok+1)/(n+2) ＋ .15 保底權重:沒答過的科不會權重無限大(比照 n 很大時的中庸值),
     強科(ok≈n)仍保有 .15 底,偶爾出現維持敏銳度。 */
  var s = subjectStats(true), w = {};
  SUBJECTS.forEach(function (sub) {
    var t = s[sub];
    w[sub] = (1 - (t.ok + 1) / (t.n + 2)) + 0.15;
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
var pickCounter = 0;      /* 回鍋機制計數器:每 5 次成功配題,安排一題已練過但未精熟的回鍋複習(見 pickNext) */

function dueCards() {
  var t = todayStr();
  return Object.keys(state.srs).filter(function (qid) {
    return inScope(qid) && state.srs[qid].due <= t;
  }).sort(function (a, b) { return state.srs[a].due < state.srs[b].due ? -1 : 1; });
}
function unseenPool() { return usable.filter(function (q) { return !state.srs[q.qid]; }); }

/* 回鍋複習候選:練過(state.srs 有紀錄)、未精熟(reps < masterRepsFor())、且不在最近 20 筆 log。 */
function backReviewCandidates() {
  var recentQids = {};
  state.log.slice(-20).forEach(function (e) { recentQids[e.qid] = true; });
  return usable.filter(function (q) {
    return state.srs[q.qid] && state.srs[q.qid].reps < masterRepsFor() && !recentQids[q.qid];
  });
}
/* 回鍋複習挑題:弱科優先(沿用 weakWeights 加權挑科),科內隨機一題。無候選回 null(呼叫端走原路徑)。 */
function pickBackReview() {
  var cand = backReviewCandidates();
  if (cand.length === 0) { return null; }
  var sub = weightedSubjectPick(weakWeights(), cand);
  var subset = sub ? cand.filter(function (q) { return q.subject === sub; }) : cand;
  var q = subset[Math.floor(Math.random() * subset.length)];
  return { q: q, reasonTag: '回鍋複習', reason: '每五題安排一題已練過但未精熟的舊題，鞏固比只刷新題記得牢。' };
}
function pickNext() {
  if (overrideQueue.length > 0) {
    var oq = overrideQueue.shift();
    if (inScope(oq)) {
      pickCounter += 1;
      return { q: byQid[oq], reasonTag: '錯題重練', reason: '你在錯題複習點了「重練此組」，趁印象重新提取。' };
    }
  }
  var drill = state.drill.filter(function (d) { return inScope(d.qid); });
  if (drill.length > 0) {
    var d0 = drill[0];
    saveState(Object.assign({}, state, { drill: drill.slice(1) }));
    pickCounter += 1;
    return { q: byQid[d0.qid], reasonTag: '弱點補強',
      reason: '關聯補強(' + d0.why + ')：剛答錯「' + shortStem(d0.from) + '」，趁記憶熱複習相關概念。' };
  }
  /* 回鍋機制:每五題安排一題已練過但未精熟的舊題(單純刷新題容易記不牢);無候選就走原路徑。
     優先順位排在 overrideQueue／state.drill 之後、新題之前。 */
  if (pickCounter % 5 === 4) {
    var back = pickBackReview();
    if (back) { pickCounter += 1; return back; }
  }
  /* SRS 到期複習不在單題練習搶位(時間有限);集中於弱點殲滅,此處以弱項加權新題為主。 */
  var pool = unseenPool();
  if (pool.length === 0) {
    var all = usable.slice();
    if (all.length === 0) { return null; }
    var reps = function (qid) { return (state.srs[qid] && state.srs[qid].reps) || 0; };
    all.sort(function (a, b) { return reps(a.qid) - reps(b.qid); });
    var weakest = all[Math.floor(Math.random() * Math.min(20, all.length))];
    pickCounter += 1;
    return { q: weakest, reasonTag: '弱點補強', reason: '全題庫皆已練過：挑掌握度最低的題再鞏固。' };
  }
  /* 跨年重複考古題冷卻:排除指紋出現在最近 30 筆 log 對應題目的候選;排除後空了就退回原本候選,避免題池枯竭卡死。 */
  var recentFP = {};
  state.log.slice(-30).forEach(function (e) {
    var eq = byQid[e.qid];
    if (eq) { recentFP[qFingerprint(eq)] = true; }
  });
  var freshPool = pool.filter(function (q) {
    var stemLen = String(q.stem || '').replace(/\s+/g, '').length;
    if (stemLen < 8) { return true; }   /* 短題幹護欄:不受冷卻排除(保護 gsat 詞彙題) */
    return !recentFP[qFingerprint(q)];
  });
  if (freshPool.length > 0) { pool = freshPool; }
  var w = weakWeights();
  var sub = weightedSubjectPick(w, pool);
  var subset = pool.filter(function (q) { return q.subject === sub; });
  var q = subset[Math.floor(Math.random() * subset.length)];
  var s = subjectStats(true)[sub];
  var why = (s.n === 0)
    ? '新題：此科尚無作答紀錄，先建立基準（先量出起點）。'
    : '弱項加權：「' + sub + '」近期正確率 ' + pct(s.ok / Math.max(s.n, 1)) + '，加重練習（弱點優先）。';
  pickCounter += 1;
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
  if (typeof carryContextEl === 'function') { var _cc = carryContextEl(current.q); if (_cc) { host.appendChild(_cc); } }
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
  if (typeof saveButtonEl === 'function') { card.appendChild(saveButtonEl(q.qid)); }   /* 詳解檢視:儲存(見 ADR-0003) */
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

/* 應考類科 chip(#exam-category):只在分組考試(allCategoryNames() 非 null)顯示,
   標示目前生效的類科範圍(全部類科 或 選定的幾個);非分組考試恆隱藏。與 usable 是否
   已載入無關,故獨立於下方的早退回傳之外。 */
function renderExamCategoryChip() {
  var chip = $('exam-category');
  if (!chip) { return; }
  var allCats = (typeof allCategoryNames === 'function') ? allCategoryNames() : null;
  if (!allCats) { chip.hidden = true; return; }
  var cats = activeCategories();
  chip.textContent = '應考類科：' + (cats ? cats.map(subjectGroupLabel).join('、') : '全部類科');
  chip.hidden = false;
}
function renderPracticeHead() {
  renderExamCategoryChip();
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
  var _drillN = state.drill.filter(function (d) { return inScope(d.qid); }).length;
  $('due-count').textContent = '補強佇列 ' + _drillN + ' 題' +
    (_due > 0 ? '・到期複習 ' + _due + ' 題（在「弱點殲滅」）' : '');
  $('session-stats').textContent = '本次：' + session.n + ' 題，答對 ' + session.ok + ' 題';
}

/* ===================== 錯題複習(可篩選＋可勾選,整包隨機／複選複習) ===================== */
function wrongMap() {
  var m = {};
  state.log.forEach(function (e) { if (!e.correct && inScope(e.qid)) { m[e.qid] = (m[e.qid] || 0) + 1; } });
  return m;
}
/* qid → 該題所有錯誤紀錄的日期('YYYY-MM-DD',取 ts 前 10 碼),供「時間窗」篩選用。 */
function wrongDates() {
  var m = {};
  state.log.forEach(function (e) {
    if (e.correct || !inScope(e.qid)) { return; }
    var d = String(e.ts || e.t || '').slice(0, 10);
    if (!d) { return; }
    (m[e.qid] || (m[e.qid] = [])).push(d);
  });
  return m;
}
/* qid → 該題最近一次答錯的時間戳(ts 字串,'YYYY-MM-DD HH:MM'),供錯題本「最新優先」排序用。 */
function wrongLastTs() {
  var m = {};
  state.log.forEach(function (e) {
    if (e.correct || !inScope(e.qid)) { return; }
    var ts = String(e.ts || e.t || '');
    if (!ts) { return; }
    if (!m[e.qid] || ts > m[e.qid]) { m[e.qid] = ts; }
  });
  return m;
}
var wrongbookYear = '__all__';      /* 篩選:年份(換篩選重繪,不清空已勾選) */
var wrongbookSubject = '__all__';   /* 篩選:科目 */
var wrongbookWindow = '__all__';    /* 篩選:時間窗(全部/今天/近3日/近7日/本月) */
var wrongbookMin2 = false;          /* 篩選:誤 2 次以上 */
var wrongbookSort = 'recent';       /* 排序:recent(最新優先,預設) | count(誤最多優先) */
var wrongbookChecked = {};          /* qid → true,已勾選集合(跨篩選/重繪記憶;「複習選取」後清空) */

function renderWrongbook() {
  var box = $('wrongbook-list');
  box.textContent = '';

  var wm = wrongMap();
  var wd = wrongDates();
  var wl = wrongLastTs();
  var allQids = Object.keys(wm);
  $('wrongbook-empty').hidden = allQids.length > 0;
  if (allQids.length === 0) { wrongbookChecked = {}; return; }

  /* 篩選候選值:只列錯題實際涉及的年份／科目(而非全題庫)。年份新到舊;科目照 SUBJECTS 順序。 */
  var years = [];
  allQids.forEach(function (qid) { var y = byQid[qid].year; if (years.indexOf(y) < 0) { years.push(y); } });
  years.sort(function (a, b) { return Number(b) - Number(a); });
  var subjectsPresent = SUBJECTS.filter(function (s) {
    return allQids.some(function (qid) { return byQid[qid].subject === s; });
  });

  var filterRow = el('div', { 'class': 'wrong-filters' });
  filterRow.appendChild(el('label', { 'for': 'wrong-filter-year' }, '年份：'));
  var yearSel = el('select', { id: 'wrong-filter-year' });
  yearSel.appendChild(el('option', { value: '__all__' }, '全部'));
  years.forEach(function (y) { yearSel.appendChild(el('option', { value: String(y) }, yearLabel(y))); });
  yearSel.value = wrongbookYear;
  yearSel.addEventListener('change', function () { wrongbookYear = yearSel.value; renderWrongbook(); });
  filterRow.appendChild(yearSel);

  filterRow.appendChild(el('label', { 'for': 'wrong-filter-subject' }, '科目：'));
  var subSel = el('select', { id: 'wrong-filter-subject' });
  subSel.appendChild(el('option', { value: '__all__' }, '全部'));
  subjectsPresent.forEach(function (s) { subSel.appendChild(el('option', { value: s }, s)); });
  subSel.value = wrongbookSubject;
  subSel.addEventListener('change', function () { wrongbookSubject = subSel.value; renderWrongbook(); });
  filterRow.appendChild(subSel);

  /* 時間窗:依錯誤紀錄的日期篩選(全部／今天／近 3 日／近 7 日／本月),比照 modes.js 的 .segmented 用法。 */
  var WRONG_WINDOWS = [
    { key: '__all__', name: '全部' }, { key: 'today', name: '今天' },
    { key: '3d', name: '近 3 日' }, { key: '7d', name: '近 7 日' }, { key: 'month', name: '本月' }
  ];
  var winSeg = el('div', { 'class': 'segmented' });
  WRONG_WINDOWS.forEach(function (win) {
    var b = el('button', { type: 'button' }, win.name);
    b.setAttribute('aria-pressed', String(wrongbookWindow === win.key));
    b.addEventListener('click', function () { wrongbookWindow = win.key; renderWrongbook(); });
    winSeg.appendChild(b);
  });
  filterRow.appendChild(winSeg);

  var min2Lab = el('label', { 'class': 'chk chk-inline' });
  var min2Cb = el('input', { type: 'checkbox' });
  min2Cb.checked = wrongbookMin2;
  min2Cb.addEventListener('change', function () { wrongbookMin2 = min2Cb.checked; renderWrongbook(); });
  min2Lab.appendChild(min2Cb); min2Lab.appendChild(document.createTextNode(' 誤 2 次以上'));
  filterRow.appendChild(min2Lab);

  /* 排序:最新優先(預設,依最近一次答錯時間)｜誤最多優先(依誤次數,同次數再依最近錯誤時間)。 */
  var SORT_OPTS = [{ key: 'recent', name: '最新優先（預設）' }, { key: 'count', name: '誤最多優先' }];
  var sortSeg = el('div', { 'class': 'segmented' });
  SORT_OPTS.forEach(function (opt) {
    var b = el('button', { type: 'button' }, opt.name);
    b.setAttribute('aria-pressed', String(wrongbookSort === opt.key));
    b.addEventListener('click', function () { wrongbookSort = opt.key; renderWrongbook(); });
    sortSeg.appendChild(b);
  });
  filterRow.appendChild(el('label', null, '排序：'));
  filterRow.appendChild(sortSeg);

  /* 時間窗是否命中:全部一律通過;否則錯誤紀錄至少一筆落在窗內即算命中。 */
  function inWindow(qid) {
    if (wrongbookWindow === '__all__') { return true; }
    var dates = wd[qid] || [];
    var today = todayStr();
    return dates.some(function (d) {
      if (wrongbookWindow === 'today') { return d === today; }
      var diff = diffDays(d, today);
      if (wrongbookWindow === '3d') { return diff >= 0 && diff < 3; }
      if (wrongbookWindow === '7d') { return diff >= 0 && diff < 7; }
      if (wrongbookWindow === 'month') { return d.slice(0, 7) === today.slice(0, 7); }
      return true;
    });
  }
  var filtered = allQids.filter(function (qid) {
    var q = byQid[qid];
    if (wrongbookYear !== '__all__' && String(q.year) !== wrongbookYear) { return false; }
    if (wrongbookSubject !== '__all__' && q.subject !== wrongbookSubject) { return false; }
    if (!inWindow(qid)) { return false; }
    if (wrongbookMin2 && wm[qid] < 2) { return false; }
    return true;
  });

  var randBtn = el('button', { type: 'button' }, '整包隨機重練（' + filtered.length + ' 題）');
  if (filtered.length === 0) { randBtn.disabled = true; }
  randBtn.addEventListener('click', function () {
    if (filtered.length === 0) { return; }
    overrideQueue = shuffle(filtered.slice());
    showPanel('practice'); startToday();
    announce('開始整包隨機重練，共 ' + filtered.length + ' 題。');
  });
  filterRow.appendChild(randBtn);

  var selAllBtn = el('button', { type: 'button' }, '全選');
  var selNoneBtn = el('button', { type: 'button' }, '全不選');
  filterRow.appendChild(selAllBtn); filterRow.appendChild(selNoneBtn);
  box.appendChild(filterRow);

  /* 排序:'recent'(預設)依最近一次答錯時間降冪;'count' 依誤次數降冪,同次數再依最近錯誤時間降冪。 */
  function cmpRecent(a, b) {
    var ta = wl[a] || '', tb = wl[b] || '';
    return tb < ta ? -1 : (tb > ta ? 1 : 0);
  }
  var sorted = filtered.slice().sort(function (a, b) {
    if (wrongbookSort === 'count' && wm[b] !== wm[a]) { return wm[b] - wm[a]; }
    return cmpRecent(a, b);
  });

  var scroll = el('div', { 'class': 'wrong-list-scroll' });
  var boxes = [];   /* {qid, input} 供全選/全不選/複習選取讀取 */
  sorted.forEach(function (qid) {
    var q = byQid[qid];
    var row = el('div', { 'class': 'wrong-row' });
    var cbId = 'wrong-cb-' + qid;
    var cb = el('input', { type: 'checkbox', id: cbId });
    cb.checked = !!wrongbookChecked[qid];
    cb.addEventListener('change', function () {
      if (cb.checked) { wrongbookChecked[qid] = true; } else { delete wrongbookChecked[qid]; }
    });
    row.appendChild(cb);
    var stem = stemPlain(q.stem);
    /* 縮圖前綴:有 group_id(真題組)→〔題組〕;無 group_id 但題幹命中承上標記(CARRY_RE,run.js
       全域)→〔承上〕——讓錯題本一眼看出這題脫離原本情境會看不懂,建議到原卷複習。 */
    var chainTag = q.group_id ? '〔題組〕'
      : ((typeof CARRY_RE !== 'undefined' && CARRY_RE.test(String(q.stem || ''))) ? '〔承上〕' : '');
    var labelText = '【誤 ' + wm[qid] + ' 次】' + yearLabel(q.year) + ' 第 ' + q.no + ' 題・' + q.subject + '：' + chainTag +
      stem.slice(0, 30) + (stem.length > 30 ? '…' : '');
    row.appendChild(el('label', { 'for': cbId }, labelText));
    scroll.appendChild(row);
    boxes.push({ qid: qid, input: cb });
  });
  box.appendChild(scroll);

  selAllBtn.addEventListener('click', function () {
    boxes.forEach(function (c) { c.input.checked = true; wrongbookChecked[c.qid] = true; });
  });
  selNoneBtn.addEventListener('click', function () {
    boxes.forEach(function (c) { c.input.checked = false; delete wrongbookChecked[c.qid]; });
  });

  var reviewRow = el('div', { 'class': 'wrong-filters' });
  var reviewBtn = el('button', { type: 'button' }, '複習選取');
  reviewBtn.addEventListener('click', function () {
    var picked = boxes.filter(function (c) { return c.input.checked; }).map(function (c) { return c.qid; });
    if (!picked.length) { announce('請先勾選要複習的錯題。'); return; }
    overrideQueue = picked.slice();   /* 維持勾選(顯示)順序,不 shuffle */
    wrongbookChecked = {};
    showPanel('practice'); startToday();
    announce('開始複習選取的 ' + picked.length + ' 題錯題。');
  });
  reviewRow.appendChild(reviewBtn);
  box.appendChild(reviewRow);
}

/* ===================== 儲存題(獨立頁) =====================
   詳解檢視按「儲存」收藏的題,集中在這裡專練(見 ADR-0003:儲存只在詳解檢視出現、
   與作答中的「標記」分屬兩件事,永不同畫面)。savedIds 陣列順序即儲存順序。 */
function renderSaved() {
  var box = $('saved-list');
  box.textContent = '';
  var savedQids = savedIds.filter(function (qid) { return byQid[qid] && inScope(qid); });
  $('saved-count').textContent = savedQids.length ? ('已儲存 ' + savedQids.length + ' 題') : '';
  $('saved-empty').hidden = savedQids.length > 0;
  if (savedQids.length === 0) { return; }

  var drillBtn = el('button', { type: 'button' }, '專練這包（' + savedQids.length + ' 題）');
  drillBtn.addEventListener('click', function () {
    var items = savedQids.map(function (qid) {
      return { q: byQid[qid], reasonTag: '儲存專練', reason: '你儲存起來要特別練的題。' };
    });
    startDrill(items, { title: '儲存專練', mode: 'saved', backTo: 'saved' });
  });
  var p = el('p'); p.appendChild(drillBtn); box.appendChild(p);

  var scroll = el('div', { 'class': 'wrong-list-scroll' });
  savedQids.forEach(function (qid) {
    var q = byQid[qid];
    var row = el('div', { 'class': 'wrong-row' });
    var stem = stemPlain(q.stem);
    /* 縮圖前綴同錯題本:有 group_id(真題組)→〔題組〕;命中承上標記(CARRY_RE,run.js 全域)→〔承上〕。 */
    var chainTag = q.group_id ? '〔題組〕'
      : ((typeof CARRY_RE !== 'undefined' && CARRY_RE.test(String(q.stem || ''))) ? '〔承上〕' : '');
    var labelText = yearLabel(q.year) + ' 第 ' + q.no + ' 題・' + q.subject + '：' + chainTag +
      stem.slice(0, 30) + (stem.length > 30 ? '…' : '');
    row.appendChild(el('span', { 'class': 'saved-row-text' }, labelText));
    var rmBtn = el('button', { type: 'button', 'class': 'btn-quiet btn-sm' }, '移除');
    rmBtn.addEventListener('click', function () { toggleSaved(qid); renderSaved(); });
    row.appendChild(rmBtn);
    scroll.appendChild(row);
  });
  box.appendChild(scroll);
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
var PANELS = ['practice', 'paper', 'mock', 'cluster', 'essay', 'wrongbook', 'saved',
  'radar', 'trend', 'history', 'blueprint', 'run', 'sheet'];
var NAV_TABS = ['practice', 'paper', 'mock', 'cluster', 'essay', 'wrongbook', 'saved', 'radar', 'trend', 'history', 'blueprint'];

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
  if (name === 'saved') { renderSaved(); }
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
