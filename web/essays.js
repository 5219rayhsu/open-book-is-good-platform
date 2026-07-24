'use strict';
/* ============================================================
   申論題作答 + 評分 + 優化方向。

   本地、確定性的「識別使用者寫得如何」(純前端關鍵詞比對,不呼叫外部 AI):
     使用者在文字框實際作答 → 與參考要點的 keywords 做「涵蓋度比對」
     (關鍵概念/法規有沒有寫到)→ 得到涵蓋度分數 + 命中/漏掉清單
     → 漏掉的點即「答題優化方向」。再請使用者自評論述深度(1–5),
     因為涵蓋度看得到關鍵詞、看不到論證邏輯與舉例,兩者並用。

   透明標示:這是「涵蓋度評分」,不是語意批改;參考要點為 AI 整理、
   非官方標準答案、須對照現行法規查證(可解釋、對限制誠實)。

   無參考要點的題(ref=null)→ 退化為純自評,並誠實標示「要點整理中」。

   依賴 app.js 全域:el / $ / SUBJECTS / pct / recordEssay / showPanel /
   coachCommentEl(coach.js);資料 window.__ESSAYS__(由 build 內嵌)或
   essays.json(開發版 fetch)。
   ============================================================ */

var ESSAYS = [];               /* [{qid,year,round,subject,no,prompt,points,ref}] */
var essaysByQid = {};
var essayPick = { year: null, subject: '__all__' };

function resolveEssays(onReady) {
  function take(obj) {
    if (obj && Array.isArray(obj.essays)) {
      ESSAYS = obj.essays;
      essaysByQid = {};
      ESSAYS.forEach(function (e) { essaysByQid[e.qid] = e; });
      if (onReady) { onReady(); }
      return true;
    }
    return false;
  }
  resolveEssaySamples();
  if (take(window.__ESSAYS__)) { return; }
  fetchJson(dataUrl('essays.json')).then(function (o) { take(o); });
}

/* ---- 三種範本(AI 示例,自評論述後方按鈕切換顯示) ---- */
var ESAMPLES = {};
function resolveEssaySamples() {
  if (Object.keys(ESAMPLES).length) { return; }
  if (window.__ESAMPLES__ && typeof window.__ESAMPLES__ === 'object') {
    ESAMPLES = window.__ESAMPLES__.samples || window.__ESAMPLES__; return;
  }
  if (typeof fetchJson === 'function') {
    fetchJson(dataUrl('essay_samples.json')).then(function (o) {
      if (o && typeof o === 'object') { ESAMPLES = o.samples || o; }
    });
  }
}
function samplesFor(qid) {
  var s = ESAMPLES[qid];
  if (!s) { return null; }
  var arr = Array.isArray(s) ? s : s.samples;
  return (arr && arr.length) ? arr : null;
}
/* 三選一按鈕切換,避免三份範本一次全展開、版面太長 */
function essaySamplesEl(qid) {
  var arr = samplesFor(qid);
  if (!arr) { return null; }
  arr = arr.slice(0, 3);
  var box = el('div', { 'class': 'essay-samples' });
  box.appendChild(el('h4', null, '範本（AI 示例）'));
  box.appendChild(el('p', { 'class': 'subtitle' },
    '以下三份均為 AI 示範的「完整作答」，切入與詳略各異；非官方標準答案，請對照現行' + EXAM.jurisdiction + '與課本查證。先自己寫、自評，再對照，效果最好。'));
  var tabs = el('div', { 'class': 'segmented sample-tabs' });
  var body = el('div', { 'class': 'sample-body' });
  function show(i) {
    Array.prototype.forEach.call(tabs.children, function (x, j) { x.setAttribute('aria-pressed', String(j === i)); });
    body.textContent = '';
    body.appendChild(el('p', { 'class': 'sample-text' }, arr[i]));
  }
  arr.forEach(function (t, i) {
    var b = el('button', { type: 'button' }, '範本 ' + (i + 1));
    b.addEventListener('click', function () { show(i); });
    tabs.appendChild(b);
  });
  box.appendChild(tabs);
  box.appendChild(body);
  show(0);
  return box;
}

/* ---- 文字正規化 + 涵蓋度比對 ----
   刻意不用 regex 字面值(全專案約定,讓煙測的括號掃描器可靠);
   以字元過濾去除空白與標點,比對才不受標點差異影響。 */
/* 半形與全形標點分兩段字面值:半形段不含 CJK/全形字元,全形段不含半形標點——
   兩段皆不觸發「半形標點緊鄰中文」的文案 lint(此為字元集資料、非文案),集合不變。 */
var _STRIP = ' \t\n\r,.;:!?()[]{}/\\-_~' + '　、，。；：！？「」『』（）【】·…．';
function _norm(s) {
  s = String(s || '').toLowerCase();
  var out = '';
  for (var i = 0; i < s.length; i++) {
    if (_STRIP.indexOf(s.charAt(i)) < 0) { out += s.charAt(i); }
  }
  return out;
}
function coverageScore(userText, keywords) {
  var u = _norm(userText);
  var hit = [], miss = [];
  (keywords || []).forEach(function (kw) {
    var n = _norm(kw);
    if (n && u.indexOf(n) >= 0) { hit.push(kw); } else { miss.push(kw); }
  });
  var total = (keywords || []).length;
  return { hit: hit, miss: miss, total: total, ratio: total ? hit.length / total : 0 };
}

/* 可練申論:預設排除舊年度(legacy=true)歷史申論;state.settings.includeLegacy 開啟才納入。
   與選擇題的 includeLegacy 同一開關;舊存檔無此欄視為 false。essaysByQid 仍保留全量,
   讓歷史紀錄能還原已答過的舊年申論。 */
function essaysUsable() {
  var inclLegacy = !!(typeof state !== 'undefined' && state.settings && state.settings.includeLegacy);
  if (inclLegacy) { return ESSAYS; }
  return ESSAYS.filter(function (e) { return e.legacy !== true; });
}

/* 申論科目清單:取自實際可練申論資料(細科),與選擇題科目清單(SUBJECTS)不同。 */
function essaySubjects() {
  var out = [];
  essaysUsable().forEach(function (e) { if (out.indexOf(e.subject) < 0) { out.push(e.subject); } });
  return out;
}

/* 申論練習概況(個人化):各科練過幾次、平均涵蓋度、平均自評。無紀錄回 null。 */
function essayOverviewEl() {
  if (typeof essayStats !== 'function') { return null; }
  var st = essayStats();
  var rows = essaySubjects().filter(function (s) { return st[s] && st[s].n > 0; });
  var total = rows.reduce(function (a, s) { return a + st[s].n; }, 0);
  if (total === 0) { return null; }
  var box = el('div', { 'class': 'essay-overview' });
  box.appendChild(el('div', { 'class': 'daily-line strong' },
    '你的申論練習：累計 ' + total + ' 次作答，涵蓋 ' + rows.length + ' 科（進度預設存這台裝置）'));
  var table = el('table');
  var thead = el('thead'), tr = el('tr');
  ['科目', '練過', '平均涵蓋度', '平均自評'].forEach(function (h, i) {
    tr.appendChild(el('th', i > 0 ? { 'class': 'num' } : null, h));
  });
  thead.appendChild(tr); table.appendChild(thead);
  var tb = el('tbody');
  rows.forEach(function (s) {
    var d = st[s], r = el('tr');
    r.appendChild(el('td', null, s));
    r.appendChild(el('td', { 'class': 'num' }, String(d.n)));
    r.appendChild(el('td', { 'class': 'num' }, d.covN ? pct(d.cov / d.covN) : '—'));
    r.appendChild(el('td', { 'class': 'num' }, d.rated ? (Math.round(d.rateSum / d.rated * 10) / 10) + ' / 5' : '—'));
    tb.appendChild(r);
  });
  table.appendChild(tb); box.appendChild(table);
  return box;
}

/* ---- 選單 ---- */
function renderEssayPicker() {
  var box = $('essay-picker');
  box.textContent = '';
  var pool = essaysUsable();
  if (pool.length === 0) { box.appendChild(el('p', { 'class': 'empty-note' }, '申論題載入中或尚無資料。')); return; }
  box.appendChild(el('p', { 'class': 'subtitle' },
    EXAM.authority + '歷屆申論題。實際作答後，系統用參考要點的關鍵詞做「涵蓋度評分」並指出你漏掉的點；參考要點為 AI 整理，非官方標準答案，須對照現行法規。'));
  box.appendChild(el('p', { 'class': 'essay-len-note' },
    '正式考試一題約 900–1100 字、1.5–2 頁；每題附三份 AI 示範的「完整作答」（切入與深度各異），建議先自己寫、再對照。'));

  var ov = essayOverviewEl();
  if (ov) { box.appendChild(ov); }

  var years = [];
  pool.forEach(function (e) { if (years.indexOf(e.year) < 0) { years.push(e.year); } });
  years.sort(function (a, b) { return b - a; });
  /* 切換 includeLegacy 後,原先選的年份可能已不在清單內 → 退回最新年份,避免列表空白 */
  if (essayPick.year == null || years.indexOf(essayPick.year) < 0) { essayPick.year = years[0]; }

  var row = el('div', { 'class': 'field-row' });
  row.appendChild(el('label', { 'for': 'essay-year' }, '年份：'));
  var ysel = el('select', { id: 'essay-year' });
  years.forEach(function (y) { ysel.appendChild(el('option', { value: String(y) }, y + ' 年')); });
  ysel.value = String(essayPick.year);
  ysel.addEventListener('change', function () { essayPick.year = Number(ysel.value); renderList(); });
  row.appendChild(ysel);
  row.appendChild(el('label', { 'for': 'essay-subj' }, '科目：'));
  var ssel = el('select', { id: 'essay-subj' });
  ssel.appendChild(el('option', { value: '__all__' }, '全部'));
  essaySubjects().forEach(function (s) { ssel.appendChild(el('option', { value: s }, s)); });
  ssel.value = essayPick.subject;
  ssel.addEventListener('change', function () { essayPick.subject = ssel.value; renderList(); });
  row.appendChild(ssel);
  box.appendChild(row);

  var listBox = el('div', { id: 'essay-list' });
  box.appendChild(listBox);

  function renderList() {
    listBox.textContent = '';
    var items = essaysUsable().filter(function (e) {
      return e.year === essayPick.year && (essayPick.subject === '__all__' || e.subject === essayPick.subject);
    });
    if (items.length === 0) { listBox.appendChild(el('p', { 'class': 'empty-note' }, '此條件無申論題。')); return; }
    var menu = el('div', { 'class': 'mode-menu' });
    items.forEach(function (e, i) {
      var item = el('button', { type: 'button', 'class': 'mode-item' });
      item.appendChild(el('span', { 'class': 'mode-idx' }, String(i + 1)));
      item.appendChild(el('span', { 'class': 'mode-name' }, e.subject + ' 第 ' + e.no + ' 題'));
      var tags = el('span', { 'class': 'mode-tags' });
      if (e.points) { tags.appendChild(el('span', { 'class': 'ptag' }, e.points + ' 分')); }
      tags.appendChild(el('span', { 'class': 'ptag' + (e.ref ? ' lead' : '') }, e.ref ? '有參考要點' : '要點整理中'));
      item.appendChild(tags);
      item.appendChild(el('span', { 'class': 'mode-desc' }, e.prompt.slice(0, 64) + (e.prompt.length > 64 ? '…' : '')));
      item.addEventListener('click', function () { startEssay(e.qid); });
      menu.appendChild(item);
    });
    listBox.appendChild(menu);
  }
  renderList();
}

/* ---- 作答畫面 ---- */
function startEssay(qid) {
  var e = essaysByQid[qid];
  if (!e) { return; }
  var box = $('essay-picker');
  box.textContent = '';
  var back = el('a', { 'class': 'back-link', href: '#', role: 'button' }, '← 回申論題目次');
  back.addEventListener('click', function (ev) { ev.preventDefault(); renderEssayPicker(); });
  box.appendChild(back);

  var card = el('article', { 'class': 'question-card' });
  card.appendChild(el('div', { 'class': 'q-meta' },
    yearLabel(e.year) + '・' + e.subject + '・第 ' + e.no + ' 題' + (e.points ? '・' + e.points + ' 分' : '')));
  card.appendChild(el('p', { 'class': 'question-stem' }, e.prompt));
  card.appendChild(el('p', { 'class': 'subtitle' },
    '先在下方寫出你的作答（或至少列出答題架構與關鍵詞），再按「完成作答」看評分與參考。提取練習：先自己想，比看了答案才寫有效得多。'));
  var ta = el('textarea', { id: 'essay-input', rows: '10',
    placeholder: '在這裡寫下你的作答 ——\n建議：先寫答題架構（分點），再填入關鍵概念、相關法規/理論、實例。' });
  card.appendChild(ta);
  var submit = el('button', { type: 'button' }, '完成作答，看評分與參考');
  submit.addEventListener('click', function () { gradeEssay(e, ta.value, card, submit); });
  var p = el('p'); p.appendChild(submit); card.appendChild(p);
  box.appendChild(card);
  ta.focus();
}

/* 「幾乎沒作答」門檻:用 _norm 計有效字數(去空白與標點,中英一視同仁)。
   舊版 (trim().length<2) 只擋得掉 1 個字 → 英文打 2 個字母就繞過直接交卷,故改此。 */
var MIN_ESSAY_CONTENT = 10;
function gradeEssay(e, userText, card, submitBtn) {
  if (_norm(userText).length < MIN_ESSAY_CONTENT &&
      !confirm('你幾乎沒有作答。仍要看參考要點嗎？（直接看答案的學習效果較差）')) { return; }
  submitBtn.disabled = true;

  var result = el('div', { 'class': 'essay-result' });
  var ref = e.ref;
  var cov = null;

  if (ref && Array.isArray(ref.keywords) && ref.keywords.length > 0) {
    cov = coverageScore(userText, ref.keywords);
    var covText = '關鍵概念涵蓋度：' + cov.hit.length + ' / ' + cov.total + '（' + pct(cov.ratio) + '）';
    result.appendChild(el('div', { 'class': 'diag-result-line' }, covText));
    result.appendChild(el('p', { 'class': 'subtitle' }, '說明：這是「你的作答有沒有寫到關鍵概念/法規」的涵蓋度，非語意批改；論述深度與舉例請自評。'));
    result.appendChild(_chips('已寫到', cov.hit, 'hit'));
    result.appendChild(_chips('漏掉的點（優化方向）', cov.miss, 'miss'));
    announce('評分完成。' + covText + '，漏掉 ' + cov.miss.length + ' 個關鍵點。');
  } else {
    var noRefText = '這題的參考要點整理中 —— 先用自評，並對照下方架構。';
    result.appendChild(el('div', { 'class': 'diag-result-line' }, noRefText));
    announce(noRefText);
  }

  var _ex = (typeof explEl === 'function') ? explEl(e.qid) : null;
  if (_ex) { result.appendChild(_ex); }   /* 本題解釋:解題要旨(AI 整理) */

  /* IFRS／稅法等時效提示(中會/高會涉 IFRS、稅務/公司法涉稅法商法) */
  var _stale = (typeof staleNoteEl === 'function') ? staleNoteEl(e) : null;
  if (_stale) { result.appendChild(_stale); }

  /* 揭示參考要點 */
  if (ref) {
    var refBox = el('div', { 'class': 'essay-ref' });
    if (ref.summary) { refBox.appendChild(el('p', { 'class': 'essay-ref-summary' }, '考點：' + ref.summary)); }
    if (Array.isArray(ref.frame) && ref.frame.length) {
      refBox.appendChild(el('h4', null, '答題架構'));
      var ol = el('ol', { 'class': 'essay-frame' });
      ref.frame.forEach(function (f) { ol.appendChild(el('li', null, f)); });
      refBox.appendChild(ol);
    }
    if (Array.isArray(ref.laws) && ref.laws.length) {
      refBox.appendChild(el('h4', null, '相關法規 / 理論'));
      refBox.appendChild(el('p', { 'class': 'essay-laws' }, ref.laws.join('、')));
    }
    if (Array.isArray(ref.pitfalls) && ref.pitfalls.length) {
      refBox.appendChild(el('h4', null, '常見誤區'));
      var ul = el('ul', { 'class': 'essay-pitfalls' });
      ref.pitfalls.forEach(function (p) { ul.appendChild(el('li', null, p)); });
      refBox.appendChild(ul);
    }
    refBox.appendChild(el('p', { 'class': 'honest' }, ref.caveat ||
      '參考要點為 AI 整理的學習輔助，非官方標準答案，作答與引用前請對照現行' + EXAM.jurisdiction + '查證。'));
    result.appendChild(refBox);
  }

  /* 論述深度自評 → 計分 + 評語 */
  result.appendChild(el('h4', null, '自評論述深度（涵蓋度看不到邏輯與舉例，由你補上）'));
  var rateRow = el('div', { 'class': 'segmented essay-rate' });
  [1, 2, 3, 4, 5].forEach(function (r) {
    var b = el('button', { type: 'button' }, String(r));
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(rateRow.children, function (x) { x.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true');
      finishEssay(e, cov, r, result);
    });
    rateRow.appendChild(b);
  });
  result.appendChild(el('p', { 'class': 'subtitle' }, '1＝幾乎寫不出來　3＝架構對但不夠深　5＝架構完整、論述有理有據有例'));
  result.appendChild(rateRow);
  /* 自評論述後方:三種範本(AI 示例,按鈕切換) */
  var _samp = (typeof essaySamplesEl === 'function') ? essaySamplesEl(e.qid) : null;
  if (_samp) { result.appendChild(_samp); }
  card.appendChild(result);
  result.scrollIntoView({ block: 'start' });
}

function _chips(label, arr, kind) {
  var wrap = el('div', { 'class': 'essay-chips' });
  wrap.appendChild(el('span', { 'class': 'essay-chips-label' }, label + '(' + arr.length + '):'));
  if (arr.length === 0) { wrap.appendChild(el('span', { 'class': 'subtitle' }, kind === 'miss' ? '太好了，關鍵點都有寫到。' : '——')); }
  arr.forEach(function (k) { wrap.appendChild(el('span', { 'class': 'chip chip-' + kind }, k)); });
  return wrap;
}

var _essayDone = {};   /* qid → true,避免同次重複記錄 */
function finishEssay(e, cov, rating, result) {
  if (!_essayDone[e.qid + '_' + rating]) {
    recordEssay(e, cov ? cov.ratio : null, rating);
    _essayDone[e.qid + '_' + rating] = true;
  }
  /* 自評即回饋(無標準回饋時,誠實自評勝過沒有);具體對照交給下方範本,不再掛教練金句。 */
}
