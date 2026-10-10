// แถบหัวหน้า (owner 2026-10-07: "อยากได้ตรงไตเติลสวยเหมือนหน้าหลัก ไม่เอาทื่อ ๆ"):
// ใช้หน้าตาเดียวกับแบนเนอร์หน้าหลัก (.hub-welcome.pp5-school-banner ใน .pp5-sb ของ css/school-branding.css)
// รูปพื้นหลังโรงเรียน + สีธีม แต่ตรงกลางเป็นไอคอนและชื่อของหน้านั้น  หัวเดิมของหน้าซ่อน (ปุ่ม/ช่องเลือกในหน้ายังอยู่)
// เปิดทีละหน้าผ่าน PAGES: hide = หัวเดิมที่ซ้ำ (ซ่อนเฉพาะส่วนชื่อ ไม่แตะแถวควบคุม)
// วางแถบไว้ "ในกล่องเนื้อหาของหน้า" (owner: เดิมกว้างเต็มกรอบนอก ไม่สมดุลกับการ์ดของหน้า)
// anchor = วางก่อน element นี้ (ไม่ระบุ = ก่อนหัวเดิม) ใช้เมื่อหัวเดิมอยู่ในการ์ดหรือในแถวควบคุม
(function initPageBanner(global) {
  'use strict';

  const PAGES = {
    attendance_daily: { icon: 'bi-calendar2-check-fill', title: 'เช็คชื่อรายวัน', sub: 'บันทึกการมาเรียนของนักเรียนรายวัน', hide: '.attendance-page .header-card' },
    score_table_viewer: { icon: 'bi-table', title: 'บันทึกคะแนน', sub: 'กรอกคะแนนรายวิชา ภาคเรียนที่ 1 และ 2', hide: '.score-entry-compact-header > .compact-title', anchor: '.score-entry-compact-header' },
    characteristic_assessment: { icon: 'bi-heart-fill', title: 'ประเมินคุณลักษณะอันพึงประสงค์', sub: 'คุณลักษณะอันพึงประสงค์ 8 ประการ', hide: '.rtw-page .rtw-header', anchor: '.rtw-page > .rtw-card' },
    competency_assessment: { icon: 'bi-stars', title: 'ประเมินสมรรถนะสำคัญของผู้เรียน', sub: 'สมรรถนะสำคัญ 5 ด้าน', hide: '.card > .card-header.bg-primary', anchor: '.container-fluid > .row' },
    activity_assessment: { icon: 'bi-people-fill', title: 'ประเมินกิจกรรมพัฒนาผู้เรียน', sub: 'แนะแนว · ลูกเสือ-เนตรนารี · ชุมนุม · เพื่อสังคม', hide: '.rtw-page .rtw-header', anchor: '.rtw-page > .rtw-card' },
    read_think_write_form: { icon: 'bi-clipboard2-check-fill', title: 'อ่าน คิดวิเคราะห์ และเขียน', sub: 'ประเมินรายวิชา 8 กลุ่มสาระ (ปพ.5)', hide: '.rtw-page > .card:first-child .row > .col-md-4:first-child', anchor: '.rtw-page > .card:first-child' },
    rtw5_assessment: { icon: 'bi-book-half', title: 'อ่าน คิดวิเคราะห์ เขียน', sub: '5 เกณฑ์ (สำหรับ ปพ.6)', hide: '.rtw-page > .card:first-child .row > .col-md-4:first-child', anchor: '.rtw-page > .card:first-child' },
    report_card_generator: { icon: 'bi-printer-fill', title: 'พิมพ์รายงาน ปพ.6', sub: 'รายงานผลพัฒนาคุณภาพผู้เรียนรายบุคคล (PDF)', hide: '.page-wrap > .page-header' },
    dashboard: { icon: 'bi-bar-chart-line-fill', title: 'ภาพรวมโรงเรียน', sub: 'นักเรียน การเช็คชื่อวันนี้ และงานที่ต้องติดตาม', hide: '.container-fluid > .justify-content-between > .d-flex.align-items-center', anchor: '.container-fluid > .justify-content-between' },
    // รอบ 2 (owner 2026-10-08): หน้าที่ใช้บ่อยที่เหลือ  ไม่ใส่หน้าที่หัวเดิมมีปุ่ม/ช่องกรอกอยู่ข้างใน
    // (ตรวจ ปพ.5, ส่งงาน/อนุมัติ, น้ำหนัก-ส่วนสูง 2 หน้า) เพราะซ่อนหัวแล้วปุ่มจะหายไปด้วย
    attendance_monthly: { icon: 'bi-calendar3', title: 'บันทึกเวลาเรียนรายเดือน', sub: 'สรุปการมาเรียนของนักเรียนแต่ละเดือน', hide: '.att-header-card' },
    semester_attendance_summary: { icon: 'bi-bar-chart-steps', title: 'สรุปการมาเรียน', sub: 'รายงานเวลาเรียนรายภาคเรียนและรายปี', hide: '.header-main' },
    student_scores_summary: { icon: 'bi-trophy-fill', title: 'สรุปผลการเรียนรายชั้น', sub: 'คะแนนและเกรดทุกวิชาของทั้งห้อง', hide: '.container-wrapper > .page-header' },
    class_assessment_summary: { icon: 'bi-clipboard-data-fill', title: 'สรุปการประเมินรายชั้น', sub: 'คุณลักษณะ สมรรถนะ อ่านคิดเขียน และกิจกรรมของทั้งห้อง', hide: '.cas-header' },
    pp5_full_book: { icon: 'bi-journal-bookmark-fill', title: 'ปพ.5 รวมเล่ม', sub: 'พิมพ์แบบรายงานผลการพัฒนาคุณภาพผู้เรียนทั้งเล่ม', hide: '.pp5fb-header' },
    export_reports: { icon: 'bi-file-earmark-arrow-down-fill', title: 'ศูนย์รวมส่งออกรายงาน', sub: 'เลือกรายงานที่ต้องการพิมพ์หรือดาวน์โหลด', hide: '.er-header' },
    holiday_form: { icon: 'bi-calendar-x-fill', title: 'จัดการวันหยุดประจำปี', sub: 'วันหยุดราชการและวันหยุดของโรงเรียน', hide: '.card > .card-header.text-center', anchor: '.container.py-5 > .card' },
    teacher_comment_form: { icon: 'bi-chat-heart-fill', title: 'ความคิดเห็นครูที่ปรึกษา', sub: 'บันทึกความเห็นรายบุคคลสำหรับรายงาน', hide: '.tc-topbar' },
    subjectManager: { icon: 'bi-journal-text', title: 'จัดการรายวิชา', sub: 'รายวิชา รหัสวิชา และคะแนนเต็มของแต่ละชั้น', hide: '#subjectsPage > h4.text-primary' },
    new_settings_editor: { icon: 'bi-gear-fill', title: 'ตั้งค่าระบบกลาง', sub: 'ข้อมูลโรงเรียน ปีการศึกษา การพิมพ์ และหน้าตาโรงเรียน', hide: '.page-header.mb-4' },
    export_pdf_page: { icon: 'bi-person-lines-fill', title: 'ส่งออกรายชื่อนักเรียน', sub: 'รายชื่อนักเรียนเป็นไฟล์ PDF หรือ Excel', hide: '.page-wrapper > .page-header' },
    admin_panel: { icon: 'bi-person-gear', title: 'จัดการผู้ใช้', sub: 'บัญชีครู ผู้ดูแล และสิทธิ์การใช้งาน', hide: '.main-container > .text-center.mb-6' },
    parent_info_report: { icon: 'bi-house-heart-fill', title: 'จัดการข้อมูลผู้ปกครอง', sub: 'ข้อมูลผู้ปกครองและรายงานข้อมูลครอบครัว', hide: '.container-fluid > .page-header' },
    studentList: { icon: 'bi-mortarboard-fill', title: 'จัดการข้อมูลนักเรียน', sub: 'รายชื่อนักเรียน แก้ไขข้อมูล และส่งออกรายงาน', hide: '.pp5-student-manager > .card > .card-header', anchor: '.pp5-student-manager > .card' }
  };

  const txt = (value) => (value === null || value === undefined ? '' : String(value));
  const rgba = (hex, alpha) => {
    const m = txt(hex).match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    return m ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})` : '';
  };

  function currentPage(frame) {
    return txt(global.AppNavigation?.currentPage || frame?.getAttribute('data-current-page') || global.document.body.getAttribute('data-current-page'));
  }

  function build(config) {
    const wrap = global.document.createElement('div');
    wrap.className = 'pp5-sb pp5-page-banner-wrap';
    wrap.id = 'pp5PageBanner';
    wrap.innerHTML = '<div class="hub-welcome pp5-school-banner pp5-page-banner">'
      + '<div class="pp5-pb-icon" aria-hidden="true"><i class="bi"></i></div>'
      + '<div class="hub-welcome-text"><h1 class="pp5-pb-title"></h1><div class="pp5-pb-sub"></div><div class="pp5-pb-school"></div></div>'
      + '</div>';
    wrap.querySelector('.pp5-pb-icon i').className = `bi ${config.icon}`;
    wrap.querySelector('.pp5-pb-title').textContent = config.title;
    wrap.querySelector('.pp5-pb-sub').textContent = config.sub;
    return wrap;
  }

  // รูปพื้นหลังและสีทับเหมือน fillBanner ของหน้าหลัก (ใช้ค่าที่โหลดไว้แล้วของ school-branding)
  async function paint(banner) {
    const sb = global.PP5SchoolBranding;
    if (!sb?.refresh) return;
    let settings = null;
    try { settings = await sb.refresh(false); } catch (_) { settings = null; }
    if (!settings || !banner.isConnected) return;
    const box = banner.querySelector('.pp5-page-banner');
    const b = sb.normalize(settings?.settings_json?.branding);
    const photo = b.bannerPath ? sb.bannerUrl(b.bannerPath) : '';
    box.classList.toggle('has-photo', !!photo);
    if (photo) {
      const p = global.PP5UserTheme?.palette?.() || sb.palette(b);
      box.style.setProperty('--pp5-banner-img', `url("${photo}")`);
      box.style.setProperty('--pp5-banner-pos', `center ${b.bannerFocus}%`);
      box.style.setProperty('--pp5-banner-ov1', rgba(p.primary, 0.9));
      box.style.setProperty('--pp5-banner-ov2', rgba(p.light, 0.55));
      box.style.setProperty('--pp5-banner-ov3', rgba(p.accent, 0.12));
    }
    const name = txt(settings.schoolName || settings.school_name).trim();
    const year = txt(settings.academicYear).trim();
    const school = banner.querySelector('.pp5-pb-school');
    school.textContent = [name, year ? `ปีการศึกษา ${year}` : ''].filter(Boolean).join(' · ');
    school.hidden = !school.textContent;
  }

  // Pages that reuse another page's template under their own id (not in gas-pages themselves)
  const ALIASES = {
    report_card_scores: { ...PAGES.report_card_generator, icon: 'bi-journal-text', title: 'พิมพ์ ปพ.6 แบบมีคะแนน', sub: 'ปพ.6 ที่มีช่องคะแนนที่ได้ของแต่ละวิชา (PDF)' }
  };

  function apply(frame) {
    const page = currentPage(frame);
    const config = PAGES[page] || ALIASES[page];
    const existing = frame.querySelector('#pp5PageBanner');
    if (!config) { existing?.remove(); return; }
    if (existing && existing.dataset.page === page) return;
    existing?.remove();
    // หัวเดิมยังไม่ขึ้น (หน้ากำลังโหลด) = รอรอบถัดไป ไม่ใส่แถบซ้อนบนหน้าเปล่า
    const original = frame.querySelector(config.hide);
    if (!original) return;
    original.classList.add('pp5-pb-hidden');
    const banner = build(config);
    banner.dataset.page = page;
    const anchor = (config.anchor && frame.querySelector(config.anchor)) || original;
    anchor.before(banner);
    paint(banner);
  }

  function watch() {
    const frame = global.document.getElementById('contentFrame');
    if (!frame || frame.__pp5PageBanner) return;
    frame.__pp5PageBanner = true;
    let timer = null;
    const run = () => { clearTimeout(timer); timer = setTimeout(() => apply(frame), 30); };
    if (typeof MutationObserver === 'function') new MutationObserver(run).observe(frame, { childList: true });
    run();
  }

  if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();

  global.PP5PageBanner = { PAGES, apply, build };
})(window);
