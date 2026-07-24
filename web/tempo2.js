'use strict';
/* ============================================================
   練習節奏 tempo v2 —— 時段 × 科目的自適應出題引擎（管線本體）。

   在 tempo.js（L1 場內即時／L2 時段畫像）之上，補三件事：
   1. 序列衰減基準（科目 × 初見／重複 分層）：使用者會進步、複習題較易且
      複習比例被系統自己操縱，故殘差必須對「當時」的實力算，且分「初見／重複」。
   2. 場次離群防護：只用行為證據（機械步速、同一選項灌爆），永不用表現證據
      ——「答很爛」是資料，「不是在作答」才是離群。真實低潮絕不刪。
   3. 時段 × 科目交互（差中差 DiD）＋經驗貝氏收縮：先問「有沒有公平的練習
      機會」再問「表現如何」；證據不足時收縮自動歸零＝該層自動沉默。

   全單趟 O(n)、備忘快取後每次作答只算一次。純前端、零相依、零網路。

   對外（供 tempo.js／app.js／charts.js 讀）：
     tempoRun()          備忘快取的全管線結果（cells／l2／tau2／gate…）
     tempoResultFor(log) 任意 log 的結果（state.log 走快取）
     cellMultiplier(d,s) 出題乘數（值域 [0.5,2]，未測繪／無資格 → 1）
     atlasData()         展示層資料（只回資料、不畫圖）
     tempoDecision()     當下的節奏建議（決策表）
     tempoUpdateClaims() 作答後更新宣稱帳本（渲染只讀，不在此路徑寫）
     selfTestTempo2()    瀏覽器 console 自我驗證

   依賴（皆於使用者互動後才呼叫，載入順序安全）：
     app.js：state / saveState / todayStr / subjectPhase
     stats.js：dayPart / nowStamp
     tempo.js：currentSessionEntries / tempoTilt / tempoMean / tempoMs
   ============================================================ */

/* ---------- 常數（每一個都有出處；無任何考試特調值） ---------- */
var T2_H_BASE = 28;             /* 基準半衰期（天）：追蹤「當前」實力 */
var T2_H_L2 = 56;              /* L2 半衰期：讓每週 1–2 場的時段也能累積宣稱樣本 */
var T2_H_CELL = 84;           /* L3 半衰期：DiD 已對消漂移，較慢的量可記較久 */
var T2_K0 = 10;               /* 基準收縮偽計數 */
var T2_GAP_MIN = 45;          /* 相隔超過這麼久＝另一場 */
var T2_CLUST_CAP = 20;        /* 單叢集有效題數上限：同場資訊飽和 */
var T2_MIN_CLUST_EST = 3;     /* 叢集 < 3 時樣本變異數無意義 */
var T2_MIN_CLUST_CLAIM = 10;  /* SD 相對誤差可接受的下限 */
var T2_MIN_DAYPART_ENTRIES = 120; /* L2 逐題連續性關（v1 沿用，改為衰減後 n_eff） */
var T2_MIN_WEEKS = 3;         /* 宣稱須跨 ≥ 3 個 ISO 週 */
var T2_MIN_EFFECT = 0.05;     /* 小於 5pp 不值得行動 */
var T2_Z_ON = 2.4;           /* L2 開口 z 門檻（4 桶多重比較後） */
var T2_Q_FDR = 0.10;          /* BH 的 FDR 水準 */
var T2_Z_OFF = 1.96;          /* 遲滯關閉線（z） */
var T2_EFF_OFF = 0.04;        /* 遲滯關閉線（效應） */
var T2_PACE_ABS = 4;          /* 機械步速絕對下限：題/分 */
var T2_PACE_MADZ = 3.5;       /* 修正 z 的標準離群線 */
var T2_SAME_SHARE = 0.9;      /* 同選項占比門檻 */
var T2_SAME_MIN_N = 10;       /* 同選項準則的最小樣本 */
var T2_MIN_SESS_OUT = 8;      /* 不足 8 場不啟動步速排除（MAD 需最少樣本才穩） */
var T2_SCALE = 0.2;           /* 殘差多少算「滿檔」：0.2 ＝ 20pp（v1 TEMPO_SCALE 沿用） */
var T2_DAYPARTS = ['上午', '下午', '晚上', '深夜'];

function t2Clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function t2CountKeys(o) { return o ? Object.keys(o).length : 0; }
function tempoDaypartOfHour(h) {
  if (h >= 5 && h < 12) { return '上午'; }
  if (h >= 12 && h < 18) { return '下午'; }
  if (h >= 18 && h < 22) { return '晚上'; }
  return '深夜';
}

/* 常態 CDF：Zelen & Severo 閉式近似，|誤差| < 7.5×10⁻⁸（規格 §2.8 照抄）。 */
function normCdf(z) {
  if (z < 0) { return 1 - normCdf(-z); }
  var t = 1 / (1 + 0.2316419 * z);
  var poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
             t * (-1.821255978 + t * 1.330274429))));
  return 1 - Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * poly;
}

/* ISO 週鍵（跨 ≥ 3 週的穩定性代理）。 */
function tempoIsoWeekKey(y, m, d) {
  var dt = new Date(Date.UTC(y, m - 1, d));
  var day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  var wk = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
  return dt.getUTCFullYear() + '-W' + wk;
}

/* ============================================================
   管線核心（純函式；對齊 _build_features/_scratch/tempo_v2_bench.js 的
   runPipeline，變數名一致）。輸入 entries：[{t（epoch 分鐘）, subject,
   correct, qid, pick, dp?（本地時段）, wk?（ISO 週鍵）}]，時序遞增。
   不依賴任何瀏覽器全域，供 Node 對照與瀏覽器共用。
   ============================================================ */
function tempoPipelineCore(log, nowT) {
  var i, e, sk, k, j;
  /* 1. 場次切分 */
  var sid = 0, prev = null;
  for (i = 0; i < log.length; i++) {
    e = log[i];
    if (prev !== null && (e.t - prev) > T2_GAP_MIN) { sid += 1; }
    e.sid = sid; prev = e.t;
  }
  /* 2. 離群旗標（步速 MAD ＋ 同選項）——只用行為證據 */
  var sess = {}, totOk = 0, totN = 0;
  for (i = 0; i < log.length; i++) {
    e = log[i];
    var ss = sess[e.sid] || (sess[e.sid] = { n: 0, t0: e.t, t1: e.t, ok: 0, pn: 0, letters: {} });
    ss.n += 1; ss.t1 = e.t;
    if (e.correct) { ss.ok += 1; totOk += 1; }
    totN += 1;
    if (e.pick != null) { ss.letters[e.pick] = (ss.letters[e.pick] || 0) + 1; ss.pn += 1; }
  }
  var nSess = 0, paces = [];
  for (sk in sess) { nSess += 1; var s0 = sess[sk]; s0.pace = s0.n / (s0.t1 - s0.t0 + 1); paces.push(s0.pace); }
  paces.sort(function (a, b) { return a - b; });
  var med = paces[paces.length >> 1] || 0, devs = [];
  for (i = 0; i < paces.length; i++) { devs.push(Math.abs(paces[i] - med)); }
  devs.sort(function (a, b) { return a - b; });
  var mad = devs[devs.length >> 1] || 0;
  var pAvg = totN > 0 ? totOk / totN : 0.5;
  var excluded = {};
  for (sk in sess) {
    var st = sess[sk];
    var madz = mad > 0 ? 0.6745 * Math.abs(st.pace - med) / mad : 0;
    /* 準則一：機械步速。相對（MAD-z）＋絕對（題/分）雙保險；場數不足時 MAD 不穩，
       不啟動；短場步速雜訊大，另設場內 n ≥ 8 才判。 */
    if (nSess >= T2_MIN_SESS_OUT && st.n >= 8 && madz > T2_PACE_MADZ && st.pace >= T2_PACE_ABS) { excluded[sk] = true; }
    /* 準則二：同一選項灌爆。全按同一鍵且正確率低才排除——若全按 A 還全對，
       那是題庫問題不是他的問題，不刪。 */
    var mx = 0, L;
    for (L in st.letters) { if (st.letters[L] > mx) { mx = st.letters[L]; } }
    if (st.pn >= T2_SAME_MIN_N && mx / st.pn >= T2_SAME_SHARE && st.ok / st.n < 0.5) { excluded[sk] = true; }
  }
  /* 3. 序列衰減基準（科目 × 初見/重複 分層）＋ 逐題殘差 ＋ 叢集動差（單趟） */
  var seen = {}, run = {}, comb = {}, glob = { w: 0, wx: 0, t: null };
  var cl2 = {}, cl3 = {}, dpEnt = {}, weeksByCell = {};
  function decay(o, t, h) {
    if (o.t !== null && t > o.t) {
      var f = Math.pow(2, -(t - o.t) / (h * 1440));
      o.w *= f; o.wx *= f;
    }
    o.t = t;
  }
  for (i = 0; i < log.length; i++) {
    e = log[i];
    var stratum = seen[e.qid] ? 'r' : 'n';   /* 重複判定＝該 qid 是否曾出現於更早紀錄 */
    seen[e.qid] = true;
    if (excluded[e.sid]) { continue; }         /* 離群場次不算殘差也不汙染基準 */
    decay(glob, e.t, T2_H_BASE);
    var gm = (glob.wx + T2_K0 * 0.5) / (glob.w + T2_K0);
    var ck = e.subject, c = comb[ck] || (comb[ck] = { w: 0, wx: 0, t: null });
    decay(c, e.t, T2_H_BASE);
    var bc = (c.wx + T2_K0 * gm) / (c.w + T2_K0);
    var rk = e.subject + '|' + stratum, r0 = run[rk] || (run[rk] = { w: 0, wx: 0, t: null });
    decay(r0, e.t, T2_H_BASE);
    var b = (r0.wx + T2_K0 * bc) / (r0.w + T2_K0);
    var conf = r0.w / (r0.w + T2_K0);          /* 基準信心：暖機期殘差自動降權 */
    var x = e.correct ? 1 : 0, r = x - b;      /* 先算殘差、後更新（嚴防資訊洩漏） */
    r0.w += 1; r0.wx += x; c.w += 1; c.wx += x; glob.w += 1; glob.wx += x;
    var dp = e.dp || tempoDaypartOfHour((e.t / 60) % 24);
    /* L2 逐題有效樣本（同衰減，供連續性關與缺口計算） */
    var we = Math.pow(2, -(nowT - e.t) / (T2_H_L2 * 1440));
    var de = dpEnt[dp] || (dpEnt[dp] = { sw: 0, sw2: 0, n: 0 });
    de.sw += we; de.sw2 += we * we; de.n += 1;
    /* 每格跨了哪些 ISO 週 */
    var wk = e.wk || ('#' + Math.floor(e.t / (1440 * 7)));
    var wc = weeksByCell[dp + '|' + e.subject] || (weeksByCell[dp + '|' + e.subject] = {});
    wc[wk] = true;
    /* 叢集動差：L2 鍵 (sid, 時段)、L3 鍵 (sid, 時段, 科目) */
    var k2 = e.sid + '|' + dp, a2 = cl2[k2] || (cl2[k2] = { n: 0, sr: 0, lt: 0, sc: 0 });
    a2.n += 1; a2.sr += r; a2.lt = e.t; a2.sc += conf;
    var k3 = k2 + '|' + e.subject, a3 = cl3[k3] || (cl3[k3] = { n: 0, sr: 0, lt: 0, sc: 0, dp: dp, s: e.subject });
    a3.n += 1; a3.sr += r; a3.lt = e.t; a3.sc += conf;
  }
  /* 4. L2 時段彙總（叢集層級） */
  var dpAgg = {};
  for (k in cl2) {
    var c2 = cl2[k], dp2 = k.split('|')[1];
    var w2 = Math.min(c2.n, T2_CLUST_CAP) * Math.pow(2, -(nowT - c2.lt) / (T2_H_L2 * 1440)) * (c2.sc / c2.n);
    var x2 = c2.sr / c2.n;
    var d2 = dpAgg[dp2] || (dpAgg[dp2] = { sw: 0, swx: 0, swx2: 0, sw2: 0 });
    d2.sw += w2; d2.swx += w2 * x2; d2.swx2 += w2 * x2 * x2; d2.sw2 += w2 * w2;
  }
  /* 5. L3 每 (dp,s) 動差 → 四組 DiD */
  var mom = {}, colT = {}, rowT = {}, grand = { sw: 0, swx: 0, swx2: 0, sw2: 0 };
  function addM(a, b2) { a.sw += b2.sw; a.swx += b2.swx; a.swx2 += b2.swx2; a.sw2 += b2.sw2; }
  for (k in cl3) {
    var c3 = cl3[k];
    var w3 = Math.min(c3.n, T2_CLUST_CAP) * Math.pow(2, -(nowT - c3.lt) / (T2_H_CELL * 1440)) * (c3.sc / c3.n);
    var x3 = c3.sr / c3.n;
    var mk = c3.dp + '|' + c3.s;
    var m0 = mom[mk] || (mom[mk] = { sw: 0, swx: 0, swx2: 0, sw2: 0, dp: c3.dp, s: c3.s });
    m0.sw += w3; m0.swx += w3 * x3; m0.swx2 += w3 * x3 * x3; m0.sw2 += w3 * w3;
  }
  for (k in mom) {
    var mv = mom[k];
    addM(colT[mv.dp] || (colT[mv.dp] = { sw: 0, swx: 0, swx2: 0, sw2: 0 }), mv);
    addM(rowT[mv.s] || (rowT[mv.s] = { sw: 0, swx: 0, swx2: 0, sw2: 0 }), mv);
    addM(grand, mv);
  }
  function stats(t4) {
    if (!t4 || t4.sw <= 0 || t4.sw2 <= 0) { return null; }
    var m = t4.swx / t4.sw, nEff = t4.sw * t4.sw / t4.sw2;
    if (nEff < 2) { return { m: m, se: null, nEff: nEff }; }
    var denom = t4.sw - t4.sw2 / t4.sw;
    var v = denom > 0 ? Math.max(0, t4.swx2 - t4.sw * m * m) / denom : 0;
    return { m: m, se: Math.sqrt(Math.max(v, 1e-12) * t4.sw2) / t4.sw, nEff: nEff };
  }
  function subM(a, b2) { return { sw: a.sw - b2.sw, swx: a.swx - b2.swx, swx2: a.swx2 - b2.swx2, sw2: a.sw2 - b2.sw2 }; }
  var cells = [];
  for (k in mom) {
    var m1 = mom[k], g1 = stats(m1);
    if (!g1 || g1.se === null || g1.nEff < T2_MIN_CLUST_EST) { continue; }
    var g2 = stats(subM(rowT[m1.s], m1));                 /* (¬d, s) */
    var g3 = stats(subM(colT[m1.dp], m1));                /* (d, ¬s) */
    var g4 = stats(subM(subM(grand, colT[m1.dp]), subM(rowT[m1.s], m1)));  /* (¬d, ¬s) */
    if (!g2 || !g3 || !g4 || g2.se === null || g3.se === null || g4.se === null) { continue; }
    if (g2.nEff < T2_MIN_CLUST_EST) { continue; }         /* G2 不足＝效應不可識別，整格沉默 */
    var I = (g1.m - g2.m) - (g3.m - g4.m);
    var se = Math.sqrt(g1.se * g1.se + g2.se * g2.se + g3.se * g3.se + g4.se * g4.se);
    cells.push({ dp: m1.dp, s: m1.s, y: I, se: se, n1: g1.nEff, n2: g2.nEff,
                 weeks: t2CountKeys(weeksByCell[m1.dp + '|' + m1.s]) });
  }
  /* 6. DerSimonian–Laird τ² + 收縮 δ̂ */
  var swj = 0, sywj = 0, sw2j = 0;
  for (j = 0; j < cells.length; j++) { var wj = 1 / (cells[j].se * cells[j].se); swj += wj; sywj += wj * cells[j].y; sw2j += wj * wj; }
  var tau2 = 0;
  if (cells.length >= 2 && swj > 0) {
    var yw = sywj / swj, Q = 0;
    for (j = 0; j < cells.length; j++) { var wq = 1 / (cells[j].se * cells[j].se); Q += wq * (cells[j].y - yw) * (cells[j].y - yw); }
    var dn = swj - sw2j / swj;
    tau2 = dn > 0 ? Math.max(0, (Q - (cells.length - 1)) / dn) : 0;
  }
  for (j = 0; j < cells.length; j++) {
    var se2 = cells[j].se * cells[j].se;
    cells[j].delta = tau2 + se2 > 0 ? cells[j].y * tau2 / (tau2 + se2) : 0;
  }
  /* L2 畫像（叢集標準誤 + 逐題有效樣本 + 開口三關） */
  var l2 = {};
  for (var di = 0; di < T2_DAYPARTS.length; di++) {
    var dk = T2_DAYPARTS[di], ag = dpAgg[dk], ent = dpEnt[dk];
    var nEE = (ent && ent.sw2 > 0) ? ent.sw * ent.sw / ent.sw2 : 0;
    if (!ag || ag.sw <= 0) {
      l2[dk] = { n: ent ? ent.n : 0, mean: 0, se: null, sig: false, nEffClust: 0, nEffEntries: nEE };
      continue;
    }
    var lm = ag.swx / ag.sw, nEC = ag.sw2 > 0 ? ag.sw * ag.sw / ag.sw2 : 0;
    var ldenom = ag.sw - ag.sw2 / ag.sw;
    var lv = ldenom > 0 ? Math.max(0, ag.swx2 - ag.sw * lm * lm) / ldenom : 0;
    var lse = Math.sqrt(Math.max(lv, 1e-12) * ag.sw2) / ag.sw;
    var lsig = nEE >= T2_MIN_DAYPART_ENTRIES && nEC >= T2_MIN_CLUST_CLAIM &&
               lse !== null && Math.abs(lm) >= T2_Z_ON * lse && Math.abs(lm) >= T2_MIN_EFFECT;
    l2[dk] = { n: ent ? ent.n : 0, mean: lm, se: lse, sig: !!lsig, nEffClust: nEC, nEffEntries: nEE };
  }
  /* 供 L1 讀新基準用：以最終（已衰減）累加器回推分層基準值 */
  function baseline(subject, stratum) {
    var g = (glob.wx + T2_K0 * 0.5) / (glob.w + T2_K0);
    var cc = comb[subject], bcv = cc ? (cc.wx + T2_K0 * g) / (cc.w + T2_K0) : g;
    var rr = run[subject + '|' + stratum];
    return rr ? (rr.wx + T2_K0 * bcv) / (rr.w + T2_K0) : bcv;
  }
  return {
    cells: cells, tau2: tau2, dpAgg: dpAgg, l2: l2,
    excluded: excluded, excludedCount: t2CountKeys(excluded),
    lastSid: sid, lastSessionExcluded: log.length > 0 && !!excluded[sid],
    baseline: baseline
  };
}

/* 宣稱閘門（純函式）：資格 → z/p → BH(q=0.10) → 最小效應。回通過的格。 */
function tempoClaimGate(cells) {
  var elig = [], i;
  for (i = 0; i < cells.length; i++) {
    var c = cells[i];
    if (c.n1 >= T2_MIN_CLUST_CLAIM && c.n2 >= T2_MIN_CLUST_CLAIM && c.weeks >= T2_MIN_WEEKS && c.se > 0) {
      var z = c.y / c.se, p = 2 * (1 - normCdf(Math.abs(z)));
      elig.push({ c: c, z: z, p: p });
    }
  }
  var m = elig.length;
  if (m === 0) { return []; }
  elig.sort(function (a, b) { return a.p - b.p; });
  var maxI = 0;
  for (i = 0; i < m; i++) { if (elig[i].p <= T2_Q_FDR * (i + 1) / m) { maxI = i + 1; } }
  var pass = [];
  for (i = 0; i < maxI; i++) {
    var it = elig[i];
    if (Math.abs(it.c.y) >= T2_MIN_EFFECT) {
      pass.push({ key: it.c.dp + '|' + it.c.s, dp: it.c.dp, s: it.c.s,
                  dir: it.c.y < 0 ? -1 : 1, z: it.z, y: it.c.y, delta: it.c.delta });
    }
  }
  return pass;
}

/* ---------- 瀏覽器接線層 ---------- */

/* 把 state.log 轉成核心可吃的 entries（只取 practice、有對錯、有 ts）。 */
function tempoBuildEntries(log) {
  var out = [], arr = log || [], i;
  for (i = 0; i < arr.length; i++) {
    var e = arr[i];
    if (e.mode !== 'practice' || typeof e.correct !== 'boolean') { continue; }
    var ms = (typeof tempoMs === 'function') ? tempoMs(e.ts) : null;
    if (ms === null) { continue; }
    var dp = (typeof dayPart === 'function') ? dayPart(e.ts) : null;
    if (!dp) { continue; }
    var dparts = String(e.ts).split(' ')[0].split('-');
    out.push({
      t: ms / 60000, dp: dp,
      wk: tempoIsoWeekKey(Number(dparts[0]), Number(dparts[1]), Number(dparts[2])),
      subject: e.subject, correct: e.correct,
      qid: (e.qid == null ? ('_' + i) : e.qid), pick: e.pick
    });
  }
  return out;
}

function tempoNowMinutes() { return (typeof Date !== 'undefined' ? Date.now() : 0) / 60000; }

/* 任意 log 跑完整管線（未快取）。 */
function tempoPipelineFromLog(log) {
  var res = tempoPipelineCore(tempoBuildEntries(log), tempoNowMinutes());
  res.gate = tempoClaimGate(res.cells);
  return res;
}

/* 備忘快取：key = state.log.length + '|' + 最後一筆 ts。命中 O(1)。 */
var _t2Cache = { key: null, res: null };
function tempoRun() {
  var log = (typeof state !== 'undefined' && state.log) ? state.log : [];
  var key = log.length + '|' + (log.length ? String(log[log.length - 1].ts) : '');
  if (_t2Cache.key === key && _t2Cache.res) { return _t2Cache.res; }
  var res = tempoPipelineFromLog(log);
  _t2Cache = { key: key, res: res };
  return res;
}

/* state.log 走快取；其他 log 現算。 */
function tempoResultFor(log) {
  if (typeof state !== 'undefined' && log === state.log) { return tempoRun(); }
  return tempoPipelineFromLog(log);
}

/* 現在時段 d 之下某格的收縮估計 δ̂（無資格 → 0）。 */
function shrunkDelta(d, s) {
  var cells = tempoRun().cells, j;
  for (j = 0; j < cells.length; j++) { if (cells[j].dp === d && cells[j].s === s) { return cells[j].delta; } }
  return 0;
}

/* per-科目乘數 M（靜默層）：δ̂ < 0 → 此刻少出新題，改由表現正常的時段補回。 */
function cellMultiplier(d, s) {
  if (typeof subjectPhase === 'function' && subjectPhase(s) !== 'mapped') { return 1; }
  var del = shrunkDelta(d, s);
  return Math.pow(2, t2Clamp(del / T2_SCALE, -1, 1));
}

/* 遲滯帳本推進（純函式）：prev 帳本 + 本次 cells + 通過閘門的格 → next 帳本。
   開啟＝走完整閘門；維持＝已開啟且仍在寬鬆線（|I|≥0.04 且 |z|≥1.96）；否則關閉。 */
function tempoNextClaims(prev, cells, gate, today) {
  prev = prev || {};
  var byKey = {}, j;
  for (j = 0; j < cells.length; j++) { byKey[cells[j].dp + '|' + cells[j].s] = cells[j]; }
  var next = {};
  (gate || []).forEach(function (p) {
    next[p.key] = { dir: p.dir, since: (prev[p.key] && prev[p.key].since) || today };
  });
  Object.keys(prev).forEach(function (key) {
    if (next[key]) { return; }
    var c = byKey[key];
    if (c && c.se > 0 && Math.abs(c.y) >= T2_EFF_OFF && Math.abs(c.y / c.se) >= T2_Z_OFF) {
      next[key] = { dir: c.y < 0 ? -1 : 1, since: prev[key].since };
    }
  });
  return next;
}

/* 宣稱帳本更新（§2.8）——只在作答後呼叫，渲染路徑絕不呼叫。不可變更新、變動才寫。 */
function tempoUpdateClaims() {
  if (typeof state === 'undefined' || typeof saveState !== 'function') { return; }
  var res = tempoRun();
  var prev = (state.tempo2 && state.tempo2.claims) || {};
  var next = tempoNextClaims(prev, res.cells, res.gate, (typeof todayStr === 'function' ? todayStr() : ''));
  if (JSON.stringify(next) !== JSON.stringify(prev)) {
    var t2 = Object.assign({}, state.tempo2 || {}, { claims: next });
    saveState(Object.assign({}, state, { tempo2: t2 }));
  }
}

/* ---------- 決策表（§3.1 + §3.2） ---------- */

/* §3.2 附加行：現時段 × 某 mapped 科目有通過帳本的格才出現，多格取 |z| 最大者。 */
function tempoClaimLine(curPart) {
  if (!curPart || typeof state === 'undefined') { return ''; }
  var claims = (state.tempo2 && state.tempo2.claims) || {};
  var cells = tempoRun().cells, byKey = {}, j;
  for (j = 0; j < cells.length; j++) { byKey[cells[j].dp + '|' + cells[j].s] = cells[j]; }
  var best = null, bestAbsZ = -1, bestS = null, bestCell = null, bestDir = 0;
  Object.keys(claims).forEach(function (key) {
    var parts = key.split('|');
    if (parts[0] !== curPart) { return; }
    var s = parts.slice(1).join('|');
    if (typeof subjectPhase === 'function' && subjectPhase(s) !== 'mapped') { return; }
    var c = byKey[key], z = (c && c.se > 0) ? Math.abs(c.y / c.se) : 0;
    if (z > bestAbsZ) { bestAbsZ = z; best = key; bestS = s; bestCell = c; bestDir = claims[key].dir; }
  });
  if (!best) { return ''; }
  var delta = bestCell ? bestCell.delta : 0;
  var q = Math.round(100 * Math.max(Math.abs(delta), 0.05));
  if (bestDir > 0) {
    return '另外：' + curPart + '是你練「' + bestS + '」相對最有力的時段（高約 ' + q + ' 個百分點），新題與難題可以集中排在這裡。';
  }
  var alt = null;
  Object.keys(claims).forEach(function (key) {
    var parts = key.split('|');
    if (parts[0] === curPart || parts.slice(1).join('|') !== bestS || claims[key].dir <= 0) { return; }
    var c = byKey[key];
    if (c && c.n1 >= T2_MIN_CLUST_CLAIM) { alt = parts[0]; }
  });
  if (alt) {
    return '另外：長期看，你在' + curPart + '練「' + bestS + '」通常比自己平常低約 ' + q +
      ' 個百分點；新題與難題留給你表現正常的' + alt + '，這個時段的「' + bestS + '」以複習為主。';
  }
  return '另外：長期看，你在' + curPart + '練「' + bestS + '」通常比自己平常低約 ' + q +
    ' 個百分點。這個時段的「' + bestS + '」以複習為主，出題已自動微調。';
}

/* 主決策：{state, message, layer, append?}。判定順序由上而下，取第一個命中。 */
function tempoDecision() {
  var res = tempoResultFor((typeof state !== 'undefined' && state.log) ? state.log : []);
  var now = (typeof Date !== 'undefined') ? Date.now() : 0;
  var curPart = (typeof dayPart === 'function' && typeof nowStamp === 'function') ? dayPart(nowStamp()) : null;
  /* # 1：本場被離群旗標 → 靜默 */
  var es = (typeof currentSessionEntries === 'function' && typeof state !== 'undefined')
    ? currentSessionEntries(state.log, now) : [];
  if (es.length > 0 && res.lastSessionExcluded) {
    return { state: 'silent', message: '', layer: 'L1' };
  }
  var t = (typeof tempoTilt === 'function') ? tempoTilt() : { tilt: 0, source: null, n: 0 };
  var st = '如常', msg = '', layer = '';
  if (t.source === 'live') {
    layer = 'L1';
    if (t.tilt >= 0.35) {
      st = '進攻';
      msg = '節奏：進攻——依本場前 ' + t.n + ' 題，你目前比自己平常水準好。多排新題與弱科，趁狀態好啃難的。';
    } else if (t.tilt <= -0.35) {
      st = '鞏固';
      msg = '節奏：鞏固——依本場前 ' + t.n + ' 題，你目前比平常吃力。多排已練過的題，少排新難題。';
    } else { st = '如常'; msg = ''; }
  } else {
    layer = 'L2';
    var prof = curPart ? res.l2[curPart] : null;
    if (prof && prof.sig && prof.mean > 0) {
      st = '進攻';
      msg = '節奏：進攻——你在「' + curPart + '」的長期紀錄（' + prof.n +
        ' 題，已排除科目難度差異）比自己平常高約 ' + Math.round(prof.mean * 100) + ' 個百分點。';
    } else if (prof && prof.sig && prof.mean < 0) {
      st = '鞏固';
      msg = '節奏：鞏固——你在「' + curPart + '」通常比自己平常低約 ' +
        Math.round(Math.abs(prof.mean) * 100) + ' 個百分點。這個時段適合複習與熟題。';
    } else if (prof && prof.nEffEntries >= T2_MIN_DAYPART_ENTRIES && prof.nEffClust >= T2_MIN_CLUST_CLAIM) {
      st = '如常';
      msg = '你在「' + curPart + '」的表現與自己平常相當（' + prof.n + ' 題），照原本的弱項配比練即可。';
    } else {
      st = '資料不足';
      var gap = prof ? Math.max(0, Math.ceil(T2_MIN_DAYPART_ENTRIES - prof.nEffEntries)) : T2_MIN_DAYPART_ENTRIES;
      var gapSess = prof ? Math.max(0, Math.ceil(T2_MIN_CLUST_CLAIM - prof.nEffClust)) : T2_MIN_CLUST_CLAIM;
      var where = curPart || '這個時段';
      if (gap <= 0 && gapSess > 0) {
        msg = '「' + where + '」的紀錄還不夠下判斷——約再 ' + gapSess + ' 場就能開始分析這個時段。';
      } else {
        msg = '「' + where + '」的紀錄還不夠下判斷——約再 ' + gap + ' 題（或 ' + gapSess + ' 場）就能開始分析這個時段。';
      }
    }
  }
  var out = { state: st, message: msg, layer: layer };
  var append = tempoClaimLine(curPart);
  if (append) { out.append = append; }
  return out;
}

/* 展示層資料（§4）——只回資料，不畫 SVG。 */
function atlasData() {
  var res = tempoRun(), cells = res.cells, j;
  var claims = (typeof state !== 'undefined' && state.tempo2 && state.tempo2.claims) || {};
  var cellsOut = {};
  for (j = 0; j < cells.length; j++) {
    var c = cells[j], key = c.dp + '|' + c.s;
    cellsOut[key] = {
      dp: c.dp, s: c.s, delta: c.delta, I: c.y, se: c.se,
      nEffG1: c.n1, nEffG2: c.n2, weeks: c.weeks,
      claim: claims[key] ? claims[key].dir : 0
    };
  }
  return {
    cells: cellsOut, l2: res.l2, tau2: res.tau2, claims: claims,
    dayparts: T2_DAYPARTS, decision: tempoDecision()
  };
}

/* ============================================================
   自我驗證（瀏覽器 console 呼叫）。合成 log 全部確定性生成（不用 Math.random）。
   對照規格 §5 T1–T15。純函式可測的部分另有 Node 對照腳本覆蓋。
   ============================================================ */
function selfTestTempo2() {
  var out = [], pass = 0;
  function assert(name, cond) { out.push((cond ? '✓ ' : '✗ ') + name); if (cond) { pass += 1; } }
  function finiteCell(c) { return isFinite(c.y) && isFinite(c.se) && isFinite(c.delta); }

  /* ---- 確定性 log 生成器（不用 Math.random） ---- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dstr(dayIdx) { var d = new Date(2026, 6, 1 + dayIdx); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  /* 一場：dayIdx（0＝2026-07-01）、hour（決定時段）、subject、n 題、對 ok、pick 樣式。 */
  function sess(dayIdx, hour, subject, n, ok, pickMode, qidBase) {
    var a = [], i;
    for (i = 0; i < n; i++) {
      var ts = dstr(dayIdx) + ' ' + pad(hour) + ':' + pad(i % 45);   /* 同場、分鐘遞增、45 分內 */
      var pk = pickMode === 'A' ? 'A' : 'ABCD'.charAt(i % 4);
      a.push({ mode: 'practice', correct: i < ok, subject: subject, ts: ts,
               qid: (qidBase != null ? qidBase + i : (subject + '-' + dayIdx + '-' + hour + '-' + i)), pick: pk });
    }
    return a;
  }
  function spam(dayIdx, hour) {   /* 亂按場：同分鐘、全 A、全錯 */
    var a = [], i;
    for (i = 0; i < 12; i++) {
      a.push({ mode: 'practice', correct: false, subject: '國文',
               ts: dstr(dayIdx) + ' ' + pad(hour) + ':00', qid: 'spam-' + dayIdx + '-' + i, pick: 'A' });
    }
    return a;
  }
  function cat() { var r = [], i; for (i = 0; i < arguments.length; i++) { r = r.concat(arguments[i]); } return r; }
  function findCell(cells, dp, s) { for (var i = 0; i < cells.length; i++) { if (cells[i].dp === dp && cells[i].s === s) { return cells[i]; } } return null; }
  function tempoMsSafe(ts) { return (typeof tempoMs === 'function') ? tempoMs(ts) : new Date(ts.replace(' ', 'T')).getTime(); }

  /* 各格時序交錯（每格每週都有場，四組同時有料）；晚上×數學低 15pp，其餘 70%。
     withReview：每格再混入 +15pp「較易」重複題（重用第 0 週 qid → 判重複），測回饋免疫。 */
  function buildDiD(withReview) {
    var log = [], subs = ['數學', '國文', '英文', '公民', '歷史', '地理'], dps = [['上午', 9], ['下午', 14], ['晚上', 20]];
    var week, rep, di, si;
    for (week = 0; week < 8; week++) {
      for (rep = 0; rep < 2; rep++) {
        for (di = 0; di < dps.length; di++) {
          for (si = 0; si < subs.length; si++) {
            var s = subs[si], dp = dps[di][0], hr = dps[di][1];
            var rate = (s === '數學' && dp === '晚上') ? 0.55 : 0.70;
            var slot = rep * 18 + di * 6 + si, dayIdx = week * 7 + slot;   /* 交錯：每格散在 0..84 天 */
            var qbase = 700000 + di * 100000 + si * 10000 + week * 100 + rep * 50;
            log = log.concat(sess(dayIdx, hr, s, 20, Math.round(rate * 20), 'X', qbase));
            if (withReview && week >= 1) {
              log = log.concat(sess(dayIdx, hr, s, 8, Math.round(Math.min(1, rate + 0.15) * 8), 'X',
                700000 + di * 100000 + si * 10000));   /* 第 0 週 qid → 重複 */
            }
          }
        }
      }
    }
    return log;
  }
  function buildBalancedN(nSub) {
    var log = [], all = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛'], subs = all.slice(0, nSub);
    var dps = [['上午', 9], ['下午', 14], ['晚上', 20], ['深夜', 23]];
    var week, rep, di, si;
    for (week = 0; week < 8; week++) {
      for (rep = 0; rep < 2; rep++) {
        for (di = 0; di < dps.length; di++) {
          for (si = 0; si < subs.length; si++) {
            var slot = rep * (dps.length * nSub) + di * nSub + si, dayIdx = week * 7 + slot;
            log = log.concat(sess(dayIdx, dps[di][1], subs[si], 16, 11, 'X',
              800000 + di * 100000 + si * 10000 + week * 100 + rep * 50));
          }
        }
      }
    }
    return log;
  }
  function buildOnlyEvening() {
    var log = [], week, rep;
    for (week = 0; week < 8; week++) {
      for (rep = 0; rep < 2; rep++) {
        var base = week * 7 + rep * 3;
        log = log.concat(sess(base, 20, '孤科', 20, 10, 'X', 400000 + week * 100 + rep * 40));
        log = log.concat(sess(base + 1, 9, '別科', 20, 14, 'X', 500000 + week * 100 + rep * 40));
        log = log.concat(sess(base + 2, 14, '別科', 20, 14, 'X', 600000 + week * 100 + rep * 40));
      }
    }
    return log;
  }
  function synthDet(n) {   /* 確定性 30k 核心 entries（LCG 種子固定） */
    var entries = [], t = 0, qid = 0, subs = ['a', 'b', 'c', 'd', 'e', 'f'], seed = 42;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    while (entries.length < n) {
      t += (rnd() < 0.05 ? 300 : Math.max(0.5, 1.6 + (rnd() - 0.5) * 1.4));
      var s = subs[Math.floor(rnd() * subs.length)], repeat = rnd() < 0.2;
      entries.push({ t: t, subject: s, correct: rnd() < 0.65,
        qid: repeat && qid > 10 ? Math.floor(rnd() * qid) : qid++, pick: 'ABCD'.charAt(Math.floor(rnd() * 4)) });
    }
    return { entries: entries, nowT: entries[entries.length - 1].t + 5 };
  }
  function cloneEntries(a) { return a.map(function (e) { return { t: e.t, subject: e.subject, correct: e.correct, qid: e.qid, pick: e.pick }; }); }
  function perfMs(fn) { var p = (typeof performance !== 'undefined'); var t0 = p ? performance.now() : Date.now(); fn(); return (p ? performance.now() : Date.now()) - t0; }
  /* 自測專用：nowT 取資料末端（與掛鐘無關 → 確定性、不受執行日期影響）。 */
  function pipe(log) {
    var entries = tempoBuildEntries(log), maxT = 0, i;
    for (i = 0; i < entries.length; i++) { if (entries[i].t > maxT) { maxT = entries[i].t; } }
    var res = tempoPipelineCore(entries, maxT + 5);
    res.gate = tempoClaimGate(res.cells);
    return res;
  }

  /* ---- T1：30 筆散在 3 天 → 全時段不顯著、無資格格、決策 #8 缺口 > 0 ---- */
  var r1 = pipe(cat(sess(0, 9, '國文', 10, 7), sess(1, 9, '國文', 10, 7), sess(2, 9, '國文', 10, 7)));
  assert('T1 L2 全時段 sig false', T2_DAYPARTS.every(function (k) { return !r1.l2[k].sig; }));
  assert('T1 無任何格達估計資格', r1.cells.length === 0);
  assert('T1 缺口 > 0', Math.max(0, Math.ceil(120 - r1.l2['上午'].nEffEntries)) > 0);

  /* ---- T2：只練基準低的科、本場也一樣 → L1 不誤判疲勞（v1 測 1 保留） ---- */
  var t2 = cat(sess(0, 9, '數學', 40, 16, 'X', 1000), sess(23, 9, '數學', 10, 4, 'X', 5000));
  var live2 = livePulse(t2, tempoMsSafe(dstr(23) + ' 09:40'));
  assert('T2 科目基準低但表現如常 → |tilt| < 0.35', !!live2 && Math.abs(live2.tilt) < 0.35);

  /* ---- T3：DiD 識別（晚上×數學 I<−0.10；異科 |I|<0.05；無誤排除） ---- */
  var r3 = pipe(buildDiD(false));
  var cell3 = findCell(r3.cells, '晚上', '數學');
  assert('T3 buildDiD 無誤排除', r3.excludedCount === 0);
  assert('T3 晚上×數學 I < −0.10', !!cell3 && cell3.y < -0.10);
  assert('T3 任一異科格 |I| < 0.05', r3.cells.every(function (c) { return c.s === '數學' || Math.abs(c.y) < 0.05; }));
  assert('T3 gate 晚上×數學 通過（dir 負）', r3.gate.some(function (g) { return g.key === '晚上|數學' && g.dir < 0; }));
  assert('T3 gate 無異科負向誤報', r3.gate.every(function (g) { return g.s === '數學' || g.dir > 0; }));

  /* ---- T4：加料易複習題 → 分層基準免疫（I 幾乎不動） ---- */
  var r4 = pipe(buildDiD(true));
  var cell4 = findCell(r4.cells, '晚上', '數學');
  assert('T4 分層 I 與 T3 相差 < 2pp', !!cell4 && !!cell3 && Math.abs(cell4.y - cell3.y) < 0.02);

  /* ---- T5a：3 場亂按全排除；本場 livePulse null ---- */
  var r5a = pipe(cat(sess(4, 9, '國文', 12, 8), sess(5, 9, '國文', 12, 8), spam(10, 9), spam(11, 9), spam(12, 9)));
  assert('T5a 3 場亂按全部排除', r5a.excludedCount === 3);
  assert('T5a 本場亂按 livePulse 回 null',
    livePulse(cat(sess(4, 9, '國文', 12, 8), sess(5, 9, '國文', 12, 8), spam(10, 9), spam(11, 9), spam(12, 9)), tempoMsSafe(dstr(12) + ' 09:30')) === null);

  /* ---- T5b：真實低潮不排除、L1 判鞏固 ---- */
  var t5b = [], dd;
  for (dd = 0; dd < 14; dd++) { t5b = t5b.concat(sess(dd, 9, '國文', 20, 17)); }   /* 基準 85% */
  t5b = t5b.concat(sess(14, 9, '國文', 20, 14));   /* 本場 70% */
  var r5b = pipe(t5b);
  assert('T5b 真實低潮不排除', r5b.excludedCount === 0);
  var live5b = livePulse(t5b, tempoMsSafe(dstr(14) + ' 09:30'));
  assert('T5b 低潮場 L1 判鞏固', !!live5b && live5b.tilt < -0.35);

  /* ---- T6：遲滯帳本（開啟→維持→關閉），用純函式 tempoNextClaims、不寫 state ---- */
  var openCells = [{ dp: '晚上', s: '數學', y: -0.12, se: 0.04, delta: -0.10, n1: 20, n2: 20, weeks: 6 }];
  var c1 = tempoNextClaims({}, openCells, tempoClaimGate(openCells), '2026-07-01');
  assert('T6 通過閘門 → 帳本開啟', !!c1['晚上|數學'] && c1['晚上|數學'].since === '2026-07-01');
  var keepCells = [{ dp: '晚上', s: '數學', y: -0.045, se: 0.02, delta: -0.03, n1: 20, n2: 20, weeks: 6 }];  /* z=2.25 */
  var c2 = tempoNextClaims(c1, keepCells, [], '2026-07-20');
  assert('T6 寬鬆線內 → 維持（since 不變）', !!c2['晚上|數學'] && c2['晚上|數學'].since === '2026-07-01');
  var dropCells = [{ dp: '晚上', s: '數學', y: -0.03, se: 0.02, delta: -0.02, n1: 20, n2: 20, weeks: 6 }];  /* |I|=0.03<0.04 */
  assert('T6 低於寬鬆線 → 關閉', !tempoNextClaims(c2, dropCells, [], '2026-07-25')['晚上|數學']);

  /* ---- T7：30k < 50ms（取多趟中位數，避開單趟 GC 抖動；clone 不計入計時）；
     備忘第二次 < 1ms、輸出同一份 ---- */
  var big = synthDet(30000);
  tempoPipelineCore(cloneEntries(big.entries), big.nowT);   /* 暖機 */
  var samples = [], _i;
  for (_i = 0; _i < 7; _i++) {
    var _c = cloneEntries(big.entries);
    samples.push(perfMs(function () { tempoPipelineCore(_c, big.nowT); }));
  }
  samples.sort(function (x, y) { return x - y; });
  var t7a = samples[samples.length >> 1];
  assert('T7 30k 全管線中位 < 50ms（' + t7a.toFixed(1) + ' ms）', t7a < 50);
  if (typeof state !== 'undefined') {
    tempoInvalidateCache();
    var a = tempoRun(), t7b = perfMs(function () { tempoRun(); }), b = tempoRun();
    assert('T7 備忘第二次 < 1ms（' + t7b.toFixed(3) + ' ms）', t7b < 1);
    assert('T7 備忘輸出同一份（逐位元相等）', a === b);
  }

  /* ---- T8：24 格全平衡、無效應 → τ̂² 低、δ̂ 小、claims 空、M≈1 ---- */
  var r8 = pipe(buildBalancedN(6));
  assert('T8 τ̂² 低（< 0.002）', r8.tau2 < 0.002);
  assert('T8 全部 |δ̂| < 0.01', r8.cells.every(function (c) { return Math.abs(c.delta) < 0.01; }));
  assert('T8 宣稱閘門空', r8.gate.length === 0);
  assert('T8 全部 M ∈ [0.97, 1.03]', r8.cells.every(function (c) {
    var mlt = Math.pow(2, t2Clamp(c.delta / T2_SCALE, -1, 1)); return mlt >= 0.97 && mlt <= 1.03;
  }));

  /* ---- T9：3 科與 8 科兩份 manifest → 無 NaN、無例外、閘門空（BH m 自動＝資格格數） ---- */
  var b3 = pipe(buildBalancedN(3)), b8 = pipe(buildBalancedN(8));
  assert('T9 3 科無 NaN、閘門空', b3.cells.every(finiteCell) && isFinite(b3.tau2) && b3.gate.length === 0);
  assert('T9 8 科無 NaN、閘門空', b8.cells.every(finiteCell) && isFinite(b8.tau2) && b8.gate.length === 0);

  /* ---- T10：清晨時段整欄 0 筆 → 該欄 l2 空、無 claims、不拋錯 ---- */
  assert('T10 空欄 l2 sig false、nEffClust 0', r3.l2['深夜'].sig === false && r3.l2['深夜'].nEffClust === 0);
  assert('T10 空欄無 claims', r3.gate.every(function (p) { return p.dp !== '深夜'; }));

  /* ---- T11：帳本經 JSON 匯出入完整保留；defaultState 內建空帳本 ---- */
  var sample = { srs: {}, log: [], tempo2: { claims: { '晚上|數學': { dir: -1, since: '2026-07-01' } } } };
  var round = JSON.parse(JSON.stringify(sample));
  assert('T11 claims 匯出入完整保留',
    round.tempo2.claims['晚上|數學'].dir === -1 && round.tempo2.claims['晚上|數學'].since === '2026-07-01');
  assert('T11 defaultState 內建 tempo2.claims',
    typeof defaultState === 'function' && !!defaultState().tempo2 && typeof defaultState().tempo2.claims === 'object');

  /* ---- T12：多時段同時過三關時 top-1 唯一（展示層只說 |z| 最大者） ---- */
  var sigParts = T2_DAYPARTS.filter(function (k) { return r3.l2[k].sig; });
  var top1 = null, topz = -1;
  sigParts.forEach(function (k) { var p = r3.l2[k]; if (p.se) { var z = Math.abs(p.mean / p.se); if (z > topz) { topz = z; top1 = k; } } });
  assert('T12 有顯著時段時 top-1 唯一可決', sigParts.length === 0 || top1 !== null);

  /* ---- T13：unmapped 科 cellMultiplier ≡ 1（暫時覆寫 subjectPhase） ---- */
  if (typeof window !== 'undefined' && typeof subjectPhase === 'function') {
    var _sp = window.subjectPhase;
    window.subjectPhase = function () { return 'unmapped'; };
    var m13 = cellMultiplier('晚上', '任何科');
    window.subjectPhase = _sp;
    assert('T13 unmapped 科 cellMultiplier ≡ 1', m13 === 1);
  } else {
    assert('T13 unmapped 科 cellMultiplier ≡ 1（非瀏覽器，略過）', true);
  }

  /* ---- T14：只在晚上練某科（G2 空）→ 該科無估計資格、整列沉默 ---- */
  var r14 = pipe(buildOnlyEvening());
  assert('T14 只在晚上的科無估計資格', r14.cells.every(function (c) { return c.s !== '孤科'; }));

  /* ---- T15：v1 全部 selfTest 通過 ---- */
  if (typeof selfTestTempo === 'function') {
    assert('T15 v1 selfTestTempo 全通過', selfTestTempo() === true);
  }

  console.log(out.join('\n'));
  console.log(pass + '/' + out.length + ' 通過');
  return pass === out.length;
}

/* 讓自測能強制重算（清備忘快取）。 */
function tempoInvalidateCache() { _t2Cache = { key: null, res: null }; }

/* Node 對照用（瀏覽器無 module 物件，無害）。 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    tempoPipelineCore: tempoPipelineCore,
    tempoClaimGate: tempoClaimGate,
    tempoNextClaims: tempoNextClaims,
    normCdf: normCdf,
    tempoDaypartOfHour: tempoDaypartOfHour,
    tempoIsoWeekKey: tempoIsoWeekKey
  };
}
