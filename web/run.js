'use strict';
/* ============================================================
   作答引擎 — 兩種作答節奏的共用基礎,供單題練習以外的所有模式呼叫。

     startDrill  逐題即時回饋的「有限佇列」:弱點殲滅、入學簡短診斷。
                 一題一題練,答完馬上知道對錯(最短回饋迴路)。
     startSheet  整卷作答、交卷後一次評分:歷屆原卷、模擬考、完整診斷。
                 逼近真實考試形式。

   另含共用題卡 buildMCQCard / markMCQCard 與返回連結 backLink。
   依賴 app.js 全域:el / $ / pct / LETTERS / SUBJECTS / PASS_LINE /
   recordAnswer / showPanel / renderAll / renderPracticeHead。皆在使用者
   觸發後才呼叫,載入順序安全。
   ============================================================ */

/* KaTeX 渲染卡片內的行內公式 \( ... \) / 行間 \[ ... \]（自架,載入失敗則靜默保留原文）。
   學測/會考數學/自然題的題幹與選項含 LaTeX,國考各科純文字不受影響。 */
function renderMath(elm) {
  if (typeof window.renderMathInElement !== 'function') { return; }
  try {
    window.renderMathInElement(elm, {
      delimiters: [{ left: '\\(', right: '\\)', display: false },
                   { left: '\\[', right: '\\]', display: true }],
      throwOnError: false
    });
  } catch (e) { /* 公式渲染失敗 → 保留原始文字,不擋題目 */ }
}

/* 把 bank 的結構化表格資料畫成 HTML <table>(比較表／數值表／非選填表的更佳呈現)。
   q.table = { headers?: [字串], rows: [[字串,…],…] }。資料皆來自 bank(可信),用 el() 的 textContent、
   不碰 innerHTML。注意:若該「表」其實含座標／曲線／圖示(是圖不是純文字資料),仍走 q.figure;
   此處只畫純文字資料表 → 可選取／搜尋／隨字級縮放／深色模式自動配色,勝過截圖。 */
function buildTable(t) {
  if (!t || !t.rows || !t.rows.length) { return null; }
  var wrap = el('div', { 'class': 'q-table-wrap' });
  var tbl = el('table', { 'class': 'q-table' });
  if (t.caption) { tbl.appendChild(el('caption', null, t.caption)); }
  if (t.headers && t.headers.length) {
    var thead = el('thead'), htr = el('tr');
    t.headers.forEach(function (h) { htr.appendChild(el('th', null, h)); });
    thead.appendChild(htr); tbl.appendChild(thead);
  }
  var tbody = el('tbody');
  t.rows.forEach(function (row) {
    var tr = el('tr');
    row.forEach(function (cell) { tr.appendChild(el('td', null, cell)); });
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody); wrap.appendChild(tbl);
  return wrap;
}

/* 有些題幹在 PDF 抽取時把原卷表格保留成 inline <table>…</table>(比較表、雙向細目表、數值表),
   位置常夾在題幹文字中間(「解法如下：<表> …何者正確?」),故就地渲染、保留原位,而非搬到題幹下方。
   資料來自本站題庫(可信),但站台可被 fork → 仍走白名單 clone:只放行表格家族標籤、不複製任何屬性,
   等於天然消毒(擋掉 fork 的 bank.json 夾帶 <script>/<img onerror>);不碰 innerHTML。 */
var Q_TABLE_TAGS = { TABLE: 1, THEAD: 1, TBODY: 1, TFOOT: 1, TR: 1, TD: 1, TH: 1, CAPTION: 1, COLGROUP: 1, COL: 1 };
function sanitizeTableNode(src) {
  if (src.nodeType === 3) { return document.createTextNode(src.nodeValue); }   /* 文字節點:原樣保留(含 \(…\) 供 KaTeX 事後渲染) */
  if (src.nodeType !== 1 || !Q_TABLE_TAGS[src.tagName]) { return null; }        /* 非白名單元素(script/img/…)整個丟棄 */
  var out = document.createElement(src.tagName.toLowerCase());
  for (var c = src.firstChild; c; c = c.nextSibling) {
    var cl = sanitizeTableNode(c); if (cl) { out.appendChild(cl); }
  }
  return out;
}
function appendStemRich(container, str) {
  /* 把字串切成 [文字, <table>…</table>, 文字, …],文字→text node(逃逸安全),表格→消毒後的真表格。 */
  String(str).split(/(<table[\s\S]*?<\/table>)/i).forEach(function (part) {
    if (!part) { return; }
    if (/^<table/i.test(part)) {
      var tbl = new DOMParser().parseFromString(part, 'text/html').querySelector('table');
      var clean = tbl ? sanitizeTableNode(tbl) : null;
      if (clean) {
        clean.className = 'q-table';
        var wrap = el('div', { 'class': 'q-table-wrap' }); wrap.appendChild(clean); container.appendChild(wrap);
        return;
      }
    }
    container.appendChild(document.createTextNode(part));   /* 純文字,或表格解析失敗 → 顯示原文(可見,不靜默吞) */
  });
}
/* 摘要／清單情境(錯題列表、歷史預覽):題幹的 inline <table> 不宜展開整張 → 收成「〔表〕」佔位,並清掉零星表格標籤。 */
function stemPlain(s) {
  return String(s || '')
    .replace(/<table[\s\S]*?<\/table>/gi, '〔表〕')
    .replace(/<\/?(?:thead|tbody|tfoot|tr|td|th|caption|colgroup|col)\b[^>]*>/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

/* 題組共用本體(passage):閱讀題組／非選的甲乙引文等,過去未渲染→題組題缺上下文。
   依 group_id 每組只畫一次(見 startSheet/startDrill),非選文言文本體也靠這裡顯示。 */
/* 題組路徑指示:group_id 編碼首末題號(g23_25／會考_111_國文_g28_29)→ 解出範圍,
   產生「第 X～Y 題為題組」標頭。題組題被拆到單題／錯題／弱點時也帶著,讓單看一題仍知
   屬哪個題組、要先讀下方資料。 */
function groupHeaderEl(q) {
  if (!q || !q.group_id) { return null; }
  var ms = String(q.group_id).match(/g(\d+)_(\d+)/g);
  if (!ms || !ms.length) { return null; }
  var m = /g(\d+)_(\d+)/.exec(ms[ms.length - 1]);
  return el('p', { 'class': 'q-group-head' },
    '第 ' + m[1] + '～' + m[2] + ' 題為題組，請先閱讀下方資料，再回答 ' + m[1] + '～' + m[2] + ' 題。');
}

/* PDF 抽出的 passage 每行是版面折行(單 \n,常斷在詞中),且段落界線無雙換行。
   把同段折行併回(CJK 無詞距,直接接)、段落界線用「短行＝段末」偵測(段落最後一行通常未填滿欄寬)。 */
function formatPassage(text) {
  var lines = String(text).split('\n').map(function (s) { return s.replace(/\s+$/, ''); })
    .filter(function (s) { return s.length; });
  if (lines.length < 2) { return lines.length ? lines : [String(text)]; }
  var maxlen = lines.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
  var paras = [], cur = '';
  function flush() { if (cur) { paras.push(cur); cur = ''; } }
  lines.forEach(function (ln) {
    if (/^[甲乙丙丁戊]$/.test(ln)) { flush(); paras.push(ln); return; }   /* 甲乙丙丁標籤自成一段,別被前段滿行併走 */
    cur += ln;
    if (ln.length < maxlen * 0.78) { flush(); }   /* 短行 → 段末 */
  });
  flush();
  return paras;
}
/* 附圖元素(題幹附圖與題組本體圖共用):圖檔尚未整備時優雅退化成佔位字,不顯示破圖 icon。 */
function figureImg(name, alt) {
  var fig = el('img', { 'class': 'q-figure', src: dataUrl('figures/' + name), alt: alt, loading: 'lazy' });
  fig.onerror = function () {
    if (fig.parentNode) {
      fig.parentNode.replaceChild(el('p', { 'class': 'q-figure-pending' }, '（此題附圖整備中）'), fig);
    }
  };
  return fig;
}

/* passage 可為字串(純文字)或**區塊陣列**——原卷題組常是「說明文字→圖→補充文字→圖」交錯,
   單靠「文字全放前、圖全放後」會打亂原卷順序。陣列元素:字串＝文字段;{img:'檔名'}＝圖。 */
function passageEl(text) {
  if (!text) { return null; }
  var box = el('div', { 'class': 'q-passage' });
  var n = 0;
  (Array.isArray(text) ? text : [text]).forEach(function (b) {
    if (b && b.img) { box.appendChild(figureImg(b.img, '題組附圖')); n++; return; }
    if (!b || !String(b).trim()) { return; }
    formatPassage(String(b)).forEach(function (p) { box.appendChild(el('p', { 'class': 'q-passage-p' }, p)); n++; });
  });
  return n ? box : null;
}

var CARRY_RE = /承上題|依前文|依上文|承前題?|同上題|依前題|根據上題|接上題/;
/* 承上題但無 passage/group:找同卷前面的題(走回情境錨題,鏈可能長於 2 題)當「前題情境」
   依序全部顯示。純前端,不改資料。
   prevQid(可選):畫面上一張卡的 qid——若就是本題在原卷的直接前一題,代表整條鏈(錨題到
   本題前)都已依序顯示在畫面上,不必重複框出(整卷模式混卷抽到承上題時常見)。 */
function carryContextEl(q, prevQid) {
  if (!q || q.group_id || q.passage) { return null; }          /* 已有本體就不用 */
  if (!q.stem || !CARRY_RE.test(String(q.stem))) { return null; }
  if (typeof papersIndex === 'undefined' || typeof byQid === 'undefined') { return null; }
  var paper = null, i;
  for (i = 0; i < papersIndex.length; i++) { if (papersIndex[i].qids.indexOf(q.qid) >= 0) { paper = papersIndex[i]; break; } }
  var box = el('div', { 'class': 'q-passage q-carry' });
  if (!paper) { box.appendChild(el('p', { 'class': 'q-passage-p' }, '【承上題】此題承接前一題，建議到「歷屆原卷」看整卷以取得完整情境。')); return box; }
  var idx = paper.qids.indexOf(q.qid);
  /* 相鄰抑制:畫面上一張卡就是本題在原卷的直接前一題(而非只看它是不是錨題本身)
     → 代表錨題到本題前的整條鏈都已依序顯示在畫面上,不必重複框出。 */
  if (idx > 0 && prevQid && paper.qids[idx - 1] === prevQid) { return null; }
  /* 走回到「情境錨題」:往前找第一個 stem 不含承上標記的題,記下其索引 jA */
  var jA = -1, j;
  for (j = idx - 1; j >= 0; j--) {
    var pq = byQid[paper.qids[j]];
    if (!pq) { continue; }
    jA = j;
    if (!CARRY_RE.test(String(pq.stem || ''))) { break; }       /* 找到錨題就停 */
  }
  if (jA < 0) { box.appendChild(el('p', { 'class': 'q-passage-p' }, '【承上題】此題承接前一題，建議到「歷屆原卷」看整卷以取得完整情境。')); return box; }
  box.appendChild(el('p', { 'class': 'q-carry-label' }, '【承上題】以下為情境所在的前題，據此作答：'));
  /* 鏈式堆疊:從錨題 jA 到本題前一題 idx-1,依序全部顯示(承上題鏈可能長於 2 題)。 */
  for (j = jA; j < idx; j++) {
    var pj = byQid[paper.qids[j]];
    if (!pj) { continue; }
    box.appendChild(el('p', { 'class': 'q-carry-label' }, '第 ' + pj.no + ' 題' + (j === jA ? '' : '（承上）') + '：'));
    var body = el('div');
    if (typeof appendStemRich === 'function') { appendStemRich(body, String(pj.stem || '')); }
    else { body.appendChild(el('p', null, String(pj.stem || ''))); }
    box.appendChild(body);
  }
  return box;
}

/* ===================== 非選(簡答)作答 =====================
   非選題與選擇同卷同時間(題組可選擇＋簡答混合),inline 出現在原卷。
   作答＝textarea;即時字數計數「含標點符號」(學測/會考規則:標點占字數),不計空白換行。 */
function essayCharCount(s) {
  /* ponytail:含標點、不計空白/換行的字數;CJK 與全形標點各算 1 個 code point。 */
  return Array.from(String(s || '').replace(/\s+/g, '')).length;
}
function parseCharLimits(stem) {
  /* 從題幹抓官方字數上限「作答字數：N字以內」(一題可多個子題、各自上限)。 */
  var out = [], re = /作答字數[：:]\s*(\d+)\s*字/g, m;
  while ((m = re.exec(String(stem || '')))) { out.push(Number(m[1])); }
  return out;
}
function buildEssayAnswer(card, q) {
  card._optButtons = [];   /* 讓 pickedLetters/markMCQCard 對非選卡安全(空陣列) */
  var limits = parseCharLimits(q.stem);
  var maxLimit = limits.length ? Math.max.apply(null, limits) : 0;
  if (limits.length) {
    card.appendChild(el('p', { 'class': 'subtitle essay-limit' },
      '本題字數規定：' + limits.map(function (n) { return n + ' 字以內'; }).join('、') + '（含標點符號）'));
  }
  var ta = el('textarea', { 'class': 'essay-answer-input', rows: (maxLimit && maxLimit <= 20) ? '3' : '6',
    placeholder: '在這裡作答 —— 非選題交卷後對照官方參考答案；提取練習：先自己寫，比看了答案才寫有效。' });
  card.appendChild(ta);
  var cc = el('p', { 'class': 'char-count' });
  function upd() {
    var n = essayCharCount(ta.value);
    var txt = '已寫 ' + n + ' 字（含標點）';
    if (maxLimit) { txt += ' ／ 上限 ' + maxLimit + ' 字'; cc.classList.toggle('over', n > maxLimit); }
    cc.textContent = txt;
  }
  ta.addEventListener('input', upd); upd();
  card.appendChild(cc);
  card._isEssay = true; card._essayInput = ta;
}
/* 交卷後揭示非選的官方參考答案/評分原則(資料 Phase D 接;先把 UI/欄位接好,先顯示 AI 詳解＋整備提示)。 */
function revealEssay(card, q) {
  if (card._essayInput) { card._essayInput.disabled = true; }
  var box = el('div', { 'class': 'essay-reveal' });
  var _ex = (typeof explEl === 'function') ? explEl(q.qid) : null;
  if (_ex) { box.appendChild(_ex); }
  box.appendChild(el('p', { 'class': 'review-official-pending' },
    '官方參考答案與評分原則整備中（將接入官方「非選擇題參考答案與評分原則」）。先自評：是否扣題、是否在字數內、要點是否齊全。'));
  card.appendChild(box);
  if (typeof feedbackLink === 'function') {
    var p = el('p', { 'class': 'review-fb' }); p.appendChild(feedbackLink(q.qid)); card.appendChild(p);
  }
}

/* ===================== 共用題卡(逐題即時回饋) ===================== */
function buildMCQCard(q, meta) {
  var card = el('article', { 'class': 'question-card' });
  /* 標記(橘折角)／儲存按鈕不在這裡:兩者依 ADR-0009 永不同時出現、也非每個作答表面都有——
     標記只在整卷作答(startSheet)加,由呼叫端插入;儲存只在詳解檢視(答完/交卷後)插入,
     見 app.js 的 saveButtonEl()。 */
  /* 多選題:type=多選,或官方答案為多字母(如 BD/ADE)。送分題(#)非多選。
     多選 UI／集合評分見 wireMultiToggle / pickedLetters / markMCQCard / recordAnswer。 */
  var isMulti = (q.type === '多選') || (q.answer !== '#' && String(q.answer).length > 1);
  card._isMulti = isMulti;
  var flag = (q.parse === 'review') ? '（待校題）' : '';
  card.appendChild(el('div', { 'class': 'q-meta' },
    yearLabel(q.year) + '・' + q.subject + '・第 ' + q.no + ' 題' + (isMulti ? '（多選）' : '') + flag));
  /* 題幹用 div(非 p):題幹可能夾帶 inline <table>(表格是 block 元素,放進 p 不合法)。 */
  var stemBox = el('div', { 'class': 'question-stem' });
  appendStemRich(stemBox, q.no + '. ' + q.stem);
  card.appendChild(stemBox);
  /* 題目附圖／表(語意差別量表、家系圖、長條圖等)。線上以檔案載入,不做 base64 內嵌;
     檔名見 bank 的 figure 欄,路徑同 dataUrl 規則(../data/<考試>/figures/<檔名>)。 */
  if (q.figure) {
    /* q.figure 可為單一檔名或多圖陣列(如題組「說明框＋甲乙各一張卡牌圖」),依序渲染。 */
    (Array.isArray(q.figure) ? q.figure : [q.figure]).forEach(function (name, i, arr) {
      var alt = '第 ' + q.no + ' 題附圖' + (arr.length > 1 ? '（' + (i + 1) + '／' + arr.length + '）' : '');
      card.appendChild(figureImg(name, alt));
    });
  }
  if (q.table) {
    /* q.table 可為單一 {headers,rows} 或多表陣列(如「表一、表二」同題)。 */
    (Array.isArray(q.table) ? q.table : [q.table]).forEach(function (t) {
      var tb = buildTable(t); if (tb) { card.appendChild(tb); }
    });
  }
  if (q.type === '非選') {
    buildEssayAnswer(card, q);   /* 非選(簡答):textarea＋字數計數,無選項 */
  } else {
    var ol = el('ol', { 'class': 'options' });
    card._optButtons = [];
    q.options.forEach(function (opt, i) {
      var li = el('li');
      var b = el('button', { type: 'button', 'class': 'opt', 'data-idx': String(i) });
      b.appendChild(el('span', { 'class': 'letter' }, '(' + LETTERS[i] + ')'));
      b.appendChild(document.createTextNode(opt));
      li.appendChild(b);
      ol.appendChild(li);
      card._optButtons.push(b);
    });
    card.appendChild(ol);
    /* 圖選題:選項文字全空、選項本體是附圖右側的 A／B／C／D 欄(表格/圖示),提示對照圖作答。 */
    if (q.figure && q.options.length && q.options.every(function (o) { return String(o).trim() === ''; })) {
      card.appendChild(el('p', { 'class': 'subtitle opt-figure-hint' },
        '（本題選項為上圖中的 A／B／C／D，請對照圖片作答）'));
    }
  }
  if (meta && meta.reason) {
    var r = el('p', { 'class': 'reason' });
    r.appendChild(el('span', { 'class': 'reason-tag' }, meta.reasonTag || '為何出這題'));
    r.appendChild(document.createTextNode(meta.reason));
    card.appendChild(r);
  }
  renderMath(card);   /* 渲染題幹/選項內的 \( \) LaTeX（數學/自然題；純文字題無影響） */
  return card;
}
/* picked 可為單選字母字串('A')、多選排序字串('BD'/'_')或單選索引(數字,向後相容)。
   標記:所有正解綠、誤選紅、其餘 dim;送分題(#)不標紅綠。 */
function letterSetOf(s) {
  var set = {};
  if (s === '#' || s == null) { return set; }
  String(s).split('').forEach(function (ch) { if (ch >= 'A' && ch <= 'E') { set[ch] = true; } });
  return set;
}
function pickedSetOf(picked) {
  if (typeof picked === 'number') {
    var s = {}; if (picked >= 0 && LETTERS[picked]) { s[LETTERS[picked]] = true; } return s;
  }
  return letterSetOf(picked);
}
function markMCQCard(card, q, picked) {
  var given = (q.answer === '#'); // 送分題：無單一正解，不標紅綠
  var ansSet = letterSetOf(q.answer), pickSet = pickedSetOf(picked);
  card._optButtons.forEach(function (b, i) {
    b.disabled = true;
    var L = LETTERS[i];
    if (!given && ansSet[L]) { b.classList.add('is-correct'); }
    else if (!given && pickSet[L]) { b.classList.add('is-wrong'); }
    else { b.classList.add('is-dim'); }
  });
  var note = staleNoteEl(q);
  if (note) { card.appendChild(note); }
}

/* IFRS／稅法等時效提示:只有 staleness 為 ifrs_sensitive / law_sensitive 的題目才掛,
   提醒準則與法規會修訂,作答與引用以現行版本為準(紅字,.stale-note)。 */
function staleNoteEl(q) {
  if (!q || (q.staleness !== 'ifrs_sensitive' && q.staleness !== 'law_sensitive')) { return null; }
  return el('p', { 'class': 'stale-note' },
    '此題涉時效性法規或專業準則，內容會修訂，作答與引用請以現行版本為準。');
}

/* 作答後動作列:同一列,左「🚩 疑義回報」右「下一題／看本組總結」(.qa-actions)。 */
function qaActionRow(qid, nextBtn) {
  var row = el('div', { 'class': 'qa-actions' });
  if (typeof feedbackLink === 'function') { row.appendChild(feedbackLink(qid)); }
  else { row.appendChild(el('span')); }   /* 佔位讓 nextBtn 仍靠右 */
  row.appendChild(nextBtn);
  return row;
}

/* ===================== 多選作答 UI(三引擎共用) =====================
   選項點擊＝toggle .picked(可複選、不即時評分);pickedLetters 讀已選→排序字母字串
   ('BD',未選回 '')。沿用單選 .picked 樣式。 */
function wireMultiToggle(card) {
  card._optButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.disabled) { return; }
      b.classList.toggle('picked');
    });
  });
}
function pickedLetters(card) {
  var ls = [];
  card._optButtons.forEach(function (b, i) {
    if (b.classList.contains('picked')) { ls.push(LETTERS[i]); }
  });
  ls.sort();
  return ls.join('');
}
/* 即時回饋引擎(單題練習 todayAnswer／弱點 startDrill)共用接線:
   單選＝點選項即送出;多選＝toggle ＋「確認作答」鈕一次送出。onSubmit(picked) 收排序字母字串。 */
function wireAnswerCard(card, q, onSubmit) {
  if (card._isMulti) {
    wireMultiToggle(card);
    var confirmBtn = el('button', { type: 'button', 'class': 'btn-confirm' }, '確認作答');
    confirmBtn.addEventListener('click', function () {
      var picked = pickedLetters(card);
      if (!picked) { announce('尚未選擇任何選項。'); return; }
      confirmBtn.disabled = true; confirmBtn.hidden = true;   /* 防重複送出(雙重計分) */
      onSubmit(picked);
    });
    card.appendChild(confirmBtn);
    card._confirmBtn = confirmBtn;
  } else {
    card._optButtons.forEach(function (b, i) {
      b.addEventListener('click', function () { onSubmit(LETTERS[i]); });
    });
  }
}

/* ===================== 引擎 A:逐題即時回饋的有限佇列(startDrill) =====================
   items: [{q, reasonTag, reason}];meta:{title, subtitle, backTo, onDone(summary), mode} */
function startDrill(items, meta) {
  meta = meta || {};
  var panel = $('panel-run');
  var idx = 0, ok = 0;
  function head() {
    return '第 ' + (idx + 1) + ' / ' + items.length + ' 題・本組已答對 ' + ok + ' 題';
  }
  function renderOne() {
    panel.textContent = '';
    panel.appendChild(backLink(meta.backTo || 'practice'));
    panel.appendChild(el('h2', null, meta.title || '練習'));
    if (meta.subtitle) { panel.appendChild(el('p', { 'class': 'subtitle' }, meta.subtitle)); }
    if (idx >= items.length) { return done(); }
    panel.appendChild(el('div', { 'class': 'run-head' }, head()));
    var it = items[idx];
    var _gh = groupHeaderEl(it.q); if (_gh) { panel.appendChild(_gh); }   /* 題組路徑指示(拆單題也帶) */
    var _pg = passageEl(it.q.passage);   /* 題組本體(閱讀引文等),逐題單卡每張都顯示 */
    if (_pg) { panel.appendChild(_pg); }
    var _cc = carryContextEl(it.q); if (_cc) { panel.appendChild(_cc); }   /* 承上題(無 passage)→ 補前題情境 */
    var card = buildMCQCard(it.q, { reason: it.reason, reasonTag: it.reasonTag });
    wireAnswerCard(card, it.q, function (picked) { answer(card, it.q, picked); });
    panel.appendChild(card);
  }
  function answer(card, q, picked) {
    var correct = recordAnswer(q, picked, { mode: meta.mode || 'drill' });
    if (correct) { ok += 1; }
    markMCQCard(card, q, picked);
    var fbText = (q.answer === '#') ? '本題送分（考選部公告一律給分）。'
      : (correct ? '答對。正解（' + q.answer + '）。'
        : '答錯。正解（' + q.answer + '）。');
    var fb = el('p', { 'class': 'feedback ' + (correct ? 'good' : 'bad') }, fbText);
    card.appendChild(fb);
    /* 螢幕報讀器朗讀對錯。作答畫面只列對錯與正解,不掛教練金句(金句只在能力雷達/學習藍圖出現) */
    announce(fbText);
    var _ex = (typeof explEl === 'function') ? explEl(q.qid) : null;
    if (_ex) { card.appendChild(_ex); }   /* 本題解釋(AI 整理,explain.js) */
    if (typeof saveButtonEl === 'function') { card.appendChild(saveButtonEl(q.qid)); }   /* 詳解檢視:儲存(見 ADR-0009) */
    var nextBtn = el('button', { type: 'button' }, idx + 1 < items.length ? '下一題' : '看本組總結');
    nextBtn.addEventListener('click', function () { idx += 1; renderOne(); });
    card.appendChild(qaActionRow(q.qid, nextBtn));   /* 左疑義回報、右下一題,同列 */
    nextBtn.focus();
    renderPracticeHead();
  }
  function done() {
    var doneText = '本組 ' + items.length + ' 題，答對 ' + ok + ' 題（' +
      pct(ok / Math.max(items.length, 1)) + '）。';
    panel.appendChild(el('div', { 'class': 'diag-result-line' }, doneText));
    announce('本組完成。' + doneText);   /* 螢幕報讀器朗讀本組總結 */
    if (meta.onDone) { meta.onDone({ total: items.length, ok: ok }); }
    var again = el('button', { type: 'button' }, '回到單題練習');
    again.addEventListener('click', function () { showPanel('practice'); });
    var p = el('p'); p.appendChild(again); panel.appendChild(p);
  }
  showPanel('run');
  renderOne();
}

/* ===================== 引擎 B:整卷作答、交卷後一次評分(startSheet) =====================
   questions: [q...];meta:{title, subtitle, backTo, mode, onGraded(result)} */
var _sheetTickId = null;   /* 全站同時只允許一份整卷計時(換卷／離開時停掉舊的),避免雙計時污染落點 */
function startSheet(questions, meta) {
  meta = meta || {};
  if (!questions || questions.length === 0) { alert('沒有可作答的題目。'); return; }
  var panel = $('panel-sheet');
  var graded = false;
  var startedAt = Date.now();
  var timing = meta.timing || null;          /* {fullMins, suggestMins} 或 null(不計時);見 ADR-0001 */
  var elapsedSecs = 0, paused = false, tickId = null;
  /* 標記(橘折角,見 ADR-0009):只在整卷作答(本引擎)出現,供作答中「先跳過、待會回來檢查」。
     作答中只存這個函式的區域變數(不寫 localStorage);交卷(grade)時隨每題的 recordAnswer
     一併寫進該題的歷史紀錄(entry.flags),之後可在「歷史紀錄」詳情回看/編輯——見 history.js。 */
  var flags = {};
  var cardRefs = [], qnavBtns = [];
  function toggleSheetFlag(qi, q) {
    flags[q.qid] = !flags[q.qid];
    var on = !!flags[q.qid];
    cardRefs[qi].classList.toggle('is-flagged', on);
    if (cardRefs[qi]._flagBtn) {
      cardRefs[qi]._flagBtn.classList.toggle('active', on);
      cardRefs[qi]._flagBtn.setAttribute('aria-pressed', String(on));
    }
    if (qnavBtns[qi]) { qnavBtns[qi].classList.toggle('is-flagged', on); }
    return on;
  }
  /* 題號導覽列:一排題號鈕,點了捲到該題;被標記的題號鈕右上角有橘折角提示,方便交卷前巡一輪。 */
  function buildQNav() {
    var nav = el('div', { 'class': 'sheet-qnav', role: 'navigation', 'aria-label': '題號導覽' });
    questions.forEach(function (q, qi) {
      var b = el('button', { type: 'button', 'class': 'sheet-qnav-btn' + (flags[q.qid] ? ' is-flagged' : '') },
        String(qi + 1));
      b.addEventListener('click', function () {
        if (cardRefs[qi]) { cardRefs[qi].scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
      qnavBtns[qi] = b;
      nav.appendChild(b);
    });
    return nav;
  }
  function render() {
    panel.textContent = '';
    panel.appendChild(backLink(meta.backTo || 'practice'));
    panel.appendChild(el('h2', null, meta.title || '整卷練習'));
    if (meta.subtitle) { panel.appendChild(el('p', { 'class': 'subtitle' }, meta.subtitle)); }
    /* 測驗開始前的正式說明(保持乾淨,只列必要資訊;含多選題時據實說明) */
    var hasMulti = questions.some(function (q) { return q.type === '多選' || (q.answer !== '#' && String(q.answer).length > 1); });
    panel.appendChild(el('p', { 'class': 'exam-instruction' },
      hasMulti ? '本試題含單選與多選；單選題選一個最適當答案，多選題請選出所有正確選項。'
               : '本試題為單一選擇題，請選出一個正確或最適當答案。'));
    var info = el('div', { 'class': 'run-head' });
    info.appendChild(el('span', { id: 'sheet-progress' }, '測驗題共 ' + questions.length + ' 題'));
    info.appendChild(el('span', { id: 'sheet-timer' }, timing ? '' : '作答中…'));
    if (timing) {
      var pauseBtn = el('button', { type: 'button', id: 'sheet-pause', 'class': 'btn-quiet' }, '暫停');
      pauseBtn.addEventListener('click', togglePause);
      info.appendChild(pauseBtn);
    }
    panel.appendChild(info);
    if (timing) {
      panel.appendChild(el('p', { 'class': 'subtitle timing-note' },
        timing.fullMins > timing.suggestMins
          ? ('選擇題建議 ' + timing.suggestMins + ' 分・全科完整 ' + timing.fullMins + ' 分（含申論；超過建議時間數字轉紅，全時間到才強制交卷）')
          : ('全卷時間 ' + timing.fullMins + ' 分（到 0 強制交卷）')));
    }
    panel.appendChild(el('p', { 'class': 'subtitle sheet-qnav-hint' }, '點題號可捲到該題；「標記」可先跳過、待會回來檢查（隨這次作答存入歷史紀錄，之後仍可在「歷史紀錄」回看與編輯）。'));
    panel.appendChild(buildQNav());
    var lastGroup = null;
    questions.forEach(function (q, qi) {
      /* 題組:每組畫一次「路徑指示標頭＋本體」;無 group_id 但有 passage 的題各自顯示 passage。 */
      var _newGroup = q.group_id && q.group_id !== lastGroup;
      if (_newGroup) { var _gh = groupHeaderEl(q); if (_gh) { panel.appendChild(_gh); } }
      if (q.passage && (!q.group_id || _newGroup)) {
        var _pg = passageEl(q.passage); if (_pg) { panel.appendChild(_pg); }
      }
      lastGroup = q.group_id || null;
      /* 承上題(無 passage/group)→ 補前題情境;混卷抽到承上題時,畫面上一張卡未必是它的錨題(見 carryContextEl)。 */
      var _cc = (typeof carryContextEl === 'function') ? carryContextEl(q, qi > 0 ? questions[qi - 1].qid : null) : null;
      if (_cc) { panel.appendChild(_cc); }
      var card = buildMCQCard(q, null);
      cardRefs[qi] = card;
      /* 標記列(僅整卷作答表面;見 ADR-0009):加在卡片最上方,交卷後於 grade() 移除、換成儲存鈕。 */
      var markRow = el('div', { 'class': 'q-mark-row' });
      var flagBtn = el('button', { type: 'button', 'class': 'q-mark-btn' + (flags[q.qid] ? ' active' : ''),
        'aria-pressed': String(!!flags[q.qid]) }, '標記');
      flagBtn.addEventListener('click', function () { toggleSheetFlag(qi, q); });
      markRow.appendChild(flagBtn);
      card.insertBefore(markRow, card.firstChild);
      card._markRow = markRow;
      card._flagBtn = flagBtn;
      if (flags[q.qid]) { card.classList.add('is-flagged'); }
      if (card._isEssay) {
        card._essayInput.addEventListener('input', function () { if (!graded) { updateProgress(); } });
      } else if (card._isMulti) {
        wireMultiToggle(card);   /* 多選:可複選(toggle .picked) */
        card._optButtons.forEach(function (b) {
          b.addEventListener('click', function () { if (!graded) { updateProgress(); } });
        });
      } else {
        card._optButtons.forEach(function (b) {   /* 單選:互斥單選 */
          b.addEventListener('click', function () {
            if (graded) { return; }
            card._optButtons.forEach(function (bb) { bb.classList.remove('picked'); });
            b.classList.add('picked');
            updateProgress();
          });
        });
      }
      card._qref = q;
      panel.appendChild(card);
    });
    var submit = el('button', { type: 'button', id: 'sheet-submit' }, '交卷評分');
    submit.addEventListener('click', function () { grade(); });   /* 包一層:別把 click Event 當 forcedSubmit 傳進去(會跳過未作答確認) */
    var pp = el('p'); pp.appendChild(submit);
    panel.appendChild(pp);
    updateProgress();
  }
  function countAnswered() {   /* 已作答＝選擇題有 .opt.picked,或非選 textarea 有內容 */
    var n = 0;
    Array.prototype.forEach.call(panel.querySelectorAll('.question-card'), function (card) {
      if (card._isEssay) { if (card._essayInput && card._essayInput.value.trim()) { n += 1; } }
      else if (card.querySelector('.opt.picked')) { n += 1; }
    });
    return n;
  }
  function updateProgress() {
    var p = $('sheet-progress');
    if (p && !graded) { p.textContent = '已作答 ' + countAnswered() + ' / ' + questions.length + ' 題'; }
  }
  /* 兩段式倒數(見 ADR-0001):倒數 fullMins、過 suggestMins 數字轉紅、fullMins 到 0 強制交卷;可暫停。 */
  function stopTimer() { if (tickId) { clearInterval(tickId); tickId = null; } _sheetTickId = null; }
  function startTimer() {
    if (!timing) { return; }
    if (_sheetTickId) { clearInterval(_sheetTickId); }   /* 上一份整卷的計時(若殘留)一律先停 */
    updateTimerDisplay();
    tickId = setInterval(function () {
      if ($('panel-sheet').hidden) { stopTimer(); return; }   /* 已離開整卷→停錶,不自動交卷(避免登錄殘卷落點) */
      if (paused || graded) { return; }
      elapsedSecs += 1;
      updateTimerDisplay();
      if (elapsedSecs >= timing.fullMins * 60) { grade(true); }   /* 時間到強制交卷 */
    }, 1000);
    _sheetTickId = tickId;
  }
  function updateTimerDisplay() {
    var t = $('sheet-timer'); if (!t || graded) { return; }
    if (paused) { t.textContent = '已暫停'; return; }
    var remain = Math.max(0, timing.fullMins * 60 - elapsedSecs);
    var mm = Math.floor(remain / 60), ss = remain % 60;
    t.textContent = '剩餘 ' + mm + ':' + (ss < 10 ? '0' : '') + ss;
    if (elapsedSecs >= timing.suggestMins * 60) { t.classList.add('over-suggest'); }
  }
  function togglePause() {
    if (graded || !timing) { return; }
    paused = !paused;
    var b = $('sheet-pause'); if (b) { b.textContent = paused ? '繼續' : '暫停'; }
    updateTimerDisplay();
  }
  function grade(forcedSubmit) {
    if (graded) { return; }
    var answered = countAnswered();
    if (!forcedSubmit && answered < questions.length &&
        !confirm('還有 ' + (questions.length - answered) + ' 題未作答，確定交卷？')) { return; }
    graded = true;
    stopTimer();
    var sub = {}, ok = 0, mcqTotal = 0;   /* mcqTotal＝可自動評分的選擇題數(非選不計入分數/落點) */
    var cards = panel.querySelectorAll('.question-card');
    Array.prototype.forEach.call(cards, function (card, qi) {
      var q = card._qref; if (!q) { return; }
      /* 交卷＝進入詳解檢視:標記(作答中的橘折角)在此收掉,換成儲存鈕(見 ADR-0009,兩者永不同畫面)。 */
      if (card._markRow) { card._markRow.remove(); card._markRow = null; }
      if (card._isEssay) {
        revealEssay(card, q);   /* 非選:不自動評分,揭示官方參考答案/評分原則 */
        if (typeof saveButtonEl === 'function') { card.appendChild(saveButtonEl(q.qid)); }
        return;
      }
      mcqTotal += 1;
      var picked = pickedLetters(card) || '_';   /* 單選一字母／多選排序字串／未作答 '_' */
      var correct = recordAnswer(q, picked, { mode: meta.mode || 'mock', flagged: !!flags[q.qid] });   /* 標記隨這次歷史紀錄一併存(見 ADR-0009) */
      if (correct) { ok += 1; }
      markMCQCard(card, q, picked);
      var _ex = (typeof explEl === 'function') ? explEl(q.qid) : null;
      if (_ex) { card.appendChild(_ex); }   /* 交卷後每題顯示本題解釋(AI 整理) */
      if (typeof saveButtonEl === 'function') { card.appendChild(saveButtonEl(q.qid)); }   /* 詳解檢視:儲存(見 ADR-0009) */
      if (typeof feedbackLink === 'function') {   /* 交卷後每題各一顆疑義與建議回報鈕(非整份一顆) */
        var _fbp = el('p', { 'class': 'review-fb' }); _fbp.appendChild(feedbackLink(q.qid)); card.appendChild(_fbp);
      }
      if (!sub[q.subject]) { sub[q.subject] = { n: 0, ok: 0 }; }
      sub[q.subject].n += 1; if (correct) { sub[q.subject].ok += 1; }
    });
    var elapsed = timing ? elapsedSecs : Math.round((Date.now() - startedAt) / 1000);
    var mins = Math.max(1, Math.round(elapsed / 60));
    var head = $('sheet-timer');
    if (head) { head.classList.remove('over-suggest'); head.textContent = (forcedSubmit ? '時間到・' : '') + '作答約 ' + mins + ' 分鐘'; }
    /* 只有「考試形式整卷」(meta.graded)才登錄落點;短卷/練習不入,避免計分壓力。耗時(秒)一併入歷史(P5/ADR-0001 校準) */
    if (meta.graded && typeof recordExam === 'function') {
      recordExam(meta.mode || 'mock', mcqTotal, ok, elapsed);   /* 落點只計選擇題,非選不汙染 */
    }
    if (forcedSubmit) { announce('時間到，已自動交卷。'); }
    showSheetResult(ok, sub, mins, mcqTotal, questions.length - mcqTotal);
    renderAll();
  }
  function showSheetResult(ok, sub, mins, mcqTotal, essayN) {
    mcqTotal = mcqTotal || questions.length;
    var box = el('div');
    var scoreText = '總分：' + ok + ' / ' + mcqTotal + ' 題正確（' +
      pct(ok / mcqTotal) + '）；作答約 ' + mins + ' 分鐘。';
    box.appendChild(el('div', { 'class': 'diag-result-line' }, scoreText));
    if (essayN) {
      box.appendChild(el('p', { 'class': 'subtitle' },
        '另含 ' + essayN + ' 題非選（簡答）：無自動評分，請對照官方參考答案自評，不計入上方分數與落點。'));
    }
    announce('交卷完成。' + scoreText);   /* 螢幕報讀器朗讀總分 */
    var table = el('table'), thead = el('thead'), tr = el('tr');
    ['科目', '作答', '正確', '正確率'].forEach(function (h, i) {
      tr.appendChild(el('th', i > 0 ? { 'class': 'num' } : null, h));
    });
    thead.appendChild(tr); table.appendChild(thead);
    var tb = el('tbody');
    SUBJECTS.forEach(function (s) {
      if (!sub[s]) { return; }
      var acc = sub[s].ok / sub[s].n;
      var row = el('tr', acc < PASS_LINE ? { 'class': 'is-weak' } : null);
      row.appendChild(el('td', null, s));
      row.appendChild(el('td', { 'class': 'num' }, String(sub[s].n)));
      row.appendChild(el('td', { 'class': 'num' }, String(sub[s].ok)));
      row.appendChild(el('td', { 'class': 'num' }, pct(acc)));
      tb.appendChild(row);
    });
    table.appendChild(tb); box.appendChild(table);
    box.appendChild(el('p', { 'class': 'subtitle' },
      '紅字科目低於 60% 參考線。錯題已收進「錯題複習」，相關易混淆題已排入補強佇列。'));
    /* 教練建議(金句)只在能力雷達/學習藍圖出現;此處用下方按鈕導向,結果頁保持乾淨 */
    var b1 = el('button', { type: 'button' }, '去弱點殲滅');
    b1.addEventListener('click', function () { showPanel('cluster'); });
    var b2 = el('button', { type: 'button', 'class': 'btn-quiet' }, '看能力雷達');
    b2.addEventListener('click', function () { showPanel('radar'); });
    var p = el('p'); p.appendChild(b1); p.appendChild(document.createTextNode(' ')); p.appendChild(b2);
    if (typeof feedbackButton === 'function') { p.appendChild(document.createTextNode(' ')); p.appendChild(feedbackButton('整卷綜合疑義與建議')); }   /* 整卷綜合(每題已各有一顆,見上方逐題鈕) */
    box.appendChild(p);
    panel.appendChild(box);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (meta.onGraded) { meta.onGraded({ total: questions.length, ok: ok, sub: sub }); }
  }
  showPanel('sheet');
  render();
  startTimer();   /* 見 ADR-0001:倒數計時(meta.timing 才啟動) */
}

function backLink(panelName) {
  var a = el('a', { 'class': 'back-link', href: '#', role: 'button' }, '← 回題型目次');
  a.addEventListener('click', function (e) { e.preventDefault(); showPanel(panelName || 'practice'); });
  return a;
}

/* ===================== 鍵盤作答(專注:手不離鍵盤)=====================
   A–D 或 1–4 選答、Enter 進下一題。只作用於「逐題即時回饋」的單卡畫面
   (單題練習 #today-card、弱點/診斷 #panel-run);打字中(textarea/input/select)不攔截。 */
var KEY_TO_IDX = { a: 0, A: 0, '1': 0, b: 1, B: 1, '2': 1, c: 2, C: 2, '3': 2, d: 3, D: 3, '4': 3, e: 4, E: 4, '5': 4 };

function activeCardHost() {
  if (!$('panel-practice').hidden) { return $('today-card'); }
  if (!$('panel-run').hidden) { return $('panel-run'); }
  return null;
}
function wireKeyboard() {
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT')) { return; }
    if (e.metaKey || e.ctrlKey || e.altKey) { return; }
    var host = activeCardHost();
    if (!host) { return; }
    var card = host.querySelector('.question-card');
    if (!card) { return; }
    /* A–E／1–5:只「選取」(聚焦該選項),不送出 —— 送出一律靠 Enter,避免一按就送的誤觸。
       多選題:聚焦後按 Enter 觸發 toggle(原生 click),可連選多個,最後按 Enter 送出「確認作答」。 */
    if (Object.prototype.hasOwnProperty.call(KEY_TO_IDX, e.key)) {
      var opts = card.querySelectorAll('.opt');
      var b = opts[KEY_TO_IDX[e.key]];
      if (b && !b.disabled) {
        e.preventDefault();
        if (card._isMulti) { b.click(); }   /* 多選:按鍵直接切換(送出靠 Enter→確認作答) */
        else { b.focus(); }                  /* 單選:先聚焦,Enter 才送(防誤觸) */
      }
      return;
    }
    if (e.key === 'Enter') {
      var act = document.activeElement;
      /* 單選且焦點在未作答選項:交給瀏覽器原生 Enter→click 送出,不重複處理。
         多選:選項按鍵已直接切換,Enter 一律去觸發「確認作答」。 */
      if (!card._isMulti && act && act.classList.contains('opt') && !act.disabled && card.contains(act)) { return; }
      /* 依序找「確認作答」(多選送出) → 「下一題／看本組總結」(已作答推進) */
      var btns = card.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].classList.contains('opt') || btns[i].disabled) { continue; }
        var txt = btns[i].textContent;
        if (txt.indexOf('確認作答') >= 0 || txt.indexOf('下一題') >= 0 || txt.indexOf('看本組總結') >= 0) {
          e.preventDefault(); btns[i].click(); return;
        }
      }
    }
  });
}

/* ===================== 全站圖片點擊放大(lightbox) =====================
   委派監聽所有 .q-figure(題目附圖):點圖開大圖、再點切換實際大小、Esc／點背景關閉。
   單一 overlay,任何題庫只要有附圖都支援(正式上線版)。 */
(function wireFigureZoom() {
  if (typeof document === 'undefined') { return; }
  var lb = null, lbImg = null;
  function ensure() {
    if (lb) { return; }
    lb = el('div', { id: 'fig-lightbox' });
    lbImg = el('img', { alt: '' });
    var x = el('button', { type: 'button', 'class': 'fig-lb-x', 'aria-label': '關閉放大圖' }, '✕');
    lb.appendChild(x); lb.appendChild(lbImg);
    lb.addEventListener('click', function (e) { if (e.target !== lbImg) { closeLb(); } });
    lbImg.addEventListener('click', function (e) { e.stopPropagation(); lbImg.classList.toggle('actual'); });
    x.addEventListener('click', closeLb);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeLb(); } });
    document.body.appendChild(lb);
  }
  function openLb(src, alt) { ensure(); lbImg.src = src; lbImg.alt = alt || ''; lbImg.classList.remove('actual'); lb.classList.add('on'); }
  function closeLb() { if (lb) { lb.classList.remove('on'); lbImg.src = ''; } }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.classList.contains('q-figure')) { openLb(t.src, t.alt); }
  });
})();
