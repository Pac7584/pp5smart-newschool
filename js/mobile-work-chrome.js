// หน้าทำงานบนมือถือ (owner 2026-10-22 "หลายส่วนบังพื้นที่ทำงานจริง"): เดิมหน้าเช็คชื่อรายวันมีของลอยทับ 4 ชั้น
// หัวแอป + แถบบอกตำแหน่ง ด้านบน, แถบบันทึก + เมนูล่าง ด้านล่าง  ตอนนี้:
//   - ด้านล่างมีแถบลอยได้แถบเดียว: มีสิ่งต้องบันทึก -> แถบบันทึกอยู่แทนที่เมนูล่าง  บันทึกแล้ว -> เมนูล่างกลับมา
//   - เลื่อนลง -> เมนูล่างและแถบบอกตำแหน่งหลบ  เลื่อนขึ้น (หรือกลับถึงบนสุด) -> กลับมา  (owner เลือกแบบ ก)
// "หน้าทำงาน" = หน้าที่มีแถบบันทึกลอย (WORK_BARS)  เช็คชื่อรายวัน และบันทึกน้ำหนัก-ส่วนสูง
// ใส่ class ที่ <html> เท่านั้น หน้าตาอยู่ใน css/mobile-work-chrome.css  จอคอม (>= 992px) ไม่ทำอะไร
(function initMobileWorkChrome(global) {
  'use strict';
  const doc = global.document;
  if (!doc || global.__pp5MobileWorkChrome) return;
  global.__pp5MobileWorkChrome = true;

  // เช็คชื่อรายวัน + บันทึกน้ำหนัก-ส่วนสูง (js/growth-entry.js, owner 2026-10-22)
  const WORK_BARS = ['#mobileStickySaveBar', '#sg2SaveBar'];
  const PHONE = '(max-width: 991.98px)';
  const HIDE_AFTER = 120; // px จากบนสุดก่อนเริ่มหลบ (ช่วงบนสุดเห็นเมนูเสมอ)
  const STEP = 8;         // px ที่ต้องเลื่อนต่อเนื่องก่อนสลับ กันสั่นจากนิ้วสั่น
  const root = doc.documentElement;

  const isPhone = () => !global.matchMedia || global.matchMedia(PHONE).matches;
  const workBar = () => {
    const frame = doc.getElementById('contentFrame') || doc.body;
    for (const selector of WORK_BARS) {
      const bar = frame && frame.querySelector(selector);
      if (bar) return bar;
    }
    return null;
  };
  const shown = (el) => !!el && global.getComputedStyle(el).display !== 'none';
  const set = (name, on) => { if (root.classList.contains(name) !== on) root.classList.toggle(name, on); };

  let lastY = global.scrollY || 0;
  let travel = 0;

  function sync() {
    const bar = isPhone() ? workBar() : null;
    set('pp5-work-page', !!bar);
    set('pp5-savebar-on', shown(bar));
    if (!bar) set('pp5-chrome-hidden', false);
  }

  function onScroll() {
    const y = Math.max(0, global.scrollY || 0);
    const delta = y - lastY;
    lastY = y;
    if (!root.classList.contains('pp5-work-page')) return;
    if (y < HIDE_AFTER) { travel = 0; set('pp5-chrome-hidden', false); return; }
    travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
    if (travel > STEP) set('pp5-chrome-hidden', true);
    else if (travel < -STEP) set('pp5-chrome-hidden', false);
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    (global.requestAnimationFrame || ((fn) => setTimeout(fn, 16)))(() => { queued = false; sync(); });
  }

  function start() {
    const frame = doc.getElementById('contentFrame') || doc.body;
    new MutationObserver(schedule).observe(frame, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    global.addEventListener('scroll', onScroll, { passive: true });
    global.addEventListener('resize', schedule);
    sync();
  }

  global.PP5MobileWorkChrome = { sync, onScroll };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
