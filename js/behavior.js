// บันทึกพฤติกรรม / คะแนนความประพฤติ (behavior_records).
//
// Owner decisions (2026-10-05): every student starts each academic year at the start score
// (default 100); deductions and additions are both recorded and the total never goes above
// the start or below 0; every teacher may record for any student; a teacher deletes only
// rows they recorded, an admin any row (enforced by RLS in
// supabase/migrations/202610050020_behavior_records.sql); parents read their own child only.
// The start score and category lists live in school_settings.settings_json.behavior.
// Until that migration is applied the page explains what to install and the parent button
// stays hidden — nothing here falls back to fake data.
(function (global) {
  'use strict';

  const TABLE = 'behavior_records';
  const MIGRATION = 'supabase/migrations/202610050020_behavior_records.sql';
  const PAGE_SIZE = 1000;
  const DEFAULTS = {
    start: 100,
    deduct: ['มาสาย', 'แต่งกายผิดระเบียบ', 'ไม่ส่งงาน', 'ทะเลาะวิวาท', 'ใช้วาจาไม่สุภาพ', 'ทำลายทรัพย์สิน'],
    add: ['จิตอาสา', 'ช่วยเหลือผู้อื่น', 'เก็บของได้ส่งคืน']
  };

  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const esc = (v) => txt(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const thaiDate = (iso) => { try { return new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); } catch (_) { return txt(iso); } };

  function pp5() {
    const d = global.PP5Data;
    if (!d?.client) throw new Error('ระบบฐานข้อมูลยังโหลดไม่เสร็จ กรุณาโหลดหน้าเว็บใหม่');
    return d;
  }

  const isMissingTable = (e) => /42P01|PGRST205|does not exist|Could not find the table|schema cache/i.test(`${e?.code || ''} ${e?.message || ''}`);
  function tableError(error, action) {
    if (isMissingTable(error)) {
      const e = new Error(`ยังไม่ได้ติดตั้งตารางบันทึกพฤติกรรม — ผู้ดูแลระบบต้องรัน ${MIGRATION} ใน Supabase SQL Editor ก่อน`);
      e.code = 'MIGRATION_REQUIRED';
      return e;
    }
    return new Error(`${action}ไม่สำเร็จ: ${error?.message || error}`);
  }

  // ───────────────────────── pure helpers (exposed for tests) ─────────────────────────
  function cleanList(value, fallback) {
    const list = (Array.isArray(value) ? value : txt(value).split(/\r?\n/)).map(txt).filter((v) => v && v.length <= 100);
    return list.length ? [...new Set(list)] : fallback.slice();
  }

  function normalizeSettings(raw) {
    const start = Number(raw?.start);
    return {
      start: Number.isInteger(start) && start >= 1 && start <= 1000 ? start : DEFAULTS.start,
      deduct: cleanList(raw?.deduct, DEFAULTS.deduct),
      add: cleanList(raw?.add, DEFAULTS.add)
    };
  }

  // Total for one student: start − deductions + additions, never above start or below 0.
  function scoreOf(records, start) {
    let deducted = 0;
    let added = 0;
    (records || []).forEach((r) => {
      const points = Number(r.points) || 0;
      if (r.kind === 'deduct') deducted += points;
      else if (r.kind === 'add') added += points;
    });
    return { deducted, added, count: (records || []).length, score: Math.max(0, Math.min(start, start - deducted + added)) };
  }

  function validateEntry(entry) {
    const kind = txt(entry.kind);
    if (kind !== 'deduct' && kind !== 'add') throw new Error('กรุณาเลือก หักคะแนน หรือ เพิ่มคะแนน');
    const points = Number(entry.points);
    if (!Number.isInteger(points) || points < 1 || points > 100) throw new Error('คะแนนต้องเป็นจำนวนเต็ม 1–100');
    const category = txt(entry.category);
    if (!category || category.length > 100) throw new Error('กรุณาเลือกหรือพิมพ์เรื่อง (ไม่เกิน 100 ตัวอักษร)');
    const note = txt(entry.note);
    if (note.length > 500) throw new Error('หมายเหตุยาวเกิน 500 ตัวอักษร');
    const occurredOn = txt(entry.occurredOn) || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) throw new Error('วันที่ไม่ถูกต้อง');
    const year = txt(entry.academicYear);
    if (!/^\d{4}$/.test(year)) throw new Error('ปีการศึกษาไม่ถูกต้อง');
    const ids = [...new Set((entry.studentIds || []).map(txt).filter(Boolean))];
    if (!ids.length) throw new Error('กรุณาเลือกนักเรียนอย่างน้อย 1 คน');
    return { kind, points, category, note: note || null, occurredOn, year, ids };
  }

  // ───────────────────────── data access ─────────────────────────
  async function currentUser() {
    const state = await pp5().auth.requireUser();
    return { id: state.user?.id, role: txt(state.profile?.role).toLowerCase(), name: txt(state.profile?.display_name || state.profile?.displayName || state.profile?.username) };
  }

  async function requireStaff() {
    const user = await currentUser();
    if (user.role !== 'admin' && user.role !== 'teacher') throw new Error('เฉพาะครูและผู้ดูแลระบบ');
    return user;
  }

  async function readSettingsRow() {
    const { data, error } = await pp5().client.from('school_settings').select('id, settings_json').limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
  }

  async function getSettings() {
    try { return normalizeSettings((await readSettingsRow())?.settings_json?.behavior); } catch (_) { return normalizeSettings(null); }
  }

  async function saveSettings(next) {
    const user = await currentUser();
    if (user.role !== 'admin') throw new Error('เฉพาะผู้ดูแลระบบ');
    const clean = normalizeSettings(next);
    const row = await readSettingsRow();
    if (!row?.id) throw new Error('ไม่พบแถวตั้งค่าโรงเรียน');
    const json = { ...(row.settings_json || {}), behavior: clean };
    const { error } = await pp5().client.from('school_settings').update({ settings_json: json }).eq('id', row.id);
    if (error) throw new Error(`บันทึกการตั้งค่าไม่สำเร็จ: ${error.message}`);
    return clean;
  }

  async function readRecords(year, studentIds) {
    const out = [];
    for (let i = 0; i < studentIds.length; i += 150) {
      const chunk = studentIds.slice(i, i + 150);
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await pp5().client.from(TABLE).select('*')
          .eq('academic_year', year).in('student_id', chunk)
          .order('occurred_on', { ascending: false }).order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw tableError(error, 'อ่านบันทึกพฤติกรรม');
        out.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }
    }
    return out;
  }

  async function addRecords(entry) {
    const user = await requireStaff();
    const v = validateEntry(entry);
    const rows = v.ids.map((studentId) => ({
      student_id: studentId, academic_year: v.year, occurred_on: v.occurredOn, kind: v.kind,
      category: v.category, points: v.points, note: v.note, recorded_by: user.id, recorded_by_name: user.name || null
    }));
    const { data, error } = await pp5().client.from(TABLE).insert(rows).select();
    if (error) throw tableError(error, 'บันทึก');
    if (!Array.isArray(data) || data.length !== rows.length) throw new Error('ผลยืนยันการบันทึกไม่ครบ กรุณาโหลดข้อมูลตรวจสอบ');
    return data;
  }

  async function removeRecord(id) {
    await requireStaff();
    const { data, error } = await pp5().client.from(TABLE).delete().eq('id', txt(id)).select('id');
    if (error) throw tableError(error, 'ลบ');
    // RLS filters rows a teacher may not delete, so "0 rows" is a refusal, not a success.
    if (!data || !data.length) throw new Error('ลบไม่ได้ — ลบได้เฉพาะรายการที่ตนเองบันทึก (ผู้ดูแลระบบลบได้ทุกรายการ)');
    return true;
  }

  async function forStudent(studentId, academicYear) {
    const year = txt(academicYear) || txt((await pp5().settings.get())?.academicYear);
    const [records, settings] = await Promise.all([readRecords(year, [txt(studentId)]), getSettings()]);
    return { year, records, settings, ...scoreOf(records, settings.start) };
  }

  // false when the migration has not been applied yet (or the table cannot be read).
  async function isAvailable() {
    try {
      const { error } = await pp5().client.from(TABLE).select('id', { count: 'exact', head: true });
      return !error;
    } catch (_) { return false; }
  }

  // ───────────────────────── styles ─────────────────────────
  function injectStyles() {
    if (document.getElementById('pp5BehaviorStyles')) return;
    const style = document.createElement('style');
    style.id = 'pp5BehaviorStyles';
    style.textContent = `
.pp5bh{max-width:1100px;margin:0 auto;padding:4px 0 32px}
.pp5bh-head{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.pp5bh-head i{font-size:1.6rem;color:#7c3aed}.pp5bh-head h4{margin:0;font-weight:700}
.pp5bh-note{font-size:.85rem;color:#64748b}
.pp5bh-card{background:#fff;border-radius:16px;box-shadow:0 4px 18px rgba(30,27,58,.06);padding:18px;margin-bottom:16px}
.pp5bh-card h5{font-size:1.05rem;font-weight:700;margin:0 0 10px}
.pp5bh-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;align-items:end}
.pp5bh-grid label{font-size:.85rem;font-weight:600;color:#475569;margin-bottom:4px;display:block}
.pp5bh-kind{display:flex;gap:8px;grid-column:1/-1;max-width:380px}.pp5bh-kind label{flex:1;margin:0}
.pp5bh-kind input{display:none}.pp5bh-kind span{display:block;text-align:center;padding:8px;border-radius:10px;border:1px solid #e2e8f0;cursor:pointer;font-weight:600;white-space:nowrap}
.pp5bh-kind input:checked+span.deduct{background:#fdecea;border-color:#ef9a9a;color:#b71c1c}
.pp5bh-kind input:checked+span.add{background:#e8f5e9;border-color:#a5d6a7;color:#1b5e20}
.pp5bh-score{display:inline-block;min-width:48px;padding:2px 10px;border-radius:999px;font-weight:700;text-align:center}
.pp5bh-good{background:#e8f5e9;color:#1b5e20}.pp5bh-mid{background:#fff8e1;color:#8d6e00}.pp5bh-bad{background:#fdecea;color:#b71c1c}
.pp5bh-table td,.pp5bh-table th{vertical-align:middle;white-space:nowrap}.pp5bh-table td.name{white-space:normal;min-width:160px}
.pp5bh-status{padding:12px 14px;border-radius:12px;background:#f1f5f9;color:#475569;margin-bottom:16px}
.pp5bh-status.err{background:#fdecea;color:#b71c1c}.pp5bh-status.ok{background:#e8f5e9;color:#1b5e20}
.pp5bh-hist{list-style:none;padding:0;margin:0}.pp5bh-hist li{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f1f5f9}
.pp5bh-pts{font-weight:700;min-width:44px;text-align:right}.pp5bh-pts.deduct{color:#c62828}.pp5bh-pts.add{color:#2e7d32}
.actions.pp5bh-four{grid-template-columns:repeat(2,1fr)!important}
.act-btn.behavior{background:rgba(124,58,237,.05);border-color:rgba(124,58,237,.18);color:#7c3aed}
.act-btn.behavior:hover{background:#7c3aed;border-color:#7c3aed;color:#fff}
@media (max-width:576px){.pp5bh-card{padding:14px}}
`;
    document.head.appendChild(style);
  }

  const scoreTone = (score, start) => (score >= start * 0.8 ? 'pp5bh-good' : score >= start * 0.6 ? 'pp5bh-mid' : 'pp5bh-bad');

  function historyHtml(records, options = {}) {
    if (!records.length) return '<div class="pp5bh-note">ยังไม่มีบันทึก</div>';
    return '<ul class="pp5bh-hist">' + records.map((r) => {
      const sign = r.kind === 'deduct' ? '−' : '+';
      const canDelete = options.canDelete ? options.canDelete(r) : false;
      return `<li><span class="pp5bh-pts ${esc(r.kind)}">${sign}${esc(r.points)}</span><div style="flex:1"><b>${esc(r.category)}</b>`
        + `<div class="pp5bh-note">${esc(thaiDate(r.occurred_on))}${r.recorded_by_name && options.showRecorder ? ' · บันทึกโดย ' + esc(r.recorded_by_name) : ''}${r.note ? ' · ' + esc(r.note) : ''}</div></div>`
        + (canDelete ? `<button type="button" class="btn btn-sm btn-outline-danger" data-del="${esc(r.id)}" aria-label="ลบรายการ"><i class="bi bi-trash"></i></button>` : '')
        + '</li>';
    }).join('') + '</ul>';
  }

  // ───────────────────────── staff page ─────────────────────────
  const PAGE_HTML = '<div class="pp5bh" id="pp5BehaviorRoot"></div>'
    + '<script>window.PP5Behavior && window.PP5Behavior.mountPage(document.getElementById("pp5BehaviorRoot"));<\/script>';

  function mountPage(root) {
    if (!root) return;
    injectStyles();
    const state = { user: null, settings: normalizeSettings(null), students: [], records: [], year: '', current: '', loading: false };
    root.innerHTML = `
      <div class="pp5bh-head"><i class="bi bi-person-check"></i><div><h4>บันทึกพฤติกรรม</h4>
        <div class="pp5bh-note">คะแนนความประพฤติเริ่มต้นปีละ <b data-start>100</b> คะแนน — หักเมื่อทำผิดระเบียบ เพิ่มเมื่อทำความดี (ไม่เกินคะแนนเริ่มต้น) · ผู้ปกครองเห็นเฉพาะของบุตรตนเอง</div></div></div>
      <div class="pp5bh-status" data-status aria-live="polite">กำลังโหลด...</div>
      <details class="pp5bh-card" data-settings hidden><summary class="fw-semibold">ตั้งค่า (ผู้ดูแลระบบ)</summary>
        <div class="pp5bh-grid mt-3">
          <div><label for="pp5bhStart">คะแนนเริ่มต้นต่อปี</label><input id="pp5bhStart" type="number" min="1" max="1000" class="form-control"></div>
          <div><label for="pp5bhDeductList">เรื่องที่หักคะแนน (บรรทัดละเรื่อง)</label><textarea id="pp5bhDeductList" rows="5" class="form-control"></textarea></div>
          <div><label for="pp5bhAddList">เรื่องที่เพิ่มคะแนน (บรรทัดละเรื่อง)</label><textarea id="pp5bhAddList" rows="5" class="form-control"></textarea></div>
          <div><button type="button" class="btn btn-outline-primary w-100" data-save-settings>บันทึกการตั้งค่า</button></div>
        </div>
      </details>
      <div class="pp5bh-card">
        <div class="pp5bh-grid">
          <div><label for="pp5bhYear">ปีการศึกษา</label><select id="pp5bhYear" class="form-select"></select></div>
          <div><label for="pp5bhGrade">ชั้น</label><select id="pp5bhGrade" class="form-select"></select></div>
          <div><label for="pp5bhRoom">ห้อง</label><select id="pp5bhRoom" class="form-select"></select></div>
          <div><button type="button" class="btn btn-primary w-100" data-load><i class="bi bi-people me-1"></i>แสดงรายชื่อ</button></div>
        </div>
      </div>
      <div data-body hidden>
        <div class="pp5bh-card">
          <h5>บันทึกให้นักเรียนที่เลือก (<span data-picked>0</span> คน)</h5>
          <div class="pp5bh-grid">
            <div class="pp5bh-kind"><label><input type="radio" name="pp5bhKind" value="deduct" checked><span class="deduct">หักคะแนน</span></label>
              <label><input type="radio" name="pp5bhKind" value="add"><span class="add">เพิ่มคะแนน</span></label></div>
            <div><label for="pp5bhCategory">เรื่อง</label><select id="pp5bhCategory" class="form-select"></select>
              <input id="pp5bhOther" class="form-control mt-1" maxlength="100" placeholder="พิมพ์เรื่องอื่น" hidden></div>
            <div><label for="pp5bhPoints">คะแนน</label><input id="pp5bhPoints" type="number" min="1" max="100" value="5" class="form-control"></div>
            <div><label for="pp5bhDate">วันที่</label><input id="pp5bhDate" type="date" class="form-control"></div>
            <div style="grid-column:1/-1"><label for="pp5bhNote">หมายเหตุ (ถ้ามี)</label><input id="pp5bhNote" maxlength="500" class="form-control"></div>
            <div><button type="button" class="btn btn-success w-100" data-add><i class="bi bi-check2-circle me-1"></i>บันทึก</button></div>
          </div>
        </div>
        <div class="pp5bh-card">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2"><h5 class="mb-0">รายชื่อและคะแนนคงเหลือ</h5>
            <button type="button" class="btn btn-outline-success btn-sm" data-excel><i class="bi bi-file-earmark-excel me-1"></i>ดาวน์โหลด Excel</button></div>
          <div class="table-responsive"><table class="table table-sm table-hover pp5bh-table mb-0">
            <thead class="table-light"><tr><th><input type="checkbox" data-all aria-label="เลือกทั้งหมด"></th><th>เลขที่</th><th>ชื่อ</th><th class="text-center">คงเหลือ</th><th class="text-center">หัก</th><th class="text-center">เพิ่ม</th><th></th></tr></thead>
            <tbody data-rows></tbody></table></div>
        </div>
        <div class="pp5bh-card" data-history hidden></div>
      </div>`;

    const $ = (sel) => root.querySelector(sel);
    const status = (message, tone) => { const box = $('[data-status]'); box.hidden = !message; box.textContent = message || ''; box.className = 'pp5bh-status' + (tone ? ' ' + tone : ''); };
    const recordsOf = (id) => state.records.filter((r) => txt(r.student_id) === id);
    const canDelete = (r) => state.user.role === 'admin' || txt(r.recorded_by) === txt(state.user.id);
    const studentName = (s) => txt(s.fullName || s.name || `${txt(s.prefix || s.title)}${txt(s.firstName || s.first_name)} ${txt(s.lastName || s.last_name)}`);

    function fillCategories() {
      const kind = root.querySelector('input[name="pp5bhKind"]:checked').value;
      const list = state.settings[kind];
      $('#pp5bhCategory').innerHTML = list.map((c) => `<option>${esc(c)}</option>`).join('') + '<option value="__other">อื่น ๆ (พิมพ์เอง)</option>';
      $('#pp5bhOther').hidden = true;
    }

    function renderRows() {
      const start = state.settings.start;
      $('[data-rows]').innerHTML = state.students.map((s) => {
        const id = txt(s.id);
        const sc = scoreOf(recordsOf(id), start);
        return `<tr><td><input type="checkbox" data-pick value="${esc(id)}"></td><td>${esc(s.studentNumber || s.student_number)}</td><td class="name">${esc(studentName(s))}</td>`
          + `<td class="text-center"><span class="pp5bh-score ${scoreTone(sc.score, start)}">${sc.score}</span></td>`
          + `<td class="text-center text-danger">${sc.deducted ? '−' + sc.deducted : '-'}</td><td class="text-center text-success">${sc.added ? '+' + sc.added : '-'}</td>`
          + `<td><button type="button" class="btn btn-sm btn-outline-secondary" data-hist="${esc(id)}">ประวัติ (${sc.count})</button></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="text-center text-muted">ไม่พบนักเรียน</td></tr>';
      updatePicked();
    }

    function updatePicked() { $('[data-picked]').textContent = root.querySelectorAll('[data-pick]:checked').length; }

    function showHistory(id) {
      const s = state.students.find((x) => txt(x.id) === id);
      const recs = recordsOf(id);
      const sc = scoreOf(recs, state.settings.start);
      const box = $('[data-history]');
      box.hidden = false;
      box.innerHTML = `<h5>ประวัติ — ${esc(studentName(s || {}))} <span class="pp5bh-score ${scoreTone(sc.score, state.settings.start)}">${sc.score}</span></h5>`
        + historyHtml(recs, { canDelete, showRecorder: true });
      box.dataset.student = id;
      box.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }

    async function loadClass() {
      if (state.loading) return;
      const grade = $('#pp5bhGrade').value;
      const room = $('#pp5bhRoom').value;
      if (!grade) { status('กรุณาเลือกชั้น', 'err'); return; }
      state.loading = true;
      status('กำลังโหลดรายชื่อ...');
      try {
        state.year = $('#pp5bhYear').value;
        state.students = await pp5().students.list({ grade, room, academicYear: state.year, ...(state.year !== state.current ? { active: false } : {}) });
        state.records = await readRecords(state.year, state.students.map((s) => txt(s.id)));
        $('[data-body]').hidden = false;
        $('[data-history]').hidden = true;
        renderRows();
        status('');
      } catch (error) {
        $('[data-body]').hidden = true;
        status(error.message, 'err');
      } finally {
        state.loading = false;
      }
    }

    async function add() {
      const ids = [...root.querySelectorAll('[data-pick]:checked')].map((b) => b.value);
      const kind = root.querySelector('input[name="pp5bhKind"]:checked').value;
      const category = $('#pp5bhCategory').value === '__other' ? $('#pp5bhOther').value : $('#pp5bhCategory').value;
      const button = $('[data-add]');
      button.disabled = true;
      try {
        const saved = await addRecords({ studentIds: ids, academicYear: state.year, kind, category, points: Number($('#pp5bhPoints').value), occurredOn: $('#pp5bhDate').value, note: $('#pp5bhNote').value });
        state.records = [...saved, ...state.records];
        $('#pp5bhNote').value = '';
        renderRows();
        root.querySelectorAll('[data-pick]').forEach((b) => { b.checked = false; });
        $('[data-all]').checked = false;
        updatePicked();
        status(`บันทึกแล้ว ${saved.length} คน (${kind === 'deduct' ? 'หัก' : 'เพิ่ม'} ${saved[0].points} คะแนน — ${saved[0].category})`, 'ok');
        const open = $('[data-history]').dataset.student;
        if (open && !$('[data-history]').hidden) showHistory(open);
      } catch (error) {
        status(error.message, 'err');
      } finally {
        button.disabled = false;
      }
    }

    function downloadExcel() {
      if (!global.XLSX?.utils) { status('โหลดไลบรารี Excel ไม่สำเร็จ กรุณาโหลดหน้าเว็บใหม่', 'err'); return; }
      const start = state.settings.start;
      const aoa = [['เลขที่', 'เลขประจำตัว', 'ชื่อ', 'คะแนนคงเหลือ', 'หักรวม', 'เพิ่มรวม', 'จำนวนบันทึก']]
        .concat(state.students.map((s) => { const sc = scoreOf(recordsOf(txt(s.id)), start); return [s.studentNumber || s.student_number || '', txt(s.id), studentName(s), sc.score, sc.deducted, sc.added, sc.count]; }));
      const detail = [['วันที่', 'เลขประจำตัว', 'ชื่อ', 'ประเภท', 'เรื่อง', 'คะแนน', 'หมายเหตุ', 'บันทึกโดย']]
        .concat(state.records.map((r) => { const s = state.students.find((x) => txt(x.id) === txt(r.student_id)) || {}; return [r.occurred_on, txt(r.student_id), studentName(s), r.kind === 'deduct' ? 'หัก' : 'เพิ่ม', r.category, r.points, r.note || '', r.recorded_by_name || '']; }));
      const book = global.XLSX.utils.book_new();
      global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet(aoa), 'สรุป');
      global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet(detail), 'รายการ');
      global.XLSX.writeFile(book, `ความประพฤติ_${$('#pp5bhGrade').value}_${$('#pp5bhRoom').value || 'ทุกห้อง'}_${state.year}.xlsx`);
    }

    root.addEventListener('change', (event) => {
      if (event.target.matches('[data-pick]')) updatePicked();
      if (event.target.matches('[data-all]')) { root.querySelectorAll('[data-pick]').forEach((b) => { b.checked = event.target.checked; }); updatePicked(); }
      if (event.target.name === 'pp5bhKind') fillCategories();
      if (event.target.id === 'pp5bhCategory') $('#pp5bhOther').hidden = event.target.value !== '__other';
      if (event.target.id === 'pp5bhGrade') fillRooms();
      if (event.target.id === 'pp5bhYear') loadRoster(event.target.value).catch((error) => status(error.message, 'err'));
    });
    root.addEventListener('click', async (event) => {
      const hist = event.target.closest('[data-hist]');
      if (hist) { showHistory(hist.dataset.hist); return; }
      const del = event.target.closest('[data-del]');
      if (del) {
        if (!global.confirm('ลบรายการนี้?')) return;
        try {
          await removeRecord(del.dataset.del);
          state.records = state.records.filter((r) => txt(r.id) !== del.dataset.del);
          renderRows();
          showHistory($('[data-history]').dataset.student);
          status('ลบรายการแล้ว', 'ok');
        } catch (error) { status(error.message, 'err'); }
      }
    });
    $('[data-load]').addEventListener('click', loadClass);
    $('[data-add]').addEventListener('click', add);
    $('[data-excel]').addEventListener('click', downloadExcel);
    $('[data-save-settings]').addEventListener('click', async () => {
      try {
        state.settings = await saveSettings({ start: Number($('#pp5bhStart').value), deduct: $('#pp5bhDeductList').value, add: $('#pp5bhAddList').value });
        applySettings();
        if (state.students.length) renderRows();
        status('บันทึกการตั้งค่าแล้ว', 'ok');
      } catch (error) { status(error.message, 'err'); }
    });

    let roster = [];
    async function loadRoster(year) {
      roster = await pp5().students.list({ academicYear: year, ...(year !== state.current ? { active: false } : {}) });
      const keep = $('#pp5bhGrade').value;
      const grades = [...new Set(roster.map((s) => txt(s.grade)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
      $('#pp5bhGrade').innerHTML = '<option value="">— เลือกชั้น —</option>' + grades.map((g) => `<option>${esc(g)}</option>`).join('');
      if (grades.includes(keep)) $('#pp5bhGrade').value = keep;
      fillRooms();
      return grades;
    }
    function fillRooms() {
      const grade = $('#pp5bhGrade').value;
      const rooms = [...new Set(roster.filter((s) => txt(s.grade) === grade).map((s) => txt(s.room || s.classNo)).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
      $('#pp5bhRoom').innerHTML = rooms.map((r) => `<option>${esc(r)}</option>`).join('');
    }
    function applySettings() {
      $('[data-start]').textContent = state.settings.start;
      $('#pp5bhStart').value = state.settings.start;
      $('#pp5bhDeductList').value = state.settings.deduct.join('\n');
      $('#pp5bhAddList').value = state.settings.add.join('\n');
      fillCategories();
    }

    (async () => {
      try {
        state.user = await requireStaff();
        if (!(await isAvailable())) { status(tableError({ code: '42P01' }).message, 'err'); return; }
        state.settings = await getSettings();
        $('[data-settings]').hidden = state.user.role !== 'admin';
        applySettings();
        $('#pp5bhDate').value = today();
        const current = txt((await pp5().settings.get())?.academicYear);
        state.current = current;
        let years = [current];
        try {
          const { data } = await pp5().client.from('academic_years').select('academic_year');
          years = [...new Set([current, ...(data || []).map((r) => txt(r.academic_year))])].filter((y) => /^\d{4}$/.test(y)).sort().reverse();
        } catch (_) { /* current year only */ }
        $('#pp5bhYear').innerHTML = years.map((y) => `<option>${esc(y)}</option>`).join('');
        $('#pp5bhYear').value = current;
        const grades = await loadRoster(current);
        const own = txt(global.localStorage?.getItem?.('className'));
        const match = own.match(/([อปม])\.\s*([0-9]+)/);
        const ownGrade = grades.includes(own) ? own : (match ? `${match[1]}.${match[2]}` : '');
        if (grades.includes(ownGrade)) { $('#pp5bhGrade').value = ownGrade; fillRooms(); }
        status($('#pp5bhGrade').value ? '' : 'เลือกชั้นและห้อง แล้วกด "แสดงรายชื่อ"');
        if ($('#pp5bhGrade').value) loadClass();
      } catch (error) {
        status(error.message, 'err');
      }
    })();
  }

  // ───────────────────────── parent portal ─────────────────────────
  async function openParentView(studentId, name) {
    const title = 'ความประพฤติ • ' + txt(name);
    const modal = global.openModal || ((t, html) => global.alert?.(t));
    modal(title, typeof global.loadingHtml === 'function' ? global.loadingHtml('กำลังโหลด') : 'กำลังโหลด...');
    try {
      const data = await forStudent(studentId);
      modal(title, `<div style="text-align:center;margin-bottom:12px"><div class="pp5bh-note">ปีการศึกษา ${esc(data.year)} · คะแนนเริ่มต้น ${data.settings.start}</div>`
        + `<div style="font-size:2.2rem;font-weight:700" class="pp5bh-score ${scoreTone(data.score, data.settings.start)}">${data.score}</div>`
        + `<div class="pp5bh-note">หัก ${data.deducted} · เพิ่ม ${data.added}</div></div>`
        + historyHtml(data.records, { canDelete: () => false, showRecorder: false }));
    } catch (error) {
      modal(title, `<div class="text-danger">${esc(error.message)}</div>`);
    }
  }

  // Adds a "ความประพฤติ" button to each child card in the parent portal, but only once the
  // table exists — before the migration is applied parents see nothing new.
  let parentAvailable = null;
  async function enhanceParentCards(container) {
    if (!container) return;
    if (parentAvailable === null) parentAvailable = await isAvailable();
    if (!parentAvailable) return;
    injectStyles();
    container.querySelectorAll('.s-card .actions').forEach((actions) => {
      if (actions.querySelector('.act-btn.behavior')) return;
      const ref = actions.querySelector('.act-btn[data-sid]');
      if (!ref) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'act-btn behavior';
      button.dataset.action = 'behavior';
      button.innerHTML = '<i class="bi bi-person-check-fill"></i><span>ความประพฤติ</span>';
      button.addEventListener('click', (event) => { event.stopPropagation(); openParentView(ref.dataset.sid, ref.dataset.name); });
      actions.appendChild(button);
      actions.classList.add('pp5bh-four');
    });
  }

  // ───────────────────────── home hub card ─────────────────────────
  function enhanceHomeHub(hubPage) {
    if (!hubPage) return;
    const role = txt(global.localStorage?.getItem?.('role')).toLowerCase();
    if (role !== 'admin' && role !== 'teacher') return;
    const grid = hubPage.querySelector('.hub-section[data-section="students"] .hub-grid');
    if (!grid || grid.querySelector('[data-page="behavior_records"]')) return;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'hub-card c-purple';
    card.setAttribute('data-page', 'behavior_records');
    card.setAttribute('data-label', 'บันทึกพฤติกรรม');
    card.setAttribute('data-roles', 'admin,teacher');
    card.innerHTML = '<i class="bi bi-person-check hub-card-icon"></i><span class="hub-card-label">บันทึกพฤติกรรม</span>';
    card.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); global.navigateTo?.('behavior_records'); });
    grid.appendChild(card);
  }

  global.GAS_PAGES = global.GAS_PAGES || {};
  global.GAS_PAGES.behavior_records = PAGE_HTML;
  global.PP5Behavior = {
    mountPage, enhanceParentCards, enhanceHomeHub, addRecords, removeRecord, forStudent, getSettings, saveSettings, isAvailable,
    _internal: { normalizeSettings, scoreOf, validateEntry, historyHtml, tableError, DEFAULTS, MIGRATION }
  };
})(window);
