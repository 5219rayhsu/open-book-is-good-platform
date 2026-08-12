/* 判分核心：一份邏輯，判分／綠燈標記／正解顯示三處共用。
   單獨成檔的理由是它是唯一的錢路徑（判學生對錯），必須能離線跑自檢——檔尾的
   module.exports 讓 node 直接 require 這支（見 _build_features/test_accept_grading.js），
   瀏覽器端照舊當全域 script 載入。改動這裡務必重跑那支自檢。 */

function sortLetters(s) { return String(s).split('').sort().join(''); }

/* 官方認可多重答案（accept）：官方公告「第N題答Ａ或Ｂ或AB者均給分」時，answer 留官方列的
   第一個以維持既有引擎相容，accept 列出全部可接受組合。判分、選項標記、正解顯示三處都必須
   走這裡——任一處漏掉就會把官方認可的另一個答案當場判錯，比題目不出更糟。 */
function acceptListOf(q) {
  return (q && q.accept && q.accept.length) ? q.accept : [q && q.answer];
}

/* 🔴 送分題的權威判準是 answer_status === 'free'，不是 answer === '#'。
   為什麼要改：'#' 一個值背了兩個意思——「官方公告一律給分」與「答案讀不出來」。
   2026-08-06 實測，兩整卷 100 題因解析失敗落進 '#'，這裡就把**任何**作答都判對，
   答錯的學生被告知答對，存活數月。建置端已改成入庫時標注 answer_status
   （六值：official／multi／free／none_published／not_applicable／unread），
   判分端跟著改讀它，這個歧義才在使用者這一面真正消失。

   舊資料相容：answer_status 不存在時才退回看 '#'。全站 45,563 題現已全部有這個欄位，
   這條退路只為了「使用者瀏覽器有舊快取」而留——資料端確認無漏網後即可刪。 */
function isFree(q) {
  if (!q) { return false; }
  if (q.answer_status) { return q.answer_status === 'free'; }
  return q.answer === '#';
}

/* 🔴 可作答是**白名單**，不是黑名單（IDR-0033）。判準只有一個：本站能不能替使用者
   判對錯。能判的三個值列在這裡，其餘任何值（含未來新增的、拼錯的、還沒想到的）
   一律不可作答。

   為什麼一定要白名單：黑名單（「排除這幾個值、其餘可作答」）的失敗方向是
   **不該判對的判對了**，看不見；白名單的失敗方向是「該能答的變成不能答」，看得見。
   2026-08-06 那次 100 題事故就是前者。實測 2026-08-10：`unread` 有 2 題（counseling
   與 nursing 各 1）帶著 `answer:'D'`、4 選項、`parse:'ok'` 躺在練習池裡，被當成
   「正解是 D」在判學生對錯——而 `unread` 的意思正是「我們讀不出答案」。
   沒有人記得把它加進黑名單，因為黑名單要靠人記得。

   舊資料相容：`answer_status` 不存在時回 true，交給呼叫端既有的條件（有答案、
   至少 2 選項）擋。這條退路只為使用者瀏覽器裡的舊快取而留。 */
var ANSWERABLE_STATUS = { official: true, free: true, multi: true };

function isAnswerable(q) {
  if (!q) { return false; }
  if (!q.answer_status) { return true; }
  return ANSWERABLE_STATUS[q.answer_status] === true;
}

/* 唯讀題要顯示的一句話。`none_published` 與 `unread` 刻意寫成兩句不同的話：
   一句是「官方沒給」，一句是「我們沒讀出來」——這兩件事在畫面上必須一眼可分。 */
var READONLY_NOTE = {
  not_applicable: '本題為非選擇題，無選項可作答，僅供閱讀，不列入計分與能力分析。',
  none_published: '官方未公布本題標準答案，本站無法判定對錯，僅供閱讀，不列入計分與能力分析。',
  unread: '本題原始資料解析異常，暫不開放作答，將於後續版本修正。'
};

function readonlyNoteOf(q) {
  if (!q || isAnswerable(q)) { return ''; }
  return READONLY_NOTE[q.answer_status] || '本題目前無法判定對錯，僅供閱讀，不列入計分與能力分析。';
}

function isCorrectPick(q, pickedLetter) {
  if (isFree(q)) { return true; }   /* 送分題（官方公告一律給分）：計為答對 */
  var p = sortLetters(pickedLetter);
  return acceptListOf(q).some(function (a) { return sortLetters(a) === p; });
}

function answerLabelOf(q) {
  var list = acceptListOf(q);
  return list.length > 1 ? list.join('、') + '皆可（官方公告均給分）' : String(q.answer);
}

/* 字母集合：'#'（送分）與 null 回空集合，故送分題不標紅綠。accept 題把所有官方認可
   字母 join 後丟進來，就得到該標綠的整個集合。 */
function letterSetOf(s) {
  var set = {};
  if (s === '#' || s == null) { return set; }
  String(s).split('').forEach(function (ch) { if (ch >= 'A' && ch <= 'E') { set[ch] = true; } });
  return set;
}

/* 綠燈字母集：普通題＝正解字母，accept 題＝所有官方認可字母，送分題＝空集合。
   送分走 isFree 而不是靠 letterSetOf 對 '#' 的特判——後者只在 answer 剛好是 '#'
   時成立，answer_status 才是權威。 */
function correctLetterSet(q) {
  if (isFree(q)) { return {}; }
  return letterSetOf(acceptListOf(q).join(''));
}

if (typeof module !== 'undefined' && module.exports) {   /* node 自檢用；瀏覽器無 module */
  module.exports = { sortLetters, acceptListOf, isFree, isAnswerable, readonlyNoteOf, isCorrectPick, answerLabelOf, letterSetOf, correctLetterSet };
}
