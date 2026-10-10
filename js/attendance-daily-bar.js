// เช็คชื่อรายวันบนมือถือ (owner 2026-10-10): แถบดำ "ยอดเช็คชื่อ / บันทึกข้อมูล" ด้านล่างเคยขึ้นค้างตลอด
// เมื่อมีรายชื่อ กินพื้นที่จนการ์ดนักเรียนคนแรกโดนบัง ตอนนี้ขึ้นเฉพาะตอนที่ยังมีสิ่งต้องบันทึก:
//   - วันนั้นยังไม่เคยบันทึก (ค่าเริ่มต้น "มา" ทุกคนยังไม่อยู่ในฐานข้อมูล) หรือ
//   - ครูเปลี่ยนสถานะนักเรียนหลังโหลด/หลังบันทึกล่าสุด
// บันทึกสำเร็จแล้วแถบหายเอง  ไม่แตะหน้าเดิมใน gas-pages.js: ห่อ GasServer.getSavedAttendance / saveAttendance
// แบบส่งผลลัพธ์เดิมกลับทุกครั้ง แล้วดูสถานะจาก window.dailyStudents ของหน้า  จอคอม (>= 992px) หน้าเดิมซ่อนแถบอยู่แล้ว
// หน้าตา (ซ่อน .pp5-att-idle, แถบบางลง, แถวปุ่ม) อยู่ใน css/attendance-daily.css
(function initAttendanceDailyBar(global) {
  'use strict';
  const server = global.GasServer;
  const doc = global.document;
  if (!server || !doc || server.__pp5AttendanceBarWrapped) return;
  server.__pp5AttendanceBarWrapped = true;

  const state = { loadSeq: 0, seenSeq: -1, savedResult: null, baseline: null, daySaved: false, label: null };

  const pageValue = (id) => doc.getElementById(id)?.value || '';
  const statusOf = (student) => String(student?.status || 'present');
  const snapshot = (list) => Object.fromEntries(list.map((student) => [String(student.id), statusOf(student)]));

  const originalGet = server.getSavedAttendance;
  if (typeof originalGet === 'function') {
    server.getSavedAttendance = async function (...args) {
      const result = await originalGet.apply(this, args);
      // The daily page asks with (grade, classNo, year, month); only that load sets a new baseline.
      if (doc.getElementById('mobileStickySaveBar') && String(args[0]) === pageValue('gradeSelect') && String(args[1]) === pageValue('classSelect')) {
        state.savedResult = result;
        state.loadSeq += 1;
        schedule();
      }
      return result;
    };
  }

  const originalSave = server.saveAttendance;
  if (typeof originalSave === 'function') {
    server.saveAttendance = async function (payload, ...rest) {
      const result = await originalSave.call(this, payload, ...rest);
      if (result && result.success === true && payload && payload.mode === 'daily' && doc.getElementById('mobileStickySaveBar')) {
        const records = payload.records && typeof payload.records === 'object' ? payload.records : {};
        state.baseline = Object.fromEntries(Object.entries(records).map(([id, status]) => [String(id), String(status || 'present')]));
        state.daySaved = Number(result.saved) > 0;
        schedule();
      }
      return result;
    };
  }

  function isWeekend(dateValue) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue || '');
    if (!match) return false;
    const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getDay();
    return day === 0 || day === 6;
  }

  function needsSave(list) {
    const base = state.baseline || {};
    const changed = list.some((student) => (base[String(student.id)] || 'present') !== statusOf(student));
    if (changed) return true;
    // Not saved yet: worth a reminder on a school day, not on Saturday / Sunday.
    return !state.daySaved && !isWeekend(pageValue('attendanceDate'));
  }

  function update() {
    const bar = doc.getElementById('mobileStickySaveBar');
    if (!bar) return;
    const list = Array.isArray(global.dailyStudents) ? global.dailyStudents : [];
    const loading = !!global.AttendanceState?.isLoadingStudents;
    if (state.seenSeq !== state.loadSeq && list.length && !loading) {
      state.seenSeq = state.loadSeq;
      state.baseline = snapshot(list);
      const day = Number(pageValue('attendanceDate').slice(-2));
      const records = state.savedResult?.records || {};
      state.daySaved = !!day && list.some((student) => Object.prototype.hasOwnProperty.call(records, `${student.id}_${day}`));
    }
    const button = doc.getElementById('btnSaveAttendanceSticky');
    // Holidays: the page disables the save buttons, so there is nothing to save.
    const show = list.length > 0 && !loading && !button?.disabled && state.seenSeq === state.loadSeq && needsSave(list);
    if (bar.classList.contains('pp5-att-idle') === show) bar.classList.toggle('pp5-att-idle', !show);
    const label = bar.querySelector('.mobile-save-info > div:first-child');
    const text = state.daySaved ? 'แก้ไขแล้ว ยังไม่บันทึก' : 'วันนี้ยังไม่ได้บันทึก';
    if (label && label.textContent !== text) label.textContent = text;
  }

  let timer = null;
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; update(); }, 60);
  }

  function start() {
    const frame = doc.getElementById('contentFrame') || doc.body;
    new MutationObserver(schedule).observe(frame, { subtree: true, childList: true, attributes: true, characterData: true });
    doc.addEventListener('click', schedule, true);
    doc.addEventListener('change', schedule, true);
    schedule();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
