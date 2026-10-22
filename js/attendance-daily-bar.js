// เช็คชื่อรายวันบนมือถือ (owner 2026-10-10): แถบดำ "ยอดเช็คชื่อ / บันทึกข้อมูล" ด้านล่างเคยขึ้นค้างตลอด
// เมื่อมีรายชื่อ กินพื้นที่จนการ์ดนักเรียนคนแรกโดนบัง ตอนนี้ขึ้นเฉพาะตอนที่ยังมีสิ่งต้องบันทึก:
//   - วันนั้นยังไม่เคยบันทึก (ค่าเริ่มต้น "มา" ทุกคนยังไม่อยู่ในฐานข้อมูล) หรือ
//   - ครูเปลี่ยนสถานะนักเรียนหลังโหลด/หลังบันทึกล่าสุด
// owner 2026-10-22: มือถือบันทึกที่แถบนี้ที่เดียว (ปุ่มบนซ่อน) จึงขึ้นวันเสาร์-อาทิตย์ที่ยังไม่บันทึกด้วย
// แถบนี้ขึ้นแทนที่เมนูล่าง (js/mobile-work-chrome.js)
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

  // รูปนักเรียนในตารางจอคอม (owner 2026-10-22): รายชื่อที่หน้าโหลดมามีลิงก์รูปชั่วคราวอยู่แล้ว (supabaseClient
  // signStudentPhotos) แต่หน้าเดิมทิ้งไปตอนสร้าง dailyStudents จึงจำไว้ที่นี่  google.script.run เรียกชื่อ
  // getStudentsForAttendance ผ่าน alias ไปที่ getFilteredStudentsInline จึงห่อทั้งสองชื่อ (ส่งผลลัพธ์เดิมกลับ)
  const photos = new Map();
  const photoSrc = (value) => {
    if (typeof global.PP5AssessmentUI?.photoSrc === 'function') return global.PP5AssessmentUI.photoSrc(value);
    const input = String(value ?? '').trim();
    return /^(https?:|data:image\/)/i.test(input) ? input : '';
  };
  ['getFilteredStudentsInline', 'getStudentsForAttendance'].forEach((name) => {
    const original = server[name];
    if (typeof original !== 'function') return;
    server[name] = async function (...args) {
      const result = await original.apply(this, args);
      if (Array.isArray(result) && doc.getElementById('attendanceBody') && String(args[0]) === pageValue('gradeSelect') && String(args[1]) === pageValue('classSelect')) {
        photos.clear();
        result.forEach((student) => photos.set(String(student?.id ?? ''), photoSrc(student?.photoUrl || student?.photo_url)));
        schedule();
      }
      return result;
    };
  });

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
    // Not saved yet. owner 2026-10-22: on phones this bar is the ONLY save button (the top one is hidden in
    // css/attendance-daily.css), so Saturday / Sunday also show it (make-up days), with a weekend label.
    return !state.daySaved;
  }

  // ยอด มา/ลา/ขาด ไปอยู่ขวาของหัว "รายชื่อนักเรียน" แถวเดียวกัน (owner 2026-10-14: "จะได้เนื้อที่เยอะขึ้น")
  // ย้ายกล่องเดิมทั้งกล่อง (id presentCount/leaveCount/absentCount เดิม หน้าเดิมยังอัปเดตตัวเลขได้) แล้วซ่อนการ์ดที่ว่าง
  function mergeSummary() {
    if (typeof doc.querySelector !== 'function') return;
    const grid = doc.querySelector('#contentFrame .attendance-summary-card .summary-grid');
    const head = doc.querySelector('#contentFrame .student-list-card > div:first-child');
    if (!grid || !head || !head.querySelector('#studentCountLabel')) return;
    grid.classList.add('pp5-att-summary-inline');
    const card = grid.closest('.attendance-summary-card');
    head.classList.add('pp5-att-list-head');
    head.append(grid);
    card.hidden = true;
  }

  // มือถือ (owner 2026-10-22): ปุ่ม ชาย→หญิง / รีเฟรช / ลบ ไปอยู่ขวาของหัว "รายชื่อนักเรียน (n คน)" แถวเดียวกัน
  // ย้ายปุ่มเดิมทั้งปุ่ม (onclick เดิมทำงานต่อ)  จอคอมย้ายกลับที่เดิมท้าย .button-container  หน้าตาใน css/attendance-daily.css
  const PHONE = '(max-width: 991.98px)';
  function moveListTools() {
    if (typeof doc.querySelector !== 'function') return;
    const head = doc.querySelector('#contentFrame .student-list-card > .pp5-att-list-head');
    const container = doc.querySelector('#contentFrame .attendance-controls-card .button-container');
    if (!head || !container) return;
    const tools = [doc.getElementById('btnAttSortToggle'), container.querySelector(':scope > .btn-primary') || head.querySelector('.pp5-att-list-tools > .btn-primary'),
      container.querySelector(':scope > .btn-danger') || head.querySelector('.pp5-att-list-tools > .btn-danger')].filter(Boolean);
    const phone = !global.matchMedia || global.matchMedia(PHONE).matches;
    let box = head.querySelector(':scope > .pp5-att-list-tools');
    if (phone) {
      if (!box) {
        box = doc.createElement('div');
        box.className = 'pp5-att-list-tools';
        head.insertBefore(box, head.children[1] || null);
      }
      tools.forEach((button) => { if (button.parentNode !== box) box.append(button); });
    } else if (box) {
      tools.forEach((button) => container.append(button));
      box.remove();
    }
  }

  // ช่องชื่อแต่ละแถวของตารางจอคอม (#row-desk-<รหัส>): [รูป][ชื่อ / รหัส] แบบเดียวกับหน้าประเมิน (.pp5-au-*)
  // ไม่มีรูป -> ไอคอนคน  รูปเสีย -> ไอคอนคน  คลิกรูปเปิดรูปใหญ่ (js/student-photos.js ดักคลิก .pp5-au-avatar.has-photo)
  const escAttr = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  function avatarHtml(url) {
    return url
      ? `<span class="pp5-au-avatar has-photo"><img src="${escAttr(url)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`
      : '<span class="pp5-au-avatar"><i class="bi bi-person-fill" aria-hidden="true"></i></span>';
  }
  function decoratePhotos() {
    if (typeof doc.querySelectorAll !== 'function') return;
    doc.querySelectorAll('#attendanceBody > tr[id^="row-desk-"]').forEach((row) => {
      const cell = row.cells && row.cells[1];
      if (!cell) return;
      const url = photos.get(row.id.slice('row-desk-'.length)) || '';
      if (cell.getAttribute('data-pp5-photo') === url && cell.querySelector('.pp5-au-who')) return;
      const inner = cell.querySelector('.pp5-att-who-text')?.innerHTML ?? cell.innerHTML;
      cell.setAttribute('data-pp5-photo', url);
      cell.innerHTML = `<div class="pp5-au-who">${avatarHtml(url)}<div class="pp5-att-who-text">${inner}</div></div>`;
      const nameLine = cell.querySelector('.pp5-att-who-text > div');
      if (nameLine) nameLine.classList.add('pp5-au-name');
      const img = cell.querySelector('img');
      if (img) img.addEventListener('error', () => {
        const box = img.parentElement;
        if (!box) return;
        box.classList.remove('has-photo');
        box.innerHTML = '<i class="bi bi-person-fill" aria-hidden="true"></i>';
      }, { once: true });
    });
  }

  function update() {
    mergeSummary();
    moveListTools();
    decoratePhotos();
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
    const text = state.daySaved ? 'แก้ไขแล้ว ยังไม่บันทึก'
      : isWeekend(pageValue('attendanceDate')) ? 'วันเสาร์-อาทิตย์ ยังไม่ได้บันทึก' : 'วันนี้ยังไม่ได้บันทึก';
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
    if (typeof global.addEventListener === 'function') global.addEventListener('resize', schedule);
    schedule();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
