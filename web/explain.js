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
  if (typeof e === 'string') { return { t: e, c: 'watch' }; }
  return (e && e.t) ? e : null;
}

/* 要不要掛「請務必查證」的小字。新制 hold、舊制 low 都算——舊值要繼續認,
   因為使用者裝置上的離線快取可能還是遷移前的 explanations.json。 */
function needsCaveat(c) { return c === 'hold' || c === 'low'; }

/* 答完後掛在題卡下的「本題解釋」區塊:一段解釋 + 一行誠實小字。保持乾淨。 */
function explEl(qid) {
  var e = explFor(qid);
  if (!e || !e.t) { return null; }
  var box = el('div', { 'class': 'explain' });
  box.appendChild(el('div', { 'class': 'explain-head' },
    /* 分級制 2026-07-30 換新：pass／watch／hold,字面自帶方向,不再用 high／med／low
       ——舊制的 high 在詳解是「好」、在資料缺陷是「壞」,同一個詞兩個方向,人眼會讀反。
       舊值一併認,因為離線快取的舊 explanations.json 可能還在使用者裝置上。 */
    '本題解釋' + (needsCaveat(e.c) ? '（把握度較低，請務必查證）' : '')));
  /* 三段式詳解以空行(\n\n)分段。早期靠 white-space:pre-line 讓空行自己撐開,
     但空行高度＝一整個 line-height(1.78),段距過大。改成逐段各自成 <p>,
     段距交給 CSS 的相鄰選擇器控制;資料端的 \n\n 語意分隔維持不動。 */
  e.t.split(/\n{2,}/).forEach(function (para) {
    var s = para.trim();
    if (s) { box.appendChild(el('p', { 'class': 'explain-body' }, s)); }
  });
  box.appendChild(el('p', { 'class': 'explain-note' },
    'AI 整理的學習輔助，非官方標準答案；請對照現行' + EXAM.jurisdiction + '與課本查證。'));
  /* 詳解內的 \(…\) LaTeX 也要渲染(數學科詳解會寫式子);與作答卡、歷史詳情一致。
     此前只有題幹/選項渲染,詳解漏掉 → 學生看到的是原始的 \(x=y+z\)。 */
  renderMath(box);
  return box;
}
