---
type: "Exam Question Bank"
title: "國中教育會考歷屆試題題庫"
description: "國中教育會考（國中教育會考推動工作委員會）民國 111–115 年歷屆選擇題 1,080 題，含官方標準答案。"
resource: "https://open-book-is-good-platform.1003ray1003.workers.dev/data/cap/bank.json"
tags:
  - "升學"
  - "國中教育會考推動工作委員會"
  - "歷屆試題"
  - "選擇題"
status: "stable"
sources:
  - id: "cap-official"
    resource: "https://cap.rcpet.edu.tw/"
    title: "心測中心 會考歷屆試題（依著作權法 §9，考試試題不受著作權保護）"
---

# 國中教育會考歷屆試題題庫

國中教育會考民國 111–115 年的歷屆選擇題，共 1,080 題，其中 1,071 題
可作答（其餘因原始試題圖檔缺漏或版面問題待校對而暫時退出）。其中 1,071 題附詳解（佔可作答題 100%）。
線上練習頁：[國中教育會考](https://open-book-is-good-platform.1003ray1003.workers.dev/exam/cap/)。

## 應試科目（5 科）

- **國文** — 白話與文言閱讀、字音字形、語文表達與題組閱讀。
- **數學** — 數與量、代數、幾何、統計機率，含非選擇計算題。
- **社會** — 歷史、地理、公民綜合，重圖表與時事素養。
- **自然** — 生物、理化、地科綜合，重實驗與圖表判讀。
- **英語** — 詞彙、對話、短文與題組閱讀。

## 資料形狀

`bank.json` 頂層為 `{"questions": [...]}`，每題欄位：`qid`、`year`、`round`、
`subject`、`no`、`stem`、`options`、`answer`、`parse`。`parse` 為 `ok` 才進入練習池；
`answer` 值為 `#` 代表該題經主管機關公告一律給分，是合法資料而非缺漏。

詳見 [題庫資料格式](/datasets/question-bank.md) 與 [詳解](/datasets/explanations.md)。

## 取用條件

題目與標準答案依《著作權法》第 9 條為非著作權標的，得自由利用；
詳解等衍生物為 CC0 1.0。見 [授權](/policies/licensing.md) 與
[使用限制](/policies/disclaimer.md)。
