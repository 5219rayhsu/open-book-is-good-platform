'use strict';
/* ============================================================
   設定覆蓋層 —— 字體大小／主題／顯示名稱的家（決定 11：先建容器再掛功能）。
   標頭「設定」按鈕開啟；右上「關閉」、點背景、Esc 皆可關。
   純 el()/textContent 建構、沿用 .help-sheet 霜面卡樣式（零新外殼 CSS）。
   偏好走「全站」localStorage（obig: 前綴，非各科 prefix）——UI chrome 跨科一致。
   字體與主題都是「掛 <html> 的 class」：font-size 等比縮放 / 主題 token 覆蓋。
   依賴 app.js 全域:el / $；naming.js 的 showNameOverlay（改名沿用、不重寫）。
   ============================================================ */

var FONT_KEY = 'obig:fontScale';               /* ''標準 | 'sm'小 | 'lg'大 */
var FONT_LEVELS = [
  { v: 'sm', label: '小', cls: 'fs-sm' },
  { v: '', label: '標準', cls: '' },
  { v: 'lg', label: '大', cls: 'fs-lg' }
];
var THEME_KEY = 'obig:theme';                  /* 'warm'暖紙 | 'light'白底(預設) */
var THEME_LEVELS = [
  { v: 'warm', label: '暖紙', cls: '' },
  { v: 'light', label: '白底', cls: 'theme-light' }
];

/* 共用:套用單選 class 偏好到 <html>（移除同組舊 class、加新、存檔）。回傳實際生效值。 */
function _applyChoice(levels, key, v) {
  var root = document.documentElement;
  levels.forEach(function (lv) { if (lv.cls) { root.classList.remove(lv.cls); } });
  var def = levels.filter(function (lv) { return !lv.cls; })[0] || levels[0];
  var hit = levels.filter(function (lv) { return lv.v === v; })[0] || def;
  if (hit.cls) { root.classList.add(hit.cls); }
  try { localStorage.setItem(key, hit.v); } catch (e) { /* 隱私模式/額滿:忽略 */ }
  return hit.v;
}

function applyFontScale(v) { return _applyChoice(FONT_LEVELS, FONT_KEY, v); }
function applyTheme(v) { return _applyChoice(THEME_LEVELS, THEME_KEY, v); }

/* 開機套用已存偏好（app.js 初始化呼叫）。讀失敗 = 預設。
   主題預設白底:未設定(null)或舊資料的空字串('')都視為「沒選過」→ 套白底;
   只有明確存過 'warm' 才顯示暖紙。 */
function initSettingsPrefs() {
  var f = '', t = null;
  try { f = localStorage.getItem(FONT_KEY) || ''; t = localStorage.getItem(THEME_KEY); } catch (e) { /* 預設 */ }
  applyFontScale(f);
  applyTheme(t ? t : 'light');
}

/* 一段「標題 + 控制列」設定區塊。 */
function _setSection(title, desc, controlNode) {
  var frag = document.createDocumentFragment();
  frag.appendChild(el('h3', null, title));
  if (desc) { frag.appendChild(el('p', { 'class': 'subtitle' }, desc)); }
  frag.appendChild(controlNode);
  return frag;
}

/* 一組單選按鈕（當前 aria-pressed=true）。點擊即套用 + 更新高亮。
   defaultVal:讀不到已存值(null/'')時要高亮哪個選項;省略則沿用該選項組自己的預設值('')。 */
function _choiceSection(title, desc, levels, key, applyFn, defaultVal) {
  var cur = null;
  try { cur = localStorage.getItem(key); } catch (e) { cur = null; }
  if (!cur) { cur = defaultVal || ''; }
  var row = el('div', { 'class': 'set-options', role: 'group', 'aria-label': title });
  levels.forEach(function (lv) {
    var b = el('button', { type: 'button', 'aria-pressed': lv.v === cur ? 'true' : 'false' }, lv.label);
    b.addEventListener('click', function () {
      applyFn(lv.v);
      var sibs = row.querySelectorAll('button');
      for (var i = 0; i < sibs.length; i++) { sibs[i].setAttribute('aria-pressed', 'false'); }
      b.setAttribute('aria-pressed', 'true');
    });
    row.appendChild(b);
  });
  return _setSection(title, desc, row);
}

/* 應考類科區塊(僅分組考試,如教師檢定,allCategoryNames() 非 null 時渲染):複選要報考的
   類科(未設定＝全勾＝全部類科)。「儲存並套用」寫入 state.settings.examCategories 後
   reload——SUBJECTS/ACTIVE_SUBJ_SET(app.js)在載入期算定一次,靠 reload 最簡單可靠。 */
function _examCategorySection() {
  var allCats = (typeof allCategoryNames === 'function') ? allCategoryNames() : null;
  if (!allCats) { return null; }   /* 非分組考試:不顯示此區塊 */
  var curSel = (state.settings.examCategories && state.settings.examCategories.length)
    ? state.settings.examCategories.slice() : allCats.slice();   /* 未設定＝全勾 */

  var wrap = el('div', { 'class': 'subj-checks' });
  var checks = [];
  allCats.forEach(function (c) {
    var lab = el('label', { 'class': 'chk chk-inline' });
    var cb = el('input', { type: 'checkbox', value: c });
    cb.checked = curSel.indexOf(c) >= 0;
    checks.push(cb);
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(' ' + ((typeof subjectGroupLabel === 'function') ? subjectGroupLabel(c) : c)));
    wrap.appendChild(lab);
  });

  var hint = el('p', { 'class': 'subtitle' }, '');
  var saveBtn = el('button', { type: 'button' }, '儲存並套用');
  saveBtn.addEventListener('click', function () {
    var picked = checks.filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; });
    if (picked.length === 0) { hint.textContent = '至少選一個類科。'; return; }
    var next = (picked.length === allCats.length) ? [] : picked;   /* 全選存空陣列(=全部類科) */
    patchSettings({ examCategories: next });
    location.reload();
  });

  var box = el('div', null);
  box.appendChild(wrap);
  box.appendChild(hint);
  box.appendChild(saveBtn);
  return _setSection('應考類科',
    '選擇你要報考的類科（可複選、至少一個）。設定後進度、雷達、出題、藍圖只看選定類科的科目；' +
    '歷史紀錄仍保留全部；儲存題與錯題本暫時只顯示選定類科，改回即復原。變更會重新整理頁面。', box);
}

/* 停考科目區塊(僅該考試 manifest 有 deprecatedSubjects 才顯示,如社工「社會工作管理」):
   二元開關「排除（預設）」／「納入練習」,寫入 state.settings.includeDeprecated 後 reload——
   computeActiveSubjects()(app.js)在載入期算定一次,靠 reload 最簡單可靠。 */
function _deprecatedSubjectsSection() {
  var names = (typeof deprecatedSubjectNames === 'function') ? deprecatedSubjectNames() : [];
  if (!names.length) { return null; }   /* 該考試無停考科目:不顯示此區塊 */

  var listTxt = names.map(function (n) {
    var note = (typeof subjectDeprecationNote === 'function') ? subjectDeprecationNote(n) : null;
    return '「' + n + '」' + (note ? '（' + note + '）' : '');
  }).join('、');

  var cur = !!(state.settings && state.settings.includeDeprecated);
  var opts = [
    { v: false, label: '排除（預設）' },
    { v: true, label: '納入練習' }
  ];
  var row = el('div', { 'class': 'set-options', role: 'group', 'aria-label': '停考科目' });
  opts.forEach(function (o) {
    var b = el('button', { type: 'button', 'aria-pressed': (o.v === cur) ? 'true' : 'false' }, o.label);
    b.addEventListener('click', function () {
      if (o.v === cur) { return; }   /* 點擊未變不動作 */
      patchSettings({ includeDeprecated: o.v });
      location.reload();
    });
    row.appendChild(b);
  });

  var desc = listTxt + ' 預設不出現在單題練習、弱點殲滅、診斷、雷達、藍圖、模擬考、歷屆原卷與各項統計。' +
    '想複習歷屆或把它練回來，切到「納入練習」即可 —— 錯題本、儲存題裡的相關紀錄也會一併復原。變更會重新整理頁面。';
  return _setSection('停考科目', desc, row);
}

function renderSettings() {
  var ov = $('settings-overlay');
  ov.textContent = '';
  var sheet = el('div', { 'class': 'help-sheet' });

  var head = el('div', { 'class': 'help-head' });
  head.appendChild(el('h2', null, '設定'));
  var x = el('button', { type: 'button', 'class': 'help-close btn-quiet' }, '關閉');
  x.addEventListener('click', closeSettings);
  head.appendChild(x);
  sheet.appendChild(head);

  sheet.appendChild(_choiceSection('字體大小',
    '調整全站文字大小，偏好會記住（存在這台瀏覽器）。',
    FONT_LEVELS, FONT_KEY, applyFontScale));

  sheet.appendChild(_choiceSection('主題',
    '白底＝預設高對比純白；暖紙＝護眼米色。偏好會記住。',
    THEME_LEVELS, THEME_KEY, applyTheme, 'light'));

  /* 應考類科(僅分組考試,如教師檢定,才顯示):篩選進度/雷達/出題/藍圖/模擬選科的科目範圍。 */
  var catSection = _examCategorySection();
  if (catSection) { sheet.appendChild(catSection); }

  /* 停考科目(僅該考試 manifest 有 deprecatedSubjects 才顯示;社工無類科區,此區自成一段)。 */
  var depSection = _deprecatedSubjectsSection();
  if (depSection) { sheet.appendChild(depSection); }

  /* 顯示名稱：沿用既有命名覆蓋層（不重寫改名邏輯）。 */
  var nameBtn = el('button', { type: 'button', 'class': 'btn-quiet' }, '設定顯示名稱');
  nameBtn.addEventListener('click', function () {
    closeSettings();
    if (typeof showNameOverlay === 'function') { showNameOverlay(true); }
  });
  sheet.appendChild(_setSection('顯示名稱', '設定首頁顯示的稱呼；只存在本機。', nameBtn));

  /* 重置進度：破壞性動作，移入設定（不再放標頭）。沿用 progress.js 的三段確認。
     這裡只清「目前這科」；下面「全部裝置」區塊才是跨科動作。 */
  var resetBtn = el('button', { type: 'button', 'class': 'btn-quiet btn-danger' }, '重置本機進度（目前這科）');
  resetBtn.addEventListener('click', function () {
    closeSettings();
    if (typeof resetProgress === 'function') { resetProgress(); }
  });
  sheet.appendChild(_setSection('重置進度', '清除這台瀏覽器上「目前這科」的作答紀錄（無法復原，會三段確認）。', resetBtn));

  /* 全部裝置(全科)備份／清除：req 6 所有權需求。三顆鈕並列，文案風格與上方一致。 */
  var allRow = el('div', { 'class': 'set-options' });
  var expAllBtn = el('button', { type: 'button', 'class': 'btn-quiet' }, '匯出全部進度');
  expAllBtn.addEventListener('click', function () {
    if (typeof exportAllProgress === 'function') { exportAllProgress(); }
  });
  var impAllBtn = el('button', { type: 'button', 'class': 'btn-quiet' }, '匯入全部進度');
  impAllBtn.addEventListener('click', function () {
    if (typeof _triggerImportAll === 'function') { _triggerImportAll(); }
  });
  var wipeBtn = el('button', { type: 'button', 'class': 'btn-quiet btn-danger' }, '清除所有資料');
  wipeBtn.addEventListener('click', function () {
    closeSettings();
    if (typeof wipeAllData === 'function') { wipeAllData(); }
  });
  allRow.appendChild(expAllBtn); allRow.appendChild(impAllBtn); allRow.appendChild(wipeBtn);
  sheet.appendChild(_setSection('全部裝置（所有科目）',
    '匯出／匯入會包含你在這台瀏覽器上練習過的「所有科目」與全站設定（字體、主題），不含題庫本身；' +
    '「清除所有資料」等同本機階段的刪除帳號，會清空所有科目，無法復原（三段確認）。全程不觸網、不上傳。',
    allRow));

  ov.appendChild(sheet);
}

function _settingsKeydown(e) { if (e.key === 'Escape') { closeSettings(); } }
function _settingsBackdrop(e) { if (e.target === $('settings-overlay')) { closeSettings(); } }

function openSettings() {
  renderSettings();
  var ov = $('settings-overlay');
  ov.hidden = false;
  document.addEventListener('keydown', _settingsKeydown);
  ov.addEventListener('click', _settingsBackdrop);
  var first = ov.querySelector('.help-close');
  if (first) { first.focus(); }
}

function closeSettings() {
  var ov = $('settings-overlay');
  ov.hidden = true;
  document.removeEventListener('keydown', _settingsKeydown);
  ov.removeEventListener('click', _settingsBackdrop);
  var btn = $('btn-settings');
  if (btn) { btn.focus(); }
}
