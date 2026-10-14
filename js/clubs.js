// ระบบลงทะเบียนชุมนุม (owner 2026-10-14: "ต่อไปอยากได้ระบบลงทะเบียนชุมนุม")
// ข้อตกลงกับเจ้าของ: ครูและนักเรียนลงทะเบียนได้ · ทุกชั้นเลือกได้ทุกชุมนุม · ภาคเรียนละครั้ง · ชื่อชุมนุมขึ้นหน้าประเมินกิจกรรม/ปพ. เอง
//   หน้า "ชุมนุม" (club_management) สำหรับครู: ① ชุมนุมทั้งหมด (เพิ่ม/แก้/ลบ = ผู้ดูแล, รายชื่อสมาชิก, พิมพ์)
//     ② ลงให้นักเรียน (เลือกห้อง -> เลือกชุมนุมทีละคน)  ③ ตั้งเวลาเปิดรับ (ผู้ดูแล)
//   หน้าเข้าสู่ระบบ: ลิงก์ "นักเรียน: ลงทะเบียนชุมนุม" ระหว่างเปิดรับ -> เลขประจำตัว + วันเกิด -> เลือก 1 ชุมนุม
// ฐานข้อมูล: supabase/migrations/202610140030_clubs.sql (ตาราง clubs / club_members + ฟังก์ชัน pp5_club_*)
// ภาคเรียน/ปี = ค่าในตั้งค่าระบบกลาง  ยังไม่ได้รัน SQL 030 = หน้านี้บอกให้รันก่อน
(function initClubs(global) {
  'use strict';
  const doc = global.document;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const client = () => global.PP5Data?.client;
  const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const thaiDateTime = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear() + 543} เวลา ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} น.`;
  };
  const missingSchema = (error) => /club|schema cache|does not exist|PGRST20[25]/i.test(String(error?.message || error?.code || ''));
  const SETUP_HINT = 'ระบบชุมนุมยังไม่พร้อม: ผู้ดูแลต้องรัน SQL <b>202610140030_clubs.sql</b> ใน Supabase ก่อน';

  async function rpc(name, args) {
    const { data, error } = await client().rpc(name, args);
    if (error) throw new Error(error.message || 'ทำรายการไม่สำเร็จ');
    return data;
  }

  // ================================================================ หน้าครู
  const STYLE = `
.pp5-club{max-width:1080px;margin:0 auto;display:grid;gap:14px}
.pp5-club-card{background:var(--bg-card,#fff);border:1px solid var(--border-color,#e2e8f0);border-radius:16px;padding:18px 20px;box-shadow:0 2px 10px rgba(15,23,42,.05)}
.pp5-club-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.pp5-club-head h2{margin:0;font-size:1.35rem;font-weight:800}
.pp5-club-term{padding:4px 12px;border-radius:999px;background:var(--primary);color:#fff;font-weight:700;font-size:.9rem}
.pp5-club-tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid #e2e8f0;margin:12px 0 0}
.pp5-club-tabs button{border:0;background:none;padding:9px 14px;font-weight:600;color:#64748b;border-radius:9px 9px 0 0;cursor:pointer}
.pp5-club-tabs button[aria-selected="true"]{color:var(--primary);box-shadow:inset 0 -3px 0 var(--primary);background:color-mix(in srgb,var(--primary) 7%,transparent)}
.pp5-club table{width:100%;border-collapse:collapse}
.pp5-club th,.pp5-club td{padding:9px 8px;border-bottom:1px solid #eef2f7;text-align:left;vertical-align:middle}
.pp5-club th{font-size:.85rem;color:#64748b;font-weight:700}
.pp5-club .num{text-align:center;white-space:nowrap}
.pp5-club-pill{display:inline-block;padding:2px 10px;border-radius:999px;background:#ecfdf5;color:#047857;font-weight:700}
.pp5-club-pill.full{background:#fef2f2;color:#b91c1c}
.pp5-club-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.pp5-club-form{display:grid;grid-template-columns:2fr 1.5fr .7fr;gap:10px;align-items:end;margin-top:12px}
.pp5-club-form .wide{grid-column:1/-1}
.pp5-club-form label{display:flex;flex-direction:column;gap:4px;font-weight:600;font-size:.88rem}
.pp5-club-msg{padding:9px 12px;border-radius:10px;font-weight:600}
.pp5-club-msg.ok{background:#ecfdf5;color:#047857}.pp5-club-msg.err{background:#fef2f2;color:#b91c1c}.pp5-club-msg.info{background:#eff6ff;color:#1d4ed8}
.pp5-club-members{background:#f8fafc;border-radius:12px;padding:10px 12px;margin:6px 0 10px}
.pp5-club-filter{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
.pp5-club-filter label{display:flex;flex-direction:column;gap:4px;font-weight:600;font-size:.88rem}
.pp5-club-hint{color:#64748b;font-size:.88rem}
.pp5-club-changed td{background:#fffbeb}
.pp5-club-savebar{position:sticky;bottom:10px;display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:12px;padding:10px 14px;border-radius:14px;background:var(--bg-card,#fff);border:1px solid #fde68a;box-shadow:0 8px 24px rgba(15,23,42,.12)}
.pp5-club-savebar [data-pending]{margin-right:auto;font-weight:700;color:#b45309}
@media (max-width:700px){.pp5-club-form{grid-template-columns:1fr}.pp5-club-hide-sm{display:none}}
`;

  function shell() {
    return `<div class="pp5-club" id="pp5ClubPage"><style>${STYLE}</style>
<div class="pp5-club-card">
  <div class="pp5-club-head"><h2><i class="bi bi-people-fill" style="color:var(--primary)"></i> ลงทะเบียนชุมนุม</h2><span class="pp5-club-term" data-term>…</span></div>
  <div class="pp5-club-tabs" role="tablist">
    <button type="button" role="tab" data-tab="clubs" aria-selected="true">ชุมนุมทั้งหมด</button>
    <button type="button" role="tab" data-tab="place" aria-selected="false">ลงให้นักเรียน</button>
    <button type="button" role="tab" data-tab="window" aria-selected="false" data-admin hidden>ตั้งเวลาเปิดรับ (ผู้ดูแล)</button>
  </div>
</div>
<div class="pp5-club-card" data-body><div class="pp5-club-hint">กำลังโหลด…</div></div>
<div class="pp5-club-msg" data-msg hidden></div>
</div>`;
  }

  async function mount(root) {
    const state = { year: '', semester: 1, isAdmin: String(global.localStorage?.getItem('role') || '').toLowerCase() === 'admin', clubs: [], members: [], tab: 'clubs' };
    const $ = (sel) => root.querySelector(sel);
    const body = $('[data-body]');
    const say = (text, kind) => { const box = $('[data-msg]'); box.hidden = !text; box.className = `pp5-club-msg ${kind || 'info'}`; box.textContent = text || ''; };
    root.querySelectorAll('[data-admin]').forEach((el) => { el.hidden = !state.isAdmin; });

    try {
      const settings = await global.PP5Data.settings.get();
      state.year = String(settings.academicYear || settings.academic_year || '');
      state.semester = Number(settings.semester) || 1;
      state.window = settings.settings_json?.club_registration || {};
    } catch (error) { say(error.message || String(error), 'err'); return; }
    $('[data-term]').textContent = `ภาคเรียนที่ ${state.semester}/${state.year}`;

    async function load() {
      const [clubs, members] = await Promise.all([
        client().from('clubs').select('*').eq('academic_year', state.year).eq('semester', state.semester).order('name'),
        client().from('club_members').select('club_id,student_id,registered_by,students(prefix,first_name,last_name,grade,room,student_number)')
          .eq('academic_year', state.year).eq('semester', state.semester)
      ]);
      const error = clubs.error || members.error;
      if (error) throw error;
      state.clubs = clubs.data || [];
      state.members = members.data || [];
    }
    const countOf = (id) => state.members.filter((m) => m.club_id === id).length;
    const nameOf = (s) => `${s?.prefix || ''}${s?.first_name || ''} ${s?.last_name || ''}`.trim();

    function renderClubs() {
      const rows = state.clubs.map((c) => {
        const n = countOf(c.id);
        return `<tr data-id="${esc(c.id)}">
  <td><strong>${esc(c.name)}</strong>${c.description ? `<div class="pp5-club-hint">${esc(c.description)}</div>` : ''}</td>
  <td class="pp5-club-hide-sm">${esc(c.advisor || '-')}</td>
  <td class="num">${c.capacity}</td>
  <td class="num"><span class="pp5-club-pill ${n >= c.capacity ? 'full' : ''}">${n} คน</span></td>
  <td><div class="pp5-club-row-actions">
    <button type="button" class="btn btn-sm" data-members>รายชื่อ</button>
    ${state.isAdmin ? '<button type="button" class="btn btn-sm" data-edit>แก้ไข</button><button type="button" class="btn btn-sm" data-delete aria-label="ลบชุมนุม">ลบ</button>' : ''}
  </div></td></tr>`;
      }).join('');
      body.innerHTML = `
<table><thead><tr><th>ชุมนุม</th><th class="pp5-club-hide-sm">ครูที่ปรึกษา</th><th class="num">รับ</th><th class="num">สมัครแล้ว</th><th></th></tr></thead>
<tbody>${rows || '<tr><td colspan="5" class="pp5-club-hint">ยังไม่มีชุมนุมในภาคเรียนนี้</td></tr>'}</tbody></table>
${state.isAdmin ? `<form class="pp5-club-form" data-form>
  <input type="hidden" name="id">
  <label>ชื่อชุมนุม *<input class="form-control" name="name" required maxlength="120" placeholder="เช่น คอมพิวเตอร์"></label>
  <label>ครูที่ปรึกษา<input class="form-control" name="advisor" maxlength="160" list="pp5ClubTeachers" autocomplete="off" placeholder="เลือกจากรายชื่อครู หรือพิมพ์เอง"><datalist id="pp5ClubTeachers"></datalist></label>
  <label>รับ (คน) *<input class="form-control" name="capacity" type="number" min="1" max="500" value="30" required></label>
  <label class="wide">คำอธิบาย (ไม่บังคับ)<input class="form-control" name="description" maxlength="500" placeholder="กิจกรรมที่ทำ / สถานที่"></label>
  <div class="wide pp5-club-row-actions" style="justify-content:flex-start"><button type="submit" class="btn" data-save>เพิ่มชุมนุม</button><button type="button" class="btn" data-cancel hidden>ยกเลิกแก้ไข</button></div>
</form>` : '<div class="pp5-club-hint" style="margin-top:10px">เพิ่ม/แก้ไขชุมนุมได้เฉพาะผู้ดูแลระบบ</div>'}`;

      body.querySelectorAll('tr[data-id]').forEach((tr) => {
        const club = state.clubs.find((c) => c.id === tr.dataset.id);
        tr.querySelector('[data-members]').addEventListener('click', () => toggleMembers(tr, club));
        tr.querySelector('[data-edit]')?.addEventListener('click', () => {
          const form = body.querySelector('[data-form]');
          form.id.value = club.id; form.name.value = club.name; form.advisor.value = club.advisor || '';
          form.capacity.value = club.capacity; form.description.value = club.description || '';
          form.querySelector('[data-save]').textContent = 'บันทึกการแก้ไข';
          form.querySelector('[data-cancel]').hidden = false;
          form.name.focus();
        });
        tr.querySelector('[data-delete]')?.addEventListener('click', async () => {
          const n = countOf(club.id);
          if (!global.confirm(`ลบชุมนุม "${club.name}"?${n ? ` สมาชิก ${n} คนจะถูกถอดออกด้วย` : ''}`)) return;
          const { error } = await client().from('clubs').delete().eq('id', club.id);
          if (error) return say(error.message, 'err');
          say(`ลบชุมนุม ${club.name} แล้ว`, 'ok'); await refresh();
        });
      });
      const form = body.querySelector('[data-form]');
      if (form) fillTeacherChoices(form.querySelector('#pp5ClubTeachers'));
      form?.querySelector('[data-cancel]').addEventListener('click', () => renderClubs());
      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const row = {
          name: form.name.value.trim(), advisor: form.advisor.value.trim() || null,
          capacity: Math.max(1, Math.min(500, Number(form.capacity.value) || 30)), description: form.description.value.trim() || null,
          academic_year: state.year, semester: state.semester, updated_at: new Date().toISOString()
        };
        if (!row.name) return say('กรุณาใส่ชื่อชุมนุม', 'err');
        const query = form.id.value ? client().from('clubs').update(row).eq('id', form.id.value) : client().from('clubs').insert(row);
        const { error } = await query;
        if (error) return say(/duplicate|unique/i.test(error.message) ? 'มีชุมนุมชื่อนี้ในภาคเรียนนี้แล้ว' : error.message, 'err');
        say(form.id.value ? `บันทึก ${row.name} แล้ว` : `เพิ่มชุมนุม ${row.name} แล้ว`, 'ok');
        await refresh();
      });
    }

    // ครูที่ปรึกษา: เลือกจากครูประจำชั้น / ครูประจำวิชา / รายชื่อครู / บัญชีครู (owner 2026-10-14) ยังพิมพ์ชื่อเองได้ (วิทยากร)
    async function fillTeacherChoices(list) {
      if (!list) return;
      const names = new Map(); // ชื่อ -> ที่มา
      // ชื่อเรียกบัญชีทั่วไป (เช่น "ผู้ดูแลระบบ") ไม่ใช่ชื่อคน: ไม่ใส่ในรายการ (owner 2026-10-14)
      const ACCOUNT_LABEL = /^(ผู้ดูแล(ระบบ)?|แอดมิน|admin(istrator)?|ครู|teacher|test|ทดสอบ)$/i;
      const add = (name, from) => { const n = String(name || '').replace(/\s+/g, ' ').trim(); if (n && !ACCOUNT_LABEL.test(n) && !names.has(n)) names.set(n, from); };
      const read = async (table, columns, configure) => {
        let query = client().from(table).select(columns);
        if (configure) query = configure(query);
        const { data, error } = await query;
        return error ? [] : (data || []);
      };
      const [homeroom, subjects, teachers, profiles] = await Promise.all([
        read('teacher_assignments', 'teacher_name,teacher_name_2,grade,room', (q) => q.eq('academic_year', state.year)),
        read('subjects', 'teacher_name,name,grade'),
        read('teachers', 'name'),
        read('user_profiles', 'display_name,role,active', (q) => q.in('role', ['teacher', 'admin']))
      ]);
      homeroom.forEach((r) => { add(r.teacher_name, `ครูประจำชั้น ${r.grade}/${r.room}`); add(r.teacher_name_2, `ครูประจำชั้น ${r.grade}/${r.room}`); });
      subjects.forEach((r) => add(r.teacher_name, `ครูประจำวิชา ${r.name}`));
      teachers.forEach((r) => add(r.name, 'รายชื่อครู'));
      profiles.filter((r) => r.active !== false).forEach((r) => add(r.display_name, 'บัญชีครูในระบบ'));
      list.innerHTML = [...names.entries()].sort((a, b) => a[0].localeCompare(b[0], 'th'))
        .map(([name, from]) => `<option value="${esc(name)}">${esc(from)}</option>`).join('');
    }

    function toggleMembers(tr, club) {
      const next = tr.nextElementSibling;
      if (next?.dataset.membersOf === club.id) { next.remove(); return; }
      const list = state.members.filter((m) => m.club_id === club.id)
        .sort((a, b) => `${a.students?.grade}${a.students?.room}${String(a.students?.student_number).padStart(3, '0')}`
          .localeCompare(`${b.students?.grade}${b.students?.room}${String(b.students?.student_number).padStart(3, '0')}`, 'th'));
      const row = doc.createElement('tr');
      row.dataset.membersOf = club.id;
      row.innerHTML = `<td colspan="5"><div class="pp5-club-members">
  <div class="pp5-club-head"><strong>สมาชิกชุมนุม ${esc(club.name)} (${list.length}/${club.capacity})</strong>
    <button type="button" class="btn btn-sm" data-print><i class="bi bi-printer"></i> พิมพ์รายชื่อ</button></div>
  ${list.length ? `<table><thead><tr><th class="num">ที่</th><th>ชื่อ-นามสกุล</th><th class="num">ชั้น</th><th class="pp5-club-hide-sm">ลงโดย</th><th></th></tr></thead><tbody>
  ${list.map((m, i) => `<tr><td class="num">${i + 1}</td><td>${esc(nameOf(m.students))}</td><td class="num">${esc(m.students?.grade)}/${esc(m.students?.room)}</td>
    <td class="pp5-club-hide-sm">${m.registered_by === 'student' ? 'นักเรียน' : 'ครู'}</td>
    <td class="num"><button type="button" class="btn btn-sm" data-remove="${esc(m.student_id)}">ถอดออก</button></td></tr>`).join('')}</tbody></table>`
    : '<div class="pp5-club-hint">ยังไม่มีสมาชิก</div>'}</div></td>`;
      tr.after(row);
      row.querySelector('[data-print]').addEventListener('click', () => printList(club, list));
      row.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', async () => {
        if (!global.confirm('ถอดนักเรียนคนนี้ออกจากชุมนุม?')) return;
        try { await rpc('pp5_club_set_member', { p_student_id: button.dataset.remove, p_club_id: null }); say('ถอดออกแล้ว', 'ok'); await refresh(); }
        catch (error) { say(error.message, 'err'); }
      }));
    }

    function printList(club, list) {
      const win = global.open('', '_blank');
      if (!win) return say('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาตป๊อปอัป', 'err');
      win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รายชื่อชุมนุม ${esc(club.name)}</title>
<style>body{font-family:'Sarabun',sans-serif;padding:24px}h2{margin:0}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #999;padding:6px 8px}th{background:#eee}.c{text-align:center}</style></head><body>
<h2>รายชื่อสมาชิกชุมนุม ${esc(club.name)}</h2><div>ภาคเรียนที่ ${state.semester}/${esc(state.year)} · ครูที่ปรึกษา ${esc(club.advisor || '-')} · ${list.length} คน</div>
<table><thead><tr><th class="c">ที่</th><th>ชื่อ-นามสกุล</th><th class="c">ชั้น</th><th class="c">ลงชื่อ</th></tr></thead><tbody>
${list.map((m, i) => `<tr><td class="c">${i + 1}</td><td>${esc(nameOf(m.students))}</td><td class="c">${esc(m.students?.grade)}/${esc(m.students?.room)}</td><td></td></tr>`).join('')}
</tbody></table><script>window.onload=function(){window.print();}<\/script></body></html>`);
      win.document.close();
    }

    // ลงให้นักเรียน: เลือกให้ครบทั้งห้องก่อน แล้วกด "บันทึกทั้งหมด" ครั้งเดียว (owner 2026-10-14: "ลงครบแล้วค่อยบันทึกจะเร็วกว่า")
    // ตัวเลข (n/รับ) ในรายการคิดรวมรายการที่ยังไม่บันทึกแล้ว ชุมนุมที่จะเต็มจึงเลือกเกินไม่ได้ตั้งแต่ตอนเลือก
    async function renderPlace() {
      const grades = global.PP5Grades?.list?.() || ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'];
      body.innerHTML = `<div class="pp5-club-filter">
  <label>ชั้น<select class="form-select" data-grade>${grades.map((g) => `<option>${esc(g)}</option>`).join('')}</select></label>
  <label>ห้อง<select class="form-select" data-room>${[1, 2, 3, 4, 5, 6].map((r) => `<option>${r}</option>`).join('')}</select></label>
  <span class="pp5-club-hint">เลือกชุมนุมให้ครบทั้งห้อง แล้วกด "บันทึกทั้งหมด" · ชุมนุมที่เต็มเลือกไม่ได้</span>
</div><div data-list style="margin-top:12px"></div>
<div class="pp5-club-savebar" data-savebar hidden><span data-pending></span>
  <button type="button" class="btn" data-discard>ยกเลิก</button><button type="button" class="btn" data-saveall>บันทึกทั้งหมด</button></div>`;
      const pending = new Map(); // student id -> club id ('' = เอาออก) ที่ยังไม่บันทึก
      let saved = {};
      const projected = (clubId) => {
        let n = countOf(clubId);
        pending.forEach((to, sid) => { if (saved[sid] === clubId) n -= 1; if (to === clubId) n += 1; });
        return n;
      };
      const bar = body.querySelector('[data-savebar]');
      const refreshChoices = () => {
        body.querySelectorAll('[data-student]').forEach((select) => {
          const sid = select.dataset.student;
          select.closest('tr').classList.toggle('pp5-club-changed', pending.has(sid));
          [...select.options].forEach((opt) => {
            if (!opt.value) return;
            const club = state.clubs.find((c) => c.id === opt.value);
            const n = projected(club.id);
            const chosen = select.value === club.id;
            opt.disabled = n >= club.capacity && !chosen;
            opt.textContent = `${club.name} (${n}/${club.capacity})${opt.disabled ? ' เต็ม' : ''}`;
          });
        });
        bar.hidden = pending.size === 0;
        body.querySelector('[data-pending]').textContent = `ยังไม่บันทึก ${pending.size} คน`;
        body.querySelector('[data-saveall]').textContent = `บันทึกทั้งหมด (${pending.size} คน)`;
      };
      const show = async () => {
        const list = body.querySelector('[data-list]');
        pending.clear();
        list.innerHTML = '<div class="pp5-club-hint">กำลังโหลดรายชื่อ…</div>';
        let students;
        try { students = await global.PP5Data.students.list({ grade: body.querySelector('[data-grade]').value, room: body.querySelector('[data-room]').value, academicYear: state.year }); }
        catch (error) { list.innerHTML = `<div class="pp5-club-msg err">${esc(error.message)}</div>`; return; }
        if (!students.length) { list.innerHTML = '<div class="pp5-club-hint">ไม่มีนักเรียนในห้องนี้</div>'; refreshChoices(); return; }
        if (!state.clubs.length) { list.innerHTML = '<div class="pp5-club-hint">ยังไม่มีชุมนุมในภาคเรียนนี้ ให้ผู้ดูแลเพิ่มชุมนุมก่อน</div>'; refreshChoices(); return; }
        saved = Object.fromEntries(state.members.map((m) => [m.student_id, m.club_id]));
        list.innerHTML = `<table><thead><tr><th class="num">ที่</th><th>ชื่อ-นามสกุล</th><th>ชุมนุม</th></tr></thead><tbody>
${students.map((st) => `<tr><td class="num">${esc(st.studentNumber ?? '')}</td><td>${esc(st.fullName)}</td>
<td><select class="form-select form-select-sm" data-student="${esc(st.id)}"><option value="">— ยังไม่ได้เลือก —</option>
${state.clubs.map((c) => `<option value="${esc(c.id)}" ${saved[st.id] === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>`;
        list.querySelectorAll('[data-student]').forEach((select) => select.addEventListener('change', () => {
          const sid = select.dataset.student;
          if ((saved[sid] || '') === select.value) pending.delete(sid); else pending.set(sid, select.value);
          refreshChoices();
        }));
        refreshChoices();
      };
      const confirmDiscard = () => pending.size === 0 || global.confirm(`ยังไม่ได้บันทึก ${pending.size} คน ต้องการทิ้งรายการที่เลือกไว้?`);
      let lastGrade = body.querySelector('[data-grade]').value;
      let lastRoom = body.querySelector('[data-room]').value;
      const onFilter = (event) => {
        if (!confirmDiscard()) { body.querySelector('[data-grade]').value = lastGrade; body.querySelector('[data-room]').value = lastRoom; return; }
        lastGrade = body.querySelector('[data-grade]').value; lastRoom = body.querySelector('[data-room]').value;
        show();
      };
      body.querySelector('[data-grade]').addEventListener('change', onFilter);
      body.querySelector('[data-room]').addEventListener('change', onFilter);
      body.querySelector('[data-discard]').addEventListener('click', () => { say('', 'info'); show(); });
      body.querySelector('[data-saveall]').addEventListener('click', async () => {
        const items = [...pending.entries()];
        const button = body.querySelector('[data-saveall]');
        button.disabled = true;
        const failures = [];
        let done = 0;
        // ย้ายออกก่อน แล้วค่อยใส่เข้า: ที่ว่างที่ปล่อยในห้องเดียวกันใช้ได้ทันที
        items.sort((a, b) => Number(Boolean(a[1])) - Number(Boolean(b[1])));
        for (const [sid, clubId] of items) {
          say(`กำลังบันทึก ${done + 1}/${items.length}…`, 'info');
          try { await rpc('pp5_club_set_member', { p_student_id: sid, p_club_id: clubId || null }); done += 1; }
          catch (error) { failures.push(`${body.querySelector(`[data-student="${CSS.escape(sid)}"]`)?.closest('tr')?.children[1]?.textContent || sid}: ${error.message}`); }
        }
        button.disabled = false;
        await load();
        await show();
        if (failures.length) say(`บันทึกแล้ว ${done} คน · ไม่สำเร็จ ${failures.length} คน — ${failures.join(' · ')}`, 'err');
        else say(`✅ บันทึกแล้ว ${done} คน`, 'ok');
      });
      await show();
    }

    function renderWindow() {
      const local = (iso) => { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
        const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
      const w = state.window || {};
      const now = Date.now();
      const open = w.opens_at && w.closes_at && now >= new Date(w.opens_at).getTime() && now < new Date(w.closes_at).getTime();
      body.innerHTML = `<div class="pp5-club-hint">ช่วงเวลาที่นักเรียนลงทะเบียนเองได้ (ครูลงให้ได้ตลอดเวลา) · ระหว่างเปิด หน้าเข้าสู่ระบบจะมีลิงก์ "นักเรียน: ลงทะเบียนชุมนุม"</div>
<div class="pp5-club-msg ${open ? 'ok' : 'info'}" style="margin:10px 0">${open ? `✅ กำลังเปิดรับ ถึง ${esc(thaiDateTime(w.closes_at))}` : 'ตอนนี้ปิดรับลงทะเบียน'}</div>
<form class="pp5-club-filter" data-window>
  <label>เปิดรับ<input class="form-control" type="datetime-local" name="opens" value="${local(w.opens_at)}" required></label>
  <label>ปิดรับ<input class="form-control" type="datetime-local" name="closes" value="${local(w.closes_at)}" required></label>
  <button type="submit" class="btn">บันทึกเวลา</button>
  <button type="button" class="btn" data-close-now>ปิดรับทันที</button>
</form>`;
      const save = async (value) => {
        try { await global.PP5Data.settings.patchSettingsJson('club_registration', value, 'บันทึกเวลาไม่สำเร็จ'); state.window = value; renderWindow(); say('บันทึกเวลาแล้ว', 'ok'); }
        catch (error) { say(error.message, 'err'); }
      };
      body.querySelector('[data-window]').addEventListener('submit', (event) => {
        event.preventDefault();
        const f = event.target;
        const opens = new Date(f.opens.value); const closes = new Date(f.closes.value);
        if (Number.isNaN(opens.getTime()) || Number.isNaN(closes.getTime()) || closes <= opens) return say('เวลาปิดรับต้องหลังเวลาเปิดรับ', 'err');
        save({ opens_at: opens.toISOString(), closes_at: closes.toISOString() });
      });
      body.querySelector('[data-close-now]').addEventListener('click', () => save({ opens_at: w.opens_at || null, closes_at: new Date().toISOString() }));
    }

    async function refresh() {
      try { await load(); }
      catch (error) {
        body.innerHTML = `<div class="pp5-club-msg err">${missingSchema(error) ? SETUP_HINT : esc(error.message)}</div>`;
        return;
      }
      if (state.tab === 'clubs') renderClubs();
      else if (state.tab === 'place') await renderPlace();
      else renderWindow();
    }
    root.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
      state.tab = button.dataset.tab;
      root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === button)));
      say('', 'info');
      refresh();
    }));
    await refresh();
  }

  // ================================================================ หน้าเข้าสู่ระบบ (นักเรียน)
  function loginLink() {
    const box = doc.querySelector('#contentFrame .login-container');
    const forgot = box?.querySelector('.forgot-password-link');
    if (!box || !forgot || box.__pp5ClubChecked || !client()) return;
    box.__pp5ClubChecked = true;
    rpc('pp5_club_registration_window', {}).then((w) => {
      if (!w?.open || !box.isConnected || box.querySelector('.pp5-club-link')) return;
      const row = doc.createElement('div');
      row.className = 'pp5-club-link';
      row.innerHTML = '<a href="#" data-club>🎯 นักเรียน: ลงทะเบียนชุมนุม</a>';
      (box.querySelector('.pp5-register-link') || forgot).after(row);
      row.querySelector('[data-club]').addEventListener('click', (event) => { event.preventDefault(); openStudent(); });
    }).catch(() => { /* SQL 030 ยังไม่ได้รัน: ไม่แสดงลิงก์ */ });
  }

  function openStudent() {
    doc.getElementById('pp5ClubOverlay')?.remove();
    const overlay = doc.createElement('div');
    overlay.id = 'pp5ClubOverlay';
    const thisYear = new Date().getFullYear() + 543;
    const years = Array.from({ length: 20 }, (_, i) => thisYear - 4 - i);
    overlay.innerHTML = `<div class="pp5-cs-card" role="dialog" aria-modal="true" aria-labelledby="pp5CsTitle">
  <button type="button" class="pp5-cs-close" data-close aria-label="ปิด">×</button>
  <h2 id="pp5CsTitle">ลงทะเบียนชุมนุม</h2>
  <div data-step>
    <p class="pp5-cs-sub">กรอกเลขประจำตัวนักเรียนและวันเกิด</p>
    <form data-login novalidate>
      <label>เลขประจำตัวนักเรียน<input name="sid" inputmode="numeric" autocomplete="off" required placeholder="เช่น 12345"></label>
      <div class="pp5-cs-birth"><label>วันที่<select name="d">${Array.from({ length: 31 }, (_, i) => `<option>${i + 1}</option>`).join('')}</select></label>
        <label>เดือน<select name="m">${MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select></label>
        <label>ปีเกิด (พ.ศ.)<select name="y">${years.map((y) => `<option>${y}</option>`).join('')}</select></label></div>
      <div class="pp5-cs-msg" data-msg hidden></div>
      <button type="submit" class="pp5-cs-btn">ถัดไป</button>
    </form>
  </div>
</div>`;
    doc.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    const form = overlay.querySelector('[data-login]');
    form.sid.focus();
    const say = (text, kind) => { const m = overlay.querySelector('[data-msg]'); if (!m) return; m.hidden = !text; m.className = `pp5-cs-msg ${kind || ''}`; m.textContent = text || ''; };
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const sid = form.sid.value.trim();
      if (!sid) return say('กรุณากรอกเลขประจำตัว', 'err');
      const birth = `${Number(form.y.value) - 543}-${String(form.m.value).padStart(2, '0')}-${String(form.d.value).padStart(2, '0')}`;
      say('กำลังตรวจสอบ…', 'info');
      try { showClubs(overlay, sid, birth, await rpc('pp5_club_student_view', { p_student_id: sid, p_birth_date: birth })); }
      catch (error) { say(error.message, 'err'); }
    });
  }

  function showClubs(overlay, sid, birth, view, notice) {
    const step = overlay.querySelector('[data-step]');
    const open = view.window?.open === true;
    step.innerHTML = `<p class="pp5-cs-sub"><strong>${esc(view.student.name)}</strong> ชั้น ${esc(view.student.grade)}/${esc(view.student.room)}<br>
ภาคเรียนที่ ${esc(view.window?.semester)}/${esc(view.window?.academic_year)} · ${open ? `ปิดรับ ${esc(thaiDateTime(view.window.closes_at))}` : 'ปิดรับลงทะเบียนแล้ว'}</p>
<div class="pp5-cs-msg ${notice ? notice.kind : ''}" data-msg ${notice ? '' : 'hidden'}>${esc(notice?.text || '')}</div>
<div class="pp5-cs-list">${view.clubs.length ? view.clubs.map((c) => {
      const mine = c.id === view.current_club_id; const left = c.capacity - c.count; const full = left <= 0 && !mine;
      return `<div class="pp5-cs-club ${mine ? 'mine' : ''}"><div><strong>${esc(c.name)}</strong>
  <small>${esc(c.advisor ? `ครู${String(c.advisor).replace(/^ครู/, '')}` : '')}${c.description ? ` · ${esc(c.description)}` : ''}</small>
  <small>${mine ? 'ชุมนุมของฉัน' : full ? 'เต็มแล้ว' : `ว่าง ${left} ที่ จาก ${c.capacity}`}</small></div>
  ${mine ? '<span class="pp5-cs-mine">✓ เลือกแล้ว</span>' : `<button type="button" class="pp5-cs-pick" data-pick="${esc(c.id)}" ${full || !open ? 'disabled' : ''}>เลือก</button>`}</div>`;
    }).join('') : '<p class="pp5-cs-sub">ยังไม่มีชุมนุมให้เลือก</p>'}</div>
<button type="button" class="pp5-cs-back" data-close>เสร็จสิ้น</button>`;
    step.querySelector('[data-close]').addEventListener('click', () => overlay.remove());
    step.querySelectorAll('[data-pick]').forEach((button) => button.addEventListener('click', async () => {
      const club = view.clubs.find((c) => c.id === button.dataset.pick);
      step.querySelectorAll('[data-pick]').forEach((b) => { b.disabled = true; });
      try {
        await rpc('pp5_club_student_join', { p_student_id: sid, p_birth_date: birth, p_club_id: club.id });
        showClubs(overlay, sid, birth, await rpc('pp5_club_student_view', { p_student_id: sid, p_birth_date: birth }), { kind: 'ok', text: `✅ ลงทะเบียนชุมนุม ${club.name} เรียบร้อย` });
      } catch (error) {
        let fresh = view;
        try { fresh = await rpc('pp5_club_student_view', { p_student_id: sid, p_birth_date: birth }); } catch (_) { /* keep */ }
        showClubs(overlay, sid, birth, fresh, { kind: 'err', text: error.message });
      }
    }));
  }

  // ================================================================
  function apply() {
    loginLink();
    const root = doc.getElementById('pp5ClubPage');
    if (root && !root.__pp5Mounted) { root.__pp5Mounted = true; mount(root).catch((error) => { root.querySelector('[data-body]').innerHTML = `<div class="pp5-club-msg err">${esc(error.message)}</div>`; }); }
  }
  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5Clubs) return;
    frame.__pp5Clubs = true;
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(apply).observe(frame, { childList: true, subtree: true });
    apply();
  }

  global.GAS_PAGES = global.GAS_PAGES || {};
  global.GAS_PAGES.club_management = shell();
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
  global.PP5Clubs = { shell, openStudent };
})(window);
