'use strict';
/* ============================================================
   歷史紀錄瀏覽器 —— 每種練習列最近 30 筆,點開看當時題目、你的作答對錯與評語。

   儲存哲學(不重複造資料):log 每筆只存 {時間, qid, 對錯, 你的選項, 模式},
   題目內容一律「要看時才從內嵌題庫(byQid / essaysByQid)用 qid 還原」,
   所以再多筆也不佔空間、且全部保留(顯示只取最近 30)。

   依賴 app.js: state / byQid / $ / el / pct / LETTERS / SUBJECTS;
   essays.js: essaysByQid / resolveEssays;coach.js: coachComment / subjectAccFor。
   ============================================================ */

var HISTORY_LIMIT = 30;
var HISTORY_MODE_LABELS = {
  practice: '單題練習', paper: '歷屆原卷', mock: '模擬考',
  cluster: '弱點殲滅', drill: '弱點殲滅', diagnostic: '入學診斷', essay: '申論題'
};
var historyMode = '__all__';

function _histModeName(m) { return HISTORY_MODE_LABELS[m] || m || '練習'; }
function _histQ(e) {
  if (e.mode === 'essay') { return (typeof essaysByQid !== 'undefined') ? essaysByQid[e.qid] : null; }
  return byQid[e.qid];
}

/* P5 整卷成績（落點）：考試形式整卷的得分與作答時間（耗時來自 P2 計時的 secs）。
   本機版：只列最近 HISTORY_LIMIT 筆（B1 後端版再拿掉上限、跨裝置）。 */
function _examDurText(secs) {
  if (!secs) { return '—'; }
  return Math.max(1, Math.round(secs / 60)) + ' 分';
}
function _renderExamHistory(box, exams) {
  box.appendChild(el('h3', null, '整卷成績（落點）'));
  var shown = Math.min(exams.length, HISTORY_LIMIT);
  box.appendChild(el('p', { 'class': 'subtitle' },
    '考試形式整卷（歷屆原卷／完整模擬／完整診斷）的得分與作答時間，最近 ' + shown +
    ' 筆（共 ' + exams.length + ' 筆，全部保留）。'));
  var table = el('table', { 'class': 'exam-hist' }), thead = el('thead'), tr = el('tr');
  ['日期', '類型', '得分', '正確率', '耗時'].forEach(function (h, i) {
    tr.appendChild(el('th', i > 1 ? { 'class': 'num' } : null, h));
  });
  thead.appendChild(tr); table.appendChild(thead);
  var tb = el('tbody');
  exams.slice(Math.max(0, exams.length - HISTORY_LIMIT)).reverse().forEach(function (x) {
    var row = el('tr');
    row.appendChild(el('td', null, x.ts || ''));
    row.appendChild(el('td', null, _histModeName(x.mode)));
    row.appendChild(el('td', { 'class': 'num' }, (x.ok || 0) + ' / ' + x.total));
    row.appendChild(el('td', { 'class': 'num' }, pct((x.ok || 0) / x.total)));
    row.appendChild(el('td', { 'class': 'num' }, _examDurText(x.secs)));
    tb.appendChild(row);
  });
  table.appendChild(tb); box.appendChild(table);
}

function renderHistory() {
  var box = $('history-box');
  box.textContent = '';
  if (typeof resolveEssays === 'function') { resolveEssays(); }   /* 確保申論題可還原 */
  var log = state.log || [];
  var exams = state.exams || [];
  if (log.length === 0 && exams.length === 0) {
    box.appendChild(el('p', { 'class': 'empty-note' }, '尚無作答紀錄。練幾題後，這裡會留下你的足跡。'));
    return;
  }
  if (exams.length) { _renderExamHistory(box, exams); }      /* P5:整卷成績含耗時 */
  if (log.length === 0) { return; }
  box.appendChild(el('h3', null, '逐題作答紀錄'));
  var present = {};
  log.forEach(function (e) { present[e.mode || 'practice'] = true; });
  var row = el('div', { 'class': 'field-row' });
  row.appendChild(el('label', { 'for': 'hist-mode' }, '練習類型：'));
  var sel = el('select', { id: 'hist-mode' });
  ['__all__'].concat(Object.keys(present)).forEach(function (m) {
    sel.appendChild(el('option', { value: m }, m === '__all__' ? '全部' : _histModeName(m)));
  });
  sel.value = historyMode;
  sel.addEventListener('change', function () { historyMode = sel.value; renderHistory(); });
  row.appendChild(sel);
  box.appendChild(row);

  var items = log.filter(function (e) {
    return historyMode === '__all__' || (e.mode || 'practice') === historyMode;
  });
  var recent = items.slice(Math.max(0, items.length - HISTORY_LIMIT)).reverse();
  box.appendChild(el('p', { 'class': 'subtitle' },
    '顯示最近 ' + recent.length + ' 筆(共 ' + items.length + ' 筆，全部保留)。點任一筆可展開當時題目與評語。'));
  var list = el('div', { 'class': 'hist-list' });
  recent.forEach(function (e) { list.appendChild(_histRow(e)); });
  box.appendChild(list);
}

function _histRow(e) {
  var isEssay = (e.mode === 'essay');
  var q = _histQ(e);
  var item = el('div', { 'class': 'hist-item' });
  var head = el('button', { type: 'button', 'class': 'hist-head' });
  var badge = isEssay
    ? el('span', { 'class': 'hist-badge' }, (typeof e.coverage === 'number') ? ('涵蓋 ' + pct(e.coverage)) : '申論')
    : el('span', { 'class': 'hist-badge ' + (e.correct ? 'ok' : 'bad') }, e.correct ? '答對' : '答錯');
  head.appendChild(badge);
  head.appendChild(el('span', { 'class': 'hist-when' }, (e.ts || e.t || '') + ' ・ ' + _histModeName(e.mode)));
  var stem = q ? stemPlain(q.stem || q.prompt || '') : '（題目已不在可載入範圍）';
  head.appendChild(el('span', { 'class': 'hist-stem' }, stem.slice(0, 36) + (stem.length > 36 ? '…' : '')));
  var detail = el('div', { 'class': 'hist-detail', hidden: 'hidden' });
  var built = false;
  head.addEventListener('click', function () {
    if (!built) { _histDetail(detail, e, q, isEssay); built = true; }
    detail.hidden = !detail.hidden;
  });
  item.appendChild(head); item.appendChild(detail);
  return item;
}

function _histDetail(detail, e, q, isEssay) {
  detail.textContent = '';
  if (!q) {
    detail.appendChild(el('p', { 'class': 'subtitle' },
      isEssay ? '申論題目尚未載入；切到「申論題」分頁一次後再回來即可還原。' : '此題目前不在可載入範圍（可能為待校題）。'));
    return;
  }
  if (isFlagged(q.qid)) { detail.classList.add('is-flagged'); }   /* 使用者曾標記此題(與對錯無關) */
  detail.appendChild(el('p', { 'class': 'q-meta' }, yearLabel(q.year) + '・' + q.subject + '・第 ' + q.no + ' 題'));
  if (!isEssay) {
    if (typeof groupHeaderEl === 'function') { var _gh = groupHeaderEl(q); if (_gh) { detail.appendChild(_gh); } }
    if (typeof passageEl === 'function') { var _pg = passageEl(q.passage); if (_pg) { detail.appendChild(_pg); } }
    if (typeof carryContextEl === 'function') { var _cc = carryContextEl(q); if (_cc) { detail.appendChild(_cc); } }
  }
  var histStem = el('div', { 'class': 'question-stem' });   /* div:題幹可能含 inline <table>,就地渲染 */
  appendStemRich(histStem, (q.stem || q.prompt || ''));
  detail.appendChild(histStem);
  if (!isEssay && q.options) {
    var ansIdx = LETTERS.indexOf(q.answer);
    var pickIdx = LETTERS.indexOf(e.pick);
    var ol = el('ol', { 'class': 'options' });
    q.options.forEach(function (opt, i) {
      var li = el('li');
      var cls = 'opt';
      if (i === ansIdx) { cls += ' is-correct'; }
      else if (i === pickIdx) { cls += ' is-wrong'; }
      else { cls += ' is-dim'; }
      var b = el('span', { 'class': cls });
      b.appendChild(el('span', { 'class': 'letter' }, '(' + LETTERS[i] + ')'));
      b.appendChild(document.createTextNode(opt));
      li.appendChild(b); ol.appendChild(li);
    });
    detail.appendChild(ol);
    detail.appendChild(el('p', { 'class': 'subtitle' },
      '你的作答：' + (e.pick && e.pick !== '_' ? e.pick : '未作答') + '・正解：' + q.answer +
      '・結果：' + (e.correct ? '答對' : '答錯')));
  } else if (isEssay) {
    detail.appendChild(el('p', { 'class': 'subtitle' },
      '涵蓋度：' + (typeof e.coverage === 'number' ? pct(e.coverage) : '—') +
      '・自評論述：' + (e.selfRating ? e.selfRating + ' / 5' : '—')));
  }
  /* 回顧評語(以當時對錯/自評重生,屬同類提醒,非逐字保存當時那句) */
  if (typeof coachComment === 'function') {
    var ctx = isEssay
      ? { isEssay: true, selfRating: e.selfRating, subject: e.subject }
      : { correct: e.correct, subject: e.subject, mode: e.mode,
          subjectAcc: (typeof subjectAccFor === 'function') ? subjectAccFor(e.subject) : 0.5 };
    var c = coachComment(ctx);
    if (c && c.text) {
      var box = el('div', { 'class': 'coach' });
      box.appendChild(el('div', { 'class': 'coach-text' }, c.text));
      if (c.principle) {
        box.appendChild(el('div', { 'class': 'coach-principle' },
          (c.principle.m ? c.principle.m + '：' : '') + (c.principle.line || '')));
      }
      detail.appendChild(box);
    }
  }
  renderMath(detail);   /* 題幹/選項/表格內的 \(…\) 公式(與作答卡一致;此前歷史詳情漏渲染) */
}
