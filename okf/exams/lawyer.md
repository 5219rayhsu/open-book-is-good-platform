---
type: "Exam Question Bank"
title: "律師歷屆試題題庫"
description: "律師（考選部）民國 103–114 年歷屆選擇題 3,408 題，含官方標準答案。"
resource: "https://open-book-is-good-platform.1003ray1003.workers.dev/data/lawyer/bank.json"
tags:
  - "法律"
  - "考選部"
  - "歷屆試題"
  - "選擇題"
status: "stable"
sources:
  - id: "lawyer-official"
    resource: "https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx"
    title: "考選部「國家考試試題及測驗式試題答案」開放資料"
---

# 律師歷屆試題題庫

律師民國 103–114 年的歷屆選擇題，共 3,408 題，其中 3,408 題
可作答（其餘因原始試題圖檔缺漏或版面問題待校對而暫時退出）。其中 3,408 題附詳解（佔可作答題 100%）。
線上練習頁：[律師](https://open-book-is-good-platform.1003ray1003.workers.dev/exam/lawyer/)。

## 應試科目（4 科）

- **公法** — 憲法、行政法、國際公法、國際私法 —— 綜合法學（一）的公法部分。
- **刑事法** — 刑法、刑事訴訟法與法律倫理 —— 綜合法學（一）的刑事部分。
- **民事法** — 民法、民事訴訟法 —— 綜合法學（二）的民事部分。
- **商事法** — 公司法、保險法、票據法、證券交易法、強制執行法、法學英文 —— 綜合法學（二）的商事部分。

## 資料形狀

`bank.json` 頂層為 `{"questions": [...]}`，每題欄位：`qid`、`year`、`round`、
`subject`、`no`、`stem`、`options`、`answer`、`parse`。`parse` 為 `ok` 才進入練習池；
`answer` 值為 `#` 代表該題經主管機關公告一律給分，是合法資料而非缺漏。

詳見 [題庫資料格式](/datasets/question-bank.md) 與 [詳解](/datasets/explanations.md)。

## 取用條件

題目與標準答案依《著作權法》第 9 條為非著作權標的，得自由利用；
詳解等衍生物為 CC0 1.0。見 [授權](/policies/licensing.md) 與
[使用限制](/policies/disclaimer.md)。
