// แบบประเมินการอ่าน คิดวิเคราะห์ และเขียนของโรงเรียน (owner 2026-10-19 "ให้มีตัวเลือกว่าจะใช้การประเมินแบบไหน ของแต่ละโรงเรียน")
// settings_json.rtw_mode: 'subject' = รายวิชา 8 กลุ่มสาระ · 'criteria' = 5 เกณฑ์ · 'auto' / ไม่ตั้ง = ใช้ทั้งสองแบบ (ค่าเริ่มต้น)
// รายงาน (ปก ปพ.5 / รวมเล่ม / ปพ.5 รายวิชา / ปพ.6 / หน้าเดียว / แดชบอร์ด) อ่านค่านี้ใน js/gas-bridge.js (rtwModeOf_ / rtwMode_)
// ไฟล์นี้: ซ่อนเมนูและการ์ดของแบบที่ไม่ใช้ (html[data-rtw-mode]) + กล่องเลือกในหน้าตั้งค่า (ผู้ดูแลระบบ, บันทึกทันที)
(function initRtwMode(global) {
  const doc = global.document;
  const MODES = {
    auto: { label: 'ใช้ทั้งสองแบบ (อัตโนมัติ)', help: 'รายงานใช้ผลรายวิชา 8 กลุ่มสาระถ้าประเมินครบ ถ้าไม่ครบจึงใช้ผล 5 เกณฑ์ (ดูทีละคน) · แสดงทั้งสองเมนู' },
    subject: { label: 'รายวิชา (8 กลุ่มสาระ)', help: 'ใช้เมนู "ประเมินอ่าน คิด เขียน (รายวิชา)" · รายงานใช้เฉพาะผล 8 กลุ่มสาระ · ซ่อนเมนู 5 เกณฑ์' },
    criteria: { label: '5 เกณฑ์', help: 'ใช้เมนู "ประเมินอ่าน คิด เขียน (5 เกณฑ์)" · ปพ.5 รายวิชาใช้ผลของครูผู้สอนวิชานั้นก่อน ไม่มีจึงใช้ผลของครูประจำชั้น · ซ่อนเมนูรายวิชา' }
  };
  // หน้าที่ซ่อนเมื่อเลือกแบบนั้น
  const HIDE = { subject: 'rtw5_assessment', criteria: 'read_think_write_form' };
  const KEY = 'pp5RtwMode';
  const normal = (mode) => (mode === 'subject' || mode === 'criteria' ? mode : 'auto');

  function installStyle() {
    if (!doc || doc.getElementById('pp5RtwModeStyle')) return;
    const style = doc.createElement('style');
    style.id = 'pp5RtwModeStyle';
    // เมนูข้าง เมนูเด้ง (คัดลอก .nav-link) และการ์ดหน้าหลัก
    style.textContent = Object.entries(HIDE)
      .map(([mode, page]) => `html[data-rtw-mode="${mode}"] :is(.nav-item, .nav-link, .hub-card)[data-page="${page}"]{display:none!important}`).join('\n');
    (doc.head || doc.documentElement).appendChild(style);
  }

  function apply(mode) {
    const value = normal(mode);
    doc?.documentElement?.setAttribute('data-rtw-mode', value);
    try { global.localStorage?.setItem(KEY, value); } catch (_) { /* storage blocked */ }
    return value;
  }

  function cached() {
    try { return normal(global.localStorage?.getItem(KEY)); } catch (_) { return 'auto'; }
  }

  async function refresh() {
    try {
      const settings = await global.PP5Data?.settings?.get?.();
      if (settings) return apply(settings.rtwMode);
    } catch (_) { /* not signed in yet */ }
    return cached();
  }

  async function save(mode) {
    const value = normal(mode);
    await global.PP5Data.settings.setRtwMode(value);
    return apply(value);
  }

  function isAdmin() {
    try { return String(global.localStorage?.getItem('role') || '').toLowerCase() === 'admin'; } catch (_) { return false; }
  }

  // หน้าตั้งค่าระบบ (spa-main เรียกต่อจากกล่องระดับชั้นที่เปิดสอน)
  function enhanceSettingsPage() {
    if (!doc || !isAdmin() || doc.getElementById('pp5RtwModeBox')) return;
    const after = doc.getElementById('pp5GradeLevelsBox') || doc.getElementById('pp5SupabaseExtraSettings');
    if (!after) return;
    const box = doc.createElement('fieldset');
    box.id = 'pp5RtwModeBox';
    box.style.cssText = 'border:1px solid var(--border-color, #e2e8f0);border-radius:12px;padding:12px 14px;margin-top:12px;';
    box.innerHTML = '<legend class="form-label fw-semibold mb-1" style="float:none;width:auto;font-size:inherit">แบบประเมินการอ่าน คิดวิเคราะห์ และเขียนของโรงเรียน</legend>'
      + Object.entries(MODES).map(([key, item]) => `<div class="form-check"><input class="form-check-input" type="radio" name="pp5RtwMode" id="pp5RtwMode_${key}" value="${key}" disabled>`
        + `<label class="form-check-label" for="pp5RtwMode_${key}"><span class="fw-semibold">${item.label}</span><span class="d-block small text-muted">${item.help}</span></label></div>`).join('')
      + '<div class="field-help">เลือกแล้วบันทึกทันที · ใช้กับปก ปพ.5 รวมเล่ม ปพ.5 รายวิชา ปพ.6 และรายงานหน้าเดียว ให้ได้ผลตรงกัน · ผลที่กรอกไว้ในแบบอื่นยังเก็บอยู่ เปลี่ยนกลับได้ <span id="pp5RtwModeStatus" class="small"></span></div>';
    after.insertAdjacentElement('afterend', box);
    const radios = [...box.querySelectorAll('input[name="pp5RtwMode"]')];
    const status = box.querySelector('#pp5RtwModeStatus');
    const show = (message, tone) => { status.textContent = message ? ' · ' + message : ''; status.className = 'small' + (tone ? ' text-' + tone : ''); };
    const check = (mode) => radios.forEach((radio) => { radio.checked = radio.value === mode; });
    refresh().then((mode) => { check(mode); radios.forEach((radio) => { radio.disabled = false; }); });
    radios.forEach((radio) => radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      const before = cached();
      radios.forEach((r) => { r.disabled = true; });
      show('กำลังบันทึก...', 'muted');
      try {
        const mode = await save(radio.value);
        check(mode);
        show('บันทึกแล้ว', 'success');
      } catch (error) {
        check(before);
        show((error && error.message) || 'บันทึกไม่สำเร็จ', 'danger');
      } finally {
        radios.forEach((r) => { r.disabled = false; });
      }
    }));
  }

  global.PP5RtwMode = { MODES, HIDE, normal, apply, refresh, save, enhanceSettingsPage, current: cached };

  if (doc) {
    installStyle();
    apply(cached());
    const start = () => {
      setTimeout(() => { refresh(); }, 1500);
      // เข้าสู่ระบบทีหลัง: อ่านค่าของโรงเรียนอีกครั้ง (setTimeout: supabase-js ห้ามเรียกฐานข้อมูลใน callback นี้ตรง ๆ)
      try {
        global.PP5Data?.client?.auth?.onAuthStateChange?.((event) => { if (event === 'SIGNED_IN') setTimeout(refresh, 0); });
      } catch (_) { /* no auth client */ }
      doc.addEventListener('pp5:settings-saved', () => { setTimeout(refresh, 0); });
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(window);
