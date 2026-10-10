// Metadata snapshots are separate from editable academic records and the current year.
(function (global) {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function call(name, args) {
    const user = await global.PP5Data.auth.requireUser();
    if (user.profile?.role !== 'admin') throw new Error('สำเนาข้อมูลประจำปีสำหรับผู้ดูแลระบบ');
    const {data,error} = await global.dbClient.rpc(name,args);
    if (error) throw new Error(['PGRST202','42883'].includes(error.code)
      ? 'ยังไม่ได้ติดตั้งระบบเก็บสำเนาข้อมูลประจำปีในฐานข้อมูล' : error.message);
    return data;
  }
  function yearArg(year) {
    if (!/^\d{4}$/.test(String(year))) throw new Error('ปีการศึกษาไม่ถูกต้อง');
    return {p_year:String(year)};
  }
  const preview = (year) => call('pp5_preview_year_report_context',yearArg(year));
  const load = (year) => call('pp5_get_year_report_context',yearArg(year));
  async function capture(year, revision, reason) {
    if (typeof reason !== 'string' || reason.trim().length < 5) throw new Error('กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร');
    if (!revision) throw new Error('กรุณาตรวจรายการก่อนบันทึก');
    return call('pp5_capture_year_report_context',{...yearArg(year),p_expected_revision:revision,p_reason:reason.trim()});
  }
  async function render(container, year) {
    if (!container) return;
    const token = String(year) + ':' + Math.random();
    container.dataset.contextToken = token;
    container.innerHTML = '<div class="card p-3 mb-3"><h5>สำเนาข้อมูลประจำปี</h5><p role="status">กำลังตรวจสำเนา...</p></div>';
    try {
      const info = await preview(year);
      if (container.dataset.contextToken !== token || !container.isConnected) return;
      const snapshot = info.snapshot;
      const counts = info.counts;
      container.innerHTML = `<div class="card p-3 mb-3"><h5>สำเนาข้อมูลประจำปี ${esc(year)}</h5><p>${snapshot ? `เก็บล่าสุด ${esc(new Date(snapshot.captured_at).toLocaleString('th-TH'))} · ${esc(snapshot.reason)}` : 'ยังไม่มีสำเนาข้อมูลโรงเรียน รายวิชา ครู และรายละเอียดนักเรียนของปีนี้'}</p>${info.can_capture ? `<p class="small text-muted">ข้อมูลที่จะเก็บ: ทะเบียน ${esc(counts?.rosters)} คน · รายวิชา ${esc(counts?.subjects)} · ครู ${esc(counts?.teachers)} · ครูประจำชั้น ${esc(counts?.assignments)} · รายละเอียดนักเรียน ${esc(counts?.details)} · ชุดลายเซ็น ${esc(counts?.signatures)}<br>เก็บชื่อโรงเรียน ผู้ลงนาม ปฏิทิน และข้อมูลประกอบตามที่มีอยู่ ณ เวลาบันทึก สำเนานี้ยังไม่รับรองความครบถ้วนของคะแนนหรือเอกสารทางการ</p><p>${info.changed_since_capture ? 'ยังไม่มีสำเนาหรือข้อมูลเปลี่ยนหลังเก็บครั้งล่าสุด' : 'ข้อมูลตรงกับสำเนาล่าสุด'}</p><button class="btn btn-outline-primary align-self-start" data-capture>ตรวจและเก็บสำเนาปีปัจจุบัน</button>` : '<p class="small text-muted">ปีเก่าที่ไม่มีสำเนาต้องนำหลักฐานของปีนั้นมาตรวจสอบก่อน ระบบไม่สร้างสำเนาปีเก่าจากข้อมูลปัจจุบัน</p>'}<div data-message role="status" class="mt-2"></div></div>`;
      container.querySelector('[data-capture]')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          // Refresh preview immediately before showing the concrete confirmation.
          const fresh = await preview(year);
          if (container.dataset.contextToken !== token || !container.isConnected) return;
          if (!fresh.can_capture) throw new Error('ปีปัจจุบันเปลี่ยนแล้ว กรุณาเลือกปีใหม่');
          const reason = global.prompt(`เก็บสำเนาปี ${year}: ทะเบียน ${fresh.counts.rosters} คน รายวิชา ${fresh.counts.subjects}\nสำเนาใหม่จะรักษาฉบับก่อนหน้าไว้ ไม่เปลี่ยนคะแนนหรือทะเบียน\nกรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร`);
          if (reason === null) return;
          await capture(year,fresh.revision,reason);
          if (container.dataset.contextToken === token) await render(container,year);
        } catch (error) {
          if (container.dataset.contextToken === token) container.querySelector('[data-message]').textContent = error.message;
        } finally { button.disabled = false; }
      });
    } catch (error) {
      if (container.dataset.contextToken === token) container.innerHTML = `<div class="alert alert-warning">${esc(error.message)}</div>`;
    }
  }
  async function report(year) {
    const snapshot=await load(year), payload=snapshot.payload;
    if (!payload || String(payload.academic_year)!==String(year) || payload.version!==1) throw new Error('สำเนาข้อมูลไม่ตรงปีรายงาน');
    const rosters=[];
    for(let offset=0;;offset+=500){
      const result=await global.dbClient.from('student_year_rosters').select('*').eq('academic_year',String(year)).order('student_id').range(offset,offset+499);
      if(result.error) throw new Error(result.error.message);
      rosters.push(...result.data);if(result.data.length<500) break;
    }
    const studentsById=new Map(payload.students.map(s=>[String(s.id),s]));
    const detailsById=new Map(payload.details.map(s=>[String(s.student_id),s]));
    const students=rosters.map(r=>{
      const s={...studentsById.get(String(r.student_id)),...detailsById.get(String(r.student_id)),...r,id:r.student_id};
      return {...s,studentId:s.id,studentNumber:s.student_number,classNo:s.room,title:s.prefix,firstName:s.first_name,lastName:s.last_name,fullName:[s.prefix,s.first_name,s.last_name].filter(Boolean).join(' '),nationalId:s.national_id,idCard:s.national_id,birthDate:s.birth_date};
    });
    const signature=payload.signatures.find(s=>s.settings_id===payload.school.id)||payload.signatures[0];
    return {...payload,snapshot,school:{...payload.school,academic_year:String(year)},allStudents:students,
      students:(grade,room)=>students.filter(s=>(!grade||s.grade===grade)&&(!room||String(s.room)===String(room))).sort((a,b)=>(a.student_number??9999)-(b.student_number??9999)||String(a.id).localeCompare(String(b.id))),
      subjects:(grade)=>payload.subjects.filter(s=>!grade||s.grade===grade).map(s=>({...s,subjectName:s.name,subjectCode:s.code,fullScore:s.full_score,passScore:s.pass_score})),
      signatures:{...(signature?.signatures||{}),includeSignatures:signature?.include_signatures!==false},
      metadataComplete:!!(payload.school.school_name&&payload.school.director_name&&payload.school.academic_head)
    };
  }
  global.PP5YearContext = {preview,load,capture,render,report};
})(window);
