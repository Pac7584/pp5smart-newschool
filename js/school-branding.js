// หน้าตาโรงเรียน (ใช้ซ้ำได้ทุกโรงเรียน): ธีมสี + คำขวัญ/สโลแกน + แบนเนอร์หน้าหลัก
//   - เก็บใน school_settings.settings_json.branding (PP5Data.settings.setBranding) ไม่มีค่าของโรงเรียนใดฝังในโค้ด
//   - ธีมเปลี่ยนตัวแปร CSS กลาง (--primary ...) ธีมเริ่มต้น "indigo" = สีเดิมของระบบทุกค่า จึงไม่มีอะไรเปลี่ยนจนกว่าผู้ดูแลจะเลือก
//   - ค่าสีล่าสุดจำไว้ใน localStorage (pp5_theme_vars) ให้สคริปต์สั้นใน <head> ของ index.html ใส่ก่อนหน้าแสดง (ไม่กะพริบ)
//   - แท็บ "หน้าตาโรงเรียน" ในหน้าตั้งค่า (เฉพาะผู้ดูแล) และแบนเนอร์บนหน้าหลัก (ทุกคน)
(function initSchoolBranding(global) {
  'use strict';

  const PRESETS = {
    indigo: { name: 'ม่วงคราม (เดิม)', primary: '#4F46E5', light: '#6366F1', accent: '#06B6D4' },
    blue: { name: 'น้ำเงิน', primary: '#1D4ED8', light: '#3B82F6', accent: '#06B6D4' },
    sky: { name: 'ฟ้าทะเล', primary: '#0369A1', light: '#0EA5E9', accent: '#14B8A6' },
    green: { name: 'เขียว', primary: '#15803D', light: '#22C55E', accent: '#84CC16' },
    teal: { name: 'เขียวหัวเป็ด', primary: '#0F766E', light: '#14B8A6', accent: '#0EA5E9' },
    orange: { name: 'ส้ม', primary: '#C2410C', light: '#F97316', accent: '#F59E0B' },
    maroon: { name: 'แดงเลือดหมู', primary: '#9F1239', light: '#E11D48', accent: '#F59E0B' },
    purple: { name: 'ม่วง', primary: '#7E22CE', light: '#A855F7', accent: '#EC4899' }
  };
  const DEFAULT_THEME = 'indigo';
  const CACHE_KEY = 'pp5_theme_vars';
  // คีย์ที่สคริปต์ใน <head> ยอมใส่ได้ (ตรงกับรายการใน index.html)
  const VAR_KEYS = ['--primary', '--primary-light', '--accent', '--sidebar-active', '--sidebar-active-border', '--pp5-brand-1', '--pp5-brand-2', '--pp5-brand-3'];
  const LIMITS = { motto: 120, mottoMeaning: 160, slogan: 80 };

  const txt = (value) => (value === null || value === undefined ? '' : String(value));
  const esc = (value) => txt(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const isHex = (value) => /^#[0-9a-f]{6}$/i.test(txt(value).trim());
  const clip = (value, max) => txt(value).replace(/\s+/g, ' ').trim().slice(0, max);

  // ---------- สี ----------
  function rgb(hex) {
    const h = txt(hex).replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  function hex([r, g, b]) {
    return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function mix(a, b, amount) {
    const x = rgb(a); const y = rgb(b);
    return hex(x.map((v, i) => v + (y[i] - v) * amount));
  }
  function rgba(color, alpha) {
    const [r, g, b] = rgb(color);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  function luminance(color) {
    return rgb(color).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  }
  // อัตราส่วนความต่างของสีกับตัวหนังสือสีขาว (WCAG): ปุ่มและแถบใช้ตัวหนังสือขาว ต้องได้อย่างน้อย 4.5
  function contrastWithWhite(color) {
    return 1.05 / (luminance(color) + 0.05);
  }
  // สีที่ผู้ดูแลเลือกเองถ้าอ่อนเกินไป ค่อย ๆ เข้มขึ้นจนตัวหนังสือขาวอ่านออก
  function ensureContrast(color) {
    let out = txt(color).toUpperCase();
    for (let i = 0; i < 20 && contrastWithWhite(out) < 4.5; i += 1) out = mix(out, '#000000', 0.08);
    return out;
  }

  // ---------- ค่าที่เก็บ ----------
  function normalize(raw) {
    const b = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const customPrimary = isHex(b.customPrimary) ? txt(b.customPrimary).trim().toUpperCase() : '';
    let theme = txt(b.theme).trim();
    if (theme === 'custom' ? !customPrimary : !PRESETS[theme]) theme = DEFAULT_THEME;
    return {
      theme,
      customPrimary,
      motto: clip(b.motto, LIMITS.motto),
      mottoMeaning: clip(b.mottoMeaning, LIMITS.mottoMeaning),
      slogan: clip(b.slogan, LIMITS.slogan),
      showMotto: b.showMotto !== false,
      showSlogan: b.showSlogan !== false,
      showAffiliation: b.showAffiliation !== false,
      // รูปพื้นหลังแบนเนอร์ใน bucket school-branding (migration 202610070024) ชื่อไฟล์ระบบตั้งเอง จึงตรวจรูปแบบเข้มงวด
      bannerPath: BANNER_PATH.test(txt(b.bannerPath)) ? txt(b.bannerPath) : '',
      bannerFocus: Number.isFinite(Number(b.bannerFocus)) ? Math.max(0, Math.min(100, Math.round(Number(b.bannerFocus)))) : 50
    };
  }

  // ---------- รูปพื้นหลังแบนเนอร์ ----------
  const BANNER_BUCKET = 'school-branding';
  const BANNER_PATH = /^banner\/[0-9]{10,16}\.(webp|jpg)$/;
  const BANNER_MAX_WIDTH = 1800;

  function bannerUrl(path) {
    if (!BANNER_PATH.test(txt(path))) return '';
    const url = global.PP5Data?.client?.storage?.from(BANNER_BUCKET)?.getPublicUrl(path)?.data?.publicUrl || '';
    return /^https:\/\/[^\s"'()]+$/.test(url) ? url : '';
  }

  // ย่อรูปในเบราว์เซอร์ก่อนอัปโหลด: กว้างไม่เกิน 1800 px, WebP (เบราว์เซอร์ที่ทำ WebP ไม่ได้ใช้ JPEG)
  async function resizeBanner(file) {
    const bitmap = typeof global.createImageBitmap === 'function'
      ? await global.createImageBitmap(file, { imageOrientation: 'from-image' })
      : await new Promise((resolve, reject) => {
        const img = new Image(); const url = URL.createObjectURL(file);
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดไฟล์รูปนี้ไม่ได้ (ลองบันทึกเป็น JPG หรือ PNG)')); };
        img.src = url;
      });
    const w = bitmap.width || bitmap.naturalWidth; const h = bitmap.height || bitmap.naturalHeight;
    if (!w || !h) throw new Error('เปิดไฟล์รูปนี้ไม่ได้');
    if (w < 600) throw new Error('รูปเล็กเกินไป (ควรกว้างอย่างน้อย 600 px) แบนเนอร์จะไม่คมชัด');
    const scale = Math.min(1, BANNER_MAX_WIDTH / w);
    const canvas = global.document.createElement('canvas');
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (typeof bitmap.close === 'function') bitmap.close();
    const webp = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp' };
    const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!jpeg) throw new Error('ย่อรูปไม่สำเร็จ');
    return { blob: jpeg, ext: 'jpg' };
  }

  function storageMessage(error) {
    const m = txt(error?.message || error);
    if (/bucket not found|not found/i.test(m)) return 'ยังไม่ได้ติดตั้งที่เก็บรูปแบนเนอร์ (migration 202610070024) ให้ผู้ดูแลระบบติดตั้งก่อน';
    if (/row-level security|unauthorized|permission/i.test(m)) return 'บัญชีนี้ไม่มีสิทธิ์อัปโหลดรูปแบนเนอร์ (เฉพาะผู้ดูแลระบบ)';
    if (/size|too large|exceeded/i.test(m)) return 'รูปใหญ่เกิน 2 MB หลังย่อแล้ว ลองใช้รูปที่เล็กลง';
    return m || 'อัปโหลดรูปไม่สำเร็จ';
  }

  async function uploadBanner(blob, ext) {
    const bucket = global.PP5Data?.client?.storage?.from(BANNER_BUCKET);
    if (!bucket) throw new Error('ระบบเก็บไฟล์ยังไม่พร้อม กรุณาโหลดหน้าใหม่');
    const path = `banner/${Date.now()}.${ext}`;
    const { error } = await bucket.upload(path, blob, { contentType: ext === 'webp' ? 'image/webp' : 'image/jpeg', upsert: false, cacheControl: '31536000' });
    if (error) throw new Error(storageMessage(error));
    return path;
  }

  async function removeBannerFile(path) {
    if (!BANNER_PATH.test(txt(path))) return;
    try { await global.PP5Data?.client?.storage?.from(BANNER_BUCKET)?.remove([path]); } catch (_) { /* ไฟล์เก่าค้างไม่กระทบการใช้งาน */ }
  }

  function palette(branding) {
    const b = normalize(branding);
    if (b.theme !== 'custom') return PRESETS[b.theme];
    const primary = ensureContrast(b.customPrimary);
    return { name: 'สีที่เลือกเอง', primary, light: mix(primary, '#FFFFFF', 0.22), accent: mix(primary, '#06B6D4', 0.45) };
  }

  function themeVars(branding) {
    const p = palette(branding);
    return {
      '--primary': p.primary,
      '--primary-light': p.light,
      '--accent': p.accent,
      '--sidebar-active': rgba(p.light, 0.1),
      '--sidebar-active-border': p.primary,
      '--pp5-brand-1': p.primary,
      '--pp5-brand-2': p.light,
      '--pp5-brand-3': p.accent
    };
  }

  function applyVars(vars) {
    const root = global.document?.documentElement;
    if (!root) return;
    VAR_KEYS.forEach((key) => { if (vars[key]) root.style.setProperty(key, vars[key]); });
  }

  function applyTheme(branding, remember) {
    const vars = themeVars(branding);
    applyVars(vars);
    if (remember) {
      try { global.localStorage.setItem(CACHE_KEY, JSON.stringify(vars)); } catch (_) { /* private mode */ }
    }
    // ธีมสีส่วนตัวของผู้ใช้ (js/user-theme.js) ทับธีมโรงเรียนอีกชั้น  ค่าที่จำไว้ข้างบนยังเป็นของโรงเรียน
    global.PP5UserTheme?.reapply?.();
    return vars;
  }

  // ---------- อ่านค่าโรงเรียน ----------
  let settingsPromise = null;
  let settingsAt = 0;
  // บันทึกค่าตั้งแล้ว (js/supabaseClient.js) ล้างค่าที่จำไว้ หน้าหลักจะแสดงสังกัด/ชื่อใหม่ทันที
  global.document?.addEventListener?.('pp5:settings-saved', () => { settingsPromise = null; });
  function loadSettings(force) {
    const data = global.PP5Data;
    if (!data?.settings?.get) return Promise.resolve(null);
    if (!force && settingsPromise && Date.now() - settingsAt < 60000) return settingsPromise;
    settingsAt = Date.now();
    settingsPromise = data.settings.get().catch(() => null);
    return settingsPromise;
  }

  function brandingOf(settings) {
    return normalize(settings?.settings_json?.branding);
  }

  function applyTitle(settings) {
    const name = txt(settings?.schoolName || settings?.school_name).trim();
    if (name && global.document) global.document.title = `ระบบจัดการนักเรียน ปพ.5 — ${name}`;
  }

  async function refresh(force) {
    const settings = await loadSettings(force);
    if (!settings) return null;
    applyTheme(brandingOf(settings), true);
    applyTitle(settings);
    return settings;
  }

  // ---------- แบนเนอร์หน้าหลัก ----------
  // ใช้กล่อง .hub-welcome เดิม (ตรา + ชื่อโรงเรียน) แล้วเติมสังกัด คำขวัญ สโลแกน ข้อความทุกส่วนใส่ด้วย textContent
  // previewUrl: รูปที่เพิ่งเลือกในหน้าตั้งค่า (blob: ยังไม่อัปโหลด) ใช้แทนรูปที่บันทึกไว้
  function fillBanner(welcome, settings, previewUrl) {
    const b = brandingOf(settings);
    welcome.classList.add('pp5-school-banner');
    const photo = previewUrl === '' ? '' : (/^blob:/.test(txt(previewUrl)) ? txt(previewUrl) : bannerUrl(b.bannerPath));
    welcome.classList.toggle('has-photo', !!photo);
    if (photo) {
      // ทับรูปด้วยสีธีม (ซ้ายเข้ม ขวาจาง) ตัวหนังสือสีขาวจึงอ่านออกไม่ว่ารูปจะสว่างแค่ไหน
      const p = global.PP5UserTheme?.palette?.() || palette(b);
      welcome.style.setProperty('--pp5-banner-img', `url("${photo}")`);
      welcome.style.setProperty('--pp5-banner-pos', `center ${b.bannerFocus}%`);
      welcome.style.setProperty('--pp5-banner-ov1', rgba(p.primary, 0.9));
      welcome.style.setProperty('--pp5-banner-ov2', rgba(p.light, 0.55));
      welcome.style.setProperty('--pp5-banner-ov3', rgba(p.accent, 0.12));
    } else {
      ['--pp5-banner-img', '--pp5-banner-pos', '--pp5-banner-ov1', '--pp5-banner-ov2', '--pp5-banner-ov3'].forEach((k) => welcome.style.removeProperty(k));
    }
    const textBox = welcome.querySelector('.hub-welcome-text');
    if (!textBox) return;
    let extra = textBox.querySelector('.pp5-banner-extra');
    if (!extra) {
      extra = global.document.createElement('div');
      extra.className = 'pp5-banner-extra';
      extra.innerHTML = '<div class="pp5-banner-aff"></div><div class="pp5-banner-motto"><span class="pp5-banner-pali"></span><span class="pp5-banner-meaning"></span></div>';
      textBox.appendChild(extra);
    }
    const aff = txt(settings?.affiliation).trim();
    const setLine = (sel, value, show) => {
      const el = extra.querySelector(sel);
      el.textContent = value;
      el.hidden = !(show && value);
    };
    setLine('.pp5-banner-aff', aff, b.showAffiliation);
    setLine('.pp5-banner-pali', b.motto ? `“${b.motto}”` : '', b.showMotto);
    setLine('.pp5-banner-meaning', b.mottoMeaning, b.showMotto);
    extra.querySelector('.pp5-banner-motto').hidden = !(b.showMotto && (b.motto || b.mottoMeaning));
    let slogan = welcome.querySelector('.pp5-banner-slogan');
    if (!slogan) {
      slogan = global.document.createElement('div');
      slogan.className = 'pp5-banner-slogan';
      welcome.appendChild(slogan);
    }
    slogan.textContent = b.slogan ? `“${b.slogan}”` : '';
    slogan.hidden = !(b.showSlogan && b.slogan);
    const name = txt(settings?.schoolName || settings?.school_name).trim();
    const h1 = welcome.querySelector('#hubSchoolName');
    if (h1 && name && h1.textContent !== name) h1.textContent = name;
  }

  async function decorateHome(hubPage) {
    const welcome = hubPage?.querySelector?.('.hub-welcome');
    if (!welcome) return;
    welcome.classList.add('pp5-school-banner');
    const settings = await refresh(false);
    if (settings && welcome.isConnected) fillBanner(welcome, settings);
  }

  // ---------- แท็บ "หน้าตาโรงเรียน" ในหน้าตั้งค่า ----------
  function isAdmin() {
    try { return txt(global.localStorage.getItem('role')).toLowerCase() === 'admin'; } catch (_) { return false; }
  }

  function swatchesHtml(current) {
    return Object.entries(PRESETS).map(([key, p]) => `<label class="pp5-sb-swatch${current === key ? ' is-on' : ''}">`
      + `<input type="radio" name="pp5SbTheme" value="${key}"${current === key ? ' checked' : ''}>`
      + `<span class="pp5-sb-chip" style="background:linear-gradient(135deg,${p.primary},${p.light} 60%,${p.accent})"></span>`
      + `<span class="pp5-sb-name">${esc(p.name)}</span></label>`).join('')
      + `<label class="pp5-sb-swatch${current === 'custom' ? ' is-on' : ''}"><input type="radio" name="pp5SbTheme" value="custom"${current === 'custom' ? ' checked' : ''}>`
      + '<span class="pp5-sb-chip pp5-sb-chip-custom"><i class="bi bi-eyedropper" aria-hidden="true"></i></span><span class="pp5-sb-name">เลือกสีเอง</span></label>';
  }

  function mountSettings(pane) {
    pane.innerHTML = '<div class="pp5-sb"><div class="pp5-sb-muted">กำลังโหลด...</div></div>';
    const host = pane.firstElementChild;
    refresh(true).then((settings) => {
      if (!settings) { host.innerHTML = '<div class="alert alert-warning">อ่านการตั้งค่าโรงเรียนไม่ได้ ลองโหลดหน้าใหม่</div>'; return; }
      const saved = brandingOf(settings);
      host.innerHTML = `
        <p class="pp5-sb-muted">ปรับหน้าตาให้เป็นของโรงเรียน ใช้ได้ทุกเครื่องของโรงเรียนนี้ (ไม่กระทบข้อมูลคะแนนหรือเอกสาร ปพ.)</p>
        <section class="pp5-sb-card">
          <h6><i class="bi bi-palette2" aria-hidden="true"></i> ธีมสีของโรงเรียน <small class="pp5-sb-muted" style="font-weight:500">สีเริ่มต้นของทุกคน</small></h6>
          <div class="pp5-sb-swatches" data-swatches>${swatchesHtml(saved.theme)}</div>
          <div class="pp5-sb-custom" data-custom${saved.theme === 'custom' ? '' : ' hidden'}>
            <label>สีหลัก <input type="color" data-custom-color value="${esc(saved.customPrimary || '#2563EB')}"></label>
            <span class="pp5-sb-note" data-contrast></span>
          </div>
          <p class="pp5-sb-note">เลือกแล้วเห็นผลทันทีทั้งหน้า (ยังไม่บันทึก) บางหน้าเก่าอาจยังมีสีม่วงเดิมบางจุด · แต่ละคนเลือกสีของตัวเองได้ที่ <b>บัญชีผู้ใช้ → ธีมสีของฉัน</b> (ทับสีนี้เฉพาะบัญชีนั้น)</p>
        </section>
        <section class="pp5-sb-card">
          <h6><i class="bi bi-flag" aria-hidden="true"></i> แบนเนอร์หน้าหลัก</h6>
          <div class="row g-3">
            <div class="col-md-6"><label class="form-label">คำขวัญ (เช่น ภาษาบาลี)</label>
              <input class="form-control" data-field="motto" maxlength="${LIMITS.motto}" value="${esc(saved.motto)}" placeholder="เช่น นตฺถิ ปญฺญาสมา อาภา"></div>
            <div class="col-md-6"><label class="form-label">ความหมายของคำขวัญ</label>
              <input class="form-control" data-field="mottoMeaning" maxlength="${LIMITS.mottoMeaning}" value="${esc(saved.mottoMeaning)}" placeholder="เช่น ไม่มีแสงสว่างใดเสมอด้วยปัญญา"></div>
            <div class="col-md-6"><label class="form-label">สโลแกน</label>
              <input class="form-control" data-field="slogan" maxlength="${LIMITS.slogan}" value="${esc(saved.slogan)}" placeholder="เช่น โรงเรียนขนาดเล็ก คุณภาพไม่เล็ก"></div>
            <div class="col-md-6 pp5-sb-toggles">
              <label class="form-check"><input class="form-check-input" type="checkbox" data-flag="showAffiliation"${saved.showAffiliation ? ' checked' : ''}> <span class="form-check-label">แสดงสังกัด</span></label>
              <label class="form-check"><input class="form-check-input" type="checkbox" data-flag="showMotto"${saved.showMotto ? ' checked' : ''}> <span class="form-check-label">แสดงคำขวัญ</span></label>
              <label class="form-check"><input class="form-check-input" type="checkbox" data-flag="showSlogan"${saved.showSlogan ? ' checked' : ''}> <span class="form-check-label">แสดงสโลแกน</span></label>
            </div>
          </div>
          <div class="pp5-sb-photo">
            <div class="pp5-sb-photo-head"><b>รูปพื้นหลัง</b> <span class="pp5-sb-note">(เช่น รูปอาคารเรียน แนวนอน ระบบย่อรูปให้เอง)</span></div>
            <div class="pp5-sb-photo-row">
              <label class="btn btn-outline-primary mb-0"><input type="file" accept="image/jpeg,image/png,image/webp" data-photo-file hidden><i class="bi bi-image" aria-hidden="true"></i> เลือกรูป</label>
              <button type="button" class="btn btn-outline-danger" data-photo-remove${saved.bannerPath ? '' : ' hidden'}><i class="bi bi-trash3" aria-hidden="true"></i> ไม่ใช้รูป</button>
              <label class="pp5-sb-focus"${saved.bannerPath ? '' : ' hidden'} data-focus-wrap>ตำแหน่งรูป บน–ล่าง <input type="range" min="0" max="100" step="5" data-focus value="${saved.bannerFocus}"></label>
            </div>
            <div class="pp5-sb-note" data-photo-msg></div>
          </div>
          <div class="pp5-sb-preview-label">ตัวอย่าง</div>
          <div class="hub-welcome pp5-school-banner pp5-sb-preview" data-preview>
            <img class="hub-logo" alt="" data-preview-logo hidden>
            <div class="hub-welcome-text"><h1 data-preview-name></h1></div>
          </div>
          <p class="pp5-sb-note">ชื่อโรงเรียน สังกัด และตรา แก้ได้ในแท็บข้อมูลโรงเรียนเหมือนเดิม</p>
        </section>
        <div class="pp5-sb-actions">
          <span class="pp5-sb-status" data-status role="status"></span>
          <button type="button" class="btn btn-outline-secondary" data-reset>คืนค่าที่บันทึกไว้</button>
          <button type="button" class="btn btn-primary" data-save><i class="bi bi-floppy-fill" aria-hidden="true"></i> บันทึกหน้าตาโรงเรียน</button>
        </div>`;

      const $ = (sel) => host.querySelector(sel);
      // รูปที่เลือกแต่ยังไม่บันทึก (ย่อแล้ว) / ผู้ดูแลกด "ไม่ใช้รูป"
      const photo = { pending: null, previewUrl: '', removed: false };
      const current = () => {
        const theme = host.querySelector('input[name="pp5SbTheme"]:checked')?.value || DEFAULT_THEME;
        const out = { theme, customPrimary: $('[data-custom-color]').value, bannerPath: photo.removed ? '' : saved.bannerPath, bannerFocus: $('[data-focus]').value };
        host.querySelectorAll('[data-field]').forEach((el) => { out[el.getAttribute('data-field')] = el.value; });
        host.querySelectorAll('[data-flag]').forEach((el) => { out[el.getAttribute('data-flag')] = el.checked; });
        return normalize(out);
      };
      const photoUi = () => {
        const has = !!photo.pending || (!photo.removed && !!saved.bannerPath);
        $('[data-photo-remove]').hidden = !has;
        $('[data-focus-wrap]').hidden = !has;
      };
      $('[data-photo-file]').addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        const msg = $('[data-photo-msg]');
        msg.textContent = 'กำลังย่อรูป...';
        try {
          const out = await resizeBanner(file);
          if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
          photo.pending = out;
          photo.previewUrl = URL.createObjectURL(out.blob);
          photo.removed = false;
          msg.textContent = `พร้อมใช้ (${Math.round(out.blob.size / 1024)} KB) กด "บันทึกหน้าตาโรงเรียน" เพื่ออัปโหลด`;
        } catch (error) {
          msg.textContent = txt(error?.message || error);
        }
        photoUi();
        render();
      });
      $('[data-photo-remove]').addEventListener('click', () => {
        if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
        photo.pending = null; photo.previewUrl = ''; photo.removed = true;
        $('[data-photo-msg]').textContent = 'จะไม่ใช้รูปพื้นหลัง (กดบันทึกเพื่อยืนยัน)';
        photoUi();
        render();
      });
      const preview = $('[data-preview]');
      preview.querySelector('[data-preview-name]').textContent = txt(settings.schoolName || settings.school_name) || 'ชื่อโรงเรียน';
      const logo = txt(settings.logo_base64);
      if (/^data:image\//.test(logo) || /^https:\/\//.test(logo)) {
        const img = preview.querySelector('[data-preview-logo]');
        img.src = logo;
        img.hidden = false;
      }
      const render = () => {
        const b = current();
        $('[data-custom]').hidden = b.theme !== 'custom';
        host.querySelectorAll('.pp5-sb-swatch').forEach((el) => el.classList.toggle('is-on', el.querySelector('input').checked));
        if (b.theme === 'custom') {
          const used = palette(b).primary;
          $('[data-contrast]').textContent = used === b.customPrimary ? 'ตัวหนังสือสีขาวบนสีนี้อ่านง่าย'
            : `สีนี้อ่อนเกินไปสำหรับตัวหนังสือสีขาว ระบบจะใช้ ${used} แทน`;
        }
        applyTheme(b, false);
        fillBanner(preview, { ...settings, settings_json: { ...(settings.settings_json || {}), branding: b } }, photo.removed ? '' : (photo.previewUrl || undefined));
      };
      host.addEventListener('input', render);
      host.addEventListener('change', render);
      render();

      $('[data-reset]').addEventListener('click', () => { mountSettings(pane); applyTheme(saved, false); });
      $('[data-save]').addEventListener('click', async () => {
        const btn = $('[data-save]');
        const status = $('[data-status]');
        btn.disabled = true;
        status.textContent = 'กำลังบันทึก...';
        let uploaded = '';
        try {
          const b = current();
          if (photo.pending) {
            status.textContent = 'กำลังอัปโหลดรูป...';
            uploaded = await uploadBanner(photo.pending.blob, photo.pending.ext);
            b.bannerPath = uploaded;
          }
          await global.PP5Data.settings.setBranding(b);
          // บันทึกค่าแล้วจึงลบรูปเก่า (ถ้ามี) ไม่ให้แบนเนอร์ชี้ไปที่ไฟล์ที่หายไป
          if (saved.bannerPath && saved.bannerPath !== b.bannerPath) await removeBannerFile(saved.bannerPath);
          uploaded = '';
          applyTheme(b, true);
          await refresh(true);
          status.textContent = 'บันทึกแล้ว ทุกเครื่องจะเห็นเมื่อเปิดหน้าใหม่';
          mountSettings(pane);
          return;
        } catch (error) {
          // อัปโหลดแล้วแต่บันทึกค่าไม่สำเร็จ: ลบรูปใหม่ทิ้ง ไม่ให้ค้างในที่เก็บ
          if (uploaded) await removeBannerFile(uploaded);
          status.textContent = `บันทึกไม่สำเร็จ: ${txt(error?.message || error)}`;
        } finally {
          btn.disabled = false;
        }
      });
      // ออกจากหน้าตั้งค่าโดยไม่บันทึก: คืนสีที่บันทึกไว้
      const restore = () => { if (!pane.isConnected) { refresh(false); global.document.removeEventListener('click', watchLeave, true); } };
      const watchLeave = () => setTimeout(restore, 300);
      global.document.addEventListener('click', watchLeave, true);
    });
  }

  function enhanceSettingsPage() {
    if (!isAdmin()) return;
    const nav = global.document.getElementById('settingsTab');
    const content = global.document.getElementById('settingsTabContent');
    if (!nav || !content || global.document.getElementById('branding-tab')) return;
    const li = global.document.createElement('li');
    li.className = 'nav-item';
    li.setAttribute('role', 'presentation');
    li.innerHTML = '<button class="nav-link" id="branding-tab" data-bs-toggle="pill" data-bs-target="#brandingTabPane" type="button" role="tab" aria-controls="brandingTabPane" aria-selected="false">'
      + '<i class="bi bi-palette2" aria-hidden="true"></i> หน้าตาโรงเรียน</button>';
    nav.appendChild(li);
    const pane = global.document.createElement('div');
    pane.className = 'tab-pane fade';
    pane.id = 'brandingTabPane';
    pane.setAttribute('role', 'tabpanel');
    pane.setAttribute('aria-labelledby', 'branding-tab');
    content.appendChild(pane);
    let mounted = false;
    li.querySelector('button').addEventListener('click', () => { if (!mounted) { mounted = true; mountSettings(pane); } });
  }

  // ---------- เริ่มทำงาน ----------
  function start() {
    try {
      const cached = JSON.parse(global.localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && typeof cached === 'object') applyVars(Object.fromEntries(VAR_KEYS.filter((k) => /^(#[0-9A-Fa-f]{6}|rgba\([0-9., ]+\))$/.test(txt(cached[k]))).map((k) => [k, cached[k]])));
    } catch (_) { /* no cache */ }
    // หลังเข้าสู่ระบบ: อ่านค่าจริงของโรงเรียน (ก่อนเข้าสู่ระบบอ่านไม่ได้ก็ไม่เป็นไร ใช้ค่าที่จำไว้)
    setTimeout(() => { refresh(false); }, 1500);
  }

  global.PP5SchoolBranding = { PRESETS, VAR_KEYS, normalize, palette, themeVars, contrastWithWhite, ensureContrast, applyTheme, refresh, decorateHome, enhanceSettingsPage, fillBanner, bannerUrl, BANNER_PATH };
  if (global.document) {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(window);
