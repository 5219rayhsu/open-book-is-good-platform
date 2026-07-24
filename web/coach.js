'use strict';
/* ============================================================
   學習教練 — 每次答題完成後的「評語」+ 學習大師方針建議。

   兩個對外函式:
     coachComment(ctx)  單題作答後的一句評語 + 一條大師方針(掛在題卡下)
     coachAdvice()      讀整體狀態,回傳 2–4 條「下一步」建議(掛在能力雷達)

   方針來源:多位學習科學家的研究(內部設計文件另存) ——
     Bjork(合意困難 / 間隔)、Roediger & Karpicke(測驗效應)、
     Ericsson(刻意練習)、費曼(講給自己聽)、Dunlosky(最高效兩招)、
     Oakley(專注↔擴散)、Pólya(解題即搜尋)。依情境輪替,不重複轟炸。

   設計原則:可解釋(每條都說明為什麼)、不操弄(無「連勝!」式成癮話術,
   以掌握與清晰為動機,而非分數刺激)。確定性:同輸入同輸出(用傳入 idx
   或 state.log.length 當輪替索引,不靠隨機)。

   依賴 app.js 全域:SUBJECTS / subjectStats / weakestSubject / dueCards /
   pct / state。皆在作答後或切到雷達時才呼叫,載入順序安全。
   ============================================================ */

/* 大師方針卡(line 為一句話建議;tag 供情境挑選) */
var COACH_PRINCIPLES = {
  wrong_weak: { m: '弱點優先', line: '把時間集中在最弱的環節，別平均分配 —— 弱點才是分數的槓桿。' },
  retrieval: { m: 'Roediger', line: '答錯不是壞事，主動把答案「想出來」比重讀有效得多。' },
  desirable: { m: 'Bjork', line: '合意困難：會卡、會錯，代表你正在學習區；太順反而沒長進。' },
  explain: { m: '費曼', line: '費曼技巧：把這題用自己的話講一遍，講不下去的地方就是還沒懂。' },
  testing: { m: 'Roediger', line: '測驗效應：用「考」來學，而不是讀完才考 —— 你正在做對的事。' },
  deliberate: { m: 'Ericsson', line: '刻意練習：針對弱點、立即回饋、重複修正，才算有效的練習。' },
  correct_strong: { m: '效益優先', line: '別過度練已經會的：把資源投到還不穩的科目，效益更高。' },
  spacing: { m: 'Bjork', line: '間隔複習：今天會了，過幾天再考一次，才會真的長到長期記憶。' },
  essay_frame: { m: '費曼', line: '申論先寫架構與關鍵詞，再對照要點 —— 缺哪一塊一眼就看得出來。' },
  diffuse: { m: 'Oakley', line: '卡住時先離開一下：擴散模式常在休息時把想不通的點接起來。' },
  highyield: { m: 'Dunlosky', line: '研究證實最高效的兩招：自我測驗 + 分散練習，你正好都在做。' },
  search: { m: 'Pólya', line: '把難題當成「在可能性空間中搜尋」：先排除明顯錯的，再比較剩下的。' }
};

function _pick(list, idx) {
  if (typeof idx !== 'number' || isNaN(idx)) { idx = 0; }
  return list[((idx % list.length) + list.length) % list.length];
}

/* 單題評語。ctx:{correct, subject, subjectAcc(0..1|null), mode, isEssay, selfRating(1..5|null), idx} */
function coachComment(ctx) {
  ctx = ctx || {};
  var idx = (typeof ctx.idx === 'number') ? ctx.idx : (state ? state.log.length : 0);
  var accTxt = (ctx.subjectAcc != null) ? pct(ctx.subjectAcc) : null;
  var weak = (ctx.subjectAcc != null && ctx.subjectAcc < 0.6);

  if (ctx.isEssay) {
    var r = ctx.selfRating || 0;
    var line, key;
    if (r <= 2) {
      line = _pick(['自評偏低很正常 —— 申論靠架構，先把「答題骨架」練熟，內容自然長得上去。',
        '寫不出來代表這個概念還沒成形，正好是該補的點。'], idx);
      key = 'essay_frame';
    } else if (r === 3) {
      line = _pick(['抓到大方向了，差在關鍵詞與法規/理論的精準度 —— 對照要點補齊。',
        '架構有了，把專有名詞與條文名稱補進去就更穩。'], idx);
      key = 'explain';
    } else {
      line = _pick(['寫得不錯。隔幾天再回來默寫一次，確認不是「看過就以為會」。',
        '掌握度高，改去攻還不穩的題型，別在已會的地方耗時間。'], idx);
      key = 'spacing';
    }
    return { tag: '申論自評 ' + (r || '—') + '/5', text: line, principle: COACH_PRINCIPLES[key] };
  }

  if (ctx.correct) {
    var ctext = weak
      ? _pick([
          '答對了！這科你整體還在 ' + accTxt + '，趁這股手感把同類題多練幾題。',
          '對的。' + (accTxt ? '這科目前 ' + accTxt + '，' : '') + '一題一題把弱科墊起來，很實在。'], idx)
      : _pick(['答對。穩。',
          '正確。' + (accTxt ? '這科 ' + accTxt + '，維持住。' : '基礎穩固，維持住。'),
          '對了 —— 別停在已會的，挑戰沒把握的題更划算。'], idx);
    var ckey = weak ? _pick(['retrieval', 'highyield'], idx) : _pick(['correct_strong', 'spacing'], idx);
    return { tag: '答對', text: ctext, principle: COACH_PRINCIPLES[ckey] };
  }

  var wtext = weak
    ? _pick([
        '又錯在這科（目前 ' + accTxt + '）—— 不要繞過它，這裡每多對一題，CP 值最高。',
        '答錯。' + (accTxt ? '這科 ' + accTxt + '，' : '') + '把它標起來，等一下去「弱點殲滅」集中拆解。'], idx)
    : _pick([
        '答錯。先別急著看下一題 —— 把為什麼選錯、正解為什麼對，各講一句給自己聽。',
        '錯了。這題的相關易混淆題已排進補強佇列，等下會再遇到。'], idx);
  var wkey = weak ? _pick(['wrong_weak', 'deliberate'], idx) : _pick(['explain', 'desirable', 'testing'], idx);
  return { tag: '答錯', text: wtext, principle: COACH_PRINCIPLES[wkey] };
}

/* 整體建議(能力雷達面板用)。回傳 [{title, body, master}]。 */
function coachAdvice() {
  var out = [];
  var stats = subjectStats(true);
  var total = 0, answered = {};
  SUBJECTS.forEach(function (s) { total += stats[s].n; answered[s] = stats[s].n; });

  if (total < 12) {
    out.push({ title: '先把地形量出來', master: '先量地形',
      body: '作答資料還少，雷達會不準。先做一次入學診斷，或在「單題練習」多累積一些，系統才畫得出可信的強弱輪廓。' });
    out.push({ title: '用考試來學，別等讀完才考', master: 'Roediger·測驗效應',
      body: '直接開始作答，錯了再回頭補 —— 主動作答的長期保留遠勝於先讀後考。' });
    return out;
  }

  /* 弱項排序 */
  var ranked = SUBJECTS.filter(function (s) { return stats[s].n >= 3; })
    .map(function (s) { return { s: s, acc: stats[s].ok / stats[s].n, n: stats[s].n }; })
    .sort(function (a, b) { return a.acc - b.acc; });

  if (ranked.length > 0 && ranked[0].acc < 0.6) {
    out.push({ title: '直擊最大弱點：' + ranked[0].s + '（' + pct(ranked[0].acc) + '）',
      master: '弱點優先',
      body: '把練習時間集中在這一科，別平均分配。去「弱點殲滅」會把相似、易混淆的題擺在一起，拆解你最常錯的陷阱。' });
  }

  var due = (typeof dueCards === 'function') ? dueCards().length : 0;
  if (due > 0) {
    out.push({ title: '有 ' + due + ' 題到期待複習', master: 'Bjork·間隔複習',
      body: '趁快要遺忘前重新提取，記憶鞏固效果最好。到「弱點殲滅」鎖定科目，會把該科到期題優先帶入複習。' });
  }

  if (ranked.length > 0) {
    var best = ranked[ranked.length - 1];
    if (best.acc >= 0.8) {
      out.push({ title: best.s + ' 已相對穩（' + pct(best.acc) + '）', master: 'Ericsson·刻意練習',
        body: '別在已經會的地方耗時間。維持間隔複習即可，把省下的時間投到弱科，進步最快。' });
    }
  }

  /* 收尾固定掛一條「會了≠記得」提醒,輪替大師 */
  var tail = _pick([
    { title: '把錯題講給自己聽', master: '費曼技巧', body: '每天挑 1–2 題答錯的，用自己的話解釋正解為什麼對、你為什麼錯 —— 講得出來才是真懂。' },
    { title: '今天會了，過幾天再考一次', master: 'Bjork·合意困難', body: '一次練到會不代表記得住；讓它隔幾天「有點想不起來」時再複習，才會長到長期記憶。' },
    { title: '最高效的兩招你都在做', master: 'Dunlosky', body: '研究比較數十種讀書法，效益最高的是「自我測驗」與「分散練習」—— 繼續保持就對了。' }
  ], total);
  out.push(tail);
  return out.slice(0, 4);
}

/* ===================== DOM 渲染輔助(用 app.js 的 el)===================== */
function renderCoachAdvice(box) {
  if (!box) { return; }
  box.textContent = '';
  coachAdvice().forEach(function (it) {
    var card = el('div', { 'class': 'coach-advice-card' });
    var h = el('div', { 'class': 'coach-advice-title' });
    h.appendChild(document.createTextNode(it.title));
    h.appendChild(el('span', { 'class': 'coach-master' }, it.master));
    card.appendChild(h);
    card.appendChild(el('p', { 'class': 'coach-advice-body' }, it.body));
    box.appendChild(card);
  });
}

/* 依某題科目算「含本題」的近期正確率,供 coachComment 的 subjectAcc */
function subjectAccFor(subject) {
  var st = subjectStats(true)[subject];
  return (st && st.n) ? st.ok / st.n : null;
}
