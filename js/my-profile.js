// หน้า "โปรไฟล์ของฉัน" (my_profile, owner 2026-10-20 ขั้นที่ 1 — ไม่มี SQL): รวมเรื่องของตัวเองไว้ที่เดียว ทุกบทบาท
//   ① ข้อมูลของฉัน (อ่านอย่างเดียว): ชื่อ ชื่อผู้ใช้ บทบาท + งานที่ได้รับ (ครู: ห้องที่ดูแล/วิชาที่สอน จาก pp5_teacher_scope_context ·
//      ผู้ปกครอง: นักเรียนในความดูแล จาก getParentStudents · ธุรการ/ผู้ดูแล: ขอบเขตงาน)
//   ② ความปลอดภัย: ปุ่มไปหน้าเปลี่ยนรหัสผ่านเดิม (change_password)
//   ③ การแสดงผล: ธีมสีของฉัน (js/user-theme.js — เก็บกับบัญชี ไม่กระทบคนอื่น) + โหมดมืด (#themeToggle ที่หัวเว็บ)
// แก้ชื่อเอง (ขั้นที่ 2, owner 2026-10-20): ผ่าน SQL 202610200037 pp5_update_my_display_name เท่านั้น (ตาราง user_profiles ยังแก้ได้เฉพาะผู้ดูแล)
// ลายเซ็นของฉัน (owner 2026-10-23 "อยากให้ครูแต่ละคนอัปโหลดลายเซ็นตัวเองได้", SQL 202610230042): ครู/ผู้ดูแลอัปโหลดหรือวาดลายเซ็นของตัวเอง
//   เก็บผ่าน pp5_save_my_signature เท่านั้น (แก้ได้เฉพาะของตัวเอง) · เอกสาร PDF หาจากชื่อที่แสดง (gas-bridge staffSignatures_)
// เปิดได้จากเมนู บัญชีผู้ใช้ → โปรไฟล์ของฉัน และกดชื่อที่มุมขวาบน · ตรวจด้วย tools/my-profile-contract.cjs
(function initMyProfile(global) {
  'use strict';
  const doc = global.document;
  const ROLE_LABEL = { admin: 'ผู้ดูแลระบบ', teacher: 'ครู', registrar: 'เจ้าหน้าที่ธุรการ', parent: 'ผู้ปกครอง' };
  const ROLE_SCOPE = {
    admin: 'เข้าถึงทุกเมนู ตั้งค่าระบบ และจัดการผู้ใช้',
    registrar: 'งานทะเบียนนักเรียน นักเรียนย้ายออก และดูผลการเรียน/เวลาเรียน',
    teacher: '',
    parent: ''
  };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = (value) => String(value ?? '').trim();

  const STYLE = `
.pp5-pf{--pf-line:#e3e6ee;--pf-muted:#5b6275;--pf-card:#fff;--pf-accent:var(--primary,#4f46e5);max-width:760px;margin:0 auto;display:grid;gap:14px}
[data-theme="dark"] .pp5-pf{--pf-line:#2b3446;--pf-muted:#a7afbd;--pf-card:#1b2232}
.pp5-pf-card{background:var(--pf-card);border:1px solid var(--pf-line);border-radius:16px;padding:16px 18px}
.pp5-pf-card h3{font-size:1rem;font-weight:700;margin:0 0 10px;display:flex;gap:8px;align-items:center}
.pp5-pf-card h3 i{color:var(--pf-accent)}
.pp5-pf-me{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.pp5-pf-avatar{width:64px;height:64px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:1.6rem;font-weight:700;color:#fff;
  background:linear-gradient(135deg,var(--pf-accent),var(--primary-light,#6366f1))}
.pp5-pf-name{font-size:1.25rem;font-weight:700;line-height:1.3}
.pp5-pf-sub{color:var(--pf-muted);font-size:.9rem;display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px}
.pp5-pf-badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.8rem;font-weight:600;
  background:color-mix(in srgb,var(--pf-accent) 12%,transparent);color:var(--pf-accent)}
.pp5-pf-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.pp5-pf-list li{display:flex;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--pf-line);border-radius:10px}
.pp5-pf-list li i{color:var(--pf-accent)}
.pp5-pf-muted{color:var(--pf-muted);font-size:.86rem;margin:6px 0 0}
.pp5-pf-row{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.pp5-pf-swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;margin-top:4px}
.pp5-pf-sw{display:grid;gap:6px;justify-items:center;padding:8px 6px;border:1.5px solid var(--pf-line);border-radius:12px;background:transparent;
  cursor:pointer;font:inherit;font-size:.8rem;color:inherit}
.pp5-pf-sw[aria-pressed="true"]{border-color:var(--pf-accent);background:color-mix(in srgb,var(--pf-accent) 8%,transparent);font-weight:600}
.pp5-pf-chip{width:100%;height:24px;border-radius:7px}
.pp5-pf-say{font-size:.82rem;min-height:1.1em;margin-top:8px}.pp5-pf-say.ok{color:#13795b}.pp5-pf-say.err{color:#c2362b}
.pp5-pf-sig{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.pp5-pf-sig-box{width:260px;height:96px;flex:none;border:1.5px dashed var(--pf-line);border-radius:12px;display:grid;place-items:center;
  background:repeating-linear-gradient(45deg,transparent 0 8px,color-mix(in srgb,var(--pf-line) 35%,transparent) 8px 9px),#fff;overflow:hidden}
.pp5-pf-sig-box img{max-width:94%;max-height:86px}
.pp5-pf-sig-box span{color:#64748b;font-size:.85rem}
.pp5-pf-sig-actions{display:flex;gap:8px;flex-wrap:wrap}`;

  function shell() {
    return `<div class="animate-fade-in"><style>${STYLE}</style><div class="pp5-pf" id="pp5ProfilePage">
<section class="pp5-pf-card" data-me><div class="pp5-pf-me"><div class="pp5-pf-avatar" aria-hidden="true"><i class="bi bi-person-fill"></i></div>
<div><div class="pp5-pf-name">กำลังโหลด…</div></div></div></section>
<section class="pp5-pf-card" data-work hidden><h3><i class="bi bi-briefcase-fill"></i> <span data-work-title>งานของฉัน</span></h3><div data-work-body></div></section>
<section class="pp5-pf-card" data-signature hidden><h3><i class="bi bi-pen-fill"></i> ลายเซ็นของฉัน</h3>
<div class="pp5-pf-sig"><div class="pp5-pf-sig-box" data-sig-box><span>กำลังโหลด…</span></div>
<div><div class="pp5-pf-sig-actions"><button type="button" class="btn btn-outline-primary btn-sm" data-sig-upload><i class="bi bi-upload"></i> อัปโหลดรูป</button>
<button type="button" class="btn btn-outline-primary btn-sm" data-sig-draw><i class="bi bi-vector-pen"></i> วาดลายเซ็น</button>
<button type="button" class="btn btn-outline-danger btn-sm" data-sig-delete hidden><i class="bi bi-trash"></i> ลบ</button></div>
<input type="file" accept="image/png,image/jpeg,image/webp" data-sig-file hidden>
<p class="pp5-pf-muted">ใช้ในช่อง "ครูผู้สอน / ครูประจำชั้น" ของเอกสาร ปพ.5 ที่มีชื่อของคุณ (จับคู่จากชื่อที่แสดง) · ใช้รูปพื้นขาว ระบบทำพื้นหลังให้โปร่งใสและย่อขนาดให้เอง</p></div></div>
<p class="pp5-pf-say" data-sig-say role="status"></p></section>
<section class="pp5-pf-card"><h3><i class="bi bi-shield-lock-fill"></i> ความปลอดภัย</h3>
<div class="pp5-pf-row"><span>รหัสผ่านสำหรับเข้าสู่ระบบ</span>
<button type="button" class="btn btn-outline-primary" data-password><i class="bi bi-key-fill"></i> เปลี่ยนรหัสผ่าน</button></div></section>
<section class="pp5-pf-card"><h3><i class="bi bi-palette-fill"></i> การแสดงผล</h3>
<div class="pp5-pf-row"><span>โหมดมืด</span><div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" role="switch" id="pp5ProfileDark" aria-label="โหมดมืด"></div></div>
<div style="margin-top:12px">ธีมสีของฉัน <small class="pp5-pf-muted">(เห็นเฉพาะบัญชีนี้ ไม่เปลี่ยนเอกสาร PDF)</small></div>
<div class="pp5-pf-swatches" role="group" aria-label="ธีมสีของฉัน" data-swatches></div>
<div class="pp5-pf-say" data-say role="status"></div></section>
</div></div>`;
  }

  function roleLabel(role) { return ROLE_LABEL[role] || role || '-'; }

  // งานของครู: ห้องที่ดูแล (homeroom) + วิชาที่สอน (subject) ของปีการศึกษาปัจจุบัน
  async function teacherWork(ctx) {
    const year = clean(ctx?.academicYear);
    const rows = (ctx?.assignments || []).filter((a) => a.active !== false && (!year || clean(a.academic_year) === year));
    const ids = [...new Set(rows.filter((a) => a.scope === 'subject' && a.subject_id).map((a) => clean(a.subject_id)))];
    const names = new Map();
    if (ids.length) {
      try {
        const { data } = await global.PP5Data.client.from('subjects').select('id,code,name').in('id', ids);
        (data || []).forEach((s) => names.set(clean(s.id), [clean(s.code), clean(s.name)].filter(Boolean).join(' ')));
      } catch (_) { /* แสดงรหัสวิชาแทน */ }
    }
    const room = (a) => `${clean(a.grade)}${clean(a.room) ? '/' + clean(a.room) : ''}`;
    const items = rows.map((a) => (a.scope === 'homeroom'
      ? { icon: 'bi-house-heart-fill', text: `ครูประจำชั้น ${room(a)}` }
      : { icon: 'bi-journal-text', text: `สอน ${names.get(clean(a.subject_id)) || clean(a.subject_id) || 'รายวิชา'} · ${room(a)}${a.semester ? ` · ภาคเรียนที่ ${a.semester}` : ''}` }));
    return { title: `งานของฉัน${year ? ` · ปีการศึกษา ${year}` : ''}`, items };
  }

  async function parentWork() {
    const res = await global.GasServer?.getParentStudents?.();
    const items = (res?.data || []).map((s) => ({ icon: 'bi-person-heart',
      text: `${[clean(s.title || s.prefix), clean(s.firstName), clean(s.lastName)].filter(Boolean).join(' ') || clean(s.fullName || s.name)}${clean(s.grade) ? ` · ${clean(s.grade)}${clean(s.classNo || s.room) ? '/' + clean(s.classNo || s.room) : ''}` : ''}` }));
    return { title: 'นักเรียนในความดูแล', items };
  }

  function renderWork(root, work, emptyText) {
    const box = root.querySelector('[data-work]');
    box.hidden = false;
    root.querySelector('[data-work-title]').textContent = work.title;
    root.querySelector('[data-work-body]').innerHTML = work.items.length
      ? `<ul class="pp5-pf-list">${work.items.map((i) => `<li><i class="bi ${i.icon}"></i><span>${esc(i.text)}</span></li>`).join('')}</ul>`
      : `<p class="pp5-pf-muted" style="margin:0">${esc(emptyText)}</p>`;
  }

  function themeSwatches(root) {
    const sb = global.PP5SchoolBranding;
    const ut = global.PP5UserTheme;
    const box = root.querySelector('[data-swatches]');
    if (!sb?.PRESETS || !ut) { box.closest('.pp5-pf-card').querySelector('[data-say]').textContent = 'ธีมสีใช้ไม่ได้ในหน้านี้'; return; }
    const options = [['school', 'ตามโรงเรียน', 'conic-gradient(var(--pp5-brand-1, #4F46E5) 0 50%, #e2e8f0 0)'],
      ...Object.entries(sb.PRESETS).map(([id, p]) => [id, p.name.replace(' (เดิม)', ''), `linear-gradient(135deg, ${p.primary}, ${p.light} 60%, ${p.accent})`])];
    box.innerHTML = options.map(([id, label, bg]) => `<button type="button" class="pp5-pf-sw" data-theme-id="${esc(id)}" aria-pressed="false">`
      + `<span class="pp5-pf-chip" style="background:${bg}"></span>${esc(label)}</button>`).join('');
    const mark = () => {
      const now = ut.current()?.theme || 'school';
      box.querySelectorAll('[data-theme-id]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-id') === now)));
    };
    const say = root.querySelector('[data-say]');
    box.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-theme-id]');
      if (!button) return;
      const id = button.getAttribute('data-theme-id');
      say.className = 'pp5-pf-say';
      say.textContent = 'กำลังบันทึก…';
      try {
        await ut.save(id === 'school' ? null : { theme: id });
        mark();
        say.className = 'pp5-pf-say ok';
        say.textContent = id === 'school' ? 'บันทึกแล้ว — ใช้สีของโรงเรียน' : `บันทึกแล้ว — ${button.textContent.trim()}`;
      } catch (error) {
        say.className = 'pp5-pf-say err';
        say.textContent = (error && error.message) || 'บันทึกไม่สำเร็จ';
      }
    });
    mark();
  }

  function darkSwitch(root) {
    const input = root.querySelector('#pp5ProfileDark');
    const isDark = () => doc.documentElement.getAttribute('data-theme') === 'dark';
    input.checked = isDark();
    input.addEventListener('change', () => {
      if (input.checked !== isDark()) doc.getElementById('themeToggle')?.click();
      input.checked = isDark();
    });
  }

  const initial = (name) => name.replace(/^(นาย|นางสาว|นาง|ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง|ครู)\s*/, '').charAt(0) || '?';
  // แก้ชื่อที่แสดงของตัวเอง (โปรไฟล์ขั้นที่ 2, SQL 202610200037 pp5_update_my_display_name: แก้ได้เฉพาะชื่อของบัญชีตัวเอง
  // ไม่แตะบทบาท/สิทธิ์) · ยังไม่ติดตั้ง SQL = บอกให้แจ้งผู้ดูแล · ชื่อนี้ไม่ใช่ชื่อในเอกสาร ปพ. (มาจากข้อมูลครูประจำชั้นของผู้ดูแล)
  const missingRpc = (error) => /pp5_update_my_display_name|PGRST202|schema cache|does not exist/i.test(`${error?.code || ''} ${error?.message || ''}`);
  function renderMe(root, p, name) {
    const me = root.querySelector('[data-me]');
    me.innerHTML = `<div class="pp5-pf-me"><div class="pp5-pf-avatar" aria-hidden="true">${esc(initial(name))}</div>
<div style="flex:1;min-width:0"><div class="pp5-pf-name">${esc(name)}</div>
<div class="pp5-pf-sub"><span class="pp5-pf-badge">${esc(roleLabel(p.role))}</span><span>ชื่อผู้ใช้ ${esc(p.username || '-')}</span></div></div>
<button type="button" class="btn btn-outline-secondary btn-sm" data-edit-name><i class="bi bi-pencil"></i> แก้ชื่อ</button></div>
<form data-name-form hidden style="margin-top:12px"><label class="form-label mb-1" for="pp5ProfileName">ชื่อที่แสดงในระบบ</label>
<div class="d-flex flex-wrap gap-2"><input id="pp5ProfileName" class="form-control" style="flex:1 1 240px;max-width:420px" maxlength="80" autocomplete="name" value="${esc(name)}">
<button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> บันทึก</button><button type="button" class="btn btn-outline-secondary" data-cancel-name>ยกเลิก</button></div></form>
<p class="pp5-pf-muted">ชื่อนี้ใช้แสดงในระบบ ไม่เปลี่ยนชื่อในเอกสาร ปพ.5 / ปพ.6${p.role === 'admin' ? ' · บทบาทและสิทธิ์แก้ได้ที่ ตั้งค่าระบบ → ผู้ใช้และสิทธิ์' : ''}</p>
<p class="pp5-pf-say" data-name-say role="status"></p>`;
    const form = me.querySelector('[data-name-form]');
    const say = me.querySelector('[data-name-say]');
    const show = (text, kind) => { say.textContent = text || ''; say.className = 'pp5-pf-say' + (kind ? ' ' + kind : ''); };
    me.querySelector('[data-edit-name]').addEventListener('click', () => { form.hidden = false; form.querySelector('input').focus(); show(''); });
    me.querySelector('[data-cancel-name]').addEventListener('click', () => { form.hidden = true; show(''); });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const wanted = clean(form.querySelector('input').value).replace(/\s+/g, ' ');
      if (wanted.length < 2 || wanted.length > 80) { show('ชื่อต้องยาว 2–80 ตัวอักษร', 'err'); return; }
      const buttons = form.querySelectorAll('button');
      buttons.forEach((b) => { b.disabled = true; });
      show('กำลังบันทึก…');
      try {
        const { data, error } = await global.PP5Data.client.rpc('pp5_update_my_display_name', { p_name: wanted });
        if (error) throw error;
        const saved = clean(data?.display_name) || wanted;
        // หัวเว็บอ่าน firstName+lastName ก่อน displayName (spa-main getUserFullName_) จึงตั้งทั้งสามค่า
        try { global.localStorage?.setItem('displayName', saved); global.localStorage?.setItem('firstName', saved); global.localStorage?.setItem('lastName', ''); } catch (_) { /* storage blocked */ }
        try { global.displayUserInfo?.(); } catch (_) { /* header not on this page */ }
        renderMe(root, p, saved);
        root.querySelector('[data-name-say]').textContent = 'บันทึกชื่อแล้ว';
        root.querySelector('[data-name-say]').className = 'pp5-pf-say ok';
      } catch (error) {
        buttons.forEach((b) => { b.disabled = false; });
        show(missingRpc(error) ? 'โรงเรียนยังไม่ได้เปิดให้แก้ชื่อเอง (ต้องติดตั้ง SQL 037) — กรุณาแจ้งผู้ดูแลระบบแก้ให้ที่ ผู้ใช้และสิทธิ์'
          : ((error && error.message) || 'บันทึกไม่สำเร็จ'), 'err');
      }
    });
  }

  // ---- ลายเซ็นของฉัน: ย่อให้ไม่เกิน 600×220 พิกเซล พื้นขาวเป็นโปร่งใส แล้วเก็บเป็น PNG (ฐานข้อมูลรับไม่เกิน 400 000 ตัวอักษร)
  const SIGNATURE_MISSING = (error) => /pp5_save_my_signature|pp5_staff_signatures|PGRST202|schema cache|does not exist/i.test(`${error?.code || ''} ${error?.message || ''}`);
  function shrinkSignature(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new global.Image();
      img.onload = () => {
        const scale = Math.min(1, 600 / img.width, 220 / img.height);
        const canvas = doc.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const g = canvas.getContext('2d');
        g.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pixels = g.getImageData(0, 0, canvas.width, canvas.height);
        const d = pixels.data;
        for (let i = 0; i < d.length; i += 4) { if (d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225) d[i + 3] = 0; }
        g.putImageData(pixels, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('อ่านรูปไม่ได้ กรุณาใช้ไฟล์ PNG หรือ JPG'));
      img.src = dataUrl;
    });
  }
  async function signatureCard(root) {
    const card = root.querySelector('[data-signature]');
    const box = card.querySelector('[data-sig-box]');
    const say = card.querySelector('[data-sig-say]');
    const del = card.querySelector('[data-sig-delete]');
    const file = card.querySelector('[data-sig-file]');
    const client = global.PP5Data.client;
    card.hidden = false;
    const show = (text, kind) => { say.textContent = text || ''; say.className = 'pp5-pf-say' + (kind ? ' ' + kind : ''); };
    const paint = (image) => {
      box.innerHTML = image ? `<img alt="ลายเซ็นของฉัน" src="${esc(image)}">` : '<span>ยังไม่มีลายเซ็น</span>';
      del.hidden = !image;
    };
    const fail = (error) => show(SIGNATURE_MISSING(error) ? 'โรงเรียนยังไม่ได้เปิดระบบลายเซ็นของครู (ต้องติดตั้ง SQL 042) — กรุณาแจ้งผู้ดูแลระบบ'
      : ((error && error.message) || 'ทำรายการไม่สำเร็จ'), 'err');
    try {
      const { data, error } = await client.rpc('pp5_staff_signatures');
      if (error) throw error;
      paint((data || []).find((row) => row.mine)?.image || '');
    } catch (error) { paint(''); fail(error); }
    const save = async (image, doneText) => {
      show('กำลังบันทึก…');
      try {
        const { error } = await client.rpc('pp5_save_my_signature', { p_image: image });
        if (error) throw error;
        paint(image);
        show(doneText, 'ok');
      } catch (error) { fail(error); }
    };
    card.querySelector('[data-sig-upload]').addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const picked = file.files?.[0];
      file.value = '';
      if (!picked) return;
      if (picked.size > 5 * 1024 * 1024) { show('ไฟล์ใหญ่เกิน 5MB กรุณาเลือกรูปที่เล็กลง', 'err'); return; }
      const reader = new global.FileReader();
      reader.onload = async () => {
        try { await save(await shrinkSignature(String(reader.result || '')), 'บันทึกลายเซ็นแล้ว'); } catch (error) { fail(error); }
      };
      reader.readAsDataURL(picked);
    });
    card.querySelector('[data-sig-draw]').addEventListener('click', () => {
      if (typeof global.showSignaturePadModal_ !== 'function') { show('หน้านี้วาดลายเซ็นไม่ได้ กรุณาอัปโหลดรูปแทน', 'err'); return; }
      global.showSignaturePadModal_('ลายเซ็นของฉัน', async (dataUrl) => {
        try { await save(await shrinkSignature(dataUrl), 'บันทึกลายเซ็นแล้ว'); } catch (error) { fail(error); }
      });
    });
    del.addEventListener('click', async () => {
      if (!global.confirm('ลบลายเซ็นของคุณออกจากระบบใช่ไหม? เอกสารที่พิมพ์ต่อจากนี้จะเป็นเส้นจุดให้เซ็นมือ')) return;
      await save('', 'ลบลายเซ็นแล้ว');
    });
  }

  async function mount(root) {
    root.querySelector('[data-password]').addEventListener('click', () => global.navigateTo?.('change_password'));
    themeSwatches(root);
    darkSwitch(root);
    const state = await global.PP5Data.auth.requireUser();
    const p = state.profile || {};
    const name = clean(p.displayName) || clean(p.username) || 'ผู้ใช้';
    renderMe(root, p, name);
    if (p.role === 'teacher' || p.role === 'admin') signatureCard(root).catch(() => { /* การ์ดแสดงข้อผิดพลาดเอง */ });
    if (p.role === 'teacher') {
      let ctx = null;
      try { ctx = await global.PP5Permissions?.context?.(); } catch (_) { ctx = null; }
      renderWork(root, await teacherWork(ctx), 'ยังไม่ได้รับมอบหมายห้องหรือวิชาในปีการศึกษานี้ — ผู้ดูแลระบบมอบหมายได้ที่ งานวิชาการ → มอบหมายงานครู');
    } else if (p.role === 'parent') {
      renderWork(root, await parentWork(), 'ยังไม่ได้ผูกบัญชีกับนักเรียน กรุณาแจ้งโรงเรียน');
    } else if (ROLE_SCOPE[p.role]) {
      renderWork(root, { title: 'ขอบเขตงาน', items: [{ icon: 'bi-check2-circle', text: ROLE_SCOPE[p.role] }] }, '');
    }
  }

  function apply() {
    const root = doc?.getElementById('pp5ProfilePage');
    if (!root || root.__pp5Mounted) return;
    root.__pp5Mounted = true;
    mount(root).catch((error) => {
      const box = root.querySelector('[data-me]');
      if (box) box.insertAdjacentHTML('beforeend', `<p class="pp5-pf-say err">${esc((error && error.message) || error)}</p>`);
    });
  }
  function watch() {
    const frame = doc?.getElementById('contentFrame');
    if (!frame || frame.__pp5Profile) return;
    frame.__pp5Profile = true;
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(apply).observe(frame, { childList: true, subtree: true });
    apply();
    // ชื่อที่มุมขวาบน = ทางลัดไปโปรไฟล์
    const chip = doc.getElementById('appHeaderUserChip');
    if (chip && !chip.__pp5Profile) {
      chip.__pp5Profile = true;
      chip.style.cursor = 'pointer';
      chip.setAttribute('role', 'link');
      chip.setAttribute('tabindex', '0');
      chip.title = 'โปรไฟล์ของฉัน';
      const go = () => global.navigateTo?.('my_profile');
      chip.addEventListener('click', go);
      chip.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(); } });
    }
  }

  global.GAS_PAGES = global.GAS_PAGES || {};
  global.GAS_PAGES.my_profile = shell();
  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
    else watch();
  }
  global.PP5MyProfile = { shell, teacherWork, roleLabel, ROLE_LABEL };
})(window);
