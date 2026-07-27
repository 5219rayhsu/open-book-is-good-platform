---
type: "Data Format"
title: "題庫資料格式（bank.json）"
description: "各科題庫的共同 JSON 結構與欄位語意，共 10 科、45,531 題。"
resource: "https://open-book-is-good-platform.1003ray1003.workers.dev/datapackage.json"
tags:
  - "schema"
  - "json"
  - "題庫"
status: "stable"
---

# 題庫資料格式（bank.json）

所有考試共用同一份結構，取用網址為 `https://open-book-is-good-platform.1003ray1003.workers.dev/data/<考試代碼>/bank.json`。

## 欄位

| 欄位 | 型別 | 說明 |
|---|---|---|
| `qid` | string | 題目唯一識別碼，跨檔引用（詳解、關聯）都以此為鍵 |
| `year` | integer | 民國年 |
| `round` | string | 場次（部分考試一年多次） |
| `subject` | string | 應試科目，值域見各科概念文件 |
| `no` | integer | 該卷題號 |
| `stem` | string | 題幹 |
| `options` | string[] | 選項；四選一考科恆為 4 個，學測為五選一或多選 |
| `answer` | string | 官方標準答案字母；`#` 代表公告一律給分 |
| `parse` | string | `ok` 才進練習池；`review` 表待校對 |
| `figure` | string | 選配，題目附圖檔名，位於 `data/<考試>/figures/` |

## 各科代碼

| 代碼 | 考試 | 題數 | 科目數 | 主管機關 |
|---|---|---|---|---|
| `social-worker` | 社會工作師 | 7,039 | 6 | 考選部 |
| `lawyer` | 律師 | 3,408 | 4 | 考選部 |
| `cpa` | 會計師 | 1,034 | 3 | 考選部 |
| `nursing` | 護理師 | 10,070 | 5 | 考選部 |
| `doctor` | 醫師 | 8,848 | 5 | 考選部 |
| `counseling` | 諮商心理師 | 3,960 | 6 | 考選部 |
| `clinical` | 臨床心理師 | 5,640 | 6 | 考選部 |
| `teacher` | 教師檢定 | 3,194 | 21 | 教育部 |
| `gsat` | 學科能力測驗 | 1,258 | 6 | 大學入學考試中心 |
| `cap` | 國中教育會考 | 1,080 | 5 | 國中教育會考推動工作委員會 |

## 注意

`parse: "review"` 的題目仍留在檔案裡，取用時請自行過濾；它們多半是原始試題
含圖而圖檔尚未回補，或版面造成選項解析待確認。直接全量取用會混入這些題。
