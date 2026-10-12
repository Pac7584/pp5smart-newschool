// ตัวช่วยติดตั้ง PP5Smart ให้โรงเรียนอื่น (owner 2026-10-12: "คู่มือติดตั้งอยู่ในโรงเรียนจริงให้ด้วย เดี๋ยวผมลืม"
// และ "ทำแบบ step by step ... เหมือนติดตั้ง windows")
// เมนู ตั้งค่าและดูแลระบบ > คู่มือติดตั้งโรงเรียนอื่น (ผู้ดูแลทุกคน) เปิดหน้าต่างทีละขั้น 12 หน้า มีปุ่ม ถัดไป / ย้อนกลับ
// - ช่องกรอก: ชื่อโรงเรียน อีเมล ระดับชั้น Project URL / anon key (ไม่มีช่องรหัสผ่านใด ๆ)
// - ระบบเตรียมสิ่งที่ต้องวางให้: install.sql และ admin-users (ดึงจาก GitHub ชุดแจก), คำสั่งตั้งผู้ดูแล, app-config.js
// - ข้อมูลที่กรอกเก็บเฉพาะเบราว์เซอร์เครื่องนี้ (localStorage) ไม่ส่งไปที่ใด ไม่อ่านข้อมูลโรงเรียนหรือฐานข้อมูลนี้
// สมัครบัญชี Supabase / GitHub / Vercel ต้องทำเองทุกครั้ง (ตัวช่วยบอกว่ากดอะไร)
(function initPP5InstallGuide(global) {
  'use strict';

  const REPO = 'https://github.com/Pac7584/pp5smart-newschool';
  const RAW = 'https://raw.githubusercontent.com/Pac7584/pp5smart-newschool/main';
  const LINKS = {
    repo: REPO,
    guide: `${REPO}/blob/main/docs/${encodeURIComponent('ติดตั้ง.md')}`,
    installSql: `${REPO}/blob/main/supabase/install/install.sql`,
    adminUsers: `${REPO}/blob/main/supabase/functions/admin-users/index.ts`,
    catalog: `${REPO}/tree/main/catalog`,
    catalogPrimary: `${REPO}/raw/main/catalog/${encodeURIComponent('รายวิชาต้นแบบ_ป1-ป6.xlsx')}`,
    catalogSecondary: `${REPO}/raw/main/catalog/${encodeURIComponent('รายวิชา_ม1-ม3_ฉบับร่าง.xlsx')}`,
    teacherPermissions: `${REPO}/blob/main/docs/TEACHER_PERMISSIONS.md`
  };
  const RAW_FILES = {
    installSql: `${RAW}/supabase/install/install.sql`,
    adminUsers: `${RAW}/supabase/functions/admin-users/index.ts`
  };
  const STORE_KEY = 'pp5_install_wizard_v1';
  const TITLE = 'ตัวช่วยติดตั้ง PP5Smart ให้โรงเรียนอื่น';

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const link = (href, label) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
  const list = (items, ordered) => `<${ordered ? 'ol' : 'ul'} style="margin:4px 0 0;padding-left:1.4em;line-height:1.75">`
    + items.map((item) => `<li>${item}</li>`).join('') + `</${ordered ? 'ol' : 'ul'}>`;
  const card = (title, body, tone) => `<section style="border:1px solid ${tone || 'var(--gray-200,#e5e7eb)'};border-radius:12px;padding:12px 14px;margin:0 0 12px">`
    + `<h6 style="margin:0 0 4px;font-weight:700">${title}</h6>${body}</section>`;
  const note = (text, tone) => `<div style="margin:10px 0 0;padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.6;`
    + `background:${tone === 'warn' ? 'rgba(245,158,11,.12)' : 'rgba(59,130,246,.10)'}">${text}</div>`;

  // ---------- one-page summary (button "ดูสรุปหน้าเดียว") ----------
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

  // ---------- wizard state (this browser only) ----------
  const EMPTY = { step: 0, school: '', schoolEmail: '', adminEmail: '', levels: 'primary', supabaseUrl: '', anonKey: '', siteUrl: '', githubUser: '' };
  const GITHUB_USER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
  const forkEditUrl = (user) => `https://github.com/${user}/pp5smart-newschool/edit/main/js/app-config.js`;
  function load() {
    try { return { ...EMPTY, ...(JSON.parse(global.localStorage?.getItem(STORE_KEY) || 'null') || {}) }; } catch (_) { return { ...EMPTY }; }
  }
  function save(state) {
    try { global.localStorage?.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* private mode: wizard still works */ }
  }

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const SUPABASE_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/;
  function keyProblem(key) {
    const value = String(key || '').trim();
    if (/^sb_secret_/.test(value)) return 'นี่คือ secret key ห้ามใช้ ให้ใช้ publishable / anon key แทน';
    if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(value)) return '';
    const parts = value.split('.');
    if (parts.length === 3 && /^eyJ/.test(value)) {
      try {
        const payload = JSON.parse(global.atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.role === 'service_role') return 'นี่คือ service_role key (กุญแจลับ) ห้ามใช้ ให้ใช้ anon key แทน';
        if (payload.role === 'anon') return '';
      } catch (_) { /* fall through */ }
    }
    return 'รูปแบบ key ไม่ถูกต้อง (ขึ้นต้นด้วย sb_publishable_ หรือเป็น anon key ที่ขึ้นต้นด้วย eyJ)';
  }

  function appConfig(state) {
    const lines = [
      '// ค่าตั้งของโรงเรียน — ไฟล์เดียวที่ต้องแก้หลังติดตั้ง (ดู docs/ติดตั้ง.md)',
      '// ทุกค่าในไฟล์นี้เปิดเผยได้: anon key เป็นคีย์สาธารณะของ Supabase (สิทธิ์จริงคุมด้วย RLS ในฐานข้อมูล)',
      '// ห้ามใส่ service_role key, รหัสผ่าน หรือ secret ใด ๆ ในไฟล์นี้',
      `// ${String(state.school || '').replace(/[\r\n]/g, ' ')}`,
      'window.PP5_CONFIG = {',
      `  supabaseUrl: '${String(state.supabaseUrl || '').trim().replace(/\/$/, '')}',`,
      `  supabaseAnonKey: '${String(state.anonKey || '').trim()}',`,
      `  siteUrl: '${String(state.siteUrl || '').trim().replace(/\/$/, '')}',`,
      '  loginAliases: {},',
      '  examImport: null',
      '};',
      ''
    ];
    return lines.join('\n');
  }

  // ---------- steps ----------
  const field = (id, label, value, attrs) => `<label style="display:block;margin:10px 0 0;font-weight:600">${label}`
    + `<input class="form-control" data-field="${id}" value="${esc(value)}" ${attrs || ''} style="margin-top:4px"></label>`;
  const code = (key, text) => `<pre data-code="${key}" style="margin:8px 0 0;padding:10px;border-radius:8px;white-space:pre-wrap;word-break:break-all;`
    + `background:rgba(15,23,42,.06);font-size:12.5px;max-height:180px;overflow:auto">${esc(text)}</pre>`;
  const copyBtn = (attr, label) => `<button type="button" class="btn btn-primary btn-sm" ${attr} style="margin-top:8px">📋 ${label}</button>`;
  const done = (text) => `<p style="margin:10px 0 0;color:#047857;font-weight:600">✅ ผลที่ควรเห็น: ${text}</p>`;

  const STEPS = [
    {
      title: 'ยินดีต้อนรับ',
      body: () => '<p>ตัวช่วยนี้พาติดตั้ง PP5Smart ให้โรงเรียนใหม่ทีละขั้น ประมาณ <b>45–60 นาที</b> '
        + 'กด <b>ถัดไป</b> เมื่อทำขั้นนั้นเสร็จ ปิดแล้วกลับมาทำต่อได้ (จำไว้ในเบราว์เซอร์เครื่องนี้)</p>'
        + card('เตรียมให้พร้อมก่อนเริ่ม', list([
          'อีเมลของโรงเรียน 1 อัน (Gmail ก็ได้) ใช้สมัครทุกบัญชี',
          'ไฟล์รายชื่อนักเรียนจาก DMC',
          'รายชื่อครู และห้อง/วิชาที่สอน',
          'ชื่อโรงเรียน สังกัด ชื่อผู้อำนวยการ และโลโก้'
        ]))
        + note('หลักการ: แต่ละโรงเรียนมี Supabase, GitHub และ Vercel <b>ของตัวเอง</b> ฟรีทั้งหมด และเริ่มจากฐานข้อมูลว่าง '
          + 'ตัวช่วยนี้<b>ไม่ถามรหัสผ่านใด ๆ</b> รหัสผ่านให้โรงเรียนจดเก็บเอง')
    },
    {
      title: 'ข้อมูลโรงเรียน',
      body: (s) => '<p>กรอกข้อมูลของโรงเรียนที่จะติดตั้ง ใช้เติมให้ในขั้นต่อ ๆ ไป</p>'
        + field('school', 'ชื่อโรงเรียน', s.school, 'placeholder="เช่น โรงเรียนบ้านตัวอย่าง"')
        + field('schoolEmail', 'อีเมลของโรงเรียน (ใช้สมัคร Supabase / GitHub / Vercel)', s.schoolEmail, 'type="email" placeholder="school@gmail.com"')
        + field('adminEmail', 'อีเมลผู้ดูแลระบบคนแรก (ใช้เข้าโปรแกรม เว้นว่าง = ใช้อีเมลโรงเรียน)', s.adminEmail, 'type="email"')
        + '<div style="margin:12px 0 0;font-weight:600">ระดับชั้นที่เปิดสอน</div>'
        + `<label style="display:block;margin:4px 0 0"><input type="radio" name="pp5WizLevels" data-field="levels" value="primary" ${s.levels !== 'secondary' ? 'checked' : ''}> ประถม (ป.1–ป.6)</label>`
        + `<label style="display:block"><input type="radio" name="pp5WizLevels" data-field="levels" value="secondary" ${s.levels === 'secondary' ? 'checked' : ''}> ขยายโอกาส (ป.1–ม.3)</label>`,
      check: (s) => (!s.school.trim() ? 'กรุณากรอกชื่อโรงเรียน'
        : !EMAIL.test(s.schoolEmail.trim()) ? 'อีเมลของโรงเรียนไม่ถูกต้อง'
          : s.adminEmail.trim() && !EMAIL.test(s.adminEmail.trim()) ? 'อีเมลผู้ดูแลไม่ถูกต้อง' : '')
    },
    {
      title: 'สมัคร Supabase และสร้างโปรเจกต์',
      body: (s) => list([
        `เปิด ${link('https://supabase.com/dashboard/sign-up', 'supabase.com')} แล้วสมัครด้วยอีเมล <b>${esc(s.schoolEmail)}</b> (ยืนยันอีเมลที่ส่งมา)`,
        'กด <b>New project</b> ตั้งชื่อ เช่น <code>pp5-โรงเรียน</code>',
        'ตั้ง <b>Database Password</b> แล้วให้โรงเรียน<b>จดเก็บเอง</b> (ไม่ต้องกรอกในตัวช่วยนี้)',
        'Region เลือก <b>Southeast Asia (Singapore)</b> แล้วกด <b>Create new project</b>',
        'รอประมาณ 2 นาทีจนโปรเจกต์พร้อม'
      ], true) + note('บัญชีฟรี 1 บัญชีสร้างได้ 2 โปรเจกต์ ถ้าเต็มให้ใช้อีเมลอื่นของโรงเรียน', 'warn')
    },
    {
      title: 'ติดตั้งฐานข้อมูล (install.sql)',
      body: () => list([
        'เมนูซ้ายของ Supabase เลือก <b>SQL Editor</b> → <b>New query</b>',
        `กดปุ่มด้านล่างเพื่อคัดลอก install.sql (ประมาณ 280 KB จาก ${link(LINKS.installSql, 'ชุดแจก')})`,
        'คลิกในช่องคำสั่ง กด <b>Ctrl+V</b> แล้วกด <b>Run</b>'
      ], true) + copyBtn(`data-copy-url="${RAW_FILES.installSql}"`, 'คัดลอก install.sql')
        + done('<b>Success. No rows returned</b>')
        + note('ใช้กับ<b>ฐานข้อมูลใหม่ที่ว่างเท่านั้น</b> ห้ามรันในฐานข้อมูลที่มีข้อมูลอยู่แล้ว', 'warn')
    },
    {
      title: 'ปิดการสมัครสมาชิกเอง',
      body: () => list([
        'เมนูซ้าย <b>Authentication</b> → <b>Sign In / Providers</b> (บางหน้าจออยู่ใน Settings)',
        'ปิด <b>Allow new users to sign up</b> แล้วกด <b>Save</b>'
      ], true) + note('บัญชีครูและผู้ปกครองจะสร้างจากในโปรแกรมโดยผู้ดูแลเท่านั้น คนนอกสมัครเองไม่ได้')
    },
    {
      title: 'สร้างผู้ดูแลระบบคนแรก',
      body: (s) => {
        const email = (s.adminEmail || s.schoolEmail || '').trim().toLowerCase();
        return list([
          '<b>Authentication</b> → <b>Users</b> → <b>Add user</b> → <b>Create new user</b>',
          `อีเมล <b>${esc(email)}</b> ตั้งรหัสผ่าน (จดเก็บ) ติ๊ก <b>Auto Confirm User</b> → <b>Create user</b>`,
          'กลับไป <b>SQL Editor</b> → <b>New query</b> วางคำสั่งนี้แล้วกด <b>Run</b>'
        ], true) + code('makeAdmin', `select public.pp5_install_make_admin('${email.replace(/'/g, "''")}');`)
          + copyBtn('data-copy="makeAdmin"', 'คัดลอกคำสั่ง')
          + done('<b>ตั้งเป็นผู้ดูแลระบบแล้ว: ' + esc(email) + '</b>');
      }
    },
    {
      title: 'ติดตั้งระบบจัดการบัญชีผู้ใช้ (admin-users)',
      body: () => list([
        'เมนูซ้าย <b>Edge Functions</b> → <b>Deploy a new function</b> → <b>Via Editor</b>',
        'ตั้งชื่อ function ว่า <code>admin-users</code> (ต้องตรงทุกตัวอักษร)',
        'ลบโค้ดตัวอย่างออกทั้งหมด กดปุ่มด้านล่างเพื่อคัดลอกโค้ด แล้ววาง → <b>Deploy</b>',
        'เปิด function <code>admin-users</code> → <b>Details / Settings</b> → ปิด <b>Verify JWT</b> → <b>Save</b>'
      ], true) + copyBtn(`data-copy-url="${RAW_FILES.adminUsers}"`, 'คัดลอกโค้ด admin-users')
        + note('ปิด Verify JWT ปลอดภัย เพราะโค้ดตรวจเองว่าผู้เรียกต้องเป็นผู้ดูแลที่ยังใช้งานอยู่')
    },
    {
      title: 'คัดลอกค่าสำหรับเว็บ',
      body: (s) => list([
        '<b>Project URL</b>: เมนู <b>Integrations → Data API</b> (หรือ Project Settings → Data API) คัดลอก API URL '
          + '(ถ้ามี <code>/rest/v1/</code> ต่อท้าย ตัวช่วยตัดออกให้เอง)',
        '<b>Key</b>: รูปเฟือง ⚙️ ที่เมนูซ้ายล่าง → <b>Project Settings → API Keys</b> → คัดลอก <b>Publishable key</b> (<code>sb_publishable_...</code>) '
          + 'หรือแท็บ Legacy API keys → <b>anon public</b> (<code>eyJ...</code>)'
          + (SUPABASE_URL.test(String(s.supabaseUrl || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, ''))
            ? ` — ${link(`https://supabase.com/dashboard/project/${String(s.supabaseUrl).trim().replace(/^https:\/\/([a-z0-9-]+)\.supabase\.co.*$/, '$1')}/settings/api-keys`, 'เปิดหน้า API Keys ของโปรเจกต์นี้')}`
            : ` — ${link('https://supabase.com/dashboard/project/_/settings/api-keys', 'เปิดหน้า API Keys (เลือกโปรเจกต์)')}`)
      ], true)
        + field('supabaseUrl', 'Project URL', s.supabaseUrl, 'placeholder="https://xxxxxxxx.supabase.co" autocomplete="off"')
        + field('anonKey', 'anon public / publishable key', s.anonKey, 'placeholder="sb_publishable_... หรือ eyJ..." autocomplete="off"')
        + note('ใช้ <b>anon / publishable</b> เท่านั้น ห้ามใช้ <b>service_role</b> หรือ <b>secret</b> key (ตัวช่วยจะไม่ยอมรับ)', 'warn'),
      check: (s) => {
        // the Data API page shows https://xxxx.supabase.co/rest/v1/ — keep only the project address
        s.supabaseUrl = s.supabaseUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
        s.anonKey = s.anonKey.trim();
        return !SUPABASE_URL.test(s.supabaseUrl) ? 'Project URL ต้องเป็นรูปแบบ https://xxxx.supabase.co' : keyProblem(s.anonKey);
      }
    },
    {
      title: 'สร้างเว็บของโรงเรียนบน GitHub',
      body: (s) => list([
        `สมัคร ${link('https://github.com/signup', 'GitHub')} ด้วยอีเมล <b>${esc(s.schoolEmail)}</b> แล้ว<b>ยืนยันอีเมล</b>ที่ GitHub ส่งมา`,
        `กด ${link(`${LINKS.repo}/fork`, 'Fork ชุดแจก PP5Smart')} → ปุ่มเขียว <b>Create fork</b>`,
        'กรอกชื่อบัญชี GitHub ของโรงเรียน (เห็นที่ "Welcome to GitHub, ...") แล้วกดปุ่ม <b>เปิดหน้าแก้ app-config.js</b>',
        'กดปุ่ม <b>คัดลอก app-config.js</b> → ในหน้าแก้ของ GitHub กด <b>Ctrl+A</b> แล้ว <b>Ctrl+V</b> → <b>Commit changes...</b> → <b>Commit changes</b>'
      ], true)
        + field('githubUser', 'ชื่อบัญชี GitHub ของโรงเรียน', s.githubUser, 'placeholder="เช่น school-name" autocomplete="off"')
        + '<button type="button" class="btn btn-outline-primary btn-sm" data-open-edit style="margin-top:8px">↗ เปิดหน้าแก้ app-config.js</button>'
        + code('appConfig', appConfig(s)) + copyBtn('data-copy="appConfig"', 'คัดลอก app-config.js')
    },
    {
      title: 'เปิดเว็บด้วย Vercel',
      body: (s) => list([
        `เปิด ${link('https://vercel.com/signup', 'vercel.com')} → เลือก <b>Hobby</b> (ฟรี) → <b>Continue with GitHub</b>`,
        '<b>Add New</b> → <b>Project</b> → เลือก <code>pp5smart-newschool</code> → <b>Import</b> → <b>Deploy</b>',
        'รอประมาณ 1 นาทีจนขึ้น <b>Congratulations</b> แล้วจดที่อยู่เว็บ'
      ], true)
        + field('siteUrl', '(ไม่บังคับ) ที่อยู่เว็บของโรงเรียน ใช้ทำลิงก์ให้ผู้ปกครอง', s.siteUrl, 'placeholder="https://xxxx.vercel.app"')
        + note('ถ้ากรอกที่อยู่เว็บ ให้กลับไปแก้ <code>js/app-config.js</code> อีกครั้งด้วยไฟล์ใหม่ด้านล่าง')
        + code('appConfig', appConfig(s)) + copyBtn('data-copy="appConfig"', 'คัดลอก app-config.js ฉบับมีที่อยู่เว็บ'),
      check: (s) => (s.siteUrl.trim() && !/^https:\/\/[^\s'"]+$/.test(s.siteUrl.trim()) ? 'ที่อยู่เว็บต้องขึ้นต้นด้วย https://' : '')
    },
    {
      title: 'เริ่มใช้งานในโปรแกรม',
      body: (s) => list([
        `เปิดเว็บของโรงเรียน เข้าระบบด้วย <b>${esc((s.adminEmail || s.schoolEmail || '').trim())}</b>`,
        `<b>ตั้งค่าระบบกลาง</b>: ชื่อโรงเรียน <b>${esc(s.school)}</b> สังกัด ผู้อำนวยการ โลโก้`
          + (s.levels === 'secondary' ? ' และตั้ง <b>ระดับชั้นที่เปิดสอน = ป.1–ม.3</b>' : ''),
        `<b>จัดการรายวิชา</b> → นำเข้า CSV/Excel: ${link(LINKS.catalogPrimary, 'รายวิชา ป.1–ป.6')}`
          + (s.levels === 'secondary' ? ` และ ${link(LINKS.catalogSecondary, 'รายวิชา ม.1–ม.3 (ฉบับร่าง ให้ครูวิชาการตรวจก่อน)')}` : ''),
        '<b>นำเข้านักเรียนจาก DMC</b>',
        '<b>จัดการผู้ใช้</b> → สร้างบัญชีครู และตั้งครูประจำชั้น',
        `(ไม่บังคับ) เปิดสิทธิ์ครูให้เห็นเฉพาะห้องตัวเอง ตาม ${link(LINKS.teacherPermissions, 'คู่มือสิทธิ์ครู')}`
      ], true)
    },
    {
      title: 'เสร็จสิ้น — บอกโรงเรียนก่อนกลับ',
      body: (s) => card('ก่อนกลับ บอกโรงเรียน', list([
        'กด <b>สำรองตอนนี้</b> เป็นประจำ (แผนฟรีไม่มีสำรองอัตโนมัติ)',
        '<b>ปิดเทอม</b>: เข้าเว็บสัปดาห์ละครั้ง ไม่เช่นนั้นฐานข้อมูลจะหยุดพัก (กด Restore ใน Supabase แก้ได้)',
        '<b>เวอร์ชันใหม่</b>: ที่ repo ของโรงเรียนกด Sync fork → <b>Update branch</b> (ห้ามกด Discard)',
        '<b>ครูใหม่ / เปลี่ยนปีการศึกษา</b>: มอบหมายห้องในหน้า "มอบหมายงานครู" (ถ้าเปิดสิทธิ์ครูไว้)',
        'ส่งมอบอีเมลและรหัสผ่านทุกบัญชีให้โรงเรียนเก็บเอง'
      ]), '#fcd34d')
        + card('สรุปการติดตั้ง', list([
          `โรงเรียน: <b>${esc(s.school)}</b>`,
          `อีเมลโรงเรียน: ${esc(s.schoolEmail)} · ผู้ดูแล: ${esc((s.adminEmail || s.schoolEmail || '').trim())}`,
          `Supabase: ${esc(s.supabaseUrl)}`,
          `เว็บ: ${esc(s.siteUrl || '(ยังไม่ได้กรอก)')}`
        ]))
        + '<button type="button" class="btn btn-outline-danger btn-sm" data-reset>เริ่มใหม่สำหรับโรงเรียนถัดไป (ล้างข้อมูลที่กรอก)</button>'
    }
  ];

  // ---------- clipboard ----------
  async function copyText(doc, text) {
    try {
      if (global.navigator?.clipboard?.writeText) { await global.navigator.clipboard.writeText(text); return true; }
    } catch (_) { /* fall back below */ }
    try {
      const area = doc.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;left:-9999px;top:0';
      doc.body.appendChild(area);
      area.select();
      const ok = doc.execCommand ? doc.execCommand('copy') : false;
      area.remove();
      return !!ok;
    } catch (_) { return false; }
  }

  // ---------- dialog ----------
  function open() {
    const doc = global.document;
    if (!doc?.body) return null;
    doc.getElementById('pp5InstallGuideModal')?.remove();
    const state = load();
    state.step = Math.min(Math.max(Number(state.step) || 0, 0), STEPS.length - 1);
    let showSummary = false;

    const overlay = doc.createElement('div');
    overlay.id = 'pp5InstallGuideModal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', TITLE);
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;'
      + 'padding:16px;background:rgba(15,23,42,.55)';

    function readFields() {
      overlay.querySelectorAll?.('[data-field]')?.forEach((input) => {
        const key = input.getAttribute('data-field');
        if (input.type === 'radio') { if (input.checked) state[key] = input.value; } else state[key] = String(input.value || '');
      });
    }

    function render(message) {
      const step = STEPS[state.step];
      const n = state.step + 1;
      const percent = Math.round((n / STEPS.length) * 100);
      const body = showSummary ? html() : step.body(state);
      overlay.innerHTML = '<div style="width:100%;max-width:760px;max-height:92vh;display:flex;flex-direction:column;border-radius:16px;'
        + 'background:var(--bs-body-bg,#fff);color:var(--bs-body-color,#111827);box-shadow:0 18px 50px rgba(0,0,0,.3)">'
        + '<div style="padding:16px 20px 10px;border-bottom:1px solid var(--gray-200,#e5e7eb)">'
        + '<div style="display:flex;align-items:center;gap:12px">'
        + `<h5 style="margin:0;flex:1;font-weight:700">📦 ${TITLE}</h5>`
        + '<button type="button" class="btn btn-sm btn-outline-secondary" data-close aria-label="ปิด">✕</button></div>'
        + (showSummary ? '<div style="margin-top:6px;font-weight:600">สรุปหน้าเดียว</div>'
          : `<div style="margin-top:8px;display:flex;justify-content:space-between;font-size:13px"><b>ขั้นที่ ${n} จาก ${STEPS.length}: ${esc(step.title)}</b><span>${percent}%</span></div>`
            + `<div style="margin-top:6px;height:8px;border-radius:99px;background:rgba(15,23,42,.08);overflow:hidden"><div data-progress style="height:100%;width:${percent}%;background:var(--primary,#4f46e5)"></div></div>`)
        + '</div>'
        + `<div data-body style="padding:14px 20px;overflow:auto;font-size:14px;line-height:1.65">${body}`
        + (message ? `<div data-message role="alert" style="margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(239,68,68,.12);color:#b91c1c;font-weight:600">${esc(message)}</div>` : '')
        + '</div>'
        + '<div style="display:flex;gap:8px;align-items:center;padding:12px 20px;border-top:1px solid var(--gray-200,#e5e7eb);flex-wrap:wrap">'
        + (showSummary
          ? '<button type="button" class="btn btn-primary" data-summary>← กลับไปที่ตัวช่วยทีละขั้น</button>'
          : `<button type="button" class="btn btn-outline-secondary" data-back ${state.step === 0 ? 'disabled' : ''}>← ย้อนกลับ</button>`
            + '<button type="button" class="btn btn-link btn-sm" data-summary>ดูสรุปหน้าเดียว</button>'
            + '<span style="flex:1"></span>'
            + (n < STEPS.length ? '<button type="button" class="btn btn-primary" data-next>ถัดไป →</button>'
              : '<button type="button" class="btn btn-success" data-close>เสร็จสิ้น</button>'))
        + '</div></div>';
    }

    const close = () => {
      readFields();
      save(state);
      overlay.remove();
      doc.removeEventListener('keydown', onKey);
    };
    const onKey = (event) => { if (event.key === 'Escape') close(); };

    overlay.addEventListener('click', async (event) => {
      const target = event.target;
      if (target === overlay || target?.closest?.('[data-close]')) { close(); return; }
      if (target?.closest?.('[data-summary]')) { readFields(); showSummary = !showSummary; render(); return; }
      if (target?.closest?.('[data-back]')) { readFields(); state.step = Math.max(0, state.step - 1); save(state); render(); return; }
      if (target?.closest?.('[data-next]')) {
        readFields();
        const problem = STEPS[state.step].check ? STEPS[state.step].check(state) : '';
        if (problem) { render(problem); return; }
        state.step = Math.min(STEPS.length - 1, state.step + 1);
        save(state);
        render();
        return;
      }
      if (target?.closest?.('[data-open-edit]')) {
        readFields();
        state.githubUser = String(state.githubUser || '').trim().replace(/^@/, '');
        save(state);
        if (!GITHUB_USER.test(state.githubUser)) { render('กรอกชื่อบัญชี GitHub ให้ถูกต้องก่อน (ตัวอักษรอังกฤษ ตัวเลข หรือ -)'); return; }
        global.open?.(forkEditUrl(state.githubUser), '_blank', 'noopener');
        return;
      }
      if (target?.closest?.('[data-reset]')) {
        if (global.confirm && !global.confirm('ล้างข้อมูลที่กรอกในตัวช่วยนี้ แล้วเริ่มใหม่?')) return;
        Object.assign(state, EMPTY);
        save(state);
        render();
        return;
      }
      const copy = target?.closest?.('[data-copy],[data-copy-url]');
      if (copy) {
        readFields();
        const label = copy.textContent;
        copy.disabled = true;
        copy.textContent = 'กำลังเตรียม...';
        let text = '';
        let ok = false;
        try {
          if (copy.getAttribute('data-copy-url')) {
            const response = await global.fetch(copy.getAttribute('data-copy-url'), { cache: 'no-store' });
            if (!response.ok) throw new Error(String(response.status));
            text = await response.text();
          } else {
            text = overlay.querySelector?.(`[data-code="${copy.getAttribute('data-copy')}"]`)?.textContent || '';
          }
          ok = !!text && await copyText(doc, text);
        } catch (_) { ok = false; }
        copy.disabled = false;
        copy.textContent = ok ? '✅ คัดลอกแล้ว — ไปวางได้เลย (Ctrl+V)' : '⚠️ คัดลอกไม่ได้ — เปิดลิงก์ในข้อความด้านบนแล้วคัดลอกเอง';
        global.setTimeout?.(() => { if (copy.isConnected !== false) copy.textContent = label; }, 4000);
      }
    });
    // a fixed field should not keep showing the old "กรุณากรอก..." message
    overlay.addEventListener('input', () => overlay.querySelector?.('[data-message]')?.remove());
    doc.addEventListener('keydown', onKey);
    render();
    doc.body.appendChild(overlay);
    return overlay;
  }

  global.PP5InstallGuide = { open, html, LINKS, STEPS, appConfig, keyProblem };
})(window);
