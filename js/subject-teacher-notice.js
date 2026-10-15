// คำเตือนในหน้ากรอกคะแนน (owner 2026-10-15: ยกวิชาให้ครูรายวิชาแล้ว "ครูประจำชั้นดูได้ทั้งหมด แก้ได้ แต่มีคำเตือน")
//   เลือกชั้น/ห้อง/วิชาแล้ว ถ้าวิชานั้นมีครูผู้สอนคนอื่นได้รับมอบหมาย (ปีนี้) แสดงแถบเตือนว่าคะแนนที่แก้จะทับของครูผู้สอน
//   ไม่ห้ามแก้ — ครูประจำชั้นยังกรอกแทนได้ (เช่น ครูผู้สอนลา) · ครูผู้สอนเองไม่เห็นแถบนี้
//   ชื่อครูอ่านผ่าน pp5_subject_room_teachers (SQL 202610150033) — ยังไม่ได้รัน SQL = ไม่แสดงอะไร
(function initSubjectTeacherNotice(global) {
  'use strict';
  const doc = global.document;
  const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const esc = (v) => text(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cache = new Map();
  let me = null;
  let semester = 0;
  let lastKey = '';
  let token = 0;

  async function teachersOf(grade, room) {
    const key = `${grade}/${room}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 60000) return hit.rows;
    const { data, error } = await global.PP5Data.client.rpc('pp5_subject_room_teachers', { p_grade: grade, p_room: room });
    const rows = error ? [] : (Array.isArray(data) ? data : []);
    cache.set(key, { at: Date.now(), rows });
    return rows;
  }
  // ครูผู้สอนวิชานี้ในห้องนี้ ที่ไม่ใช่ตัวเรา · งานเฉพาะภาคแสดงเฉพาะเมื่อตรงภาคปัจจุบัน (หรือยังไม่รู้ภาค)
  function othersFor(rows, subjectId, myId, sem) {
    return rows.filter((r) => text(r.subject_id) === text(subjectId) && text(r.user_id) !== text(myId)
      && (!Number(r.semester) || !sem || Number(r.semester) === Number(sem)));
  }
  function noticeHtml(others, subjectName, room) {
    const who = others.map((o) => `${esc(o.teacher_name)}${Number(o.semester) ? ` (ภาคเรียนที่ ${Number(o.semester)})` : ''}`).join(', ');
    return `<i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
<div><b>วิชา${esc(subjectName)} ห้อง ${esc(room)} มีครูผู้สอน: ${who}</b>
<span>ครูผู้สอนเป็นผู้กรอกคะแนนวิชานี้ — ถ้าแก้ไขและบันทึกที่นี่ คะแนนจะทับของครูผู้สอน (ดูได้ตามปกติ)</span></div>`;
  }
  const STYLE = `.pp5-stn{display:flex;gap:10px;align-items:flex-start;margin:8px 0 10px;padding:10px 14px;border-radius:12px;
  background:#fff4e0;color:#8a4b00;border:1px solid #f6c77a;font-size:.9rem}
.pp5-stn i{font-size:1.15rem;margin-top:2px}.pp5-stn b{display:block}.pp5-stn span{display:block;font-size:.84rem}
[data-theme="dark"] .pp5-stn{background:rgba(255,196,107,.12);color:#ffc46b;border-color:rgba(255,196,107,.35)}`;

  // ภาคที่กำลังแก้ = แท็บของหน้ากรอกคะแนน (owner 2026-10-15 ส่งภาพแท็บ "ภาคเรียน 2"): ภาค 1 / ภาค 2 / รวม 2 ภาค (0 = ทุกภาค)
  // ไม่มีแท็บ = ภาคในตั้งค่าระบบ
  function editingSemester(frame) {
    if (frame.querySelector('#scoreEntryTerm2Tab.active')) return 2;
    if (frame.querySelector('#scoreEntryTerm1Tab.active')) return 1;
    if (frame.querySelector('#scoreEntryCombinedTab.active')) return 0;
    return semester;
  }
  async function check() {
    const frame = doc.getElementById('contentFrame');
    const gradeSel = frame?.querySelector('#scoreEntryGradeSelect');
    const roomSel = frame?.querySelector('#scoreEntryClassSelect');
    const subjectSel = frame?.querySelector('#scoreEntrySubjectSelect');
    if (!gradeSel || !roomSel || !subjectSel) { lastKey = ''; return; }
    let subject = null;
    try { subject = JSON.parse(subjectSel.value || 'null'); } catch (_) { subject = null; }
    const grade = text(gradeSel.value);
    const room = text(roomSel.value);
    const sem = editingSemester(frame);
    const key = `${grade}|${room}|${text(subject?.id)}|${sem}`;
    if (key === lastKey && frame.querySelector('#pp5SubjectTeacherNotice, [data-stn-none]')) return;
    lastKey = key;
    const my = ++token;
    frame.querySelector('#pp5SubjectTeacherNotice')?.remove();
    if (!grade || !room || !subject?.id || !global.PP5Data?.client?.rpc) return;
    try {
      if (!me) {
        const state = await global.PP5Data.auth.requireUser();
        me = text(state?.user?.id);
        const settings = await global.PP5Data.settings.get().catch(() => ({}));
        semester = Number(settings?.semester) === 2 ? 2 : Number(settings?.semester) === 1 ? 1 : 0;
      }
      const others = othersFor(await teachersOf(grade, room), subject.id, me, editingSemester(frame));
      if (my !== token || !others.length) return;
      if (!doc.getElementById('pp5SubjectTeacherNoticeStyle')) {
        const style = doc.createElement('style');
        style.id = 'pp5SubjectTeacherNoticeStyle';
        style.textContent = STYLE;
        doc.head.appendChild(style);
      }
      const box = doc.createElement('div');
      box.id = 'pp5SubjectTeacherNotice';
      box.className = 'pp5-stn';
      box.setAttribute('role', 'note');
      box.innerHTML = noticeHtml(others, text(subject.name || subject['ชื่อวิชา']), `${grade}/${room}`);
      const anchor = subjectSel.closest('.score-entry-compact-header') || subjectSel.closest('.card') || subjectSel.parentElement;
      anchor.after(box);
    } catch (_) { /* อ่านชื่อครูไม่ได้ = ไม่เตือน ไม่ขวางการกรอก */ }
  }

  let pending = false;
  const schedule = () => { if (pending) return; pending = true; setTimeout(() => { pending = false; check(); }, 150); };
  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5SubjectTeacherNotice) return;
    frame.__pp5SubjectTeacherNotice = true;
    frame.addEventListener('change', (event) => { if (event.target?.matches?.('#scoreEntryGradeSelect, #scoreEntryClassSelect, #scoreEntrySubjectSelect')) schedule(); });
    // สลับแท็บภาคไม่ส่ง change — ฟังการคลิกแท็บด้วย
    frame.addEventListener('click', (event) => { if (event.target?.closest?.('#scoreEntryTerm1Tab, #scoreEntryTerm2Tab, #scoreEntryCombinedTab')) schedule(); });
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(schedule).observe(frame, { childList: true, subtree: true });
    schedule();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
  doc.addEventListener('pp5:settings-saved', () => { me = null; });
  global.PP5SubjectTeacherNotice = { othersFor, noticeHtml };
})(window);
