'use strict';
/* ============================================================
   開卷有益｜國考自學系統(統一站)— 考試清單 manifest + 當前考試決定。

   設計:一份引擎跑多科。**凡是「每個考試／每個國家會不同」的東西,一律收斂在
   這份 manifest,引擎(app.js/index.html 等)零寫死**——科目清單與說明、localStorage
   前綴、顯示名、主管機關、法規體系、題庫出處、landing 卡片資料。切換考試 = 換
   localStorage 命名空間 + 重載資料,各科進度以 prefix 天然隔離、互不污染。

   ⚠️ 必須在所有其他 <script> 之前載入:app.js 啟動時(var PREFIX / SUBJECTS /
   SUBJECT_NOTES 與 var state = loadState())即需要 EXAM。ES5 全域風格(無 import/export)。

   ➕ 新增一個考試(甚至不同國家):在 EXAMS 加一筆 + 放 data/<key>/ 題庫即可,
   不必改任何引擎程式碼或 HTML。科目數、機構名、法規體系、landing 卡片都從這裡長出來。

   共用槓桿:同一題若跨考試共用,於題庫層用 exams:[key,...] 陣列標屬多科 + 去重;
   現階段 5 科各自獨立出題、實測零題重疊,故每科一份資料、按考試分檔載入。
   ============================================================ */

/* 每科欄位:
   key/prefix/name/short    識別、localStorage 前綴、全名、選擇器短名
   subjects[] / notes{}     科目清單(科數 = subjects.length,引擎一律動態算)、各科說明
   authority                出題/主管機關(地域可配置;免責與出處文案用它)
   jurisdiction             作答查證對象的法規體系(地域可配置)
   sourceName               題庫出處全名(footer/landing)
   category/count/blurb     landing 卡片:類別、歷屆題數、一句簡述
   hasEra(選)               題庫含法規時效題(舊年度 legacy + 時效提示),目前僅 cpa
   hasEssay:false(選)       純測驗題考試(無申論),隱藏申論分頁,目前僅 nursing
   coverageNote/staleNote(選) 該考試專屬說明(選擇題涵蓋範圍、時效提醒),有才顯示
*/
var EXAMS = [
  {
    key: 'social-worker', prefix: 'swk_', name: '社會工作師', short: '社工師',
    authority: '考選部', jurisdiction: '中華民國法規',
    sourceName: '考選部「國家考試試題及測驗式試題答案」開放資料',
    category: '社會福利', count: 7039,
    blurb: '社工、直接服務、人類行為、研究方法、社會政策立法、社工管理。',
    subjects: ['社會工作', '社會工作直接服務', '人類行為與社會環境',
      '社會工作研究方法', '社會政策與社會立法', '社會工作管理'],
    notes: {
      '社會工作': '總論：專業發展史、理論視角、價值與倫理、台灣社工制度脈絡。',
      '社會工作直接服務': '個案、團體、社區三大方法的實務流程、會談技巧與處遇模式。',
      '人類行為與社會環境': '生命週期發展、心理學理論、家庭與社會系統對行為的影響。',
      '社會工作研究方法': '量化與質性設計、抽樣、測量、信效度、基礎統計判讀、研究倫理。',
      '社會政策與社會立法': '福利政策理念與現行法規：社會救助、社會保險、各類福利服務法。',
      '社會工作管理': '組織理論、方案設計與評估、督導、人力資源與財務管理。'
    }
  },
  {
    key: 'lawyer', prefix: 'law_', name: '律師', short: '律師',
    authority: '考選部', jurisdiction: '中華民國法規',
    sourceName: '考選部「國家考試試題及測驗式試題答案」開放資料',
    category: '法律', count: 3408,
    blurb: '公法、刑事法、民事法、商事法 —— 第一試綜合法學選擇題。',
    subjects: ['公法', '刑事法', '民事法', '商事法'],
    notes: {
      '公法': '憲法、行政法、國際公法、國際私法 —— 綜合法學（一）的公法部分。',
      '刑事法': '刑法、刑事訴訟法與法律倫理 —— 綜合法學（一）的刑事部分。',
      '民事法': '民法、民事訴訟法 —— 綜合法學（二）的民事部分。',
      '商事法': '公司法、保險法、票據法、證券交易法、強制執行法、法學英文 —— 綜合法學（二）的商事部分。'
    }
  },
  {
    key: 'cpa', prefix: 'cpa_', name: '會計師', short: '會計師', hasEra: true,
    authority: '考選部', jurisdiction: '中華民國法規',
    sourceName: '考選部「國家考試試題及測驗式試題答案」開放資料',
    category: '財經', count: 1034,
    blurb: '中級會計學、稅務法規、審計學 —— 選擇題；其餘科目以申論練習。',
    subjects: ['中級會計學', '稅務法規', '審計學'],
    notes: {
      '中級會計學': '財務報表編製、各類資產負債與權益的認列與衡量，以現行 IFRS／我國會計準則為準。',
      '稅務法規': '所得稅、營業稅、遺贈稅等稅法的適用、計算與申報，以現行稅法及解釋函令為準。',
      '審計學': '查核規劃、內部控制評估、查核證據與查核報告，以現行審計準則公報為準。'
    },
    /* cpa 專屬:會計師應試科目多,但選擇題題庫只涵蓋這三科;其餘科以申論／計算練習。
       使用說明會條件顯示這兩段(其他考試的選擇題已涵蓋該類科全部科目,故無此欄)。 */
    coverageNote: '選擇題只涵蓋中級會計學、稅務法規、審計學三科；高等會計學、成本與管理會計、公司法證交法商業會計法、國文等以申論／計算練習（涵蓋度評分）。',
    staleNote: '中會／高會涉 IFRS、稅務／公司法涉稅法商法 —— 準則與法規會修訂，舊年度題目的答案可能與現行不符，作答與引用一律以現行版本為準。'
  },
  {
    key: 'nursing', prefix: 'nur_', name: '護理師', short: '護理師', hasEssay: false,
    authority: '考選部', jurisdiction: '中華民國法規',
    sourceName: '考選部「國家考試試題及測驗式試題答案」開放資料',
    category: '醫護', count: 10070,
    blurb: '基礎醫學、基本護理、內外科、產兒科、精神科與社區衛生 —— 五科純文字選擇題，涵蓋 101～115 年歷屆。',
    subjects: ['基礎醫學（包括解剖學、生理學、病理學、藥理學、微生物學與免疫學）',
      '基本護理學（包括護理原理、護理技術）與護理行政', '內外科護理學',
      '產兒科護理學', '精神科與社區衛生護理學'],
    notes: {
      '基礎醫學（包括解剖學、生理學、病理學、藥理學、微生物學與免疫學）': '解剖學、生理學、病理學、藥理學、微生物學與免疫學 —— 104 年第二次起新增的綜合基礎醫學科目（早年考卷無此科）。',
      '基本護理學（包括護理原理、護理技術）與護理行政': '護理原理與技術（無菌、給藥、生命徵象、傷口、營養與排泄等）與護理行政、品質管理。',
      '內外科護理學': '成人內外科各系統疾病的病理、評估與護理處置 —— 護理師選擇題分量最重的一科。',
      '產兒科護理學': '孕產期母體與新生兒，以及嬰幼兒至兒童的生長發展、常見疾病與護理。',
      '精神科與社區衛生護理學': '精神疾患的症狀與照護，以及社區與公共衛生護理、相關衛生政策。'
    }
  },
  {
    key: 'doctor', prefix: 'med_', name: '醫師', short: '醫師', hasEssay: false,
    authority: '考選部', jurisdiction: '中華民國法規',
    sourceName: '考選部「國家考試試題及測驗式試題答案」開放資料',
    category: '醫護', count: 8848,
    blurb: '醫學（一）～（五）—— 第一階段基礎醫學、第二階段臨床醫學（內、外、婦、兒等），純選擇題，涵蓋 104～115 年歷屆。',
    subjects: [
      '醫學（一）（包括生物化學、解剖學、胚胎及發育生物學、組織學、生理學等科目知識及其臨床之應用）',
      '醫學（二）（包括微生物免疫學、寄生蟲學、藥理學、病理學、公共衛生學等科目知識及其臨床之應用）',
      '醫學（三）（包括內科、家庭醫學科等科目及其相關臨床實例與醫學倫理）',
      '醫學（四）（包括小兒科、皮膚科、神經科、精神科等科目及其相關臨床實例與醫學倫理）',
      '醫學（五）（包括外科、骨科、泌尿科等科目及其相關臨床實例與醫學倫理）'
    ],
    notes: {
      '醫學（一）（包括生物化學、解剖學、胚胎及發育生物學、組織學、生理學等科目知識及其臨床之應用）': '第一階段基礎醫學（上）：生物化學、解剖學、胚胎與發育生物學、組織學、生理學及其臨床應用。',
      '醫學（二）（包括微生物免疫學、寄生蟲學、藥理學、病理學、公共衛生學等科目知識及其臨床之應用）': '第一階段基礎醫學（下）：微生物免疫學、寄生蟲學、藥理學、病理學、公共衛生學及其臨床應用。',
      '醫學（三）（包括內科、家庭醫學科等科目及其相關臨床實例與醫學倫理）': '第二階段臨床醫學：內科、家庭醫學科等，含臨床實例與醫學倫理。',
      '醫學（四）（包括小兒科、皮膚科、神經科、精神科等科目及其相關臨床實例與醫學倫理）': '第二階段臨床醫學：小兒科、皮膚科、神經科、精神科等，含臨床實例與醫學倫理。',
      '醫學（五）（包括外科、骨科、泌尿科等科目及其相關臨床實例與醫學倫理）': '第二階段臨床醫學：外科、骨科、泌尿科等，含臨床實例與醫學倫理。'
    }
  },
  {
    key: 'counseling', prefix: 'cou_', name: '諮商心理師', short: '諮商心理師',
    authority: '考選部', jurisdiction: '中華民國法規',
    sourceName: '考選部「國家考試試題及測驗式試題答案」開放資料',
    category: '心理', count: 3960,
    blurb: '104–114 年歷屆，涵蓋心理學基礎、諮商理論、實務與倫理、變態心理、心理衡鑑、團體諮商。',
    subjects: ['諮商的心理學基礎', '諮商與心理治療理論', '諮商與心理治療實務與專業倫理',
      '心理健康與變態心理學', '個案評估與心理衡鑑', '團體諮商與心理治療'],
    notes: {
      '諮商的心理學基礎': '人類發展、社會心理、學習與認知、人格與情緒等心理學基礎 —— 諮商實務的學理地基。',
      '諮商與心理治療理論': '精神分析、個人中心、認知行為、後現代等各家學派的核心概念與技術。',
      '諮商與心理治療實務與專業倫理': '會談歷程、個案概念化與處遇，以及諮商專業倫理與法規。',
      '心理健康與變態心理學': '心理健康促進，以及各類心理疾患的症狀、成因與分類（以現行 DSM 為準）。',
      '個案評估與心理衡鑑': '初談、心理測驗、衡鑑工具的選用與結果解釋，以及評估報告撰寫。',
      '團體諮商與心理治療': '團體的階段歷程、領導技術、團體動力與不同取向的團體實務。'
    }
  },
  {
    key: 'clinical', prefix: 'clin_', name: '臨床心理師', short: '臨床心理師',
    authority: '考選部', jurisdiction: '中華民國法規',
    sourceName: '考選部「國家考試試題及測驗式試題答案」開放資料',
    category: '心理', count: 5640,
    blurb: '101–114 年歷屆，涵蓋臨床心理學基礎、總論（病理／衡鑑）、特論（治療／神經／倫理）。',
    subjects: ['臨床心理學基礎', '臨床心理學總論（一）', '臨床心理學總論（二）',
      '臨床心理學特論（一）', '臨床心理學特論（二）', '臨床心理學特論（三）'],
    notes: {
      '臨床心理學基礎': '生理心理、認知、情緒、人格與發展等心理學基礎 —— 臨床心理工作的學理地基。',
      '臨床心理學總論（一）': '心理病理與變態心理學，各類心理疾患的症狀、成因與分類（以現行 DSM 為準）。',
      '臨床心理學總論（二）': '心理衡鑑與心理測驗，衡鑑工具的選用、施測、計分與結果解釋。',
      '臨床心理學特論（一）': '心理治療與處遇的各家學派理論、技術與療效實證。',
      '臨床心理學特論（二）': '臨床健康心理、神經心理與身心疾病的評估與介入。',
      '臨床心理學特論（三）': '臨床專業倫理、法規、社區與跨領域合作等實務議題。'
    }
  },
  {
    key: 'teacher', prefix: 'tea_', name: '教師資格考試', short: '教檢', hasEssay: false,
    authority: '教育部',
    jurisdiction: '教育法規與課綱',
    sourceName: '教育部教師資格考試歷屆試題（受託國立臺灣師範大學心理與教育測驗研究發展中心）',
    sourceLicense: '國教院公開試題・著作權法 §9 法定豁免',
    category: '教育', count: 3194,
    blurb: '幼兒園／特教身障／特教資優／國小／中等五類科 —— 110～115 年素養導向新制的選擇題，涵蓋國語文、學習者發展、教育理念、課程教學（國小另含數學）。',
    coverageNote: '本題庫僅收錄各卷「選擇題」；教檢部分科目另有綜合題／問答題未收錄。科目以「類科・科目」標示，依你報考的類科篩選（如報考國小就看「國小・」開頭五科）。',
    subjects: [
      '幼兒園・國語文能力測驗', '幼兒園・學習者發展與適性輔導', '幼兒園・教育理念與實務', '幼兒園・課程教學與評量',
      '特教身障・國語文能力測驗', '特教身障・學習者發展與適性輔導', '特教身障・教育理念與實務', '特教身障・課程教學與評量',
      '特教資優・國語文能力測驗', '特教資優・學習者發展與適性輔導', '特教資優・教育理念與實務', '特教資優・課程教學與評量',
      '國小・國語文能力測驗', '國小・學習者發展與適性輔導', '國小・教育理念與實務', '國小・數學能力測驗', '國小・課程教學與評量',
      '中等・國語文能力測驗', '中等・學習者發展與適性輔導', '中等・教育理念與實務', '中等・課程教學與評量'
    ],
    notes: {
      '幼兒園・國語文能力測驗': '字詞、閱讀理解、國學與文法常識、寫作基礎 —— 教師應具備的國語文能力。',
      '幼兒園・學習者發展與適性輔導': '幼兒身心發展、學習與班級經營、輔導原理與適性教育。',
      '幼兒園・教育理念與實務': '教育原理與哲學、制度與政策法規、當代教育議題與實務。',
      '幼兒園・課程教學與評量': '課程設計與發展、教學方法與策略、學習評量與素養導向命題。',
      '特教身障・國語文能力測驗': '字詞、閱讀理解、國學與文法常識、寫作基礎 —— 教師應具備的國語文能力。',
      '特教身障・學習者發展與適性輔導': '身心障礙學生的身心發展、鑑定與評量、個別化教育（IEP）與適性輔導。',
      '特教身障・教育理念與實務': '教育原理與哲學、制度與政策法規、當代教育議題與實務。',
      '特教身障・課程教學與評量': '課程設計與發展、教學方法與策略、學習評量與素養導向命題。',
      '特教資優・國語文能力測驗': '字詞、閱讀理解、國學與文法常識、寫作基礎 —— 教師應具備的國語文能力。',
      '特教資優・學習者發展與適性輔導': '資賦優異學生的身心特質、鑑定與評量、充實與加速課程及適性輔導。',
      '特教資優・教育理念與實務': '教育原理與哲學、制度與政策法規、當代教育議題與實務。',
      '特教資優・課程教學與評量': '課程設計與發展、教學方法與策略、學習評量與素養導向命題。',
      '國小・國語文能力測驗': '字詞、閱讀理解、國學與文法常識、寫作基礎 —— 教師應具備的國語文能力。',
      '國小・學習者發展與適性輔導': '國小學童身心發展、學習與班級經營、輔導原理與適性教育。',
      '國小・教育理念與實務': '教育原理與哲學、制度與政策法規、當代教育議題與實務。',
      '國小・數學能力測驗': '國小教師應具備的數學概念、運算與解題能力（僅國小類科有此科）。',
      '國小・課程教學與評量': '課程設計與發展、教學方法與策略、學習評量與素養導向命題。',
      '中等・國語文能力測驗': '字詞、閱讀理解、國學與文法常識、寫作基礎 —— 教師應具備的國語文能力。',
      '中等・學習者發展與適性輔導': '中等學校青少年身心發展、學習與班級經營、輔導原理與適性教育。',
      '中等・教育理念與實務': '教育原理與哲學、制度與政策法規、當代教育議題與實務。',
      '中等・課程教學與評量': '課程設計與發展、教學方法與策略、學習評量與素養導向命題。'
    }
  },
  {
    key: 'gsat', prefix: 'gsat_', name: '學科能力測驗', short: '學測', hasEssay: true,
    authority: '大學入學考試中心', jurisdiction: '中華民國',
    sourceName: '大考中心 學測歷年試題（依著作權法 §9，考試試題不受著作權保護）',
    sourceLicense: '大考中心公開試題・著作權法 §9 法定豁免',
    category: '升學', count: 1258,
    blurb: '國綜、數學 A／B、社會、自然、英文 —— 111–115 年學測歷屆，含國寫申論。',
    subjects: ['國綜', '數學A', '數學B', '社會', '自然', '英文'],
    notes: {
      '國綜': '國語文綜合能力測驗：閱讀理解、文意推論、語文知識與跨領域素養題。',
      '數學A': '數學 A 卷（自然組導向），含進階單元，多圖表與情境素養題。',
      '數學B': '數學 B 卷（社會組導向），偏應用與資料判讀。',
      '社會': '歷史、地理、公民與社會綜合，重資料閱讀與跨科素養。',
      '自然': '物理、化學、生物、地科綜合，重圖表判讀與探究實作。',
      '英文': '詞彙、綜合測驗、文意選填、閱讀測驗與混合題。'
    }
  },
  {
    key: 'cap', prefix: 'cap_', name: '國中教育會考', short: '會考', hasEssay: true,
    authority: '國中教育會考推動工作委員會', jurisdiction: '中華民國',
    sourceName: '心測中心 會考歷屆試題（依著作權法 §9，考試試題不受著作權保護）',
    sourceLicense: '心測中心公開試題・著作權法 §9 法定豁免',
    category: '升學', count: 1080,
    blurb: '國文、數學、社會、自然、英語 —— 111–115 年會考歷屆，含寫作測驗。',
    subjects: ['國文', '數學', '社會', '自然', '英語'],
    notes: {
      '國文': '白話與文言閱讀、字音字形、語文表達與題組閱讀。',
      '數學': '數與量、代數、幾何、統計機率，含非選擇計算題。',
      '社會': '歷史、地理、公民綜合，重圖表與時事素養。',
      '自然': '生物、理化、地科綜合，重實驗與圖表判讀。',
      '英語': '詞彙、對話、短文與題組閱讀。'
    }
  }
];

/* 官方考試時間（分）與官方卷選擇題數 —— 國考來源：考選部「應試科目及考試日程表」；
   升學來源：大學入學考試中心（學測）、國中教育會考（教育部）官方考試日程表（2026-06 查證）。
   供倒數計時與模擬擬真題數用；計時時間模型見 docs/adr/0001-mcq-timer-time-model.md。
   type：mcq＝純測驗式、mixed＝申論／非選與測驗混合式（混合式官方時間含非選，題庫已 inline）。
   size＝該科一份卷的代表題數（選擇＋非選），讓整卷原卷倒數≈官方時間、模擬子集按比例縮放。
   uniform 全科一致用 {minutes,size}；各科不同用 bySubject。 */
var EXAM_OFFICIAL = {
  'nursing':       { type: 'mcq',   minutes: 60,  size: 50 },
  'social-worker': { type: 'mixed', minutes: 120, size: 40 },
  'counseling':    { type: 'mixed', minutes: 120, size: 40 },
  'clinical':      { type: 'mixed', minutes: 120, size: 40 },
  'lawyer': { type: 'mcq', bySubject: {
    '公法':   { minutes: 90,  size: 75 },
    '刑事法': { minutes: 90,  size: 75 },
    '民事法': { minutes: 100, size: 80 },
    '商事法': { minutes: 80,  size: 70 }
  } },
  'cpa': { type: 'mixed', bySubject: {
    '中級會計學': { minutes: 180, size: 25 },
    '審計學':     { minutes: 180, size: 25 },
    '稅務法規':   { minutes: 120, size: 25 }
  } },
  /* 學測（大考中心）作答時間：國綜/國寫 90、英文/數A/數B 100、社會/自然 110 分。
     size＝近年一份卷選擇＋非選代表題數。 */
  'gsat': { type: 'mixed', bySubject: {
    '國綜':  { minutes: 90,  size: 36 },
    '英文':  { minutes: 100, size: 53 },
    '數學A': { minutes: 100, size: 20 },
    '數學B': { minutes: 100, size: 20 },
    '社會':  { minutes: 110, size: 65 },
    '自然':  { minutes: 110, size: 56 }
  } },
  /* 會考（教育部）作答時間：國文 70、英語閱讀 60、數學 80、社會 70、自然 70 分。
     英語聽力 25 分另計、不在題庫；數學含 2 題非選（手寫計算）。 */
  'cap': { type: 'mixed', bySubject: {
    '國文': { minutes: 70, size: 42 },
    '英語': { minutes: 60, size: 43 },
    '數學': { minutes: 80, size: 27 },
    '社會': { minutes: 70, size: 54 },
    '自然': { minutes: 70, size: 50 }
  } }
};
/* 取某考試某科的官方 {minutes,size}；找不到回 null。計時（P2）與模擬擬真預設會用。 */
function examOfficial(examKey, subject) {
  var o = EXAM_OFFICIAL[examKey];
  if (!o) { return null; }
  if (o.bySubject) { return o.bySubject[subject] || null; }
  return { minutes: o.minutes, size: o.size };
}
/* 計時時間模型（見 ADR-0001，暫定）。回 {fullMins, suggestMins} 或 null（無官方資料→不計時）。
   - suggestMins＝題數 × 1.2（選擇題建議節奏，純測驗官方分/題經驗值）。
   - fullMins＝Σ各科 題數×(官方分/官方題數)：混合式含申論緩衝（120/40＝3 分/題）、純測驗≈建議時間。
   兩段式倒數：倒數總長＝fullMins、過 suggestMins 後轉紅提示（吃進申論時段）、僅 fullMins 到 0 強制交卷。 */
var MCQ_MIN_PER_Q = 1.2;   // 見 ADR-0001
function examTiming(questions) {
  if (!questions || !questions.length) { return null; }
  var bySub = {};
  questions.forEach(function (q) { bySub[q.subject] = (bySub[q.subject] || 0) + 1; });
  var full = 0, ok = true;
  Object.keys(bySub).forEach(function (s) {
    var o = examOfficial(EXAM.key, s);
    if (!o || !o.size) { ok = false; return; }
    full += bySub[s] * (o.minutes / o.size);
  });
  if (!ok) { return null; }
  return { fullMins: Math.round(full), suggestMins: Math.round(questions.length * MCQ_MIN_PER_Q) };
}
/* 整個考試的「典型卷大小」＝模擬擬真預設題數（取代寫死的 40）。uniform 直接回；bySubject 取最大值（最接近真實整卷上限）。 */
function examMockSize(examKey) {
  var o = EXAM_OFFICIAL[examKey];
  if (!o) { return 40; }
  if (!o.bySubject) { return o.size || 40; }
  var max = 0, k;
  for (k in o.bySubject) { if (o.bySubject[k].size > max) { max = o.bySubject[k].size; } }
  return max || 40;
}

var CURRENT_EXAM_KEY = 'obig_current_exam';

function examByKey(k) {
  for (var i = 0; i < EXAMS.length; i++) { if (EXAMS[i].key === k) { return EXAMS[i]; } }
  return null;
}

/* 當前考試:?exam= / #exam= 深連結優先,其次 localStorage,最後預設第一科。 */
function pickExam() {
  var k = null;
  try {
    var qs = (location.search || '').match(/[?&]exam=([^&]+)/);
    var hs = (location.hash || '').match(/exam=([^&]+)/);
    if (qs) { k = decodeURIComponent(qs[1]); }
    else if (hs) { k = decodeURIComponent(hs[1]); }
    else { k = localStorage.getItem(CURRENT_EXAM_KEY); }
  } catch (e) { /* file:// 下 localStorage 可能受限,落到預設 */ }
  return examByKey(k) || EXAMS[0];
}

var EXAM = pickExam();

/* 科數中文標籤:統一從 subjects.length 動態生成,絕不寫死「六科」之類。
   不同考試(3~多科)、甚至單科都語意正確。 */
function subjectCountLabel() { return EXAM.subjects.length + ' 科'; }

/* 紀年標籤:題卡 meta、年份選單、歷史紀錄一律呼叫此 helper,別寫死「民國」。
   台灣國考預設「民國」;不同國家在該考試 manifest 設 eraLabel 覆寫
   (設 '' = 西元無前綴,例如日本可設 '' 或 '令和')。 */
function yearLabel(y) {
  var era = (EXAM.eraLabel != null) ? EXAM.eraLabel : '民國';
  return era ? (era + ' ' + y + ' 年') : (y + ' 年');
}

/* 切換考試:記住選擇 → 重載(最簡單可靠,避免跨科狀態殘留)。 */
function setExam(key) {
  if (!examByKey(key) || key === EXAM.key) { return; }
  try { localStorage.setItem(CURRENT_EXAM_KEY, key); } catch (e) { /* 容量/權限失敗則靠 hash 帶 */ }
  location.hash = 'exam=' + key;
  location.reload();
}

/* 資料 URL:每科一個子目錄,檔名不變(bank/relations/explanations/essays/essay_samples)。 */
function dataUrl(name) { return '../data/' + EXAM.key + '/' + name; }

/* 千分位(ES5):7039 → "7,039" */
function _comma(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* HTML 裡用 data-exam-field 標記「會隨考試/國家不同」的詞,JS 載入時填當前值。
   HTML 寫預設值供 SEO/無 JS 可讀,JS 再覆寫成 EXAM 的實際值 → 不同考試自動正確。 */
function _examFieldMap() {
  return {
    name: EXAM.name,
    subjectCount: subjectCountLabel(),       /* 「6 科」 */
    subjectCountNum: String(EXAM.subjects.length),
    examCount: String(EXAMS.length),         /* landing「N 大類科」 */
    authority: EXAM.authority,
    jurisdiction: EXAM.jurisdiction,
    sourceName: EXAM.sourceName,
    sourceLicense: EXAM.sourceLicense || 'dataset 170565,OGDL 授權'
  };
}

/* 從 manifest 生成一張 landing 考試卡片(用 createElement,避免 innerHTML)。 */
function _buildExamCard(e) {
  var a = document.createElement('a');
  a.className = 'exam-card';
  a.href = 'web/index.html?exam=' + e.key;
  function add(tag, cls, text) { var n = document.createElement(tag); if (cls) { n.className = cls; } n.textContent = text; a.appendChild(n); return n; }
  add('span', 'cat', e.category);
  add('h2', null, e.name);
  add('p', 'meta', e.subjects.length + ' 科 ・ 歷屆 ' + _comma(e.count) + ' 題');
  add('p', 'desc', e.blurb);
  add('span', 'go', '進入練習 →');
  return a;
}

/* 兩大類別:landing「最初首頁」先顯示這兩格,點進去才看該類別的考試。
   分組依 category：升學(學測/會考)歸 shengxue,其餘歸 kaogao(國家考試)。 */
var EXAM_GROUPS = [
  { id: 'kaogao', name: '國家考試', blurb: '社工師、律師、會計師、醫師、護理師、諮商與臨床心理師、教師資格考試 —— 考選部與教育部歷屆國家考試。' },
  { id: 'shengxue', name: '升學', blurb: '學測、會考 —— 大考中心與國中教育會考歷屆。' }
];
function examGroup(e) { return (e.category === '升學') ? 'shengxue' : 'kaogao'; }
function examsInGroup(gid) { return EXAMS.filter(function (e) { return examGroup(e) === gid; }); }
function groupById(id) {
  for (var i = 0; i < EXAM_GROUPS.length; i++) { if (EXAM_GROUPS[i].id === id) { return EXAM_GROUPS[i]; } }
  return null;
}

/* 第一層類別卡片(國考/升學);點擊改 hash #group=<id> → renderLanding 換成該類別的考試卡。 */
function _buildGroupCard(g) {
  var exs = examsInGroup(g.id);
  var totalQ = exs.reduce(function (s, e) { return s + (e.count || 0); }, 0);
  var a = document.createElement('a');
  a.className = 'exam-card group-card';
  a.href = 'index.html#group=' + g.id;
  function add(tag, cls, text) { var n = document.createElement(tag); if (cls) { n.className = cls; } n.textContent = text; a.appendChild(n); return n; }
  add('span', 'cat', '類別');
  add('h2', null, g.name);
  add('p', 'meta', exs.length + ' 類科 ・ 歷屆 ' + _comma(totalQ) + ' 題');
  add('p', 'desc', g.blurb);
  add('span', 'go', '進入 →');
  return a;
}

/* landing 兩層渲染:無 #group → 兩大類別格;#group=<id> → 該類別的考試卡 + 返回鏈結。
   只在根 index.html(有 #exam-grid)生效;引擎頁無此容器,提早返回。 */
function renderLanding() {
  var grid = document.getElementById('exam-grid');
  if (!grid) { return; }
  while (grid.firstChild) { grid.removeChild(grid.firstChild); }
  var m = (location.hash || '').match(/group=([a-z]+)/);
  var g = m ? groupById(m[1]) : null;
  if (g) {
    var back = document.createElement('a');
    back.className = 'group-back-link';
    back.href = 'index.html';
    back.textContent = '← 返回（國考／升學）';
    back.style.gridColumn = '1 / -1';
    grid.appendChild(back);
    examsInGroup(g.id).forEach(function (e) { grid.appendChild(_buildExamCard(e)); });
  } else {
    EXAM_GROUPS.forEach(function (gg) { grid.appendChild(_buildGroupCard(gg)); });
  }
}

/* 設標題/科名 + 渲染考試選擇器 + 填 data-exam-field + 生成 landing 卡片 + 收掉不適用 UI。
   本檔以 defer 最先載入,執行時 document 已解析完成,可直接操作 DOM。
   同時服務「引擎頁(web/index.html)」與「landing(根 index.html)」——靠元素存在與否分流。 */
(function renderExamChrome() {
  /* 引擎頁:標題 + 回首頁按鈕（中性:只掛考試名,不寫死「國考」,因含學測/會考） */
  var fullName = '開卷有益｜' + EXAM.name;
  var h1btn = document.getElementById('home-title');
  if (h1btn) {
    try { document.title = fullName; } catch (e) { /* noop */ }
    h1btn.textContent = fullName;
  }

  /* 引擎頁:考試選擇器 */
  var sw = document.getElementById('exam-switcher');
  if (sw) {
    /* 切換器只列同類別的考試(國考內切國考、升學內切學測/會考);跨類別走標題回最初首頁。 */
    examsInGroup(examGroup(EXAM)).forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'exam-btn' + (e.key === EXAM.key ? ' active' : '');
      b.textContent = e.short;
      b.setAttribute('data-exam', e.key);
      b.setAttribute('title', e.name);
      if (e.key === EXAM.key) { b.setAttribute('aria-current', 'page'); }
      b.addEventListener('click', function () { setExam(e.key); });
      sw.appendChild(b);
    });
  }

  /* 共用:填所有 data-exam-field(科數、機構、法規體系、出處)成當前考試的值 */
  var map = _examFieldMap();
  var fields = document.querySelectorAll('[data-exam-field]');
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i].getAttribute('data-exam-field');
    if (map[f] != null) { fields[i].textContent = map[f]; }
  }

  /* landing:兩層(類別→考試),依 #group hash 切換;hashchange 重渲不重載。 */
  if (document.getElementById('exam-grid')) {
    renderLanding();
    window.addEventListener('hashchange', renderLanding);

    /* PWA:在根 landing 頁註冊 SW(此頁不載 app.js,故在這裡補一支最小註冊,
       讓「第一次就直接開 landing」的使用者也能取得離線快取;scope=/ 涵蓋全站。
       app 頁的完整註冊(含溫和更新提示)在 app.js;register 同 URL 為冪等,不衝突)。 */
    if ('serviceWorker' in navigator &&
        (location.protocol === 'http:' || location.protocol === 'https:')) {
      navigator.serviceWorker.register('/sw.js').catch(function () { /* 失敗安靜略過 */ });
    }
  }

  /* 引擎頁:「納入舊年度歷史題庫」只對有法規時效的考試(cpa)有意義,其餘科隱藏。 */
  if (!EXAM.hasEra) {
    var lg = document.getElementById('legacy-row');
    if (lg) { lg.style.display = 'none'; }
  }

  /* 申論題分頁:純測驗題考試(manifest 設 hasEssay:false,如護理師無申論)隱藏該分頁。 */
  if (EXAM.hasEssay === false) {
    var et = document.getElementById('tab-essay');
    if (et) { et.style.display = 'none'; }
    var ep = document.getElementById('panel-essay');
    if (ep) { ep.hidden = true; }
  }
})();
