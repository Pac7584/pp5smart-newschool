// หน้า "จัดการผู้ใช้" (admin_panel) ให้เข้าชุดกับหน้ามอบหมายงานครู (owner 2026-10-14: "ปรับให้เข้าชุดกันด้วย")
// แต่งหน้าตาอย่างเดียว — การเพิ่ม/แก้/รีเซ็ต/ลบผู้ใช้ยังเป็นโค้ดเดิมของหน้า (ปุ่มและ id เดิม)
//   - แถบเครื่องมือ + แท็บในการ์ดขาว, ป้ายสิทธิ์ภาษาไทย (ครู / ผู้ดูแลระบบ / ผู้ปกครอง), ปุ่มจัดการเป็นไอคอน
//   - แท็บ "ครูและผู้ดูแล": ช่องรหัสนักเรียน (ว่างเสมอสำหรับครู) แสดง "งานที่มอบหมาย" ของปีนี้ + ปุ่มไปหน้ามอบหมายงาน
//     โดยเลือกครูคนนั้นไว้ให้ (sessionStorage pp5TeacherAccessSelect → js/teacher-access-ui.js)
(function initAdminUsersUi(global) {
  'use strict';
  const doc = global.document;
  const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const esc = (v) => text(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PAGE = 'body[data-current-page="admin_panel"]';

  const STYLE = `
${PAGE} .main-container{max-width:1180px;margin:0 auto;padding:0 0 24px;background:transparent;box-shadow:none}
${PAGE} .main-container > .text-center.mb-6{display:none}
.au-card{background:#fff;border:1px solid #dfe6f1;border-radius:16px;padding:12px 16px;margin-bottom:12px!important}
[data-theme="dark"] .au-card{background:#1b2232;border-color:#2b3446}
${PAGE} #searchBox{max-width:340px!important;min-height:42px;border-radius:10px;border:1px solid #dfe6f1;padding-left:2.2rem;
  background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0'/%3E%3C/svg%3E") no-repeat .75rem center}
[data-theme="dark"] ${PAGE} #searchBox{background-color:#161d2b;border-color:#2b3446;color:#e5e7eb}
${PAGE} .au-toolbar{display:flex!important;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
${PAGE} #addUserBtn,${PAGE} #refreshBtn,${PAGE} #pp5ImportLegacyUsers{border-radius:10px;font-weight:700;display:inline-flex;align-items:center;gap:6px;min-height:42px;padding:.45rem 1rem;box-shadow:none!important;transform:none!important}
${PAGE} #addUserBtn{background:var(--primary,#4f46e5)!important;border:1px solid var(--primary,#4f46e5)!important;color:#fff!important}
${PAGE} #refreshBtn{background:transparent!important;border:1px solid #cfd4de!important;color:#3b4763!important}
[data-theme="dark"] ${PAGE} #refreshBtn{border-color:#3a4458!important;color:#e5e7eb!important}
${PAGE} #roleTabs{display:flex;gap:4px;background:transparent;padding:0}
${PAGE} #roleTabs .tabbtn{border:0;border-radius:12px;padding:.55rem 1rem;font-weight:600;background:transparent;color:#3b4763;display:inline-flex;gap:8px;align-items:center}
[data-theme="dark"] ${PAGE} #roleTabs .tabbtn{color:#c7cfdd}
${PAGE} #roleTabs .tabbtn.active{background:color-mix(in srgb,var(--primary,#4f46e5) 12%,#fff);color:var(--primary,#4f46e5)}
[data-theme="dark"] ${PAGE} #roleTabs .tabbtn.active{background:color-mix(in srgb,var(--primary,#4f46e5) 30%,#161d2b);color:#fff}
${PAGE} #roleTabs .tabcount{font-size:.75rem;padding:.05rem .5rem;border-radius:999px;background:rgba(100,116,139,.16);color:inherit!important}
.au-hint{display:none!important}
${PAGE} #usersTable{background:#fff;border:1px solid #dfe6f1;border-radius:16px;overflow:hidden}
[data-theme="dark"] ${PAGE} #usersTable{background:#1b2232;border-color:#2b3446}
${PAGE} #usersTable table{width:100%;border-collapse:collapse}
${PAGE} #usersTable thead{background:#f5f7fc!important}
[data-theme="dark"] ${PAGE} #usersTable thead{background:#161d2b!important}
${PAGE} #usersTable th{font-size:.82rem;font-weight:700;color:#56627a;padding:.7rem .9rem;text-align:left;border-bottom:1px solid #dfe6f1}
${PAGE} #usersTable td{padding:.65rem .9rem;border-bottom:1px solid #eef1f7;vertical-align:middle;font-size:.95rem}
[data-theme="dark"] ${PAGE} #usersTable th,[data-theme="dark"] ${PAGE} #usersTable td{border-color:#2b3446;color:#e5e7eb}
${PAGE} #usersTable tr.user-card:hover{background:#f8faff}
[data-theme="dark"] ${PAGE} #usersTable tr.user-card:hover{background:#202a3e}
.au-role{display:inline-flex;align-items:center;gap:5px;font-size:.8rem;font-weight:700;padding:.18rem .65rem;border-radius:999px}
.au-role.admin{background:color-mix(in srgb,#6366f1 14%,transparent);color:#4f46e5}
.au-role.teacher{background:color-mix(in srgb,#0ea5e9 14%,transparent);color:#0369a1}
.au-role.registrar{background:color-mix(in srgb,#f59e0b 16%,transparent);color:#92400e}
[data-theme="dark"] .au-role.registrar{color:#fcd34d}
.au-role.parent{background:color-mix(in srgb,#10b981 14%,transparent);color:#047857}
[data-theme="dark"] .au-role.admin{color:#a5b4fc} [data-theme="dark"] .au-role.teacher{color:#7dd3fc} [data-theme="dark"] .au-role.parent{color:#6ee7b7}
.au-jobs{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.au-chip{font-size:.74rem;font-weight:600;padding:.08rem .5rem;border-radius:999px}
.au-chip.home{background:color-mix(in srgb,#0ea5e9 14%,transparent);color:#0369a1}
.au-chip.subj{background:color-mix(in srgb,#10b981 14%,transparent);color:#047857}
.au-chip.none{background:#fff4e0;color:#a15c00}
[data-theme="dark"] .au-chip.home{color:#7dd3fc} [data-theme="dark"] .au-chip.subj{color:#6ee7b7} [data-theme="dark"] .au-chip.none{background:rgba(255,196,107,.12);color:#ffc46b}
.au-assign{border:0;background:transparent;color:var(--primary,#4f46e5);font-size:.8rem;font-weight:700;padding:0 4px}
.au-assign:hover{text-decoration:underline}
${PAGE} #usersList .btn-sm{width:36px;height:36px;padding:0;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-size:1rem;
  background:transparent!important;border:1px solid #dfe6f1!important;box-shadow:none!important}
${PAGE} #usersList .btn-sm[data-action="edit"]{color:#4f46e5!important}
${PAGE} #usersList .btn-sm[data-action="reset"]{color:#b45309!important}
${PAGE} #usersList .btn-sm[data-action="delete"]{color:#c2362b!important}
${PAGE} #usersList .btn-sm:hover{background:#f3f5fb!important}
[data-theme="dark"] ${PAGE} #usersList .btn-sm{border-color:#2b3446!important}
[data-theme="dark"] ${PAGE} #usersList .btn-sm:hover{background:#202a3e!important}
${PAGE} .modal-content{border-radius:18px!important;border:1px solid #dfe6f1;box-shadow:0 24px 50px -12px rgba(15,23,42,.35)!important}
${PAGE} .modal-content .form-input,${PAGE} .modal-content .form-select{min-height:44px;border-radius:10px}
${PAGE} .pp5-reg-panel{border-radius:16px!important}
/* มือถือ: แถวผู้ใช้เป็นการ์ด (ชื่อ / ชื่อผู้ใช้ / สิทธิ์ / งาน ด้านซ้าย ปุ่มจัดการด้านขวา) */
@media (max-width:720px){${PAGE} #searchBox{max-width:none!important;width:100%}
  ${PAGE} #usersTable thead{display:none}
  ${PAGE} #usersTable tr.user-card{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:'name act' 'user act' 'role act' 'jobs jobs';gap:2px 10px;padding:10px 12px;border-bottom:1px solid #eef1f7}
  ${PAGE} #usersTable tr.user-card td{display:block;padding:0;border:0}
  ${PAGE} #usersTable tr.user-card td:nth-child(1){grid-area:user;font-weight:500!important;font-size:.8rem;color:#56627a}
  ${PAGE} #usersTable tr.user-card td:nth-child(2){grid-area:name;font-weight:700}
  ${PAGE} #usersTable tr.user-card td:nth-child(3){grid-area:role;margin-top:2px}
  ${PAGE} #usersTable tr.user-card td:nth-child(4){grid-area:jobs;margin-top:4px}
  ${PAGE} #usersTable tr.user-card td:nth-child(4):empty{display:none}
  ${PAGE} #usersTable tr.user-card td:nth-child(5){grid-area:act;align-self:center}
  ${PAGE} #usersTable tr.user-card td:nth-child(5) > div{flex-wrap:nowrap!important}}`;

  const ROLE = { admin: ['ผู้ดูแลระบบ', 'bi-shield-lock'], teacher: ['ครู', 'bi-person-workspace'], parent: ['ผู้ปกครอง', 'bi-people'],
    registrar: ['เจ้าหน้าที่ธุรการ', 'bi-folder2-open'] };
  let jobs = null;
  let jobsLoading = null;

  async function loadJobs() {
    if (jobs) return jobs;
    if (!jobsLoading) {
      jobsLoading = (async () => {
        const client = global.PP5Data?.client;
        const settings = await global.PP5Data.settings.get();
        const year = text(settings.academicYear || settings.academic_year);
        const read = async (table) => { const { data, error } = await client.from(table).select('*'); return error ? [] : (data || []); };
        const [profiles, assignments] = await Promise.all([read('user_profiles'), read('teacher_access_assignments')]);
        const byUsername = new Map();
        profiles.forEach((p) => byUsername.set(text(p.username).toLowerCase(), { id: p.id, jobs: [] }));
        const byId = new Map([...byUsername.values()].map((v) => [v.id, v]));
        assignments.filter((a) => a.active && text(a.academic_year) === year).forEach((a) => byId.get(a.user_id)?.jobs.push(a));
        jobs = { byUsername, year };
        return jobs;
      })().catch(() => { jobs = { byUsername: new Map(), year: '' }; return jobs; });
    }
    return jobsLoading;
  }

  function jobsHtml(username) {
    const entry = jobs?.byUsername.get(text(username).toLowerCase());
    if (!entry) return '';
    const home = entry.jobs.filter((j) => j.scope === 'homeroom').map((j) => `<span class="au-chip home">ประจำชั้น ${esc(j.grade)}/${esc(j.room)}</span>`);
    const subj = entry.jobs.filter((j) => j.scope === 'subject').length;
    const chips = home.join('') + (subj ? `<span class="au-chip subj">สอน ${subj} วิชา</span>` : '');
    return `<span class="au-jobs">${chips || '<span class="au-chip none">ยังไม่มีงาน</span>'}<button type="button" class="au-assign" data-pp5-btn-skip data-assign="${esc(entry.id)}"><i class="bi bi-person-check"></i> มอบหมายงาน</button></span>`;
  }

  function decorateRows(root) {
    const staffTab = root.querySelector('#roleTabs .tabbtn.active')?.dataset.tab !== 'parent';
    const th = root.querySelectorAll('#usersTable thead th');
    if (th[3]) th[3].textContent = staffTab ? 'งานที่มอบหมาย' : 'รหัสนักเรียน';
    if (th[4]) th[4].style.textAlign = 'center';
    root.querySelectorAll('#usersList tr.user-card').forEach((tr) => {
      if (tr.dataset.au === (jobs ? 'jobs' : 'base')) return;
      const cells = tr.children;
      // อ่านสิทธิ์จากป้ายเดิมของหน้าครั้งแรกแล้วจำไว้ (รอบต่อไปป้ายเป็นภาษาไทยแล้ว)
      if (!tr.dataset.auRole) {
        const roleText = text(cells[2]?.textContent);
        tr.dataset.auRole = /registrar|ธุรการ/i.test(roleText) ? 'registrar' : /admin/i.test(roleText) ? 'admin' : /parent/i.test(roleText) ? 'parent' : 'teacher';
      }
      const role = tr.dataset.auRole;
      if (cells[2]) cells[2].innerHTML = `<span class="au-role ${role}"><i class="bi ${ROLE[role][1]}"></i>${ROLE[role][0]}</span>`;
      if (role === 'teacher' && cells[3] && jobs) cells[3].innerHTML = jobsHtml(cells[0]?.textContent);
      tr.querySelectorAll('[data-action]').forEach((b) => {
        const icon = { edit: ['bi-pencil', 'แก้ไข'], reset: ['bi-key', 'รีเซ็ตรหัสผ่าน'], delete: ['bi-trash', 'ลบ'] }[b.dataset.action];
        if (icon && !b.dataset.au) { b.dataset.au = '1'; b.innerHTML = `<i class="bi ${icon[0]}"></i>`; b.title = icon[1]; b.setAttribute('aria-label', icon[1]); }
      });
      tr.dataset.au = jobs ? 'jobs' : 'base';
    });
  }

  function decoratePage(root) {
    if (!doc.getElementById('pp5AdminUsersStyle')) {
      const style = doc.createElement('style');
      style.id = 'pp5AdminUsersStyle';
      style.textContent = STYLE;
      doc.head.appendChild(style);
    }
    const search = root.querySelector('#searchBox');
    const toolbar = search?.parentElement;
    const tabsRow = root.querySelector('#roleTabs')?.parentElement;
    [toolbar, tabsRow].forEach((el) => el && el.classList.add('au-card'));
    toolbar?.classList.add('au-toolbar');
    tabsRow?.querySelector(':scope > .text-sm')?.classList.add('au-hint');
    if (search && search.placeholder !== 'ค้นหาชื่อผู้ใช้หรือชื่อ-นามสกุล') search.placeholder = 'ค้นหาชื่อผู้ใช้หรือชื่อ-นามสกุล';
    const add = root.querySelector('#addUserBtn');
    if (add && !add.dataset.au) { add.dataset.au = '1'; add.innerHTML = '<i class="bi bi-person-plus"></i> เพิ่มผู้ใช้'; }
    const refresh = root.querySelector('#refreshBtn');
    if (refresh && !refresh.dataset.au) { refresh.dataset.au = '1'; refresh.innerHTML = '<i class="bi bi-arrow-clockwise"></i> รีเฟรช'; }
    [['staff', 'bi-person-workspace', 'ครูและผู้ดูแล', 'countStaff'], ['parent', 'bi-people', 'ผู้ปกครอง', 'countParent']].forEach(([tab, icon, label, countId]) => {
      const btn = root.querySelector(`#roleTabs .tabbtn[data-tab="${tab}"]`);
      if (!btn || btn.dataset.au) return;
      const count = btn.querySelector(`#${countId}`);
      btn.dataset.au = '1';
      btn.innerHTML = `<i class="bi ${icon}"></i> ${label} `;
      if (count) btn.appendChild(count);
    });
    decorateRows(root);
  }

  function apply() {
    if (doc.body?.getAttribute('data-current-page') !== 'admin_panel') return;
    const root = doc.getElementById('contentFrame');
    if (!root || !root.querySelector('#usersList')) return;
    decoratePage(root);
    if (!jobs) loadJobs().then(() => decorateRows(root));
  }
  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5AdminUsers) return;
    frame.__pp5AdminUsers = true;
    let timer = null;
    if (typeof global.MutationObserver === 'function') {
      new global.MutationObserver(() => { clearTimeout(timer); timer = setTimeout(apply, 30); }).observe(frame, { childList: true, subtree: true });
    }
    frame.addEventListener('click', (event) => {
      const button = event.target.closest('[data-assign]');
      if (!button) return;
      try { global.sessionStorage.setItem('pp5TeacherAccessSelect', button.dataset.assign); } catch (_) { /* still opens the page */ }
      if (typeof global.navigateTo === 'function') global.navigateTo('teacher_access');
    });
    // ข้อมูลงานอ่านใหม่ทุกครั้งที่เปิดหน้า (อาจเพิ่งมอบหมายจากอีกหน้า)
    doc.addEventListener('pp5:page-rendered', () => { jobs = null; jobsLoading = null; });
    apply();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
  global.PP5AdminUsersUi = { apply, decorateRows, ROLE };
})(window);
