// แจ้งเตือนผู้ปกครองทาง LINE (front end of supabase/functions/line-notify).
//
//   • Parent portal (parent): "เชื่อม LINE" issues a one-time 6-digit code (pp5_line_issue_link_code);
//     the parent types it to the school's LINE Official Account and the webhook links them.
//     "ยกเลิก" switches their own links off.
//   • Daily attendance (teacher/admin): notify parents of the students SAVED as absent that day.
//   • Parent portal admin view: notify parents of a grade that a term's results are out.
// Every control stays hidden until the Edge Function reports LINE as configured, so nothing
// appears half-working before the owner finishes the setup. Messages never carry scores.
(function (global) {
  'use strict';

  const FUNCTION = 'line-notify';
  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const esc = (v) => txt(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const role = () => txt(global.localStorage?.getItem?.('role')).toLowerCase();

  function client() {
    const c = global.PP5Data?.client;
    if (!c) throw new Error('ระบบฐานข้อมูลยังโหลดไม่เสร็จ กรุณาโหลดหน้าเว็บใหม่');
    return c;
  }

  async function invoke(body) {
    const { data, error } = await client().functions.invoke(FUNCTION, { body });
    if (error) {
      let message = error.message || String(error);
      try { const detail = await error.context?.json?.(); if (detail?.error) message = detail.error; } catch (_) { /* keep message */ }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  // Cached for the page session: { configured, oaBasicId, linkedParents } or null when unavailable.
  let statusPromise = null;
  function getStatus() {
    if (!statusPromise) statusPromise = invoke({ action: 'status' }).catch(() => null);
    return statusPromise;
  }

  function summaryText(r) {
    const parts = [`ส่งแล้ว ${r.sent} คน`];
    if (r.alreadySent) parts.push(`เคยส่งไปแล้ว ${r.alreadySent}`);
    if (r.noRecipient) parts.push(`ผู้ปกครองยังไม่เชื่อม LINE ${r.noRecipient}`);
    if (r.failed) parts.push(`ส่งไม่สำเร็จ ${r.failed}`);
    return parts.join(' · ') + (r.quotaExceeded ? ' — ⚠️ โควตาข้อความ LINE ของเดือนนี้หมดแล้ว' : '');
  }

  // ───────────────────────── parent: link / unlink ─────────────────────────
  async function myLinks() {
    const { data, error } = await client().from('line_links').select('id, linked_at').eq('active', true);
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function issueCode() {
    const { data, error } = await client().rpc('pp5_line_issue_link_code');
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.code) throw new Error('ขอรหัสไม่สำเร็จ');
    return row;
  }

  async function unlinkAll() {
    const { data, error } = await client().from('line_links')
      .update({ active: false, unlinked_at: new Date().toISOString() }).eq('active', true).select('id');
    if (error) throw new Error(error.message);
    return (data || []).length;
  }

  function addFriendUrl(oaBasicId) {
    const id = txt(oaBasicId);
    return /^@[0-9a-z._-]+$/i.test(id) ? `https://line.me/R/ti/p/${encodeURIComponent(id)}` : '';
  }

  // Theme-aware: the portal has a dark mode, so colours come from these classes, never inline
  // light-only values (light text on a hard-coded white card was unreadable on phones).
  function injectStyles() {
    if (!global.document?.getElementById || document.getElementById('pp5LineStyles')) return;
    const style = document.createElement('style');
    style.id = 'pp5LineStyles';
    style.textContent = `
.pp5ln-card{background:#fff;color:#1e293b;border-radius:16px;padding:12px 16px;margin:12px 0;box-shadow:0 4px 14px rgba(30,27,58,.06)}
.pp5ln-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pp5ln-title{font-weight:700;flex:1;min-width:160px}
.pp5ln-sub{font-size:13px;color:#64748b;margin-top:4px}
.pp5ln-ok{color:#15803d;font-weight:700}
.pp5ln-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px;margin-top:10px;color:#1e293b}
.pp5ln-box a,.pp5ln-sub a{color:#047857}
.pp5ln-card.pp5ln-linked{position:relative;background:transparent;box-shadow:none;padding:0;margin:2px 0 0;text-align:right}
.pp5ln-status{position:relative;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border:0;border-radius:14px;background:#06c755;color:#fff;font-size:25px;cursor:pointer}
.pp5ln-status:focus-visible{outline:3px solid #2563eb;outline-offset:3px}
.pp5ln-status>svg{width:30px;height:30px}.pp5ln-check svg{width:12px;height:12px}
.pp5ln-status .pp5ln-check{position:absolute;right:-2px;bottom:-2px;display:flex;align-items:center;justify-content:center;width:17px;height:17px;background:#fff;color:#15803d;border-radius:50%;font-size:13px;border:1px solid #bbf7d0}
.pp5ln-linked [data-line-tools]{text-align:left;background:var(--pv-card,#fff);border:1px solid #bbf7d0;border-radius:14px;padding:12px;margin-top:8px}
.pp5-pv-line-slot .pp5ln-linked [data-line-tools],.pp5-pv-line-slot .pp5ln-linked [data-line-box]:not(:empty){position:absolute;right:0;top:48px;width:min(280px,calc(100vw - 64px));z-index:10;box-shadow:0 8px 24px rgba(30,27,58,.12)}
.pp5-pv-line-slot .pp5ln-linked [data-line-box]:not(:empty){position:relative;top:0;margin-top:8px}
[data-theme="dark"] .pp5ln-card.pp5ln-linked{background:transparent;border:0}
[data-theme="dark"] .pp5ln-linked [data-line-tools]{background:#111827;border-color:#166534}
[data-theme="dark"] .pp5ln-card{background:#111827;color:#e5e7eb;box-shadow:none;border:1px solid #1f2937}
[data-theme="dark"] .pp5ln-sub{color:#9ca3af}
[data-theme="dark"] .pp5ln-ok{color:#4ade80}
[data-theme="dark"] .pp5ln-box{background:#052e1a;border-color:#166534;color:#e5e7eb}
[data-theme="dark"] .pp5ln-box a,[data-theme="dark"] .pp5ln-sub a{color:#6ee7b7}
`;
    document.head.appendChild(style);
  }

  async function renderParentCard(card, status) {
    let links = [];
    try { links = await myLinks(); } catch (_) { card.hidden = true; return; }
    injectStyles();
    const friend = addFriendUrl(status.oaBasicId);
    const friendLink = friend ? `<a href="${esc(friend)}" target="_blank" rel="noopener">เพิ่มเพื่อน LINE ของโรงเรียน</a>` : 'เพิ่มเพื่อน LINE ของโรงเรียน';
    card.hidden = false;
    card.className = 'pp5ln-card' + (links.length ? ' pp5ln-linked' : '');
    card.style.cssText = '';
    // Linked: one compact line; the add/unlink controls stay folded under "จัดการ".
    card.innerHTML = links.length
      ? '<button type="button" class="pp5ln-status" data-line-manage aria-expanded="false" aria-label="รับแจ้งเตือนทาง LINE แล้ว กดจัดการบัญชี" title="รับแจ้งเตือนทาง LINE แล้ว · จัดการบัญชี"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M28 14c0 6-6 10-12 10l-6 4 1-5C6 22 3 18 3 14 3 8 9 4 16 4s12 4 12 10" fill="white"/><text x="16" y="17" text-anchor="middle" fill="#06c755" font-family="Arial,sans-serif" font-size="8" font-weight="700">LINE</text></svg><span class="pp5ln-check" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="m2 6 3 3 5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button>'
        + `<div data-line-tools hidden><div class="pp5ln-ok">รับแจ้งเตือนทาง LINE แล้ว (${links.length} บัญชี)</div><div class="pp5ln-sub">แจ้งเมื่อบุตรหลานขาดเรียน และเมื่อผลการเรียนออก (ไม่มีคะแนนในข้อความ)</div>`
        + '<div class="pp5ln-row" style="margin-top:8px"><button type="button" class="btn btn-sm btn-outline-success" data-line-code>เพิ่มอีกคน (เช่น พ่อ/แม่)</button>'
        + '<button type="button" class="btn btn-sm btn-outline-secondary" data-line-off>ยกเลิกทั้งหมด</button></div><div data-line-box></div></div>'
      : '<div class="pp5ln-row"><i class="bi bi-line" style="font-size:1.6rem;color:#06c755"></i>'
        + '<span class="pp5ln-title">รับแจ้งเตือนทาง LINE</span>'
        + '<button type="button" class="btn btn-sm btn-outline-success" data-line-code><i class="bi bi-link-45deg"></i> เชื่อมด้วยรหัส</button></div>'
        + `<div class="pp5ln-sub">วิธีง่ายที่สุด: ${friendLink} แล้วกดเมนู <b>"ดูผลการเรียน"</b> ในแชท — เข้าสู่ระบบครั้งเดียว ระบบเชื่อมให้อัตโนมัติ</div>`
        + '<div data-line-box></div>';
    const box = card.querySelector('[data-line-box]');
    card.querySelector('[data-line-manage]')?.addEventListener('click', (event) => {
      const tools = card.querySelector('[data-line-tools]');
      tools.hidden = !tools.hidden;
      event.currentTarget.setAttribute('aria-expanded', String(!tools.hidden));
      if (tools.hidden) box.innerHTML = '';
    });
    card.querySelector('[data-line-code]')?.addEventListener('click', async () => {
      box.innerHTML = '<div class="pp5ln-sub">กำลังขอรหัส...</div>';
      try {
        const row = await issueCode();
        box.innerHTML = '<div class="pp5ln-box">'
          + '<ol style="margin:0;padding-left:20px;line-height:1.9">'
          + `<li>${friendLink}${status.oaBasicId ? ` (${esc(status.oaBasicId)})` : ''}</li>`
          + `<li>พิมพ์รหัสนี้ในแชท: <b style="font-size:1.6rem;letter-spacing:4px" data-code>${esc(row.code)}</b></li>`
          + '<li>รอข้อความ "เชื่อมบัญชีเรียบร้อยแล้ว" แล้วกลับมากดรีเฟรชหน้านี้</li></ol>'
          + '<div class="pp5ln-sub">รหัสใช้ได้ 15 นาที ใช้ได้ครั้งเดียว อย่าส่งรหัสให้ผู้อื่น</div></div>';
      } catch (error) {
        box.innerHTML = `<div class="text-danger">${esc(error.message)}</div>`;
      }
    });
    card.querySelector('[data-line-off]')?.addEventListener('click', async () => {
      if (!global.confirm('ยกเลิกการรับแจ้งเตือนทาง LINE ทุกบัญชีที่เชื่อมไว้?')) return;
      try { await unlinkAll(); await renderParentCard(card, status); } catch (error) { box.innerHTML = `<span class="text-danger">${esc(error.message)}</span>`; }
    });
    const frame = document.getElementById('contentFrame');
    const dock = frame?.querySelector('#pp5ParentLineDock');
    if (links.length && dock) dock.appendChild(card);
    else if (!links.length && frame && dock?.contains(card)) {
      const view = frame.querySelector('#pp5ParentView');
      if (view?.parentNode) view.parentNode.insertBefore(card, view);
    }
  }

  // ───────────────────────── admin: grades released ─────────────────────────
  function renderAdminCard(card, status) {
    card.hidden = false;
    card.innerHTML = '<div class="search-panel-header"><span class="badge-audit"><i class="bi bi-line"></i> แจ้งเตือนผู้ปกครองทาง LINE</span>'
      + `<span class="search-panel-sub">ผู้ปกครองเชื่อม LINE แล้ว ${Number(status.linkedParents || 0)} บัญชี · ข้อความไม่มีคะแนน มีแค่ลิงก์ให้เข้าสู่ระบบดู</span></div>`
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">'
      + '<select class="form-select" data-g style="max-width:150px"><option value="">— ชั้น —</option></select>'
      + '<select class="form-select" data-s aria-label="ช่วงผลการเรียนที่แจ้ง" style="max-width:200px"><option value="1">ภาคเรียนที่ 1</option><option value="2">ภาคเรียนที่ 2</option><option value="year">ผลการเรียนทั้งปี</option></select>'
      + '<button type="button" class="btn btn-success" data-send><i class="bi bi-send"></i> แจ้งผลการเรียนออก</button></div>'
      + '<div data-result style="margin-top:10px"></div>';
    const result = card.querySelector('[data-result]');
    card.querySelector('[data-s]').addEventListener('change', () => {
      const annual = card.querySelector('[data-s]').value === 'year';
      card.querySelector('[data-send]').innerHTML = '<i class="bi bi-send"></i> ' + (annual ? 'แจ้งผลการเรียนทั้งปี' : 'แจ้งผลการเรียนออก');
    });
    let year = '';
    (async () => {
      try {
        year = txt((await global.PP5Data.settings.get())?.academicYear);
        const students = await global.PP5Data.students.list({ academicYear: year });
        const grades = [...new Set(students.map((s) => txt(s.grade)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
        card.querySelector('[data-g]').insertAdjacentHTML('beforeend', grades.map((g) => `<option>${esc(g)}</option>`).join(''));
      } catch (_) { /* grade list stays empty */ }
    })();
    card.querySelector('[data-send]').addEventListener('click', async () => {
      const grade = card.querySelector('[data-g]').value;
      const semester = card.querySelector('[data-s]').value;
      if (!grade) { result.innerHTML = '<span class="text-danger">กรุณาเลือกชั้น</span>'; return; }
      if (!global.confirm(`ส่ง LINE แจ้งผู้ปกครองชั้น ${grade} ว่าผลการเรียน${semester === 'year' ? 'ทั้งปี' : 'ภาคเรียนที่ ' + semester} ปีการศึกษา ${year} ออกแล้ว?\n(ส่งซ้ำไม่ได้ — คนที่ได้รับแล้วจะไม่ได้รับอีก)`)) return;
      result.innerHTML = '<span style="color:#64748b">กำลังส่ง...</span>';
      try { result.innerHTML = `<span style="color:#15803d">✅ ${esc(summaryText(await invoke({ action: 'send-grades', grade, semester, academicYear: year })))}</span>`; }
      catch (error) { result.innerHTML = `<span class="text-danger">${esc(error.message)}</span>`; }
    });
  }

  // First visit from the LINE menu (liff.html): the page stored the LINE ID token before
  // sending the parent to sign in. Link that LINE now; from then on the menu opens the portal
  // directly. The token is used once and removed.
  async function linkPendingLiff() {
    let idToken = '';
    try { idToken = global.sessionStorage?.getItem?.('pp5_liff_id_token') || ''; } catch (_) { idToken = ''; }
    if (!idToken) return null;
    try { global.sessionStorage.removeItem('pp5_liff_id_token'); } catch (_) { /* ignore */ }
    try {
      await invoke({ action: 'liff-link', idToken });
      return { ok: true, message: 'เชื่อม LINE เรียบร้อย ✅ ครั้งต่อไปกดเมนู "ดูผลการเรียน" ใน LINE แล้วเห็นผลการเรียนทันที' };
    } catch (error) {
      return { ok: false, message: 'เชื่อม LINE ไม่สำเร็จ: ' + error.message + ' — ลองกดเมนูใน LINE อีกครั้ง' };
    }
  }

  async function enhanceParentPortal(frame) {
    if (!frame || frame.querySelector('#pp5LineCard')) return;
    const r = role();
    if (r !== 'parent' && r !== 'admin') return;
    if (r === 'parent') {
      const linked = await linkPendingLiff();
      if (linked) {
        const note = document.createElement('div');
        note.id = 'pp5LiffLinkNote';
        note.setAttribute('role', 'status');
        note.style.cssText = `margin:12px 0;padding:12px 14px;border-radius:12px;font-weight:600;${linked.ok ? 'background:#ecfdf5;color:#065f46' : 'background:#fef2f2;color:#991b1b'}`;
        note.textContent = linked.message;
        const target = frame.querySelector('#studentsContainer');
        if (target?.parentNode) target.parentNode.insertBefore(note, target); else frame.prepend(note);
      }
    }
    const card = document.createElement('div');
    card.id = 'pp5LineCard';
    card.hidden = true;
    card.className = r === 'admin' ? 'search-panel' : '';
    card.style.cssText = r === 'admin' ? 'margin-top:16px' : '';
    const anchor = r === 'admin' ? frame.querySelector('#pp5ParentAccess') : frame.querySelector('#studentsContainer');
    if (anchor?.parentNode) anchor.parentNode.insertBefore(card, r === 'admin' ? anchor.nextSibling : anchor);
    else frame.appendChild(card);
    const status = await getStatus();
    if (!status?.configured) return;
    if (r === 'admin') renderAdminCard(card, status); else await renderParentCard(card, status);
  }

  // ───────────────────────── teacher: absences of the day ─────────────────────────
  async function enhanceAttendanceDaily(frame) {
    if (!frame || frame.querySelector('#pp5LineAbsence')) return;
    const r = role();
    if (r !== 'teacher' && r !== 'admin') return;
    const saveButton = frame.querySelector('#btnSaveAttendanceTop');
    const holder = document.createElement('div');
    holder.id = 'pp5LineAbsence';
    holder.hidden = true;
    holder.style.cssText = 'margin:10px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    holder.innerHTML = '<button type="button" class="btn btn-outline-success btn-sm"><i class="bi bi-line"></i> แจ้งผู้ปกครองนักเรียนที่ขาดวันนี้ทาง LINE</button><span data-msg style="font-size:13px"></span>';
    if (saveButton?.parentNode) saveButton.parentNode.insertBefore(holder, saveButton.nextSibling); else frame.prepend(holder);
    const status = await getStatus();
    if (!status?.configured) return;
    holder.hidden = false;
    const msg = holder.querySelector('[data-msg]');
    holder.querySelector('button').addEventListener('click', async () => {
      const date = txt(frame.querySelector('#attendanceDate')?.value);
      const grade = txt(frame.querySelector('#gradeSelect')?.value);
      const room = txt(frame.querySelector('#classSelect')?.value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !grade) { msg.innerHTML = '<span class="text-danger">กรุณาเลือกวันที่ ชั้น และห้อง</span>'; return; }
      if (!global.confirm(`ส่ง LINE แจ้งผู้ปกครองของนักเรียนชั้น ${grade}${room ? '/' + room : ''} ที่ "บันทึกแล้ว" ว่าขาดเรียนวันที่ ${date}?\nกรุณากดบันทึกการเช็กชื่อก่อน — ระบบส่งตามข้อมูลที่บันทึกแล้วเท่านั้น และไม่ส่งซ้ำ`)) return;
      msg.innerHTML = '<span style="color:#64748b">กำลังส่ง...</span>';
      try { msg.innerHTML = `<span style="color:#15803d">✅ ${esc(summaryText(await invoke({ action: 'send-absence', date, grade, room })))}</span>`; }
      catch (error) { msg.innerHTML = `<span class="text-danger">${esc(error.message)}</span>`; }
    });
  }

  global.PP5Line = {
    enhanceParentPortal, enhanceAttendanceDaily, getStatus,
    _internal: { summaryText, addFriendUrl, invoke, issueCode, unlinkAll, myLinks, linkPendingLiff, resetStatus: () => { statusPromise = null; } }
  };
})(window);
