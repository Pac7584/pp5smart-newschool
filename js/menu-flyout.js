// เมนูย่อย (flyout) แบบ "01 สดใส" / โหมดมืด "03 พรีเมียม" (owner 2026-10-14: เลือกจากภาพตัวอย่าง — css/menu-flyout.css)
// spa-main.js openFlyout() สร้างรายการใหม่ทุกครั้งที่เปิด จึงแต่งต่อหลังสร้าง: หัวเมนู (ไอคอนหมวด + ชื่อหมวด),
// สีไอคอนรายการละสี (--mi), ลูกศร › และไฮไลต์หน้าที่เปิดอยู่  ไม่แตะ data-page / onclick ของรายการ
(function initMenuFlyout(global) {
  'use strict';
  const doc = global.document;
  // สีไอคอนไล่ตามลำดับรายการในหมวด (แบบในภาพตัวอย่าง: ฟ้า ม่วง เขียวน้ำทะเล เขียว ม่วงเข้ม ส้ม เหลือง ชมพู ฟ้าอมเขียว)
  const PALETTE = ['#3b82f6', '#6366f1', '#14b8a6', '#22c55e', '#8b5cf6', '#f97316', '#f59e0b', '#ec4899', '#06b6d4', '#0ea5e9', '#a855f7', '#10b981'];
  // ชื่อหัวเมนูย่อยสั้นลงจากชื่อกลุ่ม (aria-label ของ .menu-group)
  const HEAD_NAMES = { 'พิมพ์เอกสารและรายงาน': 'เอกสารและรายงาน' };

  function decorate(fly) {
    // แต่งแล้ว = มีหัวเมนูที่เราเติม (openFlyout() เขียน innerHTML ใหม่ทุกครั้ง หัวเมนูจึงหายไปเมื่อเปิดหมวดใหม่)
    if (!fly || fly.querySelector(':scope > .pp5-fly-head')) return;
    // รายการที่ระบบสิทธิ์ซ่อนในเมนูข้าง (teacher-permissions refreshMenu: .nav-item hidden) ต้องไม่โผล่ในเมนูเด้ง —
    // spa-main openFlyout() คัดลอกทุกรายการ (owner 2026-10-14: ครู rkt1 กดเจอ "ตรวจผลการเรียนผู้ปกครอง" แล้วเปิดไม่ได้)
    fly.querySelectorAll(':scope > .nav-link[data-page]').forEach((link) => {
      const source = doc.querySelector(`.sidebar .nav-item[data-page="${link.getAttribute('data-page')}"]`);
      if (source && (source.hidden || source.style.display === 'none')) link.remove();
    });
    const links = [...fly.querySelectorAll(':scope > .nav-link')];
    if (!links.length) return;
    fly.classList.add('pp5-fly');
    const group = fly.getAttribute('data-group') || '';
    const header = [...doc.querySelectorAll('.menu-group')].find((g) => g.getAttribute('aria-label') === group)?.querySelector('.menu-header > i');
    {
      const head = doc.createElement('div');
      head.className = 'pp5-fly-head';
      head.setAttribute('aria-hidden', 'true');
      head.innerHTML = `<i class="${(header?.className || 'bi bi-grid').replace(/\bme-2\b/, '').trim()}"></i><span></span>`;
      head.querySelector('span').textContent = HEAD_NAMES[group] || group;
      fly.prepend(head);
    }
    const current = doc.body?.getAttribute('data-current-page') || '';
    let index = 0;
    links.forEach((link) => {
      const visible = global.getComputedStyle ? global.getComputedStyle(link).display !== 'none' : true;
      link.style.setProperty('--mi', PALETTE[index % PALETTE.length]);
      if (visible) index += 1;
      link.classList.toggle('is-current', !!current && link.getAttribute('data-page') === current);
      if (!link.querySelector('.pp5-fly-arrow')) {
        const arrow = doc.createElement('i');
        arrow.className = 'bi bi-chevron-right pp5-fly-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        link.appendChild(arrow);
      }
    });
    fit(fly);
  }

  // owner 2026-10-16 (ภาพเมนูเวลาเรียนตกลงไปใต้แถบงาน): spa-main openFlyout() วัดความสูงก่อนเราเติมหัวเมนูและไอคอนใหญ่
  // จึงขยับขึ้นใหม่หลังแต่ง — สูงเกินจอเลื่อนในกล่องได้ (max-height ใน css/menu-flyout.css)
  function fit(fly) {
    if (!fly.getBoundingClientRect || !global.innerHeight) return;
    const room = global.innerHeight - 8;
    const rect = fly.getBoundingClientRect();
    if (rect.bottom > room) fly.style.top = `${Math.max(8, room - rect.height)}px`;
  }

  // เมนูบนมือถือ (กางลงในแถบข้าง) แต่งแบบเดียวกัน (owner 2026-10-14 ข้อ 4): สีไอคอนรายการ + ลูกศร
  // CSS ใช้เฉพาะจอแคบ (css/menu-flyout.css) จอคอมยังใช้เมนูเด้งข้างเหมือนเดิม  หน้าที่เปิดอยู่ใช้ .nav-item.active ของ spa-main
  function decorateSidebar() {
    doc.querySelectorAll('#sidebar .menu-group, .sidebar .menu-group').forEach((group) => {
      if (group.dataset.pp5Mobile) return;
      group.dataset.pp5Mobile = '1';
      [...group.querySelectorAll('.nav-item > .nav-link')].forEach((link, index) => {
        link.style.setProperty('--mi', PALETTE[index % PALETTE.length]);
        if (!link.querySelector('.pp5-fly-arrow')) {
          const arrow = doc.createElement('i');
          arrow.className = 'bi bi-chevron-right pp5-fly-arrow';
          arrow.setAttribute('aria-hidden', 'true');
          link.appendChild(arrow);
        }
      });
    });
  }

  function watch() {
    decorateSidebar();
    const fly = doc.getElementById('submenuFlyout');
    if (!fly || fly.__pp5Fly) return;
    fly.__pp5Fly = true;
    if (typeof global.MutationObserver === 'function') {
      // childList = openFlyout() ใส่รายการชุดใหม่ (หัวเมนูที่เราเติมเองก็ทำให้เกิด mutation แต่ decorate ไม่ทำซ้ำ)
      new global.MutationObserver(() => decorate(fly)).observe(fly, { childList: true });
    }
    decorate(fly);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
  global.PP5MenuFlyout = { decorate, decorateSidebar, PALETTE, HEAD_NAMES };
})(window);
