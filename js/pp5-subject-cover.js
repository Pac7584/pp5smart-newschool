// หน้า "ปก ปพ.5" (pp5_cover_page) กับ "ปพ.5 แบบรายวิชา" (pp5_subject_book) ใช้แม่แบบหน้าเดียวกัน
// (owner 2026-10-14: "ป้องกันความสับสน ... ในเมนูการใช้งานควรแยก" + "พิมพ์ ปพ.5 รายวิชารวมเล่มด้วย ไม่ใช่พิมพ์ได้แค่ปก")
//   - ทั้งสองหน้า: ซ่อนชั้นอนุบาล, ชั้นกับห้องอยู่แถวเดียวกัน
//   - ปก ปพ.5: แบบรวมชั้นอย่างเดียว ใช้ปุ่มและการทำงานเดิมของแม่แบบ
//   - ปพ.5 แบบรายวิชา: เลือกวิชา (หรือทุกวิชา วิชาละเล่ม) + ครูผู้สอนแยกห้อง + ส่วนของเล่ม แล้วเรียก
//     GasServer.exportPp5SubjectBookPDF (gas-bridge computePp5SubjectSheets -> pdf-export createPp5SubjectCover)
(function initPp5SubjectCover(global) {
  'use strict';
  const doc = global.document;
  const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
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
.pp5sc-progress{width:min(460px,90vw);margin:0 auto;padding:18px 20px;border-radius:16px;background:rgba(15,23,42,.92);box-shadow:0 18px 40px rgba(0,0,0,.35);text-align:left;color:#fff}
.pp5sc-progress-title{font-weight:700;font-size:1rem;line-height:1.4;margin-bottom:10px}
.pp5sc-progress-top{display:flex;align-items:baseline;gap:10px;margin-bottom:6px}
.pp5sc-progress-top b{font-size:1.6rem;font-variant-numeric:tabular-nums;min-width:3.2ch}
.pp5sc-progress-top span{font-size:.92rem;opacity:.95}
.pp5sc-progress-track{height:12px;border-radius:999px;background:rgba(255,255,255,.25);overflow:hidden}
.pp5sc-progress-fill{height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#a78bfa,#34d399);transition:width .25s ease}
.pp5sc{--sc-line:#e3e6ee;--sc-muted:#5b6275;--sc-soft:#f6f7fb;--sc-card:#fff;--sc-text:#1f2937;--sc-accent:var(--primary,#4f46e5);
  --sc-warn:#a15c00;--sc-warn-bg:#fff4e0;--sc-ok:#13795b;--sc-ok-bg:#e6f6ef;margin-bottom:1rem;color:var(--sc-text)}
[data-theme="dark"] .pp5sc{--sc-line:#2b3446;--sc-muted:#a7afbd;--sc-soft:#161d2b;--sc-card:#1b2232;--sc-text:#e5e7eb;
  --sc-warn:#ffc46b;--sc-warn-bg:rgba(255,196,107,.12);--sc-ok:#6fe0b4;--sc-ok-bg:rgba(111,224,180,.12)}
.pp5sc-label{display:flex;align-items:center;gap:.4rem;font-weight:600;margin-bottom:.5rem}
.pp5sc-parts{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.5rem}
.pp5sc-part{display:flex;gap:.6rem;align-items:flex-start;padding:.6rem .75rem;border:1.5px solid var(--sc-line);border-radius:12px;
  background:var(--sc-card);cursor:pointer;transition:border-color .15s,background .15s}
.pp5sc-part input{margin-top:.25rem;width:1.05rem;height:1.05rem;accent-color:var(--sc-accent);flex:none}
.pp5sc-part:has(input:checked){border-color:var(--sc-accent);background:color-mix(in srgb,var(--sc-accent) 6%,var(--sc-card))}
.pp5sc-part:has(input:disabled){opacity:.55;cursor:not-allowed}
.pp5sc-part b{display:block;font-size:.92rem;line-height:1.3}
.pp5sc-part small{display:block;color:var(--sc-muted);font-size:.78rem;line-height:1.35;margin-top:.1rem}
.pp5sc-subject{margin-top:.2rem}
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
.card.pp5sc-wide{max-width:1180px!important;padding:1.4rem!important}
.pp5sc-layout{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:20px;align-items:start}
.pp5sc-col{border:1px solid var(--sc-line);border-radius:16px;padding:18px;background:var(--sc-card)}
.pp5sc-col>.mb-3,.pp5sc-col>.api-check{margin-top:0}
.pp5sc-step{display:flex;align-items:center;gap:10px;font-weight:800;font-size:1.05rem;margin-bottom:14px}
.pp5sc-step>span:first-child{width:30px;height:30px;border-radius:50%;background:var(--sc-accent);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:.92rem;flex:none}
.pp5sc-step .pp5sc-all{margin-left:auto;display:inline-flex;gap:6px}
.pp5sc-all button{border:1px solid var(--sc-line);background:var(--sc-card);color:var(--sc-text);border-radius:999px;font-size:.8rem;font-weight:600;padding:.2rem .7rem}
.pp5sc-wide .pp5sc-parts{grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem}
.pp5sc-wide .pp5sc-part{padding:.85rem .9rem;min-height:84px;align-items:center}
.pp5sc-part .pp5sc-ico{flex:none;width:40px;height:40px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-size:1.2rem;
  background:color-mix(in srgb,var(--sc-accent) 10%,var(--sc-card));color:var(--sc-accent)}
.pp5sc-part:has(input:checked) .pp5sc-ico{background:var(--sc-accent);color:#fff}
.pp5sc-summary{display:flex;align-items:center;gap:8px;margin:14px 0 10px;padding:.6rem .8rem;border-radius:12px;background:var(--sc-soft);font-size:.9rem}
.pp5sc-summary b{color:var(--sc-accent)}
.pp5sc-wide #exportBtn{min-height:52px;font-size:1.05rem;border-radius:12px}
.pp5sc-wide #status{margin-top:.8rem!important}
@media (max-width:991px){.pp5sc-layout{grid-template-columns:1fr}}
@media (max-width:520px){.pp5sc-row{grid-template-columns:1fr;gap:.3rem}.pp5sc-parts,.pp5sc-wide .pp5sc-parts{grid-template-columns:1fr}.pp5sc-col{padding:14px}
  .pp5sc-step{flex-wrap:wrap}.pp5sc-step .pp5sc-all{margin-left:40px;width:100%}.card.pp5sc-wide{padding:.9rem!important}}`;
    doc.head.appendChild(style);
  }

  function mount(frame, page) {
    injectStyles();
    const exportBtn = frame.querySelector('#exportBtn');
    const gradeSelect = frame.querySelector('#gradeSelect');
    const classSelect = frame.querySelector('#classSelect');
    const card = exportBtn.closest('.card') || frame;
    const book = page === 'pp5_subject_book';
    frame.dataset.pp5SubjectMounted = page;

    // ปพ.5 ไม่ใช้กับอนุบาล (owner 2026-10-14 "ตัวกรองก็ยังมี อนุบาล"): ซ่อน อ.1–อ.3 จากตัวเลือกชั้นของหน้านี้เท่านั้น
    // (หน้าเติมรายการชั้นภายหลังจาก getAvailableGrades ซึ่งหน้าอื่นใช้ร่วม จึงกรองที่นี่ ไม่แก้ที่ต้นทาง)
    const dropKindergarten = () => {
      [...gradeSelect.options].forEach((option) => { if (KINDERGARTEN.test(option.value.trim())) option.remove(); });
    };
    dropKindergarten();
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(dropKindergarten).observe(gradeSelect, { childList: true });
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
    // แยกเมนู (owner 2026-10-14 "ป้องกันความสับสน ... ควรแยก"): หน้า "ปก ปพ.5" (pp5_cover_page) = แบบรวมชั้นอย่างเดียว
    // หน้า "ปพ.5 แบบรายวิชา" (pp5_subject_book) ใช้แม่แบบเดียวกันแต่เป็นแบบรายวิชาเสมอ + เลือกส่วนของเล่มได้
    if (!book) return;

    const box = doc.createElement('div');
    box.id = 'pp5SubjectBook';
    box.className = 'pp5sc';
    // หน้ากว้าง 2 คอลัมน์ (owner 2026-10-23 "หน้า modal มันเล็กไปไหม จัดเรียงใหม่ให้ดูสวยงาม"): ซ้าย = 1 เลือกห้องและวิชา (+ ครูผู้สอน)
    // ขวา = 2 เลือกส่วนที่จะพิมพ์ + สรุป + ปุ่มสร้าง · จอแคบเรียงเป็นคอลัมน์เดียว
    box.innerHTML = `<div class="pp5sc-layout">
<section class="pp5sc-col" data-col="setup"><div class="pp5sc-step"><span>1</span>เลือกห้องและรายวิชา</div>
  <div class="pp5sc-subject">
    <label for="pp5CoverSubject" class="pp5sc-label"><i class="bi bi-book"></i>รายวิชาที่จะพิมพ์</label>
    <select id="pp5CoverSubject" class="form-select"><option value="all">ทุกวิชาในห้องนี้ (วิชาละเล่ม ต่อกัน)</option></select>
  </div>
  <div id="pp5CoverTeachers"></div>
</section>
<section class="pp5sc-col" data-col="parts"><div class="pp5sc-step"><span>2</span>เลือกส่วนที่จะพิมพ์ในเล่ม
  <span class="pp5sc-all"><button type="button" data-pp5-btn-skip data-parts-all="1">เลือกทั้งหมด</button><button type="button" data-pp5-btn-skip data-parts-all="0">ล้าง</button></span></div>
  <div class="pp5sc-parts">
    <label class="pp5sc-part"><input type="checkbox" data-part="cover" checked><i class="bi bi-journal-richtext pp5sc-ico" aria-hidden="true"></i><span><b>ปก + เวลาเรียน</b><small>แบบบันทึกผลการเรียนประจำรายวิชา · สรุปเวลาเรียนรายคน</small></span></label>
    <label class="pp5sc-part"><input type="checkbox" data-part="monthly" checked><i class="bi bi-calendar3 pp5sc-ico" aria-hidden="true"></i><span><b>บันทึกเวลาเรียนรายเดือน</b><small>หน้าละเดือน ✓ ล ข ตามวันที่สอน (ต้องเลือกปก + เวลาเรียน)</small></span></label>
    <label class="pp5sc-part"><input type="checkbox" data-part="scores" checked><i class="bi bi-123 pp5sc-ico" aria-hidden="true"></i><span><b>บันทึกคะแนนรายครั้ง</b><small>ภาคละหน้า คะแนนครั้งที่ 1–9 ระหว่างภาค ปลายภาค เกรด + สรุปทั้งปี</small></span></label>
    <label class="pp5sc-part"><input type="checkbox" data-part="rtw" checked><i class="bi bi-book-half pp5sc-ico" aria-hidden="true"></i><span><b>อ่าน คิดวิเคราะห์ และเขียน</b><small>ผลรายคนของกลุ่มสาระวิชานี้</small></span></label>
    <label class="pp5sc-part"><input type="checkbox" data-part="character" checked><i class="bi bi-heart pp5sc-ico" aria-hidden="true"></i><span><b>คุณลักษณะอันพึงประสงค์</b><small>8 ข้อ รายคน + สรุปผล</small></span></label>
  </div>
  <div class="pp5sc-summary" data-summary></div>
</section></div>`;
    const buttonRow = exportBtn.closest('.d-grid');
    if (buttonRow) buttonRow.before(box); else exportBtn.before(box);
    card.classList.add('pp5sc-wide');
    // ย้ายส่วนของแม่แบบเดิมเข้าคอลัมน์ (ตัวเดิม ตัวจัดการเหตุการณ์เดิมยังทำงาน): สถานะระบบ + ชั้น/ห้อง ไปซ้ายบน · ปุ่มสร้าง + ข้อความสถานะ ไปขวาล่าง
    const setupCol = box.querySelector('[data-col="setup"]');
    const partsCol = box.querySelector('[data-col="parts"]');
    const setupStep = setupCol.querySelector('.pp5sc-step');
    [frame.querySelector('#apiCheck'), gradeSelect.closest('.pp5sc-pair') || gradeSelect.closest('.mb-3')].filter(Boolean).reverse()
      .forEach((el) => setupStep.after(el));
    if (buttonRow) partsCol.append(buttonRow);
    const statusBox = frame.querySelector('#status');
    if (statusBox) partsCol.append(statusBox);
    const subjectSelect = box.querySelector('#pp5CoverSubject');
    const teacherBox = box.querySelector('#pp5CoverTeachers');
    const partBox = (name) => box.querySelector(`[data-part="${name}"]`);
    const syncMonthly = () => { partBox('monthly').disabled = !partBox('cover').checked; };
    partBox('cover').addEventListener('change', syncMonthly);
    const PART_NAMES = { cover: 'ปก + เวลาเรียน', monthly: 'เวลาเรียนรายเดือน', scores: 'คะแนนรายครั้ง', rtw: 'อ่าน คิดวิเคราะห์ฯ', character: 'คุณลักษณะ' };
    const summaryBox = box.querySelector('[data-summary]');
    function updatePartSummary() {
      const chosen = Object.keys(PART_NAMES).filter((name) => partBox(name).checked && !partBox(name).disabled);
      const subjectText = (subjectSelect.value || 'all') === 'all' ? 'ทุกวิชาในห้อง' : (subjectSelect.options[subjectSelect.selectedIndex]?.textContent || '');
      const room = gradeSelect.value && classSelect.value ? ` ห้อง ${esc(gradeSelect.value)}/${esc(classSelect.value)}` : '';
      summaryBox.innerHTML = chosen.length
        ? `<i class="bi bi-printer"></i><span>จะพิมพ์ <b>${chosen.length} ส่วน</b> · ${esc(subjectText)}${room}<br><small>${chosen.map((n) => PART_NAMES[n]).join(' · ')}</small></span>`
        : '<i class="bi bi-exclamation-circle"></i><span>ยังไม่ได้เลือกส่วนที่จะพิมพ์</span>';
    }
    box.addEventListener('change', updatePartSummary);
    box.addEventListener('click', (event) => {
      const all = event.target.closest('[data-parts-all]');
      if (!all) return;
      Object.keys(PART_NAMES).forEach((name) => { partBox(name).checked = all.dataset.partsAll === '1'; });
      syncMonthly();
      updatePartSummary();
    });
    gradeSelect.addEventListener('change', updatePartSummary);
    classSelect.addEventListener('change', updatePartSummary);
    const bookLabel = '<i class="bi bi-file-earmark-pdf me-2"></i>สร้าง PDF ปพ.5 แบบรายวิชา';
    exportBtn.innerHTML = bookLabel;
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
      subjectSelect.innerHTML = '<option value="all">ทุกวิชาในห้องนี้ (วิชาละเล่ม ต่อกัน)</option>';
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
    updatePartSummary();
    gradeSelect.addEventListener('change', loadSubjects);
    classSelect.addEventListener('change', loadSubjects);
    loadSubjects();

    // รับการกดปุ่มก่อนตัวจัดการเดิมของแม่แบบ (capture ที่การ์ดซึ่งอยู่เหนือปุ่ม) — แม่แบบเดิมสร้างปกรวมชั้น
    card.addEventListener('click', async (event) => {
      if (!event.target.closest('#exportBtn')) return;
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
      const parts = { cover: partBox('cover').checked, scores: partBox('scores').checked, rtw: partBox('rtw').checked, character: partBox('character').checked };
      if (!Object.values(parts).some(Boolean)) { say('<i class="bi bi-exclamation-triangle me-1"></i>เลือกอย่างน้อย 1 ส่วนที่จะพิมพ์', 'warning'); return; }
      if (exportBtn.dataset.busy === '1') return;
      const all = (subjectSelect.value || 'all') === 'all';
      const count = Math.max(0, subjectSelect.options.length - 1);
      const what = all ? (count ? `ทุกวิชา (${count} วิชา)` : 'ทุกวิชา') : subjectSelect.options[subjectSelect.selectedIndex]?.textContent || '';
      const message = `กำลังสร้าง PDF ปพ.5 แบบรายวิชา ${what} ห้อง ${gradeSelect.value}/${classSelect.value} กรุณารอสักครู่…`;
      exportBtn.dataset.busy = '1';
      exportBtn.disabled = true;
      // แถบความคืบหน้า 0-100% แทนวงกลมหมุน (owner 2026-10-23 "ไม่อยากได้แบบสปินเนอร์ ขอเป็นแถบที่แสดงสถานะเปอร์เซ็นต์")
      const spinner = overlay?.querySelector('.spinner-border');
      if (spinner) spinner.hidden = true;
      const bar = doc.createElement('div');
      bar.className = 'pp5sc-progress';
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.innerHTML = `<div class="pp5sc-progress-title">${esc(message)}</div><div class="pp5sc-progress-top"><b data-pct>0%</b><span data-step>เริ่มต้น…</span></div><div class="pp5sc-progress-track"><div class="pp5sc-progress-fill" data-fill></div></div>`;
      // การ์ดพื้นเข้มอ่านง่ายบนม่านโหลด · ข้อความเดิมของม่านซ่อนไว้ระหว่างสร้าง
      if (overlayText) { overlayText.hidden = true; overlayText.after(bar); } else overlay?.appendChild(bar);
      let shown = 0;
      const progress = (pct, label) => {
        shown = Math.max(shown, Math.min(100, Math.round(Number(pct) || 0)));
        bar.setAttribute('aria-valuenow', String(shown));
        bar.querySelector('[data-pct]').textContent = `${shown}%`;
        bar.querySelector('[data-fill]').style.width = `${shown}%`;
        if (label) bar.querySelector('[data-step]').textContent = label;
        exportBtn.textContent = `กำลังสร้าง… ${shown}%`;
      };
      progress(0, 'เริ่มต้น…');
      if (overlayText) overlayText.textContent = message;
      if (overlay) overlay.style.display = 'flex';
      say(`<i class="bi bi-hourglass-split me-1"></i>${esc(message)}`);
      try {
        const url = await global.GasServer.exportPp5SubjectBookPDF(gradeSelect.value, classSelect.value, subjectSelect.value || 'all', teacherOverrides(),
          { parts, monthly: partBox('monthly').checked, onProgress: progress });
        if (!url) throw new Error('ไม่ได้รับไฟล์ PDF');
        say(`<i class="bi bi-check-circle-fill me-1"></i>สร้าง PDF สำเร็จ · <a href="${esc(url)}" target="_blank" class="text-success fw-bold">คลิกเพื่อเปิดไฟล์ PDF</a>`, 'success');
        global.open(url, '_blank');
      } catch (error) {
        say(`<i class="bi bi-exclamation-triangle-fill me-1"></i>สร้าง PDF ไม่สำเร็จ: ${esc(error?.message || error)}`, 'error');
      } finally {
        delete exportBtn.dataset.busy;
        exportBtn.disabled = false;
        exportBtn.innerHTML = bookLabel;
        if (overlay) overlay.style.display = 'none';
        if (overlayText && overlayOriginal) overlayText.textContent = overlayOriginal;
        bar.remove();
        if (spinner) spinner.hidden = false;
        if (overlayText) overlayText.hidden = false;
      }
    }, true);
  }

  const currentPage = () => text(global.AppNavigation?.currentPage || doc.body?.getAttribute('data-current-page'));
  function apply() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || !isCoverPage(frame)) return;
    const page = currentPage() === 'pp5_subject_book' ? 'pp5_subject_book' : 'pp5_cover_page';
    if (frame.dataset.pp5SubjectMounted === page && frame.querySelector('.pp5sc-pair')) return;
    mount(frame, page);
  }

  // หน้า "ปพ.5 แบบรายวิชา" ใช้แม่แบบหน้าปก (ช่องชั้น/ห้อง ม่านโหลด สถานะ) + แถบรูปของตัวเอง
  global.GAS_PAGES = global.GAS_PAGES || {};
  if (global.GAS_PAGES.pp5_cover_page && !global.GAS_PAGES.pp5_subject_book) global.GAS_PAGES.pp5_subject_book = global.GAS_PAGES.pp5_cover_page;
  if (global.PP5PageBanner?.PAGES && !global.PP5PageBanner.PAGES.pp5_subject_book) {
    global.PP5PageBanner.PAGES.pp5_subject_book = {
      icon: 'bi-journals', title: 'ปพ.5 แบบรายวิชา',
      sub: 'ปก + เวลาเรียน · บันทึกคะแนนรายครั้ง · อ่านคิดเขียน · คุณลักษณะ — วิชาละเล่ม', hide: '.card.p-4 > h4.text-primary'
    };
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
