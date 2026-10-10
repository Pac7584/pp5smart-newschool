// วิชารายภาค (ม.ต้น, owner 2026-10-10) ในหน้า "บันทึกคะแนน" (score_table_viewer)
// วิชาที่ตั้งภาคเรียนไว้ (subjects.semester = 1 หรือ 2) กรอกคะแนนได้เฉพาะแท็บภาคนั้น:
// ปิดแท็บของอีกภาคและแท็บ "รวม 2 ภาค" แล้วเปิดแท็บของวิชาให้เอง  วิชารายปี (ประถม) ทุกแท็บใช้ได้เหมือนเดิม
// ฝั่งบันทึก gas-bridge saveScoreSheetData ก็ปฏิเสธคะแนนผิดภาคอยู่แล้ว ไฟล์นี้กันไม่ให้ครูหลงกรอก
// ดูวิชาที่เลือกจาก value ของ #scoreEntrySubjectSelect (หน้าเดิมเก็บข้อมูลวิชาเป็น JSON) ไม่แก้ HTML ของหน้า
(function initSemesterSubjects(global) {
  'use strict';
  const doc = global.document;
  if (!doc || global.PP5SemesterSubjects) return;

  const TABS = { 1: 'scoreEntryTerm1Tab', 2: 'scoreEntryTerm2Tab', year: 'scoreEntryCombinedTab' };
  const NOTE_ID = 'pp5SemesterSubjectNote';

  function semesterOf(subject) {
    const value = Number(subject && subject.semester);
    return value === 1 || value === 2 ? value : 0;
  }

  function selectedSubject(select) {
    try { return JSON.parse((select && select.value) || 'null'); } catch (_) { return null; }
  }

  function apply(select) {
    const own = semesterOf(selectedSubject(select));
    Object.entries(TABS).forEach(([key, id]) => {
      const tab = doc.getElementById(id);
      if (!tab) return;
      const locked = !!own && key !== String(own);
      tab.disabled = locked;
      tab.classList.toggle('pp5-term-locked', locked);
      if (locked) tab.title = `วิชานี้เรียนเฉพาะภาคเรียนที่ ${own}`;
      else if (tab.title.startsWith('วิชานี้เรียนเฉพาะภาคเรียนที่')) tab.removeAttribute('title');
    });
    let note = doc.getElementById(NOTE_ID);
    if (own) {
      if (!note) {
        note = doc.createElement('div');
        note.id = NOTE_ID;
        note.className = 'small text-info fw-semibold mt-1';
        const info = doc.getElementById('scoreEntryCurrentSubjectInfo');
        if (info) info.appendChild(note);
      }
      note.textContent = `วิชานี้เรียนเฉพาะภาคเรียนที่ ${own} (ผลภาคนี้คือผลทั้งปีของวิชา)`;
      const mine = doc.getElementById(TABS[own]);
      if (mine && !mine.classList.contains('active') && typeof mine.click === 'function') mine.click();
    } else if (note) {
      note.remove();
    }
    return own;
  }

  // capture + setTimeout: run after the page's own change handler (it also fires on the auto-selected first subject)
  doc.addEventListener('change', (event) => {
    const target = event.target;
    if (target && target.id === 'scoreEntrySubjectSelect') global.setTimeout(() => apply(target), 0);
  }, true);

  global.PP5SemesterSubjects = { semesterOf, apply };
})(window);
