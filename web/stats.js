'use strict';
/* ============================================================
   時間戳 + 落點統計 —— 把「進步追蹤」的資料邏輯獨立成一檔(app.js 行數控制)。

   設計原則(對外只露功能):
   - 「落點/平均」只由「考試形式整卷」(state.exams:歷屆原卷 / 完整模擬 / 完整診斷)
     累積。單題練習、弱點殲滅、少量模擬、申論一律不計入平均 —— 鼓勵多練,
     不讓「怕拉低分數」變成不敢練的障礙(多練無妨、別製造障礙)。
   - 短期看「近 N 題」滾動(題數錨定,不受休息日扭曲),長期看累積平均(分母大、動得慢)。
   - completionCount 只問「碰過沒」(覆蓋率),不分形式 —— 覆蓋率鼓勵廣練。

   依賴 app.js 全域:todayStr / pad2 / state / saveState / byQid。
   皆於使用者互動後呼叫,載入順序安全。
   ============================================================ */

/* 24 小時制時間戳:'YYYY-MM-DD HH:MM'(date 部分與 todayStr 相容,供時段分析/歷史) */
function nowStamp() {
  var d = new Date();
  return todayStr() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
/* 從時間戳取「時段」:上午(05–11)/下午(12–17)/晚上(18–21)/深夜(22–04)。無 ts 回 null。
   深夜單獨切出來(2026-07-24):把 22:00 和 19:00 併成「晚上」會把最可能有疲勞效應的
   時段稀釋掉——那正是這個分桶存在的目的。代價是多一桶、達到樣本門檻更慢。 */
function dayPart(ts) {
  /* 一律先轉字串:state 可由「匯入進度」載入外部 JSON(progress.js),ts 不保證是字串。
     舊版直接 ts.indexOf() 遇到數字型 ts 會整個 TypeError,連帶讓時段圖白畫面。 */
  if (!ts || typeof ts !== 'string' || ts.indexOf(' ') < 0) { return null; }
  var h = Number(ts.split(' ')[1].split(':')[0]);
  if (!(h >= 0 && h <= 23)) { return null; }
  if (h >= 5 && h < 12) { return '上午'; }
  if (h >= 12 && h < 18) { return '下午'; }
  if (h >= 18 && h < 22) { return '晚上'; }
  return '深夜';
}

/* 「考試形式整卷」成績登錄(只有原卷 / 完整模擬 / 完整診斷呼叫)→ state.exams */
function recordExam(mode, total, ok, secs, free) {
  if (!total) { return; }
  var rec = { ts: nowStamp(), mode: mode, total: total, ok: ok };
  /* 送分題:**分數照算、平均不算**。total/ok 是「這張卷你對幾題」,要含送分題,
     否則 40 題全對卻報 39 題。free 記下其中幾題是送分,讓 examStats 把它從
     落點與平均正確率的分子分母同時扣掉——那是能力估計,不該被人人皆對的題目稀釋。
     舊紀錄沒有 free 欄位,一律當 0。 */
  if (free) { rec.free = free; }
  if (secs) { rec.secs = secs; }   /* 耗時(秒);P5 歷史耗時欄 + ADR-0001 係數校準資料來源 */
  var examsNext = state.exams.concat([rec]);
  saveState(Object.assign({}, state, { exams: examsNext }));
}

/* 落點統計(只看 state.exams):cumAcc 累積平均、rollingAcc 近 N 題滾動、
   best/worst 單卷最佳/最低、n 卷數。 */
function examStats(rollingN) {
  var ex = state.exams || [];
  /* 落點/平均是**能力估計**,故一律扣掉送分題(分子分母同扣)。整卷當下顯示的分數
     不走這裡,仍含送分題——見 recordExam 的註解。 */
  function tot(e) { return Math.max(0, e.total - (e.free || 0)); }
  function okOf(e) { return Math.max(0, e.ok - (e.free || 0)); }
  var sumOk = 0, sumTot = 0, best = null, worst = null;
  ex.forEach(function (e) {
    sumOk += okOf(e); sumTot += tot(e);
    if (!tot(e)) { return; }   /* 整卷都是送分題:無從估計能力,不進最佳/最低 */
    var a = okOf(e) / tot(e);
    if (best === null || a > best) { best = a; }
    if (worst === null || a < worst) { worst = a; }
  });
  /* 近 N 題:由最新的卷往回累積,直到題數 ≥ N(題數錨定,不受休息日影響) */
  var rOk = 0, rTot = 0, N = rollingN || 20;
  for (var i = ex.length - 1; i >= 0 && rTot < N; i--) { rOk += okOf(ex[i]); rTot += tot(ex[i]); }
  return {
    n: ex.length,
    cumAcc: sumTot ? sumOk / sumTot : null,
    cumDone: sumTot,
    rollingAcc: rTot ? rOk / rTot : null,
    rollingN: rTot,
    best: best, worst: worst
  };
}

/* 完成涵蓋:不分模式,只要作答過(任何練習)就算「碰過這題」—— 覆蓋率鼓勵練習,不涉表現。
   🔴 只算**目前範圍內**的題。分母是 `usable.length`(charts.js renderLandingStats),
   分子若用全題庫 `byQid`,縮年份／退科目之後就會出現「已練過 300 / 共 80 題（375%）」
   ——進度條還會撐爆版面。這與 masteredSet 是同一個病:**凡是把「範圍內」與「全部」
   相減或相除的地方,兩邊必須是同一個範圍**(ADR-0014)。 */
function completionCount() {
  var inScopeSet = {};
  usable.forEach(function (q) { inScopeSet[q.qid] = true; });
  var seen = {};
  state.log.forEach(function (e) { if (e.qid && inScopeSet[e.qid]) { seen[e.qid] = true; } });
  return Object.keys(seen).length;
}

/* ===================== 自我驗證(瀏覽器 console 呼叫 selfTestFreeScoring()) =====================
   驗的是「送分題的兩套帳」——整卷分數含它、能力估計不含它。這條規則橫跨 recordExam /
   examStats / subjectStats 三處,任何一處漏改都會讓兩套帳悄悄合而為一,而畫面不會報錯。 */
function selfTestFreeScoring() {
  var out = [], pass = 0;
  function assert(name, cond) { out.push((cond ? '✓ ' : '✗ ') + name); if (cond) { pass += 1; } }

  var saved = state.exams;
  /* 一張 40 題的卷,其中 1 題送分,學生實答 39 題全對 → 顯示 40/40,能力估計 39/39。 */
  state.exams = [{ ts: '2026-07-31 10:00', mode: 'paper', total: 40, ok: 40, free: 1 }];
  var s1 = examStats(20);
  assert('F1 全對：能力估計扣掉送分題後仍是 100%', s1.cumAcc === 1 && s1.cumDone === 39);

  /* 實答 28 題對 → 卷面 29/40;能力估計 28/39。**不是** 29/40。 */
  state.exams = [{ ts: '2026-07-31 10:00', mode: 'paper', total: 40, ok: 29, free: 1 }];
  var s2 = examStats(20);
  assert('F2 送分題分子分母同扣（28/39，非 29/40）',
    Math.abs(s2.cumAcc - 28 / 39) < 1e-9 && s2.cumDone === 39);
  assert('F2b 未扣的話會是 29/40，兩者確實不同', Math.abs(28 / 39 - 29 / 40) > 1e-6);

  /* 舊紀錄沒有 free 欄位 → 一律當 0,行為與改版前完全相同(向下相容)。 */
  state.exams = [{ ts: '2026-07-30 10:00', mode: 'paper', total: 40, ok: 29 }];
  var s3 = examStats(20);
  assert('F3 舊紀錄無 free 欄位時行為不變', Math.abs(s3.cumAcc - 29 / 40) < 1e-9 && s3.cumDone === 40);

  /* 極端:整卷都是送分題 → 分母 0,不能回 NaN,也不該進最佳/最低。 */
  state.exams = [{ ts: '2026-07-31 11:00', mode: 'paper', total: 3, ok: 3, free: 3 }];
  var s4 = examStats(20);
  assert('F4 整卷皆送分：不回 NaN、不進最佳／最低',
    s4.cumAcc === null && s4.best === null && s4.worst === null);

  /* countsForStats:雷達那一側的同一條規則。 */
  if (typeof countsForStats === 'function') {
    assert('F5 送分題不進雷達', countsForStats({ mode: 'practice', correct: true, free: true }) === false);
    assert('F5b 一般題進雷達', countsForStats({ mode: 'practice', correct: true }) === true);
    assert('F5c 申論不進雷達', countsForStats({ mode: 'essay', correct: true }) === false);
  }

  state.exams = saved;
  console.log(out.join('\n'));
  console.log(pass + '/' + out.length + ' 通過');
  return pass === out.length;
}
