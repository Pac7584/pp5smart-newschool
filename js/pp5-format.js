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
    class: ['pp5_subject_book', 'subject_attendance', 'subject_schedule', 'subject_attendance_summary', 'subject_assessment_summary'],
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
.pp5fmt-terms{margin-top:18px;padding-top:14px;border-top:1px dashed var(--f-line)}
.pp5fmt-tgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
.pp5fmt-term{display:grid;gap:6px;padding:10px 12px;border:1.5px solid var(--f-line);border-radius:12px}
.pp5fmt-term small{color:var(--f-muted);font-size:.75rem;font-weight:400}
.pp5fmt-term label{display:grid;gap:2px;font-size:.82rem;color:var(--f-muted)}
.pp5fmt-say{font-size:.82rem;margin-top:8px;min-height:1.1em}.pp5fmt-say.is-ok{color:#13795b}.pp5fmt-say.is-err{color:#c2362b}`;

  // ---- วันเปิด–ปิดภาคเรียน (owner 2026-10-15 เช็คชื่อรายคาบ ขั้นที่ 3): settings_json.term_dates = { "2569": { "1": { start, end }, "2": {…} } }
  //      ใช้นับคาบที่ครูยังไม่ได้เช็คชื่อรายวิชา (js/subject-schedule.js missedPeriods) — เริ่มใช้ระบบกลางภาค ใส่วันที่เริ่มใช้แทนวันเปิดภาค
  const ISO = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
  function termErrors(year, terms) {
    const ce = Number(year) - 543;
    if (!(ce > 1900)) return 'ยังไม่ได้ตั้งปีการศึกษา';
    const first = `${ce}-05-01`;
    const last = `${ce + 1}-03-31`;
    for (const sem of ['1', '2']) {
      const t = terms[sem];
      if (!t) continue;
      if (!ISO.test(t.start || '') || !ISO.test(t.end || '')) return `ภาคเรียนที่ ${sem}: ใส่ทั้งวันเปิดและวันปิด`;
      if (t.start > t.end) return `ภาคเรียนที่ ${sem}: วันเปิดต้องไม่หลังวันปิด`;
      if (t.start < first || t.end > last) return `ภาคเรียนที่ ${sem}: ต้องอยู่ในปีการศึกษา ${year} (1 พ.ค. ${year} – 31 มี.ค. ${Number(year) + 1})`;
    }
    if (terms['1'] && terms['2'] && terms['1'].end >= terms['2'].start) return 'ภาคเรียนที่ 2 ต้องเริ่มหลังภาคเรียนที่ 1 ปิด';
    if (terms.count_from && (!ISO.test(terms.count_from) || terms.count_from < first || terms.count_from > last)) return `วันที่เริ่มนับต้องอยู่ในปีการศึกษา ${year}`;
    return '';
  }
  function termsSection(box) {
    const wrap = doc.createElement('div');
    wrap.className = 'pp5fmt-terms';
    wrap.innerHTML = `<h5><i class="bi bi-calendar-range"></i> วันเปิด–ปิดภาคเรียน <span data-term-year></span></h5>
<p>ใช้นับคาบที่ครูยังไม่ได้เช็คชื่อรายวิชา (เทียบตารางสอน หักวันหยุดในปฏิทิน)</p>
<div class="pp5fmt-tgrid">${['1', '2'].map((sem) => `<div class="pp5fmt-term"><b>ภาคเรียนที่ ${sem}</b>
  <label>วันเปิด <input type="date" class="form-control" data-term="${sem}" data-edge="start"></label>
  <label>วันปิด <input type="date" class="form-control" data-term="${sem}" data-edge="end"></label></div>`).join('')}
  <div class="pp5fmt-term"><b>เริ่มนับคาบค้างเช็คตั้งแต่ <small>(ไม่บังคับ)</small></b>
  <label>วันที่เริ่มใช้เช็คชื่อรายคาบจริง <input type="date" class="form-control" data-count-from></label>
  <small>เริ่มใช้ระบบกลางภาค ใส่วันที่เริ่มใช้ — คาบก่อนวันนี้จะไม่ถูกนับว่าค้าง · เว้นว่าง = นับตั้งแต่วันเปิดภาค</small></div></div>
<button type="button" class="btn btn-primary btn-sm mt-2" data-terms-save>บันทึกวันเปิด–ปิดภาค</button>
<div class="pp5fmt-say" data-term-say></div>`;
    box.appendChild(wrap);
    const say = wrap.querySelector('[data-term-say]');
    let year = '';
    let all = {};
    global.PP5Data.settings.get().then((settings) => {
      year = String(settings.academicYear || settings.academic_year || '');
      all = settings.settings_json?.term_dates && typeof settings.settings_json.term_dates === 'object' ? settings.settings_json.term_dates : {};
      wrap.querySelector('[data-term-year]').textContent = year ? `ปีการศึกษา ${year}` : '';
      // ปุ่มวันที่แบบไทย (spa-main thaiDatePicker) เปลี่ยนข้อความเมื่อได้ยิน 'input' เท่านั้น — ใส่ค่าที่บันทึกไว้แล้วต้องส่ง event ด้วย
      // (owner 2026-10-15: "บันทึกแล้วทำไมกลับมาหน้าเดิมวันที่ควรแสดง ไม่ใช่ให้เลือกเหมือนเดิม")
      const show = (input, value) => { input.value = value || ''; input.dispatchEvent(new global.Event('input', { bubbles: true })); };
      wrap.querySelectorAll('[data-term]').forEach((input) => show(input, all[year]?.[input.dataset.term]?.[input.dataset.edge]));
      show(wrap.querySelector('[data-count-from]'), all[year]?.count_from);
    }).catch(() => {});
    wrap.querySelector('[data-terms-save]').addEventListener('click', async () => {
      const terms = {};
      wrap.querySelectorAll('[data-term]').forEach((input) => {
        if (!input.value) return;
        terms[input.dataset.term] = terms[input.dataset.term] || {};
        terms[input.dataset.term][input.dataset.edge] = input.value;
      });
      const countFrom = wrap.querySelector('[data-count-from]').value;
      if (countFrom) terms.count_from = countFrom;
      const problem = termErrors(year, terms);
      say.className = 'pp5fmt-say' + (problem ? ' is-err' : '');
      if (problem) { say.textContent = problem; return; }
      say.textContent = 'กำลังบันทึก…';
      try {
        const next = { ...all, [year]: terms };
        await global.PP5Data.settings.patchSettingsJson('term_dates', next, 'บันทึกวันเปิด–ปิดภาคไม่สำเร็จ');
        all = next;
        say.className = 'pp5fmt-say is-ok';
        say.textContent = 'บันทึกแล้ว — ระบบเริ่มนับคาบที่ค้างเช็คตามช่วงนี้';
      } catch (error) {
        say.className = 'pp5fmt-say is-err';
        say.textContent = error?.message || String(error);
      }
    });
  }

  // ---- วันสอนชดเชย (owner 2026-10-22: "ในระบบเช็คชื่อรายเดือนมีระบบวันหยุด ระบบรายวิชาไม่ได้นำมาใช้ร่วมด้วยเหรอ"
  //      -> เลือก "ใช้ตารางของวันที่ถูกชดเชย"): settings_json.makeup_timetable = { "2569": { "2026-09-05": 4 } }
  //      วันประเภท "สอนชดเชย (มาเรียน)" ในปฏิทินวันหยุด เลือกได้ว่าเรียนตามตารางสอนวันไหน — ระบบรายวิชานับคาบตามวันนั้น
  //      (ค้างเช็ค, เติมจากเช็คชื่อรายวัน, ปพ.5 รายวิชา) · ไม่เลือก = ไม่นับเวลาเรียนรายวิชาวันนั้น (เหมือนเดิม)
  const WEEKDAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
  const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const isoWeekday = (iso) => { const [y, m, d] = iso.split('-').map(Number); const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return js === 0 ? 7 : js; };
  const thaiShort = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${WEEKDAYS[isoWeekday(iso) - 1]} ${d} ${THAI_MONTHS[m - 1]} ${y + 543}`; };
  function makeupSection(box) {
    const wrap = doc.createElement('div');
    wrap.className = 'pp5fmt-terms';
    wrap.innerHTML = `<h5><i class="bi bi-arrow-repeat"></i> วันสอนชดเชย <span data-mk-year></span></h5>
<p>วันที่ตั้งเป็น "สอนชดเชย (มาเรียน)" ในปฏิทินวันหยุด (หน้าเช็คชื่อรายเดือน &gt; วันหยุด) เลือกว่าเรียนตามตารางสอนวันไหน
ระบบเช็คชื่อรายวิชาจะนับคาบของวันนั้น (ค้างเช็ค / ใช้เช็คชื่อรายวันแทน / ปพ.5 รายวิชา) · ไม่เลือก = ไม่นับเวลาเรียนรายวิชาวันนั้น</p>
<div data-mk-list><div class="pp5fmt-say">กำลังโหลด…</div></div>
<button type="button" class="btn btn-primary btn-sm mt-2" data-mk-save hidden>บันทึกวันสอนชดเชย</button>
<div class="pp5fmt-say" data-mk-say></div>`;
    box.appendChild(wrap);
    const list = wrap.querySelector('[data-mk-list]');
    const say = wrap.querySelector('[data-mk-say]');
    const saveBtn = wrap.querySelector('[data-mk-save]');
    let year = '';
    let all = {};
    (async () => {
      const settings = await global.PP5Data.settings.get();
      year = String(settings.academicYear || settings.academic_year || '');
      const raw = settings.settings_json?.makeup_timetable;
      all = raw && typeof raw === 'object' ? raw : {};
      wrap.querySelector('[data-mk-year]').textContent = year ? `ปีการศึกษา ${year}` : '';
      const ce = Number(year) - 543;
      if (!(ce > 1900)) { list.innerHTML = '<div class="pp5fmt-say">ยังไม่ได้ตั้งปีการศึกษา</div>'; return; }
      const { data, error } = await global.PP5Data.client.from('holidays').select('holiday_date,holiday_type,title')
        .gte('holiday_date', `${ce}-05-01`).lte('holiday_date', `${ce + 1}-03-31`).order('holiday_date');
      if (error) throw error;
      const days = (data || []).filter((row) => String(row.holiday_type || '').trim() === 'school')
        .map((row) => ({ date: String(row.holiday_date).slice(0, 10), title: String(row.title || '') }));
      if (!days.length) {
        list.innerHTML = '<div class="pp5fmt-say">ปีนี้ยังไม่มีวันสอนชดเชย — เพิ่มที่หน้าเช็คชื่อรายเดือน &gt; วันหยุด เลือกประเภท "สอนชดเชย (มาเรียน)"</div>';
        return;
      }
      const saved = all[year] || {};
      list.innerHTML = `<div class="pp5fmt-tgrid">${days.map((d) => `<label class="pp5fmt-term"><b>${esc(thaiShort(d.date))}</b>
  <small>${esc(d.title)}</small>
  <select class="form-select form-select-sm" data-mk-date="${esc(d.date)}">
    <option value="">ไม่นับเวลาเรียนรายวิชา</option>
    ${WEEKDAYS.slice(0, 5).map((name, i) => `<option value="${i + 1}"${Number(saved[d.date]) === i + 1 ? ' selected' : ''}>ใช้ตารางสอนวัน${name}</option>`).join('')}
  </select></label>`).join('')}</div>`;
      saveBtn.hidden = false;
    })().catch((error) => { list.innerHTML = `<div class="pp5fmt-say is-err">${esc(error?.message || error)}</div>`; });
    saveBtn.addEventListener('click', async () => {
      const map = {};
      wrap.querySelectorAll('[data-mk-date]').forEach((select) => { if (select.value) map[select.dataset.mkDate] = Number(select.value); });
      say.className = 'pp5fmt-say';
      say.textContent = 'กำลังบันทึก…';
      try {
        const next = { ...all, [year]: map };
        await global.PP5Data.settings.patchSettingsJson('makeup_timetable', next, 'บันทึกวันสอนชดเชยไม่สำเร็จ');
        all = next;
        say.className = 'pp5fmt-say is-ok';
        say.textContent = `บันทึกแล้ว — ${Object.keys(map).length} วัน นับคาบรายวิชาตามตารางที่เลือก`;
      } catch (error) {
        say.className = 'pp5fmt-say is-err';
        say.textContent = error?.message || String(error);
      }
    });
  }

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
    termsSection(box);
    makeupSection(box);
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
  global.PP5Format = { FORMATS, HIDE, hiddenPages, applyMenus, refresh, normalize, termErrors };
})(window);
