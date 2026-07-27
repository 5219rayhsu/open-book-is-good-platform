---
type: "Exam Question Bank"
title: "會計師歷屆試題題庫"
description: "會計師（考選部）民國 101–114 年歷屆選擇題 1,034 題，含官方標準答案。"
resource: "https://open-book-is-good-platform.1003ray1003.workers.dev/data/cpa/bank.json"
tags:
  - "財經"
  - "考選部"
  - "歷屆試題"
  - "選擇題"
status: "stable"
sources:
  - id: "cpa-official"
    resource: "https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx"
    title: "考選部「國家考試試題及測驗式試題答案」開放資料"
---

# 會計師歷屆試題題庫

會計師民國 101–114 年的歷屆選擇題，共 1,034 題，其中 1,034 題
可作答（其餘因原始試題圖檔缺漏或版面問題待校對而暫時退出）。其中 1,034 題附詳解（佔可作答題 100%）。
線上練習頁：[會計師](https://open-book-is-good-platform.1003ray1003.workers.dev/exam/cpa/)。

## 應試科目（3 科）

- **中級會計學** — 財務報表編製、各類資產負債與權益的認列與衡量，以現行 IFRS／我國會計準則為準。
- **稅務法規** — 所得稅、營業稅、遺贈稅等稅法的適用、計算與申報，以現行稅法及解釋函令為準。
- **審計學** — 查核規劃、內部控制評估、查核證據與查核報告，以現行審計準則公報為準。

## 資料形狀

`bank.json` 頂層為 `{"questions": [...]}`，每題欄位：`qid`、`year`、`round`、
`subject`、`no`、`stem`、`options`、`answer`、`parse`。`parse` 為 `ok` 才進入練習池；
`answer` 值為 `#` 代表該題經主管機關公告一律給分，是合法資料而非缺漏。

詳見 [題庫資料格式](/datasets/question-bank.md) 與 [詳解](/datasets/explanations.md)。

## 取用條件

題目與標準答案依《著作權法》第 9 條為非著作權標的，得自由利用；
詳解等衍生物為 CC0 1.0。見 [授權](/policies/licensing.md) 與
[使用限制](/policies/disclaimer.md)。
