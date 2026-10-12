// PP5 data backup — everything happens in the browser with the admin's own login.
//
//   • "สำรองข้อมูลตอนนี้"  reads every table the admin can see (page by page,
//     row counts re-checked) and downloads ONE file: pp5_backup_<date>.json.gz
//   • "เปิดไฟล์สำรอง"      opens that file (or a .zip from backup_database.cmd)
//     in the browser, shows scores by year/grade/room, compares them with the
//     live system and exports Excel.
//   • Reminders: a banner on the home page when the last backup is old, and a
//     "back up first?" question before DMC import and before closing the year.
//
// READ-ONLY toward school data: the only write is the "last backup" note in
// school_settings.settings_json.backup. Nothing here edits scores or students;
// a wrong value found in a backup is fixed in the normal page, as always.
(function (global) {
  'use strict';

  const FORMAT = 'pp5-web-backup';
  const FORMAT_VERSION = 1;
  const PAGE_SIZE = 1000;          // PostgREST default max rows per request
  const STALE_DAYS = 7;            // home banner after this many days
  const FRESH_HOURS = 12;          // no "back up first?" question if newer than this
  const HISTORY_KEEP = 20;

  // Tables and the column orders tried for stable paging (first that works wins).
  const TABLES = [
    ['students', [['id']]],
    ['student_details', [['student_id']]],
    ['student_year_rosters', [['academic_year', 'student_id']]],
    ['subjects', [['id']]],
    ['scores', [['id'], ['student_id', 'subject_id', 'academic_year', 'semester']]],
    ['attendance_daily', [['id'], ['student_id', 'attendance_date']]],
    ['attendance_monthly', [['id'], ['student_id', 'year_month', 'day_number']]],
    ['assessments', [['id'], ['student_id', 'assessment_type', 'criteria_code', 'semester', 'academic_year']]],
    ['student_growth', [['id'], ['student_id', 'measured_on']]],
    ['student_comments', [['id'], ['student_id', 'academic_year', 'semester']]],
    ['behavior_records', [['id']]],
    ['teacher_assignments', [['id'], ['academic_year', 'grade', 'room']]],
    ['teacher_access_assignments', [['id']]],
    ['teacher_scope_settings', [['id']]],
    ['teachers', [['id']]],
    ['holidays', [['id'], ['holiday_date']]],
    ['school_settings', [['id']]],
    ['school_signatures', [['id']]],
    ['academic_years', [['academic_year']]],
    ['academic_year_report_snapshots', [['academic_year', 'captured_at', 'id']]],
    ['academic_year_transitions', [['id']]],
    ['academic_year_transition_drafts', [['id']]],
    ['academic_year_transition_students', [['draft_id', 'student_id']]],
    ['parent_student_links', [['id'], ['parent_user_id', 'student_id']]],
    ['user_profiles', [['id']]],
    ['student_import_runs', [['id']]],
    ['student_import_snapshots', [['id'], ['import_id', 'student_id']]],
    ['audit_logs', [['id']]]
  ];

  const SCOPE_TABLES = new Set(['teacher_access_assignments', 'teacher_scope_settings']);
  async function installedTables() {
    const installed = global.PP5Permissions ? (await global.PP5Permissions.context()).installed : false;
    return TABLES.filter(([name]) => installed || !SCOPE_TABLES.has(name));
  }

  const SCORE_FIELDS = [
    ['formative_score', 'คะแนนเก็บ'],
    ['summative_score', 'คะแนนสอบ'],
    ['total_score', 'รวม'],
    ['grade_point', 'เกรด'],
    ['grade_text', 'ผลพิเศษ (ร/มส)']
  ];

  // ───────────────────────── small helpers ─────────────────────────
  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const pick = (row, ...keys) => { for (const k of keys) if (row && txt(row[k]) !== '') return row[k]; return ''; };
  const esc = (v) => txt(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  const thaiTime = (iso) => { try { return iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-'; } catch (_) { return txt(iso); } };
  const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : Infinity);
  const sameValue = (a, b) => {
    if (txt(a) === '' && txt(b) === '') return true;
    const na = Number(a); const nb = Number(b);
    if (txt(a) !== '' && txt(b) !== '' && Number.isFinite(na) && Number.isFinite(nb)) return Math.abs(na - nb) < 1e-9;
    return txt(a) === txt(b);
  };
  const scoreKey = (s) => [txt(s.student_id), txt(s.subject_id), txt(s.semester), txt(s.academic_year)].join('|');
  const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
  // ASCII-only file names: some browsers drop a non-ASCII download name to "download".
  const asciiName = (v) => txt(v).replace(/^ป\.?/, 'P').replace(/^อ\.?/, 'K').replace(/[^A-Za-z0-9-]+/g, '');
  const num = (v) => (txt(v) === '' ? '' : (Number.isFinite(Number(v)) ? Number(v) : v));

  function pp5() {
    const d = global.PP5Data;
    if (!d?.client) throw new Error('ระบบฐานข้อมูลยังโหลดไม่เสร็จ กรุณาโหลดหน้าเว็บใหม่');
    return d;
  }

  async function requireAdmin() {
    const state = await pp5().auth.requireUser();
    if (txt(state.profile?.role).toLowerCase() !== 'admin') throw new Error('เฉพาะผู้ดูแลระบบ (admin) เท่านั้น');
    return state;
  }

  const isColumnError = (e) => /column|does not exist|42703|PGRST100|failed to parse order/i.test(`${e?.code || ''} ${e?.message || ''} ${e?.details || ''}`);
  const isMissingTable = (e) => /relation|does not exist|42P01|PGRST205|schema cache|Could not find the table/i.test(`${e?.code || ''} ${e?.message || ''}`);

  // ───────────────────────── reading the live system ─────────────────────────
  async function readWholeTable(client, table, orderCandidates) {
    const head = await client.from(table).select('*', { count: 'exact', head: true });
    if (head.error) return { skipped: isMissingTable(head.error) ? 'ไม่มีตารางนี้' : `อ่านไม่ได้: ${head.error.message}` };
    const expected = head.count;

    for (const order of [...orderCandidates, null]) {
      const rows = [];
      let failedOnOrder = false;
      for (let from = 0; ; from += PAGE_SIZE) {
        let query = client.from(table).select('*').range(from, from + PAGE_SIZE - 1);
        for (const col of order || []) query = query.order(col, { ascending: true, nullsFirst: true });
        const { data, error } = await query;
        if (error) {
          if (from === 0 && order && isColumnError(error)) { failedOnOrder = true; break; }
          throw new Error(`อ่านตาราง ${table} ไม่สำเร็จ: ${error.message}`);
        }
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }
      if (failedOnOrder) continue;
      const verified = expected === null || expected === undefined ? null : rows.length === expected;
      return { rows, expected, verified, orderedBy: order || [] };
    }
    return { skipped: 'อ่านไม่ได้' };
  }

  async function createBackup(onProgress = () => {}) {
    const state = await requireAdmin();
    const { client } = pp5();
    const tables = await installedTables();
    const started = new Date();
    let settings = {};
    try { settings = await pp5().settings.get(); } catch (_) { /* optional */ }

    const payload = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      source: 'web',
      createdAt: started.toISOString(),
      finishedAt: '',
      createdBy: txt(state.profile?.display_name || state.profile?.displayName || state.profile?.username || state.user?.email),
      schoolName: txt(settings.schoolName || settings.school_name),
      academicYear: txt(settings.academicYear),
      semester: txt(settings.semester),
      note: 'อ่านผ่านสิทธิ์ผู้ดูแลที่ล็อกอิน ทีละตาราง — ไม่รวมรหัสผ่านบัญชีผู้ใช้',
      tables: {},
      skipped: [],
      warnings: []
    };

    for (let i = 0; i < tables.length; i += 1) {
      const [table, orders] = tables[i];
      onProgress({ index: i, total: tables.length, table, phase: 'reading' });
      let result;
      try { result = await readWholeTable(client, table, orders); } catch (error) { result = { error: error.message }; }
      if (result.error) {
        payload.skipped.push({ table, reason: result.error });
        payload.warnings.push(`${table}: ${result.error}`);
      } else if (result.skipped) {
        payload.skipped.push({ table, reason: result.skipped });
      } else {
        payload.tables[`public.${table}`] = { count: result.rows.length, expected: result.expected, verified: result.verified, orderedBy: result.orderedBy, rows: result.rows };
        if (result.verified === false) payload.warnings.push(`${table}: อ่านได้ ${result.rows.length} แถว แต่ระบบนับได้ ${result.expected} (อาจมีคนกำลังบันทึกอยู่)`);
      }
      onProgress({ index: i, total: tables.length, table, phase: 'done', rows: payload.tables[`public.${table}`]?.count });
    }
    payload.finishedAt = new Date().toISOString();

    const totalRows = Object.values(payload.tables).reduce((s, t) => s + t.count, 0);
    if (!payload.tables['public.students'] || !payload.tables['public.scores']) {
      throw new Error('อ่านตารางนักเรียนหรือคะแนนไม่ได้ — ไม่สร้างไฟล์สำรอง');
    }

    const json = JSON.stringify(payload);
    payload.sha256 = await sha256Hex(json);
    const blob = await gzipText(JSON.stringify(payload));
    const fileName = `pp5_backup_${stamp(started)}${blob.gzipped ? '.json.gz' : '.json'}`;
    downloadBlob(blob.blob, fileName);

    const summary = {
      at: payload.createdAt,
      by: payload.createdBy,
      file: fileName,
      tables: Object.keys(payload.tables).length,
      rows: totalRows,
      bytes: blob.blob.size,
      warnings: payload.warnings.length
    };
    try { await recordBackup(summary); } catch (error) { summary.recordError = error.message; }
    try { document.getElementById('pp5BackupBanner')?.remove(); } catch (_) { /* no banner */ }
    return { ...summary, payload, blob: blob.blob };
  }

  async function sha256Hex(text) {
    if (!global.crypto?.subtle) return '';
    const buf = await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function gzipText(text) {
    const plain = new Blob([text], { type: 'application/json' });
    if (typeof global.CompressionStream !== 'function') return { blob: plain, gzipped: false };
    const stream = plain.stream().pipeThrough(new global.CompressionStream('gzip'));
    return { blob: new Blob([await new Response(stream).arrayBuffer()], { type: 'application/gzip' }), gzipped: true };
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ───────────────────────── yearly archive (.zip) ─────────────────────────
  // One academic year in the same layout as backup_database.cmd (manifest.json +
  // public.<table>.jsonl), so "เปิดไฟล์สำรอง" opens it like any other backup.
  // Export only: nothing is deleted or moved out of the live system. Login accounts,
  // parent links, signatures, audit logs and import/transition bookkeeping are left out.
  const YEAR_FORMAT = 'pp5-year-archive';
  // Rows that carry their own academic_year (or a date that falls inside the year).
  const YEAR_ROW_TABLES = ['student_year_rosters', 'scores', 'assessments', 'student_comments', 'behavior_records', 'teacher_assignments', 'teacher_access_assignments',
    'attendance_daily', 'attendance_monthly', 'student_growth', 'holidays', 'academic_years', 'academic_year_report_snapshots'];
  const YEAR_DATE_FIELDS = ['attendance_date', 'holiday_date', 'measured_on'];
  // Rows kept for the year's students only.
  const YEAR_STUDENT_TABLES = ['students', 'student_details'];
  // Small reference tables kept whole so the archive can be read on its own.
  const YEAR_REFERENCE_TABLES = ['subjects', 'teachers', 'school_settings'];

  // Thai academic year: May–December belongs to that year, January–April to the previous one
  // (same rule as academicYearFromCalendarDate in gas-bridge.js).
  function academicYearOfDate(value) {
    const m = txt(value).match(/^(\d{4})-(\d{2})/);
    if (!m) return '';
    let year = Number(m[1]);
    if (year >= 2400) year -= 543;
    return String(year + (Number(m[2]) >= 5 ? 543 : 542));
  }

  function rowAcademicYear(row) {
    if (txt(row?.academic_year)) return txt(row.academic_year);
    for (const field of YEAR_DATE_FIELDS) if (txt(row?.[field])) return academicYearOfDate(row[field]);
    return '';
  }

  // tables: { name: rows[] } read from the live system -> { name: rows[] } for one year.
  function selectYearRows(tables, year) {
    const y = txt(year);
    const rowsOf = (name) => (Array.isArray(tables[name]) ? tables[name] : []);
    const out = {};
    for (const name of YEAR_ROW_TABLES) if (name in tables) out[name] = rowsOf(name).filter((row) => rowAcademicYear(row) === y);
    // The year's students: that year's roster, plus anyone with a record in that year.
    const ids = new Set((out.student_year_rosters || []).map((row) => txt(row.student_id)));
    ['scores', 'assessments', 'student_comments', 'attendance_daily', 'attendance_monthly', 'student_growth']
      .forEach((name) => (out[name] || []).forEach((row) => { if (txt(row.student_id)) ids.add(txt(row.student_id)); }));
    if (!ids.size) rowsOf('students').filter((s) => txt(s.academic_year) === y).forEach((s) => ids.add(txt(s.id)));
    if ('students' in tables) out.students = rowsOf('students').filter((s) => ids.has(txt(s.id)));
    if ('student_details' in tables) out.student_details = rowsOf('student_details').filter((row) => ids.has(txt(row.student_id)));
    // Preserve legacy rows supplied by old files; new exports never query this obsolete table.
    if ('teacher_comments' in tables) {
      out.teacher_comments = rowsOf('teacher_comments').filter((row) => (rowAcademicYear(row) ? rowAcademicYear(row) === y : ids.has(txt(row.student_id))));
    }
    for (const name of YEAR_REFERENCE_TABLES) if (name in tables) out[name] = rowsOf(name);
    return out;
  }

  function buildYearZip(selected, meta) {
    const CFB = global.XLSX?.CFB;
    if (!CFB?.utils?.cfb_new || typeof CFB.write !== 'function') throw new Error('สร้างไฟล์ .zip ไม่ได้ (ตัวเขียนไฟล์ยังไม่โหลด) กรุณาโหลดหน้าเว็บใหม่');
    const encoder = new TextEncoder();
    const names = Object.keys(selected).sort();
    const manifest = {
      format: YEAR_FORMAT,
      formatVersion: 1,
      ...meta,
      tables: names.map((name) => ({ schema: 'public', name, rows: selected[name].length }))
    };
    const zip = CFB.utils.cfb_new();
    CFB.utils.cfb_add(zip, 'manifest.json', encoder.encode(JSON.stringify(manifest, null, 2)));
    names.forEach((name) => {
      const rows = selected[name];
      CFB.utils.cfb_add(zip, `public.${name}.jsonl`, encoder.encode(rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '')));
    });
    CFB.utils.cfb_add(zip, 'README.txt', encoder.encode([
      `ไฟล์สำรองข้อมูลรายปี ระบบ ปพ.5 — ปีการศึกษา ${meta.academicYear}`,
      `สร้างเมื่อ ${meta.createdAt} โดย ${meta.createdBy || '-'}`,
      '',
      'เปิดดู: เข้าเมนู สำรองข้อมูล > เลือกไฟล์สำรอง แล้วเลือกไฟล์ .zip นี้',
      'manifest.json บอกจำนวนแถวของแต่ละตาราง ใช้ตรวจว่าไฟล์ครบ',
      'ไฟล์นี้มีเลขประจำตัวประชาชนและข้อมูลส่วนบุคคลของนักเรียน — เก็บในที่จำกัดสิทธิ์'
    ].join('\r\n')));
    const bytes = CFB.write(zip, { type: 'array', fileType: 'zip', compression: true });
    return { bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), manifest };
  }

  async function yearOptions() {
    let current = '';
    try { current = txt((await pp5().settings.get()).academicYear); } catch (_) { /* optional */ }
    let rows = [];
    try {
      const { data, error } = await pp5().client.from('academic_years').select('academic_year');
      if (!error) rows = data || [];
    } catch (_) { /* optional */ }
    const years = [...new Set([current, ...rows.map((row) => txt(row.academic_year))])].filter((y) => /^\d{4}$/.test(y)).sort().reverse();
    return { current, years };
  }

  async function createYearArchive(year, onProgress = () => {}) {
    const state = await requireAdmin();
    const y = txt(year);
    if (!/^\d{4}$/.test(y)) throw new Error('กรุณาเลือกปีการศึกษา');
    const { client } = pp5();
    const orders = new Map(TABLES);
    const available = new Set((await installedTables()).map(([name]) => name));
    const wanted = [...YEAR_ROW_TABLES, ...YEAR_STUDENT_TABLES, ...YEAR_REFERENCE_TABLES].filter((name) => !SCOPE_TABLES.has(name) || available.has(name));
    const tables = {};
    const warnings = [];
    for (let i = 0; i < wanted.length; i += 1) {
      const table = wanted[i];
      onProgress({ index: i, total: wanted.length, table });
      let result;
      try { result = await readWholeTable(client, table, orders.get(table) || []); } catch (error) { result = { error: error.message }; }
      if (result.error) warnings.push(`${table}: ${result.error}`);
      else if (result.skipped) { if (result.skipped !== 'ไม่มีตารางนี้') warnings.push(`${table}: ${result.skipped}`); }
      else {
        tables[table] = result.rows;
        if (result.verified === false) warnings.push(`${table}: อ่านได้ ${result.rows.length} แถว แต่ระบบนับได้ ${result.expected} (อาจมีคนกำลังบันทึกอยู่)`);
      }
    }
    if (!tables.students || !tables.scores) throw new Error('อ่านตารางนักเรียนหรือคะแนนไม่ได้ — ไม่สร้างไฟล์');
    const selected = selectYearRows(tables, y);
    if (!selected.students?.length) throw new Error(`ไม่พบนักเรียนหรือคะแนนของปีการศึกษา ${y} — ไม่สร้างไฟล์`);
    let settings = {};
    try { settings = await pp5().settings.get(); } catch (_) { /* optional */ }
    const createdAt = new Date();
    const { bytes, manifest } = buildYearZip(selected, {
      source: 'web',
      academicYear: y,
      createdAt: createdAt.toISOString(),
      createdBy: txt(state.profile?.display_name || state.profile?.displayName || state.profile?.username || state.user?.email),
      schoolName: txt(settings.schoolName || settings.school_name),
      warnings
    });
    const blob = new Blob([bytes], { type: 'application/zip' });
    const file = `pp5_year_${y}_${stamp(createdAt)}.zip`;
    downloadBlob(blob, file);
    const rows = manifest.tables.reduce((sum, t) => sum + t.rows, 0);
    return { file, blob, bytes: blob.size, year: y, tables: manifest.tables, rows, students: selected.students.length, warnings };
  }

  // ───────────────────────── student photos (.zip) ─────────────────────────
  // Photos live in the private Storage bucket "student-photos", not in a table, so the
  // backups above only keep the reference ("sb:student-photos/<id>/<ms>.jpg" in
  // student_details.source_data.photo_url). This downloads the files themselves into
  // photos/<id>.jpg — named by student ID, so restoring is: unzip, open "รูปนักเรียน"
  // in the student manager and pick the files (they match automatically). Read only.
  const PHOTO_FORMAT = 'pp5-student-photos';
  const PHOTO_BUCKET = 'student-photos';
  const PHOTO_PARALLEL = 4;

  function photoEntries(details, students) {
    const byId = new Map((students || []).map((row) => [txt(row.id), row]));
    const seen = new Set();
    const entries = [];
    (details || []).forEach((row) => {
      const id = txt(row.student_id);
      const ref = txt(row.source_data?.photo_url);
      if (!id || seen.has(id) || !ref.startsWith(`sb:${PHOTO_BUCKET}/`)) return;
      seen.add(id);
      const student = byId.get(id) || {};
      entries.push({
        id,
        name: [student.prefix, student.first_name].map(txt).join('') + (txt(student.last_name) ? ` ${txt(student.last_name)}` : ''),
        grade: txt(student.grade),
        room: txt(student.room),
        storagePath: ref.slice(`sb:${PHOTO_BUCKET}/`.length),
        file: `photos/${id.replace(/[^0-9A-Za-z_-]/g, '_')}.jpg`
      });
    });
    return entries.sort((a, b) => a.id.localeCompare(b.id, 'th', { numeric: true }));
  }

  function buildPhotoZip(files, meta) {
    const CFB = global.XLSX?.CFB;
    if (!CFB?.utils?.cfb_new || typeof CFB.write !== 'function') throw new Error('สร้างไฟล์ .zip ไม่ได้ (ตัวเขียนไฟล์ยังไม่โหลด) กรุณาโหลดหน้าเว็บใหม่');
    const encoder = new TextEncoder();
    const manifest = { format: PHOTO_FORMAT, formatVersion: 1, ...meta, count: files.length,
      photos: files.map(({ bytes, ...entry }) => entry) };
    const zip = CFB.utils.cfb_new();
    CFB.utils.cfb_add(zip, 'manifest.json', encoder.encode(JSON.stringify(manifest, null, 2)));
    files.forEach((entry) => CFB.utils.cfb_add(zip, entry.file, entry.bytes));
    CFB.utils.cfb_add(zip, 'README.txt', encoder.encode([
      'ไฟล์สำรองรูปนักเรียน ระบบ ปพ.5',
      `สร้างเมื่อ ${meta.createdAt} โดย ${meta.createdBy || '-'} · ${files.length} รูป`,
      '',
      'ชื่อไฟล์ในโฟลเดอร์ photos = รหัสนักเรียน (manifest.json บอกชื่อ ชั้น ห้อง ของแต่ละรูป)',
      'กู้คืน: แตกไฟล์ zip นี้ > หน้า ข้อมูลนักเรียน > รายชื่อนักเรียน > ปุ่ม "รูปนักเรียน"',
      '       > เลือกรูปทั้งหมดในโฟลเดอร์ photos > อัปโหลด (ระบบจับคู่รหัสให้เอง)',
      'ไฟล์นี้มีรูปถ่ายนักเรียน — เก็บในที่จำกัดสิทธิ์'
    ].join('\r\n')));
    const bytes = CFB.write(zip, { type: 'array', fileType: 'zip', compression: false });
    return { bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), manifest };
  }

  async function createPhotoArchive(onProgress = () => {}) {
    const state = await requireAdmin();
    const { client } = pp5();
    if (!client.storage?.from) throw new Error('ระบบเก็บไฟล์ยังไม่พร้อม กรุณาโหลดหน้าเว็บใหม่');
    const read = async (table) => {
      const result = await readWholeTable(client, table, new Map(TABLES).get(table) || []);
      if (!result.rows) throw new Error(`อ่านตาราง ${table} ไม่ได้ — ไม่สร้างไฟล์`);
      return result.rows;
    };
    const entries = photoEntries(await read('student_details'), await read('students'));
    if (!entries.length) throw new Error('ยังไม่มีรูปนักเรียนในระบบ');
    const bucket = client.storage.from(PHOTO_BUCKET);
    const files = [];
    const warnings = [];
    let next = 0;
    let finished = 0;
    const worker = async () => {
      while (next < entries.length) {
        const entry = entries[next];
        next += 1;
        try {
          const { data, error } = await bucket.download(entry.storagePath);
          if (error || !data) throw new Error(error?.message || 'ไม่มีไฟล์');
          files.push({ ...entry, bytes: new Uint8Array(await data.arrayBuffer()) });
        } catch (error) {
          warnings.push(`${entry.id} ${entry.name}: ดาวน์โหลดรูปไม่ได้ (${txt(error?.message || error)})`);
        }
        finished += 1;
        onProgress({ index: finished - 1, total: entries.length, table: `รูป ${entry.id}` });
      }
    };
    await Promise.all(Array.from({ length: Math.min(PHOTO_PARALLEL, entries.length) }, worker));
    if (!files.length) throw new Error(`ดาวน์โหลดรูปไม่ได้เลย — ไม่สร้างไฟล์ (${warnings[0] || ''})`);
    files.sort((a, b) => a.id.localeCompare(b.id, 'th', { numeric: true }));
    const createdAt = new Date();
    const { bytes } = buildPhotoZip(files, {
      createdAt: createdAt.toISOString(),
      createdBy: txt(state.profile?.display_name || state.profile?.displayName || state.profile?.username || state.user?.email),
      expected: entries.length,
      warnings
    });
    const blob = new Blob([bytes], { type: 'application/zip' });
    const file = `pp5_photos_${stamp(createdAt)}.zip`;
    downloadBlob(blob, file);
    return { file, blob, bytes: blob.size, photos: files.length, expected: entries.length, warnings };
  }

  // ───────────────────────── last-backup note ─────────────────────────
  async function readSettingsRow() {
    const { data, error } = await pp5().client.from('school_settings').select('id, settings_json').limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
  }

  async function getBackupStatus() {
    const row = await readSettingsRow();
    const info = row?.settings_json?.backup || {};
    return { last: info.last || null, history: Array.isArray(info.history) ? info.history : [] };
  }

  async function recordBackup(summary) {
    const row = await readSettingsRow();
    if (!row?.id) throw new Error('ไม่พบแถวตั้งค่าโรงเรียน');
    const json = { ...(row.settings_json || {}) };
    const prev = json.backup || {};
    const history = [summary, ...(Array.isArray(prev.history) ? prev.history : [])].slice(0, HISTORY_KEEP);
    json.backup = { last: summary, history };
    // เขียนเฉพาะคีย์ backup (ไม่ทับธีม/ลายน้ำที่ผู้ดูแลเพิ่งบันทึก) ผ่าน patchSettingsJson ถ้ามี
    if (typeof pp5().settings?.patchSettingsJson === 'function') {
      await pp5().settings.patchSettingsJson('backup', json.backup, 'บันทึกเวลาสำรองล่าสุดไม่สำเร็จ');
      return;
    }
    const { error } = await pp5().client.from('school_settings').update({ settings_json: json }).eq('id', row.id);
    if (error) throw new Error(`บันทึกเวลาสำรองล่าสุดไม่สำเร็จ: ${error.message}`);
  }

  // ───────────────────────── opening a backup file ─────────────────────────
  async function gunzipToText(bytes) {
    if (typeof global.DecompressionStream !== 'function') throw new Error('เบราว์เซอร์นี้เปิดไฟล์ .gz ไม่ได้ กรุณาใช้ Chrome หรือ Edge รุ่นใหม่');
    const stream = new Blob([bytes]).stream().pipeThrough(new global.DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  // A .zip made by backup_database.cmd: one public.<table>.jsonl per table + manifest.json.
  function readCliZip(bytes) {
    const CFB = global.XLSX?.CFB;
    if (!CFB?.read) throw new Error('เปิดไฟล์ .zip ไม่ได้ (ตัวอ่านไฟล์ยังไม่โหลด)');
    const zip = CFB.read(bytes, { type: 'array' });
    const decoder = new TextDecoder('utf-8');
    const tables = {};
    let manifest = null;
    zip.FullPaths.forEach((fullPath, i) => {
      const entry = zip.FileIndex[i];
      if (!entry || entry.type !== 2 || !entry.content) return;
      const base = fullPath.split('/').pop();
      const text = decoder.decode(entry.content instanceof Uint8Array ? entry.content : new Uint8Array(entry.content));
      if (base === 'manifest.json') { manifest = JSON.parse(text); return; }
      const m = base.match(/^(public|auth|supabase_migrations)\.(.+)\.jsonl$/);
      if (!m) return;
      const rows = text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
      tables[`${m[1]}.${m[2]}`] = { count: rows.length, rows };
    });
    if (!manifest) throw new Error('ไฟล์ .zip นี้ไม่ใช่ไฟล์สำรอง ปพ.5 (ไม่มี manifest.json)');
    for (const t of manifest.tables || []) {
      const key = `${t.schema}.${t.name}`;
      const got = tables[key];
      // A zip tool may drop a zero-byte entry, so an empty table can arrive with no file at all.
      if (!got && Number(t.rows) === 0) { tables[key] = { count: 0, rows: [] }; continue; }
      if (!got) throw new Error(`ไฟล์เสียหาย: ไม่พบข้อมูลตาราง ${key} (ควรมี ${t.rows} แถว)`);
      if (got.count !== t.rows) throw new Error(`ไฟล์เสียหาย: ${key} มี ${got.count} แถว แต่ควรมี ${t.rows}`);
    }
    const yearArchive = manifest.format === YEAR_FORMAT;
    return {
      format: FORMAT,
      source: yearArchive ? 'year' : 'cli',
      createdAt: manifest.createdAt,
      createdBy: yearArchive ? txt(manifest.createdBy) || 'สำรองรายปี' : 'backup_database.cmd',
      academicYear: yearArchive ? txt(manifest.academicYear) : '',
      tables, skipped: [], warnings: manifest.warnings || []
    };
  }

  async function openBackupFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let backup;
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      backup = readCliZip(bytes);
    } else {
      const text = bytes[0] === 0x1f && bytes[1] === 0x8b ? await gunzipToText(bytes) : new TextDecoder('utf-8').decode(bytes);
      try { backup = JSON.parse(text); } catch (_) { throw new Error('อ่านไฟล์ไม่ได้ — ไม่ใช่ไฟล์สำรอง ปพ.5'); }
      if (backup?.format !== FORMAT) throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรอง ปพ.5');
      for (const [name, t] of Object.entries(backup.tables || {})) {
        if (!Array.isArray(t.rows) || t.rows.length !== t.count) throw new Error(`ไฟล์เสียหาย: ตาราง ${name} ไม่ครบ`);
      }
      if (backup.sha256) {
        const { sha256, ...rest } = backup;
        const check = await sha256Hex(JSON.stringify(rest));
        backup.integrity = check ? (check === sha256 ? 'ok' : 'mismatch') : 'unchecked';
      }
    }
    backup.fileName = file.name;
    return backup;
  }

  const tableRows = (backup, name) => backup?.tables?.[`public.${name}`]?.rows || [];

  // ───────────────────────── scores view + compare (pure) ─────────────────────────
  // Where each student sat IN THAT YEAR (year roster first, current record as
  // fallback) and whether they match the filter.
  function filterContext(backup, filter) {
    const year = txt(filter.year);
    const students = tableRows(backup, 'students');
    const rosters = tableRows(backup, 'student_year_rosters').filter((r) => txt(r.academic_year) === year);
    const studentById = new Map(students.map((s) => [txt(s.id), s]));
    const rosterById = new Map(rosters.map((r) => [txt(r.student_id), r]));
    const placeOf = (id) => {
      const r = rosterById.get(id); const s = studentById.get(id) || {};
      return { grade: txt(pick(r, 'grade') || pick(s, 'grade')), room: txt(pick(r, 'room') || pick(s, 'room', 'class_no')), no: txt(pick(r, 'student_number') || pick(s, 'student_number')) };
    };
    const nameOf = (id) => {
      const s = studentById.get(id) || {};
      return `${txt(pick(s, 'prefix', 'title'))}${txt(pick(s, 'first_name', 'firstname'))} ${txt(pick(s, 'last_name', 'lastname'))}`.trim();
    };
    const q = txt(filter.search).toLowerCase();
    const wanted = (id) => {
      const p = placeOf(id);
      if (filter.grade && p.grade !== txt(filter.grade)) return false;
      if (filter.room && p.room !== txt(filter.room)) return false;
      if (q && !id.toLowerCase().includes(q) && !nameOf(id).toLowerCase().includes(q)) return false;
      return true;
    };
    return { year, placeOf, nameOf, wanted, rosterIds: [...rosterById.keys()] };
  }

  function buildScoreRows(backup, filter, liveRows) {
    const { year, placeOf, nameOf, wanted } = filterContext(backup, filter);
    const subjectById = new Map(tableRows(backup, 'subjects').map((s) => [txt(s.id), s]));

    const fromBackup = tableRows(backup, 'scores').filter((s) => txt(s.academic_year) === year && wanted(txt(s.student_id)));
    const compare = Array.isArray(liveRows);
    const liveByKey = new Map((liveRows || []).filter((s) => wanted(txt(s.student_id))).map((s) => [scoreKey(s), s]));
    const seen = new Set();
    const make = (b, l) => {
      const base = b || l;
      const id = txt(base.student_id);
      const subj = subjectById.get(txt(base.subject_id)) || {};
      const p = placeOf(id);
      let kind = ''; let changed = [];
      if (compare) {
        if (b && !l) kind = 'gone';
        else if (!b && l) kind = 'new';
        else { changed = SCORE_FIELDS.filter(([f]) => !sameValue(b[f], l[f])).map(([, label]) => label); kind = changed.length ? 'changed' : 'same'; }
      }
      const status = { gone: 'ถูกลบในระบบปัจจุบัน', new: 'เพิ่มหลังวันสำรอง', changed: `แก้ไขแล้ว: ${changed.join(', ')}`, same: 'เหมือนเดิม' }[kind] || '';
      return {
        id, name: nameOf(id), grade: p.grade, room: p.room, no: p.no,
        code: txt(pick(subj, 'code', 'subject_code')) || txt(base.subject_id), subject: txt(pick(subj, 'name', 'subject_name')),
        semester: txt(base.semester), b, l, kind, status, updatedAt: b ? pick(b, 'updated_at', 'created_at') : ''
      };
    };
    const rows = [];
    for (const b of fromBackup) { const k = scoreKey(b); seen.add(k); rows.push(make(b, liveByKey.get(k))); }
    if (compare) for (const [k, l] of liveByKey) if (!seen.has(k)) rows.push(make(null, l));
    rows.sort((x, y) => x.grade.localeCompare(y.grade, 'th') || (Number(x.room) - Number(y.room)) || (Number(x.no) - Number(y.no))
      || x.id.localeCompare(y.id, undefined, { numeric: true }) || x.code.localeCompare(y.code) || x.semester.localeCompare(y.semester));
    const counts = { same: 0, changed: 0, gone: 0, new: 0 };
    rows.forEach((r) => { if (counts[r.kind] !== undefined) counts[r.kind] += 1; });
    return { rows, compare, counts, studentIds: [...new Set(fromBackup.map((s) => txt(s.student_id)))] };
  }

  // Student ids in scope for the live query: everyone matching the filter that year.
  function scopeStudentIds(backup, filter) {
    const { year, wanted, rosterIds } = filterContext(backup, filter);
    const ids = new Set(rosterIds.filter(wanted));
    tableRows(backup, 'scores').forEach((s) => { const id = txt(s.student_id); if (txt(s.academic_year) === year && wanted(id)) ids.add(id); });
    return [...ids];
  }

  async function fetchLiveScores(year, studentIds) {
    await requireAdmin();
    const { client } = pp5();
    const out = [];
    for (let i = 0; i < studentIds.length; i += 150) {
      const chunk = studentIds.slice(i, i + 150);
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client.from('scores').select('*').eq('academic_year', year).in('student_id', chunk).range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(`อ่านคะแนนปัจจุบันไม่สำเร็จ: ${error.message}`);
        out.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
      }
    }
    return out;
  }

  function scoreSheetAoa(result) {
    const head = ['เลขประจำตัว', 'ชื่อ-สกุล', 'ชั้น', 'ห้อง', 'เลขที่', 'รหัสวิชา', 'วิชา', 'ภาค',
      ...SCORE_FIELDS.map(([, l]) => (result.compare ? `${l} (สำรอง)` : l))];
    if (result.compare) head.push(...SCORE_FIELDS.map(([, l]) => `${l} (ปัจจุบัน)`), 'ผลการเทียบ');
    head.push('บันทึกล่าสุด (ในไฟล์สำรอง)');
    const body = result.rows.map((r) => {
      const row = [r.id, r.name, r.grade, r.room, num(r.no), r.code, r.subject, num(r.semester), ...SCORE_FIELDS.map(([f]) => num(r.b?.[f]))];
      if (result.compare) row.push(...SCORE_FIELDS.map(([f]) => num(r.l?.[f])), r.status);
      row.push(r.updatedAt ? thaiTime(r.updatedAt) : '');
      return row;
    });
    return [head, ...body];
  }

  function downloadExcel(sheets, fileName) {
    const X = global.XLSX;
    if (!X?.utils) throw new Error('ตัวสร้างไฟล์ Excel ยังโหลดไม่เสร็จ กรุณาโหลดหน้าเว็บใหม่');
    const wb = X.utils.book_new();
    sheets.forEach(({ name, aoa, widths }) => {
      const ws = X.utils.aoa_to_sheet(aoa);
      if (widths) ws['!cols'] = widths.map((wch) => ({ wch }));
      X.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    });
    X.writeFile(wb, fileName);
  }

  // ───────────────────────── modal (no dependency) ─────────────────────────
  function injectStyles() {
    if (document.getElementById('pp5BackupStyles')) return;
    const style = document.createElement('style');
    style.id = 'pp5BackupStyles';
    style.textContent = [
      '.pp5bk,.pp5bk-overlay,.pp5bk-banner{--bk-card:#fff;--bk-line:#e7e9f2;--bk-text:#1e1b3a;--bk-muted:#64748b;--bk-primary:var(--primary);--bk-primary-dk:color-mix(in srgb, var(--primary) 85%, #000);--bk-soft:#f7f8fd}',
      '.pp5bk{color:var(--bk-text);display:grid;gap:16px;max-width:1100px;margin:0 auto;min-width:0;font-size:.95rem}',
      '.pp5bk>*,.pp5bk-card,.pp5bk-card>*{min-width:0}',
      '.pp5bk-card{background:var(--bk-card);border:1px solid var(--bk-line);border-radius:18px;padding:20px 22px;box-shadow:0 1px 2px rgba(30,27,58,.03)}',
      '.pp5bk h2{font-size:1.3rem;font-weight:700;margin:0}.pp5bk h3{font-size:1.02rem;font-weight:700;margin:0;display:flex;align-items:center;gap:9px}',
      '.pp5bk-muted{color:var(--bk-muted);font-size:.87rem;line-height:1.5}',
      // hero header — used only when the page is opened on its own (not inside a settings tab)
      '.pp5bk-hero{display:flex;align-items:center;gap:16px;border-radius:20px;padding:20px 24px;background:linear-gradient(135deg,#5b4ff0 0%,#8b7cff 100%);color:#fff;box-shadow:0 10px 24px rgba(91,79,240,.25)}',
      '.pp5bk-hero-icon{width:48px;height:48px;flex:0 0 48px;border-radius:14px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:1.4rem}',
      '.pp5bk-hero h2{color:#fff}.pp5bk-hero .pp5bk-muted{color:rgba(255,255,255,.85)}',
      '.pp5bk-badge{margin-left:auto;flex:0 0 auto;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:5px 14px;font-size:.78rem;font-weight:600;white-space:nowrap}',
      // slim header — used inside a settings tab, where the tab label already says "สำรองข้อมูล"
      '.pp5bk-slimhead{display:flex;align-items:center;gap:8px}',
      '.pp5bk-slimhead .pp5bk-muted{margin:0}',
      // status row
      '.pp5bk-status{display:flex;gap:18px;align-items:center;flex-wrap:wrap}',
      '.pp5bk-dot-wrap{width:44px;height:44px;flex:0 0 44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.2rem}',
      '.pp5bk-dot-wrap.good{background:#e7f9ee;color:#16a34a}.pp5bk-dot-wrap.warn{background:#fef3e2;color:#d97706}.pp5bk-dot-wrap.bad{background:#fde8e8;color:#dc2626}',
      '.pp5bk-big{font-size:1.05rem;font-weight:700}',
      '.pp5bk-btn{border:0;border-radius:12px;padding:11px 20px;font-weight:600;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;flex:0 0 auto}',
      '.pp5bk-btn.primary{background:var(--bk-primary);color:#fff;box-shadow:0 4px 10px color-mix(in srgb, var(--primary) 25%, transparent)}.pp5bk-btn.primary:hover{background:var(--bk-primary-dk)}.pp5bk-btn.primary:disabled{opacity:.6;cursor:wait;box-shadow:none}',
      '.pp5bk-btn.ghost{background:#eef0ff;color:var(--bk-primary)}.pp5bk-btn.plain{background:#f1f2f6;color:#334155}',
      '.pp5bk-progress{height:8px;border-radius:999px;background:var(--bk-soft);overflow:hidden;margin:14px 0 6px}',
      '.pp5bk-progress>div{height:100%;width:0;background:var(--bk-primary);transition:width .2s}',
      // notes: soft tint + a coloured left rail, calmer than a solid fill
      '.pp5bk-note{border-radius:12px;padding:12px 14px;font-size:.88rem;margin-top:12px;border-left:4px solid transparent;line-height:1.55}',
      '.pp5bk-note.good{background:#f2fbf6;border-color:#22c55e;color:#166534}.pp5bk-note.warn{background:#fffaf0;border-color:#f59e0b;color:#92400e}.pp5bk-note.bad{background:#fef4f4;border-color:#ef4444;color:#991b1b}',
      '.pp5bk-note-title{font-weight:700;display:flex;align-items:center;gap:6px;margin-bottom:2px}',
      '.pp5bk-note-extra{margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,0,0,.08);font-size:.85rem}',
      '.pp5bk-note-extra summary{cursor:pointer;font-weight:600;color:inherit}',
      // collapsible "how to" / history blocks — consistent <details> look instead of a raw numbered list
      '.pp5bk-details{margin-top:14px;border-top:1px solid var(--bk-line);padding-top:12px}',
      '.pp5bk-details summary{cursor:pointer;font-weight:600;font-size:.88rem;color:var(--bk-text);list-style:none;display:flex;align-items:center;gap:8px;user-select:none}',
      '.pp5bk-details summary::-webkit-details-marker{display:none}',
      '.pp5bk-details summary i.bi-chevron-right{transition:transform .15s ease;font-size:.75rem;color:var(--bk-muted)}',
      '.pp5bk-details[open] summary i.bi-chevron-right{transform:rotate(90deg)}',
      '.pp5bk-details-body{margin-top:10px;font-size:.88rem;color:var(--bk-muted)}',
      '.pp5bk-details-body ol{margin:0;padding-left:20px}.pp5bk-details-body li{margin-bottom:6px;line-height:1.5}.pp5bk-details-body li:last-child{margin-bottom:0}',
      '.pp5bk-details-body code{background:var(--bk-soft);border-radius:5px;padding:1px 6px;font-size:.85em}',
      '.pp5bk-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}',
      '.pp5bk-row label{display:grid;gap:4px;font-size:.82rem;color:var(--bk-muted)}',
      '.pp5bk-row select,.pp5bk-row input[type=text]{border:1px solid var(--bk-line);border-radius:10px;padding:8px 10px;font-family:inherit;min-width:110px;background:var(--bk-card);color:var(--bk-text)}',
      // native file picker restyled to match the button language of the rest of the page
      '.pp5bk-file{display:inline-flex}',
      '.pp5bk-file input[type=file]{font-family:inherit;font-size:.86rem;color:var(--bk-muted)}',
      '.pp5bk-file input[type=file]::file-selector-button{border:0;border-radius:10px;padding:9px 16px;font-weight:600;font-family:inherit;cursor:pointer;background:#eef0ff;color:var(--bk-primary);margin-right:12px}',
      '.pp5bk-file input[type=file]::file-selector-button:hover{background:#e2e5ff}',
      '.pp5bk-chips{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}',
      '.pp5bk-chip{border-radius:999px;padding:4px 12px;font-size:.82rem;font-weight:600}',
      '.pp5bk-chip.same{background:#f1f5f9;color:#334155}.pp5bk-chip.changed{background:#ffedd5;color:#9a3412}.pp5bk-chip.gone{background:#fee2e2;color:#991b1b}.pp5bk-chip.new{background:#dbeafe;color:#1e40af}',
      '.pp5bk-table-wrap{overflow:auto;max-height:520px;border:1px solid var(--bk-line);border-radius:12px}',
      '.pp5bk-table{border-collapse:collapse;width:100%;font-size:.84rem}',
      '.pp5bk-table th{position:sticky;top:0;background:var(--bk-soft);text-align:left;padding:9px 8px;border-bottom:1px solid var(--bk-line);white-space:nowrap;z-index:1;font-weight:700}',
      '.pp5bk-table td{padding:7px 8px;border-bottom:1px solid var(--bk-line);white-space:nowrap}',
      '.pp5bk-table tbody tr:hover td{background:var(--bk-soft)}',
      '.pp5bk-table tr.changed td{background:#fff7ed}.pp5bk-table tr.gone td{background:#fef2f2}.pp5bk-table tr.new td{background:#eff6ff}',
      '.pp5bk-table tr.changed:hover td{background:#fdecd3}.pp5bk-table tr.gone:hover td{background:#fbdada}.pp5bk-table tr.new:hover td{background:#dfeafd}',
      '.pp5bk-tabs{display:flex;gap:6px;margin-bottom:14px;border-bottom:1px solid var(--bk-line);padding-bottom:0}',
      '.pp5bk-tab{border:0;border-bottom:2px solid transparent;background:transparent;border-radius:0;padding:8px 4px;margin-right:14px;font-family:inherit;font-weight:600;font-size:.9rem;cursor:pointer;color:var(--bk-muted)}',
      '.pp5bk-tab.active{border-color:var(--bk-primary);color:var(--bk-primary)}',
      '.pp5bk-hist{width:100%;font-size:.84rem;border-collapse:collapse}',
      '.pp5bk-hist th{text-align:left;padding:6px 8px;font-size:.78rem;color:var(--bk-muted);font-weight:600;border-bottom:1px solid var(--bk-line)}',
      '.pp5bk-hist td{padding:7px 8px;border-bottom:1px solid var(--bk-line)}.pp5bk-hist tr:last-child td{border-bottom:0}',
      '.pp5bk-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:20000;padding:16px}',
      '.pp5bk-dialog{background:#fff;color:#1e1b3a;border-radius:18px;max-width:480px;width:100%;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.25)}',
      '.pp5bk-dialog h3{font-size:1.1rem;font-weight:700;margin:0 0 8px}.pp5bk-dialog p{margin:0 0 10px;font-size:.93rem;line-height:1.55}',
      '.pp5bk-dialog .pp5bk-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:14px}',
      '.pp5bk-banner{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-radius:16px;padding:12px 16px;margin-bottom:1rem;background:#fff8e7;border:1px solid #fbe3a6;color:#78350f}',
      '.pp5bk-banner.bad{background:#fef2f2;border-color:#fecaca;color:#7f1d1d}',
      '.pp5bk-banner b{font-weight:700}',
      '.pp5bk-btn.lg{padding:12px 22px;font-size:1rem}',
      '.pp5bk-dot-wrap.info{background:#eef0ff;color:var(--bk-primary)}',
      '.pp5bk-links{display:flex;gap:8px 20px;flex-wrap:wrap;align-items:center;margin-top:16px;padding-top:14px;border-top:1px solid var(--bk-line)}',
      '.pp5bk-link{border:0;background:none;padding:0;font-family:inherit;font-size:.88rem;font-weight:600;color:var(--bk-primary);cursor:pointer;display:inline-flex;gap:6px;align-items:center}.pp5bk-link:hover{text-decoration:underline}',
      '.pp5bk-links-note{margin-left:auto;font-size:.8rem}',
      '.pp5bk-dialog{position:relative}.pp5bk-dialog.wide{max-width:560px}.pp5bk-dialog h3{padding-right:40px}',
      '.pp5bk-x{position:absolute;top:14px;right:14px;border:0;background:#f1f2f6;width:32px;height:32px;border-radius:50%;cursor:pointer;color:#475569;display:flex;align-items:center;justify-content:center}',
      '.pp5bk-done{font-size:3.2rem;color:#16a34a;text-align:center;line-height:1;margin:4px 0 14px}',
      '.pp5bk-filechip{display:flex;gap:12px;align-items:center;border:1px solid var(--bk-line);border-radius:14px;padding:12px 14px;background:var(--bk-soft);word-break:break-all}.pp5bk-filechip>i{font-size:1.7rem;color:var(--bk-primary)}',
      '.pp5bk-where{display:flex;gap:12px;align-items:flex-start;margin-top:12px;padding:12px 14px;border-radius:14px;background:#fff8e6;color:#78350f;font-size:.9rem}.pp5bk-where>i{font-size:1.4rem;color:#f59e0b}.pp5bk-where .pp5bk-muted{color:#92400e;margin-top:2px}',
      '.pp5bk kbd,.pp5bk-dialog kbd{background:#fff;border:1px solid #d6d9e3;border-bottom-width:2px;border-radius:5px;padding:0 6px;font-size:.78rem;color:#334155;font-family:inherit}',
      '.pp5bk-steplist{list-style:none;counter-reset:s;margin:0;padding:0;display:grid;gap:14px}',
      '.pp5bk-steplist li{counter-increment:s;display:grid;grid-template-columns:30px 1fr;column-gap:12px}',
      '.pp5bk-steplist li::before{content:counter(s);grid-row:span 2;width:30px;height:30px;border-radius:50%;background:#eef0ff;color:var(--bk-primary);font-weight:700;display:flex;align-items:center;justify-content:center}',
      '.pp5bk-steplist b{display:block}.pp5bk-steplist span{color:var(--bk-muted);font-size:.87rem}',
      '[data-theme="dark"] .pp5bk-x{background:#2e3348;color:color-mix(in srgb, var(--primary-light) 30%, #fff)}[data-theme="dark"] .pp5bk-where{background:#332310;color:#fde8c0}[data-theme="dark"] .pp5bk-where .pp5bk-muted{color:#f5d7a1}',
      '@media (max-width:576px){.pp5bk-status .pp5bk-btn{width:100%;justify-content:center}.pp5bk-links-note{margin-left:0}}',
      '[data-theme="dark"] .pp5bk,[data-theme="dark"] .pp5bk-overlay{--bk-card:#1f2233;--bk-line:#2f3350;--bk-text:#e7e9f6;--bk-muted:#9ea6bd;--bk-soft:#262a40}',
      '[data-theme="dark"] .pp5bk-table tr.changed td{background:#3a2a17}[data-theme="dark"] .pp5bk-table tr.gone td{background:#3b1d1d}[data-theme="dark"] .pp5bk-table tr.new td{background:#1b2a45}',
      '[data-theme="dark"] .pp5bk-note.good{background:#132a1e}[data-theme="dark"] .pp5bk-note.warn{background:#332310}[data-theme="dark"] .pp5bk-note.bad{background:#301616}',
      '[data-theme="dark"] .pp5bk-file input[type=file]::file-selector-button{background:#2e3348;color:color-mix(in srgb, var(--primary-light) 30%, #fff)}',
      '[data-theme="dark"] .pp5bk-dialog{background:#1f2233;color:#e7e9f6}',
      '@media (max-width:576px){.pp5bk-card{padding:14px}.pp5bk-row>*{flex:1 1 45%}.pp5bk-hero{flex-wrap:wrap}.pp5bk-badge{margin-left:0}}'
    ].join('');
    document.head.appendChild(style);
  }

  // Resolves with the id of the button pressed.
  function dialog({ title, html, buttons }) {
    injectStyles();
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'pp5bk-overlay';
      overlay.innerHTML = `<div class="pp5bk-dialog" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><div data-body>${html}</div>`
        + `<div class="pp5bk-actions">${buttons.map((b) => `<button type="button" class="pp5bk-btn ${b.kind || 'plain'}" data-id="${b.id}">${b.label}</button>`).join('')}</div></div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-id]');
        if (!btn || btn.disabled) return;
        resolve({ id: btn.getAttribute('data-id'), overlay });
      });
    });
  }

  // "Back up first?" before an action that changes a lot of data at once.
  async function guardBeforeRisky(actionLabel) {
    let last = null;
    try { last = (await getBackupStatus()).last; } catch (_) { /* no status → ask */ }
    if (last && (Date.now() - new Date(last.at).getTime()) < FRESH_HOURS * 3600000) return true;
    const when = last ? `สำรองล่าสุดเมื่อ ${thaiTime(last.at)}` : 'ยังไม่เคยสำรองข้อมูลจากเว็บ';
    const { id, overlay } = await dialog({
      title: `สำรองข้อมูลก่อน${actionLabel}?`,
      html: `<p>${esc(actionLabel)}จะเปลี่ยนข้อมูลจำนวนมากในครั้งเดียว ควรสำรองไว้ก่อนเสมอ</p><p class="pp5bk-muted">${esc(when)}</p><div data-progress></div>`,
      buttons: [
        { id: 'cancel', label: 'ยกเลิก', kind: 'plain' },
        { id: 'skip', label: 'ทำต่อโดยไม่สำรอง', kind: 'ghost' },
        { id: 'backup', label: '<i class="bi bi-shield-check"></i> สำรองแล้วทำต่อ', kind: 'primary' }
      ]
    });
    if (id === 'cancel') { overlay.remove(); return false; }
    if (id === 'skip') { overlay.remove(); return true; }
    overlay.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const box = overlay.querySelector('[data-progress]');
    box.innerHTML = '<div class="pp5bk-progress"><div></div></div><div class="pp5bk-muted" data-label>กำลังเริ่ม...</div>';
    try {
      await createBackup(({ index, total, table }) => {
        box.querySelector('.pp5bk-progress>div').style.width = `${Math.round(((index + 1) / total) * 100)}%`;
        box.querySelector('[data-label]').textContent = `กำลังอ่าน ${table} (${index + 1}/${total})`;
      });
      overlay.remove();
      return true;
    } catch (error) {
      box.innerHTML = `<div class="pp5bk-note bad">สำรองไม่สำเร็จ: ${esc(error.message)}</div>`;
      overlay.querySelector('.pp5bk-actions').innerHTML = '<button type="button" class="pp5bk-btn plain" data-id="cancel">ยกเลิก</button>'
        + '<button type="button" class="pp5bk-btn ghost" data-id="skip">ทำต่อโดยไม่สำรอง</button>';
      const again = await new Promise((resolve) => overlay.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) resolve(b.getAttribute('data-id')); }));
      overlay.remove();
      return again === 'skip';
    }
  }

  // Wrap the bridge methods that change many rows at once.
  function installGuards() {
    const server = global.GasServer;
    if (!server || server.__pp5BackupGuarded) return;
    server.__pp5BackupGuarded = true;
    const wrap = (name, label, onCancel) => {
      const original = server[name];
      if (typeof original !== 'function') return;
      server[name] = async function guarded(...args) {
        const ok = await guardBeforeRisky(label);
        if (!ok) return onCancel();
        return original.apply(this, args);
      };
    };
    const cancelled = 'ยกเลิกแล้ว — ยังไม่มีข้อมูลใดถูกเปลี่ยน';
    wrap('importStudentFile', 'นำเข้า DMC', () => cancelled);
    wrap('applyTransitionV2', 'ปิดปีและเลื่อนชั้น', () => { throw new Error(cancelled); });
    wrap('switchAcademicYear', 'เปลี่ยนปีการศึกษา', () => { throw new Error(cancelled); });
    wrap('rollbackTransitionV2', 'ย้อนกลับการเลื่อนชั้น', () => { throw new Error(cancelled); });
    wrap('rollbackDmcStudentImport', 'ย้อนกลับการนำเข้า DMC', () => ({ success: false, cancelled: true, message: cancelled }));
  }

  // ───────────────────────── home page reminder + menu card ─────────────────────────
  async function enhanceHomeHub(hubPage) {
    if (!hubPage || txt(localStorage.getItem('role')).toLowerCase() !== 'admin') return;
    injectStyles();
    const grid = hubPage.querySelector('.hub-section[data-section="settings"] .hub-grid');
    if (grid && !grid.querySelector('[data-page="data_backup"]')) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'hub-card c-red';
      card.setAttribute('data-page', 'data_backup');
      card.setAttribute('data-label', 'สำรองข้อมูล');
      card.setAttribute('data-roles', 'admin');
      card.innerHTML = '<i class="bi bi-shield-check hub-card-icon"></i><span class="hub-card-label">สำรองข้อมูล</span>';
      card.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); global.navigateTo?.('data_backup'); });
      grid.insertBefore(card, grid.firstChild);
    }
    if (hubPage.querySelector('#pp5BackupBanner')) return;
    let last = null;
    try { last = (await getBackupStatus()).last; } catch (_) { return; }
    const days = daysSince(last?.at);
    if (days < STALE_DAYS) return;
    const banner = document.createElement('div');
    banner.id = 'pp5BackupBanner';
    banner.className = `pp5bk-banner${!last || days >= 30 ? ' bad' : ''}`;
    banner.innerHTML = `<div><i class="bi bi-shield-exclamation"></i> <b>${last ? `ไม่ได้สำรองข้อมูลมา ${days} วัน` : 'ยังไม่เคยสำรองข้อมูล'}</b>`
      + ' — Supabase แผนฟรีไม่มีการสำรองอัตโนมัติ ไฟล์ที่โรงเรียนสำรองเองคือสำเนาเดียวที่มี</div>'
      + '<button type="button" class="pp5bk-btn primary"><i class="bi bi-shield-check"></i> สำรองตอนนี้</button>';
    banner.querySelector('button').addEventListener('click', () => global.navigateTo?.('data_backup'));
    const menu = hubPage.querySelector('#pp5HubMainMenu');
    if (menu) menu.parentNode.insertBefore(banner, menu); else hubPage.insertBefore(banner, hubPage.firstChild);
  }

  // ───────────────────────── tab inside "ตั้งค่าระบบกลาง" ─────────────────────────
  // The settings page (new_settings_editor) has a Bootstrap pill-tab bar
  // (#settingsTab / #settingsTabContent) with 3 tabs baked into the gas-pages.js
  // template. Adding a 4th tab there directly would mean editing that
  // hardlinked, ~1.9M-character file — instead we append the tab the same way
  // enhanceSupabaseSettingsPage_ already extends this page's other fields.
  function enhanceSettingsPage() {
    if (txt(localStorage.getItem('role')).toLowerCase() !== 'admin') return;
    const nav = document.getElementById('settingsTab');
    const content = document.getElementById('settingsTabContent');
    if (!nav || !content || document.getElementById('backup-tab')) return;

    const li = document.createElement('li');
    li.className = 'nav-item';
    li.setAttribute('role', 'presentation');
    li.innerHTML = '<button class="nav-link" id="backup-tab" data-bs-toggle="pill" data-bs-target="#backupTabPane" type="button" role="tab" aria-controls="backupTabPane" aria-selected="false">'
      + '<i class="bi bi-shield-check"></i> สำรองข้อมูล</button>';
    nav.appendChild(li);

    const pane = document.createElement('div');
    pane.className = 'tab-pane fade';
    pane.id = 'backupTabPane';
    pane.setAttribute('role', 'tabpanel');
    pane.setAttribute('aria-labelledby', 'backup-tab');
    content.appendChild(pane);
    mountPage(pane);
  }

  // ───────────────────────── the page ─────────────────────────
  const PAGE_HTML = '<div id="pp5BackupPage" class="pp5bk"><div class="pp5bk-muted">กำลังโหลด...</div></div>'
    + '<script>window.PP5Backup && window.PP5Backup.mountPage(document.getElementById("pp5BackupPage"));<\/script>';

  // Small reusable modal: returns handles to swap its body/buttons while it is open.
  function openModal({ title = '', html = '', wide = false, closable = true } = {}) {
    injectStyles();
    const overlay = document.createElement('div');
    overlay.className = 'pp5bk-overlay';
    overlay.innerHTML = `<div class="pp5bk-dialog${wide ? ' wide' : ''}" role="dialog" aria-modal="true">`
      + '<button type="button" class="pp5bk-x" data-x aria-label="ปิด"><i class="bi bi-x-lg"></i></button>'
      + `<h3 data-title>${esc(title)}</h3><div data-body>${html}</div><div class="pp5bk-actions" data-actions></div></div>`;
    document.body.appendChild(overlay);
    const m = {
      overlay,
      closable,
      body: overlay.querySelector('[data-body]'),
      setTitle(t) { overlay.querySelector('[data-title]').textContent = t; },
      setBody(h) { m.body.innerHTML = h; },
      setActions(buttons) {
        const box = overlay.querySelector('[data-actions]');
        box.innerHTML = buttons.map((b, i) => `<button type="button" class="pp5bk-btn ${b.kind || 'plain'}" data-act="${i}">${b.label}</button>`).join('');
        box.querySelectorAll('[data-act]').forEach((el) => el.addEventListener('click', () => buttons[Number(el.getAttribute('data-act'))].onClick?.()));
      },
      setClosable(v) { m.closable = v; overlay.querySelector('[data-x]').style.display = v ? '' : 'none'; },
      close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
    };
    const onKey = (e) => { if (e.key === 'Escape' && m.closable) m.close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (m.closable && (e.target === overlay || e.target.closest('[data-x]'))) m.close(); });
    m.setClosable(closable);
    return m;
  }

  function mountPage(root) {
    if (!root) return;
    injectStyles();
    // Everything below is styled by the .pp5bk wrapper (it also carries the colour
    // variables). A settings tab-pane is not that wrapper, so add one inside it —
    // without it the primary button rendered white-on-transparent (invisible).
    let host = root;
    if (!root.classList || !root.classList.contains('pp5bk')) {
      root.innerHTML = '<div class="pp5bk"></div>';
      host = root.firstElementChild || root;
    }
    if (txt(localStorage.getItem('role')).toLowerCase() !== 'admin') {
      host.innerHTML = '<div class="pp5bk-card"><h2>สำรองข้อมูล</h2><p class="pp5bk-muted">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p></div>';
      return;
    }
    // Inside a settings tab the tab label already says "สำรองข้อมูล", so no second title there.
    const insideTab = !!(root.closest && root.closest('.tab-pane'));
    const header = insideTab
      ? ''
      : '<div class="pp5bk-hero"><div class="pp5bk-hero-icon"><i class="bi bi-shield-check"></i></div>'
        + '<div><h2>สำรองข้อมูล</h2><div class="pp5bk-muted">ดาวน์โหลดสำเนาข้อมูลทั้งหมด และเปรียบเทียบกับไฟล์เก่า</div></div>'
        + '<span class="pp5bk-badge"><i class="bi bi-eye"></i> อ่านอย่างเดียว</span></div>';
    host.innerHTML = `
      ${header}
      <section class="pp5bk-card">
        <div class="pp5bk-status">
          <span class="pp5bk-dot-wrap" data-dot><i class="bi bi-shield-check"></i></span>
          <div style="flex:1;min-width:220px"><div class="pp5bk-big" data-last>กำลังตรวจสอบ...</div><div class="pp5bk-muted" data-last-sub></div></div>
          <button type="button" class="pp5bk-btn primary lg" data-backup><i class="bi bi-cloud-arrow-down-fill"></i> สำรองข้อมูลตอนนี้</button>
        </div>
        <div class="pp5bk-links">
          <button type="button" class="pp5bk-link" data-help><i class="bi bi-question-circle"></i> วิธีใช้งาน / ไฟล์อยู่ที่ไหน</button>
          <button type="button" class="pp5bk-link" data-hist-open><i class="bi bi-clock-history"></i> ประวัติการสำรอง <span data-hist-count></span></button>
          <span class="pp5bk-muted pp5bk-links-note"><i class="bi bi-eye"></i> อ่านข้อมูลอย่างเดียว ไม่แก้คะแนนหรือข้อมูลนักเรียน</span>
        </div>
      </section>

      <section class="pp5bk-card">
        <div class="pp5bk-status">
          <span class="pp5bk-dot-wrap info"><i class="bi bi-file-earmark-zip"></i></span>
          <div style="flex:1;min-width:220px"><div class="pp5bk-big">สำรองรายปีการศึกษา (.zip)</div>
            <div class="pp5bk-muted">เก็บข้อมูลของปีที่เลือกไว้ในไฟล์เดียว — นักเรียน คะแนน ผลประเมิน เวลาเรียน น้ำหนัก-ส่วนสูง ความเห็นครู — เปิดดูภายหลังได้ด้วย "เลือกไฟล์สำรอง" ด้านล่าง · ไม่ลบข้อมูลออกจากระบบ</div></div>
          <select class="form-select" data-year-select aria-label="ปีการศึกษาที่จะสำรอง" style="width:auto;min-width:110px;flex:0 0 auto"><option value="">...</option></select>
          <button type="button" class="pp5bk-btn ghost lg" data-year-zip><i class="bi bi-file-earmark-zip"></i> สร้างไฟล์ ZIP</button>
        </div>
      </section>

      <section class="pp5bk-card">
        <div class="pp5bk-status">
          <span class="pp5bk-dot-wrap info"><i class="bi bi-person-bounding-box"></i></span>
          <div style="flex:1;min-width:220px"><div class="pp5bk-big">สำรองรูปนักเรียน (.zip)</div>
            <div class="pp5bk-muted">รูปนักเรียนไม่ได้อยู่ในไฟล์สำรองด้านบน — ปุ่มนี้ดาวน์โหลดรูปทุกคนเป็นไฟล์เดียว ชื่อไฟล์ = รหัสนักเรียน กู้คืนได้ด้วยปุ่ม "รูปนักเรียน" ในหน้ารายชื่อนักเรียน</div></div>
          <button type="button" class="pp5bk-btn ghost lg" data-photo-zip><i class="bi bi-images"></i> สำรองรูป</button>
        </div>
      </section>

      <section class="pp5bk-card">
        <div class="pp5bk-status">
          <span class="pp5bk-dot-wrap info"><i class="bi bi-folder2-open"></i></span>
          <div style="flex:1;min-width:220px"><div class="pp5bk-big">เปิดไฟล์สำรอง</div>
            <div class="pp5bk-muted">ดูคะแนนเก่าตามปี ชั้น ห้อง และเทียบกับข้อมูลตอนนี้ — ไฟล์เปิดในเครื่องนี้เท่านั้น ไม่ถูกส่งขึ้นระบบ</div></div>
          <label class="pp5bk-btn ghost lg" style="margin:0"><i class="bi bi-upload"></i> เลือกไฟล์สำรอง
            <input type="file" accept=".gz,.json,.zip" data-file hidden></label>
        </div>
        <div data-opened></div>
      </section>`;

    const $ = (sel) => host.querySelector(sel);
    const state = { backup: null, history: [] };

    async function refreshStatus() {
      try {
        const { last, history } = await getBackupStatus();
        state.history = history;
        const days = daysSince(last?.at);
        const level = !last ? 'bad' : days < STALE_DAYS ? 'good' : days < 30 ? 'warn' : 'bad';
        const icon = { good: 'bi-shield-check', warn: 'bi-shield-exclamation', bad: 'bi-shield-exclamation' }[level];
        $('[data-dot]').className = `pp5bk-dot-wrap ${level}`;
        $('[data-dot]').innerHTML = `<i class="bi ${icon}"></i>`;
        $('[data-last]').textContent = last ? `สำรองล่าสุด ${thaiTime(last.at)} (${days === 0 ? 'วันนี้' : `${days} วันที่แล้ว`})` : 'ยังไม่เคยสำรองข้อมูลจากเว็บ';
        $('[data-last-sub]').textContent = last
          ? `โดย ${last.by || '-'} · ${Number(last.rows).toLocaleString('th-TH')} แถว${days >= STALE_DAYS ? ' · ควรสำรองใหม่' : ''}`
          : 'แนะนำให้สำรองตอนนี้ ใช้เวลาประมาณ 1–2 นาที';
        $('[data-hist-count]').textContent = history.length ? `(${history.length})` : '';
      } catch (error) {
        $('[data-last]').textContent = 'อ่านสถานะการสำรองไม่ได้';
        $('[data-last-sub]').textContent = error.message;
      }
    }

    const whereIsFile = '<div class="pp5bk-where"><i class="bi bi-folder-fill"></i><div><b>ไฟล์อยู่ในโฟลเดอร์ "ดาวน์โหลด" (Downloads) ของเครื่องนี้</b>'
      + '<div class="pp5bk-muted">กด <kbd>Ctrl</kbd> + <kbd>J</kbd> เพื่อเปิดรายการดาวน์โหลดของเบราว์เซอร์ แล้วกด "แสดงในโฟลเดอร์"</div></div></div>';

    $('[data-help]').addEventListener('click', () => {
      const m = openModal({ title: 'วิธีสำรองข้อมูล', wide: true });
      m.setBody('<ol class="pp5bk-steplist">'
        + '<li><b>กด "สำรองข้อมูลตอนนี้"</b><span>รอประมาณ 1–2 นาที ระหว่างนั้นอย่าปิดหน้านี้</span></li>'
        + '<li><b>ได้ไฟล์ 1 ไฟล์</b><span>ชื่อขึ้นต้นด้วย pp5_backup_ ตามด้วยวันที่ เช่น pp5_backup_2026-09-28_0625.json.gz</span></li>'
        + '<li><b>ย้ายไปเก็บในไดรฟ์โรงเรียน</b><span>เก็บในโฟลเดอร์ที่จำกัดสิทธิ์ เพราะไฟล์มีเลขประจำตัวประชาชนนักเรียน</span></li>'
        + '<li><b>ทำเป็นประจำ</b><span>ทุกสัปดาห์ และทุกครั้งก่อนนำเข้า DMC หรือปิดปีการศึกษา (ระบบจะเตือนเอง)</span></li>'
        + `</ol>${whereIsFile}`);
      m.setActions([{ label: 'เข้าใจแล้ว', kind: 'primary', onClick: () => m.close() }]);
    });

    $('[data-hist-open]').addEventListener('click', () => {
      const h = state.history;
      const m = openModal({ title: 'ประวัติการสำรองข้อมูล', wide: true });
      m.setBody(h.length
        ? `<div class="pp5bk-table-wrap" style="max-height:360px"><table class="pp5bk-table"><thead><tr><th>วันที่</th><th>โดย</th><th>จำนวน</th><th>ไฟล์</th></tr></thead><tbody>${h.map((r) => `<tr><td>${esc(thaiTime(r.at))}</td><td>${esc(r.by)}</td><td>${Number(r.rows).toLocaleString('th-TH')} แถว</td><td>${esc(r.file)}</td></tr>`).join('')}</tbody></table></div>`
          + '<div class="pp5bk-muted" style="margin-top:8px">รายการนี้คือบันทึกว่าเคยสำรองเมื่อไร ตัวไฟล์อยู่ในเครื่องที่กดสำรอง (โฟลเดอร์ดาวน์โหลด) หรือในไดรฟ์ที่ย้ายไปเก็บ</div>'
        : '<div class="pp5bk-muted">ยังไม่มีประวัติการสำรอง</div>');
      m.setActions([{ label: 'ปิด', kind: 'plain', onClick: () => m.close() }]);
    });

    $('[data-backup]').addEventListener('click', async () => {
      const btn = $('[data-backup]');
      btn.disabled = true;
      const m = openModal({ title: 'กำลังสำรองข้อมูล', closable: false, wide: true });
      m.setBody('<div class="pp5bk-muted">กำลังอ่านข้อมูลทุกตาราง อย่าปิดหรือเปลี่ยนหน้านี้จนกว่าจะเสร็จ</div>'
        + '<div class="pp5bk-progress"><div></div></div><div class="pp5bk-muted" data-label>กำลังเริ่ม...</div>');
      try {
        const result = await createBackup(({ index, total, table }) => {
          m.body.querySelector('.pp5bk-progress>div').style.width = `${Math.round(((index + 1) / total) * 100)}%`;
          m.body.querySelector('[data-label]').textContent = `กำลังอ่าน ${table} (${index + 1}/${total})`;
        });
        // A finished backup is always usable, even when a table was skipped
        // (renamed/removed), so the result stays green; details are one click away.
        const warn = result.payload.warnings;
        m.setTitle('สำรองข้อมูลเสร็จแล้ว');
        m.setBody('<div class="pp5bk-done"><i class="bi bi-check-circle-fill"></i></div>'
          + `<div class="pp5bk-filechip"><i class="bi bi-file-earmark-zip-fill"></i><div><b>${esc(result.file)}</b>`
          + `<div class="pp5bk-muted">${result.tables} ตาราง · ${result.rows.toLocaleString('th-TH')} แถว · ${size(result.bytes)}</div></div></div>`
          + whereIsFile
          + '<div class="pp5bk-muted" style="margin-top:12px"><b>ขั้นต่อไป:</b> ย้ายไฟล์นี้ไปเก็บในไดรฟ์โรงเรียน (โฟลเดอร์ที่จำกัดสิทธิ์)</div>'
          + (result.recordError ? `<div class="pp5bk-note warn">${esc(result.recordError)}</div>` : '')
          + (warn.length ? `<details class="pp5bk-details"><summary><i class="bi bi-chevron-right"></i> ข้อควรรู้ (${warn.length})</summary><div class="pp5bk-details-body">${warn.map(esc).join('<br>')}</div></details>` : ''));
        m.setClosable(true);
        m.setActions([
          { label: '<i class="bi bi-download"></i> ดาวน์โหลดอีกครั้ง', kind: 'ghost', onClick: () => downloadBlob(result.blob, result.file) },
          { label: 'เสร็จแล้ว', kind: 'primary', onClick: () => m.close() }
        ]);
        refreshStatus();
      } catch (error) {
        m.setTitle('สำรองข้อมูลไม่สำเร็จ');
        m.setBody(`<div class="pp5bk-note bad">${esc(error.message)}</div><div class="pp5bk-muted" style="margin-top:10px">ยังไม่มีข้อมูลใดถูกเปลี่ยน ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ</div>`);
        m.setClosable(true);
        m.setActions([{ label: 'ปิด', kind: 'plain', onClick: () => m.close() }]);
      } finally {
        btn.disabled = false;
      }
    });

    yearOptions().then(({ current, years }) => {
      const select = $('[data-year-select]');
      select.innerHTML = years.map((y) => `<option value="${esc(y)}">${esc(y)}</option>`).join('') || '<option value="">-</option>';
      if (years.includes(current)) select.value = current;
    }).catch(() => {});

    $('[data-year-zip]').addEventListener('click', async () => {
      const btn = $('[data-year-zip]');
      const year = $('[data-year-select]').value;
      if (!year) return;
      btn.disabled = true;
      const m = openModal({ title: `กำลังสร้างไฟล์สำรองปีการศึกษา ${year}`, closable: false, wide: true });
      m.setBody('<div class="pp5bk-muted">กำลังอ่านข้อมูล อย่าปิดหรือเปลี่ยนหน้านี้จนกว่าจะเสร็จ</div>'
        + '<div class="pp5bk-progress"><div></div></div><div class="pp5bk-muted" data-label>กำลังเริ่ม...</div>');
      try {
        const result = await createYearArchive(year, ({ index, total, table }) => {
          m.body.querySelector('.pp5bk-progress>div').style.width = `${Math.round(((index + 1) / total) * 100)}%`;
          m.body.querySelector('[data-label]').textContent = `กำลังอ่าน ${table} (${index + 1}/${total})`;
        });
        const count = (name) => (result.tables.find((t) => t.name === name)?.rows || 0).toLocaleString('th-TH');
        m.setTitle(`สร้างไฟล์สำรองปี ${result.year} เสร็จแล้ว`);
        m.setBody('<div class="pp5bk-done"><i class="bi bi-check-circle-fill"></i></div>'
          + `<div class="pp5bk-filechip"><i class="bi bi-file-earmark-zip-fill"></i><div><b>${esc(result.file)}</b>`
          + `<div class="pp5bk-muted">นักเรียน ${result.students.toLocaleString('th-TH')} คน · คะแนน ${count('scores')} แถว · ผลประเมิน ${count('assessments')} แถว · เวลาเรียน ${count('attendance_daily')} แถว · รวม ${result.rows.toLocaleString('th-TH')} แถว · ${size(result.bytes)}</div></div></div>`
          + whereIsFile
          + '<div class="pp5bk-muted" style="margin-top:12px"><b>ขั้นต่อไป:</b> ย้ายไฟล์นี้ไปเก็บในไดรฟ์โรงเรียน (โฟลเดอร์ที่จำกัดสิทธิ์) — ข้อมูลในระบบยังอยู่ครบ ไม่ได้ถูกลบ</div>'
          + (result.warnings.length ? `<details class="pp5bk-details"><summary><i class="bi bi-chevron-right"></i> ข้อควรรู้ (${result.warnings.length})</summary><div class="pp5bk-details-body">${result.warnings.map(esc).join('<br>')}</div></details>` : ''));
        m.setClosable(true);
        m.setActions([
          { label: '<i class="bi bi-download"></i> ดาวน์โหลดอีกครั้ง', kind: 'ghost', onClick: () => downloadBlob(result.blob, result.file) },
          { label: 'เสร็จแล้ว', kind: 'primary', onClick: () => m.close() }
        ]);
      } catch (error) {
        m.setTitle('สร้างไฟล์สำรองรายปีไม่สำเร็จ');
        m.setBody(`<div class="pp5bk-note bad">${esc(error.message)}</div><div class="pp5bk-muted" style="margin-top:10px">ยังไม่มีข้อมูลใดถูกเปลี่ยน</div>`);
        m.setClosable(true);
        m.setActions([{ label: 'ปิด', kind: 'plain', onClick: () => m.close() }]);
      } finally {
        btn.disabled = false;
      }
    });

    $('[data-photo-zip]').addEventListener('click', async () => {
      const btn = $('[data-photo-zip]');
      btn.disabled = true;
      const m = openModal({ title: 'กำลังสำรองรูปนักเรียน', closable: false, wide: true });
      m.setBody('<div class="pp5bk-muted">กำลังดาวน์โหลดรูป อย่าปิดหรือเปลี่ยนหน้านี้จนกว่าจะเสร็จ</div>'
        + '<div class="pp5bk-progress"><div></div></div><div class="pp5bk-muted" data-label>กำลังอ่านรายชื่อนักเรียนที่มีรูป...</div>');
      try {
        const result = await createPhotoArchive(({ index, total }) => {
          m.body.querySelector('.pp5bk-progress>div').style.width = `${Math.round(((index + 1) / total) * 100)}%`;
          m.body.querySelector('[data-label]').textContent = `ดาวน์โหลดรูปแล้ว ${index + 1}/${total}`;
        });
        m.setTitle('สำรองรูปนักเรียนเสร็จแล้ว');
        m.setBody('<div class="pp5bk-done"><i class="bi bi-check-circle-fill"></i></div>'
          + `<div class="pp5bk-filechip"><i class="bi bi-file-earmark-zip-fill"></i><div><b>${esc(result.file)}</b>`
          + `<div class="pp5bk-muted">${result.photos.toLocaleString('th-TH')} รูป${result.photos < result.expected ? ` จาก ${result.expected.toLocaleString('th-TH')}` : ''} · ${size(result.bytes)}</div></div></div>`
          + whereIsFile
          + '<div class="pp5bk-muted" style="margin-top:12px"><b>ขั้นต่อไป:</b> ย้ายไฟล์นี้ไปเก็บในไดรฟ์โรงเรียน (โฟลเดอร์ที่จำกัดสิทธิ์) · กู้คืน: แตกไฟล์ แล้วเลือกรูปในโฟลเดอร์ photos ด้วยปุ่ม "รูปนักเรียน"</div>'
          + (result.warnings.length ? `<details class="pp5bk-details" open><summary><i class="bi bi-chevron-right"></i> รูปที่ดาวน์โหลดไม่ได้ (${result.warnings.length})</summary><div class="pp5bk-details-body">${result.warnings.map(esc).join('<br>')}</div></details>` : ''));
        m.setClosable(true);
        m.setActions([
          { label: '<i class="bi bi-download"></i> ดาวน์โหลดอีกครั้ง', kind: 'ghost', onClick: () => downloadBlob(result.blob, result.file) },
          { label: 'เสร็จแล้ว', kind: 'primary', onClick: () => m.close() }
        ]);
      } catch (error) {
        m.setTitle('สำรองรูปนักเรียนไม่สำเร็จ');
        m.setBody(`<div class="pp5bk-note bad">${esc(error.message)}</div><div class="pp5bk-muted" style="margin-top:10px">ยังไม่มีข้อมูลใดถูกเปลี่ยน</div>`);
        m.setClosable(true);
        m.setActions([{ label: 'ปิด', kind: 'plain', onClick: () => m.close() }]);
      } finally {
        btn.disabled = false;
      }
    });

    $('[data-file]').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      const box = $('[data-opened]');
      if (!file) return;
      box.innerHTML = '<div class="pp5bk-muted" style="margin-top:14px">กำลังเปิดไฟล์...</div>';
      try {
        state.backup = await openBackupFile(file);
        renderOpened(box);
      } catch (error) {
        state.backup = null;
        box.innerHTML = `<div class="pp5bk-note bad">${esc(error.message)}</div>`;
      } finally {
        e.target.value = '';
      }
    });

    function renderOpened(box) {
      const b = state.backup;
      const scores = tableRows(b, 'scores');
      const years = [...new Set(scores.map((s) => txt(s.academic_year)).filter(Boolean))].sort();
      const rosters = tableRows(b, 'student_year_rosters');
      const students = tableRows(b, 'students');
      const grades = [...new Set([...rosters, ...students].map((r) => txt(r.grade)).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'th'));
      const rooms = [...new Set([...rosters, ...students].map((r) => txt(pick(r, 'room', 'class_no'))).filter(Boolean))].sort((x, y) => Number(x) - Number(y) || x.localeCompare(y));
      const tableNames = Object.keys(b.tables || {}).sort();
      const integrity = b.integrity === 'mismatch' ? '<div class="pp5bk-note bad"><div class="pp5bk-note-title"><i class="bi bi-exclamation-triangle-fill"></i> ไฟล์นี้ถูกแก้ไขหลังสร้าง</div>ลายนิ้วมือไม่ตรง — ใช้ด้วยความระมัดระวัง</div>' : '';
      box.innerHTML = `${integrity}
        <div class="pp5bk-note good"><div class="pp5bk-note-title"><i class="bi bi-file-earmark-check-fill"></i> เปิดไฟล์สำเร็จ</div>ไฟล์ <b>${esc(b.fileName)}</b>${b.source === 'year' ? ` · ไฟล์สำรองรายปี ปีการศึกษา <b>${esc(b.academicYear)}</b>` : ''} · สำรองเมื่อ <b>${esc(thaiTime(b.createdAt))}</b> · ${tableNames.length} ตาราง</div>
        <div class="pp5bk-tabs" style="margin-top:16px"><button type="button" class="pp5bk-tab active" data-tab="scores">คะแนน</button><button type="button" class="pp5bk-tab" data-tab="tables">ตารางอื่น</button></div>
        <div data-pane="scores">
          <div class="pp5bk-row">
            <label>ปีการศึกษา<select data-f="year">${years.map((y) => `<option${y === years.at(-1) ? ' selected' : ''}>${esc(y)}</option>`).join('')}</select></label>
            <label>ชั้น<select data-f="grade"><option value="">ทุกชั้น</option>${grades.map((g) => `<option>${esc(g)}</option>`).join('')}</select></label>
            <label>ห้อง<select data-f="room"><option value="">ทุกห้อง</option>${rooms.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label>
            <label>ค้นชื่อ / เลขประจำตัว<input type="text" data-f="search" placeholder="เช่น 857"></label>
            <label style="flex-direction:row;display:flex;align-items:center;gap:6px"><input type="checkbox" data-f="compare" checked> เทียบกับข้อมูลตอนนี้</label>
            <button type="button" class="pp5bk-btn primary" data-show><i class="bi bi-search"></i> แสดง</button>
          </div>
          <div data-result></div>
        </div>
        <div data-pane="tables" style="display:none">
          <div class="pp5bk-row"><label>ตาราง<select data-t>${tableNames.map((t) => `<option value="${esc(t)}">${esc(t)} (${b.tables[t].count} แถว)</option>`).join('')}</select></label>
            <button type="button" class="pp5bk-btn ghost" data-t-excel><i class="bi bi-file-earmark-excel"></i> ดาวน์โหลดตารางนี้เป็น Excel</button></div>
          <div data-t-preview style="margin-top:12px"></div>
        </div>`;

      box.querySelectorAll('[data-tab]').forEach((tab) => tab.addEventListener('click', () => {
        box.querySelectorAll('[data-tab]').forEach((t) => t.classList.toggle('active', t === tab));
        box.querySelectorAll('[data-pane]').forEach((p) => { p.style.display = p.getAttribute('data-pane') === tab.getAttribute('data-tab') ? '' : 'none'; });
      }));

      const f = (k) => box.querySelector(`[data-f="${k}"]`);
      let lastResult = null;
      box.querySelector('[data-show]').addEventListener('click', async () => {
        const out = box.querySelector('[data-result]');
        const filter = { year: f('year').value, grade: f('grade').value, room: f('room').value, search: f('search').value };
        out.innerHTML = '<div class="pp5bk-muted" style="margin-top:10px">กำลังประมวลผล...</div>';
        try {
          let live = null;
          if (f('compare').checked) live = await fetchLiveScores(filter.year, scopeStudentIds(b, filter));
          lastResult = { ...buildScoreRows(b, filter, live), filter };
          renderScores(out, lastResult);
        } catch (error) {
          out.innerHTML = `<div class="pp5bk-note bad">${esc(error.message)}</div>`;
        }
      });

      function renderScores(out, result) {
        const limit = 400;
        const c = result.counts;
        const chips = result.compare
          ? `<div class="pp5bk-chips"><span class="pp5bk-chip same">เหมือนเดิม ${c.same}</span><span class="pp5bk-chip changed">แก้ไขแล้ว ${c.changed}</span><span class="pp5bk-chip gone">ถูกลบ ${c.gone}</span><span class="pp5bk-chip new">เพิ่มหลังวันสำรอง ${c.new}</span></div>`
          : `<div class="pp5bk-chips"><span class="pp5bk-chip same">${result.rows.length} แถว</span></div>`;
        const head = ['เลขประจำตัว', 'ชื่อ-สกุล', 'ชั้น/ห้อง', 'วิชา', 'ภาค', ...SCORE_FIELDS.map(([, l]) => (result.compare ? `${l}<br><small>สำรอง → ตอนนี้</small>` : l)), ...(result.compare ? ['ผลการเทียบ'] : [])];
        const cell = (r, fld) => {
          const bv = txt(r.b?.[fld]); const lv = txt(r.l?.[fld]);
          if (!result.compare) return esc(bv);
          if (sameValue(bv, lv)) return esc(bv);
          return `${esc(bv || '–')} → <b>${esc(lv || '–')}</b>`;
        };
        const shown = result.rows.slice(0, limit);
        out.innerHTML = chips
          + `<div class="pp5bk-row" style="margin-bottom:10px"><button type="button" class="pp5bk-btn ghost" data-excel><i class="bi bi-file-earmark-excel"></i> ดาวน์โหลด Excel (${result.rows.length} แถว)</button>`
          + (result.compare ? '<label style="flex-direction:row;display:flex;align-items:center;gap:6px"><input type="checkbox" data-only-diff> แสดงเฉพาะที่ต่าง</label>' : '') + '</div>'
          + `<div class="pp5bk-table-wrap"><table class="pp5bk-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>`
          + shown.map((r) => `<tr class="${r.kind}" data-kind="${r.kind}"><td>${esc(r.id)}</td><td>${esc(r.name)}</td><td>${esc(r.grade)}/${esc(r.room)}</td><td>${esc(r.code)} ${esc(r.subject)}</td><td>${esc(r.semester)}</td>`
            + SCORE_FIELDS.map(([fld]) => `<td>${cell(r, fld)}</td>`).join('') + (result.compare ? `<td>${esc(r.status)}</td>` : '') + '</tr>').join('')
          + '</tbody></table></div>'
          + (result.rows.length > limit ? `<div class="pp5bk-muted" style="margin-top:6px">แสดง ${limit} แถวแรก — ดาวน์โหลด Excel เพื่อดูทั้งหมด</div>` : '')
          + '<div class="pp5bk-muted" style="margin-top:8px">พบค่าที่ต้องแก้? แก้ในหน้า "กรอกคะแนน" ตามปกติ (ปีที่ปิดแล้วต้องปลดล็อกปีในหน้าตั้งค่าก่อน)</div>';
        out.querySelector('[data-only-diff]')?.addEventListener('change', (ev) => {
          out.querySelectorAll('tbody tr').forEach((tr) => { tr.style.display = ev.target.checked && tr.getAttribute('data-kind') === 'same' ? 'none' : ''; });
        });
        out.querySelector('[data-excel]').addEventListener('click', () => {
          const fl = result.filter;
          const label = [fl.year, fl.grade && asciiName(fl.grade), fl.room && `room${asciiName(fl.room)}`, fl.search && asciiName(fl.search), result.compare && 'compare'].filter(Boolean).join('_');
          const info = [['ไฟล์สำรอง', b.fileName], ['สำรองเมื่อ', thaiTime(b.createdAt)], ['ปีการศึกษา', fl.year], ['ชั้น', fl.grade || 'ทุกชั้น'], ['ห้อง', fl.room || 'ทุกห้อง'], ['ค้นหา', fl.search || '-']];
          if (result.compare) info.push(['เทียบกับระบบเมื่อ', thaiTime(new Date().toISOString())], ['เหมือนเดิม', c.same], ['แก้ไขแล้ว', c.changed], ['ถูกลบ', c.gone], ['เพิ่มหลังวันสำรอง', c.new]);
          info.push(['หมายเหตุ', 'ไฟล์นี้อ่านอย่างเดียว การแก้คะแนนให้ทำในเว็บ ปพ.5 ตามปกติ']);
          downloadExcel([
            { name: 'คะแนน', aoa: scoreSheetAoa(result), widths: [12, 26, 6, 5, 6, 10, 22, 5, 10, 10, 8, 7, 10, 10, 10, 8, 7, 10, 30, 20] },
            { name: 'ข้อมูลไฟล์', aoa: info, widths: [24, 60] }
          ], `pp5_scores_${label}_${stamp()}.xlsx`);
        });
      }

      const preview = () => {
        const name = box.querySelector('[data-t]').value;
        const rows = b.tables[name]?.rows || [];
        const cols = [...new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r)))].slice(0, 12);
        box.querySelector('[data-t-preview]').innerHTML = rows.length
          ? `<div class="pp5bk-table-wrap"><table class="pp5bk-table"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 50).map((r) => `<tr>${cols.map((c) => `<td>${esc(typeof r[c] === 'object' && r[c] !== null ? JSON.stringify(r[c]).slice(0, 60) : r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="pp5bk-muted" style="margin-top:6px">ตัวอย่าง 50 แถวแรก จาก ${rows.length} แถว</div>`
          : '<div class="pp5bk-muted">ตารางนี้ว่าง</div>';
      };
      box.querySelector('[data-t]')?.addEventListener('change', preview);
      if (tableNames.length) preview();
      box.querySelector('[data-t-excel]')?.addEventListener('click', () => {
        const name = box.querySelector('[data-t]').value;
        const rows = b.tables[name]?.rows || [];
        const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        const aoa = [cols, ...rows.map((r) => cols.map((c) => (typeof r[c] === 'object' && r[c] !== null ? JSON.stringify(r[c]) : r[c] ?? '')))];
        downloadExcel([{ name: name.replace(/^public\./, ''), aoa }], `pp5_${name.replace(/^public\./, '')}_from_backup_${stamp()}.xlsx`);
      });
    }

    refreshStatus();
  }

  // ───────────────────────── register ─────────────────────────
  global.GAS_PAGES = global.GAS_PAGES || {};
  global.GAS_PAGES.data_backup = PAGE_HTML;

  global.PP5Backup = {
    createBackup, createYearArchive, createPhotoArchive, openBackupFile, getBackupStatus, guardBeforeRisky, enhanceHomeHub, enhanceSettingsPage, mountPage,
    // exposed for tests
    _internal: { buildScoreRows, scopeStudentIds, filterContext, scoreSheetAoa, readCliZip, readWholeTable, sameValue, scoreKey, TABLES, FORMAT,
      selectYearRows, buildYearZip, academicYearOfDate, YEAR_FORMAT, photoEntries, buildPhotoZip, PHOTO_FORMAT }
  };

  if (global.GasServer) installGuards();
  else global.addEventListener?.('DOMContentLoaded', installGuards);
})(window);
