'use strict';
/* ============================================================
   練習節奏 tempo —— 回答一個問題：「這一場，該給難題還是熟題？」
   兼管單題練習的「科目範圍」下拉（同屬「接下來出什麼」的決策，故同檔）。

   ## 為什麼不能直接看正確率

   各科難度不同，而人在不同時段練不同的科。「我晚上都練數學」會讓晚上正確率
   偏低——那是**科目差異**，不是狀態差異。故一律用**殘差**：該題對錯減去該科
   基準正確率，再取平均。殘差為負＝比自己的平常水準差。

   同理只取單題練習（mode 'practice'）：弱點殲滅／模擬／診斷的難度分佈本來就
   不同，混進來會把「模式差異」誤讀成「狀態差異」。

   ## 三層（越前面越可靠、越快可用）

   L1 場內即時 —— 本場已答題的殘差。第 6 題起可用，幾分鐘內自我修正。**主力。**
   L2 時段畫像 —— 各時段的歷史殘差。要每桶 ≥120 題（約 4–6 週）才開口。
   星期別不做 —— 7 桶要 7 倍資料；且平日／假日的差異多半是「當天有沒有空」，
   那該影響**場次長度**不是**題目難度**，拿來調難度是錯用。

   ## 兩層的門檻刻意不同（不是不一致，是代價不同）

   · L1 只影響接下來幾題的難易配比，判斷錯了幾分鐘內就被新資料蓋掉
     → 用收縮估計給「軟推力」，不做顯著性檢定。
   · L2 會變成對使用者的**持久宣稱**（「你深夜狀態較差」），錯了會誤導數週
     → 必須過「樣本量 → 顯著性 → 最小效應量」三關才開口。

   ## 方向：狀態好練難的，狀態差練熟的

   困難提取需要工作記憶餘裕；疲勞時提取失敗率高，容易退化成「看答案」＝被動
   閱讀。而「刻意在不佳條件下練習」講的是**提取條件**（間隔、交錯、無提示），
   不是**學習者狀態**的劣化——疲勞不是有益的困難。
   想練「狀態不好也要考」的抗壓，那是模擬考的職責（整卷、計時、擬真），不該
   混進單題練習。

   依賴 app.js 全域：state / saveState / SUBJECTS / ACTIVE_SUBJ_SET / el / $ /
   byQid / startToday；stats.js：dayPart / nowStamp。皆於使用者互動後呼叫。
   自我驗證：瀏覽器 console 呼叫 selfTestTempo()。
   ============================================================ */

var SESSION_GAP_MIN = 45;      /* 相隔超過這麼久＝另一場（不是同一次專注） */
var TEMPO_MIN_LIVE = 6;        /* 本場至少幾題才開始推力 */
var TEMPO_MIN_DAYPART = 120;   /* 時段層每桶最低樣本：低於此不做任何宣稱 */
var TEMPO_SHRINK = 8;          /* 收縮強度：n 小的時候把估計往 0 拉 */
var TEMPO_SCALE = 0.2;         /* 殘差多少算「滿檔」：0.2 ＝ 比平常好/差 20pp */
var TEMPO_Z = 2.4;             /* 4 桶多重比較後的 z 門檻（≈ 0.05/4 雙尾） */
var TEMPO_MIN_EFFECT = 0.05;   /* 顯著但只差 2pp 不值得行動：最小效應量 5pp */
var TEMPO_SPEAK = 0.35;        /* 傾斜小於此不對使用者說話（免得像雜訊亂跳） */

var DAY_PARTS = ['上午', '下午', '晚上', '深夜'];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function tempoMean(a) {
  if (a.length === 0) { return 0; }
  return a.reduce(function (x, y) { return x + y; }, 0) / a.length;
}
function tempoSd(a, m) {
  if (a.length < 2) { return null; }
  var v = a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1);
  return Math.sqrt(v);
}
/* 'YYYY-MM-DD HH:MM' → epoch ms。格式不符回 null（舊紀錄可能沒有 ts）。 */
function tempoMs(ts) {
  if (!ts || String(ts).indexOf(' ') < 0) { return null; }
  var parts = String(ts).split(' '), d = parts[0].split('-'), hm = parts[1].split(':');
  if (d.length !== 3 || hm.length < 2) { return null; }
  var t = new Date(Number(d[0]), Number(d[1]) - 1, Number(d[2]), Number(hm[0]), Number(hm[1])).getTime();
  return isNaN(t) ? null : t;
}

/* 基準正確率的計算已移到 tempo2.js 的序列衰減基準（科目 × 初見/重複 分層，
   殘差對「當時」實力算、複習題不汙染新題基準）。此處只保留場次切分與 L1/L2
   對外介面，內部一律讀 tempo2.js 的管線輸出。 */

/* 本場作答：從最新一筆往回，相鄰兩筆間隔 < SESSION_GAP_MIN 分鐘就算同一場。
   最後一筆若已離現在太久，代表「這一場還沒開始」→ 回空陣列，不拿舊場當本場。 */
function currentSessionEntries(log, nowMs) {
  var out = [], prev = nowMs, arr = log || [];
  for (var i = arr.length - 1; i >= 0; i--) {
    var e = arr[i], ms = tempoMs(e.ts);
    if (ms === null) { break; }
    if ((prev - ms) > SESSION_GAP_MIN * 60000) { break; }
    prev = ms;
    if (e.mode === 'practice' && typeof e.correct === 'boolean') { out.push(e); }
  }
  return out;
}

/* L1：本場即時脈搏。不足題數或本場被離群旗標時回 null。殘差改讀 tempo2.js 的
   序列衰減分層基準（初見/重複 分層），並在本場被判亂按時對垃圾輸入不表態。 */
function livePulse(log, nowMs) {
  var arr = log || [], i;
  /* 本場（距 now 45 分內、由最新往回不斷鏈）的作答索引 */
  var idx = [], prev = nowMs;
  for (i = arr.length - 1; i >= 0; i--) {
    var ms = tempoMs(arr[i].ts);
    if (ms === null) { break; }
    if ((prev - ms) > SESSION_GAP_MIN * 60000) { break; }
    prev = ms;
    idx.push(i);
  }
  /* 全 log 首見索引：qid 首見前為初見、之後為重複（與管線 seen-set 同義）。 */
  var firstSeen = {};
  for (i = 0; i < arr.length; i++) {
    var qq = arr[i].qid;
    if (qq != null && !(qq in firstSeen)) { firstSeen[qq] = i; }
  }
  var res = (typeof tempoResultFor === 'function') ? tempoResultFor(arr) : null;
  var base = res ? res.baseline : null;
  var rs = [];
  for (i = idx.length - 1; i >= 0; i--) {           /* 還原時序 */
    var e = arr[idx[i]];
    if (e.mode !== 'practice' || typeof e.correct !== 'boolean') { continue; }
    var stratum = (firstSeen[e.qid] != null && firstSeen[e.qid] < idx[i]) ? 'r' : 'n';
    var b = base ? base(e.subject, stratum) : 0.5;
    rs.push((e.correct ? 1 : 0) - b);
  }
  if (rs.length < TEMPO_MIN_LIVE) { return null; }
  if (res && res.lastSessionExcluded) { return null; }   /* 本場被離群旗標 → 不表態 */
  var m = tempoMean(rs);
  var shrunk = m * rs.length / (rs.length + TEMPO_SHRINK);
  return { n: rs.length, mean: m, tilt: clamp(shrunk / TEMPO_SCALE, -1, 1) };
}

/* L2：時段畫像。改讀 tempo2.js 管線的叢集標準誤 + H_L2 衰減 + 開口三關；對外欄位
   名保留 {n, mean, se, sig} 以免 charts.js 大改，另加 nEffClust / nEffEntries。 */
function dayPartProfile(log) {
  var res = (typeof tempoResultFor === 'function') ? tempoResultFor(log) : null;
  var out = {};
  DAY_PARTS.forEach(function (k) {
    var p = (res && res.l2 && res.l2[k]) ? res.l2[k]
      : { n: 0, mean: 0, se: null, sig: false, nEffClust: 0, nEffEntries: 0 };
    out[k] = { n: p.n, mean: p.mean, se: p.se, sig: p.sig, nEffClust: p.nEffClust, nEffEntries: p.nEffEntries };
  });
  return out;
}

/* 綜合傾斜：+1 狀態好（給難的）… −1 疲勞（給熟的）。source 為 null ＝ 資料不足，
   不調整，維持原本的弱項加權。 */
function tempoTilt() {
  var now = Date.now();
  var live = livePulse(state.log, now);
  if (live) { return { tilt: live.tilt, source: 'live', n: live.n }; }
  var part = (typeof dayPart === 'function') ? dayPart(nowStamp()) : null;
  var p = part ? dayPartProfile(state.log)[part] : null;
  if (p && p.sig) { return { tilt: clamp(p.mean / TEMPO_SCALE, -1, 1), source: 'daypart', n: p.n, part: part }; }
  return { tilt: 0, source: null, n: 0 };
}

/* 回鍋複習間隔：疲勞時把已練過的舊題排密一點（原本每 5 題一次）。 */
function tempoReviewEvery(tilt) {
  if (tilt <= -0.4) { return 3; }
  if (tilt >= 0.4) { return 6; }
  return 5;
}
/* 弱項權重的銳化／攤平：狀態好→指數 >1，弱科更集中；疲勞→指數 <1，攤平不硬啃。 */
function tempoShapeWeights(w, tilt) {
  if (!tilt) { return w; }
  var exp = 1 + 0.4 * tilt, out = {};
  Object.keys(w).forEach(function (k) { out[k] = Math.pow(w[k], exp); });
  return out;
}

/* ===================== 單題練習的科目範圍 ===================== */
/* 預設空字串＝混合出題。已不在應考範圍的舊值自動失效（與 settings.subjects 同一
   個防呆思路：濾掉殘留值，不是留著讓它靜默擋住出題）。 */
function practiceSubject() {
  var s = (state.settings && state.settings.practiceSubject) || '';
  return (s && ACTIVE_SUBJ_SET[s]) ? s : '';
}
function inPracticeSubject(q) {
  var s = practiceSubject();
  return !s || !!(q && q.subject === s);
}
function setPracticeSubject(sub) {
  saveState(Object.assign({}, state, {
    settings: Object.assign({}, state.settings, { practiceSubject: sub || '' })
  }));
  if (typeof startToday === 'function') { startToday(); }
  renderPracticeScope();
}

/* 下拉 + 節奏標示，一起塞進 #practice-scope。 */
function renderPracticeScope() {
  var host = $('practice-scope');
  if (!host) { return; }
  host.textContent = '';
  if (!SUBJECTS || SUBJECTS.length < 2) { return; }   /* 單科考試沒得選 */

  var cur = practiceSubject();
  var sel = el('select', { id: 'practice-subject', 'aria-label': '單題練習出題範圍' });
  var mix = el('option', { value: '' }, '混合出題（依弱項自動配）');
  sel.appendChild(mix);
  SUBJECTS.forEach(function (s) { sel.appendChild(el('option', { value: s }, '只練「' + s + '」')); });
  sel.value = cur;
  sel.addEventListener('change', function () { setPracticeSubject(sel.value); });
  host.appendChild(sel);
  if (cur) { host.appendChild(el('span', { 'class': 'scope-on' }, '範圍已縮小')); }

  var t = tempoTilt();
  if (t.source && Math.abs(t.tilt) >= TEMPO_SPEAK) {
    var tired = t.tilt < 0;
    var why = t.source === 'live'
      ? '依本場前 ' + t.n + ' 題與你各科平常水準的落差判讀。'
      : '依你在「' + t.part + '」的長期紀錄（' + t.n + ' 題，已排除科目難度差異）。';
    host.appendChild(el('span', {
      'class': 'tempo-chip ' + (tired ? 'tempo-hold' : 'tempo-push'),
      title: (tired ? '多排已練過的題鞏固，少排新題與難題。' : '多排新題與弱科，趁狀態好啃難的。') + why
    }, tired ? '節奏：鞏固' : '節奏：進攻'));
  }

  /* 決策訊息（§3.1 主表 + §3.2 時段×科目附加行）。有 claims 才有附加行。
     渲染只讀 tempo2.js 的管線／帳本輸出，不重算、不寫狀態。 */
  if (typeof tempoDecision === 'function') {
    var dec = tempoDecision();
    if (dec && (dec.message || dec.append)) {
      var box = el('div', { 'class': 'tempo-decision' });
      if (dec.message) { box.appendChild(el('p', { 'class': 'tempo-decision-main' }, dec.message)); }
      if (dec.append) { box.appendChild(el('p', { 'class': 'tempo-decision-add' }, dec.append)); }
      host.appendChild(box);
    }
  }
}

/* ===================== 自我驗證（console 呼叫） ===================== */
/* 涵蓋三個最容易錯的地方：科目混淆、樣本不足時的沉默、場次切分。 */
function selfTestTempo() {
  var out = [], pass = 0;
  function assert(name, cond) { out.push((cond ? '✓ ' : '✗ ') + name); if (cond) { pass += 1; } }
  function mk(n, ok, sub, ts) {
    var a = [];
    for (var i = 0; i < n; i++) { a.push({ mode: 'practice', correct: i < ok, subject: sub, ts: ts }); }
    return a;
  }
  var T = '2026-07-24 09:0', now = tempoMs('2026-07-24 09:30');

  /* 1. 科目混淆：某科基準本來就低,只答那科不該被讀成「狀態差」 */
  var hardOnly = mk(40, 16, '數學A', '2026-07-01 09:00')      /* 長期基準 40% */
    .concat(mk(10, 4, '數學A', '2026-07-24 09:05'));           /* 本場也是 40% */
  assert('科目基準低但表現如常 → 不判疲勞',
    Math.abs(livePulse(hardOnly, now).tilt) < 0.35);

  /* 2. 真的變差:同科同人,本場明顯低於自己的基準 */
  var slump = mk(40, 32, '國文', '2026-07-01 09:00')           /* 基準 80% */
    .concat(mk(10, 2, '國文', '2026-07-24 09:05'));            /* 本場 20% */
  assert('本場遠低於自身基準 → 判疲勞', livePulse(slump, now).tilt < -0.35);

  /* 3. 樣本不足必須沉默 */
  assert('本場不足 6 題 → 不表態', livePulse(mk(5, 1, '國文', '2026-07-24 09:05'), now) === null);

  /* 4. 場次切分:超過 45 分鐘的間隔要斷開,不能把上一場算進來 */
  var twoSess = mk(20, 0, '國文', '2026-07-24 06:00').concat(mk(3, 3, '國文', '2026-07-24 09:05'));
  assert('隔 3 小時的舊場不算本場', livePulse(twoSess, now) === null);

  /* 5. 時段層在樣本不足時不得宣稱 */
  var few = mk(30, 30, '國文', '2026-07-24 09:00');
  assert('時段樣本 30 題 → sig 為 false', dayPartProfile(few)['上午'].sig === false);

  /* 6. 舊紀錄沒有 ts 不可炸 */
  assert('缺 ts 不炸', livePulse([{ mode: 'practice', correct: true, subject: '國文' }], now) === null);

  /* 7. 權重塑形方向 */
  var w = tempoShapeWeights({ a: 0.6, b: 0.3 }, 1);
  assert('狀態好 → 弱項更集中', (w.a / w.b) > (0.6 / 0.3));
  var w2 = tempoShapeWeights({ a: 0.6, b: 0.3 }, -1);
  assert('疲勞 → 攤平', (w2.a / w2.b) < (0.6 / 0.3));

  assert('回鍋間隔隨疲勞縮短', tempoReviewEvery(-1) < tempoReviewEvery(0) &&
    tempoReviewEvery(0) < tempoReviewEvery(1));

  console.log(out.join('\n'));
  console.log(pass + '/' + out.length + ' 通過');
  return pass === out.length;
}
