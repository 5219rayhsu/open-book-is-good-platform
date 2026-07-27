---
type: "Exam Question Bank"
title: "醫師歷屆試題題庫"
description: "醫師（考選部）民國 104–115 年歷屆選擇題 8,848 題，含官方標準答案。"
resource: "https://open-book-is-good-platform.1003ray1003.workers.dev/data/doctor/bank.json"
tags:
  - "醫護"
  - "考選部"
  - "歷屆試題"
  - "選擇題"
status: "stable"
sources:
  - id: "doctor-official"
    resource: "https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx"
    title: "考選部「國家考試試題及測驗式試題答案」開放資料"
---

# 醫師歷屆試題題庫

醫師民國 104–115 年的歷屆選擇題，共 8,848 題，其中 8,819 題
可作答（其餘因原始試題圖檔缺漏或版面問題待校對而暫時退出）。本科詳解尚未撰寫。
線上練習頁：[醫師](https://open-book-is-good-platform.1003ray1003.workers.dev/exam/doctor/)。

## 應試科目（5 科）

- **醫學（一）（包括生物化學、解剖學、胚胎及發育生物學、組織學、生理學等科目知識及其臨床之應用）** — 第一階段基礎醫學（上）：生物化學、解剖學、胚胎與發育生物學、組織學、生理學及其臨床應用。
- **醫學（二）（包括微生物免疫學、寄生蟲學、藥理學、病理學、公共衛生學等科目知識及其臨床之應用）** — 第一階段基礎醫學（下）：微生物免疫學、寄生蟲學、藥理學、病理學、公共衛生學及其臨床應用。
- **醫學（三）（包括內科、家庭醫學科等科目及其相關臨床實例與醫學倫理）** — 第二階段臨床醫學：內科、家庭醫學科等，含臨床實例與醫學倫理。
- **醫學（四）（包括小兒科、皮膚科、神經科、精神科等科目及其相關臨床實例與醫學倫理）** — 第二階段臨床醫學：小兒科、皮膚科、神經科、精神科等，含臨床實例與醫學倫理。
- **醫學（五）（包括外科、骨科、泌尿科等科目及其相關臨床實例與醫學倫理）** — 第二階段臨床醫學：外科、骨科、泌尿科等，含臨床實例與醫學倫理。

## 資料形狀

`bank.json` 頂層為 `{"questions": [...]}`，每題欄位：`qid`、`year`、`round`、
`subject`、`no`、`stem`、`options`、`answer`、`parse`。`parse` 為 `ok` 才進入練習池；
`answer` 值為 `#` 代表該題經主管機關公告一律給分，是合法資料而非缺漏。

詳見 [題庫資料格式](/datasets/question-bank.md) 與 [詳解](/datasets/explanations.md)。

## 取用條件

題目與標準答案依《著作權法》第 9 條為非著作權標的，得自由利用；
詳解等衍生物為 CC0 1.0。見 [授權](/policies/licensing.md) 與
[使用限制](/policies/disclaimer.md)。
