// หน้า "สรุปเวลาเรียนรายวิชา" — subject_attendance_summary (owner 2026-10-15: "แล้วเราไม่มีการแสดงสรุปวันมาแบบรายเดือน
// แบบรายภาค และรวมแบบรายปี เหมือนครูประจำชั้นเหรอ")
//   รายเดือน = ตารางรายชื่อ × คาบที่สอนในเดือน (✓ ล ข) · ภาค 1 / ภาค 2 / ทั้งปี = มา ลา ขาด ร้อยละ และสถานะ มส.
//   แบ่งภาคเหมือน ปพ.5 แบบรายวิชา (gas-bridge attendanceFor): ภาค 1 = 1 พ.ค.–31 ต.ค. · ภาค 2 = 1 พ.ย.–31 มี.ค.
//   ร้อยละ (owner 2026-10-16 ตามระเบียบ เหมือน ปพ.5 แบบรายวิชา) = (ชั่วโมงเต็มของวิชา − ชั่วโมงที่ขาด) ÷ ชั่วโมงเต็ม · ลาไม่นับเป็นขาด
//   ต่ำกว่า 80 = มส. · 80 ถึงต่ำกว่า 85 = ใกล้ มส. · รายเดือน (ไม่มีชั่วโมงเต็มของเดือน) เทียบกับชั่วโมงที่บันทึก
//   1 คาบ = 1 ชั่วโมง (SQL 032) · แถวก่อน 032 = คาบ 1 ที่มีหลายชั่วโมง นับตาม hours
// อ่านอย่างเดียว (RLS ของ subject_attendance คุมว่าใครเห็นห้อง/วิชาไหน)
(function initSubjectAttendanceSummary(global) {
  'use strict';
  const doc = global.document;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
  const client = () => global.PP5Data?.client;
  const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const THAI_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const MARK = { present: '✓', leave: 'ล', absent: 'ข' };
  // ฟอนต์ Sarabun ใน PDF ไม่มีตัว ✓ — เอกสารใช้ "/" แทนมา (แบบสมุดเช็คชื่อ) บนจอยังเป็น ✓
  const PDF_MARK = { present: '/', leave: 'ล', absent: 'ข' };
  const GRADE_ORDER = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3'];

  // ช่วงวันของภาค (เหมือน ปพ.5 แบบรายวิชา) และทั้งปีการศึกษา
  function rangeOf(year, view) {
    const ce = Number(year) - 543;
    if (view === 'sem1') return { from: `${ce}-05-01`, to: `${ce}-10-31` };
    if (view === 'sem2') return { from: `${ce}-11-01`, to: `${ce + 1}-03-31` };
    return { from: `${ce}-05-01`, to: `${ce + 1}-03-31` };
  }
  const slotOf = (row) => `${text(row.attendance_date).slice(0, 10)}#${Number(row.period) || 1}`;
  const hoursOf = (row) => Number(row.hours) || 1;
  function statusOf(pct) {
    if (pct === null || pct === undefined) return { key: 'none', label: 'ยังไม่มีข้อมูล' };
    if (pct < 80) return { key: 'fail', label: 'มส.' };
    if (pct < 85) return { key: 'near', label: 'ใกล้ มส.' };
    return { key: 'ok', label: 'ผ่าน' };
  }
  // สรุปช่วงวัน: คาบที่สอน (ของห้อง) + ต่อคน มา/ลา/ขาด/รวม/ร้อยละ
  // ชั่วโมงเต็มของช่วงที่ดู: ทั้งปี = ชั่วโมงของวิชา · ภาคเดียวของวิชาทั้งปี = ครึ่งหนึ่ง · วิชารายภาค = ชั่วโมงของวิชา
  function fullOf(subject, view) {
    const hours = Number(subject?.hours_per_year ?? subject?.hoursPerYear) || 0;
    return !hours ? 0 : view !== 'year' && !(Number(subject?.semester) || 0) ? hours / 2 : hours;
  }
  function rulePct(absent, recorded, full) {
    if (!recorded) return null;
    const base = full > 0 ? full : recorded;
    return Math.round(Math.max(0, (base - Math.min(absent, base)) / base) * 1000) / 10;
  }
  function summarize(rows, studentIds, range, fullHours = 0) {
    const ids = new Set(studentIds.map(text));
    const slots = new Map();
    const per = new Map(studentIds.map((id) => [text(id), { present: 0, leave: 0, absent: 0, total: 0, pct: null }]));
    rows.forEach((row) => {
      const d = text(row.attendance_date).slice(0, 10);
      if (d < range.from || d > range.to || !ids.has(text(row.student_id))) return;
      const h = hoursOf(row);
      slots.set(slotOf(row), Math.max(slots.get(slotOf(row)) || 0, h));
      const sum = per.get(text(row.student_id));
      if (sum[row.status] === undefined) return;
      sum[row.status] += h;
      sum.total += h;
    });
    per.forEach((sum) => { sum.pct = rulePct(sum.absent, sum.total, fullHours); });
    return { taught: [...slots.values()].reduce((a, b) => a + b, 0), days: new Set([...slots.keys()].map((k) => k.slice(0, 10))).size, per };
  }
  // ตารางรายเดือน: คอลัมน์ = คาบที่สอนในเดือน (วันที่#คาบ) เรียงตามวันแล้วคาบ
  function monthGrid(rows, studentIds, monthKey) {
    const ids = new Set(studentIds.map(text));
    const list = rows.filter((r) => text(r.attendance_date).slice(0, 7) === monthKey && ids.has(text(r.student_id)));
    const slots = [...new Set(list.map(slotOf))].sort((a, b) => a.slice(0, 10).localeCompare(b.slice(0, 10)) || Number(a.split('#')[1]) - Number(b.split('#')[1]));
    const cell = new Map(list.map((r) => [`${text(r.student_id)}|${slotOf(r)}`, r]));
    return {
      slots: slots.map((s) => {
        const [date, p] = s.split('#');
        const [y, m, d] = date.split('-').map(Number);
        return { key: s, date, period: Number(p), label: Number(p) > 1 ? `${d}-${p}` : String(d), dow: THAI_DOW[new Date(y, m - 1, d).getDay()] };
      }),
      cell: (id, slot) => cell.get(`${text(id)}|${slot}`) || null
    };
  }
  // PDF แบบเดียวกับเอกสารเวลาเรียนรายชั้น (owner 2026-10-15 "ควรดูตัวอย่างแบบรายชั้น น่าจะเข้าใจ"):
  //   รายเดือน = PP5PDF.createChecklist (บันทึกเวลาเรียน แนวตั้ง หัววันที่ + วัน ✓ ล ข) — คอลัมน์ = คาบที่สอน
  //   รายภาค   = แบบ "รายงานสรุปการมาเรียนรายภาคเรียน" (ลำดับ รหัส ชื่อ มา ลา ขาด รวม ร้อยละมาเรียน) + สถานะ มส.
  //   ทั้งปี    = แบบ "สรุปวันมาเรียนแต่ละเดือน" (คอลัมน์ต่อเดือน รวมมา รวม ร้อยละ) + สถานะ มส.
  const MONTH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const SEM_LABEL = { sem1: 'ภาคเรียนที่ 1 (พฤษภาคม - ตุลาคม)', sem2: 'ภาคเรียนที่ 2 (พฤศจิกายน - มีนาคม)' };
  function pdfTable(view, rows, students, year, monthKey, job = {}) {
    const ids = students.map((s) => text(s.id));
    const name = (s) => text(s.fullName || [s.prefix || s.title, s.first_name || s.firstname, s.last_name || s.lastname].filter(Boolean).join(' ') || s.id);
    const pct = (v) => (v === null ? '-' : `${Number(v).toFixed(1)}%`);
    const subjectLabel = [job.subject?.code, job.subject?.name].filter(Boolean).join(' ');
    const room = job.grade ? `${job.grade}/${job.room}` : '';
    if (view === 'month') {
      const grid = monthGrid(rows, ids, monthKey);
      const [y, m] = monthKey.split('-').map(Number);
      return {
        kind: 'checklist',
        data: {
          grade: job.grade || '', classNo: job.room || '', monthName: MONTH_FULL[m - 1], yearBE: String(y + 543),
          semester: m >= 5 && m <= 10 ? 'ภาคเรียนที่ 1' : 'ภาคเรียนที่ 2', academicYear: String(year),
          title: `บันทึกเวลาเรียนรายวิชา ชั้น ${room} เดือน ${MONTH_FULL[m - 1]} ${y + 543}`,
          subjectLine: `วิชา ${subjectLabel}`,
          countLine: `แสดงเฉพาะคาบที่สอน: ${grid.slots.length} คาบ (หัวคอลัมน์ "12-2" = วันที่ 12 คาบที่ 2)`,
          unitLabel: 'คาบที่สอน', unit: 'คาบ',
          actualSchoolDays: grid.slots.length, totalDaysInMonth: new Date(y, m, 0).getDate(),
          days: grid.slots.map((sl) => ({ label: sl.label, dow: sl.dow })),
          students: students.map((s) => ({
            id: text(s.id), name: name(s),
            statusMap: Object.fromEntries(grid.slots.map((sl) => { const r = grid.cell(s.id, sl.key); return [sl.label, r ? PDF_MARK[r.status] || '' : '']; }))
          }))
        }
      };
    }
    // รายภาค / ทั้งปี แยกทีละเดือน (owner 2026-10-15: "แยกเป็นเดือนสิครับ เช่น พ.ค. เท่าไหร่ มิ.ย. เท่าไหร่ ไม่ใช่เหมารวม")
    //   ตัวเลขรายเดือน = ชั่วโมงที่มาเรียน · A4 แนวตั้งทุกแบบ
    const full = fullOf(job.subject, view);
    const split = monthBreakdown(rows, ids, year, view, full);
    const sum = split.total;
    const whole = view === 'year';
    const head = [whole ? 'ที่' : 'ลำดับ', 'รหัส', 'ชื่อ-นามสกุล', ...split.months.map((m) => `${m.label}\n${m.yy}`),
      'มา', 'ลา', 'ขาด', 'รวม (ชม.)', 'ร้อยละ', 'สถานะ'];
    return {
      // owner 2026-10-15 "ปรับให้มีขนาด a4 แนวตั้ง": ทั้งปีก็แนวตั้ง (pdf-export ย่อคอลัมน์ให้พอดีหน้า)
      kind: 'table', landscape: false,
      title: whole ? 'สรุปเวลาเรียนรายวิชาแต่ละเดือน' : 'รายงานสรุปเวลาเรียนรายวิชา รายภาคเรียน',
      subtitle: whole ? `ปีการศึกษา ${year}` : `${SEM_LABEL[view]} ปีการศึกษา ${year}`,
      nameColumn: 2, statusColumn: head.length - 1, head: [head],
      body: students.map((s, i) => {
        const per = sum.per.get(text(s.id));
        const st = statusOf(per.pct);
        return [i + 1, text(s.id), name(s), ...split.months.map((m) => { const x = m.sum.per.get(text(s.id)); return x.total ? x.present : '-'; }),
          per.present, per.leave, per.absent, per.total, pct(per.pct), st.key === 'none' ? '-' : st.label];
      }),
      note: `ตัวเลขรายเดือน = ชั่วโมงที่มาเรียน (- = ยังไม่มีการเช็คชื่อ) · สอนทั้งหมด ${sum.taught} คาบ · ${ruleNote(full)}`
    };
  }

  const ruleNote = (full) => (full
    ? `ร้อยละเวลาเรียน = (${full} ชม. − ชั่วโมงที่ขาด) ÷ ${full} ชม. · ลาไม่นับเป็นขาด · ต่ำกว่า 80 = มส. (ไม่มีสิทธิ์สอบ) · 80 ถึงต่ำกว่า 85 = ใกล้ มส.`
    : 'ร้อยละ = (ชั่วโมงที่บันทึก − ชั่วโมงที่ขาด) ÷ ชั่วโมงที่บันทึก (วิชานี้ยังไม่ได้ตั้งชั่วโมงเรียน) · ลาไม่นับเป็นขาด · ต่ำกว่า 80 = มส. · 80 ถึงต่ำกว่า 85 = ใกล้ มส.');
  // เดือนของภาค / ปี (เหมือน ปพ.5: ภาค 1 = พ.ค.–ต.ค. · ภาค 2 = พ.ย.–มี.ค.) แสดงครบทุกเดือนแม้ยังไม่มีข้อมูล
  function monthKeysOf(year, view) {
    const ce = Number(year) - 543;
    const first = [5, 6, 7, 8, 9, 10].map((m) => `${ce}-${String(m).padStart(2, '0')}`);
    const second = [`${ce}-11`, `${ce}-12`, `${ce + 1}-01`, `${ce + 1}-02`, `${ce + 1}-03`];
    return view === 'sem1' ? first : view === 'sem2' ? second : [...first, ...second];
  }
  function monthBreakdown(rows, ids, year, view, fullHours = 0) {
    const months = monthKeysOf(year, view).map((key) => {
      const [y, m] = key.split('-').map(Number);
      return { key, label: THAI_MONTHS[m - 1], yy: String(y + 543).slice(2),
        sum: summarize(rows, ids, { from: `${key}-01`, to: `${key}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` }) };
    });
    return { months, total: summarize(rows, ids, rangeOf(year, view), fullHours) };
  }

  function monthsOf(rows) {
    return [...new Set(rows.map((r) => text(r.attendance_date).slice(0, 7)).filter(Boolean))].sort();
  }

  const STYLE = `
.sas{--s-line:#e3e6ee;--s-muted:#5b6275;--s-soft:#f6f7fb;--s-card:#fff;--s-text:#1f2937;--s-accent:var(--primary,#4f46e5);
  --s-ok:#13795b;--s-ok-bg:#e6f6ef;--s-warn:#a15c00;--s-warn-bg:#fff4e0;--s-bad:#c2362b;--s-bad-bg:#fdecea;
  max-width:1200px;margin:0 auto;padding:0 0 40px;color:var(--s-text)}
[data-theme="dark"] .sas{--s-line:#2b3446;--s-muted:#a7afbd;--s-soft:#161d2b;--s-card:#1b2232;--s-text:#e5e7eb;
  --s-ok:#6fe0b4;--s-ok-bg:rgba(111,224,180,.12);--s-warn:#ffc46b;--s-warn-bg:rgba(255,196,107,.12);--s-bad:#ff8a80;--s-bad-bg:rgba(255,138,128,.12)}
.sas-title{display:none}
.sas-card{background:var(--s-card);border:1px solid var(--s-line);border-radius:16px;padding:14px 16px;margin-bottom:12px}
.sas-top{display:flex;flex-wrap:wrap;gap:10px;align-items:end}
.sas-top label{display:grid;gap:4px;font-weight:600;font-size:.85rem;min-width:240px;flex:1}
.sas-tabs{display:inline-flex;flex-wrap:wrap;border:1.5px solid var(--s-line);border-radius:12px;overflow:hidden}
.sas-tabs button{border:0;background:var(--s-card);color:var(--s-muted);font-weight:700;padding:.5rem 1rem}
.sas-tabs button[aria-pressed="true"]{background:var(--s-accent);color:#fff}
.sas-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}
.sas-chip{display:inline-flex;align-items:center;gap:6px;font-size:.82rem;font-weight:700;padding:.3rem .8rem;border-radius:999px;background:var(--s-soft);color:var(--s-muted)}
.sas-chip.is-ok{background:var(--s-ok-bg);color:var(--s-ok)}.sas-chip.is-warn{background:var(--s-warn-bg);color:var(--s-warn)}.sas-chip.is-bad{background:var(--s-bad-bg);color:var(--s-bad)}
.sas-wrap{overflow-x:auto;border:1px solid var(--s-line);border-radius:12px}
.sas-table{width:100%;border-collapse:collapse;font-size:.85rem;white-space:nowrap}
.sas-table th,.sas-table td{padding:6px 8px;border-bottom:1px solid var(--s-line);text-align:center}
.sas-table thead th{background:var(--s-soft);font-size:.78rem;color:var(--s-muted);position:sticky;top:0}
.sas-table th.sas-name,.sas-table td.sas-name{text-align:left;position:sticky;left:0;background:var(--s-card);z-index:1}
.sas-table thead th.sas-name{background:var(--s-soft);z-index:2}
.sas-table td.m-present{color:var(--s-ok);font-weight:700}.sas-table td.m-leave{color:var(--s-warn);font-weight:700;background:var(--s-warn-bg)}
.sas-table td.m-absent{color:var(--s-bad);font-weight:700;background:var(--s-bad-bg)}
.sas-table tr.is-fail td{background:color-mix(in srgb,var(--s-bad) 6%,transparent)}
.sas-pct{font-weight:800}
.sas-badge{display:inline-block;font-size:.75rem;font-weight:700;padding:.1rem .6rem;border-radius:999px}
.sas-badge.ok{background:var(--s-ok-bg);color:var(--s-ok)}.sas-badge.near{background:var(--s-warn-bg);color:var(--s-warn)}
.sas-badge.fail{background:var(--s-bad-bg);color:var(--s-bad)}.sas-badge.none{background:var(--s-soft);color:var(--s-muted)}
.sas-note{padding:10px 12px;border-radius:10px;font-size:.9rem;background:var(--s-soft);color:var(--s-muted)}
.sas-note.is-err{background:var(--s-bad-bg);color:var(--s-bad)}
.sas-dow{display:block;font-size:.68rem;font-weight:500}
.sas-table th.sas-month,.sas-table td.sas-month{background:color-mix(in srgb,var(--s-accent) 5%,transparent);min-width:44px}
.sas-pdf{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:12px;padding:.55rem 1.1rem;font-weight:700;color:#fff;
  background:linear-gradient(135deg,#f87171,#dc2626);box-shadow:0 6px 14px rgba(220,38,38,.28)}
.sas-pdf:disabled{opacity:.55;box-shadow:none}
.sas-pdf-say{font-size:.85rem;margin-top:6px;min-height:1em}.sas-pdf-say.is-err{color:var(--s-bad)}`;

  function shell() {
    return `<div class="sas" id="pp5SubjectAttendanceSummary"><style>${STYLE}</style>
<h4 class="sas-title">สรุปเวลาเรียนรายวิชา</h4>
<div class="sas-card"><div class="sas-top">
  <label>วิชา · ห้อง<select class="form-select" data-job></select></label>
  <div class="sas-tabs" role="group" aria-label="ช่วงที่สรุป" data-tabs>
    <button type="button" data-pp5-btn-skip data-view="month" aria-pressed="true">รายเดือน</button>
    <button type="button" data-pp5-btn-skip data-view="sem1" aria-pressed="false">ภาคเรียนที่ 1</button>
    <button type="button" data-pp5-btn-skip data-view="sem2" aria-pressed="false">ภาคเรียนที่ 2</button>
    <button type="button" data-pp5-btn-skip data-view="year" aria-pressed="false">ทั้งปี</button>
  </div>
  <label data-month-wrap style="min-width:160px;flex:0">เดือน<select class="form-select" data-month></select></label>
  <button type="button" class="sas-pdf" data-pdf data-pp5-btn-skip disabled><i class="bi bi-file-earmark-pdf-fill"></i> ส่งออก PDF</button>
</div><div class="sas-pdf-say" data-pdf-say></div></div>
<div class="sas-card" data-body><div class="sas-note">กำลังโหลด…</div></div>
</div>`;
  }

  async function mount(root) {
    const $ = (sel) => root.querySelector(sel);
    const jobSel = $('[data-job]');
    const monthSel = $('[data-month]');
    const monthWrap = $('[data-month-wrap]');
    const body = $('[data-body]');
    const pdfBtn = $('[data-pdf]');
    const pdfSay = $('[data-pdf-say]');
    const state = { year: '', view: 'month', rows: [], students: [], token: 0 };
    const settings = await global.PP5Data.settings.get();
    state.year = text(settings.academicYear || settings.academic_year);
    let role = '';
    try { role = (await global.PP5Data.auth.requireUser())?.profile?.role || ''; } catch (_) { role = ''; }
    let scope = null;
    try { const { data } = await client().rpc('pp5_teacher_scope_context'); scope = data && data.enabled ? data : null; } catch (_) { scope = null; }
    const scoped = role === 'teacher' && !!scope;
    const { data: subjects, error } = await client().from('subjects').select('*');
    if (error) throw error;
    // งาน = (วิชา, ห้อง) เหมือนหน้าตารางสอนของฉัน · ผู้ดูแล/ยังไม่เปิดสิทธิ์ครู = ทุกวิชาของทุกห้อง
    let assignments;
    if (scoped) {
      assignments = (scope.assignments || []).filter((a) => a.active !== false && text(a.academic_year) === state.year && global.PP5WorkMode?.keeps?.(a, scope, 0) !== false);
    } else {
      const all = await global.PP5Data.students.list({}).catch(() => []);
      const rooms = new Map();
      all.forEach((s) => { const g = text(s.grade); if (/^(ป|ม)\./.test(g)) rooms.set(`${g}/${text(s.room || s.classNo || '1')}`, { scope: 'homeroom', grade: g, room: text(s.room || s.classNo || '1') }); });
      assignments = [...rooms.values()];
    }
    const jobs = [1, 2].flatMap((sem) => global.PP5SubjectSchedule.jobsFor(assignments, subjects || [], sem))
      .filter((job, i, list) => list.findIndex((x) => x.key === job.key) === i)
      .sort((a, b) => (GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade)) || a.room.localeCompare(b.room, 'th', { numeric: true }));
    if (!jobs.length) { body.innerHTML = '<div class="sas-note">ยังไม่มีวิชาที่ได้รับมอบหมายในปีนี้</div>'; return; }
    const rooms = [...new Set(jobs.map((j) => `${j.grade}/${j.room}`))];
    jobSel.innerHTML = rooms.map((room) => `<optgroup label="ห้อง ${esc(room)}">${jobs.filter((j) => `${j.grade}/${j.room}` === room)
      .map((j) => `<option value="${esc(j.key)}">${esc([j.subject.code, j.subject.name].filter(Boolean).join(' '))} · ${esc(room)}</option>`).join('')}</optgroup>`).join('');
    let target = null;
    try { target = JSON.parse(global.sessionStorage.getItem('pp5SubjectSummaryTarget') || 'null'); global.sessionStorage.removeItem('pp5SubjectSummaryTarget'); } catch (_) { target = null; }
    const wanted = target && jobs.find((j) => text(j.subject.id) === text(target.subjectId) && j.grade === target.grade && j.room === text(target.room));
    if (wanted) jobSel.value = wanted.key;

    async function load() {
      const token = ++state.token;
      const job = jobs.find((j) => j.key === jobSel.value);
      body.innerHTML = '<div class="sas-note">กำลังโหลด…</div>';
      try {
        const students = await global.PP5Data.students.list({ grade: job.grade, room: job.room });
        const ids = students.map((s) => text(s.id));
        const rows = [];
        for (let start = 0; ids.length; start += 1000) {
          const { data, error: readError } = await client().from('subject_attendance').select('student_id,attendance_date,period,hours,status')
            .eq('subject_id', job.subject.id).eq('academic_year', state.year).in('student_id', ids).order('id').range(start, start + 999);
          if (readError) throw readError;
          rows.push(...(data || []));
          if ((data || []).length < 1000) break;
        }
        if (token !== state.token) return;
        state.rows = rows;
        state.students = students;
        const months = monthsOf(rows);
        monthSel.innerHTML = months.length ? months.map((k) => `<option value="${k}">${THAI_MONTHS[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(0, 4)) + 543}</option>`).join('') : '<option value="">—</option>';
        if (months.length) monthSel.value = months[months.length - 1];
        pdfBtn.disabled = !rows.length;
        render();
      } catch (loadError) {
        if (token !== state.token) return;
        body.innerHTML = `<div class="sas-note is-err">${esc(loadError?.message || loadError)}</div>`;
      }
    }

    const nameOf = (s) => esc(s.fullName || [s.prefix || s.title, s.first_name || s.firstname, s.last_name || s.lastname].filter(Boolean).join(' ') || s.id);
    const noOf = (s, i) => esc(text(s.studentNumber ?? s.student_number) || i + 1);
    function render() {
      monthWrap.hidden = state.view !== 'month';
      if (!state.rows.length) {
        body.innerHTML = '<div class="sas-note">ยังไม่มีการเช็คชื่อรายวิชานี้ในปีการศึกษานี้ — เช็คได้ที่หน้า "เช็คชื่อรายวิชา (รายคาบ)"</div>';
        return;
      }
      const ids = state.students.map((s) => text(s.id));
      if (state.view === 'month') {
        const key = monthSel.value;
        const grid = monthGrid(state.rows, ids, key);
        const [y, m] = key.split('-').map(Number);
        const sum = summarize(state.rows, ids, { from: `${key}-01`, to: `${key}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` });
        body.innerHTML = `<div class="sas-chips"><span class="sas-chip"><i class="bi bi-calendar3"></i> ${THAI_MONTHS[m - 1]} ${y + 543}</span>
  <span class="sas-chip">สอน ${sum.taught} คาบ · ${sum.days} วัน</span></div>
<div class="sas-wrap"><table class="sas-table"><thead><tr><th>เลขที่</th><th class="sas-name">ชื่อ–สกุล</th>${grid.slots.map((s) => `<th>${esc(s.label)}<span class="sas-dow">${esc(s.dow)}</span></th>`).join('')}<th>มา</th><th>ลา</th><th>ขาด</th><th>ร้อยละ</th></tr></thead><tbody>
${state.students.map((s, i) => {
    const per = sum.per.get(text(s.id));
    return `<tr><td>${noOf(s, i)}</td><td class="sas-name">${nameOf(s)}</td>${grid.slots.map((slot) => {
      const r = grid.cell(s.id, slot.key);
      return `<td class="${r ? 'm-' + esc(r.status) : ''}">${r ? MARK[r.status] || '' : ''}</td>`;
    }).join('')}<td>${per.present}</td><td>${per.leave}</td><td>${per.absent}</td><td class="sas-pct">${per.pct === null ? '–' : per.pct}</td></tr>`;
  }).join('')}</tbody></table></div>
<div class="small mt-2" style="color:var(--s-muted)">✓ มา · ล ลา · ข ขาด · หัวคอลัมน์ "15-2" = วันที่ 15 คาบที่ 2</div>`;
        return;
      }
      const full = fullOf(jobs.find((j) => j.key === jobSel.value)?.subject, state.view);
      const split = monthBreakdown(state.rows, ids, state.year, state.view, full);
      const sum = split.total;
      const statuses = state.students.map((s) => statusOf(sum.per.get(text(s.id)).pct).key);
      const fail = statuses.filter((k) => k === 'fail').length;
      const near = statuses.filter((k) => k === 'near').length;
      const title = state.view === 'sem1' ? 'ภาคเรียนที่ 1' : state.view === 'sem2' ? 'ภาคเรียนที่ 2' : `ทั้งปีการศึกษา ${state.year}`;
      // owner 2026-10-15: "แยกเป็นเดือนสิครับ เช่น พ.ค. เท่าไหร่ มิ.ย. เท่าไหร่" — คอลัมน์ต่อเดือน = ชั่วโมงที่มา
      body.innerHTML = `<div class="sas-chips"><span class="sas-chip"><i class="bi bi-calendar-range"></i> ${title}</span>
  <span class="sas-chip">สอน ${sum.taught} คาบ · ${sum.days} วัน</span>
  <span class="sas-chip ${fail ? 'is-bad' : 'is-ok'}">มส. ${fail} คน</span>${near ? `<span class="sas-chip is-warn">ใกล้ มส. ${near} คน</span>` : ''}</div>
<div class="sas-wrap"><table class="sas-table"><thead><tr><th>เลขที่</th><th class="sas-name">ชื่อ–สกุล</th>
${split.months.map((m) => `<th class="sas-month">${esc(m.label)}<span class="sas-dow">${esc(m.yy)}</span></th>`).join('')}<th>มา</th><th>ลา</th><th>ขาด</th><th>รวม (ชม.)</th><th>ร้อยละ</th><th>สถานะ</th></tr></thead><tbody>
${state.students.map((s, i) => {
    const per = sum.per.get(text(s.id));
    const st = statusOf(per.pct);
    return `<tr class="${st.key === 'fail' ? 'is-fail' : ''}"><td>${noOf(s, i)}</td><td class="sas-name">${nameOf(s)}</td>
${split.months.map((m) => { const x = m.sum.per.get(text(s.id)); return `<td class="sas-month">${x.total ? x.present : '–'}</td>`; }).join('')}<td><b>${per.present}</b></td><td>${per.leave}</td><td>${per.absent}</td><td>${per.total}</td>
<td class="sas-pct">${per.pct === null ? '–' : per.pct}</td><td><span class="sas-badge ${st.key}">${st.label}</span></td></tr>`;
  }).join('')}</tbody></table></div>
<div class="small mt-2" style="color:var(--s-muted)">ตัวเลขรายเดือน = ชั่วโมงที่มาเรียน (– = เดือนนั้นยังไม่มีการเช็คชื่อ) · ${ruleNote(full)} · แบ่งภาคเหมือน ปพ.5 (ภาค 1 = พ.ค.–ต.ค. · ภาค 2 = พ.ย.–มี.ค.)</div>`;
    }

    root.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-view]');
      if (!tab) return;
      state.view = tab.dataset.view;
      root.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === tab)));
      render();
    });
    // ---- ส่งออก PDF ของแท็บที่เปิดอยู่ (เปิดแท็บใหม่ก่อนสร้าง จะไม่โดนบล็อกป๊อปอัป; ถูกบล็อก = ดาวน์โหลดแทน)
    pdfBtn.addEventListener('click', async () => {
      const job = jobs.find((j) => j.key === jobSel.value);
      if (!job || !state.rows.length) return;
      if (!global.PP5PDF?.createSubjectAttendanceReport || !global.PP5PDF?.createChecklist) {
        pdfSay.className = 'sas-pdf-say is-err';
        pdfSay.textContent = 'ระบบสร้าง PDF ยังโหลดไม่เสร็จ ลองใหม่อีกครั้ง';
        return;
      }
      const win = global.open('', '_blank');
      pdfBtn.disabled = true;
      pdfSay.className = 'sas-pdf-say';
      pdfSay.textContent = 'กำลังสร้าง PDF…';
      try {
        const table = pdfTable(state.view, state.rows, state.students, state.year, monthSel.value, job);
        const json = settings.settings_json || {};
        const teacher = text(json.subject_room_teachers?.[state.year]?.[`${job.grade}|${job.room}|${job.subject.id}`])
          || text(job.subject.teacher_name) || (role === 'teacher' ? text(global.localStorage?.getItem('displayName')) : '');
        const subjectLabel = [job.subject.code, job.subject.name].filter(Boolean).join(' ');
        const options = {
          schoolName: text(settings.schoolName || settings.school_name), affiliation: text(settings.affiliation),
          schoolAddress: text(settings.schoolAddress || settings.school_address), schoolPhone: text(settings.schoolPhone || settings.school_phone),
          footerNote: text(settings.footerNote || settings.footer_note), logo: settings.logo_base64 || '',
          grade: job.grade, classNo: job.room, academicYear: state.year,
          meta: `วิชา ${subjectLabel} ชั้น ${job.grade} ห้อง ${job.room}`
        };
        const url = table.kind === 'checklist' ? await global.PP5PDF.createChecklist(table.data, options) : await global.PP5PDF.createSubjectAttendanceReport({
          ...table,
          signers: [
            { role: 'ครูผู้สอน', name: teacher },
            { role: 'หัวหน้างานวิชาการ', name: text(settings.academicHead || settings.academic_head) },
            { role: text(settings.director_position || 'ผู้อำนวยการโรงเรียน'), name: text(settings.directorName || settings.director_name) }
          ]
        }, options);
        if (win && !win.closed) win.location.href = url;
        else {
          const a = doc.createElement('a');
          a.href = url;
          a.download = `สรุปเวลาเรียน_${subjectLabel}_${job.grade}-${job.room}.pdf`.replace(/\s+/g, '_');
          doc.body.appendChild(a);
          a.click();
          a.remove();
        }
        pdfSay.textContent = 'สร้าง PDF แล้ว — เปิดในแท็บใหม่';
      } catch (pdfError) {
        if (win && !win.closed) win.close();
        pdfSay.className = 'sas-pdf-say is-err';
        pdfSay.textContent = `สร้าง PDF ไม่สำเร็จ: ${pdfError?.message || pdfError}`;
      } finally {
        pdfBtn.disabled = !state.rows.length;
      }
    });
    jobSel.addEventListener('change', load);
    monthSel.addEventListener('change', render);
    await load();
  }

  if (global.PP5PageBanner?.PAGES && !global.PP5PageBanner.PAGES.subject_attendance_summary) {
    global.PP5PageBanner.PAGES.subject_attendance_summary = {
      icon: 'bi-bar-chart-line', title: 'สรุปเวลาเรียนรายวิชา',
      sub: 'รายเดือน รายภาค และทั้งปี ของวิชาที่สอน — ร้อยละเวลาเรียนและนักเรียนที่เสี่ยง มส.', hide: '.sas > .sas-title'
    };
  }
  function apply() {
    const root = doc.getElementById('pp5SubjectAttendanceSummary');
    if (root && !root.__pp5Mounted) {
      root.__pp5Mounted = true;
      mount(root).catch((error) => {
        const box = root.querySelector('[data-body]');
        if (box) box.innerHTML = `<div class="sas-note is-err">${esc(error?.message || error)}</div>`;
      });
    }
  }
  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5SubjectSummary) return;
    frame.__pp5SubjectSummary = true;
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(apply).observe(frame, { childList: true, subtree: true });
    apply();
  }
  global.GAS_PAGES = global.GAS_PAGES || {};
  global.GAS_PAGES.subject_attendance_summary = shell();
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
  global.PP5SubjectSummary = { shell, rangeOf, statusOf, summarize, monthGrid, monthsOf, pdfTable, monthKeysOf, monthBreakdown };
})(window);
