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
/* 從時間戳取「時段」:上午(05–11)/下午(12–17)/晚上(18–04)。無 ts 回 null。 */
function dayPart(ts) {
  if (!ts || ts.indexOf(' ') < 0) { return null; }
  var h = Number(ts.split(' ')[1].split(':')[0]);
  if (h >= 5 && h < 12) { return '上午'; }
  if (h >= 12 && h < 18) { return '下午'; }
  return '晚上';
}

/* 「考試形式整卷」成績登錄(只有原卷 / 完整模擬 / 完整診斷呼叫)→ state.exams */
function recordExam(mode, total, ok, secs) {
  if (!total) { return; }
  var rec = { ts: nowStamp(), mode: mode, total: total, ok: ok };
  if (secs) { rec.secs = secs; }   /* 耗時(秒);P5 歷史耗時欄 + ADR-0001 係數校準資料來源 */
  var examsNext = state.exams.concat([rec]);
  saveState(Object.assign({}, state, { exams: examsNext }));
}

/* 落點統計(只看 state.exams):cumAcc 累積平均、rollingAcc 近 N 題滾動、
   best/worst 單卷最佳/最低、n 卷數。 */
function examStats(rollingN) {
  var ex = state.exams || [];
  var sumOk = 0, sumTot = 0, best = null, worst = null;
  ex.forEach(function (e) {
    sumOk += e.ok; sumTot += e.total;
    var a = e.total ? e.ok / e.total : 0;
    if (best === null || a > best) { best = a; }
    if (worst === null || a < worst) { worst = a; }
  });
  /* 近 N 題:由最新的卷往回累積,直到題數 ≥ N(題數錨定,不受休息日影響) */
  var rOk = 0, rTot = 0, N = rollingN || 20;
  for (var i = ex.length - 1; i >= 0 && rTot < N; i--) { rOk += ex[i].ok; rTot += ex[i].total; }
  return {
    n: ex.length,
    cumAcc: sumTot ? sumOk / sumTot : null,
    cumDone: sumTot,
    rollingAcc: rTot ? rOk / rTot : null,
    rollingN: rTot,
    best: best, worst: worst
  };
}

/* 完成涵蓋:不分模式,只要作答過(任何練習)就算「碰過這題」—— 覆蓋率鼓勵練習,不涉表現 */
function completionCount() {
  var seen = {};
  state.log.forEach(function (e) { if (e.qid && byQid[e.qid]) { seen[e.qid] = true; } });
  return Object.keys(seen).length;
}
