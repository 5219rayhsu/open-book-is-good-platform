'use strict';
/* ============================================================
   使用說明覆蓋層 —— 由標頭「使用說明」按鈕隨時開啟,隨時可複習。
   不是強制歡迎頁(不打斷使用者),而是一顆隨手可按的按鈕。
   純 el() / textContent 建構(不以字串注入 DOM);沿用 .help-sheet 霜面卡樣式。
   關閉方式:右上「關閉」鈕、點背景、或按 Esc。
   依賴 app.js 全域:el / $。在使用者點按後才執行,載入順序安全。
   ============================================================ */

function _helpSection(title, items) {
  var frag = document.createDocumentFragment();
  frag.appendChild(el('h3', null, title));
  var ul = el('ul');
  items.forEach(function (it) {
    var li = el('li');
    if (it.term) {
      li.appendChild(el('span', { 'class': 'help-term' }, it.term));
      li.appendChild(document.createTextNode(it.desc));
    } else {
      li.textContent = it.desc;
    }
    ul.appendChild(li);
  });
  frag.appendChild(ul);
  return frag;
}

function renderHelp() {
  var ov = $('help-overlay');
  ov.textContent = '';
  var sheet = el('div', { 'class': 'help-sheet' });

  var head = el('div', { 'class': 'help-head' });
  head.appendChild(el('h2', null, '使用說明'));
  var x = el('button', { type: 'button', 'class': 'help-close btn-quiet' }, '關閉');
  x.addEventListener('click', closeHelp);
  head.appendChild(x);
  sheet.appendChild(head);

  sheet.appendChild(el('p', { 'class': 'subtitle' },
    '這是一套' + EXAM.name + '國考自學系統 —— 線上即用、不追蹤。' +
    '你的作答進度預設存在這台裝置的瀏覽器（localStorage）、不上傳（登入後雲端同步規劃中，詳見下方）。'));

  sheet.appendChild(_helpSection('怎麼開始', [
    { term: '入學診斷', desc: '第一次開啟會邀你做一次診斷，據此畫出各科能力雷達、建議備考路線；可略過，日後在「學習藍圖」也能重做。' },
    { term: '單題練習', desc: '不知從何下手就點這裡 —— 系統自動依你的弱項、到期複習、答錯關聯題，挑下一題給你。' }
  ]));

  sheet.appendChild(_helpSection('練習模式', [
    { term: '單題練習', desc: '自適應出題、即時對錯回饋。' },
    { term: '歷屆原卷', desc: '整卷重現' + EXAM.authority + '某年某科，貼近真實考試。' },
    { term: '模擬考', desc: '跨科混合、計時作答，檢驗實戰手感。' },
    { term: '弱點殲滅', desc: '鎖定最弱科，把相似/易混淆題組在一起集中練。' },
    { term: '申論題', desc: '實際寫出作答 → 關鍵詞涵蓋度評分 + 指出漏掉的點 + 完整參考架構，再自評論述深度。' },
    { term: '錯題複習', desc: '答錯的題自動收錄，可整組重練。' }
  ]));

  sheet.appendChild(_helpSection('看進度', [
    { term: '能力雷達', desc: '各科正確率雷達 + 學習教練建議。' },
    { term: '學習趨勢', desc: '近 30 天正確率走勢。' },
    { term: '學習藍圖', desc: '每週應練題數、各科覆蓋率；也能在此把「待校題」納入練習。' }
  ]));

  sheet.appendChild(_helpSection('小技巧', [
    { term: '作答方式', desc: '滑鼠點擊或鍵盤皆可。鍵盤：A–E 或 1–5 選取選項，按 Enter 送出；作答後再按 Enter 進下一題。多選題可選多個選項，按 Enter（或點「確認作答」）一次送出。' },
    { term: '切換考試', desc: '標頭的考試選單可在' + EXAM.name + '與其他科之間切換；各科進度分開存放、互不影響。' }
  ]));

  sheet.appendChild(_helpSection('你的進度存在哪裡（很重要）', [
    { desc: '進度有兩種存法：①免登入＝存在這台瀏覽器的 localStorage（私密、不上傳、現在就能用）；②登入後＝以雲端（Cloudflare）同步、跨裝置接續（規劃中）。本機模式永遠可用。' },
    { desc: '本機（localStorage）很耐放，但不是永久保證，可能在這些情況消失：' },
    { desc: '你按「清除瀏覽資料／網站資料」，或重設、解除安裝瀏覽器。' },
    { desc: '無痕模式（關掉視窗就清）。' },
    { desc: 'Safari 比較兇：對「網頁自己寫入」的儲存有較積極的清理機制，長期沒回來開可能被回收。' },
    { desc: '磁碟空間嚴重不足時，瀏覽器可能回收。' },
    { desc: '換瀏覽器／裝置／使用者 = 另一個空櫃子（這不是遺失，是各自獨立）。跨裝置同步功能規畫中。' }
  ]));

  var honest = [];
  if (EXAM.coverageNote) { honest.push({ desc: EXAM.coverageNote }); }
  if (EXAM.staleNote) { honest.push({ desc: EXAM.staleNote }); }
  honest.push({ desc: '申論是「關鍵詞涵蓋度評分 + 自評」，不是 AI 語意批改；參考要點為 AI 整理的學習輔助，非官方標準答案，作答與引用前請對照現行' + EXAM.jurisdiction + '查證。' });
  honest.push({ desc: '少數選擇題解析可能不完整（標為「待校題」），預設不出現，可在學習藍圖自行勾選納入。' });
  honest.push({ desc: '任何工作量推估都是「為上榜而設計」，不是上榜保證 —— 沒有任何系統能保證考試結果。' });
  sheet.appendChild(_helpSection('老實話（請務必知道）', honest));

  var p = el('p');
  var go = el('button', { type: 'button' }, '開始練習');
  go.addEventListener('click', closeHelp);
  p.appendChild(go);
  sheet.appendChild(p);

  ov.appendChild(sheet);
}

function _helpKeydown(e) { if (e.key === 'Escape') { closeHelp(); } }
function _helpBackdrop(e) { if (e.target === $('help-overlay')) { closeHelp(); } }

function openHelp() {
  renderHelp();
  var ov = $('help-overlay');
  ov.hidden = false;
  document.addEventListener('keydown', _helpKeydown);
  ov.addEventListener('click', _helpBackdrop);
  var x = ov.querySelector('.help-close');
  if (x) { x.focus(); }
}

function closeHelp() {
  var ov = $('help-overlay');
  ov.hidden = true;
  document.removeEventListener('keydown', _helpKeydown);
  ov.removeEventListener('click', _helpBackdrop);
  var btn = $('btn-help');
  if (btn) { btn.focus(); }   /* 焦點還給觸發鈕(無障礙) */
}
