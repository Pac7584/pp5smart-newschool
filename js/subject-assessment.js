// ประเมินรายวิชา (owner 2026-10-15: "ให้ครูประจำวิชาประเมินคุณลักษณะ อ่านคิดเขียน และสมรรถนะในวิชาตัวเอง")
// เจ้าของเลือก: ประเมินเต็มทุกข้อ (คุณลักษณะ 8 · อ่านคิดเขียน 5 · สมรรถนะ 25) รายภาค · ผลทางการของนักเรียนเป็นของครูประจำชั้น
// โดยระบบเสนอค่าเฉลี่ยจากครูรายวิชาเป็นค่าตั้งต้น
// owner 2026-10-16: "รูปแบบและฟีเจอร์การประเมินน่าจะเอามาจากระบบที่มีอยู่แล้ว" -> ไม่มีหน้าประเมินใหม่ ใช้หน้าเดิม 3 หน้า
//   แถบ "ประเมินในฐานะ" บนหน้า characteristic_assessment / rtw5_assessment / competency_assessment
//     เลือกวิชา · ห้อง · ภาค -> ตั้ง window.PP5AssessmentSubject แล้ว gas-bridge loadAssessment/saveAssessment
//     อ่าน/เขียน assessments.subj_char|subj_rtw|subj_comp, criteria_code = '<subject id>|c1' (SQL 202610150034)
//   หน้า subject_assessment_summary  ครูประจำชั้นดูค่าเฉลี่ยจากทุกวิชา (ทั้งสองภาค) แล้ว "ใช้เป็นผลประจำชั้น"
//     -> characteristic|rtw|competency ภาค 1 (ผลประจำชั้นเป็นรายปี: หน้าเดิมอ่าน/เขียนภาค 1 เสมอ)
(function initSubjectAssessment(global) {
  'use strict';
  const doc = global.document;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const client = () => global.PP5Data?.client;
  const COMP_GROUPS = ['การสื่อสาร', 'การคิด', 'การแก้ปัญหา', 'การใช้ทักษะชีวิต', 'การใช้เทคโนโลยี'];
  const COMP_ITEMS = ['รับ-ส่งสาร', 'ถ่ายทอด', 'วิธีการ', 'เจรจา', 'เลือกรับ', 'วิเคราะห์', 'สร้างสรรค์', 'วิจารณญาณ', 'สร้างความรู้', 'ตัดสินใจ',
    'แก้ปัญหา', 'ใช้เหตุผล', 'เข้าใจสังคม', 'แสวงหาความรู้', 'ตัดสินใจ', 'เรียนรู้ตนเอง', 'ทำงานกลุ่ม', 'นำไปใช้', 'จัดการปัญหา', 'หลีกเลี่ยง',
    'เลือกใช้', 'ทักษะกระบวนการ', 'พัฒนาตนเอง', 'แก้ปัญหา', 'คุณธรรม'];
  // ชุดประเมิน: ประเภทของครูรายวิชา / ประเภทผลประจำชั้น (ใช้รหัสข้อเดียวกับหน้าประเมินของครูประจำชั้น)
  const SETS = {
    char: { title: 'คุณลักษณะอันพึงประสงค์', subj: 'subj_char', official: 'characteristic', prefix: 'c', icon: 'bi-patch-check-fill',
      labels: ['รักชาติ ศาสน์ กษัตริย์', 'ซื่อสัตย์สุจริต', 'มีวินัย', 'ใฝ่เรียนรู้', 'อยู่อย่างพอเพียง', 'มุ่งมั่นในการทำงาน', 'รักความเป็นไทย', 'มีจิตสาธารณะ'] },
    rtw: { title: 'อ่าน คิดวิเคราะห์ และเขียน', subj: 'subj_rtw', official: 'rtw', prefix: 'rtw', icon: 'bi-book-half',
      labels: ['อ่านหาข้อมูล', 'จับประเด็น', 'เชื่อมโยง', 'แสดงความคิดเห็น', 'ถ่ายทอดการเขียน'] },
    comp: { title: 'สมรรถนะสำคัญ', subj: 'subj_comp', official: 'competency', prefix: 'cp', icon: 'bi-star-fill', labels: COMP_ITEMS }
  };
  const LEVEL = (avg) => (avg === null ? '' : avg >= 2.5 ? 'ดีเยี่ยม' : avg >= 1.5 ? 'ดี' : avg >= 1 ? 'ผ่าน' : 'ไม่ผ่าน');
  const codesOf = (set) => set.labels.map((_, i) => `${set.prefix}${i + 1}`);
  const subjCode = (subjectId, code) => `${subjectId}|${code}`;
  // ค่าที่ระบบเสนอ = ค่าเฉลี่ยของทุกวิชาที่ประเมินข้อนั้น ปัดครึ่งขึ้น (2.5 -> 3)
  function proposal(values) {
    const list = values.map(Number).filter((v) => Number.isInteger(v) && v >= 0 && v <= 3);
    if (!list.length) return null;
    return Math.floor(list.reduce((a, b) => a + b, 0) / list.length + 0.5);
  }
  const average = (values) => {
    const list = values.filter((v) => v !== '' && v !== null && v !== undefined).map(Number);
    return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
  };

  async function allRows(build) {
    const rows = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await build().range(start, start + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if ((data || []).length < 1000) return rows;
    }
  }
  async function scopeInfo() {
    const settings = await global.PP5Data.settings.get();
    const year = text(settings.academicYear || settings.academic_year);
    const semester = Number(settings.semester) === 2 ? 2 : 1;
    let role = '';
    try { role = (await global.PP5Data.auth.requireUser())?.profile?.role || ''; } catch (_) { role = ''; }
    let scope = null;
    try { const { data } = await client().rpc('pp5_teacher_scope_context'); scope = data && data.enabled ? data : null; } catch (_) { scope = null; }
    const scoped = role === 'teacher' && !!scope;
    const assignments = scoped ? (scope.assignments || []).filter((a) => a.active !== false && text(a.academic_year) === year) : [];
    return { settings, year, semester, role, scope, scoped, assignments };
  }
  async function allRooms() {
    const all = await global.PP5Data.students.list({}).catch(() => []);
    const rooms = new Map();
    all.forEach((s) => { const g = text(s.grade); const r = text(s.room || s.classNo || '1'); if (/^(ป|ม)\./.test(g)) rooms.set(`${g}/${r}`, { grade: g, room: r }); });
    return [...rooms.values()].sort((a, b) => a.grade.localeCompare(b.grade, 'th') || a.room.localeCompare(b.room, 'th', { numeric: true }));
  }
  const nameOf = (s) => text(s.fullName || [s.prefix || s.title, s.first_name || s.firstname, s.last_name || s.lastname].filter(Boolean).join(' ') || s.id);
  const noOf = (s, i) => text(s.studentNumber ?? s.student_number) || String(i + 1);

  const STYLE = `
.sx{--x-line:#e3e6ee;--x-muted:#5b6275;--x-soft:#f6f7fb;--x-card:#fff;--x-text:#1f2937;--x-accent:var(--primary,#4f46e5);
  --x-ok:#13795b;--x-ok-bg:#e6f6ef;--x-warn:#a15c00;--x-warn-bg:#fff4e0;--x-bad:#c2362b;--x-bad-bg:#fdecea;
  max-width:1250px;margin:0 auto;padding:0 0 96px;color:var(--x-text)}
[data-theme="dark"] .sx{--x-line:#2b3446;--x-muted:#a7afbd;--x-soft:#161d2b;--x-card:#1b2232;--x-text:#e5e7eb;
  --x-ok:#6fe0b4;--x-ok-bg:rgba(111,224,180,.12);--x-warn:#ffc46b;--x-warn-bg:rgba(255,196,107,.12);--x-bad:#ff8a80;--x-bad-bg:rgba(255,138,128,.12)}
.sx-title{display:none}
.sx-card{background:var(--x-card);border:1px solid var(--x-line);border-radius:16px;padding:14px 16px;margin-bottom:12px}
.sx-top{display:flex;flex-wrap:wrap;gap:10px;align-items:end}
.sx-top label{display:grid;gap:4px;font-weight:600;font-size:.85rem;min-width:220px;flex:1}
.sx-tabs{display:inline-flex;flex-wrap:wrap;border:1.5px solid var(--x-line);border-radius:12px;overflow:hidden}
.sx-tabs button{border:0;background:var(--x-card);color:var(--x-muted);font-weight:700;padding:.5rem .95rem;display:inline-flex;gap:6px;align-items:center}
.sx-tabs button[aria-pressed="true"]{background:var(--x-accent);color:#fff}
.sx-tabs button:disabled{opacity:.45}
.sx-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px;align-items:center}
.sx-chip{display:inline-flex;align-items:center;gap:6px;font-size:.82rem;font-weight:700;padding:.3rem .8rem;border-radius:999px;background:var(--x-soft);color:var(--x-muted)}
.sx-chip.is-ok{background:var(--x-ok-bg);color:var(--x-ok)}.sx-chip.is-warn{background:var(--x-warn-bg);color:var(--x-warn)}
.sx-wrap{overflow:auto;border:1px solid var(--x-line);border-radius:12px;max-height:70vh}
.sx-table{width:100%;border-collapse:collapse;font-size:.85rem;white-space:nowrap}
.sx-table th,.sx-table td{padding:5px 6px;border-bottom:1px solid var(--x-line);text-align:center}
.sx-table thead th{background:var(--x-soft);font-size:.76rem;color:var(--x-muted);position:sticky;top:0;z-index:2}
.sx-table thead tr:nth-child(2) th{top:30px}
.sx-table .sx-name{text-align:left;position:sticky;left:0;background:var(--x-card);z-index:1;min-width:190px}
.sx-table thead .sx-name{background:var(--x-soft);z-index:3}
.sx-table th.sx-item{writing-mode:horizontal-tb;max-width:86px;white-space:normal;line-height:1.2}
.sx-cell{width:46px;min-height:32px;border:1.5px solid var(--x-line);border-radius:8px;background:var(--x-card);color:var(--x-text);font-weight:800;text-align:center}
.sx-cell.v3{background:var(--x-ok-bg);border-color:var(--x-ok);color:var(--x-ok)}.sx-cell.v2{background:color-mix(in srgb,var(--x-accent) 10%,var(--x-card))}
.sx-cell.v1{background:var(--x-warn-bg);color:var(--x-warn)}.sx-cell.v0{background:var(--x-bad-bg);color:var(--x-bad)}
.sx-cell.is-dirty{outline:3px solid color-mix(in srgb,var(--x-warn) 55%,transparent)}
.sx-fill{display:flex;gap:2px;justify-content:center;margin-top:3px}
.sx-fill button{border:1px solid var(--x-line);background:var(--x-card);border-radius:6px;font-size:.68rem;font-weight:700;padding:0 5px;color:var(--x-muted)}
.sx-level{font-weight:700;font-size:.78rem}
.sx-prop{display:inline-flex;flex-direction:column;align-items:center;min-width:44px;padding:2px 4px;border-radius:8px}
.sx-prop b{font-size:.95rem}.sx-prop small{font-size:.66rem;color:var(--x-muted)}
.sx-prop.is-diff{background:var(--x-warn-bg)}.sx-prop.is-same{background:var(--x-ok-bg)}
.sx-bar{position:sticky;bottom:0;z-index:5;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;
  background:var(--x-card);border:1px solid var(--x-line);border-radius:14px;padding:10px 14px;box-shadow:0 -6px 18px rgba(15,23,42,.08)}
.sx-say{font-size:.88rem}.sx-say.is-ok{color:var(--x-ok)}.sx-say.is-err{color:var(--x-bad)}
.sx-save{border:0;border-radius:10px;padding:.55rem 1.2rem;font-weight:700;background:var(--x-accent);color:#fff;display:inline-flex;align-items:center;gap:6px}
.sx-save:disabled{opacity:.55}.sx-alt{border:1px solid var(--x-line);background:var(--x-card);color:var(--x-text);border-radius:10px;padding:.5rem .9rem;font-weight:700}
.sx-note{padding:10px 12px;border-radius:10px;font-size:.9rem;background:var(--x-soft);color:var(--x-muted)}
.sx-note.is-err{background:var(--x-bad-bg);color:var(--x-bad)}.sx-note.is-warn{background:var(--x-warn-bg);color:var(--x-warn)}`;

  const setTabs = () => `<div class="sx-tabs" role="group" aria-label="ชุดประเมิน" data-sets>${Object.entries(SETS).map(([k, s], i) =>
    `<button type="button" data-pp5-btn-skip data-set="${k}" aria-pressed="${i === 0}"><i class="bi ${s.icon}"></i> ${s.title}</button>`).join('')}</div>`;
  const semTabs = () => `<div class="sx-tabs" role="group" aria-label="ภาคเรียน" data-sems>${[1, 2].map((n) =>
    `<button type="button" data-pp5-btn-skip data-sem="${n}" aria-pressed="false">ภาค ${n}</button>`).join('')}</div>`;

  // ============================ แถบเลือกวิชาบนหน้าประเมินเดิม ============================
  const SHARED_PAGES = { characteristic_assessment: 'char', rtw5_assessment: 'rtw', competency_assessment: 'comp' };
  const CHOICE_KEY = 'pp5AssessCtxChoice';
  const currentPage = () => text(doc.body?.getAttribute?.('data-current-page') || global.AppNavigation?.currentPage);
  const jobLabel = (j) => `${[j.subject.code, j.subject.name].filter(Boolean).join(' ')} · ${j.grade}/${j.room}`;

  // งานรายวิชาที่ประเมินได้ + ภาคของแต่ละงาน (งานทั้งปี = สองภาค · งานเฉพาะภาค/วิชาเฉพาะภาค = ภาคนั้น)
  async function subjectJobs(info) {
    const { data: subjects, error } = await client().from('subjects').select('*');
    if (error) throw error;
    const assignments = info.scoped ? info.assignments.filter((a) => a.scope === 'subject' && global.PP5WorkMode?.keeps?.(a, info.scope, 0) !== false)
      : (await allRooms()).map((r) => ({ scope: 'homeroom', grade: r.grade, room: r.room }));
    const jobs = [1, 2].flatMap((sem) => global.PP5SubjectSchedule?.jobsFor?.(assignments, subjects || [], sem) || [])
      .reduce((map, j) => { if (!map.has(j.key)) map.set(j.key, { ...j, semesters: [] }); return map; }, new Map());
    jobs.forEach((job) => {
      const own = Number(job.subject.semester) || 0;
      const sems = new Set();
      if (!info.scoped) [1, 2].forEach((n) => sems.add(n));
      assignments.filter((a) => a.grade === job.grade && text(a.room) === job.room && text(a.subject_id) === text(job.subject.id))
        .forEach((a) => { const n = Number(a.semester) || 0; if (!n) [1, 2].forEach((x) => sems.add(x)); else sems.add(n); });
      job.semesters = [...sems].filter((n) => !own || n === own).sort();
    });
    return [...jobs.values()].filter((j) => j.semesters.length);
  }

  function shellBar() {
    const bar = doc.createElement('div');
    bar.className = 'sx sx-ctx';
    bar.id = 'pp5AssessCtx';
    bar.innerHTML = `<style>${STYLE}
.sx-ctx{max-width:none;padding:0;margin:0 0 12px}
.sx-ctx .sx-card{border-left:5px solid var(--x-accent);margin:0}
.sx-ctx .sx-card.is-subject{border-left-color:#d97706;background:color-mix(in srgb,#f59e0b 7%,var(--x-card))}
.sx-ctx .sx-note{margin-top:8px}</style>
<div class="sx-card" data-ctx-card><div class="sx-top"><label>ประเมินในฐานะ<select class="form-select" data-ctx></select></label>${semTabs()}</div>
<div class="sx-note" data-ctx-note>กำลังอ่านงานสอน…</div></div>`;
    return bar;
  }

  async function mountBar(bar, page) {
    const $ = (sel) => bar.querySelector(sel);
    const select = $('[data-ctx]');
    const note = $('[data-ctx-note]');
    const card = $('[data-ctx-card]');
    const info = await scopeInfo();
    const list = await subjectJobs(info);
    // ผลประจำชั้น: ผู้ดูแล/ไม่เปิดสิทธิ์ครู หรือครูประจำชั้นในโหมดนี้
    const homeroom = !info.scoped || info.assignments.some((a) => a.scope === 'homeroom' && global.PP5WorkMode?.keeps?.(a, info.scope, 0) !== false);
    if (!list.length) { bar.remove(); return; } // ไม่มีงานรายวิชา = หน้าเดิมทุกอย่าง
    const rooms = [...new Set(list.map((j) => `${j.grade}/${j.room}`))];
    select.innerHTML = (homeroom ? '<option value="">ผลประจำชั้น (ครูประจำชั้น · ทั้งปี)</option>' : '') +
      rooms.map((room) => `<optgroup label="ครูประจำวิชา · ห้อง ${esc(room)}">${list.filter((j) => `${j.grade}/${j.room}` === room)
        .map((j) => `<option value="${esc(j.key)}">${esc(jobLabel(j))}</option>`).join('')}</optgroup>`).join('');
    const grade = doc.getElementById('gradeSelect');
    const room = doc.getElementById('classSelect');
    const state = { semester: info.semester };

    let target = null;
    try {
      target = JSON.parse(global.sessionStorage.getItem('pp5SubjectAssessmentTarget') || 'null');
      global.sessionStorage.removeItem('pp5SubjectAssessmentTarget');
      if (!target) target = JSON.parse(global.sessionStorage.getItem(CHOICE_KEY) || 'null');
    } catch (_) { target = null; }
    const wanted = target && list.find((j) => text(j.subject.id) === text(target.subjectId) && j.grade === text(target.grade) && j.room === text(target.room));
    if (wanted) { select.value = wanted.key; if (wanted.semesters.includes(Number(target.semester))) state.semester = Number(target.semester); }
    else if (target && target.homeroom && homeroom) select.value = '';
    else select.value = homeroom ? '' : list[0].key;
    const job = () => list.find((j) => j.key === select.value) || null;
    const remember = (value) => { try { global.sessionStorage.setItem(CHOICE_KEY, JSON.stringify(value)); } catch (_) { /* เลือกใหม่ได้ */ } };

    function render() {
      const j = job();
      bar.querySelector('[data-sems]').hidden = !j;
      card.classList.toggle('is-subject', !!j);
      if (!j) {
        note.innerHTML = `<i class="bi bi-house-door-fill"></i> <b>ผลประจำชั้น</b> (ทั้งปี) — ผลที่ออกในรายงานและ ปพ.5
 · ดูค่าเฉลี่ยจากครูรายวิชาแล้วนำมาใช้ได้ที่ <a href="#" data-go-summary>รวมผลประเมินจากครูรายวิชา ›</a>`;
        return;
      }
      if (!j.semesters.includes(state.semester)) state.semester = j.semesters.includes(info.semester) ? info.semester : j.semesters[0];
      bar.querySelectorAll('[data-sem]').forEach((b) => {
        const n = Number(b.dataset.sem);
        b.disabled = !j.semesters.includes(n);
        b.title = b.disabled ? 'งานนี้ไม่ได้สอนภาคนี้' : '';
        b.setAttribute('aria-pressed', String(n === state.semester));
      });
      note.innerHTML = `<i class="bi bi-person-video3"></i> กำลังประเมินในวิชา <b>${esc(jobLabel(j))}</b> ภาค ${state.semester}
 — ผลนี้เก็บแยกเป็นของวิชานี้ ครูประจำชั้นจะเห็นเป็นค่าเฉลี่ยจากทุกวิชา ก่อนสรุปเป็นผลประจำชั้น`;
    }
    // ใช้วิชาที่เลือก: ตั้งบริบทให้ gas-bridge ก่อน แล้วสั่งหน้าเดิมโหลดห้องนั้น (onchange ของช่องห้อง = loadStudents)
    function activate() {
      const j = job();
      render();
      if (!j || !grade || !room) return;
      global.PP5AssessmentSubject = { subjectId: text(j.subject.id), grade: j.grade, room: j.room, semester: state.semester };
      remember({ subjectId: text(j.subject.id), grade: j.grade, room: j.room, semester: state.semester });
      if (![...grade.options].some((o) => o.value === j.grade)) grade.add(new global.Option(j.grade, j.grade));
      grade.value = j.grade;
      room.innerHTML = `<option value="${esc(j.room)}">${esc(j.room)}</option>`;
      room.value = j.room;
      grade.disabled = true;
      room.disabled = true;
      room.dispatchEvent(new global.Event('change', { bubbles: true }));
    }
    select.addEventListener('change', () => {
      if (job()) { activate(); return; }
      // กลับเป็นผลประจำชั้น: เปิดหน้าใหม่ให้ตัวเลือกชั้น/ห้องเดิมกลับมาครบ
      global.PP5AssessmentSubject = null;
      remember({ homeroom: true });
      if (typeof global.navigateTo === 'function') global.navigateTo(page);
    });
    bar.addEventListener('click', (event) => {
      const sem = event.target.closest('[data-sem]');
      if (sem && !sem.disabled && Number(sem.dataset.sem) !== state.semester) { state.semester = Number(sem.dataset.sem); activate(); return; }
      const go = event.target.closest('[data-go-summary]');
      if (go) { event.preventDefault(); if (typeof global.navigateTo === 'function') global.navigateTo('subject_assessment_summary'); }
    });
    if (job()) activate(); else render();
  }

  function applyBar() {
    const frame = doc.getElementById('contentFrame');
    const existing = doc.getElementById('pp5AssessCtx');
    const page = currentPage();
    // ออกจากหน้าประเมิน (หรือหน้าถูกวาดใหม่) = เลิกใช้บริบทวิชา ไม่ให้ค้างไปเขียนผลประจำชั้นผิดที่
    if (!existing || !SHARED_PAGES[page]) global.PP5AssessmentSubject = null;
    if (!frame || existing || !SHARED_PAGES[page] || !doc.getElementById('gradeSelect')) return;
    const bar = shellBar();
    frame.prepend(bar);
    mountBar(bar, page).catch((error) => {
      const box = bar.querySelector('[data-ctx-note]');
      if (box) box.innerHTML = `<span class="text-danger">${esc(error?.message || error)}</span>`;
    });
  }

  // ============================ หน้าครูประจำชั้น: รวมผล ============================
  function shellSummary() {
    return `<div class="sx" id="pp5SubjectAssessmentSummary"><style>${STYLE}</style><h4 class="sx-title">รวมผลประเมินจากครูรายวิชา</h4>
<div class="sx-card"><div class="sx-top"><label>ห้อง<select class="form-select" data-room></select></label></div>
<div class="mt-2">${setTabs()}</div></div>
<div class="sx-card" data-body><div class="sx-note">กำลังโหลด…</div></div>
<div class="sx-bar" data-bar hidden><span class="sx-say" data-say></span>
  <span class="d-inline-flex gap-2 flex-wrap"><button type="button" class="sx-alt" data-apply="empty" data-pp5-btn-skip><i class="bi bi-magic"></i> เติมเฉพาะช่องที่ยังว่าง</button>
  <button type="button" class="sx-save" data-apply="all" data-pp5-btn-skip><i class="bi bi-check2-all"></i> ใช้ค่าที่เสนอทั้งหมด</button></span></div></div>`;
  }

  const OFFICIAL_SEMESTER = 1;
  // ค่าที่เสนอต่อคนต่อข้อ จากแถว subj_* ทุกวิชา (ทุกภาค): { proposal, count, subjects }
  function buildProposals(rows, set) {
    const byKey = new Map();
    rows.forEach((r) => {
      const [subjectId, code] = text(r.criteria_code).split('|');
      if (!code || !code.startsWith(set.prefix) || !codesOf(set).includes(code)) return;
      const key = `${text(r.student_id)}|${code}`;
      if (!byKey.has(key)) byKey.set(key, { values: [], subjects: new Set() });
      byKey.get(key).values.push(Number(r.score));
      byKey.get(key).subjects.add(subjectId);
    });
    const out = new Map();
    byKey.forEach((v, key) => out.set(key, { proposal: proposal(v.values), count: v.values.length, subjects: v.subjects }));
    return out;
  }

  async function mountSummary(root) {
    const $ = (sel) => root.querySelector(sel);
    const roomSel = $('[data-room]');
    const body = $('[data-body]');
    const bar = $('[data-bar]');
    const say = $('[data-say]');
    const setSay = (msg, kind) => { say.className = `sx-say${kind ? ` is-${kind}` : ''}`; say.innerHTML = msg; };
    const info = await scopeInfo();
    const state = { set: 'char', students: [], proposals: new Map(), official: new Map(), subjectsDone: new Set(), token: 0 };
    const rooms = info.scoped
      ? info.assignments.filter((a) => a.scope === 'homeroom').map((a) => ({ grade: a.grade, room: text(a.room) }))
      : await allRooms();
    if (!rooms.length) { body.innerHTML = '<div class="sx-note is-warn">หน้านี้สำหรับครูประจำชั้น — บัญชีนี้ยังไม่ได้เป็นครูประจำชั้นของห้องใดในปีนี้</div>'; return; }
    roomSel.innerHTML = rooms.map((r) => `<option value="${esc(r.grade + '/' + r.room)}">${esc(r.grade + '/' + r.room)}</option>`).join('');
    const { data: subjects } = await client().from('subjects').select('id,code,name,grade');
    const subjectName = (id) => { const s = (subjects || []).find((x) => text(x.id) === text(id)); return s ? s.name : id; };

    async function load() {
      const token = ++state.token;
      const [grade, room] = roomSel.value.split('/');
      const set = SETS[state.set];
      root.querySelectorAll('[data-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.set === state.set)));
      body.innerHTML = '<div class="sx-note">กำลังโหลด…</div>';
      try {
        const students = await global.PP5Data.students.list({ grade, room });
        const ids = students.map((s) => text(s.id));
        // ผลประจำชั้นเป็นรายปี (หน้าประเมินเดิมอ่าน/เขียนภาค 1) · ค่าที่เสนอ = ทุกวิชา ทั้งสองภาค
        const read = (type, semester) => (ids.length ? allRows(() => {
          let q = client().from('assessments').select('student_id,criteria_code,score,semester')
            .eq('assessment_type', type).eq('academic_year', info.year).in('student_id', ids);
          if (semester) q = q.eq('semester', semester);
          return q.order('id');
        }) : []);
        const [subjRows, officialRows] = await Promise.all([read(set.subj, 0), read(set.official, OFFICIAL_SEMESTER)]);
        if (token !== state.token) return;
        state.students = students;
        state.proposals = buildProposals(subjRows, set);
        state.official = new Map(officialRows.map((r) => [`${text(r.student_id)}|${text(r.criteria_code)}`, Number(r.score)]));
        state.subjectsDone = new Set(subjRows.map((r) => text(r.criteria_code).split('|')[0]));
        render();
      } catch (loadError) {
        if (token !== state.token) return;
        body.innerHTML = `<div class="sx-note is-err">${esc(loadError?.message || loadError)}</div>`;
      }
    }
    function render() {
      const set = SETS[state.set];
      const codes = codesOf(set);
      const diff = [...state.proposals.entries()].filter(([key, p]) => p.proposal !== null && state.official.get(key) !== p.proposal).length;
      const groups = state.set === 'comp' ? `<tr><th rowspan="2">ที่</th><th rowspan="2" class="sx-name">ชื่อ–สกุล</th>${COMP_GROUPS.map((g) => `<th colspan="5">${esc(g)}</th>`).join('')}</tr>` : '';
      body.innerHTML = `<div class="sx-chips"><span class="sx-chip"><i class="bi ${set.icon}"></i> ${esc(set.title)} · ทั้งปี (ครูรายวิชา ภาค 1 + ภาค 2)</span>
  <span class="sx-chip ${state.subjectsDone.size ? 'is-ok' : 'is-warn'}">ครูรายวิชาประเมินแล้ว ${state.subjectsDone.size} วิชา${state.subjectsDone.size ? `: ${esc([...state.subjectsDone].map(subjectName).join(', '))}` : ''}</span>
  <span class="sx-chip ${diff ? 'is-warn' : 'is-ok'}">${diff ? `ค่าที่เสนอต่างจากผลประจำชั้น ${diff} ช่อง` : 'ผลประจำชั้นตรงกับค่าที่เสนอ'}</span></div>
<p class="sx-note mb-2">ตัวใหญ่ = ค่าที่ระบบเสนอ (ค่าเฉลี่ยจากครูรายวิชา ปัดครึ่งขึ้น) · ตัวเล็ก = ผลประจำชั้นที่บันทึกไว้ตอนนี้ · สีส้ม = ยังไม่ตรงกัน
— กดปุ่มด้านล่างเพื่อนำค่าที่เสนอไปเป็นผลประจำชั้น หรือแก้เองที่หน้าประเมินเดิมของครูประจำชั้น</p>
<div class="sx-wrap"><table class="sx-table"><thead>${groups}<tr>${state.set === 'comp' ? '' : '<th>ที่</th><th class="sx-name">ชื่อ–สกุล</th>'}${set.labels.map((l, i) =>
    `<th class="sx-item">${state.set === 'comp' ? '' : `${i + 1}. `}${esc(l)}</th>`).join('')}</tr></thead><tbody>
${state.students.map((s, i) => {
    const sid = text(s.id);
    return `<tr><td>${esc(noOf(s, i))}</td><td class="sx-name">${esc(nameOf(s))}</td>${codes.map((c) => {
      const p = state.proposals.get(`${sid}|${c}`);
      const now = state.official.get(`${sid}|${c}`);
      if (!p || p.proposal === null) return `<td><span class="sx-prop"><b>–</b><small>${now === undefined ? 'ว่าง' : `เดิม ${now}`}</small></span></td>`;
      return `<td><span class="sx-prop ${now === p.proposal ? 'is-same' : 'is-diff'}" title="จาก ${p.count} วิชา"><b>${p.proposal}</b><small>${now === undefined ? 'ว่าง' : `เดิม ${now}`} · ${p.count} วิชา</small></span></td>`;
    }).join('')}</tr>`;
  }).join('')}</tbody></table></div>`;
      bar.hidden = false;
    }
    async function apply(mode) {
      const set = SETS[state.set];
      const records = [];
      state.proposals.forEach((p, key) => {
        if (p.proposal === null) return;
        const [sid, code] = key.split('|');
        const now = state.official.get(key);
        if (mode === 'empty' && now !== undefined) return;
        if (now === p.proposal) return;
        records.push({ studentId: sid, assessmentType: set.official, criteriaCode: code, score: p.proposal, academicYear: info.year, semester: OFFICIAL_SEMESTER });
      });
      if (!records.length) { setSay('ไม่มีช่องที่ต้องเปลี่ยน', 'ok'); return; }
      if (mode === 'all' && !global.confirm(`แทนที่ผลประจำชั้น ${records.length} ช่องด้วยค่าที่ระบบเสนอใช่ไหม? (ช่องที่ครูรายวิชายังไม่ประเมินจะไม่ถูกแตะ)`)) return;
      root.querySelectorAll('[data-apply]').forEach((b) => { b.disabled = true; });
      setSay('<span class="spinner-border spinner-border-sm"></span> กำลังบันทึก…', '');
      try {
        await global.PP5Data.assessments.save(records);
        await load();
        setSay(`<i class="bi bi-check-circle-fill"></i> บันทึกเป็นผลประจำชั้นแล้ว ${records.length} ช่อง`, 'ok');
      } catch (applyError) {
        setSay(`<i class="bi bi-exclamation-triangle-fill"></i> บันทึกไม่สำเร็จ: ${esc(applyError?.message || applyError)}`, 'err');
      } finally {
        root.querySelectorAll('[data-apply]').forEach((b) => { b.disabled = false; });
      }
    }
    root.addEventListener('click', async (event) => {
      const setBtn = event.target.closest('[data-set]');
      if (setBtn) { state.set = setBtn.dataset.set; await load(); return; }
      const applyBtn = event.target.closest('[data-apply]');
      if (applyBtn) await apply(applyBtn.dataset.apply);
    });
    roomSel.addEventListener('change', load);
    await load();
  }

  // ---- ลงทะเบียนหน้า + แถบหัวหน้า
  const PAGES = [
    { page: 'subject_assessment_summary', id: 'pp5SubjectAssessmentSummary', shell: shellSummary, mount: mountSummary,
      banner: { icon: 'bi-diagram-3', title: 'รวมผลประเมินจากครูรายวิชา', sub: 'ค่าเฉลี่ยจากครูรายวิชาเป็นค่าตั้งต้น — ครูประจำชั้นตัดสินผลประจำชั้น', hide: '#pp5SubjectAssessmentSummary > .sx-title' } }
  ];
  PAGES.forEach((p) => {
    if (global.PP5PageBanner?.PAGES && !global.PP5PageBanner.PAGES[p.page]) global.PP5PageBanner.PAGES[p.page] = p.banner;
  });
  function apply() {
    applyBar();
    PAGES.forEach((p) => {
      const root = doc.getElementById(p.id);
      if (root && !root.__pp5Mounted) {
        root.__pp5Mounted = true;
        p.mount(root).catch((error) => {
          const box = root.querySelector('[data-body]');
          if (box) box.innerHTML = `<div class="sx-note is-err">${esc(error?.message || error)}</div>`;
        });
      }
    });
  }
  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5SubjectAssessment) return;
    frame.__pp5SubjectAssessment = true;
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(apply).observe(frame, { childList: true, subtree: true });
    apply();
  }
  global.GAS_PAGES = global.GAS_PAGES || {};
  PAGES.forEach((p) => { global.GAS_PAGES[p.page] = p.shell(); });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
  global.PP5SubjectAssessment = { SETS, codesOf, subjCode, proposal, buildProposals, LEVEL, SHARED_PAGES, OFFICIAL_SEMESTER };
})(window);
