'use strict';
/* ============================================================
   三種考卷導向的練習法:
     歷屆原卷  renderPaperPicker  → startSheet:某年某梯次某科整卷重現
     模擬考    renderMockPicker   → startSheet:跨科混合、可調題數、計時交卷
     弱點殲滅  renderClusterPicker→ startDrill:鎖定最弱科,把相似/相悖題組一起練

   依賴 app.js 全域:papersIndex / usable / byQid / relations / SUBJECTS /
   weakestSubject / subjectStats / startSheet / startDrill / el / $ / pct /
   shuffle / showPanel;另用 essays.js 的 ESSAYS / essayPick(歷屆原卷選配申論時)。
   函式皆在使用者切換到該面板後才呼叫,載入順序安全。
   ============================================================ */

/* ===================== 歷屆原卷 ===================== */
var paperOpts = { withEssay: false };   /* 是否一併練同卷申論題 */

/* 同一份原卷的申論題:用 年+梯次+科目 接合 essays.js 的 ESSAYS(已驗證可完整對上)。
   走 essaysUsable() → 吃 includeLegacy:舊年原卷的申論只在納入歷史題庫時才併出。 */
function essaysForPaper(paper) {
  var src = (typeof essaysUsable === 'function') ? essaysUsable()
    : (typeof ESSAYS !== 'undefined' && ESSAYS ? ESSAYS : []);
  return src.filter(function (e) {
    return e.year === paper.year && String(e.round) === String(paper.round) && e.subject === paper.subject;
  }).sort(function (a, b) { return a.no - b.no; });
}

function renderPaperPicker() {
  var box = $('paper-picker');
  box.textContent = '';
  if (papersIndex.length === 0) { box.appendChild(el('p', { 'class': 'empty-note' }, '題庫載入後顯示。')); return; }
  box.appendChild(el('p', { 'class': 'subtitle' },
    '原汁原味重現某一年、某一梯次、某一科的整份測驗題卷。先作答整卷、再一次交卷評分 —— 用真實考試的形式練。'));

  var years = [];
  papersIndex.forEach(function (p) { if (years.indexOf(p.year) < 0) { years.push(p.year); } });
  var row = el('div', { 'class': 'field-row' });
  row.appendChild(el('label', { 'for': 'paper-year' }, '選擇年份：'));
  var sel = el('select', { id: 'paper-year' });
  years.forEach(function (y) { sel.appendChild(el('option', { value: String(y) }, y + ' 年')); });
  row.appendChild(sel);
  box.appendChild(row);

  /* 可選:同卷申論題一併作答(完整重現整份原卷) */
  var optRow = el('div', { 'class': 'field-row' });
  var chk = el('label', { 'class': 'chk' });
  var cb = el('input', { type: 'checkbox', id: 'paper-include-essay' });
  if (paperOpts.withEssay) { cb.setAttribute('checked', 'checked'); }
  cb.addEventListener('change', function () { paperOpts.withEssay = cb.checked; renderList(); });
  chk.appendChild(cb);
  chk.appendChild(document.createTextNode(' 一併練本卷申論題（作答完選擇題後接續，完整重現整份原卷）'));
  optRow.appendChild(chk);
  box.appendChild(optRow);

  var listBox = el('div', { id: 'paper-list' });
  box.appendChild(listBox);
  function renderList() {
    listBox.textContent = '';
    var y = Number(sel.value);
    var rounds = [];
    papersIndex.forEach(function (p) {
      if (p.year === y && rounds.indexOf(p.round) < 0) { rounds.push(p.round); }
    });
    var multiRound = rounds.length > 1;
    var menu = el('div', { 'class': 'mode-menu' });
    var n = 0;
    papersIndex.forEach(function (p) {
      if (p.year !== y) { return; }
      n += 1;
      var item = el('button', { type: 'button', 'class': 'mode-item' });
      item.appendChild(el('span', { 'class': 'mode-idx' }, String(n)));
      var label = multiRound ? ('〔梯次 ' + p.round + '〕' + p.subject) : p.subject;
      item.appendChild(el('span', { 'class': 'mode-name' }, label));
      var desc = '共 ' + p.qids.length + ' 題・整卷作答後交卷評分';
      if (paperOpts.withEssay) {
        var ec = essaysForPaper(p).length;
        if (ec > 0) { desc += '・另含 ' + ec + ' 題申論'; }
      }
      item.appendChild(el('span', { 'class': 'mode-desc' }, desc));
      item.addEventListener('click', function () { launchPaper(p); });
      menu.appendChild(item);
    });
    listBox.appendChild(menu);
  }
  sel.addEventListener('change', renderList);
  renderList();
}
function launchPaper(paper) {
  var qs = paper.qids.map(function (qid) { return byQid[qid]; }).filter(Boolean);
  if (qs.length === 0) { alert('這份卷沒有可用題目。'); return; }
  var essays = paperOpts.withEssay ? essaysForPaper(paper) : [];
  startSheet(qs, {
    title: '歷屆原卷・' + yearLabel(paper.year) + '・' + paper.subject,
    subtitle: '梯次 ' + paper.round + '・共 ' + qs.length + ' 題。本卷依原題號順序，未經抽換。此為考試形式整卷，計入「落點」。' +
      (essays.length ? '（本卷另含 ' + essays.length + ' 題申論，交卷後可接續作答。）' : ''),
    mode: 'paper', backTo: 'paper', graded: true,
    timing: examTiming(qs),   /* 倒數計時(見 ADR-0001):原卷=該科官方時間 */
    onGraded: essays.length ? function () { offerPaperEssays(paper, essays); } : null
  });
}
/* 交卷後在結果頁附一個入口,接續作答同卷申論題(沿用既有「申論題」分頁,依年/科目過濾) */
function offerPaperEssays(paper, essays) {
  var panel = $('panel-sheet');
  var box = el('div', { 'class': 'paper-essay-cont' });
  box.appendChild(el('p', { 'class': 'subtitle' },
    '本卷原始考題另含 ' + essays.length + ' 題申論題；接著作答即可完整練完整份原卷。'));
  var b = el('button', { type: 'button' }, '接著作答本卷申論題（' + essays.length + ' 題）');
  b.addEventListener('click', function () {
    if (typeof essayPick !== 'undefined') { essayPick.year = paper.year; essayPick.subject = paper.subject; }
    showPanel('essay');
  });
  box.appendChild(b);
  panel.appendChild(box);
}

/* ===================== 模擬考(可自由選科 + 交錯/集中) ===================== */
/* subjects:勾選的科目(null=全部;延遲到 render 才填,避免在 SUBJECTS 定義前於模組層級取用);
   order:'interleave'(預設,交錯) | 'cluster'(同科集中,可選) */
var mockOpts = { count: 0, subjects: null, order: 'interleave' };   /* count=0 → render 時以 examMockSize 補各科真實卷大小 */
function renderMockPicker() {
  var box = $('mock-picker');
  box.textContent = '';
  if (usable.length === 0) { box.appendChild(el('p', { 'class': 'empty-note' }, '題庫載入後顯示。')); return; }
  /* 首次初始化(mockOpts.subjects 尚未設定):預設全科,但排除已停考科目(如社工師「社會
     工作管理」115 年起停考,見 exams.js subjectDeprecationNote)——使用者仍可手動勾回；
     下方「全選」按鈕行為不變,全選會連停考科一併勾上。 */
  if (!mockOpts.subjects) {
    mockOpts.subjects = SUBJECTS.filter(function (s) {
      return !(typeof subjectDeprecationNote === 'function' && subjectDeprecationNote(s));
    });
  }
  if (state && state.settings && state.settings.mockOrder) { mockOpts.order = state.settings.mockOrder; }
  box.appendChild(el('p', { 'class': 'subtitle' },
    '隨機抽題、計時作答，交卷後看各科得分與弱項。可自由勾選要考的科目（單科／複數／全部），並選擇出題順序。'));

  /* 題數：預設＝本考試真實卷大小（examMockSize，取代舊寫死 40）；另含「快速 20」與「加量 60」。 */
  var realN = examMockSize(EXAM.key);
  var SIZE_OPTS = [20, 60, realN].filter(function (v, i, a) { return a.indexOf(v) === i; })
    .sort(function (a, b) { return a - b; });
  if (SIZE_OPTS.indexOf(mockOpts.count) < 0) { mockOpts.count = realN; }
  var row1 = el('div', { 'class': 'field-row' });
  row1.appendChild(el('label', null, '題數：'));
  var seg = el('div', { 'class': 'segmented' });
  SIZE_OPTS.forEach(function (c) {
    var b = el('button', { type: 'button' }, (c === realN) ? (String(c) + ' 題・整卷') : (String(c) + ' 題'));
    b.setAttribute('aria-pressed', String(mockOpts.count === c));
    b.addEventListener('click', function () {
      mockOpts.count = c;
      Array.prototype.forEach.call(seg.children, function (x, i) {
        x.setAttribute('aria-pressed', String(SIZE_OPTS[i] === c));
      });
    });
    seg.appendChild(b);
  });
  row1.appendChild(seg);
  row1.appendChild(el('span', { 'class': 'subj-note' }, '預設＝本考試整卷題數（' + realN + ' 題）'));
  box.appendChild(row1);

  /* 科目:平面(一般考試)或兩級類科(教師檢定等有 subjectGroupSep)。
     兩級=先選類科(只顯示該類科 4-5 科),另有「跨域」開關可跨類科混選。 */
  var subRow = el('div', { 'class': 'field-row' });
  subRow.appendChild(el('label', null, '科目：'));
  var checks = [];                                        /* 目前顯示中的科目 checkbox(切類科/跨域會重建) */
  var selNote = el('span', { 'class': 'subj-note' }, '');
  var groups = (typeof subjectGroups === 'function') ? subjectGroups() : null;
  /* 應考類科設定(settings.js)只留生效的類科;非分組考試或未設定(activeCategories()回null)不受影響。 */
  if (groups && typeof activeCategories === 'function') {
    var _actCats = activeCategories();
    if (_actCats) { groups = groups.filter(function (g) { return _actCats.indexOf(g.name) >= 0; }); }
  }
  var checksArea = null;

  function curGroup() {
    for (var i = 0; groups && i < groups.length; i++) { if (groups[i].name === mockOpts.category) { return groups[i]; } }
    return groups ? groups[0] : null;
  }
  function renderChecks() {                               /* 依 類科/跨域 重建科目 checkbox */
    checksArea.textContent = ''; checks = [];
    var show = mockOpts.crossDomain ? groups : [curGroup()];
    show.forEach(function (g) {
      if (mockOpts.crossDomain) { checksArea.appendChild(el('div', { 'class': 'subj-group-hd' }, subjectGroupLabel(g.name))); }
      var wrap = el('div', { 'class': 'subj-checks' });
      g.subjects.forEach(function (s) {
        var lab = el('label', { 'class': 'chk chk-inline' });
        var cb = el('input', { type: 'checkbox', value: s });
        if (mockOpts.subjects.indexOf(s) >= 0) { cb.checked = true; }
        cb.addEventListener('change', syncSubjects);
        checks.push(cb);
        lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + subjectShortLabel(s)));
        wrap.appendChild(lab);
      });
      checksArea.appendChild(wrap);
    });
  }

  if (groups) {
    if (!mockOpts.category || !groups.some(function (g) { return g.name === mockOpts.category; })) { mockOpts.category = groups[0].name; }
    if (!mockOpts._grouped) { mockOpts.subjects = curGroup().subjects.slice(); mockOpts._grouped = true; }  /* 首次進分組:收斂成當前類科,不一進來就跨全類科 */
    if (groups.length <= 1) {
      /* 應考類科設定收斂到只剩一個生效類科:不建跨域開關與類科切換列(沒有意義),
         crossDomain 視為 false,直接鎖定該唯一類科。 */
      mockOpts.crossDomain = false;
      mockOpts.category = groups[0].name;
      checksArea = el('div', { 'class': 'subj-checks-area' });
      subRow.appendChild(checksArea);
      box.appendChild(subRow);
      renderChecks();
    } else {
      var xdLab = el('label', { 'class': 'chk chk-inline xd-toggle' });
      var xdCb = el('input', { type: 'checkbox' });
      xdCb.checked = !!mockOpts.crossDomain;
      xdLab.appendChild(xdCb); xdLab.appendChild(document.createTextNode(' 跨域考（跨類科混合）'));
      subRow.appendChild(xdLab);
      var catSeg = el('div', { 'class': 'segmented cat-seg' });
      groups.forEach(function (g) {
        var b = el('button', { type: 'button' }, subjectGroupLabel(g.name));
        b.setAttribute('aria-pressed', String(g.name === mockOpts.category));
        b.addEventListener('click', function () {
          mockOpts.category = g.name; mockOpts.subjects = g.subjects.slice();   /* 換類科=改看該類科(預設全選) */
          Array.prototype.forEach.call(catSeg.children, function (x, i) { x.setAttribute('aria-pressed', String(groups[i].name === g.name)); });
          renderChecks(); syncSubjects();
        });
        catSeg.appendChild(b);
      });
      subRow.appendChild(catSeg);
      checksArea = el('div', { 'class': 'subj-checks-area' });
      subRow.appendChild(checksArea);
      xdCb.addEventListener('change', function () {
        mockOpts.crossDomain = xdCb.checked; catSeg.hidden = xdCb.checked;
        if (!xdCb.checked) { mockOpts.subjects = curGroup().subjects.slice(); }   /* 回單類科:重置為該類科全選 */
        renderChecks(); syncSubjects();
      });
      catSeg.hidden = xdCb.checked;
      box.appendChild(subRow);
      renderChecks();
    }
  } else {
    var subWrap = el('div', { 'class': 'subj-checks' });
    SUBJECTS.forEach(function (s) {
      var lab = el('label', { 'class': 'chk chk-inline' });
      var cb = el('input', { type: 'checkbox', value: s });
      if (mockOpts.subjects.indexOf(s) >= 0) { cb.checked = true; }
      cb.addEventListener('change', syncSubjects);
      checks.push(cb);
      /* 停考科目(如社工師「社會工作管理」)標籤加註說明,題庫仍保留、使用者可手動勾選 */
      var depNote = (typeof subjectDeprecationNote === 'function') ? subjectDeprecationNote(s) : null;
      var labText = depNote ? (s + '（' + depNote + '）') : s;
      lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + labText));
      subWrap.appendChild(lab);
    });
    subRow.appendChild(subWrap);
    box.appendChild(subRow);
  }

  var selRow = el('div', { 'class': 'field-row' });
  var allBtn = el('button', { type: 'button', 'class': 'btn-quiet btn-sm' }, '全選');
  allBtn.addEventListener('click', function () { checks.forEach(function (cb) { cb.checked = true; }); syncSubjects(); });
  var noneBtn = el('button', { type: 'button', 'class': 'btn-quiet btn-sm' }, '全不選');
  noneBtn.addEventListener('click', function () { checks.forEach(function (cb) { cb.checked = false; }); syncSubjects(); });
  selRow.appendChild(allBtn); selRow.appendChild(document.createTextNode(' ')); selRow.appendChild(noneBtn);
  selRow.appendChild(selNote);
  box.appendChild(selRow);

  /* 出題順序:交錯(預設,推薦) / 同科集中 —— 附學習科學說明 */
  var orderWrap = el('div', { 'class': 'order-pref' });
  orderWrap.appendChild(el('span', { 'class': 'field-label' }, '出題順序（跨科時）：'));
  var oseg = el('div', { 'class': 'segmented' });
  var ORDERS = [{ key: 'interleave', name: '交錯出題（預設）' }, { key: 'cluster', name: '同科集中' }];
  ORDERS.forEach(function (o) {
    var b = el('button', { type: 'button' }, o.name);
    b.setAttribute('aria-pressed', String(mockOpts.order === o.key));
    b.addEventListener('click', function () {
      mockOpts.order = o.key;
      if (typeof patchSettings === 'function') { patchSettings({ mockOrder: o.key }); }
      Array.prototype.forEach.call(oseg.children, function (x, i) {
        x.setAttribute('aria-pressed', String(ORDERS[i].key === o.key));
      });
    });
    oseg.appendChild(b);
  });
  orderWrap.appendChild(oseg);
  orderWrap.appendChild(el('p', { 'class': 'order-why' },
    '交錯出題（推薦）：不同科輪流出現。「交錯練習」比「同科連做」更能鞏固長期記憶、提升辨識力，因為每次切換都能逼自己重新判斷「這題在考什麼」，正是考場上的真實情境（Bjork「合意困難」）。代價是當下較吃力、正確率看起來較低，但那正是學得更牢的訊號。'));
  orderWrap.appendChild(el('p', { 'class': 'order-why order-why-alt' },
    '同科集中：同一科的題目擺在一起（像真考一節一科）。版面安定、容易進入狀況，貼近考場分節形式；適合想專注衝某幾科時。'));
  box.appendChild(orderWrap);

  function syncSubjects() {
    var picked = [];
    checks.forEach(function (cb) { if (cb.checked) { picked.push(cb.value); } });   /* 只讀目前顯示的 checkbox(分組時=當前類科) */
    mockOpts.subjects = SUBJECTS.filter(function (s) { return picked.indexOf(s) >= 0; });   /* 標準順序 */
    var k = mockOpts.subjects.length;
    selNote.textContent = k === 0 ? '（至少選一科）'
      : (!groups && k === SUBJECTS.length ? ('（全 ' + SUBJECTS.length + ' 科）') : ('（已選 ' + k + ' 科）'));
    orderWrap.hidden = (k < 2);
  }

  var start = el('button', { type: 'button' }, '開始模擬考');
  start.addEventListener('click', launchMock);
  var p = el('p'); p.appendChild(start); box.appendChild(p);

  syncSubjects();
}

/* ===================== 題組鏈聚攏(模擬考抽題後處理) =====================
   模擬考跨科隨機抽題,可能抽到「題組(group_id)」或「承上題」(靠 run.js 全域 CARRY_RE
   判斷)卻抽不到同組/同鏈的其他題,畫面上會斷章。normalizeChains 在抽題完成後做兩件事:
     1) 聚攏:同一題組或同一承上鏈的題,在最終題序裡排在一起、按原卷題號升冪。
     2) 錨題拉入:承上題若連「直接前一題」都沒被抽到,盡量換一題同科的非鏈題把它換進來,
        讓使用者除了看情境框,也能真的作答到那一題(總題數與科目配比不變)。
   純函式:不改輸入 list,回傳新陣列。依賴 app.js 的 papersIndex／byQid、run.js 的
   CARRY_RE,皆為全域;呼叫時機在使用者送出模擬考設定之後,載入順序安全。 */
function paperOfQid(qid) {
  if (typeof papersIndex === 'undefined') { return null; }
  for (var i = 0; i < papersIndex.length; i++) {
    if (papersIndex[i].qids.indexOf(qid) >= 0) { return { paper: papersIndex[i], idx: i }; }
  }
  return null;
}
/* 卷識別:優先用該卷在 papersIndex 的索引(唯一、穩定);找不到卷(理論上不會)時,
   用 year|round|subject 字串保底,避免不同卷的 group_id 巧合撞號誤併。 */
function chainPaperKey(q) {
  var found = paperOfQid(q.qid);
  return found ? String(found.idx) : (q.year + '|' + q.round + '|' + q.subject);
}
/* 從某承上題往前走到「情境錨題」(第一個 stem 不含承上標記的題),回傳其 qid。 */
function chainRootQid(q, paper) {
  var idx = paper.qids.indexOf(q.qid);
  var rootQid = q.qid, j, pq;
  for (j = idx; j >= 0; j--) {
    pq = (typeof byQid !== 'undefined') ? byQid[paper.qids[j]] : null;
    if (!pq) { continue; }
    rootQid = pq.qid;
    if (!CARRY_RE.test(String(pq.stem || ''))) { break; }
  }
  return rootQid;
}
function normalizeChains(list) {
  var src = (list || []).slice();
  if (src.length === 0) { return src; }
  if (typeof papersIndex === 'undefined' || typeof byQid === 'undefined' || typeof CARRY_RE === 'undefined') {
    return src;   /* 依賴缺席(理論上不會)→ 原樣返回,不聚攏也不硬拉,不讓抽題失敗 */
  }
  /* Step 1:名單裡每個「承上題」(無 group_id、stem 命中 CARRY_RE)各自算出鏈根 qid。 */
  var rootOf = {};   /* 承上題 qid → 鏈根(錨題)qid */
  src.forEach(function (q) {
    if (q.group_id) { return; }
    if (!q.stem || !CARRY_RE.test(String(q.stem))) { return; }
    var found = paperOfQid(q.qid);
    if (!found) { return; }
    rootOf[q.qid] = chainRootQid(q, found.paper);
  });
  var rootIsReferenced = {};   /* 鏈根 qid → true,表示名單裡有承上題指向它(供錨題自己歸鏈用) */
  Object.keys(rootOf).forEach(function (qid) { rootIsReferenced[rootOf[qid]] = true; });

  /* chainKey:group_id 鏈用 'g:'+卷識別+group_id;承上鏈(含被拉入的鏈根本身)用
     'c:'+卷識別+鏈根qid;單題(無 group、非鏈)→ null。以 working 目前狀態動態算,
     錨題拉入後仍能正確歸類(拉入的錨題本身 qid 就在 rootIsReferenced 裡)。 */
  function chainKeyOf(q) {
    if (q.group_id) { return 'g:' + chainPaperKey(q) + ':' + q.group_id; }
    if (rootOf[q.qid]) { return 'c:' + chainPaperKey(q) + ':' + rootOf[q.qid]; }
    if (rootIsReferenced[q.qid]) { return 'c:' + chainPaperKey(q) + ':' + q.qid; }
    return null;
  }

  /* Step 2:錨題拉入——承上題的「直接前一題」(原卷 qids 的 idx-1)若不在名單裡、
     查得到且是選擇題,就換掉一題同科、非鏈(chainKey 為 null)的題把它換進來。 */
  var working = src.slice();
  Object.keys(rootOf).forEach(function (carryQid) {
    var q = working.filter(function (it) { return it.qid === carryQid; })[0];
    if (!q) { return; }   /* 防呆:理論上一定在(rootOf 由 src 算出) */
    var found = paperOfQid(q.qid);
    if (!found) { return; }
    var idx = found.paper.qids.indexOf(q.qid);
    if (idx <= 0) { return; }   /* 已是卷首,沒有前一題 */
    var prevQid = found.paper.qids[idx - 1];
    var already = working.some(function (it) { return it.qid === prevQid; });
    if (already) { return; }   /* 前一題已在名單裡,不用拉 */
    var prevQ = byQid[prevQid];
    if (!prevQ || prevQ.type === '非選') { return; }   /* 查不到,或不是選擇題,不拉 */
    var victimIdx = -1, k;
    for (k = 0; k < working.length; k++) {
      if (working[k].subject === prevQ.subject && chainKeyOf(working[k]) === null) { victimIdx = k; break; }
    }
    if (victimIdx < 0) { return; }   /* 找不到可換的就算了,情境框(carryContextEl)會補顯示 */
    working[victimIdx] = prevQ;
  });

  /* Step 3:聚攏——保持整體順序,每條鏈以第一個出現位置為錨位,同鏈成員按原卷題號
     升冪接續插入該位置;其餘位置(單題)維持原樣。 */
  var emitted = {};   /* chainKey → true,已經整組輸出過 */
  var out = [];
  working.forEach(function (q) {
    var key = chainKeyOf(q);
    if (key === null) { out.push(q); return; }
    if (emitted[key]) { return; }   /* 這條鏈已在稍早的錨位整組輸出過 */
    emitted[key] = true;
    var members = working.filter(function (it) { return chainKeyOf(it) === key; })
      .sort(function (a, b) { return a.no - b.no; });
    members.forEach(function (m) { out.push(m); });
  });
  return out;
}

/* 同場雙層互斥(模擬考抽題用):依 shuffle 順序逐題取,兩層指紋都要通過才收:
   1) stemFingerprint(app.js)非 null 且本場已出現過 → 跳過(擋「同題幹、不同選項」的跨年孿生題);
   2) contentFingerprint(app.js)非 null 且本場已出現過 → 跳過(擋「內容完全相同」的跨年重複收錄題)。
   取滿 n 或候選池耗盡為止。seen={stem:{},content:{}} 由呼叫端(單科路徑)或 arrangeBySubject
   (跨科路徑)共用同一個物件,確保全場互斥;但只管「同一場」——不同場(下一次開模擬考)
   彼此獨立,兩份同內容題因此可以輪替被抽到,而非像舊版 dedupByContent 直接砍掉舊年份。 */
function pickGreedyByStem(shuffled, n, seen) {
  var out = [];
  for (var i = 0; i < shuffled.length && out.length < n; i++) {
    var q = shuffled[i];
    var stemFp = (typeof stemFingerprint === 'function') ? stemFingerprint(q) : null;
    if (stemFp !== null && seen.stem[stemFp]) { continue; }
    var contentFp = (typeof contentFingerprint === 'function') ? contentFingerprint(q) : null;
    if (contentFp !== null && seen.content[contentFp]) { continue; }
    if (stemFp !== null) { seen.stem[stemFp] = true; }
    if (contentFp !== null) { seen.content[contentFp] = true; }
    out.push(q);
  }
  return out;
}

function launchMock() {
  var subs = (mockOpts.subjects && mockOpts.subjects.length) ? mockOpts.subjects.slice() : SUBJECTS.slice();
  subs = SUBJECTS.filter(function (s) { return subs.indexOf(s) >= 0; });   /* 標準順序 */
  if (subs.length === 0) { alert('請至少選一科。'); return; }
  var pool = usable.filter(function (q) { return subs.indexOf(q.subject) >= 0; });
  /* 不再於抽題前用 dedupByContent 砍掉舊年份——改走下方 seen(同場雙層互斥),
     內容完全相同的題同一場只會出現一份,但跨場(下次開模擬考)兩份都有機會被抽到(輪替)。 */
  if (pool.length === 0) { alert('此範圍沒有可用題目。'); return; }
  var n = Math.min(mockOpts.count, pool.length);
  var clustered = (mockOpts.order === 'cluster');
  var seen = { stem: {}, content: {} };   /* 全場雙層互斥集合(題幹＋內容),單科/跨科兩條路徑共用 */
  var picked = (subs.length === 1) ? pickGreedyByStem(shuffle(pool.slice()), n, seen)
    : arrangeBySubject(pool, n, subs, clustered, seen);
  picked = normalizeChains(picked);   /* 題組／承上題鏈聚攏,並儘量把鏈的錨題也拉進來(見下方定義) */
  var allSubjects = (subs.length === SUBJECTS.length);   /* 全科選取(單科考試時=選了唯一一科) */
  /* 先判單科(避免「全 1 科混合」),再判全選,最後部分科 */
  var scopeLabel = (subs.length === 1) ? subs[0]
    : (allSubjects ? ('全 ' + SUBJECTS.length + ' 科混合') : (subs.length + ' 科混合'));
  /* 完整模擬(全科 + 達本考試真實卷大小)才計入落點;少量／部分科是隨手練,不計分壓力 */
  var isFull = (allSubjects && subs.length > 1 && n >= examMockSize(EXAM.key));
  var orderLabel = (subs.length >= 2) ? (clustered ? '・同科集中' : '・交錯出題') : '';
  startSheet(picked, {
    title: '模擬考・' + scopeLabel,
    subtitle: '隨機抽 ' + picked.length + ' 題' + orderLabel +
      ((allSubjects || subs.length === 1) ? '' : '（' + subs.join('、') + '）') +
      '。交卷後看各科得分與弱項。' +
      (isFull ? '此為完整模擬，計入「落點」。' : '少量／部分科版為隨手練，不計入「落點」平均（放心練）。'),
    mode: 'mock', backTo: 'mock', graded: isFull,
    timing: isFull ? examTiming(picked) : null   /* 完整模擬才計時;少量/部分科隨手練不計時(放心練) */
  });
}
/* 依科目編排:clustered=true 同科集中(各科一段)、false 跨科交錯(round-robin)。
   subjects 須為要出題的科目(已按 SUBJECTS 標準順序);各科盡量平均取題。
   seen(可選,{stem:{},content:{}} 狀態物件):與 launchMock 的單科路徑共用同一個物件,做
   「同場雙層互斥」——同題幹(stemFingerprint)、同內容(contentFingerprint)皆不得同場重複。
   各科佇列改用指標(ptr)而非固定索引 i,取到已見過的指紋就順延取下一題,直到該科佇列
   耗盡;池仍保留所有題,只是同一場不重複出現同指紋(跨場仍可輪替,見 launchMock 註解)。 */
function arrangeBySubject(pool, n, subjects, clustered, seen) {
  seen = seen || { stem: {}, content: {} };
  var bySub = {};
  subjects.forEach(function (s) { bySub[s] = []; });
  shuffle(pool.slice()).forEach(function (q) { if (bySub[q.subject]) { bySub[q.subject].push(q); } });
  var ptr = {};   /* 每科目前讀到第幾題(游標,取代固定索引 i,遇指紋已見過就順延不中斷抽題) */
  subjects.forEach(function (s) { ptr[s] = 0; });
  function takeFrom(s) {
    var arr = bySub[s];
    while (ptr[s] < arr.length) {
      var q = arr[ptr[s]];
      ptr[s] += 1;
      var stemFp = (typeof stemFingerprint === 'function') ? stemFingerprint(q) : null;
      if (stemFp !== null && seen.stem[stemFp]) { continue; }   /* 同場已出現過的題幹,跳過換下一題 */
      var contentFp = (typeof contentFingerprint === 'function') ? contentFingerprint(q) : null;
      if (contentFp !== null && seen.content[contentFp]) { continue; }   /* 同場已出現過的內容,跳過換下一題 */
      if (stemFp !== null) { seen.stem[stemFp] = true; }
      if (contentFp !== null) { seen.content[contentFp] = true; }
      return q;
    }
    return null;
  }
  var per = Math.ceil(n / subjects.length);
  var out = [];
  if (clustered) {
    /* 同科集中:各科一段(科目依傳入的 SUBJECTS 標準順序),每科內部已隨機 */
    subjects.forEach(function (s) {
      var got = 0;
      while (got < per) {
        var q = takeFrom(s);
        if (!q) { break; }
        out.push(q); got += 1;
      }
    });
  } else {
    /* 交錯:每一輪「重新打亂科目順序」(不可預測、非固定循環),且每輪每科各一題;
       每科內部題目已隨機。避免固定循環被預測、也避免純隨機意外同科結塊。 */
    for (var i = 0; i < per; i++) {
      shuffle(subjects.slice()).forEach(function (s) {
        var q = takeFrom(s);
        if (q) { out.push(q); }
      });
    }
  }
  return out.slice(0, n);
}

/* ===================== 弱點殲滅(易混淆題組) ===================== */
var CLUSTER_SIMILAR = 3, CLUSTER_OPPOSITE = 2;
var clusterSeedUsed = {};   /* qid → true,本次工作階段用過的種子(「再來一組」換種子時排除;全排除光了就清空重來) */
function renderClusterPicker() {
  var box = $('cluster-picker');
  box.textContent = '';
  if (usable.length === 0) { box.appendChild(el('p', { 'class': 'empty-note' }, '題庫載入後顯示。')); return; }
  box.appendChild(el('p', { 'class': 'subtitle' },
    '直擊最大弱點：鎖定一科，挑一題當「種子」，把和它「概念相似」、或「邏輯相悖」的題目擺在一起練，逼自己說清「差在哪裡」——這是拆解混淆、建立直覺最快的方式。' +
    '與『錯題複習』分工：這裡由系統自動組弱科題組；你手選特定錯題重練請去錯題複習。'));

  var weakest = weakestSubject();
  if (weakest) {
    var s = subjectStats(true)[weakest];
    box.appendChild(el('div', { 'class': 'diag-result-line' },
      '目前最弱：' + weakest + '（近期正確率 ' + pct(s.ok / Math.max(s.n, 1)) + '，作答 ' + s.n + ' 題）。'));
  } else {
    box.appendChild(el('p', { 'class': 'subtitle' }, '尚無足夠作答資料判斷最弱科，可先做一輪「單題練習」或入學診斷；以下可手動選科。'));
  }

  /* SRS 到期複習集中在這裡:顯示全科到期題數,鎖科開始時優先帶入該科到期題 */
  if (typeof dueCards === 'function') {
    var dueTotal = dueCards().length;
    if (dueTotal > 0) {
      box.appendChild(el('p', { 'class': 'subtitle' },
        '間隔重複到期 ' + dueTotal + ' 題（全科）。鎖定科目開始時，會把該科到期題優先帶入複習 —— 記憶留存的機制集中在這裡。'));
    }
  }

  var row = el('div', { 'class': 'field-row' });
  row.appendChild(el('label', { 'for': 'cluster-subj' }, '鎖定科目：'));
  var sel = el('select', { id: 'cluster-subj' });
  SUBJECTS.forEach(function (s) { sel.appendChild(el('option', { value: s }, s)); });
  if (weakest) { sel.value = weakest; }
  row.appendChild(sel);
  box.appendChild(row);

  var hasRel = !!relations;
  if (!hasRel) {
    box.appendChild(el('p', { 'class': 'honest' },
      '目前未載入關聯資料，無法挑「易混淆」題；改為同科弱項連續操練（誠實標示）。'));
  }
  var start = el('button', { type: 'button' }, '生成題組並開始');
  start.addEventListener('click', function () { launchCluster(sel.value); });
  var p = el('p'); p.appendChild(start); box.appendChild(p);
}
/* 在某科內挑種子題:優先「答錯過且尚未掌握」→「未掌握」→「未練過」→ 任一題。
   excludeSet(可選,qid→true):各 tier 篩掉已用過的種子(「再來一組」換種子用,見 launchCluster)。 */
function pickSeed(subject, excludeSet) {
  var inSub = usable.filter(function (q) { return q.subject === subject; });
  if (inSub.length === 0) { return null; }
  var wrong = {}; state.log.forEach(function (e) { if (!e.correct) { wrong[e.qid] = true; } });
  function unmastered(q) { return !state.srs[q.qid] || state.srs[q.qid].reps < masterRepsFor(); }
  var tiers = [
    inSub.filter(function (q) { return wrong[q.qid] && unmastered(q); }),
    inSub.filter(function (q) { return unmastered(q) && state.srs[q.qid]; }),
    inSub.filter(function (q) { return !state.srs[q.qid]; }),
    inSub
  ];
  if (excludeSet) {
    tiers = tiers.map(function (t) { return t.filter(function (q) { return !excludeSet[q.qid]; }); });
  }
  for (var i = 0; i < tiers.length; i++) {
    if (tiers[i].length > 0) { return tiers[i][Math.floor(Math.random() * tiers[i].length)]; }
  }
  return null;
}
function launchCluster(subject) {
  var seed = pickSeed(subject, clusterSeedUsed);
  if (!seed) { clusterSeedUsed = {}; seed = pickSeed(subject); }   /* 種子全排除光了(每題都當過種子)→ 清空重來 */
  if (!seed) { alert('此科沒有可用題目。'); return; }
  clusterSeedUsed[seed.qid] = true;   /* 記下本次種子,「再來一組」時 pickSeed 據此排除 */
  var items = [];
  var used = {};
  /* SRS 到期複習併入弱點殲滅(記憶留存機制集中於此,不再散在單題練習):先排該科到期題,最多 6 題 */
  var dueAdded = 0;
  if (typeof dueCards === 'function') {
    dueCards().forEach(function (qid) {
      if (dueAdded >= 6) { return; }
      var dq = byQid[qid];
      if (dq && dq.subject === subject && !used[qid]) {
        used[qid] = true; dueAdded += 1;
        items.push({ q: dq, reasonTag: '到期複習', reason: '間隔重複到期：趁快遺忘前重新提取，記憶鞏固效果最好。' });
      }
    });
  }
  used[seed.qid] = true;
  items.push({ q: seed, reasonTag: '種子題',
    reason: '「' + subject + '」是你目前較弱的科；以此題為基準，接下來幾題會和它「相似」或「相悖」，一起對照練。' });
  var rel = relations ? relations[seed.qid] : null;
  var addedRel = 0;
  function add(list, cap, tag, why) {
    (list || []).slice(0, cap).forEach(function (x) {
      var qid = x && x.qid ? x.qid : x;
      if (qid && !used[qid] && byQid[qid]) {
        used[qid] = true; addedRel += 1;
        items.push({ q: byQid[qid], reasonTag: tag, reason: why });
      }
    });
  }
  if (rel) {
    add(rel.similar, CLUSTER_SIMILAR, '概念相似', '和種子題考同一個概念 —— 想清楚它們的「考點」差在哪，別被相似感騙了。');
    add(rel.opposite, CLUSTER_OPPOSITE, '邏輯相悖', '同概念但問法相反（例：何者正確 ↔ 何者錯誤）—— 最常見的陷阱就在這裡，逐項說清正反。');
  }
  if (addedRel === 0) {
    /* 無關聯(或關聯為空)→ 退化:同科未掌握題連續操練 */
    var inSub = usable.filter(function (q) {
      return q.subject === subject && !used[q.qid] &&
        (!state.srs[q.qid] || state.srs[q.qid].reps < masterRepsFor());
    });
    shuffle(inSub).slice(0, CLUSTER_SIMILAR + CLUSTER_OPPOSITE).forEach(function (q) {
      used[q.qid] = true;
      items.push({ q: q, reasonTag: '同科操練', reason: '同科未掌握題（無關聯資料時的退化策略，誠實標示）。' });
    });
  }
  startDrill(items, {
    title: '弱點殲滅・' + subject,
    subtitle: '本組 ' + items.length + ' 題' + (dueAdded > 0 ? '（含 ' + dueAdded + ' 題到期複習）' : '') +
      '。逐題作答、即時回饋，專心拆解混淆與到期複習。',
    mode: 'cluster', backTo: 'cluster',
    onDone: function () { offerClusterAgain(subject); }
  });
}
/* 本組完成後,面板尾端補一顆「再來一組」鈕:換種子重新生成題組(pickSeed 帶 clusterSeedUsed 排除已用種子)。 */
function offerClusterAgain(subject) {
  var panel = $('panel-run');
  var again = el('button', { type: 'button' }, '再來一組（換種子）');
  again.addEventListener('click', function () { launchCluster(subject); });
  var p = el('p'); p.appendChild(again); panel.appendChild(p);
}
