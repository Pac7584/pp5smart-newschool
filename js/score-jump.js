// ไปแก้ ร / มส / 0 (owner 2026-10-20): จากการ์ด "นักเรียนที่ต้องติดตาม" ในหน้าภาพรวม กดป้ายวิชา → เปิดหน้ากรอกคะแนน
// ของชั้น/ห้อง/วิชานั้นเลย สลับไปภาคเรียนที่ติด และเลื่อนไปที่แถวนักเรียนพร้อมไฮไลต์ (ไม่ต้องเลือก 3 ช่องเอง)
// หน้ากรอกคะแนนเดิมโหลดตัวเลือกทีละขั้น (ชั้น → ห้อง → วิชา, เลือกวิชาแรกให้เอง) จึงเดินทีละขั้นด้วยการตรวจซ้ำทุก 200ms
// เปลี่ยนค่าเฉพาะเมื่อยังไม่ตรง และหยุดเมื่อครบหรือเกิน 20 วินาที · ไม่บันทึกอะไร · tools/score-jump-contract.cjs
(function initScoreJump(global) {
  'use strict';
  const doc = global.document;
  const STEP_MS = 200;
  const LIMIT_MS = 20000;
  const STYLE = `
.pp5-sj-flash>td{animation:pp5SjFlash 2.4s ease-out 1}
@keyframes pp5SjFlash{0%,40%{background:#fde68a}100%{background:transparent}}`;
  let timer = null;

  const text = (value) => (value === null || value === undefined ? '' : String(value)).trim();
  const subjectIdOf = (raw) => { try { return text(JSON.parse(raw).id); } catch (_) { return ''; } };

  function installStyle() {
    if (!doc || doc.getElementById('pp5SjStyle')) return;
    const style = doc.createElement('style');
    style.id = 'pp5SjStyle';
    style.textContent = STYLE;
    (doc.head || doc.documentElement).appendChild(style);
  }

  // เลือกค่าใน select เมื่อมีตัวเลือกนั้นแล้ว · คืน true เมื่อค่าตรงแล้ว
  function pick(select, matches) {
    if (!select || select.disabled) return false;
    const option = [...select.options].find((o) => o.value && matches(o.value));
    if (!option) return false;
    if (select.value === option.value) return true;
    select.value = option.value;
    select.dispatchEvent(new global.Event('change', { bubbles: true }));
    return false;
  }

  // หนึ่งขั้น: คืน 'done' เมื่อไฮไลต์แถวแล้ว
  function step(target) {
    const byId = (id) => doc.getElementById(id);
    if (!byId('scoreEntryPage')) return 'wait';
    if (!pick(byId('scoreEntryGradeSelect'), (v) => v === target.grade)) return 'wait';
    if (!pick(byId('scoreEntryClassSelect'), (v) => v === target.room)) return 'wait';
    const subject = byId('scoreEntrySubjectSelect');
    if (!pick(subject, (v) => subjectIdOf(v) === target.subjectId)) return 'wait';
    const term = Number(target.semester) === 2 ? 2 : 1;
    const container = byId(`scoreEntryTerm${term}Container`);
    // ตารางของวิชาที่เลือกโหลดเสร็จ = getScoreSheetData ตั้ง PP5ScoreSheetSpecials ของวิชานี้ และมีแถวนักเรียน
    const loaded = global.PP5ScoreSheetSpecials?.sheetName && container?.querySelector('tbody tr[data-student-id]');
    if (!loaded || byId('scoreEntryLoadingOverlay')?.offsetParent) return 'wait';
    const sheetName = text(global.PP5ScoreSheetSpecials.sheetName);
    const subjectName = (() => { try { return text(JSON.parse(subject.value).name); } catch (_) { return ''; } })();
    if (subjectName && !(sheetName.startsWith(subjectName) && sheetName.endsWith(`-${target.room}`))) return 'wait';
    const tab = byId(`scoreEntryTerm${term}Tab`);
    if (tab && !tab.classList.contains('active')) tab.click();
    const row = target.studentId ? container.querySelector(`tbody tr[data-student-id="${global.CSS?.escape ? global.CSS.escape(target.studentId) : target.studentId}"]`) : null;
    if (row) {
      installStyle();
      row.classList.remove('pp5-sj-flash');
      void row.offsetWidth;
      row.classList.add('pp5-sj-flash');
      if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    return 'done';
  }

  function open(target) {
    const clean = {
      grade: text(target?.grade), room: text(target?.room), subjectId: text(target?.subjectId),
      semester: text(target?.semester), studentId: text(target?.studentId)
    };
    if (!clean.grade || !clean.room || !clean.subjectId) return false;
    global.clearInterval(timer);
    if (typeof global.navigateTo === 'function') global.navigateTo('score_table_viewer');
    const started = Date.now();
    timer = global.setInterval(() => {
      let state = 'wait';
      try { state = step(clean); } catch (_) { state = 'wait'; }
      if (state === 'done' || Date.now() - started > LIMIT_MS) global.clearInterval(timer);
    }, STEP_MS);
    return true;
  }

  global.PP5ScoreJump = { open, step };
})(window);
