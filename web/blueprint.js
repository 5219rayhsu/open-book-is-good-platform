'use strict';
/* ============================================================
   學習藍圖 — 備考模式 2×2(程度 planBasis × 時程 planWeeks)、
   每週工作量推估、各科覆蓋與掌握。

   由 app.js 切出以維持單檔 <800 行(many small files)。沿用 app.js 的全域:
   state / byQid / usable / bank / SUBJECTS / SUBJECT_NOTES /
   masterRepsFor / patchSettings / renderPracticeHead / renderYearDist /
   showPanel / diffDays / todayStr / pct / $ / el。
   ============================================================ */

/* 🔴 只算**目前範圍內**的題。`byQid` 是全題庫(刻意如此,歷史紀錄要能還原已退選的舊題),
   拿它當分母以外的來源會讓「已掌握」把範圍外的題也算進來:退掉某科／某年之後,
   `weeklyTarget` 的 remain = usable.length − mastered 會被範圍外的已掌握題硬扣一大塊,
   每週題數憑空塌下來——那些題並沒有變簡單,只是不在視野內。`Math.max(0, …)` 只是把
   負數藏起來,不是修好。`renderCoverage` 本來就再與 usable 交集一次,改在這裡最省事。 */
function masteredSet() {
  var m = {};
  var need = masterRepsFor();
  var inScope = {};
  usable.forEach(function (q) { inScope[q.qid] = true; });
  Object.keys(state.srs).forEach(function (qid) {
    if (inScope[qid] && state.srs[qid].reps >= need) { m[qid] = true; }
  });
  return m;
}
function weeklyTarget() {
  /* P4:設了「預計考試日期」且未過期 → 用真實剩餘天數推估;否則沿用 半年/一年 時程。 */
  var examDate = state.settings.examDate;
  var daysToExam = examDate ? diffDays(todayStr(), examDate) : null;
  var byExamDate = (daysToExam !== null && daysToExam > 0);
  var weeks, left;
  if (byExamDate) {
    left = Math.max(1, Math.ceil(daysToExam / 7));
    weeks = Math.max(1, Math.ceil(diffDays(state.settings.start, examDate) / 7));
  } else {
    weeks = state.settings.planWeeks || 26;
    var elapsed = Math.floor(diffDays(state.settings.start, todayStr()) / 7);
    left = Math.max(1, weeks - elapsed);
  }
  var mastered = Object.keys(masteredSet()).length;
  var remain = Math.max(0, usable.length - mastered);
  return { weeks: weeks, left: left, remain: remain, mastered: mastered,
    perWeek: Math.ceil(remain / left), daysToExam: daysToExam, byExamDate: byExamDate };
}
/* 四象限(planBasis × planWeeks)備考方針文案 —— 各一段、繁中全形,共用誠實尾句。 */
function planPolicyText() {
  var basis = state.settings.planBasis, weeks = state.settings.planWeeks, lead;
  if (basis === 'has' && weeks === 52) {
    lead = '一年・有基礎（最從容）：從容精練。間隔重複拉長、深掘直覺，以作答練習為主、弱點殲滅補強。';
  } else if (basis === 'has') {
    lead = '半年・有基礎：高效複習衝刺。80% 時間打最弱環節（弱點殲滅）＋易混淆題組，補洞為輔。';
  } else if (basis === 'none' && weeks === 52) {
    lead = '一年・無基礎：穩健打底。前期先弄清楚怎麼準備這個考試、用基礎題補齊前置概念建立直覺，中後期轉以作答練習與弱點殲滅。';
  } else {
    lead = '半年・無基礎（最重）：高強度衝刺，誠實提醒——每週量很大、適合背水一戰，務必排固定休息防倦怠，並先找出最短路徑、別平均撒網。';
  }
  return lead + '先照這個量試 2–4 週，再依實際正確率調整。這是為上榜而設計的工作量推估，不是上榜保證；進度依實際作答每天滾動重算。';
}
function renderBlueprint() {
  $('basis-has').setAttribute('aria-pressed', String(state.settings.planBasis === 'has'));
  $('basis-none').setAttribute('aria-pressed', String(state.settings.planBasis === 'none'));
  $('weeks-26').setAttribute('aria-pressed', String(state.settings.planWeeks === 26));
  $('weeks-52').setAttribute('aria-pressed', String(state.settings.planWeeks === 52));
  var wt = weeklyTarget();
  var ed = $('exam-date');
  if (ed) { ed.value = state.settings.examDate || ''; }
  var cd = $('exam-countdown');
  if (cd) {
    if (wt.byExamDate) {
      cd.textContent = '距考試還有 ' + wt.daysToExam + ' 天（約 ' + wt.left + ' 週）';
      cd.classList.remove('past');
    } else if (state.settings.examDate) {
      cd.textContent = '（已過考試日，改用時程估算）';
      cd.classList.add('past');
    } else { cd.textContent = ''; cd.classList.remove('past'); }
  }
  $('weekly-target').textContent = '每週應完成約 ' + wt.perWeek + ' 題（未掌握 ' +
    wt.remain + ' 題 ÷ 剩餘 ' + wt.left + ' 週' + (wt.byExamDate ? '，依考試日' : '') + '）';
  $('plan-detail').textContent = '公式：每週題數 = 未掌握題數 ÷ 剩餘週數。「已掌握」= 同一題連續答對 ' +
    masterRepsFor() + ' 次（無基礎門檻較高）。起算日 ' + state.settings.start + '，全程 ' + wt.weeks +
    ' 週，已掌握 ' + wt.mastered + ' 題。' + planPolicyText();
  /* 診斷狀態要說出來。`examGoal.kind === 'skipped'` 一直有存,卻沒有任何畫面讀它——
     於是略過的人看到的藍圖跟做完的人一模一樣,也不知道還能回去做。
     未完成一律寫「尚未做過」,不標「（先前略過）」:同一句話要同時服務
     「略過過」與「根本沒遇過」兩種人,標了對後者是錯的,而且對前者也沒多給資訊
     ——他要的是旁邊那顆「做入學診斷」按鈕。 */
  var ds = $('diag-state');
  if (ds) {
    var g = state.settings.examGoal;
    var done = g && g.kind !== 'skipped';
    ds.textContent = done
      ? '入學診斷：已於 ' + (g.diagnosedDate || state.settings.diagnosedAt) + ' 完成'
      : '入學診斷：尚未做過';
    var rb = $('btn-rediagnose');
    if (rb) { rb.textContent = done ? '重做入學診斷' : '做入學診斷'; }
  }
  $('include-review').checked = !!state.settings.includeReview;
  var legacyChk = $('include-legacy');
  if (legacyChk) { legacyChk.checked = !!state.settings.includeLegacy; }
  var rc = $('review-count');
  if (rc) {
    rc.textContent = bank ? String(bank.questions.filter(function (q) { return q.parse === 'review'; }).length) : '—';
  }
  renderCoverage();
  renderYearDist();
  renderSubjectNotes();
}
function renderCoverage() {
  var box = $('coverage-table');
  box.textContent = '';
  if (!bank) { box.textContent = '題庫載入後顯示。'; return; }
  var mset = masteredSet();
  var table = el('table'), thead = el('thead'), tr = el('tr');
  ['科目', '總題', '可練', '已練', '已掌握', '覆蓋率'].forEach(function (h, i) {
    tr.appendChild(el('th', i > 0 ? { 'class': 'num' } : null, h));
  });
  thead.appendChild(tr); table.appendChild(thead);
  var tb = el('tbody');
  SUBJECTS.forEach(function (sub) {
    var total = bank.questions.filter(function (q) { return q.subject === sub; }).length;
    var can = usable.filter(function (q) { return q.subject === sub; });
    var seen = can.filter(function (q) { return state.srs[q.qid]; }).length;
    var mas = can.filter(function (q) { return mset[q.qid]; }).length;
    var row = el('tr');
    /* 顯示名依應考類科收斂(subjectDisplayLabel,app.js);篩選用的 sub 本身不變。 */
    var dispSub = (typeof subjectDisplayLabel === 'function') ? subjectDisplayLabel(sub) : sub;
    row.appendChild(el('td', null, dispSub));
    [total, can.length, seen, mas].forEach(function (v) { row.appendChild(el('td', { 'class': 'num' }, String(v))); });
    row.appendChild(el('td', { 'class': 'num' }, can.length > 0 ? pct(seen / can.length) : '—'));
    tb.appendChild(row);
  });
  table.appendChild(tb); box.appendChild(table);
}
function renderSubjectNotes() {
  var dl = $('subject-notes');
  dl.textContent = '';
  SUBJECTS.forEach(function (sub) {
    /* 顯示名依應考類科收斂(subjectDisplayLabel,app.js);SUBJECT_NOTES 的鍵仍用原始 sub。 */
    var dispSub = (typeof subjectDisplayLabel === 'function') ? subjectDisplayLabel(sub) : sub;
    dl.appendChild(el('dt', null, dispSub));
    dl.appendChild(el('dd', null, SUBJECT_NOTES[sub]));
  });
}
/* 兩維度各自設定。改程度會連動精熟門檻 → masteredSet/每週量重算。 */
function setBasis(basis) { patchSettings({ planBasis: basis }); renderBlueprint(); renderPracticeHead(); }
function setWeeks(weeks) { patchSettings({ planWeeks: weeks }); renderBlueprint(); renderPracticeHead(); }
/* P4 預計考試日期(選填):設了就接管「剩餘週數」;清除則回 半年/一年 時程。 */
function setExamDate(val) { patchSettings({ examDate: val || '' }); renderBlueprint(); renderPracticeHead(); }

/* ===================== 自我驗證(console 呼叫 selfTestScope()) =====================
   驗「範圍」的兩件事,兩件都是**看畫面看不出來**的:
     ① 年份只縮題池,不動作答紀錄與雷達(IDR-0014)
     ② 已掌握題數必須與題池同範圍,否則退選後每週題數會憑空塌陷 */
function selfTestScope() {
  var out = [], pass = 0;
  function assert(name, cond) { out.push((cond ? '✓ ' : '✗ ') + name); if (cond) { pass += 1; } }

  var savedUsable = usable, savedSrs = state.srs, savedYears = state.settings.years;

  /* 情境：題庫 111-115 各 100 題，學生已把 111 年的 60 題練到掌握。 */
  var all = [];
  [111, 112, 113, 114, 115].forEach(function (y) {
    for (var i = 0; i < 100; i++) { all.push({ qid: y + '_x_' + i, year: y, subject: '國綜' }); }
  });
  var srs = {};
  for (var i = 0; i < 60; i++) { srs['111_x_' + i] = { reps: 99 }; }
  state.srs = srs;

  usable = all.slice();
  var mAll = Object.keys(masteredSet()).length;
  assert('S1 全年份：已掌握 60 題', mAll === 60);

  /* 把 111 年退出視野 → 題池 500→400,已掌握必須跟著歸零(那 60 題不在範圍內了) */
  usable = all.filter(function (q) { return q.year !== 111; });
  var mNarrow = Object.keys(masteredSet()).length;
  assert('S2 退掉 111 年：題池 400', usable.length === 400);
  assert('S3 已掌握隨題池收斂為 0（不是仍算 60）', mNarrow === 0);
  /* 這一條是重點:舊版用 byQid(全題庫)算已掌握,remain 會變成 400−60=340,
     等於「退掉一年反而少 60 題要練」——那 60 題並沒有變簡單,只是不在視野內。 */
  assert('S4 未掌握 = 400 而非 340（退選不該讓進度憑空前進）',
    Math.max(0, usable.length - mNarrow) === 400);

  /* 作答紀錄與 SRS 一律保留:加回來時舊資料還在(IDR-0012 同一條原則) */
  assert('S5 退選不刪 SRS，加回來時仍在', Object.keys(state.srs).length === 60);
  usable = all.slice();
  assert('S6 把 111 年加回來：已掌握回到 60', Object.keys(masteredSet()).length === 60);

  usable = savedUsable; state.srs = savedSrs; state.settings.years = savedYears;
  console.log(out.join('\n'));
  console.log(pass + '/' + out.length + ' 通過');
  return pass === out.length;
}
