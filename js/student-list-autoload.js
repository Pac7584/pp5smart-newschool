// รายชื่อนักเรียน (owner 2026-10-10): ปุ่มห้องด้านบนขึ้น "ป.3/1" แต่รายชื่อที่โหลดเป็นทั้งโรงเรียน
// หน้าเดิม (gas-pages.js studentList) เรียก loadStudentList ทันทีตอนเปิดหน้า ตอนนั้นช่องชั้น/ห้องยังว่าง
// แล้ว GradeClassHelper ใส่ห้องที่จำไว้ทีหลัง (~300ms) โดยไม่โหลดใหม่ และเปลี่ยนชั้น/ห้องก็ต้องกด "กรองข้อมูล" เอง
// ไฟล์นี้: เมื่อช่องชั้น/ห้องเปลี่ยน (คนกด หรือโปรแกรมใส่ค่าที่จำไว้) และไม่ตรงกับรายชื่อที่ขอไว้ล่าสุด
// -> รอให้คำขอที่ค้างอยู่เสร็จก่อน (ไม่ให้ผลรอบเก่าทับรอบใหม่) แล้วเรียก loadStudentList ของหน้าเอง
// ห่อ GasServer.getFilteredStudentsInline แบบส่งผลเดิมกลับ เพื่อรู้ว่าขอห้องไหนไปแล้ว  ไม่แตะ HTML ของหน้าเดิม
(function initStudentListAutoload(global) {
  'use strict';
  const server = global.GasServer;
  const doc = global.document;
  if (!server || !doc || server.__pp5StudentListAutoload) return;
  server.__pp5StudentListAutoload = true;

  const state = { requested: null, inflight: 0, timer: null, watchUntil: 0 };
  const value = (id) => String(doc.getElementById(id)?.value || '').trim();
  const currentKey = () => value('filterGrade') + '|' + value('filterClass');
  const onPage = () => !!doc.getElementById('studentListTable') && typeof global.loadStudentList === 'function';

  const original = server.getFilteredStudentsInline;
  if (typeof original === 'function') {
    server.getFilteredStudentsInline = async function (grade, classNo, ...rest) {
      state.requested = String(grade || '').trim() + '|' + String(classNo || '').trim();
      state.inflight += 1;
      try {
        return await original.call(this, grade, classNo, ...rest);
      } finally {
        state.inflight -= 1;
      }
    };
  }

  function reconcile() {
    state.timer = null;
    if (!onPage()) return;
    // A request is still running: check again when it is done.
    if (state.inflight > 0) { schedule(150); return; }
    const key = currentKey();
    // The room select is filled after the grade; wait for it so ป.3 + "" does not load the whole grade first.
    const classSelect = doc.getElementById('filterClass');
    const waitingForRoom = value('filterGrade') && !value('filterClass') && classSelect && classSelect.options.length > 1
      && Date.now() < state.watchUntil;
    if (waitingForRoom) { schedule(150); return; }
    if (key !== state.requested) global.loadStudentList();
  }

  function schedule(delay) {
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(reconcile, delay);
  }

  // Grade / room changed (by a tap, the quick room bar, or GradeClassHelper restoring the saved room).
  doc.addEventListener('change', (event) => {
    const id = event.target && event.target.id;
    if ((id === 'filterGrade' || id === 'filterClass') && onPage()) schedule(250);
  }, true);

  // A fresh visit to the page: GradeClassHelper may set the values without a change event, so watch a while.
  let wasOnPage = false;
  function watchVisit() {
    const now = onPage();
    if (now && !wasOnPage) {
      state.watchUntil = Date.now() + 4000;
      const tick = () => {
        if (!onPage() || Date.now() > state.watchUntil) return;
        if (currentKey() !== state.requested && !state.timer) schedule(0);
        setTimeout(tick, 200);
      };
      setTimeout(tick, 200);
    }
    wasOnPage = now;
  }

  function start() {
    const frame = doc.getElementById('contentFrame') || doc.body;
    new MutationObserver(watchVisit).observe(frame, { childList: true, subtree: true });
    watchVisit();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
