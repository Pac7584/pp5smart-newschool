// ระดับชั้นที่โรงเรียนเปิดสอน (owner 2026-10-10: รองรับโรงเรียนขยายโอกาส ป.1–ม.3)
// - ค่าเก็บใน school_settings.settings_json.grade_levels: 'primary' (ค่าเริ่มต้น) หรือ 'primary_lower_secondary'
// - ค่าเริ่มต้น 'primary' = ทุกหน้าเหมือนเดิมทุกอย่าง ไฟล์นี้ไม่แตะหน้าใดเลย
// - เมื่อเปิด ม.ต้น: รายการเลือกชั้นที่มี ป.1–ป.6 ครบ (และยังไม่มี ม.) จะได้ ม.1–ม.3 ต่อท้าย ป.6
//   โดยไม่แก้ HTML ของหน้าเดิม (gas-pages.js) — หน้าที่สร้างรายการด้วยสคริปต์ก็ได้ด้วย เพราะดูจาก DOM
// - จำค่าล่าสุดไว้ใน localStorage เพื่อให้หน้าแรกที่เปิดก่อนอ่านค่าจากฐานข้อมูลเสร็จก็ถูกต้อง
(function initGradeLevels(global) {
  'use strict';

  const PRIMARY = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'];
  const LOWER_SECONDARY = ['ม.1', 'ม.2', 'ม.3'];
  const LEVELS = {
    primary: { label: 'ประถมศึกษา (ป.1–ป.6)', grades: PRIMARY },
    primary_lower_secondary: { label: 'ประถมศึกษาและมัธยมศึกษาตอนต้น (ป.1–ม.3)', grades: PRIMARY.concat(LOWER_SECONDARY) }
  };
  const SETTINGS_KEY = 'grade_levels';
  const CACHE_KEY = 'pp5_grade_levels';
  const ADDED_ATTR = 'data-pp5-grade-added';

  const txt = (v) => (v === null || v === undefined ? '' : String(v));
  const normalize = (v) => (Object.prototype.hasOwnProperty.call(LEVELS, txt(v)) ? txt(v) : 'primary');

  let current = 'primary';
  try { current = normalize(global.localStorage.getItem(CACHE_KEY)); } catch (_) { /* no storage */ }

  // หน้าเดิม (เช่น จัดการรายวิชา) อ่านค่านี้จาก <html data-pp5-grade-levels> โดยไม่ต้องเรียกฟังก์ชัน
  function markDocument() {
    try { global.document?.documentElement?.setAttribute('data-pp5-grade-levels', current); } catch (_) { /* no DOM */ }
  }
  markDocument();

  function levels() { return current; }
  function list() { return LEVELS[current].grades.slice(); }
  function hasLowerSecondary() { return current === 'primary_lower_secondary'; }
  function isLowerSecondary(grade) { return /^ม\.[1-3]$/.test(txt(grade).trim()); }

  function fullName(grade) {
    const value = txt(grade).trim();
    const n = value.replace(/[^0-9]/g, '');
    if (/^ป\./.test(value)) return `ประถมศึกษาปีที่ ${n}`;
    if (/^ม\./.test(value)) return `มัธยมศึกษาปีที่ ${n}`;
    if (/^อ\./.test(value)) return `อนุบาลปีที่ ${n}`;
    return value;
  }

  // ---------- เติม ม.1–ม.3 ในรายการเลือกชั้น ----------
  const optionGrade = (opt) => txt(opt.value || opt.textContent).trim();

  function patchSelect(select) {
    const options = Array.from(select.options);
    const added = options.filter((o) => o.hasAttribute(ADDED_ATTR));
    if (!hasLowerSecondary()) { added.forEach((o) => o.remove()); return; }
    if (added.length) return;
    const grades = options.map(optionGrade);
    if (!PRIMARY.every((g) => grades.includes(g))) return;
    if (grades.some((g) => /^ม\./.test(g) || /มัธยม/.test(g))) return;
    const last = options.find((o) => optionGrade(o) === 'ป.6');
    if (!last) return;
    let anchor = last;
    LOWER_SECONDARY.forEach((grade) => {
      const opt = last.cloneNode(false);
      opt.removeAttribute('selected');
      opt.selected = false;
      if (last.hasAttribute('value')) opt.value = grade;
      // ข้อความแบบเดียวกับตัวเลือก ป.6 ของหน้านั้น ("ป.6" / "ประถมศึกษาปีที่ 6" / "ชั้น ป.6")
      opt.textContent = txt(last.textContent)
        .replace('ประถมศึกษาปีที่ 6', fullName(grade))
        .replace('ป.6', grade);
      opt.setAttribute(ADDED_ATTR, '1');
      anchor.after(opt);
      anchor = opt;
    });
  }

  function patchAll(root) {
    const scope = root && root.querySelectorAll ? root : global.document;
    if (!scope) return;
    if (scope.tagName === 'SELECT') { patchSelect(scope); return; }
    scope.querySelectorAll('select').forEach(patchSelect);
  }

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    // microtask: ทำงานทันทีหลังสคริปต์ของหน้าเติมตัวเลือกเสร็จ ก่อนที่จอจะวาด
    Promise.resolve().then(() => { pending = false; patchAll(); });
  }

  function watch() {
    const doc = global.document;
    if (!doc || !doc.body || typeof global.MutationObserver !== 'function') return;
    new global.MutationObserver((records) => {
      if (!hasLowerSecondary() && !doc.querySelector(`[${ADDED_ATTR}]`)) return;
      if (records.some((r) => r.type === 'childList' && r.addedNodes.length)) schedule();
    }).observe(doc.body, { childList: true, subtree: true });
    patchAll();
  }

  function setLocal(value) {
    const next = normalize(value);
    const changed = next !== current;
    current = next;
    try { global.localStorage.setItem(CACHE_KEY, current); } catch (_) { /* no storage */ }
    markDocument();
    if (changed) patchAll();
    return changed;
  }

  // อ่านค่าจริงจากฐานข้อมูล (หลังเข้าสู่ระบบ) ก่อนเข้าสู่ระบบอ่านไม่ได้ก็ใช้ค่าที่จำไว้
  async function refresh() {
    const data = global.PP5Data;
    if (!data?.settings?.get) return current;
    try {
      const settings = await data.settings.get();
      setLocal(settings?.settings_json?.[SETTINGS_KEY]);
    } catch (_) { /* not signed in yet */ }
    return current;
  }

  async function save(value) {
    const next = normalize(value);
    const data = global.PP5Data;
    if (!data?.settings?.patchSettingsJson) throw new Error('ระบบตั้งค่ายังไม่พร้อม');
    await data.settings.patchSettingsJson(SETTINGS_KEY, next);
    setLocal(next);
    return next;
  }

  // ---------- กล่องตั้งค่าในหน้า "ตั้งค่าระบบกลาง" (ผู้ดูแลเท่านั้น) ----------
  function isAdmin() {
    try { return txt(global.localStorage.getItem('role')).toLowerCase() === 'admin'; } catch (_) { return false; }
  }

  function enhanceSettingsPage() {
    const doc = global.document;
    if (!isAdmin() || doc.getElementById('pp5GradeLevelsBox')) return;
    const after = doc.getElementById('pp5SupabaseExtraSettings');
    if (!after) return;
    const box = doc.createElement('div');
    box.id = 'pp5GradeLevelsBox';
    box.style.cssText = 'border:1px solid var(--border-color, #e2e8f0);border-radius:12px;padding:12px 14px;margin-top:12px;';
    box.innerHTML = '<label class="form-label fw-semibold mb-1" for="pp5GradeLevels">ระดับชั้นที่โรงเรียนเปิดสอน</label>'
      + '<div class="d-flex flex-wrap gap-2 align-items-center">'
      + '<select id="pp5GradeLevels" class="form-select" style="flex:1 1 280px;max-width:420px" disabled></select>'
      + '<span id="pp5GradeLevelsStatus" class="small"></span></div>'
      + '<div class="field-help">เลือกแล้วบันทึกทันที · โรงเรียนขยายโอกาสเลือก "ป.1–ม.3" แล้วรายการเลือกชั้นทุกหน้าจะมี ม.1–ม.3 '
      + '(รายวิชา ม.ต้นเป็นรายภาคเรียน ตั้งภาคเรียนของแต่ละวิชาในหน้าจัดการรายวิชา)</div>';
    after.insertAdjacentElement('afterend', box);
    const select = box.querySelector('#pp5GradeLevels');
    const status = box.querySelector('#pp5GradeLevelsStatus');
    Object.entries(LEVELS).forEach(([key, item]) => {
      const opt = doc.createElement('option');
      opt.value = key;
      opt.textContent = item.label;
      select.appendChild(opt);
    });
    const show = (message, tone) => { status.textContent = message; status.className = 'small' + (tone ? ' text-' + tone : ''); };
    refresh().then((value) => { select.value = value; select.disabled = false; });
    select.addEventListener('change', async () => {
      const wanted = select.value;
      select.disabled = true;
      show('กำลังบันทึก...', 'muted');
      try {
        await save(wanted);
        show('บันทึกแล้ว', 'success');
      } catch (error) {
        select.value = current;
        show('บันทึกไม่สำเร็จ: ' + txt(error?.message || error), 'danger');
      } finally {
        select.disabled = false;
      }
    });
  }

  global.PP5Grades = {
    PRIMARY, LOWER_SECONDARY, LEVELS,
    levels, list, hasLowerSecondary, isLowerSecondary, fullName,
    patchSelect, patchAll, refresh, save, setLocal, enhanceSettingsPage
  };

  if (global.document) {
    const start = () => {
      watch();
      setTimeout(() => { refresh(); }, 1500);
      // เข้าสู่ระบบทีหลัง: อ่านค่าของโรงเรียนอีกครั้ง (setTimeout: supabase-js ห้ามเรียกฐานข้อมูลใน callback นี้ตรง ๆ)
      try {
        global.PP5Data?.client?.auth?.onAuthStateChange?.((event) => { if (event === 'SIGNED_IN') setTimeout(refresh, 0); });
      } catch (_) { /* no auth client */ }
    };
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(window);
