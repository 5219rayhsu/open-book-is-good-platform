'use strict';
/* ============================================================
   入學診斷(首次開啟時跳出)— 量出起點:先量地形,再規畫路線。

   兩種長度,皆把作答寫入正式紀錄,因此一做完雷達/趨勢就會反映:
     簡短  各科每科 4 題(逐題即時回饋,約 10 分鐘)
     完整  各科每科 10 題(整卷計時、交卷評分,接近真考份量)

   科目清單依當前考試(exams.js 的 SUBJECTS)動態決定;診斷涵蓋該考試的所有
   選擇題科目,題數隨科目數浮動。
   完成後:算出各科正確率 → 餵能力雷達 → 依整體程度「建議」備考模式。
   誠實揭露:這是「為上榜而設計」的起點估計與工作量推估,不是上榜預測;
   六個月/十二個月是設計目標,沒有任何系統能保證考試結果。

   依賴 app.js 全域:state / usable / SUBJECTS / subjectStats / startDrill /
   startSheet / patchSettings / setBasis / showPanel / el / $ / pct / shuffle /
   todayStr;charts.js 的 drawRadarInto。
   ============================================================ */

var DIAG_SHORT_PER = 4, DIAG_FULL_PER = 10;
var DIAG_GOOD_LINE = 0.5;   /* 整體正確率達此值 → 建議「有基礎」;否則「無基礎」 */

function maybeStartDiagnostic() {
  if (state.settings.diagnosedAt) { return; }   /* 做過(或略過)就不再打擾 */
  if (usable.length === 0) { return; }
  showDiagOverlay();
}

function showDiagOverlay() {
  var ov = $('diag-overlay');
  ov.hidden = false;
  ov.textContent = '';
  var sheet = el('div', { 'class': 'diag-sheet' });
  sheet.appendChild(el('div', { 'class': 'seal' }, '入學測驗'));
  sheet.appendChild(el('h2', null, '先做一次入學診斷'));
  sheet.appendChild(el('p', { 'class': 'diag-lead' },
    '在開始之前，花點時間量一下你目前的程度。系統會據此畫出你的各科能力雷達，' +
    '並建議一條備考路線。你隨時可以略過，之後也能在「學習藍圖」重做。'));

  var choices = el('div', { 'class': 'diag-choices' });
  choices.appendChild(diagChoice('簡短診斷', '每科 ' + DIAG_SHORT_PER + ' 題，共 ' + (DIAG_SHORT_PER * SUBJECTS.length) + ' 題', '逐題即時對錯，約 10 分鐘。\n快速抓出強弱輪廓。', function () { startDiagnostic('short'); }));
  choices.appendChild(diagChoice('完整模擬', '每科 ' + DIAG_FULL_PER + ' 題，共 ' + (DIAG_FULL_PER * SUBJECTS.length) + ' 題', '整卷計時、交卷評分。\n最接近真實考試手感。', function () { startDiagnostic('full'); }));
  sheet.appendChild(choices);

  var skip = el('p', { 'class': 'diag-skip' });
  skip.appendChild(document.createTextNode('想直接練？'));
  var sb = el('button', { type: 'button' }, '略過診斷，直接開始');
  sb.addEventListener('click', skipDiagnostic);
  skip.appendChild(sb);
  sheet.appendChild(skip);

  sheet.appendChild(el('p', { 'class': 'diag-honest' },
    '說明：診斷給的是「起點估計」，不是上榜預測。六個月/十二個月是為上榜而設計的工作量目標，\n' +
    '會依你實際作答每天滾動重算 —— 沒有任何系統能保證考試結果。'));
  ov.appendChild(sheet);
}
function diagChoice(name, meta, sub, onClick) {
  var b = el('button', { type: 'button', 'class': 'diag-choice' });
  b.appendChild(el('span', { 'class': 'dc-name' }, name));
  b.appendChild(el('span', { 'class': 'dc-sub' }, sub));
  b.appendChild(el('span', { 'class': 'dc-meta' }, meta));
  b.addEventListener('click', onClick);
  return b;
}
function closeDiagOverlay() { $('diag-overlay').hidden = true; }

function skipDiagnostic() {
  patchSettings({ diagnosedAt: todayStr(), examGoal: { kind: 'skipped', recommendedBasis: state.settings.planBasis } });
  closeDiagOverlay();
  showPanel('practice');
}

/* 每科抽 perN 題(隨機、不重複);跨科交錯,避免同科連續 */
function sampleBySubject(perN) {
  var bySub = {};
  SUBJECTS.forEach(function (s) { bySub[s] = []; });
  shuffle(usable.slice()).forEach(function (q) { if (bySub[q.subject]) { bySub[q.subject].push(q); } });
  var buckets = SUBJECTS.map(function (s) { return bySub[s].slice(0, perN); });
  var out = [];
  for (var i = 0; i < perN; i++) {
    buckets.forEach(function (b) { if (b[i]) { out.push(b[i]); } });
  }
  return out;
}

function startDiagnostic(kind) {
  closeDiagOverlay();
  if (kind === 'full') {
    var qs = sampleBySubject(DIAG_FULL_PER);
    startSheet(qs, {
      title: '入學診斷・完整模擬', mode: 'diagnostic', backTo: 'practice', graded: true,
      timing: examTiming(qs),   /* 倒數計時(見 ADR-0001) */
      subtitle: '各科每科 10 題、共 ' + qs.length + ' 題。整卷作答後交卷，系統據此畫雷達、建議路線。此為考試形式整卷，計入「落點」。',
      onGraded: function (res) { finishDiagnostic('full', res, 'panel-sheet'); }
    });
  } else {
    var items = sampleBySubject(DIAG_SHORT_PER).map(function (q) {
      return { q: q, reasonTag: '入學診斷', reason: '診斷題：先看看這個概念你目前掌握到哪。答完即知對錯。' };
    });
    startDrill(items, {
      title: '入學診斷・簡短', mode: 'diagnostic', backTo: 'practice',
      subtitle: '各科每科 4 題、共 ' + items.length + ' 題。答完系統會畫出你的能力雷達並建議路線。',
      onDone: function (res) { finishDiagnostic('short', res, 'panel-run'); }
    });
  }
}

function finishDiagnostic(kind, res, panelId) {
  var stats = subjectStats(false);
  var totN = 0, totOk = 0;
  SUBJECTS.forEach(function (s) { totN += stats[s].n; totOk += stats[s].ok; });
  var overall = totN > 0 ? totOk / totN : 0;
  var recBasis = overall >= DIAG_GOOD_LINE ? 'has' : 'none';
  var recLabel = '建議程度：' + (recBasis === 'has' ? '有基礎' : '無基礎') + '(時程請依你可用時間自選)';
  patchSettings({
    diagnosedAt: todayStr(),
    examGoal: { kind: kind, recommendedBasis: recBasis, overallAcc: Math.round(overall * 100) / 100, diagnosedDate: todayStr() }
  });

  var panel = $(panelId);
  var block = el('div');
  block.appendChild(el('h3', null, '入學診斷結果'));
  var resultText = '整體正確率 ' + pct(overall) + '(' + totOk + ' / ' + totN +
    ' 題)。' + recLabel + '。';
  block.appendChild(el('div', { 'class': 'diag-result-line' }, resultText));
  announce('入學診斷完成。' + resultText);   /* 螢幕報讀器朗讀診斷結果 */

  /* 弱項排序(誠實點名最該補的科) */
  var ranked = SUBJECTS.filter(function (s) { return stats[s].n > 0; })
    .map(function (s) { return { s: s, acc: stats[s].ok / stats[s].n }; })
    .sort(function (a, b) { return a.acc - b.acc; });
  if (ranked.length > 0) {
    var weak = ranked.slice(0, 2).map(function (r) { return r.s + '(' + pct(r.acc) + ')'; }).join('、');
    block.appendChild(el('p', { 'class': 'subtitle' }, '最該優先補強：' + weak + '。建議下一步去「弱點殲滅」。'));
  }

  var fig = el('div', { 'class': 'figure radar-figure' });
  block.appendChild(el('h4', null, '各科能力雷達（起點）'));
  block.appendChild(fig);
  if (typeof drawRadarInto === 'function') { drawRadarInto(fig, stats); }

  block.appendChild(el('p', { 'class': 'diag-honest' },
    '這是「起點」，不是「結果」。雷達會隨你每天作答改變；備考量是為上榜而設計的工作量推估，不是保證。時程由你在學習藍圖自選(半年／一年)。'));

  var recBasisLabel = recBasis === 'has' ? '有基礎' : '無基礎';
  var b1 = el('button', { type: 'button' }, '採用「' + recBasisLabel + '」並開始');
  b1.addEventListener('click', function () { setBasis(recBasis); showPanel('practice'); startToday(); });
  var b2 = el('button', { type: 'button', 'class': 'btn-quiet' }, '先看學習藍圖');
  b2.addEventListener('click', function () { setBasis(recBasis); showPanel('blueprint'); });
  var p = el('p'); p.appendChild(b1); p.appendChild(document.createTextNode(' ')); p.appendChild(b2);
  block.appendChild(p);

  panel.appendChild(block);
  block.scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderAll();
}
