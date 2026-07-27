---
type: "Exam Question Bank"
title: "社會工作師歷屆試題題庫"
description: "社會工作師（考選部）民國 101–115 年歷屆選擇題 7,039 題，含官方標準答案。"
resource: "https://open-book-is-good-platform.1003ray1003.workers.dev/data/social-worker/bank.json"
tags:
  - "社會福利"
  - "考選部"
  - "歷屆試題"
  - "選擇題"
status: "stable"
sources:
  - id: "social-worker-official"
    resource: "https://wwwq.moex.gov.tw/exam/wFrmExamQandASearch.aspx"
    title: "考選部「國家考試試題及測驗式試題答案」開放資料"
---

# 社會工作師歷屆試題題庫

社會工作師民國 101–115 年的歷屆選擇題，共 7,039 題，其中 6,945 題
可作答（其餘因原始試題圖檔缺漏或版面問題待校對而暫時退出）。其中 6,945 題附詳解（佔可作答題 100%）。
線上練習頁：[社會工作師](https://open-book-is-good-platform.1003ray1003.workers.dev/exam/social-worker/)。

## 應試科目（6 科）

- **社會工作** — 總論：專業發展史、理論視角、價值與倫理、台灣社工制度脈絡。
- **社會工作直接服務** — 個案、團體、社區三大方法的實務流程、會談技巧與處遇模式。
- **人類行為與社會環境** — 生命週期發展、心理學理論、家庭與社會系統對行為的影響。
- **社會工作研究方法** — 量化與質性設計、抽樣、測量、信效度、基礎統計判讀、研究倫理。
- **社會政策與社會立法** — 福利政策理念與現行法規：社會救助、社會保險、各類福利服務法。
- **社會工作管理** — 組織理論、方案設計與評估、督導、人力資源與財務管理。

## 資料形狀

`bank.json` 頂層為 `{"questions": [...]}`，每題欄位：`qid`、`year`、`round`、
`subject`、`no`、`stem`、`options`、`answer`、`parse`。`parse` 為 `ok` 才進入練習池；
`answer` 值為 `#` 代表該題經主管機關公告一律給分，是合法資料而非缺漏。

詳見 [題庫資料格式](/datasets/question-bank.md) 與 [詳解](/datasets/explanations.md)。

## 取用條件

題目與標準答案依《著作權法》第 9 條為非著作權標的，得自由利用；
詳解等衍生物為 CC0 1.0。見 [授權](/policies/licensing.md) 與
[使用限制](/policies/disclaimer.md)。
