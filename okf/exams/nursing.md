---
type: "Exam Question Bank"
title: "護理師歷屆試題題庫"
description: "護理師（考選部）民國 101–115 年歷屆選擇題 10,070 題，含官方標準答案。"
resource: "https://open-book-is-good-platform.1003ray1003.workers.dev/data/nursing/bank.json"
tags:
  - "醫護"
  - "考選部"
  - "歷屆試題"
  - "選擇題"
status: "stable"
sources:
  - id: "nursing-official"
    resource: "https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx"
    title: "考選部「國家考試試題及測驗式試題答案」開放資料"
---

# 護理師歷屆試題題庫

護理師民國 101–115 年的歷屆選擇題，共 10,070 題，其中 9,743 題
可作答（其餘因原始試題圖檔缺漏或版面問題待校對而暫時退出）。其中 599 題附詳解（佔可作答題 6%）。
線上練習頁：[護理師](https://open-book-is-good-platform.1003ray1003.workers.dev/exam/nursing/)。

## 應試科目（5 科）

- **基礎醫學（包括解剖學、生理學、病理學、藥理學、微生物學與免疫學）** — 解剖學、生理學、病理學、藥理學、微生物學與免疫學 —— 104 年第二次起新增的綜合基礎醫學科目（早年考卷無此科）。
- **基本護理學（包括護理原理、護理技術）與護理行政** — 護理原理與技術（無菌、給藥、生命徵象、傷口、營養與排泄等）與護理行政、品質管理。
- **內外科護理學** — 成人內外科各系統疾病的病理、評估與護理處置 —— 護理師選擇題分量最重的一科。
- **產兒科護理學** — 孕產期母體與新生兒，以及嬰幼兒至兒童的生長發展、常見疾病與護理。
- **精神科與社區衛生護理學** — 精神疾患的症狀與照護，以及社區與公共衛生護理、相關衛生政策。

## 資料形狀

`bank.json` 頂層為 `{"questions": [...]}`，每題欄位：`qid`、`year`、`round`、
`subject`、`no`、`stem`、`options`、`answer`、`parse`。`parse` 為 `ok` 才進入練習池；
`answer` 值為 `#` 代表該題經主管機關公告一律給分，是合法資料而非缺漏。

詳見 [題庫資料格式](/datasets/question-bank.md) 與 [詳解](/datasets/explanations.md)。

## 取用條件

題目與標準答案依《著作權法》第 9 條為非著作權標的，得自由利用；
詳解等衍生物為 CC0 1.0。見 [授權](/policies/licensing.md) 與
[使用限制](/policies/disclaimer.md)。
