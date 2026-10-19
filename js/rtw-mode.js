// แบบประเมินการอ่าน คิดวิเคราะห์ และเขียนของโรงเรียน (owner 2026-10-19 "ให้มีตัวเลือกว่าจะใช้การประเมินแบบไหน ของแต่ละโรงเรียน")
// settings_json.rtw_mode: 'subject' = รายวิชา 8 กลุ่มสาระ · 'criteria' = 5 เกณฑ์ · 'auto' / ไม่ตั้ง = ใช้ทั้งสองแบบ (ค่าเริ่มต้น)
// รายงาน (ปก ปพ.5 / รวมเล่ม / ปพ.5 รายวิชา / ปพ.6 / หน้าเดียว / แดชบอร์ด) อ่านค่านี้ใน js/gas-bridge.js (rtwModeOf_ / rtwMode_)
// ไฟล์นี้: ซ่อนเมนูและการ์ดของแบบที่ไม่ใช้ (html[data-rtw-mode]) + กล่องเลือกในหน้าตั้งค่า (ผู้ดูแลระบบ, บันทึกทันที)
(function initRtwMode(global) {
  const doc = global.document;
  // การ์ดในหน้าตั้งค่า (owner 2026-10-19 "ง่าย กระชับ ไม่ดูเป็นเอกสาร") — ลำดับ: สองแบบหลัก แล้วอัตโนมัติ เหมือนตัวเลือกรูปแบบ ปพ.5
  const MODES = {
    subject: { title: 'รายวิชา', note: '8 กลุ่มสาระ', icon: 'bi-grid-3x3-gap' },
    criteria: { title: '5 เกณฑ์', note: 'ประเมิน 5 ข้อ', icon: 'bi-list-check' },
    auto: { title: 'อัตโนมัติ', note: 'ใช้ได้ทั้งสองแบบ', icon: 'bi-magic' }
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

  // หน้าตั้งค่าระบบ แท็บ "รูปแบบ ปพ.5" (#pp5FormatTabPane ของ js/pp5-format.js) ต่อจากตัวเลือกรูปแบบ ปพ.5
  // owner 2026-10-19 "ยังไม่เห็นเมนู": รอบแรกวางต่อกล่องระดับชั้นในการ์ดเดิมของแท็บข้อมูลทั่วไป ซึ่ง js/settings-layout.js
  // ซ่อนทั้งการ์ด (#generalTabPane > .card.pp5set-old) จึงมองไม่เห็น — แท็บ ปพ.5 สร้างทีหลังจึงเรียกซ้ำจาก MutationObserver ด้านล่าง
  function enhanceSettingsPage() {
    if (!doc || !isAdmin() || doc.getElementById('pp5RtwModeBox')) return;
    const pane = doc.getElementById('pp5FormatTabPane');
    if (!pane) return;
    // ใช้หน้าตาเดียวกับการ์ด "รูปแบบ ปพ.5" ด้านบน (.pp5fmt ของ js/pp5-format.js ซึ่งอยู่ในแท็บเดียวกันเสมอ)
    const box = doc.createElement('section');
    box.id = 'pp5RtwModeBox';
    box.className = 'pp5fmt';
    box.innerHTML = '<h5><i class="bi bi-book-half"></i> อ่าน คิด เขียน</h5><p>ครูกรอกแบบไหน รายงานทุกฉบับใช้แบบนั้น · เมนูของอีกแบบจะซ่อนไว้</p>'
      + '<div class="pp5fmt-grid" role="radiogroup" aria-label="แบบประเมินอ่าน คิด เขียน">'
      + Object.entries(MODES).map(([key, m]) => `<label class="pp5fmt-opt"><input type="radio" name="pp5RtwMode" value="${key}" disabled>`
        + `<span><b><i class="bi ${m.icon}"></i> ${m.title}</b><small>${m.note}</small></span></label>`).join('')
      + '</div>'
      // owner 2026-10-19: ผลทั้งปีเมื่อยังไม่มีภาค 2 — ปิด (ค่าเริ่มต้น) = "ยังไม่ประเมิน" · เปิด = ใช้ผลภาค 1 ของด้านนั้น (gas-bridge)
      + '<div class="form-check form-switch m-0" style="margin-top:12px!important;padding-top:12px;border-top:1px dashed var(--f-line)">'
      + '<input class="form-check-input" type="checkbox" role="switch" id="pp5AnnualFromTerm1" disabled>'
      + '<label class="form-check-label" for="pp5AnnualFromTerm1"><b>ผลทั้งปีใช้ภาค 1 ได้</b> <small style="color:var(--f-muted)">ถ้ายังไม่มีผลภาค 2</small></label></div>'
      + '<div class="pp5fmt-say" data-say role="status"></div>';
    pane.appendChild(box);
    const radios = [...box.querySelectorAll('input[name="pp5RtwMode"]')];
    const say = box.querySelector('[data-say]');
    const show = (message, tone) => { say.textContent = message || ''; say.className = 'pp5fmt-say' + (tone ? ' is-' + tone : ''); };
    const check = (mode) => radios.forEach((radio) => { radio.checked = radio.value === mode; });
    refresh().then((mode) => { check(mode); radios.forEach((radio) => { radio.disabled = false; }); });
    const annual = box.querySelector('#pp5AnnualFromTerm1');
    Promise.resolve(global.PP5Data?.settings?.get?.()).then((settings) => { annual.checked = settings?.annualFromTerm1 === true; annual.disabled = false; })
      .catch(() => { annual.disabled = false; });
    annual.addEventListener('change', async () => {
      const wanted = annual.checked;
      annual.disabled = true;
      show('กำลังบันทึก…');
      try {
        await global.PP5Data.settings.setAnnualFromTerm1(wanted);
        show(wanted ? 'บันทึกแล้ว — ผลทั้งปีใช้ผลภาค 1 เมื่อยังไม่มีภาค 2' : 'บันทึกแล้ว — ผลทั้งปีรอผลภาค 2', 'ok');
      } catch (error) {
        annual.checked = !wanted;
        show((error && error.message) || 'บันทึกไม่สำเร็จ', 'err');
      } finally {
        annual.disabled = false;
      }
    });
    radios.forEach((radio) => radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      const before = cached();
      radios.forEach((r) => { r.disabled = true; });
      show('กำลังบันทึก…');
      try {
        const mode = await save(radio.value);
        check(mode);
        show(`บันทึกแล้ว — ใช้แบบ${MODES[mode].title}`, 'ok');
      } catch (error) {
        check(before);
        show((error && error.message) || 'บันทึกไม่สำเร็จ', 'err');
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
      // แท็บ ปพ.5 เกิดหลังหน้าตั้งค่าโหลด (pp5-format MutationObserver) — วางกล่องเมื่อแท็บพร้อม
      const frame = doc.getElementById('contentFrame');
      if (frame && typeof global.MutationObserver === 'function') {
        new global.MutationObserver(() => { if (doc.getElementById('pp5FormatTabPane') && !doc.getElementById('pp5RtwModeBox')) enhanceSettingsPage(); })
          .observe(frame, { childList: true, subtree: true });
      }
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(window);
