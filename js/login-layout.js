// หน้าเข้าสู่ระบบ (owner 2026-10-14): "เอารูปโลโก้โรงเรียนไว้ที่เดิม ส่วนโลโก้ด้านซ้ายให้เอาโลโก้โปรแกรมมาแทน และอย่าให้มันยืด"
// - ฝั่งซ้าย (.header): ใส่โลโก้โปรแกรม P5Smart ไว้บนสุด
// - โลโก้โรงเรียน (#school-logo / #logo-placeholder) ย้ายไปอยู่เหนือฟอร์ม ใน .pp5-login-school
//   ย้ายทั้ง element (id เดิม) สคริปต์ของหน้า login ที่หาโลโก้ด้วย id จึงยังโหลด/ซ่อนโลโก้ได้เหมือนเดิม
// หน้าตาอยู่ใน css/login-split.css  ไม่แตะฟอร์มหรือการเข้าสู่ระบบ
(function initLoginLayout(global) {
  'use strict';
  const doc = global.document;
  const APP_LOGO = 'assets/brand/pp5smart-icon-192.png?v=1';

  function apply() {
    const box = doc.querySelector('#contentFrame .login-container');
    const header = box && box.querySelector(':scope > .header');
    if (!header || box.querySelector(':scope > .pp5-login-school')) return;
    const logo = header.querySelector('#school-logo');
    const placeholder = header.querySelector('#logo-placeholder');
    if (!logo) return;

    const app = doc.createElement('img');
    app.className = 'pp5-login-app-logo';
    app.src = APP_LOGO;
    app.alt = 'P5Smart';
    app.width = 132;
    app.height = 132;
    app.decoding = 'async';
    header.prepend(app);

    const school = doc.createElement('div');
    school.className = 'pp5-login-school';
    if (placeholder) school.append(placeholder);
    school.append(logo);
    header.after(school);
  }

  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5LoginLayout) return;
    frame.__pp5LoginLayout = true;
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(apply).observe(frame, { childList: true });
    apply();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();

  global.PP5LoginLayout = { apply };
})(window);
