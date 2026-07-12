'use strict';
/* ============================================================
   主題開機 + 封面主題切換。
   landing（封面／選科）不載 app.js／settings.js,且站台 CSP 為 default-src 'self'
   （擋 inline JS）,故用這支外部小腳本:(1) 開機同步套用已存主題偏好（預設白底）;
   (2) 若頁面有 #theme-toggle 容器,渲染「白底／暖紙」切換鈕。
   與 settings.js 共用同一把鑰匙 obig:theme → 內部考科改主題與封面切換互通。
   必須以「非 defer」在 <head> 載入:才能在首次繪製前掛上 class、零閃爍。
   ============================================================ */
(function () {
  var KEY = 'obig:theme';                 /* 'warm'暖紙 | 'light'白底;缺值/舊 '' → 預設白底 */
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  /* 非 'warm' 一律白底（與 settings.js 的 applyTheme(t?t:'light') 預設一致）。 */
  function apply(v) { document.documentElement.classList.toggle('theme-light', v !== 'warm'); }

  apply(stored());                         /* 1) 首繪前套用 */

  function mount() {                       /* 2) 封面切換鈕（有 #theme-toggle 容器才渲染） */
    var host = document.getElementById('theme-toggle');
    if (!host) { return; }
    host.textContent = '';
    var cur = (stored() === 'warm') ? 'warm' : 'light';
    [{ v: 'light', label: '白底' }, { v: 'warm', label: '暖紙' }].forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme-opt' + (o.v === cur ? ' active' : '');
      b.textContent = o.label;
      b.setAttribute('aria-pressed', o.v === cur ? 'true' : 'false');
      b.addEventListener('click', function () {
        try { localStorage.setItem(KEY, o.v); } catch (e) { /* 隱私模式:仍即時套用 */ }
        apply(o.v);
        var sibs = host.getElementsByTagName('button');
        for (var i = 0; i < sibs.length; i++) {
          sibs[i].classList.remove('active');
          sibs[i].setAttribute('aria-pressed', 'false');
        }
        b.classList.add('active');
        b.setAttribute('aria-pressed', 'true');
      });
      host.appendChild(b);
    });
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', mount); }
  else { mount(); }
})();
