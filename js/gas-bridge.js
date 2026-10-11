// Compatibility bridge: keeps the original google.script.run contract while
// moving data operations to Supabase. Unknown operations fail explicitly.
(function initGasCompatibilityBridge(global) {
  'use strict';

  const data = global.PP5Data;
  if (!data) throw new Error('PP5Data must be loaded before gas-bridge.js');
  const client = data.client;
  const text = data.helpers.asText;
  const number = data.helpers.asNumber;

  function migrationRequired(feature) {
    const error = new Error(`ส่วน ${feature} ยังไม่มี schema/service ที่ปลอดภัยบน Supabase`);
    error.code = 'MIGRATION_REQUIRED';
    throw error;
  }

  function escapeHtml(value) {
    return text(value)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function normalizeDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    return date.toISOString().slice(0, 10);
  }

  function monthRange(year, zeroBasedMonth) {
    const month = Number(zeroBasedMonth) + 1;
    const first = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(Number(year), month, 0).getDate();
    return { first, last: `${year}-${String(month).padStart(2, '0')}-${lastDay}` };
  }

  const THAI_MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const THAI_MONTH_NAMES_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  function normalizeAcademicYearBE(value) {
    const parsed = Number(text(value).replace(/[^0-9]/g, ''));
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('ปีการศึกษาไม่ถูกต้อง');
    return parsed < 2400 ? parsed + 543 : parsed;
  }

  function academicYearMonths(value) {
    const academicYear = normalizeAcademicYearBE(value);
    const baseYearCE = academicYear - 543;
    return [5, 6, 7, 8, 9, 10, 11, 12].map((month) => ({ month, yearCE: baseYearCE, yearBE: academicYear }))
      .concat([1, 2, 3].map((month) => ({ month, yearCE: baseYearCE + 1, yearBE: academicYear + 1 })))
      .map((item) => ({
        ...item,
        key: `${item.yearCE}-${String(item.month).padStart(2, '0')}`,
        monthName: THAI_MONTH_NAMES[item.month - 1],
        shortName: THAI_MONTH_NAMES_SHORT[item.month - 1],
        semester: item.month >= 11 || item.month <= 3 ? 2 : 1
      }));
  }

  function academicYearDateRange(value) {
    const academicYear = normalizeAcademicYearBE(value);
    const baseYearCE = academicYear - 543;
    return { academicYear, first: `${baseYearCE}-05-01`, last: `${baseYearCE + 1}-03-31` };
  }

  function academicYearFromCalendarDate(yearValue, monthIndexValue) {
    let yearCE = Number(yearValue);
    const monthIndex = Number(monthIndexValue);
    if (yearCE >= 2400) yearCE -= 543;
    if (!Number.isInteger(yearCE) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return '';
    return text(yearCE + (monthIndex >= 4 ? 543 : 542));
  }

  function academicYearFromDate(value) {
    const dateValue = normalizeDate(value);
    const match = dateValue.match(/^(\d{4})-(\d{2})-/);
    if (!match) return '';
    return academicYearFromCalendarDate(Number(match[1]), Number(match[2]) - 1);
  }

  function normalizeAttendanceStatus(value) {
    const status = text(value).trim().toLowerCase();
    if (['present', 'มา', 'มาเรียน', '/', 'ม', '1'].includes(status)) return 'present';
    if (['leave', 'ลา', 'ล', 'l'].includes(status)) return 'leave';
    if (['absent', 'ขาด', 'ข', '0'].includes(status)) return 'absent';
    return '';
  }

  function studentDisplayName(student) {
    return text(student.fullName || `${student.title || student.prefix || ''}${student.firstname || student.firstName || student.first_name || ''} ${student.lastname || student.lastName || student.last_name || ''}`).trim();
  }

  function legacyParentFullName(name, lastName) {
    const first = text(name).trim();
    const last = text(lastName).trim();
    if (!first || !last || first === last || first.endsWith(` ${last}`)) return first || last;
    return `${first} ${last}`;
  }

  function legacyParentStudentRecord(student) {
    const value = (camelCase, snakeCase) => text(student?.[camelCase] ?? student?.[snakeCase]).trim();
    return {
      ...student,
      studentId: text(student?.studentId ?? student?.id).trim(),
      studentNo: student?.studentNo ?? student?.studentNumber ?? student?.student_number ?? '',
      fatherName: legacyParentFullName(student?.fatherName ?? student?.father_name, student?.fatherLastName ?? student?.father_last_name),
      fatherOccupation: value('fatherOccupation', 'father_occupation'),
      fatherPhone: value('fatherPhone', 'father_phone'),
      fatherStatus: value('fatherStatus', 'father_status') || 'มีชีวิต',
      motherName: legacyParentFullName(student?.motherName ?? student?.mother_name, student?.motherLastName ?? student?.mother_last_name),
      motherOccupation: value('motherOccupation', 'mother_occupation'),
      motherPhone: value('motherPhone', 'mother_phone'),
      motherStatus: value('motherStatus', 'mother_status') || 'มีชีวิต',
      guardianName: value('guardianName', 'guardian_name'),
      guardianRelation: value('guardianRelation', 'guardian_relation'),
      guardianOccupation: value('guardianOccupation', 'guardian_occupation'),
      guardianPhone: value('guardianPhone', 'guardian_phone'),
      postalCode: value('postalCode', 'postal_code')
    };
  }

  async function searchLegacyParentStudents(grade, classNo, name) {
    const targetGrade = text(grade).trim();
    const targetClassNo = text(classNo).trim();
    const needle = text(name).trim().toLowerCase();
    const students = await data.students.list({ grade: targetGrade, room: targetClassNo, active: false });
    return students
      .filter((student) => `${student.id} ${student.fullName}`.toLowerCase().includes(needle))
      .map(legacyParentStudentRecord);
  }

  function normalizedAttendanceRows(rows) {
    const byStudentDate = new Map();
    (rows || []).forEach((row) => {
      const studentId = text(row.student_id || row.studentId).trim();
      const attendanceDate = normalizeDate(row.attendance_date || row.date);
      const status = normalizeAttendanceStatus(row.status);
      if (!studentId || !attendanceDate || !status) return;
      const key = `${studentId}|${attendanceDate}`;
      const previous = byStudentDate.get(key);
      const previousUpdated = text(previous?.updated_at || previous?.created_at);
      const currentUpdated = text(row.updated_at || row.created_at);
      if (!previous || currentUpdated >= previousUpdated) {
        byStudentDate.set(key, { ...row, student_id: studentId, attendance_date: attendanceDate, status });
      }
    });
    return [...byStudentDate.values()];
  }

  function summarizeAttendanceRows(students, rows, includeEmpty = false) {
    const summaries = new Map((students || []).map((student) => [text(student.id), {
      studentId: text(student.id),
      name: studentDisplayName(student),
      present: 0,
      leave: 0,
      absent: 0,
      total: 0
    }]));
    normalizedAttendanceRows(rows).forEach((row) => {
      const summary = summaries.get(text(row.student_id));
      if (!summary || !['present', 'leave', 'absent'].includes(row.status)) return;
      summary[row.status] += 1;
      summary.total += 1;
    });
    return [...summaries.values()]
      .filter((item) => includeEmpty || item.total > 0)
      .sort((a, b) => a.studentId.localeCompare(b.studentId, undefined, { numeric: true }));
  }

  function countRecordedSchoolDays(rows) {
    return new Set(normalizedAttendanceRows(rows).map((row) => row.attendance_date)).size;
  }

  // Holidays are stored with a holiday_type: 'ราชการ' (a real government/school closure —
  // no class) or 'school' (a school-decided special day such as "สอนชดเชย" or a ceremony,
  // where students still attend). Only the former means attendance that day is unexpected.
  async function noSchoolHolidayDateSet_(first = '', last = '') {
    const rows = await data.holidays.list();
    return new Set(rows
      .filter((row) => text(row.holiday_type).trim() !== 'school')
      .map((row) => normalizeDate(row.holiday_date || row.date))
      .filter((dateValue) => dateValue && (!first || dateValue >= first) && (!last || dateValue <= last)));
  }

  // The attendance holiday modal labels the 'school' type "สอนชดเชย" (students attend);
  // every other type is a closure and is stored as chosen.
  function holidayTypeFromUi_(value, fallback = 'ราชการ') {
    const type = text(value).trim();
    if (!type) return fallback;
    return type === 'สอนชดเชย' || type === 'school' ? 'school' : type;
  }

  function holidayTypeToUi_(value) {
    const type = text(value).trim();
    return type === 'school' ? 'สอนชดเชย' : (type || 'ราชการ');
  }

  async function holidayDateSet(first = '', last = '') {
    const rows = await data.holidays.list();
    return new Set(rows
      .map((row) => normalizeDate(row.holiday_date || row.date))
      .filter((dateValue) => dateValue && (!first || dateValue >= first) && (!last || dateValue <= last)));
  }

  // Calendar events built from the holidays table carry id "hol_<row id>" (or "hol_<date>"
  // for a row without an id) — see getAcademicCalendar.
  async function findHolidayTableRow_(eventId) {
    const key = text(eventId).replace(/^hol_/, '');
    if (!key) return null;
    const column = /^\d{4}-\d{2}-\d{2}$/.test(key) ? 'holiday_date' : 'id';
    const { data: row, error } = await client
      .from('holidays').select('id,holiday_date').eq(column, key).maybeSingle();
    if (error) throw new Error(error.message);
    return row ? { ...row, holiday_date: normalizeDate(row.holiday_date) } : null;
  }

  async function deleteHolidayDate_(dateValue) {
    const { data: deleted, error } = await client
      .from('holidays').delete().eq('holiday_date', dateValue).select('id');
    if (error) throw new Error(error.message);
    // RLS reports a forbidden delete as "0 rows, no error"; make sure the row is really gone.
    if (!(deleted || []).length) {
      const { data: still, error: checkError } = await client
        .from('holidays').select('id').eq('holiday_date', dateValue).limit(1);
      if (checkError) throw new Error(checkError.message);
      if ((still || []).length) throw new Error(`ลบวันหยุด ${dateValue} ออกจากฐานข้อมูลไม่สำเร็จ (ไม่มีสิทธิ์ลบ)`);
    }
  }

  function groupBy(rows, keyFn) {
    return rows.reduce((map, row) => {
      const key = keyFn(row);
      if (!map[key]) map[key] = [];
      map[key].push(row);
      return map;
    }, {});
  }

  // Module-level copy of the subject type rule used by the ปพ.6 renderer
  // (that one is local to generatePp6Pdf and cannot be reached from here).
  // 2 = กิจกรรมพัฒนาผู้เรียน, 1 = เพิ่มเติม, 0 = พื้นฐาน.
  function parentSubjectTypeRank_(subject) {
    const t = String(subject?.subject_type || subject?.type || '').trim();
    const name = String(subject?.name || subject?.subjectName || '').trim();
    const code = String(subject?.code || subject?.subjectCode || '').trim();
    if (t.includes('กิจกรรม') || /^ก/.test(code) || /แนะแนว|ลูกเสือ|เนตรนารี|ชุมนุม|สาธารณประโยชน์|เพื่อสังคม/.test(name)) return 2;
    if (t.includes('เพิ่มเติม')) return 1;
    if (t.includes('พื้นฐาน')) return 0;
    // No type set: Thai subject code = letters + level + year + type digit (1 พื้นฐาน, 2 เพิ่มเติม),
    // e.g. ส12101 พื้นฐาน, ส12232 เพิ่มเติม. (The old /^ส.*2/ rule made ส12101 เพิ่มเติม.)
    if (/^[^\d\s]+\d\d2/.test(code)) return 1;
    return 0;
  }

  // The parent_portal cards read firstName / lastName / title / studentId,
  // while data.students returns firstname / lastname / prefix / id.
  // Without this mapping every card showed only the title ("เด็กชาย").
  function parentPortalStudent_(student) {
    return {
      ...student,
      studentId: student.studentId ?? student.id,
      title: student.title ?? student.prefix ?? '',
      firstName: student.firstName ?? student.firstname ?? student.first_name ?? '',
      lastName: student.lastName ?? student.lastname ?? student.last_name ?? ''
    };
  }

  // How a parent should read one semester's score row (policy chosen by the school,
  // 2026-09-27): never show a grade for a semester that is still in progress.
  //   special  → ร / มส recorded by the teacher, shown as-is
  //   complete → entered and the final exam has a score: a real result with a grade
  //   pending  → marks entered, final exam not yet: show the running score, no grade
  //   none     → nothing entered (no row, or an all-zero placeholder row)
  function parentScoreStatus_(row) {
    if (!row) return { status: 'none', score: '', grade: '' };
    const gradeText = text(row.grade_text).trim();
    if (gradeText === 'ร' || gradeText === 'มส') {
      return { status: 'special', score: storedScoreWasEntered(row) ? number(row.total_score, 0) : '', grade: gradeText };
    }
    if (dashboardCompleteScore_(row)) return { status: 'complete', score: number(row.total_score, 0), grade: text(storedFinalGrade(row)) };
    if (storedScoreWasEntered(row)) return { status: 'pending', score: number(row.total_score, 0), grade: '' };
    return { status: 'none', score: '', grade: '' };
  }

  function parentYearScoreStatus_(term1, term2, subject) {
    const result = pp5YearEndResult(term1, term2, subject);
    return { status: result.status, score: result.average ?? '', grade: result.grade };
  }

  // Parent → only a linked child; admin/teacher → any student (preview mode).
  async function parentViewableStudent_(studentId) {
    const id = text(studentId).trim();
    if (!id) throw new Error('กรุณาระบุรหัสนักเรียน');
    const state = await data.auth.requireUser();
    const role = text(state.profile.role).toLowerCase();
    if (role === 'parent') {
      const { data: link, error } = await client
        .from('parent_student_links')
        .select('student_id')
        .eq('parent_user_id', state.user.id)
        .eq('student_id', id)
        .maybeSingle();
      if (error) throw new Error(error.message || 'ตรวจสอบสิทธิ์ผู้ปกครองไม่สำเร็จ');
      if (!link) throw new Error('ไม่มีสิทธิ์ดูข้อมูลของนักเรียนคนนี้');
    } else if (role !== 'admin' && role !== 'teacher') {
      throw new Error('บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลนักเรียน');
    }
    const student = await data.students.get(id);
    if (!student) throw new Error('ไม่พบนักเรียน');
    return student;
  }

  // Same subject order as the ปพ.6 report (its list is local to generatePp6Pdf):
  // พื้นฐาน before เพิ่มเติม before activities, then the usual curriculum order.
  const PARENT_SUBJECT_ORDER_ = ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์', 'เทคโนโลยี', 'สังคมศึกษา', 'ประวัติศาสตร์', 'สุขศึกษา', 'ศิลปะ', 'การงาน', 'ภาษาอังกฤษ', 'หน้าที่พลเมือง', 'การป้องกัน'];
  function parentSortSubjects_(subjects) {
    const orderIndex = (subject) => {
      const name = text(subject?.subjectName || subject?.name).trim();
      const index = PARENT_SUBJECT_ORDER_.findIndex((item) => name.includes(item));
      return index < 0 ? 999 : index;
    };
    return [...(subjects || [])].sort((a, b) => (parentSubjectTypeRank_(a) - parentSubjectTypeRank_(b))
      || (orderIndex(a) - orderIndex(b))
      || text(a.subjectCode || a.code).localeCompare(text(b.subjectCode || b.code)));
  }

  // Subject lists (subject manager and every page using getSubjects) follow the ปพ.6 layout: grade, then term
  // (ม.: ภาค 1 before ภาค 2, yearly subjects after), then พื้นฐาน / เพิ่มเติม / กิจกรรม, then curriculum order, then code.
  const PP6_ACTIVITY_ORDER_ = ['แนะแนว', 'ลูกเสือ', 'เนตรนารี', 'ชุมนุม', 'สาธารณ', 'ประโยชน์', 'กิจกรรม'];
  function pp6SortSubjects_(rows) {
    const gradeRank = (grade) => {
      const match = text(grade).trim().match(/^(อ|ป|ม)\.(\d+)/);
      return match ? 'อปม'.indexOf(match[1]) * 10 + Number(match[2]) : 99;
    };
    const termRank = (row) => subjectSemester_(row) || 3;
    const areaIndex = (row) => {
      const name = text(row?.name).trim();
      const list = parentSubjectTypeRank_(row) === 2 ? PP6_ACTIVITY_ORDER_ : PARENT_SUBJECT_ORDER_;
      const index = list.findIndex((item) => name.includes(item));
      return index < 0 ? 999 : index;
    };
    return [...(rows || [])].sort((a, b) => (gradeRank(a.grade) - gradeRank(b.grade))
      || (termRank(a) - termRank(b))
      || (parentSubjectTypeRank_(a) - parentSubjectTypeRank_(b))
      || (areaIndex(a) - areaIndex(b))
      || text(a.code).localeCompare(text(b.code)));
  }

  // Credit used to weight a grade point in the parent GPA (same rule as the ปพ.6 report:
  // credit, else hours per year / 40, else periods per week; 1 when the subject has none).
  function parentSubjectCredit_(subject) {
    const credit = Number(subject?.credit);
    if (subject?.credit !== null && subject?.credit !== undefined && subject?.credit !== '' && Number.isFinite(credit) && credit > 0) return credit;
    const hours = Number(subject?.hours_per_year);
    if (subject?.hours_per_year !== null && subject?.hours_per_year !== undefined && subject?.hours_per_year !== '' && Number.isFinite(hours) && hours > 0) return hours / 40;
    const periods = Number(subject?.periods_per_week);
    if (subject?.periods_per_week !== null && subject?.periods_per_week !== undefined && subject?.periods_per_week !== '' && Number.isFinite(periods) && periods > 0) return periods;
    return 1;
  }

  // GPA over finished subjects only (status complete with a numeric grade). ร / มส and
  // subjects still in progress are left out. null when nothing is finished yet.
  function parentSemesterGpa_(entries) {
    let credits = 0;
    let points = 0;
    let counted = 0;
    entries.forEach(({ status, grade, credit }) => {
      if (status !== 'complete') return;
      const value = Number(grade);
      if (text(grade).trim() === '' || !Number.isFinite(value)) return;
      credits += credit;
      points += value * credit;
      counted += 1;
    });
    return credits > 0 ? { gpa: Math.round((points / credits) * 100) / 100, counted } : { gpa: null, counted: 0 };
  }

  function parentActivityCriteria_(subject) {
    const name = String(subject?.name || subject?.subjectName || '');
    if (/แนะแนว/.test(name)) return 'guidance';
    if (/ลูกเสือ|เนตรนารี|ยุวกาชาด/.test(name)) return 'scout';
    if (/ชุมนุม|ชมรม/.test(name)) return 'club';
    if (/สาธารณประโยชน์|เพื่อสังคม/.test(name)) return 'social';
    return '';
  }

  // ปพ.6 activity row: ผ่าน / ไม่ผ่าน from the activity assessment (it used to print "ยังไม่ประเมิน" always).
  // Term: the subject's own semester (ม. per-semester activity), else the printed term, else (year) ภาค 2 then ภาค 1
  // like the parent page. Criteria aliases match reportAssessmentSummary (guidance / act1 / 1 ...).
  function pp6ActivityResult_(rows, subject, term) {
    const criteria = parentActivityCriteria_(subject);
    if (!criteria) return 'ยังไม่ประเมิน';
    const n = ['guidance', 'scout', 'club', 'social'].indexOf(criteria) + 1;
    const codes = [criteria, 'act' + n, String(n)];
    const own = subjectSemester_(subject);
    const wanted = own || (String(term) === '1' ? 1 : String(term) === '2' ? 2 : 0);
    const pick = (semester) => (rows || []).find((row) => row.assessment_type === 'activity'
      && codes.includes(text(row.criteria_code)) && number(row.semester, 1) === semester);
    const row = wanted ? pick(wanted) : (pick(2) || pick(1));
    const value = row ? row.score : null;
    if (value === 1 || value === '1') return 'ผ่าน';
    if (value === 0 || value === '0') return 'ไม่ผ่าน';
    return 'ยังไม่ประเมิน';
  }

  // 10 characters (the admin-users minimum), no look-alike letters/digits,
  // so a parent can retype it from a LINE message on a phone.
  function generateParentPassword_() {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    const bytes = new Uint32Array(10);
    global.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
  }

  function localIsoDate_(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }

  // Students a Smart Dashboard card may show: admin → whole school; a teacher with
  // grade (and room) in the profile → that class only; other teachers → whole school.
  async function dashboardScope_() {
    const state = await data.auth.requireUser();
    const role = text(state.profile.role).toLowerCase();
    if (role !== 'admin' && role !== 'teacher') throw new Error('บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลนี้');
    const academicYear = text(await currentYear()).trim();
    const grade = role === 'teacher' ? text(state.profile.className).trim() : '';
    const room = grade ? text(state.profile.room).trim() : '';
    const filters = { academicYear };
    if (grade) filters.grade = grade;
    if (grade && room) filters.room = room;
    const students = await data.students.list(filters);
    // Kindergarten (อ.1-อ.3) is never checked in for daily attendance, and the school does
    // not record grades for kindergarten either, so both attendance-only and grade-only
    // cards/checks work off this narrower list; only headcount-style totals keep `students`.
    const attendanceStudents = students.filter((s) => !isKindergartenGrade_(s.grade));
    const gradeStudents = attendanceStudents;
    const today = localIsoDate_(new Date());
    const range = academicYearDateRange(academicYear);
    return {
      role,
      academicYear,
      students,
      attendanceStudents,
      gradeStudents,
      ids: students.map((s) => text(s.id)).filter(Boolean),
      attendanceIds: attendanceStudents.map((s) => text(s.id)).filter(Boolean),
      gradeIds: gradeStudents.map((s) => text(s.id)).filter(Boolean),
      today,
      range,
      last: range.last && range.last < today ? range.last : today,
      scope: grade ? 'class' : 'all',
      scopeLabel: grade ? `${grade}${room ? '/' + room : ''}` : 'ทั้งโรงเรียน'
    };
  }

  // Students the original dashboard cards count (numbers, charts, progress, alerts; owner 2026-10-08):
  // a teacher with a grade in the profile sees that class only, the same rule as dashboardScope_.
  // Everyone else gets the whole school exactly as before (data.students.list() with no filters).
  // `grades` = the primary grades those cards draw (empty for a kindergarten class).
  async function dashboardCardStudents_() {
    const state = await data.auth.requireUser();
    const role = text(state.profile.role).toLowerCase();
    const grade = role === 'teacher' ? text(state.profile.className).trim() : '';
    if (!grade) return { students: await data.students.list(), scope: 'all', scopeLabel: 'ทั้งโรงเรียน', grades: taughtGrades_() };
    const room = text(state.profile.room).trim();
    const filters = { grade };
    if (room) filters.room = room;
    return {
      students: await data.students.list(filters),
      scope: 'class',
      scopeLabel: `${grade}${room ? '/' + room : ''}`,
      grades: taughtGrades_().includes(grade) ? [grade] : []
    };
  }

  function studentStats_(students) {
    const grades = {};
    let male = 0;
    let female = 0;
    students.forEach((student) => {
      grades[student.grade] = (grades[student.grade] || 0) + 1;
      const gender = text(student.gender).trim().toLowerCase();
      if (['ชาย', 'ช', 'male', 'm'].includes(gender)) male += 1;
      if (['หญิง', 'ญ', 'female', 'f'].includes(gender)) female += 1;
    });
    return {
      total: students.length,
      totalStudents: students.length,
      male,
      female,
      grades,
      summary: { total: students.length, male, female },
      lastUpdated: new Date().toISOString()
    };
  }

  function thaiShortDate_(iso) {
    const m = text(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return text(iso);
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
  }

  function dashboardClassKey_(student) {
    return `${text(student.grade)}/${text(student.room || student.classNo || '1')}`;
  }

  // The school does not take attendance for kindergarten (อ.1-อ.3): those classes never get
  // a daily attendance_daily row, so any attendance-based dashboard feature must skip them
  // entirely rather than showing them as permanently "not checked".
  function isKindergartenGrade_(grade) {
    return /^อ\.\s*[123]$/.test(text(grade).trim());
  }

  async function currentYear() {
    const settings = await data.settings.get();
    return text(settings.academicYear || settings.academic_year);
  }

  async function requireAdmin() {
    const state = await data.auth.requireUser();
    if (state.profile.role !== 'admin') {
      const error = new Error('รายการนี้สำหรับผู้ดูแลระบบเท่านั้น');
      error.code = 'FORBIDDEN';
      throw error;
    }
    return state;
  }

  async function invokeAdminUsers(payload) {
    await requireAdmin();
    let { data: result, error } = await client.functions.invoke('admin-users', { body: payload });
    if (error && Number(error?.context?.status) === 401) {
      // เซสชันถูกยกเลิก (เช่น เคยออกจากระบบแบบทุกอุปกรณ์) — ลองต่ออายุครั้งเดียว
      const refreshed = await client.auth.refreshSession().catch(() => ({ error: true }));
      if (!refreshed?.error) ({ data: result, error } = await client.functions.invoke('admin-users', { body: payload }));
      if (error && Number(error?.context?.status) === 401) {
        throw new Error('เซสชันหมดอายุหรือถูกออกจากระบบจากอุปกรณ์อื่น กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่อีกครั้ง');
      }
    }
    if (error) throw new Error(error.message || 'เรียก admin-users ไม่สำเร็จ');
    if (!result || result.error) throw new Error(result?.error || 'admin-users ไม่ตอบกลับ');
    return result;
  }

  function mapAdminUserProfile(profile) {
    return {
      id: profile.id,
      username: profile.username,
      role: profile.role,
      firstName: '',
      lastName: '',
      fullName: profile.display_name,
      displayName: profile.display_name,
      className: profile.grade || '',
      room: profile.room || '',
      studentIds: profile.studentIds || '',
      allowExport: profile.allow_export === true,
      active: profile.active !== false
    };
  }

  async function listAdminUsersDirect() {
    await requireAdmin();
    const [{ data: profiles, error: profileError }, { data: links, error: linksError }] = await Promise.all([
      client.from('user_profiles').select('id,username,role,display_name,grade,room,allow_export,active').order('username'),
      client.from('parent_student_links').select('parent_user_id,student_id')
    ]);
    if (profileError) throw new Error(profileError.message || 'อ่านรายชื่อผู้ใช้ไม่สำเร็จ');
    if (linksError) throw new Error(linksError.message || 'อ่านการผูกผู้ปกครองไม่สำเร็จ');
    const linkMap = new Map();
    (links || []).forEach((link) => {
      const key = text(link.parent_user_id);
      const current = linkMap.get(key) || [];
      current.push(text(link.student_id));
      linkMap.set(key, current);
    });
    return (profiles || []).map((profile) => ({ ...profile, studentIds: (linkMap.get(text(profile.id)) || []).join(',') }));
  }

  function parseCsv(source) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
      else field += char;
    }
    if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
    return rows;
  }

  function decodeBase64Utf8(source) {
    const bytes = Uint8Array.from(atob(text(source)), (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }

  function dmcImpactHtml(prepared, preview, fileName) {
    const gradeRows = Object.entries(prepared.gradeCounts || {})
      .map(([className, count]) => `<span class="badge bg-light text-dark border me-1 mb-1">${escapeHtml(className)}: ${number(count)} คน</span>`)
      .join('');
    const skippedRows = (prepared.skipped || []).slice(0, 8)
      .map((item) => `<li>แถว ${number(item.row)} (${escapeHtml(item.studentId)}): ${escapeHtml((item.reasons || []).join(', '))}</li>`)
      .join('');
    const preserved = number(preview.preservedMissingCount);
    return `
      <div class="text-start" style="font-family:'Sarabun',sans-serif;font-size:15px">
        <div class="alert alert-primary py-2 mb-3"><strong>ไฟล์:</strong> ${escapeHtml(fileName || 'DMC')}</div>
        <div class="row g-2 text-center mb-3">
          <div class="col-4"><div class="border rounded p-2"><strong class="d-block fs-5 text-primary">${number(prepared.validCount)}</strong>ผ่านการตรวจ</div></div>
          <div class="col-4"><div class="border rounded p-2"><strong class="d-block fs-5 text-success">${number(preview.insertedCount)}</strong>เพิ่มใหม่</div></div>
          <div class="col-4"><div class="border rounded p-2"><strong class="d-block fs-5 text-warning">${number(preview.updatedCount)}</strong>อัปเดต</div></div>
        </div>
        <div class="mb-2"><strong>ปีการศึกษา:</strong> ${escapeHtml(preview.academicYear)}</div>
        <div class="mb-2"><strong>แยกตามชั้น:</strong><div class="mt-1">${gradeRows || '-'}</div></div>
        <div class="alert ${preserved ? 'alert-warning' : 'alert-success'} py-2 mb-2">
          นักเรียนเดิมที่ไม่อยู่ในไฟล์ ${preserved} คน <strong>จะถูกเก็บไว้ ไม่ลบและไม่จำหน่ายอัตโนมัติ</strong><br>
          หลังนำเข้า ทะเบียนปี ${escapeHtml(preview.academicYear)} จะมี ${number(preview.resultRosterCount)} คน
        </div>
        ${prepared.skippedCount ? `
          <div class="alert alert-danger py-2 mb-0">
            ข้าม ${number(prepared.skippedCount)} แถวที่ไม่ถูกต้อง
            <ul class="small mb-0 mt-1 ps-3">${skippedRows}</ul>
            ${prepared.skippedCount > 8 ? `<div class="small mt-1">และอีก ${prepared.skippedCount - 8} แถว</div>` : ''}
          </div>` : ''}
      </div>`;
  }

  async function confirmDmcImport(prepared, preview, fileName) {
    const html = dmcImpactHtml(prepared, preview, fileName);
    if (global.Swal?.fire) {
      const result = await global.Swal.fire({
        title: 'ตรวจสอบก่อนนำเข้า DMC',
        html,
        icon: number(preview.preservedMissingCount) || prepared.skippedCount ? 'warning' : 'question',
        width: 760,
        showCancelButton: true,
        confirmButtonText: 'ยืนยันนำเข้าข้อมูล',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#198754',
        cancelButtonColor: '#6c757d',
        focusCancel: true
      });
      return result.isConfirmed === true;
    }
    const message = [
      `ตรวจพบ ${prepared.validCount} คน`,
      `เพิ่มใหม่ ${preview.insertedCount} คน`,
      `อัปเดต ${preview.updatedCount} คน`,
      `เก็บนักเรียนเดิมที่ไม่อยู่ในไฟล์ไว้ ${preview.preservedMissingCount} คน`,
      prepared.skippedCount ? `ข้ามแถวผิด ${prepared.skippedCount} แถว` : '',
      'ยืนยันนำเข้าหรือไม่?'
    ].filter(Boolean).join('\n');
    return global.confirm(message);
  }

  async function confirmDmcRollback(preview) {
    const inserted = number(preview.insertedCount);
    const updated = number(preview.updatedCount);
    const snapshotCount = number(preview.snapshotCount);
    const html = `
      <div class="text-start" style="font-family:'Sarabun',sans-serif;font-size:15px">
        <div class="alert alert-warning py-2">
          ระบบจะคืนข้อมูลนักเรียนจาก snapshot ก่อนนำเข้ารายการนี้ และลบนักเรียนที่รายการนี้เพิ่มใหม่
        </div>
        <ul class="mb-2">
          <li>ปีการศึกษา ${escapeHtml(preview.academicYear)}</li>
          <li>คืนข้อมูลเดิม ${updated} คน</li>
          <li>นำรายการที่เพิ่มใหม่ออก ${inserted} คน</li>
          <li>snapshot ที่ตรวจครบ ${snapshotCount} คน</li>
        </ul>
        <div class="small text-muted">หากมีการแก้ข้อมูลต่อหรือมีเช็กชื่อ/คะแนนแล้ว ฐานข้อมูลจะปฏิเสธการย้อนกลับอัตโนมัติ</div>
      </div>`;
    if (global.Swal?.fire) {
      const result = await global.Swal.fire({
        title: 'ยืนยันย้อนกลับการนำเข้า DMC?',
        html,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันย้อนกลับรายการนี้',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        focusCancel: true
      });
      return result.isConfirmed === true;
    }
    return global.confirm(`ยืนยันย้อนกลับการนำเข้า DMC ปี ${preview.academicYear}?\nคืนข้อมูลเดิม ${updated} คน และนำรายการเพิ่มใหม่ ${inserted} คนออก`);
  }

  async function optionalTable(table, configure) {
    let query = client.from(table).select('*');
    if (configure) query = configure(query);
    const { data: rows, error } = await query;
    if (error && data.helpers.isOptionalSchemaError(error)) return [];
    if (error) throw new Error(error.message);
    return rows || [];
  }

  async function optionalTableAll(table, configure) {
    const pageSize = 1000;
    const allRows = [];
    for (let offset = 0; ; offset += pageSize) {
      let query = client.from(table).select('*');
      if (configure) query = configure(query);
      query = query.range(offset, offset + pageSize - 1);
      const { data: rows, error } = await query;
      if (error && data.helpers.isOptionalSchemaError(error)) return [];
      if (error) throw new Error(error.message);
      const pageRows = rows || [];
      allRows.push(...pageRows);
      if (pageRows.length < pageSize) return allRows;
    }
  }

  // Parent accounts (auth user ids) with an active LINE link. Admin may read every row (policy
  // line_links_read). null = unknown: a school without the LINE migration, or any read error, so
  // the dashboard shows no LINE numbers at all rather than a misleading 0.
  async function lineLinkedParentIds_() {
    try {
      const ids = new Set();
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data: rows, error } = await client.from('line_links').select('parent_user_id')
          .eq('active', true).range(offset, offset + pageSize - 1);
        if (error) return null;
        (rows || []).forEach((row) => ids.add(text(row.parent_user_id)));
        if ((rows || []).length < pageSize) return ids;
      }
    } catch (_) {
      return null;
    }
  }

  // Only no-school closures ('ราชการ') are dropped from the counts. A 'school' day such as a
  // Saturday "ชดเชย" make-up class is a real school day when the class was checked in.
  async function readClassAttendanceRange(grade, classNo, first, last, academicYear = '') {
    const [students, holidayDates] = await Promise.all([
      data.students.list({ grade, room: classNo, academicYear: text(academicYear) }),
      noSchoolHolidayDateSet_(first, last)
    ]);
    const ids = students.map((student) => text(student.id)).filter(Boolean);
    const rows = ids.length ? await optionalTableAll('attendance_daily', (query) => query
      .in('student_id', ids)
      .gte('attendance_date', first)
      .lte('attendance_date', last)
      .order('attendance_date', { ascending: true })
      .order('student_id', { ascending: true })) : [];
    return {
      students,
      rows: normalizedAttendanceRows(rows).filter((row) => !holidayDates.has(row.attendance_date))
    };
  }

  function extractDriveFileId(value) {
    const input = text(value).trim();
    const fromUrl = input.match(/(?:\/d\/|[?&]id=)([-\w]{20,})/i);
    if (fromUrl) return fromUrl[1];
    return /^[-\w]{20,}$/.test(input) ? input : '';
  }

  function normalizeLogoValue(value) {
    const input = text(value).trim();
    if (!input) return '';
    if (/^(?:data:image\/|blob:|https?:\/\/|\/|\.\/)/i.test(input)) {
      const fileId = extractDriveFileId(input);
      return fileId ? `https://lh3.googleusercontent.com/d/${fileId}` : input;
    }
    const fileId = extractDriveFileId(input);
    return fileId ? `https://lh3.googleusercontent.com/d/${fileId}` : input;
  }

  function toLegacySettings(settings, teachers) {
    const schoolName = settings.school_name || settings.schoolName || '';
    const schoolAddress = settings.school_address || settings.schoolAddress || '';
    const academicYear = text(settings.academic_year || settings.academicYear);
    const semester = text(settings.semester || '1');
    const directorName = settings.director_name || settings.directorName || '';
    const directorPosition = settings.director_position || settings.directorPosition || '';
    const academicHead = settings.academic_head || settings.academicHead || '';
    const logo = settings.logo_base64 || '';
    const logoFileId = extractDriveFileId(logo);
    const schoolPhone = settings.school_phone || settings.schoolPhone || settings.phone || '';
    const footerNote = settings.footer_note || settings.footerNote || '';
    const classTeachers = teachers || settings.settings_json?.class_teachers || {};
    return {
      ...settings,
      'ชื่อโรงเรียน': schoolName,
      schoolName,
      school_name: schoolName,
      'ที่อยู่โรงเรียน': schoolAddress,
      schoolAddress,
      address: schoolAddress,
      'สังกัด': settings.affiliation || '',
      affiliation: settings.affiliation || '',
      'เบอร์โทรศัพท์โรงเรียน': schoolPhone,
      schoolPhone,
      phone: schoolPhone,
      school_phone: schoolPhone,
      'ปีการศึกษา': academicYear,
      academicYear,
      academic_year: academicYear,
      'ภาคเรียน': semester,
      semester,
      'ชื่อผู้อำนวยการ': directorName,
      directorName,
      director_name: directorName,
      'ตำแหน่งผู้อำนวยการ': directorPosition,
      directorPosition,
      'ชื่อหัวหน้างานวิชาการ': academicHead,
      supervisorName: academicHead,
      academicHead,
      'หมายเหตุท้ายเอกสาร': footerNote,
      footerNote,
      footer_note: footerNote,
      logo,
      logoDataUrl: logo,
      schoolLogo: logo,
      loginLogo: logo,
      logoFileId,
      logoUrl_lh3: logoFileId ? `https://lh3.googleusercontent.com/d/${logoFileId}` : logo,
      logoUrl_uc: logoFileId ? `https://drive.google.com/uc?export=view&id=${logoFileId}` : '',
      pdfSaveFolderId: '',
      class_teachers: classTeachers,
      classTeachers
    };
  }

  function toLegacySubject(row) {
    const scoreConfig = row.score_config || {};
    const fullScores = Array.isArray(scoreConfig.full_scores) ? scoreConfig.full_scores : [];
    return {
      ...row,
      id: row.id,
      'ชั้น': row.grade,
      grade: row.grade,
      'รหัสวิชา': row.code || row.subjectCode || text(row.id),
      subject_code: row.code || row.subjectCode || text(row.id),
      subjectCode: row.code || row.subjectCode || text(row.id),
      'ชื่อวิชา': row.name || row.subjectName,
      subject_name: row.name || row.subjectName,
      subjectName: row.name || row.subjectName,
      'ประเภทวิชา': row.subject_type || '',
      subject_type: row.subject_type || '',
      'หน่วยกิต': row.credit ?? '',
      credit: row.credit ?? '',
      'ชั่วโมง/ปี': row.hours_per_year ?? '',
      'ภาคเรียน': subjectSemester_(row) || '',
      hour: row.hours_per_year ?? '',
      hoursPerYear: row.hours_per_year ?? '',
      'ครูผู้สอน': row.teacher_name ?? '',
      'คะแนนเต็ม': row.full_score ?? row.fullScore ?? 100,
      fullScore: row.full_score ?? row.fullScore ?? 100,
      'คะแนนผ่าน': row.pass_score ?? row.passScore ?? 50,
      passScore: row.pass_score ?? row.passScore ?? 50,
      'คะแนนระหว่างปี': scoreConfig.formative_max ?? 70,
      'คะแนนปลายปี': scoreConfig.summative_max ?? 30,
      'รวม': row.full_score ?? row.fullScore ?? 100,
      ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`เต็ม_ครั้ง${index + 1}`, fullScores[index] ?? 0]))
    };
  }

  function subjectPayload(values, withDefaults = false) {
    const numeric = (value) => (value === undefined || value === null || text(value).trim() === '' ? undefined : number(value));
    const hasScoreConfig = values.score_config || values['คะแนนระหว่างปี'] !== undefined
      || values['คะแนนปลายปี'] !== undefined
      || Array.from({ length: 9 }, (_, index) => `เต็ม_ครั้ง${index + 1}`).some((key) => values[key] !== undefined);
    const payload = data.helpers.compactObject({
      name: values.name || values.subjectName || values['ชื่อวิชา'],
      code: values.code || values.subjectCode || values['รหัสวิชา'],
      grade: values.grade || values['ชั้น'],
      subject_type: values.subject_type || values['ประเภทวิชา'],
      credit: numeric(values.credit ?? values['หน่วยกิต']),
      hours_per_year: numeric(values.hours_per_year ?? values['ชั่วโมง/ปี']),
      // ภาคเรียนของวิชารายภาค (ม.ต้น): 1 / 2, ว่าง = วิชารายปี  ไม่ส่งมา = ไม่แตะค่าเดิม
      semester: (() => {
        const raw = values.semester !== undefined ? values.semester : values['ภาคเรียน'];
        if (raw === undefined) return undefined;
        const value = Number(text(raw).trim());
        return value === 1 || value === 2 ? value : null;
      })(),
      teacher_name: values.teacher_name ?? values.teacherName ?? values['ครูผู้สอน'],
      full_score: numeric(values.full_score ?? values.fullScore ?? values['คะแนนเต็ม'] ?? values['รวม']),
      pass_score: numeric(values.pass_score ?? values.passScore ?? values['คะแนนผ่าน']),
      score_config: hasScoreConfig ? (values.score_config || {
        formative_max: numeric(values['คะแนนระหว่างปี']) ?? 70,
        summative_max: numeric(values['คะแนนปลายปี']) ?? 30,
        full_scores: Array.from({ length: 9 }, (_, index) => numeric(values[`เต็ม_ครั้ง${index + 1}`]) ?? 0)
      }) : undefined
    });
    if (withDefaults) {
      if (payload.full_score === undefined) payload.full_score = 100;
      if (payload.pass_score === undefined) payload.pass_score = 50;
      if (payload.score_config === undefined) payload.score_config = { formative_max: 70, summative_max: 30, full_scores: Array(9).fill(0) };
    }
    return payload;
  }

  // subjects.id is text with NO database default (this school's ids came from the 2569 seed), so a new subject
  // must get its id here; without it "เพิ่มรายวิชา" and importing a new subject failed (found 2026-10-10).
  function newSubjectId_() {
    const uuid = global.crypto?.randomUUID?.();
    return uuid || `subj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  // Reports and score sheets find a subject by its name within a grade, so two subjects of one grade
  // must not share a name (ม.ต้น: "ภาษาไทย 1" ภาค 1 / "ภาษาไทย 2" ภาค 2).
  async function assertUniqueSubjectName_(grade, name, exceptId) {
    const label = normalizedSubjectLabel(name);
    if (!text(grade).trim() || !label) return;
    const { data: rows, error } = await client.from('subjects').select('id, name').eq('grade', text(grade).trim());
    if (error) throw new Error(error.message);
    const clash = (rows || []).find((row) => normalizedSubjectLabel(row.name) === label && text(row.id) !== text(exceptId));
    if (clash) {
      throw new Error(`ชั้น ${text(grade).trim()} มีวิชาชื่อ "${label}" แล้ว กรุณาตั้งชื่อไม่ให้ซ้ำ เช่น "${label} 1" (ภาคเรียนที่ 1) และ "${label} 2" (ภาคเรียนที่ 2)`);
    }
  }

  function normalizedSubjectLabel(value) {
    return text(value).replace(/\s+/g, ' ').trim();
  }

  function subjectScoreConfig(subject) {
    let raw = subject?.score_config || {};
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (_error) { raw = {}; }
    }
    const configuredScores = Array.isArray(raw.full_scores) ? raw.full_scores : [];
    return {
      midMax: number(raw.formative_max, 70),
      finalMax: number(raw.summative_max, 30),
      fullScores: Array.from({ length: 9 }, (_item, index) => number(configuredScores[index], 0))
    };
  }

  function storedScoreBreakdown(row) {
    let raw = row?.score_breakdown ?? row?.scoreBreakdown ?? {};
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (_error) { raw = {}; }
    }
    if (Array.isArray(raw)) return { scores: raw };
    return raw && typeof raw === 'object' ? raw : {};
  }

  function storedScoreWasEntered(row) {
    if (!row) return false;
    const breakdown = storedScoreBreakdown(row);
    if (breakdown.entered === true || breakdown.entryState === 'entered') return true;

    // Older bridge versions could create a score row filled entirely with zero
    // for every student, even when the teacher had not entered that row.  Keep
    // real legacy scores, but treat an unmarked all-zero row as not entered.
    const values = [];
    if (Array.isArray(breakdown.scores)) values.push(...breakdown.scores);
    values.push(
      row.formative_score,
      row.summative_score,
      row.total_score,
      breakdown.mid,
      breakdown.final,
      breakdown.total,
      breakdown.makeup
    );
    return values.some((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed !== 0;
    });
  }

  // A score row is a real, finished result only when a teacher actually entered it
  // (storedScoreWasEntered) and the final exam has a score recorded. The schema stores
  // 0 for "not yet filled in" the same way it stores a genuine zero on the final exam,
  // so a row whose final exam reads 0 is treated as still in progress, not a result.
  // (Used consistently by the dashboard watchlist, alerts and charts below.)
  function dashboardCompleteScore_(row) {
    if (!storedScoreHasFinalGrade(row) || !storedScoreWasEntered(row)) return false;
    const breakdown = storedScoreBreakdown(row);
    const finalExam = number(row.summative_score ?? breakdown.final, 0);
    return finalExam > 0;
  }

  function storedScoreHasFinalGrade(row) {
    if (!row) return false;
    return row.grade_point !== null
      && row.grade_point !== undefined
      && text(row.grade_point).trim() !== '';
  }

  function storedFinalGrade(row) {
    if (!storedScoreHasFinalGrade(row)) return '';
    const breakdown = storedScoreBreakdown(row);
    const total = [row?.total_score, row?.totalScore, breakdown.total]
      .find((value) => value !== null && value !== undefined && text(value).trim() !== '');
    if (total !== undefined) return data.helpers.calculateGrade(total);
    const gradeText = text(row.grade_text).trim();
    return gradeText !== '' ? gradeText : text(row.grade_point).trim();
  }

  // ร / มส stored on a score row (grade_text). Shown as is and never counted in a GPA,
  // whatever the total score says (owner 2026-10-09).
  function storedSpecialGrade(row) {
    const value = text(row?.grade_text).trim();
    return value === 'ร' || value === 'มส' ? value : '';
  }

  // Class rank used by ปพ.6, "สรุปผลสัมฤทธิ์รายชั้น" and "สรุปการประเมินทางการเรียน": higher GPA first
  // (2 decimals); equal GPA -> higher ร้อยละ (average total score of the subjects in that GPA, 2 decimals)
  // first; only students equal on both share a rank (owner 2026-10-09). items: { id, gpa, pct }, gpa null = no rank.
  function classRankMap_(items) {
    const round2 = (value) => Math.round(number(value, 0) * 100) / 100;
    const sorted = (items || []).filter((item) => item.gpa !== null && item.gpa !== undefined && Number.isFinite(Number(item.gpa)))
      .sort((a, b) => (round2(b.gpa) - round2(a.gpa)) || (round2(b.pct) - round2(a.pct)));
    const map = new Map();
    sorted.forEach((item, index) => {
      const previous = sorted[index - 1];
      const tied = previous && round2(previous.gpa) === round2(item.gpa) && round2(previous.pct) === round2(item.pct);
      map.set(item.id, tied ? map.get(previous.id) : index + 1);
    });
    return map;
  }

  const ACTIVITY_SCORE_SUBJECT_KEYWORDS =['กิจกรรม', 'แนะแนว', 'ลูกเสือ', 'เนตรนารี', 'ชุมนุม', 'เพื่อสังคม', 'ชมรม'];

  function academicScoreSubjects(subjects) {
    return (subjects || []).filter((subject) => {
      const name = text(subject.name || subject.subjectName);
      return !ACTIVITY_SCORE_SUBJECT_KEYWORDS.some((keyword) => name.includes(keyword));
    });
  }

  const PRIMARY_GRADES_ = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'];
  // Grades the school teaches (js/grade-levels.js): ป.1–ป.6 unless the school turned on ม.1–ม.3.
  function taughtGrades_() {
    const list = global.PP5Grades?.list?.();
    return Array.isArray(list) && list.length ? list : PRIMARY_GRADES_;
  }

  // Grades are stored per semester, so the dashboard's "grades recorded" counts only the semester set in
  // ตั้งค่า; counting either semester kept semester 2 at 100% from semester 1's grades.
  async function dashboardTerm_() {
    const settings = await data.settings.get().catch(() => ({}));
    const academicYear = text(settings.academicYear || settings.academic_year).trim();
    const semester = number(settings.semester, 1) === 2 ? 2 : 1;
    const byYear = (query) => (academicYear ? query.eq('academic_year', academicYear) : query);
    return { academicYear, semester, byYear, byTerm: (query) => byYear(query).eq('semester', semester) };
  }

  // แนะแนว/ลูกเสือ/ชุมนุม/เพื่อสังคม are assessed (ผ่าน/ไม่ผ่าน), never graded.
  function isActivityScoreSubject_(sb) {
    return text(sb.subject_type).includes('กิจกรรม') || /^ก/.test(text(sb.code))
      || ACTIVITY_SCORE_SUBJECT_KEYWORDS.some((keyword) => text(sb.name).includes(keyword));
  }

  // Dashboard "grades recorded" per primary grade, shared by the grade chart and the progress card.
  // Each grade's total is its own subject list without activities (แนะแนว/ลูกเสือ/ชุมนุม/เพื่อสังคม are
  // assessed separately, never graded), and only that grade's subjects count as recorded, so
  // recordedCount can never exceed total. Callers pass scores already limited to the current year.
  function gradeRecordingByGrade_(students, subjects, scores, grades = taughtGrades_()) {
    const studentMap = new Map((students || []).map((s) => [text(s.id), s]));
    const subjectMap = new Map((subjects || []).map((s) => [text(s.id), s]));
    const subjectsByGrade = {};
    const recordedByGrade = {};
    grades.forEach((g) => { subjectsByGrade[g] = new Set(); recordedByGrade[g] = new Set(); });
    (subjects || []).forEach((sb) => {
      if (subjectsByGrade[sb.grade] && sb.name && !isActivityScoreSubject_(sb)) subjectsByGrade[sb.grade].add(sb.name);
    });
    (scores || []).forEach((sc) => {
      const s = studentMap.get(text(sc.student_id));
      const sb = subjectMap.get(text(sc.subject_id));
      const hasGraded = sc.grade_point !== null && sc.grade_point !== undefined && sc.grade_point !== '';
      if (s?.grade && recordedByGrade[s.grade] && sb?.name && hasGraded && subjectsByGrade[s.grade].has(sb.name)) {
        recordedByGrade[s.grade].add(sb.name);
      }
    });
    return grades.map((g) => {
      const recordedCount = recordedByGrade[g].size;
      const total = subjectsByGrade[g].size || 8;
      return { name: g, recordedCount, total, pct: Math.min(100, Math.round((recordedCount / total) * 100)) };
    });
  }

  function parseLegacyScoreSheetName(sheetName) {
    const value = text(sheetName).trim();
    const match = value.match(/^(.+)\s+([อปม])\.?([0-9]+)-(.+)$/);
    if (!match) throw new Error(`รูปแบบชื่อตารางคะแนนไม่ถูกต้อง: ${value || '-'}`);
    return {
      subjectName: match[1].trim(),
      grade: `${match[2]}.${match[3]}`,
      classNo: match[4].trim()
    };
  }

  function matchSubjectCandidate(item, targetName, targetCode) {
    if (!item) return false;
    const itemName = normalizedSubjectLabel(item.name || item.subjectName);
    const itemCode = normalizedSubjectLabel(item.code || item.subjectCode || item.id);
    const code = normalizedSubjectLabel(targetCode);
    const name = normalizedSubjectLabel(targetName);
    if (code && (itemCode === code || itemName === code)) return true;
    if (name && (itemName === name || itemCode === name)) return true;
    if (name) {
      const cleanTarget = name.replace(/\s+/g, '');
      const cleanItem = itemName.replace(/\s+/g, '');
      if (cleanItem === cleanTarget) return true;
      const aliases = [
        ['วิทยาศาสตร์', 'วิทยาศาสตร์และเทคโนโลยี'],
        ['สังคมศึกษา', 'สังคมศึกษา ศาสนา และวัฒนธรรม'],
        ['สังคมศึกษา', 'สังคมศึกษา ศาสนาและวัฒนธรรม'],
        ['สุขศึกษา', 'สุขศึกษาและพลศึกษา'],
        ['การงาน', 'การงานอาชีพ'],
        ['การป้องกัน', 'การป้องกันการทุจริต'],
        ['หน้าที่พลเมือง', 'หน้าที่พลเมือง']
      ];
      for (const [shortName, fullName] of aliases) {
        const cleanShort = shortName.replace(/\s+/g, '');
        const cleanFull = fullName.replace(/\s+/g, '');
        if ((cleanTarget === cleanShort || cleanTarget === cleanFull) &&
            (cleanItem === cleanShort || cleanItem === cleanFull)) {
          return true;
        }
      }
      if (cleanItem.startsWith(cleanTarget) || cleanTarget.startsWith(cleanItem)) return true;
    }
    return false;
  }

  async function resolveLegacyScoreSheet(sheetName) {
    const parsed = parseLegacyScoreSheetName(sheetName);
    const subjects = await data.subjects.list(parsed.grade);
    const targetName = normalizedSubjectLabel(parsed.subjectName);
    const subject = subjects.find((item) =>
      matchSubjectCandidate(item, targetName, '') ||
      normalizedSubjectLabel(item.name || item.subjectName) === targetName ||
      normalizedSubjectLabel(item.code || item.subjectCode || item.id) === targetName
    );
    if (!subject) throw new Error(`ไม่พบรายวิชา ${parsed.subjectName} ของชั้น ${parsed.grade} ใน Supabase`);
    return { ...parsed, subject };
  }

  async function scoreRowsForSubject(subjectId, academicYear, studentIds) {
    if (!studentIds.length) return [];
    const { data: rows, error } = await client.from('scores').select('*')
      .eq('subject_id', subjectId)
      .eq('academic_year', academicYear)
      .in('student_id', studentIds);
    if (error) throw new Error(`อ่านคะแนนไม่สำเร็จ: ${error.message}`);
    return rows || [];
  }

  // "loadedAt" for the save-conflict check = the newest updated_at the SERVER wrote for the loaded rows.
  // It used to be Date.now() on the teacher's device: a clock running behind the server made the next save
  // within that gap fail with "มีผู้ใช้อื่นแก้ไขคะแนนวิชานี้แล้ว" although nobody else had touched it.
  // +1 ms because Postgres keeps microseconds and Date.parse drops them (…40.926123 -> …40.926), which the
  // server would otherwise read as a newer row. No rows yet -> 1 (still > 0, so a row someone creates after
  // loading is caught as a conflict).
  function scoreVersionToken(rows) {
    const latest = (rows || []).reduce((max, row) => {
      const timestamp = Date.parse(row.updated_at || row.created_at || '');
      return Number.isFinite(timestamp) ? Math.max(max, timestamp) : max;
    }, 0);
    return latest > 0 ? latest + 1 : 1;
  }

  function legacyTermScoreData(students, scoreRows, subject) {
    const config = subjectScoreConfig(subject);
    const firstStoredConfig = scoreRows.map(storedScoreBreakdown).find((item) =>
      Array.isArray(item.fullScores) || Array.isArray(item.full_scores)
    );
    const storedFullScores = firstStoredConfig?.fullScores || firstStoredConfig?.full_scores;
    const fullScores = Array.isArray(storedFullScores)
      ? Array.from({ length: 9 }, (_item, index) => number(storedFullScores[index], 0))
      : config.fullScores;
    const fullFinal = firstStoredConfig?.fullFinal ?? firstStoredConfig?.full_final ?? config.finalMax;
    const byStudent = new Map(scoreRows.map((row) => [text(row.student_id), row]));
    return {
      fullScores,
      roundLabels: storedScoreRoundLabels(scoreRows),
      fullFinal: number(fullFinal, config.finalMax),
      rows: students.map((student) => {
        const stored = byStudent.get(text(student.id));
        const saved = storedScoreWasEntered(stored) ? stored : null;
        const breakdown = storedScoreBreakdown(saved);
        const storedScores = Array.isArray(breakdown.scores) ? breakdown.scores : [];
        const scores = Array.from({ length: 9 }, (_item, index) => saved ? number(storedScores[index], 0) : '');
        const itemTotal = scores.reduce((sum, value) => sum + number(value), 0);
        const mid = number(saved?.formative_score ?? breakdown.mid, itemTotal);
        const finalScore = saved ? number(saved?.summative_score ?? breakdown.final, 0) : '';
        const total = number(saved?.total_score ?? breakdown.total, mid + finalScore);
        const savedGrade = storedFinalGrade(saved);
        return {
          id: text(student.id),
          name: studentDisplayName(student),
          gender: text(student.gender),
          saved: !!saved,
          scores,
          mid,
          final: finalScore,
          total,
          grade: !saved ? '' : savedGrade || data.helpers.calculateGrade(total),
          makeup: number(breakdown.makeup, 0)
        };
      })
    };
  }

  // ปพ.5 ระดับประถมพิมพ์ "ผลการเรียนสิ้นปีการศึกษา": วิชาหนึ่งมีเกรดประจำปีก็ต่อเมื่อ
  // ทั้งภาคเรียนที่ 1 และ 2 มีผลสมบูรณ์ (กรอกคะแนนและมีคะแนนสอบปลายภาค > 0 — เกณฑ์เดียวกับ
  // dashboard/ผู้ปกครอง) ไม่เช่นนั้นเป็น "รอผล" ห้ามเอาแถวคะแนนว่าง/ศูนย์ของภาคที่ยังไม่จบมาเฉลี่ย
  // จนกลายเป็นเกรด 0 ปลอม  ร / มส ที่ครูบันทึกไว้ถือเป็นผลพิเศษ (ไม่มีเกรดตัวเลข)
  // วิชารายภาค (ม.ต้น, owner 2026-10-10): subjects.semester = 1 หรือ 2 คือสอนและตัดเกรดจบในภาคนั้นภาคเดียว
  // ผลทั้งปีของวิชานั้น = ผลของภาคนั้น  ว่าง/0 = วิชารายปีแบบประถม (ภาค 1 + ภาค 2 เฉลี่ย) เหมือนเดิมทุกอย่าง
  function subjectSemester_(subject) {
    const value = Number(subject?.semester);
    return value === 1 || value === 2 ? value : 0;
  }
  // Does this subject belong in a term-1 / term-2 view? Yearly subjects and non-term views: always.
  function subjectInTerm_(subject, term) {
    const own = subjectSemester_(subject);
    const wanted = Number(term);
    return !own || !(wanted === 1 || wanted === 2) || own === wanted;
  }

  // ชั้นมัธยม (ม.1–ม.3 ...) ตัดสินผลการเรียนรายภาค: ผลภาคเรียนคือผลจริง ไม่ใช่ "ผลระหว่างปี" (owner 2026-10-10)
  function semesterJudgedGrade_(grade) {
    return /^ม\./.test(text(grade).trim());
  }

  // วิชาชั้น ม. (ยกเว้นกิจกรรม) ต้องระบุภาคเรียน ไม่เช่นนั้นจะถูกเฉลี่ย 2 ภาคแบบประถม
  function assertSemesterForGrade_(payload, grade) {
    if (!semesterJudgedGrade_(grade) || isActivityScoreSubject_({ ...payload, grade })) return;
    if (!subjectSemester_(payload)) {
      throw new Error(`วิชา ${text(payload.name || payload.code)} ชั้น ${text(grade)} ต้องระบุภาคเรียน (1 หรือ 2) เพราะชั้น ม. ตัดสินผลรายภาค`);
    }
  }

  // วิชารายภาค (ม.ต้น): บันทึกคะแนนได้เฉพาะภาคของวิชา
  function assertSubjectTerm_(subject, semester) {
    if (subjectInTerm_(subject, semester)) return;
    throw new Error(`วิชานี้เรียนภาคเรียนที่ ${subjectSemester_(subject)} เท่านั้น บันทึกคะแนนภาคเรียนที่ ${semester} ไม่ได้`);
  }

  // subject (optional): a semester subject's year result is its own term's result.
  function pp5YearEndResult(term1, term2, subject) {
    const own = subjectSemester_(subject);
    if (own) {
      const row = own === 1 ? term1 : term2;
      const ownSpecial = text(row?.grade_text).trim();
      if (ownSpecial === 'ร' || ownSpecial === 'มส') return { status: 'special', grade: ownSpecial };
      if (!dashboardCompleteScore_(row)) return { status: 'pending', grade: '' };
      // same value and grade as that term's own view (storedFinalGrade)
      const total = number(row.total_score, 0);
      return { status: 'complete', average: total, grade: String(storedFinalGrade(row)) };
    }
    const special = [term1, term2].map((row) => text(row?.grade_text).trim()).find((value) => value === 'ร' || value === 'มส');
    if (special) return { status: 'special', grade: special };
    if (!dashboardCompleteScore_(term1) || !dashboardCompleteScore_(term2)) return { status: 'pending', grade: '' };
    const average = yearlyScoreAverage(term1.total_score, term2.total_score, true, true);
    return { status: 'complete', average, grade: String(data.helpers.calculateGrade(average)) };
  }

  function yearlyScoreAverage(term1Total, term2Total, term1Saved, term2Saved) {
    const term1 = number(term1Total, 0);
    const term2 = number(term2Total, 0);
    if (term1Saved && term2Saved) return Math.round((term1 + term2) / 2);
    if (term1Saved) return term1;
    if (term2Saved) return term2;
    return 0;
  }

  // วิเคราะห์ผลสอบ (read-only): uses the same rules as getStudentScoresForWeb so the charts agree
  // with "สรุปผลการเรียนรายชั้น" — a term counts only a row that was actually entered, and the
  // year value is the rounded 2-term average when BOTH terms were entered. Round averages
  // (ครั้งที่ 1-9) are a percentage of that round's full score; rounds with no full score are skipped.
  const EXAM_GRADE_KEYS = ['4', '3.5', '3', '2.5', '2', '1.5', '1', '0'];

  function examScoreStats(values) {
    const sorted = values.slice().sort((left, right) => left - right);
    const count = sorted.length;
    const grades = Object.fromEntries(EXAM_GRADE_KEYS.map((key) => [key, 0]));
    sorted.forEach((value) => { grades[String(data.helpers.calculateGrade(value))] += 1; });
    const round2 = (value) => Math.round(value * 100) / 100;
    return {
      count,
      mean: count ? round2(sorted.reduce((sum, value) => sum + value, 0) / count) : null,
      median: count ? round2(count % 2 ? sorted[(count - 1) / 2] : (sorted[count / 2 - 1] + sorted[count / 2]) / 2) : null,
      min: count ? sorted[0] : null,
      max: count ? sorted[count - 1] : null,
      grades
    };
  }

  function examAnalysisSummary(students, subjects, scoreRows, semester) {
    const term = semester === '1' || semester === '2' ? Number(semester) : 0;
    const roomOf = new Map(students.map((student) => [text(student.id), text(student.room || student.classNo || '1')]));
    const rooms = [...new Set(roomOf.values())].sort((left, right) => left.localeCompare(right, 'th', { numeric: true }));
    const grouped = new Map();
    (scoreRows || []).forEach((row) => {
      const studentId = text(row.student_id);
      if (!roomOf.has(studentId)) return;
      const key = `${studentId}|${text(row.subject_id)}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });
    const percentOf = (sum, count) => (count ? Math.round((sum / count) * 100) / 100 : null);
    const subjectSummaries = academicScoreSubjects(subjects).map((subject) => {
      const fullScores = subjectScoreConfig(subject).fullScores;
      const valuesByRoom = new Map(rooms.map((room) => [room, []]));
      const rounds = fullScores.map((full, index) => ({
        round: index + 1, full, sum: 0, count: 0,
        byRoom: new Map(rooms.map((room) => [room, { sum: 0, count: 0 }]))
      }));
      roomOf.forEach((room, studentId) => {
        const rows = grouped.get(`${studentId}|${text(subject.id)}`) || [];
        const t1 = rows.find((row) => number(row.semester, 1) === 1);
        const t2 = rows.find((row) => number(row.semester, 1) === 2);
        const used = term ? [term === 2 ? t2 : t1] : [t1, t2];
        if (!used.every((row) => storedScoreWasEntered(row))) return;
        const value = term ? number(used[0].total_score, 0) : yearlyScoreAverage(t1.total_score, t2.total_score, true, true);
        valuesByRoom.get(room).push(value);
        used.forEach((row) => {
          const scores = storedScoreBreakdown(row).scores;
          if (!Array.isArray(scores)) return;
          rounds.forEach((round, index) => {
            const raw = scores[index];
            if (!(round.full > 0) || raw === null || raw === undefined || text(raw).trim() === '') return;
            const score = Number(raw);
            if (!Number.isFinite(score)) return;
            const percent = (score / round.full) * 100;
            round.sum += percent;
            round.count += 1;
            const cell = round.byRoom.get(room);
            cell.sum += percent;
            cell.count += 1;
          });
        });
      });
      return {
        id: text(subject.id),
        name: text(subject.name),
        code: text(subject.code),
        subjectType: text(subject.subject_type),
        overall: examScoreStats([...valuesByRoom.values()].flat()),
        byRoom: Object.fromEntries(rooms.map((room) => [room, examScoreStats(valuesByRoom.get(room))])),
        rounds: rounds.filter((round) => round.full > 0).map((round) => ({
          round: round.round,
          full: round.full,
          count: round.count,
          percent: percentOf(round.sum, round.count),
          byRoom: Object.fromEntries(rooms.map((room) => {
            const cell = round.byRoom.get(room);
            return [room, { count: cell.count, percent: percentOf(cell.sum, cell.count) }];
          }))
        }))
      };
    });
    return {
      term: term ? String(term) : 'year',
      rooms,
      studentCount: roomOf.size,
      studentsByRoom: Object.fromEntries(rooms.map((room) => [room, [...roomOf.values()].filter((value) => value === room).length])),
      subjects: subjectSummaries
    };
  }

  // ชื่องานของช่องคะแนนครั้งที่ 1-9 (เช่น ใบงาน, สอบย่อย) เก็บใน score_breakdown.roundLabels คู่กับ
  // fullScores ของแต่ละภาคเรียน — ไม่มีตารางแยก จึงเกิดขึ้นเมื่อบันทึกคะแนนอย่างน้อย 1 คน
  const SCORE_ROUND_LABEL_MAX = 30;

  function normalizeScoreRoundLabels(value) {
    if (!Array.isArray(value)) return null;
    return Array.from({ length: 9 }, (_item, index) => text(value[index]).replace(/\s+/g, ' ').trim().slice(0, SCORE_ROUND_LABEL_MAX));
  }

  // Labels from the most recently saved row, so a row left over from an older save never wins.
  function storedScoreRoundLabels(scoreRows) {
    const latest = (scoreRows || [])
      .map((row) => ({ labels: normalizeScoreRoundLabels(storedScoreBreakdown(row).roundLabels), at: Date.parse(row.updated_at || '') || 0 }))
      .filter((item) => item.labels)
      .sort((left, right) => right.at - left.at)[0];
    return latest ? latest.labels : Array(9).fill('');
  }

  // The score page's label chips (spa-main.js) keep the edited labels on the term's table.
  function legacyScoreRoundLabels(termId) {
    const documentRef = global.document;
    if (!documentRef?.querySelector) return null;
    const containerId = termId === 'term2' || number(termId, 1) === 2
      ? '#scoreEntryTerm2Container'
      : '#scoreEntryTerm1Container';
    const table = documentRef.querySelector(`${containerId} table.score-entry-table`);
    const raw = typeof table?.getAttribute === 'function' ? table.getAttribute('data-round-labels') : '';
    if (!raw) return null;
    try { return normalizeScoreRoundLabels(JSON.parse(raw)); } catch (_error) { return null; }
  }

  function enteredLegacyScoreStudentIds(termId) {
    const documentRef = global.document;
    if (!documentRef?.querySelector) return null;
    const containerId = termId === 'term2' || number(termId, 1) === 2
      ? '#scoreEntryTerm2Container'
      : '#scoreEntryTerm1Container';
    const container = documentRef.querySelector(containerId);
    if (!container) return null;
    const entered = new Set();
    container.querySelectorAll('tbody tr[data-student-id]').forEach((row) => {
      const studentId = text(row.getAttribute('data-student-id')).trim();
      const hasInput = [...row.querySelectorAll('.score-entry-input, .score-entry-final-input')]
        .some((input) => text(input.value).trim() !== '');
      if (studentId && hasInput) entered.add(studentId);
    });
    return entered;
  }

  const RTW_SUBJECT_KEYS = ['thai', 'math', 'science', 'social', 'health', 'art', 'work', 'english'];

  function calculateSubjectScoreResult(scores) {
    const validScores = (scores || []).filter((s) => s !== '' && s !== null && s !== undefined && !isNaN(Number(s))).map(Number);
    if (validScores.length !== 8) return '-';
    const count0 = validScores.filter((s) => s === 0).length;
    const count3 = validScores.filter((s) => s === 3).length;
    const count2up = validScores.filter((s) => s >= 2).length;
    const hasBelow2 = validScores.some((s) => s < 2);

    if (count0 >= 2) return 'ไม่ผ่าน';
    if (count3 >= 6 && !hasBelow2) return 'ดีเยี่ยม';
    if (count2up >= 6 && count0 === 0) return 'ดี';
    return 'ผ่าน';
  }

  function calculateRTW5Result(scores) {
    const nums = (scores || []).filter((s) => s !== '' && s !== null && s !== undefined && !isNaN(Number(s))).map(Number);
    if (nums.length !== 5) return { avg: '-', text: '-' };
    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = sum / 5;
    let text = 'ปรับปรุง';
    if (avg >= 2.5) text = 'ดีเยี่ยม';
    else if (avg >= 2.0) text = 'ดี';
    else if (avg >= 1.0) text = 'ผ่าน';
    return { avg: avg.toFixed(2), text };
  }

  function assessmentStudent(student, scoreMap, prefix, count) {
    return {
      studentId: student.id,
      id: student.id,
      studentNumber: student.studentNumber,
      name: student.fullName,
      fullName: student.fullName,
      gender: student.gender,
      grade: student.grade,
      classNo: student.classNo,
      photoUrl: text(student.photoUrl || student.photo_url),
      scores: Array.from({ length: count }, (_, index) => {
        const value = scoreMap?.[`${prefix}${index + 1}`] ?? scoreMap?.[String(index + 1)];
        return value === undefined || value === null || value === '' ? '' : Number(value);
      })
    };
  }

  function assessmentNumericScore(value, maximum = 3) {
    if (value === null || value === undefined || text(value).trim() === '') return null;
    const score = Number(value);
    return Number.isInteger(score) && score >= 0 && score <= maximum ? score : null;
  }

  function assessmentCriteriaComplete(rows, type) {
    const counts = { rtw: 5, characteristic: 8, competency: 25, subject_rtw: 8, activity: 5 };
    const prefixes = { rtw: 'rtw', characteristic: 'c', competency: 'cp', subject_rtw: 'srtw', activity: 'act' };
    const count = counts[type];
    if (!count) return false;
    const values = new Map();
    for (const row of rows) {
      const key = text(row.criteria_code);
      let index = -1;
      if (type === 'subject_rtw') index = RTW_SUBJECT_KEYS.indexOf(key);
      if (type === 'activity') index = ACTIVITY_KEYS.indexOf(key);
      if (index < 0) {
        const match = key.match(new RegExp(`^(?:${prefixes[type]})?(\\d+)$`));
        if (match) index = Number(match[1]) - 1;
      }
      if (index < 0 || index >= count) continue;
      const score = assessmentNumericScore(row.score, type === 'activity' ? 1 : 3);
      // Conflicting aliases or invalid scores must not be counted as complete.
      if (score === null || (values.has(index) && values.get(index) !== score)) return false;
      values.set(index, score);
    }
    return values.size === count;
  }

  function activityOverallResult(rows) {
    const status = (value) => {
      const label = text(value).trim().toLowerCase();
      if (['ผ่าน', 'ผ', 'pass'].includes(label)) return 1;
      if (['ไม่ผ่าน', 'มผ', 'fail'].includes(label)) return 0;
      return assessmentNumericScore(value, 1);
    };
    const explicit = rows.filter((row) => ['overall', 'act5', '5'].includes(text(row.criteria_code)));
    if (explicit.length) {
      const results = explicit.map((row) => status(row.score ?? row.result));
      return results.every((value) => value !== null && value === results[0]) ? results[0] : null;
    }
    const results = ACTIVITY_KEYS.slice(0, 4).map((key, index) => {
      const matches = rows.filter((row) => [key, `act${index + 1}`, String(index + 1)].includes(text(row.criteria_code)));
      if (!matches.length) return null;
      const values = matches.map((row) => status(row.score ?? row.result));
      return values.every((value) => value !== null && value === values[0]) ? values[0] : null;
    });
    return results.some((value) => value === null) ? null : (results.every((value) => value === 1) ? 1 : 0);
  }

  async function loadAssessment(type, prefix, count, grade, classNo, semester = 1, academicYear) {
    const year = text(academicYear || await currentYear());
    const students = await data.students.list({ grade, room: classNo, academicYear: year });
    const rows = await data.assessments.list(type, semester, students.map((student) => student.id), year);
    const grouped = {};
    rows.forEach((row) => {
      grouped[row.student_id] ||= {};
      grouped[row.student_id][row.criteria_code] = row.score;
    });
    return students.map((student) => assessmentStudent(student, grouped[student.id], prefix, count));
  }

  async function saveAssessment(type, prefix, payload, defaultSemester = 1) {
    const list = Array.isArray(payload) ? payload : (payload?.students || payload?.records || []);
    const year = text(payload?.academicYear || payload?.academic_year || await currentYear());
    const semester = number(payload?.semester, defaultSemester);
    const rows = [];
    // ค่าที่ว่าง (= ยังไม่ประเมิน) ต้อง "ลบแถวเดิม" ไม่ใช่ข้ามไปเฉย ๆ ไม่งั้นผู้ใช้ล้างค่าไม่ได้เลย
    const clears = [];
    list.forEach((student) => {
      const studentId = text(student.studentId || student.student_id || student.id);
      const rawScores = student.scores ?? student.criteria ?? student.values ?? {};
      const collect = (criteriaCode, score) => {
        if (score === '' || score === null || score === undefined) {
          if (studentId) clears.push({ studentId, criteriaCode });
          return;
        }
        rows.push({ studentId, assessmentType: type, criteriaCode, score: Number(score), academicYear: year, semester });
      };
      if (Array.isArray(rawScores)) {
        rawScores.forEach((score, index) => collect(`${prefix}${index + 1}`, score));
      } else if (typeof rawScores === 'object' && rawScores !== null) {
        Object.entries(rawScores).forEach(([criteriaCode, score]) => collect(criteriaCode, score));
      }
    });
    if (rows.length) await data.assessments.save(rows);
    let cleared = 0;
    if (clears.length) cleared = (await data.assessments.clear({ type, academicYear: year, semester, keys: clears })).length;
    return { success: true, message: `บันทึกผลประเมิน ${rows.length} รายการ${cleared ? ` ล้างค่าเดิม ${cleared} รายการ` : ''}`, saved: rows.length, cleared };
  }

  async function loadSubjectScoreAssessment(grade, classNo, semester = 1, academicYear) {
    const year = text(academicYear || await currentYear());
    const students = await data.students.list({ grade, room: classNo, academicYear: year });
    const rows = await data.assessments.list('subject_rtw', semester, students.map((student) => student.id), year);
    const grouped = {};
    rows.forEach((row) => {
      grouped[row.student_id] ||= {};
      grouped[row.student_id][row.criteria_code] = row.score;
    });
    return students.map((student) => {
      const studentScores = grouped[student.id] || {};
      const scores = {};
      RTW_SUBJECT_KEYS.forEach((key, index) => {
        const val = studentScores[key] ?? studentScores[`srtw${index + 1}`] ?? '';
        scores[key] = val !== '' && val !== null && val !== undefined ? Number(val) : '';
      });
      return {
        id: student.id,
        studentId: student.id,
        studentNumber: student.studentNumber,
        name: student.fullName,
        fullName: student.fullName,
        gender: student.gender,
        grade: student.grade,
        classNo: student.classNo,
        photoUrl: text(student.photoUrl || student.photo_url),
        scores
      };
    });
  }

  async function saveSubjectScoreAssessment(payload, defaultSemester = 1) {
    const list = Array.isArray(payload) ? payload : (payload?.records || payload?.students || []);
    const year = text(payload?.academicYear || payload?.academic_year || await currentYear());
    const semester = number(payload?.semester, defaultSemester);
    const rows = [];
    const clears = [];
    list.forEach((student) => {
      const studentId = text(student.studentId || student.student_id || student.id);
      const scores = student.scores || {};
      const collect = (criteriaCode, score) => {
        if (!studentId || !criteriaCode) return;
        if (score === '' || score === null || score === undefined) {
          clears.push({ studentId, criteriaCode });
          return;
        }
        rows.push({ studentId, assessmentType: 'subject_rtw', criteriaCode, score: Number(score), academicYear: year, semester });
      };
      if (Array.isArray(scores)) {
        scores.forEach((score, index) => {
          collect(RTW_SUBJECT_KEYS[index] || `srtw${index + 1}`, score);
        });
      } else if (typeof scores === 'object' && scores !== null) {
        Object.entries(scores).forEach(([subjectKey, score]) => {
          collect(subjectKey, score);
        });
      }
    });
    if (rows.length) await data.assessments.save(rows);
    let cleared = 0;
    if (clears.length) cleared = (await data.assessments.clear({ type: 'subject_rtw', academicYear: year, semester, keys: clears })).length;
    return { success: true, message: `บันทึกสำเร็จ: อัปเดต ${list.length} คน (${rows.length} รายการ)${cleared ? ` ล้างค่าเดิม ${cleared} รายการ` : ''}`, saved: rows.length, cleared };
  }

  async function generateSubjectScorePdf(grade, classNo, sortMode) {
    const students = await loadSubjectScoreAssessment(grade, classNo);
    if (!students.length) throw new Error('ไม่พบข้อมูลนักเรียน');
    const sorted = [...students].sort((a, b) => {
      if (sortMode === 'gender') {
        const aMale = /ชาย|^นาย/.test(text(a.gender || a.name));
        const bMale = /ชาย|^นาย/.test(text(b.gender || b.name));
        if (aMale !== bMale) return aMale ? -1 : 1;
      }
      return text(a.studentId).localeCompare(text(b.studentId), undefined, { numeric: true });
    });
    const options = await attendancePrintOptions(grade, classNo, 'อ่าน คิดวิเคราะห์ และเขียน');
    if (global.PP5PDF?.createSubjectRtwReport) {
      const result = await global.PP5PDF.createSubjectRtwReport({ grade, classNo, students: sorted }, options);
      return typeof result === 'object' && result?.dataUri ? result.dataUri : (typeof result === 'object' && result?.blobUrl ? result.blobUrl : result);
    }
    return classPrintResult('ผลประเมินอ่าน คิด เขียนรายวิชา', grade, classNo);
  }

  async function generateCharacteristicPdf(grade, classNo, sortMode) {
    const students = await loadAssessment('characteristic', 'c', 8, grade, classNo);
    if (!students.length) throw new Error('ไม่พบข้อมูลนักเรียน');
    const sorted = [...students].sort((a, b) => {
      if (sortMode === 'gender') {
        const aMale = /ชาย|^นาย/.test(text(a.gender || a.name));
        const bMale = /ชาย|^นาย/.test(text(b.gender || b.name));
        if (aMale !== bMale) return aMale ? -1 : 1;
      }
      return text(a.studentId).localeCompare(text(b.studentId), undefined, { numeric: true });
    });
    const options = await attendancePrintOptions(grade, classNo, 'คุณลักษณะอันพึงประสงค์');
    if (global.PP5PDF?.createCharacteristicReport) {
      const result = await global.PP5PDF.createCharacteristicReport({ grade, classNo, students: sorted }, options);
      return typeof result === 'object' && result?.dataUri ? result.dataUri : (typeof result === 'object' && result?.blobUrl ? result.blobUrl : result);
    }
    return classPrintResult('ผลประเมินคุณลักษณะ', grade, classNo);
  }

  const ACTIVITY_KEYS = ['guidance', 'scout', 'club', 'social', 'overall'];

  async function loadActivityAssessment(grade, classNo, semester = 1, academicYear) {
    const year = text(academicYear || await currentYear());
    const students = await data.students.list({ grade, room: classNo, academicYear: year });
    const rows = await data.assessments.list('activity', semester, students.map((student) => student.id), year);
    const grouped = {};
    // ชื่อชุมนุมเก็บในช่อง note ของแถว club (migration 202610060022)
    const clubNames = {};
    rows.forEach((row) => {
      grouped[row.student_id] ||= {};
      grouped[row.student_id][row.criteria_code] = row.score;
      if ((row.criteria_code === 'club' || row.criteria_code === 'act3') && text(row.note).trim()) {
        clubNames[row.student_id] = text(row.note).trim();
      }
    });
    return students.map((student) => {
      const studentMap = grouped[student.id] || {};
      const guidanceVal = studentMap.guidance ?? studentMap.act1;
      const scoutVal = studentMap.scout ?? studentMap.act2;
      const clubVal = studentMap.club ?? studentMap.act3;
      const socialVal = studentMap.social ?? studentMap.act4;
      const overallVal = studentMap.overall ?? studentMap.act5;

      const toStatus = (v) => v === 1 || v === '1' || v === 'ผ่าน' ? 'ผ่าน' : (v === 0 || v === '0' || v === 'ไม่ผ่าน' ? 'ไม่ผ่าน' : '');

      const guidance = toStatus(guidanceVal);
      const scout = toStatus(scoutVal);
      const club = toStatus(clubVal);
      const social = toStatus(socialVal);
      let overall = toStatus(overallVal);
      if (!overall && guidance && scout && club && social) {
        overall = [guidance, scout, club, social].every((s) => s === 'ผ่าน') ? 'ผ่าน' : 'ไม่ผ่าน';
      }

      return {
        id: student.id,
        studentId: student.id,
        studentNumber: student.studentNumber,
        name: student.fullName,
        fullName: student.fullName,
        gender: student.gender,
        grade: student.grade,
        classNo: student.classNo,
        photoUrl: text(student.photoUrl || student.photo_url),
        activities: {
          guidance,
          scout,
          club,
          clubName: clubNames[student.id] || '',
          social,
          overall
        }
      };
    });
  }

  async function saveActivityAssessment(payload, defaultSemester = 1) {
    const list = Array.isArray(payload) ? payload : (payload?.records || payload?.students || []);
    const year = text(payload?.academicYear || payload?.academic_year || await currentYear());
    const semester = number(payload?.semester, defaultSemester);
    const rows = [];
    // "ยังไม่ประเมิน" ต้องลบแถวเดิมด้วย (ฝั่ง save ปฏิเสธค่า null จึงข้ามไม่ได้)
    const clears = [];

    const toScore = (v) => v === 'ผ่าน' || v === 1 || v === '1' ? 1 : (v === 'ไม่ผ่าน' || v === 0 || v === '0' ? 0 : null);

    list.forEach((student) => {
      const studentId = text(student.studentId || student.student_id || student.id);
      const act = student.activities || {};
      ACTIVITY_KEYS.forEach((key) => {
        const val = act[key];
        const score = toScore(val);
        if (score !== null) {
          const row = { studentId, assessmentType: 'activity', criteriaCode: key, score, academicYear: year, semester };
          // ชื่อชุมนุมติดไปกับแถว club ช่องว่าง = ลบชื่อเดิม
          if (key === 'club') row.note = text(act.clubName).trim() || null;
          rows.push(row);
        } else if (studentId) {
          clears.push({ studentId, criteriaCode: key });
        }
      });
    });

    if (rows.length) await data.assessments.save(rows);
    let cleared = 0;
    if (clears.length) cleared = (await data.assessments.clear({ type: 'activity', academicYear: year, semester, keys: clears })).length;
    return { success: true, message: `บันทึกสำเร็จ: อัปเดต ${list.length} คน (${rows.length} รายการ)${cleared ? ` ล้างค่าเดิม ${cleared} รายการ` : ''}`, saved: rows.length, cleared };
  }

  // ล้างผลประเมินที่บันทึกไว้ของทั้งชั้น/ห้อง (คืนค่าเป็น "ยังไม่ประเมิน")
  // ใช้เมื่อต้องการรีเซ็ตผลของกิจกรรม/วิชานั้น ๆ ทั้งห้อง — เรียกคืนไม่ได้
  async function clearAssessmentBatch(payload) {
    const type = text(payload?.type || payload?.assessmentType);
    const grade = text(payload?.grade);
    const classNo = text(payload?.classNo);
    const semester = number(payload?.semester, 1);
    const year = text(payload?.academicYear || await currentYear());
    if (!grade || !classNo) throw new Error('กรุณาเลือกระดับชั้นและห้องเรียนก่อนล้างค่า');

    const loaders = {
      characteristic: () => loadAssessment('characteristic', 'c', 8, grade, classNo, semester, year),
      competency: () => loadAssessment('competency', 'cp', 25, grade, classNo, semester, year),
      rtw: () => loadAssessment('rtw', 'rtw', 5, grade, classNo, semester, year),
      activity: () => loadActivityAssessment(grade, classNo),
      subject_rtw: () => loadSubjectScoreAssessment(grade, classNo, semester, year)
    };
    const loader = loaders[type];
    if (!loader) throw new Error('ไม่รู้จักประเภทผลประเมินที่ต้องการล้างค่า');

    const students = await loader();
    const studentIds = students.map((student) => text(student.studentId || student.id)).filter(Boolean);
    if (!studentIds.length) return { success: true, cleared: 0, message: `ไม่พบนักเรียนในชั้น ${grade} ห้อง ${classNo}` };

    const removed = await data.assessments.clear({
      type,
      studentIds,
      academicYear: year,
      semester,
      criteriaCode: text(payload?.criteriaCode) || undefined
    });
    return {
      success: true,
      cleared: removed.length,
      message: removed.length
        ? `ล้างผลประเมินที่บันทึกไว้ ${removed.length} รายการ (${students.length} คน)`
        : `ไม่พบผลประเมินที่บันทึกไว้ของชั้น ${grade} ห้อง ${classNo}`
    };
  }

  async function generateActivityPdf(grade, classNo, sortMode) {
    const students = await loadActivityAssessment(grade, classNo);
    if (!students.length) throw new Error('ไม่พบข้อมูลนักเรียน');
    const sorted = [...students].sort((a, b) => {
      if (sortMode === 'gender') {
        const aMale = /ชาย|^นาย/.test(text(a.gender || a.name));
        const bMale = /ชาย|^นาย/.test(text(b.gender || b.name));
        if (aMale !== bMale) return aMale ? -1 : 1;
      }
      return text(a.studentId).localeCompare(text(b.studentId), undefined, { numeric: true });
    });
    const options = await attendancePrintOptions(grade, classNo, 'กิจกรรมพัฒนาผู้เรียน');
    if (global.PP5PDF?.createActivityReport) {
      const result = await global.PP5PDF.createActivityReport({ grade, classNo, students: sorted }, options);
      return typeof result === 'object' && result?.dataUri ? result.dataUri : (typeof result === 'object' && result?.blobUrl ? result.blobUrl : result);
    }
    return classPrintResult('ผลประเมินกิจกรรมพัฒนาผู้เรียน', grade, classNo);
  }

  async function generateCompetencyDetailedPdf(grade, classNo, sortMode) {
    const students = await loadAssessment('competency', 'cp', 25, grade, classNo);
    if (!students.length) throw new Error('ไม่พบข้อมูลนักเรียน');
    const sorted = [...students].sort((a, b) => {
      if (sortMode === 'gender') {
        const aMale = /ชาย|^นาย/.test(text(a.gender || a.name));
        const bMale = /ชาย|^นาย/.test(text(b.gender || b.name));
        if (aMale !== bMale) return aMale ? -1 : 1;
      }
      return text(a.studentId).localeCompare(text(b.studentId), undefined, { numeric: true });
    });
    const options = await attendancePrintOptions(grade, classNo, 'สมรรถนะสำคัญของผู้เรียน');
    if (global.PP5PDF?.createCompetencyReport) {
      const result = await global.PP5PDF.createCompetencyReport({ grade, classNo, students: sorted }, options);
      return typeof result === 'object' && result?.dataUri ? result.dataUri : (typeof result === 'object' && result?.blobUrl ? result.blobUrl : result);
    }
    return classPrintResult('รายงานสมรรถนะ', grade, classNo);
  }

  async function generateCompetencySummaryPdf(grade, classNo) {
    const students = await loadAssessment('competency', 'cp', 25, grade, classNo);
    if (!students.length) throw new Error('ไม่พบข้อมูลนักเรียน');
    const options = await attendancePrintOptions(grade, classNo, 'สรุปผลการประเมินสมรรถนะสำคัญ');
    if (global.PP5PDF?.createCompetencySummaryReport) {
      const result = await global.PP5PDF.createCompetencySummaryReport({ grade, classNo, students }, options);
      return typeof result === 'object' && result?.dataUri ? result.dataUri : (typeof result === 'object' && result?.blobUrl ? result.blobUrl : result);
    }
    return classPrintResult('สรุปสมรรถนะ', grade, classNo);
  }

  async function computePp5CoverSummary(grade, classNo, students, requestedYear) {
    const studentCount = students.length;
    const studentIds = students.map((s) => text(s.id));
    const settings = await data.settings.get();
    const academicYear = text(requestedYear || settings.academicYear || settings.academic_year || '2569');

    // 1. Subjects & Score counts
    let allSubjects = [];
    try { allSubjects = await data.subjects.list(grade); } catch (e) { allSubjects = []; }
    const actKeywords = ['กิจกรรม', 'แนะแนว', 'ลูกเสือ', 'เนตรนารี', 'ชุมนุม', 'เพื่อสังคม', 'ชมรม'];
    const coverOrder = ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์', 'เทคโนโลยี', 'สังคมศึกษา', 'ประวัติศาสตร์', 'สุขศึกษา', 'ศิลปะ', 'การงาน', 'ภาษาอังกฤษ', 'หน้าที่พลเมือง', 'การป้องกัน'];

    const filteredSubjects = (allSubjects || []).filter((s) => !actKeywords.some((k) => text(s.name || s.subjectName).includes(k))).sort((a, b) => {
      const na = text(a.name || a.subjectName);
      const nb = text(b.name || b.subjectName);
      let ia = -1, ib = -1;
      for (let k = 0; k < coverOrder.length; k++) {
        if (na.includes(coverOrder[k])) ia = k;
        if (nb.includes(coverOrder[k])) ib = k;
      }
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return na.localeCompare(nb, 'th');
    });

    const subjectSummary = [];
    for (const sub of filteredSubjects) {
      const count = { '4': 0, '3.5': 0, '3': 0, '2.5': 0, '2': 0, '1.5': 0, '1': 0, '0': 0 };
      try {
        const rows = await scoreRowsForSubject(sub.id, academicYear, studentIds);
        const rowMap = {};
        rows.forEach((r) => {
          const sid = text(r.student_id || r.studentId);
          rowMap[`${sid}_${r.semester}`] = r;
        });

        count.pending = 0;
        studentIds.forEach((sid) => {
          const result = pp5YearEndResult(rowMap[`${sid}_1`], rowMap[`${sid}_2`], sub);
          if (result.status === 'complete' && count[result.grade] !== undefined) count[result.grade]++;
          else count.pending++;
        });
      } catch (e) {
        // A failed read is not evidence that every student failed the subject.
        throw e;
      }
      subjectSummary.push({
        id: sub.id,
        code: text(sub.code || sub.subjectCode),
        name: text(sub.name || sub.subjectName),
        count
      });
    }

    // ผลประเมินอ่านฯ / คุณลักษณะ / กิจกรรม เป็นผลประจำปี: หน้าบันทึกทั้งสามไม่มีตัวเลือกภาคเรียน
    // จึงเก็บไว้ในช่อง semester = 1 เสมอ  นักเรียนที่ยังประเมินไม่ครบนับเป็น "ยังไม่ประเมิน" (pending)
    const assessed = await loadPp5YearAssessments(grade, classNo, academicYear);

    // 2. Reading (RTW)
    const reading = { level3: 0, level2: 0, level1: 0, level0: 0, pending: 0 };
    assessed.rtw.students.forEach((s) => {
      const sc = s.scores || {};
      const valid = [sc.thai, sc.math, sc.science, sc.social, sc.health, sc.art, sc.work, sc.english].filter((v) => v !== '' && v !== null && !isNaN(Number(v))).map(Number);
      if (valid.length !== 8) { reading.pending++; return; }
      const count0 = valid.filter((v) => v === 0).length;
      const count3 = valid.filter((v) => v === 3).length;
      const count2up = valid.filter((v) => v >= 2).length;
      const hasBelow2 = valid.some((v) => v < 2);
      if (count0 >= 2) reading.level0++;
      else if (count3 >= 6 && !hasBelow2) reading.level3++;
      else if (count2up >= 6 && count0 === 0) reading.level2++;
      else reading.level1++;
    });

    // 3. Characteristic
    const attributes = { 'ดีเยี่ยม': 0, 'ดี': 0, 'ผ่าน': 0, 'ไม่ผ่าน': 0, pending: 0 };
    assessed.characteristic.students.forEach((s) => {
      const valid = (s.scores || []).filter((v) => v !== '' && v !== null && !isNaN(Number(v))).map(Number);
      if (valid.length !== 8) { attributes.pending++; return; }
      const avg = valid.reduce((a, b) => a + b, 0) / 8;
      if (avg >= 2.5) attributes['ดีเยี่ยม']++;
      else if (avg >= 2.0) attributes['ดี']++;
      else if (avg >= 1.0) attributes['ผ่าน']++;
      else attributes['ไม่ผ่าน']++;
    });

    // 4. Activity
    const activity = { 'ผ่าน': 0, 'ไม่ผ่าน': 0 };
    assessed.activity.students.forEach((s) => {
      const overall = s.activities?.overall;
      if (overall === 'ผ่าน') activity['ผ่าน']++;
      else if (overall === 'ไม่ผ่าน') activity['ไม่ผ่าน']++;
    });

    // Students loaded by the assessment readers may differ from the passed-in list only if
    // the roster query failed; anyone not returned at all is still "not yet assessed".
    reading.pending += Math.max(0, studentCount - assessed.rtw.students.length);
    attributes.pending += Math.max(0, studentCount - assessed.characteristic.students.length);

    return {
      studentCount,
      subjectSummary,
      reading,
      attributes,
      activity
    };
  }

  // ผลประเมินประจำปีสำหรับ ปพ.5 (ช่อง semester = 1 ซึ่งเป็นที่ที่หน้าบันทึกผลประเมินเก็บไว้เสมอ)
  async function loadPp5YearAssessments(grade, classNo, academicYear) {
    const safe = async (load) => { try { return { students: await load() }; } catch (e) { return { students: [] }; } };
    const [rtw, characteristic, activity, competency] = await Promise.all([
      safe(() => loadSubjectScoreAssessment(grade, classNo, 1, academicYear)),
      safe(() => loadAssessment('characteristic', 'c', 8, grade, classNo, 1, academicYear)),
      safe(() => loadActivityAssessment(grade, classNo, 1, academicYear)),
      safe(() => loadAssessment('competency', 'cp', 25, grade, classNo, 1, academicYear))
    ]);
    return { rtw, characteristic, activity, competency };
  }

  async function generatePp5CoverPdf(grade, classNo) {
    const students = await data.students.list({ grade, room: classNo });
    if (!students.length) throw new Error('ไม่พบข้อมูลนักเรียน');
    const coverSummary = await computePp5CoverSummary(grade, classNo, students);
    const options = await attendancePrintOptions(grade, classNo, 'ปก ปพ.5 รวมวิชา');
    if (global.PP5PDF?.createPp5Cover) {
      const result = await global.PP5PDF.createPp5Cover({ grade, classNo, students, ...coverSummary }, options);
      return typeof result === 'object' && result?.blobUrl ? result.blobUrl : (typeof result === 'object' && result?.dataUri ? result.dataUri : result);
    }
    return classPrintResult('ปก ปพ.5', grade, classNo);
  }

  async function loadAllMonthlyDailyAttendance(grade, classNo, academicYear, students) {
    const range = academicYearDateRange(academicYear);
    const months = academicYearMonths(range.academicYear);
    const { rows } = await readClassAttendanceRange(grade, classNo, range.first, range.last, range.academicYear);
    const thaiDOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

    const monthlyList = [];
    for (const month of months) {
      const [yStr, mStr] = month.key.split('-');
      const yCE = Number(yStr);
      const mIdx = Number(mStr) - 1;
      const totalDaysInMonth = new Date(yCE, mIdx + 1, 0).getDate();

      const monthRows = rows.filter((r) => text(r.attendance_date).startsWith(month.key));
      const activeDates = [...new Set(monthRows.map((r) => text(r.attendance_date)))].sort();
      if (!activeDates.length) continue;

      const days = activeDates.map((dateStr) => {
        const dNum = parseInt(dateStr.split('-')[2], 10);
        const dow = thaiDOW[new Date(yCE, mIdx, dNum).getDay()];
        return { label: String(dNum), dow, date: dateStr };
      });

      const studentData = students.map((s) => {
        const sid = text(s.id);
        const sRows = monthRows.filter((r) => text(r.student_id) === sid);
        const statusMap = {};
        sRows.forEach((r) => {
          const dNum = String(parseInt(text(r.attendance_date).split('-')[2], 10));
          const st = text(r.status);
          statusMap[dNum] = st === 'present' || st === '/' || st === '1' || st === 'ม' ? '✓'
            : st === 'leave' || st === 'ล' ? 'ล'
            : st === 'absent' || st === 'ข' || st === '0' ? 'ข'
            : '';
        });
        return {
          id: text(s.student_code || s.code || s.id),
          name: studentDisplayName(s),
          statusMap
        };
      });

      const mNum = mIdx + 1;
      const semester = (mNum >= 5 && mNum <= 10) ? 'ภาคเรียนที่ 1' : 'ภาคเรียนที่ 2';

      monthlyList.push({
        grade,
        classNo,
        monthName: month.monthName,
        yearBE: month.yearBE,
        academicYear: String(range.academicYear),
        semester,
        actualSchoolDays: days.length,
        totalDaysInMonth,
        days,
        students: studentData
      });
    }
    return monthlyList;
  }

  async function computeSemesterAttendanceSummary(grade, classNo, semester = 1, academicYear) {
    const normalizedYear = normalizeAcademicYearBE(academicYear);
    const baseYearCE = normalizedYear - 543;
    const start = Number(semester) === 2 ? `${baseYearCE}-11-01` : `${baseYearCE}-05-01`;
    const end = Number(semester) === 2 ? `${baseYearCE + 1}-03-31` : `${baseYearCE}-10-31`;
    const { students, rows } = await readClassAttendanceRange(grade, classNo, start, end, normalizedYear);
    return summarizeAttendanceRows(students, rows, true);
  }

  async function computeMonthlyAttendanceMatrix(grade, classNo, academicYear) {
    const range = academicYearDateRange(academicYear);
    const months = academicYearMonths(range.academicYear);
    const { students, rows } = await readClassAttendanceRange(grade, classNo, range.first, range.last, range.academicYear);
    const rowsByStudent = groupBy(rows, (row) => text(row.student_id));
    const matrixStudents = students.map((student) => {
      const studentRows = rowsByStudent.get(text(student.id)) || [];
      const monthMap = {};
      let totalPresent = 0;
      let totalDays = 0;
      months.forEach((month) => {
        const mRows = studentRows.filter((r) => text(r.attendance_date).startsWith(month.key));
        const p = mRows.filter((r) => r.status === 'present' || r.status === '/' || r.status === '1' || r.status === 'ม').length;
        const l = mRows.filter((r) => r.status === 'leave' || r.status === 'ล').length;
        const ab = mRows.filter((r) => r.status === 'absent' || r.status === 'ข' || r.status === '0').length;
        const tot = p + l + ab;
        monthMap[month.shortName] = p;
        totalPresent += p;
        totalDays += tot;
      });
      const pct = totalDays > 0 ? ((totalPresent / totalDays) * 100).toFixed(1) : '0.0';
      return {
        id: text(student.id),
        name: studentDisplayName(student),
        monthMap,
        totalPresent,
        totalDays,
        percentage: pct
      };
    });
    return {
      grade,
      classNo,
      academicYear: String(range.academicYear),
      months: months.map((m) => m.shortName),
      students: matrixStudents
    };
  }

  async function generatePp5FullBookPdf(grade, classNo, partsJson, requestedYear) {
    const students = await data.students.list({ grade, room: classNo, ...(requestedYear ? { academicYear: requestedYear, active: false } : {}) });
    if (!students.length) throw new Error('ไม่พบข้อมูลนักเรียน');
    let parts = { part1: true, part2: true, part3: true };
    if (typeof partsJson === 'string' && partsJson.trim()) {
      try { parts = JSON.parse(partsJson); } catch (e) {}
    } else if (typeof partsJson === 'object' && partsJson !== null) {
      parts = partsJson;
    }

    const settings = await data.settings.get();
    const academicYear = text(requestedYear || settings.academicYear || settings.academic_year || '2569');
    const options = await attendancePrintOptions(grade, classNo, '', academicYear);

    let coverSummary = { studentCount: students.length, subjectSummary: [], reading: {}, attributes: {}, activity: {} };
    let attendance1 = [];
    let attendance2 = [];
    let yearlyAttendance = null;
    let monthlyDailyAttendance = [];
    if (parts.part1) {
      try { coverSummary = await computePp5CoverSummary(grade, classNo, students, academicYear); } catch (e) {}
      try { attendance1 = await computeSemesterAttendanceSummary(grade, classNo, 1, academicYear); } catch (e) { attendance1 = []; }
      try { attendance2 = await computeSemesterAttendanceSummary(grade, classNo, 2, academicYear); } catch (e) { attendance2 = []; }
      try { yearlyAttendance = await computeMonthlyAttendanceMatrix(grade, classNo, academicYear); } catch (e) { yearlyAttendance = null; }
      try { monthlyDailyAttendance = await loadAllMonthlyDailyAttendance(grade, classNo, academicYear, students); } catch (e) { monthlyDailyAttendance = []; }
    }

    let subjects = [];
    let gradeSummary = null;
    const subjectScoresMap = {};
    if (parts.part2) {
      try {
        const allSubjects = await data.subjects.list(grade);
        subjects = academicScoreSubjects(allSubjects);
        const studentIds = students.map((s) => text(s.id));
        for (const sub of subjects) {
          try {
            const rows = await scoreRowsForSubject(sub.id, academicYear, studentIds);
            subjectScoresMap[sub.id] = rows;
          } catch (e) {
            subjectScoresMap[sub.id] = [];
          }
        }
      } catch (e) {
        subjects = [];
      }
      try { gradeSummary = await server.getStudentScoresForWeb(grade, classNo, { yearEndOnly: true, academicYear }); } catch (e) { gradeSummary = null; }
    }

    let characteristic = [];
    let activity = [];
    let rtw = [];
    let competency = [];
    if (parts.part3) {
      // Same yearly records as the cover page, so every page of the book agrees.
      const assessed = await loadPp5YearAssessments(grade, classNo, academicYear);
      characteristic = assessed.characteristic.students;
      activity = assessed.activity.students;
      rtw = assessed.rtw.students;
      competency = assessed.competency.students;
    }

    const fullBookPayload = {
      grade,
      classNo,
      academicYear,
      students,
      parts,
      ...coverSummary,
      attendance1,
      attendance2,
      yearlyAttendance,
      monthlyDailyAttendance,
      subjects,
      subjectScoresMap,
      gradeSummary,
      characteristic,
      activity,
      rtw,
      competency
    };

    if (global.PP5PDF?.createPp5FullBook) {
      const result = await global.PP5PDF.createPp5FullBook(fullBookPayload, options);
      return typeof result === 'object' && result?.blobUrl ? result.blobUrl : (typeof result === 'object' && result?.dataUri ? result.dataUri : result);
    }
    return classPrintResult('เอกสารประจำชั้น', grade, classNo);
  }

  async function lookupHomeroomTeacher(grade, classNo, academicYear) {
    const year = text(academicYear || await currentYear());
    const rows = await optionalTable('teacher_assignments', (query) => query.eq('grade', grade).eq('room', text(classNo || '1')).eq('academic_year', year).limit(1));
    return rows[0]?.teacher_name || '';
  }

  // Only explicit saved criteria produce an official assessment result.
  // School policy: ยึดผลการประเมินของภาคเรียนที่ 2 เป็นผลตัดสินสิ้นปีการศึกษา (term === 'year')
  function reportAssessmentSummary(rows, term) {
    const annual = !['1', '2'].includes(String(term));
    const pending = 'ยังไม่ประเมิน';
    let selected = [];
    if (annual) {
      const term2Rows = (rows || []).filter((row) => Number(row.semester) === 2);
      selected = term2Rows.length
        ? term2Rows
        : (rows || []).filter((row) => row.semester === 'year' || row.semester === 0 || row.semester === '0');
    } else {
      selected = (rows || []).filter((row) => Number(row.semester) === Number(term));
    }
    const byType = (type) => selected.filter((row) => row.assessment_type === type);
    const gradeQuality = (value) => {
      if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 3) return pending;
      return Number(value) >= 2.5 ? 'ดีเยี่ยม' : Number(value) >= 2 ? 'ดี' : Number(value) >= 1 ? 'ผ่าน' : 'ปรับปรุง';
    };
    const criteriaValues = (type, codes) => {
      const typeRows = byType(type);
      return codes.map((aliases) => {
        const row = typeRows.find((item) => aliases.includes(text(item.criteria_code)));
        return row?.score === null || row?.score === undefined || row?.score === '' || !Number.isFinite(Number(row.score)) ? null : Number(row.score);
      });
    };
    const completeAverage = (values) => values.length && values.every((value) => value !== null && value >= 0 && value <= 3)
      ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const charValues = criteriaValues('characteristic', Array.from({ length: 8 }, (_, i) => ['c' + (i + 1), String(i + 1)]));
    const compValues = criteriaValues('competency', Array.from({ length: 25 }, (_, i) => ['cp' + (i + 1), String(i + 1)]));
    const rtwValues = criteriaValues('subject_rtw', RTW_SUBJECT_KEYS.map((key, i) => [key, 'srtw' + (i + 1), String(i + 1)]));
    let readingResult = pending;
    if (assessmentCriteriaComplete(byType('subject_rtw'), 'subject_rtw')) {
      const zeros = rtwValues.filter((v) => v === 0).length;
      readingResult = zeros >= 2 ? 'ปรับปรุง' : rtwValues.filter((v) => v === 3).length >= 6 && rtwValues.every((v) => v >= 2) ? 'ดีเยี่ยม' : rtwValues.filter((v) => v >= 2).length >= 6 && !zeros ? 'ดี' : 'ผ่าน';
    } else if (assessmentCriteriaComplete(byType('rtw'), 'rtw')) {
      readingResult = gradeQuality(completeAverage(criteriaValues('rtw', Array.from({ length: 5 }, (_, i) => ['rtw' + (i + 1), String(i + 1)]))));
    }
    const activityRows = byType('activity');
    const activityStatus = (value) => value === 1 || value === '1' || value === 'ผ่าน' ? 'ผ่าน' : value === 0 || value === '0' || value === 'ไม่ผ่าน' ? 'ไม่ผ่าน' : pending;
    const activityItems = ['guidance', 'scout', 'club', 'social'].map((key, i) => ({
      label: ['1. กิจกรรมแนะแนว', '2. ลูกเสือ-เนตรนารี', '3. ชุมนุม', '4. เพื่อสังคมและสาธารณประโยชน์'][i],
      val: activityStatus(activityRows.find((row) => [key, 'act' + (i + 1), String(i + 1)].includes(text(row.criteria_code)))?.score)
    }));
    const charLabels = ['1. รักชาติ ศาสน์ กษัตริย์', '2. ซื่อสัตย์สุจริต', '3. มีวินัย', '4. ใฝ่เรียนรู้', '5. อยู่อย่างพอเพียง', '6. มุ่งมั่นในการทำงาน', '7. รักความเป็นไทย', '8. มีจิตสาธารณะ'];
    const compLabels = ['1. ความสามารถในการสื่อสาร', '2. ความสามารถในการคิด', '3. ความสามารถในการแก้ปัญหา', '4. ความสามารถในการใช้ทักษะชีวิต', '5. ความสามารถในการใช้เทคโนโลยี'];
    return {
      reading: { items: [], result: readingResult },
      character: { items: charLabels.map((label, i) => ({ label, val: gradeQuality(charValues[i]) })), result: assessmentCriteriaComplete(byType('characteristic'), 'characteristic') ? gradeQuality(completeAverage(charValues)) : pending },
      activities: { items: activityItems, result: activityStatus(activityOverallResult(activityRows)) },
      competency: { items: compLabels.map((label, i) => ({ label, val: gradeQuality(completeAverage(compValues.slice(i * 5, i * 5 + 5))) })), result: assessmentCriteriaComplete(byType('competency'), 'competency') ? gradeQuality(completeAverage(compValues)) : pending }
    };
  }

  async function generatePp6Pdf(grade, classNo, studentIds, extraOptions) {
    const domTerm = typeof document !== 'undefined' && typeof document?.getElementById === 'function' ? document.getElementById('termSelector')?.value : null;
    const settings = await data.settings.get();
    const term = String(extraOptions?.term || domTerm || settings.semester || 'year');
    if (!['1', '2', 'year'].includes(term)) throw new Error('ภาคเรียนไม่ถูกต้อง');
    // owner 2026-10-11: ชั้น ม. ตัดสินผลรายภาคจบในภาค ปพ.6 จึงพิมพ์ได้เฉพาะภาคเรียนที่ 1 หรือ 2 (ไม่มีฉบับรวมทั้งปี)
    if (term === 'year' && semesterJudgedGrade_(grade)) {
      throw new Error(`ชั้น ${text(grade).trim()} ตัดสินผลการเรียนรายภาค: พิมพ์ ปพ.6 ได้เฉพาะภาคเรียนที่ 1 หรือภาคเรียนที่ 2`);
    }
    const showRank = extraOptions?.showRank !== false;
    const domFormat = typeof document !== 'undefined' && typeof document?.getElementById === 'function' ? document.getElementById('pp6ReportFormatSelector')?.value : null;
    const storedFormat = typeof localStorage !== 'undefined' && typeof localStorage?.getItem === 'function' ? localStorage.getItem('pp6_report_format') : null;
    const reportFormat = extraOptions?.reportFormat || (extraOptions?.format === 'booklet' ? 'booklet' : (extraOptions?.format === 'single' ? 'single' : (domFormat || storedFormat || 'single')));
    const academicYearVal = text(normalizeAcademicYearBE(extraOptions?.year || extraOptions?.academicYear || settings.academicYear || settings.academic_year));
    // ปพ.6 แบบมีคะแนน (menu "พิมพ์ ปพ.6 แบบมีคะแนน", owner 2026-10-09): column "คะแนนที่ได้" instead of
    // "หมายเหตุ". That page puts the hidden #pp6ScoreModeFlag in the page; callers can also pass withScores.
    const domScoreMode = typeof document !== 'undefined' && typeof document?.getElementById === 'function'
      ? document.getElementById('pp6ScoreModeFlag')?.value === '1' : false;
    const withScores = typeof extraOptions?.withScores === 'boolean' ? extraOptions.withScores : domScoreMode;

    let [allStudentsInClass, subjects] = await Promise.all([
      data.students.list({ grade, room: classNo, academicYear: academicYearVal, ...(extraOptions?.historical ? { active: false } : {}) }),
      data.subjects.list(grade)
    ]);
    if (!allStudentsInClass.length) throw new Error('ไม่พบข้อมูลนักเรียน');

    const classStudentIds = allStudentsInClass.map((s) => String(s.id));
    const range = academicYearDateRange(academicYearVal);

    const [classScoreRows, classAssessmentRows, homeroomTeacher, attendanceResult, growthRows, detailsRows, commentRows] = await Promise.all([
      optionalTable('scores', (query) => query.in('student_id', classStudentIds).eq('academic_year', academicYearVal)),
      optionalTable('assessments', (query) => query.in('student_id', classStudentIds).eq('academic_year', academicYearVal)),
      lookupHomeroomTeacher(grade, classNo, academicYearVal).catch(() => ''),
      readClassAttendanceRange(grade, classNo, range.first, range.last, range.academicYear).catch(() => ({ students: [], rows: [] })),
      optionalTable('student_growth', (query) => query
        .in('student_id', classStudentIds)
        .eq('academic_year', range.academicYear)
        .order('measured_on', { ascending: false })
        .order('updated_at', { ascending: false })).catch(() => []),
      optionalTable('student_details', (query) => query.in('student_id', classStudentIds)).catch(() => []),
      optionalTable('student_comments', (query) => query.in('student_id', classStudentIds).eq('academic_year', academicYearVal))
    ]);

    let targetStudents = allStudentsInClass;
    if (Array.isArray(studentIds) && studentIds.length) {
      const idSet = new Set(studentIds.map(String));
      targetStudents = allStudentsInClass.filter((s) =>
        idSet.has(String(s.id)) ||
        idSet.has(String(s.studentId || s.student_id)) ||
        idSet.has(String(s.studentNumber || s.student_number))
      );
    }
    if (!targetStudents.length) throw new Error('ไม่พบนักเรียนที่เลือกในห้องและปีการศึกษานี้');

    const scoreToGrade = (s) => {
      const n = Number(s);
      if (isNaN(n) || s === '' || s === null) return '-';
      return data.helpers.calculateGrade(n);
    };



    function getTypeRank(s) {
      const t = String(s.subject_type || s.type || '').trim();
      const name = String(s.name || '').trim();
      const code = String(s.code || '').trim();
      if (t.includes('กิจกรรม') || /^ก/.test(code) || /แนะแนว|ลูกเสือ|เนตรนารี|ชุมนุม|สาธารณประโยชน์/.test(name)) return 2;
      if (t.includes('เพิ่มเติม')) return 1;
      if (t.includes('พื้นฐาน')) return 0;
      // Same code rule as parentSubjectTypeRank_ (type digit 2 = เพิ่มเติม; ส12101 is พื้นฐาน).
      if (/^[^\d\s]+\d\d2/.test(code)) return 1;
      return 0;
    }

    // Same order as the subject manager (owner 2026-10-11): ม. ภาค 1 (พื้นฐาน, เพิ่มเติม, กิจกรรม) then ภาค 2, yearly after;
    // within a group the curriculum order, then the code (ภาษาไทย 1 before ภาษาไทย 2). Primary has no terms: unchanged.
    subjects = pp6SortSubjects_(subjects);
    // ภาคเรียนที่ 1 / 2: ไม่แสดงวิชารายภาคของอีกภาค (วิชารายปีแสดงเหมือนเดิม)
    subjects = subjects.filter((sub) => subjectInTerm_(sub, term));

    const getSubjectHours = (sub) => {
      if (sub.hours_per_year !== undefined && sub.hours_per_year !== null && sub.hours_per_year !== '') {
        return Number(sub.hours_per_year);
      }
      if (sub.periods_per_week !== undefined && sub.periods_per_week !== null && sub.periods_per_week !== '') return Number(sub.periods_per_week) * 40;
      if (sub.credit !== undefined && sub.credit !== null && sub.credit !== '') return Number(sub.credit) * 40;
      return null;
    };

    const getSubjectCredit = (sub) => {
      if (sub.credit !== undefined && sub.credit !== null && sub.credit !== '') {
        return Number(sub.credit);
      }
      const hours = getSubjectHours(sub);
      return hours === null ? null : hours / 40;
    };

    // A term counts (here and in the subject table below) only when it has a grade AND was really
    // entered: an old all-zero row the teacher never filled in is skipped, as in
    // "สรุปผลสัมฤทธิ์รายชั้น" (it used to become grade 0 here).
    // Calculate GPAs for all students based on the selected term/annual
    const studentGpaMap = {};
    const studentPctMap = {};
    allStudentsInClass.forEach((stu) => {
      let totalCredit = 0;
      let totalPoints = 0;
      let scoreSum = 0;
      let scoreCount = 0;
      subjects.forEach((sub) => {
        const isAct = getTypeRank(sub) === 2;
        if (isAct) return;
        const s1 = classScoreRows.find((r) => String(r.student_id) === String(stu.id) && String(r.subject_id) === String(sub.id) && Number(r.semester) === 1);
        const s2 = classScoreRows.find((r) => String(r.student_id) === String(stu.id) && String(r.subject_id) === String(sub.id) && Number(r.semester) === 2);
        // owner 2026-10-10: GPA นับเฉพาะวิชาที่สอบปลายภาคแล้ว (กติกาเดียวกับ ปพ.5)
        const term1Graded = dashboardCompleteScore_(s1);
        const term2Graded = dashboardCompleteScore_(s2);
        const t1 = term1Graded ? number(s1.total_score, 0) : '';
        const t2 = term2Graded ? number(s2.total_score, 0) : '';
        // ร / มส in the selected term (either term for the year result) is left out of the GPA.
        const special = String(term) === '1' ? storedSpecialGrade(s1)
          : String(term) === '2' ? storedSpecialGrade(s2) : (storedSpecialGrade(s1) || storedSpecialGrade(s2));
        if (special) return;

        let targetGrade = '';
        if (String(term) === '1') {
          if (term1Graded) targetGrade = storedFinalGrade(s1);
        } else if (String(term) === '2') {
          if (term2Graded) targetGrade = storedFinalGrade(s2);
        } else if (subjectSemester_(sub)) {
          const ownGraded = subjectSemester_(sub) === 2 ? term2Graded : term1Graded;
          if (ownGraded) targetGrade = storedFinalGrade(subjectSemester_(sub) === 2 ? s2 : s1);
        } else if (term1Graded && term2Graded) {
          targetGrade = scoreToGrade(yearlyScoreAverage(t1, t2, true, true));
        }

        if (targetGrade !== '' && targetGrade !== '-') {
          const gPoint = Number(targetGrade);
          const cr = getSubjectCredit(sub);
          if (Number.isFinite(gPoint) && Number.isFinite(cr) && cr > 0) {
            totalCredit += cr;
            totalPoints += gPoint * cr;
            // Score of this subject (term total, or the year average) for the ร้อยละ tie-break
            scoreSum += String(term) === '1' ? number(t1, 0) : String(term) === '2' ? number(t2, 0)
              : subjectSemester_(sub) ? number(subjectSemester_(sub) === 2 ? t2 : t1, 0) : yearlyScoreAverage(t1, t2, true, true);
            scoreCount += 1;
          }
        }
      });
      studentGpaMap[stu.id] = totalCredit > 0 ? totalPoints / totalCredit : null;
      studentPctMap[stu.id] = scoreCount > 0 ? scoreSum / scoreCount : 0;
    });

    // Equal GPA is broken by ร้อยละ, then shared (it used to be 1, 2, ... by list order, then all equal).
    const rankById = classRankMap_(classStudentIds.map((id) => ({ id, gpa: studentGpaMap[id], pct: studentPctMap[id] })));

    function formatThaiBirthdate(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = d.getDate();
      const month = THAI_MONTH_NAMES[d.getMonth()];
      let year = d.getFullYear();
      if (year < 2400) year += 543;
      return `${day} ${month} ${year}`;
    }

    const monthsSchedule = academicYearMonths(range.academicYear);

    const enrichedStudents = targetStudents.map((student) => {
      const studentId = String(student.id);
      const studentIdx = allStudentsInClass.findIndex((s) => String(s.id) === studentId) + 1;
      const rank = rankById.get(studentId) || '-';
      const gpa = studentGpaMap[studentId];

      const detail = detailsRows.find((d) => String(d.student_id) === studentId) || {};
      const studentGrowths = growthRows
        .filter((g) => String(g.student_id) === studentId)
        .sort((a, b) => {
          const roundDiff = number(b.round_no, 0) - number(a.round_no, 0);
          if (roundDiff) return roundDiff;
          const dateDiff = text(b.measured_on).localeCompare(text(a.measured_on));
          if (dateDiff) return dateDiff;
          return text(b.updated_at).localeCompare(text(a.updated_at));
        });
      const studentComments = commentRows.filter((c) => String(c.student_id) === studentId);

      const studentAssessmentRows = classAssessmentRows.filter((row) => String(row.student_id) === studentId);
      const assessments = reportAssessmentSummary(studentAssessmentRows, term);
      let actCounter = 0;
      let subjCounter = 0;
      const processedSubjects = subjects.map((sub) => {
        const isAct = getTypeRank(sub) === 2;
        const s1 = classScoreRows.find((r) => String(r.student_id) === studentId && String(r.subject_id) === String(sub.id) && Number(r.semester) === 1);
        const s2 = classScoreRows.find((r) => String(r.student_id) === studentId && String(r.subject_id) === String(sub.id) && Number(r.semester) === 2);

        // owner 2026-10-10: GPA นับเฉพาะวิชาที่สอบปลายภาคแล้ว (กติกาเดียวกับ ปพ.5)
        const term1Graded = dashboardCompleteScore_(s1);
        const term2Graded = dashboardCompleteScore_(s2);
        const t1 = term1Graded ? number(s1.total_score, 0) : '';
        const t2 = term2Graded ? number(s2.total_score, 0) : '';
        // ร / มส is printed as is (it used to print the grade worked out from the total score).
        const special1 = storedSpecialGrade(s1);
        const special2 = storedSpecialGrade(s2);
        const g1 = special1 || (term1Graded ? storedFinalGrade(s1) : '');
        const g2 = special2 || (term2Graded ? storedFinalGrade(s2) : '');

        let avg = '';
        let fg = '';
        const ownTerm = subjectSemester_(sub);
        if (special1 || special2) {
          fg = special1 || special2;
        } else if (ownTerm) {
          // วิชารายภาค: ผลปลายปี = ผลของภาคนั้น
          if (ownTerm === 2 ? term2Graded : term1Graded) {
            avg = ownTerm === 2 ? t2 : t1;
            fg = storedFinalGrade(ownTerm === 2 ? s2 : s1);
          }
        } else if (term1Graded && term2Graded) {
          avg = yearlyScoreAverage(t1, t2, true, true);
          fg = scoreToGrade(avg);
        }

        let selectedGrade = '';
        if (String(term) === '1') {
          selectedGrade = g1;
        } else if (String(term) === '2') {
          selectedGrade = g2;
        } else {
          selectedGrade = fg;
        }

        const hours = getSubjectHours(sub);
        const credit = getSubjectCredit(sub);
        // "คะแนนที่ได้" for ปพ.6 แบบมีคะแนน: the term total, or the year average (both terms needed)
        const score = String(term) === '1' ? t1
          : String(term) === '2' ? t2
            : ownTerm ? avg
              : (term1Graded && term2Graded ? yearlyScoreAverage(t1, t2, true, true) : '');

        if (isAct) {
          actCounter += 1;
          const activityResult = pp6ActivityResult_(studentAssessmentRows, sub, term);
          return {
            no: '',
            code: sub.code || '',
            name: sub.name || '',
            type: 'กิจกรรม',
            hours: hours,
            t1: '',
            g1: '',
            t2: '',
            g2: '',
            fg: activityResult,
            grade: activityResult,
            isActivity: true
          };
        }

        subjCounter += 1;
        return {
          no: subjCounter,
          code: sub.code || '',
          name: sub.name || '',
          type: getTypeRank(sub) === 1 ? 'เพิ่มเติม' : 'พื้นฐาน',
          hours: hours,
          credit: credit,
          t1: t1 !== '' ? Number(t1) : '',
          g1: g1,
          t2: t2 !== '' ? Number(t2) : '',
          g2: g2,
          score: score !== '' ? Number(score) : '',
          fg: fg,
          grade: selectedGrade,
          isActivity: false
        };
      });

      // Calculate credits
      let basicCreditsTotal = 0;
      let basicCreditsEarned = 0;
      let addCreditsTotal = 0;
      let addCreditsEarned = 0;

      processedSubjects.forEach((s) => {
        if (s.isActivity) return;
        const cr = Number.isFinite(s.credit) ? s.credit : 0;
        if (s.type === 'พื้นฐาน') {
          basicCreditsTotal += cr;
          if (s.grade !== '' && Number.isFinite(Number(s.grade)) && Number(s.grade) > 0) basicCreditsEarned += cr;
        } else if (s.type === 'เพิ่มเติม') {
          addCreditsTotal += cr;
          if (s.grade !== '' && Number.isFinite(Number(s.grade)) && Number(s.grade) > 0) addCreditsEarned += cr;
        }
      });

      const totalCreditsTotal = basicCreditsTotal + addCreditsTotal;
      const totalCreditsEarned = basicCreditsEarned + addCreditsEarned;


      const hasAnyScore = processedSubjects.some((s) => !s.isActivity && (s.grade !== '' && s.grade !== '-'));

      // Calculate monthly attendance & growth
      const studentAttRows = (attendanceResult.rows || []).filter((r) => String(r.student_id) === studentId);
      const birthdateVal = student.birthdate || detail.birth_date || '';
      const birthYear = birthdateVal ? new Date(birthdateVal).getFullYear() : 0;
      const birthMonth = birthdateVal ? new Date(birthdateVal).getMonth() + 1 : 0;

      const monthlyAttendance = monthsSchedule.map((m) => {
        const mRows = studentAttRows.filter((r) => String(r.attendance_date || '').startsWith(m.key));
        const present = mRows.filter((r) => r.status === 'present' || r.status === 'มา').length;
        const absent = mRows.filter((r) => r.status === 'absent' || r.status === 'ขาด').length;
        const sick = mRows.filter((r) => r.status === 'sick' || r.status === 'ป่วย').length;
        const leave = mRows.filter((r) => r.status === 'leave' || r.status === 'ลา').length;
        const total = present + absent + sick + leave;

        let ageStr = '';
        if (birthYear > 0) {
          let age = m.yearCE - birthYear;
          if (m.month < birthMonth) age -= 1;
          if (age > 0) ageStr = String(age);
        }

        // Prefer the highest saved round in the selected month. Rows created before
        // the round migration still work through the measured_on month fallback.
        const growthForMonth = studentGrowths.find((g) =>
          number(g.month, number(String(g.measured_on || '').slice(5, 7), 0)) === m.month
        );
        const weightStr = growthForMonth?.weight_kg != null ? String(growthForMonth.weight_kg) : '';
        const heightStr = growthForMonth?.height_cm != null ? String(growthForMonth.height_cm) : '';

        return {
          month: m.monthName,
          total: total > 0 ? total : '',
          present: present > 0 ? present : '',
          absent: absent > 0 ? absent : '',
          sick: sick > 0 ? sick : '',
          leave: leave > 0 ? leave : '',
          age: ageStr,
          weight: weightStr,
          height: heightStr
        };
      });

      // Teacher comments
      const commentTerm1 = studentComments.find((c) => Number(c.semester) === 1)?.comment || '';
      const commentTerm2 = studentComments.find((c) => Number(c.semester) === 2)?.comment || '';

      // Address formatting
      let addressStr = student.address || detail.address || '';
      if (detail.subdistrict || detail.district || detail.province) {
        const parts = [
          detail.address || student.address || '',
          detail.subdistrict ? `ตำบล ${detail.subdistrict}` : '',
          detail.district ? `อำเภอ ${detail.district}` : '',
          detail.province ? `จังหวัด ${detail.province}` : ''
        ].filter(Boolean);
        if (parts.length) addressStr = parts.join(' ');
      }

      return {
        id: studentId,
        studentId: studentId,
        nationalId: student.nationalId || student.national_id || student.idCard || detail.national_id || '-',
        studentNumber: student.studentNumber || student.student_number || '-',
        name: studentDisplayName(student),
        fullName: studentDisplayName(student),
        grade: student.grade || grade,
        classNo: student.classNo || student.room || classNo,
        classNumber: student.studentNumber || student.student_number || '-',
        academicYear: academicYearVal,
        birthdate: birthdateVal,
        birthdateThai: formatThaiBirthdate(birthdateVal),
        religion: student.religion || detail.religion || '-',
        ethnicity: student.ethnicity || detail.ethnicity || '-',
        nationality: student.nationality || detail.nationality || '-',
        address: addressStr || '-',
        father_name: student.father_name || detail.father_name || '-',
        father_occupation: student.father_occupation || detail.father_occupation || '-',
        mother_name: student.mother_name || detail.mother_name || '-',
        mother_occupation: student.mother_occupation || detail.mother_occupation || '-',
        guardian_name: student.guardian_name || detail.guardian_name || '-',
        guardian_relation: student.guardian_relation || detail.guardian_relation || '-',
        monthlyAttendance,
        teacherCommentTerm1: commentTerm1,
        teacherCommentTerm2: commentTerm2,
        term,
        subjects: processedSubjects,
        isDraft: extraOptions?.isDraft === true || extraOptions?.historical === true
          || Object.values(assessments).some((result) => /ยังไม่ประเมิน|รอการยืนยัน/.test(text(result?.result)))
          || processedSubjects.some((subject) => !subject.isActivity && (subject.grade === '' || subject.grade === '-')),
        basicCreditsTotal,
        basicCreditsEarned,
        addCreditsTotal,
        addCreditsEarned,
        totalCreditsTotal,
        totalCreditsEarned,
        gpaInfo: {
          // Always 2 decimals ("4.00", "3.50") like the class summary; Number() used to print "4" / "3.5".
          gpa: hasAnyScore && gpa !== null ? gpa.toFixed(2) : '',
          classRank: (showRank && hasAnyScore && gpa !== null) ? rank : '-',
          totalStudents: allStudentsInClass.length,
          showRank
        },
        showRank,
        assessments,
        teacherComment: commentTerm1,
        homeroomTeacher: homeroomTeacher || settings.homeroomTeacher || '',
        principalName: settings.directorName || settings.director_name || '',
        affiliation: settings.affiliation || ''
      };
    });

    const options = await attendancePrintOptions(grade, classNo, reportFormat === 'booklet' ? 'ปพ.6 แบบเล่มรายงานผลรายบุคคล' : 'ปพ.6 แบบรายงานผลรายบุคคล', academicYearVal);
    options.academicYear = academicYearVal;
    options.showRank = showRank;
    options.reportFormat = reportFormat;
    options.pp6WithScores = withScores;
    options.term = term;
    // ภาคเรียนที่พิมพ์แยก: ลายน้ำ "ผลระหว่างปี" + หมายเหตุ (ประถมตัดสินผลเป็นรายปี) รายปีไม่มี
    // ลำดับ: ค่าที่ส่งมา > สวิตช์บนหน้าพิมพ์ ปพ.6 (#pp6InterimToggle เฉพาะครั้งนี้) > ค่าของโรงเรียนในหน้าตั้งค่า
    const pageInterimToggle = typeof document !== 'undefined' && typeof document?.getElementById === 'function' ? document.getElementById('pp6InterimToggle') : null;
    const interimWanted = typeof extraOptions?.interimWatermark === 'boolean' ? extraOptions.interimWatermark
      : (pageInterimToggle ? pageInterimToggle.checked : await interimWatermarkOn_());
    if ((term === '1' || term === '2') && interimWanted && !semesterJudgedGrade_(grade)) options.interimTerm = term;
    if (options.interimTerm) options.interimWatermarkText = await interimWatermarkText_();
    // ครูปิดสวิตช์ลายน้ำในหน้าพิมพ์ = เอกสารสะอาด ไม่มีลายน้ำ "ฉบับร่าง" ด้วย (owner 2026-10-07)
    // ค่าของโรงเรียนในหน้าตั้งค่าคุมเฉพาะลายน้ำผลระหว่างปี ไม่ปิดฉบับร่าง
    if (extraOptions?.interimWatermark === false || (typeof extraOptions?.interimWatermark !== 'boolean' && pageInterimToggle && !pageInterimToggle.checked)) {
      options.suppressDraftWatermark = true;
    }
    if (extraOptions?.historical) options.includeSignatures = false;

    enrichedStudents.forEach((stu) => {
      stu.teacherSignature = options.teacherSignature;
      stu.academicHeadSignature = options.academicHeadSignature;
      stu.directorSignature = options.directorSignature;
      stu.schoolStamp = options.schoolStamp;
      stu.includeSignatures = options.includeSignatures;
    });

    if (global.PP5PDF?.createPp6Report) {
      const result = await global.PP5PDF.createPp6Report({
        grade,
        classNo,
        academicYear: academicYearVal,
        term,
        showRank,
        reportFormat,
        withScores,
        students: enrichedStudents,
        homeroomTeacher,
        principalName: settings.directorName || settings.director_name || '',
        affiliation: settings.affiliation || '',
        teacherSignature: options.teacherSignature,
        academicHeadSignature: options.academicHeadSignature,
        directorSignature: options.directorSignature,
        schoolStamp: options.schoolStamp,
        includeSignatures: options.includeSignatures
      }, options);
      // A blob: URL only resolves inside the page/tab that created it. That is fine for the
      // admin/teacher desktop export button (same tab, or a same-process new tab), but some
      // mobile in-app browsers (e.g. LINE's built-in browser) open "new tab" in a way that
      // loses that page context, so the report never loads there even though it worked on a
      // desktop browser. `preferDataUri` lets a caller ask for the self-contained data: URI
      // jsPDF already produces instead, which survives moving to a different tab/context.
      if (extraOptions?.preferDataUri && typeof result === 'object' && result?.dataUri) return result.dataUri;
      return typeof result === 'object' && result?.blobUrl ? result.blobUrl : (typeof result === 'object' && result?.dataUri ? result.dataUri : result);
    }
    return classPrintResult('ปพ.6', grade, classNo);
  }
  async function generateOnePagePdf(studentId, term, extraOptions) {
    const student = await data.students.get(studentId);
    if (!student) throw new Error(`ไม่พบข้อมูลนักเรียนรหัส ${studentId}`);
    const settings = await data.settings.get();
    const academicYear = text(normalizeAcademicYearBE(extraOptions?.year || extraOptions?.academicYear || settings.academicYear || settings.academic_year));
    term = String(term || extraOptions?.term || settings.semester || 'year');
    if (!['1', '2', 'year'].includes(term)) throw new Error('ภาคเรียนไม่ถูกต้อง');
    const subjects = academicScoreSubjects(await data.subjects.list(student.grade)).filter((sub) => subjectInTerm_(sub, term));
    const scoreRows = await optionalTable('scores', (query) => query.eq('student_id', student.id).eq('academic_year', academicYear));
    const subList = subjects.map((sub) => {
      const rows = scoreRows.filter((row) => String(row.subject_id) === String(sub.id));
      const first = rows.find((row) => Number(row.semester) === 1);
      const second = rows.find((row) => Number(row.semester) === 2);
      // วิชารายภาค: ทั้งปีใช้ผลของภาคนั้น (เหมือนเลือกภาคนั้น)
      const ownTerm = subjectSemester_(sub);
      const viewTerm = term === 'year' && ownTerm ? String(ownTerm) : term;
      const selected = viewTerm === '1' ? first : second;
      // owner 2026-10-10: GPA นับเฉพาะวิชาที่สอบปลายภาคแล้ว (กติกาเดียวกับ ปพ.5)
      const annualComplete = dashboardCompleteScore_(first) && dashboardCompleteScore_(second);
      const hasGrade = viewTerm === 'year' ? annualComplete : dashboardCompleteScore_(selected);
      const score = !hasGrade ? null : viewTerm === 'year' ? yearlyScoreAverage(first.total_score, second.total_score, true, true) : number(selected.total_score);
      return {
        code: sub.subjectCode || sub.code,
        name: sub.subjectName || sub.name,
        hours: sub.hours_per_year ?? sub.hoursPerYear ?? '-',
        score: score ?? '-',
        grade: !hasGrade ? '-' : viewTerm === 'year' ? data.helpers.calculateGrade(score) : storedFinalGrade(selected)
      };
    });
    const assessRows = await optionalTable('assessments', (query) => query.eq('student_id', student.id).eq('academic_year', academicYear));
    const assessments = reportAssessmentSummary(assessRows, term);
    const options = await attendancePrintOptions(student.grade, student.classNo, 'รายงานผลการเรียนหน้าเดียว');
    options.academicYear = academicYear;
    options.meta = ['ชั้น ' + student.grade + ' ห้อง ' + student.classNo, 'ปีการศึกษา ' + academicYear, term === 'year' ? 'รายปี' : 'ภาคเรียนที่ ' + term].join('   ');
    // ภาคเรียนที่พิมพ์แยก: ลายน้ำ "ผลระหว่างปี" + หมายเหตุ (ประถมตัดสินผลเป็นรายปี) รายปีไม่มี
    if ((term === '1' || term === '2') && await interimWatermarkOn_(student.grade)) options.interimTerm = term;
    if (options.interimTerm) options.interimWatermarkText = await interimWatermarkText_();
    if (global.PP5PDF?.createOnePageReport) {
      const result = await global.PP5PDF.createOnePageReport({
        student,
        grade: student.grade,
        classNo: student.classNo,
        subjects: subList,
        rtwResult: assessments.reading.result,
        charResult: assessments.character.result,
        activityResult: assessments.activities.result,
        compResult: assessments.competency.result,
        promotionStatus: extraOptions?.promotionStatus || 'pending',
        approvalDate: extraOptions?.approvalDate,
        showRank: extraOptions?.showRank
      }, options);
      return typeof result === 'object' && result?.blobUrl ? result.blobUrl : (typeof result === 'object' && result?.dataUri ? result.dataUri : result);
    }
    return classPrintResult('รายงานผลการเรียนหน้าเดียว', student.grade, student.classNo);
  }

  // หน้า "สรุปคะแนน" (class_score_summary) ส่ง term = '0' (ทั้งปี) / '1' / '2' แล้วตามด้วย token
  // และต้องการ { mode, term, subjects:[{code,name,midMax,finalMax}], students:[{fullName, scores:{[code]:...}}] }
  async function buildClassSubjectScoreSummary(grade, classNo, termInput) {
    const termText = text(termInput).trim();
    const mode = termText === '1' || termText === '2' ? 'term' : 'year';
    const term = mode === 'term' ? Number(termText) : 0;
    const academicYear = text(await currentYear());
    const [students, allSubjects] = await Promise.all([
      data.students.list({ grade, room: classNo, academicYear }),
      data.subjects.list(grade)
    ]);
    if (!students.length) return { success: false, message: `ไม่พบนักเรียนในชั้น ${grade} ห้อง ${classNo}` };
    // a term view lists only that term's subjects (semester subjects of the other term are left out)
    const subjects = parentSortSubjects_(academicScoreSubjects(allSubjects)).filter((subject) => subjectInTerm_(subject, term));
    const ids = students.map((student) => text(student.id)).filter(Boolean);
    const rows = await optionalTableAll('scores', (query) => query.eq('academic_year', academicYear).in('student_id', ids));
    const byKey = groupBy(rows, (row) => `${text(row.student_id)}|${text(row.subject_id)}`);
    const round1 = (value) => Math.round(number(value, 0) * 10) / 10;
    const special = (row) => { const g = text(row?.grade_text).trim(); return g === 'ร' || g === 'มส' ? g : ''; };
    const termResult = (row) => {
      if (!storedScoreWasEntered(row)) return null;
      const mid = round1(row.formative_score);
      const final = round1(row.summative_score);
      const total = row.total_score === null || row.total_score === undefined || text(row.total_score) === ''
        ? round1(mid + final) : round1(row.total_score);
      return { mid, final, total, grade: special(row) || String(data.helpers.calculateGrade(total)) };
    };
    const subjectList = subjects.map((subject) => {
      const config = subjectScoreConfig(subject);
      return { id: text(subject.id), code: text(subject.code || subject.name), name: text(subject.name), midMax: config.midMax, finalMax: config.finalMax };
    });
    const summaryStudents = students.map((student) => {
      const scores = {};
      subjects.forEach((subject, index) => {
        const key = subjectList[index].code;
        const list = byKey[`${text(student.id)}|${text(subject.id)}`] || [];
        const t1 = list.find((row) => number(row.semester, 1) === 1);
        const t2 = list.find((row) => number(row.semester, 1) === 2);
        if (mode === 'term') {
          const result = termResult(term === 1 ? t1 : t2);
          if (result) scores[key] = result;
          return;
        }
        const r1 = termResult(t1);
        const r2 = termResult(t2);
        if (!r1 && !r2) return;
        const year = pp5YearEndResult(t1, t2, subject);
        scores[key] = {
          t1: r1 ? r1.total : '-',
          t2: r2 ? r2.total : '-',
          yearAvg: year.status === 'complete' ? year.average : '-',
          yearGrade: year.status === 'pending' ? 'รอผล' : year.grade
        };
      });
      return { studentId: text(student.id), fullName: studentDisplayName(student), name: studentDisplayName(student), scores };
    });
    const gradeNumber = text(grade).replace(/[^0-9]/g, '');
    const gradeFullName = text(grade).startsWith('ป.') ? `ประถมศึกษาปีที่ ${gradeNumber}`
      : text(grade).startsWith('ม.') ? `มัธยมศึกษาปีที่ ${gradeNumber}`
        : text(grade).startsWith('อ.') ? `อนุบาลปีที่ ${gradeNumber}` : text(grade);
    return { success: true, grade, classNo, gradeFullName, academicYear, mode, term, subjects: subjectList, students: summaryStudents };
  }

  // หน้าเว็บแบบ GAS ถอดรหัส PDF ด้วย atob(dataUrl.split(',')[1]) จึงต้องได้ data URI
  async function pdfResultAsDataUri(result) {
    const value = text(result);
    if (!value.startsWith('blob:')) return result;
    const blob = await fetch(value).then((response) => response.blob());
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('อ่านไฟล์ PDF ไม่สำเร็จ'));
      reader.readAsDataURL(blob);
    });
  }

  // หน้า "รายงานน้ำหนัก-ส่วนสูง" ส่งตัวกรองเป็นออบเจกต์ { academicYear, month, roundNo, grade, classNo, period }
  // แล้วอ่าน { total, summary:[{status,count,percent}], rows:[...] } (ชื่อฟิลด์แบบ snake_case)
  async function buildStudentGrowthReport(filterInput, legacyClassNo) {
    const filters = filterInput && typeof filterInput === 'object' ? filterInput : { grade: filterInput, classNo: legacyClassNo };
    const academicYear = text(filters.academicYear).replace(/[^0-9]/g, '') || text(await currentYear());
    const grade = /^(?:อ|ป|ม)\.\d+$/.test(text(filters.grade).trim()) ? text(filters.grade).trim() : '';
    const classNo = grade && text(filters.classNo).trim() ? text(filters.classNo).trim() : '';
    const month = number(filters.month, 0);
    const roundNo = number(filters.roundNo, 0);
    const period = text(filters.period || 'year');
    const termMonths = period === 'term1' ? [5, 6, 7, 8, 9, 10] : period === 'term2' ? [11, 12, 1, 2, 3, 4] : null;
    const students = await data.students.list({ academicYear, ...(grade ? { grade } : {}), ...(classNo ? { room: classNo } : {}) });
    const byId = new Map(students.map((student) => [text(student.id), student]));
    const ids = [...byId.keys()].filter(Boolean);
    const rows = ids.length ? await optionalTableAll('student_growth', (query) => {
      let scoped = query.eq('academic_year', academicYear).in('student_id', ids);
      if (month) scoped = scoped.eq('month', month);
      if (roundNo) scoped = scoped.eq('round_no', roundNo);
      return scoped;
    }) : [];
    const filtered = rows.filter((row) => month || !termMonths || termMonths.includes(number(row.month, 0)));
    const decimal = (value, digits) => (value === null || value === undefined || text(value) === '' ? '' : Number(value).toFixed(digits));
    const reportRows = filtered.map((row) => {
      const student = byId.get(text(row.student_id)) || {};
      const weight = row.weight_kg;
      const height = row.height_cm;
      const bmi = row.bmi ?? (number(weight) > 0 && number(height) > 0 ? number(weight) / ((number(height) / 100) ** 2) : '');
      return {
        measure_date: text(row.measured_on),
        month: number(row.month, 0),
        round_no: number(row.round_no, 0),
        student_id: text(row.student_id),
        student_name: studentDisplayName(student),
        grade: text(student.grade),
        class_no: text(student.classNo ?? student.room),
        student_number: number(student.studentNumber ?? student.student_number, 0),
        weight_kg: decimal(weight, 1),
        height_cm: decimal(height, 1),
        bmi: decimal(bmi, 2),
        nutrition_status: global.PP5Nutrition?.classify(student, row) || 'ประเมินไม่ได้: ไม่พบเกณฑ์ WHO',
        note: text(row.note)
      };
    }).sort((a, b) => a.grade.localeCompare(b.grade, 'th') || a.class_no.localeCompare(b.class_no, undefined, { numeric: true })
      || a.student_number - b.student_number || a.student_id.localeCompare(b.student_id, undefined, { numeric: true })
      || a.measure_date.localeCompare(b.measure_date));
    const counts = new Map();
    reportRows.forEach((row) => counts.set(row.nutrition_status, (counts.get(row.nutrition_status) || 0) + 1));
    const total = reportRows.length;
    const summary = [...counts.entries()].map(([status, count]) => ({ status, count, percent: total ? Math.round((count / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.count - a.count);
    const periodLabel = month ? (THAI_MONTH_NAMES[month - 1] || `เดือน ${month}`) : period === 'term1' ? 'ภาคเรียนที่ 1' : period === 'term2' ? 'ภาคเรียนที่ 2' : 'ตลอดปี';
    const label = [grade ? `ชั้น ${grade}${classNo ? ` ห้อง ${classNo}` : ''}` : 'ทุกชั้น', periodLabel, roundNo ? `รอบที่ ${roundNo}` : '', `ปีการศึกษา ${academicYear}`].filter(Boolean).join('  ');
    const months = month ? [month] : termMonths || [5,6,7,8,9,10,11,12,1,2,3,4];
    return { success: true, academicYear, grade, classNo, label, total, summary, months, rows: reportRows };
  }

  // Same orders as the "สรุปผลการเรียนรายชั้น" page: 'id' = รหัสนักเรียน, 'gender' = ชายก่อนหญิง
  // แล้วตามรหัส; anything else keeps the register (เลขที่) order.
  function sortScoreSummaryStudents_(students, sortMode) {
    const list = [...(students || [])];
    const byId = (a, b) => text(a.studentId).localeCompare(text(b.studentId), undefined, { numeric: true });
    const isMale = (student) => {
      const gender = text(student.gender).trim();
      if (gender) return gender.includes('ชาย') || /^(m|male)$/i.test(gender);
      const name = text(student.fullName).trim();
      return name.startsWith('เด็กชาย') || name.startsWith('นาย');
    };
    if (sortMode === 'id') list.sort(byId);
    else if (sortMode === 'gender') list.sort((a, b) => (isMale(a) === isMale(b) ? byId(a, b) : (isMale(a) ? -1 : 1)));
    return list;
  }

  async function generateClassSubjectScorePdf(grade, classNo, termValue, sortMode) {
    // termValue: '1' | '2' = รายภาคเรียน, อื่น ๆ (รวม token จากหน้าเก่า) = ทั้งปี
    const termKey = text(termValue).trim();
    const semester = termKey === '1' || termKey === '2' ? termKey : '';
    const summary = await server.getStudentScoresForWeb(grade, classNo, semester ? { semester } : undefined);
    const termLabel = semester ? 'ภาคเรียนที่ ' + semester : '';
    if (!summary?.success) throw new Error(summary?.message || 'ไม่พบข้อมูลนักเรียน');
    const subjects = (summary.subjects || []).map((name) => ({ id: name, name, code: name }));
    const students = sortScoreSummaryStudents_(summary.students, text(sortMode)).map((student) => {
      const subjectScores = { gpa: student.average, rank: student.rank };
      subjects.forEach((subject) => {
        subjectScores[subject.id] = Object.prototype.hasOwnProperty.call(student.grades || {}, subject.id)
          ? student.grades[subject.id]
          : (student.specialGrades?.[subject.id] || '-');
      });
      return {
        studentId: student.studentId,
        name: student.fullName,
        subjectScores
      };
    });
    const options = await attendancePrintOptions(grade, classNo, '');
    options.meta = ['ชั้น ' + grade + ' ห้อง ' + classNo, termLabel, options.academicYear ? 'ปีการศึกษา ' + options.academicYear : ''].filter(Boolean).join('   ');
    // ภาคเรียนที่พิมพ์แยก: ลายน้ำ "ผลระหว่างปี" + หมายเหตุ (ประถมตัดสินผลเป็นรายปี) รายปีไม่มี
    if (semester && await interimWatermarkOn_(grade)) options.interimTerm = semester;
    if (options.interimTerm) options.interimWatermarkText = await interimWatermarkText_();
    if (global.PP5PDF?.createClassSubjectScoreReport) {
      const result = await global.PP5PDF.createClassSubjectScoreReport({
        title: 'แบบสรุปผลสัมฤทธิ์ทางการเรียนรายชั้น' + (termLabel ? ' ' + termLabel : ''),
        grade,
        classNo,
        students,
        subjects,
        orientation: 'portrait',
        includeRank: true
      }, options);
      return typeof result === 'object' && result?.blobUrl ? result.blobUrl : (typeof result === 'object' && result?.dataUri ? result.dataUri : result);
    }
    const rows = students.map((student, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(student.studentId)}</td><td>${escapeHtml(student.name)}</td>${subjects.map((subject) => `<td>${escapeHtml(student.subjectScores[subject.id])}</td>`).join('')}<td>${escapeHtml(student.subjectScores.gpa)}</td><td>${escapeHtml(student.subjectScores.rank)}</td></tr>`).join('');
    return printUrl('สรุปผลการเรียนรายชั้น', `<table><thead><tr><th>ที่</th><th>รหัส</th><th>ชื่อ-นามสกุล</th>${subjects.map((subject) => `<th>${escapeHtml(subject.name)}</th>`).join('')}<th>GPA</th><th>อันดับ</th></tr></thead><tbody>${rows}</tbody></table>`, { ...options, orientation: 'portrait' });
  }

  // หน้า "สรุปการประเมินทางการเรียน" ส่ง authToken มาเป็นอาร์กิวเมนต์ตัวที่ 3 (สืบทอดจาก GAS)
  // จึงรับเป็นภาคเรียนเฉพาะค่า 1, 2 หรือ 'year' เท่านั้น ค่าอื่น (รวม token) ใช้ภาคเรียนปัจจุบัน
  // ในตั้งค่าระบบ: ภาคเรียนที่ 1 -> สรุปภาคเรียนที่ 1, ภาคเรียนที่ 2 -> สรุปผลสิ้นปี (ยึดภาคเรียนที่ 2)
  async function classSummaryTerm(value) {
    const term = text(value).trim();
    if (term === '1' || term === '2' || term === 'year') return term;
    const settings = await data.settings.get().catch(() => ({}));
    return number(settings?.semester, 1) === 2 ? 'year' : '1';
  }

  async function buildClassAssessmentSummary(grade, classNo, termInput) {
    const term = await classSummaryTerm(termInput);
    const academicYear = text(await currentYear());
    const room = text(classNo);
    const [gradeStudents, allSubjects] = await Promise.all([
      data.students.list({ grade, academicYear }),
      data.subjects.list(grade)
    ]);
    const classStudents = gradeStudents.filter((student) => text(student.room ?? student.classNo) === room);
    if (!classStudents.length) return { success: false, message: `ไม่พบนักเรียนในชั้น ${grade} ห้อง ${classNo}` };

    const subjects = academicScoreSubjects(allSubjects);
    const gradeIds = gradeStudents.map((student) => text(student.id)).filter(Boolean);
    const classIds = classStudents.map((student) => text(student.id)).filter(Boolean);
    const [scoreRows, assessRows] = await Promise.all([
      optionalTableAll('scores', (query) => query.eq('academic_year', academicYear).in('student_id', gradeIds)),
      optionalTableAll('assessments', (query) => query.eq('academic_year', academicYear).in('student_id', classIds))
    ]);
    const scoresByKey = groupBy(scoreRows, (row) => `${text(row.student_id)}|${text(row.subject_id)}`);
    const assessByStudent = groupBy(assessRows, (row) => text(row.student_id));

    const scoreSummary = (student) => {
      let sumTotal = 0;
      let gradeSum = 0;
      let creditSum = 0;
      let count = 0;
      subjects.forEach((subject) => {
        const rows = scoresByKey[`${text(student.id)}|${text(subject.id)}`] || [];
        const t1 = rows.find((row) => number(row.semester, 1) === 1);
        const t2 = rows.find((row) => number(row.semester, 1) === 2);
        // owner 2026-10-10: GPA นับเฉพาะวิชาที่สอบปลายภาคแล้ว (กติกาเดียวกับ ปพ.5)
        const t1Entered = dashboardCompleteScore_(t1);
        const t2Entered = dashboardCompleteScore_(t2);
        let total = null;
        if (term === '1') total = t1Entered ? number(t1.total_score, 0) : null;
        else if (term === '2') total = t2Entered ? number(t2.total_score, 0) : null;
        else if (subjectSemester_(subject) === 1) total = t1Entered ? number(t1.total_score, 0) : null;
        else if (subjectSemester_(subject) === 2) total = t2Entered ? number(t2.total_score, 0) : null;
        else if (t1Entered && t2Entered) total = yearlyScoreAverage(t1.total_score, t2.total_score, true, true);
        if (total === null) return;
        // ร / มส is left out of the GPA and of รวมคะแนน/ร้อยละ (the rank tie-break), the same rule as ปพ.6.
        const special = term === '1' ? storedSpecialGrade(t1)
          : term === '2' ? storedSpecialGrade(t2) : (storedSpecialGrade(t1) || storedSpecialGrade(t2));
        if (special) return;
        sumTotal += total;
        count += 1;
        // GPA weighted by credit, the same rule as the ปพ.6 report.
        const credit = parentSubjectCredit_(subject);
        gradeSum += number(data.helpers.calculateGrade(total), 0) * credit;
        creditSum += credit;
      });
      const fullScore = count * 100;
      return {
        sumTotal: Math.round(sumTotal * 100) / 100,
        fullScore,
        pct: fullScore ? (sumTotal / fullScore) * 100 : 0,
        gpa: creditSum > 0 ? gradeSum / creditSum : 0,
        hasScores: count > 0
      };
    };

    const rankMap = (items) => classRankMap_(items.filter((item) => item.hasScores));

    const gradeItems = gradeStudents.map((student) => ({ id: text(student.id), student, ...scoreSummary(student) }));
    const gradeRanks = rankMap(gradeItems);
    const classItems = gradeItems.filter((item) => classIds.includes(item.id));
    const classRanks = rankMap(classItems);

    const students = classItems.map((item) => {
      const assess = reportAssessmentSummary(assessByStudent[item.id] || [], term);
      const fullName = studentDisplayName(item.student);
      return {
        studentId: item.id,
        id: item.id,
        studentNumber: text(item.student.studentNumber || item.id),
        gender: text(item.student.gender),
        fullName,
        name: fullName,
        sumTotal: item.sumTotal,
        fullScore: item.fullScore,
        pct: item.pct,
        gpa: item.gpa,
        classRank: classRanks.get(item.id) || '-',
        gradeRank: gradeRanks.get(item.id) || '-',
        reading: assess.reading.result,
        character: assess.character.result,
        activity: assess.activities.result,
        competency: assess.competency.result,
        rtwResult: assess.reading.result,
        charResult: assess.character.result,
        activityResult: assess.activities.result,
        compResult: assess.competency.result
      };
    });

    const gradeNumber = text(grade).replace(/[^0-9]/g, '');
    const gradeFullName = text(grade).startsWith('ป.') ? `ประถมศึกษาปีที่ ${gradeNumber}`
      : text(grade).startsWith('ม.') ? `มัธยมศึกษาปีที่ ${gradeNumber}`
        : text(grade).startsWith('อ.') ? `อนุบาลปีที่ ${gradeNumber}` : text(grade);
    const termLabel = term === 'year' ? `สิ้นปีการศึกษา ${academicYear}` : `ภาคเรียนที่ ${term}/${academicYear}`;
    return {
      success: true,
      grade,
      classNo,
      gradeFullName: `${gradeFullName} (${termLabel})`,
      gradeName: gradeFullName,
      academicYear,
      term,
      termLabel,
      totalClassStudents: classStudents.length,
      totalGradeStudents: gradeStudents.length,
      students
    };
  }

  async function generateClassAssessmentSummaryPdf(grade, classNo, term, sortMode) {
    const summary = await buildClassAssessmentSummary(grade, classNo, term);
    if (!summary.success) throw new Error(summary.message || 'ไม่พบข้อมูลนักเรียน');
    const students = sortScoreSummaryStudents_(summary.students, sortMode);
    const options = await attendancePrintOptions(grade, classNo, 'สรุปผลประเมินรายชั้น');
    options.meta = [`ชั้น ${grade} ห้อง ${classNo}`, summary.termLabel].filter(Boolean).join('   ');
    // ภาคเรียนที่พิมพ์แยก: ลายน้ำ "ผลระหว่างปี" + หมายเหตุ (ประถมตัดสินผลเป็นรายปี) รายปีไม่มี
    if ((summary.term === '1' || summary.term === '2') && await interimWatermarkOn_(grade)) options.interimTerm = summary.term;
    if (options.interimTerm) options.interimWatermarkText = await interimWatermarkText_();
    if (global.PP5PDF?.createClassAssessmentSummaryReport) {
      const result = await global.PP5PDF.createClassAssessmentSummaryReport({ grade, classNo, students }, options);
      // หน้านี้ถอดรหัสผลลัพธ์ด้วย atob(dataUrl.split(',')[1]) จึงต้องคืน data URI (base64) ไม่ใช่ blob: URL
      return typeof result === 'object' && result?.dataUri ? result.dataUri : (typeof result === 'object' && result?.blobUrl ? result.blobUrl : result);
    }
    return classPrintResult('สรุปผลประเมินรายชั้น', grade, classNo);
  }

  async function getPp5ReadinessSummary(grade, classNo, academicYear) {
    academicYear = academicYear || await currentYear();
    const students = await data.students.list({ grade, room: classNo, academicYear });
    if (!students.length) {
      return { success: false, message: `ไม่พบข้อมูลนักเรียนในชั้น ${grade}/${classNo}` };
    }

    const allSubjects = await data.subjects.list(grade);
    const academicSubjects = academicScoreSubjects(allSubjects);

    const studentIds = students.map((s) => text(s.id)).filter(Boolean);
    const [scoreRows, assessRows] = await Promise.all([
      optionalTable('scores', (query) => query.in('student_id', studentIds).eq('academic_year', text(academicYear))),
      optionalTable('assessments', (query) => query.in('student_id', studentIds).eq('academic_year', text(academicYear)))
    ]);

    const yearStr = text(academicYear).trim();
    const targetScoreRows = (scoreRows || []).filter((r) => text(r.academic_year).trim() === yearStr);
    const targetAssessRows = (assessRows || []).filter((r) => text(r.academic_year).trim() === yearStr);

    // 1. ตรวจสอบคะแนนผลการเรียนรายวิชา (สาระการเรียนรู้)
    const isPrimary = !grade.startsWith('ม.');
    const scoreGrouped = new Map();
    targetScoreRows.forEach((row) => {
      const key = `${text(row.student_id)}|${text(row.subject_id)}`;
      if (!scoreGrouped.has(key)) scoreGrouped.set(key, []);
      scoreGrouped.get(key).push(row);
    });

    const missingScoreStudents = [];
    let completedSubjectEntries = 0;
    const totalSubjectEntries = students.length * (academicSubjects.length || 1);

    students.forEach((student) => {
      const sid = text(student.id);
      let studentComplete = true;

      academicSubjects.forEach((subject) => {
        const subId = text(subject.id);
        const subjectRows = scoreGrouped.get(`${sid}|${subId}`) || [];
        const t1 = subjectRows.find((r) => number(r.semester, 1) === 1);
        const t2 = subjectRows.find((r) => number(r.semester, 1) === 2);
        const annualRow = subjectRows.find((r) => r.is_annual === true || r.semester === 'year' || number(r.semester, 0) === 0);

        let subjectFinalized = false;
        if (subjectSemester_(subject)) {
          // วิชารายภาค: ต้องมีผลของภาคของวิชานั้น
          subjectFinalized = storedScoreWasEntered(subjectSemester_(subject) === 2 ? t2 : t1)
            || storedScoreWasEntered(annualRow) || storedScoreHasFinalGrade(annualRow);
        } else if (isPrimary) {
          // ระดับประถมศึกษา (ป.1 - ป.6) ผลการเรียนประจำปีต้องมีคะแนนทั้ง 2 ภาคเรียน หรือมีระเบียนเกรดประจำปี
          const t1Entered = storedScoreWasEntered(t1);
          const t2Entered = storedScoreWasEntered(t2);
          const annualEntered = storedScoreWasEntered(annualRow) || storedScoreHasFinalGrade(annualRow);
          subjectFinalized = (t1Entered && t2Entered) || annualEntered;
        } else {
          // ระดับมัธยมศึกษา
          const t1Entered = storedScoreWasEntered(t1);
          const t2Entered = storedScoreWasEntered(t2);
          const annualEntered = storedScoreWasEntered(annualRow) || storedScoreHasFinalGrade(annualRow);
          subjectFinalized = t1Entered || t2Entered || annualEntered;
        }

        if (subjectFinalized) {
          completedSubjectEntries += 1;
        } else {
          studentComplete = false;
        }
      });

      if (!studentComplete && academicSubjects.length > 0) {
        missingScoreStudents.push(student);
      }
    });

    const subjectsWithScores = academicSubjects.filter((sub) => {
      return students.some((s) => {
        const rows = scoreGrouped.get(`${text(s.id)}|${text(sub.id)}`) || [];
        return rows.some((r) => storedScoreWasEntered(r) || storedScoreHasFinalGrade(r));
      });
    });
    const subjectsMissingAll = academicSubjects.length - subjectsWithScores.length;

    // 2. ตรวจสอบการประเมินต่างๆ
    const completeStudents = (type) => {
      const byStudent = groupBy(targetAssessRows.filter((r) => r.assessment_type === type), (r) => text(r.student_id));
      return new Set(Object.entries(byStudent).filter(([, rows]) => {
        // Do not combine half-filled criteria from different semesters.
        const byTerm = groupBy(rows, (r) => text(r.semester ?? 1));
        return Object.values(byTerm).every((termRows) => assessmentCriteriaComplete(termRows, type));
      }).map(([id]) => id));
    };
    const rtwStudents = new Set([...completeStudents('rtw'), ...completeStudents('subject_rtw')]);
    const charStudents = completeStudents('characteristic');
    const actStudents = completeStudents('activity');
    const compStudents = completeStudents('competency');

    const missingRtw = students.filter((s) => !rtwStudents.has(text(s.id)));
    const missingChar = students.filter((s) => !charStudents.has(text(s.id)));
    const missingAct = students.filter((s) => !actStudents.has(text(s.id)));
    const missingComp = students.filter((s) => !compStudents.has(text(s.id)));

    // 3. ประเด็นต้องแก้ไข (blockingIssues) และข้อควรตรวจเพิ่ม (warnings)
    const blockingIssues = [];
    const warnings = [];
    if (!academicSubjects.length) blockingIssues.push('ยังไม่ได้กำหนดรายวิชาสำหรับชั้นเรียนนี้');

    if (academicSubjects.length > 0 && missingScoreStudents.length > 0) {
      if (subjectsMissingAll > 0) {
        blockingIssues.push(`ผลการเรียนรายวิชา: ยังไม่มีการบันทึกคะแนน ${subjectsMissingAll} วิชา (จากทั้งหมด ${academicSubjects.length} วิชา)`);
      }
      blockingIssues.push(`ผลการเรียนรายวิชา: ยังไม่มีผลการเรียนประจำปีครบถ้วน ${missingScoreStudents.length} คน (ต้องมีคะแนนครบ 2 ภาคเรียน)`);
    }

    if (missingAct.length > 0) {
      blockingIssues.push(`กิจกรรมพัฒนาผู้เรียน: ยังไม่ครบ ${missingAct.length} คน (เงื่อนไขเลื่อนชั้น/จบหลักสูตร)`);
    }

    if (missingRtw.length > 0) {
      blockingIssues.push(`อ่าน คิดวิเคราะห์ เขียน: ยังไม่ครบ ${missingRtw.length} คน (เงื่อนไขเลื่อนชั้น/จบหลักสูตร)`);
    }

    if (missingChar.length > 0) {
      blockingIssues.push(`คุณลักษณะอันพึงประสงค์: ยังไม่ครบ ${missingChar.length} คน (เงื่อนไขเลื่อนชั้น/จบหลักสูตร)`);
    }

    if (missingComp.length > 0) {
      warnings.push(`สมรรถนะสำคัญ: ยังไม่ครบ ${missingComp.length} คน`);
    }

    // 4. คำนวณคะแนนความพร้อมจริง (ถ่วงน้ำหนักตามความก้าวหน้าจริง)
    const subjectPct = totalSubjectEntries > 0 ? (completedSubjectEntries / totalSubjectEntries) : 0;
    const actPct = students.length > 0 ? ((students.length - missingAct.length) / students.length) : 0;
    const rtwPct = students.length > 0 ? ((students.length - missingRtw.length) / students.length) : 0;
    const charPct = students.length > 0 ? ((students.length - missingChar.length) / students.length) : 0;
    const compPct = students.length > 0 ? ((students.length - missingComp.length) / students.length) : 0;

    const rawScore = (subjectPct * 40) + (actPct * 20) + (rtwPct * 15) + (charPct * 15) + (compPct * 10);
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));
    const ready = blockingIssues.length === 0;

    return {
      success: true,
      ready,
      score,
      grade,
      classNo,
      academicYear,
      totals: { students: students.length, subjects: allSubjects.length },
      blockingIssues,
      warnings,
      sections: {
        assessments: {
          'ผลการเรียนรายวิชา (สาระการเรียนรู้)': { ok: missingScoreStudents.length === 0 && academicSubjects.length > 0, missingStudents: missingScoreStudents },
          'อ่าน คิดวิเคราะห์ เขียน': { ok: missingRtw.length === 0, missingStudents: missingRtw },
          'คุณลักษณะอันพึงประสงค์': { ok: missingChar.length === 0, missingStudents: missingChar },
          'กิจกรรมพัฒนาผู้เรียน': { ok: missingAct.length === 0, missingStudents: missingAct },
          'สมรรถนะสำคัญ': { ok: missingComp.length === 0, missingStudents: missingComp }
        }
      }
    };
  }

  async function getPp5ReadinessMatrix(academicYear) {
    academicYear = academicYear || await currentYear();
    let students = await data.students.list({ academicYear });
    if (!students || !students.length) {
      students = await data.students.list();
    }
    const classKeys = [...new Set(students.map((s) => `${text(s.grade)}|${text(s.classNo)}`))]
      .filter((k) => !k.startsWith('|') && !k.endsWith('|'));

    const classes = [];
    for (const key of classKeys) {
      const [grade, classNo] = key.split('|');
      const sum = await getPp5ReadinessSummary(grade, classNo, academicYear);
      if (sum.success) {
        classes.push({
          grade,
          classNo,
          ready: sum.ready,
          score: sum.score,
          blockers: sum.blockingIssues.length,
          warnings: sum.warnings.length,
          summary: sum.ready ? 'พร้อมส่งตรวจ' : `พบประเด็นต้องตรวจ ${sum.warnings.length + sum.blockingIssues.length} รายการ`
        });
      }
    }

    return { success: true, academicYear, classes };
  }

  const approvalStore = new Map();

  async function getPp5ApprovalDashboard(academicYear) {
    academicYear = academicYear || await currentYear();
    const students = await data.students.list({ academicYear });
    const classKeys = [...new Set(students.map((s) => `${text(s.grade)}|${text(s.classNo)}`))]
      .filter((k) => !k.startsWith('|') && !k.endsWith('|'));

    const classes = [];
    const totals = { all: classKeys.length, submitted: 0, reviewed: 0, approved: 0, returned: 0, draft: 0 };

    for (const key of classKeys) {
      const [grade, classNo] = key.split('|');
      const storeKey = `${academicYear}_${grade}_${classNo}`;
      const rec = approvalStore.get(storeKey) || {
        grade,
        class_no: classNo,
        academic_year: academicYear,
        status: 'draft',
        note: '',
        updated_at: '-',
        updated_by: '-'
      };
      const status = rec.status || 'draft';
      if (totals[status] !== undefined) totals[status]++;
      else totals.draft++;

      classes.push({
        grade,
        classNo,
        status,
        readinessScore: 100,
        blockers: 0,
        note: rec.note,
        updatedAt: rec.updated_at
      });
    }

    return { success: true, academicYear, totals, classes };
  }

  async function getPp5ApprovalRecord(grade, classNo, academicYear) {
    academicYear = academicYear || await currentYear();
    const storeKey = `${academicYear}_${grade}_${classNo}`;
    const record = approvalStore.get(storeKey) || {
      grade,
      class_no: classNo,
      academic_year: academicYear,
      status: 'draft',
      note: '',
      updated_at: new Date().toLocaleDateString('th-TH'),
      updated_by: 'ระบบ'
    };
    const history = record.history || [
      { timestamp: record.updated_at, action: 'สร้างรายการ', from_status: '-', to_status: record.status, user: record.updated_by, note: record.note }
    ];
    return { success: true, record, history };
  }

  async function updatePp5ApprovalStatus(grade, classNo, academicYear, toStatus, actionName, note) {
    academicYear = academicYear || await currentYear();
    const storeKey = `${academicYear}_${grade}_${classNo}`;
    const prev = approvalStore.get(storeKey) || {
      grade,
      class_no: classNo,
      academic_year: academicYear,
      status: 'draft',
      history: []
    };

    const nowStr = new Date().toLocaleString('th-TH');
    const user = (await data.auth.requireUser().catch(() => ({ profile: { fullName: 'ผู้ใช้งาน' } })))?.profile?.fullName || 'ผู้ใช้งาน';

    const updated = {
      ...prev,
      status: toStatus,
      note: text(note || ''),
      updated_at: nowStr,
      updated_by: user,
      history: [
        ...(prev.history || []),
        { timestamp: nowStr, action: actionName, from_status: prev.status, to_status: toStatus, user, note: text(note || '') }
      ]
    };
    approvalStore.set(storeKey, updated);
    return { success: true, message: `ดำเนินการ ${actionName} สำเร็จ`, record: updated };
  }

  function normalizeLogoSource(value) {
    const source = text(value).trim();
    if (!source) return '';
    if (/^(data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,|https?:\/\/|blob:)/i.test(source)) return source;
    if (/^[A-Za-z0-9+/=\s]+$/.test(source) && source.replace(/\s/g, '').length > 100) {
      return `data:image/png;base64,${source.replace(/\s/g, '')}`;
    }
    return '';
  }

  function officialSignatureBlock(options) {
    if (!options.official) return '';
    const cells = [
      { role: `ครูประจำชั้น ${options.grade || ''}/${options.classNo || ''}`, name: options.classTeacher },
      { role: 'หัวหน้างานวิชาการ', name: options.academicHead },
      { role: options.directorPosition || 'ผู้อำนวยการโรงเรียน', name: options.directorName }
    ];
    return '<section class="signature-section">' + cells.map((item) => {
      const displayName = text(item.name).trim() || '................................................';
      return `<div class="signature-cell"><div>ลงชื่อ................................................</div>` +
        `<div>(${escapeHtml(displayName)})</div><div>${escapeHtml(item.role)}</div></div>`;
    }).join('') + '</section>';
  }

  function homeroomTeacherDisplay(row) {
    return [text(row?.teacher_name).trim(), text(row?.teacher_name_2).trim()]
      .filter(Boolean)
      .join(' และ ');
  }

  function printUrl(title, body, options = {}) {
    const orientation = options.official ? 'portrait' : (options.orientation === 'landscape' ? 'landscape' : 'portrait');
    const logoSource = normalizeLogoSource(options.logo);
    const logo = logoSource ? `<img class="school-emblem" src="${escapeHtml(logoSource)}" alt="ตราโรงเรียน">` : '<div class="school-emblem-placeholder" aria-hidden="true"></div>';
    const schoolName = options.schoolName ? `<div class="school-name">${escapeHtml(options.schoolName)}</div>` : '';
    const affiliation = options.affiliation ? `<div class="school-detail">${escapeHtml(options.affiliation)}</div>` : '';
    const address = options.schoolAddress ? `<div class="school-detail">${escapeHtml(options.schoolAddress)}</div>` : '';
    const phone = options.schoolPhone ? `<div class="school-detail">โทร. ${escapeHtml(options.schoolPhone)}</div>` : '';
    const meta = options.meta ? `<div class="report-meta">${escapeHtml(options.meta)}</div>` : '';
    const footerNoteValue = text(options.footerNote).trim();
    const footerNote = footerNoteValue && footerNoteValue !== '-'
      ? `<div class="footer-note">${escapeHtml(footerNoteValue)}</div>`
      : '';
    const signatures = officialSignatureBlock(options);
    const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>
        @page{size:A4 ${orientation};margin:13mm 12mm 12mm}
        *{box-sizing:border-box}
        body{font-family:"Sarabun","TH Sarabun New","Leelawadee UI","Tahoma",sans-serif;color:#000;margin:0;background:#eef1f5;font-size:11px}
        .toolbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:center;gap:12px;padding:10px;background:#1f2937;color:#fff}
        .toolbar button{border:0;border-radius:6px;padding:9px 18px;background:#fff;color:#111827;font-weight:700;font-size:14px;cursor:pointer}
        .sheet{width:min(100%,850px);margin:18px auto;background:#fff;padding:20px 22px;box-shadow:0 8px 30px rgba(24,39,75,.14)}
        .report-header{text-align:center;border-bottom:1.5px solid #000;padding-bottom:8px;margin-bottom:12px}
        .school-emblem{display:block;width:64px;height:64px;object-fit:contain;margin:0 auto 5px}
        .school-emblem-placeholder{height:3px}
        h1{font-size:18px;line-height:1.3;margin:2px 0 2px;color:#000;font-weight:700}
        .school-name{font-size:13px;font-weight:700;line-height:1.3}
        .school-detail{font-size:9.5px;line-height:1.3}
        .report-meta{margin-top:3px;color:#000;font-size:10.5px}
        .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 12px}
        .summary-box{border:1px solid #000;padding:6px;text-align:center;background:#fff}
        .summary-box strong{display:block;font-size:15px;color:#000}
        table{width:100%;border-collapse:collapse;table-layout:auto;font-size:9.5px}
        thead{display:table-header-group}
        th,td{border:1px solid #000;padding:4px 5px;text-align:center;vertical-align:middle}
        th{background:#f1f1f1;color:#000;font-weight:700}
        tr{break-inside:avoid;page-break-inside:avoid}
        .text-left{text-align:left}
        .nowrap{white-space:nowrap}
        .small-table{font-size:7px;table-layout:fixed}
        .small-table th,.small-table td{padding:3px 1px}
        .matrix-table{font-size:6.5px;table-layout:fixed}
        .matrix-table th,.matrix-table td{padding:3px 1px;line-height:1.15}
        .matrix-table th:nth-child(1),.matrix-table td:nth-child(1){width:4%}
        .matrix-table th:nth-child(2),.matrix-table td:nth-child(2){width:8%}
        .matrix-table th:nth-child(3),.matrix-table td:nth-child(3){width:24%}
        .checklist-section{break-inside:avoid;page-break-inside:avoid}
        .checklist-section + .checklist-section{break-before:page;page-break-before:always;padding-top:4px}
        .checklist-section h2{font-size:11px;text-align:left;margin:0 0 5px}
        .checklist-table{font-size:6.5px;table-layout:fixed}
        .checklist-table th,.checklist-table td{padding:2px 1px;line-height:1.1}
        .checklist-table th:nth-child(1),.checklist-table td:nth-child(1){width:4%}
        .checklist-table th:nth-child(2),.checklist-table td:nth-child(2){width:8%}
        .checklist-table th:nth-child(3),.checklist-table td:nth-child(3){width:25%}
        .signature-section{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:30px;break-inside:avoid;page-break-inside:avoid;text-align:center;font-size:9px;line-height:1.55}
        .signature-cell{min-height:58px}
        .footer-note{margin-top:9px;color:#333;text-align:right;font-size:8px}
        @media print{
          body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .toolbar{display:none!important}
          .sheet{width:100%;margin:0;padding:0;box-shadow:none}
        }
      </style></head><body>` +
      '<div class="toolbar"><span>เลือก “บันทึกเป็น PDF” และปิดตัวเลือก “ส่วนหัวและส่วนท้าย” เพื่อเอกสารราชการที่สะอาด</span><button onclick="window.print()">พิมพ์ / บันทึก PDF</button></div>' +
      `<main class="sheet"><header class="report-header">${logo}<h1>${escapeHtml(title)}</h1>${schoolName}${affiliation}${address}${phone}${meta}</header>${body}${signatures}${footerNote}</main>` +
      '<script>window.addEventListener("load",async function(){await Promise.all(Array.from(document.images).map(function(img){return img.complete?Promise.resolve():new Promise(function(resolve){img.addEventListener("load",resolve,{once:true});img.addEventListener("error",resolve,{once:true})})}));setTimeout(function(){window.print()},300)});<\/script></body></html>';
    return URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  }

  function attendanceSummaryTable(rows) {
    const body = (rows || []).map((item, index) => {
      const present = number(item.present);
      const leave = number(item.leave);
      const absent = number(item.absent);
      const total = number(item.total, present + leave + absent);
      const percentage = total ? ((present / total) * 100).toFixed(1) : '0.0';
      return `<tr><td>${index + 1}</td><td>${escapeHtml(item.studentId)}</td><td class="text-left">${escapeHtml(item.name || '-')}</td>` +
        `<td>${present}</td><td>${leave}</td><td>${absent}</td><td>${total}</td><td>${percentage}%</td></tr>`;
    }).join('');
    return '<table><thead><tr><th>ลำดับ</th><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>มา</th><th>ลา</th><th>ขาด</th><th>รวมวันเรียน</th><th>ร้อยละมาเรียน</th></tr></thead>' +
      `<tbody>${body || '<tr><td colspan="8">ไม่พบข้อมูลการมาเรียน</td></tr>'}</tbody></table>`;
  }

  const externalLibraryLoads = {};
  function loadExternalLibrary(url, globalName) {
    if (global[globalName]) return Promise.resolve(global[globalName]);
    if (!externalLibraryLoads[url]) {
      externalLibraryLoads[url] = new Promise((resolve, reject) => {
        const script = global.document.createElement('script');
        script.src = url;
        script.onload = () => (global[globalName] ? resolve(global[globalName]) : reject(new Error(`โหลด ${globalName} ไม่สำเร็จ`)));
        script.onerror = () => { delete externalLibraryLoads[url]; reject(new Error(`โหลดไลบรารี ${globalName} ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่`)); };
        global.document.head.appendChild(script);
      });
    }
    return externalLibraryLoads[url];
  }

  function attendancePdfExporter() {
    if (!global.PP5PDF) throw new Error('ไม่สามารถเริ่มระบบสร้าง PDF ได้ กรุณารีเฟรชหน้าเว็บแล้วลองใหม่');
    return global.PP5PDF;
  }

  // สวิตช์ลายน้ำ "ผลระหว่างปี" (หน้าตั้งค่าระบบ, settings_json.interim_watermark) ค่าเริ่มต้นเปิด
  async function interimWatermarkOn_(grade) {
    if (semesterJudgedGrade_(grade)) return false;
    try { return (await data.settings.get())?.interimWatermark !== false; } catch (_) { return true; }
  }

  // ข้อความลายน้ำที่โรงเรียนพิมพ์เอง (ว่าง = ข้อความเดิมใน pdf-export)
  async function interimWatermarkText_() {
    try { return text((await data.settings.get())?.interimWatermarkText).trim(); } catch (_) { return ''; }
  }

  async function attendancePrintOptions(grade, classNo, detail, requestedYear) {
    const settings = await data.settings.get();
    const schoolName = text(settings.schoolName || settings.school_name || 'โรงเรียน');
    const classTeachers = settings.class_teachers || settings.settings_json?.class_teachers || {};
    const teacherValue = classTeachers[`${grade}/${classNo}`] || classTeachers[`${grade}-${classNo}`] || classTeachers[grade] || '';
    let assignedTeacher = '';
    try {
      const academicYear = text(requestedYear || settings.academicYear || settings.academic_year);
      const assignments = await optionalTable('teacher_assignments', (query) => {
        let scoped = query.eq('grade', grade).eq('room', text(classNo || '1'));
        if (academicYear) scoped = scoped.eq('academic_year', academicYear);
        return scoped.eq('active', true).limit(1);
      });
      assignedTeacher = homeroomTeacherDisplay(assignments[0]);
    } catch (error) {
      console.warn('ไม่สามารถอ่านชื่อครูประจำชั้นสำหรับเอกสาร PDF ได้:', error.message);
    }
    const classTeacher = assignedTeacher || text(teacherValue?.name || teacherValue?.teacherName || teacherValue);
    const sigSettings = await getSchoolSignatures();
    const directorSignature = sigSettings.director || '';
    const academicHeadSignature = sigSettings.academicHead || '';
    const schoolStamp = sigSettings.schoolStamp || '';
    const teacherSigs = sigSettings.teachers || {};
    const teacherSignature = (grade && classNo && teacherSigs[`${grade}/${classNo}`]) ||
      (grade && classNo && teacherSigs[`${grade}-${classNo}`]) ||
      (grade && teacherSigs[`${grade}/1`]) ||
      (grade && teacherSigs[grade]) ||
      teacherSigs.default ||
      (typeof teacherSigs === 'string' ? teacherSigs : '') ||
      sigSettings.teacher || '';
    const includeSignatures = sigSettings.includeSignatures !== false;

    return {
      official: true,
      orientation: 'portrait',
      schoolName,
      schoolAddress: text(settings.schoolAddress || settings.school_address),
      affiliation: text(settings.affiliation || settings.settings_json?.affiliation),
      schoolPhone: text(settings.schoolPhone || settings.school_phone || settings.phone || settings.settings_json?.phone),
      footerNote: text(settings.footerNote || settings.footer_note || settings.settings_json?.footer_note),
      logo: settings.logo_base64 || settings.logoDataUrl || settings.logo || settings.settings_json?.logo || '',
      meta: `ชั้น ${grade} ห้อง ${classNo}${detail ? ` - ${detail}` : ''}`,
      grade,
      classNo,
      classTeacher,
      academicHead: text(settings.academicHead || settings.academic_head || settings.settings_json?.academic_head),
      academicYear: text(requestedYear || settings.academicYear || settings.academic_year),
      directorName: text(settings.directorName || settings.director_name),
      directorPosition: text(settings.director_position || settings.directorPosition || 'ผู้อำนวยการโรงเรียน'),
      teacherSignature,
      academicHeadSignature,
      directorSignature,
      schoolStamp,
      includeSignatures
    };
  }

  function scorePdfExporter() {
    if (!global.PP5PDF?.createScoreSheet) {
      throw new Error('ไม่สามารถเริ่มระบบสร้าง PDF คะแนนได้ กรุณารีเฟรชหน้าเว็บแล้วลองใหม่');
    }
    return global.PP5PDF;
  }

  async function pdfObjectUrlToBase64(url) {
    if (typeof url !== 'string' || !url) throw new Error('ระบบสร้างไฟล์ PDF ไม่ส่งข้อมูลกลับมา');
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`อ่านไฟล์ PDF ไม่สำเร็จ: HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }
      return btoa(binary);
    } finally {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
  }

  // ลำดับนักเรียนใน PDF คะแนนรายวิชา: 'gender' = ชายก่อนหญิง แล้วตามเลขประจำตัว, 'id' = ตามเลขประจำตัว
  // หน้ากรอกคะแนนเลือกผ่านเมนูของปุ่ม PDF (spa-main.js → PP5ScorePdfSort) ไม่เช่นนั้นใช้ลำดับที่หน้าแสดงอยู่
  function scorePdfSortMode() {
    const chosen = text(global.PP5ScorePdfSort || global._scoreSortMode).trim();
    return chosen === 'id' ? 'id' : 'gender';
  }

  function sortScorePdfStudents(students) {
    const mode = scorePdfSortMode();
    const idNumber = (student) => {
      const parsed = parseInt(text(student.id), 10);
      return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
    };
    const isMale = (student) => text(student.gender).includes('ชาย');
    return [...(students || [])].sort((left, right) => {
      if (mode === 'gender' && isMale(left) !== isMale(right)) return isMale(left) ? -1 : 1;
      return idNumber(left) - idNumber(right) || text(left.id).localeCompare(text(right.id));
    });
  }

  async function scorePdfSource(subjectName, subjectCode, grade, classNo) {
    const subjects = await data.subjects.list(grade);
    const targetName = normalizedSubjectLabel(subjectName);
    const targetCode = normalizedSubjectLabel(subjectCode);
    const subject = subjects.find((item) => {
      const name = normalizedSubjectLabel(item.name || item.subjectName);
      const code = normalizedSubjectLabel(item.code || item.subjectCode || item.id);
      return matchSubjectCandidate(item, targetName, targetCode) || (targetCode && code === targetCode) || (targetName && name === targetName);
    });
    if (!subject) throw new Error(`ไม่พบรายวิชา ${subjectName || subjectCode} ของชั้น ${grade}`);
    const academicYear = await currentYear();
    const students = sortScorePdfStudents(await data.students.list({ grade, room: classNo, academicYear }));
    if (!students.length) throw new Error(`ไม่พบนักเรียนในชั้น ${grade}/${classNo}`);
    const rows = await scoreRowsForSubject(subject.id, academicYear, students.map((student) => text(student.id)));
    const term1 = legacyTermScoreData(students, rows.filter((row) => number(row.semester, 1) === 1), subject);
    const term2 = legacyTermScoreData(students, rows.filter((row) => number(row.semester, 1) === 2), subject);
    return { subject, academicYear, students, term1, term2 };
  }

  function scorePdfYearData(source) {
    const term2Map = new Map(source.term2.rows.map((row) => [text(row.id), row]));
    const average = (first, second) => Math.round(((number(first) + number(second)) / 2) * 100) / 100;
    const fullScores = source.term1.fullScores.some((value) => number(value) > 0)
      ? source.term1.fullScores
      : source.term2.fullScores;
    return {
      fullScores,
      fullFinal: Math.max(number(source.term1.fullFinal), number(source.term2.fullFinal)),
      rows: source.term1.rows.map((first) => {
        const second = term2Map.get(text(first.id));
        const saved = Boolean(first.saved && second?.saved);
        if (!saved) return { id: first.id, name: first.name, saved: false, scores: [], mid: '', final: '', total: '', grade: '' };
        const scores = Array.from({ length: 9 }, (_item, index) => average(first.scores?.[index], second.scores?.[index]));
        const mid = average(first.mid, second.mid);
        const finalScore = average(first.final, second.final);
        const total = Math.round((mid + finalScore) * 100) / 100;
        return {
          id: first.id,
          name: first.name,
          saved: true,
          scores,
          mid,
          final: finalScore,
          total,
          grade: data.helpers.calculateGrade(total)
        };
      })
    };
  }

  async function classPrintResult(title, grade, classNo) {
    const students = await data.students.list({ grade, room: classNo });
    const rows = students.map((student, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(student.id)}</td><td>${escapeHtml(student.fullName)}</td><td>${escapeHtml(student.grade)}/${escapeHtml(student.classNo)}</td></tr>`).join('');
    const options = await attendancePrintOptions(grade, classNo, title);
    const url = printUrl(title, `<table><thead><tr><th>ที่</th><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>ชั้น</th></tr></thead><tbody>${rows}</tbody></table>`, options);
    return { success: true, url, viewUrl: url, downloadUrl: url, count: students.length, format: 'html-print' };
  }

  async function csvForClass(grade, classNo) {
    const students = await data.students.list({ grade, room: classNo });
    const lines = ['ลำดับ,รหัสนักเรียน,เลขประจำตัวประชาชน,ชื่อ-นามสกุล,ชั้น,ห้อง'];
    students.forEach((student, index) => {
      const values = [index + 1, student.id, student.idCard, student.fullName, student.grade, student.classNo]
        .map((value) => `"${text(value).replaceAll('"', '""')}"`);
      lines.push(values.join(','));
    });
    return '\uFEFF' + lines.join('\r\n');
  }

  const SCHOOLMIS_SCORE_HEADERS = [
    'ที่', 'รหัสนักเรียน', 'เลข ปชช.', 'ชื่อ', 'นามสกุล',
    'ครั้งที่ 1', 'ครั้งที่ 2', 'ครั้งที่ 3', 'ครั้งที่ 4', 'รวม',
    'ครั้งที่5', 'แก้ตัวกลางภาค', 'ครั้งที่6', 'ครั้งที่7', 'ครั้งที่8', 'ครั้งที่9', 'รวม',
    'รวมระหว่างภาค', 'ครั้งที่10ปลายภาค', 'ทั้งหมด', 'เกรด'
  ];

  function schoolMisCsvCell(value) {
    if (value === null || value === undefined) return '';
    const output = text(value);
    return /[",\r\n]/.test(output) ? `"${output.replaceAll('"', '""')}"` : output;
  }

  function schoolMisStudentNames(student) {
    const firstName = text(student.firstname || student.firstName || student.first_name).trim();
    const lastName = text(student.lastname || student.lastName || student.last_name).trim();
    if (firstName || lastName) return { firstName, lastName };
    const withoutPrefix = studentDisplayName(student)
      .replace(/^(เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|นาย|นางสาว|น\.ส\.|นาง)\s*/, '')
      .trim();
    const parts = withoutPrefix.split(/\s+/).filter(Boolean);
    return { firstName: parts.shift() || '', lastName: parts.join(' ') };
  }

  function schoolMisTimestamp() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).formatToParts(new Date()).reduce((result, item) => ({ ...result, [item.type]: item.value }), {});
    return `${parts.year}${parts.month}${parts.day}_${parts.hour}${parts.minute}${parts.second}`;
  }

  function schoolMisScoreResult(row, fullScores, fullFinal, config) {
    const scores = Array.from({ length: 9 }, (_item, index) => number(row?.scores?.[index], 0));
    const sum14 = scores.slice(0, 4).reduce((sum, value) => sum + value, 0);
    const sum69 = scores.slice(5, 9).reduce((sum, value) => sum + value, 0);
    const rawFormative = scores.reduce((sum, value) => sum + value, 0);
    const rawFull = fullScores.reduce((sum, value) => sum + value, 0);
    const mid = rawFull === config.midMax
      ? rawFormative
      : Math.round((rawFormative / rawFull) * config.midMax * 10) / 10;
    const finalScore = number(row?.final, 0);
    const total = Math.round((mid + finalScore) * 10) / 10;
    return {
      scores, sum14, sum69, mid, finalScore, total,
      grade: data.helpers.calculateGrade(total),
      makeup: row?.makeup === undefined || row?.makeup === null ? '' : row.makeup,
      fullFinal
    };
  }

  function schoolMisValidationError(errors) {
    if (!errors.length) return;
    const shown = errors.slice(0, 6);
    const more = errors.length > shown.length ? ` และอีก ${errors.length - shown.length} รายการ` : '';
    throw new Error(`ยังส่งออก SchoolMIS ไม่ได้: ${shown.join(' | ')}${more}`);
  }

  async function schoolMisSource(sheetName) {
    const reference = await resolveLegacyScoreSheet(sheetName);
    const academicYear = await currentYear();
    const students = await data.students.list({
      grade: reference.grade,
      room: reference.classNo,
      academicYear
    });
    if (!students.length) throw new Error(`ไม่พบนักเรียนในชั้น ${reference.grade}/${reference.classNo}`);
    const studentIds = students.map((student) => text(student.id)).filter(Boolean);
    const rows = await scoreRowsForSubject(reference.subject.id, academicYear, studentIds);
    const term1 = legacyTermScoreData(
      students,
      rows.filter((row) => number(row.semester, 1) === 1),
      reference.subject
    );
    const term2 = legacyTermScoreData(
      students,
      rows.filter((row) => number(row.semester, 1) === 2),
      reference.subject
    );
    return { reference, academicYear, students, term1, term2 };
  }

  function validateSchoolMisSource(source, terms) {
    const config = subjectScoreConfig(source.reference.subject);
    const errors = [];
    if (config.midMax <= 0 || config.finalMax <= 0 || config.midMax + config.finalMax !== 100) {
      errors.push(`สัดส่วนคะแนนวิชาไม่ครบ 100 (${config.midMax}+${config.finalMax})`);
    }
    terms.forEach((term) => {
      const fullScores = term.fullScores.map((value) => number(value, 0));
      const rawFull = fullScores.reduce((sum, value) => sum + value, 0);
      if (rawFull <= 0) errors.push('ยังไม่ได้กำหนดคะแนนเต็มครั้งที่ 1-9');
      term.rows.forEach((row) => {
        if (!row.saved) return;
        row.scores.forEach((value, index) => {
          const score = number(value, 0);
          const maximum = fullScores[index];
          if (score < 0 || (maximum >= 0 && score > maximum)) {
            errors.push(`รหัส ${row.id} คะแนนครั้งที่ ${index + 1} เกินคะแนนเต็ม`);
          }
        });
        const finalScore = number(row.final, 0);
        if (finalScore < 0 || finalScore > number(term.fullFinal, config.finalMax)) {
          errors.push(`รหัส ${row.id} คะแนนปลายภาคเกินคะแนนเต็ม`);
        }
      });
    });
    source.students.forEach((student) => {
      const studentId = text(student.id).trim();
      const idCard = text(student.idCard || student.id_card || student.national_id).replace(/\D/g, '');
      if (!studentId) errors.push('พบนักเรียนที่ไม่มีรหัสนักเรียน');
      if (idCard.length !== 13) errors.push(`รหัส ${studentId || '-'} เลขบัตรประชาชนไม่ครบ 13 หลัก`);
      const names = schoolMisStudentNames(student);
      if (!names.firstName || !names.lastName) errors.push(`รหัส ${studentId || '-'} ชื่อหรือนามสกุลไม่ครบ`);
    });
    schoolMisValidationError(errors);
    return config;
  }

  function schoolMisRowsForTerm(source, term, config, sortMode) {
    const rowMap = new Map(term.rows.map((row) => [text(row.id), row]));
    const missing = source.students.filter((student) => !rowMap.get(text(student.id))?.saved);
    schoolMisValidationError(missing.map((student) => `รหัส ${student.id} ยังไม่บันทึกคะแนนภาคเรียนนี้`));
    return source.students.map((student) => {
      const row = rowMap.get(text(student.id));
      return { student, result: schoolMisScoreResult(row, term.fullScores, term.fullFinal, config) };
    }).sort((a, b) => {
      if (sortMode === 'gender') {
        const aMale = /ชาย|^นาย/.test(text(a.student.gender || a.student.title || a.student.prefix));
        const bMale = /ชาย|^นาย/.test(text(b.student.gender || b.student.title || b.student.prefix));
        if (aMale !== bMale) return aMale ? -1 : 1;
      }
      return text(a.student.id).localeCompare(text(b.student.id), undefined, { numeric: true });
    });
  }

  function schoolMisRowsForAverage(source, config, sortMode) {
    const term1Map = new Map(source.term1.rows.map((row) => [text(row.id), row]));
    const term2Map = new Map(source.term2.rows.map((row) => [text(row.id), row]));
    const missing = [];
    const rows = source.students.map((student) => {
      const studentId = text(student.id);
      const row1 = term1Map.get(studentId);
      const row2 = term2Map.get(studentId);
      if (!row1?.saved || !row2?.saved) {
        missing.push(`รหัส ${studentId} คะแนนยังไม่ครบ 2 ภาคเรียน`);
        return null;
      }
      const first = schoolMisScoreResult(row1, source.term1.fullScores, source.term1.fullFinal, config);
      const second = schoolMisScoreResult(row2, source.term2.fullScores, source.term2.fullFinal, config);
      const scores = first.scores.map((value, index) => Math.ceil((value + second.scores[index]) / 2));
      const mid = Math.min(config.midMax, Math.ceil((first.mid + second.mid) / 2));
      const finalScore = Math.min(config.finalMax, Math.ceil((first.finalScore + second.finalScore) / 2));
      const total = mid + finalScore;
      return {
        student,
        result: {
          scores,
          sum14: scores.slice(0, 4).reduce((sum, value) => sum + value, 0),
          sum69: scores.slice(5, 9).reduce((sum, value) => sum + value, 0),
          mid,
          finalScore,
          total,
          grade: data.helpers.calculateGrade(total),
          makeup: ''
        }
      };
    });
    schoolMisValidationError(missing);
    return rows.filter(Boolean).sort((a, b) => {
      if (sortMode === 'gender') {
        const aMale = /ชาย|^นาย/.test(text(a.student.gender || a.student.title || a.student.prefix));
        const bMale = /ชาย|^นาย/.test(text(b.student.gender || b.student.title || b.student.prefix));
        if (aMale !== bMale) return aMale ? -1 : 1;
      }
      return text(a.student.id).localeCompare(text(b.student.id), undefined, { numeric: true });
    });
  }

  function schoolMisCsvContent(rows) {
    const lines = [SCHOOLMIS_SCORE_HEADERS.map(schoolMisCsvCell).join(',')];
    rows.forEach(({ student, result }, index) => {
      const names = schoolMisStudentNames(student);
      const idCard = text(student.idCard || student.id_card || student.national_id).replace(/\D/g, '');
      const values = [
        index + 1, student.id, idCard, names.firstName, names.lastName,
        result.scores[0], result.scores[1], result.scores[2], result.scores[3], result.sum14,
        result.scores[4], result.makeup,
        result.scores[5], result.scores[6], result.scores[7], result.scores[8], result.sum69,
        result.mid, result.finalScore, result.total, result.grade
      ];
      lines.push(values.map(schoolMisCsvCell).join(','));
    });
    return lines.join('\r\n');
  }

  async function schoolMisExport(sheetName, term, sortMode, average) {
    const source = await schoolMisSource(sheetName);
    const config = validateSchoolMisSource(source, average ? [source.term1, source.term2] : [term === 'term2' ? source.term2 : source.term1]);
    const rows = average
      ? schoolMisRowsForAverage(source, config, sortMode)
      : schoolMisRowsForTerm(source, term === 'term2' ? source.term2 : source.term1, config, sortMode);
    const csvContent = schoolMisCsvContent(rows);
    const suffix = average ? 'เฉลี่ย2ภาค' : (term === 'term2' ? 'term2' : 'term1');
    const fileName = `${sheetName}_${suffix}_SchoolMIS_${schoolMisTimestamp()}.csv`;
    return {
      success: true,
      csvContent,
      fileName,
      studentCount: rows.length,
      base64: btoa(unescape(encodeURIComponent(`\uFEFF${csvContent}`))),
      mimeType: 'text/csv;charset=utf-8',
      message: `ส่งออก SchoolMIS สำเร็จ ${rows.length} คน`
    };
  }

  // SchoolMIS "ไฟล์นำเข้า gpa" template (downloaded from SchoolMIS, scores blank): fill PP5 scores
  // into SchoolMIS's own file, keeping its header line, row order, รหัส/เลข ปชช./ชื่อ cells, BOM
  // and line endings, so the upload back into SchoolMIS matches what it produced. Students are
  // matched by รหัสนักเรียน, then by เลข ปชช. Read-only toward the database.
  const schoolMisNameKey = (value) => text(value).replace(/\s+/g, '').trim();
  const schoolMisDigits = (value) => text(value).replace(/\D/g, '');

  function parseSchoolMisTemplate(source) {
    const raw = text(source);
    const bom = raw.startsWith('\uFEFF');
    const body = bom ? raw.slice(1) : raw;
    const eol = body.includes('\r\n') ? '\r\n' : '\n';
    const firstBreak = body.search(/\r?\n/);
    const headerLine = firstBreak < 0 ? body : body.slice(0, firstBreak);
    const header = (parseCsv(`${headerLine}\n`)[0] || []).map((cell) => text(cell).replace(/\s+/g, ' ').trim());
    const expected = SCHOOLMIS_SCORE_HEADERS;
    if (header.length !== expected.length || header.some((cell, index) => cell !== expected[index])) {
      throw new Error('ไฟล์นี้ไม่ใช่แม่แบบ "ไฟล์นำเข้า gpa" ของ SchoolMIS (หัวคอลัมน์ไม่ตรง 21 ช่อง)');
    }
    const rows = parseCsv(firstBreak < 0 ? '' : body.slice(firstBreak).replace(/^\r?\n/, ''))
      .filter((cells) => cells.some((cell) => text(cell).trim()))
      .map((cells) => {
        const padded = Array.from({ length: expected.length }, (_item, index) => text(cells[index]));
        return { cells: padded, id: padded[1].trim(), idCard: schoolMisDigits(padded[2]), firstName: padded[3].trim(), lastName: padded[4].trim() };
      });
    if (!rows.length) throw new Error('ไฟล์แม่แบบไม่มีรายชื่อนักเรียน');
    return { bom, eol, headerLine, trailingNewline: /\r?\n$/.test(body), rows };
  }

  // pp5Rows: [{ student, result }] from schoolMisRowsForTerm / schoolMisRowsForAverage.
  function fillSchoolMisTemplate(template, pp5Rows) {
    const byId = new Map(pp5Rows.map((row) => [text(row.student.id).trim(), row]));
    const cardOf = (student) => schoolMisDigits(student.idCard || student.id_card || student.national_id);
    const byCard = new Map(pp5Rows.filter((row) => cardOf(row.student)).map((row) => [cardOf(row.student), row]));
    const used = new Set();
    const report = { filled: 0, notInSystem: [], notInTemplate: [], matchedByIdCard: [], idCardMismatch: [], nameMismatch: [] };
    const lines = [template.headerLine];
    template.rows.forEach((row) => {
      let match = row.id ? byId.get(row.id) : null;
      if (!match && row.idCard) {
        match = byCard.get(row.idCard) || null;
        if (match) report.matchedByIdCard.push({ id: row.id, systemId: text(match.student.id), name: `${row.firstName} ${row.lastName}`.trim() });
      }
      if (!match || used.has(match)) {
        report.notInSystem.push({ id: row.id, name: `${row.firstName} ${row.lastName}`.trim() });
        lines.push(row.cells.map(schoolMisCsvCell).join(','));
        return;
      }
      used.add(match);
      const card = cardOf(match.student);
      if (card && row.idCard && card !== row.idCard) report.idCardMismatch.push({ id: row.id, name: `${row.firstName} ${row.lastName}`.trim() });
      const names = schoolMisStudentNames(match.student);
      if (schoolMisNameKey(names.firstName) !== schoolMisNameKey(row.firstName) || schoolMisNameKey(names.lastName) !== schoolMisNameKey(row.lastName)) {
        report.nameMismatch.push({ id: row.id, schoolmis: `${row.firstName} ${row.lastName}`.trim(), system: `${names.firstName} ${names.lastName}`.trim() });
      }
      const result = match.result;
      const values = [
        ...row.cells.slice(0, 5),
        result.scores[0], result.scores[1], result.scores[2], result.scores[3], result.sum14,
        result.scores[4], result.makeup,
        result.scores[5], result.scores[6], result.scores[7], result.scores[8], result.sum69,
        result.mid, result.finalScore, result.total, result.grade
      ];
      lines.push(values.map(schoolMisCsvCell).join(','));
      report.filled += 1;
    });
    pp5Rows.filter((row) => !used.has(row)).forEach((row) => {
      const names = schoolMisStudentNames(row.student);
      report.notInTemplate.push({ id: text(row.student.id), name: `${names.firstName} ${names.lastName}`.trim() });
    });
    const content = (template.bom ? '\uFEFF' : '') + lines.join(template.eol) + (template.trailingNewline ? template.eol : '');
    return { content, report };
  }

  async function schoolMisFillTemplate(templateText, sheetName, mode, fileName) {
    const template = parseSchoolMisTemplate(templateText);
    const average = mode === 'average';
    const term = mode === 'term2' ? 'term2' : 'term1';
    const source = await schoolMisSource(sheetName);
    const config = validateSchoolMisSource(source, average ? [source.term1, source.term2] : [term === 'term2' ? source.term2 : source.term1]);
    const rows = average
      ? schoolMisRowsForAverage(source, config, 'id')
      : schoolMisRowsForTerm(source, term === 'term2' ? source.term2 : source.term1, config, 'id');
    const { content, report } = fillSchoolMisTemplate(template, rows);
    // Keep SchoolMIS's own file name: it carries the school/subject/term codes SchoolMIS issued.
    const outName = /\.csv$/i.test(text(fileName)) ? text(fileName) : `${sheetName}_SchoolMIS.csv`;
    return {
      success: true,
      fileName: outName,
      report,
      base64: btoa(unescape(encodeURIComponent(content))),
      mimeType: 'text/csv;charset=utf-8',
      message: `เติมคะแนนลงแม่แบบ SchoolMIS ${report.filled} จาก ${template.rows.length} คน`
    };
  }

  async function classScoreCsvExport(grade, classNo, sortMode) {
    const academicYear = await currentYear();
    const [students, subjects] = await Promise.all([
      data.students.list({ grade, room: classNo, academicYear }),
      data.subjects.list(grade)
    ]);
    if (!students.length) throw new Error(`ไม่พบนักเรียนในชั้น ${grade}/${classNo}`);
    const activeSubjects = subjects.filter((subject) => subject.active !== false);
    const studentIds = students.map((student) => text(student.id)).filter(Boolean);
    const { data: rows, error } = await client.from('scores').select('*')
      .eq('academic_year', academicYear)
      .in('student_id', studentIds);
    if (error) throw new Error(`อ่านคะแนนสำหรับ CSV ไม่สำเร็จ: ${error.message}`);
    const grouped = new Map();
    (rows || []).forEach((row) => {
      const key = `${text(row.student_id)}|${text(row.subject_id)}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });
    const sortedStudents = [...students].sort((a, b) => {
      if (sortMode === 'gender') {
        const aMale = /ชาย|^นาย/.test(text(a.gender || a.title || a.prefix));
        const bMale = /ชาย|^นาย/.test(text(b.gender || b.title || b.prefix));
        if (aMale !== bMale) return aMale ? -1 : 1;
      }
      return text(a.id).localeCompare(text(b.id), undefined, { numeric: true });
    });
    const header = ['#', 'รหัสนักเรียน', 'ชื่อ-สกุล'].concat(activeSubjects.map((subject) => {
      const code = text(subject.code || subject.subjectCode || subject.id).trim();
      return `${code} ${text(subject.name || subject.subjectName)}`.trim();
    }));
    const lines = [header.map(schoolMisCsvCell).join(',')];
    let missingScoreCount = 0;
    sortedStudents.forEach((student, index) => {
      const values = [index + 1, student.id, studentDisplayName(student)];
      activeSubjects.forEach((subject) => {
        const subjectRows = grouped.get(`${text(student.id)}|${text(subject.id)}`) || [];
        // a term counts only when its final exam is done (owner 2026-10-10, same rule as ปพ.5)
        const term1 = subjectRows.find((row) => number(row.semester, 1) === 1 && dashboardCompleteScore_(row));
        const term2 = subjectRows.find((row) => number(row.semester, 1) === 2 && dashboardCompleteScore_(row));
        if (!term1 && !term2) {
          missingScoreCount += 1;
          values.push('');
          return;
        }
        const average = yearlyScoreAverage(term1?.total_score, term2?.total_score, !!term1, !!term2);
        values.push(data.helpers.calculateGrade(average));
      });
      lines.push(values.map(schoolMisCsvCell).join(','));
    });
    const csvContent = lines.join('\r\n');
    const safeGrade = text(grade).replace(/[\/.]/g, '');
    const filename = `คะแนน_ชั้น${safeGrade}_ห้อง${classNo}_${academicYear}_${schoolMisTimestamp()}.csv`;
    return {
      success: true,
      base64Content: btoa(unescape(encodeURIComponent(`\uFEFF${csvContent}`))),
      filename,
      csvContent,
      studentCount: sortedStudents.length,
      missingScoreCount,
      message: missingScoreCount
        ? `สร้าง CSV แล้ว แต่ยังมีผลการเรียนว่าง ${missingScoreCount} ช่อง`
        : 'สร้าง CSV ผลการเรียนครบถ้วนแล้ว'
    };
  }

  async function filteredStudentList(grade, classNo, gender) {
    const students = await data.students.list({ grade, room: classNo });
    const requestedGender = text(gender).trim();
    return requestedGender
      ? students.filter((student) => text(student.gender).trim() === requestedGender)
      : students;
  }

  async function legacyStudentListPrintUrl(grade, classNo) {
    const academicYear = text(await currentYear());
    const students = await data.students.list({ grade, room: classNo, academicYear });
    if (!students.length) throw new Error('ไม่พบข้อมูลนักเรียนตามเงื่อนไขที่เลือก');
    const options = await attendancePrintOptions(grade, classNo, 'รายชื่อนักเรียน');
    options.academicYear = academicYear;
    options.meta = `ชั้น ${grade || 'ทุกระดับชั้น'} ${classNo ? `ห้อง ${classNo}` : 'ทุกห้อง'}${academicYear ? ` ปีการศึกษา ${academicYear}` : ''}`;
    return attendancePdfExporter().createLegacyStudentList(students, options);
  }

  async function legacyStudentRegistryPrintUrl(grade, classNo) {
    const academicYear = text(await currentYear());
    const students = await data.students.list({ grade, room: classNo, academicYear });
    if (!students.length) throw new Error('ไม่พบข้อมูลนักเรียนตามเงื่อนไขที่เลือก');
    const options = await attendancePrintOptions(grade, classNo, 'ทะเบียนข้อมูลนักเรียน ปพ.5');
    options.academicYear = academicYear;
    options.meta = `${registryGradeLabelForBridge(grade)}${classNo ? ` ห้อง ${classNo}` : ''} ปีการศึกษา ${academicYear}`;
    return attendancePdfExporter().createStudentRegistry(students, options);
  }


  async function parentInfoPdfUrl(grade, classNo) {
    const academicYear = text(await currentYear());
    const students = await data.students.list({ grade, room: classNo, academicYear });
    if (!students.length) throw new Error('ไม่พบข้อมูลนักเรียนตามเงื่อนไขที่เลือก');

    const options = await attendancePrintOptions(grade, classNo, 'ข้อมูลผู้ปกครอง');
    options.academicYear = academicYear || options.academicYear;
    options.meta = `${registryGradeLabelForBridge(grade)}${classNo ? ` ห้อง ${classNo}` : ''} ปีการศึกษา ${options.academicYear || '-'}`;

    const exporter = attendancePdfExporter();
    if (typeof exporter.createParentInfoReport !== 'function') {
      throw new Error('ไม่สามารถเริ่มระบบสร้างรายงานผู้ปกครองได้ กรุณารีเฟรชหน้าเว็บแล้วลองใหม่');
    }

    const result = await exporter.createParentInfoReport(students, options);
    const url = typeof result === 'object'
      ? (result?.blobUrl || result?.dataUri || result?.viewUrl || result?.url || '')
      : result;
    if (!text(url)) throw new Error('ระบบสร้างรายงานผู้ปกครองไม่ส่งลิงก์ไฟล์กลับมา');
    return url;
  }


  function registryGradeLabelForBridge(grade) {
    const value = text(grade).trim();
    if (/^ป\.\d+$/.test(value)) return `ชั้นประถมศึกษาปีที่ ${value.replace('ป.', '')}`;
    if (/^ม\.\d+$/.test(value)) return `ชั้นมัธยมศึกษาปีที่ ${value.replace('ม.', '')}`;
    if (/^อ\.\d+$/.test(value)) return `ชั้นอนุบาล ${value.replace('อ.', '')}`;
    return value ? `ชั้น ${value}` : 'ทุกระดับชั้น';
  }

  const STUDENT_EXPORT_COLUMN_ORDER = [
    'order', 'studentNumber', 'studentId', 'fullName', 'nationalId',
    'birthDate', 'grade', 'room', 'gender'
  ];

  function normalizeStudentExportOptions(value) {
    const requested = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const columns = [...new Set(Array.isArray(requested.columns) ? requested.columns : [])]
      .filter((key) => STUDENT_EXPORT_COLUMN_ORDER.includes(key));
    if (!columns.length) columns.push('studentNumber', 'fullName', 'studentId');
    return { columns, scoreSlots: requested.scoreSlots === true };
  }

  function activeStudentExportOptions(candidate, fallback) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return normalizeStudentExportOptions(candidate);
    }
    if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) {
      return normalizeStudentExportOptions(fallback);
    }
    return normalizeStudentExportOptions(global.PP5StudentExportOptions);
  }

  function formatStudentBirthDate(value) {
    const source = text(value).trim();
    const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return source;
    const year = number(match[1]);
    return `${match[3]}/${match[2]}/${year < 2400 ? year + 543 : year}`;
  }

  function studentExportColumnDefinitions() {
    return {
      order: { label: 'ลำดับ', width: 8, value: (_student, index) => index + 1 },
      studentNumber: { label: 'เลขที่', width: 9, value: (student, index) => student.studentNumber || student.student_number || index + 1 },
      studentId: { label: 'รหัสนักเรียน', width: 14, value: (student) => student.id },
      fullName: { label: 'ชื่อ-นามสกุล', width: 34, value: (student) => student.fullName },
      nationalId: { label: 'เลขประจำตัวประชาชน', width: 20, value: (student) => student.idCard },
      birthDate: { label: 'วันเดือนปีเกิด', width: 16, value: (student) => formatStudentBirthDate(student.birthdate) },
      grade: { label: 'ระดับชั้น', width: 11, value: (student) => student.grade },
      room: { label: 'ห้อง', width: 8, value: (student) => student.classNo },
      gender: { label: 'เพศ', width: 9, value: (student) => student.gender }
    };
  }

  function legacyDownloadUrl(url) {
    const value = text(url);
    return {
      startsWith(prefix) {
        return prefix === 'http' || value.startsWith(prefix);
      },
      toString() { return value; },
      valueOf() { return value; },
      [Symbol.toPrimitive]() { return value; }
    };
  }

  async function studentListPrintUrl(grade, classNo, gender, exportSelection) {
    const students = await filteredStudentList(grade, classNo, gender);
    const selection = normalizeStudentExportOptions(exportSelection);
    const options = await attendancePrintOptions(grade, classNo, 'รายชื่อนักเรียน');
    const year = await currentYear();
    options.meta = [
      year ? `ปีการศึกษา ${year}` : '',
      grade ? `ระดับชั้น ${grade}` : 'ทุกระดับชั้น',
      classNo ? `ห้อง ${classNo}` : 'ทุกห้อง',
      gender ? `เพศ ${gender}` : 'ทุกเพศ',
      `นักเรียน ${students.length} คน`,
      selection.scoreSlots ? 'ช่องบันทึกคะแนน 10 ช่อง' : ''
    ].filter(Boolean).join(' · ');
    return attendancePdfExporter().createStudentList(students, options, selection);
  }

  async function studentListExcelUrl(grade, classNo, gender, exportSelection) {
    const students = await filteredStudentList(grade, classNo, gender);
    const selection = normalizeStudentExportOptions(exportSelection);
    const definitions = studentExportColumnDefinitions();
    const columns = selection.columns.map((key) => ({ key, ...definitions[key] }));
    if (selection.scoreSlots) {
      for (let index = 1; index <= 10; index += 1) {
        columns.push({ key: `score${index}`, label: `คะแนน ${index}`, width: 10, value: () => '' });
      }
    }
    const rows = students.map((student, index) => Object.fromEntries(
      columns.map((column) => [column.label, column.value(student, index)])
    ));
    const headers = columns.map((column) => column.label);
    if (global.XLSX?.utils && typeof global.XLSX.write === 'function') {
      const workbook = global.XLSX.utils.book_new();
      const worksheet = global.XLSX.utils.json_to_sheet(rows, { header: headers });
      worksheet['!cols'] = columns.map((column) => ({ wch: column.width }));
      global.XLSX.utils.book_append_sheet(workbook, worksheet, 'รายชื่อนักเรียน');
      const bytes = global.XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      return URL.createObjectURL(new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }));
    }
    const csvRows = [headers].concat(rows.map((row) => headers.map((header) => row[header])));
    const csv = '\uFEFF' + csvRows.map((row) => row.map((value) => `"${text(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    return URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  }

  async function saveSchoolSignatures(signaturesPayload) {
    const state = await data.auth.requireUser();
    const { data: settingsRow, error: sErr } = await client
      .from('school_settings')
      .select('id')
      .limit(1)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!settingsRow?.id) throw new Error('ไม่พบข้อมูลการตั้งค่าโรงเรียน');

    // Signature images must never fall back to publicly readable settings_json.
    try {
      const { data: rpcResult, error: rpcErr } = await client.rpc('pp5_save_school_signatures', {
        p_settings_id: settingsRow.id,
        p_payload: signaturesPayload
      });
      if (!rpcErr && rpcResult) {
        return rpcResult;
      }
      if (rpcErr && ['PGRST202', '42883'].includes(rpcErr.code)) {
        const error = new Error('ยังไม่ได้ติดตั้งระบบเก็บลายเซ็นแบบจำกัดสิทธิ์ กรุณาติดตั้ง migration 202609240014 ก่อนบันทึก');
        error.code = 'MIGRATION_REQUIRED';
        throw error;
      }
      if (rpcErr) throw new Error(`บันทึกลายเซ็นไม่สำเร็จ: ${rpcErr.message}`);
      throw new Error('ระบบเก็บลายเซ็นไม่ส่งผลยืนยัน กรุณาลองใหม่');
    } catch (err) {
      throw err;
    }
  }

  async function getSchoolSignatures() {
    let sigMap = {};
    let includeSignatures = true;
    try {
      const { data: privSig, error: sigErr } = await client
        .from('school_signatures')
        .select('signatures, include_signatures')
        .limit(1)
        .maybeSingle();
      if (!sigErr && privSig) {
        sigMap = privSig.signatures || {};
        includeSignatures = privSig.include_signatures !== false;
      }
    } catch (_) {}

    const settings = await data.settings.get().catch(() => ({}));

    return {
      director: sigMap.director || '',
      academicHead: sigMap.academicHead || '',
      schoolStamp: sigMap.schoolStamp || '',
      teachers: sigMap.teachers || {},
      teacher: sigMap.teacher || '',
      includeSignatures
    };
  }

  async function computeSchoolSarAnalytics(requestedYear) {
    const settings = await data.settings.get();
    const year = text(requestedYear || settings.academicYear || settings.academic_year || '2569');

    // 1. All students for the year
    let students = [];
    try {
      students = await data.students.list({ academicYear: year });
    } catch (e) {
      students = [];
    }
    if (!students.length) {
      try {
        students = await data.students.list({ active: true });
      } catch (e) {
        students = [];
      }
    }
    const totalStudents = students.length;
    const allStudentIds = Array.from(new Set([
      ...students.map((s) => text(s.id)),
      ...students.map((s) => text(s.student_id || s.studentId))
    ].filter(Boolean)));

    const studentCanonicalMap = {};
    students.forEach((s) => {
      const canon = text(s.id);
      studentCanonicalMap[canon] = canon;
      if (s.student_id) studentCanonicalMap[text(s.student_id)] = canon;
      if (s.studentId) studentCanonicalMap[text(s.studentId)] = canon;
    });

    // 2. All subjects
    let allSubjects = [];
    try {
      allSubjects = await optionalTableAll('subjects', (query) => query.select('*'));
    } catch (e) {
      allSubjects = [];
    }

    // 3. Scores for this year
    let scoreRows = [];
    if (allStudentIds.length) {
      try {
        scoreRows = await optionalTableAll('scores', (query) => query.in('student_id', allStudentIds).eq('academic_year', year));
      } catch (e) {
        scoreRows = [];
      }
    }

    // 4. 8 Learning Areas
    const AREA_DEFINITIONS = [
      { name: 'ภาษาไทย', test: (name, code) => /^ท/.test(code) || name.includes('ไทย') },
      { name: 'คณิตศาสตร์', test: (name, code) => /^ค/.test(code) || name.includes('คณิต') },
      { name: 'วิทยาศาสตร์และเทคโนโลยี', test: (name, code) => /^ว/.test(code) || /วิทย|คอมพิวเตอร์|เทคโนโลยี/.test(name) },
      { name: 'สังคมศึกษา ศาสนา และวัฒนธรรม', test: (name, code) => /^ส/.test(code) || /สังคม|ประวัติศาสตร์|ศาสนา|หน้าที่พลเมือง/.test(name) },
      { name: 'สุขศึกษาและพลศึกษา', test: (name, code) => /^พ/.test(code) || /สุข|พล/.test(name) },
      { name: 'ศิลปะ', test: (name, code) => /^ศ/.test(code) || /ศิลป|ดนตรี|นาฏศิลป์/.test(name) },
      { name: 'การงานอาชีพ', test: (name, code) => /^ง/.test(code) || /การงาน|อาชีพ/.test(name) },
      { name: 'ภาษาต่างประเทศ', test: (name, code) => /^อ|ฝ|จ|ญ/.test(code) || /อังกฤษ|ต่างประเทศ|จีน|ญี่ปุ่น/.test(name) }
    ];

    const actKeywords = ['กิจกรรม', 'แนะแนว', 'ลูกเสือ', 'เนตรนารี', 'ชุมนุม', 'สาธารณประโยชน์', 'ชมรม'];
    const academicSubjects = (allSubjects || []).filter((s) => {
      const code = text(s.code || s.subjectCode || s.subject_code);
      const name = text(s.name || s.subjectName || s.subject_name);
      const type = text(s.subject_type || s.type);
      return !type.includes('กิจกรรม') && !/^ก/.test(code) && !actKeywords.some((k) => name.includes(k));
    });

    const subjectAreaMap = {};
    const semesterSubjectById = new Map(academicSubjects.map((sub) => [text(sub.id), sub]));
    academicSubjects.forEach((sub) => {
      const code = text(sub.code || sub.subjectCode || sub.subject_code);
      const name = text(sub.name || sub.subjectName || sub.subject_name);
      const id = text(sub.id);
      let matchedArea = '';
      for (const def of AREA_DEFINITIONS) {
        if (def.test(name, code)) {
          matchedArea = def.name;
          break;
        }
      }
      if (!matchedArea && (/^อ/.test(code) || /อังกฤษ/.test(name))) {
        matchedArea = 'ภาษาต่างประเทศ';
      }
      if (matchedArea) {
        if (id) subjectAreaMap[id] = matchedArea;
        if (code) subjectAreaMap[code] = matchedArea;
        if (name) subjectAreaMap[name] = matchedArea;
      }
    });

    const toGradePoint = (s) => {
      const n = Number(s);
      if (isNaN(n) || s === '' || s === null) return null;
      const key = data.helpers.calculateGrade(n);
      return { key, point: Number(key) };
    };

    const subjectAreas = AREA_DEFINITIONS.map((def) => {
      const areaName = def.name;
      const areaRows = scoreRows.filter((r) => subjectAreaMap[text(r.subject_id)] === areaName);
      const counts = { '4': 0, '3.5': 0, '3': 0, '2.5': 0, '2': 0, '1.5': 0, '1': 0, '0': 0 };
      let evaluatedCount = 0;
      let pointSum = 0;

      // จัดกลุ่มคะแนนตามนักเรียนและรายวิชา
      const studentSubjectMap = new Map();
      areaRows.forEach((r) => {
        if (text(r.academic_year) !== text(year)) return;
        const rawSid = text(r.student_id);
        const sid = studentCanonicalMap[rawSid] || rawSid;
        const subId = text(r.subject_id);
        if (!sid || !subId) return;
        const key = `${sid}|${subId}`;
        if (!studentSubjectMap.has(key)) studentSubjectMap.set(key, []);
        studentSubjectMap.get(key).push(r);
      });

      const studentAreaScores = {};
      studentSubjectMap.forEach((rows, key) => {
        const sid = key.split('|')[0];
        const t1 = rows.find((r) => number(r.semester, 1) === 1);
        const t2 = rows.find((r) => number(r.semester, 1) === 2);
        const annualRow = rows.find((r) => r.is_annual === true || r.semester === 'year' || number(r.semester, 0) === 0);

        // owner 2026-10-10: GPA นับเฉพาะวิชาที่สอบปลายภาคแล้ว (กติกาเดียวกับ ปพ.5)
        const t1Entered = dashboardCompleteScore_(t1);
        const t2Entered = dashboardCompleteScore_(t2);
        const annualEntered = storedScoreWasEntered(annualRow) || storedScoreHasFinalGrade(annualRow);

        // ✅ เงื่อนไขสรุปเกรดประจำปี SAR:
        // ต้องมีคะแนนครบทั้ง 2 ภาคเรียน (เทอม 1 และ เทอม 2) หรือมีระเบียนเกรดประจำปีโดยเฉพาะเท่านั้น
        // หากเพิ่งมีคะแนนแค่ภาคเรียนเดียว (เช่น เทอม 1 อยู่ระหว่างปี) จะไม่นำมาตัดเป็นเกรดประจำปีล่วงหน้า
        let gp = null;
        // วิชารายภาค (ม.ต้น): ผลประจำปี = ผลของภาคของวิชานั้น
        const ownTerm = subjectSemester_(semesterSubjectById.get(key.split('|')[1]));
        if (ownTerm && dashboardCompleteScore_(ownTerm === 2 ? t2 : t1)) {
          const ownRow = ownTerm === 2 ? t2 : t1;
          const gradeRes = toGradePoint(number(ownRow.total_score, number(ownRow.formative_score, 0)));
          if (gradeRes) gp = gradeRes.point;
        } else if (ownTerm) {
          gp = null;
        } else if (t1Entered && t2Entered) {
          const t1Total = number(t1.total_score, number(t1.formative_score, 0));
          const t2Total = number(t2.total_score, number(t2.formative_score, 0));
          const annualAvg = yearlyScoreAverage(t1Total, t2Total, true, true);
          const gradeRes = toGradePoint(annualAvg);
          if (gradeRes) gp = gradeRes.point;
        } else if (annualEntered) {
          const annualTotal = [annualRow.total_score, annualRow.totalScore, storedScoreBreakdown(annualRow).total]
            .find((value) => value !== null && value !== undefined && text(value).trim() !== '');
          if (annualTotal !== undefined) {
            const gradeRes = toGradePoint(annualTotal);
            if (gradeRes) gp = gradeRes.point;
          } else if (annualRow.grade_point !== undefined && annualRow.grade_point !== null && text(annualRow.grade_point).trim() !== '' && text(annualRow.grade_point).trim() !== '-') {
            const num = Number(annualRow.grade_point);
            if (!isNaN(num)) gp = num;
          }
        }

        if (gp === null) return;
        if (!studentAreaScores[sid]) studentAreaScores[sid] = [];
        studentAreaScores[sid].push(gp);
      });

      const studentKeys = Object.keys(studentAreaScores);
      if (studentKeys.length > 0) {
        studentKeys.forEach((sid) => {
          const list = studentAreaScores[sid];
          if (!list.length) return;
          const avgScore = list.reduce((a, b) => a + b, 0) / list.length;
          let key = '0';
          if (avgScore >= 3.75) key = '4';
          else if (avgScore >= 3.25) key = '3.5';
          else if (avgScore >= 2.75) key = '3';
          else if (avgScore >= 2.25) key = '2.5';
          else if (avgScore >= 1.75) key = '2';
          else if (avgScore >= 1.25) key = '1.5';
          else if (avgScore >= 0.75) key = '1';
          counts[key]++;
          pointSum += avgScore;
          evaluatedCount++;
        });
      }

      const goodPlus = (counts['4'] || 0) + (counts['3.5'] || 0) + (counts['3'] || 0);
      const goodPlusPct = evaluatedCount > 0 ? ((goodPlus / evaluatedCount) * 100).toFixed(1) + '%' : '-';
      const meanGpa = evaluatedCount > 0 ? (pointSum / evaluatedCount).toFixed(2) : '-';

      return {
        name: areaName,
        total: evaluatedCount,
        counts,
        goodPlus,
        goodPlusCount: goodPlus,
        goodPlusPct,
        meanGpa
      };
    });

    // 5. 4 Dimensions
    let assessRows = [];
    if (allStudentIds.length) {
      try {
        assessRows = await optionalTableAll('assessments', (query) => query.in('student_id', allStudentIds).eq('academic_year', year));
      } catch (e) {
        assessRows = [];
      }
    }

    const rowsByStudent = groupBy(assessRows.filter((row) => text(row.academic_year) === text(year)), (row) => {
      const rawId = text(row.student_id);
      return studentCanonicalMap[rawId] || rawId;
    });
    // Annual SAR and PP6 use the school's confirmed rule:
    // Assessment results from Semester 2 serve as the final annual evaluation.
    const annualAssessments = students.map((student) => reportAssessmentSummary(rowsByStudent[text(student.id)] || [], 'year'));
    const compileDimension = (type) => {
      const key = { rtw: 'reading', characteristic: 'character', competency: 'competency' }[type];
      const counts = { total: 0, excellent: 0, good: 0, pass: 0, fail: 0, pending: 0 };
      const categories = { 'ดีเยี่ยม': 'excellent', 'ดี': 'good', 'ผ่าน': 'pass', 'ปรับปรุง': 'fail', 'ไม่ผ่าน': 'fail' };
      annualAssessments.forEach((summary) => {
        const category = categories[summary[key]?.result];
        if (category) { counts[category]++; counts.total++; }
        else counts.pending++;
      });
      return counts;
    };
    const activity = { total: 0, pass: 0, fail: 0, pending: 0 };
    annualAssessments.forEach((summary) => {
      const result = summary.activities.result;
      if (result === 'ผ่าน') { activity.pass++; activity.total++; }
      else if (result === 'ไม่ผ่าน') { activity.fail++; activity.total++; }
      else activity.pending++;
    });

    const assessments = {
      reading: compileDimension('rtw'),
      character: compileDimension('characteristic'),
      activity,
      competency: compileDimension('competency')
    };

    const sigSettings = await getSchoolSignatures();
    const academicHead = text(settings.academicHead || settings.academic_head || settings.settings_json?.academic_head || 'หัวหน้าฝ่ายวิชาการ');
    // No real name as a fallback (it used to print this school's director): blank = dotted line to sign by hand.
    const directorName = text(settings.directorName || settings.director_name || '');
    const directorPosition = text(settings.directorPosition || settings.director_position || 'ผู้อำนวยการสถานศึกษา');
    const academicHeadSignature = sigSettings.academicHead || '';
    const directorSignature = sigSettings.director || '';
    const schoolStamp = sigSettings.schoolStamp || '';

    return {
      academicYear: year,
      totalStudents,
      subjectAreas,
      areas: subjectAreas,
      assessments,
      academicHead,
      directorName,
      directorPosition,
      academicHeadSignature,
      directorSignature,
      schoolStamp,
      includeSignatures: settings.settings_json?.include_signatures !== false && settings.includeSignatures !== false
    };
  }

  async function exportSarAnalyticsPDF(academicYear) {
    const year = text(academicYear || (await currentYear()));
    const sarData = await computeSchoolSarAnalytics(year);
    const options = await attendancePrintOptions('', '', 'รายงานผลสัมฤทธิ์ SAR');
    if (global.PP5PDF?.createSarAnalyticsPdf) {
      const result = await global.PP5PDF.createSarAnalyticsPdf(sarData, options);
      return typeof result === 'object' && result?.blobUrl ? result.blobUrl : (typeof result === 'object' && result?.dataUri ? result.dataUri : result);
    }
    return classPrintResult('รายงาน SAR', 'สถานศึกษา', year);
  }

  const server = {
    async verifyLogin(username, password) {
      try {
        const state = await data.auth.signIn(username, password);
        const profile = state.profile;
        return {
          success: true,
          username: profile.username,
          role: profile.role,
          firstName: profile.firstName,
          lastName: profile.lastName,
          fullName: profile.displayName,
          className: profile.className,
          authToken: state.session.access_token
        };
      } catch (error) {
        return { success: false, message: error.message };
      }
    },

    async validateToken() { return data.auth.validate(); },
    async verifyAuthToken() { return data.auth.validate(); },
    async refreshToken() {
      const state = await data.auth.requireUser();
      return { success: true, token: state.session.access_token, username: state.profile.username };
    },
    async getCurrentUser() {
      const state = await data.auth.requireUser();
      return {
        success: true,
        username: state.profile.username,
        email: state.user.email || null,
        role: state.profile.role,
        displayName: state.profile.displayName,
        firstName: state.profile.firstName || '',
        lastName: state.profile.lastName || '',
        className: state.profile.className || '',
        name: state.profile.displayName
      };
    },
    async clearLoginSession() { return data.auth.signOut(); },
    async changePassword(username, oldPassword, newPassword) {
      const state = await data.auth.requireUser();
      if (global.__PP5_PASSWORD_RECOVERY === true) {
        await data.auth.updatePassword(newPassword);
        global.__PP5_PASSWORD_RECOVERY = false;
        try { sessionStorage.removeItem('pp5_password_recovery'); } catch (_) {}
        return { success: true, message: 'ตั้งรหัสผ่านใหม่สำเร็จ' };
      }
      await data.auth.signIn(state.user.email, oldPassword);
      await data.auth.updatePassword(newPassword, oldPassword);
      return { success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' };
    },
    async requestPasswordReset(payload) {
      const rawUsername = text(payload?.username).trim().toLowerCase();
      const rawEmail = text(payload?.email || payload?.username).trim().toLowerCase();
      const aliasEmail = global.SUPABASE_CONFIG?.loginAliases?.[rawUsername || rawEmail];
      const email = rawEmail.includes('@') ? rawEmail : (aliasEmail || rawEmail);
      await data.auth.resetPassword(email, `${location.origin}${location.pathname}?page=change_password`);
      return { success: true, message: 'หากบัญชีนี้มีอยู่ ระบบจะส่งอีเมลตั้งรหัสผ่านใหม่' };
    },
    async getDeploymentUrl() { return location.origin + location.pathname; },
    async getLoginPageHtml() { return this.include('login'); },
    async getMainAppHtml() { return this.include('spa_main_menu'); },
    async getParentPortalHtml() {
      // The legacy login page writes this response as a complete document.
      // In the Supabase SPA, loading parent_portal as that standalone fragment
      // drops the shared shell and page lifecycle. Return a tiny redirect
      // document so the restored Supabase session enters through the normal SPA.
      const target = new URL(location.href);
      target.hash = '';
      target.search = '';
      target.searchParams.set('page', 'parent_portal');
      const url = target.toString();
      const metaUrl = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      return '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=' + metaUrl + '"><title>กำลังเปิดรายงานผล...</title></head><body><p>กำลังเปิดหน้ารายงานผล...</p><script>window.location.replace(' + JSON.stringify(url) + ');<\/script></body></html>';
    },

    async include(pageName) {
      if (pageName === 'academic_calendar') {
        return (typeof window !== 'undefined' && window.ACADEMIC_CALENDAR_HTML) || '';
      }
      const pages = global.GAS_PAGES || {};
      let html = pages[pageName] || '';
      if (!html) throw new Error(`ไม่พบหน้า ${pageName}`);
      return html.replace('<!-- INCLUDES_PLACEHOLDER -->', pages.grade_class_helper || '');
    },
    async getPageHtml(pageName) { return this.include(pageName); },
    async getPageContent(pageName) { return this.include(pageName); },

    async getGlobalSettings() {
      const settings = await data.settings.get();
      let assignments = [];
      try {
        assignments = await optionalTable('teacher_assignments', (query) => query.eq('active', true));
      } catch (error) {
        if (!/permission denied|row-level security/i.test(text(error?.message))) throw error;
      }
      const teachers = {};
      assignments.forEach((row) => {
        const displayName = homeroomTeacherDisplay(row);
        teachers[row.grade] = displayName;
        teachers[`${row.grade}/${row.room || '1'}`] = displayName;
      });
      return toLegacySettings(settings, teachers);
    },
    async getAdminGlobalSettings() { return this.getGlobalSettings(); },
    async S_getGlobalSettings_() { return this.getGlobalSettings(); },
    async getWebAppSettings() { return this.getGlobalSettings(); },
    async getDefaultSettings() { return this.getGlobalSettings(); },
    async saveSystemSettings(values) {
      const merged = { ...(values || {}) };
      const onSupabaseSettingsPage = global.AppNavigation?.currentPage === 'new_settings_editor' ||
        !!global.document?.getElementById?.('basicSettingsDiagnostics');
      if (onSupabaseSettingsPage) {
        const extraFields = {
          affiliation: 'affiliation',
          school_phone: 'schoolPhone',
          footer_note: 'footerNote'
        };
        Object.entries(extraFields).forEach(([key, id]) => {
          const field = global.document?.getElementById?.(id);
          if (field) merged[key] = field.value;
        });
      }
      if (Object.prototype.hasOwnProperty.call(merged, 'logoFileId')) {
        const submittedLogo = text(merged.logoFileId).trim();
        if (submittedLogo) merged.logoFileId = normalizeLogoValue(submittedLogo);
        else delete merged.logoFileId;
      }
      await data.settings.save(merged);
      return 'บันทึกการตั้งค่าสำเร็จ';
    },
    async saveGlobalSettings(values) { return this.saveSystemSettings(values); },
    async S_saveGlobalSettings_(values) { return this.saveSystemSettings(values); },
    async getBasicSettingsDiagnostics() {
      const settings = await this.getGlobalSettings();
      const blockers = [];
      const warnings = [];
      const passed = [];
      const add = (target, key, label, message, value = '') => target.push({ key, label, message, value });
      const pass = (key, label, value) => passed.push({ key, label, value: text(value) });

      const schoolName = text(settings.schoolName).trim();
      if (!schoolName || /^(?:โรงเรียน|โรงเรียนตัวอย่าง)$/.test(schoolName)) {
        add(blockers, 'schoolName', 'ชื่อโรงเรียน', 'ยังไม่ได้ตั้งชื่อโรงเรียนจริง', schoolName);
      } else pass('schoolName', 'ชื่อโรงเรียน', schoolName);

      const academicYear = text(settings.academicYear).trim();
      if (!/^\d{4}$/.test(academicYear)) {
        add(blockers, 'academicYear', 'ปีการศึกษา', 'ควรเป็นปี พ.ศ. 4 หลัก เช่น 2569', academicYear);
      } else pass('academicYear', 'ปีการศึกษา', academicYear);

      const semester = text(settings.semester).trim();
      if (!/^[12]$/.test(semester)) {
        add(blockers, 'semester', 'ภาคเรียน', 'ควรเป็นภาคเรียน 1 หรือ 2', semester);
      } else pass('semester', 'ภาคเรียน', semester);

      const directorName = text(settings.directorName).trim();
      if (!directorName || directorName === 'ผู้อำนวยการ') {
        add(blockers, 'directorName', 'ชื่อผู้อำนวยการ', 'ยังไม่ได้ตั้งชื่อผู้อำนวยการจริง', directorName);
      } else pass('directorName', 'ชื่อผู้อำนวยการ', directorName);

      [
        ['schoolAddress', 'ที่อยู่โรงเรียน', settings.schoolAddress, 'ยังไม่ได้กรอกที่อยู่โรงเรียน'],
        ['affiliation', 'สังกัด', settings.affiliation, 'ยังไม่ได้กรอกหน่วยงานต้นสังกัด'],
        ['directorPosition', 'ตำแหน่งผู้อำนวยการ', settings.directorPosition, 'ยังไม่ได้กรอกตำแหน่งผู้อำนวยการ'],
        ['supervisorName', 'ชื่อหัวหน้างานวิชาการ', settings.supervisorName, 'ยังไม่ได้ตั้งชื่อหัวหน้างานวิชาการจริง'],
        ['logoFileId', 'โลโก้โรงเรียน', settings.logo, 'ยังไม่ได้ตั้งค่าโลโก้โรงเรียน']
      ].forEach(([key, label, value, message]) => {
        const normalized = text(value).trim();
        if (!normalized) add(warnings, key, label, message);
        else pass(key, label, key === 'logoFileId' ? 'พร้อมใช้งาน' : normalized);
      });

      if (text(settings.schoolPhone).trim()) pass('schoolPhone', 'เบอร์โทรศัพท์โรงเรียน', settings.schoolPhone);
      else add(warnings, 'schoolPhone', 'เบอร์โทรศัพท์โรงเรียน', 'ยังไม่ได้กรอก (ไม่บังคับ)');

      pass('pdfDownload', 'การส่งออก PDF', 'ดาวน์โหลดผ่านเบราว์เซอร์');
      return {
        success: true,
        complete: blockers.length === 0,
        isComplete: blockers.length === 0,
        status: blockers.length ? 'incomplete' : (warnings.length ? 'ready_with_warnings' : 'ready'),
        blockers,
        warnings,
        passed,
        checkedAt: new Date().toISOString()
      };
    },
    async getExportCapability() {
      const state = await data.auth.requireUser();
      return { allowExport: state.profile.role === 'admin' && state.profile.allowExport === true };
    },
    async parseDriveFileId(value) {
      return extractDriveFileId(value) || text(value).trim();
    },
    async testLogoUrl(value) {
      const input = text(value).trim();
      const url = normalizeLogoValue(input);
      const valid = /^(https?:\/\/|data:image\/|blob:|\/|\.\/)/i.test(url);
      return { success: valid, valid, url, message: valid ? 'รูปแบบที่อยู่โลโก้ถูกต้อง' : 'ที่อยู่โลโก้ไม่ถูกต้อง' };
    },
    async setLogoFileId(value) {
      await requireAdmin();
      const logo = normalizeLogoValue(value);
      if (!logo) throw new Error('กรุณาระบุที่อยู่หรือข้อมูลโลโก้');
      if (!/^(https?:\/\/|data:image\/|blob:|\/|\.\/)/i.test(logo)) throw new Error('รูปแบบโลโก้ไม่ถูกต้อง กรุณาใช้ URL หรือ Google Drive File ID');
      await data.settings.save({ logo_base64: logo });
      return { success: true, message: 'บันทึกโลโก้เรียบร้อยแล้ว', logo };
    },
    async uploadLogoFromDataUrl(dataUrl) {
      const value = typeof dataUrl === 'object' ? dataUrl.dataUrl || dataUrl.logo : dataUrl;
      if (!/^data:image\//i.test(text(value))) throw new Error('ไฟล์โลโก้ต้องเป็นรูปภาพ');
      return this.setLogoFileId(value);
    },
    async fixLogoSharing() {
      const settings = await data.settings.get();
      return { success: true, changed: false, message: 'โลโก้ถูกเก็บใน Supabase จึงไม่ต้องตั้งค่าการแชร์ Google Drive', logo: settings.logo_base64 || '' };
    },

    async getTeacherListForEditor() {
      const year = await currentYear();
      const rows = await optionalTable('teacher_assignments', (query) => query.eq('academic_year', year).order('grade').order('room'));
      return rows.map((row) => ({
        ...row,
        grade: row.grade,
        classNo: text(row.room || '1'),
        teacherName: text(row.teacher_name),
        teacher2Name: text(row.teacher_name_2)
      }));
    },
    async getHomeroomTeacher(grade, classNo) {
      return lookupHomeroomTeacher(grade, classNo);
    },
    async saveTeacherList(list) {
      await requireAdmin();
      const year = await currentYear();
      const rows = (list || []).map((item) => ({
        teacher_name: item.teacherName || item.teacher_name,
        teacher_name_2: item.teacher2Name ?? item.teacher_name_2 ?? '',
        grade: item.grade,
        room: text(item.room || item.classNo || '1'),
        academic_year: text(item.academicYear || year),
        active: true
      }));
      const { error } = await client.from('teacher_assignments').upsert(rows, { onConflict: 'grade,room,academic_year' });
      if (error) throw new Error(error.message);
      return { success: true, message: `บันทึกครูประจำชั้น ${rows.length} รายการ` };
    },
    async saveSingleTeacher(item) { return this.saveTeacherList([item]); },

    async getAllUsers() {
      let profiles;
      let warning = '';
      try {
        const result = await invokeAdminUsers({ action: 'list' });
        profiles = result.users || [];
      } catch (error) {
        profiles = await listAdminUsersDirect();
        warning = 'แสดงรายชื่อได้ แต่การเพิ่ม/แก้ไข/ลบต้อง deploy Edge Function admin-users ก่อน';
      }
      const users = profiles.map(mapAdminUserProfile);
      return { success: true, users, count: users.length, warning };
    },
    async importLegacyUsersAdmin(batchSize) {
      const result = await invokeAdminUsers({ action: 'import-legacy', batchSize: Number(batchSize) || 15 });
      return { success: result.success !== false, ...result };
    },
    async addNewUser(payload) {
      const result = await invokeAdminUsers({
        action: 'create',
        username: payload.username,
        email: payload.email,
        password: payload.password,
        role: payload.role,
        displayName: `${text(payload.firstName)} ${text(payload.lastName)}`.trim(),
        grade: payload.className || payload.grade,
        room: payload.room,
        studentIds: payload.studentIds,
        allowExport: payload.allowExport === true
      });
      return { success: true, message: 'เพิ่มผู้ใช้สำเร็จ', user: result.user };
    },
    async updateUserAdmin(payload) {
      const users = (await this.getAllUsers()).users || [];
      const user = users.find((item) => item.username === payload.originalUsername || item.id === payload.userId);
      if (!user) throw new Error('ไม่พบผู้ใช้');
      const result = await invokeAdminUsers({ action: 'update', userId: user.id, username: payload.username, displayName: payload.fullName, role: payload.role, studentIds: payload.studentIds, active: payload.active });
      return { success: true, message: 'แก้ไขผู้ใช้สำเร็จ', user: result.user };
    },
    async deleteUserAdmin(payload) {
      const users = (await this.getAllUsers()).users || [];
      const user = users.find((item) => item.username === payload.username || item.id === payload.userId);
      if (!user) throw new Error('ไม่พบผู้ใช้');
      await invokeAdminUsers({ action: 'delete', userId: user.id });
      return { success: true, message: 'ลบผู้ใช้สำเร็จ' };
    },
    async resetUserPasswordAdmin(payload) {
      const users = (await this.getAllUsers()).users || [];
      const user = users.find((item) => item.username === payload.username || item.id === payload.userId);
      if (!user) throw new Error('ไม่พบผู้ใช้');
      await invokeAdminUsers({ action: 'reset-password', userId: user.id, password: payload.newPassword || payload.password });
      return { success: true, message: 'รีเซ็ตรหัสผ่านสำเร็จ' };
    },
    async resetAllParentPasswordsAdmin(payload) {
      return invokeAdminUsers({
        action: 'reset-parent-passwords',
        password: payload?.newPassword || payload?.password,
        confirmAllParents: payload?.confirmAllParents === true
      });
    },

    async getFilteredStudentsInline(grade, classNo) {
      const academicYear = text(await currentYear());
      return data.students.list({ grade, room: classNo, academicYear });
    },
    async getStudentsList(grade, classNo) { return data.students.list({ grade, room: classNo }); },
    async getStudentsByGradeClass(grade, classNo) { return data.students.list({ grade, room: classNo }); },
    async getAllStudentDataOptimized(arg1, arg2) {
      let filter = {};
      if (arg1 && /^[ปมอ]\.\d/.test(String(arg1).trim())) {
        filter.grade = String(arg1).trim();
        if (arg2) filter.room = String(arg2).trim();
      } else if (arg1 && !isNaN(Number(arg1))) {
        filter.academicYear = String(arg1).trim();
      }
      const students = await data.students.list(filter);
      const result = {};
      students.forEach((s) => {
        const grade = text(s.grade).trim();
        const classNo = text(s.classNo || s.room || '1').trim();
        if (!grade || !classNo) return;
        if (!result[grade]) result[grade] = {};
        if (!result[grade][classNo]) result[grade][classNo] = [];
        result[grade][classNo].push({
          id: text(s.id),
          studentId: text(s.id),
          fullName: text(s.fullName || `${s.prefix || ''}${s.firstName || ''} ${s.lastName || ''}`).trim(),
          name: text(s.fullName || `${s.prefix || ''}${s.firstName || ''} ${s.lastName || ''}`).trim(),
          gender: text(s.gender),
          studentNumber: s.studentNumber || s.student_number || 0,
          grade,
          classNo
        });
      });
      Object.keys(result).forEach((g) => {
        Object.keys(result[g]).forEach((c) => {
          result[g][c].sort((a, b) => text(a.id).localeCompare(text(b.id), undefined, { numeric: true }));
        });
      });
      return result;
    },
    async getStudentsByClass(grade, classNo) { return data.students.list({ grade, room: classNo }); },
    async getStudentsInClass(grade, classNo) { return data.students.list({ grade, room: classNo }); },
    async getStudentsForAttendance(grade, classNo) { return data.students.list({ grade, room: classNo }); },
    async getAvailableGrades() {
      const students = await data.students.list();
      return [...new Set(students.map((student) => student.grade))].filter(Boolean);
    },
    async getAvailableClasses(grade) {
      const students = await data.students.list({ grade });
      return [...new Set(students.map((student) => student.classNo))].filter(Boolean);
    },
    async getAvailableClassNos(grade) { return this.getAvailableClasses(grade); },
    async getAvailableClassesForDelete(grade) { return this.getAvailableClasses(grade); },
    // Legacy parent_info_report calls this as (grade, classNo, name, token).
    async searchStudentsForEdit(grade, classNo, name, _token) {
      return searchLegacyParentStudents(grade, classNo, name);
    },
    async searchStudentsForDelete(keyword, grade, classNo) {
      return searchLegacyParentStudents(grade, classNo, keyword);
    },
    async getStudentsForDeleteByClass(grade, classNo) { return data.students.list({ grade, room: classNo, active: false }); },
    async addNewStudent(values) {
      await requireAdmin();
      const studentId = text(values?.id || values?.studentId || values?.student_id || values?.studentCode).trim();
      if (!studentId) throw new Error('กรุณาระบุรหัสนักเรียน');
      const existing = await data.students.get(studentId);
      if (existing) throw new Error('รหัสนักเรียนนี้มีอยู่แล้ว');
      const student = await data.students.save({ ...values, id: studentId });
      return { success: true, message: 'เพิ่มนักเรียนสำเร็จ', student };
    },
    async saveStudentData(values) {
      const result = await this.addNewStudent(values);
      return result.message;
    },
    async updateStudentInline(values) {
      const student = await data.students.save(values);
      return { success: true, message: 'แก้ไขข้อมูลนักเรียนสำเร็จ', student };
    },
    async deleteStudent(id) { await data.students.deactivate(id); return { success: true, message: 'จำหน่ายนักเรียนสำเร็จ' }; },
    async bulkDeleteStudents(ids) {
      for (const id of ids || []) await data.students.deactivate(id);
      return { success: true, message: `จำหน่ายนักเรียน ${(ids || []).length} คน`, deletedCount: (ids || []).length };
    },
    async getStudentFullData(id) {
      // Also used by the บันทึกความคิดเห็นครูที่ปรึกษา page(s), which expect
      // { success, student, comment } (the *current semester's* comment text) rather than
      // the raw row this used to return — every caller in gas-pages.js already checks
      // `data.success`, so returning the bare student object made this call fail 100% of
      // the time (data.success was always undefined) and the page could never show what
      // was already saved.
      const student = await data.students.get(id);
      if (!student) return { success: false, error: 'ไม่พบข้อมูลนักเรียน' };
      const studentId = text(student.id || id);
      const settings = await data.settings.get();
      const academicYear = text(settings.academicYear || settings.academic_year);
      const currentSemester = number(settings.semester, 1) === 2 ? 2 : 1;
      const rows = await optionalTable('student_comments', (query) => query.eq('student_id', studentId).eq('academic_year', academicYear)).catch(() => []);
      const row = rows.find((item) => number(item.semester, 1) === currentSemester);
      return { success: true, student, comment: text(row?.comment) };
    },
    async getStudentParentData(id, _token) {
      const student = await data.students.get(id);
      if (!student) throw new Error('ไม่พบข้อมูลนักเรียน');
      return legacyParentStudentRecord(student);
    },
    async saveParentData(values) {
      const student = await data.students.save(values);
      return { success: true, message: 'บันทึกข้อมูลผู้ปกครองสำเร็จ', student };
    },

    async getHomeroomProgressStatus(grade, classNo, academicYear) {
      const year = text(academicYear || await currentYear() || '2569').trim();
      const targetGrade = text(grade || 'ป.1').trim();
      const targetClassNo = text(classNo || '1').trim();

      const [students, subjects] = await Promise.all([
        data.students.list({ grade: targetGrade, room: targetClassNo, academicYear: year }).catch(() => []),
        data.subjects.list(targetGrade).catch(() => [])
      ]);

      const studentIds = students.map((s) => String(s.id));
      const totalStudents = studentIds.length;

      const months = academicYearMonths(year);
      const attendedMonthsSet = new Set();
      if (studentIds.length > 0) {
        try {
          const { data: attData } = await client.from('attendance_monthly')
            .select('year_month, student_id')
            .in('student_id', studentIds);
          (attData || []).forEach((r) => { if (r.year_month) attendedMonthsSet.add(r.year_month); });
        } catch (_) {}
        if (attendedMonthsSet.size === 0) {
          try {
            const { data: dailyData } = await client.from('attendance_daily')
              .select('attendance_date')
              .in('student_id', studentIds);
            (dailyData || []).forEach((r) => {
              if (r.attendance_date) attendedMonthsSet.add(String(r.attendance_date).slice(0, 7));
            });
          } catch (_) {}
        }
      }
      const attendanceBreakdown = months.map((m) => {
        const isRecorded = attendedMonthsSet.has(m.key);
        return {
          key: m.key,
          label: `${m.shortName} ${String(m.yearBE).slice(-2)}`,
          fullName: `${m.monthName} ${m.yearBE}`,
          recorded: isRecorded
        };
      });
      const recordedMonthsCount = attendanceBreakdown.filter((m) => m.recorded).length;
      const isAttendanceDone = months.length > 0 && recordedMonthsCount >= (months.length > 10 ? 10 : months.length);

      let scoreRows = [];
      if (studentIds.length > 0) {
        try {
          const { data: sData } = await client.from('scores')
            .select('subject_id, semester')
            .eq('academic_year', year)
            .in('student_id', studentIds);
          scoreRows = sData || [];
        } catch (_) {}
      }
      const recordedSubjectIds = new Set(scoreRows.map((s) => String(s.subject_id)));
      const subjectBreakdown = (subjects || []).map((s) => ({
        id: String(s.id),
        name: s.name || s.subject_name || s.id,
        code: s.code || s.subject_code || '',
        recorded: recordedSubjectIds.has(String(s.id))
      }));
      const recordedSubjectsCount = subjectBreakdown.filter((s) => s.recorded).length;
      const isScoresDone = subjects.length > 0 ? (recordedSubjectsCount >= subjects.length) : (recordedSubjectsCount > 0);

      let assessmentRows = [];
      if (studentIds.length > 0) {
        try {
          const { data: aData } = await client.from('assessments')
            .select('assessment_type')
            .eq('academic_year', year)
            .in('student_id', studentIds);
          assessmentRows = aData || [];
        } catch (_) {}
      }
      const assessmentTypes = new Set(assessmentRows.map((a) => a.assessment_type));
      const assessmentBreakdown = [
        { type: 'characteristic', label: 'คุณลักษณะอันพึงประสงค์ 8 ข้อ', page: 'characteristic_assessment', done: assessmentTypes.has('characteristic') || assessmentTypes.has('characteristics') },
        { type: 'read_think_write', label: 'การอ่าน คิดวิเคราะห์ และเขียน', page: 'read_think_write_form', done: assessmentTypes.has('read_think_write') || assessmentTypes.has('rtw') },
        { type: 'competency', label: 'สมรรถนะสำคัญ 5 ด้าน', page: 'competency_assessment', done: assessmentTypes.has('competency') || assessmentTypes.has('competencies') },
        { type: 'activity', label: 'กิจกรรมพัฒนาผู้เรียน (ลูกเสือ/แนะแนว/ชุมนุม)', page: 'activity_assessment', done: assessmentTypes.has('activity') || assessmentTypes.has('activities') }
      ];
      const doneAssessmentsCount = assessmentBreakdown.filter((a) => a.done).length;
      const isAssessmentsDone = doneAssessmentsCount === 4;

      let growthCount = 0;
      let commentsCount = 0;
      if (studentIds.length > 0) {
        try {
          const { count: gCount } = await client.from('student_growth')
            .select('student_id', { count: 'exact', head: true })
            .in('student_id', studentIds);
          growthCount = gCount || 0;
        } catch (_) {}
        try {
          const { count: cCount, error: cError } = await client.from('student_comments')
            .select('student_id', { count: 'exact', head: true })
            .eq('academic_year', year)
            .in('student_id', studentIds);
          commentsCount = cError ? 0 : (cCount || 0);
        } catch (_) {}
      }
      const healthBreakdown = [
        { label: 'น้ำหนัก-ส่วนสูง ภาคเรียนที่ 1', page: 'student_growth_entry', done: growthCount > 0 },
        { label: 'น้ำหนัก-ส่วนสูง ภาคเรียนที่ 2', page: 'student_growth_entry', done: growthCount >= totalStudents && totalStudents > 0 },
        { label: 'บันทึกความเห็นครูประจำชั้น', page: 'teacher_comment_form_backup', done: commentsCount > 0 }
      ];
      const isHealthDone = growthCount > 0 && commentsCount > 0;

      let scoreP = (recordedSubjectsCount / Math.max(subjects.length || 1, 1)) * 25;
      let attP = (recordedMonthsCount / Math.max(months.length || 1, 1)) * 20;
      let assP = (doneAssessmentsCount / 4) * 25;
      let heaP = (isHealthDone ? 15 : (growthCount > 0 || commentsCount > 0 ? 8 : 0));
      let isReadyForPP5 = isAttendanceDone && isScoresDone && isAssessmentsDone;
      let expP = isReadyForPP5 ? 15 : 0;
      let percent = Math.min(100, Math.round(attP + scoreP + assP + heaP + expP));

      return {
        grade: targetGrade,
        classNo: targetClassNo,
        academicYear: year,
        totalStudents,
        overallPercent: percent,
        isReadyForPP5,
        milestones: {
          attendance: {
            title: 'เวลาเรียน',
            badge: `${recordedMonthsCount}/${months.length} ด.`,
            isDone: isAttendanceDone,
            items: attendanceBreakdown
          },
          scores: {
            title: 'คะแนนรายวิชา',
            badge: `${recordedSubjectsCount}/${subjects.length || 8} วิชา`,
            isDone: isScoresDone,
            items: subjectBreakdown
          },
          assessments: {
            title: 'ประเมิน 4 ด้าน',
            badge: `${doneAssessmentsCount}/4 ด้าน`,
            isDone: isAssessmentsDone,
            items: assessmentBreakdown
          },
          health: {
            title: 'สุขภาพ/ความเห็น',
            badge: isHealthDone ? 'ครบถ้วน' : 'รอข้อมูล',
            isDone: isHealthDone,
            items: healthBreakdown
          },
          export: {
            title: 'ปลดล็อก ปพ.',
            badge: isReadyForPP5 ? 'พร้อมพิมพ์' : 'รอข้อมูลครบ',
            isDone: isReadyForPP5
          }
        }
      };
    },

    async getSubjects(gradeOrToken) {
      // The original subject manager passes authToken as its only argument,
      // while newer pages pass a grade. Never treat a login token as a grade filter.
      const candidate = text(gradeOrToken).trim();
      const grade = /^(?:อ|ป|ม)\.\d+$/.test(candidate) ? candidate : undefined;
      return pp6SortSubjects_(await data.subjects.list(grade)).map(toLegacySubject);
    },
    async getSubjectsForGrade(grade) { return this.getSubjects(grade); },
    async addSubject(values) {
      await requireAdmin();
      const payload = subjectPayload(values, true);
      assertSemesterForGrade_(payload, payload.grade);
      await assertUniqueSubjectName_(payload.grade, payload.name, null);
      if (!payload.id) payload.id = newSubjectId_();
      const { data: row, error } = await client.from('subjects').insert(payload).select().single();
      if (error) throw new Error(error.message);
      return { success: true, message: 'เพิ่มรายวิชาสำเร็จ', subject: toLegacySubject(row) };
    },
    // The subject manager page sends (data, data, token) with data.id; an older call shape is (index, data, token).
    async updateSubject(first, second) {
      await requireAdmin();
      const values = first && typeof first === 'object' ? first : (second && typeof second === 'object' ? second : {});
      const id = values.id;
      if (id === undefined || id === null || text(id).trim() === '') throw new Error('ไม่พบรหัสรายวิชาที่จะแก้ไข กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง');
      const payload = subjectPayload(values);
      delete payload.id;
      if (payload.name || payload.grade || payload.semester === null) {
        const { data: current } = await client.from('subjects').select('id, grade, name, code, subject_type').eq('id', id).maybeSingle();
        if (payload.semester === null) assertSemesterForGrade_({ ...current, ...payload }, payload.grade || current?.grade);
        if (payload.name || payload.grade) await assertUniqueSubjectName_(payload.grade || current?.grade, payload.name || current?.name, id);
      }
      const { data: updated, error } = await client.from('subjects').update(payload).eq('id', id).select('id');
      if (error) throw new Error(error.message);
      if (!updated || !updated.length) throw new Error('ไม่พบรายวิชานี้แล้ว (อาจถูกลบ) กรุณาโหลดหน้าใหม่');
      return { success: true, message: 'แก้ไขรายวิชาสำเร็จ' };
    },
    async deleteSubject(id) {
      await requireAdmin();
      if (id === undefined || id === null || text(id).trim() === '') throw new Error('ไม่พบรหัสรายวิชาที่จะลบ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง');
      const { data: removed, error } = await client.from('subjects').delete().eq('id', id).select('id');
      if (error) throw new Error(error.message);
      if (!removed || !removed.length) throw new Error('ไม่พบรายวิชานี้ หรือไม่มีสิทธิ์ลบ');
      return { success: true, message: 'ลบรายวิชาสำเร็จ' };
    },
    async importSubjectsFromCSV(csvBase64) {
      await requireAdmin();
      const table = parseCsv(decodeBase64Utf8(csvBase64));
      // คอลัมน์ "ภาคเรียน" (ม.ต้น) ไม่บังคับ: หัวคอลัมน์แถวที่ 2 ตั้งแต่คอลัมน์ S เป็นต้นไป
      const semesterCol = (table[1] || []).findIndex((cell, i) => i >= 18 && text(cell).trim() === 'ภาคเรียน');
      const rows = table.slice(2)
        .filter((row) => text(row[0]).trim() && text(row[2]).trim());
      if (!rows.length) throw new Error('ไม่พบข้อมูลรายวิชาตั้งแต่แถวที่ 3');
      const payloads = rows.map((row) => subjectPayload({
        'ชั้น': text(row[0]).trim(), 'รหัสวิชา': text(row[1]).trim(), 'ชื่อวิชา': text(row[2]).trim(),
        'ชั่วโมง/ปี': row[3], 'ประเภทวิชา': text(row[4]).trim(),
        'เต็ม_ครั้ง1': row[5], 'เต็ม_ครั้ง2': row[6], 'เต็ม_ครั้ง3': row[7], 'เต็ม_ครั้ง4': row[8],
        'เต็ม_ครั้ง5': row[10], 'เต็ม_ครั้ง6': row[11], 'เต็ม_ครั้ง7': row[12], 'เต็ม_ครั้ง8': row[13], 'เต็ม_ครั้ง9': 0,
        'คะแนนระหว่างปี': row[15], 'คะแนนปลายปี': row[16], 'รวม': row[17],
        'ครูผู้สอน': row.slice(18).filter((_cell, i) => i + 18 !== semesterCol).join(',').trim(),
        ...(semesterCol >= 0 ? { 'ภาคเรียน': row[semesterCol] } : {})
      }, true));
      const needSemester = payloads.filter((payload) => { try { assertSemesterForGrade_(payload, payload.grade); return false; } catch (_) { return true; } });
      if (needSemester.length) {
        throw new Error(`วิชาชั้น ม. ต้องระบุภาคเรียน (เพิ่มคอลัมน์ "ภาคเรียน" ใส่ 1 หรือ 2): ${needSemester.slice(0, 8).map((p) => `${p.grade} ${p.code || p.name}`).join(', ')}`);
      }
      const { data: existing, error: readError } = await client.from('subjects').select('id,grade,code,name');
      if (readError) throw new Error(readError.message);
      const byCode = new Map((existing || []).filter((row) => row.code).map((row) => [`${row.grade}|${row.code}`, row.id]));
      const byName = new Map((existing || []).map((row) => [`${row.grade}|${row.name}`, row.id]));
      payloads.forEach((row) => {
        const id = byCode.get(`${row.grade}|${row.code}`) || byName.get(`${row.grade}|${row.name}`);
        row.id = id || newSubjectId_();
      });
      const { error } = await client.from('subjects').upsert(payloads, { onConflict: 'id', defaultToNull: false });
      if (error) throw new Error(error.message);
      return { success: true, count: payloads.length, message: `นำเข้ารายวิชา ${payloads.length} รายการสำเร็จ` };
    },

    async getDailyAttendance(date, grade, classNo) { return this.getSavedAttendance(grade, classNo, date); },
    async getSavedAttendance(arg1, arg2, arg3, arg4) {
      let grade, classNo, dateValue, year, month;
      if (text(arg1).includes('-')) [dateValue, grade, classNo] = [arg1, arg2, arg3];
      else [grade, classNo, year, month] = [arg1, arg2, arg3, arg4];
      const attendanceAcademicYear = dateValue
        ? academicYearFromDate(dateValue)
        : academicYearFromCalendarDate(year, month);
      const [students, holidayRows] = await Promise.all([
        data.students.list({ grade, room: classNo, academicYear: attendanceAcademicYear }),
        data.holidays.list()
      ]);
      const ids = students.map((student) => student.id);
      let query = client.from('attendance_daily').select('*').in('student_id', ids);
      if (dateValue) query = query.eq('attendance_date', dateValue);
      else if (year !== undefined && month !== undefined) {
        const range = monthRange(year, month);
        query = query.gte('attendance_date', range.first).lte('attendance_date', range.last);
      }
      const { data: rows, error } = ids.length ? await query : { data: [], error: null };
      if (error) throw new Error(error.message);
      // Records on a 'school' day (สอนชดเชย) are real attendance; only closures hide them.
      const holidayDates = new Set(holidayRows
        .filter((row) => text(row.holiday_type).trim() !== 'school')
        .map((row) => normalizeDate(row.holiday_date)).filter(Boolean));
      const records = {}, attendance = {};
      normalizedAttendanceRows(rows || []).forEach((row) => {
        if (holidayDates.has(row.attendance_date)) return;
        const day = Number(text(row.attendance_date).slice(-2));
        records[`${row.student_id}_${day}`] = row.status;
        attendance[row.student_id] = row.status;
      });
      const holidays = Object.fromEntries(holidayRows.map((row) => [
        text(row.holiday_date),
        text(row.title || row.holiday_type || 'วันหยุด')
      ]));
      const holidayTypes = Object.fromEntries(holidayRows.map((row) => [text(row.holiday_date), text(row.holiday_type)]));
      return { success: true, records, attendance, students, holidays, holidayTypes };
    },
    async saveAttendance(payload) {
      const raw = payload?.records || {};
      const dateValue = payload?.date || payload?.attendanceDate;
      const year = text(payload?.academicYear || await currentYear());
      const rows = Array.isArray(raw) ? raw : Object.entries(raw).map(([studentId, status]) => ({ studentId, status }));
      const normalized = rows.map((row) => ({
        ...row,
        status: normalizeAttendanceStatus(row.status),
        date: row.attendance_date || row.date || dateValue,
        academicYear: row.academic_year || row.academicYear || year
      })).filter((row) => row.studentId && row.date && row.status);
      const holidayDates = await noSchoolHolidayDateSet_();
      const savedRows = normalized.filter((row) => !holidayDates.has(normalizeDate(row.date)));
      const skippedHolidays = normalized.length - savedRows.length;
      if (normalized.length && !savedRows.length && skippedHolidays) {
        return {
          success: false,
          blocked: true,
          message: 'วันที่เลือกเป็นวันหยุดตามปฏิทินโรงเรียน ระบบจึงไม่ได้บันทึกเวลาเรียน',
          saved: 0,
          skippedHolidays
        };
      }
      if (savedRows.length) await data.attendance.saveDaily(savedRows);
      return {
        success: true,
        message: `บันทึกเวลาเรียน ${savedRows.length} รายการ${skippedHolidays ? ` (ข้ามวันหยุด ${skippedHolidays} รายการ)` : ''}`,
        saved: savedRows.length,
        skippedHolidays
      };
    },
    async saveMonthlyAttendanceOptimized(payload) {
      const rangeYear = payload?.year || new Date().getFullYear();
      const rangeMonth = payload?.month ?? new Date().getMonth();
      const year = text(payload?.academicYear || await currentYear());
      const rows = Object.entries(payload?.records || {}).map(([key, rawStatus]) => {
        const [studentId, day] = key.split('_');
        const dateValue = `${rangeYear}-${String(Number(rangeMonth) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return { studentId, date: dateValue, rawStatus, status: normalizeAttendanceStatus(rawStatus), academicYear: year };
      }).filter((row) => row.studentId && row.date);
      const holidayDates = await noSchoolHolidayDateSet_();
      const savedRows = rows.filter((row) => row.status && !holidayDates.has(row.date));
      const skippedHolidays = rows.filter((row) => row.status && holidayDates.has(row.date)).length;
      const clearedRows = rows.filter((row) => !row.status && text(row.rawStatus).trim().toLowerCase() === 'none');
      if (savedRows.length) await data.attendance.saveDaily(savedRows);
      const clearsByDate = groupBy(clearedRows, (row) => row.date);
      for (const [clearDate, items] of Object.entries(clearsByDate)) {
        const { error } = await client.from('attendance_daily').delete()
          .eq('attendance_date', clearDate)
          .in('student_id', items.map((row) => row.studentId));
        if (error) throw new Error(error.message);
      }
      return {
        success: true,
        message: `บันทึกเวลาเรียนรายเดือน ${savedRows.length} รายการ${clearedRows.length ? ` และเคลียร์ ${clearedRows.length} รายการ` : ''}${skippedHolidays ? ` (ข้ามวันหยุด ${skippedHolidays} รายการ)` : ''}`,
        saved: savedRows.length,
        cleared: clearedRows.length,
        skippedHolidays
      };
    },
    async fixAttendanceFormulas() {
      return { success: true, message: 'Supabase คำนวณสรุปจากข้อมูลรายวันอัตโนมัติ' };
    },
    async deleteAttendanceData(payload) {
      await data.auth.requireUser();
      const rosterYear = payload?.year !== undefined && payload?.month !== undefined
        ? academicYearFromCalendarDate(payload.year, payload.month)
        : '';
      const students = await data.students.list({
        grade: payload?.grade,
        room: payload?.classNo,
        academicYear: rosterYear
      });
      const ids = students.map((student) => student.id);
      if (!ids.length) return { success: true, message: 'ไม่พบข้อมูลที่ต้องลบ' };
      let query = client.from('attendance_daily').delete().in('student_id', ids);
      if (payload?.year !== undefined && payload?.month !== undefined) {
        const range = monthRange(payload.year, payload.month);
        if (payload.day !== undefined) {
          const dateValue = `${payload.year}-${String(Number(payload.month) + 1).padStart(2, '0')}-${String(payload.day).padStart(2, '0')}`;
          query = query.eq('attendance_date', dateValue);
        } else query = query.gte('attendance_date', range.first).lte('attendance_date', range.last);
      }
      const { error } = await query;
      if (error) throw new Error(error.message);
      return { success: true, message: 'ลบข้อมูลเวลาเรียนสำเร็จ' };
    },
    async loadHolidaysFromSheet() {
      const rows = await data.holidays.list();
      return rows.map((row) => [
        text(row.holiday_date),
        text(row.title || row.holiday_type || 'วันหยุด'),
        holidayTypeToUi_(row.holiday_type)
      ]);
    },
    async getSpecialHolidays() {
      const rows = await data.holidays.list();
      return Object.fromEntries(rows.map((row) => [
        text(row.holiday_date),
        text(row.title || row.holiday_type || 'วันหยุด')
      ]));
    },
    async saveHolidaySheet(rows) {
      await requireAdmin();
      const list = Array.isArray(rows) ? rows : (rows?.items || []);
      const { data: existingRows, error: readError } = await client
        .from('holidays')
        .select('id,holiday_date,holiday_type,title');
      if (readError) throw new Error(readError.message);
      const existingByDate = new Map((existingRows || []).map((row) => [text(row.holiday_date), row]));
      const normalizedByDate = new Map();
      list.forEach((row) => {
        const dateValue = normalizeDate(Array.isArray(row) ? row[0] : (row?.holiday_date || row?.date));
        if (!dateValue) return;
        const existing = existingByDate.get(dateValue);
        const title = text(Array.isArray(row) ? row[1] : (row?.title || row?.detail || row?.name), 'วันหยุด').trim() || 'วันหยุด';
        const holiday = {
          holiday_date: dateValue,
          title,
          holiday_type: holidayTypeFromUi_(Array.isArray(row) ? row[2] : row?.holiday_type, existing?.holiday_type || 'ราชการ')
        };
        if (existing?.id) holiday.id = existing.id;
        normalizedByDate.set(dateValue, holiday);
      });
      const normalized = [...normalizedByDate.values()];
      const updates = normalized.filter((row) => row.id);
      const inserts = normalized.filter((row) => !row.id);
      if (updates.length) {
        const { error } = await client.from('holidays').upsert(updates);
        if (error) throw new Error(error.message);
      }
      if (inserts.length) {
        const { error } = await client.from('holidays').insert(inserts);
        if (error) throw new Error(error.message);
      }
      const keepDates = new Set(normalized.map((row) => row.holiday_date));
      const removedIds = (existingRows || [])
        .filter((row) => !keepDates.has(normalizeDate(row.holiday_date)) && row.id != null)
        .map((row) => row.id);
      if (removedIds.length) {
        const { data: deletedRows, error } = await client.from('holidays').delete().in('id', removedIds).select('id');
        if (error) throw new Error(error.message);
        // RLS turns a forbidden delete into "0 rows, no error" — report it instead of
        // claiming success while the holiday silently stays in the table.
        if ((deletedRows || []).length < removedIds.length) {
          throw new Error('ลบวันหยุดออกจากฐานข้อมูลไม่สำเร็จ (ไม่มีสิทธิ์ลบ หรือรายการถูกเปลี่ยนไปแล้ว) กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง');
        }
      }
      return {
        success: true,
        message: `บันทึกวันหยุด ${normalized.length} รายการ${removedIds.length ? ` และลบ ${removedIds.length} รายการ` : ''}`,
        saved: normalized.length,
        deleted: removedIds.length
      };
    },
    
    async getAcademicCalendar(requestedYear) {
      const year = text(requestedYear || (await currentYear()));
      const { data: settingsRow, error: sErr } = await client
        .from('school_settings')
        .select('settings_json')
        .limit(1)
        .maybeSingle();
      if (sErr) throw new Error(sErr.message);

      const calendarStore = settingsRow?.settings_json?.academic_calendar?.[year] || [];
      const holidayRows = await data.holidays.list();
      const existingDateSet = new Set(calendarStore.map((e) => e.startDate));

      const merged = [...calendarStore];
      (holidayRows || []).forEach((h) => {
        const d = normalizeDate(h.holiday_date);
        if (d && !existingDateSet.has(d)) {
          merged.push({
            id: 'hol_' + (h.id || d),
            title: text(h.title || h.holiday_type || 'วันหยุด'),
            type: 'holiday',
            startDate: d,
            endDate: '',
            assignee: '',
            notes: '',
            isCompleted: false,
            isHolidayTable: true
          });
        }
      });

      return {
        success: true,
        year,
        events: merged
      };
    },

    async saveAcademicCalendarEvent(event, requestedYear) {
      await requireAdmin();
      const year = text(requestedYear || (await currentYear()));
      const { data: settingsRow, error: sErr } = await client
        .from('school_settings')
        .select('id, settings_json')
        .limit(1)
        .maybeSingle();
      if (sErr) throw new Error(sErr.message);

      const currentJson = settingsRow?.settings_json || {};
      const calMap = currentJson.academic_calendar || {};
      const yearEvents = calMap[year] || [];

      const evId = text(event.id || 'ev_' + Date.now());
      const newEvent = {
        id: evId,
        startDate: normalizeDate(event.startDate),
        endDate: event.endDate ? normalizeDate(event.endDate) : '',
        type: text(event.type || 'activity'),
        title: text(event.title || '').trim(),
        assignee: text(event.assignee || '').trim(),
        notes: text(event.notes || '').trim(),
        isCompleted: !!event.isCompleted,
        updatedAt: new Date().toISOString()
      };

      const existingIndex = yearEvents.findIndex((item) => item.id === evId);
      const previous = existingIndex >= 0 ? yearEvents[existingIndex] : null;
      // The date this event currently occupies in the holidays table, if any: a stored
      // holiday event, or a row shown straight from the holidays table (id "hol_…").
      let previousHolidayDate = previous?.type === 'holiday' ? normalizeDate(previous.startDate) : '';
      if (!previous && evId.startsWith('hol_')) {
        previousHolidayDate = (await findHolidayTableRow_(evId))?.holiday_date || '';
      }
      if (existingIndex >= 0) {
        yearEvents[existingIndex] = newEvent;
      } else {
        yearEvents.push(newEvent);
      }
      calMap[year] = yearEvents;
      currentJson.academic_calendar = calMap;

      const { error: uErr } = await client
        .from('school_settings')
        .update({ settings_json: currentJson })
        .eq('id', settingsRow.id);
      if (uErr) throw new Error(uErr.message);

      if (previousHolidayDate && (newEvent.type !== 'holiday' || previousHolidayDate !== newEvent.startDate)) {
        await deleteHolidayDate_(previousHolidayDate);
      }
      if (newEvent.type === 'holiday' && newEvent.startDate) {
        const { data: current, error: readError } = await client
          .from('holidays').select('holiday_type').eq('holiday_date', newEvent.startDate).maybeSingle();
        if (readError) throw new Error(readError.message);
        const { error } = await client.from('holidays').upsert({
          holiday_date: newEvent.startDate,
          title: newEvent.title || 'วันหยุด',
          holiday_type: text(current?.holiday_type, 'ราชการ') || 'ราชการ'
        }, { onConflict: 'holiday_date' });
        if (error) throw new Error(error.message);
      }

      return { success: true, message: 'บันทึกรายการในปฏิทินสำเร็จ' };
    },

    async deleteAcademicCalendarEvent(eventId, requestedYear) {
      await requireAdmin();
      const year = text(requestedYear || (await currentYear()));
      const { data: settingsRow, error: sErr } = await client
        .from('school_settings')
        .select('id, settings_json')
        .limit(1)
        .maybeSingle();
      if (sErr) throw new Error(sErr.message);

      const currentJson = settingsRow?.settings_json || {};
      const calMap = currentJson.academic_calendar || {};
      const yearEvents = calMap[year] || [];

      const target = yearEvents.find((item) => item.id === eventId);
      calMap[year] = yearEvents.filter((item) => item.id !== eventId);
      currentJson.academic_calendar = calMap;

      const { error: uErr } = await client
        .from('school_settings')
        .update({ settings_json: currentJson })
        .eq('id', settingsRow.id);
      if (uErr) throw new Error(uErr.message);

      // A holiday shown from the holidays table (id "hol_…") is not in the calendar store,
      // so it must be removed from the table itself or it reappears on the next load.
      let holidayDate = target?.type === 'holiday' ? normalizeDate(target.startDate) : '';
      if (!target && text(eventId).startsWith('hol_')) {
        holidayDate = (await findHolidayTableRow_(eventId))?.holiday_date || '';
      }
      if (holidayDate) await deleteHolidayDate_(holidayDate);

      return { success: true, message: 'ลบรายการในปฏิทินสำเร็จ' };
    },

    async loadOfficialHolidaysPreset(requestedYear) {
      await requireAdmin();
      const year = text(requestedYear || (await currentYear()));
      const ceYear = parseInt(year) - 543;

      const officialPresets = [
        { date: `${ceYear}-05-04`, title: 'วันฉัตรมงคล' },
        { date: `${ceYear}-05-13`, title: 'วันพืชมงคล' },
        { date: `${ceYear}-06-03`, title: 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี' },
        { date: `${ceYear}-07-28`, title: 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว' },
        { date: `${ceYear}-07-29`, title: 'วันอาสาฬหบูชา' },
        { date: `${ceYear}-07-30`, title: 'วันเข้าพรรษา' },
        { date: `${ceYear}-08-12`, title: 'วันแม่แห่งชาติ' },
        { date: `${ceYear}-10-13`, title: 'วันนวมินทรมหาราช' },
        { date: `${ceYear}-10-23`, title: 'วันปิยมหาราช' },
        { date: `${ceYear}-12-05`, title: 'วันคล้ายวันพระบรมราชสมภพ ร.9 / วันพ่อแห่งชาติ' },
        { date: `${ceYear}-12-10`, title: 'วันรัฐธรรมนูญ' },
        { date: `${ceYear}-12-31`, title: 'วันสิ้นปี' },
        { date: `${ceYear + 1}-01-01`, title: 'วันขึ้นปีใหม่' },
        { date: `${ceYear + 1}-01-16`, title: 'วันครู' },
        { date: `${ceYear + 1}-04-06`, title: 'วันจักรี' },
        { date: `${ceYear + 1}-04-13`, title: 'วันสงกรานต์' },
        { date: `${ceYear + 1}-04-14`, title: 'วันสงกรานต์' },
        { date: `${ceYear + 1}-04-15`, title: 'วันสงกรานต์' }
      ];

      for (const p of officialPresets) {
        await this.saveAcademicCalendarEvent({
          id: 'preset_' + p.date,
          startDate: p.date,
          endDate: '',
          type: 'holiday',
          title: p.title,
          assignee: 'ส่วนกลาง',
          notes: 'วันหยุดตามประกาศราชการ',
          isCompleted: false
        }, year);
      }

      return {
        success: true,
        message: `โหลดวันหยุดราชการประจำปี ${year} จำนวน ${officialPresets.length} วัน เรียบร้อยแล้ว`
      };
    },

    async deleteHolidayByIndex(id) {
      await requireAdmin();
      const { error } = await client.from('holidays').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { success: true };
    },

    async getScoreSheetData(sheetName) {
      const reference = await resolveLegacyScoreSheet(sheetName);
      const academicYear = await currentYear();
      const students = await data.students.list({
        grade: reference.grade,
        room: reference.classNo,
        academicYear
      });
      const studentIds = students.map((student) => text(student.id)).filter(Boolean);
      const rows = await scoreRowsForSubject(reference.subject.id, academicYear, studentIds);
      const term1Rows = rows.filter((row) => number(row.semester, 1) === 1);
      const term2Rows = rows.filter((row) => number(row.semester, 1) === 2);
      const term1 = legacyTermScoreData(students, term1Rows, reference.subject);
      const term2 = legacyTermScoreData(students, term2Rows, reference.subject);
      const term1Map = new Map(term1.rows.map((row) => [row.id, row]));
      const term2Map = new Map(term2.rows.map((row) => [row.id, row]));
      const yearSummary = students.map((student) => {
        const studentId = text(student.id);
        const term1Row = term1Map.get(studentId);
        const term2Row = term2Map.get(studentId);
        const yearSaved = !!term1Row?.saved && !!term2Row?.saved;
        const yearAvg = yearSaved
          ? yearlyScoreAverage(term1Row?.total, term2Row?.total, term1Row?.saved, term2Row?.saved)
          : 0;
        return {
          id: studentId,
          name: studentDisplayName(student),
          yearAvg,
          yearGrade: yearSaved ? data.helpers.calculateGrade(yearAvg) : ''
        };
      });
      return { term1, term2, yearSummary, loadedAt: scoreVersionToken(rows), context: {
        academicYear, grade: reference.grade, classNo: reference.classNo,
        subjectCode: text(reference.subject.code || reference.subject.id)
      } };
    },
    async getStudentScoresForWeb(grade, classNo, options) {
      // ปพ.5 passes { yearEndOnly: true }: only a subject with both semesters complete gets a
      // year grade. Pages call this with (grade, classNo[, token]) and keep the old behavior.
      const yearEndOnly = !!(options && typeof options === 'object' && options.yearEndOnly);
      // หน้า "สรุปผลการเรียนรายชั้น" ส่ง { semester: 1|2 } เพื่อดูผลรายภาคเรียน
      // ค่าอื่น (รวม token ที่หน้าเก่าส่งมา) = ผลทั้งปี (เฉลี่ย 2 ภาค) แบบเดิม
      const semesterRaw = options && typeof options === 'object' ? text(options.semester).trim() : '';
      const semesterOnly = !yearEndOnly && (semesterRaw === '1' || semesterRaw === '2') ? number(semesterRaw, 1) : 0;
      const academicYear = text(options?.academicYear || await currentYear());
      const [students, subjects] = await Promise.all([
        data.students.list({ grade, room: classNo, academicYear, ...(options?.academicYear && academicYear !== await currentYear() ? { active: false } : {}) }),
        data.subjects.list(grade)
      ]);
      if (!students.length) return { success: false, message: `ไม่พบนักเรียนในชั้น ${grade} ห้อง ${classNo}` };
      const studentIds = students.map((student) => text(student.id)).filter(Boolean);
      const { data: scoreRows, error } = await client.from('scores').select('*')
        .eq('academic_year', academicYear)
        .in('student_id', studentIds);
      if (error) throw new Error(`อ่านสรุปคะแนนไม่สำเร็จ: ${error.message}`);
      const rows = scoreRows || [];
      const usedSubjects = parentSortSubjects_(academicScoreSubjects(subjects)).filter((subject) => subjectInTerm_(subject, semesterOnly));
      const grouped = new Map();
      rows.forEach((row) => {
        const key = `${text(row.student_id)}|${text(row.subject_id)}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
      });
      const summaryStudents = students.map((student) => {
        const grades = {};
        const rawGrades = {};
        // ร / มส per subject name: kept out of `grades` (pages format those as numbers) and out of the GPA.
        const specialGrades = {};
        usedSubjects.forEach((subject) => {
          const subjectRows = grouped.get(`${text(student.id)}|${text(subject.id)}`) || [];
          const t1 = subjectRows.find((row) => number(row.semester, 1) === 1);
          const t2 = subjectRows.find((row) => number(row.semester, 1) === 2);
          const special = semesterOnly ? storedSpecialGrade(semesterOnly === 2 ? t2 : t1)
            : (storedSpecialGrade(t1) || storedSpecialGrade(t2));
          if (special) {
            specialGrades[subject.name] = special;
            return;
          }
          if (semesterOnly) {
            const termRow = semesterOnly === 2 ? t2 : t1;
            if (!dashboardCompleteScore_(termRow)) return; // owner 2026-10-10: GPA นับเฉพาะวิชาที่สอบปลายภาคแล้ว (กติกาเดียวกับ ปพ.5)
            const termTotal = number(termRow?.total_score, 0);
            grades[subject.name] = number(data.helpers.calculateGrade(termTotal), 0);
            rawGrades[subject.name] = termTotal;
            return;
          }
          if (yearEndOnly) {
            const result = pp5YearEndResult(t1, t2, subject);
            if (result.status !== 'complete') return;
            grades[subject.name] = number(result.grade, 0);
            rawGrades[subject.name] = result.average;
            return;
          }
          // วิชารายภาค: ผลทั้งปี = ผลของภาคของวิชา
          const ownTerm = subjectSemester_(subject);
          if (ownTerm) {
            const ownRow = ownTerm === 2 ? t2 : t1;
            if (!dashboardCompleteScore_(ownRow)) return;
            const ownTotal = number(ownRow?.total_score, 0);
            grades[subject.name] = number(data.helpers.calculateGrade(ownTotal), 0);
            rawGrades[subject.name] = ownTotal;
            return;
          }
          const term1Entered = dashboardCompleteScore_(t1);
          const term2Entered = dashboardCompleteScore_(t2);
          if (!term1Entered || !term2Entered) return;
          const average = yearlyScoreAverage(t1?.total_score, t2?.total_score, term1Entered, term2Entered);
          const gradeValue = data.helpers.calculateGrade(average);
          grades[subject.name] = number(gradeValue, 0);
          rawGrades[subject.name] = average;
        });
        const numericGrades = Object.values(grades).map((value) => number(value, 0));
        return {
          studentId: text(student.id),
          studentNo: text(student.studentNumber || student.id),
          fullName: studentDisplayName(student),
          name: studentDisplayName(student),
          gender: text(student.gender),
          grades,
          rawGrades,
          specialGrades,
          // GPA weighted by credit (หน่วยกิต/น้ำหนัก), the same rule as the ปพ.6 report.
          average: numericGrades.length ? (() => {
            let credits = 0;
            let points = 0;
            usedSubjects.forEach((subject) => {
              if (!Object.prototype.hasOwnProperty.call(grades, subject.name)) return;
              const credit = parentSubjectCredit_(subject);
              credits += credit;
              points += number(grades[subject.name], 0) * credit;
            });
            return credits > 0 ? (points / credits).toFixed(2) : '-';
          })() : '-',
          gradedSubjectCount: numericGrades.length,
          // ร้อยละ for the rank tie-break: average score of the subjects in the GPA
          scorePct: (() => {
            const values = Object.keys(grades).map((name) => number(rawGrades[name], 0));
            return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
          })()
        };
      });
      const rankByStudentId = classRankMap_(summaryStudents
        .filter((student) => student.gradedSubjectCount > 0 && student.average !== '-')
        .map((student) => ({ id: student.studentId, gpa: number(student.average, 0), pct: student.scorePct })));
      summaryStudents.forEach((student) => {
        student.rank = rankByStudentId.get(student.studentId) || '-';
        delete student.gradedSubjectCount;
        delete student.scorePct;
      });
      const subjectTypes = Object.fromEntries(usedSubjects.map((subject) => [subject.name, subject.subject_type || '']));
      const gradeNumber = text(grade).replace(/[^0-9]/g, '');
      const gradeFullName = grade.startsWith('ป.') ? `ประถมศึกษาปีที่ ${gradeNumber}`
        : grade.startsWith('ม.') ? `มัธยมศึกษาปีที่ ${gradeNumber}`
          : grade.startsWith('อ.') ? `อนุบาลปีที่ ${gradeNumber}` : grade;
      return {
        success: true,
        grade,
        classNo,
        gradeFullName,
        term: semesterOnly ? String(semesterOnly) : 'year',
        students: summaryStudents,
        subjects: usedSubjects.map((subject) => subject.name),
        subjectTypes,
        settings: await data.settings.get()
      };
    },
    async getExamAnalysisOptions() {
      const state = await data.auth.requireUser();
      if (text(state.profile.role).toLowerCase() === 'parent') throw new Error('บัญชีนี้ไม่มีสิทธิ์ดูการวิเคราะห์ผลสอบ');
      const current = await currentYear();
      let yearRows = [];
      try { yearRows = await optionalTable('academic_years'); } catch (_error) { yearRows = []; }
      const years = [...new Set([current, ...yearRows.map((row) => text(row.academic_year))])]
        .filter((year) => /^\d{4}$/.test(year))
        .sort((left, right) => right.localeCompare(left));
      const levelOrder = (grade) => (grade.startsWith('อ.') ? 0 : grade.startsWith('ป.') ? 1 : grade.startsWith('ม.') ? 2 : 3);
      const grades = [...new Set((await data.subjects.list()).map((subject) => text(subject.grade).trim()).filter(Boolean))]
        .sort((left, right) => levelOrder(left) - levelOrder(right) || left.localeCompare(right, 'th', { numeric: true }));
      return { success: true, current, years, grades };
    },
    async getExamAnalysis(options) {
      const state = await data.auth.requireUser();
      if (text(state.profile.role).toLowerCase() === 'parent') throw new Error('บัญชีนี้ไม่มีสิทธิ์ดูการวิเคราะห์ผลสอบ');
      const grade = text(options?.grade).trim();
      if (!grade) throw new Error('กรุณาเลือกระดับชั้น');
      const current = await currentYear();
      const academicYear = text(options?.academicYear || current).trim();
      if (!/^\d{4}$/.test(academicYear)) throw new Error('ปีการศึกษาไม่ถูกต้อง');
      const semester = ['1', '2'].includes(text(options?.semester).trim()) ? text(options.semester).trim() : 'year';
      const [students, subjects] = await Promise.all([
        data.students.list({ grade, academicYear, ...(academicYear !== current ? { active: false } : {}) }),
        data.subjects.list(grade)
      ]);
      const studentIds = students.map((student) => text(student.id)).filter(Boolean);
      const rows = [];
      // PostgREST caps a response (default 1000 rows); a whole grade can exceed that, so page it.
      for (let index = 0; index < studentIds.length; index += 150) {
        const chunk = studentIds.slice(index, index + 150);
        for (let offset = 0; ; offset += 1000) {
          const { data: page, error } = await client.from('scores').select('*')
            .eq('academic_year', academicYear)
            .in('student_id', chunk)
            .order('student_id').order('subject_id').order('semester')
            .range(offset, offset + 999);
          if (error) throw new Error(`อ่านคะแนนเพื่อวิเคราะห์ไม่สำเร็จ: ${error.message}`);
          rows.push(...(page || []));
          if (!page || page.length < 1000) break;
        }
      }
      return { success: true, grade, academicYear, ...examAnalysisSummary(students, subjects, rows, semester) };
    },
    async saveScoreSheetData(sheetNameOrPayload, termId, studentScores, fullScores, fullFinal, loadedAt) {
      if (typeof sheetNameOrPayload === 'string') {
        const reference = await resolveLegacyScoreSheet(sheetNameOrPayload);
        const academicYear = await currentYear();
        const semester = termId === 'term2' || number(termId, 1) === 2 ? 2 : 1;
        assertSubjectTerm_(reference.subject, semester);
        const draftSnapshot = global.PP5ScoreDrafts?.capture({
          academicYear, grade: reference.grade, classNo: reference.classNo,
          subjectCode: text(reference.subject.code || reference.subject.id)
        }, `term${semester}`);
        const roster = await data.students.list({
          grade: reference.grade,
          room: reference.classNo,
          academicYear
        });
        const rosterIds = new Set(roster.map((student) => text(student.id)).filter(Boolean));
        const list = Array.isArray(studentScores) ? studentScores : [];
        if (!list.length) throw new Error('ไม่มีข้อมูลคะแนนที่จะบันทึก');
        const invalidIds = list.map((student) => text(student.id || student.studentId)).filter((id) => !rosterIds.has(id));
        if (invalidIds.length) throw new Error(`พบนักเรียนที่ไม่อยู่ในชั้น ${reference.grade}/${reference.classNo}: ${invalidIds.join(', ')}`);

        const existingRows = await scoreRowsForSubject(reference.subject.id, academicYear, [...rosterIds]);
        const latestUpdatedAt = existingRows.reduce((latest, row) => {
          const timestamp = Date.parse(row.updated_at || row.created_at || '');
          return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
        }, 0);
        if (number(loadedAt, 0) > 0 && latestUpdatedAt > number(loadedAt, 0)) {
          throw new Error('มีผู้ใช้อื่นแก้ไขคะแนนวิชานี้แล้ว กรุณาโหลดข้อมูลใหม่ก่อนบันทึก');
        }

        const existingSemesterIds = new Set(existingRows
          .filter((row) => number(row.semester, 1) === semester && storedScoreWasEntered(row))
          .map((row) => text(row.student_id)));
        const enteredIds = enteredLegacyScoreStudentIds(termId);
        const submittedIds = new Set(list.map((student) => text(student.id || student.studentId)));
        // แถวคะแนนว่าง (ศูนย์ทั้งแถว ไม่มีเครื่องหมายว่ากรอก) ของนักเรียนที่ยังไม่กรอกในตาราง: ลบทิ้งตอนบันทึกด้วย
        // ไม่งั้นหน้านี้แสดงเป็นช่องว่าง แต่แถวค้างอยู่ตลอดและการ์ด "แถวคะแนนว่าง" เตือนไม่หาย
        const placeholderIds = new Set(existingRows
          .filter((row) => number(row.semester, 1) === semester && !storedScoreWasEntered(row))
          .map((row) => text(row.student_id)));
        const clearedIds = enteredIds
          ? [...new Set([...existingSemesterIds, ...placeholderIds])].filter((id) => submittedIds.has(id) && !enteredIds.has(id))
          : [];
        const rowsToSave = enteredIds
          ? list.filter((student) => {
            const studentId = text(student.id || student.studentId);
            return enteredIds.has(studentId);
          })
          : list;
        if (!rowsToSave.length && !clearedIds.length) {
          throw new Error('ยังไม่ได้กรอกคะแนน กรุณากรอกอย่างน้อย 1 คนก่อนบันทึก');
        }

        const scoreConfig = subjectScoreConfig(reference.subject);
        if (scoreConfig.midMax <= 0 || scoreConfig.finalMax <= 0 || scoreConfig.midMax + scoreConfig.finalMax !== 100) {
          throw new Error(`ตั้งค่าสัดส่วนคะแนนวิชาไม่ถูกต้อง (${scoreConfig.midMax}+${scoreConfig.finalMax}) ต้องรวมเป็น 100`);
        }
        const normalizedFullScores = Array.from({ length: 9 }, (_item, index) => {
          const raw = fullScores?.[index];
          const value = raw === '' || raw === null || raw === undefined ? 0 : Number(raw);
          if (!Number.isFinite(value) || value < 0) throw new Error(`คะแนนเต็มครั้งที่ ${index + 1} ไม่ถูกต้อง`);
          return value;
        });
        const fullScoresTotal = normalizedFullScores.reduce((sum, value) => sum + value, 0);
        if (fullScoresTotal <= 0) throw new Error('กรุณากำหนดคะแนนเต็มครั้งที่ 1-9 ก่อนบันทึก');
        const normalizedFullFinal = number(fullFinal, scoreConfig.finalMax);
        if (normalizedFullFinal !== scoreConfig.finalMax) {
          throw new Error(`คะแนนเต็มปลายภาคต้องเป็น ${scoreConfig.finalMax}`);
        }
        // Without the page's table (e.g. another caller), keep the labels already stored.
        const roundLabels = legacyScoreRoundLabels(termId)
          || storedScoreRoundLabels(existingRows.filter((row) => number(row.semester, 1) === semester));
        const rows = rowsToSave.map((student) => {
          const studentId = text(student.id || student.studentId);
          const scores = Array.from({ length: 9 }, (_item, index) => {
            const raw = student.scores?.[index];
            const value = raw === '' || raw === null || raw === undefined ? 0 : Number(raw);
            if (!Number.isFinite(value) || value < 0) throw new Error(`รหัส ${studentId} คะแนนครั้งที่ ${index + 1} ไม่ถูกต้อง`);
            if (value > normalizedFullScores[index]) {
              throw new Error(`รหัส ${studentId} คะแนนครั้งที่ ${index + 1} (${value}) เกินคะแนนเต็ม ${normalizedFullScores[index]}`);
            }
            return value;
          });
          const rawFormative = scores.reduce((sum, value) => sum + value, 0);
          const mid = fullScoresTotal === scoreConfig.midMax
            ? rawFormative
            : Math.round((rawFormative / fullScoresTotal) * scoreConfig.midMax * 10) / 10;
          const rawFinal = student.final === '' || student.final === null || student.final === undefined
            ? 0
            : Number(student.final);
          if (!Number.isFinite(rawFinal) || rawFinal < 0 || rawFinal > normalizedFullFinal) {
            throw new Error(`รหัส ${studentId} คะแนนปลายภาคต้องอยู่ระหว่าง 0-${normalizedFullFinal}`);
          }
          const finalScore = rawFinal;
          const total = Math.round((mid + finalScore) * 10) / 10;
          const gradeValue = data.helpers.calculateGrade(total);
          return {
            studentId,
            subjectId: reference.subject.id,
            semester,
            academicYear,
            formativeScore: mid,
            summativeScore: finalScore,
            totalScore: total,
            gradePoint: number(gradeValue, number(data.helpers.calculateGrade(total), 0)),
            gradeText: gradeValue,
            scoreBreakdown: {
              schemaVersion: 1,
              entered: true,
              entryState: 'entered',
              scores,
              fullScores: normalizedFullScores,
              roundLabels,
              fullFinal: normalizedFullFinal,
              mid,
              final: finalScore,
              total,
              grade: gradeValue,
              makeup: number(student.makeup, 0)
            }
          };
        });
        const saved = await data.scores.saveBatch(rows, {
          subjectId: reference.subject.id, semester, academicYear,
          clearStudentIds: clearedIds, expectedUpdatedAt: number(loadedAt, 0)
        });
        if (saved.length !== rows.length) throw new Error(`บันทึกคะแนนไม่ครบ (${saved.length}/${rows.length} รายการ)`);
        global.PP5ScoreDrafts?.acknowledge(draftSnapshot);
        if (!saved.length) return `ล้างคะแนนภาคเรียนที่ ${semester} เรียบร้อย (${clearedIds.length} คน)`;
        return `บันทึกคะแนนภาคเรียนที่ ${semester} เรียบร้อย ${saved.length} คน`;
      }

      const payload = sheetNameOrPayload;
      const list = Array.isArray(payload) ? payload : (payload?.scores || payload?.records || []);
      const year = text(payload?.academicYear || payload?.academic_year || await currentYear());
      const rows = list.map((row) => {
        const breakdown = row.score_breakdown || row.scoreBreakdown || row.scores || {};
        const total = row.total_score ?? row.totalScore ?? row.total ?? row.score ?? Object.values(breakdown).reduce((sum, value) => sum + number(value), 0);
        return {
          studentId: row.student_id || row.studentId || row.id,
          subjectId: row.subject_id || row.subjectId || payload?.subjectId,
          semester: row.semester || payload?.semester || 1,
          academicYear: row.academic_year || row.academicYear || year,
          formativeScore: row.formative_score ?? row.formativeScore,
          summativeScore: row.summative_score ?? row.summativeScore,
          totalScore: total,
          gradePoint: row.grade_point ?? row.gradePoint ?? data.helpers.calculateGrade(total),
          gradeText: row.grade_text ?? row.gradeText,
          scoreBreakdown: breakdown
        };
      }).filter((row) => row.studentId && row.subjectId);
      if (rows.length) await data.scores.save(rows);
      return { success: true, message: `บันทึกคะแนน ${rows.length} รายการ`, saved: rows.length };
    },
    async saveStudentScores(payload) { return this.saveScoreSheetData(payload); },
    async createScoreSheetWithStudents(subjectCode, subjectName, hour, grade, classNo, selectedStudents) {
      const normalizedCode = text(subjectCode).trim();
      const normalizedName = text(subjectName).trim();
      const [students, subjects] = await Promise.all([
        data.students.list({ grade, room: classNo }),
        data.subjects.list(grade)
      ]);
      const subject = subjects.find((item) => {
        const codes = [item.id, item.code, item.subjectCode].map((value) => text(value).trim());
        return (normalizedCode && codes.includes(normalizedCode)) ||
          (normalizedName && text(item.name || item.subjectName).trim() === normalizedName);
      });
      if (!subject) {
        throw new Error(`ไม่พบรายวิชา ${normalizedCode || normalizedName || '-'} ของชั้น ${grade} ใน Supabase`);
      }
      if (!students.length) throw new Error(`ไม่พบนักเรียนในชั้น ${grade}/${classNo}`);

      const rosterIds = new Set(students.map((student) => text(student.id || student.studentId).trim()).filter(Boolean));
      const requestedStudents = Array.isArray(selectedStudents) && selectedStudents.length
        ? selectedStudents
        : students;
      const requestedIds = requestedStudents
        .map((student) => text(student.id || student.studentId || student.student_id).trim())
        .filter(Boolean);
      if (requestedIds.length !== requestedStudents.length) {
        throw new Error('พบข้อมูลนักเรียนที่ไม่มีรหัสนักเรียน');
      }
      const outsideRoster = requestedIds.filter((studentId) => !rosterIds.has(studentId));
      if (outsideRoster.length) {
        throw new Error(`พบนักเรียนที่ไม่อยู่ในชั้น ${grade}/${classNo}: ${outsideRoster.join(', ')}`);
      }

      const hoursPerYear = subject.hours_per_year ?? hour ?? '';
      return `✅ อัปเดตตารางคะแนน ${subject.name || normalizedName} ${grade}/${classNo} พร้อมใช้งาน (${requestedIds.length} คน${hoursPerYear !== '' ? `, ${hoursPerYear} ชั่วโมง/ปี` : ''})`;
    },
    async checkMultipleSheets(sheetNames) {
      // Supabase builds score tables dynamically from subjects, students and scores.
      // Returning the requested logical table names preserves the legacy page contract.
      return Array.isArray(sheetNames) ? [...sheetNames] : [];
    },
    async getSubjectAssessmentConfig(subjectName, subjectCode, grade) {
      const subjects = await data.subjects.list(grade);
      const targetName = normalizedSubjectLabel(subjectName);
      const targetCode = normalizedSubjectLabel(subjectCode);
      const subject = subjects.find((item) =>
        matchSubjectCandidate(item, targetName, targetCode) ||
        (targetCode && [item.id, item.code, item.subjectCode].some((value) => normalizedSubjectLabel(value) === targetCode)) ||
        (targetName && normalizedSubjectLabel(item.name || item.subjectName) === targetName)
      );
      const config = subjectScoreConfig(subject);
      return { midMax: config.midMax, finalMax: config.finalMax, fullScores: config.fullScores };
    },

    async getStudentsForCharacteristic(grade, classNo) { return loadAssessment('characteristic', 'c', 8, grade, classNo); },
    async saveCharacteristicAssessmentBatch(payload) { return saveAssessment('characteristic', 'c', payload); },
    async getStudentsForCompetency(grade, classNo) { return loadAssessment('competency', 'cp', 25, grade, classNo); },
    async saveCompetencyAssessment(payload) { return saveAssessment('competency', 'cp', payload); },
    async getStudentsForActivity(grade, classNo) { return loadActivityAssessment(grade, classNo); },
    async saveActivityAssessmentBatch(payload) { return saveActivityAssessment(payload); },
    async clearAssessmentBatch(payload) { return clearAssessmentBatch(payload); },
    async getStudentsForRTW5(grade, classNo) { return loadAssessment('rtw', 'rtw', 5, grade, classNo); },
    async saveRTW5AssessmentBatch(payload) { return saveAssessment('rtw', 'rtw', payload); },
    async getStudentsForSubjectScore(grade, classNo) { return loadSubjectScoreAssessment(grade, classNo); },
    async saveSubjectScoreAssessmentBatch(payload) { return saveSubjectScoreAssessment(payload); },
    async saveCommentWithValidation(payload, commentArg) {
      // The บันทึกความคิดเห็นครูที่ปรึกษา page(s) in gas-pages.js call this positionally —
      // saveCommentWithValidation(studentId, comment, token) — not with a payload object.
      // That made `payload` a bare studentId *string* here, so payload.studentId was always
      // undefined and every save silently upserted a garbage row keyed on an empty
      // student_id, overwriting the same bogus row on every save from every teacher instead
      // of ever touching the real student's row. Accept both shapes so existing pages work
      // without needing their own (much riskier — see AGENT_HANDOFF traps) edit.
      const state = await data.auth.requireUser();
      const isPositional = typeof payload === 'string';
      const studentId = text(isPositional ? payload : (payload?.studentId || payload?.student_id));
      const commentText = text(isPositional ? commentArg : (payload?.comment || payload?.teacherComment));
      if (!studentId) throw new Error('ไม่พบรหัสนักเรียน');
      if (!commentText) throw new Error('กรุณากรอกความคิดเห็น');
      const settings = await data.settings.get();
      const defaultSemester = number(settings.semester, 1) === 2 ? 2 : 1;
      const semesterValue = isPositional ? defaultSemester
        : ([1, 2].includes(number(payload?.semester, 0)) ? number(payload.semester, 0) : defaultSemester);
      const academicYear = text(!isPositional && (payload?.academicYear || payload?.academic_year)
        ? (payload.academicYear || payload.academic_year)
        : (settings.academicYear || settings.academic_year)) || text(await currentYear());
      const row = { student_id: studentId, academic_year: academicYear, semester: semesterValue, comment: commentText, recorded_by: state.user.id };
      const { error } = await client.from('student_comments').upsert(row, { onConflict: 'student_id,academic_year,semester' });
      if (error) throw new Error(error.message);
      return { success: true, message: 'บันทึกความคิดเห็นครูเรียบร้อยแล้ว' };
    },

    async getStudentGrowthDefaults() {
      const [settings, students] = await Promise.all([data.settings.get(), data.students.list()]);
      return { success: true, month: String(new Date().getMonth() + 1), roundNo: '1', academicYear: settings.academicYear, students };
    },
    async getStudentGrowthStudents(grade, classNo, academicYear, month, roundNo) {
      const year = text(academicYear || await currentYear());
      const monthNumber = Math.max(1, Math.min(12, number(month, new Date().getMonth() + 1)));
      const roundNumber = Math.max(1, number(roundNo, 1));
      const students = await data.students.list({ grade, room: classNo, academicYear: year });
      const studentIds = students
        .map((student) => text(student.student_id || student.studentId || student.id))
        .filter(Boolean);
      let savedRows = [];
      let roundStorageReady = true;
      if (studentIds.length) {
        const { data: rows, error } = await client.from('student_growth')
          .select('*')
          .in('student_id', studentIds)
          .eq('academic_year', year)
          .eq('month', monthNumber)
          .eq('round_no', roundNumber);
        if (error && data.helpers.isOptionalSchemaError(error)) roundStorageReady = false;
        else if (error) throw new Error(error.message);
        else savedRows = rows || [];
      }
      const savedByStudent = new Map(savedRows.map((row) => [text(row.student_id), row]));
      return {
        success: true,
        academicYear: year,
        month: monthNumber,
        roundNo: roundNumber,
        roundStorageReady,
        migrationRequired: !roundStorageReady,
        students: students.map((student) => {
          const studentId = text(student.student_id || student.studentId || student.id);
          const saved = savedByStudent.get(studentId);
          const studentName = text(
            student.student_name ||
            student.fullName ||
            student.name ||
            `${text(student.prefix || student.title)}${text(student.first_name || student.firstname)} ${text(student.last_name || student.lastname)}`.trim()
          );
          // Only show measurements saved for this exact year/month/round.
          // A new round starts blank so old measurements are not mistaken for new ones.
          const weight = saved?.weight_kg ?? '';
          const height = saved?.height_cm ?? '';
          const bmi = weight !== '' && height !== '' && number(height) > 0
            ? (number(weight) / ((number(height) / 100) ** 2)).toFixed(2)
            : '';
          return {
            // The embedded legacy page consumes snake_case fields. Keep camelCase
            // aliases as well so newer Supabase-native callers remain compatible.
            student_id: studentId,
            studentId,
            id: studentId,
            student_number: student.student_number ?? student.studentNumber ?? '',
            studentNumber: student.studentNumber ?? student.student_number ?? '',
            student_name: studentName,
            fullName: studentName,
            gender: text(student.gender),
            weight_kg: weight,
            weight,
            height_cm: height,
            height,
            bmi,
            nutrition_status: text(saved?.nutrition_status),
            note: text(saved?.note),
            has_saved_record: !!saved,
            hasSavedRecord: !!saved
          };
        })
      };
    },
    async saveStudentGrowthBatch(payload) {
      const state = await data.auth.requireUser();
      const list = payload?.records || payload?.items || payload?.students || [];
      const year = text(payload?.academicYear || await currentYear());
      const monthNumber = number(payload?.month, 0);
      const roundNumber = number(payload?.roundNo ?? payload?.round_no, 0);
      if (!/^\d{4}$/.test(year)) throw new Error('กรุณาระบุปีการศึกษาเป็นตัวเลข 4 หลัก');
      if (monthNumber < 1 || monthNumber > 12) throw new Error('กรุณาเลือกเดือนให้ถูกต้อง');
      if (roundNumber < 1) throw new Error('กรุณาเลือกรอบการชั่งวัดให้ถูกต้อง');
      const measuredOn = normalizeDate(payload?.measureDate || payload?.measuredOn || payload?.date || new Date());
      const nullableDecimal = (value) => {
        const raw = text(value).trim();
        if (!raw) return null;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) throw new Error(`ค่าน้ำหนักหรือส่วนสูงไม่ถูกต้อง: ${raw}`);
        return parsed;
      };
      const rows = list.map((item) => {
        // Embedded inputs edit snake_case fields; loaded aliases can be stale.
        const weight = nullableDecimal(item.weight_kg ?? item.weight);
        const height = nullableDecimal(item.height_cm ?? item.height);
        const bmi = weight !== null && height !== null && height > 0
          ? Number((weight / ((height / 100) ** 2)).toFixed(2))
          : null;
        return {
          student_id: text(item.studentId || item.student_id || item.id),
          measured_on: normalizeDate(item.measuredOn || measuredOn),
          academic_year: text(item.academicYear || year),
          month: monthNumber,
          round_no: roundNumber,
          weight_kg: weight,
          height_cm: height,
          bmi,
          nutrition_status: text(item.nutrition_status) || null,
          note: text(item.note) || null,
          recorded_by: state.user.id
        };
      }).filter((row) => row.student_id);
      const { error } = await client.from('student_growth').upsert(rows, {
        onConflict: 'student_id,academic_year,month,round_no'
      });
      if (error && data.helpers.isOptionalSchemaError(error)) {
        throw new Error('ฐานข้อมูลยังไม่รองรับการเก็บแยกเดือนและรอบ กรุณาติดตั้ง migration 202608290008 ก่อนบันทึก');
      }
      if (error?.code === '23505' && /measured_on/i.test(error.message || '')) {
        throw new Error('นักเรียนบางคนมีข้อมูลในวันที่ชั่งวัดนี้แล้ว กรุณาตรวจวันที่ของแต่ละรอบก่อนบันทึก');
      }
      if (error) throw new Error(error.message);
      return {
        success: true,
        message: `บันทึกน้ำหนัก-ส่วนสูง เดือน ${monthNumber} รอบที่ ${roundNumber} จำนวน ${rows.length} รายการ`,
        saved: rows.length,
        academicYear: year,
        month: monthNumber,
        roundNo: roundNumber
      };
    },
    async exportStudentGrowthSheetPdf(filters) {
      const { grade, classNo, academicYear, month, roundNo } = filters || {};
      if (!grade || !classNo) throw new Error('กรุณาเลือกชั้นและห้อง');
      const year = text(academicYear || await currentYear());
      const mode = ['saved', 'blank', 'custom'].includes(filters.mode) ? filters.mode : 'saved';
      const roster = await data.students.list({ grade, room: classNo, academicYear: year });
      if (!roster.length) throw new Error('ไม่พบนักเรียนในชั้น/ห้องที่เลือก');
      let saved = new Map();
      let sections;
      if (mode === 'saved' && (!month || !roundNo)) {
        const months = filters.period === 'term1' ? [5, 6, 7, 8, 9, 10] : filters.period === 'term2' ? [11, 12, 1, 2, 3, 4] : [5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4];
        const rows = await optionalTableAll('student_growth', query => {
          let scoped = query.eq('academic_year', year).in('student_id', roster.map(s => text(s.student_id || s.id)));
          if (month) scoped = scoped.eq('month', number(month));
          else scoped = scoped.in('month', months);
          if (roundNo) scoped = scoped.eq('round_no', number(roundNo));
          return scoped;
        });
        const groups = new Map();
        for (const row of rows) {
          const key = `${row.month}/${row.round_no}`;
          if (!groups.has(key)) groups.set(key, { month: row.month, roundNo: row.round_no, rows: new Map() });
          groups.get(key).rows.set(text(row.student_id), row);
        }
        if (!groups.size) throw new Error('ไม่พบข้อมูลน้ำหนัก–ส่วนสูงที่บันทึกไว้ตามตัวกรองที่เลือก');
        sections = Array.from(groups.values()).sort((a, b) => ((number(a.month) + 7) % 12) - ((number(b.month) + 7) % 12) || number(a.roundNo) - number(b.roundNo)).map(group => ({
          semester: number(group.month) >= 5 && number(group.month) <= 10 ? '1' : '2',
          periodLabel: `${THAI_MONTH_NAMES[number(group.month) - 1]}  รอบที่ ${group.roundNo}  (ข้อมูลที่บันทึกแล้ว)`,
          students: roster.map(s => {
            const id = text(s.student_id || s.id), row = group.rows.get(id);
            return { student_id: id, student_number: s.student_number ?? s.studentNumber,
              student_name: studentDisplayName(s), national_id: text(s.national_id || s.nationalId || s.idCard),
              weight_kg: row?.weight_kg ?? '', height_cm: row?.height_cm ?? '' };
          })
        }));
      }
      if (mode === 'saved' && !sections) {
        const { data: rows, error } = await client.from('student_growth').select('*')
          .in('student_id', roster.map(s => text(s.student_id || s.id)))
          .eq('academic_year', year).eq('month', number(month)).eq('round_no', number(roundNo));
        if (error) throw new Error(error.message);
        saved = new Map((rows || []).map(row => [text(row.student_id), row]));
      }
      const students = roster.map(s => {
        const id = text(s.student_id || s.id);
        const row = saved.get(id);
        return { student_id: id, student_number: s.student_number ?? s.studentNumber,
          student_name: studentDisplayName(s), national_id: text(s.national_id || s.nationalId || s.idCard),
          weight_kg: row?.weight_kg ?? '', height_cm: row?.height_cm ?? '' };
      });
      const options = await attendancePrintOptions(grade, classNo, '', year);
      options.academicYear = year;
      const periodLabel = mode === 'custom' ? '' : `${THAI_MONTH_NAMES[number(month) - 1] || ''}  รอบที่ ${roundNo}${mode === 'blank' ? '  (แบบกรอกบนกระดาษ)' : '  (ข้อมูลที่บันทึกแล้ว)'}`;
      const url = await attendancePdfExporter().createGrowthSheet(students, options, { ...filters, mode, periodLabel, sections });
      return { success: true, url, fileName: `ตาราง_${mode}_${grade}_${classNo}_${year}.pdf` };
    },
    async getStudentGrowthReport(filters, classNo) {
      return buildStudentGrowthReport(filters, classNo);
    },
    async exportStudentGrowthMatrixPdf(filters, classNo) {
      const report = await buildStudentGrowthReport(filters, classNo);
      const options = await attendancePrintOptions(report.grade, report.classNo, report.label, report.academicYear);
      const url = await attendancePdfExporter().createGrowthMonthlyReport(report, options);
      return { success: true, url, viewUrl: url, downloadUrl: url, fileName: `รายงานน้ำหนักส่วนสูงรายเดือน_${report.academicYear}.pdf`, format: 'pdf' };
    },
    async exportStudentGrowthMatrixXls(filters, classNo) {
      const report = await buildStudentGrowthReport(filters, classNo);
      const quote = (value) => `"${text(value).replaceAll('"', '""')}"`;
      const lines = [['ที่', 'วันที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ชั้น', 'ห้อง', 'น้ำหนัก (กก.)', 'ส่วนสูง (ซม.)', 'BMI', 'ภาวะโภชนาการ', 'หมายเหตุ'].map(quote).join(',')];
      report.rows.forEach((row, index) => lines.push([index + 1, row.measure_date, row.student_id, row.student_name, row.grade, row.class_no, row.weight_kg, row.height_cm, row.bmi, row.nutrition_status, row.note].map(quote).join(',')));
      const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      return { success: true, url, downloadUrl: url, fileName: `รายงานน้ำหนักส่วนสูง_${report.academicYear}.csv`, format: 'csv' };
    },

    // The home page calls this with a token string (whole school, unchanged); the dashboard passes
    // { dashboard: true } so a class teacher's numbers are that class only (dashboardCardStudents_).
    async getFastStudentStats(options) {
      const students = options && options.dashboard === true
        ? (await dashboardCardStudents_()).students
        : await data.students.list();
      return studentStats_(students);
    },
    async getCachedDashboardSummary() {
      // Current academic year up to today, paged: a plain select stops at 1000 of the ~6000
      // attendance rows, which left only ป.3 and ป.6 in the chart.
      const range = academicYearDateRange(await currentYear() || '2569');
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const last = today < range.last ? today : range.last;
      const [cardScope, settings, attendanceDaily] = await Promise.all([
        dashboardCardStudents_(),
        data.settings.get(),
        optionalTableAll('attendance_daily', (query) => query.gte('attendance_date', range.first).lte('attendance_date', last))
      ]);
      const students = cardScope.students;
      const stats = studentStats_(students);

      const allGrades = cardScope.grades;
      const studentMap = new Map(students.map((s) => [text(s.id), s]));
      const yearlyByGrade = {};
      allGrades.forEach((g) => {
        yearlyByGrade[g] = { totalPresent: 0, totalLeave: 0, totalAbsent: 0, totalDays: 0, attendanceRate: 0 };
      });

      attendanceDaily.forEach((a) => {
        const s = studentMap.get(text(a.student_id));
        if (s?.grade && yearlyByGrade[s.grade]) {
          // Rows with no status (e.g. "none") were never checked, so they are not school days.
          const status = normalizeAttendanceStatus(a.status);
          if (!status) return;
          if (status === 'present') yearlyByGrade[s.grade].totalPresent += 1;
          else if (status === 'leave') yearlyByGrade[s.grade].totalLeave += 1;
          else yearlyByGrade[s.grade].totalAbsent += 1;
          yearlyByGrade[s.grade].totalDays += 1;
        }
      });

      allGrades.forEach((g) => {
        const item = yearlyByGrade[g];
        item.attendanceRate = item.totalDays > 0 ? Number(((item.totalPresent / item.totalDays) * 100).toFixed(1)) : 0;
      });

      return {
        total: stats.total,
        totalStudents: stats.total,
        male: stats.male,
        female: stats.female,
        academicYear: settings.academicYear,
        semester: settings.semester,
        schoolName: settings.schoolName,
        attendance: { yearlyByGrade },
        scope: cardScope.scope,
        scopeLabel: cardScope.scopeLabel,
        lastUpdated: new Date().toISOString()
      };
    },
    async getDashboardProgress() {
      // Everything here is the current academic year and primary students only (kindergarten has no
      // grades or ป.5 assessments). Large tables are paged: a plain select stops at 1000 rows, which
      // once hid every attendance row of the current month (0/105 while 60 were checked).
      const { semester, byYear, byTerm } = await dashboardTerm_();
      const now = new Date();
      const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
      const currentMonthName = thaiMonths[now.getMonth()];
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const nextMonthStart = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;

      const [cardScope, subjects, scores, attendanceDaily, assessments] = await Promise.all([
        dashboardCardStudents_(),
        data.subjects.list(),
        optionalTableAll('scores', byTerm),
        optionalTableAll('attendance_daily', (query) => query.gte('attendance_date', monthStart).lt('attendance_date', nextMonthStart)),
        optionalTableAll('assessments', byYear)
      ]);
      const students = cardScope.students.filter((s) => cardScope.grades.includes(text(s.grade).trim()));
      const studentIds = new Set(students.map((s) => text(s.id)));

      // this semester's scores against this semester's subjects (a ม.ต้น term-2 subject is not "missing" in term 1)
      const gradeRows = gradeRecordingByGrade_(students, (subjects || []).filter((sb) => subjectInTerm_(sb, semester)), scores, cardScope.grades);
      const recordedSubjects = gradeRows.reduce((sum, g) => sum + g.recordedCount, 0);
      const expectedSubjects = gradeRows.reduce((sum, g) => sum + g.total, 0);
      const completeGrades = gradeRows.filter((g) => g.recordedCount >= g.total).length;

      const thisMonthAttStudents = new Set();
      attendanceDaily.forEach((a) => {
        const sid = text(a.student_id);
        if (studentIds.has(sid)) thisMonthAttStudents.add(sid);
      });

      const rtwStudents = new Set();
      const charStudents = new Set();
      assessments.forEach((ass) => {
        const t = text(ass.assessment_type).toLowerCase();
        const sid = text(ass.student_id);
        if (!studentIds.has(sid)) return;
        if (t.includes('rtw') || t.includes('read') || t.includes('อ่าน')) rtwStudents.add(sid);
        if (t.includes('char') || t.includes('คุณลักษณะ')) charStudents.add(sid);
      });

      const totalStudents = students.length || 1;
      const items = [
        {
          label: `คะแนนรายวิชา ภาค ${semester} (ไม่รวมกิจกรรม)`,
          completed: recordedSubjects,
          total: expectedSubjects,
          unit: 'วิชา',
          icon: 'bi-pencil-square',
          iconBg: '#6366f1'
        },
        {
          label: `ชั้นที่บันทึกเกรดครบทุกวิชา ภาค ${semester}`,
          completed: completeGrades,
          total: cardScope.grades.length,
          unit: 'ชั้น',
          icon: 'bi-mortarboard',
          iconBg: '#8b5cf6'
        },
        {
          label: `เช็คชื่อเดือนนี้ (${currentMonthName})`,
          completed: thisMonthAttStudents.size,
          total: totalStudents,
          unit: 'คน',
          icon: 'bi-calendar-check',
          iconBg: '#10b981'
        },
        {
          label: 'ประเมินอ่าน คิด เขียน',
          completed: rtwStudents.size,
          total: totalStudents,
          unit: 'คน',
          icon: 'bi-journal-text',
          iconBg: '#ec4899'
        },
        {
          label: 'ประเมินคุณลักษณะ',
          completed: charStudents.size,
          total: totalStudents,
          unit: 'คน',
          icon: 'bi-check-circle',
          iconBg: '#f59e0b'
        }
      ];

      return {
        items,
        attendanceRate: Math.round((thisMonthAttStudents.size / totalStudents) * 100),
        scoreEnteredRate: expectedSubjects ? Math.round((recordedSubjects / expectedSubjects) * 100) : 0,
        assessmentRate: Math.round((charStudents.size / totalStudents) * 100)
      };
    },
    // Smart Dashboard "งานที่ยังค้าง" (owner 2026-10-07): per room, the current semester (ตั้งค่า) only.
    //   scores: a subject is complete when EVERY student of the room has a grade for it (activity subjects
    //   are assessed, never graded, so they are not counted; same rule as gradeRecordingByGrade_).
    //   assessments: students of the room with at least one row of that type this semester. The two
    //   อ่าน คิดวิเคราะห์ เขียน forms (ปพ.5 per subject / 5 เกณฑ์ ปพ.6) only appear when the school used
    //   that form at all this year, so a form the school does not use is not shown as forever pending.
    // Read only; scope (whole school / the teacher's class) is the same as the other dashboard cards.
    async getDashboardPendingWork() {
      const scope = await dashboardScope_();
      const { semester, byYear, byTerm } = await dashboardTerm_();
      const students = scope.gradeStudents.filter((s) => taughtGrades_().includes(text(s.grade).trim()));
      const ids = new Set(students.map((s) => text(s.id)));
      const [subjects, scores, assessments] = await Promise.all([
        data.subjects.list().catch(() => []),
        students.length ? optionalTableAll('scores', byTerm) : [],
        students.length ? optionalTableAll('assessments', byYear) : []
      ]);
      const subjectById = new Map((subjects || []).map((sb) => [text(sb.id), sb]));
      const namesByGrade = {};
      (subjects || []).forEach((sb) => {
        const g = text(sb.grade).trim();
        if (!taughtGrades_().includes(g) || !sb.name || isActivityScoreSubject_(sb) || !subjectInTerm_(sb, semester)) return;
        (namesByGrade[g] ||= new Set()).add(text(sb.name));
      });
      // student id -> Set of graded subject names (this semester)
      const graded = new Map();
      (scores || []).forEach((sc) => {
        const sid = text(sc.student_id);
        if (!ids.has(sid)) return;
        if (sc.grade_point === null || sc.grade_point === undefined || sc.grade_point === '') return;
        const sb = subjectById.get(text(sc.subject_id));
        if (!sb?.name) return;
        if (!graded.has(sid)) graded.set(sid, new Set());
        graded.get(sid).add(text(sb.name));
      });
      const TYPES = [
        { key: 'characteristic', label: 'คุณลักษณะ', page: 'characteristic_assessment', always: true },
        { key: 'competency', label: 'สมรรถนะ', page: 'competency_assessment', always: true },
        { key: 'subject_rtw', label: 'อ่านคิดเขียน (ปพ.5)', page: 'read_think_write_form', always: false },
        { key: 'rtw', label: 'อ่านคิดเขียน 5 เกณฑ์', page: 'rtw5_assessment', always: false },
        { key: 'activity', label: 'กิจกรรม', page: 'activity_assessment', always: true }
      ];
      const usedThisYear = new Set();
      const assessed = {}; // type -> Set of student ids (this semester)
      TYPES.forEach((t) => { assessed[t.key] = new Set(); });
      (assessments || []).forEach((row) => {
        const sid = text(row.student_id);
        const type = text(row.assessment_type);
        if (!ids.has(sid) || !assessed[type]) return;
        usedThisYear.add(type);
        if (number(row.semester, 1) === semester) assessed[type].add(sid);
      });
      const types = TYPES.filter((t) => t.always || usedThisYear.has(t.key));

      const rooms = new Map();
      students.forEach((s) => {
        const key = dashboardClassKey_(s);
        if (!rooms.has(key)) rooms.set(key, { label: key, grade: text(s.grade).trim(), room: text(s.room || '1'), ids: [] });
        rooms.get(key).ids.push(text(s.id));
      });
      const list = [...rooms.values()].sort((a, b) => a.label.localeCompare(b.label, 'th', { numeric: true })).map((r) => {
        const names = [...(namesByGrade[r.grade] || [])];
        const missing = names.filter((name) => r.ids.some((sid) => !graded.get(sid)?.has(name)));
        const partial = missing.filter((name) => r.ids.some((sid) => graded.get(sid)?.has(name)));
        const cells = {};
        types.forEach((t) => { cells[t.key] = { done: r.ids.filter((sid) => assessed[t.key].has(sid)).length, total: r.ids.length }; });
        return {
          label: r.label, grade: r.grade, room: r.room, students: r.ids.length,
          scores: { done: names.length - missing.length, total: names.length, missing, partial },
          assessments: cells
        };
      });
      const sum = (fn) => list.reduce((n, r) => n + fn(r), 0);
      return {
        success: true,
        academicYear: scope.academicYear,
        semester,
        scope: scope.scope,
        scopeLabel: scope.scopeLabel,
        types: types.map(({ key, label, page }) => ({ key, label, page })),
        rooms: list,
        totals: {
          scoreDone: sum((r) => r.scores.done),
          scoreTotal: sum((r) => r.scores.total),
          assessDone: sum((r) => types.reduce((n, t) => n + r.assessments[t.key].done, 0)),
          assessTotal: sum((r) => types.reduce((n, t) => n + r.assessments[t.key].total, 0))
        }
      };
    },
    // Smart Dashboard "พิมพ์สรุป 1 หน้า" (owner 2026-10-08): the same numbers as the cards on screen,
    // same scope (whole school / the teacher's class). Read only; returns a blob URL of the PDF.
    async generateDashboardSummaryPdf() {
      if (!global.PP5PDF?.createDashboardSummary) throw new Error('ระบบสร้าง PDF ยังโหลดไม่เสร็จ กรุณาลองอีกครั้ง');
      const [stats, today, pending, watch] = await Promise.all([
        this.getFastStudentStats({ dashboard: true }),
        this.getDashboardTodayAttendance(),
        this.getDashboardPendingWork(),
        this.getDashboardWatchlist().catch(() => null)
      ]);
      const pct = (done, total) => (total ? Math.round((done / total) * 100) : 0);
      const t = today.totals || {};
      const checked = number(t.checked, 0);
      const p = pending.totals || {};
      const stateLabel = { done: 'เช็คครบแล้ว', partial: 'เช็คยังไม่ครบ', none: 'ยังไม่เช็คชื่อ', prefilled: 'กรอกไว้ล่วงหน้า' };
      const dayLabel = thaiShortDate_(today.day);
      const term = `ภาคเรียนที่ ${pending.semester || 1}`;
      const summary = {
        title: 'สรุปภาพรวมโรงเรียน',
        metaLine: [pending.scopeLabel || today.scopeLabel, `ปีการศึกษา ${pending.academicYear || today.academicYear || ''}`, term].filter(Boolean).join('   '),
        kpis: [
          { label: 'นักเรียน', value: `${stats.total} คน`, note: `ชาย ${stats.male} · หญิง ${stats.female}` },
          { label: today.isToday ? 'มาเรียนวันนี้' : 'มาเรียน (วันเรียนล่าสุด)', value: checked ? `${pct(t.present, checked)}%` : '-', note: `มา ${t.present || 0} จาก ${checked} คน · ${dayLabel}` },
          { label: `กรอกคะแนน ${term}`, value: `${pct(p.scoreDone, p.scoreTotal)}%`, note: `ครบ ${p.scoreDone || 0} จาก ${p.scoreTotal || 0} วิชา-ห้อง` },
          { label: `ประเมินผล ${term}`, value: `${pct(p.assessDone, p.assessTotal)}%`, note: `${(pending.types || []).length} ด้าน` }
        ],
        today: {
          heading: `เช็คชื่อ${today.isToday ? 'วันนี้' : 'วันเรียนล่าสุด'} ${dayLabel}`,
          rows: (today.classes || []).map((c) => [c.label, c.total, c.checked, c.present, c.leave, c.absent, stateLabel[c.state] || ''])
        },
        pending: {
          heading: `งานที่ยังค้าง ${term} (ทำแล้ว/ทั้งหมด)`,
          types: (pending.types || []).map((ty) => ty.label),
          rows: (pending.rooms || []).map((r) => [
            `${r.label} (${r.students} คน)`,
            r.scores.total && r.scores.done >= r.scores.total ? 'ครบ' : `${r.scores.done}/${r.scores.total}`,
            ...(pending.types || []).map((ty) => {
              const a = r.assessments[ty.key] || { done: 0, total: 0 };
              return a.total && a.done >= a.total ? 'ครบ' : `${a.done}/${a.total}`;
            })
          ])
        },
        watch: watch ? [
          ['นักเรียนที่ต้องติดตาม (คน)', watch.counts?.students || 0],
          ['เกรด 0 ที่กรอกครบแล้ว (รายวิชา)', watch.counts?.grade0 || 0],
          ['ร / มส (รายวิชา)', watch.counts?.special || 0],
          ['มาเรียนต่ำกว่า 80% (คน)', watch.counts?.attendance || 0]
        ] : [],
        footer: `พิมพ์เมื่อ ${thaiShortDate_(localIsoDate_(new Date()))} ${new Date().toTimeString().slice(0, 5)} น. · ตัวเลขชุดเดียวกับหน้าภาพรวมโรงเรียน ณ เวลาที่พิมพ์`
      };
      const options = await attendancePrintOptions('', '', '');
      options.includeSignatures = false;
      const url = await global.PP5PDF.createDashboardSummary(summary, options);
      return { success: true, url, fileName: `สรุปภาพรวม_${today.day || localIsoDate_(new Date())}.pdf` };
    },
    async getDashboardAlerts() {
      const academicYear = text(await currentYear()).trim();
      const [cardScope, scores, settings] = await Promise.all([
        dashboardCardStudents_(),
        optionalTableAll('scores', (query) => (academicYear ? query.eq('academic_year', academicYear) : query)),
        data.settings.get().catch(() => ({}))
      ]);
      const alerts = [];
      // A class teacher only hears about their own class (the whole school keeps counting every row).
      const classIds = cardScope.scope === 'class' ? new Set(cardScope.students.map((s) => text(s.id))) : null;

      // Only a fully entered row with a final exam recorded counts as an actual grade 0;
      // a semester still in progress (marks entered, final exam not yet) is not a result.
      let zeroCount = 0;
      scores.forEach((sc) => {
        if (classIds && !classIds.has(text(sc.student_id))) return;
        if (!dashboardCompleteScore_(sc)) return;
        const finalGrade = text(storedFinalGrade(sc)).trim();
        if (finalGrade !== '' && Number(finalGrade) === 0) zeroCount += 1;
      });

      if (zeroCount > 0) {
        alerts.push({
          type: 'danger',
          icon: 'bi-exclamation-triangle-fill',
          message: `พบนักเรียนได้เกรด 0 จำนวน <strong>${zeroCount}</strong> รายการ`
        });
      }

      if (!settings?.schoolName) {
        alerts.push({
          type: 'warning',
          icon: 'bi-gear-fill',
          message: 'ยังไม่ได้ตั้งค่า<strong>ชื่อโรงเรียน</strong>'
        });
      }

      return { alerts };
    },
    // Smart Dashboard "นักเรียนที่ต้องติดตาม": current-year students with a stored grade 0,
    // ร / มส, or attendance under 80% (days recorded up to today, holidays excluded).
    // Read-only. Teachers with a class in their profile only see that class.
    async getDashboardWatchlist() {
      const { academicYear, students, ids, attendanceIds, gradeIds, range, last, scope, scopeLabel } = await dashboardScope_();
      const empty = { success: true, academicYear, asOf: last, scope, scopeLabel, totalStudents: ids.length, counts: { students: 0, grade0: 0, special: 0, attendance: 0 }, classes: [] };
      if (!ids.length) return empty;

      const [subjects, scoreRows, attendanceRows, holidays] = await Promise.all([
        data.subjects.list(),
        // Kindergarten (อ.1-อ.3) is excluded here: the school does not record grades for
        // kindergarten, so pulling their (nonexistent) rows just wastes the query.
        gradeIds.length
          ? optionalTableAll('scores', (query) => query.in('student_id', gradeIds).eq('academic_year', academicYear))
          : [],
        // Kindergarten (อ.1-อ.3) is excluded here: those classes are never checked in, so
        // pulling their (nonexistent) rows just wastes the query.
        attendanceIds.length
          ? optionalTableAll('attendance_daily', (query) => query.in('student_id', attendanceIds).gte('attendance_date', range.first).lte('attendance_date', last))
          : [],
        noSchoolHolidayDateSet_(range.first, last)
      ]);
      const subjectName = new Map(subjects.map((s) => [text(s.id), s.subjectName || s.name || text(s.id)]));
      const byStudent = new Map(students.map((s) => [text(s.id), { id: text(s.id), name: studentDisplayName(s), grade: text(s.grade), room: text(s.room || '1'), issues: [], attendanceRate: null, attendanceDays: 0 }]));

      let pendingFinal = 0;
      let notEntered = 0;
      scoreRows.forEach((row) => {
        const entry = byStudent.get(text(row.student_id));
        if (!entry) return;
        const gradeText = text(row.grade_text).trim();
        const semester = number(row.semester, 1);
        const subject = subjectName.get(text(row.subject_id)) || text(row.subject_id);
        if (gradeText === 'ร' || gradeText === 'มส') {
          entry.issues.push({ type: gradeText === 'ร' ? 'r' : 'ms', label: gradeText, subject, semester });
          return;
        }
        if (!storedScoreHasFinalGrade(row)) return;
        if (!storedScoreWasEntered(row)) { notEntered += 1; return; }
        const finalGrade = text(storedFinalGrade(row)).trim();
        if (finalGrade === '' || Number(finalGrade) !== 0) return;
        if (!dashboardCompleteScore_(row)) { pendingFinal += 1; return; }
        entry.issues.push({ type: 'grade0', label: 'เกรด 0', subject, semester, score: number(row.total_score, 0) });
      });

      const tally = new Map();
      normalizedAttendanceRows(attendanceRows).forEach((row) => {
        if (holidays.has(row.attendance_date) || row.attendance_date > last) return;
        const t = tally.get(row.student_id) || { present: 0, total: 0 };
        if (row.status === 'present') t.present += 1;
        if (['present', 'leave', 'absent'].includes(row.status)) t.total += 1;
        tally.set(row.student_id, t);
      });
      tally.forEach((t, id) => {
        const entry = byStudent.get(id);
        if (!entry || !t.total) return;
        entry.attendanceDays = t.total;
        entry.attendanceRate = Math.round((t.present / t.total) * 1000) / 10;
        // Fewer than 10 recorded days is too early to call.
        if (t.total >= 10 && entry.attendanceRate < 80) {
          entry.issues.push({ type: 'attendance', label: `มาเรียน ${entry.attendanceRate}%`, present: t.present, total: t.total });
        }
      });

      const flagged = [...byStudent.values()].filter((s) => s.issues.length);
      const counts = {
        students: flagged.length,
        grade0: flagged.reduce((n, s) => n + s.issues.filter((i) => i.type === 'grade0').length, 0),
        special: flagged.reduce((n, s) => n + s.issues.filter((i) => i.type === 'r' || i.type === 'ms').length, 0),
        attendance: flagged.filter((s) => s.issues.some((i) => i.type === 'attendance')).length,
        pendingFinal,
        notEntered
      };
      const groups = new Map();
      flagged.forEach((s) => {
        const key = `${s.grade}/${s.room}`;
        if (!groups.has(key)) groups.set(key, { grade: s.grade, room: s.room, label: key, students: [] });
        groups.get(key).students.push(s);
      });
      const classes = [...groups.values()]
        .sort((a, b) => a.label.localeCompare(b.label, 'th', { numeric: true }))
        .map((g) => ({ ...g, students: g.students.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })) }));
      return { ...empty, counts, classes };
    },
    // Smart Dashboard "เช็คชื่อวันนี้รายห้อง": the latest school day (today, or the last weekday
    // that is not a holiday) and, per class, how many students have a row that day.
    // Rows whose timestamp is older than that day were pre-filled in advance, not checked.
    async getDashboardTodayAttendance() {
      const scope = await dashboardScope_();
      const holidays = await holidayDateSet(scope.range.first, scope.today);
      const cursor = new Date();
      let day = localIsoDate_(cursor);
      let reason = '';
      for (let step = 0; step < 21; step += 1) {
        const dow = cursor.getDay();
        if (dow !== 0 && dow !== 6 && !holidays.has(day)) break;
        if (!reason) reason = dow === 0 ? 'วันนี้เป็นวันอาทิตย์' : dow === 6 ? 'วันนี้เป็นวันเสาร์' : 'วันนี้เป็นวันหยุด';
        cursor.setDate(cursor.getDate() - 1);
        day = localIsoDate_(cursor);
      }
      const rows = scope.attendanceIds.length
        ? await optionalTableAll('attendance_daily', (query) => query.in('student_id', scope.attendanceIds).eq('attendance_date', day))
        : [];
      const byStudent = new Map(normalizedAttendanceRows(rows).map((row) => [row.student_id, row]));
      const classes = new Map();
      // Kindergarten (อ.1-อ.3) is never checked in, so it is skipped here rather than
      // showing up every day as "ยังไม่เช็คชื่อ".
      scope.attendanceStudents.forEach((student) => {
        const key = dashboardClassKey_(student);
        if (!classes.has(key)) classes.set(key, { label: key, grade: text(student.grade), room: text(student.room || '1'), total: 0, checked: 0, prefilled: 0, present: 0, leave: 0, absent: 0 });
        const item = classes.get(key);
        item.total += 1;
        const row = byStudent.get(text(student.id));
        if (!row) return;
        item.checked += 1;
        if (item[row.status] !== undefined) item[row.status] += 1;
        const stamp = localIsoDate_(row.updated_at || row.created_at || '');
        if (stamp && stamp < day) item.prefilled += 1;
      });
      const list = [...classes.values()]
        .map((item) => ({ ...item, state: item.checked === 0 ? 'none' : item.prefilled === item.checked ? 'prefilled' : item.checked < item.total ? 'partial' : 'done' }))
        .sort((a, b) => a.label.localeCompare(b.label, 'th', { numeric: true }));
      const sum = (key) => list.reduce((n, item) => n + item[key], 0);
      return {
        success: true,
        academicYear: scope.academicYear,
        scope: scope.scope,
        scopeLabel: scope.scopeLabel,
        day,
        isToday: day === scope.today,
        reason: day === scope.today ? '' : reason,
        totals: {
          classes: list.length,
          classesDone: list.filter((item) => item.state === 'done').length,
          students: sum('total'),
          checked: sum('checked'),
          present: sum('present'),
          leave: sum('leave'),
          absent: sum('absent')
        },
        classes: list
      };
    },

    // Smart Dashboard "ตรวจความถูกต้องของข้อมูล": read-only counts of records that look wrong.
    async getDashboardDataChecks() {
      const scope = await dashboardScope_();
      const { attendanceIds, gradeIds, academicYear, range, today } = scope;
      const classOf = new Map(scope.students.map((s) => [text(s.id), dashboardClassKey_(s)]));
      // future_attendance / holiday_attendance are attendance-only checks, so kindergarten
      // (อ.1-อ.3) is excluded from the attendance_daily query: those classes are never checked in.
      // placeholder_scores / score_out_of_range are grade-only checks, so kindergarten is
      // excluded from the scores query too: the school does not record grades for kindergarten.
      const [attendanceRows, holidays, scoreRows] = await Promise.all([
        attendanceIds.length
          ? optionalTableAll('attendance_daily', (query) => query.in('student_id', attendanceIds).gte('attendance_date', range.first).lte('attendance_date', range.last))
          : [],
        noSchoolHolidayDateSet_(range.first, range.last),
        gradeIds.length ? optionalTableAll('scores', (query) => query.in('student_id', gradeIds).eq('academic_year', academicYear)) : []
      ]);
      const rows = normalizedAttendanceRows(attendanceRows);
      const studentOf = new Map(scope.students.map((s) => [text(s.id), s]));
      // Score checks name the room + subject + semester (+ students), so "ไปแก้" can open that exact
      // subject. The score page hides an all-zero unentered row as blank, so a room alone was unfindable.
      const subjectRows = scoreRows.length ? await optionalTableAll('subjects', (query) => query) : [];
      const subjectOf = new Map(subjectRows.map((s) => [text(s.id), s]));
      const scoreGroups = (list) => {
        const groups = new Map();
        list.forEach((row) => {
          const studentId = text(row.student_id);
          const student = studentOf.get(studentId) || {};
          const subject = subjectOf.get(text(row.subject_id)) || {};
          const grade = text(student.grade);
          const room = text(student.room || student.classNo || '1');
          const semester = number(row.semester, 1);
          const key = `${grade}/${room}|${text(row.subject_id)}|${semester}`;
          if (!groups.has(key)) {
            groups.set(key, {
              classLabel: grade ? `${grade}/${room}` : '-', grade, room, semester,
              subjectId: text(row.subject_id), subjectCode: text(subject.code || row.subject_id),
              subjectName: text(subject.name) || `รหัสวิชา ${text(row.subject_id)}`, subjectGrade: text(subject.grade),
              students: []
            });
          }
          groups.get(key).students.push({ id: studentId, name: studentDisplayName(student) || studentId });
        });
        return [...groups.values()]
          .map((group) => ({ ...group, students: group.students.sort((a, b) => a.id.localeCompare(b.id, 'th', { numeric: true })) }))
          .sort((a, b) => a.classLabel.localeCompare(b.classLabel, 'th', { numeric: true })
            || a.subjectCode.localeCompare(b.subjectCode, 'th', { numeric: true }) || a.semester - b.semester);
      };
      const collect = (list, idOf) => {
        const students = new Set(list.map(idOf));
        const classes = [...new Set([...students].map((id) => classOf.get(id)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
        return { students: students.size, classes };
      };
      const future = rows.filter((row) => row.attendance_date > today);
      const onHoliday = rows.filter((row) => holidays.has(row.attendance_date) && row.attendance_date <= today);
      const placeholders = scoreRows.filter((row) => storedScoreHasFinalGrade(row) && !storedScoreWasEntered(row));
      const outOfRange = scoreRows.filter((row) => {
        const total = Number(row.total_score);
        return row.total_score !== null && row.total_score !== undefined && text(row.total_score).trim() !== '' && Number.isFinite(total) && (total < 0 || total > 100);
      });
      const dates = future.map((row) => row.attendance_date).sort();
      const checks = [
        {
          key: 'future_attendance',
          title: 'เวลาเรียนที่กรอกไว้ล่วงหน้า',
          hint: dates.length ? `วันที่ ${thaiShortDate_(dates[0])} ถึง ${thaiShortDate_(dates[dates.length - 1])} (ยังมาไม่ถึง) ทำให้เปอร์เซ็นต์มาเรียนในรายงานสูงเกินจริง` : 'ไม่มีวันเรียนในอนาคตที่ถูกบันทึกไว้',
          count: future.length,
          unit: 'รายการ',
          page: 'attendance_daily',
          ...collect(future, (row) => row.student_id)
        },
        {
          key: 'holiday_attendance',
          title: 'เวลาเรียนที่บันทึกในวันหยุดราชการ',
          // Informational, not an error: some schools do hold normal class on a real
          // ราชการ holiday (a school decision, day by day), so this can never be flagged
          // as "wrong" outright — it only surfaces the rows so a teacher can check
          // whether they were intended. `severity: 'info'` keeps it out of `problems`.
          hint: 'บางโรงเรียนให้มาเรียนได้ตามปกติแม้เป็นวันหยุดราชการ รายการนี้แค่แจ้งให้ตรวจสอบว่าตั้งใจกรอกหรือไม่ (ไม่นับวันที่ตั้งเป็น \'school\' เช่นสอนชดเชย เพราะวันเหล่านั้นมีการเรียนการสอนจริงอยู่แล้ว)',
          count: onHoliday.length,
          unit: 'รายการ',
          page: 'attendance_daily',
          severity: 'info',
          ...collect(onHoliday, (row) => row.student_id)
        },
        {
          key: 'placeholder_scores',
          title: 'แถวคะแนนว่าง (ศูนย์ทั้งแถว)',
          hint: 'มีเกรดบันทึกไว้แต่ไม่มีคะแนนเลย (มักมาจากระบบรุ่นเก่าที่สร้างแถวศูนย์ไว้ให้ทั้งห้อง) — ระบบไม่นับเป็นคะแนนจริง ไม่กระทบเกรด ในหน้ากรอกคะแนนจะเห็นเป็นช่องว่าง วิธีเคลียร์: กด "เปิดวิชานี้" แล้วกด "บันทึก" (ไม่ต้องกรอกอะไร) ระบบจะลบแถวว่างของนักเรียนที่ยังไม่มีคะแนนให้',
          count: placeholders.length,
          unit: 'รายการ',
          page: 'score_table_viewer',
          groups: scoreGroups(placeholders),
          ...collect(placeholders, (row) => text(row.student_id))
        },
        {
          key: 'score_out_of_range',
          title: 'คะแนนรวมเกิน 100 หรือติดลบ',
          hint: 'ตรวจคะแนนเต็มและคะแนนที่กรอก',
          count: outOfRange.length,
          unit: 'รายการ',
          page: 'score_table_viewer',
          groups: scoreGroups(outOfRange),
          ...collect(outOfRange, (row) => text(row.student_id))
        }
      ];
      // An info-severity check (holiday_attendance) is surfaced but never counted as a "problem".
      return { success: true, academicYear, scope: scope.scope, scopeLabel: scope.scopeLabel, asOf: today, checks, problems: checks.filter((c) => c.count > 0 && c.severity !== 'info').length };
    },

    async getGradeRecordingChartData() {
      const { academicYear, semester, byTerm } = await dashboardTerm_();
      const [cardScope, subjects, scores] = await Promise.all([
        dashboardCardStudents_(),
        data.subjects.list(),
        optionalTableAll('scores', byTerm)
      ]);

      const allGrades = cardScope.grades;
      const grades = gradeRecordingByGrade_(cardScope.students, (subjects || []).filter((sb) => subjectInTerm_(sb, semester)), scores, allGrades);

      return {
        hasData: grades.length > 0,
        scope: cardScope.scope,
        scopeLabel: cardScope.scopeLabel,
        academicYear,
        semester,
        totalSubjects: grades.reduce((sum, g) => sum + g.total, 0),
        grades,
        labels: allGrades,
        datasets: [{ label: 'วิชาที่บันทึกแล้ว', data: grades.map((g) => g.recordedCount), backgroundColor: '#4f46e5' }]
      };
    },
    async getAllDashboardChartData() {
      const [cardScope, allScores] = await Promise.all([
        dashboardCardStudents_(),
        optionalTable('scores')
      ]);
      const students = cardScope.students;

      const allGrades = cardScope.grades;
      // A class teacher's averages and grade shares come from that class only.
      const classIds = cardScope.scope === 'class' ? new Set(students.map((s) => text(s.id))) : null;
      const scores = classIds ? allScores.filter((sc) => classIds.has(text(sc.student_id))) : allScores;
      const studentMap = new Map(students.map((s) => [text(s.id), s]));

      const gradeScores = {};
      allGrades.forEach((g) => { gradeScores[g] = []; });
      const validScores = [];

      scores.forEach((sc) => {
        const s = studentMap.get(text(sc.student_id));
        if (!s?.grade || !gradeScores[s.grade] || !dashboardCompleteScore_(sc)) return;
        // A completed row can legitimately total 0 (every mark plus the final exam were 0);
        // that is a real grade 0 and belongs in the chart, unlike an in-progress row.
        const finalScore = number(sc.total_score, 0);
        gradeScores[s.grade].push(finalScore);
        validScores.push(finalScore);
      });

      const palette = [
        'rgba(54,162,235,0.85)',
        'rgba(255,99,132,0.85)',
        'rgba(75,192,192,0.85)',
        'rgba(255,206,86,0.85)',
        'rgba(153,102,255,0.85)',
        'rgba(255,159,64,0.85)'
      ];
      const borderPalette = [
        'rgba(54,162,235,1)',
        'rgba(255,99,132,1)',
        'rgba(75,192,192,1)',
        'rgba(255,206,86,1)',
        'rgba(153,102,255,1)',
        'rgba(255,159,64,1)'
      ];

      const avgScores = allGrades.map((g) => {
        const list = gradeScores[g];
        if (!list || !list.length) return 0;
        return Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 100) / 100;
      });

      function gradePointOf(score) {
        return data.helpers.calculateGrade(score);
      }

      const gradeTypes = ['4', '3.5', '3', '2.5', '2', '1.5', '1', '0'];
      const counts = {};
      gradeTypes.forEach((gt) => { counts[gt] = 0; });
      validScores.forEach((sc) => {
        const gp = gradePointOf(sc);
        counts[gp] = (counts[gp] || 0) + 1;
      });

      const totalValid = validScores.length || 1;
      const distPercentages = gradeTypes.map((gt) => Math.round((counts[gt] / totalValid) * 1000) / 10);

      const overallAvg = validScores.length
        ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100) / 100
        : 0;

      const overallGpa = validScores.length
        ? Math.round((validScores.reduce((sum, s) => sum + Number(gradePointOf(s)), 0) / validScores.length) * 100) / 100
        : 0;

      const passCount = validScores.filter((s) => s >= 50).length;
      const passRate = validScores.length ? Math.round((passCount / validScores.length) * 1000) / 10 : 0;

      return {
        success: true,
        scope: cardScope.scope,
        scopeLabel: cardScope.scopeLabel,
        academicSummary: {
          hasData: validScores.length > 0,
          overall: {
            avgScore: overallAvg,
            avgGrade: overallGpa,
            passRate,
            totalStudents: new Set(scores.map((sc) => text(sc.student_id))).size || students.length
          }
        },
        gradeComparison: {
          hasData: true,
          labels: allGrades,
          datasets: [{
            label: 'คะแนนเฉลี่ย',
            data: avgScores,
            backgroundColor: palette,
            borderColor: borderPalette,
            borderWidth: 2,
            borderRadius: 0,
            borderSkipped: false,
            barPercentage: 0.7
          }]
        },
        gradeDistribution: {
          hasData: validScores.length > 0,
          labels: gradeTypes.map((g) => `เกรด ${g}`),
          datasets: [{
            label: 'สัดส่วนรวมทุกชั้น',
            data: distPercentages,
            backgroundColor: [
              'rgba(40, 167, 69, 0.85)',
              'rgba(40, 167, 69, 0.65)',
              'rgba(23, 162, 184, 0.85)',
              'rgba(255, 193, 7, 0.85)',
              'rgba(255, 152, 0, 0.85)',
              'rgba(255, 111, 0, 0.85)',
              'rgba(255, 99, 132, 0.85)',
              'rgba(180, 60, 90, 0.85)'
            ],
            borderWidth: 1
          }],
          totalRecords: validScores.length,
          rawCounts: gradeTypes.map((gt) => counts[gt])
        }
      };
    },
    async clearServerCache() {
      return { success: true, cleared: 0, message: 'ระบบ Supabase อ่านข้อมูลปัจจุบันโดยตรง ไม่มี server cache ให้ล้าง' };
    },

    async getYearDatabaseRegistry() {
      const settings = await data.settings.get();
      const rows = await optionalTable('academic_years', (query) => query.order('academic_year', { ascending: false }));
      const items = rows.map((row) => ({ ...row, year: text(row.academic_year), academicYear: text(row.academic_year) }));
      return { success: true, currentYear: settings.academicYear, items, registry: items };
    },
    async S_getAvailableYears() {
      const registry = await this.getYearDatabaseRegistry();
      const years = (registry?.items || []).map((item) => item.academic_year || item.year).filter(Boolean);
      const current = registry?.currentYear || await currentYear() || '2569';
      if (!years.includes(current)) years.push(current);
      return years.sort();
    },
    async AY_getAcademicYearInfo() {
      const registry = await this.getYearDatabaseRegistry();
      const years = (registry?.items || []).map((item) => item.academic_year || item.year).filter(Boolean);
      const current = registry?.currentYear || await currentYear() || '2569';
      if (!years.includes(current)) years.push(current);
      return { success: true, currentYear: current, availableYears: years.sort() };
    },
    async previewSwitchAcademicYear() {
      await requireAdmin();
      const settings = await data.settings.get();
      const targetYear = String(number(settings.academicYear) + 1);
      const { data: result, error } = await client.rpc('pp5_preview_academic_year_transition', {
        p_target_year: targetYear
      });
      if (error) throw new Error(error.message || 'ตรวจความพร้อมเปลี่ยนปีการศึกษาไม่สำเร็จ');
      return result;
    },
    async createTransitionDraftV2(targetYear) {
      await requireAdmin();
      const settings = await data.settings.get();
      const target = text(targetYear).trim() || String(number(settings.academicYear) + 1);
      const { data: result, error } = await client.rpc('pp5_create_academic_year_transition_draft', {
        p_target_year: target
      });
      if (error) throw new Error(error.message || 'สร้างฉบับร่างการเลื่อนชั้นไม่สำเร็จ');
      return result;
    },
    async getTransitionDraftV2(draftId) {
      await requireAdmin();
      const id = text(draftId).trim();
      if (!id) throw new Error('กรุณาระบุรหัสฉบับร่าง (draft ID)');
      const { data: result, error } = await client.rpc('pp5_get_academic_year_transition_draft', {
        p_draft_id: id
      });
      if (error) throw new Error(error.message || 'ดึงข้อมูลฉบับร่างไม่สำเร็จ');
      return result;
    },
    async saveTransitionDecisionsV2(draftId, decisions) {
      await requireAdmin();
      const id = text(draftId).trim();
      if (!id) throw new Error('กรุณาระบุรหัสฉบับร่าง (draft ID)');
      const payload = Array.isArray(decisions) ? decisions : [];
      const { data: result, error } = await client.rpc('pp5_save_academic_year_transition_decisions', {
        p_draft_id: id,
        p_decisions: payload
      });
      if (error) throw new Error(error.message || 'บันทึกคำตัดสินไม่สำเร็จ');
      return result;
    },
    async validateTransitionDraftV2(draftId) {
      await requireAdmin();
      const id = text(draftId).trim();
      if (!id) throw new Error('กรุณาระบุรหัสฉบับร่าง (draft ID)');
      const { data: result, error } = await client.rpc('pp5_validate_academic_year_transition_draft', {
        p_draft_id: id
      });
      if (error) throw new Error(error.message || 'ตรวจความพร้อมฉบับร่างไม่สำเร็จ');
      return result;
    },
    async applyTransitionV2(draftId, expectedRevision, confirmationToken) {
      await requireAdmin();
      const id = text(draftId).trim();
      if (!id) throw new Error('กรุณาระบุรหัสฉบับร่าง (draft ID)');
      const { data: result, error } = await client.rpc('pp5_apply_academic_year_transition_v2', {
        p_draft_id: id,
        p_expected_revision: text(expectedRevision).trim(),
        p_confirmation_token: text(confirmationToken).trim()
      });
      if (error) throw new Error(error.message || 'ดำเนินการเลื่อนชั้นไม่สำเร็จ');
      return result;
    },
    async previewTransitionRollbackV2(transitionId) {
      await requireAdmin();
      const id = text(transitionId).trim();
      if (!id) throw new Error('กรุณาระบุรหัสประวัติการเปลี่ยนปี');
      const { data: result, error } = await client.rpc('pp5_preview_academic_year_transition_rollback_v2', {
        p_transition_id: id
      });
      if (error) throw new Error(error.message || 'ตรวจสอบความพร้อมการย้อนกลับไม่สำเร็จ');
      return result;
    },
    async rollbackTransitionV2(transitionId, expectedRevision, confirmationToken) {
      await requireAdmin();
      const id = text(transitionId).trim();
      if (!id) throw new Error('กรุณาระบุรหัสประวัติการเปลี่ยนปี');
      const { data: result, error } = await client.rpc('pp5_rollback_academic_year_transition_v2', {
        p_transition_id: id,
        p_expected_revision: text(expectedRevision).trim(),
        p_confirmation_token: text(confirmationToken).trim()
      });
      if (error) throw new Error(error.message || 'ย้อนกลับไม่สำเร็จ');
      return result;
    },
    async setAcademicYearLock(year, locked, reason) {
      await requireAdmin();
      const targetYear = text(year).trim();
      if (!targetYear) throw new Error('กรุณาระบุปีการศึกษา');
      const { data: result, error } = await client.rpc('pp5_set_academic_year_lock', {
        p_year: targetYear,
        p_locked: Boolean(locked),
        p_reason: text(reason).trim() || null
      });
      if (error) throw new Error(error.message || 'ปรับสถานะการล็อกปีการศึกษาไม่สำเร็จ');
      return result;
    },
    async getAcademicYearsStatus() {
      await requireAdmin();
      const { data: result, error } = await client.rpc('pp5_get_academic_years_status', {});
      if (error) throw new Error(error.message || 'ดึงสถานะปีการศึกษาไม่สำเร็จ');
      return result;
    },
    async switchAcademicYear(year) {
      await requireAdmin();
      const targetYear = text(year).replace(/[^0-9]/g, '');
      if (!/^\d{4}$/.test(targetYear)) throw new Error('ปีการศึกษาใหม่ต้องเป็นตัวเลข 4 หลัก');
      const { data: preview, error: previewError } = await client.rpc('pp5_preview_academic_year_transition', {
        p_target_year: targetYear
      });
      if (previewError) throw new Error(previewError.message || 'ตรวจความพร้อมเปลี่ยนปีการศึกษาไม่สำเร็จ');
      if (!preview?.canApply) {
        const blockers = Array.isArray(preview?.blockers) ? preview.blockers.join('\n') : 'ข้อมูลยังไม่พร้อม';
        throw new Error(`ยังเปลี่ยนปีไม่ได้: ${blockers}`);
      }
      const { data: result, error } = await client.rpc('pp5_apply_academic_year_transition', {
        p_target_year: targetYear,
        p_expected_student_count: number(preview.studentCount)
      });
      if (error) throw new Error(error.message || 'เปลี่ยนปีการศึกษาไม่สำเร็จ');
      return { ...result, archiveUrl: '?page=year_database_vault' };
    },
    async switchAcademicYearOnly(year) {
      await requireAdmin();
      if (!/^\d{4}$/.test(text(year))) throw new Error('ปีการศึกษาไม่ถูกต้อง');
      global.navigateTo?.('academic_history');
      return { success: true, message: 'เลือกปีที่ต้องการในหน้าข้อมูลย้อนหลัง ปีปัจจุบันของโรงเรียนไม่ได้เปลี่ยน' };
    },
    async setupNewAcademicYear(year) {
      const target = year || String(number(await currentYear()) + 1);
      return this.switchAcademicYear(target);
    },
    async setupNewSchool(values) {
      await requireAdmin();
      await data.settings.save(values || {});
      return { success: true, message: 'บันทึกข้อมูลเริ่มต้นโรงเรียนเรียบร้อยแล้ว' };
    },
    async auditAcademicYearData(year) {
      const students = await data.students.list({ academicYear: text(year), active: false });
      return { success: true, academicYear: text(year), studentCount: students.length };
    },
    async getAcademicYearTransitions() {
      await requireAdmin();
      const rows = await optionalTable('academic_year_transitions', (query) => query
        .select('id,from_year,to_year,status,student_count,promoted_count,graduated_count,summary,created_at,applied_at,rolled_back_at')
        .order('created_at', { ascending: false }));
      return { success: true, items: rows };
    },
    async rollbackAcademicYearTransition(transitionId) {
      await requireAdmin();
      const id = text(transitionId).trim();
      if (!id) throw new Error('กรุณาระบุรหัส snapshot ที่ต้องการย้อนกลับ');
      const { data: result, error } = await client.rpc('pp5_rollback_academic_year_transition', {
        p_transition_id: id
      });
      if (error) throw new Error(error.message || 'ย้อนกลับปีการศึกษาไม่สำเร็จ');
      return result;
    },
    async previewAcademicYearSnapshots() { return this.getYearDatabaseRegistry(); },
    async previewCurrentYearWorkingSheets() { return this.getYearDatabaseRegistry(); },
    async previewAcademicYearExternalArchive() { return this.getYearDatabaseRegistry(); },
    async createAcademicYearSnapshots() { migrationRequired('snapshot รายปีแบบ Supabase'); },
    async createCurrentYearWorkingSheets() { return { success: true, message: 'Supabase ใช้ตารางกลางแยกด้วย academic_year ไม่ต้องสร้างชีต' }; },
    async createAcademicYearExternalArchive() { migrationRequired('สำรองฐานข้อมูลรายปี'); },
    async cleanupArchivedYearSheetsFromMain() { migrationRequired('ล้างข้อมูลปีเก่าด้วยงานสำรองที่ตรวจสอบแล้ว'); },
    async restoreAcademicYearFromExternalArchive() { migrationRequired('กู้คืนฐานข้อมูลรายปี'); },
    async AY_cancelEditingOldYear() { migrationRequired('ยกเลิกการแก้ไขปีเก่า'); },

    // Used only by the parent_portal page (admin preview mode).
    // Returns every match: the old 50-row cap hid the later classes (ป.6 sorted
    // after row 50), and a school roster is small enough to show whole.
    // `total` is left out on purpose: the page appends "(แสดง 50 คนแรก)"
    // whenever total > 50, which would be wrong now that nothing is cut.
    async getStudentsForAdminPreview(query) {
      const students = await data.students.list();
      const filters = query && typeof query === 'object' ? query : { search: query };
      const needle = text(filters.search).trim().toLowerCase();
      const grade = text(filters.grade).trim();
      const room = text(filters.room).trim();
      const filtered = students.filter((student) => (!grade || text(student.grade) === grade)
        && (!room || text(student.classNo || student.room) === room)
        && (!needle || `${student.id} ${student.fullName} ${student.grade}/${student.classNo || student.room}`.toLowerCase().includes(needle)));
      const sort = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
      return { success: true, data: filtered.map(parentPortalStudent_), matched: filtered.length,
        grades: sort(students.map((student) => text(student.grade))),
        rooms: sort(students.filter((student) => !grade || text(student.grade) === grade).map((student) => text(student.classNo || student.room))) };
    },
    // ── Parent LINE access (admin only) ──────────────────────────────
    // One parent account per student: username = student id (the existing
    // convention for all imported parent accounts). Passwords are never
    // readable afterwards, so the only way to hand one out is to create the
    // account or set a new password, and show it once to the admin.
    async getParentAccessStatus(grade) {
      await requireAdmin();
      const wanted = text(grade).trim();
      const [students, listed, lineParents] = await Promise.all([
        data.students.list(),
        invokeAdminUsers({ action: 'list' }),
        lineLinkedParentIds_()
      ]);
      const users = Array.isArray(listed.users) ? listed.users : [];
      const byUsername = new Map(users.map((user) => [text(user.username).trim().toLowerCase(), user]));
      const linkedTo = new Map();
      users.filter((user) => user.role === 'parent').forEach((user) => {
        text(user.studentIds).split(',').map((id) => id.trim()).filter(Boolean)
          .forEach((id) => { if (!linkedTo.has(id)) linkedTo.set(id, user); });
      });
      const grades = [...new Set(students.map((student) => text(student.grade)).filter(Boolean))];
      const rows = students
        .filter((student) => !wanted || text(student.grade) === wanted)
        .map((student) => {
          const id = text(student.id);
          const account = linkedTo.get(id) || byUsername.get(id.toLowerCase()) || null;
          let status = 'missing';
          if (account && account.role !== 'parent') status = 'conflict';
          else if (account && account.active === false) status = 'inactive';
          else if (account) status = 'ready';
          return {
            studentId: id,
            fullName: text(student.fullName),
            grade: text(student.grade),
            classNo: text(student.classNo || student.room),
            studentNumber: student.studentNumber ?? '',
            username: account ? text(account.username) : id,
            userId: account ? text(account.id) : '',
            status,
            lineLinked: !!lineParents && status === 'ready' && lineParents.has(text(account.id))
          };
        });
      return { success: true, grades, rows, lineKnown: !!lineParents };
    },

    async issueParentCredentials(studentIds, options = {}) {
      await requireAdmin();
      const ids = [...new Set((Array.isArray(studentIds) ? studentIds : []).map((id) => text(id).trim()).filter(Boolean))];
      if (!ids.length) throw new Error('กรุณาเลือกนักเรียนอย่างน้อย 1 คน');
      if (ids.length > 60) throw new Error('ออกรหัสผ่านได้ครั้งละไม่เกิน 60 คน');
      const resetExisting = options.resetExisting === true;
      // Optional school-wide password typed by the admin (never stored in the source);
      // left empty, each account gets its own random password.
      const sharedPassword = text(options.password).trim();
      if (sharedPassword && sharedPassword.length < 10) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร');
      const status = await this.getParentAccessStatus('');
      const byStudent = new Map(status.rows.map((row) => [row.studentId, row]));
      const results = [];
      for (const id of ids) {
        const row = byStudent.get(id);
        if (!row) { results.push({ studentId: id, ok: false, message: 'ไม่พบนักเรียนในปีการศึกษาปัจจุบัน' }); continue; }
        if (row.status === 'conflict') { results.push({ ...row, ok: false, message: 'ชื่อผู้ใช้นี้เป็นบัญชีครู/แอดมิน ข้ามไว้' }); continue; }
        if (row.status !== 'missing' && !resetExisting) { results.push({ ...row, ok: false, skipped: true, message: 'มีบัญชีอยู่แล้ว (ไม่ได้เปลี่ยนรหัสผ่าน)' }); continue; }
        const password = sharedPassword || generateParentPassword_();
        try {
          if (row.status === 'missing') {
            await invokeAdminUsers({
              action: 'create', username: row.username, password, role: 'parent',
              displayName: 'ผู้ปกครอง ' + row.fullName, studentIds: [id]
            });
            results.push({ ...row, ok: true, created: true, password });
          } else {
            await invokeAdminUsers({ action: 'reset-password', userId: row.userId, password });
            if (row.status === 'inactive') await invokeAdminUsers({ action: 'update', userId: row.userId, active: true });
            results.push({ ...row, ok: true, created: false, password });
          }
        } catch (error) {
          results.push({ ...row, ok: false, message: text(error?.message || error) });
        }
      }
      return { success: results.every((item) => item.ok || item.skipped), results };
    },

    async getParentStudents() {
      const state = await data.auth.requireUser();
      if (state.profile.role === 'admin') return this.getStudentsForAdminPreview('');
      const links = await optionalTable('parent_student_links', (query) => query.eq('parent_user_id', state.user.id));
      const allowed = new Set(links.map((row) => text(row.student_id)));
      const students = (await data.students.list()).filter((student) => allowed.has(student.id));
      return { success: true, data: students.map(parentPortalStudent_), total: students.length };
    },
    async getParentStudentScores(studentId) {
      const student = await parentViewableStudent_(studentId);
      const requestedStudentId = text(student.id);
      const academicYear = text(await currentYear()).trim();
      const [subjects, allRows] = await Promise.all([
        data.subjects.list(student.grade),
        optionalTable('scores', (query) => query.eq('student_id', requestedStudentId))
      ]);
      // Scores are kept across years; only the current academic year belongs on this page.
      const rows = academicYear
        ? allRows.filter((row) => text(row.academic_year).trim() === academicYear)
        : allRows;

      // Activity results live in assessments (criteria guidance/scout/club/social),
      // not in scores. School policy: the semester 2 result wins when it exists.
      let activityRows = [];
      if (/^\d{4}$/.test(academicYear) && subjects.some((subject) => parentSubjectTypeRank_(subject) === 2)) {
        try {
          activityRows = await data.assessments.list('activity', null, [requestedStudentId], academicYear);
        } catch (_) {
          activityRows = [];
        }
      }
      const activityStatus_ = (criteria) => {
        const pick = (semester) => activityRows.find((row) => text(row.criteria_code) === criteria && number(row.semester, 1) === semester);
        const row = pick(2) || pick(1);
        const value = row ? row.score : null;
        if (value === 1 || value === '1' || value === 'ผ่าน') return 'ผ่าน';
        if (value === 0 || value === '0' || value === 'ไม่ผ่าน') return 'ไม่ผ่าน';
        return '';
      };

      const scores = parentSortSubjects_(subjects).map((subject) => {
        const subjectId = text(subject.id);
        const isActivity = parentSubjectTypeRank_(subject) === 2;
        if (isActivity) {
          const criteria = parentActivityCriteria_(subject);
          return {
            subjectCode: subject.subjectCode || subject.code || subjectId,
            name: subject.subjectName || subject.name || '',
            isActivity: true,
            activityGrade: criteria ? activityStatus_(criteria) : ''
          };
        }
        const term1 = parentScoreStatus_(rows.find((row) => text(row.subject_id) === subjectId && number(row.semester, 1) === 1));
        const term2 = parentScoreStatus_(rows.find((row) => text(row.subject_id) === subjectId && number(row.semester, 1) === 2));
        if (term1.status === 'none' && term2.status === 'none') return null;

        // A semester still in progress shows its running score with no grade, and an
        // all-zero placeholder row is not a "0"; the year result needs both semesters finished.
        const annual = parentYearScoreStatus_(
          rows.find((row) => text(row.subject_id) === subjectId && number(row.semester, 1) === 1),
          rows.find((row) => text(row.subject_id) === subjectId && number(row.semester, 1) === 2),
          subject
        );
        const average = annual.score;
        const grade = annual.grade;
        return {
          subjectCode: subject.subjectCode || subject.code || subjectId,
          name: subject.subjectName || subject.name || '',
          term1Score: term1.score,
          term1Grade: term1.grade,
          term1Pending: term1.status === 'pending',
          term2Score: term2.score,
          term2Grade: term2.grade,
          term2Pending: term2.status === 'pending',
          average,
          grade,
          isActivity: false
        };
      }).filter(Boolean);
      return { success: true, academicYear, scores };
    },
    async getParentStudentAttendance(studentId) {
      const academicYear = await currentYear();
      const rosterStudents = await data.students.list({ active: false, academicYear });
      const student = rosterStudents.find((item) => text(item.id) === text(studentId));
      if (!student) {
        return {
          success: true,
          attendance: {
            totalDays: 0,
            totalPresent: 0,
            totalLeave: 0,
            totalAbsent: 0,
            percentage: 0,
            monthly: []
          }
        };
      }
      // Parents see attendance up to today only. Some classes pre-fill the whole
      // year as "present"; counting those future rows showed 100% over ~200 days
      // in September. Official reports keep using getStudentAttendanceDetail.
      const range = academicYearDateRange(academicYear);
      const now = new Date();
      const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
      const last = range.last && range.last < today ? range.last : today;
      const { students: classStudents, rows } = await readClassAttendanceRange(student.grade, student.room, range.first, last, range.academicYear);
      const self = classStudents.find((item) => text(item.id) === text(studentId)) || student;
      const studentRows = rows.filter((row) => text(row.student_id) === text(studentId));
      const summaryRow = summarizeAttendanceRows([self], studentRows, true)[0];
      const detail = {
        summary: {
          totalDays: summaryRow.total,
          totalPresent: summaryRow.present,
          totalLeave: summaryRow.leave,
          totalAbsent: summaryRow.absent,
          percentage: summaryRow.total ? ((summaryRow.present / summaryRow.total) * 100).toFixed(1) : '0.0'
        },
        monthlyData: academicYearMonths(range.academicYear).map((month) => {
          const monthSummary = summarizeAttendanceRows([self], studentRows.filter((row) => text(row.attendance_date).startsWith(month.key)), true)[0];
          return { monthName: month.monthName, present: monthSummary.present, leave: monthSummary.leave, absent: monthSummary.absent, total: monthSummary.total };
        }).filter((item) => item.total > 0)
      };
      return {
        success: true,
        asOf: last,
        attendance: {
          totalDays: detail.summary.totalDays,
          totalPresent: detail.summary.totalPresent,
          totalLeave: detail.summary.totalLeave,
          totalAbsent: detail.summary.totalAbsent,
          percentage: number(detail.summary.percentage),
          monthly: (detail.monthlyData || []).map((month) => ({
            month: month.monthName,
            present: month.present,
            leave: month.leave,
            absent: month.absent,
            total: month.total
          }))
        }
      };
    },

    // Parent portal overview for one child and a semester or the whole year:
    // GPA over finished subjects only, curriculum subject count, attendance for that period
    // up to today, each subject's semester status, and the homeroom teacher's comment for the
    // semester (student_comments — the same text written for the report card; a parent can
    // read it only once migration 202609270016 is applied, until then it is simply absent).
    async getParentOverview(studentId, semesterValue) {
      const student = await parentViewableStudent_(studentId);
      const id = text(student.id);
      const settings = await data.settings.get();
      const academicYear = text(settings.academicYear || settings.academic_year).trim();
      const currentSemester = number(settings.semester, 1) === 2 ? 2 : 1;
      const isYear = text(semesterValue).trim() === 'year';
      const semester = isYear ? 'year' : [1, 2].includes(number(semesterValue, 0)) ? number(semesterValue, 0) : currentSemester;
      const [gradeSubjects, allSubjects, scoreRows, commentRows, assignments] = await Promise.all([
        data.subjects.list(student.grade),
        data.subjects.list(),
        optionalTable('scores', (query) => query.eq('student_id', id)),
        optionalTable('student_comments', (query) => query.eq('student_id', id).eq('academic_year', academicYear)).catch(() => []),
        optionalTable('teacher_assignments', (query) => query.eq('grade', text(student.grade)).eq('active', true)).catch(() => [])
      ]);

      const rowFor = (subjectId, year, sem) => scoreRows.find((row) => text(row.subject_id) === text(subjectId)
        && text(row.academic_year).trim() === text(year) && number(row.semester, 1) === sem);
      const regular = parentSortSubjects_(gradeSubjects.filter((subject) => parentSubjectTypeRank_(subject) !== 2 && subjectInTerm_(subject, semester)));
      // Explicit year view uses the official PP.5 year-end rule. Semester views show
      // their own results; unfinished semesters never become a year grade.
      const subjects = regular.map((subject) => {
        const row = rowFor(subject.id, academicYear, semester);
        const rowStatus = parentScoreStatus_(row);
        const display = isYear ? parentYearScoreStatus_(rowFor(subject.id, academicYear, 1), rowFor(subject.id, academicYear, 2), subject) : rowStatus;
        const config = subjectScoreConfig(subject);
        const breakdown = row ? storedScoreBreakdown(row) : {};
        const mid = row ? row.formative_score ?? breakdown.mid : null;
        const fin = row ? row.summative_score ?? breakdown.final : null;
        return {
          code: subject.subjectCode || subject.code || text(subject.id),
          name: subject.subjectName || subject.name || '',
          status: display.status,
          score: display.score,
          grade: display.grade,
          midScore: isYear || rowStatus.status === 'none' || mid === null || mid === undefined || text(mid) === '' ? '' : number(mid, 0),
          finalScore: !isYear && rowStatus.status === 'complete' && fin !== null && fin !== undefined && text(fin) !== '' ? number(fin, 0) : '',
          midMax: config.midMax,
          finalMax: config.finalMax,
          credit: parentSubjectCredit_(subject)
        };
      });
      const { gpa, counted } = parentSemesterGpa_(subjects);

      // Previous semester: semester 1 of this year, or semester 2 of last year.
      // Subject ids differ between grades, so credits come from the whole subject list.
      let previousGpa = null;
      const prevYear = semester === 2 ? academicYear : (/^\d{4}$/.test(academicYear) ? String(Number(academicYear) - 1) : '');
      const prevSemester = semester === 2 ? 1 : 2;
      if (prevYear && !isYear) {
        const subjectById = new Map(allSubjects.map((subject) => [text(subject.id), subject]));
        const prevEntries = scoreRows
          .filter((row) => text(row.academic_year).trim() === prevYear && number(row.semester, 1) === prevSemester)
          .filter((row) => { const subject = subjectById.get(text(row.subject_id)); return subject && parentSubjectTypeRank_(subject) !== 2; })
          .map((row) => ({ ...parentScoreStatus_(row), credit: parentSubjectCredit_(subjectById.get(text(row.subject_id))) }));
        previousGpa = parentSemesterGpa_(prevEntries).gpa;
      }

      // Attendance for the semester (May–Oct / Nov–Mar) or the whole academic year,
      // up to today, holidays excluded — the same counting as the "เข้าเรียน" view.
      const range = /^\d{4}$/.test(academicYear) ? academicYearDateRange(academicYear) : null;
      let attendance = { present: 0, leave: 0, absent: 0, total: 0, percentage: null, asOf: '' };
      if (range) {
        const baseYearCE = Number(academicYear) - 543;
        const first = isYear ? range.first : semester === 1 ? `${baseYearCE}-05-01` : `${baseYearCE}-11-01`;
        const semesterLast = isYear ? range.last : semester === 1 ? `${baseYearCE}-10-31` : `${baseYearCE + 1}-03-31`;
        const today = localIsoDate_(new Date());
        const last = semesterLast < today ? semesterLast : today;
        if (first <= last) {
          const [rows, holidays] = await Promise.all([
            optionalTableAll('attendance_daily', (query) => query.eq('student_id', id).gte('attendance_date', first).lte('attendance_date', last)),
            noSchoolHolidayDateSet_(first, last)
          ]);
          const counted_ = normalizedAttendanceRows(rows).filter((row) => !holidays.has(row.attendance_date));
          const summary = summarizeAttendanceRows([student], counted_, true)[0] || { present: 0, leave: 0, absent: 0, total: 0 };
          attendance = {
            present: summary.present,
            leave: summary.leave,
            absent: summary.absent,
            total: summary.total,
            percentage: summary.total ? Math.round((summary.present / summary.total) * 1000) / 10 : null,
            asOf: last
          };
        }
      }

      const commentFor = (sem) => commentRows.find((row) => number(row.semester, 1) === sem && text(row.comment).trim());
      const comment = isYear ? commentFor(2) || commentFor(1) : commentFor(semester);
      const room = text(student.room || student.classNo || '1');
      const assignment = assignments.find((row) => text(row.room || '1') === room) || null;
      return {
        success: true,
        academicYear,
        semester,
        currentSemester,
        interimNotice: !isYear && settings.interimWatermark !== false && !semesterJudgedGrade_(student.grade),
        interimNoticeText: text(settings.interimWatermarkText).trim(),
        student: {
          id,
          fullName: studentDisplayName(student),
          firstName: text(student.firstname || student.firstName || student.first_name),
          lastName: text(student.lastname || student.lastName || student.last_name),
          grade: text(student.grade),
          room,
          photoUrl: text(student.photoUrl || student.photo_url)
        },
        gpa,
        gpaSubjects: counted,
        previousGpa,
        gpaChange: gpa !== null && previousGpa !== null ? Math.round((gpa - previousGpa) * 100) / 100 : null,
        subjectCount: regular.length,
        finishedCount: subjects.filter((item) => item.status === 'complete' || item.status === 'special').length,
        pendingCount: subjects.filter((item) => item.status === 'pending').length,
        subjects,
        attendance,
        teacherNote: comment ? { text: text(comment.comment).trim(), updatedAt: text(comment.updated_at || comment.created_at) } : null,
        homeroomTeacher: assignment ? homeroomTeacherDisplay(assignment).replace(/\s+/g, ' ') : ''
      };
    },

    // หน้า "จัดการนักเรียนจบการศึกษา" (แบบเดิม) ส่ง authToken เป็นอาร์กิวเมนต์แรก
    // จึงรับเฉพาะชื่อชั้นที่ถูกรูปแบบ ค่าอื่นใช้ ป.6 และส่งข้อมูลตามรูปแบบที่หน้าเว็บอ่าน
    async previewGraduation(grade, classNo) {
      const target = /^(?:อ|ป|ม)\.\d+$/.test(text(grade).trim()) ? text(grade).trim() : 'ป.6';
      const room = target && /^(?:อ|ป|ม)\.\d+$/.test(text(grade).trim()) && text(classNo).trim() ? text(classNo).trim() : undefined;
      const academicYear = text(await currentYear());
      const [graduating, everyone] = await Promise.all([
        data.students.list({ grade: target, room, academicYear }),
        data.students.list({ academicYear })
      ]);
      const finalGrades = new Set(['ป.6', 'ม.3', 'ม.6']);
      return {
        success: true,
        students: graduating,
        count: graduating.length,
        willGraduate: graduating.map((student) => ({ studentId: text(student.id), name: studentDisplayName(student) })),
        willPromote: everyone.filter((student) => !finalGrades.has(text(student.grade))).length,
        willCreateSheets: ['ไม่ต้องสร้างชีตแล้ว ระบบใช้ฐานข้อมูล (การเลื่อนชั้นจริงทำที่ ตั้งค่าระบบ → ปีการศึกษา → จัดการเลื่อนชั้น)']
      };
    },
    async getGraduationStatus(grade, classNo) {
      const target = /^(?:อ|ป|ม)\.\d+$/.test(text(grade).trim()) ? text(grade).trim() : 'ป.6';
      const academicYear = text(await currentYear());
      const all = await data.students.list({ grade: target, room: text(classNo).trim() || undefined, academicYear, active: false });
      const status = (student) => text(student.status || 'active');
      return {
        success: true,
        currentYear: academicYear,
        totalP6: all.length,
        activeP6: all.filter((student) => status(student) === 'active').length,
        graduatedP6: all.filter((student) => status(student) === 'graduated').length,
        students: all,
        count: all.length
      };
    },
    async graduateStudents(ids) {
      await requireAdmin();
      const list = Array.isArray(ids) ? ids : (ids?.studentIds || []);
      if (!list.length) {
        // ปุ่ม "จำหน่ายนักเรียน ป.6 ทั้งหมด" แบบเดิมไม่ระบุรายชื่อ การจำหน่ายนักเรียนจบต้องทำพร้อมการเลื่อนชั้น
        // ปลายปี เพื่อให้ทะเบียนรายปีและผลการเรียนของปีนั้นถูกเก็บก่อน จึงไม่จำหน่ายแบบลอย ๆ จากหน้านี้
        return {
          success: false,
          graduated: 0,
          count: 0,
          message: 'การจำหน่ายนักเรียนจบการศึกษาทำพร้อมการเลื่อนชั้นปลายปี ที่เมนู ตั้งค่าระบบ → ปีการศึกษา → จัดการเลื่อนชั้น ระบบจะเก็บข้อมูลปีนี้และจำหน่ายนักเรียนชั้นสุดท้ายให้อัตโนมัติ'
        };
      }
      const { error } = await client.from('students').update({ status: 'graduated', updated_at: new Date().toISOString() }).in('id', list);
      if (error) throw new Error(error.message);
      return { success: true, message: `บันทึกจบการศึกษา ${list.length} คน`, count: list.length, graduated: list.length };
    },

    async getClassSubjectScoreSummary(grade, classNo, term) {
      return buildClassSubjectScoreSummary(grade, classNo, term);
    },
    async getClassAssessmentSummary(grade, classNo, semester) {
      return buildClassAssessmentSummary(grade, classNo, semester);
    },
    async getMonthlyAttendanceStats(grade, classNo, academicYear) {
      const range = academicYearDateRange(academicYear);
      const { students, rows } = await readClassAttendanceRange(grade, classNo, range.first, range.last, range.academicYear);
      return academicYearMonths(range.academicYear).map((month) => {
        const monthRows = rows.filter((row) => text(row.attendance_date).startsWith(month.key));
        const summaries = summarizeAttendanceRows(students, monthRows);
        const totalPresent = summaries.reduce((sum, item) => sum + item.present, 0);
        const totalLeave = summaries.reduce((sum, item) => sum + item.leave, 0);
        const totalAbsent = summaries.reduce((sum, item) => sum + item.absent, 0);
        const totalDays = totalPresent + totalLeave + totalAbsent;
        const avgPresent = totalDays ? Number(((totalPresent / totalDays) * 100).toFixed(1)) : 0;
        const avgLeave = totalDays ? Number(((totalLeave / totalDays) * 100).toFixed(1)) : 0;
        const avgAbsent = totalDays ? Number(((totalAbsent / totalDays) * 100).toFixed(1)) : 0;
        return {
          month: month.month,
          yearCE: month.yearCE,
          yearBE: month.yearBE,
          monthName: month.monthName,
          displayName: `${month.monthName} ${month.yearBE}`,
          semester: month.semester,
          semesterName: `ภาคเรียนที่ ${month.semester}`,
          totalStudents: summaries.length,
          studentsWithData: summaries.length,
          totalPresent,
          totalLeave,
          totalAbsent,
          totalDays,
          avgPresent,
          avgLeave,
          avgAbsent,
          avgPresentStr: `${avgPresent.toFixed(1)}%`,
          avgLeaveStr: `${avgLeave.toFixed(1)}%`,
          avgAbsentStr: `${avgAbsent.toFixed(1)}%`,
          statusColor: !totalDays ? '#94a3b8' : avgPresent >= 80 ? '#4caf50' : avgPresent >= 70 ? '#2196f3' : avgPresent >= 60 ? '#ff9800' : '#f44336',
          statusText: !totalDays ? 'ไม่มีข้อมูล' : avgPresent >= 80 ? 'ดีมาก' : avgPresent >= 70 ? 'ดี' : avgPresent >= 60 ? 'พอใช้' : 'ต้องปรับปรุง',
          chartData: { present: totalPresent, leave: totalLeave, absent: totalAbsent },
          schoolDays: countRecordedSchoolDays(monthRows)
        };
      });
    },
    async getAttendanceVerticalTable(grade, classNo, year, month) {
      let calendarYear = Number(year);
      if (calendarYear >= 2400) calendarYear -= 543;
      const monthIndex = Number(month);
      if (!Number.isInteger(calendarYear) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
        throw new Error('เดือนหรือปีสำหรับตารางการเข้าเรียนไม่ถูกต้อง');
      }
      const saved = await this.getSavedAttendance(grade, classNo, calendarYear, monthIndex);
      const daysInMonth = new Date(calendarYear, monthIndex + 1, 0).getDate();
      const weekdays = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
      const days = Array.from({ length: daysInMonth }, (_item, index) => {
        const day = index + 1;
        const dateValue = `${calendarYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const holidayType = text(saved.holidays?.[dateValue]);
        return {
          label: text(day),
          dow: weekdays[new Date(calendarYear, monthIndex, day).getDay()],
          date: dateValue,
          isHoliday: !!holidayType && text(saved.holidayTypes?.[dateValue]).trim() !== 'school',
          holidayType
        };
      });
      const statusSymbol = { present: '/', leave: 'ล', absent: 'ข' };
      const students = (saved.students || []).map((student) => {
        const statusMap = {};
        days.forEach((day) => {
          const status = normalizeAttendanceStatus(saved.records?.[`${student.id}_${day.label}`]);
          statusMap[day.label] = day.isHoliday ? '' : (statusSymbol[status] || '');
        });
        return { id: text(student.id), name: studentDisplayName(student), statusMap };
      }).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      return { students, days };
    },
    async getMonthlyAttendanceMatrix(grade, classNo, academicYear) {
      const range = academicYearDateRange(academicYear);
      const { students, rows } = await readClassAttendanceRange(grade, classNo, range.first, range.last, range.academicYear);
      const months = academicYearMonths(range.academicYear).map((month) => {
        const monthRows = rows.filter((row) => text(row.attendance_date).startsWith(month.key));
        return {
          key: month.key,
          shortName: month.shortName,
          year: month.yearBE,
          fullName: `${month.monthName} ${month.yearBE}`,
          monthIndex: month.month,
          yearCE: month.yearCE,
          semester: month.semester,
          schoolDays: countRecordedSchoolDays(monthRows)
        };
      });
      const normalizedRows = normalizedAttendanceRows(rows);
      const processedStudents = students.map((student) => {
        const studentRows = normalizedRows.filter((row) => text(row.student_id) === text(student.id));
        const monthlyData = {};
        months.forEach((month) => {
          monthlyData[month.key] = studentRows.filter((row) => text(row.attendance_date).startsWith(month.key) && row.status === 'present').length;
        });
        const totalPresent = studentRows.filter((row) => row.status === 'present').length;
        const totalDays = studentRows.length;
        return {
          id: text(student.id),
          name: studentDisplayName(student),
          monthlyData,
          totalPresent,
          totalDays,
          percentage: totalDays ? Number(((totalPresent / totalDays) * 100).toFixed(1)) : 0
        };
      }).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      return { students: processedStudents, months, academicYear: range.academicYear, grade, classNo };
    },
    async getMonthlyAttendanceSummary(grade, classNo, yearCE, month) {
      let calendarYear = Number(yearCE);
      if (calendarYear >= 2400) calendarYear -= 543;
      const range = monthRange(calendarYear, Number(month) - 1);
      const requestedAcademicYear = academicYearFromCalendarDate(calendarYear, Number(month) - 1);
      const { students, rows } = await readClassAttendanceRange(grade, classNo, range.first, range.last, requestedAcademicYear);
      return summarizeAttendanceRows(students, rows, true);
    },
    async getSemesterAttendanceSummary(grade, classNo, semester = 1, academicYear) {
      return computeSemesterAttendanceSummary(grade, classNo, semester, academicYear);
    },
    async getYearlyAttendanceSummary(grade, classNo, academicYear) {
      const range = academicYearDateRange(academicYear);
      const { students, rows } = await readClassAttendanceRange(grade, classNo, range.first, range.last, range.academicYear);
      return summarizeAttendanceRows(students, rows, true);
    },
    async getStudentAttendanceDetail(grade, classNo, studentId, academicYear) {
      const range = academicYearDateRange(academicYear);
      const { students, rows } = await readClassAttendanceRange(grade, classNo, range.first, range.last, range.academicYear);
      const student = students.find((item) => text(item.id) === text(studentId));
      if (!student) throw new Error('ไม่พบนักเรียนในชั้นและห้องที่เลือก');
      const studentRows = rows.filter((row) => text(row.student_id) === text(studentId));
      const summaryRow = summarizeAttendanceRows([student], studentRows, true)[0];
      const monthlyData = academicYearMonths(range.academicYear).map((month) => {
        const monthRows = studentRows.filter((row) => text(row.attendance_date).startsWith(month.key));
        const monthSummary = summarizeAttendanceRows([student], monthRows, true)[0];
        const percentage = monthSummary.total ? ((monthSummary.present / monthSummary.total) * 100).toFixed(1) : '0.0';
        return {
          monthName: month.monthName,
          year: month.yearBE,
          present: monthSummary.present,
          leave: monthSummary.leave,
          absent: monthSummary.absent,
          total: monthSummary.total,
          percentage
        };
      }).filter((item) => item.total > 0);
      const percentage = summaryRow.total ? ((summaryRow.present / summaryRow.total) * 100).toFixed(1) : '0.0';
      const percentNumber = Number(percentage);
      return {
        student: { ...student, id: text(student.id), fullname: studentDisplayName(student) },
        academicYear: range.academicYear,
        summary: {
          totalPresent: summaryRow.present,
          totalLeave: summaryRow.leave,
          totalAbsent: summaryRow.absent,
          totalDays: summaryRow.total,
          percentage,
          gradeLevel: percentNumber >= 80 ? 'ดีมาก' : percentNumber >= 70 ? 'ดี' : percentNumber >= 60 ? 'พอใช้' : 'ต้องปรับปรุง',
          gradeClass: percentNumber >= 80 ? 'success' : percentNumber >= 70 ? 'info' : percentNumber >= 60 ? 'warning' : 'danger'
        },
        monthlyData
      };
    },
    async saveAttendanceSummaryToSheet() { return { success: true, message: 'ข้อมูลอยู่ใน Supabase แล้ว ไม่ต้องคัดลอกไปชีต' }; },
    async saveMonthlyAttendanceMatrixToSheet() { return { success: true, message: 'ข้อมูลอยู่ใน Supabase แล้ว ไม่ต้องคัดลอกไปชีต' }; },
    async saveSemesterSummaryToSheet() { return { success: true, message: 'ข้อมูลอยู่ใน Supabase แล้ว ไม่ต้องคัดลอกไปชีต' }; },

    async getScoresWarehouseHealth(grade, classNo) {
      const students = await data.students.list({ grade, room: classNo });
      const rows = await optionalTable('scores', (query) => query.in('student_id', students.map((student) => student.id)));
      return { success: true, database: 'Supabase', studentCount: students.length, scoreCount: rows.length, healthy: true };
    },
    async getScoreSheetsForSync() {
      const academicYear = await currentYear();
      const students = await data.students.list({ academicYear });
      const classKeys = [...new Set(students.map((student) => `${text(student.grade)}|${text(student.classNo)}`))]
        .filter((key) => !key.startsWith('|') && !key.endsWith('|'));
      const grades = [...new Set(classKeys.map((key) => key.split('|')[0]))]
        .sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
      const subjectLists = await Promise.all(grades.map((grade) => data.subjects.list(grade)));
      const subjectsByGrade = new Map(grades.map((grade, index) => [grade, subjectLists[index]]));
      const gradeClasses = classKeys.map((key) => {
        const [grade, classNo] = key.split('|');
        return { grade, classNo, gradeClass: `${grade}/${classNo}` };
      }).sort((a, b) => a.grade.localeCompare(b.grade, 'th', { numeric: true }) ||
        a.classNo.localeCompare(b.classNo, 'th', { numeric: true }));
      const sheets = [];
      gradeClasses.forEach((item, classIndex) => {
        (subjectsByGrade.get(item.grade) || []).filter((subject) => subject.active !== false).forEach((subject, subjectIndex) => {
          const subjectName = text(subject.name || subject.subjectName).trim();
          const subjectCode = text(subject.code || subject.subjectCode || subject.id).trim();
          sheets.push({
            sheetName: `${subjectName} ${item.grade.replace(/[\/.]/g, '')}-${item.classNo}`,
            subjectName: subjectCode ? `${subjectName} (${subjectCode})` : subjectName,
            subjectCode,
            grade: item.grade,
            classNo: item.classNo,
            gradeClass: item.gradeClass,
            academicYear,
            sortOrder: (classIndex * 1000) + subjectIndex
          });
        });
      });
      return { grades: gradeClasses.map((item) => item.gradeClass), sheets };
    },
    async rebuildScoresWarehouseForClass(grade, classNo) { return this.getScoresWarehouseHealth(grade, classNo); },

    async exportStudentListPDF(grade, classNo) { return legacyStudentListPrintUrl(grade, classNo); },
    async generateStudentListPDF(grade, classNo, gender, authOrOptions, exportOptions) {
      const selection = activeStudentExportOptions(authOrOptions, exportOptions);
      return legacyDownloadUrl(await studentListPrintUrl(grade, classNo, gender, selection));
    },
    async generateStudentListExcel(grade, classNo, gender, authOrOptions, exportOptions) {
      const selection = activeStudentExportOptions(authOrOptions, exportOptions);
      return legacyDownloadUrl(await studentListExcelUrl(grade, classNo, gender, selection));
    },
    async exportStudentRegistryPDF(grade, classNo) { return legacyStudentRegistryPrintUrl(grade, classNo); },
    async exportAttendancePDF(grade, classNo) { return classPrintResult('แบบบันทึกเวลาเรียน', grade, classNo); },
    async exportMonthlyAttendancePDF(grade, classNo, yearCE, month) {
      let calendarYear = Number(yearCE);
      if (calendarYear >= 2400) calendarYear -= 543;
      const monthNumber = Number(month);
      const displayYear = calendarYear + 543;
      const monthName = THAI_MONTH_NAMES[monthNumber - 1] || text(monthNumber);
      const options = await attendancePrintOptions(grade, classNo, `${monthName} ${displayYear}`);
      const currentPage = text(global.AppNavigation?.currentPage || global.document?.body?.getAttribute?.('data-current-page'));
      if (currentPage === 'attendance_table') {
        const tableData = await this.getAttendanceVerticalTable(grade, classNo, calendarYear, monthNumber - 1);
        return attendancePdfExporter().createChecklist(tableData, options);
      }
      const rows = await this.getMonthlyAttendanceSummary(grade, classNo, calendarYear, monthNumber);
      return attendancePdfExporter().createSummary('รายงานสรุปการมาเรียนรายเดือน', rows, options);
    },
    async exportStudentAttendancePDF(grade, classNo, studentId, academicYear) {
      const detail = await this.getStudentAttendanceDetail(grade, classNo, studentId, academicYear);
      const studentName = studentDisplayName(detail.student);
      const options = await attendancePrintOptions(grade, classNo, `${studentName} - ปีการศึกษา ${detail.academicYear}`);
      return attendancePdfExporter().createStudent(detail, options);
    },
    async exportSemesterAttendancePDF(grade, classNo, semester, academicYear) {
      const rows = await this.getSemesterAttendanceSummary(grade, classNo, semester, academicYear);
      const semesterLabel = Number(semester) === 2 ? 'ภาคเรียนที่ 2 (พฤศจิกายน - มีนาคม)' : 'ภาคเรียนที่ 1 (พฤษภาคม - ตุลาคม)';
      const options = await attendancePrintOptions(grade, classNo, `${semesterLabel} ปีการศึกษา ${normalizeAcademicYearBE(academicYear)}`);
      return attendancePdfExporter().createSummary('รายงานสรุปการมาเรียนรายภาคเรียน', rows, options);
    },
    async exportStudentScoresPDF(grade, classNo, term, sortMode) { return generateClassSubjectScorePdf(grade, classNo, term, sortMode); },
    async exportAttendanceChecklistPDF(grade, classNo, yearCE, monthIndex) {
      let calendarYear = Number(yearCE);
      if (calendarYear >= 2400) calendarYear -= 543;
      const tableData = await this.getAttendanceVerticalTable(grade, classNo, calendarYear, Number(monthIndex));
      const monthName = THAI_MONTH_NAMES[Number(monthIndex)] || '';
      const options = await attendancePrintOptions(grade, classNo, `${monthName} ${calendarYear + 543}`);
      return attendancePdfExporter().createChecklist(tableData, options);
    },
    async exportMonthlyAttendanceMatrixPDF(grade, classNo, academicYear) {
      const matrix = await this.getMonthlyAttendanceMatrix(grade, classNo, academicYear);
      const options = await attendancePrintOptions(grade, classNo, `ปีการศึกษา ${matrix.academicYear}`);
      return attendancePdfExporter().createMatrix(matrix, options);
    },
    async exportClassSubjectScorePDF(grade, classNo) { return pdfResultAsDataUri(await generateClassSubjectScorePdf(grade, classNo)); },
    async exportClassAssessmentSummaryPDF(grade, classNo, term, sortMode) { return generateClassAssessmentSummaryPdf(grade, classNo, term, sortMode); },
    async generateOnePageReportPdf(studentId, term, options) { return generateOnePagePdf(studentId, term, options); },
    async getStudentListForPp6(grade, classNo, year) {
      const normGrade = text(grade).includes('ประถม') ? `ป.${text(grade).replace(/[^0-9]/g, '')}` : text(grade);
      const room = text(classNo || '1');
      const settings = await data.settings.get().catch(() => ({}));
      const academicYear = text(normalizeAcademicYearBE(year || settings.academicYear || settings.academic_year));
      const students = await data.students.list({ grade: normGrade, room, academicYear });
      return (students || []).map((s) => {
        const fullName = studentDisplayName(s) || s.name || 'ไม่มีชื่อ';
        return {
          id: text(s.id),
          name: fullName,
          studentId: text(s.id),
          studentNumber: s.studentNumber || s.student_number || '',
          number: s.studentNumber || s.student_number || ''
        };
      }).sort((a, b) => {
        if (a.number && b.number) {
          const numA = Number(a.number);
          const numB = Number(b.number);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        }
        return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
      });
    },
    async generateStudentReportPdfUnified(studentId, options) {
      const requestedYear = text(options?.academicYear || options?.year).trim();
      let student = requestedYear
        ? (await data.students.list({ academicYear: requestedYear, active: false })).find((s) => text(s.id) === text(studentId))
        : await data.students.get(studentId);
      if (requestedYear && !student) throw new Error('ไม่พบนักเรียนในทะเบียนปีที่เลือก');
      if (!student) {
        const allStudents = await data.students.list({ active: false });
        student = allStudents.find((s) =>
          text(s.id) === text(studentId) ||
          text(s.studentId) === text(studentId) ||
          text(s.student_id) === text(studentId) ||
          text(s.studentNumber) === text(studentId)
        ) || null;
      }
      if (!student) throw new Error('ไม่พบนักเรียนที่เลือก');
      const grade = options?.grade || student.grade;
      const classNo = options?.classNo || student.classNo || student.room;
      if (!grade || !classNo) throw new Error('ไม่พบชั้นและห้องของนักเรียน');
      const domFormat = typeof document !== 'undefined' && typeof document?.getElementById === 'function' ? document.getElementById('pp6ReportFormatSelector')?.value : null;
      const storedFormat = typeof localStorage !== 'undefined' && typeof localStorage?.getItem === 'function' ? localStorage.getItem('pp6_report_format') : null;
      const chosenFormat = options?.reportFormat || (options?.format === 'booklet' ? 'booklet' : (options?.format === 'single' ? 'single' : (domFormat || storedFormat || 'single')));
      const finalOptions = { ...options, reportFormat: chosenFormat };
      const url = await generatePp6Pdf(grade, classNo, [student ? student.id : studentId], finalOptions);
      return { mode: 'url', url, success: true };
    },
    async getPp5ReadinessSummary(grade, classNo, academicYear) { return getPp5ReadinessSummary(grade, classNo, academicYear); },
    async getPp5ReadinessMatrix(academicYear) { return getPp5ReadinessMatrix(academicYear); },
    async getPp5ApprovalDashboard(academicYear) { return getPp5ApprovalDashboard(academicYear); },
    async getPp5ApprovalRecord(grade, classNo, academicYear) { return getPp5ApprovalRecord(grade, classNo, academicYear); },
    async submitPp5ForReview(grade, classNo, academicYear, note) { return updatePp5ApprovalStatus(grade, classNo, academicYear, 'submitted', 'ครูส่งตรวจ', note); },
    async markPp5Reviewed(grade, classNo, academicYear, note) { return updatePp5ApprovalStatus(grade, classNo, academicYear, 'reviewed', 'วิชาการตรวจแล้ว', note); },
    async approvePp5Class(grade, classNo, academicYear, note) { return updatePp5ApprovalStatus(grade, classNo, academicYear, 'approved', 'อนุมัติ ปพ.5', note); },
    async returnPp5ForCorrection(grade, classNo, academicYear, note) { return updatePp5ApprovalStatus(grade, classNo, academicYear, 'returned', 'ส่งกลับแก้ไข', note); },
    async exportCompetencyReport(grade, classNo, sortMode) { return generateCompetencyDetailedPdf(grade, classNo, sortMode); },
    async exportCompetencySummaryReport(grade, classNo) { return generateCompetencySummaryPdf(grade, classNo); },
    async generateActivityAssessmentPDF(grade, classNo, sortMode) { return generateActivityPdf(grade, classNo, sortMode); },
    async generateCharacteristicAssessmentPDF(grade, classNo, sortMode) { return generateCharacteristicPdf(grade, classNo, sortMode); },
    async generateSubjectScoreAssessmentPDF(grade, classNo, sortMode) { return generateSubjectScorePdf(grade, classNo, sortMode); },
    async generateParentInfoPDF(grade, classNo) { return parentInfoPdfUrl(grade, classNo); },
    async exportPp5CoverPDF(grade, classNo) { return generatePp5CoverPdf(grade, classNo); },
    async exportPp5FullBookPDF(grade, classNo, academicYear) { return generatePp5FullBookPdf(grade, classNo, null, academicYear); },
    async exportPp5FullBookSheets(grade, classNo, parts) { return generatePp5FullBookPdf(grade, classNo, parts); },
    async exportPp6PDF(grade, classNo) { return generatePp6Pdf(grade, classNo); },
    async exportScoresPdf_SingleTerm(subjectName, subjectCode, grade, classNo, termId) {
      const source = await scorePdfSource(subjectName, subjectCode, grade, classNo);
      const semester = termId === 'term2' || number(termId, 1) === 2 ? 2 : 1;
      const term = semester === 2 ? source.term2 : source.term1;
      const subjectLabel = `${text(source.subject.name || subjectName)}${text(source.subject.code || subjectCode) ? ` (${text(source.subject.code || subjectCode)})` : ''}`;
      const options = await attendancePrintOptions(
        grade,
        classNo,
        `${subjectLabel} - ภาคเรียนที่ ${semester} - ปีการศึกษา ${source.academicYear}`
      );
      const url = await scorePdfExporter().createScoreSheet({
        title: 'แบบบันทึกคะแนนรายวิชา',
        fullScores: term.fullScores,
        fullFinal: term.fullFinal,
        rows: term.rows
      }, options);
      return pdfObjectUrlToBase64(url);
    },
    async exportScoresPdf_Year(subjectName, subjectCode, grade, classNo) {
      const source = await scorePdfSource(subjectName, subjectCode, grade, classNo);
      const annual = scorePdfYearData(source);
      const subjectLabel = `${text(source.subject.name || subjectName)}${text(source.subject.code || subjectCode) ? ` (${text(source.subject.code || subjectCode)})` : ''}`;
      const options = await attendancePrintOptions(
        grade,
        classNo,
        `${subjectLabel} - รวม 2 ภาคเรียน - ปีการศึกษา ${source.academicYear}`
      );
      const url = await scorePdfExporter().createScoreSheet({
        title: 'สรุปผลการเรียนรายวิชา',
        fullScores: annual.fullScores,
        fullFinal: annual.fullFinal,
        rows: annual.rows
      }, options);
      return pdfObjectUrlToBase64(url);
    },
    // หน้าจัดการรายวิชาเรียกด้วย authToken เป็นอาร์กิวเมนต์แรก และเปิดผลลัพธ์ด้วย window.open(ผลลัพธ์)
    // จึงรับเฉพาะชื่อชั้นที่ถูกรูปแบบ (ค่าอื่น = ทุกชั้น) และคืนเป็นลิงก์ (สตริง)
    async exportAllSubjectsAsPdf(gradeOrToken) {
      const candidate = text(gradeOrToken).trim();
      const grade = /^(?:อ|ป|ม)\.\d+$/.test(candidate) ? candidate : undefined;
      const subjects = (await data.subjects.list(grade)).map(toLegacySubject)
        .sort((a, b) => text(a.grade).localeCompare(text(b.grade), 'th') || text(a.subjectCode).localeCompare(text(b.subjectCode), 'th'));
      const rows = subjects.map((subject, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(subject.subjectCode)}</td><td style="text-align:left">${escapeHtml(subject.subjectName)}</td><td>${escapeHtml(subject.grade)}</td><td>${escapeHtml(subject.subject_type)}</td><td>${escapeHtml(subject.hoursPerYear)}</td><td>${escapeHtml(subject.credit)}</td></tr>`).join('');
      const settings = await data.settings.get();
      return printUrl('รายวิชาและหลักสูตร', `<table><thead><tr><th>ที่</th><th>รหัส</th><th>รายวิชา</th><th>ชั้น</th><th>ประเภท</th><th>ชั่วโมง/ปี</th><th>หน่วยกิต</th></tr></thead><tbody>${rows}</tbody></table>`, {
        schoolName: settings.schoolName, meta: `${grade ? `ชั้น ${grade}` : 'ทุกชั้น'}  ปีการศึกษา ${text(settings.academicYear)}  รวม ${subjects.length} วิชา`
      });
    },
    async exportOnePageReport(studentId, term, options) { return generateOnePagePdf(studentId, term, options); },
    async generateParentReportCard(studentId, options) {
      const requestedStudentId = text(studentId).trim();
      if (!requestedStudentId) throw new Error('กรุณาระบุรหัสนักเรียน');
      const state = await data.auth.requireUser();
      const role = text(state.profile.role).toLowerCase();
      if (role === 'parent') {
        const { data: link, error } = await client
          .from('parent_student_links')
          .select('student_id')
          .eq('parent_user_id', state.user.id)
          .eq('student_id', requestedStudentId)
          .maybeSingle();
        if (error) throw new Error(error.message || 'ตรวจสอบสิทธิ์ผู้ปกครองไม่สำเร็จ');
        if (!link) throw new Error('ไม่มีสิทธิ์ดูใบรายงานของนักเรียนคนนี้');
      } else if (role !== 'admin' && role !== 'teacher') {
        throw new Error('บัญชีนี้ไม่มีสิทธิ์สร้างใบรายงาน');
      }
      const finalOptions = {
        ...(options || {}),
        term: ['1', '2', 'year'].includes(text(options?.term).trim()) ? text(options.term).trim() : 'year',
        reportFormat: 'single',
        format: 'single',
        // Parents open this from their phone, often inside an app's built-in browser (e.g.
        // LINE) rather than a real browser — a data: URI survives that in a way a blob: URL
        // does not (see the comment in generatePp6Pdf).
        preferDataUri: true
      };
      const result = await this.generateStudentReportPdfUnified(requestedStudentId, finalOptions);
      const url = result?.url || result?.viewUrl || result?.downloadUrl || '';
      if (!result?.success || !url) return result;
      return {
        ...result,
        success: true,
        url,
        viewUrl: url,
        downloadUrl: url,
        reportFormat: 'single'
      };
    },
    async fillSchoolMISTemplate(templateText, sheetName, mode, fileName) {
      return schoolMisFillTemplate(templateText, sheetName, mode, fileName);
    },
    async exportToSchoolMIS_Base64(sheetName, term, sortMode) {
      return schoolMisExport(sheetName, term, sortMode || 'id', false);
    },
    async exportToSchoolMIS_Average_Base64(sheetName, sortMode) {
      return schoolMisExport(sheetName, '', sortMode || 'id', true);
    },
    async exportToSchoolMIS_Average(sheetName, sortMode) {
      const result = await schoolMisExport(sheetName, '', sortMode || 'id', true);
      return {
        success: true,
        csvContent: result.csvContent,
        fileName: result.fileName,
        studentCount: result.studentCount,
        message: result.message
      };
    },
    async handleExportClassCSV(grade, classNo, sortMode) {
      return classScoreCsvExport(grade, classNo, sortMode || 'id');
    },

    async compareWithSchoolMIS() { migrationRequired('เปรียบเทียบไฟล์ SchoolMIS ที่อัปโหลด'); },
    async importSchoolMISFromUpload() { migrationRequired('นำเข้าไฟล์ SchoolMIS แบบตรวจสอบและ preview'); },
    async importStudentFile(fileType, fileData, fileName) {
      await requireAdmin();
      const importer = global.PP5DmcImport;
      if (!importer?.parseFile) {
        throw new Error('ตัวตรวจไฟล์ DMC ยังโหลดไม่สำเร็จ กรุณาโหลดหน้าเว็บใหม่');
      }
      const normalizedType = text(fileType).trim().toLowerCase();
      const prepared = await importer.parseFile(normalizedType, fileData);
      const year = await currentYear();
      const previewResult = await client.rpc('pp5_preview_dmc_student_import', {
        p_rows: prepared.rows,
        p_academic_year: year
      });
      if (previewResult.error) {
        const missingMigration = /pp5_preview_dmc_student_import|schema cache|could not find/i.test(text(previewResult.error.message));
        if (missingMigration) {
          throw new Error('ฐานข้อมูลยังไม่ได้ติดตั้ง migration ตัวนำเข้า DMC กรุณาให้ผู้ดูแลติดตั้งก่อน');
        }
        throw new Error(`ตรวจผลกระทบก่อนนำเข้าไม่สำเร็จ: ${previewResult.error.message}`);
      }
      const preview = previewResult.data || {};
      const confirmed = await confirmDmcImport(prepared, preview, fileName);
      if (!confirmed) return 'ยกเลิกการนำเข้าแล้ว — ไม่มีข้อมูลใดถูกเปลี่ยนแปลง';

      const applyResult = await client.rpc('pp5_apply_dmc_student_import', {
        p_rows: prepared.rows,
        p_academic_year: year,
        p_file_name: text(fileName || `students.${normalizedType}`),
        p_file_type: normalizedType,
        p_source_count: prepared.totalRows,
        p_skipped_count: prepared.skippedCount,
        p_measured_on: new Date().toISOString().slice(0, 10)
      });
      if (applyResult.error) throw new Error(`นำเข้า DMC ไม่สำเร็จและระบบย้อนคืนข้อมูลทั้งชุดแล้ว: ${applyResult.error.message}`);
      const result = applyResult.data || {};
      return [
        '✅ นำเข้า DMC สำเร็จ',
        `เพิ่มใหม่ ${number(result.insertedCount)} คน`,
        `อัปเดต ${number(result.updatedCount)} คน`,
        number(result.snapshotCount) ? `สร้างจุดย้อนกลับ ${number(result.snapshotCount)} คน` : '',
        prepared.skippedCount ? `ข้ามข้อมูลผิด ${prepared.skippedCount} แถว` : '',
        number(result.preservedMissingCount) ? `เก็บนักเรียนเดิมที่ไม่อยู่ในไฟล์ไว้ ${number(result.preservedMissingCount)} คน` : ''
      ].filter(Boolean).join(' • ');
    },
    async getDmcImportHistory(limit = 10) {
      await requireAdmin();
      const result = await client.rpc('pp5_list_dmc_student_imports', {
        p_limit: Math.max(1, Math.min(number(limit) || 10, 50))
      });
      if (result.error) {
        const missingMigration = /pp5_list_dmc_student_imports|schema cache|could not find/i.test(text(result.error.message));
        if (missingMigration) throw new Error('ฐานข้อมูลยังไม่ได้ติดตั้งระบบ snapshot/ย้อนกลับ DMC');
        throw new Error(`อ่านประวัตินำเข้า DMC ไม่สำเร็จ: ${result.error.message}`);
      }
      return Array.isArray(result.data) ? result.data : [];
    },
    async previewDmcStudentImportRollback(importId) {
      await requireAdmin();
      const normalizedId = text(importId).trim();
      if (!normalizedId) throw new Error('ไม่พบรหัสประวัติการนำเข้า DMC');
      const result = await client.rpc('pp5_preview_dmc_student_rollback', {
        p_import_id: normalizedId
      });
      if (result.error) throw new Error(`ตรวจความพร้อมก่อนย้อนกลับไม่สำเร็จ: ${result.error.message}`);
      return result.data || {};
    },
    async rollbackDmcStudentImport(importId) {
      await requireAdmin();
      const preview = await this.previewDmcStudentImportRollback(importId);
      if (preview.eligible !== true) {
        throw new Error(preview.reason || 'รายการนี้ยังไม่ผ่านเงื่อนไขความปลอดภัยสำหรับการย้อนกลับ');
      }
      const confirmed = await confirmDmcRollback(preview);
      if (!confirmed) return { success: false, cancelled: true, message: 'ยกเลิกการย้อนกลับแล้ว — ไม่มีข้อมูลใดถูกเปลี่ยนแปลง' };
      const result = await client.rpc('pp5_rollback_dmc_student_import', {
        p_import_id: text(importId).trim()
      });
      if (result.error) throw new Error(`ย้อนกลับไม่สำเร็จและฐานข้อมูลยกเลิกทั้งรายการแล้ว: ${result.error.message}`);
      return result.data || { success: true };
    },
    async exportProjectAsZip() {
      await requireAdmin();
      return {
        success: true,
        // Public kit (owner 2026-10-10): GitHub Pac7584/pp5smart-newschool, free under GPL-3.0; no school data in it.
        schoolName: 'ระบบ ปพ.5 Smart (ชุดติดตั้งสำหรับโรงเรียนอื่น)',
        copyUrl: 'https://github.com/Pac7584/pp5smart-newschool',
        warning: 'ชุดติดตั้งมีเฉพาะโปรแกรม โครงสร้างฐานข้อมูล และรายวิชาต้นแบบ ไม่มีข้อมูลนักเรียน ครู ผู้ปกครอง หรือคะแนนของโรงเรียนใด',
        sanitized: true,
        excludedData: [
          'ข้อมูลนักเรียนและผู้ปกครอง',
          'คะแนนและเวลาเรียนทั้งหมด',
          'บัญชีผู้ใช้และรหัสผ่าน',
          'ชื่อโรงเรียน ชื่อครู และลายเซ็น'
        ],
        templateInfo: {
          name: 'PP5Smart (GPL-3.0)',
          lastUpdated: 'ตุลาคม 2569',
          url: 'https://github.com/Pac7584/pp5smart-newschool'
        },
        steps: [
          'สร้างโปรเจกต์ใหม่ที่ supabase.com (ฟรี) แล้วรันไฟล์ supabase/install/install.sql ใน SQL Editor ครั้งเดียว',
          'ใส่ Project URL และ anon key ของโปรเจกต์ในไฟล์ js/app-config.js ไฟล์เดียว',
          'Deploy ขึ้น Vercel (ฟรี) แล้วตั้งผู้ดูแลระบบคนแรกตามคู่มือ'
        ]
      };
    },
    // ตารางเช็คชื่อ 11 เดือนของปีการศึกษา (พ.ค.–มี.ค.) รวมเป็นไฟล์ ZIP ไฟล์เดียว
    async exportAcademicYearChecklistZIP(grade, classNo, academicYear) {
      const JSZip = await loadExternalLibrary('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'JSZip');
      const year = normalizeAcademicYearBE(academicYear || await currentYear());
      const zip = new JSZip();
      const months = academicYearMonths(year);
      for (let index = 0; index < months.length; index += 1) {
        const month = months[index];
        const result = await this.exportAttendanceChecklistPDF(grade, classNo, month.yearCE, month.month - 1);
        const source = typeof result === 'object' ? (result?.dataUri || result?.blobUrl || result?.url) : result;
        if (!source) continue;
        const blob = await fetch(source).then((response) => response.blob());
        zip.file(`${String(index + 1).padStart(2, '0')}_${month.monthName}_${month.yearBE}.pdf`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      return URL.createObjectURL(zipBlob);
    },
    async deleteAllWarehouseBackups() { migrationRequired('จัดการชุดสำรองคะแนน'); },
    async checkAndNotifyUpdate() { return { hasUpdate: false, version: 'supabase-migration-v2' }; },
    async checkVersion() { return { version: 'supabase-migration-v2', status: 'OK', database: 'Supabase' }; },
    async pp5fb_getProgress() { return { status: 'idle', progress: 0 }; },
    async computeSchoolSarAnalytics(academicYear) { return computeSchoolSarAnalytics(academicYear); },
    async getSarAnalyticsData(academicYear) { return computeSchoolSarAnalytics(academicYear); },
    async exportSarAnalyticsPDF(academicYear) { return exportSarAnalyticsPDF(academicYear); },
    async saveSchoolSignatures(payload) { return saveSchoolSignatures(payload); },
    async getSchoolSignatures() { return getSchoolSignatures(); }
  };

  const aliases = {
    S_getGlobalSettings_: 'getGlobalSettings',
    S_saveGlobalSettings_: 'saveSystemSettings',
    getAdminGlobalSettings: 'getGlobalSettings',
    getWebAppSettings: 'getGlobalSettings',
    getDefaultSettings: 'getGlobalSettings',
    getPageHtml: 'include',
    getPageContent: 'include',
    getAvailableClassNos: 'getAvailableClasses',
    getStudentsByGradeClass: 'getFilteredStudentsInline',
    getStudentsByClass: 'getFilteredStudentsInline',
    getStudentsInClass: 'getFilteredStudentsInline',
    getStudentsForAttendance: 'getFilteredStudentsInline',
    getStudentList: 'getFilteredStudentsInline',
    getStudentsList: 'getFilteredStudentsInline',
    getSubjectsForGrade: 'getSubjects',
    saveStudentScores: 'saveScoreSheetData',
    saveGlobalSettings: 'saveSystemSettings'
  };

  function createRunner(successHandler, failureHandler, userObject) {
    return new Proxy({}, {
      get(_target, property) {
        if (property === 'withSuccessHandler') return (handler) => createRunner(handler, failureHandler, userObject);
        if (property === 'withFailureHandler') return (handler) => createRunner(successHandler, handler, userObject);
        if (property === 'withUserObject') return (value) => createRunner(successHandler, failureHandler, value);
        return async (...args) => {
          try {
            const methodName = aliases[property] || property;
            const method = server[methodName];
            if (typeof method !== 'function') migrationRequired(text(property));
            const result = await method.apply(server, args);
            if (methodName === 'loadHolidaysFromSheet' && global.AttendanceMonthly && Array.isArray(result)) {
              global.AttendanceMonthly.holidaysArray = result
                .filter((row) => Array.isArray(row) && row[0])
                .map((row) => ({ date: text(row[0]), detail: text(row[1] || 'วันหยุด'), type: text(row[2]) || 'ราชการ' }));
            }
            if (typeof successHandler === 'function') successHandler(result, userObject);
            return result;
          } catch (error) {
            console.error(`GAS compatibility error [${text(property)}]:`, error.message);
            if (typeof failureHandler === 'function') failureHandler(error, userObject);
            else if (typeof global.alert === 'function') global.alert(`ข้อผิดพลาด: ${error.message}`);
            return undefined;
          }
        };
      }
    });
  }

  global.google ||= {};
  global.google.script ||= {};
  global.google.script.run = createRunner();
  global.google.script.history = { push() {}, replace() {}, setChangeHandler() {} };
  global.GasServer = server;
})(window);
