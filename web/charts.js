'use strict';
/* 純 SVG 手刻圖表(無任何圖表庫):能力雷達(輻條依科數動態)、近 30 天趨勢折線、
   歷年題量長條。依賴 app.js 的全域($、el、pct、SUBJECTS、subjectStats、
   state、bank、TREND_DAYS、todayStr、addDays);兩檔皆 defer,
   呼叫發生在 DOMContentLoaded 之後,順序安全。 */

function svgEl(tag, attrs) {
  var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) { Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); }); }
  return node;
}

/* ===================== 能力雷達(輻條依科數均分,支援任意科數) ===================== */
function radarPoint(cx, cy, r, i) {
  /* 角度依 SUBJECTS.length 動態均分 —— 3 科正三角、4 科正方、6 科正六邊、8 科正八邊…
     絕不寫死六角(否則 3/4/8 科會畫歪、超過 6 科還會疊軸)。 */
  var ang = -Math.PI / 2 + i * 2 * Math.PI / SUBJECTS.length;
  return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
}

/* 把各科雷達畫進指定容器(能力雷達面板與入學診斷結果共用)。
   雷達至少要 3 軸才有意義;科數 <3(例如單科考試)時不畫雷達,改提示看下方各科表格。 */
function drawRadarInto(box, stats) {
  box.textContent = '';
  if (SUBJECTS.length < 3) {
    box.appendChild(el('p', { 'class': 'subtitle' }, '科目數少於 3，雷達圖不適用；各科正確率請見下方表格。'));
    return;
  }
  var W = 380, H = 330, cx = 190, cy = 168, R = 110;
  var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img',
    'aria-label': '各科正確率雷達圖' });
  [0.25, 0.5, 0.75, 1].forEach(function (k) {
    var pts = SUBJECTS.map(function (_, i) { return radarPoint(cx, cy, R * k, i).join(','); });
    svg.appendChild(svgEl('polygon', { points: pts.join(' '), 'class': 'svg-grid' }));
  });
  /* 60% 及格參考線(虛線) */
  var passPts = SUBJECTS.map(function (_, i) { return radarPoint(cx, cy, R * 0.6, i).join(','); });
  svg.appendChild(svgEl('polygon', { points: passPts.join(' '), 'class': 'svg-data-2' }));
  var dataPts = [];
  SUBJECTS.forEach(function (sub, i) {
    var outer = radarPoint(cx, cy, R, i);
    svg.appendChild(svgEl('line', { x1: cx, y1: cy, x2: outer[0], y2: outer[1], 'class': 'svg-spoke' }));
    var lp = radarPoint(cx, cy, R + 16, i);
    var anchor = (Math.abs(lp[0] - cx) < 8) ? 'middle' : (lp[0] > cx ? 'start' : 'end');
    var t = stats[sub];
    var acc = (t.n > 0) ? t.ok / t.n : 0;
    var label = svgEl('text', { x: lp[0], y: lp[1] + 4, 'text-anchor': anchor, 'class': 'svg-label' });
    label.textContent = sub + ' ' + (t.n > 0 ? pct(acc) : '—');
    svg.appendChild(label);
    dataPts.push(radarPoint(cx, cy, R * acc, i).join(','));
  });
  svg.appendChild(svgEl('polygon', { points: dataPts.join(' '), 'class': 'svg-data' }));
  box.appendChild(svg);
}

/* ===================== 圓形進度圖(落點儀表) =====================
   環形進度:外圈淡軌 + 依比例填的弧 + 圓心百分比。big 顯示「XX%」,small 是標籤。 */
function gaugeSvg(ratio, big, small, cls) {
  ratio = Math.max(0, Math.min(1, ratio || 0));
  var sz = 122, cx = 61, cy = 61, r = 48, C = 2 * Math.PI * r;
  var svg = svgEl('svg', { viewBox: '0 0 ' + sz + ' ' + sz, role: 'img',
    'aria-label': small + ' ' + big });
  svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: r, 'class': 'gauge-track' }));
  svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: r,
    'class': 'gauge-fill ' + (cls || ''),
    'stroke-dasharray': (ratio * C).toFixed(2) + ' ' + C.toFixed(2),
    transform: 'rotate(-90 ' + cx + ' ' + cy + ')' }));
  var t1 = svgEl('text', { x: cx, y: cy + 2, 'text-anchor': 'middle', 'class': 'gauge-big' });
  t1.textContent = big;
  var t2 = svgEl('text', { x: cx, y: cy + 22, 'text-anchor': 'middle', 'class': 'gauge-small' });
  t2.textContent = small;
  svg.appendChild(t1); svg.appendChild(t2);
  return svg;
}
function gaugeBand(ratio) {
  if (ratio == null) { return 'gauge-empty'; }
  return ratio >= 0.6 ? 'gauge-ok' : (ratio >= 0.4 ? '' : 'gauge-low');
}
/* 落點儀表板:累積平均 + 近 20 題 兩個環形圖、單卷最佳/最低、題庫完成度進度條。
   資料只取 state.exams(考試形式整卷);隨手練不計入,故附誠實說明。 */
function renderLandingStats(box) {
  if (!box) { return; }
  box.textContent = '';
  var es = (typeof examStats === 'function') ? examStats(20) : null;
  var row = el('div', { 'class': 'gauge-row' });
  function card(ratio, label) {
    var c = el('div', { 'class': 'gauge-card' });
    c.appendChild(gaugeSvg(ratio == null ? 0 : ratio,
      ratio == null ? '—' : pct(ratio), label, gaugeBand(ratio)));
    return c;
  }
  row.appendChild(card(es ? es.cumAcc : null, '平均正確率'));
  row.appendChild(card(es ? es.rollingAcc : null, '近況・近 20 題'));
  box.appendChild(row);
  if (es && es.n > 0) {
    box.appendChild(el('p', { 'class': 'subtitle' },
      '單卷最佳 ' + pct(es.best) + '、最低 ' + pct(es.worst) + '(共 ' + es.n +
      ' 份考試形式整卷；「近況」取最近湊滿 ' + es.rollingN + ' 題的滾動正確率)。' +
      '長期平均分母大、動得慢，所以另看「近況」才看得出近期的進步。'));
  } else {
    box.appendChild(el('p', { 'class': 'subtitle' },
      '尚無「考試形式整卷」紀錄 —— 做一份歷屆原卷或完整模擬，這裡就會顯示你的落點。' +
      '單題練習、弱點殲滅、少量模擬等隨手練不計入平均，放心練（練越多越好）。'));
  }
  var done = (typeof completionCount === 'function') ? completionCount() : 0;
  var tot = (typeof usable !== 'undefined') ? usable.length : 0;
  box.appendChild(el('div', { 'class': 'progress-label' },
    '題庫完成度：已練過 ' + done + ' / 共 ' + tot + ' 題(' + (tot ? pct(done / tot) : '—') +
    ')；此處不分練習形式，碰過就算覆蓋。'));
  var wrap = el('div', { 'class': 'progress-wrap' });
  wrap.appendChild(el('div', { 'class': 'progress-fill',
    style: 'width:' + (tot ? Math.round(done / tot * 100) : 0) + '%' }));
  box.appendChild(wrap);
}

function renderRadar() {
  var stats = subjectStats(false);
  renderLandingStats($('landing-stats'));
  drawRadarInto($('radar-box'), stats);
  renderRadarTable(stats);
}

function renderRadarTable(stats) {
  var box = $('radar-table');
  box.textContent = '';
  var table = el('table'), thead = el('thead'), tr = el('tr');
  ['科目', '作答數', '正確率'].forEach(function (h, i) {
    tr.appendChild(el('th', i > 0 ? { 'class': 'num' } : null, h));
  });
  thead.appendChild(tr);
  table.appendChild(thead);
  var tb = el('tbody');
  SUBJECTS.forEach(function (sub) {
    var t = stats[sub], row = el('tr');
    row.appendChild(el('td', null, sub));
    row.appendChild(el('td', { 'class': 'num' }, String(t.n)));
    row.appendChild(el('td', { 'class': 'num' }, t.n > 0 ? pct(t.ok / t.n) : '—'));
    tb.appendChild(row);
  });
  table.appendChild(tb);
  box.appendChild(table);
}

/* ===================== 趨勢(近 30 天折線) ===================== */
function dailySeries() {
  var byDate = {};
  state.log.forEach(function (e) {
    if (!byDate[e.t]) { byDate[e.t] = { n: 0, ok: 0 }; }
    byDate[e.t].n += 1;
    if (e.correct) { byDate[e.t].ok += 1; }
  });
  var out = [], t = todayStr();
  for (var i = TREND_DAYS - 1; i >= 0; i--) {
    var d = addDays(t, -i);
    if (byDate[d]) { out.push({ date: d, idx: TREND_DAYS - 1 - i, n: byDate[d].n, ok: byDate[d].ok, acc: byDate[d].ok / byDate[d].n }); }
  }
  return out;
}

/* 趨勢面板:每日折線 ↔ 時段表現(上午/下午/晚上)切換 */
var trendMode = 'daily';
function renderTrendToggle() {
  var box = $('trend-toggle');
  if (!box) { return; }
  box.textContent = '';
  var seg = el('div', { 'class': 'segmented' });
  [['daily', '每日趨勢'], ['part', '時段表現']].forEach(function (m) {
    var b = el('button', { type: 'button' }, m[1]);
    b.setAttribute('aria-pressed', String(trendMode === m[0]));
    b.addEventListener('click', function () { trendMode = m[0]; renderTrend(); });
    seg.appendChild(b);
  });
  box.appendChild(seg);
}
function renderTrend() {
  renderTrendToggle();
  if (trendMode === 'part') { renderTimeParts(); return; }
  renderDailyTrend();
}

/* 上午(05–11)/下午(12–17)/晚上(18–04)各自的選擇題正確率(看你哪個時段狀態最好) */
function timePartStats() {
  var by = { '上午': { n: 0, ok: 0 }, '下午': { n: 0, ok: 0 }, '晚上': { n: 0, ok: 0 } };
  state.log.forEach(function (e) {
    if (e.mode === 'essay' || typeof e.correct !== 'boolean') { return; }
    var p = (typeof dayPart === 'function') ? dayPart(e.ts) : null;
    if (p && by[p]) { by[p].n += 1; if (e.correct) { by[p].ok += 1; } }
  });
  return by;
}
function renderTimeParts() {
  var box = $('trend-box');
  box.textContent = '';
  var by = timePartStats();
  var order = ['上午', '下午', '晚上'];
  var anyData = order.some(function (k) { return by[k].n > 0; });
  var W = 640, H = 240, T = 24, B = 42, L = 46;
  var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': '上午下午晚上正確率長條圖' });
  [0, 0.5, 1].forEach(function (v) {
    var y = T + (1 - v) * (H - T - B);
    svg.appendChild(svgEl('line', { x1: L, y1: y, x2: W - 12, y2: y, 'class': 'svg-spoke' }));
    var lbl = svgEl('text', { x: L - 6, y: y + 4, 'text-anchor': 'end', 'class': 'svg-axis' });
    lbl.textContent = pct(v); svg.appendChild(lbl);
  });
  var best = null, bestAcc = -1;
  order.forEach(function (k) { if (by[k].n > 0) { var a = by[k].ok / by[k].n; if (a > bestAcc) { bestAcc = a; best = k; } } });
  var bw = (W - L - 12) / order.length;
  order.forEach(function (k, i) {
    var d = by[k], acc = d.n ? d.ok / d.n : 0, x = L + i * bw, h = acc * (H - T - B);
    if (d.n > 0) {
      svg.appendChild(svgEl('rect', { x: x + bw * 0.28, y: H - B - h, width: bw * 0.44, height: h,
        'class': 'svg-bar' + (k === best ? ' svg-bar-best' : '') }));
      var v = svgEl('text', { x: x + bw / 2, y: H - B - h - 6, 'text-anchor': 'middle', 'class': 'svg-axis' });
      v.textContent = pct(acc); svg.appendChild(v);
    }
    var lbl = svgEl('text', { x: x + bw / 2, y: H - 22, 'text-anchor': 'middle', 'class': 'svg-label' });
    lbl.textContent = k; svg.appendChild(lbl);
    var cnt = svgEl('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', 'class': 'svg-axis' });
    cnt.textContent = d.n > 0 ? (d.n + ' 題') : '無紀錄'; svg.appendChild(cnt);
  });
  box.appendChild(svg);
  $('trend-summary').textContent = anyData
    ? '依作答時間分上午（05–11）、下午（12–17）、晚上（18–04）;' +
      (best ? '目前「' + best + '」表現最好(' + pct(bestAcc) + ')。' : '') + '只計有時間紀錄的選擇題。'
    : '還沒有帶時間的作答紀錄；之後作答會自動記錄時段，在此比較你哪個時段表現最好。';
}

function renderDailyTrend() {
  var box = $('trend-box');
  box.textContent = '';
  var W = 640, H = 240, L = 46, Rm = 12, T = 16, B = 32;
  var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': '近30天正確率折線圖' });
  [0, 0.5, 1].forEach(function (v) {
    var y = T + (1 - v) * (H - T - B);
    svg.appendChild(svgEl('line', { x1: L, y1: y, x2: W - Rm, y2: y, 'class': 'svg-spoke' }));
    var lbl = svgEl('text', { x: L - 6, y: y + 4, 'text-anchor': 'end', 'class': 'svg-axis' });
    lbl.textContent = pct(v);
    svg.appendChild(lbl);
  });
  var series = dailySeries();
  for (var i = 0; i < TREND_DAYS; i += 5) {
    var x = L + i * (W - L - Rm) / (TREND_DAYS - 1);
    var d = addDays(todayStr(), i - (TREND_DAYS - 1)).slice(5).replace('-', '/');
    var tx = svgEl('text', { x: x, y: H - 10, 'text-anchor': 'middle', 'class': 'svg-axis' });
    tx.textContent = d;
    svg.appendChild(tx);
  }
  if (series.length > 0) { drawTrendData(svg, series, W, H, L, Rm, T, B); }
  else {
    var none = svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', 'class': 'svg-label' });
    none.textContent = '尚無作答紀錄；開始練習後此處會出現折線。';
    svg.appendChild(none);
  }
  box.appendChild(svg);
  var tot = series.reduce(function (a, p) { return a + p.n; }, 0);
  var okt = series.reduce(function (a, p) { return a + p.ok; }, 0);
  $('trend-summary').textContent = '近 ' + TREND_DAYS + ' 天共作答 ' + tot + ' 題' +
    (tot > 0 ? '，整體正確率 ' + pct(okt / tot) + '。' : '。');
}

function drawTrendData(svg, series, W, H, L, Rm, T, B) {
  var pts = series.map(function (p) {
    var x = L + p.idx * (W - L - Rm) / (TREND_DAYS - 1);
    var y = T + (1 - p.acc) * (H - T - B);
    return { x: x, y: y, p: p };
  });
  if (pts.length > 1) {
    svg.appendChild(svgEl('polyline', {
      points: pts.map(function (q) { return q.x + ',' + q.y; }).join(' '), 'class': 'svg-line'
    }));
  }
  pts.forEach(function (q) {
    var dot = svgEl('circle', { cx: q.x, cy: q.y, r: 3.2, 'class': 'svg-dot' });
    var tip = svgEl('title');
    tip.textContent = q.p.date + ':' + q.p.n + ' 題，' + pct(q.p.acc);
    dot.appendChild(tip);
    svg.appendChild(dot);
  });
}

/* ===================== 歷年題量長條 ===================== */
function renderYearDist() {
  var box = $('year-dist');
  box.textContent = '';
  if (!bank) { return; }
  var byYear = {};
  bank.questions.forEach(function (q) { byYear[q.year] = (byYear[q.year] || 0) + 1; });
  var years = Object.keys(byYear).map(Number).sort(function (a, b) { return a - b; });
  var W = 640, H = 170, L = 36, B = 28, T = 12;
  var maxV = years.reduce(function (a, y) { return Math.max(a, byYear[y]); }, 1);
  var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': '歷年題量長條圖' });
  var bw = (W - L - 10) / years.length;
  years.forEach(function (y, i) {
    var h = (byYear[y] / maxV) * (H - T - B);
    var x = L + i * bw;
    svg.appendChild(svgEl('rect', { x: x + bw * 0.18, y: H - B - h, width: bw * 0.64, height: h, 'class': 'svg-bar' }));
    var lbl = svgEl('text', { x: x + bw / 2, y: H - 10, 'text-anchor': 'middle', 'class': 'svg-axis' });
    lbl.textContent = String(y);
    svg.appendChild(lbl);
    var v = svgEl('text', { x: x + bw / 2, y: H - B - h - 4, 'text-anchor': 'middle', 'class': 'svg-axis' });
    v.textContent = String(byYear[y]);
    svg.appendChild(v);
  });
  box.appendChild(svg);
}
