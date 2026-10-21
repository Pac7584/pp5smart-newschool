// บันทึกผลแก้ 0 / มส ในหน้ากรอกคะแนน (owner 2026-10-21, SQL 038 score_remediations)
// กติกาโรงเรียน: 0 → สอบแก้ตัวไม่เกิน 2 ครั้ง ผลไม่เกิน 1 · มส → เรียนเพิ่มจนครบแล้วสอบ ผลไม่เกิน 1 · ร → แก้คะแนนแล้วเลือก "ตามคะแนน"
// ป. แก้ที่ "ผลทั้งปี" (ป้ายอยู่ในตาราง "รวม 2 ภาค") · ม. วิชารายภาค แก้ที่ภาคของวิชา (ป้ายอยู่ในตารางภาคนั้น)
//   - รายชื่อที่แก้ได้และประวัติมาจาก gas-bridge getScoreSheetData → window.PP5ScoreSheetRemedies
//   - ป้าย "รอแก้ 0" / "แก้ 1 ครั้ง ยังไม่ผ่าน" / "แก้แล้ว → 1" กดแล้วเปิดหน้าต่างบันทึก · เมนู ▾ ของช่องเกรดมี "บันทึกผลแก้" ด้วย
//   - บันทึก/ยกเลิกครั้งล่าสุด ผ่าน GasServer.saveScoreRemediation / undoScoreRemediation (ฐานข้อมูลตรวจกติกาและสิทธิ์)
//   - คะแนนไม่ถูกแก้ · เอกสาร ปพ.5 / ปพ.6 / SchoolMIS อ่านผลหลังแก้เอง · tools/score-remediation-contract.cjs
(function initScoreRemediation(global) {
  'use strict';
  const doc = global.document;
  const STYLE = `
.pp5-rm-chip{display:block;margin:2px auto 0;padding:0 6px;border:1px solid #f59e0b;border-radius:6px;background:#fffbeb;color:#92400e;font:inherit;font-size:.62rem;font-weight:700;line-height:1.6;white-space:nowrap;cursor:pointer}
.pp5-rm-chip.is-passed{border-color:#16a34a;background:#f0fdf4;color:#15803d}
.pp5-rm-chip.is-failed{border-color:#dc2626;background:#fef2f2;color:#b91c1c}
.pp5-rm-chip:hover,.pp5-rm-chip:focus-visible{outline:2px solid currentColor;outline-offset:1px}
#pp5RmDialog{position:fixed;inset:0;z-index:10090;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.45)}
#pp5RmDialog .pp5-rm-box{width:100%;max-width:440px;max-height:90vh;overflow:auto;background:#fff;border-radius:16px;padding:18px 20px;box-shadow:0 20px 50px rgba(15,23,42,.3);font-size:.92rem;color:#1e293b}
#pp5RmDialog h5{margin:0 0 4px;font-size:1.05rem;font-weight:700}
#pp5RmDialog .pp5-rm-sub{color:#64748b;font-size:.82rem;margin-bottom:12px}
#pp5RmDialog ol{margin:0 0 12px;padding-left:20px}
#pp5RmDialog label{display:block;font-weight:600;margin:10px 0 4px}
#pp5RmDialog .pp5-rm-choice{display:flex;gap:8px}
#pp5RmDialog .pp5-rm-choice label{flex:1;margin:0;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;font-weight:600;cursor:pointer}
#pp5RmDialog .pp5-rm-choice input{margin-right:6px}
#pp5RmDialog input[type=date],#pp5RmDialog input[type=text]{width:100%;padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}
#pp5RmDialog .pp5-rm-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:16px}
#pp5RmDialog .pp5-rm-msg{margin-top:10px;padding:8px 10px;border-radius:8px;font-size:.85rem}
#pp5RmDialog .pp5-rm-msg.is-error{background:#fef2f2;color:#b91c1c}
#pp5RmDialog .pp5-rm-msg.is-ok{background:#f0fdf4;color:#15803d}
[data-theme="dark"] #pp5RmDialog .pp5-rm-box{background:#1b2232;color:#e5e7f5}
[data-theme="dark"] .pp5-rm-chip{background:#3b2f12;color:#fde68a}`;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const remedies = () => global.PP5ScoreSheetRemedies || null;
  const infoOf = (id) => remedies()?.students?.[String(id)] || null;
  const levelLabel = () => (remedies()?.level ? `ภาคเรียนที่ ${remedies().level}` : 'ผลทั้งปี');

  function chipState(info) {
    if (info.passed) return { text: 'แก้แล้ว → 1', cls: 'is-passed' };
    if (info.attempts.length >= 2) return { text: 'แก้ครบ 2 ครั้ง ยังเป็น 0', cls: 'is-failed' };
    if (info.attempts.length) return { text: `แก้ ${info.attempts.length} ครั้ง ยังไม่ผ่าน`, cls: 'is-failed' };
    return { text: `รอแก้ ${info.original}`, cls: '' };
  }

  function installStyle() {
    if (!doc || doc.getElementById('pp5RmStyle')) return;
    const style = doc.createElement('style');
    style.id = 'pp5RmStyle';
    style.textContent = STYLE;
    (doc.head || doc.documentElement).appendChild(style);
  }

  // ป้ายในช่องเกรด: ป. ในตาราง "รวม 2 ภาค" · ม. ในตารางภาคของวิชา (เขียนเฉพาะเมื่อต่าง กัน observer วน)
  function containerId() {
    const level = remedies()?.level;
    return level === 1 ? 'scoreEntryTerm1Container' : level === 2 ? 'scoreEntryTerm2Container' : 'scoreEntryCombinedContainer';
  }
  function paintRow(tr) {
    const cell = tr.querySelector('.score-entry-grade');
    if (!cell) return;
    const info = infoOf(tr.dataset.studentId);
    let chip = cell.querySelector('.pp5-rm-chip');
    if (!info) { if (chip) chip.remove(); return; }
    const state = chipState(info);
    if (!chip) {
      chip = doc.createElement('button');
      chip.type = 'button';
      chip.setAttribute('data-pp5-btn-skip', '');
      chip.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); openDialog(tr.dataset.studentId, nameOf(tr)); });
      cell.appendChild(chip);
    }
    const cls = `pp5-rm-chip ${state.cls}`.trim();
    if (chip.className !== cls) chip.className = cls;
    if (chip.textContent !== state.text) {
      chip.textContent = state.text;
      chip.title = `บันทึกผลแก้ (${levelLabel()}) — ผลเดิม ${info.original}`;
    }
  }
  function apply() {
    if (!doc?.getElementById('scoreEntryPage') || !remedies()) return;
    installStyle();
    doc.getElementById(containerId())?.querySelectorAll('tbody tr[data-student-id]').forEach(paintRow);
  }

  function nameOf(tr) {
    const cells = tr?.cells || tr?.querySelectorAll?.('td') || [];
    return String(cells[2]?.textContent || cells[1]?.textContent || '').trim();
  }
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function thaiDate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return String(iso || '');
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
  }

  function closeDialog() { doc?.getElementById('pp5RmDialog')?.remove(); }

  function dialogHtml(id, name, message) {
    const info = infoOf(id);
    const done = info.passed || info.attempts.length >= 2;
    const how = info.original === 'มส' ? 'เรียนเพิ่มจนเวลาเรียนครบ แล้วสอบ' : 'สอบแก้ตัว (ไม่เกิน 2 ครั้ง)';
    const history = info.attempts.length
      ? `<ol>${info.attempts.map((a) => `<li>ครั้งที่ ${a.attempt}: ได้ <b>${esc(a.grade)}</b> · ${esc(thaiDate(a.date))}${a.note ? ` · ${esc(a.note)}` : ''}</li>`).join('')}</ol>`
      : '<p style="margin:0 0 8px;color:#64748b">ยังไม่เคยบันทึกผลแก้</p>';
    const form = done
      ? `<p class="pp5-rm-msg ${info.passed ? 'is-ok' : 'is-error'}">${info.passed ? 'แก้ผ่านแล้ว ผลสุดท้ายเป็น 1 (เอกสารทุกฉบับใช้ผลนี้)' : 'แก้ครบ 2 ครั้งแล้ว ผลยังเป็น 0 — ต้องเรียนซ้ำรายวิชานี้'}</p>`
      : `<label>ผลครั้งที่ ${info.attempts.length + 1}</label>
        <div class="pp5-rm-choice" role="radiogroup">
          <label><input type="radio" name="pp5RmGrade" value="1" checked>ผ่าน (ได้ 1)</label>
          <label><input type="radio" name="pp5RmGrade" value="0">ยังไม่ผ่าน (0)</label>
        </div>
        <label for="pp5RmDate">วันที่ตัดสิน</label><input type="date" id="pp5RmDate" value="${today()}" max="${today()}">
        <label for="pp5RmNote">หมายเหตุ (ไม่บังคับ)</label><input type="text" id="pp5RmNote" maxlength="200" placeholder="เช่น สอบแก้ตัวด้วยข้อสอบชุด 2">`;
    return `<div class="pp5-rm-box" role="dialog" aria-modal="true" aria-labelledby="pp5RmTitle">
      <h5 id="pp5RmTitle">บันทึกผลแก้ ${esc(info.original)} — ${esc(name || id)}</h5>
      <div class="pp5-rm-sub">${esc(levelLabel())} · ผลเดิม ${esc(info.original)} · ${esc(how)} · ผลที่ได้ไม่เกิน 1 · คะแนนเดิมไม่ถูกแก้</div>
      ${history}${form}
      ${message ? `<div class="pp5-rm-msg ${message.ok ? 'is-ok' : 'is-error'}">${esc(message.text)}</div>` : ''}
      <div class="pp5-rm-actions">
        ${info.attempts.length ? '<button type="button" class="btn btn-sm btn-outline-danger" data-rm="undo">ลบผลครั้งล่าสุด</button>' : ''}
        <button type="button" class="btn btn-sm btn-outline-secondary" data-rm="close">ปิด</button>
        ${done ? '' : '<button type="button" class="btn btn-sm btn-primary" data-rm="save">บันทึกผลแก้</button>'}
      </div></div>`;
  }

  function openDialog(id, name, message) {
    const info = infoOf(id);
    if (!info || !doc) return;
    installStyle();
    let wrap = doc.getElementById('pp5RmDialog');
    if (!wrap) {
      wrap = doc.createElement('div');
      wrap.id = 'pp5RmDialog';
      doc.body.appendChild(wrap);
    }
    wrap.innerHTML = dialogHtml(id, name, message);
    wrap.onclick = (event) => {
      if (event.target === wrap) { closeDialog(); return; }
      const action = event.target.closest?.('[data-rm]')?.getAttribute('data-rm');
      if (action === 'close') closeDialog();
      if (action === 'save') save(id, name, wrap);
      if (action === 'undo') undo(id, name, wrap);
    };
    wrap.querySelector('[data-rm="save"], [data-rm="close"]')?.focus?.();
  }

  function busy(wrap, on) { wrap.querySelectorAll('button').forEach((b) => { b.disabled = on; }); }

  async function save(id, name, wrap) {
    const info = infoOf(id);
    const grade = wrap.querySelector('input[name="pp5RmGrade"]:checked')?.value || '';
    const date = wrap.querySelector('#pp5RmDate')?.value || '';
    const note = wrap.querySelector('#pp5RmNote')?.value || '';
    if (!date) { openDialog(id, name, { ok: false, text: 'กรุณาเลือกวันที่ตัดสิน' }); return; }
    busy(wrap, true);
    try {
      const result = await global.GasServer.saveScoreRemediation(remedies().sheetName, id, info.original, grade, date, note);
      info.attempts.push({ attempt: result.attempt, grade: String(result.new_grade), date, note: note.trim() });
      info.grade = String(result.new_grade);
      info.passed = info.grade === '1';
      apply();
      openDialog(id, name, { ok: true, text: `บันทึกครั้งที่ ${result.attempt} แล้ว — เอกสารใช้ผลนี้ทันที` });
    } catch (error) {
      openDialog(id, name, { ok: false, text: String(error?.message || error) });
    }
  }

  async function undo(id, name, wrap) {
    const info = infoOf(id);
    const last = info.attempts[info.attempts.length - 1];
    if (!last || (typeof global.confirm === 'function' && !global.confirm(`ลบผลแก้ครั้งที่ ${last.attempt} (ได้ ${last.grade}) ของ ${name || id}?`))) return;
    busy(wrap, true);
    try {
      await global.GasServer.undoScoreRemediation(remedies().sheetName, id);
      info.attempts.pop();
      const prev = info.attempts[info.attempts.length - 1];
      info.grade = prev ? prev.grade : '';
      info.passed = info.grade === '1';
      apply();
      openDialog(id, name, { ok: true, text: `ลบผลครั้งที่ ${last.attempt} แล้ว` });
    } catch (error) {
      openDialog(id, name, { ok: false, text: String(error?.message || error) });
    }
  }

  // เมนู ▾ ของช่องเกรด (js/score-special-grade.js) แสดง "บันทึกผลแก้" ให้นักเรียนที่มีผล 0 / มส
  global.PP5ScoreMenuExtra = (tr) => {
    const info = infoOf(tr?.dataset?.studentId);
    if (!info) return [];
    return [{ label: info.passed ? 'ดูผลแก้' : 'บันทึกผลแก้', hint: `${levelLabel()} · ผลเดิม ${info.original} → ${chipState(info).text}`, run: () => openDialog(tr.dataset.studentId, nameOf(tr)) }];
  };

  function watch() {
    const frame = doc?.getElementById('contentFrame');
    if (!frame || frame.__pp5Rm) return;
    frame.__pp5Rm = true;
    let timer = null;
    if (typeof global.MutationObserver === 'function') {
      new global.MutationObserver(() => { global.clearTimeout(timer); timer = global.setTimeout(apply, 80); }).observe(frame, { childList: true, subtree: true });
    }
    doc.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDialog(); });
    apply();
  }

  global.PP5ScoreRemediation = { apply, openDialog, chipState };
  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
    else watch();
  }
})(window);
