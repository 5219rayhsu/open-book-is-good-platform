'use strict';
/* ============================================================
   命名功能 —— 首次進來問名字、可隨時改名。
   名字顯示在頁面右上角名牌,只存這台裝置的 localStorage(不上傳),純粹讓畫面有個人感。
   nameForFile() 把名字做成檔名片段,保留供未來雲端同步／匯出功能使用(線上站目前未接 UI)。

   依賴 app.js: state / patchSettings / $ / el / todayStr;
   diagnostic.js: maybeStartDiagnostic(首次取名後才接著跳診斷)。
   ============================================================ */

/* 檔名安全化:濾掉檔名不合法字元,長度上限 24(不用 regex 字面值,改字元過濾) */
function _safeName(s) {
  s = String(s || '').trim();
  var bad = '/\\:*?"<>|.\t\n\r';
  var out = '';
  for (var i = 0; i < s.length && out.length < 24; i++) {
    if (bad.indexOf(s.charAt(i)) < 0) { out += s.charAt(i); }
  }
  return out;
}

/* masthead 名牌:有名字 → 「學習者:X 〔改名〕」;沒名字 → 〔設定名字〕 */
function renderNameTag() {
  var nm = (state.settings && state.settings.userName) || '';
  var box = $('name-tag');
  if (box) { box.textContent = nm ? ('學習者：' + nm) : ''; }
  var btn = $('btn-name');   /* 設定/改名按鈕在 io-row(與其他按鈕同尺寸) */
  if (btn) { btn.textContent = nm ? '改名' : '設定名字'; }
}

function _nameClose() {
  var ov = $('name-overlay');
  if (ov) { ov.hidden = true; ov.textContent = ''; }
}

/* isRename=false:首次流程(完成後接著跳入學診斷);true:主動改名(不跳診斷) */
function showNameOverlay(isRename) {
  var ov = $('name-overlay');
  if (!ov) { ov = el('div', { id: 'name-overlay' }); document.body.appendChild(ov); }
  ov.textContent = ''; ov.hidden = false;
  var box = el('div', { 'class': 'name-sheet' });
  box.appendChild(el('h2', null, isRename ? '改個名字' : '歡迎！先取個名字'));
  box.appendChild(el('p', { 'class': 'subtitle' },
    '取個名字或暱稱，會顯示在頁面右上角 —— 純粹是讓畫面有個人感。' +
    '名字只存在你這台裝置（localStorage），可隨時改。'));
  var input = el('input', { type: 'text', id: 'name-input', maxlength: '24', placeholder: '例如：諸葛孔明 / Ray' });
  if (state.settings && state.settings.userName) { input.value = state.settings.userName; }
  box.appendChild(input);

  function save() {
    patchSettings({ userName: _safeName(input.value), namePromptedAt: todayStr() });
    renderNameTag();
    _nameClose();
    if (!isRename && typeof maybeStartDiagnostic === 'function') { maybeStartDiagnostic(); }
  }
  function skip() {
    if (!isRename) { patchSettings({ namePromptedAt: todayStr() }); }
    _nameClose();
    if (!isRename && typeof maybeStartDiagnostic === 'function') { maybeStartDiagnostic(); }
  }

  var row = el('p');
  var ok = el('button', { type: 'button' }, '確定');
  ok.addEventListener('click', save);
  var sk = el('button', { type: 'button', 'class': 'btn-quiet' }, isRename ? '取消' : '略過');
  sk.addEventListener('click', skip);
  row.appendChild(ok); row.appendChild(document.createTextNode(' ')); row.appendChild(sk);
  box.appendChild(row);
  ov.appendChild(box);
  input.focus();
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { save(); } });
}

/* 首次(無名字且沒問過)→ 問名字;否則直接進入學診斷流程 */
function maybeAskName() {
  if (state.settings && !state.settings.userName && !state.settings.namePromptedAt) {
    showNameOverlay(false);
  } else if (typeof maybeStartDiagnostic === 'function') {
    maybeStartDiagnostic();
  }
}

/* 給 progress.js 用:把名字做成檔名片段(有名字才加底線前綴) */
function nameForFile() {
  var nm = state.settings && _safeName(state.settings.userName);
  return nm ? '_' + nm : '';
}
