---
type: "Exam Question Bank"
title: "臨床心理師歷屆試題題庫"
description: "臨床心理師（考選部）民國 101–114 年歷屆選擇題 5,640 題，含官方標準答案。"
resource: "https://open-book-is-good-platform.1003ray1003.workers.dev/data/clinical/bank.json"
tags:
  - "心理"
  - "考選部"
  - "歷屆試題"
  - "選擇題"
status: "stable"
sources:
  - id: "clinical-official"
    resource: "https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx"
    title: "考選部「國家考試試題及測驗式試題答案」開放資料"
---

# 臨床心理師歷屆試題題庫

臨床心理師民國 101–114 年的歷屆選擇題，共 5,640 題，其中 5,591 題
可作答（其餘因原始試題圖檔缺漏或版面問題待校對而暫時退出）。其中 957 題附詳解（佔可作答題 17%）。
線上練習頁：[臨床心理師](https://open-book-is-good-platform.1003ray1003.workers.dev/exam/clinical/)。

## 應試科目（6 科）

- **臨床心理學基礎** — 生理心理、認知、情緒、人格與發展等心理學基礎 —— 臨床心理工作的學理地基。
- **臨床心理學總論（一）** — 心理病理與變態心理學，各類心理疾患的症狀、成因與分類（以現行 DSM 為準）。
- **臨床心理學總論（二）** — 心理衡鑑與心理測驗，衡鑑工具的選用、施測、計分與結果解釋。
- **臨床心理學特論（一）** — 心理治療與處遇的各家學派理論、技術與療效實證。
- **臨床心理學特論（二）** — 臨床健康心理、神經心理與身心疾病的評估與介入。
- **臨床心理學特論（三）** — 臨床專業倫理、法規、社區與跨領域合作等實務議題。

## 資料形狀

`bank.json` 頂層為 `{"questions": [...]}`，每題欄位：`qid`、`year`、`round`、
`subject`、`no`、`stem`、`options`、`answer`、`parse`。`parse` 為 `ok` 才進入練習池；
`answer` 值為 `#` 代表該題經主管機關公告一律給分，是合法資料而非缺漏。

詳見 [題庫資料格式](/datasets/question-bank.md) 與 [詳解](/datasets/explanations.md)。

## 取用條件

題目與標準答案依《著作權法》第 9 條為非著作權標的，得自由利用；
詳解等衍生物為 CC0 1.0。見 [授權](/policies/licensing.md) 與
[使用限制](/policies/disclaimer.md)。
