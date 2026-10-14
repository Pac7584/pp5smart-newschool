// หน้า "ปก ปพ.5" (pp5_cover_page): เลือกรูปแบบ "รวมวิชา (รายชั้น)" แบบเดิม หรือ "รายวิชา" (owner 2026-10-14:
// "ตอนนี้บางโรงเรียนเขามีแบบรายวิชา") — แบบรายวิชาเลือกวิชาเดียว หรือ "ทุกวิชาในห้องนี้" (หน้าละวิชา)
// แบบรวมวิชาใช้ปุ่มและการทำงานเดิมของหน้าทั้งหมด  แบบรายวิชาเรียก GasServer.exportPp5SubjectCoverPDF
// (gas-bridge computePp5SubjectSheets -> pdf-export createPp5SubjectCover)
(function initPp5SubjectCover(global) {
  'use strict';
  const doc = global.document;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const KINDERGARTEN = /^อ\.\s*[123]$/;

  function isCoverPage(frame) {
    const title = frame.querySelector('h4');
    return Boolean(frame.querySelector('#exportBtn') && frame.querySelector('#gradeSelect') && frame.querySelector('#classSelect')
      && title && title.textContent.includes('(ปพ.5)'));
  }

  // หน้าตา (owner 2026-10-14 "ออกแบบหน้า ui ใหม่เถอะมันขี้เหร่"): เลือกรูปแบบเป็นการ์ด 2 ใบ, ครูผู้สอนเป็นรายการพับได้
  // พร้อมป้าย "ระบุแล้ว x/y" — สีหลักใช้ --primary ของธีมโรงเรียน, มีโหมดมืด
  function injectStyles() {
    if (doc.getElementById('pp5SubjectCoverStyles')) return;
    const style = doc.createElement('style');
    style.id = 'pp5SubjectCoverStyles';
    style.textContent = `
.pp5sc{--sc-line:#e3e6ee;--sc-muted:#5b6275;--sc-soft:#f6f7fb;--sc-card:#fff;--sc-text:#1f2937;--sc-accent:var(--primary,#4f46e5);
  --sc-warn:#a15c00;--sc-warn-bg:#fff4e0;--sc-ok:#13795b;--sc-ok-bg:#e6f6ef;margin-bottom:1rem;color:var(--sc-text)}
[data-theme="dark"] .pp5sc{--sc-line:#2b3446;--sc-muted:#a7afbd;--sc-soft:#161d2b;--sc-card:#1b2232;--sc-text:#e5e7eb;
  --sc-warn:#ffc46b;--sc-warn-bg:rgba(255,196,107,.12);--sc-ok:#6fe0b4;--sc-ok-bg:rgba(111,224,180,.12)}
.pp5sc-label{display:flex;align-items:center;gap:.4rem;font-weight:600;margin-bottom:.5rem}
.pp5sc-modes{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:.6rem}
.pp5sc-mode{position:relative;display:flex;gap:.7rem;align-items:flex-start;padding:.75rem 2rem .75rem .85rem;border:1.5px solid var(--sc-line);
  border-radius:12px;background:var(--sc-card);cursor:pointer;transition:border-color .15s,box-shadow .15s,background .15s}
.pp5sc-mode:hover{border-color:color-mix(in srgb,var(--sc-accent) 45%,var(--sc-line))}
.pp5sc-mode input{position:absolute;opacity:0;pointer-events:none}
.pp5sc-mode:has(input:checked){border-color:var(--sc-accent);background:color-mix(in srgb,var(--sc-accent) 7%,var(--sc-card));
  box-shadow:0 0 0 3px color-mix(in srgb,var(--sc-accent) 16%,transparent)}
.pp5sc-mode:has(input:focus-visible){outline:2px solid var(--sc-accent);outline-offset:2px}
.pp5sc-ico{flex:0 0 36px;height:36px;border-radius:10px;display:grid;place-items:center;font-size:1.1rem;
  background:var(--sc-soft);color:var(--sc-muted)}
.pp5sc-mode:has(input:checked) .pp5sc-ico{background:var(--sc-accent);color:#fff}
.pp5sc-mode b{display:block;font-size:.95rem;line-height:1.3}
.pp5sc-mode small{display:block;color:var(--sc-muted);font-size:.8rem;line-height:1.35;margin-top:.15rem}
.pp5sc-check{position:absolute;top:.5rem;right:.6rem;color:var(--sc-accent);opacity:0}
.pp5sc-mode:has(input:checked) .pp5sc-check{opacity:1}
.pp5sc-subject{margin-top:.2rem}
#pp5CoverMode{margin-bottom:1.1rem}
.pp5sc-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;margin-bottom:1rem}
.pp5sc-pair>.mb-3{margin-bottom:0!important}
.pp5sc-teachers{margin-top:.9rem;border:1px solid var(--sc-line);border-radius:12px;background:var(--sc-card);overflow:hidden}
.pp5sc-teachers>summary{list-style:none;display:flex;align-items:center;gap:.5rem;padding:.7rem .85rem;cursor:pointer;font-weight:600;background:var(--sc-soft)}
.pp5sc-teachers>summary::-webkit-details-marker{display:none}
.pp5sc-teachers>summary .bi-chevron-down{margin-left:auto;color:var(--sc-muted);transition:transform .2s}
.pp5sc-teachers[open]>summary .bi-chevron-down{transform:rotate(180deg)}
.pp5sc-chip{font-size:.75rem;font-weight:600;padding:.12rem .55rem;border-radius:999px;background:var(--sc-warn-bg);color:var(--sc-warn);white-space:nowrap}
.pp5sc-chip.is-done{background:var(--sc-ok-bg);color:var(--sc-ok)}
.pp5sc-hint{margin:0;padding:.55rem .85rem 0;font-size:.8rem;color:var(--sc-muted)}
.pp5sc-list{list-style:none;margin:0;padding:.35rem .5rem .5rem}
.pp5sc-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:.6rem;align-items:center;padding:.4rem .35rem;border-radius:8px}
.pp5sc-row+.pp5sc-row{border-top:1px solid var(--sc-line)}
.pp5sc-row.is-picked{background:color-mix(in srgb,var(--sc-accent) 7%,transparent)}
.pp5sc-subj{display:flex;align-items:center;gap:.5rem;min-width:0}
.pp5sc-code{flex:none;font-size:.72rem;font-weight:600;padding:.12rem .45rem;border-radius:6px;background:var(--sc-soft);color:var(--sc-muted);
  font-variant-numeric:tabular-nums;border:1px solid var(--sc-line)}
.pp5sc-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.9rem}
.pp5sc-input{position:relative}
.pp5sc-input .bi{position:absolute;left:.6rem;top:50%;transform:translateY(-50%);color:var(--sc-muted);font-size:.85rem;pointer-events:none}
.pp5sc-input input{padding-left:1.9rem;font-size:.88rem;border-radius:8px}
.pp5sc-input input:placeholder-shown{border-style:dashed}
.pp5sc-foot{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;justify-content:space-between;padding:.6rem .85rem;border-top:1px solid var(--sc-line)}
.pp5sc-foot small{color:var(--sc-muted);font-size:.8rem}
.pp5sc-save{display:inline-flex;align-items:center;gap:.35rem;font-size:.85rem;font-weight:600;padding:.35rem .8rem;border-radius:8px;
  border:1px solid var(--sc-accent);color:var(--sc-accent);background:transparent}
.pp5sc-save:hover:not(:disabled){background:color-mix(in srgb,var(--sc-accent) 9%,transparent)}
.pp5sc-save:disabled{opacity:.6}
.pp5sc-state{font-size:.8rem}
.pp5sc-state.is-ok{color:var(--sc-ok)} .pp5sc-state.is-err{color:#c2362b}
.pp5sc-empty{padding:.8rem .85rem;font-size:.85rem;color:var(--sc-muted)}
@media (max-width:520px){.pp5sc-row{grid-template-columns:1fr;gap:.3rem}.pp5sc-modes{grid-template-columns:1fr}}`;
    doc.head.appendChild(style);
  }

  function mount(frame) {
    injectStyles();
    const exportBtn = frame.querySelector('#exportBtn');
    const gradeSelect = frame.querySelector('#gradeSelect');
    const classSelect = frame.querySelector('#classSelect');
    const card = exportBtn.closest('.card') || frame;
    const box = doc.createElement('div');
    box.id = 'pp5CoverMode';
    box.className = 'pp5sc';
    box.innerHTML = `<div class="pp5sc-label"><i class="bi bi-files"></i>รูปแบบปก ปพ.5</div>
<div class="pp5sc-modes" role="radiogroup" aria-label="รูปแบบปก ปพ.5">
  <label class="pp5sc-mode"><input type="radio" name="pp5CoverMode" value="class" checked>
    <span class="pp5sc-ico"><i class="bi bi-journal-text"></i></span>
    <span><b>รวมทุกวิชา (รายชั้น)</b><small>ปกเดียว สรุปผลทุกวิชาของห้อง</small></span><i class="bi bi-check-circle-fill pp5sc-check"></i></label>
  <label class="pp5sc-mode"><input type="radio" name="pp5CoverMode" value="subject">
    <span class="pp5sc-ico"><i class="bi bi-journals"></i></span>
    <span><b>แบบบันทึกผลการเรียนประจำรายวิชา</b><small>หน้าละวิชา มีผลการเรียน คุณลักษณะ และช่องลงนาม</small></span><i class="bi bi-check-circle-fill pp5sc-check"></i></label>
</div>`;
    // ช่องเลือกรายวิชา + ครูผู้สอน อยู่ใต้ชั้น/ห้อง เหนือปุ่มสร้าง (ต้องเลือกห้องก่อน)
    const subjectRow = doc.createElement('div');
    subjectRow.id = 'pp5CoverSubjectBox';
    subjectRow.className = 'pp5sc';
    subjectRow.hidden = true;
    subjectRow.innerHTML = `
  <div class="pp5sc-subject">
    <label for="pp5CoverSubject" class="pp5sc-label"><i class="bi bi-book"></i>รายวิชาที่จะพิมพ์</label>
    <select id="pp5CoverSubject" class="form-select"><option value="all">ทุกวิชาในห้องนี้ (หน้าละวิชา)</option></select>
  </div>
  <div id="pp5CoverTeachers"></div>`;
    // ปพ.5 ไม่ใช้กับอนุบาล (owner 2026-10-14 "ตัวกรองก็ยังมี อนุบาล"): ซ่อน อ.1–อ.3 จากตัวเลือกชั้นของหน้านี้เท่านั้น
    // (หน้าเติมรายการชั้นภายหลังจาก getAvailableGrades ซึ่งหน้าอื่นใช้ร่วม จึงกรองที่นี่ ไม่แก้ที่ต้นทาง)
    const dropKindergarten = () => {
      [...gradeSelect.options].forEach((option) => { if (KINDERGARTEN.test(option.value.trim())) option.remove(); });
    };
    dropKindergarten();
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(dropKindergarten).observe(gradeSelect, { childList: true });
    // รูปแบบปกอยู่ใต้แถบรูปของหน้า (owner 2026-10-14 "นำไปไว้ใต้แถบรูปครับ"): แถบรูปวางก่อนหัวเรื่องเดิม (h4 ที่ถูกซ่อน)
    // จึงวางการ์ดรูปแบบต่อจากหัวเรื่องนั้น — ไม่มีหัวเรื่องก็วางเหนือปุ่มสร้างเหมือนเดิม
    // ชั้นกับห้องอยู่แถวเดียวกัน (owner 2026-10-14 "ชั้นกับห้องควรอยู่แถวเดียวกัน"): ย้ายกล่องเดิมทั้งกล่อง (ป้าย+ช่อง)
    // เข้าแถวเดียว ช่องเลือกเป็นตัวเดิม การทำงานของหน้าไม่เปลี่ยน
    const gradeField = gradeSelect.closest('.mb-3');
    const classField = classSelect.closest('.mb-3');
    if (gradeField && classField && gradeField !== classField && gradeField.parentElement === classField.parentElement) {
      const pair = doc.createElement('div');
      pair.className = 'pp5sc-pair';
      gradeField.before(pair);
      pair.append(gradeField, classField);
    }
    const buttonRow = exportBtn.closest('.d-grid');
    const title = [...frame.querySelectorAll('h4')].find((h) => h.textContent.includes('(ปพ.5)'));
    if (title) title.after(box); else if (buttonRow) buttonRow.before(box); else exportBtn.before(box);
    if (buttonRow) buttonRow.before(subjectRow); else exportBtn.before(subjectRow);
    const subjectSelect = subjectRow.querySelector('#pp5CoverSubject');
    const originalLabel = exportBtn.innerHTML;
    const mode = () => box.querySelector('input[name="pp5CoverMode"]:checked')?.value || 'class';

    const teacherBox = subjectRow.querySelector('#pp5CoverTeachers');
    let loadToken = 0;

    // ครูผู้สอนแยกตามห้อง (owner 2026-10-14 "เลือกแยกได้"): ค่าเริ่มต้นคือครูผู้สอนในหน้ารายวิชา  เลือกจากรายชื่อครู
    // หรือพิมพ์เองได้  ผู้ดูแลระบบกดบันทึกให้ห้องนี้ใช้ทุกครั้ง  ครูทั่วไปแก้ได้เฉพาะการพิมพ์ครั้งนี้
    function renderTeachers(info, room) {
      if (!info.subjects.length) { teacherBox.innerHTML = '<div class="pp5sc-teachers"><div class="pp5sc-empty">ชั้นนี้ยังไม่มีรายวิชา</div></div>'; return; }
      const rows = info.subjects.map((s) => `<li class="pp5sc-row" data-row="${esc(s.id)}">
  <span class="pp5sc-subj">${s.code ? `<span class="pp5sc-code">${esc(s.code)}</span>` : ''}<span class="pp5sc-name" title="${esc(s.name)}">${esc(s.name)}</span></span>
  <span class="pp5sc-input"><i class="bi bi-person"></i><input class="form-control form-control-sm" list="pp5CoverTeacherNames" data-subject-id="${esc(s.id)}"
    value="${esc(s.roomTeacher || s.defaultTeacher)}" placeholder="${esc(s.defaultTeacher || 'ยังไม่ระบุ · พิมพ์หรือเลือกชื่อครู')}" aria-label="ครูผู้สอน ${esc(s.name)}"></span>
</li>`).join('');
      const missing = info.subjects.some((s) => !(s.roomTeacher || s.defaultTeacher));
      teacherBox.innerHTML = `<details class="pp5sc-teachers"${missing ? ' open' : ''}>
<summary><i class="bi bi-person-badge"></i>ครูผู้สอนของห้อง ${esc(room)} <span class="pp5sc-chip" data-count></span><i class="bi bi-chevron-down"></i></summary>
<p class="pp5sc-hint">ช่องว่างจะพิมพ์เป็นเส้นจุดในปก · คลิกช่องเพื่อเลือกจากรายชื่อครู หรือพิมพ์ชื่อเองได้</p>
<ul class="pp5sc-list">${rows}</ul>
<datalist id="pp5CoverTeacherNames">${info.names.map((n) => `<option value="${esc(n.name)}">${esc(n.from)}</option>`).join('')}</datalist>
<div class="pp5sc-foot">${info.canSave
    ? '<small>บันทึกแล้ว ห้องนี้จะใช้ชื่อนี้ทุกครั้งที่พิมพ์</small><span class="d-inline-flex align-items-center gap-2"><span class="pp5sc-state" data-save-status></span><button type="button" class="pp5sc-save" data-save-teachers data-pp5-btn-skip><i class="bi bi-save"></i>บันทึกครูผู้สอนของห้องนี้</button></span>'
    : '<small>ชื่อที่แก้ตรงนี้ใช้กับการพิมพ์ครั้งนี้ · ผู้ดูแลระบบบันทึกให้ใช้ทุกครั้งได้</small>'}</div>
</details>`;
      updateTeacherSummary();
    }
    function updateTeacherSummary() {
      const chip = teacherBox.querySelector('[data-count]');
      const inputs = teacherInputs();
      const filled = inputs.filter((input) => input.value.trim()).length;
      if (chip) {
        chip.textContent = `ระบุแล้ว ${filled}/${inputs.length}`;
        chip.classList.toggle('is-done', filled === inputs.length);
      }
      const picked = subjectSelect.value;
      teacherBox.querySelectorAll('[data-row]').forEach((row) => row.classList.toggle('is-picked', picked !== 'all' && row.dataset.row === picked));
    }
    const teacherInputs = () => [...teacherBox.querySelectorAll('input[data-subject-id]')];
    const teacherOverrides = () => Object.fromEntries(teacherInputs().map((input) => [input.dataset.subjectId, input.value.trim()]).filter(([, name]) => name));

    async function loadSubjects() {
      const grade = gradeSelect.value;
      const room = classSelect.value;
      const token = ++loadToken;
      subjectSelect.innerHTML = '<option value="all">ทุกวิชาในห้องนี้ (หน้าละวิชา)</option>';
      teacherBox.innerHTML = '';
      if (!grade || !global.GasServer?.getPp5CoverSubjects) return;
      try {
        if (room && global.GasServer.getPp5SubjectRoomTeachers) {
          const info = await global.GasServer.getPp5SubjectRoomTeachers(grade, room);
          if (token !== loadToken) return;
          subjectSelect.insertAdjacentHTML('beforeend', info.subjects.map((s) => `<option value="${esc(s.id)}">${esc([s.code, s.name].filter(Boolean).join(' '))}</option>`).join(''));
          renderTeachers(info, `${grade}/${room}`);
          return;
        }
        const list = await global.GasServer.getPp5CoverSubjects(grade);
        if (token !== loadToken) return;
        subjectSelect.insertAdjacentHTML('beforeend', list.map((s) => `<option value="${esc(s.id)}">${esc([s.code, s.name].filter(Boolean).join(' '))}</option>`).join(''));
      } catch (_) { /* the page shows its own errors on export */ }
    }
    teacherBox.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-save-teachers]');
      if (!button) return;
      const status = teacherBox.querySelector('[data-save-status]');
      const teachers = Object.fromEntries(teacherInputs().map((input) => [input.dataset.subjectId, input.value.trim()]));
      button.disabled = true;
      if (status) { status.className = 'pp5sc-state'; status.textContent = 'กำลังบันทึก…'; }
      try {
        await global.GasServer.savePp5SubjectRoomTeachers(gradeSelect.value, classSelect.value, teachers);
        if (status) { status.className = 'pp5sc-state is-ok'; status.innerHTML = '<i class="bi bi-check-circle-fill"></i> บันทึกแล้ว'; }
      } catch (error) {
        if (status) { status.className = 'pp5sc-state is-err'; status.textContent = error?.message || String(error); }
      } finally {
        button.disabled = false;
      }
    });
    teacherBox.addEventListener('input', updateTeacherSummary);
    subjectSelect.addEventListener('change', updateTeacherSummary);
    const applyMode = () => {
      const subject = mode() === 'subject';
      subjectRow.hidden = !subject;
      exportBtn.innerHTML = subject ? '<i class="bi bi-file-earmark-pdf me-2"></i>สร้าง PDF แบบรายวิชา' : originalLabel;
      if (subject) loadSubjects();
    };
    box.querySelectorAll('input[name="pp5CoverMode"]').forEach((radio) => radio.addEventListener('change', applyMode));
    gradeSelect.addEventListener('change', () => { if (mode() === 'subject') loadSubjects(); });
    classSelect.addEventListener('change', () => { if (mode() === 'subject') loadSubjects(); });

    // แบบรายวิชา: รับการกดปุ่มก่อนตัวจัดการเดิมของหน้า (capture ที่การ์ดซึ่งอยู่เหนือปุ่ม)
    card.addEventListener('click', async (event) => {
      if (mode() !== 'subject' || !event.target.closest('#exportBtn')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      // สถานะแบบเดียวกับปกเดิม (owner 2026-10-14 "เวลากดสร้าง ไม่มีสถานะแจ้งบอกผู้ใช้"): ปุ่มขึ้น "กำลังสร้าง…",
      // ม่านโหลดของหน้า + ข้อความใต้ปุ่ม แล้วค่อยเปิดไฟล์เมื่อเสร็จ — ไม่เปิดแท็บว่างไว้ก่อน (แท็บว่างแย่งหน้าจอจนไม่เห็นสถานะ)
      const status = frame.querySelector('#status');
      const overlay = frame.querySelector('#loadingOverlay');
      const overlayText = overlay?.querySelector('.mt-2');
      const overlayOriginal = overlayText?.textContent;
      const say = (html, type) => {
        if (status) status.innerHTML = `<div class="status-${type || 'processing'}${type ? '' : ' pulse'}">${html}</div>`;
      };
      if (!gradeSelect.value || !classSelect.value) { say('<i class="bi bi-exclamation-triangle me-1"></i>กรุณาเลือกระดับชั้นและห้องก่อน', 'warning'); return; }
      if (exportBtn.dataset.busy === '1') return;
      const all = (subjectSelect.value || 'all') === 'all';
      const what = all ? `ทุกวิชา (${Math.max(0, subjectSelect.options.length - 1)} วิชา)` : subjectSelect.options[subjectSelect.selectedIndex]?.textContent || '';
      const message = `กำลังสร้าง PDF แบบรายวิชา ${what} ห้อง ${gradeSelect.value}/${classSelect.value} กรุณารอสักครู่…`;
      exportBtn.dataset.busy = '1';
      exportBtn.disabled = true;
      exportBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>กำลังสร้าง…';
      if (overlayText) overlayText.textContent = message;
      if (overlay) overlay.style.display = 'flex';
      say(`<i class="bi bi-hourglass-split me-1"></i>${esc(message)}`);
      try {
        const url = await global.GasServer.exportPp5SubjectCoverPDF(gradeSelect.value, classSelect.value, subjectSelect.value || 'all', teacherOverrides());
        if (!url) throw new Error('ไม่ได้รับไฟล์ PDF');
        say(`<i class="bi bi-check-circle-fill me-1"></i>สร้าง PDF สำเร็จ · <a href="${esc(url)}" target="_blank" class="text-success fw-bold">คลิกเพื่อเปิดไฟล์ PDF</a>`, 'success');
        global.open(url, '_blank');
      } catch (error) {
        say(`<i class="bi bi-exclamation-triangle-fill me-1"></i>สร้าง PDF ไม่สำเร็จ: ${esc(error?.message || error)}`, 'error');
      } finally {
        delete exportBtn.dataset.busy;
        exportBtn.disabled = false;
        exportBtn.innerHTML = mode() === 'subject' ? '<i class="bi bi-file-earmark-pdf me-2"></i>สร้าง PDF แบบรายวิชา' : originalLabel;
        if (overlay) overlay.style.display = 'none';
        if (overlayText && overlayOriginal) overlayText.textContent = overlayOriginal;
      }
    }, true);
  }

  function apply() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.querySelector('#pp5CoverMode') || !isCoverPage(frame)) return;
    mount(frame);
  }
  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5SubjectCover) return;
    frame.__pp5SubjectCover = true;
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(apply).observe(frame, { childList: true, subtree: true });
    apply();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
  global.PP5SubjectCover = { apply };
})(window);
