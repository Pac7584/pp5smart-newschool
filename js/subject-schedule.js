// หน้า "ตารางสอนของฉัน" — subject_schedule (owner 2026-10-15: "ต้องมีที่ตั้งค่าก่อน แล้วมาแสดงในหน้านี้เพื่อตัวครูจะได้รู้ว่า
// วันนี้จะเช็คชื่อ ไม่ใช่ว่าว่างมาตลอดครูเช็คชื่อแล้วมาบอกตอนหลังว่าเช็คไม่ถูกวัน")
//   ครูตั้งตารางสอนของทุกวิชา/ห้องที่สอนในหน้าเดียว ครั้งเดียวต่อภาค: แตะช่องวันเพื่อเพิ่มคาบ 0 -> 1 -> 2 -> 3 -> 4 -> 0
//   ครูประจำวิชา = วิชา+ห้องที่ได้รับมอบหมาย · ครูประจำชั้น = ทุกวิชาของห้องตัวเอง · ผู้ดูแล/ยังไม่เปิดสิทธิ์ครู = เลือกห้อง
//   หน้าเช็คชื่อรายวิชาจะให้เช็คได้เฉพาะวิชาที่ตั้งตารางสอนแล้ว และบอกว่าวันนี้มีกี่คาบ (js/subject-attendance.js)
// เขียนผ่าน pp5_save_subject_schedule เท่านั้น (SQL 202610150032) ซึ่งตรวจสิทธิ์รายวิชา/ห้องที่ฐานข้อมูล
(function initSubjectSchedule(global) {
  'use strict';
  const doc = global.document;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
  const client = () => global.PP5Data?.client;
  const DAYS = [
    { n: 1, short: 'จ.', name: 'จันทร์' }, { n: 2, short: 'อ.', name: 'อังคาร' }, { n: 3, short: 'พ.', name: 'พุธ' },
    { n: 4, short: 'พฤ.', name: 'พฤหัสบดี' }, { n: 5, short: 'ศ.', name: 'ศุกร์' }, { n: 6, short: 'ส.', name: 'เสาร์' }, { n: 7, short: 'อา.', name: 'อาทิตย์' }
  ];
  const GRADE_ORDER = ['อ.1', 'อ.2', 'อ.3', 'ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3'];
  const MISSING_SQL = ['42P01', 'PGRST205', 'PGRST202', '42883', '42703'];
  const keyOf = (subjectId, grade, room) => `${subjectId}|${grade}|${room}`;
  // ลำดับวิชาเดียวกับปก ปพ.5 แล้วกิจกรรมพัฒนาผู้เรียนท้ายสุด (เหมือน js/subject-attendance.js subjectRank)
  const ORDER = ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์', 'เทคโนโลยี', 'สังคมศึกษา', 'ประวัติศาสตร์', 'สุขศึกษา', 'ศิลปะ', 'การงาน', 'ภาษาอังกฤษ', 'หน้าที่พลเมือง', 'การป้องกัน'];
  function rank(name) {
    const n = text(name);
    const act = ['แนะแนว', 'ลูกเสือ', 'ชุมนุม', 'เพื่อสังคม'].findIndex((w) => n.includes(w));
    if (act !== -1) return 100 + act;
    if (['กิจกรรม', 'เนตรนารี', 'ชมรม'].some((w) => n.includes(w))) return 110;
    let index = -1;
    ORDER.forEach((word, i) => { if (n.includes(word)) index = i; });
    return index === -1 ? 99 : index;
  }
  const roomSort = (a, b) => (GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade)) || text(a.room).localeCompare(text(b.room), 'th', { numeric: true });

  // งานที่ต้องตั้งตารางสอน: (วิชา, ชั้น, ห้อง) — วิชาที่สอนเฉพาะภาคหนึ่ง (ม.ต้น) แสดงเฉพาะภาคนั้น
  function jobsFor(assignments, subjects, semester) {
    const out = new Map();
    const add = (subject, grade, room) => {
      if (!subject || (subject.semester && Number(subject.semester) !== Number(semester))) return;
      const key = keyOf(subject.id, grade, text(room));
      if (!out.has(key)) out.set(key, { key, subject, grade, room: text(room) });
    };
    assignments.forEach((a) => {
      // งานครูประจำวิชาเฉพาะภาค (ผู้ดูแลเลือก ภาค 1 / ภาค 2) แสดงเฉพาะภาคนั้น
      if (a.scope === 'subject') { if (!Number(a.semester) || Number(a.semester) === Number(semester)) add(subjects.find((s) => text(s.id) === text(a.subject_id)), a.grade, a.room); }
      else subjects.filter((s) => text(s.grade) === a.grade).forEach((s) => add(s, a.grade, a.room));
    });
    return [...out.values()].sort((a, b) => roomSort(a, b) || rank(a.subject.name) - rank(b.subject.name)
      || text(a.subject.code || a.subject.name).localeCompare(text(b.subject.code || b.subject.name), 'th', { numeric: true }));
  }
  // ---- คาบที่ค้างเช็ค (owner 2026-10-15 ขั้นที่ 3): ตารางสอน × วันเรียนในภาค (หักวันหยุด) เทียบกับคาบที่เช็คแล้ว
  // ช่วงภาค = settings_json.term_dates[ปี][ภาค] = { start, end } ที่ผู้ดูแลตั้ง (หน้าตั้งค่าระบบกลาง แท็บรูปแบบ ปพ.5)
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  // count_from (ไม่บังคับ, owner 2026-10-15 "แยกช่อง เริ่มนับตั้งแต่"): โรงเรียนที่เริ่มใช้กลางภาค นับคาบค้างตั้งแต่วันที่เริ่มใช้จริง
  //   start = วันที่เริ่มนับจริง (ค่าที่หลังกว่าระหว่างวันเปิดภาคกับ count_from) · termStart = วันเปิดภาคจริง
  function termRange(settingsJson, year, semester) {
    const all = settingsJson?.term_dates?.[text(year)];
    const r = all?.[String(semester)];
    if (!(r && ISO.test(text(r.start)) && ISO.test(text(r.end)) && r.start <= r.end)) return null;
    const from = ISO.test(text(all.count_from)) ? all.count_from : '';
    const start = from > r.start ? from : r.start;
    // empty = ภาคนี้ปิดก่อนวันเริ่มนับ (เช่น เริ่มใช้ช่วงปิดภาค) — ตั้งค่าครบแล้ว แต่ภาคนี้ไม่มีคาบต้องนับ
    return { start, end: r.end, termStart: r.start, countFrom: from, empty: start > r.end };
  }
  function isoAdd(iso, days) {
    const [y, m, d] = text(iso).split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + days));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
  }
  function weekdayOf(iso) {
    const [y, m, d] = text(iso).split('-').map(Number);
    const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return js === 0 ? 7 : js;
  }
  // วันสอนชดเชย (owner 2026-10-22 "ใช้ตารางของวันที่ถูกชดเชย"): settings_json.makeup_timetable = { "2569": { "2026-09-05": 4 } }
  //   = วันนั้นเรียนตามตารางสอนของวันพฤหัสบดี (1-7) · ผู้ดูแลตั้งที่หน้าตั้งค่าระบบกลาง แท็บรูปแบบ ปพ.5 · ไม่ได้ตั้ง = เหมือนเดิม
  //   (วันหยุด/เสาร์-อาทิตย์ไม่นับคาบรายวิชา) — กติกาเดียวกับ gas-bridge dailyFillRows
  function makeupMap(settingsJson, year) {
    const raw = settingsJson?.makeup_timetable?.[text(year)];
    const out = new Map();
    if (raw && typeof raw === 'object') {
      Object.entries(raw).forEach(([d, day]) => { const n = Number(day); if (ISO.test(d) && n >= 1 && n <= 7) out.set(d, n); });
    }
    return out;
  }
  const teachDay = (iso, makeup) => makeup?.get(iso) || weekdayOf(iso);
  // week: Map(วัน 1-7 -> คาบ) · recorded: Map('YYYY-MM-DD' -> Set(คาบที่เช็คแล้ว)) · holidays: Set('YYYY-MM-DD')
  // makeupDays: Map(วันที่ -> วันในตาราง) จาก makeupMap — วันสอนชดเชยใช้ตารางของวันนั้น แม้อยู่ในรายการวันหยุด
  // นับเฉพาะวันก่อนวันนี้ (วันนี้ยังเช็คได้ ไม่ถือว่าค้าง) · คาบที่สอนชดเชย (วันนอกตาราง หรือคาบเกินตาราง) หักออกจากที่ค้าง
  // dailyDates (owner 2026-10-22 "มันไม่ควรค้าง เพราะเราเช็คชื่อรายวันไปแล้ว มันต้องสัมพันธ์กัน" -> เลือก "ใช้รายวันแทน"):
  // Set('YYYY-MM-DD') วันที่ห้องนี้มีเช็คชื่อรายวันแล้ว — วันสอนที่ยังไม่มีรายคาบเลยแต่มีรายวัน ไม่นับว่าค้าง (byDaily)
  // กติกาเดียวกับ ปพ.5 รายวิชาใน gas-bridge (hourlyAttendance เติมรายวันเป็นรายคาบตามตารางสอน)
  function missedPeriods(week, recorded, range, holidays, todayIso, dailyDates, makeupDays) {
    const off = (d) => holidays?.has(d) && !makeupDays?.has(d);
    if (!range || !week || !week.size) return null;
    if (range.empty) return { planned: 0, missed: [], missedCount: 0, makeup: 0, owed: 0, byDaily: 0, notYet: 'ended' };
    if (todayIso <= range.start) return { planned: 0, missed: [], missedCount: 0, makeup: 0, owed: 0, byDaily: 0, notYet: 'future' };
    const last = [range.end, isoAdd(todayIso, -1)].sort()[0];
    const missed = [];
    let planned = 0;
    let missedCount = 0;
    let byDaily = 0;
    for (let d = range.start; d <= last; d = isoAdd(d, 1)) {
      const n = Number(week.get(teachDay(d, makeupDays))) || 0;
      if (!n || off(d)) continue;
      planned += n;
      const got = recorded.get(d) || new Set();
      const lack = [];
      for (let p = 1; p <= n; p += 1) if (!got.has(p)) lack.push(p);
      // owner 2026-10-22: คาบที่ยังไม่ได้เช็ค (ทั้งวัน หรือเฉพาะคาบที่เหลือของวันที่เช็คไม่ครบ) ใช้รายวันแทนถ้าห้องมีเช็คชื่อรายวัน
      if (lack.length && dailyDates?.has(d)) { byDaily += lack.length; continue; }
      if (lack.length) { missed.push({ date: d, periods: lack }); missedCount += lack.length; }
    }
    let makeup = 0;
    recorded.forEach((periods, d) => {
      if (d < range.start || d > last) return;
      const n = off(d) ? 0 : Number(week.get(teachDay(d, makeupDays))) || 0;
      periods.forEach((p) => { if (p > n) makeup += 1; });
    });
    return { planned, missed, missedCount, makeup, owed: Math.max(0, missedCount - makeup), byDaily };
  }

  // แถวรายคาบที่ได้จากเช็คชื่อรายวัน (owner 2026-10-22 "ใช้รายวันแทน") — กติกาเดียวกับ gas-bridge dailyFillRows:
  // วันสอนตามตารางสอนที่วิชานี้ยังไม่มีรายคาบเลย แต่นักเรียนมีเช็คชื่อรายวัน -> สถานะรายวันกับทุกคาบของวันนั้น
  // weeks: Map(ภาค 1|2 -> Map(วัน 1-7 -> คาบ)) · ภาคของวันที่ = พ.ค.–ต.ค. 1 / อื่น ๆ 2 (pp5_semester_of)
  const DAILY_STATUS = { present: 'present', 'มา': 'present', leave: 'leave', 'ลา': 'leave', absent: 'absent', 'ขาด': 'absent' };
  function fillFromDaily(hourlyRows, dailyRows, weeks, studentIds, holidays, makeup) {
    if (!weeks || !weeks.size) return [];
    // คาบที่เช็คแล้วของแต่ละวัน — owner 2026-10-22: วันที่เช็คไม่ครบ คาบที่เหลือก็ใช้รายวันแทน
    const taught = new Map();
    (hourlyRows || []).forEach((r) => {
      const d = text(r.attendance_date).slice(0, 10);
      if (!taught.has(d)) taught.set(d, new Set());
      taught.get(d).add(Number(r.period) || 1);
    });
    const inRoom = studentIds ? new Set([...studentIds].map(text)) : null;
    const out = [];
    (dailyRows || []).forEach((row) => {
      const date = text(row.attendance_date).slice(0, 10);
      const status = DAILY_STATUS[text(row.status).toLowerCase()];
      if (!status || (holidays?.has(date) && !makeup?.has(date)) || (inRoom && !inRoom.has(text(row.student_id)))) return;
      const m = Number(date.slice(5, 7));
      const n = Number(weeks.get(m >= 5 && m <= 10 ? 1 : 2)?.get(teachDay(date, makeup))) || 0;
      const done = taught.get(date) || new Set();
      for (let p = 1; p <= n; p += 1) if (!done.has(p)) out.push({ student_id: text(row.student_id), attendance_date: date, period: p, hours: 1, status, fromDaily: true });
    });
    return out;
  }

  const nextCount = (n) => ((Number(n) || 0) + 1) % 5;
  const total = (week) => [...(week || new Map()).values()].reduce((sum, n) => sum + (Number(n) || 0), 0);

  const STYLE = `
.ss{--ss-line:#e3e6ee;--ss-muted:#5b6275;--ss-soft:#f6f7fb;--ss-card:#fff;--ss-text:#1f2937;--ss-accent:var(--primary,#4f46e5);
  --ss-ok:#13795b;--ss-ok-bg:#e6f6ef;--ss-warn:#a15c00;--ss-warn-bg:#fff4e0;--ss-bad:#c2362b;--ss-bad-bg:#fdecea;
  max-width:1100px;margin:0 auto;padding:0 0 96px;color:var(--ss-text)}
[data-theme="dark"] .ss{--ss-line:#2b3446;--ss-muted:#a7afbd;--ss-soft:#161d2b;--ss-card:#1b2232;--ss-text:#e5e7eb;
  --ss-ok:#6fe0b4;--ss-ok-bg:rgba(111,224,180,.12);--ss-warn:#ffc46b;--ss-warn-bg:rgba(255,196,107,.12);--ss-bad:#ff8a80;--ss-bad-bg:rgba(255,138,128,.12)}
.ss-title{display:none}
.ss-card{background:var(--ss-card);border:1px solid var(--ss-line);border-radius:16px;padding:14px 16px;margin-bottom:12px}
.ss-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.ss-sem{display:inline-flex;border:1.5px solid var(--ss-line);border-radius:12px;overflow:hidden}
.ss-sem button{border:0;background:var(--ss-card);color:var(--ss-muted);font-weight:700;padding:.5rem 1.1rem}
.ss-sem button[aria-pressed="true"]{background:var(--ss-accent);color:#fff}
.ss-help{font-size:.88rem;color:var(--ss-muted);margin:10px 0 0}
.ss-room{display:flex;align-items:center;gap:8px;font-weight:800;font-size:1rem;margin:16px 0 8px}
.ss-room span{padding:2px 12px;border-radius:999px;background:color-mix(in srgb,var(--ss-accent) 12%,transparent);color:var(--ss-accent)}
.ss-table{width:100%;border-collapse:separate;border-spacing:0 6px;table-layout:fixed}
.ss-table col.ss-col-subj{width:30%}.ss-table col.ss-col-sum{width:120px}
.ss-table th{font-size:.8rem;color:var(--ss-muted);font-weight:700;text-align:center;padding:0 4px}
.ss-table th:first-child{text-align:left}
.ss-row td{background:var(--ss-soft);padding:6px 4px;text-align:center;vertical-align:middle}
.ss-row td:first-child{border-radius:12px 0 0 12px;text-align:left;padding-left:12px}
.ss-row td:last-child{border-radius:0 12px 12px 0;padding-right:12px}
.ss-row.is-target td{background:color-mix(in srgb,var(--ss-accent) 12%,var(--ss-soft))}
.ss-subj b{display:block;font-size:.95rem}.ss-subj small{color:var(--ss-muted);font-size:.78rem}
.ss-cell{width:100%;min-width:52px;min-height:44px;border-radius:10px;border:1.5px dashed var(--ss-line);background:var(--ss-card);
  color:var(--ss-muted);font-weight:700;font-size:.95rem}
.ss-cell.is-on{border-style:solid;border-color:var(--ss-accent);background:var(--ss-accent);color:#fff;box-shadow:0 4px 10px color-mix(in srgb,var(--ss-accent) 30%,transparent)}
.ss-cell.is-changed{outline:3px solid color-mix(in srgb,var(--ss-warn) 55%,transparent);outline-offset:1px}
.ss-sum{font-weight:800;white-space:nowrap}
.ss-chip{display:inline-flex;align-items:center;gap:4px;font-size:.75rem;font-weight:700;padding:.1rem .55rem;border-radius:999px;white-space:nowrap}
.ss-chip.is-ok{background:var(--ss-ok-bg);color:var(--ss-ok)}.ss-chip.is-warn{background:var(--ss-warn-bg);color:var(--ss-warn)}
.ss-chip.is-none{background:var(--ss-bad-bg);color:var(--ss-bad)}
.ss-day-total td{font-size:.8rem;color:var(--ss-muted);text-align:center;font-weight:700}
.ss-day-total td:first-child{text-align:left}
.ss-bar{position:sticky;bottom:0;z-index:5;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;
  background:var(--ss-card);border:1px solid var(--ss-line);border-radius:14px;padding:10px 14px;box-shadow:0 -6px 18px rgba(15,23,42,.08)}
.ss-say{font-size:.88rem}.ss-say.is-ok{color:var(--ss-ok)}.ss-say.is-err{color:var(--ss-bad)}
.ss-save{border:0;border-radius:10px;padding:.55rem 1.2rem;font-weight:700;background:var(--ss-accent);color:#fff;display:inline-flex;align-items:center;gap:6px}
.ss-save:disabled{opacity:.55}
.ss-link{border:1px solid var(--ss-line);background:var(--ss-card);color:var(--ss-text);border-radius:10px;padding:.45rem .9rem;font-weight:600;font-size:.88rem}
.ss-note{padding:10px 12px;border-radius:10px;font-size:.9rem;background:var(--ss-soft);color:var(--ss-muted)}
.ss-note.is-err{background:var(--ss-bad-bg);color:var(--ss-bad)}.ss-note.is-warn{background:var(--ss-warn-bg);color:var(--ss-warn)}
.ss-pick{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
@media (max-width:700px){
  .ss-table thead{display:none}
  .ss-table,.ss-table tbody{display:block}
  .ss-row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;background:var(--ss-soft);border-radius:14px;padding:10px;margin-bottom:8px}
  .ss-row.has-weekend{grid-template-columns:repeat(7,minmax(0,1fr))}
  .ss-row td{background:transparent!important;padding:0!important;border-radius:0!important}
  .ss-row td:first-child,.ss-row td:last-child{grid-column:1/-1}
  .ss-row td[data-day]::before{content:attr(data-label);display:block;font-size:.72rem;color:var(--ss-muted);font-weight:700}
  .ss-day-total{display:none}}`;

  function shell() {
    return `<div class="ss" id="pp5SubjectSchedule"><style>${STYLE}</style>
<h4 class="ss-title">ตารางสอนของฉัน</h4>
<div class="ss-card">
  <div class="ss-top">
    <div class="ss-sem" role="group" aria-label="ภาคเรียน" data-sem></div>
    <div class="ss-pick" data-pick></div>
  </div>
  <p class="ss-help"><i class="bi bi-hand-index"></i> แตะช่องวันเพื่อเพิ่มคาบ (ว่าง → 1 → 2 → 3 → 4 → ว่าง) แล้วกด <b>บันทึกตารางสอน</b>
  · ตั้งครั้งเดียวต่อภาค หน้าเช็คชื่อรายวิชาจะบอกว่าวันไหนต้องเช็คกี่คาบ</p>
</div>
<div class="ss-card" data-body><div class="ss-note">กำลังโหลด…</div></div>
<div class="ss-bar" data-bar hidden><span class="ss-say" data-say></span>
  <button type="button" class="ss-save" data-save data-pp5-btn-skip disabled><i class="bi bi-save"></i> บันทึกตารางสอน</button></div>
</div>`;
  }

  async function mount(root) {
    const $ = (sel) => root.querySelector(sel);
    const body = $('[data-body]');
    const bar = $('[data-bar]');
    const say = $('[data-say]');
    const saveBtn = $('[data-save]');
    const semBox = $('[data-sem]');
    const pickBox = $('[data-pick]');
    const setSay = (msg, kind) => { say.className = `ss-say${kind ? ` is-${kind}` : ''}`; say.innerHTML = msg; };
    const state = { year: '', semester: 1, saved: new Map(), draft: new Map(), jobs: [], subjects: [], scoped: false, assignments: [], room: '', weekend: false };
    let target = null;
    // เลื่อนไปที่แถววิชาที่เปิดมาครั้งเดียวตอนเปิดหน้า (owner 2026-10-22: เดิมเลื่อนทุกครั้งที่วาดใหม่
    // กดช่องวันของวิชาด้านล่างแล้วหน้าเด้งขึ้นไปที่แถวนั้นเสมอ)
    let targetShown = false;
    try {
      target = JSON.parse(global.sessionStorage.getItem('pp5SubjectScheduleTarget') || 'null');
      global.sessionStorage.removeItem('pp5SubjectScheduleTarget');
    } catch (_) { target = null; }

    const settings = await global.PP5Data.settings.get();
    state.year = text(settings.academicYear || settings.academic_year);
    state.semester = Number(target?.semester || settings.semester || settings.currentSemester) === 2 ? 2 : 1;
    let role = '';
    try { role = (await global.PP5Data.auth.requireUser())?.profile?.role || ''; } catch (_) { role = ''; }
    let scope = null;
    try { const { data } = await client().rpc('pp5_teacher_scope_context'); scope = data && data.enabled ? data : null; } catch (_) { scope = null; }
    state.scoped = role === 'teacher' && !!scope;
    state.assignments = state.scoped ? (scope.assignments || []).filter((a) => a.active !== false && text(a.academic_year) === state.year
      && global.PP5WorkMode?.keeps?.(a, scope, 0) !== false) : [];
    const { data: subjects, error: subjectError } = await client().from('subjects').select('*');
    if (subjectError) throw subjectError;
    state.subjects = subjects || [];

    // ผู้ดูแล / ยังไม่เปิดสิทธิ์ครู: เลือกห้องเอง
    let rooms = [];
    if (!state.scoped) {
      try {
        const students = await global.PP5Data.students.list({});
        const seen = new Map();
        students.forEach((s) => { const g = text(s.grade); const r = text(s.room || s.classNo || '1'); if (g && /^(ป|ม)\./.test(g)) seen.set(`${g}/${r}`, { grade: g, room: r }); });
        rooms = [...seen.values()].sort(roomSort);
      } catch (_) { rooms = []; }
      const first = rooms.find((r) => target && r.grade === target.grade && r.room === text(target.room)) || rooms[0];
      state.room = first ? `${first.grade}/${first.room}` : '';
      pickBox.innerHTML = rooms.length ? `<label class="d-flex align-items-center gap-2"><b>ห้อง</b><select class="form-select" data-room-pick>${rooms.map((r) =>
        `<option value="${esc(r.grade + '/' + r.room)}"${`${r.grade}/${r.room}` === state.room ? ' selected' : ''}>${esc(r.grade + '/' + r.room)}</option>`).join('')}</select></label>` : '';
    }

    function computeJobs() {
      if (state.scoped) return jobsFor(state.assignments, state.subjects, state.semester);
      if (!state.room) return [];
      const [grade, room] = state.room.split('/');
      return jobsFor([{ scope: 'homeroom', grade, room }], state.subjects, state.semester);
    }

    async function load() {
      body.innerHTML = '<div class="ss-note">กำลังโหลด…</div>';
      semBox.innerHTML = [1, 2].map((s) => `<button type="button" data-pp5-btn-skip data-semester="${s}" aria-pressed="${s === state.semester}">ภาคเรียนที่ ${s}</button>`).join('');
      state.jobs = computeJobs();
      state.draft = new Map();
      if (!state.jobs.length) {
        body.innerHTML = `<div class="ss-note is-warn">${state.scoped ? 'ยังไม่มีวิชาที่ได้รับมอบหมายในปีนี้ — ให้ผู้ดูแลมอบหมาย "ครูประจำวิชา" ให้บัญชีนี้ก่อน' : 'ยังไม่มีรายวิชาของห้องนี้ — เพิ่มรายวิชาในหน้าจัดการรายวิชาก่อน'}</div>`;
        bar.hidden = true;
        return;
      }
      try {
        const { data, error } = await client().from('subject_schedules').select('subject_id,grade,room,semester,weekday,periods')
          .eq('academic_year', state.year).in('subject_id', [...new Set(state.jobs.map((j) => j.subject.id))]);
        if (error) throw error;
        state.saved = new Map();
        (data || []).forEach((r) => {
          const key = `${r.semester}:${keyOf(r.subject_id, r.grade, text(r.room))}`;
          if (!state.saved.has(key)) state.saved.set(key, new Map());
          state.saved.get(key).set(Number(r.weekday), Number(r.periods) || 0);
        });
      } catch (error) {
        if (MISSING_SQL.includes(error?.code) || /subject_schedules/.test(text(error?.message))) {
          body.innerHTML = '<div class="ss-note is-err">ฐานข้อมูลยังไม่มีตารางสอน — ผู้ดูแลต้องรัน SQL <b>202610150032_subject_periods.sql</b> ใน Supabase ก่อน</div>';
          bar.hidden = true;
          return;
        }
        throw error;
      }
      render();
    }

    const savedWeek = (job, sem = state.semester) => state.saved.get(`${sem}:${job.key}`) || new Map();
    const weekOf = (job) => state.draft.get(job.key) || savedWeek(job);
    function render() {
      state.weekend = state.weekend || state.jobs.some((j) => [6, 7].some((d) => weekOf(j).get(d)));
      const days = state.weekend ? DAYS : DAYS.slice(0, 5);
      const byRoom = new Map();
      state.jobs.forEach((j) => { const r = `${j.grade}/${j.room}`; if (!byRoom.has(r)) byRoom.set(r, []); byRoom.get(r).push(j); });
      const missing = state.jobs.filter((j) => !total(weekOf(j))).length;
      const copyable = state.semester === 2 && state.jobs.some((j) => !total(savedWeek(j)) && total(savedWeek(j, 1)));
      body.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center justify-content-between">
  <span>${missing ? `<span class="ss-chip is-none"><i class="bi bi-exclamation-circle-fill"></i> ยังไม่ได้ตั้ง ${missing} วิชา</span>` : '<span class="ss-chip is-ok"><i class="bi bi-check-circle-fill"></i> ตั้งครบทุกวิชาแล้ว</span>'}</span>
  <span class="d-inline-flex gap-2">${copyable ? '<button type="button" class="ss-link" data-copy data-pp5-btn-skip><i class="bi bi-files"></i> คัดลอกจากภาค 1</button>' : ''}
  ${state.weekend ? '' : '<button type="button" class="ss-link" data-weekend data-pp5-btn-skip>+ เสาร์/อาทิตย์</button>'}</span>
</div>
${[...byRoom.entries()].map(([room, jobs]) => `<div class="ss-room"><i class="bi bi-door-open"></i> ห้อง <span>${esc(room)}</span></div>
<table class="ss-table"><colgroup><col class="ss-col-subj">${days.map(() => '<col>').join('')}<col class="ss-col-sum"></colgroup><thead><tr><th>รายวิชา</th>${days.map((d) => `<th>${d.short}</th>`).join('')}<th>รวม/สัปดาห์</th></tr></thead><tbody>
${jobs.map((j) => {
    const week = weekOf(j);
    const sum = total(week);
    const ppw = Number(j.subject.periods_per_week) || 0;
    const changed = state.draft.has(j.key);
    const status = !sum ? '<span class="ss-chip is-none">ยังไม่ตั้ง</span>'
      : ppw && ppw !== sum ? `<span class="ss-chip is-warn" title="หน้ารายวิชากำหนด ${ppw} คาบ/สัปดาห์">ไม่ตรง (${ppw})</span>` : '<span class="ss-chip is-ok"><i class="bi bi-check"></i></span>';
    const isTarget = target && text(target.subjectId) === text(j.subject.id) && target.grade === j.grade && text(target.room) === j.room;
    return `<tr class="ss-row${state.weekend ? ' has-weekend' : ''}${isTarget ? ' is-target' : ''}" data-key="${esc(j.key)}">
  <td class="ss-subj"><b>${esc(j.subject.name)}</b><small>${esc(j.subject.code || '')}${ppw ? ` · กำหนด ${ppw} คาบ/สัปดาห์` : ''}</small></td>
  ${days.map((d) => {
    const n = week.get(d.n) || 0;
    const was = savedWeek(j).get(d.n) || 0;
    return `<td data-day data-label="${d.short}"><button type="button" class="ss-cell${n ? ' is-on' : ''}${changed && n !== was ? ' is-changed' : ''}" data-pp5-btn-skip data-cell="${d.n}" aria-label="${esc(j.subject.name)} ${esc(room)} วัน${d.name} ${n ? n + ' คาบ' : 'ไม่สอน'}">${n || '–'}</button></td>`;
  }).join('')}
  <td><span class="ss-sum">${sum}</span> ${status}</td></tr>`;
  }).join('')}
<tr class="ss-day-total"><td>รวมต่อวัน</td>${days.map((d) => `<td>${jobs.reduce((s, j) => s + (weekOf(j).get(d.n) || 0), 0) || '–'}</td>`).join('')}<td></td></tr>
</tbody></table>`).join('')}`;
      bar.hidden = false;
      saveBtn.disabled = !state.draft.size;
      if (!say.textContent || state.draft.size) setSay(state.draft.size ? `แก้ไว้ ${state.draft.size} วิชา — ยังไม่ได้บันทึก` : '', '');
      const targetRow = target && !targetShown ? body.querySelector('.ss-row.is-target') : null;
      if (targetRow) { targetShown = true; targetRow.scrollIntoView?.({ block: 'center' }); }
    }

    root.addEventListener('click', async (event) => {
      const semBtn = event.target.closest('[data-semester]');
      if (semBtn) {
        const next = Number(semBtn.dataset.semester);
        if (next !== state.semester && (!state.draft.size || global.confirm('ยังไม่ได้บันทึกตารางที่แก้ไว้ ต้องการเปลี่ยนภาคโดยไม่บันทึกใช่ไหม?'))) {
          state.semester = next; setSay('', ''); await load();
        }
        return;
      }
      const cell = event.target.closest('[data-cell]');
      if (cell) {
        const key = cell.closest('[data-key]').dataset.key;
        const job = state.jobs.find((j) => j.key === key);
        const week = new Map(weekOf(job));
        const d = Number(cell.dataset.cell);
        const n = nextCount(week.get(d));
        if (n) week.set(d, n); else week.delete(d);
        const same = total(week) === total(savedWeek(job)) && [...week.entries()].every(([k, v]) => savedWeek(job).get(k) === v);
        if (same) state.draft.delete(key); else state.draft.set(key, week);
        render();
        // ตารางวาดใหม่ทั้งก้อน: คืนโฟกัสให้ช่องเดิม (กดต่อด้วยคีย์บอร์ดได้) โดยไม่เลื่อนหน้า
        const row = [...body.querySelectorAll('[data-key]')].find((r) => r.dataset.key === key);
        row?.querySelector(`[data-cell="${d}"]`)?.focus?.({ preventScroll: true });
        return;
      }
      if (event.target.closest('[data-weekend]')) { state.weekend = true; render(); return; }
      if (event.target.closest('[data-copy]')) {
        state.jobs.forEach((j) => { if (!total(savedWeek(j)) && total(savedWeek(j, 1))) state.draft.set(j.key, new Map(savedWeek(j, 1))); });
        render();
      }
    });
    root.addEventListener('change', async (event) => {
      if (!event.target.matches('[data-room-pick]')) return;
      if (state.draft.size && !global.confirm('ยังไม่ได้บันทึกตารางที่แก้ไว้ ต้องการเปลี่ยนห้องโดยไม่บันทึกใช่ไหม?')) { event.target.value = state.room; return; }
      state.room = event.target.value;
      setSay('', '');
      await load();
    });
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      setSay('<span class="spinner-border spinner-border-sm"></span> กำลังบันทึก…', '');
      const failed = [];
      let done = 0;
      for (const [key, week] of [...state.draft.entries()]) {
        const job = state.jobs.find((j) => j.key === key);
        const { error } = await client().rpc('pp5_save_subject_schedule', {
          p_subject_id: job.subject.id, p_grade: job.grade, p_room: job.room, p_semester: state.semester,
          p_days: [...week.entries()].filter(([, n]) => n > 0).map(([weekday, periods]) => ({ weekday, periods }))
        });
        if (error) failed.push(`${job.subject.name} ${job.grade}/${job.room}: ${error.message}`);
        else { done += 1; state.draft.delete(key); state.saved.set(`${state.semester}:${key}`, new Map(week)); }
      }
      render();
      if (failed.length) setSay(`<i class="bi bi-exclamation-triangle-fill"></i> บันทึกได้ ${done} วิชา ไม่สำเร็จ ${failed.length}: ${esc(failed.join(' · '))}`, 'err');
      else setSay(`<i class="bi bi-check-circle-fill"></i> บันทึกตารางสอนแล้ว ${done} วิชา`, 'ok');
    });

    await load();
  }

  if (global.PP5PageBanner?.PAGES && !global.PP5PageBanner.PAGES.subject_schedule) {
    global.PP5PageBanner.PAGES.subject_schedule = {
      icon: 'bi-calendar-week', title: 'ตารางสอนของฉัน',
      sub: 'ตั้งวันและจำนวนคาบที่สอนแต่ละวิชา ครั้งเดียวต่อภาค — ใช้บอกว่าวันไหนต้องเช็คชื่อรายวิชา', hide: '.ss > .ss-title'
    };
  }
  function apply() {
    const root = doc.getElementById('pp5SubjectSchedule');
    if (root && !root.__pp5Mounted) {
      root.__pp5Mounted = true;
      mount(root).catch((error) => {
        const box = root.querySelector('[data-body]');
        if (box) box.innerHTML = `<div class="ss-note is-err">${esc(error?.message || error)}</div>`;
      });
    }
  }
  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5SubjectSchedule) return;
    frame.__pp5SubjectSchedule = true;
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(apply).observe(frame, { childList: true, subtree: true });
    apply();
  }
  global.GAS_PAGES = global.GAS_PAGES || {};
  global.GAS_PAGES.subject_schedule = shell();
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
  global.PP5SubjectSchedule = { shell, jobsFor, nextCount, total, keyOf, termRange, missedPeriods, fillFromDaily, isoAdd, weekdayOf, makeupMap, teachDay };
})(window);
