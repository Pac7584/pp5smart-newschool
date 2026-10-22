// โหมดการทำงานของครู (owner 2026-10-15: "เมื่อครูเข้าระบบ เขาต้องเข้าระบบแบบรายวิชา หรือรายชั้นได้ โดยการกำหนดจาก admin
// และระบบของเราก็ต้องตอบสนองแบบรายวิชาได้" — เลือก "เลือกโหมดหลังเข้าระบบ")
//   ที่มาของโหมด = งานที่ผู้ดูแลมอบหมาย (teacher_access_assignments ปีปัจจุบัน) ไม่มีปุ่มให้ครูตั้งเอง
//     ครูประจำชั้นอย่างเดียว -> homeroom (เหมือนเดิมทุกอย่าง) · ครูประจำวิชาอย่างเดียว -> subject
//     มีทั้งสองงาน -> ถามหลังเข้าระบบ (จำไว้ในแท็บนี้จนออกจากระบบ) และสลับได้ที่ป้ายบทบาทมุมบน
//   subject: เมนู/หน้าหลัก/ห้องในตัวเลือก = เฉพาะงานครูประจำวิชา · homeroom: ห้องในตัวเลือก = เฉพาะห้องประจำชั้น
//   โหมดเป็นเพียง "มุมมอง" — สิทธิ์จริงยังตรวจจากงานที่มอบหมายใน teacher-permissions.js และ RLS ของฐานข้อมูล
(function initWorkMode(global) {
  'use strict';
  const doc = global.document;
  const text = (v) => (v == null ? '' : String(v).trim());
  const esc = (v) => text(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'pp5WorkMode:';
  const LABEL = { homeroom: 'ครูประจำชั้น', subject: 'ครูประจำวิชา' };
  let ctxCache = null;
  let chooserOpen = false;

  // ภาคเรียนปัจจุบัน (school_settings.semester) — งานครูประจำวิชาที่ผู้ดูแลตั้ง "ภาค 2" ยังไม่นับในภาค 1 และกลับกัน
  // (owner 2026-10-15: ยกวิชาให้ครูรายวิชาในภาคเรียนที่ 2) · 0 = ยังไม่รู้ภาค (ไม่กรอง) · งานทั้งปี (semester 0) นับทุกภาค
  let semester = 0;
  let semesterLoading = null;
  const inSemester = (a, sem = semester) => a.scope !== 'subject' || !Number(a.semester) || !sem || Number(a.semester) === Number(sem);
  const current = (ctx) => (ctx?.assignments || []).filter((a) => a.active !== false && a.academic_year === ctx.academicYear && inSemester(a));
  function kinds(ctx) {
    const list = current(ctx);
    return { homeroom: list.some((a) => a.scope === 'homeroom'), subject: list.some((a) => a.scope === 'subject') };
  }
  function stored(ctx) {
    try { return global.sessionStorage.getItem(KEY + text(ctx?.userId)) || ''; } catch (_) { return ''; }
  }
  // '' = ไม่ใช้โหมด (ผู้ดูแล ผู้ปกครอง หรือยังไม่เปิดระบบสิทธิ์ครู) — ทุกอย่างเป็นแบบเดิม
  function mode(ctx) {
    ctx = ctx || ctxCache;
    if (!ctx || !ctx.enabled || ctx.role !== 'teacher') return '';
    const k = kinds(ctx);
    if (k.homeroom && k.subject) return stored(ctx) === 'subject' ? 'subject' : 'homeroom';
    return k.subject ? 'subject' : k.homeroom ? 'homeroom' : '';
  }
  const both = (ctx) => { const k = kinds(ctx || ctxCache); return k.homeroom && k.subject; };
  // sem: ไม่ส่ง = ภาคปัจจุบัน · 0 = ทุกภาค (หน้าตารางสอน/สรุปที่มีแท็บภาคของตัวเอง)
  const keeps = (assignment, ctx, sem) => { const m = mode(ctx); return (!m || assignment.scope === m) && inSemester(assignment, sem === undefined ? semester : sem); };
  const filter = (assignments, ctx) => (assignments || []).filter((a) => keeps(a, ctx));
  const label = () => LABEL[mode()] || '';

  function choose(next) {
    if (!ctxCache || !LABEL[next]) return;
    try { global.sessionStorage.setItem(KEY + text(ctxCache.userId), next); } catch (_) { /* โหมดเริ่มต้นยังใช้ได้ */ }
    closeChooser();
    global.PP5Permissions?.refreshMenu?.();
    if (typeof global.navigateTo === 'function') global.navigateTo('home_hub');
  }
  function forget() {
    try {
      const store = global.sessionStorage;
      for (let i = store.length - 1; i >= 0; i -= 1) { const k = store.key(i); if (k && k.startsWith(KEY)) store.removeItem(k); }
    } catch (_) { /* ไม่มีอะไรต้องล้าง */ }
  }

  // ---- หน้าต่างเลือกโหมด (ครูที่มีทั้งสองงาน)
  const rooms = (list) => [...new Set(list.map((a) => a.grade + '/' + a.room))]
    .sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
  function closeChooser() {
    doc.getElementById('pp5WorkModeChooser')?.remove();
    chooserOpen = false;
  }
  function openChooser() {
    if (chooserOpen || !ctxCache || !both(ctxCache)) return;
    ensureStyle();
    chooserOpen = true;
    const list = current(ctxCache);
    const homeroom = rooms(list.filter((a) => a.scope === 'homeroom'));
    const subjectJobs = list.filter((a) => a.scope === 'subject');
    const subjectRooms = rooms(subjectJobs);
    const subjectCount = new Set(subjectJobs.map((a) => a.subject_id)).size;
    const chosen = stored(ctxCache);
    const now = mode(ctxCache);
    let name = '';
    try { name = text(global.localStorage.getItem('displayName')); } catch (_) { name = ''; }
    const chips = (list) => list.map((r) => `<span>${esc(r)}</span>`).join('');
    const option = (key, icon, title, meta, roomList, tasks, go) => `
    <button type="button" class="pp5wm-option is-${key}${chosen && now === key ? ' is-current' : ''}" data-work-mode="${key}">
      ${chosen && now === key ? '<span class="pp5wm-now"><i class="bi bi-check-circle-fill"></i> ใช้อยู่ตอนนี้</span>' : ''}
      <span class="pp5wm-oicon"><i class="bi ${icon}" aria-hidden="true"></i></span>
      <b>${title}</b><small class="pp5wm-ometa">${meta}</small>
      <span class="pp5wm-chips">${chips(roomList)}</span>
      <span class="pp5wm-tasks">${tasks.map(([i, t]) => `<span><i class="bi ${i}"></i>${t}</span>`).join('')}</span>
      <span class="pp5wm-ogo">${go} <i class="bi bi-arrow-right-circle-fill"></i></span>
    </button>`;
    const box = doc.createElement('div');
    box.id = 'pp5WorkModeChooser';
    box.className = 'pp5wm-overlay';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'pp5WorkModeTitle');
    box.innerHTML = `<div class="pp5wm-dialog">
  <div class="pp5wm-dhead">
    <span class="pp5wm-dicon"><i class="bi bi-person-workspace"></i></span>
    <div><small>สวัสดี${name ? ' ' + esc(name) : 'ครับ/ค่ะ'}</small><h2 id="pp5WorkModeTitle">วันนี้ต้องการทำงานแบบไหน</h2>
    <p>คุณได้รับมอบหมายทั้งงานครูประจำชั้นและครูประจำวิชา</p></div>
    ${chosen ? '<button type="button" class="pp5wm-close" data-wm-close aria-label="ปิด"><i class="bi bi-x-lg"></i></button>' : ''}
  </div>
  <div class="pp5wm-options">${option('homeroom', 'bi-house-heart-fill', 'ครูประจำชั้น', `ดูแล ${homeroom.length} ห้อง`, homeroom,
      [['bi-calendar-check-fill', 'เช็คชื่อรายวัน'], ['bi-star-fill', 'ประเมินคุณลักษณะ อ่าน คิด เขียน'], ['bi-journal-text', 'ปพ.5 / ปพ.6 ของห้อง']], 'เข้าทำงานครูประจำชั้น')}
${option('subject', 'bi-journal-bookmark-fill', 'ครูประจำวิชา', `สอน ${subjectCount} วิชา · ${subjectRooms.length} ห้อง`, subjectRooms,
      [['bi-pencil-square', 'กรอกคะแนนรายวิชา'], ['bi-calendar2-check-fill', 'เช็คชื่อรายชั่วโมง'], ['bi-journals', 'ปพ.5 แบบรายวิชา']], 'เข้าทำงานครูประจำวิชา')}
  </div>
  <p class="pp5wm-hint"><i class="bi bi-arrow-left-right"></i> สลับงานได้ทุกเมื่อ ที่ป้ายบทบาทมุมขวาบน</p>
</div>`;
    box.addEventListener('click', (event) => {
      if (event.target.closest('[data-wm-close]')) { closeChooser(); return; }
      const pick = event.target.closest('[data-work-mode]');
      if (pick) choose(pick.dataset.workMode);
    });
    box.addEventListener('keydown', (event) => { if (event.key === 'Escape' && chosen) closeChooser(); });
    doc.body.appendChild(box);
    box.querySelector('.pp5wm-option')?.focus();
  }

  // ---- ป้ายบทบาท + ห้องประจำชั้นบนหัวจอ
  function applyBadge() {
    const badge = doc.getElementById('userRoleBadge');
    const m = mode();
    if (!badge || !m) return;
    badge.textContent = LABEL[m];
    const switchable = both();
    badge.classList.toggle('pp5wm-badge', switchable);
    if (switchable) {
      badge.setAttribute('role', 'button');
      badge.setAttribute('tabindex', '0');
      badge.title = 'กดเพื่อสลับเป็น' + LABEL[m === 'subject' ? 'homeroom' : 'subject'];
      badge.textContent = LABEL[m] + ' ⇄';
      if (!badge.__pp5WorkMode) {
        badge.__pp5WorkMode = true;
        const open = (event) => {
          if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          openChooser();
        };
        badge.addEventListener('click', open);
        badge.addEventListener('keydown', open);
      }
    } else {
      badge.removeAttribute('role');
      badge.removeAttribute('tabindex');
      badge.removeAttribute('title');
    }
  }

  // ---- หน้าหลักของครูประจำวิชา: การ์ดเมนูหลัก + แผง "งานสอนของฉัน" (แทนแผงเส้นทางครูประจำชั้น)
  const CARD_SWAP = [
    ['[data-mm-page="attendance_daily"]', 'subject_attendance', 'เช็กชื่อรายวิชา', 'เช็คชื่อรายชั่วโมงของวิชาที่สอน', 'bi-calendar-check'],
    ['[data-mm-section="assessment"]', 'exam_analysis', 'วิเคราะห์ข้อสอบ', 'วิเคราะห์ผลสอบรายข้อของวิชาที่สอน', 'bi-clipboard-data'],
    ['[data-mm-page="studentList"]', 'pp5_subject_book', 'ปพ.5 รายวิชา', 'พิมพ์ ปพ.5 แบบรายวิชาของห้องที่สอน', 'bi-journals']
  ];
  function adaptMainMenu(hub) {
    const menu = hub.querySelector('#pp5HubMainMenu');
    if (!menu || menu.dataset.workMode === 'subject') return;
    menu.dataset.workMode = 'subject';
    for (const [selector, page, name, desc, icon] of CARD_SWAP) {
      const card = menu.querySelector(selector);
      if (!card) continue;
      card.removeAttribute('data-mm-section');
      card.setAttribute('data-mm-page', page);
      card.title = desc;
      const nameEl = card.querySelector('.pp5-mm-name');
      const descEl = card.querySelector('.pp5-mm-desc');
      const iconEl = card.querySelector('.pp5-mm-icon i');
      if (nameEl) nameEl.textContent = name;
      if (descEl) descEl.textContent = desc;
      if (iconEl) iconEl.className = 'bi ' + icon;
    }
  }

  async function allPages(build) {
    const rows = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await build().range(start, start + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if ((data || []).length < 1000) return rows;
    }
  }
  const thaiDate = (iso) => {
    try { return new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }); } catch (_) { return iso; }
  };

  // ลำดับวิชาเดียวกับปก ปพ.5 (gas-bridge comparePp5CoverSubjects) แล้วต่อด้วยวิชาอื่น และกิจกรรมพัฒนาผู้เรียนท้ายสุด
  const CORE_ORDER = ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์', 'เทคโนโลยี', 'สังคมศึกษา', 'ประวัติศาสตร์', 'สุขศึกษา', 'ศิลปะ', 'การงาน', 'ภาษาอังกฤษ', 'หน้าที่พลเมือง', 'การป้องกัน'];
  const ACTIVITY_ORDER = [['แนะแนว'], ['ลูกเสือ', 'เนตรนารี', 'ยุวกาชาด'], ['ชุมนุม', 'ชมรม'], ['เพื่อสังคม', 'สาธารณประโยชน์'], ['กิจกรรม']];
  function subjectRank(name) {
    const n = text(name);
    const act = ACTIVITY_ORDER.findIndex((words) => words.some((w) => n.includes(w)));
    if (act !== -1) return 100 + act;
    let core = -1;
    CORE_ORDER.forEach((w, i) => { if (n.includes(w)) core = i; });
    return core === -1 ? 50 : core;
  }

  // งานสอน = (วิชา, ชั้น, ห้อง) ของงานครูประจำวิชาในปีปัจจุบัน — ความคืบหน้านับจากข้อมูลจริง
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const weekdayOf = (iso) => { const [y, m, d] = text(iso).split('-').map(Number); const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return js === 0 ? 7 : js; };
  async function teachingRows(ctx, todayIso = localToday()) {
    const client = global.PP5Data.client;
    const jobs = current(ctx).filter((a) => a.scope === 'subject' && a.subject_id);
    const ids = [...new Set(jobs.map((a) => a.subject_id))];
    if (!ids.length) return { rows: [], semester: '' };
    const settings = await global.PP5Data.settings.get().catch(() => ({}));
    const semester = Number(settings?.semester || settings?.currentSemester || 1) === 2 ? 2 : 1;
    const year = ctx.academicYear;
    const [subjects, roster] = await Promise.all([
      allPages(() => client.from('subjects').select('id,code,name,grade,semester').in('id', ids).order('id')),
      client.rpc('pp5_teacher_scope_roster', { p_year: year }).then((r) => { if (r.error) throw r.error; return r.data || []; })
    ]);
    // คะแนนและเวลาเรียนอ่านไม่ได้ (เช่น ยังไม่ได้รัน SQL 031) -> แสดง "—" แทน ไม่ทำให้ทั้งแผงพัง
    // ตารางสอน (SQL 032) บอกว่าวันนี้มีกี่คาบ — ยังไม่ได้รัน 032 = null (ไม่แสดงส่วน "วันนี้")
    const attendanceRows = (cols) => allPages(() => client.from('subject_attendance').select(cols)
      .in('subject_id', ids).eq('academic_year', year).order('id'));
    let holidays = new Set();
    const [scores, attendance, schedules] = await Promise.all([
      allPages(() => client.from('scores').select('student_id,subject_id,semester,total_score')
        .in('subject_id', ids).eq('academic_year', year).order('id')).catch(() => null),
      attendanceRows('subject_id,student_id,attendance_date,period').catch(() => attendanceRows('subject_id,student_id,attendance_date')).catch(() => null),
      allPages(() => client.from('subject_schedules').select('subject_id,grade,room,weekday,periods')
        .eq('academic_year', year).eq('semester', semester).in('subject_id', ids).order('id')).catch(() => null),
      allPages(() => client.from('holidays').select('holiday_date').order('id')).catch(() => [])
    ]).then(([a, b, c, h]) => { holidays = new Set((h || []).map((r) => text(r.holiday_date).slice(0, 10))); return [a, b, c]; });
    // ขั้นที่ 3: คาบที่ค้างเช็ค = ตารางสอน × วันเรียนในช่วงภาค (settings_json.term_dates) หักวันหยุด เทียบกับคาบที่เช็คแล้ว
    const range = global.PP5SubjectSchedule?.termRange?.(settings?.settings_json, year, semester) || null;
    // วันที่ห้องมีเช็คชื่อรายวันแล้วไม่นับว่าค้าง (owner 2026-10-22 "ใช้รายวันแทน") — รายวันบันทึกทั้งห้องพร้อมกัน
    // จึงอ่านวันที่จากนักเรียนตัวแทน 2 คนต่อห้อง (ไม่ต้องอ่านทุกคนทุกวัน)
    const dailyByRoom = new Map();
    if (range && !range.empty) {
      const reps = new Map();
      roster.filter((s) => !s.status || s.status === 'active').forEach((s) => {
        const room = s.grade + '/' + text(s.room);
        if (!jobs.some((j) => j.grade + '/' + text(j.room) === room)) return;
        const list = reps.get(room) || [];
        if (list.length < 2) { list.push(text(s.id)); reps.set(room, list); }
      });
      const repIds = [...reps.values()].flat();
      const roomOf = new Map([...reps.entries()].flatMap(([room, list]) => list.map((id) => [id, room])));
      const dailyRows = repIds.length ? await allPages(() => client.from('attendance_daily').select('student_id,attendance_date')
        .in('student_id', repIds).gte('attendance_date', range.start).lte('attendance_date', range.end).order('attendance_date').order('student_id')).catch(() => []) : [];
      dailyRows.forEach((r) => {
        const room = roomOf.get(text(r.student_id));
        if (!room) return;
        if (!dailyByRoom.has(room)) dailyByRoom.set(room, new Set());
        dailyByRoom.get(room).add(text(r.attendance_date).slice(0, 10));
      });
    }
    const todayDay = weekdayOf(todayIso);
    const byId = new Map(subjects.map((s) => [s.id, s]));
    const seen = new Set();
    const rows = [];
    for (const job of jobs) {
      const key = job.subject_id + '|' + job.grade + '|' + job.room;
      if (seen.has(key)) continue;
      seen.add(key);
      const subject = byId.get(job.subject_id) || { id: job.subject_id, name: job.subject_id };
      const students = new Set(roster.filter((s) => s.grade === job.grade && text(s.room) === text(job.room)
        && (!s.status || s.status === 'active')).map((s) => text(s.id)));
      const term = Number(subject.semester) || semester;
      const scored = scores && new Set(scores.filter((r) => r.subject_id === subject.id && Number(r.semester) === term
        && Number(r.total_score) > 0 && students.has(text(r.student_id))).map((r) => text(r.student_id)));
      const dates = attendance && [...new Set(attendance.filter((r) => r.subject_id === subject.id
        && students.has(text(r.student_id))).map((r) => r.attendance_date))].sort();
      const week = schedules && schedules.filter((r) => r.subject_id === subject.id && r.grade === job.grade && text(r.room) === text(job.room));
      const todayDone = attendance ? new Set(attendance.filter((r) => r.subject_id === subject.id && r.attendance_date === todayIso
        && students.has(text(r.student_id))).map((r) => Number(r.period) || 1)).size : 0;
      const recorded = new Map();
      (attendance || []).forEach((r) => {
        if (r.subject_id !== subject.id || !students.has(text(r.student_id))) return;
        const d = text(r.attendance_date).slice(0, 10);
        if (!recorded.has(d)) recorded.set(d, new Set());
        recorded.get(d).add(Number(r.period) || 1);
      });
      const weekMap = new Map((week || []).map((r) => [Number(r.weekday), Number(r.periods) || 0]));
      const late = attendance && week?.length && range ? global.PP5SubjectSchedule?.missedPeriods?.(weekMap, recorded, range, holidays, todayIso, dailyByRoom.get(job.grade + '/' + text(job.room))) : null;
      rows.push({ subject, grade: job.grade, room: text(job.room), term, total: students.size, owed: late ? late.owed : null,
        scored: scored ? scored.size : null, days: dates ? dates.length : null, last: dates?.length ? dates[dates.length - 1] : '',
        hasWeek: week ? week.length > 0 : null, weekTotal: week ? week.reduce((sum, r) => sum + (Number(r.periods) || 0), 0) : 0,
        todayPlanned: week ? week.filter((r) => Number(r.weekday) === todayDay).reduce((sum, r) => sum + (Number(r.periods) || 0), 0) : 0,
        todayDone });
    }
    // owner 2026-10-15: วิชาหลักก่อน (ภาษาไทย คณิต วิทย์ …) แล้วจึงกิจกรรม (แนะแนว ลูกเสือ ชุมนุม เพื่อสังคม) — วิชาเดียวกันเรียงตามห้อง
    rows.sort((a, b) => subjectRank(a.subject.name) - subjectRank(b.subject.name)
      || text(a.subject.code || a.subject.name).localeCompare(text(b.subject.code || b.subject.name), 'th', { numeric: true })
      || (a.grade + '/' + a.room).localeCompare(b.grade + '/' + b.room, 'th', { numeric: true }));
    return { rows, semester };
  }

  // สี + ไอคอนประจำกลุ่มสาระ (โทนเดียวกับการ์ดเมนูหลักของหน้าหลัก)
  const LOOK = [
    [['ภาษาไทย'], 'bi-book-half', '#ff77af', '#fa287f'],
    [['คณิตศาสตร์'], 'bi-calculator-fill', '#30b9ff', '#0050ff'],
    [['วิทยาศาสตร์'], 'bi-radioactive', '#56dc85', '#00b961'],
    [['เทคโนโลยี', 'คอมพิวเตอร์'], 'bi-cpu-fill', '#60d0e5', '#4893db'],
    [['สังคมศึกษา', 'หน้าที่พลเมือง'], 'bi-globe-asia-australia', '#f4c671', '#ef946b'],
    [['ประวัติศาสตร์'], 'bi-hourglass-split', '#e0a86b', '#b8642e'],
    [['สุขศึกษา', 'พลศึกษา'], 'bi-heart-pulse-fill', '#ff8a8a', '#e5484d'],
    [['ศิลปะ', 'ดนตรี', 'นาฏศิลป์'], 'bi-palette-fill', '#c26dff', '#8b35ef'],
    [['การงาน'], 'bi-tools', '#f6b84b', '#e07b00'],
    [['ภาษาอังกฤษ', 'ภาษาจีน', 'ภาษาต่างประเทศ'], 'bi-translate', '#ad80ff', '#7934f5'],
    [['การป้องกัน', 'ทุจริต'], 'bi-shield-fill-check', '#65a5b9', '#32627f'],
    [['แนะแนว'], 'bi-compass-fill', '#5ad1b0', '#0f9b8e'],
    [['ลูกเสือ', 'เนตรนารี', 'ยุวกาชาด'], 'bi-award-fill', '#a3b86c', '#5f7a2a'],
    [['ชุมนุม', 'ชมรม'], 'bi-people-fill', '#7fb2ff', '#4361ee'],
    [['เพื่อสังคม', 'สาธารณประโยชน์'], 'bi-hand-thumbs-up-fill', '#ffb38a', '#f2711c']
  ];
  function look(name) {
    const n = text(name);
    let hit = null;
    LOOK.forEach((item) => { if (item[0].some((w) => n.includes(w))) hit = item; });
    return hit || [[], 'bi-journal-bookmark-fill', '#9aa7ff', '#5b6cf0'];
  }

  function panelHtml({ rows, semester }, year) {
    const head = (stats) => `<div class="pp5wm-head">
  <span class="pp5wm-head-icon"><i class="bi bi-journal-bookmark-fill"></i></span>
  <div class="pp5wm-head-text"><h3>งานสอนของฉัน</h3><p>ปีการศึกษา ${esc(year)} · ภาคเรียนที่ ${esc(semester || '-')}</p></div>
  ${stats || ''}</div>`;
    if (!rows.length) {
      return head() + '<p class="pp5wm-empty">ยังไม่มีวิชาที่ได้รับมอบหมายในปีนี้ — ให้ผู้ดูแลเพิ่ม "ครูประจำวิชา" ให้บัญชีนี้ในหน้ามอบหมายงาน</p>';
    }
    const done = rows.filter((r) => r.scored != null && r.total && r.scored >= r.total).length;
    const subjects = new Set(rows.map((r) => r.subject.id)).size;
    const roomCount = new Set(rows.map((r) => r.grade + '/' + r.room)).size;
    const scheduled = rows.some((r) => r.hasWeek !== null && r.hasWeek !== undefined);
    const todayLeft = rows.reduce((sum, r) => sum + Math.max(0, (r.todayPlanned || 0) - (r.todayDone || 0)), 0);
    const noWeek = rows.filter((r) => r.hasWeek === false).length;
    const owed = rows.reduce((sum, r) => sum + (r.owed || 0), 0);
    const stats = `<div class="pp5wm-stats">
  ${scheduled ? `<span class="${todayLeft ? 'is-today' : 'is-done'}"><b>${todayLeft}</b>${todayLeft ? 'คาบรอเช็ควันนี้' : 'เช็ควันนี้ครบ'}</span>` : ''}
  ${owed ? `<span class="is-owed"><b>${owed}</b>คาบค้างเช็ค</span>` : ''}
  <span><b>${subjects}</b>วิชา</span><span><b>${roomCount}</b>ห้อง</span><span class="is-done"><b>${done}/${rows.length}</b>คะแนนครบ</span></div>
  ${scheduled ? `<button type="button" class="pp5wm-schedule" data-pp5-btn-skip data-wm-go="subject_schedule"><i class="bi bi-calendar-week"></i> ตารางสอนของฉัน${noWeek ? ` <em>ยังไม่ตั้ง ${noWeek}</em>` : ''}</button>` : ''}`;
    const card = (r) => {
      const [, icon, start, end] = look(r.subject.name);
      const pct = r.scored != null && r.total ? Math.round((r.scored / r.total) * 100) : 0;
      const tone = r.scored == null ? 'is-none' : pct >= 100 ? 'is-full' : pct > 0 ? 'is-part' : 'is-zero';
      const scoreText = r.scored == null ? 'อ่านไม่ได้' : `${r.scored}/${r.total} คน`;
      const att = r.days == null ? '<span class="pp5wm-chip is-none">—</span>'
        : r.days ? `<span class="pp5wm-chip is-ok"><i class="bi bi-check-circle-fill"></i> ${r.days} วัน · ล่าสุด ${esc(thaiDate(r.last))}</span>`
          : '<span class="pp5wm-chip is-wait"><i class="bi bi-hourglass"></i> ยังไม่ได้เช็ค</span>';
      const nav = (page, labelText, btnIcon, cls) => `<button type="button" class="pp5wm-btn ${cls}" data-pp5-btn-skip data-wm-go="${page}" data-grade="${esc(r.grade)}" data-room="${esc(r.room)}" data-subject="${esc(r.subject.id)}"><i class="bi ${btnIcon}"></i><span>${labelText}</span></button>`;
      const today = r.hasWeek === null || r.hasWeek === undefined ? ''
        : !r.hasWeek ? '<div class="pp5wm-today is-none"><i class="bi bi-calendar-x"></i> ยังไม่ตั้งตารางสอน — เช็คชื่อได้หลังตั้งตาราง</div>'
          : r.todayPlanned ? (r.todayDone >= r.todayPlanned
            ? `<div class="pp5wm-today is-ok"><i class="bi bi-check-circle-fill"></i> วันนี้ ${r.todayPlanned} คาบ · เช็คครบแล้ว</div>`
            : `<div class="pp5wm-today is-due"><i class="bi bi-alarm-fill"></i> วันนี้ ${r.todayPlanned} คาบ · เช็คแล้ว ${r.todayDone}</div>`)
            : '<div class="pp5wm-today"><i class="bi bi-moon-stars"></i> วันนี้ไม่มีคาบวิชานี้</div>';
      const late = r.owed ? `<div class="pp5wm-today is-none"><i class="bi bi-exclamation-triangle-fill"></i> ค้างเช็ค ${r.owed} คาบ (วันที่ผ่านมา)</div>` : '';
      const due = r.hasWeek && r.todayPlanned > (r.todayDone || 0);
      return `<article class="pp5wm-card${due ? ' is-due' : ''}" style="--s1:${start};--s2:${end}">
  <div class="pp5wm-card-top">
    <span class="pp5wm-icon"><i class="bi ${icon}"></i></span>
    <div class="pp5wm-title"><b>${esc(r.subject.name)}</b><small>${esc(r.subject.code || '')}${r.subject.semester ? ' · ภาค ' + esc(r.subject.semester) : ''}</small></div>
    <span class="pp5wm-room">${esc(r.grade + '/' + r.room)}</span>
  </div>
  ${today}${late}
  <div class="pp5wm-progress">
    <span class="pp5wm-ring ${tone}" style="--p:${pct}"><span>${r.scored == null ? '—' : pct + '%'}</span></span>
    <div class="pp5wm-facts">
      <div><small>คะแนนภาค ${esc(r.term)}</small><b>${scoreText}</b></div>
      <div><small>เช็คชื่อรายวิชา <button type="button" class="pp5wm-mini" data-pp5-btn-skip data-wm-go="subject_attendance_summary" data-grade="${esc(r.grade)}" data-room="${esc(r.room)}" data-subject="${esc(r.subject.id)}">ดูสรุป ›</button></small>${att}</div>
    </div>
  </div>
  <div class="pp5wm-actions">${nav('score_table_viewer', 'กรอกคะแนน', 'bi-pencil-square', 'is-main')}${nav('subject_attendance', 'เช็คชื่อ', 'bi-calendar2-check-fill', 'is-green')}${nav('characteristic_assessment', 'ประเมิน', 'bi-clipboard2-check', 'is-amber')}${nav('pp5_subject_book', 'ปพ.5', 'bi-printer-fill', 'is-violet')}</div>
</article>`;
    };
    const core = rows.filter((r) => subjectRank(r.subject.name) < 100);
    const acts = rows.filter((r) => subjectRank(r.subject.name) >= 100);
    const group = (title, icon, list) => list.length
      ? `<h4 class="pp5wm-group"><i class="bi ${icon}"></i> ${title} <span>${list.length}</span></h4><div class="pp5wm-grid">${list.map(card).join('')}</div>` : '';
    return head(stats) + group('รายวิชา', 'bi-mortarboard-fill', core) + group('กิจกรรมพัฒนาผู้เรียน', 'bi-stars', acts);
  }

  async function addTeachingPanel(hub) {
    if (hub.querySelector('#pp5TeachingPanel')) return;
    ensureStyle();
    const card = doc.createElement('section');
    card.id = 'pp5TeachingPanel';
    card.className = 'pp5wm-panel';
    card.innerHTML = '<div data-wm-body><p class="pp5wm-empty">กำลังอ่านงานสอน...</p></div>';
    const menu = hub.querySelector('#pp5HubMainMenu');
    if (menu) menu.after(card); else hub.appendChild(card);
    card.addEventListener('click', (event) => {
      const go = event.target.closest('[data-wm-go]');
      if (!go) return;
      global.GradeClassHelper?.saveSelection?.(go.dataset.grade, go.dataset.room);
      // หน้าเช็คชื่อรายวิชาเลือกชั้น/ห้อง/วิชาให้ตรงกับการ์ด (js/subject-attendance.js อ่านครั้งเดียวแล้วลบ)
      // ประเมินในวิชา: หน้าประเมินเดิม + แถบเลือกวิชา (js/subject-assessment.js อ่านครั้งเดียวแล้วลบ)
      if (go.dataset.wmGo === 'characteristic_assessment') {
        try { global.sessionStorage.setItem('pp5SubjectAssessmentTarget', JSON.stringify({ grade: go.dataset.grade, room: go.dataset.room, subjectId: go.dataset.subject })); } catch (_) { /* เลือกเองได้ */ }
      }
      if (go.dataset.wmGo === 'subject_attendance_summary') {
        try { global.sessionStorage.setItem('pp5SubjectSummaryTarget', JSON.stringify({ grade: go.dataset.grade, room: go.dataset.room, subjectId: go.dataset.subject })); } catch (_) { /* เลือกเองได้ */ }
      }
      if (go.dataset.wmGo === 'subject_attendance') {
        try { global.sessionStorage.setItem('pp5SubjectAttendanceTarget', JSON.stringify({ grade: go.dataset.grade, room: go.dataset.room, subjectId: go.dataset.subject })); } catch (_) { /* เลือกเองได้ */ }
      }
      if (typeof global.navigateTo === 'function') global.navigateTo(go.dataset.wmGo);
    });
    const body = card.querySelector('[data-wm-body]');
    try {
      body.innerHTML = panelHtml(await teachingRows(ctxCache), ctxCache.academicYear);
    } catch (error) {
      body.innerHTML = `<p class="pp5wm-empty">อ่านงานสอนไม่สำเร็จ: ${esc(error?.message || error)}</p>`;
    }
  }

  function adaptHome() {
    if (mode() !== 'subject') return;
    const frame = doc.getElementById('contentFrame');
    const hub = frame?.querySelector('.hub-page');
    if (!hub || !hub.querySelector('#pp5HubMainMenu')) return;
    adaptMainMenu(hub);
    addTeachingPanel(hub);
  }

  // ---- เรียกจาก PP5Permissions.refreshMenu() ทุกครั้งที่เปลี่ยนหน้า (ได้ context ล่าสุดมาด้วย)
  function apply(ctx) {
    ctxCache = ctx || ctxCache;
    // รู้ภาคเรียนก่อน จึงตัดสินโหมด/หน้าต่างเลือกงาน (ไม่ให้ถามเรื่องงานภาค 2 ระหว่างภาค 1)
    if (!semester && ctxCache?.enabled && ctxCache?.role === 'teacher' && global.PP5Data?.settings?.get) {
      if (!semesterLoading) {
        semesterLoading = global.PP5Data.settings.get()
          .then((settings) => { semester = Number(settings?.semester || settings?.currentSemester) === 2 ? 2 : 1; })
          .catch(() => { semester = 0; })
          .then(() => { global.PP5Permissions?.refreshMenu?.(); });
      }
      return;
    }
    const m = mode();
    if (m) doc.documentElement.dataset.pp5WorkMode = m;
    else delete doc.documentElement.dataset.pp5WorkMode;
    if (!m) return;
    ensureStyle();
    applyBadge();
    adaptHome();
    if (both() && !stored(ctxCache)) openChooser();
  }

  const STYLE = `
html[data-pp5-work-mode="subject"] #homeroomRoadmapWidget{display:none!important}
html[data-pp5-work-mode="subject"] #userRoomBadge{display:none!important}
.pp5wm-badge{cursor:pointer}
.pp5wm-overlay{position:fixed;inset:0;z-index:2000;display:grid;place-items:center;padding:16px;overflow:auto;
  background:rgba(15,23,42,.55);backdrop-filter:blur(4px)}
.pp5wm-dialog{--wm-card:#fff;--wm-soft:#f6f7fb;--wm-line:#e6e8f0;--wm-ink:#1f2340;--wm-muted:#5b6275;background:var(--wm-card);color:var(--wm-ink);
  border-radius:24px;max-width:720px;width:100%;overflow:hidden;box-shadow:0 30px 70px rgba(15,23,60,.35);animation:pp5wmIn .22s ease-out}
@keyframes pp5wmIn{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}
.pp5wm-dhead{position:relative;display:flex;align-items:center;gap:14px;padding:20px 22px;color:#fff;overflow:hidden;
  background:linear-gradient(120deg,#6d5dfc,#3b82f6 55%,#22c1c3)}
.pp5wm-dhead::after{content:"";position:absolute;right:-50px;top:-70px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,.13)}
.pp5wm-dicon{flex:none;width:56px;height:56px;border-radius:18px;display:grid;place-items:center;font-size:1.7rem;
  background:rgba(255,255,255,.22);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
.pp5wm-dhead small{font-size:.85rem;opacity:.92}.pp5wm-dhead h2{font-size:1.35rem;font-weight:800;margin:0;color:#fff}
.pp5wm-dhead p{margin:2px 0 0;font-size:.85rem;opacity:.92}
.pp5wm-close{position:absolute;top:12px;right:12px;z-index:1;width:36px;height:36px;border:0;border-radius:50%;color:#fff;
  background:rgba(255,255,255,.22);cursor:pointer}
.pp5wm-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;padding:20px 22px 8px}
.pp5wm-option{--o1:#ff77af;--o2:#8b35ef;position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:8px;text-align:left;
  padding:18px;border:2px solid var(--wm-line);border-radius:20px;background:var(--wm-card);color:inherit;cursor:pointer;overflow:hidden;
  box-shadow:0 6px 18px rgba(30,40,90,.07);transition:transform .15s,box-shadow .15s,border-color .15s}
.pp5wm-option.is-subject{--o1:#30b9ff;--o2:#0f9bb0}
.pp5wm-option::before{content:"";position:absolute;inset:0 0 auto 0;height:6px;background:linear-gradient(90deg,var(--o1),var(--o2))}
.pp5wm-option:hover,.pp5wm-option:focus-visible{transform:translateY(-3px);border-color:var(--o2);outline:none;
  box-shadow:0 16px 32px color-mix(in srgb,var(--o2) 25%,transparent)}
.pp5wm-option.is-current{border-color:var(--o2);background:color-mix(in srgb,var(--o1) 7%,var(--wm-card))}
.pp5wm-now{position:absolute;top:14px;right:14px;font-size:.75rem;font-weight:700;padding:3px 10px;border-radius:99px;color:#fff;
  background:linear-gradient(135deg,var(--o1),var(--o2))}
.pp5wm-oicon{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;color:#fff;font-size:1.7rem;
  background:linear-gradient(140deg,var(--o1),var(--o2));box-shadow:0 8px 18px color-mix(in srgb,var(--o2) 40%,transparent)}
.pp5wm-option b{font-size:1.2rem;font-weight:800}
.pp5wm-ometa{color:var(--o2);font-weight:700;font-size:.85rem}
.pp5wm-chips{display:flex;flex-wrap:wrap;gap:6px}
.pp5wm-chips span{font-size:.8rem;font-weight:700;padding:3px 10px;border-radius:99px;color:var(--o2);
  background:color-mix(in srgb,var(--o1) 16%,transparent)}
.pp5wm-tasks{display:grid;gap:5px;width:100%;padding:10px 12px;border-radius:14px;background:var(--wm-soft);font-size:.85rem}
.pp5wm-tasks span{display:flex;align-items:center;gap:8px}.pp5wm-tasks i{color:var(--o2)}
.pp5wm-ogo{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:4px;padding:10px;border-radius:14px;
  color:#fff;font-weight:700;background:linear-gradient(135deg,var(--o1),var(--o2));box-shadow:0 8px 16px color-mix(in srgb,var(--o2) 30%,transparent)}
.pp5wm-hint{display:flex;align-items:center;justify-content:center;gap:8px;margin:6px 22px 18px;color:var(--wm-muted);font-size:.85rem}
@media (max-width:576px){.pp5wm-dhead{padding:16px}.pp5wm-dhead h2{font-size:1.15rem}.pp5wm-options{padding:14px 14px 4px;gap:12px}}
[data-theme="dark"] .pp5wm-dialog{--wm-card:#1b2232;--wm-soft:#232c40;--wm-line:#2b3446;--wm-ink:#e6e9f2;--wm-muted:#a7afbd}
.pp5wm-panel{--wm-card:#fff;--wm-soft:#f6f7fb;--wm-line:#e6e8f0;--wm-ink:#1f2340;--wm-muted:#5b6275;--wm-accent:var(--primary,#4f46e5);
  background:var(--wm-card);color:var(--wm-ink);border:1px solid var(--wm-line);border-radius:22px;padding:0 0 18px;margin:18px 0;overflow:hidden;
  box-shadow:0 10px 30px rgba(40,50,120,.08)}
.pp5wm-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:18px 20px;color:#fff;
  background:linear-gradient(120deg,#6d5dfc,#3b82f6 55%,#22c1c3);position:relative;overflow:hidden}
.pp5wm-head::after{content:"";position:absolute;right:-40px;top:-60px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,.12)}
.pp5wm-head-icon{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;font-size:1.6rem;background:rgba(255,255,255,.22);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
.pp5wm-head-text{flex:1;min-width:180px}.pp5wm-head h3{font-size:1.3rem;font-weight:800;margin:0;color:#fff}
.pp5wm-head p{margin:2px 0 0;font-size:.88rem;opacity:.92}
.pp5wm-stats{display:flex;gap:8px;flex-wrap:wrap;position:relative;z-index:1}
.pp5wm-stats span{display:flex;flex-direction:column;align-items:center;min-width:74px;padding:6px 12px;border-radius:14px;
  background:rgba(255,255,255,.2);font-size:.75rem;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}
.pp5wm-stats b{font-size:1.25rem;line-height:1.2}.pp5wm-stats .is-done{background:rgba(255,255,255,.95);color:#0f766e}
.pp5wm-empty{color:var(--wm-muted);font-size:.9rem;margin:16px 20px 0}
.pp5wm-group{display:flex;align-items:center;gap:8px;font-size:1rem;font-weight:700;margin:18px 20px 10px;color:var(--wm-ink)}
.pp5wm-group i{color:var(--wm-accent)}
.pp5wm-group span{font-size:.75rem;font-weight:700;padding:1px 9px;border-radius:99px;background:var(--wm-soft);color:var(--wm-muted)}
.pp5wm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px;padding:0 20px}
.pp5wm-card{position:relative;display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:18px;background:var(--wm-card);
  border:1px solid var(--wm-line);box-shadow:0 4px 14px rgba(30,40,90,.06);overflow:hidden;transition:transform .15s,box-shadow .15s}
.pp5wm-card::before{content:"";position:absolute;inset:0 0 auto 0;height:5px;background:linear-gradient(90deg,var(--s1),var(--s2))}
.pp5wm-card:hover{transform:translateY(-2px);box-shadow:0 12px 26px rgba(30,40,90,.13)}
.pp5wm-card-top{display:flex;align-items:center;gap:12px}
.pp5wm-icon{flex:none;width:50px;height:50px;border-radius:15px;display:grid;place-items:center;color:#fff;font-size:1.45rem;
  background:linear-gradient(140deg,var(--s1),var(--s2));box-shadow:0 6px 14px color-mix(in srgb,var(--s2) 40%,transparent)}
.pp5wm-title{flex:1;min-width:0}.pp5wm-title b{display:block;font-size:1.05rem;line-height:1.3}
.pp5wm-title small{color:var(--wm-muted);font-size:.8rem}
.pp5wm-room{flex:none;font-weight:800;font-size:.9rem;padding:5px 12px;border-radius:99px;color:var(--s2);
  background:color-mix(in srgb,var(--s1) 18%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--s2) 30%,transparent)}
.pp5wm-progress{display:flex;align-items:center;gap:14px;padding:10px 12px;border-radius:14px;background:var(--wm-soft)}
.pp5wm-ring{--c:#f59e0b;flex:none;width:62px;height:62px;border-radius:50%;display:grid;place-items:center;
  background:conic-gradient(var(--c) calc(var(--p)*1%),#e3e6ef 0)}
.pp5wm-ring>span{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:var(--wm-soft);font-weight:800;font-size:.85rem}
.pp5wm-ring.is-full{--c:#10b981}.pp5wm-ring.is-zero{--c:#ef4444}.pp5wm-ring.is-none{--c:#9ca3af}
.pp5wm-facts{flex:1;display:grid;gap:6px;min-width:0}.pp5wm-facts small{display:block;color:var(--wm-muted);font-size:.75rem}
.pp5wm-facts b{font-size:1rem}
.pp5wm-chip{display:inline-flex;align-items:center;gap:4px;font-size:.8rem;font-weight:600;padding:2px 10px;border-radius:99px}
.pp5wm-chip.is-ok{background:#d1fae5;color:#047857}.pp5wm-chip.is-wait{background:#fef3c7;color:#b45309}.pp5wm-chip.is-none{background:#e5e7eb;color:#4b5563}
.pp5wm-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.pp5wm-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:12px;padding:9px 8px;font-weight:700;
  font-size:.88rem;cursor:pointer;transition:filter .15s,transform .15s}
.pp5wm-btn:hover{filter:brightness(1.06);transform:translateY(-1px)}.pp5wm-btn:focus-visible{outline:3px solid color-mix(in srgb,var(--wm-accent) 45%,transparent)}
.pp5wm-btn.is-main{color:#fff;background:linear-gradient(135deg,var(--s1),var(--s2));box-shadow:0 6px 14px color-mix(in srgb,var(--s2) 35%,transparent)}
.pp5wm-btn.is-green{color:#047857;background:#d1fae5}.pp5wm-btn.is-amber{color:#b45309;background:#fef3c7}.pp5wm-btn.is-violet{color:#6d28d9;background:#ede9fe}
.pp5wm-mini{border:0;background:none;padding:0 0 0 4px;color:var(--wm-accent);font-weight:700;font-size:.75rem;cursor:pointer}
.pp5wm-stats .is-owed{background:#fff;color:#b91c1c;box-shadow:0 0 0 2px #fca5a5}
.pp5wm-stats .is-today{background:#fff;color:#c2410c;box-shadow:0 0 0 2px #fdba74}
.pp5wm-schedule{position:relative;z-index:1;display:inline-flex;align-items:center;gap:6px;border:0;border-radius:12px;padding:8px 14px;font-weight:700;
  color:#3b3fd8;background:#fff;box-shadow:0 6px 14px rgba(0,0,0,.12)}
.pp5wm-schedule em{font-style:normal;font-size:.75rem;padding:1px 8px;border-radius:99px;background:#fee2e2;color:#b91c1c}
.pp5wm-today{display:flex;align-items:center;gap:6px;font-size:.85rem;font-weight:700;padding:7px 12px;border-radius:12px;
  background:var(--wm-soft);color:var(--wm-muted)}
.pp5wm-today.is-due{background:#ffedd5;color:#c2410c}.pp5wm-today.is-ok{background:#d1fae5;color:#047857}
.pp5wm-today.is-none{background:#fee2e2;color:#b91c1c}
.pp5wm-card.is-due{border-color:#fdba74;box-shadow:0 0 0 2px #fed7aa,0 8px 20px rgba(234,88,12,.15)}
[data-theme="dark"] .pp5wm-today.is-due{background:#3d2a12;color:#fdba74}[data-theme="dark"] .pp5wm-today.is-ok{background:#0f3d2e;color:#6ee7b7}
[data-theme="dark"] .pp5wm-today.is-none{background:#3d1717;color:#fca5a5}
@media (max-width:576px){.pp5wm-grid{grid-template-columns:1fr;padding:0 12px}.pp5wm-head{padding:16px 14px}.pp5wm-group{margin:16px 12px 8px}
  .pp5wm-stats{width:100%}.pp5wm-stats span{flex:1;min-width:0}}
[data-theme="dark"] .pp5wm-panel{--wm-card:#1b2232;--wm-soft:#232c40;--wm-line:#2b3446;--wm-ink:#e6e9f2;--wm-muted:#a7afbd}
[data-theme="dark"] .pp5wm-chip.is-ok,[data-theme="dark"] .pp5wm-btn.is-green{background:#0f3d2e;color:#6ee7b7}
[data-theme="dark"] .pp5wm-chip.is-wait{background:#3d2f0f;color:#fcd34d}
[data-theme="dark"] .pp5wm-btn.is-violet{background:#2e2350;color:#c4b5fd}
[data-theme="dark"] .pp5wm-btn.is-amber{background:#3d2f0f;color:#fcd34d}
[data-theme="dark"] .pp5wm-ring{background:conic-gradient(var(--c) calc(var(--p)*1%),#34405a 0)}
`;
  function ensureStyle() {
    if (doc.getElementById('pp5WorkModeStyle')) return;
    const style = doc.createElement('style');
    style.id = 'pp5WorkModeStyle';
    style.textContent = STYLE;
    doc.head.appendChild(style);
  }

  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5WorkMode || typeof global.MutationObserver !== 'function') return;
    frame.__pp5WorkMode = true;
    let pending = false;
    new global.MutationObserver(() => {
      if (pending) return;
      pending = true;
      Promise.resolve().then(() => { pending = false; adaptHome(); });
    }).observe(frame, { childList: true, subtree: true });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();

  const setSemester = (n) => { semester = Number(n) || 0; };
  global.PP5WorkMode = { mode, both, keeps, filter, label, apply, choose, forget, openChooser, teachingRows, panelHtml, subjectRank, setSemester, inSemester };
})(window);
