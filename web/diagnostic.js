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

/* 診斷所需時間，由**題數**推導，不寫死。
   🔴 原本兩張卡片寫死「約 10 分鐘」，而它跟實際題數完全脫鉤——這在**每一個考試**都是錯的，
   不只教檢：學測 6 科 ×4 ＝ 24 題其實約 29 分鐘；教檢未選類科時是 84 題、約 101 分鐘，
   卻同樣寫著「約 10 分鐘」，差了十倍。使用者是照這個數字決定要不要做的，寫死等於騙他。
   係數用本專案既有的 **1.2 分/題**（ADR-0001：官方時間 ÷ 官方題數，實證 ≈1.2），
   不另立一套。 */
var DIAG_MIN_PER_Q = 1.2;
function diagMins(n) {
  var m = Math.max(1, Math.round(n * DIAG_MIN_PER_Q));
  return m < 60 ? ('約 ' + m + ' 分鐘')
    : ('約 ' + Math.floor(m / 60) + ' 小時' + (m % 60 ? ' ' + (m % 60) + ' 分' : ''));
}

function showDiagOverlay() {
  var ov = $('diag-overlay');
  ov.hidden = false;
  ov.textContent = '';
  var sheet = el('div', { 'class': 'diag-sheet' });
  sheet.appendChild(el('div', { 'class': 'seal' }, '入學測驗'));
  sheet.appendChild(el('h2', null, '先做一次入學診斷'));
  /* 略過的去向要寫死在第一個畫面上。使用者略過之後最常見的問題是「我要去哪裡補做？」
     ——當下不講，之後就得自己找。入口只有一個（學習藍圖），所以這裡直接點名。 */
  sheet.appendChild(el('p', { 'class': 'diag-lead' },
    '在開始之前，花點時間量一下你目前的程度。系統會據此畫出你的各科能力雷達，' +
    '並建議一條備考路線。'));
  sheet.appendChild(el('p', { 'class': 'diag-lead' },
    '你隨時可以略過 —— 略過之後請到「學習藍圖」填寫，那裡是入學診斷唯一的入口，隨時可做、可重做。'));

  /* 兩層設計的第一層:自選組合的考試(學測/分科)先問應考科目,再決定診斷份量。
     只在這裡問是不夠的——診斷可以略過,所以設定頁有獨立且隨時可改的同一個欄位。 */
  var choices = el('div', { 'class': 'diag-choices' });
  var counts = el('div', null);
  function renderChoices() {
    choices.textContent = '';
    var n = SUBJECTS.length;
    choices.appendChild(diagChoice('簡短診斷',
      '每科 ' + DIAG_SHORT_PER + ' 題，共 ' + (DIAG_SHORT_PER * n) + ' 題（' + diagMins(DIAG_SHORT_PER * n) + '）',
      '逐題即時對錯。\n快速抓出強弱輪廓。', function () { startDiagnostic('short'); }));
    choices.appendChild(diagChoice('完整模擬',
      '每科 ' + DIAG_FULL_PER + ' 題，共 ' + (DIAG_FULL_PER * n) + ' 題（' + diagMins(DIAG_FULL_PER * n) + '）',
      '整卷計時、交卷評分。\n最接近真實考試手感。', function () { startDiagnostic('full'); }));
  }
  /* 分組考試(教檢:類科・科目)必須在這裡先問類科,否則診斷會用**全部** 21 科出題:
     簡短 84 題、完整 210 題——沒有人會做完，而且遠超過該科正式考試的規模。
     選定類科後收斂成 4–5 科（教檢正式考試就是考 4 科），份量才對得上真實考試。
     年份不在這裡問（見 IDR-0016）：年份是「練習範圍」不是「應考身分」，
     放進第一次見面的畫面只會多一個此刻無從判斷的選擇。 */
  if (typeof allCategoryNames === 'function' && allCategoryNames()) {
    sheet.appendChild(diagCategoryPicker(renderChoices));
  }
  if (EXAM.elective) { sheet.appendChild(diagSubjectPicker(renderChoices)); }
  renderChoices();
  sheet.appendChild(counts);
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
/* 診斷前的應考科目勾選。與設定頁寫同一個 state.settings.subjects,不是第二份資料;
   差別只在這裡是「新使用者第一次遇到它」的入口。改動即時反映在下方題數,
   不 reload(overlay 還開著),而是就地重算 SUBJECTS 供本次診斷使用。 */
function diagSubjectPicker(onChange) {
  var all = EXAM.subjects.slice();
  var cur = (state.settings.subjects && state.settings.subjects.length)
    ? state.settings.subjects.slice() : all.slice();
  var box = el('div', { 'class': 'diag-subjects' });
  box.appendChild(el('p', { 'class': 'diag-lead' }, '你要考哪幾科？（之後可在「設定」隨時增減）'));
  var wrap = el('div', { 'class': 'subj-checks' });
  var checks = [];
  all.forEach(function (s) {
    var lab = el('label', { 'class': 'chk chk-inline' });
    var cb = el('input', { type: 'checkbox', value: s });
    cb.checked = cur.indexOf(s) >= 0;
    cb.addEventListener('change', function () {
      var picked = checks.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
      if (picked.length === 0) { cb.checked = true; return; }   /* 至少一科 */
      patchSettings({ subjects: picked.length === all.length ? [] : picked });
      refreshActiveSubjects();
      /* 🔴 usable/papersIndex 依賴同一組範圍,漏了它 SUBJECTS 會與題池不同步:
         在 overlay 勾入新科目 → 診斷對該科抽到 0 題(題數比畫面宣稱的少),
         而且整個 session 都不 reload,診斷完回單題練習該科依然一題都不出。
         設定頁走 location.reload() 所以沒事,這裡是就地更新才需要自己補。 */
      rebuildUsable();
      var spans = syncSubjectSpans(state.settings);
      if (spans) { patchSettings({ subjectSpans: spans }); }
      onChange();
    });
    checks.push(cb);
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(' ' + s));
    wrap.appendChild(lab);
  });
  box.appendChild(wrap);
  return box;
}
/* 診斷前的應考類科勾選（分組考試專用；教檢 5 個類科）。
   與設定頁的「應考類科」寫同一個 `state.settings.examCategories`，不是第二份資料
   ——兩份會立刻打架（IDR-0012 決策一同一條理由）。差別只在這裡是新使用者第一次
   遇到它的入口，而且改動要**即時**反映在下方的題數上，所以就地重算而不 reload。 */
function diagCategoryPicker(onChange) {
  var allCats = allCategoryNames();
  var cur = (state.settings.examCategories && state.settings.examCategories.length)
    ? state.settings.examCategories.slice() : allCats.slice();
  var box = el('div', { 'class': 'diag-subjects' });
  box.appendChild(el('p', { 'class': 'diag-lead' },
    '你要報考哪個類科？（之後可在「設定」隨時改）'));
  var wrap = el('div', { 'class': 'subj-checks' });
  var checks = [];
  allCats.forEach(function (c) {
    var lab = el('label', { 'class': 'chk chk-inline' });
    var cb = el('input', { type: 'checkbox', value: c });
    cb.checked = cur.indexOf(c) >= 0;
    cb.addEventListener('change', function () {
      var picked = checks.filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
      if (picked.length === 0) { cb.checked = true; return; }   /* 至少一個類科 */
      patchSettings({ examCategories: picked.length === allCats.length ? [] : picked });
      refreshActiveSubjects();
      rebuildUsable();   /* 題池要跟著收斂,否則抽題時該科 0 題(見 diagSubjectPicker 同一註解) */
      var spans = (typeof syncSubjectSpans === 'function') ? syncSubjectSpans(state.settings) : null;
      if (spans) { patchSettings({ subjectSpans: spans }); }
      onChange();
    });
    checks.push(cb);
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(' ' +
      ((typeof subjectGroupLabel === 'function') ? subjectGroupLabel(c) : c)));
    wrap.appendChild(lab);
  });
  box.appendChild(wrap);
  return box;
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

/* 每科抽 perN 題(隨機、不重複);跨科交錯,避免同科連續。
   dedup=true(完整模擬用):不再前置 dedupByContent 砍掉舊年份,改套同場雙層互斥——
   stemFingerprint(同題幹、不同選項的跨年孿生題)＋ contentFingerprint(內容完全相同的
   跨年重複收錄題),seen={stem:{},content:{}} 跨全科共用同一個狀態物件(與 modes.js
   模擬考同一套指紋函式);兩份同內容題本次診斷同場只留一份,但下次診斷/模擬考仍可
   輪替抽到另一份,不像舊版直接把舊年份砍出候選池。 */
function sampleBySubject(perN, dedup) {
  var src = usable;
  var bySub = {};
  SUBJECTS.forEach(function (s) { bySub[s] = []; });
  shuffle(src.slice()).forEach(function (q) { if (bySub[q.subject]) { bySub[q.subject].push(q); } });
  var seen = { stem: {}, content: {} };
  var buckets = SUBJECTS.map(function (s) {
    if (!dedup) { return bySub[s].slice(0, perN); }
    var picked = [];
    for (var i = 0; i < bySub[s].length && picked.length < perN; i++) {
      var q = bySub[s][i];
      var stemFp = (typeof stemFingerprint === 'function') ? stemFingerprint(q) : null;
      if (stemFp !== null && seen.stem[stemFp]) { continue; }
      var contentFp = (typeof contentFingerprint === 'function') ? contentFingerprint(q) : null;
      if (contentFp !== null && seen.content[contentFp]) { continue; }
      if (stemFp !== null) { seen.stem[stemFp] = true; }
      if (contentFp !== null) { seen.content[contentFp] = true; }
      picked.push(q);
    }
    return picked;
  });
  var out = [];
  for (var i = 0; i < perN; i++) {
    buckets.forEach(function (b) { if (b[i]) { out.push(b[i]); } });
  }
  return out;
}

function startDiagnostic(kind) {
  closeDiagOverlay();
  if (kind === 'full') {
    var qs = sampleBySubject(DIAG_FULL_PER, true);
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
  var recLabel = '建議程度：' + (recBasis === 'has' ? '有基礎' : '無基礎') + '（時程請依你可用時間自選）';
  patchSettings({
    diagnosedAt: todayStr(),
    examGoal: { kind: kind, recommendedBasis: recBasis, overallAcc: Math.round(overall * 100) / 100, diagnosedDate: todayStr() }
  });

  var panel = $(panelId);
  var block = el('div');
  block.appendChild(el('h3', null, '入學診斷結果'));
  var resultText = '整體正確率 ' + pct(overall) + '（' + totOk + ' / ' + totN +
    ' 題）。' + recLabel + '。';
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
    '這是「起點」，不是「結果」。雷達會隨你每天作答改變；備考量是為上榜而設計的工作量推估，不是保證。時程由你在學習藍圖自選（半年／一年）。'));

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
