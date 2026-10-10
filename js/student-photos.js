// รูปนักเรียน: ปุ่ม "รูปนักเรียน" ในหน้าจัดการนักเรียน (studentList, เฉพาะผู้ดูแล) เปิดหน้าต่างอัปโหลดทีละหลายรูป
//   - ตั้งชื่อไฟล์เป็นรหัสนักเรียน (803.jpg / 803 ชื่อ.jpg) ระบบจับคู่ให้  ไฟล์ที่จับคู่ไม่ได้เลือกนักเรียนเองได้
//   - ย่อรูปในเบราว์เซอร์ (ด้านยาว 480 px, JPEG) ก่อนส่ง แล้วเก็บแบบส่วนตัวผ่าน PP5Data.studentPhotos
//   - ลบรูปของนักเรียนรายคนได้
// ต้องติดตั้ง migration 202610060023_student_photos ก่อน (bucket + สิทธิ์) ไม่งั้นอัปโหลดจะขึ้นข้อผิดพลาดจากระบบ
(function initStudentPhotos(global) {
  'use strict';

  const MAX_SIDE = 480;
  const QUALITY = 0.85;
  const PARALLEL = 3;

  const txt = (value) => (value === null || value === undefined ? '' : String(value));
  const esc = (value) => txt(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  function isAdmin() {
    try { return txt(global.localStorage.getItem('role')).toLowerCase() === 'admin'; } catch (_) { return false; }
  }

  // "803.jpg" "803 กนกชัย.jpg" "803_2.png" -> 803 (ต้องเป็นรหัสที่มีอยู่จริงเท่านั้น)
  function idFromFileName(name, ids) {
    const stem = txt(name).replace(/\.[^.]+$/, '').trim();
    if (ids.has(stem)) return stem;
    const lead = stem.match(/^[0-9]+/);
    return lead && ids.has(lead[0]) ? lead[0] : '';
  }

  // ซ้ำ = นักเรียนคนเดียวถูกเลือกหลายไฟล์: ใช้ไฟล์สุดท้าย ไฟล์ก่อนหน้าข้าม
  function markDuplicates(rows) {
    const last = new Map();
    rows.forEach((row, index) => { if (row.studentId) last.set(row.studentId, index); });
    rows.forEach((row, index) => { row.duplicate = !!row.studentId && last.get(row.studentId) !== index; });
    return rows;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 0); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดไฟล์รูปนี้ไม่ได้ (ลองบันทึกเป็น JPG หรือ PNG)')); };
      img.src = url;
    });
  }

  async function resizeImage(file) {
    let source;
    let width;
    let height;
    if (typeof global.createImageBitmap === 'function') {
      try {
        source = await global.createImageBitmap(file, { imageOrientation: 'from-image' });
        width = source.width; height = source.height;
      } catch (_) { source = null; }
    }
    if (!source) {
      source = await loadImage(file);
      width = source.naturalWidth; height = source.naturalHeight;
    }
    if (!width || !height) throw new Error('เปิดไฟล์รูปนี้ไม่ได้');
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (typeof source.close === 'function') source.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) throw new Error('ย่อรูปไม่สำเร็จ');
    return blob;
  }

  // ---------- หน้าต่างอัปโหลด ----------
  async function openUploader() {
    const data = global.PP5Data;
    if (!data?.studentPhotos) { global.alert('ระบบยังไม่พร้อม กรุณาโหลดหน้าใหม่'); return; }
    document.getElementById('pp5spOverlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'pp5spOverlay';
    overlay.className = 'pp5sp-overlay';
    overlay.innerHTML = `<div class="pp5sp-modal" role="dialog" aria-modal="true" aria-labelledby="pp5spTitle">
      <div class="pp5sp-head"><h5 id="pp5spTitle"><i class="bi bi-person-bounding-box"></i> รูปนักเรียน</h5>
        <button type="button" class="pp5sp-x" data-close aria-label="ปิด"><i class="bi bi-x-lg"></i></button></div>
      <ol class="pp5sp-steps">
        <li>ตั้งชื่อไฟล์รูปเป็น<b>รหัสนักเรียน</b> เช่น <code>803.jpg</code> หรือ <code>803 กนกชัย.jpg</code></li>
        <li>กด <b>เลือกรูป</b> เลือกได้หลายรูปพร้อมกัน (ไฟล์ที่ชื่อไม่ตรง เลือกนักเรียนเองในรายการได้)</li>
        <li>ตรวจรายการ แล้วกด <b>อัปโหลด</b>  ระบบย่อรูปให้เล็กลงก่อนเก็บ และเก็บแบบส่วนตัว</li>
      </ol>
      <div class="pp5sp-pick">
        <label class="pp5sp-btn pp5sp-primary"><input type="file" accept="image/*" multiple hidden data-files><i class="bi bi-images"></i> เลือกรูป</label>
        <span class="pp5sp-summary" data-summary>กำลังโหลดรายชื่อนักเรียน...</span>
      </div>
      <div class="pp5sp-list" data-list></div>
      <div class="pp5sp-foot">
        <span class="pp5sp-progress" data-progress></span>
        <button type="button" class="pp5sp-btn pp5sp-go" data-upload disabled><i class="bi bi-cloud-arrow-up-fill"></i> <span>อัปโหลด</span></button>
      </div>
      <details class="pp5sp-remove"><summary>ลบรูปของนักเรียน</summary>
        <div class="pp5sp-remove-row"><select class="form-select" data-remove-pick><option value="">— เลือกนักเรียนที่มีรูป —</option></select>
        <button type="button" class="pp5sp-btn pp5sp-danger" data-remove><i class="bi bi-trash3"></i> ลบรูป</button></div>
        <div class="pp5sp-note" data-remove-msg></div>
      </details>
    </div>`;
    document.body.appendChild(overlay);

    const $ = (sel) => overlay.querySelector(sel);
    let students = [];
    let ids = new Set();
    let rows = [];
    let busy = false;

    const close = () => {
      if (busy) return;
      rows.forEach((row) => URL.revokeObjectURL(row.preview));
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (event) => { if (event.target === overlay || event.target.closest('[data-close]')) close(); });

    const label = (student) => `${student.id}  ${student.fullName || ''}  (${student.grade || '-'}/${student.classNo || student.room || '-'})`;
    const studentOptions = (selected) => '<option value="">— เลือกนักเรียน —</option>'
      + students.map((student) => `<option value="${esc(student.id)}"${student.id === selected ? ' selected' : ''}>${esc(label(student))}</option>`).join('');

    function render() {
      markDuplicates(rows);
      const ready = rows.filter((row) => row.studentId && !row.duplicate && row.status !== 'done');
      $('[data-list]').innerHTML = rows.map((row, index) => {
        const student = students.find((item) => item.id === row.studentId);
        let badge = '<span class="pp5sp-tag is-warn">ยังไม่ได้เลือกนักเรียน</span>';
        if (row.status === 'done') badge = '<span class="pp5sp-tag is-ok"><i class="bi bi-check-lg"></i> อัปโหลดแล้ว</span>';
        else if (row.status === 'error') badge = `<span class="pp5sp-tag is-bad">${esc(row.message)}</span>`;
        else if (row.status === 'busy') badge = '<span class="pp5sp-tag">กำลังอัปโหลด...</span>';
        else if (row.duplicate) badge = '<span class="pp5sp-tag is-warn">ซ้ำ ใช้ไฟล์ที่อยู่ล่างสุดแทน</span>';
        else if (row.studentId) badge = student?.photoRef ? '<span class="pp5sp-tag is-info">พร้อม (แทนรูปเดิม)</span>' : '<span class="pp5sp-tag is-ok">พร้อม</span>';
        return `<div class="pp5sp-row" data-index="${index}">
          <img class="pp5sp-thumb" src="${esc(row.preview)}" alt="">
          <div class="pp5sp-file"><div class="pp5sp-name" title="${esc(row.file.name)}">${esc(row.file.name)}</div>${badge}</div>
          <select class="form-select form-select-sm" data-student${busy || row.status === 'done' ? ' disabled' : ''}>${studentOptions(row.studentId)}</select>
        </div>`;
      }).join('');
      const matched = rows.filter((row) => row.studentId).length;
      setSummary(rows.length
        ? `เลือก ${rows.length} รูป · จับคู่แล้ว ${matched} · ไม่ตรง ${rows.length - matched}`
        : `นักเรียน ${students.length} คน · มีรูปแล้ว ${students.filter((s) => s.photoRef).length} คน`);
      const go = $('[data-upload]');
      go.disabled = busy || !ready.length;
      go.querySelector('span').textContent = ready.length ? `อัปโหลด ${ready.length} รูป` : 'อัปโหลด';
    }
    const setSummary = (text) => { $('[data-summary]').textContent = text; };

    function renderRemovePick() {
      const withPhoto = students.filter((student) => student.photoRef);
      $('[data-remove-pick]').innerHTML = '<option value="">— เลือกนักเรียนที่มีรูป —</option>'
        + withPhoto.map((student) => `<option value="${esc(student.id)}">${esc(label(student))}</option>`).join('');
    }

    async function loadStudents() {
      const year = txt((await data.settings.get())?.academicYear);
      students = (await data.students.list({ academicYear: year }))
        .slice().sort((a, b) => txt(a.grade).localeCompare(txt(b.grade), 'th', { numeric: true })
          || txt(a.classNo).localeCompare(txt(b.classNo), 'th', { numeric: true })
          || txt(a.id).localeCompare(txt(b.id), 'th', { numeric: true }));
      ids = new Set(students.map((student) => txt(student.id)));
      renderRemovePick();
      render();
    }

    $('[data-files]').addEventListener('change', (event) => {
      const files = Array.from(event.target.files || []).filter((file) => /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name));
      event.target.value = '';
      rows.forEach((row) => URL.revokeObjectURL(row.preview));
      rows = files.map((file) => ({ file, preview: URL.createObjectURL(file), studentId: idFromFileName(file.name, ids), status: 'ready', message: '' }));
      render();
    });

    $('[data-list]').addEventListener('change', (event) => {
      const select = event.target.closest('select[data-student]');
      if (!select) return;
      const row = rows[Number(select.closest('[data-index]').getAttribute('data-index'))];
      if (row) { row.studentId = select.value; row.status = 'ready'; row.message = ''; render(); }
    });

    $('[data-upload]').addEventListener('click', async () => {
      if (busy) return;
      markDuplicates(rows);
      const queue = rows.filter((row) => row.studentId && !row.duplicate && row.status !== 'done');
      if (!queue.length) return;
      busy = true;
      let done = 0;
      let failed = 0;
      const progress = () => { $('[data-progress]').textContent = `อัปโหลดแล้ว ${done}/${queue.length}${failed ? ` · ไม่สำเร็จ ${failed}` : ''}`; };
      progress();
      render();
      const worker = async () => {
        while (queue.length) {
          const row = queue.shift();
          row.status = 'busy';
          render();
          try {
            const blob = await resizeImage(row.file);
            await data.studentPhotos.upload(row.studentId, blob);
            row.status = 'done';
            done += 1;
          } catch (error) {
            row.status = 'error';
            row.message = txt(error?.message || error) || 'อัปโหลดไม่สำเร็จ';
            failed += 1;
          }
          progress();
          render();
        }
      };
      const total = queue.length;
      await Promise.all(Array.from({ length: Math.min(PARALLEL, total) }, worker));
      busy = false;
      $('[data-progress]').textContent = `เสร็จแล้ว: สำเร็จ ${done} รูป${failed ? ` · ไม่สำเร็จ ${failed} รูป (ดูเหตุผลในรายการ)` : ''}`;
      await loadStudents().catch(() => {});
      if (done && typeof global.loadStudentList === 'function') { try { global.loadStudentList(); } catch (_) {} }
    });

    $('[data-remove]').addEventListener('click', async () => {
      const id = $('[data-remove-pick]').value;
      const student = students.find((item) => item.id === id);
      if (!id || !student || busy) return;
      if (!global.confirm(`ลบรูปของ ${student.fullName || id} ?\nลบแล้วกู้คืนไม่ได้ ต้องอัปโหลดใหม่`)) return;
      const msg = $('[data-remove-msg]');
      try {
        await data.studentPhotos.remove(id);
        msg.textContent = `ลบรูปของ ${student.fullName || id} แล้ว`;
        await loadStudents();
      } catch (error) {
        msg.textContent = `ลบรูปไม่สำเร็จ: ${txt(error?.message || error)}`;
      }
    });

    try {
      await loadStudents();
    } catch (error) {
      setSummary(`โหลดรายชื่อนักเรียนไม่สำเร็จ: ${txt(error?.message || error)}`);
    }
  }

  // ---------- ปุ่มในหน้าจัดการนักเรียน ----------
  function injectButton(frame) {
    const page = frame.querySelector('.pp5-student-manager');
    if (!page || !isAdmin() || page.querySelector('#pp5spOpenBtn')) return;
    const anchor = page.querySelector('#exportPdfBtn');
    if (!anchor?.parentNode) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'pp5spOpenBtn';
    btn.className = 'btn btn-outline-primary';
    btn.innerHTML = '<i class="bi bi-person-bounding-box me-1"></i> รูปนักเรียน';
    btn.addEventListener('click', openUploader);
    anchor.parentNode.insertBefore(btn, anchor);
  }

  // ---------- รูปหน้าชื่อในตารางรายชื่อนักเรียน (ทุกบทบาทที่เปิดหน้านี้ได้) ----------
  function avatarHtml(photoUrl) {
    const url = txt(photoUrl);
    return url
      ? `<span class="pp5sp-rowavatar has-photo"><img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`
      : '<span class="pp5sp-rowavatar"><i class="bi bi-person-fill" aria-hidden="true"></i></span>';
  }

  // หน้า studentList วาดแถวใหม่ทั้งตาราง (innerHTML +=) จึงต้องเติมรูปซ้ำทุกครั้งที่แถวถูกสร้างใหม่
  // ช่องชื่อตอนแก้ไขไม่มี class text-start จึงไม่ถูกแตะ
  function decorateList(frame) {
    const body = frame.querySelector('.pp5-student-manager #studentListTable');
    if (!body) return;
    const source = global.originalStudentData || {};
    body.querySelectorAll('tr[id^="row-"]').forEach((row) => {
      const cell = row.querySelector('td.text-start');
      if (!cell) return;
      const student = source[row.id.slice(4)] || {};
      const url = txt(student.photoUrl || student.photo_url);
      if (cell.getAttribute('data-pp5sp') === url) return;
      const name = cell.querySelector('.pp5sp-rowname')?.textContent ?? cell.textContent;
      cell.setAttribute('data-pp5sp', url);
      cell.innerHTML = `<div class="pp5sp-rowwho">${avatarHtml(url)}<span class="pp5sp-rowname">${esc(name.trim())}</span></div>`;
    });
  }

  // คลิกรูปในตารางรายชื่อ -> ป๊อปอัพรูปใหญ่ (ปิดด้วยคลิกพื้นหลัง / ปุ่ม X / Esc)
  function openViewer(src, name) {
    document.getElementById('pp5spViewer')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'pp5spViewer';
    overlay.className = 'pp5sp-viewer';
    overlay.innerHTML = `<figure class="pp5sp-viewer-box" role="dialog" aria-modal="true" aria-label="${esc(name)}">
      <button type="button" class="pp5sp-x" data-close aria-label="ปิด"><i class="bi bi-x-lg"></i></button>
      <img src="${esc(src)}" alt="${esc(name)}" referrerpolicy="no-referrer">
      <figcaption>${esc(name)}</figcaption></figure>`;
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-close]')) close();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-close]').focus();
  }

  // ตารางรายชื่อนักเรียน (.pp5sp-rowavatar) และหน้าประเมินทั้ง 5 หน้า (.pp5-au-avatar จาก js/assessment-ui.js)
  function onListClick(event) {
    const img = event.target.closest?.('.pp5-student-manager .pp5sp-rowavatar.has-photo img, .pp5-au-avatar.has-photo img');
    if (!img) return;
    const name = img.closest('.pp5sp-rowwho')?.querySelector('.pp5sp-rowname')?.textContent
      || img.closest('.pp5-au-who')?.querySelector('.pp5-au-name')?.textContent || '';
    event.stopPropagation();
    openViewer(img.getAttribute('src'), name.trim());
  }

  function watch() {
    const frame = document.getElementById('contentFrame');
    if (!frame) return;
    if (!frame.__pp5spClick) { frame.__pp5spClick = true; frame.addEventListener('click', onListClick); }
    injectButton(frame);
    decorateList(frame);
    if (frame.__pp5spWatch || typeof MutationObserver !== 'function') return;
    let queued = false;
    frame.__pp5spWatch = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      setTimeout(() => { queued = false; injectButton(frame); decorateList(frame); }, 0);
    });
    frame.__pp5spWatch.observe(frame, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();

  global.PP5StudentPhotos = { open: openUploader, idFromFileName, markDuplicates, resizeImage, avatarHtml, decorateList, openViewer };
})(window);
