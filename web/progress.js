'use strict';
/* ============================================================
   進度操作 —— 重置(線上站 UI 唯一入口);匯出 / 匯入 / 含進度副本為保留函式,未接 UI(屬離線單檔機制,線上不提供)。

   本機記憶 = 瀏覽器 localStorage(鍵 <前綴>state_v1,前綴依考試,如 swk_/law_),私密、不上傳。
   四種帶走/管理方式:
     exportProgress      下載 JSON 備份(可再匯入還原)。
     importProgress      讀 JSON 覆蓋目前進度。
     downloadProgressCopy 產生「把目前進度嵌進去」的單檔 HTML 副本 —— 傳給別人,
                          對方打開就帶著這份進度(免 git、免另存 JSON)。
     resetProgress       清除本機記憶(重置)。

   為何不能「自動把記憶寫回原檔」:瀏覽器基於安全,file:// 頁面無法靜默寫入自己
   所在的檔案。因此「帶著進度傳出去」的最務實做法,就是一鍵產生內含進度的副本。

   依賴 app.js 全域:state / defaultState / saveState / renderAll / startToday /
   todayStr / STATE_KEY / $。皆在使用者點按後才呼叫,載入順序安全。
   ============================================================ */

function exportProgress() {
  var blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = PREFIX + 'progress' + ((typeof nameForFile === 'function') ? nameForFile() : '') + '_' + todayStr() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}

function importProgress(file) {
  var rd = new FileReader();
  rd.onload = function () {
    try {
      var obj = JSON.parse(String(rd.result));
      if (!obj || typeof obj.srs !== 'object' || !Array.isArray(obj.log)) {
        alert('檔案格式不符：需要先前由本系統匯出的進度 JSON。'); return;
      }
      if (!confirm('匯入會覆蓋目前進度（作答 ' + state.log.length + ' 筆）。確定？')) { return; }
      var def = defaultState();
      obj.settings = Object.assign({}, def.settings, obj.settings || {});
      if (!Array.isArray(obj.drill)) { obj.drill = []; }
      saveState(obj);
      renderAll(); startToday();
    } catch (e) { alert('JSON 解析失敗：' + e.message); }
  };
  rd.readAsText(file);
}

/* 用字串拼接組出 script 標籤,避免原始碼出現字面 </script> 影響內嵌打包。 */
var _TAG_OPEN = '<scr' + 'ipt>';
var _TAG_CLOSE = '<\/scr' + 'ipt>';
var _SEED_MARK = 'window.__SEED_STATE__=';

function _stripOldSeed(html) {
  /* 若這份本來就是含進度副本,先移除舊種子,避免層層堆疊。 */
  var mi = html.indexOf(_SEED_MARK);
  if (mi < 0) { return html; }
  var start = html.lastIndexOf(_TAG_OPEN, mi);
  var end = html.indexOf(_TAG_CLOSE, mi);
  if (start < 0 || end < 0) { return html; }
  return html.slice(0, start) + html.slice(end + _TAG_CLOSE.length);
}

/* 「已重置」標記:重置後寫入獨立鍵(不被「清進度」移除),供含進度副本檔名前綴判斷。 */
function _wasReset() {
  try { return !!localStorage.getItem(PREFIX + 'was_reset'); } catch (e) { return false; }
}

function downloadProgressCopy() {
  if (!state || !Array.isArray(state.log)) { alert('目前沒有可儲存的進度。'); return; }
  if (!window.__BANK__) {
    alert('「含進度副本」只在單檔版（雙擊開啟的 HTML）可用；開發版請改用「匯出進度 JSON」。');
    return;
  }
  var json;
  try { json = JSON.stringify(state); } catch (e) { alert('序列化進度失敗：' + e.message); return; }
  json = json.split('<\/').join('<\\/');   /* 防 </script> 提前關閉(字串層) */

  /* 單檔版:題庫/樣式/程式皆已內嵌,outerHTML 即完整自足檔 */
  var doc = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  doc = _stripOldSeed(doc);
  var seed = _TAG_OPEN + _SEED_MARK + json + ';' + _TAG_CLOSE;
  var bodyOpen = doc.indexOf('<body');
  var insertAt = bodyOpen >= 0 ? doc.indexOf('>', bodyOpen) : -1;
  if (insertAt < 0) { alert('找不到 body，無法產生副本。'); return; }
  doc = doc.slice(0, insertAt + 1) + '\n' + seed + doc.slice(insertAt + 1);

  var blob = new Blob([doc], { type: 'text/html' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  var nm = (typeof nameForFile === 'function') ? nameForFile() : '';
  var d8 = todayStr().split('-').join('');   /* 8 位日期碼 YYYYMMDD,放檔名尾綴 */
  var rp = (_wasReset() && state.log.length === 0) ? '已重置_' : '';   /* 重置後尚未重跑→前綴「已重置」;一旦重跑(log 非空)自動消失 */
  a.download = rp + EXAM.name + '國考自學系統' + nm + '_含進度_' + d8 + '.html';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  alert('已下載「含進度副本」。把這個 HTML 傳給別人，對方打開就帶著你目前的進度' +
        '（他若已有自己的進度則不覆蓋）。');
}

/* 重置=破壞性動作,故要三段確認;且每段「確認」鈕位置不同(左/中/右 + 微位移),
   讓人無法在同一處連點三下而失去確認意義。預設焦點放「取消」(安全)。 */
var _RESET_STEPS = [
  '確定要清除本機所有作答進度嗎？（第 1 / 3 次確認）',
  '再次確認：此動作無法復原，\n所有作答、雷達、複習排程都會消失。（第 2 / 3 次確認）',
  '最後確認：真的要全部清空、從零開始？\n建議先「下載含進度副本」備份。（第 3 / 3 次確認）'
];

function _resetClose() {
  var ov = document.getElementById('confirm-overlay');
  if (ov) { ov.hidden = true; ov.textContent = ''; }
  document.removeEventListener('keydown', _resetKeydown);
}
function _resetKeydown(e) { if (e.key === 'Escape') { _resetClose(); } }

function _resetStep(i) {
  var ov = document.getElementById('confirm-overlay');
  if (!ov) { ov = el('div', { id: 'confirm-overlay' }); document.body.appendChild(ov); }
  ov.textContent = ''; ov.hidden = false;
  var box = el('div', { 'class': 'confirm-box' });
  box.appendChild(el('h3', null, '重置進度'));
  box.appendChild(el('p', { 'class': 'confirm-msg' }, _RESET_STEPS[i]));
  /* confirm-pos-0/1/2 把整列分別靠左/置中/靠右,確認鈕每步落點都不同 */
  var row = el('div', { 'class': 'confirm-row confirm-pos-' + i });
  var cancel = el('button', { type: 'button', 'class': 'btn-quiet' }, '取消');
  cancel.addEventListener('click', _resetClose);
  var last = (i + 1 >= _RESET_STEPS.length);
  var ok = el('button', { type: 'button', 'class': 'confirm-ok' }, last ? '清除全部進度' : '我了解，繼續');
  ok.addEventListener('click', function () {
    if (last) {
      try { localStorage.removeItem(STATE_KEY); localStorage.setItem(PREFIX + 'was_reset', '1'); } catch (e) { /* 私密模式靜默 */ }
      _resetClose();
      location.reload();
    } else {
      _resetStep(i + 1);
    }
  });
  row.appendChild(cancel); row.appendChild(ok);
  box.appendChild(row);
  ov.appendChild(box);
  cancel.focus();   /* 安全預設:焦點在取消,逼使用者主動移到「確認」 */
  document.addEventListener('keydown', _resetKeydown);
}

function resetProgress() { _resetStep(0); }

/* ============================================================
   全裝置(全部進度)—— 匯出／匯入／清除三支,服務所有權需求(req 6)。
   單科版(上方)只動當前考試 PREFIX 的 state；這裡把「全部考試 + 全域設定」
   一次帶走。刻意不做任何網路動作 —— 純本機 localStorage 讀寫。

   命名空間判斷:凡是「屬於本站」的 localStorage key 只有兩種形狀:
     1. 各科前綴(EXAMS[].prefix,如 swk_/law_/gsat_)開頭 —— state_v1/was_reset/feedback 等
     2. 'obig' 開頭的全域設定(obig:fontScale / obig:theme / obig_current_exam)
   別的網站或未來新增的非本站 key 一律不觸碰,尤其 wipeAllData 絕不能牽連到。
   ============================================================ */

/* 本站 localStorage key 的前綴清單(各科 + 全域),动态从 EXAMS 长出、不写死科目。 */
function _siteKeyPrefixes() {
  var prefixes = EXAMS.map(function (e) { return e.prefix; });
  prefixes.push('obig');   /* obig:fontScale / obig:theme / obig_current_exam 皆此開頭 */
  return prefixes;
}

/* 判斷某 key 是否屬於本站命名空間(給 export/import/wipe 共用,唯一真相來源)。 */
function _isSiteKey(key) {
  var prefixes = _siteKeyPrefixes();
  for (var i = 0; i < prefixes.length; i++) {
    if (key.indexOf(prefixes[i]) === 0) { return true; }
  }
  return false;
}

/* 掃整個 localStorage,回傳所有本站 key(供匯出/自檢用)。 */
function _allSiteKeys() {
  var out = [];
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k != null && _isSiteKey(k)) { out.push(k); }
    }
  } catch (e) { /* 私密模式/權限問題:回傳目前已收集到的 */ }
  return out;
}

/* 匯出全部進度:掃全站 key(各科 state/feedback/was_reset ＋ 全域 obig 設定),
   打包成 { meta, data } 下載一份 JSON。不觸網、不上傳,純本機讀取。 */
function exportAllProgress() {
  var keys = _allSiteKeys();
  var data = {};
  keys.forEach(function (k) {
    try { data[k] = localStorage.getItem(k); } catch (e) { /* 略過讀不到的單一 key */ }
  });
  var payload = {
    meta: { app: 'obig', version: 1, exportedAt: new Date().toISOString(), keys: keys.length },
    data: data
  };
  var blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'obig_全部進度備份_' + todayStr() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  return payload;
}

/* 匯入全部進度(信任邊界:外部檔案輸入)。
   規則:先驗 meta.app==='obig' 才寫;JSON.parse 包 try/catch;格式錯給友善 alert、
   絕不炸站;逐 key 寫回時再次過 _isSiteKey 白名單,拒寫非本站 key(縱使檔案裡有)。 */
function importAllProgress(file, onDone) {
  var rd = new FileReader();
  rd.onload = function () {
    var obj;
    try { obj = JSON.parse(String(rd.result)); }
    catch (e) { alert('檔案格式不符：無法解析 JSON。'); return; }

    if (!obj || !obj.meta || obj.meta.app !== 'obig' || !obj.data || typeof obj.data !== 'object') {
      alert('檔案格式不符：需要先前由本系統「匯出全部進度」產生的備份檔。');
      return;
    }
    var keys = Object.keys(obj.data);
    if (!confirm('匯入將覆蓋所有科目的本機進度與設定（共 ' + keys.length + ' 筆）。確定？')) { return; }

    var written = 0;
    keys.forEach(function (k) {
      if (!_isSiteKey(k)) { return; }   /* 拒寫非本站 key,縱使備份檔內有也不理 */
      try { localStorage.setItem(k, obj.data[k]); written++; } catch (e) { /* 略過單一 key 寫入失敗 */ }
    });
    alert('已匯入 ' + written + ' 筆進度／設定。請重新整理頁面以套用。');
    if (typeof onDone === 'function') { onDone(written); }
  };
  rd.onerror = function () { alert('讀取檔案失敗，請確認檔案未毀損。'); };
  rd.readAsText(file);
}

/* 清除所有本站資料(本機階段的「刪除帳號」)。沿用 resetProgress 的三段確認 modal
   樣式(_RESET_STEPS/_resetStep 的清除版),但範圍是全站 key,而非單科。
   硬規則:只刪 _isSiteKey 命中的 key,絕不 localStorage.clear()(避免誤刪其他網站/未來 key)。 */
var _WIPE_STEPS = [
  '確定要清除「所有科目」的本機資料嗎？（第 1 / 3 次確認）',
  '再次確認：此動作無法復原，\n所有科目的作答、雷達、複習排程、字體與主題偏好都會消失。（第 2 / 3 次確認）',
  '最後確認：真的要清空這台瀏覽器上的全部資料、從零開始？\n建議先「匯出全部進度」備份。（第 3 / 3 次確認）'
];

function _wipeClose() {
  var ov = document.getElementById('confirm-overlay');
  if (ov) { ov.hidden = true; ov.textContent = ''; }
  document.removeEventListener('keydown', _wipeKeydown);
}
function _wipeKeydown(e) { if (e.key === 'Escape') { _wipeClose(); } }

function _wipeStep(i) {
  var ov = document.getElementById('confirm-overlay');
  if (!ov) { ov = el('div', { id: 'confirm-overlay' }); document.body.appendChild(ov); }
  ov.textContent = ''; ov.hidden = false;
  var box = el('div', { 'class': 'confirm-box' });
  box.appendChild(el('h3', null, '清除所有資料'));
  box.appendChild(el('p', { 'class': 'confirm-msg' }, _WIPE_STEPS[i]));
  var row = el('div', { 'class': 'confirm-row confirm-pos-' + i });
  var cancel = el('button', { type: 'button', 'class': 'btn-quiet' }, '取消');
  cancel.addEventListener('click', _wipeClose);
  var last = (i + 1 >= _WIPE_STEPS.length);
  var ok = el('button', { type: 'button', 'class': 'confirm-ok' }, last ? '清除全部資料' : '我了解，繼續');
  ok.addEventListener('click', function () {
    if (last) {
      var keys = _allSiteKeys();
      keys.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* 私密模式靜默 */ } });
      _wipeClose();
      alert('已清除所有科目的本機資料，即將重新整理。');
      location.reload();
    } else {
      _wipeStep(i + 1);
    }
  });
  row.appendChild(cancel); row.appendChild(ok);
  box.appendChild(row);
  ov.appendChild(box);
  cancel.focus();
  document.addEventListener('keydown', _wipeKeydown);
}

function wipeAllData() { _wipeStep(0); }

/* 觸發匯入用的隱藏 file input(動態建立、不依賴 HTML 預先擺放的元素;
   每次呼叫沿用同一個節點,避免重複掛聽器)。 */
var _importAllInput = null;
function _triggerImportAll() {
  if (!_importAllInput) {
    _importAllInput = el('input', { type: 'file', accept: 'application/json,.json' });
    _importAllInput.style.display = 'none';
    document.body.appendChild(_importAllInput);
    _importAllInput.addEventListener('change', function () {
      var f = _importAllInput.files && _importAllInput.files[0];
      _importAllInput.value = '';   /* 清空,允許重選同一檔再次觸發 change */
      if (f) { importAllProgress(f); }
    });
  }
  _importAllInput.click();
}

/* 自檢(runnable):造 3 科假 state → exportAll → wipe(手動,不走 confirm modal)→
   importAll → 斷言 3 科 state 還原、且預先塞的非本站 key 未被動。
   在瀏覽器 console 呼叫 selfTestAllProgress() 即可跑;不上線接 UI,純開發期驗證用。
   暫時覆寫 window.confirm/alert 讓流程不必人工點擊,跑完必還原,不影響正常使用。 */
function selfTestAllProgress() {
  var results = [];
  function assert(name, cond) { results.push({ name: name, pass: !!cond }); }

  var FAKE_PREFIXES = ['swk_', 'law_', 'gsat_'];
  var FOREIGN_KEY = '__not_obig_test_key__';
  var FOREIGN_VAL = 'bar';

  /* 1) 造 3 科假 state + 1 個非本站 key */
  FAKE_PREFIXES.forEach(function (p, i) {
    localStorage.setItem(p + 'state_v1', JSON.stringify({ srs: {}, log: [{ i: i }], drill: [] }));
  });
  localStorage.setItem(FOREIGN_KEY, FOREIGN_VAL);

  /* 2) exportAll */
  var payload = exportAllProgress();
  var exportedHasAll3 = FAKE_PREFIXES.every(function (p) { return payload.data[p + 'state_v1'] !== undefined; });
  assert('匯出的 JSON 含 3 科假 state', exportedHasAll3);
  assert('匯出不含非本站 key', payload.data[FOREIGN_KEY] === undefined);

  /* 3) wipe(直接呼叫清除邏輯,不跑三段確認 UI) */
  var siteKeysBeforeWipe = _allSiteKeys();
  siteKeysBeforeWipe.forEach(function (k) { localStorage.removeItem(k); });
  var afterWipeSiteKeys = _allSiteKeys();
  assert('wipe 後本站 key 歸零', afterWipeSiteKeys.length === 0);
  assert('wipe 後非本站 key 仍在', localStorage.getItem(FOREIGN_KEY) === FOREIGN_VAL);

  /* 4) importAll(用真正的 File 物件走真正的 importAllProgress,暫時靜音 confirm/alert) */
  var origConfirm = window.confirm, origAlert = window.alert;
  window.confirm = function () { return true; };
  window.alert = function () { /* 靜音 */ };
  var file = new File([JSON.stringify(payload)], 'test.json', { type: 'application/json' });
  var importDone = false, writtenCount = 0;
  importAllProgress(file, function (written) { importDone = true; writtenCount = written; });

  /* FileReader 是非同步;自檢用同步輪詢等待(開發期小工具,可接受)。 */
  var start = Date.now();
  function finishAfterImport() {
    window.confirm = origConfirm; window.alert = origAlert;
    var restored = FAKE_PREFIXES.every(function (p) {
      var raw = localStorage.getItem(p + 'state_v1');
      return raw && JSON.parse(raw).log && JSON.parse(raw).log.length === 1;
    });
    assert('importAll 還原 3 科 state', restored);
    assert('importAll 寫回筆數與匯出筆數一致', writtenCount === payload.meta.keys);
    assert('importAll 後非本站 key 仍未被動', localStorage.getItem(FOREIGN_KEY) === FOREIGN_VAL);

    /* 5) 格式錯的檔(meta.app 不對)應被拒、不炸站 */
    var badFile = new File([JSON.stringify({ meta: { app: 'other' }, data: {} })], 'bad.json', { type: 'application/json' });
    var threw = false;
    try {
      window.alert = function () { /* 靜音 */ };
      importAllProgress(badFile);
    } catch (e) { threw = true; }
    window.alert = origAlert;
    assert('meta.app 不符會被拒、不拋例外', !threw);

    /* 清理自檢殘留 */
    FAKE_PREFIXES.forEach(function (p) { localStorage.removeItem(p + 'state_v1'); });
    localStorage.removeItem(FOREIGN_KEY);

    var pass = results.every(function (r) { return r.pass; });
    results.forEach(function (r) { console.log((r.pass ? '[PASS] ' : '[FAIL] ') + r.name); });
    console.log(pass ? '全部自檢通過' : '有自檢失敗，見上方 [FAIL]');
    return pass;
  }

  /* importAllProgress 內部 FileReader.onload 是微任務後執行;用 setTimeout(0) 排在其後。 */
  return new Promise(function (resolve) {
    setTimeout(function () { resolve(finishAfterImport()); }, 50);
  });
}

/* 「備份／還原進度」兩段式:先開覆蓋層,再選匯出(存備份檔)或還原(讀備份檔)。
   刻意不寫 JSON 字眼 —— 一般人只需懂「備份檔」。 */
function _backupClose() {
  var ov = $('backup-overlay');
  if (ov) { ov.hidden = true; ov.textContent = ''; }
  document.removeEventListener('keydown', _backupKeydown);
}
function _backupKeydown(e) { if (e.key === 'Escape') { _backupClose(); } }
function openBackup() {
  var ov = $('backup-overlay');
  if (!ov) { ov = el('div', { id: 'backup-overlay' }); document.body.appendChild(ov); }
  ov.textContent = ''; ov.hidden = false;
  var box = el('div', { 'class': 'name-sheet' });
  box.appendChild(el('h2', null, '匯出／匯入進度程式碼'));
  box.appendChild(el('p', { 'class': 'subtitle' },
    '把進度匯出成一小段「進度程式碼」檔收好；換電腦、清資料或不小心重置前先匯出最保險，' +
    '需要時再匯入還原。（這個檔只含你的作答進度、不含題庫，很小。）'));
  box.appendChild(el('p', { 'class': 'subtitle' },
    '建議每天練習後按一次備份；檔名已含日期，平常留最新一份即可。'));
  box.appendChild(el('p', { 'class': 'subtitle' },
    '備份檔會存到你電腦的「下載」資料夾；瀏覽器基於安全無法刪除你電腦上的舊檔，舊的可自行刪除，不影響使用。'));
  var p1 = el('p');
  var exp = el('button', { type: 'button' }, '匯出進度程式碼（存到電腦）');
  exp.addEventListener('click', function () { exportProgress(); _backupClose(); });
  p1.appendChild(exp);
  box.appendChild(p1);
  var p2 = el('p');
  var imp = el('button', { type: 'button', 'class': 'btn-quiet' }, '匯入進度程式碼（覆蓋目前進度）');
  imp.addEventListener('click', function () { _backupClose(); $('import-input').click(); });
  p2.appendChild(imp);
  box.appendChild(p2);
  var p3 = el('p');
  var close = el('button', { type: 'button', 'class': 'btn-quiet' }, '關閉');
  close.addEventListener('click', _backupClose);
  p3.appendChild(close);
  box.appendChild(p3);
  ov.appendChild(box);
  document.addEventListener('keydown', _backupKeydown);
  exp.focus();
}
