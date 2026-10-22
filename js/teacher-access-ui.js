// หน้า "มอบหมายงานครู" (teacher_access) แบบใหม่ (owner 2026-10-14: "ตอนนี้มีเรื่องสิทธิ์เพิ่มมาเยอะ (เช็คชื่อรายชั่วโมง
// ปพ.5 แบบรายวิชา) ... ขอหน้านี้ให้จัดง่ายๆหน่อย")
//   ซ้าย = รายชื่อครู + ป้ายสรุปงาน (เตือนคนที่ยังไม่มีงาน) · ขวา = งานของครูที่เลือก:
//   ครูประจำชั้น = กดเลือกห้อง · ครูประจำวิชา = เลือกห้องแล้วติ๊กได้หลายวิชาพร้อมกัน · แถบบันทึกติดด้านล่าง
// บันทึกด้วย PP5Permissions.replace (pp5_replace_teacher_access — ฐานข้อมูลตรวจสิทธิ์ผู้ดูแลและความถูกต้องเอง)
// เปิดใช้สิทธิ์ด้วย PP5Permissions.enable เหมือนเดิม  แทนหน้าเดิมใน js/teacher-permissions.js (shell/mount เดิมยังอยู่ไม่ได้ใช้)
(function initTeacherAccessUi(global) {
  'use strict';
  const doc = global.document;
  const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const esc = (v) => text(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const GRADE_ORDER = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3'];
  const ASSIGNABLE = /^(ป\.[1-6]|ม\.[1-3])$/;
  const FLASH_MS = 2500; // "บันทึกแล้ว" ค้างให้เห็นก่อนแถบล่างหาย
  const ORDER = ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์', 'เทคโนโลยี', 'สังคมศึกษา', 'ประวัติศาสตร์', 'สุขศึกษา', 'ศิลปะ', 'การงาน', 'ภาษาอังกฤษ', 'หน้าที่พลเมือง', 'การป้องกัน'];
  const subjectRank = (name) => { let r = 99; ORDER.forEach((w, i) => { if (text(name).includes(w)) r = i; }); return r; };
  const roomKey = (grade, room) => `${grade}/${room}`;
  const roomSort = (a, b) => {
    const [ga, ra] = a.split('/');
    const [gb, rb] = b.split('/');
    return (GRADE_ORDER.indexOf(ga) - GRADE_ORDER.indexOf(gb)) || ra.localeCompare(rb, 'th', { numeric: true });
  };

  const STYLE = `
.ta{--t-line:#dfe6f1;--t-card:#fff;--t-soft:#f5f7fc;--t-text:#1e2a4a;--t-muted:#56627a;--t-accent:var(--primary,#4f46e5);
  --t-ok:#13795b;--t-ok-bg:#e6f6ef;--t-warn:#a15c00;--t-warn-bg:#fff4e0;color:var(--t-text);padding-bottom:90px}
[data-theme="dark"] .ta{--t-line:#2b3446;--t-card:#1b2232;--t-soft:#161d2b;--t-text:#e5e7eb;--t-muted:#a7afbd;
  --t-ok:#6fe0b4;--t-ok-bg:rgba(111,224,180,.12);--t-warn:#ffc46b;--t-warn-bg:rgba(255,196,107,.12)}
.ta-title{display:none}
.ta-card{background:var(--t-card);border:1px solid var(--t-line);border-radius:16px;padding:16px 18px}
.ta-status{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;margin-bottom:14px}
.ta-pill{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:.88rem;padding:.3rem .8rem;border-radius:999px}
.ta-pill.on{background:var(--t-ok-bg);color:var(--t-ok)} .ta-pill.off{background:var(--t-warn-bg);color:var(--t-warn)}
.ta-stat{font-size:.92rem;color:var(--t-muted)} .ta-stat b{color:var(--t-text);font-size:1.05rem}
.ta-status select{width:auto;min-width:130px}
.ta-grid{display:grid;grid-template-columns:minmax(240px,320px) minmax(0,1fr);gap:14px;align-items:start}
.ta-list{max-height:calc(100vh - 260px);overflow:auto;padding:10px}
.ta-search{margin-bottom:8px}
.ta-filter{display:flex;gap:6px;margin-bottom:8px}
.ta-filter button{flex:1;border:1px solid var(--t-line);background:transparent;border-radius:999px;font-size:.82rem;padding:.25rem .5rem;color:var(--t-muted);font-weight:600}
.ta-filter button[aria-pressed="true"]{background:color-mix(in srgb,var(--t-accent) 12%,transparent);color:var(--t-accent);border-color:transparent}
.ta-teacher{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;border:0;background:transparent;border-radius:12px;padding:9px 10px;color:var(--t-text)}
.ta-teacher:hover{background:var(--t-soft)}
.ta-teacher.is-on{background:color-mix(in srgb,var(--t-accent) 10%,transparent)}
.ta-avatar{flex:none;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-weight:700;background:color-mix(in srgb,var(--t-accent) 14%,transparent);color:var(--t-accent)}
.ta-teacher b{display:block;font-size:.95rem;line-height:1.3}
.ta-teacher small{display:block;color:var(--t-muted);font-size:.78rem}
.ta-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.ta-chip{font-size:.72rem;font-weight:600;padding:.08rem .45rem;border-radius:999px;background:var(--t-soft);color:var(--t-muted)}
.ta-chip.home{background:color-mix(in srgb,#0ea5e9 14%,transparent);color:#0369a1}
.ta-chip.subj{background:color-mix(in srgb,#10b981 14%,transparent);color:#047857}
.ta-chip.none{background:var(--t-warn-bg);color:var(--t-warn)}
[data-theme="dark"] .ta-chip.home{color:#7dd3fc} [data-theme="dark"] .ta-chip.subj{color:#6ee7b7}
.ta-editor{display:grid;gap:14px}
.ta-who{display:flex;gap:12px;align-items:center}
.ta-who .ta-avatar{width:46px;height:46px;font-size:1.1rem}
.ta-who h3{margin:0;font-size:1.15rem;font-weight:700}
.ta-who p{margin:0;color:var(--t-muted);font-size:.86rem}
.ta-sec-head{display:flex;gap:10px;align-items:center;margin-bottom:6px}
.ta-ico{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-size:1.2rem}
.ta-sec-head h4{margin:0;font-size:1.02rem;font-weight:700}
.ta-sec-head p{margin:0;font-size:.84rem;color:var(--t-muted)}
.ta-rooms{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.ta-room{border:1.5px solid var(--t-line);background:var(--t-card);border-radius:10px;padding:.35rem .8rem;font-weight:600;color:var(--t-text);min-width:64px}
.ta-room[aria-pressed="true"]{background:color-mix(in srgb,#0ea5e9 14%,var(--t-card));border-color:#0ea5e9;color:#0369a1}
[data-theme="dark"] .ta-room[aria-pressed="true"]{color:#7dd3fc}
.ta-room small{display:block;font-size:.7rem;font-weight:500;color:var(--t-muted)}
.ta-subj-room{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
.ta-subj-room select{width:auto;min-width:140px}
.ta-subjects{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px}
.ta-subj-item{border:1.5px solid var(--t-line);border-radius:10px;padding:.45rem .6rem}
.ta-subj-item:has(input:checked){border-color:#10b981;background:color-mix(in srgb,#10b981 8%,var(--t-card))}
.ta-subject{display:flex;gap:8px;align-items:center;cursor:pointer;margin:0}
.ta-subject input{accent-color:#10b981;width:1.05rem;height:1.05rem;flex:none}
.ta-sem{display:flex;gap:4px;margin:6px 0 0 1.6rem}
.ta-sem button{border:1px solid var(--t-line);background:var(--t-card);color:var(--t-muted);border-radius:999px;font-size:.75rem;font-weight:700;padding:.1rem .6rem}
.ta-sem button[aria-pressed="true"]{background:#10b981;border-color:#10b981;color:#fff}
.ta-others{display:block;margin:4px 0 0 1.6rem;font-size:.72rem;color:var(--t-warn)}
.ta-subject code{font-size:.75rem;color:var(--t-muted)}
.ta-subject small{display:block;font-size:.72rem;color:var(--t-muted)}
.ta-summary{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.ta-summary .ta-chip{font-size:.8rem;padding:.2rem .6rem;display:inline-flex;gap:4px;align-items:center}
.ta-summary button{border:0;background:transparent;color:inherit;padding:0 0 0 2px;line-height:1}
.ta-empty{color:var(--t-muted);font-size:.88rem;padding:6px 0}
.ta-bar{position:sticky;bottom:0;z-index:20;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-top:14px;
  background:var(--t-card);border:1px solid var(--t-line);border-radius:16px;padding:10px 16px;box-shadow:0 -6px 18px rgba(15,23,42,.08)}
.ta-dirty{display:flex;align-items:center;gap:8px;font-weight:600;font-size:.95rem;color:var(--t-muted)}
.ta-dirty::before{content:"";width:10px;height:10px;border-radius:50%;background:#22c55e}
.ta-bar.is-dirty .ta-dirty{color:#b45309} .ta-bar.is-dirty .ta-dirty::before{background:#f59e0b}
.ta-bar.is-err .ta-dirty{color:#c2362b} .ta-bar.is-err .ta-dirty::before{background:#ef4444}
.ta-save{border:0;border-radius:10px;padding:.55rem 1.3rem;font-weight:700;background:var(--t-accent);color:#fff;white-space:nowrap}
.ta-save:disabled{opacity:.55}
.ta-enable summary{cursor:pointer;font-weight:700}
@media (max-width:860px){.ta-grid{grid-template-columns:minmax(0,1fr)}.ta-list{max-height:320px}}`;

  function shell() {
    return `<div class="ta" id="pp5TeacherAccess"><style>${STYLE}</style><h4 class="ta-title">มอบหมายงานครู</h4>
<div data-body><div class="ta-card">กำลังอ่านข้อมูล…</div></div></div>`;
  }

  async function allRows(table, order) {
    const rows = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await global.PP5Data.client.from(table).select('*').order(order).range(start, start + 999);
      if (error) throw new Error(error.message);
      rows.push(...(data || []));
      if ((data || []).length < 1000) return rows;
    }
  }

  async function mount(root, keep = {}) {
    const body = root.querySelector('[data-body]');
    const perms = global.PP5Permissions;
    let ctx;
    try {
      ctx = await perms.context();
      if (ctx.role !== 'admin') throw new Error('หน้านี้สำหรับผู้ดูแลระบบ');
      if (!ctx.installed) throw new Error('กรุณาติดตั้ง SQL สิทธิ์ครู (202610110027) ในฐานข้อมูลของโรงเรียนก่อน');
    } catch (error) { body.innerHTML = `<div class="ta-card text-danger">${esc(error.message)}</div>`; return; }
    const [profiles, subjects, assignments, rosters, years, students] = await Promise.all([
      allRows('user_profiles', 'username'), allRows('subjects', 'id'), allRows('teacher_access_assignments', 'id'),
      allRows('student_year_rosters', 'student_id'), allRows('academic_years', 'academic_year'), allRows('students', 'id')
    ]);
    const year = keep.year || ctx.academicYear;
    const teachers = profiles.filter((p) => p.role === 'teacher' && p.active)
      .sort((a, b) => text(a.display_name || a.username).localeCompare(text(b.display_name || b.username), 'th'));
    const rooms = [...new Set([...rosters, ...students].filter((s) => text(s.academic_year) === year && ASSIGNABLE.test(text(s.grade)))
      .map((s) => roomKey(text(s.grade), text(s.room || '1'))))].sort(roomSort);
    const yearRows = assignments.filter((a) => a.active && text(a.academic_year) === year);
    const jobsOf = (id) => yearRows.filter((a) => a.user_id === id).map(({ scope, grade, room, subject_id, semester }) => ({ scope, grade, room, subject_id: subject_id || null, semester: Number(semester) || 0 }));
    const subjectById = new Map(subjects.map((s) => [text(s.id), s]));
    const subjectsOf = (grade) => subjects.filter((s) => s.grade === grade && s.active !== false)
      .sort((a, b) => subjectRank(a.name) - subjectRank(b.name) || text(a.name).localeCompare(text(b.name), 'th'));
    const homeroomOf = new Map();
    yearRows.filter((a) => a.scope === 'homeroom').forEach((a) => {
      const key = roomKey(a.grade, a.room);
      const p = profiles.find((x) => x.id === a.user_id);
      homeroomOf.set(key, [...(homeroomOf.get(key) || []), text(p?.display_name || p?.username)]);
    });
    // ใครสอนวิชานี้ในห้องนี้อยู่แล้ว (owner 2026-10-15: ยกวิชาให้ครูรายวิชาเฉพาะภาค 2 — ต้องเห็นว่าภาค 1 เป็นของใคร)
    const subjectTeachersOf = new Map();
    yearRows.filter((a) => a.scope === 'subject').forEach((a) => {
      const key = `${text(a.subject_id)}|${roomKey(a.grade, a.room)}`;
      const p = profiles.find((x) => x.id === a.user_id);
      subjectTeachersOf.set(key, [...(subjectTeachersOf.get(key) || []), { id: a.user_id, name: text(p?.display_name || p?.username), semester: Number(a.semester) || 0 }]);
    });
    const semText = (n) => (n ? `ภาค ${n}` : 'ทั้งปี');
    // มาจากปุ่ม "มอบหมายงาน" ในหน้าจัดการผู้ใช้ (js/admin-users-ui.js): เลือกครูคนนั้นไว้ให้
    let handoff = '';
    try { handoff = global.sessionStorage.getItem('pp5TeacherAccessSelect') || ''; global.sessionStorage.removeItem('pp5TeacherAccessSelect'); } catch (_) { handoff = ''; }
    const state = { selected: keep.selected || handoff || '', jobs: [], dirty: false, filter: keep.filter || 'all', query: '', subjRoom: keep.subjRoom || rooms[0] || '' };
    const missing = teachers.filter((t) => !jobsOf(t.id).length);

    const chipsFor = (jobs) => {
      if (!jobs.length) return '<span class="ta-chip none">ยังไม่มีงาน</span>';
      const home = jobs.filter((j) => j.scope === 'homeroom').map((j) => `<span class="ta-chip home">ประจำชั้น ${esc(roomKey(j.grade, j.room))}</span>`);
      const subj = jobs.filter((j) => j.scope === 'subject');
      return home.join('') + (subj.length ? `<span class="ta-chip subj">สอน ${subj.length} วิชา</span>` : '');
    };
    body.innerHTML = `<div class="ta-card ta-status">
  <span class="ta-pill ${ctx.enabled ? 'on' : 'off'}"><i class="bi ${ctx.enabled ? 'bi-shield-check' : 'bi-shield-exclamation'}"></i>${ctx.enabled ? 'เปิดใช้สิทธิ์ตามการมอบหมายแล้ว' : 'ยังไม่เปิดใช้สิทธิ์ (ครูทุกคนเห็นทุกห้อง)'}</span>
  <label class="d-flex align-items-center gap-2 mb-0">ปีการศึกษา <select class="form-select form-select-sm" data-year>${years.map((y) => `<option value="${esc(y.academic_year)}"${text(y.academic_year) === year ? ' selected' : ''}>${esc(y.academic_year)}${y.is_locked ? ' (ปิดปีแล้ว)' : ''}</option>`).join('') || `<option>${esc(year)}</option>`}</select></label>
  <span class="ta-stat">ครู <b>${teachers.length}</b> คน · มีงานแล้ว <b>${teachers.length - missing.length}</b> · ยังไม่มีงาน <b style="color:var(--t-warn)">${missing.length}</b></span>
</div>
<div class="ta-grid">
  <div class="ta-card ta-list">
    <input class="form-control ta-search" type="search" placeholder="ค้นหาชื่อครู" data-search>
    <div class="ta-filter"><button type="button" data-pp5-btn-skip data-filter="all">ทั้งหมด</button><button type="button" data-pp5-btn-skip data-filter="none">ยังไม่มีงาน (${missing.length})</button></div>
    <div data-teachers></div>
  </div>
  <div data-editor></div>
</div>
<div class="ta-bar" data-bar hidden><span class="ta-dirty" data-dirty></span>
  <span class="d-flex gap-2"><button type="button" class="btn btn-outline-secondary" data-cancel data-pp5-btn-skip>ยกเลิก</button>
  <button type="button" class="ta-save" data-save data-pp5-btn-skip><i class="bi bi-check-lg"></i> บันทึกงานของครูคนนี้</button></span></div>
${ctx.enabled ? '' : `<details class="ta-card ta-enable mt-3"><summary><i class="bi bi-shield-lock"></i> เปิดใช้สิทธิ์ตามการมอบหมาย (ทำครั้งเดียวเมื่อมอบหมายครบ)</summary>
  <p class="mt-2 mb-2">เมื่อเปิดแล้ว ครูจะเห็นเฉพาะห้องและวิชาที่ได้รับมอบหมาย · ตอนนี้ยังมีครูที่ไม่มีงาน ${missing.length} คน</p>
  <label class="d-block">พิมพ์ <b>ENABLE_TEACHER_SCOPE</b> เพื่อยืนยัน<input class="form-control mt-1" data-confirm autocomplete="off"></label>
  <button class="btn btn-warning mt-2" type="button" data-enable data-pp5-btn-skip>เปิดใช้สิทธิ์ตามการมอบหมาย</button> <span data-enable-say></span></details>`}`;

    const $ = (sel) => body.querySelector(sel);
    const bar = $('[data-bar]');
    // แถบล่างขึ้นเฉพาะตอนมีที่แก้ยังไม่บันทึก / กำลังบันทึก / บันทึกไม่สำเร็จ (owner 2026-10-22: "มอบหมายงานแล้ว
    // ทำไมปุ่มไม่หายไป" — เดิมขึ้นค้างพร้อมปุ่มจางตลอดที่เลือกครู)  บันทึกสำเร็จ: ขึ้น "บันทึกแล้ว" สั้น ๆ แล้วหาย (FLASH_MS)
    const setDirty = (dirty, message, kind) => {
      state.dirty = dirty;
      bar.hidden = !dirty || !state.selected;
      bar.classList.toggle('is-dirty', dirty && !kind);
      bar.classList.toggle('is-err', kind === 'err');
      $('[data-dirty]').textContent = message || (dirty ? 'มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก' : 'งานของครูคนนี้เป็นปัจจุบัน');
      $('[data-save]').disabled = !dirty;
      $('[data-cancel]').disabled = !dirty;
    };

    function renderList() {
      const q = state.query.toLowerCase();
      const list = teachers.filter((t) => (state.filter === 'all' || !jobsOf(t.id).length)
        && (!q || text(t.display_name).toLowerCase().includes(q) || text(t.username).toLowerCase().includes(q)));
      body.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter)));
      $('[data-teachers]').innerHTML = list.length ? list.map((t) => {
        const name = text(t.display_name || t.username);
        return `<button type="button" class="ta-teacher${t.id === state.selected ? ' is-on' : ''}" data-pp5-btn-skip data-teacher="${esc(t.id)}">
  <span class="ta-avatar">${esc(name.replace(/^(นาย|นางสาว|นาง|ครู)/, '').replace(/^[เแโใไ]/, '').slice(0, 1) || '?')}</span>
  <span><b>${esc(name)}</b><small>@${esc(t.username)}</small><span class="ta-chips">${chipsFor(t.id === state.selected ? state.jobs : jobsOf(t.id))}</span></span></button>`;
      }).join('') : '<div class="ta-empty">ไม่พบครู</div>';
    }

    function renderEditor() {
      const box = $('[data-editor]');
      const teacher = teachers.find((t) => t.id === state.selected);
      if (!teacher) { box.innerHTML = '<div class="ta-card ta-empty"><i class="bi bi-arrow-left"></i> เลือกครูจากรายชื่อด้านซ้าย</div>'; bar.hidden = true; return; }
      bar.hidden = !state.dirty;
      const name = text(teacher.display_name || teacher.username);
      const homeRooms = new Set(state.jobs.filter((j) => j.scope === 'homeroom').map((j) => roomKey(j.grade, j.room)));
      const subjJobs = state.jobs.filter((j) => j.scope === 'subject');
      const [g, r] = state.subjRoom.split('/');
      const roomSubjects = g ? subjectsOf(g) : [];
      box.innerHTML = `<div class="ta-editor">
  <div class="ta-card ta-who"><span class="ta-avatar">${esc(name.replace(/^(นาย|นางสาว|นาง|ครู)/, '').replace(/^[เแโใไ]/, '').slice(0, 1) || '?')}</span>
    <div><h3>${esc(name)}</h3><p>@${esc(teacher.username)} · ปีการศึกษา ${esc(year)}</p></div></div>
  <section class="ta-card">
    <div class="ta-sec-head"><span class="ta-ico" style="background:color-mix(in srgb,#0ea5e9 14%,transparent);color:#0284c7"><i class="bi bi-house-heart"></i></span>
      <div><h4>ครูประจำชั้น</h4><p>ดูแลนักเรียนทั้งห้อง: เช็คชื่อรายวัน ประเมินผล ปพ.5 / ปพ.6 และเช็คชื่อรายชั่วโมงได้ทุกวิชาของห้อง</p></div></div>
    <div class="ta-rooms">${rooms.length ? rooms.map((key) => {
      const others = (homeroomOf.get(key) || []).filter((n) => n !== name);
      return `<button type="button" class="ta-room" data-pp5-btn-skip data-home="${esc(key)}" aria-pressed="${homeRooms.has(key)}">${esc(key)}${others.length ? `<small>${esc(others.join(', '))}</small>` : ''}</button>`;
    }).join('') : '<span class="ta-empty">ยังไม่มีห้องในปีนี้ (นำเข้ารายชื่อนักเรียนก่อน)</span>'}</div>
  </section>
  <section class="ta-card">
    <div class="ta-sec-head"><span class="ta-ico" style="background:color-mix(in srgb,#10b981 14%,transparent);color:#059669"><i class="bi bi-book"></i></span>
      <div><h4>ครูประจำวิชา</h4><p>กรอกคะแนน เช็คชื่อรายชั่วโมง และพิมพ์ ปพ.5 แบบรายวิชา เฉพาะวิชาและห้องที่สอน</p></div></div>
    <div class="ta-subj-room"><span>ห้องที่สอน</span><select class="form-select form-select-sm" data-subj-room>${rooms.map((key) => `<option value="${esc(key)}"${key === state.subjRoom ? ' selected' : ''}>${esc(key)}</option>`).join('')}</select>
      <span class="ta-empty">ติ๊กวิชาที่ครูคนนี้สอนในห้องนี้ (เลือกได้หลายวิชา)</span></div>
    <div class="ta-subjects">${roomSubjects.length ? roomSubjects.map((s) => {
      const job = subjJobs.find((j) => j.subject_id === s.id && roomKey(j.grade, j.room) === state.subjRoom);
      // วิชาทั้งปีเลือกได้ว่าสอนทั้งปี / ภาค 1 / ภาค 2 (วิชาที่ผูกภาคไว้แล้ว เช่น ม.ต้น ใช้ภาคของวิชา)
      const sems = job && !Number(s.semester) ? `<div class="ta-sem" role="group" aria-label="สอนภาคเรียน">${[0, 1, 2].map((n) =>
        `<button type="button" data-pp5-btn-skip data-sem-subject="${esc(s.id)}" data-sem="${n}" aria-pressed="${Number(job.semester) === n}">${semText(n)}</button>`).join('')}</div>` : '';
      const others = (subjectTeachersOf.get(`${s.id}|${state.subjRoom}`) || []).filter((o) => o.id !== state.selected);
      return `<div class="ta-subj-item"><label class="ta-subject"><input type="checkbox" data-subject="${esc(s.id)}"${job ? ' checked' : ''}>
  <span>${esc(s.name)} <code>${esc(s.code || '')}</code>${Number(s.semester) ? `<small>ภาคเรียนที่ ${esc(s.semester)}</small>` : ''}</span></label>${sems}
  ${others.length ? `<small class="ta-others"><i class="bi bi-people"></i> ครูผู้สอนอีกคน: ${others.map((o) => `${esc(o.name)} (${semText(o.semester)})`).join(', ')}</small>` : ''}</div>`;
    }).join('') : '<span class="ta-empty">ห้องนี้ยังไม่มีรายวิชา</span>'}</div>
    <div class="ta-summary">${subjJobs.length ? subjJobs.map((j, i) => `<span class="ta-chip subj">${esc(roomKey(j.grade, j.room))} · ${esc(subjectById.get(text(j.subject_id))?.name || j.subject_id)}${j.semester ? ` · ภาค ${j.semester}` : ''}<button type="button" data-pp5-btn-skip data-drop="${i}" aria-label="เอาออก">×</button></span>`).join('') : '<span class="ta-empty">ยังไม่ได้สอนวิชาใด</span>'}</div>
  </section>
</div>`;
    }

    const selectTeacher = (id) => {
      if (state.dirty && id !== state.selected && !global.confirm('งานของครูคนก่อนยังไม่ได้บันทึก ต้องการเปลี่ยนครูโดยไม่บันทึกใช่ไหม?')) return;
      state.selected = id;
      state.jobs = jobsOf(id);
      setDirty(false);
      renderList();
      renderEditor();
    };

    body.addEventListener('click', async (event) => {
      const t = event.target.closest('[data-teacher]');
      if (t) { selectTeacher(t.dataset.teacher); return; }
      const f = event.target.closest('[data-filter]');
      if (f) { state.filter = f.dataset.filter; renderList(); return; }
      const home = event.target.closest('[data-home]');
      if (home) {
        const [grade, room] = home.dataset.home.split('/');
        const idx = state.jobs.findIndex((j) => j.scope === 'homeroom' && j.grade === grade && j.room === room);
        if (idx >= 0) state.jobs.splice(idx, 1); else state.jobs.push({ scope: 'homeroom', grade, room, subject_id: null, semester: 0 });
        setDirty(true); renderEditor(); renderList(); return;
      }
      const sem = event.target.closest('[data-sem-subject]');
      if (sem) {
        const [grade, room] = state.subjRoom.split('/');
        const job = state.jobs.find((j) => j.scope === 'subject' && j.subject_id === sem.dataset.semSubject && j.grade === grade && j.room === room);
        if (job) { job.semester = Number(sem.dataset.sem) || 0; setDirty(true); renderEditor(); renderList(); }
        return;
      }
      const drop = event.target.closest('[data-drop]');
      if (drop) {
        const subj = state.jobs.filter((j) => j.scope === 'subject');
        state.jobs = state.jobs.filter((j) => j !== subj[Number(drop.dataset.drop)]);
        setDirty(true); renderEditor(); renderList(); return;
      }
      if (event.target.closest('[data-cancel]')) { state.jobs = jobsOf(state.selected); setDirty(false); renderEditor(); renderList(); return; }
      if (event.target.closest('[data-save]')) {
        const button = $('[data-save]');
        button.disabled = true;
        setDirty(true, 'กำลังบันทึก…');
        try {
          await perms.replace(state.selected, year, state.jobs);
          await mount(root, { year, selected: state.selected, filter: state.filter, subjRoom: state.subjRoom });
          // หน้าวาดใหม่แล้ว (แถบใหม่ซ่อนอยู่): โชว์ "บันทึกแล้ว" สั้น ๆ แล้วซ่อน เว้นแต่ครูเริ่มแก้ต่อ
          const freshBar = root.querySelector('[data-bar]');
          const fresh = root.querySelector('[data-dirty]');
          if (freshBar && fresh) {
            fresh.textContent = 'บันทึกแล้ว — งานของครูคนนี้เป็นปัจจุบัน';
            freshBar.hidden = false;
            global.setTimeout(() => {
              if (!freshBar.classList.contains('is-dirty') && !freshBar.classList.contains('is-err')) freshBar.hidden = true;
            }, FLASH_MS);
          }
        } catch (error) {
          setDirty(true, `บันทึกไม่สำเร็จ: ${error?.message || error}`, 'err');
          button.disabled = false;
        }
        return;
      }
      if (event.target.closest('[data-enable]')) {
        const say = $('[data-enable-say]');
        try { await perms.enable($('[data-confirm]').value); global.location.reload(); }
        catch (error) { if (say) say.textContent = error?.message || String(error); }
      }
    });
    body.addEventListener('change', (event) => {
      if (event.target.matches('[data-year]')) {
        if (state.dirty && !global.confirm('งานที่แก้ยังไม่ได้บันทึก ต้องการเปลี่ยนปีใช่ไหม?')) { event.target.value = year; return; }
        mount(root, { year: event.target.value });
        return;
      }
      if (event.target.matches('[data-subj-room]')) { state.subjRoom = event.target.value; renderEditor(); return; }
      const box = event.target.closest('[data-subject]');
      if (box) {
        const [grade, room] = state.subjRoom.split('/');
        const subject = subjectById.get(box.dataset.subject);
        const same = (j) => j.scope === 'subject' && j.subject_id === box.dataset.subject && j.grade === grade && j.room === room;
        if (box.checked) {
          if (!state.jobs.some(same)) state.jobs.push({ scope: 'subject', grade, room, subject_id: box.dataset.subject, semester: Number(subject?.semester) || 0 });
        } else state.jobs = state.jobs.filter((j) => !same(j));
        setDirty(true); renderEditor(); renderList();
      }
    });
    body.addEventListener('input', (event) => { if (event.target.matches('[data-search]')) { state.query = event.target.value.trim(); renderList(); } });

    renderList();
    if (state.selected && teachers.some((t) => t.id === state.selected)) { state.jobs = jobsOf(state.selected); renderList(); renderEditor(); setDirty(false); }
    else renderEditor();
  }

  if (global.PP5PageBanner?.PAGES && !global.PP5PageBanner.PAGES.teacher_access) {
    global.PP5PageBanner.PAGES.teacher_access = {
      icon: 'bi-person-check', title: 'มอบหมายงานครู',
      sub: 'ครูแต่ละคนเป็นครูประจำชั้นห้องไหน และสอนวิชาอะไร', hide: '.ta > .ta-title'
    };
  }
  function apply() {
    const root = doc.getElementById('pp5TeacherAccess');
    if (root && !root.__pp5Mounted) {
      root.__pp5Mounted = true;
      mount(root).catch((error) => { const b = root.querySelector('[data-body]'); if (b) b.innerHTML = `<div class="ta-card text-danger">${esc(error?.message || error)}</div>`; });
    }
  }
  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5TeacherAccess) return;
    frame.__pp5TeacherAccess = true;
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(apply).observe(frame, { childList: true, subtree: true });
    apply();
  }
  global.GAS_PAGES = global.GAS_PAGES || {};
  global.GAS_PAGES.teacher_access = shell();
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
  global.PP5TeacherAccessUi = { shell, mount, roomSort };
})(window);
