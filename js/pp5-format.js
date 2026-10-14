// รูปแบบ ปพ.5 ของโรงเรียน (owner 2026-10-14: "เพื่อป้องกันความสับสนของผู้ใช้งาน ในรายวิชา และแบบรวมชั้น ในเมนู
// การใช้งานควรแยก" — เลือก "ใช่ เลือกได้ 3 แบบ"): school_settings.settings_json.report_format
//   class   = แบบรวมชั้น (ค่าเริ่มต้น เหมือนที่ใช้อยู่): ซ่อนเมนู ปพ.5 แบบรายวิชา + เช็คชื่อรายวิชา (รายชั่วโมง)
//   subject = แบบรายวิชา: ซ่อนเมนู ปพ.5 แบบประจำชั้น
//   both    = ใช้ทั้งสองแบบ: แสดงทุกเมนู
// ซ่อนเฉพาะทางเข้า (เมนู/การ์ดที่มี data-page) ไม่ปิดสิทธิ์หน้า — ผู้ดูแลเปลี่ยนได้ที่การ์ดบนหน้า "ตั้งค่าระบบกลาง"
(function initPp5Format(global) {
  'use strict';
  const doc = global.document;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FORMATS = {
    class: { title: 'แบบประจำชั้น', note: 'ปพ.5 รวมเล่มของทั้งห้อง (แบบที่ใช้อยู่เดิม)', icon: 'bi-journal-text' },
    subject: { title: 'แบบรายวิชา', note: 'ปพ.5 วิชาละเล่ม + เช็คชื่อรายวิชา (รายชั่วโมง)', icon: 'bi-journals' },
    both: { title: 'ใช้ทั้งสองแบบ', note: 'แสดงเมนูของทั้งสองแบบ', icon: 'bi-collection' }
  };
  const HIDE = {
    class: ['pp5_subject_book', 'subject_attendance'],
    subject: ['pp5_full_book'],
    both: []
  };
  // ปกแบบรวมชั้นแยกเล่ม (owner 2026-10-14 "ปก ปพ.5 แบบรวมชั้นไม่ได้ใช้ ตัดออกเลยดีกว่า"): ซ่อนทางเข้าทุกที่ทุกรูปแบบ
  // (ปกรวมชั้นยังพิมพ์ได้ใน "ปพ.5 รวมเล่ม" ส่วนที่ 1) — ตัวหน้ายังอยู่เพราะ "ปพ.5 แบบรายวิชา" ใช้แม่แบบของหน้านี้
  const ALWAYS_HIDDEN = ['pp5_cover_page'];
  let current = null;

  const normalize = (value) => (FORMATS[value] ? value : 'class');
  function hiddenPages(format) { return [...ALWAYS_HIDDEN, ...HIDE[normalize(format)]]; }

  function applyMenus(format) {
    current = normalize(format);
    let style = doc.getElementById('pp5FormatStyle');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'pp5FormatStyle';
      doc.head.appendChild(style);
    }
    // การ์ดในศูนย์ส่งออกรายงานลิงก์ด้วย onclick="navigateTo('...')" ไม่มี data-page
    style.textContent = hiddenPages(current).map((page) => `[data-page="${page}"],[onclick*="navigateTo('${page}')"]{display:none!important}`).join('\n');
    doc.documentElement.dataset.pp5Format = current;
  }

  async function refresh() {
    if (!global.PP5Data?.settings?.get) return false;
    try {
      const settings = await global.PP5Data.settings.get();
      applyMenus(settings?.settings_json?.report_format);
      return true;
    } catch (_) { return false; }
  }

  // ---- การ์ดเลือกรูปแบบบนหน้า "ตั้งค่าระบบกลาง" (เฉพาะผู้ดูแล)
  const STYLE = `
.pp5fmt{--f-line:#e3e6ee;--f-muted:#5b6275;--f-card:#fff;--f-accent:var(--primary,#4f46e5);border:1px solid var(--f-line);border-radius:14px;
  padding:14px 16px;margin:0 0 16px;background:var(--f-card)}
[data-theme="dark"] .pp5fmt{--f-line:#2b3446;--f-muted:#a7afbd;--f-card:#1b2232}
.pp5fmt h5{font-size:1rem;font-weight:700;margin:0 0 4px;display:flex;gap:6px;align-items:center}
.pp5fmt p{font-size:.85rem;color:var(--f-muted);margin:0 0 10px}
.pp5fmt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
.pp5fmt-opt{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1.5px solid var(--f-line);border-radius:12px;cursor:pointer}
.pp5fmt-opt input{margin-top:.25rem;accent-color:var(--f-accent);flex:none}
.pp5fmt-opt:has(input:checked){border-color:var(--f-accent);background:color-mix(in srgb,var(--f-accent) 7%,transparent)}
.pp5fmt-opt b{display:block;font-size:.92rem}.pp5fmt-opt small{display:block;color:var(--f-muted);font-size:.78rem}
.pp5fmt-say{font-size:.82rem;margin-top:8px;min-height:1.1em}.pp5fmt-say.is-ok{color:#13795b}.pp5fmt-say.is-err{color:#c2362b}`;

  function settingsCard() {
    const nav = doc.getElementById('settingsTab');
    if (!nav || doc.getElementById('pp5FormatCard')) return;
    let role = '';
    try { role = String(global.localStorage.getItem('role') || '').toLowerCase(); } catch (_) { role = ''; }
    if (role !== 'admin') return;
    const box = doc.createElement('section');
    box.id = 'pp5FormatCard';
    box.className = 'pp5fmt';
    box.innerHTML = `<style>${STYLE}</style><h5><i class="bi bi-ui-radios"></i> รูปแบบ ปพ.5 ของโรงเรียน</h5>
<p>เลือกแบบที่โรงเรียนใช้ ระบบจะแสดงเฉพาะเมนูของแบบนั้น ครูจะได้ไม่สับสน (เปลี่ยนได้ทุกเมื่อ ข้อมูลไม่หาย)</p>
<div class="pp5fmt-grid" role="radiogroup" aria-label="รูปแบบ ปพ.5">${Object.entries(FORMATS).map(([key, f]) => `<label class="pp5fmt-opt">
  <input type="radio" name="pp5Format" value="${key}"${key === (current || 'class') ? ' checked' : ''}>
  <span><b><i class="bi ${f.icon}"></i> ${esc(f.title)}</b><small>${esc(f.note)}</small></span></label>`).join('')}</div>
<div class="pp5fmt-say" data-say></div>`;
    // แท็บ "รูปแบบ ปพ.5" ของตัวเอง (owner 2026-10-14: "ย้ายตัวเลือกรูปแบบ ปพ.5 ไปไว้ในแท็บเฉพาะ") — js/settings-layout.js
    // จัดลำดับแท็บ; หน้าที่ไม่มีที่วางแท็บ (ไม่น่าเกิด) วางเหนือแถบแท็บแบบเดิม
    const content = doc.getElementById('settingsTabContent');
    if (content) {
      const li = doc.createElement('li');
      li.className = 'nav-item';
      li.setAttribute('role', 'presentation');
      li.innerHTML = '<button class="nav-link" id="pp5format-tab" data-bs-toggle="pill" data-bs-target="#pp5FormatTabPane" type="button" role="tab" aria-controls="pp5FormatTabPane" aria-selected="false"><i class="bi bi-file-earmark-text"></i> รูปแบบ ปพ.5</button>';
      nav.appendChild(li);
      const pane = doc.createElement('div');
      pane.className = 'tab-pane fade';
      pane.id = 'pp5FormatTabPane';
      pane.setAttribute('role', 'tabpanel');
      pane.setAttribute('aria-labelledby', 'pp5format-tab');
      pane.appendChild(box);
      content.appendChild(pane);
    } else {
      (nav.closest('.card') || nav).before(box);
    }
    const say = box.querySelector('[data-say]');
    box.addEventListener('change', async (event) => {
      const input = event.target.closest('input[name="pp5Format"]');
      if (!input) return;
      const before = current;
      say.className = 'pp5fmt-say';
      say.textContent = 'กำลังบันทึก…';
      try {
        await global.PP5Data.settings.patchSettingsJson('report_format', input.value, 'บันทึกรูปแบบ ปพ.5 ไม่สำเร็จ');
        applyMenus(input.value);
        say.className = 'pp5fmt-say is-ok';
        say.textContent = `บันทึกแล้ว — ใช้ ปพ.5 ${FORMATS[input.value].title} (เมนูเปลี่ยนตามทันที)`;
      } catch (error) {
        say.className = 'pp5fmt-say is-err';
        say.textContent = error?.message || String(error);
        const back = box.querySelector(`input[value="${normalize(before)}"]`);
        if (back) back.checked = true;
      }
    });
  }

  applyMenus('class');
  let loaded = false;
  const tryLoad = async () => { if (!loaded) loaded = await refresh(); };
  function watch() {
    const frame = doc.getElementById('contentFrame');
    tryLoad();
    if (!frame || frame.__pp5Format) return;
    frame.__pp5Format = true;
    if (typeof global.MutationObserver === 'function') {
      new global.MutationObserver(() => { tryLoad(); settingsCard(); }).observe(frame, { childList: true, subtree: true });
    }
    settingsCard();
  }
  doc.addEventListener('pp5:settings-saved', () => { loaded = false; tryLoad(); });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
  global.PP5Format = { FORMATS, HIDE, hiddenPages, applyMenus, refresh, normalize };
})(window);
