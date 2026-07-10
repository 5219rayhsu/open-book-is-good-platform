'use strict';
/* ============================================================
   疑義提出（決定 12，前端本機版）—— 作答後可回報，主要修正 AI 解析。
   下拉：答案問題／解析問題／系統問題／其他建議 ＋ 自由文字（＋選填聯絡）。
   單題（即時回饋）可逐題提；整卷整份作答後一顆「提交疑義」鈕。
   本機先收集（localStorage outbox，per-exam），送出待後端（決定 13：Function→D1→Issue）。
   依賴 app.js 全域:el / $ / EXAM / PREFIX / byQid；stats.js: nowStamp。互動後才呼叫。
   ============================================================ */

var FEEDBACK_TYPES = [
  { v: 'answer', label: '答案問題' },
  { v: 'explain', label: '解析問題' },
  { v: 'system', label: '系統問題' },
  { v: 'other', label: '其他建議' }
];

function _fbKey() { return (typeof PREFIX !== 'undefined' ? PREFIX : 'obig_') + 'feedback'; }
function _loadFeedback() {
  try { return JSON.parse(localStorage.getItem(_fbKey())) || []; } catch (e) { return []; }
}
function _saveFeedback(list) {
  try { localStorage.setItem(_fbKey(), JSON.stringify(list)); return true; } catch (e) { return false; }
}
function feedbackCount() { return _loadFeedback().length; }

/* 小連結:逐題畫面「疑義回報」（與「下一題」同列,放左側）。 */
function feedbackLink(qid) {
  var a = el('button', { type: 'button', 'class': 'fb-link btn-quiet' }, '🚩 疑義與建議回報');
  a.addEventListener('click', function () { openFeedback(qid); });
  return a;
}
/* 整卷結果頁一顆鈕（決定 12:整份後才出現，非逐題）。 */
function feedbackButton(label) {
  var b = el('button', { type: 'button', 'class': 'btn-quiet' }, label || '提交疑義');
  b.addEventListener('click', function () { openFeedback(null); });
  return b;
}

function _qContextText(qid) {
  if (!qid) { return '整卷／一般疑義（可在內容描述是哪一題）'; }
  var q = (typeof byQid !== 'undefined') ? byQid[qid] : null;
  if (!q) { return '題號：' + qid; }
  return (typeof yearLabel === 'function' ? yearLabel(q.year) : q.year) + '・' + q.subject + '・第 ' + q.no + ' 題';
}

function openFeedback(qid) {
  var ov = $('feedback-overlay');
  ov.textContent = '';
  var sheet = el('div', { 'class': 'help-sheet' });

  var head = el('div', { 'class': 'help-head' });
  head.appendChild(el('h2', null, '提出疑義與建議'));
  var x = el('button', { type: 'button', 'class': 'help-close btn-quiet' }, '關閉');
  x.addEventListener('click', closeFeedback);
  head.appendChild(x);
  sheet.appendChild(head);

  sheet.appendChild(el('p', { 'class': 'subtitle' },
    '主要用於修正 AI 整理的解析（答案多為官方、通常不改，但仍可回報疑似配對錯誤）。' +
    '回報只先存在這台瀏覽器，上線後才送出查證——查證屬實才會修正。'));
  sheet.appendChild(el('p', { 'class': 'fb-context' }, '針對：' + _qContextText(qid)));

  var typeWrap = el('div', { 'class': 'fb-field' });
  typeWrap.appendChild(el('label', { 'for': 'fb-type' }, '疑義類型：'));
  var sel = el('select', { id: 'fb-type' });
  FEEDBACK_TYPES.forEach(function (t) { sel.appendChild(el('option', { value: t.v }, t.label)); });
  typeWrap.appendChild(sel);
  sheet.appendChild(typeWrap);

  var txtWrap = el('div', { 'class': 'fb-field' });
  txtWrap.appendChild(el('label', { 'for': 'fb-text' }, '說明（必填）：'));
  var txt = el('textarea', { id: 'fb-text', rows: '4', placeholder: '請描述問題，例如：解析第二段的法條引用似有誤、應為…' });
  txtWrap.appendChild(txt);
  sheet.appendChild(txtWrap);

  var contactWrap = el('div', { 'class': 'fb-field' });
  contactWrap.appendChild(el('label', { 'for': 'fb-contact' }, '聯絡方式（選填）：'));
  contactWrap.appendChild(el('input', { id: 'fb-contact', type: 'text', placeholder: 'email 或暱稱，方便後續回覆（可留空）' }));
  sheet.appendChild(contactWrap);

  var submit = el('button', { type: 'button' }, '記錄疑義');
  submit.addEventListener('click', function () { _submitFeedback(qid, sheet); });
  var pp = el('p'); pp.appendChild(submit);
  sheet.appendChild(pp);

  ov.appendChild(sheet);
  ov.hidden = false;
  document.addEventListener('keydown', _feedbackKeydown);
  ov.addEventListener('click', _feedbackBackdrop);
  txt.focus();
}

function _submitFeedback(qid, sheet) {
  var text = ($('fb-text').value || '').trim();
  if (text.length < 4) { alert('請至少簡述疑義內容（4 字以上）。'); $('fb-text').focus(); return; }
  var entry = {
    ts: (typeof nowStamp === 'function') ? nowStamp() : '',
    exam: (typeof EXAM !== 'undefined') ? EXAM.key : '',
    qid: qid || null,
    type: $('fb-type').value,
    text: text,
    contact: ($('fb-contact').value || '').trim() || null
  };
  var list = _loadFeedback(); list.push(entry); _saveFeedback(list);
  /* 換成確認畫面（誠實:本機已存、上線後送出） */
  sheet.textContent = '';
  var head = el('div', { 'class': 'help-head' });
  head.appendChild(el('h2', null, '已記錄，謝謝'));
  var x = el('button', { type: 'button', 'class': 'help-close btn-quiet' }, '關閉');
  x.addEventListener('click', closeFeedback);
  head.appendChild(x);
  sheet.appendChild(head);
  sheet.appendChild(el('p', { 'class': 'subtitle' },
    '疑義已存在這台瀏覽器（目前累計 ' + list.length + ' 則）。上線後會自動送出查證；' +
    '查證屬實才會修正解析，答案欄一律以官方為準。'));
}

function _feedbackKeydown(e) { if (e.key === 'Escape') { closeFeedback(); } }
function _feedbackBackdrop(e) { if (e.target === $('feedback-overlay')) { closeFeedback(); } }
function closeFeedback() {
  var ov = $('feedback-overlay');
  ov.hidden = true;
  document.removeEventListener('keydown', _feedbackKeydown);
  ov.removeEventListener('click', _feedbackBackdrop);
}
