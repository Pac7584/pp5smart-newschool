// คู่มือติดตั้ง PP5Smart ให้โรงเรียนอื่น (owner 2026-10-12: "คู่มือติดตั้งอยู่ในโรงเรียนจริงให้ด้วย เดี๋ยวผมลืม")
// เมนู ตั้งค่าและดูแลระบบ > คู่มือติดตั้งโรงเรียนอื่น (ผู้ดูแลทุกคน) เปิดหน้าต่างสรุปหลักการ ขั้นตอน และลิงก์ไฟล์บน GitHub
// เนื้อหาคงที่ทั้งหมด ไม่อ่านข้อมูลโรงเรียนหรือฐานข้อมูล  รายละเอียดเต็มอยู่ใน docs/ติดตั้ง.md ของชุดแจก
(function initPP5InstallGuide(global) {
  'use strict';

  const REPO = 'https://github.com/Pac7584/pp5smart-newschool';
  const LINKS = {
    repo: REPO,
    guide: `${REPO}/blob/main/docs/${encodeURIComponent('ติดตั้ง.md')}`,
    installSql: `${REPO}/blob/main/supabase/install/install.sql`,
    adminUsers: `${REPO}/blob/main/supabase/functions/admin-users/index.ts`,
    catalog: `${REPO}/tree/main/catalog`,
    teacherPermissions: `${REPO}/blob/main/docs/TEACHER_PERMISSIONS.md`
  };

  const link = (href, label) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
  const list = (items, ordered) => `<${ordered ? 'ol' : 'ul'} style="margin:4px 0 0;padding-left:1.4em;line-height:1.7">`
    + items.map((item) => `<li>${item}</li>`).join('') + `</${ordered ? 'ol' : 'ul'}>`;
  const card = (title, body, tone) => `<section style="border:1px solid ${tone || 'var(--gray-200,#e5e7eb)'};border-radius:12px;padding:12px 14px;margin:0 0 12px">`
    + `<h6 style="margin:0 0 4px;font-weight:700">${title}</h6>${body}</section>`;

  function html() {
    return '<div class="pp5-install-guide" style="font-size:14px">'
      + card('หลักคิด 4 ข้อ', list([
        '<b>แยกกันเด็ดขาด</b>: แต่ละโรงเรียนมี Supabase, GitHub และ Vercel <b>ของตัวเอง</b> ข้อมูลไม่ปนกัน',
        '<b>โรงเรียนเป็นเจ้าของ</b>: สมัครทุกบัญชีด้วยอีเมลของโรงเรียน แล้วมอบรหัสผ่านให้โรงเรียนเก็บเอง',
        '<b>เริ่มจากศูนย์</b>: ฐานข้อมูลว่าง ไม่มีข้อมูลโรงเรียนนี้ติดไป ห้ามใช้เว็บทดสอบหรือฐานข้อมูลของโรงเรียนนี้',
        '<b>ฟรีทั้งหมด</b>: ใช้แผนฟรีของทุกบริการ (Supabase ฟรีได้ 2 โปรเจกต์ต่อ 1 บัญชี)'
      ]))
      + card('ให้โรงเรียนเตรียมก่อน', list([
        'อีเมลของโรงเรียน 1 อัน (Gmail ก็ได้)',
        'ไฟล์รายชื่อนักเรียนจาก DMC',
        'รายชื่อครู และห้อง/วิชาที่แต่ละคนสอน',
        'ชื่อโรงเรียน สังกัด ชื่อผู้อำนวยการ โลโก้ และระดับชั้นที่เปิดสอน (ประถม / ถึง ม.3)'
      ]))
      + card('ส่วนที่ 1 — ฐานข้อมูล (Supabase)', list([
        'สมัคร supabase.com แล้วสร้างโปรเจกต์ใหม่',
        `SQL Editor → วาง ${link(LINKS.installSql, 'install.sql')} → Run (ติดตั้งทั้งหมดครั้งเดียว ใช้กับฐานข้อมูลว่างเท่านั้น)`,
        'ปิดการสมัครสมาชิกเอง (Authentication > Sign In / Providers)',
        'Authentication > Users > Add user (ติ๊ก Auto Confirm User) สร้างผู้ดูแลคนแรก แล้วรัน <code>select public.pp5_install_make_admin(\'อีเมลผู้ดูแล\');</code>',
        `ติดตั้ง Edge Function ${link(LINKS.adminUsers, 'admin-users')} (ใช้สร้างบัญชีครู) และปิด Verify JWT`,
        'คัดลอก Project URL และ anon (publishable) key เก็บไว้'
      ], true))
      + card('ส่วนที่ 2 — เว็บไซต์ (GitHub + Vercel)', list([
        `สมัคร GitHub → เปิด ${link(LINKS.repo, 'ชุดแจก')} → กด <b>Fork</b>`,
        'ใน repo ที่ fork แก้ไฟล์ <code>js/app-config.js</code> ใส่ URL และ key จากส่วนที่ 1',
        'สมัคร Vercel (Continue with GitHub) → Add New → Project → Import repo ที่ fork → Deploy'
      ], true))
      + card('ส่วนที่ 3 — เริ่มใช้งาน (ในโปรแกรม)', list([
        'เข้าระบบด้วยผู้ดูแล → ตั้งค่าโรงเรียน และระดับชั้นที่เปิดสอน',
        `นำเข้ารายวิชาจาก ${link(LINKS.catalog, 'ไฟล์ต้นแบบ')} (ม.1–ม.3 เป็นฉบับร่าง ให้ครูวิชาการตรวจก่อน)`,
        'นำเข้านักเรียนจากไฟล์ DMC',
        'สร้างบัญชีครู และตั้งครูประจำชั้น',
        `(ไม่บังคับ) เปิดสิทธิ์ครูให้เห็นเฉพาะห้องตัวเอง ตาม ${link(LINKS.teacherPermissions, 'คู่มือสิทธิ์ครู')}`
      ], true))
      + card('ก่อนกลับ บอกโรงเรียน', list([
        'กด <b>สำรองตอนนี้</b> เป็นประจำ (แผนฟรีไม่มีสำรองอัตโนมัติ)',
        '<b>ปิดเทอม</b>: เข้าเว็บสัปดาห์ละครั้ง ไม่เช่นนั้นฐานข้อมูลจะหยุดพัก (กด Restore ใน Supabase แก้ได้)',
        '<b>เวอร์ชันใหม่</b>: ที่ repo ของโรงเรียนกด Sync fork → <b>Update branch</b> (ห้ามกด Discard)',
        '<b>ครูใหม่ / เปลี่ยนปีการศึกษา</b>: มอบหมายห้องในหน้า "มอบหมายงานครู" (ถ้าเปิดสิทธิ์ครูไว้)'
      ]), '#fcd34d')
      + `<p style="margin:4px 0 0;color:var(--gray-500,#6b7280)">คู่มือฉบับเต็ม (ประมาณ 45–60 นาที): ${link(LINKS.guide, 'docs/ติดตั้ง.md')}`
      + ` · ลิงก์ส่งให้โรงเรียนอื่น: ${link(LINKS.repo, 'github.com/Pac7584/pp5smart-newschool')}</p>`
      + '</div>';
  }

  function open() {
    if (typeof global.openModal === 'function') global.openModal('คู่มือติดตั้ง PP5Smart ให้โรงเรียนอื่น', html());
  }

  global.PP5InstallGuide = { open, html, LINKS };
})(window);
