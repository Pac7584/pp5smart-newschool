// หน้า "เช็คชื่อรายวิชา (รายชั่วโมง)" — subject_attendance (owner 2026-10-14: "ในวิชานั้นๆมันต้องมีเช็คชื่อรายชั่วโมง")
// เจ้าของเลือก: ครูผู้สอนวิชานั้นเป็นคนเช็ค + ครูประจำชั้นเช็คได้ทุกวิชาของห้องตัวเอง (ผู้ดูแลเช็คแทนได้) · ครูเลือกเองว่าวันนั้นสอนกี่ชั่วโมง (ไม่ต้องมีตารางสอน)
// · รายชื่อดึงค่าเริ่มต้นจากเช็คชื่อรายวัน (เช้านั้นขาด/ลา = ขาด/ลา ที่เหลือ = มา) แล้วครูแก้เฉพาะคนที่ไม่เข้าคาบ
// กด "บันทึกทั้งหมด" ครั้งเดียว · ร้อยละเวลาเรียน = ชั่วโมงที่มา ÷ ชั่วโมงที่สอนและบันทึกแล้ว (คิดในปก ปพ.5 แบบรายวิชา)
// เขียนผ่าน pp5_save_subject_attendance เท่านั้น (SQL 202610140031) ซึ่งตรวจสิทธิ์ที่ฐานข้อมูล
// ไม่เรียกผ่าน GasServer: ตัวกันสิทธิ์ครู (teacher-permissions) ถือชื่อเมธอดที่มีคำว่า Attendance เป็นงานครูประจำชั้น
(function initSubjectAttendance(global) {
  'use strict';
  const doc = global.document;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
  const client = () => global.PP5Data?.client;
  const ACTIVITY = ['กิจกรรม', 'แนะแนว', 'ลูกเสือ', 'เนตรนารี', 'ชุมนุม', 'เพื่อสังคม', 'ชมรม'];
  // ลำดับวิชาเดียวกับปก ปพ.5 (gas-bridge comparePp5CoverSubjects)
  const ORDER = ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์', 'เทคโนโลยี', 'สังคมศึกษา', 'ประวัติศาสตร์', 'สุขศึกษา', 'ศิลปะ', 'การงาน', 'ภาษาอังกฤษ', 'หน้าที่พลเมือง', 'การป้องกัน'];
  const GRADE_ORDER = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3'];
  const STATUS = [
    { key: 'present', label: 'มา', icon: 'bi-check-lg' },
    { key: 'leave', label: 'ลา', icon: 'bi-envelope' },
    { key: 'absent', label: 'ขาด', icon: 'bi-x-lg' }
  ];
  const MISSING_SQL = ['42P01', 'PGRST205', 'PGRST202', '42883'];

  function subjectRank(name) {
    let index = -1;
    ORDER.forEach((word, i) => { if (text(name).includes(word)) index = i; });
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
@media (min-width:760px){.sa-controls{grid-template-columns:110px 90px minmax(0,1fr) 170px 150px}.sa-controls .sa-wide{grid-column:auto}}
.sa-controls label{display:block;font-weight:600;font-size:.85rem;margin-bottom:4px}
.sa-hours{display:flex;gap:6px}
.sa-hours button{flex:1;min-height:38px;border-radius:8px;border:1px solid var(--sa-line);background:var(--sa-card);color:var(--sa-text);font-weight:600}
.sa-hours button[aria-pressed="true"]{background:var(--sa-accent);border-color:var(--sa-accent);color:#fff}
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
.sa-history table{width:100%;font-size:.85rem;border-collapse:collapse}
.sa-history th,.sa-history td{padding:6px 8px;border-top:1px solid var(--sa-line);text-align:center}
.sa-history th:first-child,.sa-history td:first-child{text-align:left}
.sa-history tr[data-date]{cursor:pointer}
.sa-history tr[data-date]:hover{background:var(--sa-soft)}
.sa-history tr.is-current{background:color-mix(in srgb,var(--sa-accent) 9%,transparent)}
.sa-note{padding:10px 12px;border-radius:10px;font-size:.88rem;background:var(--sa-soft);color:var(--sa-muted)}
.sa-note.is-err{background:var(--sa-bad-bg);color:var(--sa-bad)} .sa-note.is-warn{background:var(--sa-warn-bg);color:var(--sa-warn)}
@media (max-width:520px){.sa-seg button{min-width:44px;font-size:.82rem}.sa-seg button i{display:none}.sa-row{grid-template-columns:26px minmax(0,1fr) auto;gap:6px}}`;

  function shell() {
    return `<div class="sa" id="pp5SubjectAttendance"><style>${STYLE}</style>
<h4 class="sa-title">เช็คชื่อรายวิชา (รายชั่วโมง)</h4>
<div class="sa-card">
  <div class="sa-controls">
    <div><label for="saGrade">ชั้น</label><select id="saGrade" class="form-select"></select></div>
    <div><label for="saRoom">ห้อง</label><select id="saRoom" class="form-select"></select></div>
    <div class="sa-wide"><label for="saSubject">รายวิชา</label><select id="saSubject" class="form-select"></select></div>
    <div><label for="saDate">วันที่สอน</label><input id="saDate" type="date" class="form-control"></div>
    <div><label>สอนวันนี้กี่ชั่วโมง</label><div class="sa-hours" role="group" aria-label="จำนวนชั่วโมง">
      ${[1, 2, 3, 4].map((h) => `<button type="button" data-hours="${h}" aria-pressed="${h === 1}">${h}</button>`).join('')}
    </div></div>
  </div>
</div>
<div class="sa-card" data-body><div class="sa-note">กำลังโหลด…</div></div>
<div class="sa-bar" data-bar hidden>
  <span class="sa-say" data-say></span>
  <span class="d-inline-flex gap-2 align-items-center">
    <button type="button" class="sa-clear" data-clear data-pp5-btn-skip hidden><i class="bi bi-trash"></i> ลบการเช็คชื่อวันนี้</button>
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
    const body = $('[data-body]');
    const bar = $('[data-bar]');
    const say = $('[data-say]');
    const saveBtn = $('[data-save]');
    const clearBtn = $('[data-clear]');
    const historyBox = $('[data-history]');
    const state = { year: '', role: '', scope: null, hours: 1, students: [], marks: new Map(), fromDaily: new Map(), saved: false, dirty: false, canWrite: true, token: 0 };

    const settings = await global.PP5Data.settings.get();
    state.year = text(settings.academicYear || settings.academic_year);
    try { state.role = (await global.PP5Data.auth.requireUser())?.profile?.role || ''; } catch (_) { state.role = ''; }
    try {
      const { data } = await client().rpc('pp5_teacher_scope_context');
      state.scope = data && data.enabled ? data : null;
    } catch (_) { state.scope = null; }
    const scoped = state.role === 'teacher' && state.scope;
    const assignments = scoped ? (state.scope.assignments || []).filter((a) => a.active !== false && text(a.academic_year) === state.year) : [];

    dateInput.value = today();
    const yearCE = Number(state.year) - 543;
    if (yearCE > 1900) { dateInput.min = `${yearCE}-05-01`; dateInput.max = [`${yearCE + 1}-03-31`, today()].sort()[0]; }

    const message = (html, kind) => { body.innerHTML = `<div class="sa-note${kind ? ` is-${kind}` : ''}">${html}</div>`; bar.hidden = true; historyBox.hidden = true; };
    const setSay = (msg, kind) => { say.className = `sa-say${kind ? ` is-${kind}` : ''}`; say.innerHTML = msg; };

    // ---- ตัวเลือกชั้น / ห้อง / วิชา
    const subjects = await query((c) => c.from('subjects').select('*'));
    const grades = [...new Set(subjects.map((s) => text(s.grade)))]
      .filter((g) => !scoped || assignments.some((a) => a.grade === g))
      .sort((a, b) => (GRADE_ORDER.indexOf(a) + 100) % 100 - (GRADE_ORDER.indexOf(b) + 100) % 100 || a.localeCompare(b, 'th'));
    if (!grades.length) { message('ยังไม่มีรายวิชาที่คุณเช็คชื่อได้ — ให้ผู้ดูแลเพิ่ม "ครูประจำวิชา" ให้บัญชีนี้ในหน้าจัดการผู้ใช้', 'warn'); return; }
    gradeSel.innerHTML = grades.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('');

    async function fillRooms() {
      const grade = gradeSel.value;
      let rooms = [];
      try { rooms = [...new Set((await global.PP5Data.students.list({ grade })).map((s) => text(s.room || s.classNo || '1')))]; } catch (_) { rooms = []; }
      if (scoped) rooms = rooms.filter((r) => assignments.some((a) => a.grade === grade && text(a.room) === r));
      rooms.sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
      roomSel.innerHTML = rooms.length ? rooms.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('') : '<option value="">-</option>';
    }
    function fillSubjects() {
      const grade = gradeSel.value;
      const room = roomSel.value;
      let list = subjects.filter((s) => text(s.grade) === grade && !ACTIVITY.some((k) => text(s.name).includes(k)));
      if (scoped) {
        const mine = new Set(assignments.filter((a) => a.scope === 'subject' && a.grade === grade && text(a.room) === room).map((a) => text(a.subject_id)));
        const homeroom = assignments.some((a) => a.scope === 'homeroom' && a.grade === grade && text(a.room) === room);
        // ครูประจำชั้นเช็คได้ทุกวิชาของห้องตัวเอง (โรงเรียนที่สอนแบบผสม) · ครูประจำวิชาเช็คได้เฉพาะวิชาที่ได้รับมอบหมาย
        if (!homeroom) list = list.filter((s) => mine.has(text(s.id)));
        state.writable = homeroom ? null : mine;
      } else state.writable = null;
      list.sort((a, b) => subjectRank(a.name) - subjectRank(b.name) || text(a.name).localeCompare(text(b.name), 'th'));
      subjectSel.innerHTML = list.length
        ? list.map((s) => `<option value="${esc(s.id)}">${esc([s.code, s.name].filter(Boolean).join(' '))}</option>`).join('')
        : '<option value="">ไม่มีวิชาที่เช็คชื่อได้ในห้องนี้</option>';
    }

    // ---- โหลดรายชื่อ + ค่าของวันที่เลือก
    async function load() {
      const token = ++state.token;
      const grade = gradeSel.value;
      const room = roomSel.value;
      const subjectId = subjectSel.value;
      const date = dateInput.value;
      if (!grade || !room || !subjectId) { message('เลือกชั้น ห้อง และรายวิชา', ''); return; }
      if (!date) { message('เลือกวันที่สอน', ''); return; }
      state.canWrite = !state.writable || state.writable.has(subjectId);
      message('กำลังโหลดรายชื่อ…');
      try {
        const students = await global.PP5Data.students.list({ grade, room });
        const ids = students.map((s) => text(s.id));
        if (!ids.length) { message('ไม่พบนักเรียนในห้องนี้', 'warn'); return; }
        const [existing, daily, history] = await Promise.all([
          query((c) => c.from('subject_attendance').select('student_id,hours,status').eq('subject_id', subjectId).eq('attendance_date', date).in('student_id', ids)),
          query((c) => c.from('attendance_daily').select('student_id,status').eq('attendance_date', date).in('student_id', ids)).catch(() => []),
          query((c) => c.from('subject_attendance').select('attendance_date,hours,status,student_id').eq('subject_id', subjectId).eq('academic_year', state.year).in('student_id', ids))
        ]);
        if (token !== state.token) return;
        state.students = students;
        state.marks = new Map();
        state.fromDaily = new Map();
        daily.forEach((row) => { const st = dailyStatus(row.status); if (st && st !== 'present') state.fromDaily.set(text(row.student_id), st); });
        state.saved = existing.length > 0;
        if (state.saved) {
          existing.forEach((row) => state.marks.set(text(row.student_id), row.status));
          setHours(Math.max(...existing.map((row) => Number(row.hours) || 1)));
        } else {
          ids.forEach((id) => state.marks.set(id, state.fromDaily.get(id) || 'present'));
        }
        state.dirty = false;
        renderList(daily.length > 0);
        renderHistory(history, date);
      } catch (error) {
        if (token !== state.token) return;
        if (MISSING_SQL.includes(error?.code) || /subject_attendance/.test(text(error?.message))) {
          message('ฐานข้อมูลยังไม่มีระบบเช็คชื่อรายชั่วโมง — ผู้ดูแลต้องรัน SQL <b>202610140031_subject_attendance.sql</b> ใน Supabase ก่อน', 'err');
        } else message(esc(error?.message || error), 'err');
      }
    }

    function counts() {
      const c = { present: 0, leave: 0, absent: 0 };
      state.marks.forEach((st) => { if (c[st] !== undefined) c[st] += 1; });
      return c;
    }
    function renderList(hasDaily) {
      const c = counts();
      const source = state.saved
        ? '<span class="sa-chip is-ok"><i class="bi bi-check-circle-fill"></i> บันทึกแล้ว — แก้ได้แล้วกดบันทึกอีกครั้ง</span>'
        : `<span class="sa-chip is-warn"><i class="bi bi-pencil"></i> ยังไม่ได้บันทึก</span>${hasDaily ? '<span class="sa-chip">ค่าเริ่มต้นจากเช็คชื่อรายวัน</span>' : '<span class="sa-chip">ยังไม่มีเช็คชื่อรายวันของวันนี้ — เริ่มที่ มา ทุกคน</span>'}`;
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
      clearBtn.hidden = !state.saved;
      setSay(state.saved ? '' : 'ตรวจรายชื่อแล้วกด บันทึกทั้งหมด', '');
    }
    function refreshCounts() {
      const c = counts();
      body.querySelectorAll('[data-c]').forEach((chip) => { chip.textContent = `${chip.dataset.c === 'present' ? 'มา' : chip.dataset.c === 'leave' ? 'ลา' : 'ขาด'} ${c[chip.dataset.c]}`; });
    }
    function renderHistory(rows, current) {
      const days = new Map();
      rows.forEach((row) => {
        const d = text(row.attendance_date).slice(0, 10);
        const day = days.get(d) || { hours: 0, present: 0, leave: 0, absent: 0 };
        day.hours = Math.max(day.hours, Number(row.hours) || 0);
        if (day[row.status] !== undefined) day[row.status] += 1;
        days.set(d, day);
      });
      const list = [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]));
      const taught = list.reduce((sum, [, day]) => sum + day.hours, 0);
      const subject = subjects.find((s) => text(s.id) === subjectSel.value);
      const planned = Number(subject?.hours_per_year) || 0;
      historyBox.hidden = false;
      historyBox.innerHTML = `<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
  <b><i class="bi bi-clock-history"></i> บันทึกของวิชานี้ในห้องนี้</b>
  <span class="sa-chip">สอนและเช็คชื่อแล้ว ${taught}${planned ? ` / ${planned}` : ''} ชั่วโมง · ${list.length} วัน</span>
</div>
${list.length ? `<table><thead><tr><th>วันที่</th><th>ชั่วโมง</th><th>มา</th><th>ลา</th><th>ขาด</th></tr></thead><tbody>
${list.map(([d, day]) => `<tr data-date="${esc(d)}"${d === current ? ' class="is-current"' : ''}><td>${esc(thaiDate(d))}</td><td>${day.hours}</td><td>${day.present}</td><td>${day.leave}</td><td>${day.absent}</td></tr>`).join('')}
</tbody></table><div class="small mt-1" style="color:var(--sa-muted)">กดที่วันที่เพื่อเปิดแก้ไข</div>` : '<div class="sa-note">ยังไม่มีการเช็คชื่อรายชั่วโมงของวิชานี้ — ปก ปพ.5 แบบรายวิชาจะคิดเวลาเรียนจากเช็คชื่อรายวันไปก่อน</div>'}`;
    }

    function setHours(h) {
      state.hours = Math.min(8, Math.max(1, Number(h) || 1));
      root.querySelectorAll('[data-hours]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.hours) === state.hours)));
    }
    const confirmLeave = () => !state.dirty || global.confirm('ยังไม่ได้บันทึกการเช็คชื่อที่แก้ไว้ ต้องการเปลี่ยนโดยไม่บันทึกใช่ไหม?');

    // ---- events
    root.addEventListener('click', async (event) => {
      const hoursBtn = event.target.closest('[data-hours]');
      if (hoursBtn) { setHours(hoursBtn.dataset.hours); state.dirty = true; return; }
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
      const day = event.target.closest('tr[data-date]');
      if (day && confirmLeave()) { dateInput.value = day.dataset.date; load(); }
    });

    async function save(hours) {
      const rows = state.students.map((s) => ({ student_id: text(s.id), status: hours ? state.marks.get(text(s.id)) || 'present' : null }));
      saveBtn.disabled = true;
      clearBtn.disabled = true;
      setSay('<span class="spinner-border spinner-border-sm"></span> กำลังบันทึก…', '');
      try {
        const { data, error } = await client().rpc('pp5_save_subject_attendance', {
          p_subject_id: subjectSel.value, p_date: dateInput.value, p_hours: hours, p_rows: rows
        });
        if (error) throw error;
        state.dirty = false;
        await load();
        setSay(hours ? `<i class="bi bi-check-circle-fill"></i> บันทึกแล้ว ${data?.saved ?? rows.length} คน · ${hours} ชั่วโมง` : '<i class="bi bi-check-circle-fill"></i> ลบการเช็คชื่อวันนี้แล้ว', 'ok');
      } catch (error) {
        setSay(`<i class="bi bi-exclamation-triangle-fill"></i> บันทึกไม่สำเร็จ: ${esc(error?.message || error)}`, 'err');
      } finally {
        saveBtn.disabled = false;
        clearBtn.disabled = false;
      }
    }
    saveBtn.addEventListener('click', () => save(state.hours));
    clearBtn.addEventListener('click', () => {
      if (global.confirm(`ลบการเช็คชื่อวิชานี้ของวันที่ ${thaiDate(dateInput.value)} ทั้งห้องใช่ไหม?`)) save(0);
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
    guard(subjectSel, 'subject', load);
    guard(dateInput, 'date', load);

    await fillRooms();
    fillSubjects();
    remember();
    await load();
  }

  // แถบรูปหัวหน้าเหมือนหน้าอื่น (js/page-banner.js): ลงทะเบียนหน้านี้ตอนโหลด หัวเรื่องเดิม .sa-title ถูกซ่อน
  if (global.PP5PageBanner?.PAGES && !global.PP5PageBanner.PAGES.subject_attendance) {
    global.PP5PageBanner.PAGES.subject_attendance = {
      icon: 'bi-clock-history', title: 'เช็คชื่อรายวิชา (รายชั่วโมง)',
      sub: 'ครูผู้สอนเช็คชื่อตามชั่วโมงที่สอนจริง ใช้คิดเวลาเรียนในปก ปพ.5 แบบรายวิชา', hide: '.sa > .sa-title'
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
  global.PP5SubjectAttendance = { shell, dailyStatus, subjectRank };
})(window);
