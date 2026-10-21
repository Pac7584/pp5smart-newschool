// ปุ่มบันทึกหน้าเช็คชื่อรายเดือน (owner 2026-10-21: "ปรับปุ่มบันทึก ... ให้มันดูดีมีสกุล และเพิ่มปุ่มบันทึกไว้ข้างเดือน")
// เดิม: ปุ่มบันทึกบนหัวหน้าถูกแถบชื่อหน้าซ่อน เหลือแต่ไอคอนลอยเล็ก ๆ ไม่มีข้อความ และไม่บอกว่ามีอะไรค้างบันทึก
//   - ปุ่ม "บันทึก" ปลายขวาของแถวเลือกสัปดาห์เหนือตาราง (เหนือช่อง มา ลา ขาด — owner 2026-10-21) บอกสถานะ: บันทึกแล้ว / ยังไม่บันทึก n ช่อง / กำลังบันทึก
//   - ปุ่มลอยมุมขวาล่างมีข้อความและจำนวนช่อง โผล่เฉพาะตอนมีของค้าง (ตารางยาว เลื่อนลงไปแล้วยังกดได้)
//   - Ctrl+S บันทึก · ทุกปุ่มเรียก AttendanceMonthly.saveMonthlyAttendanceClient ตัวเดิม (ไม่เปลี่ยนวิธีบันทึก)
// สถานะอ่านจาก AttendanceMonthly.changedRecords (หน้าเดิมเก็บช่องที่แก้ไว้ที่นี่ และล้างเมื่อบันทึกสำเร็จ)
// tools/attendance-month-save-contract.cjs
(function initAttendanceMonthSave(global) {
  'use strict';
  const doc = global.document;
  const STYLE = `
#currentMonthDisplay #pp5AttSaveTop{margin-left:auto}
.pp5-att-save{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 16px;border-radius:12px;border:1px solid transparent;font:inherit;font-weight:700;font-size:.92rem;white-space:nowrap;cursor:pointer;transition:background .15s ease,box-shadow .15s ease,transform .1s ease}
.pp5-att-save i{font-size:1rem}
.pp5-att-save[data-state="clean"]{background:#ecfdf5;border-color:#a7f3d0;color:#047857;cursor:default}
.pp5-att-save[data-state="empty"]{background:#f1f5f9;border-color:#e2e8f0;color:#94a3b8;cursor:default}
.pp5-att-save[data-state="dirty"]{background:linear-gradient(135deg,var(--primary,#2563eb),#2563eb);color:#fff;box-shadow:0 6px 16px color-mix(in srgb,var(--primary,#2563eb) 30%,transparent)}
.pp5-att-save[data-state="dirty"]:hover{transform:translateY(-1px)}
.pp5-att-save[data-state="saving"]{background:#e0e7ff;color:#3730a3;cursor:progress}
.pp5-att-save:focus-visible{outline:3px solid color-mix(in srgb,var(--primary,#2563eb) 40%,transparent);outline-offset:2px}
.pp5-att-save .pp5-att-count{min-width:22px;padding:0 7px;border-radius:999px;background:rgba(255,255,255,.25);font-size:.78rem;line-height:20px;text-align:center}
.pp5-att-save .pp5-att-dot{width:8px;height:8px;border-radius:50%;background:#fde68a;box-shadow:0 0 0 0 rgba(253,230,138,.8);animation:pp5AttPulse 1.6s infinite}
@keyframes pp5AttPulse{0%{box-shadow:0 0 0 0 rgba(253,230,138,.8)}70%{box-shadow:0 0 0 8px rgba(253,230,138,0)}100%{box-shadow:0 0 0 0 rgba(253,230,138,0)}}
#contentFrame #fabSaveContainer.pp5-att-fab{width:auto!important;height:auto!important}
#contentFrame #fabSaveContainer.pp5-att-fab > .btn{display:none!important}
#contentFrame #fabSaveContainer.pp5-att-fab .pp5-att-save{height:48px;padding:0 20px;border-radius:999px;font-size:1rem;box-shadow:0 10px 26px rgba(15,23,42,.22)}
[data-theme="dark"] .pp5-att-save[data-state="clean"]{background:#0f2e25;border-color:#14532d;color:#86efac}
[data-theme="dark"] .pp5-att-save[data-state="empty"]{background:#1b2232;border-color:#2b3446;color:#64748b}
@media (prefers-reduced-motion:reduce){.pp5-att-save .pp5-att-dot{animation:none}}`;

  const changedCount = () => Object.keys(global.AttendanceMonthly?.changedRecords || {}).length;
  const hasStudents = () => (global.AttendanceMonthly?.attendanceStudents || []).length > 0;
  const isSaving = () => {
    const overlay = doc.getElementById('loadingOverlay');
    return !!overlay && overlay.style.display === 'flex';
  };
  function stateOf() {
    if (!hasStudents()) return 'empty';
    if (isSaving()) return 'saving';
    return changedCount() > 0 ? 'dirty' : 'clean';
  }
  const LABELS = {
    empty: '<i class="bi bi-floppy" aria-hidden="true"></i><span>บันทึก</span>',
    clean: '<i class="bi bi-check2-circle" aria-hidden="true"></i><span>บันทึกแล้ว</span>',
    saving: '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>กำลังบันทึก…</span>',
    dirty: (n) => `<span class="pp5-att-dot" aria-hidden="true"></span><i class="bi bi-floppy-fill" aria-hidden="true"></i><span>บันทึก</span><span class="pp5-att-count">${n}</span>`
  };
  const TITLES = {
    empty: 'เลือกชั้น-ห้องก่อน', clean: 'ไม่มีการแก้ไขที่ค้างบันทึก',
    saving: 'กำลังบันทึก', dirty: (n) => `บันทึกการเช็คชื่อ ${n} ช่องที่แก้ไว้ (Ctrl+S)`
  };

  function paint(button) {
    const state = stateOf();
    const n = changedCount();
    const key = `${state}:${n}`;
    if (button.__pp5Key === key) return;
    button.__pp5Key = key;
    button.setAttribute('data-state', state);
    button.innerHTML = state === 'dirty' ? LABELS.dirty(n) : LABELS[state];
    button.title = state === 'dirty' ? TITLES.dirty(n) : TITLES[state];
    button.setAttribute('aria-label', state === 'dirty' ? `บันทึก ${n} ช่องที่ยังไม่บันทึก` : button.title);
    button.setAttribute('aria-disabled', state === 'dirty' ? 'false' : 'true');
  }

  function save() {
    if (stateOf() !== 'dirty') return;
    global.AttendanceMonthly?.saveMonthlyAttendanceClient?.();
  }

  function makeButton(id) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = 'pp5-att-save';
    button.setAttribute('data-pp5-btn-skip', '');
    button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); save(); });
    return button;
  }

  function installStyle() {
    if (doc.getElementById('pp5AttSaveStyle')) return;
    const style = doc.createElement('style');
    style.id = 'pp5AttSaveStyle';
    style.textContent = STYLE;
    (doc.head || doc.documentElement).appendChild(style);
  }

  // ปุ่มบนแถบเครื่องมือ และในปุ่มลอยเดิม
  function mount() {
    const picker = doc.getElementById('attendanceMonthPickerButton');
    const fab = doc.getElementById('fabSaveContainer');
    if (!picker || !fab) return null;
    installStyle();
    let top = doc.getElementById('pp5AttSaveTop');
    if (!top) {
      top = makeButton('pp5AttSaveTop');
      // ปลายขวาของแถว "ตุลาคม 2569 | 1-7 | 8-14 ..." เหนือตาราง ตรงกับช่อง มา ลา ขาด (owner 2026-10-21 เลือกเอง:
      // ข้างตัวเลือกเดือนไปทับช่องเลือกชั้น) · แถวนี้ซ่อนจนกว่าจะเลือกห้อง ปุ่มจึงโผล่พร้อมตาราง
      // แถวนี้เป็นกล่อง display:block (หน้าเดิมตั้งเมื่อเลือกเดือน) — ใส่ในแถวแนวนอนด้านใน (เดือน + ปุ่มสัปดาห์) แล้วดันชิดขวา
      const bar = doc.getElementById('currentMonthDisplay');
      if (bar) (bar.querySelector('.d-flex') || bar).appendChild(top);
      else (picker.closest('.btn-group') || picker).insertAdjacentElement('afterend', top);
    }
    let floating = doc.getElementById('pp5AttSaveFab');
    if (!floating) {
      fab.classList.add('pp5-att-fab');
      floating = makeButton('pp5AttSaveFab');
      // จอสัมผัส: สคริปต์ลากของหน้าเดิม preventDefault ที่ touchstart ทำให้ไม่มี click (ปุ่มลอยเดิมกดบนมือถือไม่ได้)
      // แตะโดยไม่ลาก (ขยับไม่ถึง 8px) = บันทึก
      let touch = null;
      floating.addEventListener('touchstart', (event) => { const t = event.touches[0]; touch = { x: t.clientX, y: t.clientY }; }, { passive: true });
      floating.addEventListener('touchend', (event) => {
        const t = event.changedTouches[0];
        if (touch && Math.abs(t.clientX - touch.x) < 8 && Math.abs(t.clientY - touch.y) < 8) save();
        touch = null;
      });
      fab.appendChild(floating);
    }
    return { top, floating, fab };
  }

  // ปุ่มลอยโผล่เฉพาะตอนมีของค้าง (หน้าเดิมตั้ง display:block เมื่อโหลดรายชื่อ — ตั้งทับทุกรอบ)
  function refresh() {
    const parts = mount();
    if (!parts) return false;
    paint(parts.top);
    paint(parts.floating);
    // ซ้ำกันไม่ต้อง: ปุ่มลอยโผล่เมื่อปุ่มบนแถวสัปดาห์ไม่อยู่ในจอ (เลื่อนตารางลงไป หรือแถวถูกซ่อนบนมือถือ)
    const r = typeof parts.top.getBoundingClientRect === 'function' ? parts.top.getBoundingClientRect() : null;
    const topOnScreen = !!r && r.width > 0 && r.bottom > 0 && r.top < (global.innerHeight || 0);
    const show = (stateOf() === 'dirty' || stateOf() === 'saving') && !topOnScreen;
    const want = show ? 'block' : 'none';
    if (parts.fab.style.display !== want) {
      parts.fab.style.display = want;
      // ปุ่มลอยกว้างขึ้น (มีข้อความ): ตำแหน่งที่ลากเก็บไว้เดิมอาจล้นขอบขวา/ล่าง — ดึงกลับเข้าจอ
      const rect = show && typeof parts.fab.getBoundingClientRect === 'function' ? parts.fab.getBoundingClientRect() : null;
      if (rect && parts.fab.style.left && rect.right > (global.innerWidth || 0) - 8) parts.fab.style.left = `${Math.max(8, (global.innerWidth || 0) - rect.width - 12)}px`;
      if (rect && parts.fab.style.top && rect.bottom > (global.innerHeight || 0) - 8) parts.fab.style.top = `${Math.max(8, (global.innerHeight || 0) - rect.height - 12)}px`;
    }
    return true;
  }

  let timer = null;
  function watch() {
    if (timer) return;
    timer = global.setInterval(() => {
      if (!doc.getElementById('attendanceMonthPickerButton')) return;
      refresh();
    }, 400);
    doc.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 's' && doc.getElementById('pp5AttSaveTop')) {
        event.preventDefault();
        save();
      }
    });
  }

  global.PP5AttendanceMonthSave = { refresh, stateOf, save };
  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
    else watch();
  }
})(window);
