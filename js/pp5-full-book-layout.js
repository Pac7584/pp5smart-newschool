// หน้า "ปพ.5 แบบประจำชั้น" (pp5_full_book) แบบกว้าง 2 คอลัมน์ เหมือนหน้า ปพ.5 แบบรายวิชา (js/pp5-subject-cover.js)
// owner 2026-10-23: "modal ของระบบครูประจำชั้นยังไม่แก้เหมือนรายวิชาหรือครับ แก้ให้ด้วย"
//   ซ้าย = ① เลือกห้อง (ปุ่มห้องเร็ว + ชั้น/ห้อง) · ขวา = ② เลือกส่วนที่จะพิมพ์ (การ์ดมีไอคอน, เลือกทั้งหมด/ล้าง, สรุป, ปุ่มสร้าง,
//   สถานะ, แถบความคืบหน้าเดิม) · ตัวอย่าง PDF เต็มความกว้างด้านล่าง · จอแคบเรียงคอลัมน์เดียว
// แม่แบบเดิมอยู่ใน js/gas-pages.js (ห้ามแก้) — ไฟล์นี้ "ย้าย" ส่วนเดิมเข้าคอลัมน์ (id และ onclick เดิมทำงานเหมือนเดิม) ไม่สร้างซ้ำ
(function initPp5FullBookLayout(global) {
  'use strict';
  const doc = global.document;
  const PARTS = [
    { id: 'pp5fb_part1', icon: 'bi-journal-richtext', short: 'ปก ข้อมูลนักเรียน เวลาเรียน' },
    { id: 'pp5fb_part2', icon: 'bi-bar-chart-line', short: 'คะแนน/เกรดรายวิชา' },
    { id: 'pp5fb_part3', icon: 'bi-clipboard-check', short: 'ผลการประเมิน' }
  ];
  const STYLE = `
.pp5fb-page.pp5fbw{max-width:1180px!important}
.pp5fbw .pp5fb-card{padding:1.4rem}
.pp5fbw-layout{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:20px;align-items:start}
.pp5fbw-col{border:1px solid #e2e8f0;border-radius:16px;padding:18px;background:#fff}
.pp5fbw-step{display:flex;align-items:center;gap:10px;font-weight:800;font-size:1.05rem;margin-bottom:14px;color:#1f2937}
.pp5fbw-step>span:first-child{width:30px;height:30px;border-radius:50%;background:var(--primary-light,#4f46e5);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:.92rem;flex:none}
.pp5fbw-all{margin-left:auto;display:inline-flex;gap:6px}
.pp5fbw-all button{border:1px solid #e2e8f0;background:#fff;color:#1f2937;border-radius:999px;font-size:.8rem;font-weight:600;padding:.2rem .7rem}
.pp5fbw-parts{display:grid;grid-template-columns:1fr;gap:.7rem}
.pp5fbw .pp5fbw-part{display:flex!important;align-items:center!important;gap:12px!important;padding:.85rem .95rem!important;min-height:76px;border-radius:12px!important}
.pp5fbw .pp5fbw-part:has(input:checked){border-color:var(--primary-light,#4f46e5)!important;background:color-mix(in srgb,var(--primary-light,#4f46e5) 6%,#fff)}
.pp5fbw-ico{flex:none;width:42px;height:42px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-size:1.25rem;
  background:color-mix(in srgb,var(--primary-light,#4f46e5) 10%,#fff);color:var(--primary-light,#4f46e5)}
.pp5fbw-part:has(input:checked) .pp5fbw-ico{background:var(--primary-light,#4f46e5);color:#fff}
.pp5fbw-summary{display:flex;align-items:center;gap:8px;margin:14px 0 0;padding:.6rem .8rem;border-radius:12px;background:#f6f7fb;font-size:.9rem;color:#1f2937}
.pp5fbw-summary b{color:var(--primary-light,#4f46e5)}
.pp5fbw-col #pp5fbBtn{min-height:52px}
.pp5fbw-wide{margin-top:18px}
[data-theme="dark"] .pp5fbw-col{background:#1b2232;border-color:#2b3446}
[data-theme="dark"] .pp5fbw-step,[data-theme="dark"] .pp5fbw-summary{color:#e5e7eb}
[data-theme="dark"] .pp5fbw-summary{background:#161d2b}
[data-theme="dark"] .pp5fbw-all button{background:#1b2232;color:#e5e7eb;border-color:#2b3446}
@media (max-width:991px){.pp5fbw-layout{grid-template-columns:1fr}}
@media (max-width:520px){.pp5fbw-col{padding:14px}.pp5fbw-step{flex-wrap:wrap}.pp5fbw-all{margin-left:40px;width:100%}.pp5fbw .pp5fb-card{padding:.9rem}}`;

  function layout(page) {
    const card = page.querySelector('.pp5fb-card');
    const grade = page.querySelector('#pp5fbGrade');
    const room = page.querySelector('#pp5fbClass');
    const firstPart = page.querySelector('#pp5fb_part1');
    const button = page.querySelector('#pp5fbBtn');
    if (!card || !grade || !room || !firstPart || !button) return false;
    page.classList.add('pp5fbw');
    if (!doc.getElementById('pp5FullBookLayoutStyle')) {
      const style = doc.createElement('style');
      style.id = 'pp5FullBookLayoutStyle';
      style.textContent = STYLE;
      doc.head.appendChild(style);
    }
    const gradeField = grade.parentElement;
    const roomField = room.parentElement;
    const partsField = firstPart.closest('label').parentElement.parentElement;
    const partsList = firstPart.closest('label').parentElement;
    const grid = doc.createElement('div');
    grid.className = 'pp5fbw-layout';
    grid.innerHTML = '<section class="pp5fbw-col" data-col="room"><div class="pp5fbw-step"><span>1</span>เลือกชั้นและห้อง</div></section>'
      + '<section class="pp5fbw-col" data-col="parts"><div class="pp5fbw-step"><span>2</span>เลือกส่วนที่จะพิมพ์ในเล่ม'
      + '<span class="pp5fbw-all"><button type="button" data-pp5-btn-skip data-fb-all="1">เลือกทั้งหมด</button><button type="button" data-pp5-btn-skip data-fb-all="0">ล้าง</button></span></div></section>';
    const roomCol = grid.querySelector('[data-col="room"]');
    const partsCol = grid.querySelector('[data-col="parts"]');
    // ปุ่มห้องเร็ว (ถ้ามี) ที่อยู่ก่อนช่องชั้น ย้ายไปอยู่คอลัมน์ซ้ายด้วย
    const before = [];
    for (let node = card.firstElementChild; node && node !== gradeField; node = node.nextElementSibling) before.push(node);
    card.insertBefore(grid, gradeField);
    before.forEach((node) => roomCol.append(node));
    roomCol.append(gradeField, roomField);
    // ส่วนที่จะพิมพ์: การ์ดมีไอคอน (ตัด emoji เดิมออกจากชื่อ ใช้ไอคอนแทน)
    partsList.classList.add('pp5fbw-parts');
    PARTS.forEach((part) => {
      const input = page.querySelector(`#${part.id}`);
      const label = input?.closest('label');
      if (!label) return;
      label.classList.add('pp5fbw-part');
      const ico = doc.createElement('i');
      ico.className = `bi ${part.icon} pp5fbw-ico`;
      ico.setAttribute('aria-hidden', 'true');
      input.after(ico);
      const title = label.querySelector('div > div');
      if (title) title.textContent = title.textContent.replace(/^[^฀-๿A-Za-z0-9]+/u, '');
    });
    partsCol.append(partsList);
    partsField.remove();
    const summary = doc.createElement('div');
    summary.className = 'pp5fbw-summary';
    partsCol.append(summary);
    // ปุ่มสร้าง สถานะ แถบความคืบหน้า และขั้นตอน (ของเดิม) อยู่ใต้สรุป
    ['#pp5fbBtn', '#pp5fbStatus', '#pp5fbProgressWrap', '#pp5fbChecklist'].forEach((sel) => {
      const el = page.querySelector(sel);
      if (el) partsCol.append(el);
    });
    // ตัวอย่าง PDF ใช้ความกว้างเต็มใต้ทั้งสองคอลัมน์
    const preview = page.querySelector('#pp5fbPdfWrap');
    if (preview) { preview.classList.add('pp5fbw-wide'); card.append(preview); }

    const update = () => {
      const chosen = PARTS.filter((part) => page.querySelector(`#${part.id}`)?.checked);
      const where = grade.value && room.value ? ` ห้อง ${grade.value}/${room.value}` : '';
      summary.innerHTML = '';
      const icon = doc.createElement('i');
      icon.className = chosen.length ? 'bi bi-printer' : 'bi bi-exclamation-circle';
      const textBox = doc.createElement('span');
      if (chosen.length) {
        textBox.append('จะพิมพ์ ');
        const b = doc.createElement('b');
        b.textContent = `${chosen.length} ส่วน`;
        textBox.append(b, `${where}`, doc.createElement('br'));
        const small = doc.createElement('small');
        small.textContent = chosen.map((part) => part.short).join(' · ');
        textBox.append(small);
      } else {
        textBox.textContent = 'ยังไม่ได้เลือกส่วนที่จะพิมพ์';
      }
      summary.append(icon, textBox);
    };
    page.addEventListener('change', update);
    grid.addEventListener('click', (event) => {
      const all = event.target.closest('[data-fb-all]');
      if (!all) return;
      PARTS.forEach((part) => { const input = page.querySelector(`#${part.id}`); if (input) input.checked = all.dataset.fbAll === '1'; });
      update();
    });
    update();
    return true;
  }

  function apply() {
    const page = doc.querySelector('#contentFrame .pp5fb-page');
    if (!page || page.__pp5fbLayout) return;
    if (layout(page)) page.__pp5fbLayout = true;
  }
  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5fbLayoutWatch) return;
    frame.__pp5fbLayoutWatch = true;
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(apply).observe(frame, { childList: true, subtree: true });
    apply();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
  global.PP5FullBookLayout = { layout, PARTS };
})(window);
