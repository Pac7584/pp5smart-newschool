// หน้า "นักเรียนเสี่ยง มส." — attendance_risk (owner 2026-10-16: "รายชื่อนักเรียน มส. ให้ครูประจำชั้น")
// ครูประจำชั้นเห็นทุกวิชาของห้องในที่เดียว: ใคร มส. (เวลาเรียนต่ำกว่าร้อยละ 80) / ใกล้ มส. (80 ถึงต่ำกว่า 85) วิชาไหน
//   ตัวเลขมาจาก GasServer.getRoomAttendanceRisk = เวลาเรียนชุดเดียวกับ ปพ.5 แบบรายวิชา (รายคาบ / รายวัน / ผสมรายภาค)
//   PDF ใช้ PP5PDF.createSubjectAttendanceReport (แบบเดียวกับสรุปเวลาเรียนรายวิชา) · อ่านอย่างเดียว
(function initAttendanceRisk(global) {
  'use strict';
  const doc = global.document;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const GRADE_ORDER = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3'];
  const FAIL = 80;
  const NEAR = 85;
  const statusOf = (pct) => (pct === null || pct === undefined ? 'none' : pct < FAIL ? 'fail' : pct < NEAR ? 'near' : 'ok');
  const LABEL = { fail: 'มส.', near: 'ใกล้ มส.', ok: 'ผ่าน', none: 'ยังไม่มีข้อมูล' };
  const pctText = (pct) => (pct === null || pct === undefined ? '–' : `${Number(pct).toFixed(1)}%`);
  const subjectLabel = (s) => [s.code, s.name].filter(Boolean).join(' ');
  const RULE_NOTE = 'ตามระเบียบ: ต้องมีเวลาเรียนไม่น้อยกว่าร้อยละ 80 ของเวลาเรียนทั้งหมดของวิชา = ขาดได้ไม่เกินร้อยละ 20 ของชั่วโมงทั้งปี (ลาไม่นับเป็นขาด)'
    + ' · ร้อยละ = (ชั่วโมงทั้งหมด − ชั่วโมงที่ขาด) ÷ ชั่วโมงทั้งหมด · วิชาที่ยังไม่เช็คชื่อรายคาบใช้เช็คชื่อรายวันของห้อง (1 วัน = ชั่วโมงของวิชา ÷ 200 วัน) · ชุดเดียวกับ ปพ.5 แบบรายวิชา';

  // จัดกลุ่ม: ต่อคน = รายการวิชาที่ มส. / ใกล้ มส. (เรียงร้อยละน้อยก่อน) · วิชาที่ยังไม่มีเวลาเรียนเลย
  function classify(report) {
    const subjects = report?.subjects || [];
    const people = (report?.students || []).map((student) => {
      const items = subjects.map((subject) => {
        const row = (subject.rows || []).find((r) => text(r.code) === text(student.code)) || {};
        const pct = row.pct === null || row.pct === undefined || row.pct === '' ? null : Number(row.pct);
        // มส. ตามระเบียบ (owner 2026-10-16): ขาดได้ไม่เกินร้อยละ 20 ของชั่วโมงทั้งหมดของวิชา · ลาไม่นับเป็นขาด
        const full = Number(subject.fullHours) || 0;
        const absentHours = row.absentHours === null || row.absentHours === undefined ? null : Number(row.absentHours);
        return { subject, pct, present: Number(row.present) || 0, total: Number(row.total) || 0, absent: Number(row.absent) || 0,
          absentHours, quota: full ? Math.round(full * 2) / 10 : null, status: statusOf(pct) };
      });
      const fail = items.filter((i) => i.status === 'fail').sort((a, b) => a.pct - b.pct);
      const near = items.filter((i) => i.status === 'near').sort((a, b) => a.pct - b.pct);
      return { student, items, fail, near };
    });
    const noData = subjects.filter((s) => !(s.rows || []).some((r) => r.pct !== null && r.pct !== undefined && r.pct !== ''));
    return {
      people,
      failing: people.filter((p) => p.fail.length),
      nearOnly: people.filter((p) => !p.fail.length && p.near.length),
      noData
    };
  }

  // "ขาด 34 / ขาดได้ 32 ชม." — วิชาที่ไม่ได้ตั้งชั่วโมงเรียน: ขาดกี่ครั้งจากที่บันทึก
  const num = (v) => String(Math.round(Number(v) * 10) / 10);
  const missedText = (item) => (item.quota !== null && item.absentHours !== null
    ? `ขาด ${num(item.absentHours)} / ขาดได้ ${num(item.quota)} ชม.`
    : `ขาด ${item.absent} จาก ${item.total} ${item.subject.mode === 'daily' ? 'วัน' : 'ชม.'}`);

  // แถว PDF: 1 แถวต่อ (นักเรียน, วิชา) ที่ มส. หรือใกล้ มส. — มส. ก่อน
  function pdfRows(result) {
    const rows = [];
    [...result.failing, ...result.nearOnly].forEach((p) => {
      [...p.fail, ...p.near].forEach((item, index) => {
        rows.push([index ? '' : String(rows.filter((r) => r[0]).length + 1), index ? '' : p.student.code, index ? '' : p.student.name,
          subjectLabel(item.subject), missedText(item), pctText(item.pct), LABEL[item.status]]);
      });
    });
    return rows;
  }

  const STYLE = `
.ar{--a-line:#e3e6ee;--a-muted:#5b6275;--a-soft:#f6f7fb;--a-card:#fff;--a-text:#1f2937;--a-accent:var(--primary,#4f46e5);
  --a-ok:#13795b;--a-ok-bg:#e6f6ef;--a-warn:#a15c00;--a-warn-bg:#fff4e0;--a-bad:#c2362b;--a-bad-bg:#fdecea;
  max-width:1200px;margin:0 auto;padding:0 0 60px;color:var(--a-text)}
[data-theme="dark"] .ar{--a-line:#2b3446;--a-muted:#a7afbd;--a-soft:#161d2b;--a-card:#1b2232;--a-text:#e5e7eb;
  --a-ok:#6fe0b4;--a-ok-bg:rgba(111,224,180,.12);--a-warn:#ffc46b;--a-warn-bg:rgba(255,196,107,.12);--a-bad:#ff8a80;--a-bad-bg:rgba(255,138,128,.12)}
.ar-title{display:none}
.ar-card{background:var(--a-card);border:1px solid var(--a-line);border-radius:16px;padding:14px 16px;margin-bottom:12px}
.ar-top{display:flex;flex-wrap:wrap;gap:10px;align-items:end}
.ar-top label{display:grid;gap:4px;font-weight:600;font-size:.85rem;min-width:200px}
.ar-btn{border:0;border-radius:10px;padding:.55rem 1.1rem;font-weight:700;background:var(--a-accent);color:#fff;display:inline-flex;align-items:center;gap:6px}
.ar-btn.is-alt{background:var(--a-card);color:var(--a-text);border:1px solid var(--a-line)}
.ar-btn:disabled{opacity:.55}
.ar-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:12px}
.ar-stat{border-radius:14px;padding:12px 14px;background:var(--a-soft);display:flex;gap:10px;align-items:center}
.ar-stat i{font-size:1.5rem}.ar-stat b{font-size:1.6rem;line-height:1}.ar-stat span{display:block;font-size:.82rem;color:var(--a-muted)}
.ar-stat.is-bad{background:var(--a-bad-bg);color:var(--a-bad)}.ar-stat.is-warn{background:var(--a-warn-bg);color:var(--a-warn)}.ar-stat.is-ok{background:var(--a-ok-bg);color:var(--a-ok)}
.ar-h{font-weight:800;font-size:1rem;margin:4px 0 10px;display:flex;align-items:center;gap:8px}
.ar-h.is-bad{color:var(--a-bad)}.ar-h.is-warn{color:var(--a-warn)}
.ar-person{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:10px 0;border-top:1px solid var(--a-line)}
.ar-person:first-of-type{border-top:0}
.ar-name{font-weight:700;min-width:220px}.ar-name small{color:var(--a-muted);font-weight:500;margin-right:6px}
.ar-pill{display:inline-flex;gap:6px;align-items:center;border-radius:999px;padding:.25rem .75rem;font-size:.82rem;font-weight:700}
.ar-pill.is-fail{background:var(--a-bad-bg);color:var(--a-bad)}.ar-pill.is-near{background:var(--a-warn-bg);color:var(--a-warn)}
.ar-pill small{font-weight:500;opacity:.85}
.ar-note{padding:10px 12px;border-radius:10px;font-size:.9rem;background:var(--a-soft);color:var(--a-muted)}
.ar-note.is-ok{background:var(--a-ok-bg);color:var(--a-ok)}.ar-note.is-err{background:var(--a-bad-bg);color:var(--a-bad)}.ar-note.is-warn{background:var(--a-warn-bg);color:var(--a-warn)}
.ar-wrap{overflow:auto;border:1px solid var(--a-line);border-radius:12px;max-height:65vh}
.ar-table{width:100%;border-collapse:collapse;font-size:.82rem;white-space:nowrap}
.ar-table th,.ar-table td{padding:5px 7px;border-bottom:1px solid var(--a-line);text-align:center}
.ar-table thead th{background:var(--a-soft);color:var(--a-muted);position:sticky;top:0;z-index:2;white-space:normal;min-width:70px}
.ar-table .ar-n{text-align:left;position:sticky;left:0;background:var(--a-card);z-index:1}
.ar-table thead .ar-n{background:var(--a-soft);z-index:3}
.ar-table td.is-fail{background:var(--a-bad-bg);color:var(--a-bad);font-weight:800}.ar-table td.is-near{background:var(--a-warn-bg);color:var(--a-warn);font-weight:700}
.ar-table td.is-none{color:var(--a-muted)}
.ar details summary{cursor:pointer;font-weight:700}
.ar-say{font-size:.85rem;color:var(--a-muted)}.ar-say.is-err{color:var(--a-bad)}`;

  function shell() {
    return `<div class="ar" id="pp5AttendanceRisk"><style>${STYLE}</style><h4 class="ar-title">นักเรียนเสี่ยง มส.</h4>
<div class="ar-card"><div class="ar-top"><label>ห้อง<select class="form-select" data-room></select></label>
  <button type="button" class="ar-btn is-alt" data-reload data-pp5-btn-skip><i class="bi bi-arrow-clockwise"></i> คำนวณใหม่</button>
  <button type="button" class="ar-btn" data-pdf data-pp5-btn-skip disabled><i class="bi bi-file-earmark-pdf-fill"></i> ส่งออก PDF</button>
  <span class="ar-say" data-say></span></div></div>
<div data-body><div class="ar-card"><div class="ar-note">กำลังโหลด…</div></div></div></div>`;
  }

  function personHtml(p) {
    const pill = (item) => `<span class="ar-pill is-${item.status}" title="${esc(subjectLabel(item.subject))}">${esc(item.subject.name || item.subject.code)} ${pctText(item.pct)}
<small>(${esc(missedText(item))})</small></span>`;
    return `<div class="ar-person"><div class="ar-name"><small>${esc(p.student.no)}.</small>${esc(p.student.name)}</div>${[...p.fail, ...p.near].map(pill).join('')}</div>`;
  }

  function render(body, report, result) {
    const subjects = report.subjects || [];
    if (!report.students.length) { body.innerHTML = '<div class="ar-card"><div class="ar-note is-warn">ห้องนี้ยังไม่มีรายชื่อนักเรียน</div></div>'; return; }
    if (!subjects.length) { body.innerHTML = '<div class="ar-card"><div class="ar-note is-warn">ห้องนี้ยังไม่มีรายวิชา — ให้ผู้ดูแลเพิ่มรายวิชาของชั้นก่อน</div></div>'; return; }
    const failSubjects = new Set(result.failing.flatMap((p) => p.fail.map((i) => i.subject.id)));
    body.innerHTML = `<div class="ar-stats">
  <div class="ar-stat ${result.failing.length ? 'is-bad' : 'is-ok'}"><i class="bi bi-exclamation-octagon-fill"></i><div><b>${result.failing.length}</b><span>คน มส. (ต่ำกว่าร้อยละ ${FAIL})${failSubjects.size ? ` · ${failSubjects.size} วิชา` : ''}</span></div></div>
  <div class="ar-stat ${result.nearOnly.length ? 'is-warn' : 'is-ok'}"><i class="bi bi-exclamation-triangle-fill"></i><div><b>${result.nearOnly.length}</b><span>คน ใกล้ มส. (ร้อยละ ${FAIL}–${NEAR})</span></div></div>
  <div class="ar-stat"><i class="bi bi-people-fill"></i><div><b>${report.students.length}</b><span>นักเรียนทั้งห้อง · ${subjects.length} วิชา</span></div></div></div>
${result.noData.length ? `<div class="ar-card"><div class="ar-note is-warn"><i class="bi bi-info-circle-fill"></i> ยังไม่มีเวลาเรียนเลย ${result.noData.length} วิชา: ${esc(result.noData.map(subjectLabel).join(', '))}</div></div>` : ''}
<div class="ar-card"><div class="ar-h is-bad"><i class="bi bi-exclamation-octagon-fill"></i> มส. — ไม่มีสิทธิ์สอบ</div>
${result.failing.length ? result.failing.map(personHtml).join('') : '<div class="ar-note is-ok"><i class="bi bi-check-circle-fill"></i> ไม่มีนักเรียน มส.</div>'}</div>
${result.nearOnly.length ? `<div class="ar-card"><div class="ar-h is-warn"><i class="bi bi-exclamation-triangle-fill"></i> ใกล้ มส. — ควรติดตาม</div>${result.nearOnly.map(personHtml).join('')}</div>` : ''}
<div class="ar-card"><details><summary>ดูร้อยละเวลาเรียนทุกคนทุกวิชา</summary><div class="ar-wrap mt-2"><table class="ar-table"><thead><tr><th>ที่</th><th class="ar-n">ชื่อ–สกุล</th>
${subjects.map((s) => `<th title="${esc(subjectLabel(s))}">${esc(s.name || s.code)}</th>`).join('')}</tr></thead><tbody>
${result.people.map((p) => `<tr><td>${esc(p.student.no)}</td><td class="ar-n">${esc(p.student.name)}</td>${p.items.map((i) => `<td class="is-${i.status}">${pctText(i.pct)}</td>`).join('')}</tr>`).join('')}
</tbody></table></div></details>
<div class="small mt-2" style="color:var(--a-muted)">${esc(RULE_NOTE)}</div></div>`;
  }

  async function rooms() {
    const settings = await global.PP5Data.settings.get();
    const year = text(settings.academicYear || settings.academic_year);
    let role = '';
    try { role = (await global.PP5Data.auth.requireUser())?.profile?.role || ''; } catch (_) { role = ''; }
    let scope = null;
    try { const { data } = await global.PP5Data.client.rpc('pp5_teacher_scope_context'); scope = data && data.enabled ? data : null; } catch (_) { scope = null; }
    if (role === 'teacher' && scope) {
      const own = (scope.assignments || []).filter((a) => a.active !== false && text(a.academic_year) === year && a.scope === 'homeroom');
      return [...new Map(own.map((a) => [`${a.grade}/${text(a.room)}`, { grade: a.grade, room: text(a.room) }])).values()];
    }
    const all = await global.PP5Data.students.list({}).catch(() => []);
    const map = new Map();
    all.forEach((s) => { const g = text(s.grade); const r = text(s.room || s.classNo || '1'); if (/^(ป|ม)\./.test(g)) map.set(`${g}/${r}`, { grade: g, room: r }); });
    return [...map.values()].sort((a, b) => (GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade)) || a.room.localeCompare(b.room, 'th', { numeric: true }));
  }

  async function mount(root) {
    const $ = (sel) => root.querySelector(sel);
    const roomSel = $('[data-room]');
    const body = $('[data-body]');
    const pdfBtn = $('[data-pdf]');
    const say = $('[data-say]');
    const state = { report: null, result: null, token: 0 };
    const list = await rooms();
    if (!list.length) { body.innerHTML = '<div class="ar-card"><div class="ar-note is-warn">หน้านี้สำหรับครูประจำชั้น — บัญชีนี้ยังไม่ได้เป็นครูประจำชั้นของห้องใดในปีนี้</div></div>'; return; }
    roomSel.innerHTML = list.map((r) => `<option value="${esc(r.grade + '/' + r.room)}">${esc(r.grade + '/' + r.room)}</option>`).join('');
    async function load() {
      const token = ++state.token;
      const [grade, room] = roomSel.value.split('/');
      pdfBtn.disabled = true;
      body.innerHTML = '<div class="ar-card"><div class="ar-note"><span class="spinner-border spinner-border-sm"></span> กำลังคำนวณเวลาเรียนทุกวิชาของห้อง…</div></div>';
      try {
        const report = await global.GasServer.getRoomAttendanceRisk(grade, room);
        if (token !== state.token) return;
        state.report = report;
        state.result = classify(report);
        render(body, report, state.result);
        pdfBtn.disabled = !report.students.length || !(report.subjects || []).length;
      } catch (error) {
        if (token !== state.token) return;
        body.innerHTML = `<div class="ar-card"><div class="ar-note is-err">${esc(error?.message || error)}</div></div>`;
      }
    }
    pdfBtn.addEventListener('click', async () => {
      const { report, result } = state;
      if (!report) return;
      const win = global.open('', '_blank');
      pdfBtn.disabled = true;
      say.className = 'ar-say';
      say.textContent = 'กำลังสร้าง PDF…';
      try {
        const rows = pdfRows(result);
        const p = report.print || {};
        const url = await global.PP5PDF.createSubjectAttendanceReport({
          title: 'รายชื่อนักเรียนที่เวลาเรียนรายวิชาไม่ถึงเกณฑ์',
          subtitle: `ชั้น ${report.grade} ห้อง ${report.classNo} ปีการศึกษา ${report.academicYear} · มส. ${result.failing.length} คน · ใกล้ มส. ${result.nearOnly.length} คน`,
          head: [['ที่', 'รหัส', 'ชื่อ-นามสกุล', 'รายวิชา', 'เวลาที่ขาด', 'ร้อยละ', 'สถานะ']],
          body: rows.length ? rows : [['', '', 'ไม่มีนักเรียนที่เวลาเรียนต่ำกว่าร้อยละ 85', '', '', '', '']],
          nameColumn: 2, statusColumn: 6,
          note: `มส. = เวลาเรียนต่ำกว่าร้อยละ ${FAIL} (ไม่มีสิทธิ์สอบ) · ใกล้ มส. = ร้อยละ ${FAIL} ถึงต่ำกว่า ${NEAR} · ${RULE_NOTE} · ข้อมูลถึงวันที่พิมพ์`,
          signers: [
            { role: 'ครูประจำชั้น', name: text(p.classTeacher) },
            { role: 'หัวหน้างานวิชาการ', name: text(p.academicHead) },
            { role: text(p.directorPosition || 'ผู้อำนวยการโรงเรียน'), name: text(p.directorName) }
          ]
        }, p);
        if (win && !win.closed) win.location.href = url;
        else {
          const a = doc.createElement('a');
          a.href = url;
          a.download = `นักเรียนเสี่ยง_มส_${report.grade}-${report.classNo}.pdf`;
          doc.body.appendChild(a);
          a.click();
          a.remove();
        }
        say.textContent = 'สร้าง PDF แล้ว — เปิดในแท็บใหม่';
      } catch (error) {
        if (win && !win.closed) win.close();
        say.className = 'ar-say is-err';
        say.textContent = `สร้าง PDF ไม่สำเร็จ: ${error?.message || error}`;
      } finally {
        pdfBtn.disabled = false;
      }
    });
    roomSel.addEventListener('change', load);
    $('[data-reload]').addEventListener('click', load);
    await load();
  }

  if (global.PP5PageBanner?.PAGES && !global.PP5PageBanner.PAGES.attendance_risk) {
    global.PP5PageBanner.PAGES.attendance_risk = {
      icon: 'bi-exclamation-octagon', title: 'นักเรียนเสี่ยง มส.',
      sub: 'เวลาเรียนทุกวิชาของห้อง — ใครต่ำกว่าร้อยละ 80 (มส.) หรือใกล้เกณฑ์ วิชาไหน', hide: '#pp5AttendanceRisk > .ar-title'
    };
  }
  function apply() {
    const root = doc.getElementById('pp5AttendanceRisk');
    if (!root || root.__pp5Mounted) return;
    root.__pp5Mounted = true;
    mount(root).catch((error) => { const box = root.querySelector('[data-body]'); if (box) box.innerHTML = `<div class="ar-card"><div class="ar-note is-err">${esc(error?.message || error)}</div></div>`; });
  }
  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5AttendanceRisk) return;
    frame.__pp5AttendanceRisk = true;
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(apply).observe(frame, { childList: true, subtree: true });
    apply();
  }
  global.GAS_PAGES = global.GAS_PAGES || {};
  global.GAS_PAGES.attendance_risk = shell();
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
  global.PP5AttendanceRisk = { classify, pdfRows, statusOf, FAIL, NEAR };
})(window);
