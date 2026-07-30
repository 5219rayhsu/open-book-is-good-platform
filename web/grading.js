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

function isCorrectPick(q, pickedLetter) {
  if (q.answer === '#') { return true; }   /* 送分題（官方公告一律給分）：計為答對 */
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

/* 綠燈字母集：普通題＝正解字母，accept 題＝所有官方認可字母，送分題＝空集合 */
function correctLetterSet(q) { return letterSetOf(acceptListOf(q).join('')); }

if (typeof module !== 'undefined' && module.exports) {   /* node 自檢用；瀏覽器無 module */
  module.exports = { sortLetters, acceptListOf, isCorrectPick, answerLabelOf, letterSetOf, correctLetterSet };
}
