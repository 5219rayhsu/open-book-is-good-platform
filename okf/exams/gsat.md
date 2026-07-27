---
type: "Exam Question Bank"
title: "學科能力測驗歷屆試題題庫"
description: "學科能力測驗（大學入學考試中心）民國 111–115 年歷屆選擇題 1,258 題，含官方標準答案。"
resource: "https://open-book-is-good-platform.1003ray1003.workers.dev/data/gsat/bank.json"
tags:
  - "升學"
  - "大學入學考試中心"
  - "歷屆試題"
  - "選擇題"
status: "stable"
sources:
  - id: "gsat-official"
    resource: "https://www.ceec.edu.tw/"
    title: "大考中心 學測歷年試題（依著作權法 §9，考試試題不受著作權保護）"
---

# 學科能力測驗歷屆試題題庫

學科能力測驗民國 111–115 年的歷屆選擇題，共 1,258 題，其中 1,218 題
可作答（其餘因原始試題圖檔缺漏或版面問題待校對而暫時退出）。其中 1,218 題附詳解（佔可作答題 100%）。
線上練習頁：[學科能力測驗](https://open-book-is-good-platform.1003ray1003.workers.dev/exam/gsat/)。

## 應試科目（6 科）

- **國綜** — 國語文綜合能力測驗：閱讀理解、文意推論、語文知識與跨領域素養題。
- **數學A** — 數學 A 卷（自然組導向），含進階單元，多圖表與情境素養題。
- **數學B** — 數學 B 卷（社會組導向），偏應用與資料判讀。
- **社會** — 歷史、地理、公民與社會綜合，重資料閱讀與跨科素養。
- **自然** — 物理、化學、生物、地科綜合，重圖表判讀與探究實作。
- **英文** — 詞彙、綜合測驗、文意選填、閱讀測驗與混合題。

## 資料形狀

`bank.json` 頂層為 `{"questions": [...]}`，每題欄位：`qid`、`year`、`round`、
`subject`、`no`、`stem`、`options`、`answer`、`parse`。`parse` 為 `ok` 才進入練習池；
`answer` 值為 `#` 代表該題經主管機關公告一律給分，是合法資料而非缺漏。

詳見 [題庫資料格式](/datasets/question-bank.md) 與 [詳解](/datasets/explanations.md)。

## 取用條件

題目與標準答案依《著作權法》第 9 條為非著作權標的，得自由利用；
詳解等衍生物為 CC0 1.0。見 [授權](/policies/licensing.md) 與
[使用限制](/policies/disclaimer.md)。
