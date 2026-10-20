// ธีมสีส่วนตัวของผู้ใช้แต่ละคน (owner 2026-10-07): ปุ่มจานสีที่หัวเว็บข้างปุ่มโหมดมืด
//   - "ตามโรงเรียน" (ค่าเริ่มต้น) = ใช้ธีมที่ผู้ดูแลตั้งในแท็บ "หน้าตาโรงเรียน"
//   - เลือก 8 สีเดียวกับของโรงเรียน หรือสีเอง: ทับธีมโรงเรียนเฉพาะคนนี้ ไม่กระทบคนอื่น
//   - เก็บกับบัญชี (Supabase Auth user_metadata.pp5_theme ผู้ใช้แก้ของตัวเองได้ ไม่ต้องมี SQL) และจำในเครื่อง
//     (pp5_user_theme / pp5_user_theme_vars ให้สคริปต์ใน <head> ใส่สีก่อนหน้าแสดง)
//   - หลังเข้าสู่ระบบดึงค่าจากบัญชีมาทับเสมอ เครื่องที่ใช้ร่วมกันจึงไม่ค้างสีของคนก่อน
(function initUserTheme(global) {
  'use strict';

  const KEY = 'pp5_user_theme';
  const VARS_KEY = 'pp5_user_theme_vars';
  const SCHOOL_VARS_KEY = 'pp5_theme_vars';
  const txt = (value) => (value === null || value === undefined ? '' : String(value));
  const sb = () => global.PP5SchoolBranding;
  const store = {
    get(key) { try { return global.localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { global.localStorage.setItem(key, value); } catch (_) { /* private mode */ } },
    del(key) { try { global.localStorage.removeItem(key); } catch (_) { /* private mode */ } }
  };

  // ค่าที่ยอมรับ: ชื่อธีมที่มีจริง หรือ custom + สี hex  อย่างอื่น = ไม่มีธีมส่วนตัว
  function valid(raw) {
    if (!raw || typeof raw !== 'object' || !sb()) return null;
    const b = sb().normalize({ theme: raw.theme, customPrimary: raw.customPrimary });
    if (b.theme !== txt(raw.theme).trim()) return null;
    return b.theme === 'custom' ? { theme: 'custom', customPrimary: b.customPrimary } : { theme: b.theme };
  }

  function current() {
    try { return valid(JSON.parse(store.get(KEY) || 'null')); } catch (_) { return null; }
  }

  function palette() {
    const t = current();
    return t ? sb().palette(t) : null;
  }

  function setVars(vars) {
    const root = global.document?.documentElement;
    if (!root || !vars) return;
    sb().VAR_KEYS.forEach((key) => { if (vars[key]) root.style.setProperty(key, vars[key]); });
  }

  // เรียกจาก school-branding ทุกครั้งที่ใส่ธีมโรงเรียน: มีธีมส่วนตัว = ทับอีกชั้น
  function reapply() {
    const t = current();
    if (!t) return false;
    const vars = sb().themeVars(t);
    setVars(vars);
    store.set(VARS_KEY, JSON.stringify(vars));
    return true;
  }

  function restoreSchool() {
    let vars = null;
    try { vars = JSON.parse(store.get(SCHOOL_VARS_KEY) || 'null'); } catch (_) { vars = null; }
    if (vars) setVars(vars);
    else sb().VAR_KEYS.forEach((key) => global.document.documentElement.style.removeProperty(key));
  }

  // รูปแบนเนอร์ (หน้าแรก/แถบหัวหน้า) ทับด้วยสีตอนวาด: เปลี่ยนธีมแล้วระบายใหม่ด้วยสีที่ใช้อยู่
  async function recolorBanners() {
    let p = palette();
    if (!p) {
      const settings = await sb().refresh(false).catch(() => null);
      p = sb().palette(sb().normalize(settings?.settings_json?.branding));
    }
    const rgba = (hex, a) => {
      const m = txt(hex).match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
      return m ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})` : '';
    };
    global.document.querySelectorAll('.pp5-school-banner.has-photo').forEach((el) => {
      el.style.setProperty('--pp5-banner-ov1', rgba(p.primary, 0.9));
      el.style.setProperty('--pp5-banner-ov2', rgba(p.light, 0.55));
      el.style.setProperty('--pp5-banner-ov3', rgba(p.accent, 0.12));
    });
  }

  async function save(choice) {
    const t = valid(choice);
    if (t) { store.set(KEY, JSON.stringify(t)); reapply(); } else { store.del(KEY); store.del(VARS_KEY); restoreSchool(); }
    recolorBanners().catch(() => {});
    markSwatches();
    try { await global.PP5Data?.client?.auth?.updateUser?.({ data: { pp5_theme: t } }); } catch (_) { /* เก็บในเครื่องไว้แล้ว */ }
    return t;
  }

  // หลังเข้าสู่ระบบ: ค่าในบัญชีชนะค่าในเครื่องเสมอ
  async function sync() {
    let user = null;
    try { user = (await global.PP5Data?.client?.auth?.getSession?.())?.data?.session?.user || null; } catch (_) { user = null; }
    if (!user) return;
    const remote = valid(user.user_metadata?.pp5_theme);
    if (JSON.stringify(remote) === JSON.stringify(current())) return;
    if (remote) { store.set(KEY, JSON.stringify(remote)); reapply(); } else { store.del(KEY); store.del(VARS_KEY); restoreSchool(); }
    recolorBanners().catch(() => {});
    markSwatches();
  }

  // ---------- ปุ่มจานสี + กล่องเลือกสี ----------
  function swatchHtml(id, label, colors) {
    return `<button type="button" class="pp5-ut-swatch" data-theme-id="${id}" title="${label}">`
      + `<span class="pp5-ut-chip" style="background:${colors}"></span><span class="pp5-ut-name">${label}</span></button>`;
  }

  function markSwatches() {
    const t = current();
    const id = t ? t.theme : 'school';
    global.document.querySelectorAll('#pp5UserThemePop .pp5-ut-swatch').forEach((btn) => {
      const on = btn.getAttribute('data-theme-id') === id;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const color = global.document.querySelector('#pp5UserThemePop input[type="color"]');
    if (color && t?.theme === 'custom') color.value = t.customPrimary.toLowerCase();
  }

  function buildPopover(button) {
    const pop = global.document.createElement('div');
    pop.id = 'pp5UserThemePop';
    pop.className = 'pp5-ut-pop';
    pop.hidden = true;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'ธีมสีของฉัน');
    const presets = sb().PRESETS;
    pop.innerHTML = '<div class="pp5-ut-head"><i class="bi bi-palette-fill"></i> ธีมสีของฉัน <small>(เห็นเฉพาะบัญชีนี้)</small></div>'
      + '<div class="pp5-ut-grid">'
      + swatchHtml('school', 'ตามโรงเรียน', 'conic-gradient(var(--pp5-brand-1, #4F46E5) 0 50%, #e2e8f0 0)')
      + Object.entries(presets).map(([id, p]) => swatchHtml(id, p.name.replace(' (เดิม)', ''), `linear-gradient(135deg, ${p.primary}, ${p.light} 60%, ${p.accent})`)).join('')
      + '</div>'
      + '<label class="pp5-ut-custom"><span>เลือกสีเอง</span><input type="color" value="#4f46e5" aria-label="เลือกสีเอง"></label>'
      + '<div class="pp5-ut-note">ไม่เปลี่ยนเอกสาร PDF และไม่กระทบผู้ใช้คนอื่น</div>';
    pop.addEventListener('click', (event) => {
      const sw = event.target.closest('.pp5-ut-swatch');
      if (!sw) return;
      const id = sw.getAttribute('data-theme-id');
      save(id === 'school' ? null : { theme: id });
    });
    pop.querySelector('input[type="color"]').addEventListener('change', (event) => {
      save({ theme: 'custom', customPrimary: event.target.value });
    });
    button.after(pop);
    return pop;
  }

  function mountButton() {
    const darkToggle = global.document.getElementById('themeToggle');
    if (!darkToggle || global.document.getElementById('pp5UserThemeBtn') || !sb()) return;
    const wrap = global.document.createElement('div');
    wrap.className = 'pp5-ut-wrap';
    const button = global.document.createElement('button');
    button.type = 'button';
    button.id = 'pp5UserThemeBtn';
    button.className = 'theme-toggle pp5-ut-btn';
    button.setAttribute('aria-label', 'เลือกธีมสีของฉัน');
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.title = 'ธีมสีของฉัน';
    button.innerHTML = '<i class="bi bi-palette-fill"></i>';
    wrap.appendChild(button);
    darkToggle.before(wrap);
    const pop = buildPopover(button);
    const close = () => { pop.hidden = true; button.setAttribute('aria-expanded', 'false'); };
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      pop.hidden = !pop.hidden;
      button.setAttribute('aria-expanded', pop.hidden ? 'false' : 'true');
      if (!pop.hidden) markSwatches();
    });
    global.document.addEventListener('click', (event) => { if (!pop.hidden && !wrap.contains(event.target)) close(); });
    global.document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !pop.hidden) { close(); button.focus(); } });
  }

  function start() {
    if (!sb()) return;
    reapply();
    mountButton();
    setTimeout(() => { sync(); }, 1600);
    // ออกจากระบบ = ล้างสีส่วนตัวในเครื่อง (เครื่องใช้ร่วมกัน)  เข้าสู่ระบบ = ดึงสีของบัญชีใหม่
    try {
      global.PP5Data?.client?.auth?.onAuthStateChange?.((event) => {
        if (event === 'SIGNED_OUT') { store.del(KEY); store.del(VARS_KEY); restoreSchool(); markSwatches(); }
        else if (event === 'SIGNED_IN') setTimeout(() => { sync(); }, 300);
      });
    } catch (_) { /* ไม่มี auth = ใช้ค่าในเครื่อง */ }
  }

  // เมนู "บัญชีผู้ใช้ → ธีมสีของฉัน" (owner 2026-10-20 "เอาธีมสีของแต่ละคนไปอยู่ที่โปรไฟล์") เปิดกล่องเดียวกับปุ่มจานสีที่หัวเว็บ
  // หน่วงหนึ่งจังหวะ: คลิกเมนูยังเดินทางต่อถึง document ซึ่งปิดกล่องเมื่อคลิกนอกปุ่ม
  function open() {
    global.setTimeout(() => {
      try { global.closeFlyout?.(); } catch (_) { /* no flyout */ }
      try { global.closeMobileSidebar?.(); } catch (_) { /* desktop */ }
      const button = global.document.getElementById('pp5UserThemeBtn');
      const pop = global.document.getElementById('pp5UserThemePop');
      if (!button || !pop) return;
      pop.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      markSwatches();
      (pop.querySelector('.pp5-ut-swatch.is-on') || pop.querySelector('.pp5-ut-swatch'))?.focus?.();
    }, 0);
    return false;
  }

  global.PP5UserTheme = { current, palette, reapply, save, sync, valid, open };
  if (global.document) {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(window);
