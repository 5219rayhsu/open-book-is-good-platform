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
/* 「還沒載進來」與「載進來了但這題沒有」是兩件事，必須分得開：前者要安靜，
   後者要說「尚未上線」。共用 `EXPL 是空的` 這個判斷會讓開站頭幾百毫秒內答完的
   那一題被誤報成「沒有詳解」。 */
var EXPL_READY = false;
/* 拿不到(fetchJson 失敗時 resolve 成 null,不會 reject)。與「還沒到」分開:
   前者要說「載入失敗」,後者要說「載入中」——都不可以是沉默。 */
var EXPL_FAILED = false;

/* 開機時詳解排在 bank.json 之後才起跑(app.js「開機」那段的串行策略),而它是次要包裡
   最大的一份(社工師 10.5MB / gzip 3.7MB)。窗口內答完的題,舊寫法讓 explEl 回 null →
   六個渲染點全部 `if (_ex)` 靜默跳過,畫面上與「這題沒有詳解」完全同形,而且該次不補畫。
   2026-08-17 使用者實際回報的就是這個(社工師,全站詳解檔最大的一科)。
   改法:窗口內先掛佔位塊,並把「換成真的」排進佇列;詳解落地時就地替換。 */
var _explPending = [];

function _flushExplPending() {
  var q = _explPending;
  _explPending = [];
  q.forEach(function (fn) { fn(); });
}

function _takeExpl(obj) {
  if (!obj || typeof obj !== 'object') { return false; }
  EXPL = obj.explanations ? obj.explanations : obj;
  EXPL_READY = true;
  _flushExplPending();
  return true;
}

function resolveExpl(onReady) {
  if (_takeExpl(window.__EXPL__)) { if (onReady) { onReady(); } return; }
  if (typeof fetchJson === 'function') {
    fetchJson(dataUrl('explanations.json')).then(function (o) {
      /* fetchJson 內建 catch,失敗是 null 不是 reject——所以失敗只能從回傳值看出來。
         不 flush 的話,窗口內掛出去的「載入中」會永遠停在載入中。 */
      if (!_takeExpl(o)) { EXPL_FAILED = true; _flushExplPending(); }
      if (onReady) { onReady(); }
    });
  } else {
    EXPL_FAILED = true;
    _flushExplPending();
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

/* 詳解檔還在路上(或載失敗)時掛的那一塊。落地後由 _flushExplPending 就地換成真的。
   為什麼不沿用「尚未上線」那句:那句是在斷言「這題沒有詳解」,而此刻我們還不知道。 */
function _explPlaceholder(qid) {
  var box = el('div', { 'class': 'explain' });
  box.appendChild(el('div', { 'class': 'explain-head' }, '本題解釋'));
  box.appendChild(el('p', { 'class': 'explain-body' },
    EXPL_FAILED ? '詳解這次沒載進來（網路中斷或檔案取不到）。重新整理頁面就會回來，作答紀錄不受影響。'
                : '詳解載入中……'));
  if (!EXPL_FAILED) {
    _explPending.push(function () {
      var real = explEl(qid);
      /* parentNode 檢查:使用者可能已經翻到下一題,那塊早就從 DOM 拿掉了。 */
      if (real && box.parentNode) { box.parentNode.replaceChild(real, box); }
    });
  }
  return box;
}

/* 答完後掛在題卡下的「本題解釋」區塊:一段解釋 + 一行誠實小字。保持乾淨。 */
function explEl(qid) {
  var e = explFor(qid);
  /* 沒有詳解就明說（IDR-0033）。不隱藏整塊的理由：隱藏會讓「這題沒有詳解」跟
     「網站壞了或我沒找到入口」長得一樣。詳解是逐年倒敘補產的（IDR-0028），
     缺詳解在這個站是**常態不是異常**，常態要誠實交代節奏。
     `EXPL_READY` 之前一律回 null——那時候還不知道有沒有，不能亂講。 */
  if (!e || !e.t) {
    if (!EXPL_READY) { return _explPlaceholder(qid); }
    var ph = el('div', { 'class': 'explain' });
    ph.appendChild(el('div', { 'class': 'explain-head' }, '本題解釋'));
    ph.appendChild(el('p', { 'class': 'explain-body' },
      '本題詳解尚未上線。詳解由最新年度向前逐批製作，完成後會隨本站更新出現。'));
    return ph;
  }
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
