'use strict';
/* ============================================================
   本題解釋 —— 選擇題/申論題答完後顯示「這題在考什麼、為什麼這個答案對」。

   這是補習班與參考書高價販售的東西;本系統把它開源、內建、隨答隨看。
   誠實揭露:全部為 AI 整理的學習輔助,**非官方標準答案**,法規會修、
   題目也可能有爭議,作答與引用前請對照現行法規與課本查證(查證對象依考試,見 EXAM.jurisdiction)。
   每則解釋刻意簡短(回饋要夠用就好,過長會變成被動閱讀、
   稀釋「自己提取」的效果)。

   資料來源:線上 fetch dataUrl('explanations.json') 為主;window.__EXPL__ 為歷史相容(離線單檔)分支。
   形狀:{ qid: { t:"解釋(繁中,約 100 字內)", c:"high|med|low" } }(亦容許 qid:"字串")。
   依賴 app.js 全域:el / fetchJson。在作答後才呼叫,載入順序安全。
   ============================================================ */

var EXPL = {};

function _takeExpl(obj) {
  if (!obj || typeof obj !== 'object') { return false; }
  EXPL = obj.explanations ? obj.explanations : obj;
  return true;
}

function resolveExpl(onReady) {
  if (_takeExpl(window.__EXPL__)) { if (onReady) { onReady(); } return; }
  if (typeof fetchJson === 'function') {
    fetchJson(dataUrl('explanations.json')).then(function (o) {
      _takeExpl(o);
      if (onReady) { onReady(); }
    });
  }
}

function explFor(qid) {
  var e = EXPL[qid];
  if (!e) { return null; }
  if (typeof e === 'string') { return { t: e, c: 'med' }; }
  return (e && e.t) ? e : null;
}

/* 答完後掛在題卡下的「本題解釋」區塊:一段解釋 + 一行誠實小字。保持乾淨。 */
function explEl(qid) {
  var e = explFor(qid);
  if (!e || !e.t) { return null; }
  var box = el('div', { 'class': 'explain' });
  box.appendChild(el('div', { 'class': 'explain-head' },
    '本題解釋' + (e.c === 'low' ? '（把握度較低，請務必查證）' : '')));
  box.appendChild(el('p', { 'class': 'explain-body' }, e.t));
  box.appendChild(el('p', { 'class': 'explain-note' },
    'AI 整理的學習輔助，非官方標準答案；請對照現行' + EXAM.jurisdiction + '與課本查證。'));
  return box;
}
