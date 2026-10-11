// Read-only curriculum totals and setup checklist. No installation, account creation or writes.
(function (global) {
  'use strict';
  if (global.PP5SchoolReadiness) return;
  const PRIMARY = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'];
  const SECONDARY = ['ม.1', 'ม.2', 'ม.3'];
  const text = (v) => v == null ? '' : String(v).trim();
  const esc = (v) => text(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numeric = (v) => text(v) !== '' && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
  const same = (a, b) => a !== null && Math.abs(a - b) < 0.001;
  const format = (v) => v === null ? 'ตรวจไม่ได้' : Number(v.toFixed(3)).toLocaleString('th-TH');
  const termOf = (s) => [1, 2].includes(Number(s.semester)) ? Number(s.semester) : 0;
  const isSecondary = (g) => SECONDARY.includes(g);
  const gradesOf = (settings) => settings?.settings_json?.grade_levels === 'primary_lower_secondary' ? PRIMARY.concat(SECONDARY) : PRIMARY.slice();
  const ACTIVITY_GROUPS = [
    ['แนะแนว', /แนะแนว/],
    ['ลูกเสือ–เนตรนารี / กิจกรรมทดแทน', /ลูกเสือ|เนตรนารี|ยุวกาชาด|ผู้บำเพ็ญประโยชน์/],
    ['ชุมนุม / ชมรม', /ชุมนุม|ชมรม/],
    ['เพื่อสังคมและสาธารณประโยชน์', /เพื่อสังคม|สาธารณประโยชน์/]
  ];

  function kindOf(s) {
    const type = text(s.subject_type);
    const name = text(s.name);
    const code = text(s.code);
    if (type.includes('กิจกรรม') || /^ก/.test(code) || ACTIVITY_GROUPS.some(([, re]) => re.test(name))) return 'activity';
    if (type.includes('เพิ่มเติม')) return 'additional';
    if (type.includes('พื้นฐาน')) return 'basic';
    if (/^[^\d\s]+\d\d2/.test(code)) return 'additional';
    if (/^[^\d\s]+\d\d1/.test(code)) return 'basic';
    return 'unknown';
  }
  function creditOf(s) {
    if (kindOf(s) === 'activity') return 0;
    // An explicit credit is the value reports use. Do not silently replace an invalid explicit value.
    if (s.credit !== null && s.credit !== undefined && text(s.credit) !== '') return numeric(s.credit);
    const hours = numeric(s.hours_per_year);
    return hours === null ? null : hours / 40;
  }
  function sum(rows, kind, credit) {
    const values = rows.filter((s) => kindOf(s) === kind).map((s) => credit ? creditOf(s) : numeric(s.hours_per_year));
    return values.includes(null) ? null : values.reduce((a, b) => a + b, 0);
  }
  function totals(rows) {
    return {
      count: rows.length, basicHours: sum(rows, 'basic'), activityHours: sum(rows, 'activity'),
      additionalHours: sum(rows, 'additional'), basicCredits: sum(rows, 'basic', true),
      additionalCredits: sum(rows, 'additional', true)
    };
  }

  function analyze(subjects, grades) {
    const gradeList = grades || PRIMARY;
    const issues = [];
    const add = (grade, period, message) => issues.push({ grade, period, message });
    subjects.filter((s) => !gradeList.includes(text(s.grade))).forEach((s) => {
      add(text(s.grade) || 'ไม่ระบุชั้น', 'ตรวจระดับชั้น', text(s.name || s.code) + ': ไม่อยู่ในระดับชั้นที่โรงเรียนเปิดสอน — ไม่รวมในยอด');
    });
    const groups = gradeList.map((grade) => {
      const rows = subjects.filter((s) => text(s.grade) === grade);
      const secondary = isSecondary(grade);
      const yearly = rows.filter((s) => termOf(s) === 0);
      const annual = totals(rows);
      const periods = [{ label: 'ทั้งปี (รวม)', ...annual }];
      if (secondary || rows.some((s) => termOf(s))) {
        [1, 2].forEach((term) => {
          const own = rows.filter((s) => termOf(s) === term);
          periods.push({ label: 'ภาค ' + term, ...totals(own) });
          if (secondary && rows.length && !own.some((s) => kindOf(s) === 'additional')) {
            add(grade, 'ภาค ' + term, 'ยังไม่มีวิชาเพิ่มเติม — ตรวจแผนของโรงเรียน (ไม่ได้กำหนดขั้นต่ำแยกรายภาค)');
          }
          if (secondary && rows.length && !own.some((s) => kindOf(s) === 'basic')) add(grade, 'ภาค ' + term, 'ยังไม่มีวิชาพื้นฐานที่ระบุภาคเรียนนี้');
          if (secondary && rows.length) ACTIVITY_GROUPS.forEach(([label, re]) => {
            if (!own.some((s) => kindOf(s) === 'activity' && re.test(text(s.name)))) add(grade, 'ภาค ' + term, 'ยังไม่พบกิจกรรม' + label + ' — ตรวจชื่อและแผนกิจกรรม');
          });
        });
        if (yearly.length) periods.push({ label: secondary ? 'ยังไม่ระบุภาค' : 'รายวิชารายปี', ...totals(yearly) });
      }
      if (!rows.length) {
        add(grade, 'ทั้งปี', 'ยังไม่มีรายวิชาในชั้นนี้');
        return { grade, annual, periods };
      }
      rows.forEach((s) => {
        const name = text(s.name || s.code) || 'รายวิชาไม่มีชื่อ';
        const kind = kindOf(s);
        const period = termOf(s) ? 'ภาค ' + termOf(s) : (secondary ? 'ยังไม่ระบุภาค' : 'รายปี');
        if (kind === 'unknown') add(grade, period, name + ': ยังระบุประเภทวิชาไม่ได้');
        if (numeric(s.hours_per_year) === null) add(grade, period, name + ': ชั่วโมงเรียนว่างหรือไม่ถูกต้อง');
        if (secondary && !termOf(s)) add(grade, period, (kind === 'activity' ? 'กิจกรรม' : 'วิชา') + ' ' + name + ': ยังไม่ระบุภาคเรียน 1 หรือ 2');
        if (secondary && kind !== 'activity' && kind !== 'unknown') {
          const hours = numeric(s.hours_per_year), credit = creditOf(s);
          if (credit === null) add(grade, period, name + ': หน่วยกิตไม่ถูกต้อง');
          else if (hours !== null && !same(credit, hours / 40)) add(grade, period, name + ': หน่วยกิตไม่ตรงกับชั่วโมง ÷ 40');
        }
      });
      const expectedBasic = secondary ? 880 : 840;
      if (!same(annual.basicHours, expectedBasic)) add(grade, 'ทั้งปี', 'พื้นฐาน ' + format(annual.basicHours) + ' ชั่วโมง — กรอบ ' + expectedBasic + ' ชั่วโมง/ปี');
      if (!same(annual.activityHours, 120)) add(grade, 'ทั้งปี', 'กิจกรรม ' + format(annual.activityHours) + ' ชั่วโมง — กรอบ 120 ชั่วโมง/ปี');
      if (!secondary) ACTIVITY_GROUPS.forEach(([label, re]) => {
        if (!rows.some((s) => kindOf(s) === 'activity' && re.test(text(s.name)))) add(grade, 'ทั้งปี', 'ยังไม่พบกิจกรรม' + label + ' — ตรวจแผนกิจกรรม');
      });
      return { grade, annual, periods };
    });
    let secondarySummary = null;
    if (SECONDARY.every((grade) => gradeList.includes(grade))) {
      const ms = subjects.filter((s) => SECONDARY.includes(text(s.grade)));
      const basicCredits = sum(ms, 'basic', true), additionalCredits = sum(ms, 'additional', true);
      const socialHours = sum(ms.filter((s) => /เพื่อสังคม|สาธารณประโยชน์/.test(text(s.name))), 'activity');
      secondarySummary = { basicCredits, additionalCredits, socialHours };
      if (!same(basicCredits, 66)) add('ม.1–ม.3', 'รวม 3 ปี', 'หน่วยกิตพื้นฐาน ' + format(basicCredits) + ' — กรอบ 66 หน่วยกิต');
      if (additionalCredits === null || additionalCredits < 11) add('ม.1–ม.3', 'รวม 3 ปี', 'หน่วยกิตเพิ่มเติม ' + format(additionalCredits) + ' — ต้องวางแผนอย่างน้อย 11 หน่วยกิตตลอด 3 ปี');
      if (socialHours === null || socialHours < 45) add('ม.1–ม.3', 'รวม 3 ปี', 'กิจกรรมเพื่อสังคมฯ ' + format(socialHours) + ' ชั่วโมง — ต้องวางแผนครบ 45 ชั่วโมงตลอด 3 ปี');
    }
    return { grades: groups, issues, secondarySummary };
  }

  async function admin() {
    const state = await global.PP5Data.auth.requireUser();
    if (state?.profile?.role !== 'admin') throw new Error('หน้านี้สำหรับผู้ดูแลระบบของโรงเรียนเท่านั้น');
    return state;
  }
  async function readRows(table, columns, year) {
    const rows = [];
    for (let start = 0; ; start += 500) {
      let q = global.PP5Data.client.from(table).select(columns).order(table === 'student_year_rosters' ? 'student_id' : 'id');
      if (year) q = q.eq('academic_year', year);
      const result = await q.range(start, start + 499);
      if (result.error) throw new Error(result.error.message || 'อ่านข้อมูลไม่สำเร็จ');
      if (!Array.isArray(result.data)) throw new Error('ข้อมูลที่ได้รับไม่อยู่ในรูปแบบรายการ');
      rows.push(...result.data);
      if (result.data.length < 500) return rows;
    }
  }
  function bounded(p) {
    return new Promise((resolve, reject) => {
      const timer = global.setTimeout(() => reject(new Error('อ่านข้อมูลเกินเวลา กรุณาตรวจการเชื่อมต่อแล้วกดตรวจอีกครั้ง')), 20000);
      Promise.resolve(p).then(
        (value) => { global.clearTimeout(timer); resolve(value); },
        (error) => { global.clearTimeout(timer); reject(error); }
      );
    });
  }
  const settled = (p) => bounded(p).then((value) => ({ ok: true, value }), (error) => ({ ok: false, error: text(error?.message || error) }));
  const row = (id, title, status, detail, page, action) => ({ id, title, status, detail, page, action });
  const unknown = (id, title, detail, page) => row(id, title, 'unknown', 'ตรวจไม่ได้: ' + detail, page, 'ไปตรวจสอบ');

  function checklist(snapshot) {
    const { settings, subjects, roster, assignments, users } = snapshot;
    const profiles = snapshot.profiles || users;
    const checks = [];
    checks.push(settings.ok ? row('connection', 'เชื่อมฐานข้อมูล', 'ready', 'อ่านข้อมูลตั้งค่าโรงเรียนได้', 'new_settings_editor', 'ดูการตั้งค่า')
      : unknown('connection', 'เชื่อมฐานข้อมูล', settings.error, 'new_settings_editor'));
    if (settings.ok) {
      const name = text(settings.value.school_name || settings.value.schoolName);
      const named = name && name !== 'โรงเรียน' && !name.startsWith('ชื่อโรงเรียน');
      checks.push(row('school', 'ตั้งชื่อโรงเรียน', named ? 'ready' : 'todo', named ? name : 'ยังเป็นชื่อเริ่มต้น กรุณาตั้งชื่อโรงเรียน', 'new_settings_editor', 'ตั้งข้อมูลโรงเรียน'));
    } else checks.push(unknown('school', 'ตั้งชื่อโรงเรียน', 'ยังอ่านข้อมูลตั้งค่าไม่ได้', 'new_settings_editor'));
    const userTitle = 'ระบบสร้างบัญชีครู';
    checks.push(users.ok ? row('users', userTitle, 'ready', 'ระบบจัดการบัญชีตอบกลับได้ (ตรวจการอ่านรายชื่อ ไม่ได้ทดลองสร้างบัญชี)', 'admin_panel', 'จัดการผู้ใช้')
      : unknown('users', userTitle, users.error, 'admin_panel'));
    if (profiles.ok) {
      const teachers = profiles.value.filter((u) => u.role === 'teacher' && u.active === true);
      checks.push(row('teachers', 'มีบัญชีครูที่เปิดใช้งาน', teachers.length ? 'ready' : 'todo', teachers.length ? 'มีบัญชีครูที่เปิดใช้งาน ' + teachers.length + ' บัญชี' : 'ยังไม่มีบัญชีครูที่เปิดใช้งาน', 'admin_panel', 'เพิ่มบัญชีครู'));
    } else checks.push(unknown('teachers', 'มีบัญชีครูที่เปิดใช้งาน', profiles.error, 'admin_panel'));
    checks.push(subjects.ok ? row('subjects', 'นำเข้าหรือเพิ่มรายวิชา', subjects.value.length ? 'ready' : 'todo',
      subjects.value.length ? 'พบ ' + subjects.value.length + ' รายวิชา — ตรวจยอดและภาคเรียนต่อที่หน้าความพร้อมหลักสูตร' : 'ยังไม่มีรายวิชา', 'subjectManager', 'จัดการรายวิชา')
      : unknown('subjects', 'นำเข้าหรือเพิ่มรายวิชา', subjects.error, 'subjectManager'));
    if (subjects.ok && settings.ok) {
      const report = analyze(subjects.value, gradesOf(settings.value));
      checks.push(row('curriculum', 'ตรวจโครงสร้างหลักสูตร', report.issues.length ? 'todo' : 'ready',
        report.issues.length ? 'มี ' + report.issues.length + ' จุดที่ต้องตรวจ' : 'ไม่พบข้อทักท้วงจากตัวเลขและรายการ — ให้ครูวิชาการตรวจเนื้อหาและตัวชี้วัดต่อ',
        'curriculum_readiness', 'ตรวจหลักสูตร'));
    } else checks.push(unknown('curriculum', 'ตรวจโครงสร้างหลักสูตร', 'ยังอ่านรายวิชาหรือระดับชั้นไม่ได้', 'curriculum_readiness'));
    const activeStudents = roster.ok ? roster.value.filter((s) => s.status === 'active') : [];
    checks.push(roster.ok ? row('students', 'มีนักเรียนในปีการศึกษาปัจจุบัน', activeStudents.length ? 'ready' : 'todo',
      activeStudents.length ? 'มีนักเรียน ' + activeStudents.length + ' คน' : 'ยังไม่มีนักเรียนในปีนี้', 'import', 'นำเข้ารายชื่อ DMC')
      : unknown('students', 'มีนักเรียนในปีการศึกษาปัจจุบัน', roster.error, 'import'));
    if (!assignments.ok || !roster.ok) {
      checks.push(unknown('homeroom', 'กำหนดครูประจำชั้น', assignments.error || roster.error, 'teacher_editor'));
    } else if (!activeStudents.length) {
      checks.push(row('homeroom', 'กำหนดครูประจำชั้น', 'todo', 'นำเข้านักเรียนก่อน เพื่อให้ตรวจครบทุกห้องที่เปิดใช้งาน', 'teacher_editor', 'กำหนดครูประจำชั้น'));
    } else {
      const rooms = [...new Set(activeStudents.map((s) => text(s.grade) + '/' + text(s.room)))];
      const assigned = new Set(assignments.value.filter((a) => a.active === true && text(a.teacher_name)).map((a) => text(a.grade) + '/' + text(a.room)));
      const missing = rooms.filter((r) => !assigned.has(r));
      checks.push(row('homeroom', 'กำหนดครูประจำชั้น', missing.length ? 'todo' : 'ready',
        missing.length ? 'ยังไม่ได้กำหนดครู: ' + missing.join(', ') : 'บันทึกครูประจำชั้นครบ ' + rooms.length + ' ห้องในปีนี้ (ตรวจรายชื่อครู ยังไม่ได้ทดสอบสิทธิ์บัญชี)',
        'teacher_editor', 'กำหนดครูประจำชั้น'));
    }
    return checks;
  }

  async function loadCurriculum() {
    await bounded(admin());
    const [settings, subjects] = await bounded(Promise.all([
      global.PP5Data.settings.get(), readRows('subjects', 'id,grade,code,name,subject_type,hours_per_year,credit,semester')
    ]));
    return analyze(subjects, gradesOf(settings));
  }
  async function loadSetup() {
    await bounded(admin());
    const settingsPromise = settled(global.PP5Data.settings.get());
    const subjectsPromise = settled(readRows('subjects', 'id,grade,code,name,subject_type,hours_per_year,credit,semester'));
    const profilesPromise = settled(readRows('profiles', 'id,role,active'));
    // Only the existing read-only action. A list fallback must not imply that account creation works.
    const usersPromise = settled((async () => {
      const result = await global.PP5Data.client.functions.invoke('admin-users', { body: { action: 'list' } });
      if (result.error || result.data?.success !== true || !Array.isArray(result.data.users)) throw new Error('ยังตรวจระบบจัดการบัญชีไม่ได้ กรุณาตรวจการติดตั้งระบบบัญชีผู้ใช้');
      return result.data.users;
    })());
    const settings = await settingsPromise;
    const year = settings.ok ? text(settings.value.academic_year || settings.value.academicYear) : '';
    const badYear = !/^\d{4}$/.test(year);
    const notReady = { ok: false, error: 'ยังอ่านปีการศึกษาปัจจุบันไม่ได้' };
    const [subjects, profiles, users, roster, assignments] = await Promise.all([
      subjectsPromise, profilesPromise, usersPromise,
      badYear ? notReady : settled(readRows('student_year_rosters', 'student_id,grade,room,status', year)),
      badYear ? notReady : settled(readRows('teacher_assignments', 'id,grade,room,teacher_name,active', year))
    ]);
    return { year, checks: checklist({ settings, subjects, profiles, roster, assignments, users }) };
  }

  function action(page, label) {
    return '<button type="button" class="btn btn-outline-primary btn-sm" data-readiness-page="' + esc(page) + '">' + esc(label) + '</button>';
  }
  function shell(mode) {
    const curriculum = mode === 'curriculum';
    return '<section class="pp5-readiness" data-readiness-mode="' + mode + '">' +
      '<div class="pp5-readiness-heading"><div><h2>' + (curriculum ? 'ตรวจความพร้อมของหลักสูตร' : 'เริ่มต้นใช้งานโรงเรียน') + '</h2><p>' +
      (curriculum ? 'ตรวจชั่วโมงเรียน หน่วยกิต และรายการที่ยังต้องเติมจากรายวิชาของโรงเรียน' : 'ดูว่าตั้งค่าถึงขั้นไหนแล้ว และไปทำรายการที่ยังเหลือ') +
      '</p></div><div class="pp5-readiness-actions">' + action(curriculum ? 'subjectManager' : 'curriculum_readiness', curriculum ? 'จัดการรายวิชา' : 'ตรวจหลักสูตร') +
      '<button type="button" class="btn btn-primary btn-sm" data-readiness-refresh>ตรวจอีกครั้ง</button></div></div>' +
      '<div data-readiness-result aria-live="polite"><p role="status">กำลังตรวจข้อมูล...</p></div></section>' +
      '<script>window.PP5SchoolReadiness.mount("' + mode + '");</script>';
  }
  function renderCurriculum(report) {
    const secondary = report.secondarySummary;
    let html = '<p class="pp5-readiness-note">รายวิชารายปีแสดงเป็นยอดรายปี ไม่แบ่งครึ่งเป็นรายภาค กิจกรรมนับชั่วโมงและประเมินผ่าน/ไม่ผ่าน ไม่นับเป็นหน่วยกิตเพิ่มเติม</p>';
    if (secondary) html += '<div class="pp5-readiness-overview"><span>ม.1–ม.3 รวม 3 ปี</span><strong>พื้นฐาน ' + format(secondary.basicCredits) +
      ' / 66 หน่วยกิต</strong><strong>เพิ่มเติม ' + format(secondary.additionalCredits) + ' / อย่างน้อย 11 หน่วยกิต</strong><strong>เพื่อสังคมฯ ' +
      format(secondary.socialHours) + ' / 45 ชั่วโมง</strong></div>';
    html += '<label class="pp5-readiness-filter">แสดงชั้น <select class="form-select form-select-sm" data-readiness-grade><option value="">ทุกชั้น</option>' +
      report.grades.map((g) => '<option value="' + esc(g.grade) + '">' + esc(g.grade) + '</option>').join('') + '</select></label>' +
      '<div class="pp5-readiness-table"><table class="table table-bordered align-middle"><caption>ชั่วโมงและหน่วยกิตตามรายการที่บันทึกไว้</caption><thead><tr>' +
      '<th scope="col">ชั้น</th><th scope="col">ช่วงเวลา</th><th scope="col">พื้นฐาน<br>ชั่วโมง</th><th scope="col">กิจกรรม<br>ชั่วโมง</th><th scope="col">เพิ่มเติม<br>ชั่วโมง</th><th scope="col">เพิ่มเติม<br>หน่วยกิต</th></tr></thead><tbody>' +
      report.grades.map((g) => g.periods.map((p) => '<tr data-readiness-for="' + esc(g.grade) + '"' + (p.label === 'ทั้งปี (รวม)' ? ' class="pp5-readiness-total"' : '') +
        '><th scope="row">' + esc(g.grade) + '</th><td>' + esc(p.label) + '</td><td>' + format(p.basicHours) + '</td><td>' + format(p.activityHours) +
        '</td><td>' + format(p.additionalHours) + '</td><td>' + (isSecondary(g.grade) ? format(p.additionalCredits) : '—') + '</td></tr>').join('')).join('') +
      '</tbody></table></div><h3>รายการที่ควรตรวจ</h3><p>' + (report.issues.length ? 'พบ ' + report.issues.length + ' จุดที่ควรตรวจและปรับตามหลักสูตรสถานศึกษา' : 'ไม่พบข้อทักท้วงจากตัวเลขและรายการที่ตรวจได้') + '</p>' +
      '<ul class="pp5-readiness-issues">' + report.issues.map((i) => '<li data-readiness-for="' + esc(i.grade) + '"><strong>' + esc(i.grade + ' ' + i.period) + '</strong> — ' + esc(i.message) + '</li>').join('') + '</ul>' +
      '<p class="pp5-readiness-note">เทียบกรอบหลักสูตรแกนกลาง 2551 และคำสั่งปรับโครงสร้างเวลาเรียน: ประถมพื้นฐาน 840 ชม./ปี ม.ต้นพื้นฐาน 880 ชม./ปี กิจกรรม 120 ชม./ปี โดยไม่ได้บังคับชั่วโมงขั้นต่ำรายภาค ' +
      'การมีตัวเลขครบไม่ใช่การรับรองหลักสูตร ให้ครูวิชาการตรวจเนื้อหา ตัวชี้วัด และการจัดกิจกรรมจริงด้วย</p>' +
      '<details><summary>เอกสารที่ใช้เทียบกรอบ</summary><p><a href="https://academic.obec.go.th/download/journal/journal2561.3.pdf" target="_blank" rel="noopener">สพฐ. อธิบายโครงสร้างเวลาเรียนตามคำสั่ง 922/2561 (หน้า 58)</a></p>' +
      '<p><a href="https://academic.obec.go.th/web/images/document/1562725676_d_1.pdf" target="_blank" rel="noopener">เกณฑ์จบตามคำสั่ง สพฐ. 63/2562</a></p>' +
      '<p><a href="https://academic.obec.go.th/web/images/document/1760458207_d_1.pdf" target="_blank" rel="noopener">แนวทางกิจกรรมพัฒนาผู้เรียน (หน้า 9)</a></p></details>';
    return html;
  }
  function renderSetup(result) {
    const ready = result.checks.filter((c) => c.status === 'ready').length;
    const unknownCount = result.checks.filter((c) => c.status === 'unknown').length;
    return '<p class="pp5-readiness-overview" role="status">ตรวจผ่าน ' + ready + ' / ' + result.checks.length + ' รายการ' +
      (result.year ? ' · ปีการศึกษา ' + esc(result.year) : '') + (unknownCount ? ' · ตรวจไม่ได้ ' + unknownCount + ' รายการ' : '') + '</p>' +
      '<div class="pp5-readiness-checks">' + result.checks.map((c) => '<article class="pp5-readiness-check" data-check="' + c.id + '">' +
        '<div><h3>' + esc(c.title) + '</h3><p>' + esc(c.detail) + '</p></div><span class="pp5-readiness-status ' + c.status + '">' +
        ({ ready: 'พร้อม', todo: 'ยังต้องทำ', unknown: 'ตรวจไม่ได้' }[c.status]) + '</span>' + action(c.page, c.action) + '</article>').join('') +
      '</div><p class="pp5-readiness-note">สถานะมาจากข้อมูลที่อ่านได้ในครั้งนี้ การบันทึกรายชื่อครูยังไม่ยืนยันสิทธิ์บัญชี ' +
      'หลังตั้งค่า ให้ทดลองเข้าด้วยบัญชีครูและพิมพ์รายงานของห้องตัวอย่าง</p>';
  }
  function filterGrade(root, grade) {
    root.querySelectorAll('[data-readiness-for]').forEach((el) => {
      el.hidden = !!grade && el.dataset.readinessFor !== grade && !['ม.1–ม.3', 'ไม่ระบุชั้น'].includes(el.dataset.readinessFor) &&
        PRIMARY.concat(SECONDARY).includes(el.dataset.readinessFor);
    });
  }
  async function mount(mode) {
    const root = global.document?.querySelector('.pp5-readiness[data-readiness-mode="' + mode + '"]');
    if (!root) return;
    if (!root.dataset.bound) {
      root.dataset.bound = '1';
      root.addEventListener('click', (event) => {
        const nav = event.target.closest('[data-readiness-page]');
        if (nav && root.contains(nav)) global.navigateTo?.(nav.dataset.readinessPage);
        if (event.target.closest('[data-readiness-refresh]')) mount(mode);
      });
      root.addEventListener('change', (event) => {
        if (event.target.matches('[data-readiness-grade]')) filterGrade(root, event.target.value);
      });
    }
    const token = (root.__readinessToken || 0) + 1;
    root.__readinessToken = token;
    const result = root.querySelector('[data-readiness-result]');
    result.innerHTML = '<p role="status">กำลังตรวจข้อมูล...</p>';
    try {
      const value = await (mode === 'curriculum' ? loadCurriculum() : loadSetup());
      if (root.isConnected && root.__readinessToken === token) result.innerHTML = mode === 'curriculum' ? renderCurriculum(value) : renderSetup(value);
    } catch (error) {
      if (root.isConnected && root.__readinessToken === token) result.innerHTML = '<p class="text-danger" role="alert">' + esc(error.message || error) + '</p>';
    }
  }
  function enhanceSubjects() {
    const frame = global.document?.getElementById('contentFrame');
    if (!frame?.querySelector('#subjectTable') || frame.querySelector('[data-readiness-shortcuts]')) return;
    const links = global.document.createElement('div');
    links.dataset.readinessShortcuts = '1';
    links.className = 'pp5-readiness-actions mb-3';
    links.innerHTML = action('curriculum_readiness', 'ตรวจความพร้อมของหลักสูตร') + action('setup_wizard', 'ดูขั้นตอนตั้งค่าโรงเรียน');
    links.addEventListener('click', (event) => {
      const button = event.target.closest('[data-readiness-page]');
      if (button) global.navigateTo?.(button.dataset.readinessPage);
    });
    (frame.querySelector('#subjectTable').closest('.container') || frame).prepend(links);
  }
  global.PP5SchoolReadiness = { analyze, checklist, loadCurriculum, loadSetup, renderCurriculum, renderSetup, mount, enhanceSubjects, gradesOf };
  // Replace the old Sheets installer only in this Supabase runtime.
  global.GAS_PAGES = global.GAS_PAGES || {};
  global.GAS_PAGES.curriculum_readiness = shell('curriculum');
  global.GAS_PAGES.setup_wizard = shell('setup');
})(window);
