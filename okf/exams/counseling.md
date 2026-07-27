---
type: "Exam Question Bank"
title: "諮商心理師歷屆試題題庫"
description: "諮商心理師（考選部）民國 104–114 年歷屆選擇題 3,960 題，含官方標準答案。"
resource: "https://open-book-is-good-platform.1003ray1003.workers.dev/data/counseling/bank.json"
tags:
  - "心理"
  - "考選部"
  - "歷屆試題"
  - "選擇題"
status: "stable"
sources:
  - id: "counseling-official"
    resource: "https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx"
    title: "考選部「國家考試試題及測驗式試題答案」開放資料"
---

# 諮商心理師歷屆試題題庫

諮商心理師民國 104–114 年的歷屆選擇題，共 3,960 題，其中 3,906 題
可作答（其餘因原始試題圖檔缺漏或版面問題待校對而暫時退出）。其中 2,209 題附詳解（佔可作答題 56%）。
線上練習頁：[諮商心理師](https://open-book-is-good-platform.1003ray1003.workers.dev/exam/counseling/)。

## 應試科目（6 科）

- **諮商的心理學基礎** — 人類發展、社會心理、學習與認知、人格與情緒等心理學基礎 —— 諮商實務的學理地基。
- **諮商與心理治療理論** — 精神分析、個人中心、認知行為、後現代等各家學派的核心概念與技術。
- **諮商與心理治療實務與專業倫理** — 會談歷程、個案概念化與處遇，以及諮商專業倫理與法規。
- **心理健康與變態心理學** — 心理健康促進，以及各類心理疾患的症狀、成因與分類（以現行 DSM 為準）。
- **個案評估與心理衡鑑** — 初談、心理測驗、衡鑑工具的選用與結果解釋，以及評估報告撰寫。
- **團體諮商與心理治療** — 團體的階段歷程、領導技術、團體動力與不同取向的團體實務。

## 資料形狀

`bank.json` 頂層為 `{"questions": [...]}`，每題欄位：`qid`、`year`、`round`、
`subject`、`no`、`stem`、`options`、`answer`、`parse`。`parse` 為 `ok` 才進入練習池；
`answer` 值為 `#` 代表該題經主管機關公告一律給分，是合法資料而非缺漏。

詳見 [題庫資料格式](/datasets/question-bank.md) 與 [詳解](/datasets/explanations.md)。

## 取用條件

題目與標準答案依《著作權法》第 9 條為非著作權標的，得自由利用；
詳解等衍生物為 CC0 1.0。見 [授權](/policies/licensing.md) 與
[使用限制](/policies/disclaimer.md)。
