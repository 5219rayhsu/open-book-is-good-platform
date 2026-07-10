/*
 * 自適應＋間隔重複引擎(SM-2-lite)— JS 鏡像實作。
 * 與 scripts/srs.py 逐步一致(同 LCG、同捨入規則、同抽號次數);
 * 對拍向量:tests/srs_vectors.json;node 測試:tests/test_srs_js.mjs。
 *
 * 載入方式(刻意不寫 export 關鍵字,理由見 README「資料限制」):
 * - 瀏覽器 file://:<script src="srs.js"></script> → window.SRS。
 * - node / ESM:await import("./srs.js") 副作用後取 globalThis.SRS。
 *  (不含 import/export 的檔案本身就是合法 ES module,兩種載法皆可。)
 */
"use strict";
(function () {
  // ── 常數(與 scripts/srs.py 必須完全一致)──────────────────────
  const EASE_START = 2.5;            // 初始難易係數
  const EASE_MIN = 1.3;              // 難易係數下限
  const EASE_PENALTY = 0.2;          // 答錯時 ease 扣減量
  const EARLY_INTERVALS = [1, 3, 7]; // 首三次答對的固定間隔(天)
  const WEAK_THRESHOLD = 0.6;        // 概念正確率低於此值視為弱項
  const LCG_A = 1664525;             // Numerical Recipes 線性同餘參數
  const LCG_C = 1013904223;
  const LCG_M = 4294967296;          // 2^32(乘積 < 2^53,double 精確)

  const STATE_KEYS = ["ease", "interval_days", "due_day", "reps", "lapses"];

  const EXPLAIN = {
    due: "這一題已到排定的複習時間，趁快遺忘前重新提取，記憶鞏固效果最好。",
    weak_concept: "這一題屬於你目前正確率偏低的概念，優先補強弱項最有效率。",
    new: "這是你還沒練過的新題，先擴大涵蓋範圍再回頭深化。",
    opposite_drill: "這一題與你剛答錯的題目互為相反問法，對照練習能拆解常見陷阱。",
  };
  const EXPLAIN_FALLBACK =
    "這一題依目前的練習策略排入，完整規則請見 README 的引擎說明。";

  // ── LCG:可重現偽隨機(兩語言逐位元一致)──────────────────────
  function lcg_seed(seed) {
    if (!Number.isInteger(seed)) throw new Error("seed 必須是整數");
    return ((seed % LCG_M) + LCG_M) % LCG_M; // 負數 seed 正規化同 Python
  }

  function lcg_next(state) {
    return (state * LCG_A + LCG_C) % LCG_M;
  }

  // ── 捨入工具(與 Python 的 floor(x+0.5) 完全一致)──────────────
  function round_half_up(x) {
    return Math.floor(x + 0.5);
  }

  function round2(x) {
    return Math.floor(x * 100 + 0.5) / 100;
  }

  // ── SM-2-lite ────────────────────────────────────────────────
  function new_state() {
    return { ease: EASE_START, interval_days: 0, due_day: 0, reps: 0, lapses: 0 };
  }

  function validateState(state) {
    if (typeof state !== "object" || state === null || Array.isArray(state)) {
      throw new Error("state 必須是物件");
    }
    for (const key of STATE_KEYS) {
      if (!(key in state)) throw new Error("state 缺少欄位：" + key);
    }
  }

  // SM-2-lite:依答對/答錯回傳「新的」狀態物件(不改動輸入)。
  // 規則同 scripts/srs.py 的 review docstring。
  function review(state, correct, now_day) {
    validateState(state);
    if (typeof correct !== "boolean") throw new Error("correct 必須是布林值");
    if (!Number.isInteger(now_day) || now_day < 0) {
      throw new Error("now_day 必須是非負整數");
    }
    if (correct) {
      const reps = state.reps + 1;
      let interval;
      if (reps <= EARLY_INTERVALS.length) {
        interval = EARLY_INTERVALS[reps - 1];
      } else {
        interval = Math.max(
          state.interval_days + 1,
          round_half_up(state.interval_days * state.ease)
        );
      }
      return {
        ease: state.ease,
        interval_days: interval,
        due_day: now_day + interval,
        reps: reps,
        lapses: state.lapses,
      };
    }
    const ease = Math.max(EASE_MIN, round2(state.ease - EASE_PENALTY));
    return {
      ease: ease,
      interval_days: 1,
      due_day: now_day + 1,
      reps: 0,
      lapses: state.lapses + 1,
    };
  }

  // ── 弱項加權選題 ──────────────────────────────────────────────
  // 每概念的「新題」候選(排除到期與最近出過);概念名排序固定順序。
  function newPool(bank, dueSet, recentSet) {
    const pool = [];
    for (const concept of Object.keys(bank).sort()) {
      const qids = bank[concept].filter(
        (q) => !dueSet.has(q) && !recentSet.has(q)
      );
      if (qids.length > 0) pool.push([concept, qids]);
    }
    return pool;
  }

  // 弱概念候選與整數權重:weight = round((0.6−acc)×100),至少 1。
  function weakEntries(pool, accuracy) {
    const out = [];
    for (const [concept, qids] of pool) {
      const acc = accuracy[concept];
      if (acc === undefined || acc === null) continue; // 沒資料不算「弱」
      if (typeof acc !== "number") {
        throw new Error("accuracy_by_concept[" + concept + "] 必須是數值");
      }
      if (acc < WEAK_THRESHOLD) {
        const weight = Math.max(1, round_half_up((WEAK_THRESHOLD - acc) * 100));
        out.push([qids, weight]);
      }
    }
    return out;
  }

  // 弱項加權選題。優先序:到期複習 > 弱概念新題 > 一般新題。
  // 演算法與抽號次數同 scripts/srs.py 的 pick_next docstring。
  function pick_next(bank_qids_by_concept, accuracy_by_concept, due_qids,
                     recent_qids, seed) {
    let rng = lcg_seed(seed);
    const recentSet = new Set(recent_qids);
    for (const qid of due_qids) {
      if (!recentSet.has(qid)) return { qid: qid, reason: "due" };
    }
    const pool = newPool(bank_qids_by_concept, new Set(due_qids), recentSet);
    const weak = weakEntries(pool, accuracy_by_concept);
    if (weak.length > 0) {
      const total = weak.reduce((sum, entry) => sum + entry[1], 0);
      rng = lcg_next(rng);
      let r = rng % total;
      for (const [qids, weight] of weak) {
        if (r < weight) {
          rng = lcg_next(rng);
          return { qid: qids[rng % qids.length], reason: "weak_concept" };
        }
        r -= weight;
      }
    }
    const flat = pool.flatMap((entry) => entry[1]);
    if (flat.length > 0) {
      rng = lcg_next(rng);
      return { qid: flat[rng % flat.length], reason: "new" };
    }
    return null;
  }

  // ── 可解釋推薦 ────────────────────────────────────────────────
  function explain(reason_code) {
    return Object.prototype.hasOwnProperty.call(EXPLAIN, reason_code)
      ? EXPLAIN[reason_code]
      : EXPLAIN_FALLBACK;
  }

  // ── 對外介面:window.SRS / globalThis.SRS ─────────────────────
  const SRS = {
    EASE_START: EASE_START,
    EASE_MIN: EASE_MIN,
    EASE_PENALTY: EASE_PENALTY,
    EARLY_INTERVALS: EARLY_INTERVALS,
    WEAK_THRESHOLD: WEAK_THRESHOLD,
    lcg_seed: lcg_seed,
    lcg_next: lcg_next,
    new_state: new_state,
    review: review,
    pick_next: pick_next,
    explain: explain,
  };
  globalThis.SRS = SRS; // 瀏覽器中 window === globalThis
})();
