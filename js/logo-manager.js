// หน้า "ตราโรงเรียน" แบบใหม่ (owner 2026-10-14: "ระบบโลโก้มีปัญหา วางแผนใหม่ให้ผู้ใช้สะดวก")
// แทนหน้าเดิม logo_management (gas-pages, ระบบ Google Drive เดิม) ด้วยขั้นตอนเดียว:
//   ① เลือกรูป / ลากมาวาง / Ctrl+V   ② ดูตัวอย่าง (หน้าเข้าสู่ระบบ + หัวเอกสาร)   ③ บันทึกตรานี้   (ลบตรา ได้)
// - ย่อรูปในเบราว์เซอร์ให้ด้านยาวไม่เกิน MAX_SIDE px เป็น PNG (คงพื้นโปร่งใส) จึงไม่ต้องสนใจขนาดไฟล์
// - บันทึกผ่าน PP5Data.settings.save({ logo_base64 }) ช่องเดิม (หน้าเข้าสู่ระบบ / PDF อ่านจากช่องนี้อยู่แล้ว)
// - ลิงก์ Google Drive ที่โรงเรียนเคยตั้งไว้ยังแสดงได้ (ไม่ต้องตั้งใหม่)
(function initLogoManager(global) {
  'use strict';
  const doc = global.document;
  const MAX_SIDE = 600;
  const MAX_CHARS = 900000; // ~650 KB ของรูป: ใหญ่กว่านี้ย่อลงอีก
  const ACCEPT = /^image\/(png|jpe?g|webp|gif|svg\+xml|bmp)$/i;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new global.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('เปิดรูปนี้ไม่ได้ ลองใช้ไฟล์ PNG หรือ JPG'));
      img.src = src;
    });
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new global.FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
      reader.readAsDataURL(file);
    });
  }

  // ย่อให้ด้านยาวไม่เกิน side px, PNG คงความโปร่งใส
  function shrink(img, side) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('รูปนี้ไม่มีขนาด');
    const scale = Math.min(1, side / Math.max(w, h));
    const canvas = doc.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }

  async function prepare(file) {
    if (!file) throw new Error('ยังไม่ได้เลือกรูป');
    if (file.type && !ACCEPT.test(file.type)) throw new Error('ต้องเป็นไฟล์รูปภาพ (PNG, JPG, WEBP, SVG)');
    const img = await loadImage(await readFile(file));
    let side = MAX_SIDE;
    let dataUrl = shrink(img, side);
    while (dataUrl.length > MAX_CHARS && side > 200) {
      side = Math.round(side * 0.75);
      dataUrl = shrink(img, side);
    }
    return dataUrl;
  }

  const STYLE = `
.pp5-logo{max-width:880px;margin:0 auto;display:grid;gap:16px}
.pp5-logo-card{background:var(--bg-card,#fff);border:1px solid var(--border-color,#e2e8f0);border-radius:16px;padding:20px 22px;box-shadow:0 2px 10px rgba(15,23,42,.05)}
.pp5-logo-head{display:flex;align-items:center;gap:12px;margin-bottom:4px}
.pp5-logo-head h2{margin:0;font-size:1.35rem;font-weight:800}
.pp5-logo-sub{color:#64748b;margin:0 0 14px}
.pp5-logo-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:18px;align-items:start}
.pp5-logo-current{display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px;border-radius:14px;background:#f8fafc;border:1px dashed #cbd5e1;min-height:220px;justify-content:center}
.pp5-logo-current img{max-width:100%;max-height:180px;object-fit:contain}
.pp5-logo-empty{color:#94a3b8;font-weight:600}
.pp5-logo-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:24px 16px;border:2px dashed #93c5fd;border-radius:14px;background:#eff6ff;cursor:pointer;min-height:220px}
.pp5-logo-drop.is-over{background:#dbeafe;border-color:var(--primary)}
.pp5-logo-drop i{font-size:2rem;color:var(--primary)}
.pp5-logo-hint{color:#64748b;font-size:.88rem}
.pp5-logo-step{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:var(--primary);color:#fff;font-weight:800;font-size:.85rem;flex:none}
.pp5-logo-steptitle{display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:10px}
.pp5-logo-previews{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:14px}
.pp5-logo-pv{border-radius:14px;padding:14px;border:1px solid #e2e8f0;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.pp5-logo-pv-login{background:linear-gradient(145deg,#097bc3,#078bb4);color:#f2fbff}
.pp5-logo-pv-login img{height:64px;max-width:140px;object-fit:contain;filter:drop-shadow(0 3px 8px rgba(0,37,78,.25))}
.pp5-logo-pv-paper{background:#fff;color:#0f172a;flex-direction:row;text-align:left;align-items:center}
.pp5-logo-pv-paper img{height:56px;max-width:110px;object-fit:contain}
.pp5-logo-pv small{opacity:.8}
.pp5-logo-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px}
.pp5-logo-msg{border-radius:10px;padding:10px 12px;font-weight:600}
.pp5-logo-msg.ok{background:#ecfdf5;color:#047857}.pp5-logo-msg.err{background:#fef2f2;color:#b91c1c}.pp5-logo-msg.info{background:#eff6ff;color:#1d4ed8}
@media (max-width:760px){.pp5-logo-grid,.pp5-logo-previews{grid-template-columns:1fr}}
`;

  function render(frame) {
    const host = frame.querySelector('.container') || frame;
    host.innerHTML = `
<style>${STYLE}</style>
<div class="pp5-logo" id="pp5LogoManager">
  <div class="pp5-logo-card">
    <div class="pp5-logo-head"><i class="bi bi-award-fill" style="font-size:1.6rem;color:var(--primary)"></i><h2>ตราโรงเรียน</h2></div>
    <p class="pp5-logo-sub">ใช้บนหน้าเข้าสู่ระบบ หัวเอกสาร ปพ.5 / ปพ.6 และรายงานทุกฉบับ</p>
    <div class="pp5-logo-grid">
      <div>
        <div class="pp5-logo-steptitle">ตราที่ใช้อยู่ตอนนี้</div>
        <div class="pp5-logo-current" data-current><span class="pp5-logo-empty">กำลังโหลด…</span></div>
        <div class="pp5-logo-actions"><button type="button" class="btn btn-sm" data-remove hidden><i class="bi bi-trash"></i> ลบตรา</button></div>
        <p class="pp5-logo-hint" data-drive hidden style="color:#b45309;margin:8px 0 0"><i class="bi bi-exclamation-triangle"></i> ตรานี้ยังดึงรูปจาก Google Drive — เลือกรูปตราอีกครั้งแล้วกดบันทึก เพื่อเก็บไว้ในระบบ ตราจะไม่หายถ้าไฟล์ใน Drive ถูกย้ายหรือลบ</p>
      </div>
      <div>
        <div class="pp5-logo-steptitle"><span class="pp5-logo-step">1</span> เลือกรูปตราโรงเรียน</div>
        <label class="pp5-logo-drop" data-drop>
          <i class="bi bi-cloud-arrow-up"></i>
          <strong>กดเพื่อเลือกรูป</strong>
          <span class="pp5-logo-hint">หรือลากรูปมาวางตรงนี้ · หรือคัดลอกรูปแล้วกด Ctrl+V<br>PNG พื้นโปร่งใสสวยที่สุด · ไม่ต้องย่อรูปเอง ระบบย่อให้</span>
          <input type="file" accept="image/*" data-file hidden>
        </label>
      </div>
    </div>
  </div>
  <div class="pp5-logo-card" data-previewcard hidden>
    <div class="pp5-logo-steptitle"><span class="pp5-logo-step">2</span> ตัวอย่างก่อนบันทึก</div>
    <div class="pp5-logo-previews">
      <div class="pp5-logo-pv pp5-logo-pv-login"><img data-pv alt=""><strong>ยินดีต้อนรับกลับ</strong><small>หน้าเข้าสู่ระบบ</small></div>
      <div class="pp5-logo-pv pp5-logo-pv-paper"><img data-pv alt=""><div><strong data-name>โรงเรียน</strong><br><small>แบบรายงานผลการพัฒนาคุณภาพผู้เรียน (ปพ.5)</small></div></div>
    </div>
    <div class="pp5-logo-steptitle" style="margin-top:16px"><span class="pp5-logo-step">3</span> บันทึก</div>
    <div class="pp5-logo-actions" style="margin-top:0">
      <button type="button" class="btn" data-save><i class="bi bi-check2-circle"></i> บันทึกตรานี้</button>
      <button type="button" class="btn" data-cancel>ยกเลิก</button>
    </div>
  </div>
  <div class="pp5-logo-msg" data-msg hidden></div>
</div>`;
    return host.querySelector('#pp5LogoManager');
  }

  function mount(frame) {
    const root = render(frame);
    const $ = (sel) => root.querySelector(sel);
    const state = { pending: '', schoolName: '' };

    const say = (text, kind) => {
      const box = $('[data-msg]');
      box.hidden = !text;
      box.className = `pp5-logo-msg ${kind || 'info'}`;
      box.textContent = text || '';
    };

    async function showCurrent() {
      const box = $('[data-current]');
      try {
        const settings = await global.PP5Data.settings.get();
        state.schoolName = settings.school_name || '';
        $('[data-name]').textContent = state.schoolName || 'โรงเรียน';
        const logo = String(settings.logo_base64 || '').trim();
        $('[data-remove]').hidden = !logo;
        // ตราเก่าจากระบบ Apps Script = ลิงก์ / File ID ของ Google Drive (owner 2026-10-19 ย้ายคำเตือนจากแท็บการพิมพ์มาไว้ที่นี่)
        $('[data-drive]').hidden = !(/googleusercontent\.com|drive\.google\.com/i.test(logo) || /^[-\w]{20,}$/.test(logo));
        if (!logo) { box.innerHTML = '<span class="pp5-logo-empty">ยังไม่มีตราโรงเรียน</span>'; return; }
        box.innerHTML = `<img alt="ตราโรงเรียน" src="${esc(logo)}">`;
        box.querySelector('img').onerror = () => {
          box.innerHTML = '<span class="pp5-logo-empty">ตราที่บันทึกไว้เปิดไม่ได้ กรุณาเลือกรูปใหม่</span>';
        };
      } catch (error) {
        box.innerHTML = `<span class="pp5-logo-empty">${esc(error.message || error)}</span>`;
      }
    }

    async function take(file) {
      say('กำลังเตรียมรูป…', 'info');
      try {
        state.pending = await prepare(file);
        root.querySelectorAll('[data-pv]').forEach((img) => { img.src = state.pending; });
        $('[data-previewcard]').hidden = false;
        say('ดูตัวอย่างด้านบน ถ้าถูกต้องกด "บันทึกตรานี้"', 'info');
        $('[data-previewcard]').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (error) {
        state.pending = '';
        say(error.message || String(error), 'err');
      }
    }

    async function save(value, doneText) {
      const buttons = root.querySelectorAll('button');
      buttons.forEach((b) => { b.disabled = true; });
      say('กำลังบันทึก…', 'info');
      try {
        await global.PP5Data.settings.save({ logo_base64: value });
        state.pending = '';
        $('[data-previewcard]').hidden = true;
        await showCurrent();
        say(doneText, 'ok');
      } catch (error) {
        say(`บันทึกไม่สำเร็จ: ${error.message || error}`, 'err');
      } finally {
        buttons.forEach((b) => { b.disabled = false; });
      }
    }

    const fileInput = $('[data-file]');
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) take(fileInput.files[0]); fileInput.value = ''; });
    const drop = $('[data-drop]');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('is-over');
      const file = [...(e.dataTransfer?.files || [])].find((f) => /^image\//.test(f.type));
      if (file) take(file); else say('ต้องเป็นไฟล์รูปภาพ', 'err');
    });
    const onPaste = (e) => {
      if (!root.isConnected) { doc.removeEventListener('paste', onPaste); return; }
      const item = [...(e.clipboardData?.items || [])].find((i) => /^image\//.test(i.type));
      if (item) { e.preventDefault(); take(item.getAsFile()); }
    };
    doc.addEventListener('paste', onPaste);
    $('[data-save]').addEventListener('click', () => {
      if (!state.pending) { say('ยังไม่ได้เลือกรูป', 'err'); return; }
      save(state.pending, '✅ บันทึกตราโรงเรียนแล้ว หน้าเข้าสู่ระบบและเอกสารจะใช้ตรานี้ทันที');
    });
    $('[data-cancel]').addEventListener('click', () => { state.pending = ''; $('[data-previewcard]').hidden = true; say('', 'info'); });
    $('[data-remove]').addEventListener('click', () => {
      if (global.confirm('ลบตราโรงเรียน? เอกสารจะไม่มีตราจนกว่าจะเลือกรูปใหม่')) save(null, 'ลบตราโรงเรียนแล้ว');
    });
    showCurrent();
  }

  // หน้าเดิม logo_management มีปุ่ม #btnUpload และรูป #uploadPreview: เห็นเมื่อไรก็แทนด้วยหน้าใหม่
  function apply() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || !frame.querySelector('#btnUpload') || !frame.querySelector('#uploadPreview')) return;
    if (!global.PP5Data?.settings) return;
    mount(frame);
  }

  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5LogoManager) return;
    frame.__pp5LogoManager = true;
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(apply).observe(frame, { childList: true, subtree: true });
    apply();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();

  global.PP5LogoManager = { prepare, apply };
})(window);
