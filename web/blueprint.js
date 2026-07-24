'use strict';
/* ============================================================
   學習藍圖 — 備考模式 2×2(程度 planBasis × 時程 planWeeks)、
   每週工作量推估、各科覆蓋與掌握。

   由 app.js 切出以維持單檔 <800 行(many small files)。沿用 app.js 的全域:
   state / byQid / usable / bank / SUBJECTS / SUBJECT_NOTES /
   masterRepsFor / patchSettings / renderPracticeHead / renderYearDist /
   showPanel / diffDays / todayStr / pct / $ / el。
   ============================================================ */

function masteredSet() {
  var m = {};
  var need = masterRepsFor();
  Object.keys(state.srs).forEach(function (qid) {
    if (byQid[qid] && state.srs[qid].reps >= need) { m[qid] = true; }
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
