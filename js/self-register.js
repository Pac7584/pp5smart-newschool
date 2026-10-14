// ลงทะเบียนบุคลากรด้วยตนเอง (owner 2026-10-14: "ระบบลงทะเบียนผู้ใช้ใหม่ โดยผมเปิด-ปิดโหมดสวิตช์ในหน้าจัดการผู้ใช้"
// อนุมัติเลือกได้ "ครู / ผู้ดูแลระบบ")
// - หน้าจัดการผู้ใช้ (admin_panel): สวิตช์ "เปิดรับลงทะเบียน" (settings_json.self_registration) + รายการรออนุมัติ
//   [อนุมัติเป็นครู] [อนุมัติเป็นผู้ดูแล] [ปฏิเสธ]
// - หน้าเข้าสู่ระบบ: เมื่อเปิดสวิตช์จะมีลิงก์ "ลงทะเบียนบุคลากรใหม่" -> ฟอร์ม -> รอผู้ดูแลอนุมัติ
// งานจริงทำใน Edge Function admin-users (registration-status / register / approve-registration / reject-registration)
// หน้าตาอยู่ใน css/auth-pages.css (ฟอร์ม) และสไตล์ในไฟล์นี้ (แผงผู้ดูแล)
(function initSelfRegister(global) {
  'use strict';
  const doc = global.document;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // เรียก Edge Function; ข้อความ error จากฟังก์ชัน (เช่น "ชื่อผู้ใช้นี้มีคนใช้แล้ว") ส่งต่อให้ผู้ใช้เห็น
  async function call(body) {
    const client = global.PP5Data?.client;
    if (!client?.functions) throw new Error('ระบบยังไม่พร้อม กรุณารีเฟรชหน้า');
    const { data, error } = await client.functions.invoke('admin-users', { body });
    if (error) {
      let message = error.message || 'เชื่อมต่อไม่สำเร็จ';
      try { const detail = await error.context?.json?.(); if (detail?.error) message = detail.error; } catch (_) { /* keep message */ }
      const failure = new Error(message);
      failure.status = Number(error.context?.status) || 0;
      throw failure;
    }
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  // ---------------------------------------------------------------- หน้าเข้าสู่ระบบ
  function loginLink() {
    const box = doc.querySelector('#contentFrame .login-container');
    const forgot = box?.querySelector('.forgot-password-link');
    if (!box || !forgot || box.__pp5RegisterChecked) return;
    box.__pp5RegisterChecked = true;
    call({ action: 'registration-status' }).then((result) => {
      if (!result.enabled || !box.isConnected || box.querySelector('.pp5-register-link')) return;
      const row = doc.createElement('div');
      row.className = 'pp5-register-link';
      row.innerHTML = 'ยังไม่มีบัญชี? <a href="#" data-register>ลงทะเบียนบุคลากรใหม่</a>';
      forgot.after(row);
      row.querySelector('[data-register]').addEventListener('click', (event) => { event.preventDefault(); openForm(); });
    }).catch(() => { /* ฟังก์ชันยังไม่อัปเดตหรือปิดอยู่: ไม่แสดงลิงก์ */ });
  }

  function openForm() {
    doc.getElementById('pp5RegisterOverlay')?.remove();
    const overlay = doc.createElement('div');
    overlay.id = 'pp5RegisterOverlay';
    overlay.innerHTML = `
<div class="pp5-reg-card" role="dialog" aria-modal="true" aria-labelledby="pp5RegTitle">
  <button type="button" class="pp5-reg-close" data-close aria-label="ปิด">×</button>
  <h2 id="pp5RegTitle">ลงทะเบียนบุคลากรใหม่</h2>
  <p class="pp5-reg-sub">สำหรับครูและบุคลากร · บัญชีจะใช้งานได้หลังผู้ดูแลระบบอนุมัติ</p>
  <form data-form novalidate>
    <div class="pp5-reg-grid">
      <label>ชื่อ *<input name="firstName" autocomplete="given-name" required placeholder="เช่น สมปอง"></label>
      <label>นามสกุล *<input name="lastName" autocomplete="family-name" required placeholder="เช่น ใจดี"></label>
      <label>เบอร์โทรศัพท์<input name="phone" inputmode="tel" autocomplete="tel" placeholder="08X-XXX-XXXX"></label>
      <label>อีเมล (ถ้ามี)<input name="email" type="email" autocomplete="email" placeholder="name@school.ac.th"></label>
      <label class="pp5-reg-wide">ชื่อผู้ใช้ (ใช้เข้าระบบ) *<input name="username" autocomplete="username" required placeholder="ภาษาอังกฤษหรือตัวเลข เช่น sompong"></label>
      <label>รหัสผ่าน *<input name="password" type="password" autocomplete="new-password" required placeholder="อย่างน้อย 8 ตัว"></label>
      <label>ยืนยันรหัสผ่าน *<input name="password2" type="password" autocomplete="new-password" required placeholder="พิมพ์อีกครั้ง"></label>
      <label class="pp5-reg-trap" aria-hidden="true">เว็บไซต์<input name="website" tabindex="-1" autocomplete="off"></label>
    </div>
    <div class="pp5-reg-msg" data-msg hidden></div>
    <button type="submit" class="pp5-reg-submit" data-submit>ส่งคำขอลงทะเบียน</button>
    <button type="button" class="pp5-reg-back" data-close>กลับหน้าเข้าสู่ระบบ</button>
  </form>
</div>`;
    doc.body.appendChild(overlay);
    const form = overlay.querySelector('[data-form]');
    const msg = overlay.querySelector('[data-msg]');
    const say = (text, kind) => { msg.hidden = !text; msg.className = `pp5-reg-msg ${kind || ''}`; msg.textContent = text || ''; };
    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    form.querySelector('[name="firstName"]').focus();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const v = Object.fromEntries(new global.FormData(form).entries());
      const username = String(v.username || '').trim().toLowerCase();
      if (!String(v.firstName || '').trim() || !String(v.lastName || '').trim()) return say('กรุณากรอกชื่อและนามสกุล', 'err');
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return say('ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3-30 ตัว', 'err');
      if (String(v.password || '').length < 8) return say('รหัสผ่านต้องยาว 8 ตัวขึ้นไป', 'err');
      if (v.password !== v.password2) return say('รหัสผ่านทั้งสองช่องไม่ตรงกัน', 'err');
      const submit = overlay.querySelector('[data-submit]');
      submit.disabled = true;
      say('กำลังส่งคำขอ…', 'info');
      try {
        await call({ action: 'register', firstName: v.firstName, lastName: v.lastName, phone: v.phone, email: v.email, username, password: v.password, website: v.website });
        overlay.querySelector('.pp5-reg-card').innerHTML = `
  <div class="pp5-reg-done">
    <div class="pp5-reg-done-icon">✓</div>
    <h2>ส่งคำขอเรียบร้อย</h2>
    <p>ผู้ดูแลระบบจะตรวจสอบและอนุมัติบัญชี <strong>${esc(username)}</strong><br>หลังอนุมัติแล้วเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านที่ตั้งไว้ได้ทันที</p>
    <button type="button" class="pp5-reg-submit" data-close>กลับหน้าเข้าสู่ระบบ</button>
  </div>`;
        overlay.querySelector('[data-close]').addEventListener('click', close);
      } catch (error) {
        submit.disabled = false;
        say(error.message || 'ส่งคำขอไม่สำเร็จ', 'err');
      }
    });
  }

  // ---------------------------------------------------------------- หน้าจัดการผู้ใช้
  const PANEL_STYLE = `
.pp5-reg-panel{border:1px solid var(--border-color,#e2e8f0);border-radius:14px;padding:14px 16px;margin:0 0 16px;background:var(--bg-card,#fff)}
.pp5-reg-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.pp5-reg-panel-head strong{font-size:1rem}
.pp5-reg-panel .form-check-input{width:2.6em;height:1.4em;cursor:pointer}
.pp5-reg-hint{color:#64748b;font-size:.85rem;margin-top:4px}
.pp5-reg-pending{margin-top:12px;display:grid;gap:8px}
.pp5-reg-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:10px;background:#fffbeb;border:1px solid #fde68a}
.pp5-reg-row small{color:#64748b}
.pp5-reg-actions{display:flex;gap:6px;flex-wrap:wrap}
.pp5-reg-status{font-size:.85rem;margin-top:8px}
`;

  async function adminPanel() {
    const tabs = doc.querySelector('#contentFrame #roleTabs');
    if (!tabs || !doc.querySelector('#contentFrame #addUserBtn') || doc.getElementById('pp5RegPanel')) return;
    const panel = doc.createElement('div');
    panel.id = 'pp5RegPanel';
    panel.className = 'pp5-reg-panel';
    panel.innerHTML = `<style>${PANEL_STYLE}</style>
<div class="pp5-reg-panel-head">
  <div><strong>🙋 เปิดรับลงทะเบียนบุคลากรใหม่</strong>
    <div class="pp5-reg-hint">เปิดแล้วหน้าเข้าสู่ระบบจะมีลิงก์ "ลงทะเบียนบุคลากรใหม่" · บัญชีใหม่ต้องรออนุมัติก่อนใช้งาน · ปิดเมื่อไม่ใช้</div></div>
  <div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" role="switch" data-switch aria-label="เปิดรับลงทะเบียนบุคลากรใหม่"></div>
</div>
<div class="pp5-reg-pending" data-pending></div>
<div class="pp5-reg-status" data-status></div>`;
    tabs.parentElement.before(panel);
    const sw = panel.querySelector('[data-switch]');
    const status = panel.querySelector('[data-status]');
    const say = (text, color) => { status.textContent = text || ''; status.style.color = color || '#64748b'; };

    try {
      const settings = await global.PP5Data.settings.get();
      sw.checked = settings.settings_json?.self_registration === true;
    } catch (error) { say(`อ่านค่าสวิตช์ไม่สำเร็จ: ${error.message || error}`, '#b91c1c'); }
    sw.addEventListener('change', async () => {
      sw.disabled = true;
      try {
        await global.PP5Data.settings.patchSettingsJson('self_registration', sw.checked, 'บันทึกสวิตช์ไม่สำเร็จ');
        say(sw.checked ? '✅ เปิดรับลงทะเบียนแล้ว' : 'ปิดรับลงทะเบียนแล้ว', sw.checked ? '#047857' : '#64748b');
      } catch (error) {
        sw.checked = !sw.checked;
        say(error.message || String(error), '#b91c1c');
      } finally { sw.disabled = false; }
    });
    await renderPending(panel);
  }

  async function renderPending(panel) {
    const box = panel.querySelector('[data-pending]');
    let users;
    try { users = (await call({ action: 'list' })).users || []; }
    catch (error) { box.innerHTML = `<div class="pp5-reg-hint">ดูคำขอไม่ได้: ${esc(error.message)}</div>`; return; }
    if (users.length && !users.some((u) => Object.prototype.hasOwnProperty.call(u, 'pending'))) {
      box.innerHTML = '<div class="pp5-reg-hint">⚠️ ต้องอัปเดต Edge Function <b>admin-users</b> ใน Supabase ก่อน ระบบลงทะเบียนจึงจะทำงาน</div>';
      return;
    }
    const pending = users.filter((u) => u.pending);
    if (!pending.length) { box.innerHTML = '<div class="pp5-reg-hint">ไม่มีคำขอรออนุมัติ</div>'; return; }
    box.innerHTML = `<strong>⏳ รออนุมัติ ${pending.length} คน</strong>` + pending.map((u) => `
<div class="pp5-reg-row" data-id="${esc(u.id)}">
  <div><strong>${esc(u.display_name)}</strong> <small>(${esc(u.username)})</small><br>
    <small>${esc([u.registration?.phone, u.registration?.email].filter(Boolean).join(' · ') || 'ไม่ได้ให้เบอร์/อีเมล')}</small></div>
  <div class="pp5-reg-actions">
    <button type="button" class="btn btn-sm" data-approve="teacher">อนุมัติเป็นครู</button>
    <button type="button" class="btn btn-sm" data-approve="admin">อนุมัติเป็นผู้ดูแลระบบ</button>
    <button type="button" class="btn btn-sm" data-reject>ปฏิเสธ</button>
  </div>
</div>`).join('');
    box.querySelectorAll('.pp5-reg-row').forEach((row) => {
      const id = row.dataset.id;
      const name = row.querySelector('strong').textContent;
      const done = async (fn, okText) => {
        row.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try {
          await fn();
          panel.querySelector('[data-status]').textContent = okText;
          panel.querySelector('[data-status]').style.color = '#047857';
          doc.querySelector('#contentFrame #refreshBtn')?.click();
          await renderPending(panel);
        } catch (error) {
          row.querySelectorAll('button').forEach((b) => { b.disabled = false; });
          panel.querySelector('[data-status]').textContent = error.message || String(error);
          panel.querySelector('[data-status]').style.color = '#b91c1c';
        }
      };
      row.querySelectorAll('[data-approve]').forEach((button) => button.addEventListener('click', () => {
        const role = button.dataset.approve;
        const label = role === 'admin' ? 'ผู้ดูแลระบบ' : 'ครู';
        if (role === 'admin' && !global.confirm(`อนุมัติ ${name} เป็นผู้ดูแลระบบ? ผู้ดูแลแก้ไขและลบข้อมูลได้ทั้งหมด`)) return;
        done(() => call({ action: 'approve-registration', userId: id, role }), `✅ อนุมัติ ${name} เป็น${label}แล้ว`);
      }));
      row.querySelector('[data-reject]').addEventListener('click', () => {
        if (!global.confirm(`ปฏิเสธและลบคำขอของ ${name}?`)) return;
        done(() => call({ action: 'reject-registration', userId: id }), `ลบคำขอของ ${name} แล้ว`);
      });
    });
  }

  function apply() {
    loginLink();
    adminPanel().catch(() => {});
  }

  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5SelfRegister) return;
    frame.__pp5SelfRegister = true;
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(apply).observe(frame, { childList: true, subtree: true });
    apply();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();

  global.PP5SelfRegister = { openForm, call };
})(window);
