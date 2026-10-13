// ระบบปุ่มใหม่ (owner 2026-10-14: "เปลี่ยนเฉพาะปุ่ม การจัดปุ่มเรียงใหม่ ให้มันดูสวยเป็นมืออาชีพ")
// ติดป้ายบทบาทให้ปุ่ม .btn ทุกปุ่มใน #contentFrame ตามคำบนปุ่ม (หน้าตาอยู่ใน css/button-system.css):
//   ปุ่มหลัก  = บันทึก / เพิ่ม / สร้าง / ยืนยัน / อัปโหลดและนำเข้า / เข้าสู่ระบบ   -> .pp5-btn-pri (ท้ายแถว)
//   ปุ่มอันตราย = ลบ / ล้าง / จำหน่าย หรือไอคอนถังขยะ                          -> .pp5-btn-danger
//   ที่เหลือ   = ปุ่มรอง                                                        -> .pp5-btn-sec
// ไม่แตะ onclick / id / disabled / การซ่อนปุ่มของหน้า (เปลี่ยนเฉพาะคลาส) และไม่แตะแท็บ ลิงก์หน้า ปุ่มปิด ปุ่มเลือกชั้นด่วน (#gcQuickBar)
// หน้ากรอกคะแนน (จอกว้าง): PDF / PDF รวม / CSV / ล้าง ย้ายเข้าปุ่ม "ส่งออก ▾" (ย้ายปุ่มเดิมทั้งปุ่ม ตัวจัดการเดิมยังทำงาน)
// มือถือคงแบบกระเบื้องเดิมของหน้า
(function initPP5ButtonSystem(global) {
  'use strict';

  const SKIP = '.btn-close, .nav-link, .page-link, .dropdown-item, .btn-link, [data-pp5-btn-skip], #gcQuickBar .btn';
  const PRIMARY = /^(บันทึก|เพิ่ม(?!เติม)|สร้าง|ยืนยัน(?!ลบ)|อัปโหลดและนำเข้า|เข้าสู่ระบบ)/;
  const DANGER = /^(ลบ|ล้าง|จำหน่าย|ยืนยันลบ)/;
  const TRASH_ICON = /(^|\s)(fa-trash|fa-trash-alt|bi-trash|bi-trash3|bi-trash-fill|bi-trash3-fill)(\s|$)/;

  // text of the button without emoji / symbols so "💾 บันทึกข้อมูล" reads as "บันทึกข้อมูล"
  function label(button) {
    return String(button.textContent || '').replace(/[^\u0E00-\u0E7FA-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function roleOf(button) {
    const text = label(button);
    const iconClasses = Array.from(button.querySelectorAll('i')).map((i) => i.className).join(' ');
    if (!text) return TRASH_ICON.test(iconClasses) || /🗑/.test(button.textContent || '') ? 'danger' : 'sec';
    if (DANGER.test(text)) return 'danger';
    if (PRIMARY.test(text)) return 'pri';
    return 'sec';
  }

  function classify(button) {
    if (!button.classList.contains('btn') || button.matches(SKIP)) return false;
    const role = roleOf(button);
    button.classList.remove('pp5-btn-pri', 'pp5-btn-sec', 'pp5-btn-danger');
    button.classList.add('pp5-btn', `pp5-btn-${role}`);
    button.classList.toggle('pp5-btn-icon', !label(button));
    button.dataset.pp5Btn = role;
    return true;
  }

  // ---- score entry page: one "ส่งออก ▾" button instead of PDF / PDF รวม / CSV / ล้าง ----
  const EXPORT_IDS = ['scoreEntryBtnExportTerm1Pdf', 'scoreEntryBtnExportTerm2Pdf', 'scoreEntryBtnExportYearPdf', 'scoreEntryBtnExportCSV', 'btnClearCurrent'];
  const EXPORT_LABELS = {
    scoreEntryBtnExportTerm1Pdf: 'PDF ภาคนี้',
    scoreEntryBtnExportTerm2Pdf: 'PDF ภาคนี้',
    scoreEntryBtnExportYearPdf: 'PDF รวมทั้งปี',
    scoreEntryBtnExportCSV: 'CSV (Excel)',
    btnClearCurrent: 'ล้างคะแนนภาคนี้'
  };
  function groupScoreExports(frame) {
    const doc = global.document;
    const first = doc.getElementById('scoreEntryBtnExportTerm1Pdf');
    if (!first || !frame.contains(first) || first.closest('.pp5-export-menu')) return false;
    // phones keep the owner's tile layout (css/spa-main.css, 2026-10-07: export row of 3 tiles)
    if (global.matchMedia && global.matchMedia('(max-width: 576px)').matches) return false;
    const menu = doc.createElement('span');
    menu.className = 'pp5-export-menu';
    menu.innerHTML = '<button type="button" class="btn btn-sm pp5-export-toggle" aria-haspopup="true" aria-expanded="false">'
      + '<i class="fas fa-file-export"></i> ส่งออก <span class="pp5-export-caret">▼</span></button>'
      + '<span class="pp5-export-list" role="menu" hidden></span>';
    first.before(menu);
    const list = menu.querySelector('.pp5-export-list');
    const toggle = menu.querySelector('.pp5-export-toggle');
    EXPORT_IDS.forEach((id) => {
      const button = doc.getElementById(id);
      if (!button) return;
      // keep the icon, give a clearer label (the label span is ours; the button and its handler are the page's own)
      const icon = button.querySelector('i');
      if (EXPORT_LABELS[id] && !button.dataset.pp5Relabeled) {
        button.textContent = '';
        if (icon) button.append(icon, ' ');
        button.append(EXPORT_LABELS[id]);
        button.dataset.pp5Relabeled = '1';
      }
      button.setAttribute('role', 'menuitem');
      list.append(button);
    });
    const close = () => { list.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      list.hidden = !list.hidden;
      toggle.setAttribute('aria-expanded', String(!list.hidden));
    });
    list.addEventListener('click', () => setTimeout(close, 0));
    doc.addEventListener('click', (event) => { if (!menu.contains(event.target)) close(); });
    doc.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    classify(toggle);
    return true;
  }

  function apply(frame) {
    groupScoreExports(frame);
    frame.querySelectorAll('.btn:not([data-pp5-btn])').forEach(classify);
  }

  function watch() {
    const frame = global.document.getElementById('contentFrame');
    if (!frame || frame.__pp5Buttons) return;
    frame.__pp5Buttons = true;
    let timer = null;
    const run = () => { clearTimeout(timer); timer = setTimeout(() => apply(frame), 40); };
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(run).observe(frame, { childList: true, subtree: true });
    run();
  }

  if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();

  global.PP5ButtonSystem = { roleOf, classify, label, apply, groupScoreExports };
})(window);
