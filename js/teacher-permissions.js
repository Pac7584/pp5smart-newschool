// Scoped teacher assignments. Enforcement is staged OFF until the owner activates the SQL gate.
(function (global) {
  'use strict';
  const text = (v) => v == null ? '' : String(v).trim();
  const esc = (v) => text(v).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const fail = (message) => { const e = new Error(message); e.code = 'TEACHER_SCOPE_DENIED'; throw e; };
  const missingRpc = (error) => ['PGRST202','42883'].includes(error?.code);
  const PUBLIC = new Set(['login','forgot_password']);
  // These bridge entry points must work before authentication. Their original
  // implementations perform login/recovery validation or read public navigation/branding.
  // getGlobalSettings reads the existing public settings under RLS, not private signatures.
  const PUBLIC_AUTH_METHODS = new Set(['requestPasswordReset','clearLoginSession','getDeploymentUrl','getLoginPageHtml','getGlobalSettings']);
  // club_management: club advisors teach across rooms (ระบบชุมนุม 2026-10-14) — writes still go through pp5_club_set_member
  // help_page: คู่มือของทุกคน (owner 2026-10-14 ไล่แก้เมนูที่หลุดจากรายการ)
  const COMMON = new Set(['home_hub','dashboard','change_password','academic_calendar','club_management','help_page']);
  // subject_attendance / pp5_subject_book: เช็คชื่อรายวิชา (รายชั่วโมง) และ ปพ.5 แบบรายวิชา ของครูผู้สอน — สิทธิ์เขียนจริงตรวจที่ pp5_save_subject_attendance (SQL 031)
  const SUBJECT = new Set(['create_score_sheet','score_table_viewer','subject_score_viewer','exam_analysis','subject_attendance','pp5_subject_book',
    // subject_schedule: ตารางสอนของฉัน (SQL 032) — ต้องตั้งก่อนเช็คชื่อรายคาบ สิทธิ์จริงตรวจที่ pp5_save_subject_schedule
    'subject_schedule',
    // subject_attendance_summary: สรุปเวลาเรียนรายวิชา รายเดือน/รายภาค/ทั้งปี (อ่านอย่างเดียว ตาม RLS ของ subject_attendance)
    'subject_attendance_summary',
    // export_reports: ศูนย์รวมลิงก์รายงานของห้องที่ได้รับมอบหมาย (หน้าปลายทางตรวจสิทธิ์ของตัวเอง)
    'export_reports']);
  const HOMEROOM = new Set(['studentList','export_pdf_page','behavior_records','student_growth_entry','student_growth_report',
    'attendance_daily','attendance_monthly','attendance_table','semester_attendance_summary','student_scores_summary',
    'read_think_write_form','rtw5_assessment','characteristic_assessment','activity_assessment','competency_assessment',
    'teacher_comment_form_backup','report_card_generator','report_card_scores','one_page_report','pp5_full_book','pp5_cover_page','schoolmis_sync',
    // owner 2026-10-14 (ไล่แก้ทีละข้อ): หน้าในเมนูครูที่หลุดจากรายการ — ครูประจำชั้นเปิดได้เมื่อเปิดระบบสิทธิ์ครู
    // (ปุ่มอนุมัติ/ตีกลับ ปพ.5 ยังเป็นงานผู้ดูแลตาม ADMIN_METHODS; ส่งงานของห้องตัวเองเท่านั้นตามคู่ ชั้น/ห้อง)
    'teacher_comment_form','class_score_summary','class_assessment_summary','parent_info_report','pp5_readiness','pp5_approval',
    // รวมผลประเมินจากครูรายวิชา -> ผลประจำชั้น (owner 2026-10-15: ครูประจำชั้นสรุป ระบบเสนอค่าตั้งต้น)
    'subject_assessment_summary',
    // นักเรียนเสี่ยง มส. ทุกวิชาของห้อง (owner 2026-10-16) — อ่านอย่างเดียว ผ่าน getRoomAttendanceRisk (คู่ ชั้น/ห้อง ของครูประจำชั้น)
    'attendance_risk']);
  // หน้าประเมินเดิม 3 หน้า: ครูประจำวิชาเปิดได้ด้วย แล้วเลือก "วิชา · ห้อง" ที่แถบด้านบน (js/subject-assessment.js)
  // ผลจะลงแถว subj_* ของวิชานั้น — สิทธิ์จริงตรวจที่ SQL 202610150034
  const SHARED_ASSESSMENT = new Set(['characteristic_assessment','rtw5_assessment','competency_assessment']);
  const SUBJECT_ASSESSMENT_METHODS = /^(?:getStudentsForCharacteristic|saveCharacteristicAssessmentBatch|generateCharacteristicAssessmentPDF|getStudentsForRTW5|saveRTW5AssessmentBatch|getStudentsForCompetency|saveCompetencyAssessment|exportCompetency\w*)$/;
  const PARENT = new Set(['parent_portal','change_password']);
  const ADMIN_METHODS = /^(?:getAllUsers|addUser|updateUser|deleteUser|createUser|saveTeacher|saveSingleTeacher|getTeacherListForEditor|saveSystem|setGlobal|saveGlobal|setLogo|uploadLogo|saveSchoolSignatures|markPp5Reviewed|approvePp5Class|returnPp5ForCorrection|.*Transition|.*Rollback|importStudent|.*Dmc|.*DMC|.*ProjectAsZip|.*SchoolSar|.*SarAnalytics|.*Warehouse)/;
  const HOMEROOM_METHODS = /(?:Pp6|ReportCard|OnePage|StudentReport|StudentFullData|ParentInfo|Growth|Competency|Characteristic|Assessment|ReadThink|Pp5Full|Pp5Cover|Comment|Attendance|Behavior)/i;
  // These legacy readers have a grade followed by an auth token, not a classroom.
  // Their original data adapters and RLS still restrict the returned rooms/subjects.
  const GRADE_ONLY_METHODS = new Map([['getAvailableClasses',0],['getAvailableClassNos',0],
    ['getAvailableClassesForDelete',0],['getSubjects',0],['getSubjectsForGrade',0],['getSubjectAssessmentConfig',2]]);
  const ROOM_CONTROLS = new Map([['gradeSelect','classSelect'],['table-grade','table-class'],
    ['scoreEntryGradeSelect','scoreEntryClassSelect'],['filterGrade','filterClass'],
    ['cssGradeSelect','cssClassSelect'],['casGradeSelect','casClassSelect'],['grade','classNo'],
    ['searchGrade','searchClass'],['selectGrade','selectClass'],['pp5fbGrade','pp5fbClass'],
    ['sgGrade','sgClass'],['grGrade','grClass'],['attGradeSelect','attRoomSelect']]);
  const startedGrades=new WeakSet(), helperStartedGrades=new WeakSet(), loadedRooms=new WeakSet();
  let uiContext=null, uiPending=false;
  function selectReportRoom(page) {
    if (!['report_card_generator','report_card_scores'].includes(page)) return;
    const year=text(global.document?.getElementById?.('yearSelector')?.value)||uiContext.academicYear;
    const rooms=new Map(active(uiContext,year).filter((a)=>a.scope==='homeroom').map((a)=>[a.grade+'/'+a.room,a]));
    if (rooms.size!==1) return;
    const assigned=[...rooms.values()][0];
    // PP6 uses async room chips instead of grade/room selects. Reuse its existing click handler.
    const chips=global.document?.getElementById?.('quickChips')?.querySelectorAll('.chip')||[];
    const chip=[...chips].find((item)=>item.dataset.grade===assigned.grade && text(item.dataset.class)===text(assigned.room));
    if (chip && !chip.classList.contains('active')) chip.click();
  }
  function restrictGradeChoices() {
    if (!uiContext?.enabled || uiContext.role!=='teacher') return;
    const page=global.document?.body?.getAttribute('data-current-page') || global.AppNavigation?.currentPage;
    // โหมดการทำงาน (js/work-mode.js): ห้องในตัวเลือกเฉพาะงานของโหมดที่ครูเลือก
    const subjectRoom=SHARED_ASSESSMENT.has(page) && !!global.PP5AssessmentSubject;
    const assignments=active(uiContext).filter((a)=>(!HOMEROOM.has(page)||a.scope==='homeroom'||subjectRoom) && keepsMode(a,uiContext));
    const grades=new Set(assignments.map((a)=>a.grade));
    selectReportRoom(page);
    global.document?.querySelectorAll('#contentFrame select').forEach((select)=>{
      const before=select.value;
      const isGrade=(value)=>/^(อ\.[1-3]|ป\.[1-6]|ม\.[1-3])$/.test(text(value));
      for (const opt of [...select.options]) {
        if (isGrade(opt.value) && !grades.has(text(opt.value))) opt.remove();
      }
      // GradeClassHelper may restore a saved grade that was removed by scope.
      // Keep the visible selection valid, including pages with a blank placeholder.
      const allowed=[...select.options].filter((opt)=>isGrade(opt.value) && grades.has(text(opt.value)));
      if (allowed.length && !allowed.some((opt)=>opt.value===select.value)) select.value=allowed[0].value;
      const gradeChanged=select.value!==before;
      if (gradeChanged) select.dispatchEvent(new global.Event('change',{bubbles:true}));
      const roomId=ROOM_CONTROLS.get(select.id);
      const room=roomId && global.document?.getElementById?.(roomId);
      if (!room || room.tagName!=='SELECT' || !grades.has(text(select.value))) return;
      const rooms=new Set(assignments.filter((a)=>a.grade===text(select.value)).map((a)=>text(a.room)));
      const roomBefore=room.value;
      for (const opt of [...room.options]) {
        if (text(opt.value) && !rooms.has(text(opt.value))) opt.remove();
      }
      if (rooms.size!==1) return; // Multiple assigned rooms remain available for the teacher to switch.
      const target=[...rooms][0];
      const ready=!room.disabled && [...room.options].some((opt)=>text(opt.value)===target);
      // Start the page's own loader even when its grade was already selected. Wait for async room options.
      if (!startedGrades.has(select)) {
        startedGrades.add(select);
        if (room.dataset?.gcHelperBound==='1') helperStartedGrades.add(select);
        if (!gradeChanged && !ready) select.dispatchEvent(new global.Event('change',{bubbles:true}));
      }
      // GradeClassHelper is attached later by the SPA. Its room loader may not have existed on the first pass.
      if (room.dataset?.gcHelperBound==='1' && !helperStartedGrades.has(select)) {
        helperStartedGrades.add(select);
        if (!gradeChanged && !ready) select.dispatchEvent(new global.Event('change',{bubbles:true}));
      }
      if (!ready) return;
      room.value=target;
      if (roomBefore!==target || !loadedRooms.has(room)) {
        loadedRooms.add(room);
        room.dispatchEvent(new global.Event('change',{bubbles:true}));
      }
    });
    global.document?.querySelectorAll('.gc-quick-btn[data-grade]').forEach((btn)=>{
      const allowed=assignments.some((a)=>a.grade===btn.dataset.grade && a.room===btn.dataset.classNo);
      btn.hidden=!allowed; btn.style.display=allowed?'':'none';
    });
  }
  function scheduleGradeChoices() {
    if (uiPending) return;
    uiPending=true;
    Promise.resolve().then(()=>{uiPending=false;restrictGradeChoices();});
  }

  async function rpc(name, args) {
    const result = await global.PP5Data.client.rpc(name, args);
    if (result.error) throw Object.assign(new Error(result.error.message || 'อ่านสิทธิ์ไม่สำเร็จ'), result.error);
    return result.data;
  }
  async function context() {
    const state = await global.PP5Data.auth.requireUser();
    if (typeof global.PP5Data.client.rpc !== 'function') return { installed:false, enabled:false, role:state.profile.role };
    try { return await rpc('pp5_teacher_scope_context'); }
    catch (error) {
      if (missingRpc(error)) return { installed:false, enabled:false, role:state.profile.role };
      throw error; // Network/auth/permission failures must not silently fall back to broad access.
    }
  }
  const active = (ctx, year) => (ctx.assignments || []).filter((a) => a.active !== false && a.academic_year === (year || ctx.academicYear));
  const keepsMode = (a, ctx) => global.PP5WorkMode?.keeps?.(a, ctx) !== false;
  // ignoreMode: ใช้แยกข้อความ "สลับโหมดก่อน" ออกจาก "ไม่ได้รับสิทธิ์" — สิทธิ์จริงไม่ขึ้นกับโหมด
  function pageAllowed(page, ctx, ignoreMode) {
    if (PUBLIC.has(page)) return true;
    if (!ctx.enabled || ctx.role === 'admin') return true;
    if (ctx.role === 'parent') return PARENT.has(page);
    if (ctx.role !== 'teacher') return false;
    if (COMMON.has(page)) return true;
    const assignments = active(ctx).filter((a) => ignoreMode || keepsMode(a, ctx));
    if (SUBJECT.has(page)) return assignments.length > 0;
    if (SHARED_ASSESSMENT.has(page) && assignments.some((a) => a.scope === 'subject')) return true;
    return HOMEROOM.has(page) && assignments.some((a) => a.scope === 'homeroom');
  }
  async function authorizePage(page) {
    if (PUBLIC.has(page)) return;
    const ctx = await context();
    if (pageAllowed(page, ctx)) return;
    if (pageAllowed(page, ctx, true)) fail('หน้านี้เป็นงานของ'+(HOMEROOM.has(page)?'ครูประจำชั้น':'ครูประจำวิชา')+' — กดป้ายบทบาทมุมบนเพื่อสลับโหมดก่อน');
    fail('บัญชีนี้ไม่ได้รับสิทธิ์เปิดหน้านี้ กรุณาติดต่อผู้ดูแล');
  }
  function attendanceAcademicYear(calendarYear, zeroBasedMonth) {
    let year=Number(calendarYear);
    const month=Number(zeroBasedMonth);
    if (year>=2400) year-=543;
    if (!Number.isInteger(year) || year<=0 || !Number.isInteger(month) || month<0 || month>11) return '';
    // Match the attendance bridge: May starts the school year; January-April belong to the previous year.
    return text(year+(month>=4 ? 543 : 542));
  }
  async function authorizeMethod(name, args) {
    const ctx = await context();
    if (!ctx.enabled || ctx.role === 'admin') return ctx;
    if (ctx.role !== 'teacher') return ctx; // Parent bridge methods already verify their linked student IDs.
    if (ADMIN_METHODS.test(name)) fail('ส่วนนี้เป็นงานของผู้ดูแลระบบ');
    // ประเมินในวิชาที่สอน (หน้าประเมินเดิม + แถบเลือกวิชา): งานรายวิชาของวิชา/ห้อง/ภาคที่เลือก
    const chosen = SUBJECT_ASSESSMENT_METHODS.test(name) ? global.PP5AssessmentSubject : null;
    const subjectJob = chosen ? active(ctx).find((a) => a.scope === 'subject' && text(a.subject_id) === text(chosen.subjectId)
      && a.grade === text(chosen.grade) && text(a.room) === text(chosen.room)
      && (!Number(a.semester) || Number(a.semester) === Number(chosen.semester))) || null : null;
    if (chosen && !subjectJob && !(ctx.assignments || []).some((a) => a.scope === 'homeroom')) fail('คุณไม่ได้รับมอบหมายวิชานี้ในห้อง/ภาคที่เลือก');
    // Course score configuration is metadata used by subject teachers, not a student's assessment.
    if (name!=='getSubjectAssessmentConfig' && !subjectJob && HOMEROOM_METHODS.test(name) && !(ctx.assignments || []).some((a) => a.scope === 'homeroom')) {
      fail('งานนี้ต้องได้รับมอบหมายเป็นครูประจำชั้น');
    }
    // Explicit class arguments on exports/readers must not produce a misleading empty document.
    const gradeOnly = GRADE_ONLY_METHODS.has(name);
    const gradeArgument = text(args[GRADE_ONLY_METHODS.get(name)]);
    const requestedGrade = /^(อ\.[1-3]|ป\.[1-6]|ม\.[1-3])$/.test(gradeArgument) ? gradeArgument : '';
    const pair = gradeOnly ? -1 : args.findIndex((value, i) => /^(ป\.[1-6]|ม\.[1-3])$/.test(text(value)) && args[i+1] != null);
    const options = args.find((arg) => arg && typeof arg==='object' && (arg.academicYear || arg.year));
    let year = text(options?.academicYear || options?.year) || (pair>=0 && /^[0-9]{4}$/.test(text(args[pair+2])) ? text(args[pair+2]) : ctx.academicYear);
    if (name==='getSavedAttendance') {
      if (pair===0 && args[3]!=null) year=attendanceAcademicYear(args[2],args[3]);
      else if (pair===1) {
        const date=/^(\d{4})-(\d{2})-\d{2}$/.exec(text(args[0]));
        if (date) year=attendanceAcademicYear(date[1],Number(date[2])-1);
      }
      if (!year) fail('วันที่หรือเดือนสำหรับอ่านเวลาเรียนไม่ถูกต้อง');
    }
    if (gradeOnly && requestedGrade && !active(ctx,year).some((a)=>a.grade===requestedGrade)) {
      fail('คุณไม่ได้รับมอบหมายชั้นเรียนนี้');
    }
    if (pair >= 0 && !active(ctx,year).some((a) => a.grade === text(args[pair]) && a.room === text(args[pair+1])
      && (!HOMEROOM_METHODS.test(name) || a.scope==='homeroom' || a===subjectJob))) {
      fail('คุณไม่ได้รับมอบหมายห้องนี้');
    }
    if (/^(generateStudentReportPdfUnified|generateOnePageReportPdf|exportOnePageReport|generateParentReportCard|getStudentFullData)$/.test(name)) {
      const allowed = await rpc('pp5_teacher_scope_access', { p_table:'student_year_rosters',
        p_student:text(args[0]),p_year:year,p_subject:null,p_semester:null,p_write:false });
      if (!allowed) fail('คุณไม่ได้รับมอบหมายเป็นครูประจำชั้นของนักเรียนคนนี้');
    }
    return ctx;
  }
  async function admin() {
    const ctx = await context();
    if (ctx.role !== 'admin') fail('เฉพาะผู้ดูแลระบบ');
    if (!ctx.installed) fail('กรุณาติดตั้ง SQL สิทธิ์ครู (202610110027) ในฐานข้อมูลของโรงเรียนก่อน');
    return ctx;
  }
  async function replace(userId, year, assignments) {
    await admin();
    const result = await rpc('pp5_replace_teacher_access', { p_user:userId, p_year:year, p_assignments:assignments });
    if (!result?.success) fail('บันทึกการมอบหมายไม่สำเร็จ');
    return result;
  }
  async function enable(confirmation) {
    await admin();
    return rpc('pp5_enable_teacher_scope', { p_confirmation:confirmation });
  }
  function installGuards() {
    const server = global.GasServer;
    if (!server || server.__teacherScopeGuards) return;
    Object.defineProperty(server, '__teacherScopeGuards', { value:true });
    for (const [name, method] of Object.entries(server)) {
      if (typeof method !== 'function' || PUBLIC_AUTH_METHODS.has(name) || /^(verifyLogin|validateToken|logout|changePassword|resetPassword)/.test(name)) continue;
      server[name] = async function (...args) {
        const page=global.document?.body?.getAttribute('data-current-page') || global.AppNavigation?.currentPage;
        if (name==='getHomeroomTeacher' && ['report_card_generator','report_card_scores'].includes(page) && !args[3]) {
          const year=text(global.document?.getElementById?.('yearSelector')?.value);
          if (year) args[3]={academicYear:year}; // Keep the legacy auth token at argument 2.
        }
        if (name === 'include') await authorizePage(args[0]);
        else await authorizeMethod(name,args);
        return method.apply(this,args);
      };
    }
    const students = global.PP5Data.students;
    const originalList = students.list;
    students.list = async function (filters = {}) {
      const ctx = await context();
      if (!ctx.enabled || ctx.role !== 'teacher') return originalList.call(this,filters);
      const year = text(filters.academicYear) || ctx.academicYear;
      const page=global.document?.body?.getAttribute('data-current-page') || global.AppNavigation?.currentPage;
      // Base-table RLS exposes complete rows only to homeroom teachers.
      // Subject-only rows come from a minimal, caller-bound SQL function.
      const [base, minimal] = await Promise.all([originalList.call(this,filters), rpc('pp5_teacher_scope_roster',{ p_year:year })]);
      const byId = new Map(base.map((s) => [text(s.id),s]));
      for (const row of minimal || []) {
        if (HOMEROOM.has(page) && !(SHARED_ASSESSMENT.has(page) && global.PP5AssessmentSubject) && !active(ctx,year).some((a)=>a.scope==='homeroom' && a.grade===row.grade && a.room===row.room)) continue;
        if (filters.grade && row.grade !== filters.grade || filters.room && row.room !== text(filters.room)) continue;
        if (filters.active !== false && row.status !== (filters.status || 'active')) continue;
        if (filters.status && row.status !== filters.status) continue;
        if (!byId.has(text(row.id))) byId.set(text(row.id), { ...row, studentId:row.id, student_id:row.id,
          classNo:row.room, class_no:row.room, studentNumber:row.student_number,
          firstname:row.first_name, lastname:row.last_name, title:row.prefix,
          fullName:[row.prefix,row.first_name,row.last_name].filter(Boolean).join(' ').trim() });
      }
      return [...byId.values()];
    };
    const subjects = global.PP5Data.subjects;
    const originalSubjects = subjects.list;
    subjects.list = async function (grade) {
      const rows = await originalSubjects.call(this,grade);
      const ctx = await context();
      if (!ctx.enabled || ctx.role !== 'teacher') return rows;
      return rows.filter((s) => (ctx.assignments || []).some((a) => keepsMode(a, ctx) &&
        a.grade === s.grade && (a.scope === 'homeroom' || a.subject_id === s.id)));
    };
  }

  function shell() {
    return '<section class="container py-3" data-teacher-access><h2>มอบหมายงานและสิทธิ์ครู</h2>' +
      '<p>เลือกบัญชีครู แล้วกำหนดห้องและวิชาที่รับผิดชอบ ครูหนึ่งคนรับหลายงานได้</p>' +
      '<div data-access-content role="status">กำลังอ่านข้อมูล...</div></section>' +
      '<script>PP5Permissions.mount();</script>';
  }
  const option = (value,label) => '<option value="'+esc(value)+'">'+esc(label)+'</option>';
  async function allRows(table) {
    const rows = [];
    for (let start=0;;start+=1000) {
      let query=global.PP5Data.client.from(table).select('*');
      if (table==='student_year_rosters') query=query.order('academic_year').order('student_id');
      else query=query.order(table==='user_profiles'?'username':table==='academic_years'?'academic_year':'id');
      const result=await query.range(start,start+999);
      if (result.error) throw new Error(result.error.message);
      rows.push(...(result.data || []));
      if ((result.data || []).length<1000) return rows;
    }
  }
  async function mount() {
    const root = global.document?.querySelector('[data-teacher-access]');
    if (!root) return;
    const token = (root.__accessToken || 0)+1; root.__accessToken=token;
    const box = root.querySelector('[data-access-content]');
    try {
      const ctx = await admin();
      const year=text(root.dataset.accessYear)||ctx.academicYear;
      const [profiles,subjects,assignments,rosters,years,baseStudents] = await Promise.all([
        allRows('user_profiles'),allRows('subjects'),allRows('teacher_access_assignments'),
        allRows('student_year_rosters'),allRows('academic_years'),allRows('students')
      ]);
      if (!root.isConnected || root.__accessToken!==token) return;
      const teachers = profiles.filter((p) => p.role==='teacher' && p.active);
      const students=[...rosters,...baseStudents].filter((s)=>s.academic_year===year);
      const rooms = [...new Set(students.map((s) => text(s.grade)+'/'+text(s.room)))].sort();
      const current = assignments.filter((a) => a.active && a.academic_year===year);
      const missing = teachers.filter((p) => !assignments.some((a) => a.active && a.academic_year===ctx.academicYear && a.user_id===p.id));
      box.innerHTML = '<div class="alert '+(ctx.enabled?'alert-success':'alert-warning')+'">'+
        (ctx.enabled?'เปิดใช้สิทธิ์ตามการมอบหมายแล้ว':'ยังใช้สิทธิ์ครูแบบเดิม — ตรวจการมอบหมายและทดสอบก่อนเปิดใช้')+
        '<br>ปี '+esc(ctx.academicYear)+' · ครูยังไม่มีงาน '+missing.length+' คน'+
        (missing.length?'<br>'+missing.map((p)=>esc(p.display_name||p.username)).join(', '):'')+'</div>'+
        '<label class="mb-3">ปีที่มอบหมาย<select class="form-select" data-access-year>'+years.map((y)=>option(y.academic_year,y.academic_year+(y.is_locked?' (ปิดแล้ว: อ่านได้ตามสิทธิ์)':''))).join('')+'</select></label>'+
        '<form data-access-form><div class="row g-2">'+
        '<label class="col-md-4">บัญชีครู<select class="form-select" name="teacher" required>'+option('','เลือกครู')+
        teachers.map((p)=>option(p.id,(p.display_name||p.username)+' ('+p.username+')')).join('')+'</select></label>'+
        '<label class="col-md-4">ห้อง<select class="form-select" name="room" required>'+rooms.map((r)=>option(r,r)).join('')+'</select></label>'+
        '<label class="col-md-4">งาน<select class="form-select" name="scope">'+option('homeroom','ครูประจำชั้น')+option('subject','ครูประจำวิชา')+'</select></label>'+
        '<label class="col-md-8" data-subject-field hidden>วิชา<select class="form-select" name="subject"></select></label>'+
        '<label class="col-md-4" data-subject-field hidden>ภาคเรียน<select class="form-select" name="semester">'+option('0','ทั้งปี')+option('1','ภาค 1')+option('2','ภาค 2')+'</select></label></div>'+
        '<p class="mt-3">งานของครูที่เลือก — กดเพิ่มเพื่อจัดรายการ แล้วกดบันทึก</p><div data-access-draft></div>'+
        '<div class="d-flex gap-2 flex-wrap my-3"><button class="btn btn-outline-primary" type="button" data-access-add>เพิ่มงาน</button>'+
        '<button class="btn btn-primary" type="submit">บันทึกการมอบหมาย</button></div></form>'+
        '<div data-access-status role="status" class="my-2"></div>'+
        (!ctx.enabled?'<hr><p>เมื่อมอบหมายครูที่ใช้งานอยู่ครบทุกคนแล้ว เปิดใช้เพื่อให้ครูเห็นเฉพาะห้องและวิชาที่ได้รับมอบหมาย (ปิดกลับได้โดยผู้ดูแลฐานข้อมูล)</p>'+
          '<label>พิมพ์ ENABLE_TEACHER_SCOPE เพื่อยืนยัน<input class="form-control" data-access-confirm autocomplete="off"></label>'+
          '<button class="btn btn-warning mt-2" type="button" data-access-enable>เปิดใช้สิทธิ์ตามการมอบหมาย</button>':'');
      const form = box.querySelector('form'), status = box.querySelector('[data-access-status]');
      const yearSelect=box.querySelector('[data-access-year]');
      yearSelect.value=year;
      yearSelect.addEventListener('change',()=>{ root.dataset.accessYear=yearSelect.value; mount(); });
      let draft=[]; let busy=false;
      const field = (name)=>form.elements.namedItem(name);
      const notify = (message)=>{ status.textContent=message; };
      const renderDraft = ()=> {
        box.querySelector('[data-access-draft]').innerHTML=draft.length?'<ul class="list-group">'+draft.map((a,i)=>
          '<li class="list-group-item d-flex gap-2 align-items-center justify-content-between"><span>'+
          esc(a.grade+'/'+a.room)+' · '+esc(a.scope==='homeroom'?'ครูประจำชั้น':subjects.find((s)=>s.id===a.subject_id)?.name||a.subject_id)+
          (a.semester?' · ภาค '+a.semester:'')+'</span><button type="button" class="btn btn-sm btn-outline-danger" data-access-remove="'+i+'">เอาออก</button></li>').join('')+'</ul>':'<p>ยังไม่มีงาน</p>';
      };
      const sync = ()=> {
        const grade=field('room').value.split('/')[0];
        const list=subjects.filter((s)=>s.grade===grade);
        const previous=field('subject').value;
        field('subject').innerHTML=list.map((s)=>option(s.id,s.code+' '+s.name+(s.semester?' · ภาค '+s.semester:''))).join('');
        if (list.some((s)=>s.id===previous)) field('subject').value=previous;
        const selected=list.find((s)=>s.id===field('subject').value);
        field('semester').disabled=!!selected?.semester;
        if (selected?.semester) field('semester').value=String(selected.semester);
        box.querySelectorAll('[data-subject-field]').forEach((e)=>e.hidden=field('scope').value!=='subject');
      };
      form.addEventListener('change',(e)=>{
        if (busy) return;
        if (e.target===field('teacher')) {
          draft=current.filter((a)=>a.user_id===field('teacher').value).map(({scope,grade,room,subject_id,semester})=>({scope,grade,room,subject_id,semester}));
          renderDraft();
        }
        sync();
      });
      box.addEventListener('click',async (event)=>{
        if (busy) return;
        const remove=event.target.closest('[data-access-remove]');
        if (remove) { draft.splice(Number(remove.dataset.accessRemove),1); renderDraft(); }
        if (event.target.closest('[data-access-add]')) {
          if (!field('teacher').value) { notify('เลือกบัญชีครูก่อน'); return; }
          const [grade,room]=field('room').value.split('/');
          const item={scope:field('scope').value,grade,room,subject_id:field('scope').value==='subject'?field('subject').value:null,
            semester:field('scope').value==='subject'?Number(field('semester').value):0};
          if (!draft.some((a)=>JSON.stringify(a)===JSON.stringify(item))) draft.push(item);
          renderDraft(); notify('จัดรายการแล้ว — ยังไม่บันทึก');
        }
        if (event.target.closest('[data-access-enable]')) {
          busy=true;
          try { await enable(box.querySelector('[data-access-confirm]').value); global.location.reload(); }
          catch (error) { notify(error.message); }
          finally { busy=false; }
        }
      });
      form.addEventListener('submit',async (event)=>{
        event.preventDefault(); if (busy) return; busy=true;
        form.querySelectorAll('button,select').forEach((e)=>e.disabled=true);
        yearSelect.disabled=true;
        try { await replace(field('teacher').value,year,draft); await mount(); }
        catch (error) { notify(error.message); }
        finally { busy=false; yearSelect.disabled=false; form.querySelectorAll('button,select').forEach((e)=>e.disabled=false); sync(); }
      });
      sync(); renderDraft();
    } catch (error) {
      if (root.isConnected && root.__accessToken===token) box.innerHTML='<p class="text-danger" role="alert">'+esc(error.message)+'</p>';
    }
  }
  async function refreshMenu() {
    try {
      const ctx=await context();
      uiContext=ctx;
      global.PP5WorkMode?.apply?.(ctx);
      if (!ctx.enabled) return;
      global.document?.querySelectorAll('.nav-item[data-page], .hub-card[data-page]').forEach((item)=>{
        item.hidden=!pageAllowed(item.dataset.page,ctx);
        item.style.display=item.hidden?'none':'';
      });
      if (typeof global.renderMobileQuickMenu_==='function') global.renderMobileQuickMenu_();
      restrictGradeChoices();
    } catch (_) { /* include() and database policies still deny requests */ }
  }
  global.PP5Permissions = { context,pageAllowed,authorizePage,authorizeMethod,replace,enable,mount,refreshMenu,installGuards };
  global.GAS_PAGES.teacher_access = shell();
  installGuards();
  global.document?.addEventListener('pp5:page-rendered',refreshMenu);
  global.document?.addEventListener('change',(event)=>{
    if (event.target?.tagName==='SELECT') scheduleGradeChoices();
  });
  if (global.MutationObserver && global.document?.body) {
    new global.MutationObserver(scheduleGradeChoices).observe(global.document.body,{childList:true,subtree:true});
  }
})(window);
