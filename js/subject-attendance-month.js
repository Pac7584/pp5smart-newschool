// เช็คชื่อรายวิชาแบบตารางรายเดือน (owner 2026-10-22: "ออกแบบตารางเช็คชื่อเป็นแบบรายเดือน น่าจะโอเคกว่า เพิ่มขึ้นมาอีกหนึ่งทางเลือก
// เพราะแบบเดิมมันดูยาก และจัดการวันหยุดก็สับสน ... ควรนับเวลาเรียนที่ตารางได้เลย") — เจ้าของเลือก:
//   คอลัมน์ละคาบ · วันสอนชดเชยกดที่หัววันในตารางได้เลย (เฉพาะวิชานั้น) · ช่องที่ยังไม่ได้เช็คแต่มีรายวัน = แสดงตามรายวันแบบสีจาง
//   · ปุ่มสลับ [รายคาบ | รายเดือน] ในหน้าเดิม (js/subject-attendance.js เรียก mount ของไฟล์นี้)
// กติกาเดียวกับ ปพ.5 รายวิชา / ค้างเช็ค: คาบที่บันทึกแล้ว = ตามที่บันทึก · คาบตามตารางสอนที่ยังไม่บันทึกแต่ห้องมีเช็คชื่อรายวัน =
//   ใช้สถานะรายวัน (นับแล้ว แสดงสีจาง) · วันหยุดในปฏิทิน (ยกเว้นประเภท "สอนชดเชย") ไม่มีคาบ
// วันสอนชดเชยของวิชานี้ = คาบที่บันทึกในวันนั้น — ไม่ต้องตั้งค่ากลาง
// เขียนผ่าน pp5_save_subject_period (คอลัมน์ละครั้ง ทั้งห้อง) เหมือนหน้ารายคาบ
(function initSubjectAttendanceMonth(global) {
  'use strict';
  const doc = global.document;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
  const client = () => global.PP5Data?.client;
  const DAY_SHORT = ['', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
  const DAY_NAME = ['', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
  const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const MARK = { present: '/', leave: 'ล', absent: 'ข' };
  // กดช่อง: มา → ลา → ขาด → ว่าง → มา (owner 2026-10-22 "ในช่องรายคนยังคลิกให้ว่างไม่ได้" — เหมือนปุ่มวนของหน้ารายเดือน)
  const CLEAR = 'clear';
  const NEXT = { '': 'present', present: 'leave', leave: 'absent', absent: CLEAR };
  const MAX_PERIODS = 8;

  function weekdayOf(iso) {
    const [y, m, d] = text(iso).split('-').map(Number);
    const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return js === 0 ? 7 : js;
  }
  const semesterOf = (iso) => { const m = Number(text(iso).slice(5, 7)); return m >= 5 && m <= 10 ? 1 : 2; };
  function daysOfMonth(month) {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out = [];
    for (let d = 1; d <= last; d += 1) out.push(`${month}-${String(d).padStart(2, '0')}`);
    return out;
  }
  function shiftMonth(month, by) {
    const [y, m] = month.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1 + by, 1));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  function dailyStatus(value) {
    const v = text(value).toLowerCase();
    if (['leave', 'ล', 'ลา'].includes(v)) return 'leave';
    if (['absent', 'ข', 'ขาด', '0'].includes(v)) return 'absent';
    return v ? 'present' : '';
  }

  // คอลัมน์ของเดือน: วันสอนตามตาราง (คอลัมน์ละคาบ) · วันหยุดที่ตรงวันสอน (ช่องแคบ ไม่มีคาบ) · วันสอนชดเชย/คาบที่บันทึกนอกตาราง
  //   weeks: Map(ภาค -> Map(วัน 1-7 -> คาบ)) · holidays: Map(วันที่ -> { type, title }) · recorded: Map(วันที่ -> Set(คาบ))
  //   extra: Map(วันที่ -> คาบที่ครูเพิ่งเพิ่ม (ยังไม่บันทึก)) · range: { min, max } ปีการศึกษา
  function buildColumns(month, weeks, holidays, recorded, extra, range) {
    const out = [];
    daysOfMonth(month).forEach((date) => {
      if (range && (date < range.min || date > range.max)) return;
      const hol = holidays.get(date);
      const closed = hol && hol.type !== 'school';
      const weekday = weekdayOf(date);
      const planned = Number(weeks.get(semesterOf(date))?.get(weekday)) || 0;
      const got = recorded.get(date) || new Set();
      const count = Math.min(MAX_PERIODS, Math.max(closed ? 0 : planned, ...[...got], extra.get(date) || 0, 0));
      if (count) {
        for (let p = 1; p <= count; p += 1) out.push({ kind: 'period', date, weekday, period: p, planned, makeup: p > (closed ? 0 : planned), first: p === 1, last: p === count, holiday: hol || null });
      } else if (closed && planned) {
        out.push({ kind: 'holiday', date, weekday, title: hol.title || 'วันหยุด' });
      } else if (hol && hol.type === 'school') {
        out.push({ kind: 'makeup', date, weekday, title: hol.title || 'สอนชดเชย' });
      }
    });
    return out;
  }
  // ค่าที่แสดงในช่อง: แก้แล้ว (ยังไม่บันทึก) > บันทึกแล้ว > รายวัน (จาง) > ว่าง
  function cellValue(col, id, saved, edits, daily) {
    const key = `${col.date}#${col.period}`;
    const edited = edits.get(key)?.get(id);
    if (edited === CLEAR) return { status: '', kind: 'cleared' };
    if (edited) return { status: edited, kind: 'edit' };
    const column = saved.get(key);
    // คนที่ไม่มีแถวในคาบที่บันทึกแล้ว = ว่าง (ปพ.5 ไม่นับคาบนั้นให้คนนั้น และไม่เติมจากรายวัน)
    if (column && column.size) return column.has(id) ? { status: column.get(id), kind: 'saved' } : { status: '', kind: 'empty' };
    const day = daily.get(col.date);
    if (day && day.size) return { status: day.get(id) || '', kind: day.get(id) ? 'daily' : 'empty' };
    return { status: '', kind: 'empty' };
  }

  // ปุ่มวนใต้คาบ (owner 2026-10-22 "ทำเป็นปุ่มรี คลิกแล้วมาทั้งหมด คลิกอีกทีลา คลิกอีกทีขาด คลิกอีกทีว่าง" แบบหน้าบันทึกเวลาเรียนรายเดือน)
  //   statuses = ค่าที่เห็นของทุกคนในคาบนั้น · ทุกคนมา -> ลา · ทุกคนลา -> ขาด · ทุกคนขาด -> ว่าง (clear) · อื่น ๆ -> มา
  function nextColumn(statuses) {
    const all = (st) => statuses.length > 0 && statuses.every((x) => x === st);
    return all('present') ? 'leave' : all('leave') ? 'absent' : all('absent') ? CLEAR : 'present';
  }

  const STYLE = `
.sam{display:grid;gap:10px}
.sam-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.sam-nav{display:inline-flex;align-items:center;gap:6px}
.sam-nav b{min-width:150px;text-align:center;font-size:1.05rem}
.sam-nav button,.sam-tool{border:1px solid var(--sa-line);background:var(--sa-card);color:var(--sa-text);border-radius:10px;min-height:38px;padding:0 .8rem;font-weight:600}
.sam-legend{display:flex;flex-wrap:wrap;gap:10px;font-size:.8rem;color:var(--sa-muted);align-items:center}
.sam-legend i{display:inline-flex;width:22px;height:22px;border-radius:6px;align-items:center;justify-content:center;font-style:normal;font-weight:700;margin-right:3px}
.sam-wrap{overflow:auto;max-height:70vh;border:1px solid var(--sa-line);border-radius:12px}
.sam-table{border-collapse:separate;border-spacing:0;font-size:.82rem;min-width:100%}
.sam-table th,.sam-table td{border-right:1px solid var(--sa-line);border-bottom:1px solid var(--sa-line);text-align:center;padding:0;background:var(--sa-card)}
.sam-table thead th{position:sticky;top:0;z-index:2;background:var(--sa-soft);font-weight:700;padding:4px 2px;vertical-align:middle}
.sam-table thead tr:nth-child(2) th{top:34px}
.sam-table .sam-name{position:sticky;left:0;z-index:1;text-align:left;padding:4px 8px;white-space:nowrap;min-width:180px;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.sam-table .sam-no{position:sticky;left:0;z-index:1;width:34px;min-width:34px;color:var(--sa-muted)}
.sam-table .sam-no+.sam-name{left:34px}
.sam-table thead .sam-no,.sam-table thead .sam-name{z-index:4}
.sam-table tbody .sam-no{text-align:center}
.sam-table th.sam-day{min-width:30px;height:34px;cursor:pointer;white-space:nowrap}
.sam-table th.sam-day b{font-size:.95rem}
.sam-table th.sam-day small{font-weight:600;color:var(--sa-muted);margin-left:3px}
.sam-table th.is-sat small{color:#1d6fb8}.sam-table th.is-sun small{color:#c2362b}
.sam-table th.is-makeup,.sam-table td.is-makeup{background:color-mix(in srgb,var(--sa-warn) 10%,var(--sa-card))}
.sam-table th.is-holiday,.sam-table td.is-holiday{background:color-mix(in srgb,#f5c542 22%,var(--sa-card));min-width:26px}
.sam-table th.is-holiday,.sam-table td.is-holiday{min-width:40px}
.sam-hol{font-size:.7rem;font-weight:700;color:#8a6d00;cursor:help}
.sam-table td.sam-first,.sam-table th.sam-first{border-left:2px solid color-mix(in srgb,var(--sa-text) 25%,transparent)}
.sam-table th.sam-p{font-size:.72rem;color:var(--sa-muted);min-width:32px;line-height:1.1;padding:3px 1px}
.sam-table th.sam-p button{display:block;margin:1px auto 0;border:0;background:transparent;color:var(--sa-accent);font-size:.85rem;padding:0 2px;line-height:1}
.sam-cell{width:30px;height:30px;border:0;background:transparent;font-weight:700;font-size:.9rem;color:var(--sa-muted)}
.sam-cell[data-s="present"]{color:var(--sa-ok)}.sam-cell[data-s="leave"]{color:var(--sa-warn)}.sam-cell[data-s="absent"]{color:var(--sa-bad)}
.sam-cell[data-k="saved"][data-s="present"],.sam-legend .is-saved{background:var(--sa-ok-bg)}
.sam-cell[data-k="saved"][data-s="leave"]{background:var(--sa-warn-bg)}.sam-cell[data-k="saved"][data-s="absent"]{background:var(--sa-bad-bg)}
.sam-cell[data-k="daily"]{opacity:.45}
.sam-cell[data-k="edit"],.sam-cell[data-k="cleared"]{outline:2px solid color-mix(in srgb,var(--sa-accent) 60%,transparent);outline-offset:-3px}
.sam-cell:disabled{cursor:default}
.sam-table td.sam-sum{font-weight:700;min-width:38px;padding:0 4px}
.sam-table th.sam-sum{position:sticky;top:0;min-width:38px}
.sam-add{border:1.5px dashed var(--sa-warn);background:var(--sa-warn-bg);color:var(--sa-warn);border-radius:8px;font-size:.72rem;font-weight:700;padding:2px 4px;white-space:nowrap}
.sam-menu{position:fixed;z-index:1060;background:var(--sa-card);border:1px solid var(--sa-line);border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,.18);padding:6px;display:grid;gap:2px;min-width:200px}
.sam-menu b{font-size:.82rem;padding:4px 8px;color:var(--sa-muted)}
.sam-menu button{border:0;background:transparent;text-align:left;padding:.45rem .7rem;border-radius:8px;font-size:.88rem;color:var(--sa-text)}
.sam-menu button:hover{background:var(--sa-soft)}
.sam-sum-line{font-size:.85rem;color:var(--sa-muted)}
@media (max-width:640px){.sam-table .sam-name{min-width:112px;max-width:132px;font-size:.76rem;padding:4px 6px;white-space:normal;line-height:1.2}
  .sam-table .sam-no{width:26px;min-width:26px}.sam-table .sam-no+.sam-name{left:26px}
  .sam-legend{gap:6px;font-size:.74rem}.sam-nav b{min-width:110px}}`;

  async function pages(build) {
    const out = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await build().range(start, start + 999);
      if (error) throw error;
      out.push(...(data || []));
      if ((data || []).length < 1000) return out;
    }
  }

  // ctx: { year, grade, room, subjectId, canWrite, month, todayIso, openDay(date), setSay(html, kind), bar, saveBtn }
  function mount(box, ctx) {
    const yearCE = Number(ctx.year) - 543;
    const range = { min: `${yearCE}-05-01`, max: `${yearCE + 1}-03-31` };
    const clampMonth = (m) => (m < range.min.slice(0, 7) ? range.min.slice(0, 7) : m > range.max.slice(0, 7) ? range.max.slice(0, 7) : m);
    const state = { month: clampMonth(ctx.month), students: [], weeks: new Map(), holidays: new Map(), saved: new Map(), daily: new Map(),
      recorded: new Map(), extra: new Map(), edits: new Map(), columns: [], token: 0 };
    let menu = null;
    const closeMenu = () => { if (menu) { menu.remove(); menu = null; } };

    const dirtyCount = () => [...state.edits.values()].filter((m) => m.size).length;
    function syncBar() {
      const n = dirtyCount();
      ctx.saveBtn.hidden = !ctx.canWrite;
      ctx.saveBtn.disabled = !n;
      ctx.saveBtn.innerHTML = `<i class="bi bi-save"></i> บันทึก${n ? ` ${n} คาบ` : ''}`;
      ctx.bar.hidden = !ctx.canWrite;
      if (n) ctx.setSay(`แก้ไว้ ${n} คาบ — ยังไม่ได้บันทึก`, '');
    }

    async function load() {
      const token = ++state.token;
      box.innerHTML = '<div class="sa-note">กำลังโหลดตารางเดือน…</div>';
      const first = `${state.month}-01`;
      const last = daysOfMonth(state.month).slice(-1)[0];
      try {
        const students = await global.PP5Data.students.list({ grade: ctx.grade, room: ctx.room });
        const ids = students.map((s) => text(s.id));
        if (!ids.length) { box.innerHTML = '<div class="sa-note is-warn">ไม่พบนักเรียนในห้องนี้</div>'; return; }
        const [schedules, rows, daily, holidays] = await Promise.all([
          pages(() => client().from('subject_schedules').select('semester,weekday,periods').eq('academic_year', ctx.year).eq('subject_id', ctx.subjectId)
            .eq('grade', ctx.grade).eq('room', ctx.room).order('semester').order('weekday')),
          pages(() => client().from('subject_attendance').select('student_id,attendance_date,period,status').eq('subject_id', ctx.subjectId)
            .in('student_id', ids).gte('attendance_date', first).lte('attendance_date', last).order('attendance_date').order('period').order('student_id')),
          pages(() => client().from('attendance_daily').select('student_id,attendance_date,status').in('student_id', ids)
            .gte('attendance_date', first).lte('attendance_date', last).order('attendance_date').order('student_id')).catch(() => []),
          pages(() => client().from('holidays').select('holiday_date,holiday_type,title').gte('holiday_date', first).lte('holiday_date', last).order('holiday_date')).catch(() => [])
        ]);
        if (token !== state.token) return;
        state.students = students;
        state.weeks = new Map();
        schedules.forEach((r) => { const s = Number(r.semester) || 0; if (!state.weeks.has(s)) state.weeks.set(s, new Map()); state.weeks.get(s).set(Number(r.weekday), Number(r.periods) || 0); });
        state.saved = new Map();
        state.recorded = new Map();
        rows.forEach((r) => {
          const d = text(r.attendance_date).slice(0, 10);
          const p = Number(r.period) || 1;
          const key = `${d}#${p}`;
          if (!state.saved.has(key)) state.saved.set(key, new Map());
          state.saved.get(key).set(text(r.student_id), r.status);
          if (!state.recorded.has(d)) state.recorded.set(d, new Set());
          state.recorded.get(d).add(p);
        });
        state.daily = new Map();
        daily.forEach((r) => {
          const d = text(r.attendance_date).slice(0, 10);
          const st = dailyStatus(r.status);
          if (!st) return;
          if (!state.daily.has(d)) state.daily.set(d, new Map());
          state.daily.get(d).set(text(r.student_id), st);
        });
        state.holidays = new Map(holidays.map((h) => [text(h.holiday_date).slice(0, 10), { type: text(h.holiday_type), title: text(h.title) }]));
        state.edits = new Map();
        state.extra = new Map();
        render();
      } catch (error) {
        if (token !== state.token) return;
        box.innerHTML = `<div class="sa-note is-err">${esc(error?.message || error)}</div>`;
      }
    }

    function render() {
      closeMenu();
      state.columns = buildColumns(state.month, state.weeks, state.holidays, state.recorded, state.extra, range);
      const [y, m] = state.month.split('-').map(Number);
      const cols = state.columns;
      const periods = cols.filter((c) => c.kind === 'period');
      const prevOk = shiftMonth(state.month, -1) >= range.min.slice(0, 7);
      const nextOk = shiftMonth(state.month, 1) <= range.max.slice(0, 7);
      const ids = state.students.map((s) => text(s.id));
      let savedN = 0; let dailyN = 0; let emptyN = 0;
      periods.forEach((c) => {
        const k = `${c.date}#${c.period}`;
        if (state.saved.get(k)?.size) savedN += 1;
        else if (state.daily.get(c.date)?.size) dailyN += 1;
        else if (c.date <= ctx.todayIso) emptyN += 1;
      });
      const noWeek = !state.weeks.size;
      // หัวตาราง 2 แถว: วันที่+วัน (รวมทุกคาบของวัน) / คาบ — owner 2026-10-22 "ปรับรูปแบบตารางให้เข้าที่เข้าทาง"
      const groups = [];
      cols.forEach((c) => { const g = groups[groups.length - 1]; if (g && g.date === c.date) g.cols.push(c); else groups.push({ date: c.date, cols: [c] }); });
      const dayHead = groups.map((g) => {
        const c = g.cols[0];
        const cls = ['sam-day', 'sam-first', c.weekday === 6 ? 'is-sat' : '', c.weekday === 7 ? 'is-sun' : '',
          c.kind === 'holiday' ? 'is-holiday' : '', c.kind === 'makeup' || c.makeup ? 'is-makeup' : ''].filter(Boolean).join(' ');
        const label = `<b>${Number(g.date.slice(8))}</b><small>${DAY_SHORT[c.weekday]}</small>`;
        return `<th class="${cls}" colspan="${g.cols.length}" data-day-head="${esc(g.date)}" title="${esc(c.holiday?.title || (c.kind === 'period' ? 'กดเพื่อเปิดแบบรายคาบของวันนี้' : ''))}">${label}</th>`;
      }).join('');
      // แถวที่ 2 ตามลำดับคอลัมน์: คาบ (ปุ่มยืนยันทั้งคาบ) · วันหยุด (ว่าง) · วันสอนชดเชย (ปุ่ม +สอน)
      const lastHead = cols.map((c) => (c.kind === 'period'
        ? `<th class="sam-p${c.first ? ' sam-first' : ''}${c.makeup ? ' is-makeup' : ''}">ค${c.period}${ctx.canWrite
          ? `<br><button type="button" data-pp5-btn-skip data-cycle="${esc(c.date)}#${c.period}" title="กดวนทั้งห้อง: มาทุกคน → ลาทุกคน → ขาดทุกคน → ว่าง" aria-label="วนสถานะทั้งห้อง คาบ ${c.period} วันที่ ${esc(c.date)}"><i class="bi bi-arrow-repeat"></i></button>` : ''}</th>`
        // วันหยุดไม่ล็อก (owner 2026-10-22 "บางโรงเรียนเขานัดเด็กมาสอน"): กด +สอน เพิ่มคาบของวิชานี้ในวันหยุดได้
        : c.kind === 'holiday' ? `<th class="sam-first is-holiday"><span class="sam-hol" title="${esc(c.title)}">หยุด</span>${ctx.canWrite
          ? `<br><button type="button" class="sam-add" data-pp5-btn-skip data-add-day="${esc(c.date)}" title="นัดนักเรียนมาเรียนวันนี้"><i class="bi bi-plus"></i>สอน</button>` : ''}</th>`
        : `<th class="sam-first is-makeup">${ctx.canWrite
          ? `<button type="button" class="sam-add" data-pp5-btn-skip data-add-day="${esc(c.date)}"><i class="bi bi-plus"></i>สอน</button>` : '<span class="sam-hol">ชดเชย</span>'}</th>`)).join('');
      const body = state.students.map((s, i) => {
        const id = text(s.id);
        const sum = { present: 0, leave: 0, absent: 0 };
        const cells = cols.map((c) => {
          if (c.kind === 'holiday') return `<td class="is-holiday sam-first"></td>`;
          if (c.kind === 'makeup') return `<td class="is-makeup sam-first"></td>`;
          const v = cellValue(c, id, state.saved, state.edits, state.daily);
          if (sum[v.status] !== undefined) sum[v.status] += 1;
          return `<td class="${c.first ? 'sam-first' : ''}${c.makeup ? ' is-makeup' : ''}"><button type="button" class="sam-cell" data-pp5-btn-skip data-cell="${esc(c.date)}#${c.period}" data-id="${esc(id)}"
  data-s="${v.status}" data-k="${v.kind}"${ctx.canWrite ? '' : ' disabled'} aria-label="${esc(s.fullName || id)} ${esc(c.date)} คาบ ${c.period}">${MARK[v.status] || '·'}</button></td>`;
        }).join('');
        return `<tr><td class="sam-no">${esc(text(s.studentNumber ?? s.student_number) || i + 1)}</td><td class="sam-name">${esc(s.fullName || s.name || id)}</td>${cells}
  <td class="sam-sum" style="color:var(--sa-ok)">${sum.present}</td><td class="sam-sum" style="color:var(--sa-warn)">${sum.leave}</td><td class="sam-sum" style="color:var(--sa-bad)">${sum.absent}</td></tr>`;
      }).join('');
      box.innerHTML = `<style>${STYLE}</style><div class="sam">
<div class="sam-top">
  <div class="sam-nav"><button type="button" data-pp5-btn-skip data-shift-month="-1"${prevOk ? '' : ' disabled'} aria-label="เดือนก่อน"><i class="bi bi-chevron-left"></i></button>
    <b>${MONTHS[m - 1]} ${y + 543}</b>
    <button type="button" data-pp5-btn-skip data-shift-month="1"${nextOk ? '' : ' disabled'} aria-label="เดือนถัดไป"><i class="bi bi-chevron-right"></i></button></div>
  ${ctx.canWrite ? '<button type="button" class="sam-tool" data-pp5-btn-skip data-add-day=""><i class="bi bi-calendar-plus"></i> เพิ่มวันสอน (วันหยุด/นัดพิเศษ)</button>' : ''}
  ${ctx.canWrite && periods.length ? '<button type="button" class="sam-tool" data-pp5-btn-skip data-fill-all><i class="bi bi-check2-all"></i> ยืนยันทุกคาบที่ยังไม่บันทึก (ถึงวันนี้)</button>' : ''}
</div>
<div class="sam-sum-line">เดือนนี้ ${periods.length} คาบ · บันทึกแล้ว ${savedN} · ใช้เช็คชื่อรายวัน ${dailyN}${emptyN ? ` · <b style="color:var(--sa-bad)">ยังไม่มีข้อมูล ${emptyN}</b>` : ''}</div>
<div class="sam-legend"><span><i class="is-saved" style="color:var(--sa-ok)">/</i>บันทึกแล้ว</span><span><i style="color:var(--sa-ok);opacity:.45">/</i>ตามเช็คชื่อรายวัน (นับแล้ว ยังไม่ได้ยืนยัน)</span>
  <span><i style="outline:2px solid var(--sa-accent);outline-offset:-3px">/</i>แก้แล้ว ยังไม่บันทึก</span><span>/ มา · ล ลา · ข ขาด · กดช่องเพื่อเปลี่ยน · <i class="bi bi-arrow-repeat" style="color:var(--sa-accent);width:auto"></i>ใต้คาบ = วนทั้งห้อง มา → ลา → ขาด → ว่าง</span>
  <span><i style="background:color-mix(in srgb,#f5c542 30%,transparent)"></i>วันหยุด</span><span><i style="background:var(--sa-warn-bg)"></i>สอนชดเชย</span></div>
${noWeek ? '<div class="sa-note is-warn">วิชานี้ยังไม่ได้ตั้งตารางสอน — ตารางรายเดือนจะแสดงเฉพาะวันที่บันทึกแล้วและวันสอนชดเชย</div>' : ''}
${cols.length ? `<div class="sam-wrap"><table class="sam-table"><thead>
<tr><th class="sam-no" rowspan="2">ที่</th><th class="sam-name" rowspan="2">ชื่อ-นามสกุล</th>${dayHead}<th class="sam-sum" rowspan="2" style="color:var(--sa-ok)">มา</th><th class="sam-sum" rowspan="2" style="color:var(--sa-warn)">ลา</th><th class="sam-sum" rowspan="2" style="color:var(--sa-bad)">ขาด</th></tr>
<tr>${lastHead}</tr>
</thead><tbody>${body}</tbody></table></div>` : '<div class="sa-note">เดือนนี้ไม่มีวันสอนวิชานี้ตามตารางสอน</div>'}
<div class="small" style="color:var(--sa-muted)">กดที่วันที่บนหัวตารางเพื่อเปิดแบบรายคาบของวันนั้น (เพิ่มคาบ / ลบการเช็คชื่อ) · วันเสาร์ที่ตั้งเป็น "สอนชดเชย" ในปฏิทินวันหยุด กด <b>+สอน</b> เพื่อเลือกจำนวนคาบของวิชานี้</div>
</div>`;
      // หัวตารางแถวที่ 2 ติดด้านบนตามความสูงจริงของแถวแรก
      const head = box.querySelector('.sam-table thead');
      const r1 = head?.rows[0]?.cells[2]?.getBoundingClientRect?.().height;
      if (r1 && head.rows[1]) [...head.rows[1].cells].forEach((cell) => { cell.style.top = `${r1}px`; });
      syncBar();
    }

    function setCell(key, id, status) {
      if (!state.edits.has(key)) state.edits.set(key, new Map());
      state.edits.get(key).set(id, status);
    }
    // ยืนยันคาบ: ทุกคนใช้ค่าที่เห็น (รายวัน) หรือ มา ถ้ายังว่าง — บันทึกแล้วจะเป็นสีเข้ม
    function fillColumn(key) {
      const [date, p] = key.split('#');
      const col = { date, period: Number(p) };
      state.students.forEach((s) => {
        const id = text(s.id);
        const v = cellValue(col, id, state.saved, state.edits, state.daily);
        setCell(key, id, v.status || 'present');
      });
    }
    // ปุ่มวนทั้งคาบ: ว่าง = คาบที่บันทึกแล้วถูกลบเมื่อกดบันทึก · คาบที่ยังไม่บันทึกกลับเป็นค่าตั้งต้น (ตามรายวันแบบจาง)
    function cycleColumn(key) {
      const [date, p] = key.split('#');
      const col = { date, period: Number(p) };
      const ids = state.students.map((s) => text(s.id));
      const next = nextColumn(ids.map((id) => cellValue(col, id, state.saved, state.edits, state.daily).status));
      if (next === CLEAR && !state.saved.get(key)?.size) { state.edits.delete(key); return; }
      ids.forEach((id) => setCell(key, id, next));
    }
    // เมนูเพิ่มคาบ: date = วันที่กดจากหัวตาราง · ว่าง = ปุ่ม "เพิ่มวันสอน" ให้เลือกวันใดก็ได้ของเดือนที่ยังไม่มีคาบ (เสาร์-อาทิตย์/วันหยุด/นัดพิเศษ)
    function openMenu(anchor, date) {
      closeMenu();
      const taken = new Set(state.columns.filter((c) => c.kind === 'period').map((c) => c.date));
      const choices = date ? [] : daysOfMonth(state.month).filter((d) => d >= range.min && d <= range.max && !taken.has(d));
      if (!date && !choices.length) { ctx.setSay('ทุกวันของเดือนนี้มีคาบอยู่แล้ว — กดที่วันที่บนหัวตารางเพื่อเพิ่มคาบในแบบรายคาบ', ''); return; }
      const pick = date || choices[0];
      const week = state.weeks.get(semesterOf(pick)) || new Map();
      const like = [1, 2, 3, 4, 5].filter((d) => week.get(d)).map((d) => ({ d, n: week.get(d) }));
      const label = (d) => `วัน${DAY_NAME[weekdayOf(d)]} ${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}${state.holidays.get(d) ? ` (${state.holidays.get(d).title || 'วันหยุด'})` : ''}`;
      menu = doc.createElement('div');
      menu.className = 'sam-menu';
      menu.innerHTML = `${date ? `<b>${esc(label(date))} — สอนวิชานี้กี่คาบ</b>`
        : `<b>เลือกวันที่นัดนักเรียนมาเรียน</b><select class="form-select form-select-sm" data-pick-date>${choices.map((d) => `<option value="${d}">${esc(label(d))}</option>`).join('')}</select><b>สอนวิชานี้กี่คาบ</b>`}
${like.map((x) => `<button type="button" data-pp5-btn-skip data-add-n="${x.n}">ใช้ตารางวัน${DAY_NAME[x.d]} (${x.n} คาบ)</button>`).join('')}
${[1, 2, 3, 4].map((n) => `<button type="button" data-pp5-btn-skip data-add-n="${n}">${n} คาบ</button>`).join('')}`;
      const rect = anchor.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(rect.left, global.innerWidth - 220))}px`;
      menu.style.top = `${rect.bottom + 4}px`;
      menu.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-add-n]');
        if (!btn) return;
        const day = date || menu.querySelector('[data-pick-date]')?.value || pick;
        state.extra.set(day, Number(btn.dataset.addN));
        // คาบที่เพิ่ม: ยืนยันตามรายวันให้เลย (ไม่มีรายวัน = มาทุกคน) — เพิ่มแล้วกดบันทึกได้ทันที
        for (let p = 1; p <= Number(btn.dataset.addN); p += 1) fillColumn(`${day}#${p}`);
        render();
      });
      // ภายในหน้า (.sa) เพื่อใช้สีของหน้า — position:fixed จึงไม่ถูกตารางที่เลื่อนได้ตัด
      (box.closest('.sa') || doc.body).appendChild(menu);
    }

    const onClick = (event) => {
      const cell = event.target.closest('[data-cell]');
      if (cell && !cell.disabled) {
        const key = cell.dataset.cell;
        const next = NEXT[cell.dataset.s] || 'present';
        setCell(key, cell.dataset.id, next);
        cell.dataset.s = next === CLEAR ? '' : next;
        cell.dataset.k = next === CLEAR ? 'cleared' : 'edit';
        cell.textContent = MARK[next] || '·';
        syncBar();
        return;
      }
      const cycle = event.target.closest('[data-cycle]');
      if (cycle) { cycleColumn(cycle.dataset.cycle); render(); return; }
      if (event.target.closest('[data-fill-all]')) {
        state.columns.filter((c) => c.kind === 'period' && c.date <= ctx.todayIso && !state.saved.get(`${c.date}#${c.period}`)?.size)
          .forEach((c) => fillColumn(`${c.date}#${c.period}`));
        render();
        return;
      }
      const add = event.target.closest('[data-add-day]');
      if (add) { openMenu(add, add.dataset.addDay); return; }
      const move = event.target.closest('[data-shift-month]');
      if (move) {
        if (dirtyCount() && !global.confirm('ยังไม่ได้บันทึกที่แก้ไว้ ต้องการเปลี่ยนเดือนโดยไม่บันทึกใช่ไหม?')) return;
        state.month = clampMonth(shiftMonth(state.month, Number(move.dataset.shiftMonth)));
        ctx.setSay('', '');
        load();
        return;
      }
      const head = event.target.closest('[data-day-head]');
      if (head && !head.classList.contains('is-holiday')) {
        if (dirtyCount() && !global.confirm('ยังไม่ได้บันทึกที่แก้ไว้ ต้องการเปิดแบบรายคาบโดยไม่บันทึกใช่ไหม?')) return;
        ctx.openDay(head.dataset.dayHead);
      }
    };
    // ล้างตัวเก่าก่อน mount ใหม่ (เปลี่ยนวิชา/วันที่) — ไม่ให้คลิกเดียวถูกจัดการสองครั้ง
    box.addEventListener('click', onClick);
    const outside = (event) => { if (menu && !menu.contains(event.target) && !event.target.closest('[data-add-day]')) closeMenu(); };
    doc.addEventListener('click', outside);

    async function save() {
      const keys = [...state.edits.entries()].filter(([, m]) => m.size).map(([k]) => k).sort();
      if (!keys.length) return;
      ctx.saveBtn.disabled = true;
      const failed = [];
      let done = 0;
      for (const key of keys) {
        const [date, p] = key.split('#');
        const col = { date, period: Number(p) };
        ctx.setSay(`<span class="spinner-border spinner-border-sm"></span> กำลังบันทึก ${done + 1}/${keys.length}…`, '');
        const rows = state.students.map((s) => {
          const id = text(s.id);
          const v = cellValue(col, id, state.saved, state.edits, state.daily);
          // ว่าง: กดให้ว่าง หรือไม่มีแถวในคาบที่บันทึกแล้ว = ไม่บันทึกคนนั้น (null) · คาบใหม่ที่ยังว่าง = มา (เหมือนแบบรายคาบ)
          const keepEmpty = v.kind === 'cleared' || (!v.status && state.saved.get(key)?.size);
          return { student_id: id, status: keepEmpty ? null : v.status || 'present' };
        });
        const { error } = await client().rpc('pp5_save_subject_period', { p_subject_id: ctx.subjectId, p_date: date, p_period: Number(p), p_rows: rows });
        if (error) { failed.push(`${date} คาบ ${p}: ${error.message}`); continue; }
        done += 1;
      }
      await load();
      if (failed.length) ctx.setSay(`<i class="bi bi-exclamation-triangle-fill"></i> บันทึกได้ ${done} คาบ ไม่สำเร็จ ${failed.length}: ${esc(failed.slice(0, 3).join(' · '))}`, 'err');
      else ctx.setSay(`<i class="bi bi-check-circle-fill"></i> บันทึกแล้ว ${done} คาบ`, 'ok');
    }

    load();
    return {
      save,
      isDirty: () => dirtyCount() > 0,
      destroy: () => { closeMenu(); box.removeEventListener('click', onClick); doc.removeEventListener('click', outside); state.token += 1; }
    };
  }

  global.PP5SubjectAttendanceMonth = { mount, buildColumns, cellValue, nextColumn, daysOfMonth, shiftMonth, semesterOf };
})(window);
