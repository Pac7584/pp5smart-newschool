// หน้า "ผู้ปกครองตรวจผลการเรียน" (parent_portal) เมื่อครู/ผู้ดูแลเปิด (owner 2026-10-20 "ดูเพี้ยนๆ แปลกๆ" · ใช้ทั้งดูแบบผู้ปกครอง
// และส่งลิงก์ให้ผู้ปกครอง): หน้านี้เป็นหน้าเต็มของผู้ปกครอง (gas-pages parent_portal) ที่โหลดในโปรแกรม จึงมีหัวกระดาษ/ปุ่มออกจากระบบ
// ซ้ำกับโปรแกรม และการ์ดซ้อนกันหลายใบ — ไฟล์นี้ปรับเฉพาะตอนเจ้าหน้าที่เปิด (บทบาท admin / teacher) หน้าที่ผู้ปกครองเห็นไม่เปลี่ยน
//   - ซ่อนแถบบน "Powered by…/ออกจากระบบ" พื้นหลังและท้ายหน้า (โปรแกรมมีอยู่แล้ว)
//   - หัวหน้าแบบแถวเดียว: ตรา + "ผู้ปกครองตรวจผลการเรียน" + โรงเรียน/ปีการศึกษา
//   - ผู้ดูแล: แท็บ "ดูแบบผู้ปกครอง" | "ส่งลิงก์ให้ผู้ปกครอง" (การ์ด #pp5ParentAccess ของ spa-main) แทนการ์ดเรียงซ้อน
//   - คำในกล่องค้นหาบอกว่าทำอะไร ("โหมดตรวจสอบ" → "เลือกนักเรียน", "ดูทั้งหมด" → "ล้างตัวกรอง")
// spa-main enhanceSupabaseParentPortalPage_ เรียก apply(frame) หลังสร้างการ์ดส่งลิงก์ · ตรวจด้วย tools/parent-portal-staff-contract.cjs
(function initParentPortalStaff(global) {
  'use strict';
  const STAFF = ['admin', 'teacher'];
  const TABS = [['preview', 'bi-eye', 'ดูแบบผู้ปกครอง'], ['access', 'bi-send', 'ส่งลิงก์ให้ผู้ปกครอง']];
  const STYLE = `
.pp5-pp-staff > .top-bar,.pp5-pp-staff > .bg-mesh,.pp5-pp-staff > .footer{display:none!important}
.pp5-pp-staff .hero{padding:4px 16px 0;text-align:left}
.pp5-pp-staff .hero-content{display:grid;grid-template-columns:auto 1fr;column-gap:14px;align-items:center;width:100%;max-width:688px;margin:0 auto;
  padding:14px 18px;box-shadow:none}
.pp5-pp-staff .hero-content::before{display:none}
.pp5-pp-staff .hero-icon{grid-row:span 2;width:52px;height:52px;margin:0}
.pp5-pp-staff #heroTitle{display:none}
.pp5-pp-staff .pp5-pp-head{font-size:19px;font-weight:700;color:var(--gray-900,#111827);line-height:1.3}
.pp5-pp-staff .hero .sub{font-size:13.5px}
.pp5-pp-staff .content{margin-top:12px}
.pp5-pp-staff .search-panel{box-shadow:none;padding:18px 20px}
.pp5-pp-staff .search-panel::before{display:none}
.pp5-pp-tabs{display:flex;gap:6px;padding:5px;margin:0 0 14px;background:#fff;border:1px solid var(--gray-200,#e5e7eb);border-radius:14px}
.pp5-pp-tabs button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border:0;border-radius:10px;
  background:transparent;color:var(--gray-600,#4b5563);font:inherit;font-weight:600;cursor:pointer}
.pp5-pp-tabs button[aria-selected="true"]{background:color-mix(in srgb,var(--primary,#4f46e5) 10%,#fff);color:var(--primary,#4f46e5)}
.pp5-pp-staff[data-pp-tab="access"] :is(#adminSearchPanel,#studentsContainer,#noStudentsMessage,#loadingSpinner){display:none!important}
.pp5-pp-staff[data-pp-tab="preview"] :is(#pp5ParentAccess,#pp5LineCard){display:none!important}
.pp5-pp-staff #pp5ParentAccess{margin-top:0!important}
.pp5-pp-staff #pp5ParentAccess .badge-audit{display:none}
@media (max-width:576px){.pp5-pp-tabs button{font-size:14px}.pp5-pp-staff .pp5-pp-head{font-size:17px}}`;

  function role() {
    try { return String(global.localStorage?.getItem('role') || '').toLowerCase(); } catch (_) { return ''; }
  }

  function apply(frame) {
    const doc = global.document;
    if (!frame || !doc || !STAFF.includes(role())) return false;
    const hero = frame.querySelector('.hero');
    const content = frame.querySelector('.content');
    if (!hero || !content || frame.querySelector('.pp5-pp-head')) return false;
    const page = hero.parentElement;
    page.classList.add('pp5-pp-staff');
    if (!doc.getElementById('pp5ParentPortalStaffStyle')) {
      const style = doc.createElement('style');
      style.id = 'pp5ParentPortalStaffStyle';
      style.textContent = STYLE;
      (doc.head || frame).appendChild(style);
    }

    // หัวหน้าแถวเดียว (#heroTitle เดิมยังอยู่แต่ซ่อน — สคริปต์หน้าเขียนทับชื่อเองหลังโหลดผู้ใช้)
    const sub = hero.querySelector('.sub');
    if (sub) sub.insertAdjacentHTML('beforebegin', '<div class="pp5-pp-head">ผู้ปกครองตรวจผลการเรียน</div>');

    // คำในกล่องค้นหา
    const badge = frame.querySelector('#adminSearchPanel .badge-audit');
    if (badge) badge.innerHTML = '<i class="bi bi-people-fill"></i> เลือกนักเรียน';
    const hint = frame.querySelector('#adminSearchPanel .search-panel-sub');
    if (hint) hint.textContent = 'เลือกชั้น ห้อง หรือพิมพ์ชื่อ แล้วกดปุ่มบนการ์ดเพื่อดูแบบที่ผู้ปกครองเห็น';
    const all = frame.querySelector('#adminSearchPanel .btn-search-action.secondary');
    if (all) all.textContent = 'ล้างตัวกรอง';

    // แท็บ (เฉพาะเมื่อมีการ์ดส่งลิงก์ = ผู้ดูแล)
    const access = frame.querySelector('#pp5ParentAccess');
    if (access) {
      const tabs = doc.createElement('div');
      tabs.className = 'pp5-pp-tabs';
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', 'งานในหน้านี้');
      tabs.innerHTML = TABS.map(([key, icon, label]) => `<button type="button" role="tab" data-pp-tab="${key}" aria-selected="false"><i class="bi ${icon}"></i> ${label}</button>`).join('');
      content.insertAdjacentElement('afterbegin', tabs);
      let accessLoaded = false;
      const select = (key) => {
        page.setAttribute('data-pp-tab', key);
        // เปิดแท็บส่งลิงก์ครั้งแรก: แสดงรายชื่อให้เลย (อ่านอย่างเดียว ไม่สร้างบัญชี/ไม่ออกรหัสจนกว่าจะกดปุ่ม)
        if (key === 'access' && !accessLoaded) {
          accessLoaded = true;
          if (!access.querySelector('#pp5AccessList')?.children.length) access.querySelector('#pp5AccessLoad')?.click();
        }
        tabs.querySelectorAll('button').forEach((button) => button.setAttribute('aria-selected', String(button.getAttribute('data-pp-tab') === key)));
      };
      tabs.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => select(button.getAttribute('data-pp-tab'))));
      select('preview');
    }
    return true;
  }

  global.PP5ParentPortalStaff = { apply, TABS };
})(window);
