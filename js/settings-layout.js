// หน้า "ตั้งค่าระบบกลาง" แบบใหม่ (owner 2026-10-14 ส่งภาพตัวอย่าง + รายการปรับ: ย่อแบนเนอร์, แบ่ง 3 กลุ่ม
// ข้อมูลโรงเรียน / ปีการศึกษาและภาคเรียน / ผู้บริหารและผู้ลงนาม, พื้นขาวขอบเทาอมฟ้า, ตัวหนังสือใหญ่ขึ้น, ช่องยาวตามข้อมูล,
// รูปแบบ ปพ.5 เป็นแท็บของตัวเอง, แถบบันทึกติดด้านล่าง + "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก")
// ย้ายช่องเดิมทั้งกล่อง (ป้าย + ช่อง + คำอธิบาย) เข้ากลุ่มใหม่ — id และตัวจัดการเดิมไม่เปลี่ยน การบันทึกยังใช้ปุ่ม #saveBtn
// เดิม (SettingsEditor.saveSettings) ช่องที่บันทึกทันทีของตัวเอง (ระดับชั้น ลายน้ำ ฯลฯ) ไม่นับเป็น "ยังไม่ได้บันทึก"
(function initSettingsLayout(global) {
  'use strict';
  const doc = global.document;
  // ช่องที่ปุ่ม "บันทึก" ของหน้านี้เป็นคนบันทึก
  const SAVED_FIELDS = ['schoolName', 'schoolAddress', 'academicYear', 'semester', 'directorName', 'directorPosition', 'supervisorName',
    'logoFileId', 'affiliation', 'schoolPhone', 'footerNote'];
  // ลำดับแท็บตามภาพตัวอย่าง (เปลี่ยนปีการศึกษาไว้ท้ายสุด — ใช้ปีละครั้ง)
  const TAB_ORDER = ['general-tab', 'pp5format-tab', 'printing-tab', 'branding-tab', 'backup-tab', 'signatures-tab', 'transition-tab'];
  const TAB_LABELS = { 'general-tab': ['bi-house-door-fill', 'ข้อมูลทั่วไป'], 'printing-tab': ['bi-printer', 'การพิมพ์และ PDF'], 'signatures-tab': ['bi-pen', 'ลายเซ็นและตราประทับ'] };

  const STYLE = `
body[data-current-page="new_settings_editor"] .pp5-page-banner-wrap .pp5-page-banner{min-height:0;padding:14px 20px;border-radius:18px}
body[data-current-page="new_settings_editor"] .pp5-page-banner-wrap .pp5-page-banner::before,
body[data-current-page="new_settings_editor"] .pp5-page-banner-wrap .pp5-page-banner::after{display:none}
body[data-current-page="new_settings_editor"] .pp5-page-banner-wrap .pp5-pb-icon{width:52px;height:52px;font-size:1.5rem}
body[data-current-page="new_settings_editor"] .pp5-page-banner-wrap .pp5-pb-title{font-size:1.45rem;margin:0}
body[data-current-page="new_settings_editor"] .pp5-page-banner-wrap .pp5-pb-sub{font-size:.92rem}
.pp5set{--s-line:#dfe6f1;--s-card:#fff;--s-text:#1e2a4a;--s-muted:#56627a;--s-accent:var(--primary,#4f46e5);display:grid;gap:14px}
[data-theme="dark"] .pp5set{--s-line:#2b3446;--s-card:#1b2232;--s-text:#e5e7eb;--s-muted:#a7afbd}
.pp5set-card{background:var(--s-card);border:1px solid var(--s-line);border-radius:16px;padding:18px 20px;color:var(--s-text)}
.pp5set-head{display:flex;gap:12px;align-items:center;margin-bottom:14px}
.pp5set-ico{flex:none;width:46px;height:46px;border-radius:12px;display:grid;place-items:center;font-size:1.35rem}
.pp5set-head h3{font-size:1.12rem;font-weight:700;margin:0;color:var(--s-text)}
.pp5set-head p{margin:2px 0 0;font-size:.88rem;color:var(--s-muted)}
.pp5set-row{display:grid;gap:12px 16px;margin-bottom:12px}
.pp5set-row:last-child{margin-bottom:0}
.pp5set-row.wide-narrow{grid-template-columns:minmax(0,2.2fr) minmax(0,1fr)}
.pp5set-row.half{grid-template-columns:repeat(2,minmax(0,1fr))}
.pp5set-row.short{grid-template-columns:minmax(0,220px) minmax(0,260px)}
.pp5set-row.full{grid-template-columns:minmax(0,1fr)}
.pp5set-row.with-button{grid-template-columns:minmax(0,1fr) auto;align-items:end}
.pp5set .form-label{font-size:.95rem;font-weight:600;margin-bottom:6px;color:var(--s-text)}
.pp5set .form-control,.pp5set .form-select{font-size:1rem;min-height:44px;border-radius:10px;border-color:var(--s-line)}
.pp5set .field-help{font-size:.86rem;color:var(--s-muted);margin-top:6px;line-height:1.45}
.pp5set #pp5GradeLevelsBox{border:0!important;padding:0!important;margin:0!important}
.pp5set #pp5GradeLevelsBox .form-select{max-width:none!important}
.pp5set-note{font-size:.86rem;color:var(--s-muted);margin-top:6px}
.pp5set-signers{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:10px;font-weight:600;
  border:1.5px solid var(--s-accent);color:var(--s-accent);background:transparent;white-space:nowrap}
.pp5set-signers:hover{background:color-mix(in srgb,var(--s-accent) 8%,transparent)}
#pp5JumpToSigBtn{display:none!important}
body[data-current-page="new_settings_editor"] #contentFrame .container.py-4{max-width:1120px!important}
#settingsTab.custom-tabs{background:#fff!important;border:1px solid #dfe6f1;border-radius:16px;padding:6px;gap:4px;flex-wrap:wrap;box-shadow:none}
#settingsTab.custom-tabs .nav-item{flex:0 0 auto}
#settingsTab.custom-tabs .nav-link{white-space:nowrap;display:inline-flex!important;flex-direction:row!important;align-items:center;gap:8px;background:transparent!important;box-shadow:none!important}
#settingsTab.custom-tabs .nav-link i{width:auto!important;height:auto!important;background:transparent!important;font-size:1.05rem;color:inherit!important;margin:0!important}
[data-theme="dark"] #settingsTab.custom-tabs{border-color:#2b3446;background:#161d2b!important}
[data-theme="dark"] .sticky-savebar.pp5set-bar .sticky-savebar-inner{background:rgba(27,34,50,.96);border-color:#2b3446}
[data-theme="dark"] .pp5set-dirty{color:#c7cfdd}
#settingsTab.custom-tabs .nav-link{border-radius:12px;font-weight:600;padding:.6rem 1rem;color:#3b4763}
[data-theme="dark"] #settingsTab.custom-tabs .nav-link{color:#c7cfdd}
#settingsTab.custom-tabs .nav-link.active{background:color-mix(in srgb,var(--primary,#4f46e5) 12%,#fff)!important;color:var(--primary,#4f46e5)!important}
[data-theme="dark"] #settingsTab.custom-tabs .nav-link.active{background:color-mix(in srgb,var(--primary,#4f46e5) 30%,#161d2b)!important;color:#fff!important}
.pp5set #basicSettingsDiagnostics{margin:0;border-radius:16px;border:1px solid var(--s-line)!important;background:var(--s-card)!important;padding:16px 20px;box-shadow:none}
#generalTabPane > .card.pp5set-old{display:none}
.sticky-savebar.pp5set-bar{position:sticky;bottom:0;z-index:20;margin:16px 0 0}
.sticky-savebar.pp5set-bar .sticky-savebar-inner{border-radius:16px;padding:12px 16px}
.pp5set-dirty{display:flex;align-items:center;gap:8px;font-size:.95rem;font-weight:600;color:#56627a}
.pp5set-dirty::before{content:"";width:10px;height:10px;border-radius:50%;background:#22c55e}
.pp5set-bar.is-dirty .pp5set-dirty{color:#b45309}
.pp5set-bar.is-dirty .pp5set-dirty::before{background:#f59e0b}
.pp5set-bar .pp5set-actions{display:flex;gap:10px;align-items:center}
.pp5set-bar #saveBtn{font-size:1rem;padding:.6rem 1.4rem;white-space:nowrap}
@media (max-width:720px){#settingsTab.custom-tabs{flex-direction:row!important;flex-wrap:nowrap!important;justify-content:flex-start!important;overflow-x:auto;scrollbar-width:thin}#settingsTab.custom-tabs .nav-item{width:auto!important}.pp5set-row.wide-narrow,.pp5set-row.half,.pp5set-row.short,.pp5set-row.with-button{grid-template-columns:minmax(0,1fr)}
  .sticky-savebar.pp5set-bar .sticky-savebar-inner{flex-direction:row;flex-wrap:wrap;align-items:center;padding:10px 12px}
  .pp5set-bar .pp5set-actions{margin-left:auto}.pp5set-bar #saveBtn{padding:.5rem 1rem;font-size:.95rem}}`;

  const wrapperOf = (id) => {
    const el = doc.getElementById(id);
    if (!el) return null;
    // กล่องของช่อง = div ที่ครอบป้าย + ช่อง (+ คำอธิบาย) ตรง ๆ
    let box = el.parentElement;
    while (box && !box.querySelector(`label[for="${id}"]`) && box.id !== 'generalTabPane') box = box.parentElement;
    return box && box.id !== 'generalTabPane' ? box : el;
  };

  function card(icon, tint, title, sub) {
    const section = doc.createElement('section');
    section.className = 'pp5set-card';
    section.innerHTML = `<div class="pp5set-head"><span class="pp5set-ico" style="background:color-mix(in srgb,${tint} 14%,transparent);color:${tint}"><i class="bi ${icon}"></i></span>
<div><h3></h3><p></p></div></div>`;
    section.querySelector('h3').textContent = title;
    section.querySelector('p').textContent = sub;
    return section;
  }
  function row(kind, items) {
    const div = doc.createElement('div');
    div.className = `pp5set-row ${kind}`;
    items.filter(Boolean).forEach((item) => div.appendChild(item));
    return div;
  }

  function regroup() {
    const pane = doc.getElementById('generalTabPane');
    const oldCard = pane?.querySelector(':scope > .card');
    if (!pane || !oldCard || pane.querySelector('.pp5set') || !doc.getElementById('pp5SupabaseExtraSettings')) return false;
    const box = doc.createElement('div');
    box.className = 'pp5set';

    // หมายเหตุท้ายเอกสารเดิมกินเต็มแถว (style grid-column) — ในแถวใหม่อยู่คู่กับระดับชั้น (หากล่องก่อนย้ายออกจากหน้า)
    const footer = wrapperOf('footerNote');
    if (footer) footer.style.setProperty('grid-column', 'auto');
    const school = card('bi-building', '#0ea5e9', 'ข้อมูลโรงเรียน', 'ข้อมูลพื้นฐานของโรงเรียนสำหรับใช้ในเอกสารและระบบงานต่าง ๆ');
    school.append(
      row('wide-narrow', [wrapperOf('schoolName'), wrapperOf('schoolPhone')]),
      row('full', [wrapperOf('schoolAddress')]),
      row('full', [wrapperOf('affiliation')]),
      row('half', [doc.getElementById('pp5GradeLevelsBox'), footer])
    );
    const year = card('bi-calendar-event', '#f97316', 'ปีการศึกษาและภาคเรียน', 'ปีการศึกษาและภาคเรียนปัจจุบันที่ใช้ในเอกสารและระบบงานของโรงเรียน');
    const note = doc.createElement('div');
    note.className = 'pp5set-note';
    note.textContent = 'ใช้ในการออกรายงานและเอกสาร เช่น ปพ.5 ปพ.6 · ขึ้นปีการศึกษาใหม่ให้ใช้แท็บ "เปลี่ยนปีการศึกษา"';
    year.append(row('short', [wrapperOf('academicYear'), wrapperOf('semester')]), note);
    const people = card('bi-people-fill', '#10b981', 'ผู้บริหารและผู้ลงนาม', 'ชื่อผู้บริหารและผู้ลงนามในเอกสารทางการศึกษา');
    const signers = doc.createElement('button');
    signers.type = 'button';
    signers.className = 'pp5set-signers';
    signers.setAttribute('data-pp5-btn-skip', '');
    signers.innerHTML = '<i class="bi bi-pen"></i> จัดการผู้ลงนามเพิ่มเติม';
    signers.addEventListener('click', () => doc.getElementById('signatures-tab')?.click());
    people.append(row('half', [wrapperOf('directorName'), wrapperOf('directorPosition')]), row('with-button', [wrapperOf('supervisorName'), signers]));

    box.append(school, year, people);
    const diagnostics = doc.getElementById('basicSettingsDiagnostics');
    if (diagnostics) box.appendChild(diagnostics);
    oldCard.classList.add('pp5set-old');
    pane.prepend(box);
    return true;
  }

  function orderTabs() {
    const nav = doc.getElementById('settingsTab');
    if (!nav) return;
    Object.entries(TAB_LABELS).forEach(([id, [icon, label]]) => {
      const button = doc.getElementById(id);
      if (button && button.dataset.pp5Label !== label) { button.innerHTML = `<i class="bi ${icon}"></i> ${label}`; button.dataset.pp5Label = label; }
    });
    const items = [...nav.children];
    const rank = (li) => { const i = TAB_ORDER.indexOf(li.querySelector('.nav-link')?.id); return i < 0 ? 99 : i; };
    const sorted = [...items].sort((a, b) => rank(a) - rank(b));
    if (sorted.some((li, i) => li !== items[i])) sorted.forEach((li) => nav.appendChild(li));
  }

  function saveBar() {
    const bar = doc.querySelector('.sticky-savebar');
    const saveBtn = doc.getElementById('saveBtn');
    if (!bar || !saveBtn || bar.classList.contains('pp5set-bar')) return;
    bar.classList.add('pp5set-bar');
    const inner = bar.querySelector('.sticky-savebar-inner');
    const text = inner.querySelector(':scope > div');
    if (text) text.innerHTML = '<div class="pp5set-dirty" data-dirty>ข้อมูลเป็นปัจจุบัน</div>';
    const actions = doc.createElement('div');
    actions.className = 'pp5set-actions';
    const cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-outline-secondary';
    cancel.setAttribute('data-pp5-btn-skip', '');
    cancel.textContent = 'ยกเลิก';
    saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> บันทึกการเปลี่ยนแปลง';
    saveBtn.classList.remove('btn-lg', 'px-5');
    inner.appendChild(actions);
    actions.append(cancel, saveBtn);
    const label = bar.querySelector('[data-dirty]');
    const setDirty = (dirty) => {
      bar.classList.toggle('is-dirty', dirty);
      label.textContent = dirty ? 'มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก' : 'ข้อมูลเป็นปัจจุบัน';
      cancel.disabled = !dirty;
    };
    setDirty(false);
    const watched = (target) => SAVED_FIELDS.includes(target?.id);
    doc.getElementById('settingsTabContent')?.addEventListener('input', (event) => { if (watched(event.target)) setDirty(true); });
    doc.getElementById('settingsTabContent')?.addEventListener('change', (event) => { if (watched(event.target)) setDirty(true); });
    cancel.addEventListener('click', () => {
      try { global.SettingsEditor?.initializeSettingsPage?.(); } catch (_) { /* reload below */ }
      setDirty(false);
    });
    const status = doc.getElementById('status');
    if (status && typeof global.MutationObserver === 'function') {
      new global.MutationObserver(() => { if (status.querySelector('.alert-success')) setDirty(false); }).observe(status, { childList: true, subtree: true });
    }
    // แถบบันทึกเฉพาะแท็บที่ปุ่มนี้บันทึก (ข้อมูลทั่วไป / การพิมพ์) แท็บอื่นมีปุ่มของตัวเอง
    const sync = () => {
      const active = doc.querySelector('#settingsTab .nav-link.active')?.id;
      bar.hidden = !(active === 'general-tab' || active === 'printing-tab' || !active);
    };
    doc.getElementById('settingsTab')?.addEventListener('click', () => setTimeout(sync, 0));
    sync();
  }

  function apply() {
    if (!doc.getElementById('settingsTab')) return;
    if (!doc.getElementById('pp5SettingsLayoutStyle')) {
      const style = doc.createElement('style');
      style.id = 'pp5SettingsLayoutStyle';
      style.textContent = STYLE;
      doc.head.appendChild(style);
    }
    regroup();
    orderTabs();
    saveBar();
  }
  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5SettingsLayout) return;
    frame.__pp5SettingsLayout = true;
    let timer = null;
    if (typeof global.MutationObserver === 'function') {
      new global.MutationObserver(() => { clearTimeout(timer); timer = setTimeout(apply, 40); }).observe(frame, { childList: true, subtree: true });
    }
    apply();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
  global.PP5SettingsLayout = { apply, SAVED_FIELDS, TAB_ORDER };
})(window);
