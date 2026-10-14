// หน้าเข้าสู่ระบบ (owner 2026-10-14): "เอารูปโลโก้โรงเรียนไว้ที่เดิม ส่วนโลโก้ด้านซ้ายให้เอาโลโก้โปรแกรมมาแทน และอย่าให้มันยืด"
// - ฝั่งซ้าย (.header): ใส่โลโก้โปรแกรม P5Smart ไว้บนสุด
// - โลโก้โรงเรียน (#school-logo / #logo-placeholder) ย้ายไปอยู่เหนือฟอร์ม ใน .pp5-login-school
//   ย้ายทั้ง element (id เดิม) สคริปต์ของหน้า login ที่หาโลโก้ด้วย id จึงยังโหลด/ซ่อนโลโก้ได้เหมือนเดิม
// หน้าตาอยู่ใน css/login-split.css  ไม่แตะฟอร์มหรือการเข้าสู่ระบบ
(function initLoginLayout(global) {
  'use strict';
  const doc = global.document;
  const APP_LOGO = 'assets/brand/pp5smart-icon-192.png?v=1';

  function normalizeSchoolLogo(logo) {
    const raw = logo.getAttribute('src') || '';
    if (!raw) return;
    try {
      const url = new global.URL(raw, doc.baseURI);
      if (url.hostname !== 'drive.google.com') return;
      const id = url.searchParams.get('id') || url.pathname.match(/\/d\/([-\w]+)/)?.[1];
      if (!/^[-\w]{20,}$/.test(id || '')) return;
      // Keep the same image element and its original load/error handlers.
      logo.src = 'https://lh3.googleusercontent.com/d/' + id;
    } catch (_) { /* Leave other image sources unchanged. */ }
  }

  function apply() {
    const box = doc.querySelector('#contentFrame .login-container');
    const header = box && box.querySelector(':scope > .header');
    if (!header || box.querySelector(':scope > .pp5-login-school')) return;
    const logo = header.querySelector('#school-logo');
    const placeholder = header.querySelector('#logo-placeholder');
    if (!logo) return;
    if (typeof global.MutationObserver === 'function') {
      new global.MutationObserver(() => normalizeSchoolLogo(logo)).observe(logo, { attributes: true, attributeFilter: ['src'] });
    }
    normalizeSchoolLogo(logo);

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

    // หัวฝั่งฟอร์ม (owner 2026-10-14 แบบ "ฟ้าใส กระจกบาง")
    const welcome = doc.createElement('div');
    welcome.className = 'pp5-login-welcome';
    const title = doc.createElement('h2');
    title.textContent = 'ยินดีต้อนรับกลับ';
    const sub = doc.createElement('p');
    sub.textContent = 'เข้าสู่ระบบเพื่อจัดการข้อมูลผลการเรียน';
    welcome.append(title, sub);
    header.after(school, welcome);

    // ป้ายช่อง "ชื่อผู้ใช้:" -> "ชื่อผู้ใช้" (ตัดโคลอนท้าย)
    box.querySelectorAll('#loginForm label').forEach((label) => {
      label.textContent = label.textContent.replace(/\s*:\s*$/, '');
    });

    showUploadedLogo(logo, placeholder);
  }

  // สังกัด (สำนักงานเขตพื้นที่การศึกษา) ตัวเล็กใต้ชื่อโรงเรียนฝั่งซ้าย (owner 2026-10-14)
  // ค่าจากตั้งค่าระบบกลาง > สังกัด  ไม่ได้กรอก = ไม่แสดงบรรทัดนี้
  function showAffiliation(settings) {
    const text = String(settings?.affiliation || settings?.['สังกัด'] || '').replace(/\s+/g, ' ').trim();
    const name = doc.querySelector('#contentFrame .login-container .header #school-name');
    if (!text || !name || name.parentElement.querySelector('.pp5-login-affiliation')) return;
    const line = doc.createElement('p');
    line.className = 'pp5-login-affiliation';
    line.textContent = text;
    name.after(line);
  }

  // ตราที่อัปโหลดจากหน้า "ตราโรงเรียน" (js/logo-manager.js) เก็บเป็นรูป data:image ในฐานข้อมูล
  // สคริปต์หน้า login เดิมรับเฉพาะลิงก์ http(s) จึงซ่อนตรา: อ่านค่าเดียวกัน (getGlobalSettings) แล้วแสดงเอง
  // (owner 2026-10-14: "ใส่โลโก้ผ่านแล้ว แต่ไม่แสดงโลโก้ฝั่งขวา")
  function showUploadedLogo(logo, placeholder, attempt = 0) {
    const server = global.GasServer;
    // on a slow connection the data client may not be ready yet: ask again a few times
    const retry = () => { if (attempt < 6 && logo.isConnected) global.setTimeout(() => showUploadedLogo(logo, placeholder, attempt + 1), 700); };
    if (!server || typeof server.getGlobalSettings !== 'function') { retry(); return; }
    Promise.resolve(server.getGlobalSettings(false)).then((settings) => {
      showAffiliation(settings);
      const picture = String(settings?.loginLogo || settings?.logo || '').trim();
      if (!picture) { retry(); return; }
      if (!/^data:image\//i.test(picture)) return;
      const show = () => {
        if (!logo.isConnected || logo.classList.contains('loaded')) return;
        logo.src = picture;
        logo.classList.add('loaded');
        if (placeholder) placeholder.style.display = 'none';
      };
      show();
      // the page's own script may hide it again after its settings call: show it once more
      if (typeof global.MutationObserver === 'function') {
        new global.MutationObserver(show).observe(logo, { attributes: true, attributeFilter: ['class'] });
      }
    }).catch(retry);
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
