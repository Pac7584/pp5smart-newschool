// Historical records have their own explicit year; never change school_settings.
(function (global) {
  'use strict';
  const text = (v) => v == null ? '' : String(v);
  const esc = (v) => text(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TABLES = {
    scores: { label: 'คะแนน', keys: ['student_id', 'subject_id', 'semester', 'academic_year'], fields: ['formative_score', 'summative_score', 'grade_text'], labels: ['คะแนนระหว่างภาค', 'คะแนนปลายภาค', 'ผลพิเศษ (ร / มส)'] },
    student_comments: { label: 'ความคิดเห็นครู', keys: ['student_id', 'academic_year', 'semester'], fields: ['comment'], labels: ['ความคิดเห็นครู'] },
    assessments: { label: 'ผลประเมิน', keys: ['id'], fields: ['score'], labels: ['ผลประเมิน'] },
    attendance_daily: { label: 'เวลาเรียนรายวัน', keys: ['student_id', 'attendance_date'], fields: ['status'], labels: ['สถานะเวลาเรียน'] },
    attendance_monthly: { label: 'เวลาเรียนรายเดือน', keys: ['student_id', 'year_month', 'day_number'], fields: ['status'], labels: ['สถานะเวลาเรียน'], upsert: true },
    student_growth: { label: 'น้ำหนัก-ส่วนสูง (สุขภาพ)', keys: ['student_id', 'academic_year', 'month', 'round_no'], fields: ['measured_on', 'weight_kg', 'height_cm', 'note', 'nutrition_status'], labels: ['วันที่ชั่งวัด', 'น้ำหนัก (กก.)', 'ส่วนสูง (ซม.)', 'หมายเหตุ', 'ภาวะโภชนาการ'], upsert: true },
    student_year_rosters: { label: 'ทะเบียนในปีนี้', keys: ['student_id', 'academic_year'], fields: ['prefix', 'first_name', 'last_name', 'grade', 'room', 'student_number'], labels: ['คำนำหน้า', 'ชื่อ', 'นามสกุล', 'ชั้นในปีนี้', 'ห้องในปีนี้', 'เลขที่'] }
  };
  function client() { return global.dbClient; }
  async function admin() {
    const user = await global.PP5Data.auth.requireUser();
    if (user.profile.role !== 'admin') throw new Error('ข้อมูลย้อนหลังสำหรับผู้ดูแลระบบ');
    return user;
  }
  async function rpc(name, args) {
    const result = await client().rpc(name, args);
    if (result.error) {
      if (['PGRST202', '42883'].includes(result.error.code)) throw new Error('ยังไม่ได้ติดตั้งระบบแก้ข้อมูลย้อนหลังในฐานข้อมูล กรุณาติดต่อผู้ดูแล');
      throw new Error(result.error.message);
    }
    return result.data;
  }
  async function readAll(table, year, studentId) {
    const rows = [];
    // Deterministic ordering avoids losing rows across PostgREST's 1,000-row limit.
    const keys = TABLES[table]?.keys || ['id'];
    for (let start = 0; ; start += 500) {
      let query = client().from(table).select('*').eq('academic_year', year);
      if (studentId) query = query.eq('student_id', studentId);
      for (const key of keys) query = query.order(key, { ascending: true });
      const result = await query.range(start, start + 499);
      if (result.error) throw new Error(result.error.message);
      rows.push(...(result.data || []));
      if ((result.data || []).length < 500) return rows;
    }
  }
  async function years() {
    await admin();
    const settings = await global.PP5Data.settings.get();
    const result = await client().from('academic_years').select('*').order('academic_year', { ascending: false });
    if (result.error) throw new Error(result.error.message);
    return { current: text(settings.academicYear), years: result.data || [] };
  }
  async function loadYear(year) {
    await admin();
    if (!/^\d{4}$/.test(year)) throw new Error('ปีการศึกษาไม่ถูกต้อง');
    return readAll('student_year_rosters', year);
  }
  async function save(table, year, before, patch, reason) {
    await admin();
    if (!TABLES[table] || !reason?.trim()) throw new Error('กรุณาระบุเหตุผลการแก้ไข');
    const key = Object.fromEntries(TABLES[table].keys.map((k) => [k, before[k]]));
    if (TABLES[table].upsert) return rpc('pp5_upsert_historical_record', { p_table: table, p_year: year, p_key: key, p_expected: before, p_values: patch, p_reason: reason.trim() });
    return rpc('pp5_correct_historical_record', { p_table: table, p_year: year, p_key: key, p_expected: before, p_patch: patch, p_reason: reason.trim() });
  }
  // Adds a row that was never recorded (monthly attendance / growth). key holds every identity column.
  async function create(table, year, key, values, reason) {
    await admin();
    if (!TABLES[table]?.upsert || !reason?.trim()) throw new Error('กรุณาระบุเหตุผลการเพิ่มข้อมูล');
    return rpc('pp5_upsert_historical_record', { p_table: table, p_year: year, p_key: key, p_expected: null, p_values: values, p_reason: reason.trim() });
  }
  async function lockYear(year, locked, reason) {
    await admin();
    return rpc('pp5_history_set_year_lock', { p_year: year, p_locked: locked, p_reason: reason.trim() });
  }
  function name(row) { return [row.prefix, row.first_name, row.last_name].filter(Boolean).join(' '); }
  function statusLabel(value) { return ({ active: 'กำลังเรียน', enrolled: 'กำลังเรียน', completed: 'เรียนจบชั้น', retained: 'ซ้ำชั้น', graduated: 'จบการศึกษา', transferred_out: 'ย้ายออก', inactive: 'จำหน่าย', withdrawn: 'ลาออก', deceased: 'เสียชีวิต', present: 'มา', absent: 'ขาด', leave: 'ลา', late: 'สาย' })[value] || value; }
  function describe(table, row) {
    if (table === 'scores') return `${row.subject_id} · ภาค ${row.semester} · รวม ${row.total_score ?? '-'} · ผล ${row.grade_text ?? row.grade_point ?? '-'}`;
    if (table === 'student_comments') return `ภาค ${row.semester}: ${row.comment || '-'}`;
    if (table === 'assessments') return `${row.assessment_type} · ${row.criteria_code} · ภาค ${row.semester} · ${row.score ?? '-'}`;
    if (table === 'attendance_monthly') return `${row.year_month} วันที่ ${row.day_number} · ${statusLabel(row.status)}`;
    if (table === 'student_growth') return `เดือน ${row.month} รอบ ${row.round_no} · ${row.measured_on || '-'} · น้ำหนัก ${row.weight_kg ?? '-'} · ส่วนสูง ${row.height_cm ?? '-'} · BMI ${row.bmi ?? '-'}`;
    if (table === 'attendance_daily') return `${row.attendance_date} · ${statusLabel(row.status)}`;
    return `${name(row)} · ${row.grade}/${row.room} · เลขที่ ${row.student_number ?? '-'} · ${statusLabel(row.enrollment_status || row.status)}`;
  }
  function scorePatch(before, values) {
    const patch = {};
    const b = before.score_breakdown || {};
    const requiredNumber = (key) => { if (values[key] === '' || values[key] === null || values[key] === undefined) throw new Error('กรุณากรอกคะแนนให้ครบ ช่องว่างไม่ใช่คะแนนศูนย์'); return Number(values[key]); };
    if (Array.isArray(b.scores) && Array.isArray(b.fullScores)) {
      const scores = b.scores.map((_, i) => requiredNumber('score_' + i));
      if (scores.some((v, i) => !Number.isFinite(v) || v < 0 || v > Number(b.fullScores[i]))) throw new Error('คะแนนระหว่างภาคเกินคะแนนเต็มหรือไม่ถูกต้อง');
      const rawMax = b.fullScores.reduce((sum, v) => sum + Number(v), 0);
      const finalMax = Number(b.fullFinal);
      if (!(rawMax > 0) || !(finalMax >= 0 && finalMax <= 100)) throw new Error('ข้อมูลคะแนนเต็มเดิมไม่ครบ กรุณาตรวจข้อมูลก่อนแก้ไข');
      patch.formative_score = Math.round(scores.reduce((a, v) => a + v, 0) / rawMax * (100 - finalMax) * 10) / 10;
      patch.summative_score = requiredNumber('summative_score');
      if (!Number.isFinite(patch.summative_score) || patch.summative_score < 0 || patch.summative_score > finalMax) throw new Error('คะแนนปลายภาคไม่ถูกต้อง');
      patch.score_breakdown = { ...b, scores };
    } else {
      patch.formative_score = requiredNumber('formative_score');
      patch.summative_score = requiredNumber('summative_score');
      if ([patch.formative_score, patch.summative_score].some((v) => !Number.isFinite(v) || v < 0)) throw new Error('คะแนนไม่ถูกต้อง');
      patch.score_breakdown = { ...b };
    }
    patch.total_score = Math.round((patch.formative_score + patch.summative_score) * 10) / 10;
    if (patch.total_score > 100) throw new Error('คะแนนรวมเกิน 100');
    patch.grade_point = Number(global.PP5Data.helpers.calculateGrade(patch.total_score));
    const special = text(values.grade_text).trim();
    if (special && !['ร', 'มส'].includes(special)) throw new Error('ผลพิเศษใช้ ร หรือ มส หรือเว้นว่างเพื่อคำนวณเกรด');
    patch.grade_text = special || String(patch.grade_point);
    patch.score_breakdown = { ...patch.score_breakdown, mid: patch.formative_score, final: patch.summative_score, total: patch.total_score, grade: patch.grade_text, entered: true, entryState: 'entered' };
    return patch;
  }
  function editDialog(table, year, before, onSaved) {
    const config = TABLES[table];
    const overlay = document.createElement('div');
    overlay.className = 'pp5-history-overlay';
    let fields = config.fields.map((field, i) => ({ field, label: config.labels[i], value: field === 'grade_text' ? (['ร', 'มส'].includes(before[field]) ? before[field] : '') : before[field] }));
    if (table === 'scores' && Array.isArray(before.score_breakdown?.scores) && Array.isArray(before.score_breakdown?.fullScores)) {
      fields = before.score_breakdown.scores.map((value, i) => ({ field: 'score_' + i, label: `ครั้งที่ ${i + 1} / ${before.score_breakdown.fullScores[i]}`, value })).concat(fields.filter((v) => v.field !== 'formative_score'));
    }
    const fieldHtml = fields.map(({ field, label, value }) => {
      let input;
      if (field === 'status') input = `<select name="status" class="form-select">${['present', 'absent', 'leave', 'late'].map((v) => `<option value="${v}" ${v === value ? 'selected' : ''}>${statusLabel(v)}</option>`).join('')}</select>`;
      else if (field === 'comment') input = `<textarea name="comment" class="form-control" rows="3" required>${esc(value)}</textarea>`;
      else input = `<input name="${esc(field)}" class="form-control" value="${esc(value)}" ${field === 'measured_on' ? 'type="date"' : /score|student_number|weight_kg|height_cm/.test(field) && field !== 'grade_text' ? 'type="number" step="0.1" min="0"' : ''}>`;
      return `<label class="d-block mb-2">${esc(label)}${input}</label>`;
    }).join('');
    overlay.innerHTML = `<form class="pp5-history-dialog" role="dialog" aria-modal="true" aria-label="แก้ข้อมูลย้อนหลัง"><h4>แก้ ${esc(config.label)} ปี ${esc(year)}</h4><p>${esc(describe(table, before))}</p>${fieldHtml}<label class="d-block">เหตุผลการแก้ไข<textarea class="form-control" name="reason" required minlength="5"></textarea></label><div class="text-danger mt-2" role="alert" data-error></div><div class="d-flex gap-2 mt-3"><button class="btn btn-primary" type="submit">บันทึกพร้อมประวัติ</button><button class="btn btn-outline-secondary" type="button" data-close>ยกเลิก</button></div></form>`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector('form');
    overlay.querySelector('[data-close]').onclick = () => overlay.remove();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const buttons = [...form.querySelectorAll('button')];
      buttons.forEach((b) => b.disabled = true);
      try {
        let patch = Object.fromEntries(config.fields.map((field) => [field, values[field]]));
        if (table === 'scores') patch = scorePatch(before, values);
        if (table === 'assessments') patch.score = Number(values.score);
        if (table === 'student_growth') for (const f of ['weight_kg', 'height_cm']) patch[f] = values[f] === '' ? null : Number(values[f]);
        if (table === 'student_year_rosters') patch.student_number = values.student_number === '' ? null : Number(values.student_number);
        await save(table, year, before, patch, values.reason);
        overlay.remove();
        await onSaved();
      } catch (error) { overlay.querySelector('[data-error]').textContent = error.message; }
      finally { buttons.forEach((b) => b.disabled = false); }
    };
    form.querySelector('input,textarea,select')?.focus();
  }
  function createDialog(table, year, student, onSaved) {
    const config = TABLES[table];
    const overlay = document.createElement('div');
    overlay.className = 'pp5-history-overlay';
    const statusSelect = `<select name="status" class="form-select">${['present', 'absent', 'leave', 'late'].map((v) => `<option value="${v}">${statusLabel(v)}</option>`).join('')}</select>`;
    const idFields = table === 'attendance_monthly'
      ? '<label class="d-block mb-2">เดือน<input name="year_month" type="month" class="form-control" required></label><label class="d-block mb-2">วันที่<input name="day_number" type="number" min="1" max="31" class="form-control" required></label>'
      : '<label class="d-block mb-2">เดือน (1-12)<input name="month" type="number" min="1" max="12" class="form-control" required></label><label class="d-block mb-2">รอบที่<input name="round_no" type="number" min="1" value="1" class="form-control" required></label>';
    const valueFields = table === 'attendance_monthly' ? `<label class="d-block mb-2">สถานะเวลาเรียน${statusSelect}</label>`
      : config.fields.map((f, i) => `<label class="d-block mb-2">${esc(config.labels[i])}<input name="${f}" class="form-control" ${f === 'measured_on' ? 'type="date" required' : /weight|height/.test(f) ? 'type="number" step="0.1" min="0"' : ''}></label>`).join('');
    overlay.innerHTML = `<form class="pp5-history-dialog" role="dialog" aria-modal="true" aria-label="เพิ่มข้อมูลย้อนหลัง"><h4>เพิ่ม ${esc(config.label)} ปี ${esc(year)}</h4><p>${esc(name(student))}</p>${idFields}${valueFields}<label class="d-block">เหตุผลการเพิ่ม<textarea class="form-control" name="reason" required minlength="5"></textarea></label><div class="text-danger mt-2" role="alert" data-error></div><div class="d-flex gap-2 mt-3"><button class="btn btn-primary" type="submit">บันทึกพร้อมประวัติ</button><button class="btn btn-outline-secondary" type="button" data-close>ยกเลิก</button></div></form>`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector('form');
    overlay.querySelector('[data-close]').onclick = () => overlay.remove();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(form));
      const buttons = [...form.querySelectorAll('button')];
      buttons.forEach((b) => b.disabled = true);
      try {
        let key, values;
        if (table === 'attendance_monthly') { key = { student_id: student.student_id, year_month: v.year_month, day_number: Number(v.day_number) }; values = { status: v.status }; }
        else {
          key = { student_id: student.student_id, academic_year: year, month: Number(v.month), round_no: Number(v.round_no) };
          values = { measured_on: v.measured_on, weight_kg: v.weight_kg === '' ? null : Number(v.weight_kg), height_cm: v.height_cm === '' ? null : Number(v.height_cm), note: v.note, nutrition_status: v.nutrition_status };
        }
        await create(table, year, key, values, v.reason);
        overlay.remove();
        await onSaved();
      } catch (error) { overlay.querySelector('[data-error]').textContent = error.message; }
      finally { buttons.forEach((b) => b.disabled = false); }
    };
    form.querySelector('input,select')?.focus();
  }
  async function mountPage(root) {
    if (!root) return;
    const state = { year: '', yearRow: null, roster: [], student: null, table: 'scores', serial: 0, loading: false };
    root.innerHTML = `<div class="container py-3"><h3><i class="bi bi-clock-history"></i> ข้อมูลย้อนหลัง</h3><p class="text-muted">เลือกข้อมูลของปีเดิม รวมถึงนักเรียนที่จบแล้ว การเลือกปีหน้านี้ไม่เปลี่ยนปีปัจจุบันของโรงเรียน</p><div data-status role="status" class="alert alert-info">กำลังตรวจสิทธิ์...</div><div class="row g-3 mb-3"><label class="col-md-3">ปีการศึกษา<select class="form-select" data-year disabled></select></label><label class="col-md-3">ชั้นในปีนั้น<select class="form-select" data-grade><option value="">ทุกชั้น</option></select></label><label class="col-md-6">ค้นหารหัสหรือชื่อนักเรียน<input class="form-control" data-search placeholder="รวมรายชื่อนักเรียนที่จบ / ย้ายออก"></label></div><div class="d-flex gap-2 mb-3 flex-wrap"><button class="btn btn-outline-warning" data-lock disabled>เปิดแก้ปีนี้</button><button class="btn btn-outline-secondary" data-audit>ดูประวัติการแก้ไข</button><a class="btn btn-outline-primary" href="?page=academic_year_tools">จัดการเลื่อนชั้น</a><a class="btn btn-outline-primary" href="?page=data_backup">สำรองข้อมูล</a></div><div data-year-context></div><div class="row g-3"><section class="col-lg-4"><div class="card p-3"><h5>ทะเบียนในปีที่เลือก</h5><div data-roster></div></div></section><section class="col-lg-8"><div class="card p-3"><h5 data-student>เลือกนักเรียน</h5><div class="d-flex gap-2 mb-3 flex-wrap"><select class="form-select w-auto" data-table>${Object.entries(TABLES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select><button class="btn btn-outline-success" data-add disabled hidden>เพิ่มข้อมูลที่ตกหล่น</button><button class="btn btn-outline-primary" data-pp6 disabled>ปพ.6 ปีที่เลือก</button></div><p class="text-muted small">รายงานใช้ข้อมูลปีที่เลือก หากยังไม่มีสำเนาข้อมูลโรงเรียนหรือรายวิชาในปีนั้น ระบบจะระบุข้อจำกัดก่อนพิมพ์</p><div data-records></div></div></section></div><div data-audits class="mt-3"></div></div>`;
    const $ = (selector) => root.querySelector(selector);
    function status(message, bad = false) { $('[data-status]').textContent = message; $('[data-status]').className = `alert ${bad ? 'alert-warning' : 'alert-info'}`; }
    function renderRoster() {
      const term = $('[data-search]').value.trim().toLowerCase();
      const grade = $('[data-grade]').value;
      const rows = state.roster.filter((r) => (!grade || r.grade === grade) && (!term || `${r.student_id} ${name(r)}`.toLowerCase().includes(term)));
      $('[data-roster]').innerHTML = rows.length ? rows.map((r) => `<button type="button" class="btn btn-light text-start w-100 mb-2" data-id="${esc(r.student_id)}"><b>${esc(name(r))}</b><br><small>${esc(r.student_id)} · ${esc(r.grade)}/${esc(r.room)} · ${esc(statusLabel(r.enrollment_status || r.status))}</small></button>`).join('') : '<p class="text-muted">ไม่พบทะเบียนในปีนี้</p>';
      $('[data-roster]').querySelectorAll('[data-id]').forEach((button) => button.onclick = () => { state.student = state.roster.find((r) => r.student_id === button.dataset.id); showRecords(); });
    }
    async function showRecords() {
      if (!state.student) return;
      const serial = ++state.serial;
      const year = state.year, table = state.table, student = state.student;
      $('[data-student]').textContent = `${name(student)} · ${student.grade}/${student.room} · ปี ${year}`;
      $('[data-records]').textContent = 'กำลังอ่านข้อมูล...';
      $('[data-pp6]').disabled = false;
      try {
        const rows = await readAll(table, year, student.student_id);
        if (serial !== state.serial || !root.isConnected) return;
        const editable = !!state.yearRow && !state.yearRow.is_locked && !state.yearRow.is_current;
        $('[data-add]').hidden = !TABLES[table].upsert;
        $('[data-add]').disabled = !editable;
        $('[data-records]').innerHTML = rows.length ? rows.map((row, index) => `<div class="border rounded p-2 mb-2 d-flex gap-2 justify-content-between align-items-center"><span>${esc(describe(table, row))}</span>${editable ? `<button class="btn btn-sm btn-outline-primary" data-edit="${index}">แก้ไข</button>` : ''}</div>`).join('') : '<p class="text-muted">ยังไม่มีข้อมูลประเภทนี้ในปีที่เลือก</p>';
        $('[data-records]').querySelectorAll('[data-edit]').forEach((button) => button.onclick = () => editDialog(table, year, rows[Number(button.dataset.edit)], async () => { if (table === 'student_year_rosters') await changeYear(); else await showRecords(); status('บันทึกข้อมูลย้อนหลังและประวัติการแก้ไขแล้ว'); }));
      } catch (error) { if (serial === state.serial) $('[data-records]').textContent = error.message; }
    }
    async function changeYear() {
      const serial = ++state.serial;
      state.year = $('[data-year]').value;
      state.yearRow = state.years.find((r) => text(r.academic_year) === state.year);
      state.student = null;
      global.PP5YearContext?.render($('[data-year-context]'), state.year);
      $('[data-pp6]').disabled = true;
      $('[data-records]').innerHTML = '';
      $('[data-student]').textContent = 'เลือกนักเรียน';
      $('[data-audits]').innerHTML = '';
      $('[data-roster]').textContent = 'กำลังอ่านทะเบียน...';
      $('[data-lock]').disabled = true;
      try {
        const rows = await loadYear(state.year);
        if (serial !== state.serial || !root.isConnected) return;
        state.roster = rows;
        $('[data-grade]').innerHTML = '<option value="">ทุกชั้น</option>' + [...new Set(rows.map((r) => r.grade))].sort().map((g) => `<option>${esc(g)}</option>`).join('');
        renderRoster();
        const current = state.year === state.current;
        $('[data-lock]').disabled = current || !state.yearRow;
        $('[data-lock]').textContent = state.yearRow?.is_locked ? 'เปิดแก้ปีนี้พร้อมเหตุผล' : 'ล็อกปีนี้หลังแก้เสร็จ';
        status(`ปีที่กำลังดู ${state.year} · ปีปัจจุบันของโรงเรียน ${state.current} · ${current ? 'ดูข้อมูลปีปัจจุบัน (แก้ผ่านหน้าปกติ)' : state.yearRow?.is_locked ? 'ล็อก: อ่านอย่างเดียว' : 'เปิดให้ผู้ดูแลแก้ย้อนหลัง'}`);
      } catch (error) { status(error.message, true); $('[data-roster]').textContent = ''; }
    }
    $('[data-year]').onchange = changeYear;
    $('[data-grade]').onchange = renderRoster;
    $('[data-search]').oninput = renderRoster;
    $('[data-table]').onchange = () => { state.table = $('[data-table]').value; showRecords(); };
    $('[data-add]').onclick = () => {
      if (!state.student || !TABLES[state.table].upsert) return;
      createDialog(state.table, state.year, state.student, async () => { await showRecords(); status('เพิ่มข้อมูลย้อนหลังและประวัติการแก้ไขแล้ว'); });
    };
    $('[data-lock]').onclick = async () => {
      const reason = global.prompt('ระบุเหตุผลการเปิดแก้หรือปิดการแก้ปี ' + state.year);
      if (!reason?.trim()) return;
      $('[data-lock]').disabled = true;
      try { await lockYear(state.year, !state.yearRow.is_locked, reason); const info = await years(); state.years = info.years; await changeYear(); }
      catch (error) { status(error.message, true); $('[data-lock]').disabled = false; }
    };
    $('[data-audit]').onclick = async () => {
      const year = state.year;
      try {
        const result = await client().from('audit_logs').select('*').eq('entity_type', 'academic_history').eq('detail->>academic_year', year).order('id', { ascending: false }).limit(100);
        if (result.error) throw new Error(result.error.message);
        if (year !== state.year) return;
        $('[data-audits]').innerHTML = `<div class="card p-3"><h5>ประวัติปี ${esc(year)} (ล่าสุด 100 รายการ)</h5>${(result.data || []).map((r) => `<details class="border-bottom p-2"><summary>${esc(r.created_at)} · ${esc(r.action)} · ${esc(r.detail?.reason)}</summary><pre class="small text-wrap">${esc(JSON.stringify({ before: r.detail?.before, after: r.detail?.after }, null, 2))}</pre></details>`).join('') || 'ยังไม่มีประวัติ'}</div>`;
      } catch (error) { status(error.message, true); }
    };
    $('[data-pp6]').onclick = async () => {
      const student = state.student, year = state.year;
      if (!student) return;
      if (!global.confirm(`พิมพ์ ปพ.6 ปี ${year} ชั้น ${student.grade}/${student.room}?\nข้อมูลรายวิชาและรายละเอียดโรงเรียนที่ไม่มีสำเนาประวัติจะใช้ข้อมูลที่มีอยู่ปัจจุบัน กรุณาตรวจเอกสารก่อนออกฉบับทางการ`)) return;
      $('[data-pp6]').disabled = true;
      const preview = global.open('', '_blank');
      try {
        const result = await global.GasServer.generateStudentReportPdfUnified(student.student_id, { academicYear: year, year, grade: student.grade, classNo: student.room, term: 'year', showRank: false, reportFormat: 'single', historical: true });
        if (preview) preview.location.href = result.url;
        else { const a = document.createElement('a'); a.href = result.url; a.target = '_blank'; a.textContent = 'เปิด ปพ.6'; $('[data-records]').appendChild(a); }
      } catch (error) { preview?.close(); status(error.message, true); }
      finally { $('[data-pp6]').disabled = !state.student; }
    };
    try { const info = await years(); state.current = info.current; state.years = info.years; $('[data-year]').innerHTML = info.years.map((r) => `<option value="${esc(r.academic_year)}">${esc(r.academic_year)}${text(r.academic_year) === info.current ? ' (ปัจจุบัน)' : ''}</option>`).join(''); $('[data-year]').disabled = false; if (info.years.length) await changeYear(); else status('ยังไม่มีทะเบียนปีการศึกษา', true); }
    catch (error) { status(error.message, true); }
  }
  function enhanceHomeHub(root) {
    if (text(global.localStorage?.getItem('role')).toLowerCase() !== 'admin' || root.querySelector('[data-history-link]')) return;
    const grid = root.querySelector('.pp5-mm-cats') || root.querySelector('.hub-grid');
    if (!grid) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline-primary'; button.dataset.historyLink = '1'; button.innerHTML = '<i class="bi bi-clock-history"></i> ข้อมูลย้อนหลัง / นักเรียนที่จบแล้ว'; button.onclick = () => global.navigateTo?.('academic_history'); grid.appendChild(button);
  }
  global.GAS_PAGES = global.GAS_PAGES || {};
  global.GAS_PAGES.academic_history = '<div id="academicHistoryRoot"></div><script>window.PP5History.mountPage(document.getElementById("academicHistoryRoot"));<\/script>';
  global.PP5History = { mountPage, enhanceHomeHub, years, loadYear, readAll, save, create, lockYear, _internal: { scorePatch, TABLES } };
})(window);
