'use strict';
/* ============================================================
   入學診斷(首次開啟時跳出)— 量出起點:先量地形,再規畫路線。

   兩種長度,皆把作答寫入正式紀錄,因此一做完雷達/趨勢就會反映:
     簡短  各科每科 4 題(逐題即時回饋,約 10 分鐘)
     完整  各科每科 10 題(整卷計時、交卷評分,接近真考份量)

   科目清單依當前考試(exams.js 的 SUBJECTS)動態決定,題數隨科目數浮動;
   有範圍問題的考試(教檢類科／學測科目)先在第一步收斂成實際要考的那幾科,
   不是全部選擇題科目——教檢不收斂是 21 科、簡短就 84 題。
   完成後:算出各科正確率 → 餵能力雷達 → 依整體程度「建議」備考模式。
   誠實揭露:這是「為上榜而設計」的起點估計與工作量推估,不是上榜預測;
   六個月/十二個月是設計目標,沒有任何系統能保證考試結果。

   兩步化(見 IDR-0020;延續 IDR-0016 決策一「範圍必須是畫面上第一個問題」):
   範圍是使用者早就知道的事實(報名時就決定了),份量是他到了現場才知道的當下條件
   (在通勤嗎、有沒有 48 分鐘),而且份量的判斷需要「這個範圍幾題、幾分鐘」當輸入
   ——因果決定順序,所以範圍在前。第一步的統計行因此兩種份量都要列。
   有「範圍問題」的考試(分組考試的類科、自選科目考試的科目)先問範圍
   (STEP_SCOPE)、再問強度(STEP_INTENSITY);兩步狀態機只存在 showDiagOverlay()
   內部的 closure({step,picked}),不進 state、不進 localStorage——
   全程只有使用者在第二步點下卡片時,diagCommitScope() 才寫入設定;
   第一步「下一步」與第二步「返回」都是純畫面切換,零寫入。
   沒有範圍問題的考試(律師/護理師等)維持單步,行為不變。

   依賴 app.js 全域:state / usable / SUBJECTS / subjectStats / startDrill /
   startSheet / patchSettings / setBasis / showPanel / el / $ / pct / shuffle /
   todayStr / refreshActiveSubjects / rebuildUsable / syncSubjectSpans /
   computeActiveSubjects;exams.js 的 allCategoryNames / subjectGroupLabel /
   examTiming;charts.js 的 drawRadarInto。
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

/* 這個考試有沒有「範圍問題」要在份量之前先問(見 IDR-0016 決策一):
   'category' ＝ 分組考試(教檢:類科・科目);'subject' ＝ 自選科目考試(學測/分科);
   null ＝ 兩者皆非(律師/護理師等全科必考),份量不受範圍影響,維持單步。 */
function diagScopeKind() {
  if (typeof allCategoryNames === 'function' && allCategoryNames()) { return 'category'; }
  if (EXAM.elective) { return 'subject'; }
  return null;
}

/* 三種進入情境(見 §4):首次 / 曾略過現在來做 / 已做過重做。
   決定 overlay 的標題、說明文案、逃生鈕——尤其是「skipDiagnostic 只在 first 綁定」
   這條:redo 若誤接 skipDiagnostic,會把已完成的 examGoal 覆寫成 {kind:'skipped'},
   是本次改動最危險的回歸點,所以三種情境全部由這裡集中判定,不散落各處各自猜。 */
function diagOverlayMode() {
  if (!state.settings.diagnosedAt) { return 'first'; }
  var goal = state.settings.examGoal;
  return (goal && goal.kind === 'skipped') ? 'redo-skipped' : 'redo';
}
function diagModeHeading(mode) {
  if (mode === 'first') { return '先做一次入學診斷'; }
  if (mode === 'redo-skipped') { return '做一次入學診斷'; }
  return '重做入學診斷';
}
/* 說明段落(依情境增減):首次兩段(含略過去向);曾略過只留首段(他就是從那個
   入口來的,不必再講一次去哪裡略過);已做過重做則改講「保留什麼、更新什麼」。 */
function diagModeLeads(mode) {
  if (mode === 'redo') {
    return ['重做會重新抽題、重新量一次目前程度。過去的作答紀錄、雷達與進度全部保留；' +
      '完成後只更新起點估計與建議路線。'];
  }
  var lead1 = '在開始之前，花點時間量一下你目前的程度。系統會據此畫出你的各科能力雷達，' +
    '並建議一條備考路線。';
  if (mode === 'redo-skipped') { return [lead1]; }
  return [lead1,
    '你隨時可以略過 —— 略過之後請到「學習藍圖」填寫，那裡是入學診斷唯一的入口，隨時可做、可重做。'];
}
/* 逃生鈕文案與行為;只有 first 會走 skipDiagnostic(唯一會寫入 examGoal:skipped 的路徑),
   redo 兩種情境一律只 closeDiagOverlay(),零寫入。 */
function diagEscapeConfig(mode) {
  if (mode === 'first') { return { lead: '想直接練？', label: '略過診斷，直接開始', onClick: skipDiagnostic }; }
  if (mode === 'redo-skipped') { return { lead: null, label: '先不做，返回', onClick: closeDiagOverlay }; }
  return { lead: null, label: '返回，不重做', onClick: closeDiagOverlay };
}
function diagEscapeElement(mode) {
  var cfg = diagEscapeConfig(mode);
  var p = el('p', { 'class': 'diag-skip' });
  if (cfg.lead) { p.appendChild(document.createTextNode(cfg.lead)); }
  var b = el('button', { type: 'button' }, cfg.label);
  b.addEventListener('click', cfg.onClick);
  p.appendChild(b);
  return p;
}

/* 第一步的預設勾選(見 §3):
   類科(教檢)——未設定過 → 全部不勾(逼使用者做一次有意識的選擇);
   科目(學測)——未設定過 → 全部勾選(自選科目考試本來就該預設全考)。
   兩者已設定過(redo,或設定頁改過)時,一律預先勾選目前的選擇。 */
function diagDefaultPicked(kind) {
  /* 🔴 存檔值要先濾掉「已不存在於本考試」的舊名（制度改版、類科/科目更名後的殘留）。
     不濾的話會出現一個自相矛盾的畫面:一個框都沒勾（舊名對不到任何 checkbox）,
     「下一步」卻是可以按的（picked 非空）,而統計行因為 activeCategories 判定
     「全部失效 → 回 null → 全部類科」而寫著「共 21 科、簡短 84 題」。
     隔壁的 activeCategories/computeActiveSubjects 本來就都濾（見 app.js 該處註解）,
     這裡補上只是把防呆姿勢對齊,不是新規則。 */
  if (kind === 'category') {
    var all = (typeof allCategoryNames === 'function' && allCategoryNames()) || [];
    var cur = state.settings.examCategories;
    if (!Array.isArray(cur)) { return []; }
    return cur.filter(function (c) { return all.indexOf(c) >= 0; });
  }
  var cur2 = state.settings.subjects;
  var keep = Array.isArray(cur2)
    ? cur2.filter(function (s) { return EXAM.subjects.indexOf(s) >= 0; }) : [];
  /* 科目全失效時回退成「全勾」——與設定頁「空陣列＝全部」的既有慣例一致,
     不讓使用者因為一次更名就被鎖到一科都選不到。類科則相反,回退成全不勾,
     因為那一步本來就要求他重新宣告一次報考身分。 */
  return keep.length ? keep : EXAM.subjects.slice();
}

/* 兩步的即時題數統計:此時設定尚未寫入,借 computeActiveSubjects() 的可選參數 s
   (app.js,見該函式頭註)用臨時物件試算「若真的這樣選,生效科目有幾科」,
   不在 diagnostic.js 另寫一份前綴/停考科目過濾邏輯——會跟 deprecatedSubjects drift。 */
function diagScopeSubjectCount(kind, picked) {
  if (kind === 'category') {
    return computeActiveSubjects({
      examCategories: picked,
      subjects: state.settings.subjects,
      includeDeprecated: state.settings.includeDeprecated
    }).length;
  }
  return computeActiveSubjects({
    examCategories: state.settings.examCategories,
    subjects: picked,
    includeDeprecated: state.settings.includeDeprecated
  }).length;
}

/* 換步後把焦點移到新畫面的標題,螢幕報讀器與鍵盤操作都跟得上畫面切換。 */
function diagFocusHeading(container) {
  var h2 = container.querySelector('h2');
  if (h2) { h2.setAttribute('tabindex', '-1'); h2.focus(); }
}

function showDiagOverlay() {
  var ov = $('diag-overlay');
  ov.hidden = false;
  var kind = diagScopeKind();
  if (!kind) { renderDiagSinglePage(ov); return; }   /* 無範圍問題的考試:維持單步(IDR-0016 決策二不回退) */
  var mode = diagOverlayMode();
  /* 狀態機只活在這個 closure 裡,不進 state、不進 localStorage;
     整個 overlay 內只有 diagCommitScope() 會呼叫 patchSettings(skipDiagnostic 除外)。 */
  var wizard = { step: 'scope', picked: diagDefaultPicked(kind) };
  function render() {
    ov.textContent = '';
    var sheet = (wizard.step === 'scope')
      ? renderDiagScope(kind, mode, wizard, render)
      : renderDiagIntensity(kind, mode, wizard, render);
    ov.appendChild(sheet);
    diagFocusHeading(sheet);
  }
  render();
}

/* 無範圍問題的考試(律師/護理師等):現行單頁,卡片含總題數與 diagMins() 時間,
   點卡片直接開始。仍需依 diagOverlayMode() 決定文案與逃生鈕——否則 redo 時
   逃生鈕會誤綁 skipDiagnostic,把已完成的 examGoal 覆寫成 skipped(見上方注記)。 */
function renderDiagSinglePage(ov) {
  ov.textContent = '';
  var mode = diagOverlayMode();
  var sheet = el('div', { 'class': 'diag-sheet' });
  sheet.appendChild(el('div', { 'class': 'seal' }, '入學測驗'));
  sheet.appendChild(el('h2', null, diagModeHeading(mode)));
  diagModeLeads(mode).forEach(function (t) { sheet.appendChild(el('p', { 'class': 'diag-lead' }, t)); });

  var n = SUBJECTS.length;
  var choices = el('div', { 'class': 'diag-choices' });
  choices.appendChild(diagChoice('簡短診斷',
    '每科 ' + DIAG_SHORT_PER + ' 題，共 ' + (DIAG_SHORT_PER * n) + ' 題（' + diagMins(DIAG_SHORT_PER * n) + '）',
    '逐題即時對錯。\n快速抓出強弱輪廓。', function () { startDiagnostic('short'); }));
  choices.appendChild(diagChoice('完整模擬',
    '每科 ' + DIAG_FULL_PER + ' 題，共 ' + (DIAG_FULL_PER * n) + ' 題（' + diagMins(DIAG_FULL_PER * n) + '）',
    '整卷計時、交卷評分。\n最接近真實考試手感。', function () { startDiagnostic('full'); }));
  sheet.appendChild(choices);

  sheet.appendChild(diagEscapeElement(mode));

  sheet.appendChild(el('p', { 'class': 'diag-honest' },
    '說明：診斷給的是「起點估計」，不是上榜預測。六個月/十二個月是為上榜而設計的工作量目標，\n' +
    '會依你實際作答每天滾動重算 —— 沒有任何系統能保證考試結果。'));
  ov.appendChild(sheet);
}

/* STEP_SCOPE(第一步):標題／說明依情境、勾選清單、即時題數統計行、逃生鈕、下一步鈕。
   「下一步」在 0 勾選時 disabled;絕不在此處 patchSettings ——寫入只發生在第二步點卡片時。

   🔴 統計行**兩種份量都要寫**。只寫簡短的 16 題,使用者會照那個數字決定要不要做,
      下一步選了完整模擬卻是 40 題／48 分鐘——差 2.5 倍。IDR-0016 立案的理由就是
      「使用者是照這個數字決定要不要做的,寫死等於騙他」;只給一半跟寫死是同一個病。
      而且「範圍放第一步」本來就是為了讓所需時間在剛進來時看得見。 */
function renderDiagScope(kind, mode, wizard, rerender) {
  var sheet = el('div', { 'class': 'diag-sheet' });
  sheet.appendChild(el('div', { 'class': 'seal' }, '入學測驗'));
  sheet.appendChild(el('h2', null, diagModeHeading(mode)));
  diagModeLeads(mode).forEach(function (t) { sheet.appendChild(el('p', { 'class': 'diag-lead' }, t)); });

  var stats = el('p', { 'class': 'diag-lead diag-scope-stats' });
  var nextBtn = el('button', { type: 'button', 'class': 'diag-next' }, '下一步');
  function updateStats() {
    if (wizard.picked.length === 0) {
      stats.textContent = kind === 'category' ? '請至少勾選一個類科' : '請至少勾選一科';
      nextBtn.disabled = true;
      return;
    }
    var subs = diagScopeSubjectCount(kind, wizard.picked);
    var ns = subs * DIAG_SHORT_PER, nf = subs * DIAG_FULL_PER;
    stats.textContent = '這個範圍共 ' + subs + ' 科：簡短診斷 ' + ns + ' 題（' + diagMins(ns)
      + '）、完整模擬 ' + nf + ' 題（' + diagMins(nf) + '）';
    nextBtn.disabled = false;
  }
  var onPickChange = function (picked) { wizard.picked = picked; updateStats(); };
  var picker = (kind === 'category') ? diagCategoryPicker(wizard.picked, onPickChange)
    : diagSubjectPicker(wizard.picked, onPickChange);
  sheet.appendChild(picker);
  sheet.appendChild(stats);
  updateStats();

  var actions = el('div', { 'class': 'diag-scope-actions' });
  actions.appendChild(diagEscapeElement(mode));
  nextBtn.addEventListener('click', function () {
    if (wizard.picked.length === 0) { return; }
    wizard.step = 'intensity';
    rerender();
  });
  actions.appendChild(nextBtn);
  sheet.appendChild(actions);
  return sheet;
}

/* STEP_INTENSITY(第二步):兩張卡片含收斂後的真實總題數與時間、「← 返回」(picked 保留、
   零寫入)、誠實聲明。唯一的寫入時機:點下卡片 → diagCommitScope() 先寫入範圍,
   再 startDiagnostic(kind) 出題。 */
function renderDiagIntensity(kind, mode, wizard, rerender) {
  var sheet = el('div', { 'class': 'diag-sheet' });
  sheet.appendChild(el('div', { 'class': 'seal' }, '入學測驗'));
  sheet.appendChild(el('h2', null, diagModeHeading(mode)));

  var n = diagScopeSubjectCount(kind, wizard.picked);
  var choices = el('div', { 'class': 'diag-choices' });
  choices.appendChild(diagChoice('簡短診斷',
    '每科 ' + DIAG_SHORT_PER + ' 題，共 ' + (DIAG_SHORT_PER * n) + ' 題（' + diagMins(DIAG_SHORT_PER * n) + '）',
    '逐題即時對錯。\n快速抓出強弱輪廓。',
    function () { diagCommitScope(kind, wizard.picked); startDiagnostic('short'); }));
  choices.appendChild(diagChoice('完整模擬',
    '每科 ' + DIAG_FULL_PER + ' 題，共 ' + (DIAG_FULL_PER * n) + ' 題（' + diagMins(DIAG_FULL_PER * n) + '）',
    '整卷計時、交卷評分。\n最接近真實考試手感。',
    function () { diagCommitScope(kind, wizard.picked); startDiagnostic('full'); }));
  sheet.appendChild(choices);

  var back = el('p', { 'class': 'diag-skip' });
  var bb = el('button', { type: 'button' }, '← 返回');
  bb.addEventListener('click', function () { wizard.step = 'scope'; rerender(); });
  back.appendChild(bb);
  sheet.appendChild(back);

  sheet.appendChild(el('p', { 'class': 'diag-honest' },
    '說明：診斷給的是「起點估計」，不是上榜預測。六個月/十二個月是為上榜而設計的工作量目標，\n' +
    '會依你實際作答每天滾動重算 —— 沒有任何系統能保證考試結果。'));
  return sheet;
}

/* 診斷前的應考科目勾選(第一步用)。純本地元件:只維護 picked、回呼 onChange(picked),
   不再 patchSettings/refreshActiveSubjects/rebuildUsable——那是 diagCommitScope() 的事,
   寫入時機只在第二步點下卡片那一刻(見 showDiagOverlay 頭註)。與設定頁寫同一個
   state.settings.subjects,不是第二份資料;差別只在這裡是「新使用者第一次遇到它」的入口。 */
function diagSubjectPicker(initPicked, onChange) {
  var all = EXAM.subjects.slice();
  var picked = initPicked.slice();
  var box = el('div', { 'class': 'diag-subjects' });
  box.appendChild(el('p', { 'class': 'diag-lead' }, '你要考哪幾科？（之後可在「設定」隨時增減）'));
  var wrap = el('div', { 'class': 'subj-checks' });
  all.forEach(function (s) {
    var lab = el('label', { 'class': 'chk chk-inline' });
    var cb = el('input', { type: 'checkbox', value: s });
    cb.checked = picked.indexOf(s) >= 0;
    cb.addEventListener('change', function () {
      picked = cb.checked ? picked.concat([s]) : picked.filter(function (x) { return x !== s; });
      onChange(picked.slice());
    });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(' ' + s));
    wrap.appendChild(lab);
  });
  box.appendChild(wrap);
  return box;
}
/* 診斷前的應考類科勾選(分組考試專用;教檢 5 個類科;第一步用)。純本地元件,同上一段理由。
   與設定頁的「應考類科」寫同一個 state.settings.examCategories,不是第二份資料
   ——兩份會立刻打架(IDR-0012 決策一同一條理由)。 */
function diagCategoryPicker(initPicked, onChange) {
  var allCats = allCategoryNames();
  var picked = initPicked.slice();
  var box = el('div', { 'class': 'diag-subjects' });
  box.appendChild(el('p', { 'class': 'diag-lead' }, '你要報考哪個類科？（之後可在「設定」隨時改）'));
  var wrap = el('div', { 'class': 'subj-checks' });
  allCats.forEach(function (c) {
    var lab = el('label', { 'class': 'chk chk-inline' });
    var cb = el('input', { type: 'checkbox', value: c });
    cb.checked = picked.indexOf(c) >= 0;
    cb.addEventListener('change', function () {
      picked = cb.checked ? picked.concat([c]) : picked.filter(function (x) { return x !== c; });
      onChange(picked.slice());
    });
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

/* 兩步 overlay 唯一的寫入點(skipDiagnostic 除外):第二步點下卡片那一刻,
   先把範圍寫進設定,再讓題池/雷達收斂。次序與「全選存空陣列」慣例照抄現行 picker
   (IDR-0012 防呆一:空陣列＝全部,日後新增類科才不會被舊設定靜默擋掉)。 */
function diagCommitScope(kind, picked) {
  var allLen = (kind === 'category') ? allCategoryNames().length : EXAM.subjects.length;
  var value = (picked.length === allLen) ? [] : picked.slice();
  if (kind === 'category') { patchSettings({ examCategories: value }); }
  else { patchSettings({ subjects: value }); }
  refreshActiveSubjects();
  rebuildUsable();   /* 題池要跟著收斂,否則抽題時該科 0 題 */
  var spans = (typeof syncSubjectSpans === 'function') ? syncSubjectSpans(state.settings) : null;
  if (spans) { patchSettings({ subjectSpans: spans }); }
}

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
