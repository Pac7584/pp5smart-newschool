// หน้า "เช็คชื่อรายวิชา (รายคาบ)" — subject_attendance (owner 2026-10-14: "ในวิชานั้นๆมันต้องมีเช็คชื่อรายชั่วโมง")
// เจ้าของเลือก: ครูผู้สอนวิชานั้นเป็นคนเช็ค + ครูประจำชั้นเช็คได้ทุกวิชาของห้องตัวเอง (ผู้ดูแลเช็คแทนได้)
// · รายชื่อดึงค่าเริ่มต้นจากเช็คชื่อรายวัน (เช้านั้นขาด/ลา = ขาด/ลา ที่เหลือ = มา) แล้วครูแก้เฉพาะคนที่ไม่เข้าคาบ
// owner 2026-10-15 ("ภาษาไทย คณิต 5 ชม./สัปดาห์ วิชาอื่นส่วนมาก 1 ชม. ... สำคัญในการเช็คชื่อแต่ละชั่วโมง"):
//   เช็คทีละ "คาบ" (1 คาบ = 1 ชั่วโมง) — สอนติดกัน 2 คาบ = คาบ 1 + คาบ 2 แยกสถานะ; คาบถัดไปตั้งต้นจากคาบก่อนหน้า
//   ตารางสอนแบบง่ายที่ครูตั้งเอง (วันไหน วันละกี่คาบ แยกภาค) บอกว่าวันนั้นมีกี่คาบ · บันทึกคาบหนึ่งแล้วไปคาบถัดไปให้เอง
// ร้อยละเวลาเรียน = ชั่วโมงที่มา ÷ ชั่วโมงที่สอนและบันทึกแล้ว (คิดในปก ปพ.5 แบบรายวิชา; แถวเก่าก่อน SQL 032 นับตาม hours)
// owner 2026-10-15 "ต้องมีที่ตั้งค่าก่อน แล้วมาแสดงในหน้านี้": ตารางสอนตั้งที่หน้า "ตารางสอนของฉัน" (js/subject-schedule.js) — หน้านี้แสดงอย่างเดียว
//   และเช็คชื่อไม่ได้จนกว่าจะตั้งตารางสอนของวิชา/ห้อง/ภาคนั้น
// เขียนผ่าน pp5_save_subject_period เท่านั้น (SQL 202610150032) ซึ่งตรวจสิทธิ์ที่ฐานข้อมูล
// ไม่เรียกผ่าน GasServer: ตัวกันสิทธิ์ครู (teacher-permissions) ถือชื่อเมธอดที่มีคำว่า Attendance เป็นงานครูประจำชั้น
(function initSubjectAttendance(global) {
  'use strict';
  const doc = global.document;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
  const client = () => global.PP5Data?.client;
  const ACTIVITY = ['กิจกรรม', 'แนะแนว', 'ลูกเสือ', 'เนตรนารี', 'ชุมนุม', 'เพื่อสังคม', 'ชมรม'];
  // ลำดับวิชาเดียวกับปก ปพ.5 (gas-bridge comparePp5CoverSubjects) แล้วกิจกรรมพัฒนาผู้เรียนท้ายสุด
  const ORDER = ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์', 'เทคโนโลยี', 'สังคมศึกษา', 'ประวัติศาสตร์', 'สุขศึกษา', 'ศิลปะ', 'การงาน', 'ภาษาอังกฤษ', 'หน้าที่พลเมือง', 'การป้องกัน'];
  const GRADE_ORDER = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3'];
  const STATUS = [
    { key: 'present', label: 'มา', icon: 'bi-check-lg' },
    { key: 'leave', label: 'ลา', icon: 'bi-envelope' },
    { key: 'absent', label: 'ขาด', icon: 'bi-x-lg' }
  ];
  // จันทร์ = 1 … อาทิตย์ = 7 (ตรงกับ subject_schedules.weekday)
  const DAYS = [
    { n: 1, short: 'จ.', name: 'จันทร์' }, { n: 2, short: 'อ.', name: 'อังคาร' }, { n: 3, short: 'พ.', name: 'พุธ' },
    { n: 4, short: 'พฤ.', name: 'พฤหัสบดี' }, { n: 5, short: 'ศ.', name: 'ศุกร์' }, { n: 6, short: 'ส.', name: 'เสาร์' }, { n: 7, short: 'อา.', name: 'อาทิตย์' }
  ];
  const MAX_PERIODS = 8;
  const MISSING_SQL = ['42P01', 'PGRST205', 'PGRST202', '42883'];
  // ฐานข้อมูลยังไม่มีคอลัมน์ period / ตาราง subject_schedules (ยังไม่ได้รัน SQL 032)
  const NEEDS_032 = (error) => ['42703', 'PGRST204', ...MISSING_SQL].includes(error?.code) || /period|subject_schedules|pp5_save_subject_(period|schedule)/.test(text(error?.message));

  function subjectRank(name) {
    const n = text(name);
    const act = ['แนะแนว', 'ลูกเสือ', 'ชุมนุม', 'เพื่อสังคม'].findIndex((w) => n.includes(w));
    if (act !== -1) return 100 + act;
    if (ACTIVITY.some((w) => n.includes(w))) return 110;
    let index = -1;
    ORDER.forEach((word, i) => { if (n.includes(word)) index = i; });
    return index === -1 ? 99 : index;
  }
  function dailyStatus(value) {
    const v = text(value).toLowerCase();
    if (['leave', 'ล', 'ลา'].includes(v)) return 'leave';
    if (['absent', 'ข', 'ขาด', '0'].includes(v)) return 'absent';
    return v ? 'present' : '';
  }
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // วันในสัปดาห์ของวันที่ 'YYYY-MM-DD': จันทร์ = 1 … อาทิตย์ = 7
  function weekdayOf(iso) {
    const [y, m, d] = text(iso).split('-').map(Number);
    if (!y) return 0;
    const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return js === 0 ? 7 : js;
  }
  const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  function thaiDate(iso) {
    const [y, m, d] = text(iso).split('-').map(Number);
    return y ? `${d} ${THAI_MONTHS[m - 1]} ${y + 543}` : text(iso);
  }
  async function query(build) {
    const { data, error } = await build(client());
    if (error) throw error;
    return data || [];
  }

  // ---- ค่าตั้งต้นของคาบ: บันทึกแล้ว = ตามที่บันทึก · คาบ 2 ขึ้นไป = เหมือนคาบก่อนหน้า (ครูแก้คนที่หายไป) · คาบแรก = จากเช็คชื่อรายวัน
  function startMarks(ids, period, byPeriod, fromDaily) {
    const saved = byPeriod.get(period);
    if (saved && saved.size) return { marks: new Map(ids.map((id) => [id, saved.get(id) || 'present'])), source: 'saved' };
    for (let p = period - 1; p >= 1; p -= 1) {
      const before = byPeriod.get(p);
      if (before && before.size) return { marks: new Map(ids.map((id) => [id, before.get(id) || 'present'])), source: 'period', from: p };
    }
    return { marks: new Map(ids.map((id) => [id, fromDaily.get(id) || 'present'])), source: 'daily' };
  }
  // คาบที่ควรเปิดเมื่อเลือกวัน: คาบแรกที่ยังไม่บันทึกตามตารางสอน ถ้าบันทึกครบแล้ว = คาบสุดท้าย
  function firstOpenPeriod(planned, byPeriod) {
    const count = Math.max(planned || 0, 1);
    for (let p = 1; p <= count; p += 1) if (!byPeriod.get(p)?.size) return p;
    return Math.max(count, ...[...byPeriod.keys()]);
  }

  // วันสอนตามตารางที่ใกล้วันที่เลือกที่สุด (ไม่เกินวันนี้ ไม่ก่อนต้นปีการศึกษา) — ปุ่ม "ไปวันสอน" เมื่อเลือกวันที่ไม่มีคาบ
  function isoAdd(iso, days) {
    const [y, m, d] = text(iso).split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + days));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
  }
  function nearTeachingDays(iso, week, todayIso, minIso, count = 3) {
    const found = [];
    for (let k = 1; k <= 14; k += 1) {
      for (const d of [isoAdd(iso, -k), isoAdd(iso, k)]) {
        if (d > todayIso || (minIso && d < minIso) || !(week.get(weekdayOf(d)) > 0)) continue;
        found.push({ d, k });
      }
    }
    return found.sort((a, b) => a.k - b.k || b.d.localeCompare(a.d)).slice(0, count).map((x) => x.d).sort();
  }

  const STYLE = `
.sa{--sa-line:#e3e6ee;--sa-muted:#5b6275;--sa-soft:#f6f7fb;--sa-card:#fff;--sa-text:#1f2937;--sa-accent:var(--primary,#4f46e5);
  --sa-ok:#13795b;--sa-ok-bg:#e6f6ef;--sa-warn:#a15c00;--sa-warn-bg:#fff4e0;--sa-bad:#c2362b;--sa-bad-bg:#fdecea;
  max-width:980px;margin:0 auto;padding:0 0 96px;color:var(--sa-text)}
[data-theme="dark"] .sa{--sa-line:#2b3446;--sa-muted:#a7afbd;--sa-soft:#161d2b;--sa-card:#1b2232;--sa-text:#e5e7eb;
  --sa-ok:#6fe0b4;--sa-ok-bg:rgba(111,224,180,.12);--sa-warn:#ffc46b;--sa-warn-bg:rgba(255,196,107,.12);--sa-bad:#ff8a80;--sa-bad-bg:rgba(255,138,128,.12)}
.sa-title{display:none}
.sa-card{background:var(--sa-card);border:1px solid var(--sa-line);border-radius:14px;padding:14px 16px;margin-bottom:12px}
.sa-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.sa-controls .sa-wide{grid-column:1/-1}
@media (min-width:760px){.sa-controls{grid-template-columns:110px 90px minmax(0,1fr) 170px}.sa-controls .sa-wide{grid-column:auto}}
.sa-controls label,.sa-plabel{display:block;font-weight:600;font-size:.85rem;margin-bottom:4px}
.sa-periods-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;padding-top:12px;border-top:1px dashed var(--sa-line)}
.sa-periods{display:flex;flex-wrap:wrap;gap:6px}
.sa-periods button{min-height:40px;padding:0 14px;border-radius:12px;border:1.5px solid var(--sa-line);background:var(--sa-card);color:var(--sa-text);
  font-weight:700;display:inline-flex;align-items:center;gap:6px}
.sa-periods button.is-saved{border-color:var(--sa-ok);color:var(--sa-ok);background:var(--sa-ok-bg)}
.sa-periods button[aria-pressed="true"]{background:var(--sa-accent);border-color:var(--sa-accent);color:#fff;box-shadow:0 4px 12px color-mix(in srgb,var(--sa-accent) 35%,transparent)}
.sa-periods button.sa-add{border-style:dashed;color:var(--sa-muted);font-weight:600}
.sa-plan{font-size:.82rem;color:var(--sa-muted)}
.sa-strip{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:.88rem;color:var(--sa-muted)}
.sa-chip{display:inline-flex;align-items:center;gap:4px;font-size:.78rem;font-weight:600;padding:.15rem .6rem;border-radius:999px;background:var(--sa-soft);color:var(--sa-muted)}
.sa-chip.is-ok{background:var(--sa-ok-bg);color:var(--sa-ok)} .sa-chip.is-warn{background:var(--sa-warn-bg);color:var(--sa-warn)}
.sa-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px}
.sa-tools .sa-counts{display:flex;gap:6px;flex-wrap:wrap}
.sa-link{border:1px solid var(--sa-line);background:var(--sa-card);color:var(--sa-text);border-radius:8px;padding:.3rem .7rem;font-size:.85rem;font-weight:600}
.sa-list{list-style:none;margin:0;padding:0}
.sa-row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 4px;border-top:1px solid var(--sa-line)}
.sa-row:first-child{border-top:0}
.sa-no{color:var(--sa-muted);font-variant-numeric:tabular-nums;text-align:right}
.sa-name{min-width:0}
.sa-name b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sa-name small{color:var(--sa-muted);font-size:.75rem}
.sa-seg{display:inline-flex;border:1px solid var(--sa-line);border-radius:10px;overflow:hidden}
.sa-seg button{min-width:52px;min-height:38px;border:0;background:var(--sa-card);color:var(--sa-muted);font-weight:600;font-size:.88rem;display:inline-flex;align-items:center;justify-content:center;gap:4px}
.sa-seg button+button{border-left:1px solid var(--sa-line)}
.sa-seg button[aria-pressed="true"][data-status="present"]{background:var(--sa-ok-bg);color:var(--sa-ok)}
.sa-seg button[aria-pressed="true"][data-status="leave"]{background:var(--sa-warn-bg);color:var(--sa-warn)}
.sa-seg button[aria-pressed="true"][data-status="absent"]{background:var(--sa-bad-bg);color:var(--sa-bad)}
.sa-bar{position:sticky;bottom:0;z-index:5;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;
  background:var(--sa-card);border:1px solid var(--sa-line);border-radius:14px;padding:10px 14px;box-shadow:0 -6px 18px rgba(15,23,42,.08)}
.sa-bar .sa-say{font-size:.88rem}
.sa-bar .sa-say.is-ok{color:var(--sa-ok)} .sa-bar .sa-say.is-err{color:var(--sa-bad)}
.sa-save{border:0;border-radius:10px;padding:.55rem 1.2rem;font-weight:700;background:var(--sa-accent);color:#fff;display:inline-flex;align-items:center;gap:6px}
.sa-save:disabled{opacity:.6}
.sa-clear{border:1px solid var(--sa-line);background:transparent;color:var(--sa-bad);border-radius:10px;padding:.5rem .9rem;font-weight:600}
.sa-week-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.sa-week-head .sa-link{margin-left:auto}
.sa-days{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:10px}
.sa-days.has-weekend{grid-template-columns:repeat(7,minmax(0,1fr))}
.sa-day{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;border-radius:12px;border:1.5px dashed var(--sa-line);
  color:var(--sa-muted);font-weight:600;font-size:.85rem}
.sa-day b{font-size:.95rem;color:var(--sa-text)}
.sa-day.is-on{border-style:solid;border-color:var(--sa-accent);background:color-mix(in srgb,var(--sa-accent) 10%,var(--sa-card));color:var(--sa-accent)}
.sa-day.is-chosen{box-shadow:0 0 0 3px color-mix(in srgb,var(--sa-warn) 55%,transparent)}
.sa-off{display:grid;gap:12px;padding:6px 2px}
.sa-off h5{display:flex;align-items:center;gap:8px;font-size:1.02rem;font-weight:700;margin:0;color:var(--sa-warn)}
.sa-off p{margin:0;color:var(--sa-muted);font-size:.9rem}
.sa-off-actions{display:flex;flex-wrap:wrap;gap:8px}
.sa-off-actions .sa-goto{border:1.5px solid var(--sa-accent);background:color-mix(in srgb,var(--sa-accent) 8%,var(--sa-card));color:var(--sa-accent);
  border-radius:12px;padding:.5rem .9rem;font-weight:700;display:inline-flex;align-items:center;gap:6px}
.sa-off-actions .sa-makeup{border:1.5px dashed var(--sa-warn);background:var(--sa-warn-bg);color:var(--sa-warn);border-radius:12px;padding:.5rem .9rem;font-weight:700;
  display:inline-flex;align-items:center;gap:6px}
.sa-history table{width:100%;font-size:.85rem;border-collapse:collapse}
.sa-history th,.sa-history td{padding:6px 8px;border-top:1px solid var(--sa-line);text-align:center}
.sa-history th:first-child,.sa-history td:first-child{text-align:left}
.sa-history tr[data-date]{cursor:pointer}
.sa-history tr[data-date]:hover{background:var(--sa-soft)}
.sa-history tr.is-current{background:color-mix(in srgb,var(--sa-accent) 9%,transparent)}
.sa-note{padding:10px 12px;border-radius:10px;font-size:.88rem;background:var(--sa-soft);color:var(--sa-muted)}
.sa-note.is-err{background:var(--sa-bad-bg);color:var(--sa-bad)} .sa-note.is-warn{background:var(--sa-warn-bg);color:var(--sa-warn)}
@media (max-width:520px){.sa-seg button{min-width:44px;font-size:.82rem}.sa-seg button i{display:none}.sa-row{grid-template-columns:26px minmax(0,1fr) auto;gap:6px}
  .sa-days,.sa-days.has-weekend{grid-template-columns:repeat(4,minmax(0,1fr))}}`;

  function shell() {
    return `<div class="sa" id="pp5SubjectAttendance"><style>${STYLE}</style>
<h4 class="sa-title">เช็คชื่อรายวิชา (รายคาบ)</h4>
<div class="sa-card">
  <div class="sa-controls">
    <div><label for="saGrade">ชั้น</label><select id="saGrade" class="form-select"></select></div>
    <div><label for="saRoom">ห้อง</label><select id="saRoom" class="form-select"></select></div>
    <div class="sa-wide"><label for="saSubject">รายวิชา</label><select id="saSubject" class="form-select"></select></div>
    <div><label for="saDate">วันที่สอน</label><input id="saDate" type="date" class="form-control"></div>
  </div>
  <div class="sa-periods-row"><span class="sa-plabel">คาบที่</span><div class="sa-periods" data-periods role="group" aria-label="คาบที่"></div>
    <span class="sa-plan" data-plan></span></div>
</div>
<div class="sa-card sa-week" data-week hidden></div>
<div class="sa-card" data-body><div class="sa-note">กำลังโหลด…</div></div>
<div class="sa-bar" data-bar hidden>
  <span class="sa-say" data-say></span>
  <span class="d-inline-flex gap-2 align-items-center">
    <button type="button" class="sa-clear" data-clear data-pp5-btn-skip hidden><i class="bi bi-trash"></i> ลบการเช็คชื่อคาบนี้</button>
    <button type="button" class="sa-save" data-save data-pp5-btn-skip><i class="bi bi-save"></i> บันทึกทั้งหมด</button>
  </span>
</div>
<div class="sa-card sa-history" data-history hidden></div>
</div>`;
  }

  async function mount(root) {
    const $ = (sel) => root.querySelector(sel);
    const gradeSel = $('#saGrade');
    const roomSel = $('#saRoom');
    const subjectSel = $('#saSubject');
    const dateInput = $('#saDate');
    const periodBox = $('[data-periods]');
    const planBox = $('[data-plan]');
    const weekBox = $('[data-week]');
    const body = $('[data-body]');
    const bar = $('[data-bar]');
    const say = $('[data-say]');
    const saveBtn = $('[data-save]');
    const clearBtn = $('[data-clear]');
    const historyBox = $('[data-history]');
    const state = { year: '', semester: 1, role: '', scope: null, period: 1, planned: 0, week: new Map(), weekOk: true,
      students: [], marks: new Map(), byPeriod: new Map(), fromDaily: new Map(), hasDaily: false, source: 'daily', from: 0,
      dirty: false, canWrite: true, token: 0 };

    const settings = await global.PP5Data.settings.get();
    state.year = text(settings.academicYear || settings.academic_year);
    state.semester = Number(settings.semester || settings.currentSemester) === 2 ? 2 : 1;
    try { state.role = (await global.PP5Data.auth.requireUser())?.profile?.role || ''; } catch (_) { state.role = ''; }
    try {
      const { data } = await client().rpc('pp5_teacher_scope_context');
      state.scope = data && data.enabled ? data : null;
    } catch (_) { state.scope = null; }
    const scoped = state.role === 'teacher' && state.scope;
    // โหมดการทำงาน (js/work-mode.js): ครูที่เลือกโหมดครูประจำวิชาเห็นเฉพาะห้อง/วิชาที่สอน
    const assignments = scoped ? (state.scope.assignments || []).filter((a) => a.active !== false && text(a.academic_year) === state.year
      && global.PP5WorkMode?.keeps?.(a, state.scope) !== false) : [];
    // มาจากปุ่ม "เช็คชื่อ" ของแผงงานสอน (js/work-mode.js): ชั้น/ห้อง/วิชา/วันที่/คาบ ที่ต้องการ (ใช้ครั้งเดียว)
    let target = null;
    try {
      target = JSON.parse(global.sessionStorage.getItem('pp5SubjectAttendanceTarget') || 'null');
      global.sessionStorage.removeItem('pp5SubjectAttendanceTarget');
    } catch (_) { target = null; }

    dateInput.value = target?.date || today();
    const yearCE = Number(state.year) - 543;
    if (yearCE > 1900) { dateInput.min = `${yearCE}-05-01`; dateInput.max = [`${yearCE + 1}-03-31`, today()].sort()[0]; }

    const message = (html, kind) => { body.innerHTML = `<div class="sa-note${kind ? ` is-${kind}` : ''}">${html}</div>`; bar.hidden = true; historyBox.hidden = true; };
    const setSay = (msg, kind) => { say.className = `sa-say${kind ? ` is-${kind}` : ''}`; say.innerHTML = msg; };
    const need032 = () => {
      periodBox.innerHTML = '';
      planBox.textContent = '';
      weekBox.hidden = true;
      message('ฐานข้อมูลยังไม่มีระบบเช็คชื่อรายคาบ — ผู้ดูแลต้องรัน SQL <b>202610150032_subject_periods.sql</b> ใน Supabase ก่อน', 'err');
    };

    // ---- ตัวเลือกชั้น / ห้อง / วิชา
    const subjects = await query((c) => c.from('subjects').select('*'));
    const grades = [...new Set(subjects.map((s) => text(s.grade)))]
      .filter((g) => !scoped || assignments.some((a) => a.grade === g))
      .sort((a, b) => (GRADE_ORDER.indexOf(a) + 100) % 100 - (GRADE_ORDER.indexOf(b) + 100) % 100 || a.localeCompare(b, 'th'));
    if (!grades.length) { message('ยังไม่มีรายวิชาที่คุณเช็คชื่อได้ — ให้ผู้ดูแลเพิ่ม "ครูประจำวิชา" ให้บัญชีนี้ในหน้าจัดการผู้ใช้', 'warn'); return; }
    gradeSel.innerHTML = grades.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    if (target?.grade && grades.includes(target.grade)) gradeSel.value = target.grade;

    async function fillRooms() {
      const grade = gradeSel.value;
      let rooms = [];
      try { rooms = [...new Set((await global.PP5Data.students.list({ grade })).map((s) => text(s.room || s.classNo || '1')))]; } catch (_) { rooms = []; }
      if (scoped) rooms = rooms.filter((r) => assignments.some((a) => a.grade === grade && text(a.room) === r));
      rooms.sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
      roomSel.innerHTML = rooms.length ? rooms.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('') : '<option value="">-</option>';
      if (target?.room && rooms.includes(text(target.room))) roomSel.value = text(target.room);
    }
    function fillSubjects() {
      const grade = gradeSel.value;
      const room = roomSel.value;
      // กิจกรรมพัฒนาผู้เรียนต้องมีเวลาเข้าร่วม 80% เช่นกัน จึงเช็คได้ (เรียงท้ายสุด)
      let list = subjects.filter((s) => text(s.grade) === grade);
      if (scoped) {
        const mine = new Set(assignments.filter((a) => a.scope === 'subject' && a.grade === grade && text(a.room) === room).map((a) => text(a.subject_id)));
        const homeroom = assignments.some((a) => a.scope === 'homeroom' && a.grade === grade && text(a.room) === room);
        // ครูประจำชั้นเช็คได้ทุกวิชาของห้องตัวเอง (โรงเรียนที่สอนแบบผสม) · ครูประจำวิชาเช็คได้เฉพาะวิชาที่ได้รับมอบหมาย
        if (!homeroom) list = list.filter((s) => mine.has(text(s.id)));
        state.writable = homeroom ? null : mine;
      } else state.writable = null;
      list.sort((a, b) => subjectRank(a.name) - subjectRank(b.name) || text(a.code || a.name).localeCompare(text(b.code || b.name), 'th', { numeric: true }));
      subjectSel.innerHTML = list.length
        ? list.map((s) => `<option value="${esc(s.id)}">${esc([s.code, s.name].filter(Boolean).join(' '))}</option>`).join('')
        : '<option value="">ไม่มีวิชาที่เช็คชื่อได้ในห้องนี้</option>';
      if (target?.subjectId && list.some((s) => text(s.id) === text(target.subjectId))) subjectSel.value = text(target.subjectId);
    }

    // ---- ตารางสอน (วันไหน วันละกี่คาบ) ของวิชา + ห้อง + ภาคปัจจุบัน
    async function loadWeek() {
      state.week = new Map();
      try {
        const rows = await query((c) => c.from('subject_schedules').select('weekday,periods').eq('academic_year', state.year)
          .eq('semester', state.semester).eq('subject_id', subjectSel.value).eq('grade', gradeSel.value).eq('room', roomSel.value));
        rows.forEach((r) => state.week.set(Number(r.weekday), Number(r.periods) || 0));
        state.weekOk = true;
      } catch (error) {
        if (NEEDS_032(error)) { state.weekOk = false; return; }
        throw error;
      }
    }
    // ตารางสอนแสดงอย่างเดียว (owner 2026-10-15: "ต้องมีที่ตั้งค่าก่อน แล้วมาแสดงในหน้านี้") — ตั้ง/แก้ที่หน้า "ตารางสอนของฉัน"
    function renderWeek() {
      const week = state.week;
      const total = [...week.values()].reduce((sum, n) => sum + n, 0);
      const weekend = [6, 7].some((d) => week.get(d));
      const chosen = weekdayOf(dateInput.value);
      weekBox.innerHTML = `<div class="sa-week-head"><b><i class="bi bi-calendar-week"></i> ตารางสอนวิชานี้ ภาค ${state.semester}</b>
  <span class="sa-plan">${total ? `${total} คาบ/สัปดาห์` : 'ยังไม่ได้ตั้ง'}</span>
  <button type="button" class="sa-link" data-edit-week data-pp5-btn-skip><i class="bi bi-pencil-square"></i> ${total ? 'แก้ตารางสอน' : 'ตั้งตารางสอน'}</button></div>
${total ? `<div class="sa-days${weekend ? ' has-weekend' : ''}" aria-label="วันที่สอน">${(weekend ? DAYS : DAYS.slice(0, 5)).map((d) => {
        const n = week.get(d.n) || 0;
        return `<span class="sa-day${n ? ' is-on' : ''}${d.n === chosen ? ' is-chosen' : ''}"><b>${d.short}</b><span>${n ? n + ' คาบ' : 'ไม่สอน'}</span></span>`;
      }).join('')}</div>` : ''}`;
    }
    function editWeek() {
      if (!confirmLeave()) return;
      try {
        global.sessionStorage.setItem('pp5SubjectScheduleTarget', JSON.stringify({ grade: gradeSel.value, room: roomSel.value, subjectId: subjectSel.value, semester: state.semester }));
      } catch (_) { /* เลือกเองได้ */ }
      if (typeof global.navigateTo === 'function') global.navigateTo('subject_schedule');
    }

    // ---- โหลดรายชื่อ + ค่าของวันที่เลือก (ทุกคาบ)
    async function load(keepPeriod) {
      const token = ++state.token;
      const grade = gradeSel.value;
      const room = roomSel.value;
      const subjectId = subjectSel.value;
      const date = dateInput.value;
      if (!grade || !room || !subjectId) { periodBox.innerHTML = ''; weekBox.hidden = true; message('เลือกชั้น ห้อง และรายวิชา', ''); return; }
      if (!date) { message('เลือกวันที่สอน', ''); return; }
      state.canWrite = !state.writable || state.writable.has(subjectId);
      message('กำลังโหลดรายชื่อ…');
      try {
        const students = await global.PP5Data.students.list({ grade, room });
        const ids = students.map((s) => text(s.id));
        if (!ids.length) { message('ไม่พบนักเรียนในห้องนี้', 'warn'); return; }
        const [existing, daily, history] = await Promise.all([
          query((c) => c.from('subject_attendance').select('student_id,period,hours,status').eq('subject_id', subjectId).eq('attendance_date', date).in('student_id', ids)),
          query((c) => c.from('attendance_daily').select('student_id,status').eq('attendance_date', date).in('student_id', ids)).catch(() => []),
          query((c) => c.from('subject_attendance').select('attendance_date,period,hours,status,student_id').eq('subject_id', subjectId).eq('academic_year', state.year).in('student_id', ids)),
          loadWeek()
        ]);
        if (token !== state.token) return;
        if (!state.weekOk) { need032(); return; }
        state.students = students;
        state.fromDaily = new Map();
        state.hasDaily = daily.length > 0;
        daily.forEach((row) => { const st = dailyStatus(row.status); if (st && st !== 'present') state.fromDaily.set(text(row.student_id), st); });
        state.byPeriod = new Map();
        existing.forEach((row) => {
          const p = Number(row.period) || 1;
          if (!state.byPeriod.has(p)) state.byPeriod.set(p, new Map());
          state.byPeriod.get(p).set(text(row.student_id), row.status);
        });
        state.planned = state.week.get(weekdayOf(date)) || 0;
        state.period = keepPeriod && keepPeriod <= MAX_PERIODS ? keepPeriod
          : (target?.period && target.date === date ? Number(target.period) : firstOpenPeriod(state.planned, state.byPeriod));
        target = null;
        weekBox.hidden = false;
        renderWeek();
        showPeriod();
        renderHistory(history, date);
      } catch (error) {
        if (token !== state.token) return;
        if (NEEDS_032(error)) need032();
        else message(esc(error?.message || error), 'err');
      }
    }

    function renderPeriods() {
      const savedMax = Math.max(0, ...[...state.byPeriod.keys()]);
      const count = Math.min(MAX_PERIODS, Math.max(state.planned, savedMax, state.period, 1));
      const buttons = [];
      for (let p = 1; p <= count; p += 1) {
        const saved = state.byPeriod.get(p)?.size;
        buttons.push(`<button type="button" data-pp5-btn-skip data-period="${p}" class="${saved ? 'is-saved' : ''}" aria-pressed="${p === state.period}">${saved ? '<i class="bi bi-check-circle-fill"></i>' : ''}คาบ ${p}</button>`);
      }
      if (count < MAX_PERIODS && state.canWrite) buttons.push('<button type="button" class="sa-add" data-pp5-btn-skip data-add-period><i class="bi bi-plus-lg"></i> เพิ่มคาบ</button>');
      periodBox.innerHTML = buttons.join('');
      const day = DAYS.find((d) => d.n === weekdayOf(dateInput.value));
      planBox.textContent = state.planned ? `ตามตารางสอน วัน${day?.name || ''}มี ${state.planned} คาบ`
          : `สอนชดเชย — วัน${day?.name || ''}ไม่อยู่ในตารางสอนวิชานี้`;
    }
    // วันที่ไม่มีคาบวิชานี้ตามตารางสอน และยังไม่มีบันทึก: ถามก่อนว่าเลือกวันผิด หรือสอนชดเชยจริง
    const offDay = () => state.week.size > 0 && !state.planned && !state.byPeriod.size;
    function renderOffDay() {
      const date = dateInput.value;
      const day = DAYS.find((d) => d.n === weekdayOf(date));
      const teach = DAYS.filter((d) => state.week.get(d.n)).map((d) => d.short).join(' ');
      const near = nearTeachingDays(date, state.week, today(), dateInput.min);
      periodBox.innerHTML = '';
      planBox.textContent = `ตามตารางสอน วัน${day?.name || ''}ไม่มีคาบวิชานี้`;
      body.innerHTML = `<div class="sa-off">
  <h5><i class="bi bi-calendar-x"></i> วัน${esc(day?.name || '')}ที่ ${esc(thaiDate(date))} ไม่ใช่วันสอนวิชานี้</h5>
  <p>ตารางสอนภาค ${state.semester}: สอนวัน ${esc(teach)} — ถ้าเลือกวันผิด กดไปวันสอนด้านล่าง ถ้าวันนี้สอนชดเชยจริง กด "สอนชดเชยวันนี้"</p>
  <div class="sa-off-actions">${near.map((d) => `<button type="button" class="sa-goto" data-pp5-btn-skip data-goto-date="${esc(d)}"><i class="bi bi-arrow-right-circle"></i> ${esc(DAYS.find((x) => x.n === weekdayOf(d))?.short || '')} ${esc(thaiDate(d))}</button>`).join('')}
  ${state.canWrite ? '<button type="button" class="sa-makeup" data-pp5-btn-skip data-makeup><i class="bi bi-arrow-repeat"></i> สอนชดเชยวันนี้</button>' : ''}</div>
</div>`;
      bar.hidden = true;
    }
    // ยังไม่ได้ตั้งตารางสอนของวิชา/ห้อง/ภาคนี้: เช็คชื่อไม่ได้ ต้องตั้งก่อน ระบบจึงรู้ว่าวันไหนต้องเช็ค (owner 2026-10-15)
    function renderNoWeek() {
      periodBox.innerHTML = '';
      planBox.textContent = 'ยังไม่ได้ตั้งตารางสอน';
      body.innerHTML = `<div class="sa-off">
  <h5><i class="bi bi-calendar-plus"></i> ตั้งตารางสอนวิชานี้ก่อน แล้วจึงเช็คชื่อได้</h5>
  <p>ระบบต้องรู้ว่าวิชานี้ของห้อง ${esc(gradeSel.value + '/' + roomSel.value)} สอนวันไหน วันละกี่คาบ (ภาค ${state.semester}) จึงจะบอกได้ว่าวันนี้ต้องเช็คกี่คาบ
  และเตือนเมื่อเลือกวันที่ไม่ใช่วันสอน — ตั้งครั้งเดียวต่อภาค</p>
  <div class="sa-off-actions"><button type="button" class="sa-goto" data-pp5-btn-skip data-edit-week><i class="bi bi-calendar-week"></i> ไปตั้งตารางสอน</button></div>
</div>`;
      bar.hidden = true;
    }
    function showPeriod() {
      if (!state.week.size) { renderNoWeek(); return; }
      if (offDay() && state.makeupDate !== dateInput.value) { renderOffDay(); return; }
      const ids = state.students.map((s) => text(s.id));
      const start = startMarks(ids, state.period, state.byPeriod, state.fromDaily);
      state.marks = start.marks;
      state.source = start.source;
      state.from = start.from || 0;
      state.dirty = false;
      renderPeriods();
      renderList();
    }

    function counts() {
      const c = { present: 0, leave: 0, absent: 0 };
      state.marks.forEach((st) => { if (c[st] !== undefined) c[st] += 1; });
      return c;
    }
    function renderList() {
      const c = counts();
      const p = state.period;
      const source = state.source === 'saved'
        ? `<span class="sa-chip is-ok"><i class="bi bi-check-circle-fill"></i> คาบ ${p} บันทึกแล้ว — แก้ได้แล้วกดบันทึกอีกครั้ง</span>`
        : `<span class="sa-chip is-warn"><i class="bi bi-pencil"></i> คาบ ${p} ยังไม่ได้บันทึก</span>${state.source === 'period'
          ? `<span class="sa-chip">ค่าเริ่มต้นเหมือนคาบ ${state.from} — แก้เฉพาะคนที่ไม่อยู่</span>`
          : state.hasDaily ? '<span class="sa-chip">ค่าเริ่มต้นจากเช็คชื่อรายวัน</span>' : '<span class="sa-chip">ยังไม่มีเช็คชื่อรายวันของวันนี้ — เริ่มที่ มา ทุกคน</span>'}`
        + (state.week.size && !state.planned ? '<span class="sa-chip is-warn"><i class="bi bi-arrow-repeat"></i> สอนชดเชย</span>' : '');
      body.innerHTML = `<div class="sa-tools">
  <div class="sa-strip">${source}</div>
  <div class="sa-counts"><span class="sa-chip is-ok" data-c="present">มา ${c.present}</span><span class="sa-chip is-warn" data-c="leave">ลา ${c.leave}</span><span class="sa-chip" data-c="absent" style="color:var(--sa-bad)">ขาด ${c.absent}</span>
  ${state.canWrite ? '<button type="button" class="sa-link" data-all data-pp5-btn-skip>มาทั้งหมด</button>' : ''}</div>
</div>
${state.canWrite ? '' : '<div class="sa-note is-warn mb-2">ดูได้อย่างเดียว — บัญชีนี้ไม่ได้เป็นครูผู้สอนวิชานี้ในห้องนี้</div>'}
<ul class="sa-list">${state.students.map((s, i) => {
    const id = text(s.id);
    const st = state.marks.get(id) || 'present';
    const daily = state.fromDaily.get(id);
    return `<li class="sa-row" data-id="${esc(id)}"><span class="sa-no">${esc(text(s.studentNumber ?? s.student_number) || i + 1)}</span>
<span class="sa-name"><b>${esc(s.fullName || s.name || id)}</b>${daily ? `<small>เช็คชื่อรายวัน: ${daily === 'leave' ? 'ลา' : 'ขาด'}</small>` : ''}</span>
<span class="sa-seg" role="group" aria-label="สถานะ ${esc(s.fullName || id)}">${STATUS.map((x) => `<button type="button" data-pp5-btn-skip data-status="${x.key}" aria-pressed="${st === x.key}"${state.canWrite ? '' : ' disabled'}><i class="bi ${x.icon}"></i><span>${x.label}</span></button>`).join('')}</span></li>`;
  }).join('')}</ul>`;
      bar.hidden = !state.canWrite;
      clearBtn.hidden = state.source !== 'saved';
      saveBtn.innerHTML = `<i class="bi bi-save"></i> บันทึกคาบ ${p}`;
      setSay(state.source === 'saved' ? '' : `ตรวจรายชื่อแล้วกด บันทึกคาบ ${p}`, '');
    }
    function refreshCounts() {
      const c = counts();
      body.querySelectorAll('[data-c]').forEach((chip) => { chip.textContent = `${chip.dataset.c === 'present' ? 'มา' : chip.dataset.c === 'leave' ? 'ลา' : 'ขาด'} ${c[chip.dataset.c]}`; });
    }
    function renderHistory(rows, current) {
      // ชั่วโมงที่สอนของวันหนึ่ง = ผลรวมของแต่ละคาบ (แถวเก่าก่อน SQL 032 = คาบ 1 ที่มีหลายชั่วโมง)
      const days = new Map();
      rows.forEach((row) => {
        const d = text(row.attendance_date).slice(0, 10);
        const day = days.get(d) || { periods: new Map(), present: 0, leave: 0, absent: 0 };
        const p = Number(row.period) || 1;
        day.periods.set(p, Math.max(day.periods.get(p) || 0, Number(row.hours) || 1));
        if (day[row.status] !== undefined) day[row.status] += 1;
        days.set(d, day);
      });
      const list = [...days.entries()].map(([d, day]) => [d, { ...day, hours: [...day.periods.values()].reduce((a, b) => a + b, 0) }])
        .sort((a, b) => b[0].localeCompare(a[0]));
      const taught = list.reduce((sum, [, day]) => sum + day.hours, 0);
      const subject = subjects.find((s) => text(s.id) === subjectSel.value);
      const planned = Number(subject?.hours_per_year) || 0;
      historyBox.hidden = false;
      historyBox.innerHTML = `<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
  <b><i class="bi bi-clock-history"></i> บันทึกของวิชานี้ในห้องนี้</b>
  <span class="sa-chip">สอนและเช็คชื่อแล้ว ${taught}${planned ? ` / ${planned}` : ''} ชั่วโมง · ${list.length} วัน</span>
</div>
${list.length ? `<table><thead><tr><th>วันที่</th><th>คาบ</th><th>มา</th><th>ลา</th><th>ขาด</th></tr></thead><tbody>
${list.map(([d, day]) => `<tr data-date="${esc(d)}"${d === current ? ' class="is-current"' : ''}><td>${esc(thaiDate(d))}${state.week.size && !state.week.get(weekdayOf(d)) ? ' <span class="sa-chip is-warn">ชดเชย</span>' : ''}</td><td>${day.hours}</td><td>${day.present}</td><td>${day.leave}</td><td>${day.absent}</td></tr>`).join('')}
</tbody></table><div class="small mt-1" style="color:var(--sa-muted)">มา/ลา/ขาด นับรวมทุกคาบ · กดที่วันที่เพื่อเปิดแก้ไข</div>` : '<div class="sa-note">ยังไม่มีการเช็คชื่อรายคาบของวิชานี้ — ปก ปพ.5 แบบรายวิชาจะคิดเวลาเรียนจากเช็คชื่อรายวันไปก่อน</div>'}`;
    }

    const confirmLeave = () => !state.dirty || global.confirm('ยังไม่ได้บันทึกการเช็คชื่อที่แก้ไว้ ต้องการเปลี่ยนโดยไม่บันทึกใช่ไหม?');

    // ---- events
    root.addEventListener('click', async (event) => {
      const periodBtn = event.target.closest('[data-period]');
      if (periodBtn) {
        if (Number(periodBtn.dataset.period) !== state.period && confirmLeave()) { state.period = Number(periodBtn.dataset.period); showPeriod(); }
        return;
      }
      if (event.target.closest('[data-add-period]')) {
        if (!confirmLeave()) return;
        const savedMax = Math.max(0, ...[...state.byPeriod.keys()]);
        state.period = Math.min(MAX_PERIODS, Math.max(state.planned, savedMax, state.period, 1) + 1);
        showPeriod();
        return;
      }
      const statusBtn = event.target.closest('.sa-seg [data-status]');
      if (statusBtn && !statusBtn.disabled) {
        const row = statusBtn.closest('[data-id]');
        state.marks.set(row.dataset.id, statusBtn.dataset.status);
        row.querySelectorAll('[data-status]').forEach((b) => b.setAttribute('aria-pressed', String(b === statusBtn)));
        state.dirty = true;
        refreshCounts();
        setSay('ยังไม่ได้บันทึก', '');
        return;
      }
      if (event.target.closest('[data-all]')) {
        state.students.forEach((s) => state.marks.set(text(s.id), 'present'));
        body.querySelectorAll('.sa-seg').forEach((seg) => seg.querySelectorAll('[data-status]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.status === 'present'))));
        state.dirty = true;
        refreshCounts();
        return;
      }
      if (event.target.closest('[data-edit-week]')) { editWeek(); return; }
      const goto = event.target.closest('[data-goto-date]');
      if (goto) { dateInput.value = goto.dataset.gotoDate; remember(); load(); return; }
      if (event.target.closest('[data-makeup]')) { state.makeupDate = dateInput.value; showPeriod(); return; }
      const day = event.target.closest('tr[data-date]');
      if (day && confirmLeave()) { dateInput.value = day.dataset.date; remember(); load(); }
    });

    async function save(clear) {
      const period = state.period;
      const rows = state.students.map((s) => ({ student_id: text(s.id), status: clear ? null : state.marks.get(text(s.id)) || 'present' }));
      saveBtn.disabled = true;
      clearBtn.disabled = true;
      setSay('<span class="spinner-border spinner-border-sm"></span> กำลังบันทึก…', '');
      try {
        const { data, error } = await client().rpc('pp5_save_subject_period', {
          p_subject_id: subjectSel.value, p_date: dateInput.value, p_period: period, p_rows: rows
        });
        if (error) throw error;
        state.dirty = false;
        await load(period);
        // บันทึกคาบหนึ่งแล้ว ไปคาบถัดไปตามตารางสอนที่ยังไม่ได้บันทึกให้เอง
        const next = !clear && period < state.planned && !state.byPeriod.get(period + 1)?.size ? period + 1 : 0;
        if (next) { state.period = next; showPeriod(); }
        setSay(clear ? `<i class="bi bi-check-circle-fill"></i> ลบการเช็คชื่อคาบ ${period} แล้ว`
          : `<i class="bi bi-check-circle-fill"></i> บันทึกคาบ ${period} แล้ว ${data?.saved ?? rows.length} คน${next ? ` — ต่อด้วยคาบ ${next} (ตั้งต้นจากคาบ ${period})` : ''}`, 'ok');
      } catch (error) {
        if (NEEDS_032(error)) need032();
        else setSay(`<i class="bi bi-exclamation-triangle-fill"></i> บันทึกไม่สำเร็จ: ${esc(error?.message || error)}`, 'err');
      } finally {
        saveBtn.disabled = false;
        clearBtn.disabled = false;
      }
    }
    saveBtn.addEventListener('click', () => save(false));
    clearBtn.addEventListener('click', () => {
      if (global.confirm(`ลบการเช็คชื่อคาบ ${state.period} ของวันที่ ${thaiDate(dateInput.value)} ทั้งห้องใช่ไหม?`)) save(true);
    });

    let last = { grade: gradeSel.value, room: '', subject: '', date: dateInput.value };
    const remember = () => { last = { grade: gradeSel.value, room: roomSel.value, subject: subjectSel.value, date: dateInput.value }; };
    const guard = (select, key, after) => select.addEventListener('change', async () => {
      if (!confirmLeave()) { select.value = last[key]; return; }
      await after();
      remember();
    });
    guard(gradeSel, 'grade', async () => { await fillRooms(); fillSubjects(); await load(); });
    guard(roomSel, 'room', async () => { fillSubjects(); await load(); });
    guard(subjectSel, 'subject', () => load());
    guard(dateInput, 'date', () => load());

    await fillRooms();
    fillSubjects();
    remember();
    await load();
  }

  // แถบรูปหัวหน้าเหมือนหน้าอื่น (js/page-banner.js): ลงทะเบียนหน้านี้ตอนโหลด หัวเรื่องเดิม .sa-title ถูกซ่อน
  if (global.PP5PageBanner?.PAGES && !global.PP5PageBanner.PAGES.subject_attendance) {
    global.PP5PageBanner.PAGES.subject_attendance = {
      icon: 'bi-clock-history', title: 'เช็คชื่อรายวิชา (รายคาบ)',
      sub: 'ครูผู้สอนเช็คชื่อทุกคาบที่สอน ใช้คิดเวลาเรียนในปก ปพ.5 แบบรายวิชา', hide: '.sa > .sa-title'
    };
  }

  function apply() {
    const root = doc.getElementById('pp5SubjectAttendance');
    if (root && !root.__pp5Mounted) {
      root.__pp5Mounted = true;
      mount(root).catch((error) => {
        const box = root.querySelector('[data-body]');
        if (box) box.innerHTML = `<div class="sa-note is-err">${esc(error?.message || error)}</div>`;
      });
    }
  }
  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5SubjectAttendance) return;
    frame.__pp5SubjectAttendance = true;
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(apply).observe(frame, { childList: true, subtree: true });
    apply();
  }

  global.GAS_PAGES = global.GAS_PAGES || {};
  global.GAS_PAGES.subject_attendance = shell();
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
  global.PP5SubjectAttendance = { shell, dailyStatus, subjectRank, weekdayOf, startMarks, firstOpenPeriod, nearTeachingDays };
})(window);
