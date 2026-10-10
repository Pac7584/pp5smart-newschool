/* exam-import.js — นำเข้าคะแนนสอบ (กลางภาค/ปลายภาค) จากระบบ "ห้องสอบดิจิทัล" เข้าตารางกรอกคะแนน PP5
 * - ดึงผ่านฟังก์ชัน pp5_export (ต้องมี "รหัสเชื่อมต่อ") ไม่ต้องใช้รหัสผ่านฐานข้อมูล
 * - ไม่บันทึกเอง: เติมค่าลงช่องกรอก ให้ครูตรวจแล้วกดปุ่ม "บันทึก" เดิมของ PP5
 */
(function () {
  'use strict';
  // ระบบห้องสอบดิจิทัลของโรงเรียน: js/app-config.js (examImport) ไม่ได้ตั้งค่า = ไม่มีปุ่มนำเข้า
  var EXAM_CFG = (window.PP5_CONFIG && window.PP5_CONFIG.examImport) || null;
  if (!EXAM_CFG || !EXAM_CFG.url || !EXAM_CFG.anonKey) return;
  var EXAM_URL = String(EXAM_CFG.url).trim();
  while (EXAM_URL.slice(-1) === '/') EXAM_URL = EXAM_URL.slice(0, -1);
  var EXAM_ANON = EXAM_CFG.anonKey;
  var KEY_STORE = 'pp5_exam_link_key';
  var SUBJ = { thai: 'ภาษาไทย', math: 'คณิตศาสตร์', sci: 'วิทยาศาสตร์', soc: 'สังคมศึกษา', hist: 'ประวัติศาสตร์',
    health: 'สุขศึกษาและพลศึกษา', art: 'ศิลปะ', work: 'การงานอาชีพ', eng: 'ภาษาอังกฤษ', civic: 'หน้าที่พลเมือง', anti: 'การป้องกันการทุจริต' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').replace(/\s+/g, ''); }
  function r1(x) { return Math.round(Math.round(x * 1e6) / 1e6); } // ปัดเป็นจำนวนเต็ม: .5 ขึ้นไปปัดขึ้น ต่ำกว่าปัดลง
  var memKey = '';
  function getKey() { try { return localStorage.getItem(KEY_STORE) || memKey; } catch (e) { return memKey; } }
  function setKey(k) { memKey = k || ''; try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch (e) {} }

  async function callExport(key, grade) {
    var res = await fetch(EXAM_URL + '/rest/v1/rpc/pp5_export', {
      method: 'POST',
      headers: { apikey: EXAM_ANON, Authorization: 'Bearer ' + EXAM_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: key, p_grade: grade })
    });
    var txt = await res.text();
    if (!res.ok) { throw new Error(/bad_key/.test(txt) ? 'bad_key' : 'HTTP ' + res.status); }
    return JSON.parse(txt);
  }

  function ctx() {
    var g = document.getElementById('scoreEntryGradeSelect'), sj = document.getElementById('scoreEntrySubjectSelect');
    var grade = g ? g.value : '', subjName = '';
    try { subjName = JSON.parse(sj.value).name || ''; } catch (e) { subjName = sj && sj.selectedOptions[0] ? sj.selectedOptions[0].textContent : ''; }
    var m = /ป\.?\s*([1-6])/.exec(grade);
    var pane = document.querySelector('#scoreEntryTerm1.active, #scoreEntryTerm2.active');
    var table = pane ? pane.querySelector('.score-entry-table') : null;
    return { grade: grade, examGrade: m ? 'p' + m[1] : null, subjName: subjName, pane: pane, table: table, term: pane && pane.id === 'scoreEntryTerm2' ? 'ภาคเรียนที่ 2' : 'ภาคเรียนที่ 1' };
  }

  function subjMatches(examSubject, ppName) {
    var a = norm(SUBJ[examSubject]), b = norm(ppName);
    return !!a && !!b && (b.indexOf(a) === 0 || a.indexOf(b) === 0);
  }

  var st = null; // { ctx, exams, key }

  function closeModal() { var m = document.getElementById('examImportModal'); if (m) m.remove(); st = null; }
  function modal(html) {
    var m = document.getElementById('examImportModal');
    if (!m) {
      m = document.createElement('div'); m.id = 'examImportModal';
      m.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px';
      m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
      document.body.appendChild(m);
    }
    m.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:760px;width:100%;max-height:90vh;overflow:auto;padding:20px 22px;box-shadow:0 20px 50px rgba(0,0,0,.3);font-size:14px">' + html + '</div>';
  }

  function head(t) { return '<div class="d-flex justify-content-between align-items-center mb-2"><h5 class="m-0"><i class="fas fa-file-import"></i> ' + esc(t) + '</h5><button type="button" class="btn-close" id="eiClose"></button></div>'; }
  function bindClose() { var c = document.getElementById('eiClose'); if (c) c.onclick = closeModal; }

  function askKey(msg) {
    modal(head('เชื่อมต่อระบบสอบ') +
      '<p class="text-muted">ใส่ "รหัสเชื่อมต่อ" ที่ได้จากระบบสอบ (ตั้งครั้งเดียว เครื่องนี้จะจำไว้)</p>' +
      (msg ? '<div class="alert alert-danger py-2">' + esc(msg) + '</div>' : '') +
      '<input id="eiKey" class="form-control mb-3" placeholder="PP5-xxxxxxxxxxxxxxxxxxxxxxxx" autocomplete="off">' +
      '<div class="text-end"><button class="btn btn-primary" id="eiKeyGo">เชื่อมต่อ</button></div>');
    bindClose();
    document.getElementById('eiKeyGo').onclick = function () {
      var k = document.getElementById('eiKey').value.trim(); if (!k) return;
      setKey(k); start();
    };
  }

  async function start() {
    var c = ctx();
    if (!c.table) { modal(head('นำเข้าคะแนนจากระบบสอบ') + '<div class="alert alert-warning">กรุณาเลือกชั้น/ห้อง/วิชา แล้วกดโหลดข้อมูล และเปิดแท็บ "ภาคเรียน 1" หรือ "ภาคเรียน 2" ก่อน</div>'); bindClose(); return; }
    if (!c.examGrade) { modal(head('นำเข้าคะแนนจากระบบสอบ') + '<div class="alert alert-warning">ระบบสอบมีเฉพาะชั้น ป.1–ป.6</div>'); bindClose(); return; }
    var key = getKey(); if (!key) { askKey(''); return; }
    modal(head('นำเข้าคะแนนจากระบบสอบ') + '<p>กำลังดึงข้อมูลจากระบบสอบ…</p>'); bindClose();
    try {
      var exams = await callExport(key, c.examGrade);
      exams = exams.filter(function (e) { return e.rows && e.rows.length; });
      st = { ctx: c, exams: exams, key: key };
      render();
    } catch (err) {
      if (err.message === 'bad_key') { setKey(''); askKey('รหัสเชื่อมต่อไม่ถูกต้อง'); }
      else { modal(head('นำเข้าคะแนนจากระบบสอบ') + '<div class="alert alert-danger">เชื่อมต่อระบบสอบไม่สำเร็จ: ' + esc(err.message) + '</div>'); bindClose(); }
    }
  }

  function fullOf(table, idx) {
    if (idx === 'final') { var sp = table.querySelector('.score-entry-full-final'); return Number(sp ? sp.textContent : 0) || 0; }
    var i = table.querySelector('.score-entry-full-score[data-index="' + idx + '"]'); return Number(i ? i.value : 0) || 0;
  }

  function rowsOf(table) {
    var map = {};
    table.querySelectorAll('tbody tr').forEach(function (tr) { map[String(tr.getAttribute('data-student-id'))] = tr; });
    return map;
  }
  function inputOf(tr, idx) { return idx === 'final' ? tr.querySelector('.score-entry-final-input') : tr.querySelector('.score-entry-input[data-index="' + idx + '"]'); }

  function compute(examId, target) {
    var ex = st.exams.filter(function (e) { return e.id === examId; })[0]; if (!ex) return null;
    var table = st.ctx.table, full = fullOf(table, target), map = rowsOf(table), out = [], seen = {};
    ex.rows.forEach(function (r) {
      var tr = r.code ? map[String(r.code)] : null;
      var item = { code: r.code, no: r.no, raw: r.score, total: r.total, pending: r.pending > 0, tr: tr, val: null, note: '' };
      if (!r.code) item.note = 'ไม่พบรหัสนักเรียนในระบบสอบ';
      else if (!tr) item.note = 'ไม่อยู่ในห้องนี้ของ PP5';
      else if (item.pending) item.note = 'รอครูตรวจข้อเขียน (ข้าม)';
      else { item.val = r1(Math.min(full, r.score / r.total * full)); seen[String(r.code)] = 1; }
      out.push(item);
    });
    var missing = Object.keys(map).filter(function (k) { return !seen[k] && !out.some(function (o) { return String(o.code) === k; }); });
    return { ex: ex, full: full, items: out, missing: missing, map: map };
  }

  function render() {
    var c = st.ctx;
    if (!st.exams.length) { modal(head('นำเข้าคะแนนจากระบบสอบ') + '<div class="alert alert-info">ยังไม่มีผลสอบของชั้นนี้ในระบบสอบ</div>'); bindClose(); return; }
    var sel = st.sel || {};
    var pre = st.exams.filter(function (e) { return subjMatches(e.subject, c.subjName); });
    var cur = sel.exam || (pre[0] || st.exams[0]).id;
    var target = sel.target !== undefined ? sel.target : '4';
    var list = pre.length ? pre.concat(st.exams.filter(function (e) { return pre.indexOf(e) < 0; })) : st.exams;
    var opts = list.map(function (e) { return '<option value="' + esc(e.id) + '"' + (e.id === cur ? ' selected' : '') + '>' + esc(e.title) + ' (' + e.rows.length + ' คน)</option>'; }).join('');
    var tOpts = '';
    for (var i = 0; i < 9; i++) tOpts += '<option value="' + i + '"' + (String(i) === String(target) ? ' selected' : '') + '>ครั้งที่ ' + (i + 1) + (i === 4 ? ' — สอบกลางภาค' : '') + '</option>';
    tOpts += '<option value="final"' + (target === 'final' ? ' selected' : '') + '>สอบปลายภาค</option>';
    var res = compute(cur, target);
    var ok = res.items.filter(function (x) { return x.val !== null; });
    var exist = ok.filter(function (x) { var inp = inputOf(x.tr, target); return inp && inp.value !== '' && Number(inp.value) !== x.val; }).length;
    var body = '<p class="text-muted mb-2">วิชา ' + esc(c.subjName) + ' · ' + esc(c.grade) + ' · ' + esc(c.term) + '</p>' +
      '<div class="row g-2 mb-2"><div class="col-md-7"><label class="form-label mb-1">ชุดสอบในระบบสอบ</label><select id="eiExam" class="form-select">' + opts + '</select></div>' +
      '<div class="col-md-5"><label class="form-label mb-1">ลงช่อง</label><select id="eiTarget" class="form-select">' + tOpts + '</select></div></div>';
    if (!res.full) {
      body += '<div class="alert alert-warning">ช่องนี้ยังไม่ได้ตั้ง "คะแนนเต็ม" (แถว "เต็ม" ในตาราง) กรุณาตั้งก่อน แล้วเปิดหน้านี้ใหม่</div>';
    } else {
      body += '<div class="alert alert-light border py-2">คะแนนสอบจะถูกย่อส่วนเป็นคะแนนเต็ม <b>' + res.full + '</b> ของช่องนี้ (คะแนนที่ได้ ÷ คะแนนเต็มของข้อสอบ × ' + res.full + ' ปัดเป็นจำนวนเต็ม: เศษ .5 ขึ้นไปปัดขึ้น ต่ำกว่า .5 ปัดลง) · ใช้ครั้งที่ทำได้ดีที่สุดของแต่ละคน</div>' +
        '<div class="table-responsive" style="max-height:340px;overflow:auto"><table class="table table-sm align-middle"><thead><tr><th>รหัส</th><th>ชื่อ</th><th class="text-end">ได้/เต็ม (สอบ)</th><th class="text-end">คะแนนที่จะลง</th><th>หมายเหตุ</th></tr></thead><tbody>' +
        res.items.map(function (x) {
          var nm = x.tr ? (x.tr.querySelector('.score-entry-student-name') || {}).textContent : '';
          var inp = x.tr && x.val !== null ? inputOf(x.tr, target) : null;
          var was = inp && inp.value !== '' ? ' <small class="text-muted">(เดิม ' + esc(inp.value) + ')</small>' : '';
          return '<tr' + (x.val === null ? ' class="table-warning"' : '') + '><td>' + esc(x.code || '-') + '</td><td>' + esc(nm || 'เลขที่ ' + x.no) + '</td><td class="text-end">' + x.raw + '/' + x.total + '</td><td class="text-end"><b>' + (x.val === null ? '-' : x.val) + '</b>' + was + '</td><td class="text-muted">' + esc(x.note) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="mt-2 mb-1">จะลงคะแนน <b>' + ok.length + '</b> คน' + (res.missing.length ? ' · นักเรียนใน PP5 ที่ยังไม่มีผลสอบ ' + res.missing.length + ' คน (' + esc(res.missing.join(', ')) + ')' : '') + '</p>' +
        (exist ? '<div class="alert alert-warning py-2">มี ' + exist + ' คนที่มีคะแนนเดิมในช่องนี้ และจะถูกเขียนทับ</div>' : '') +
        '<p class="text-muted small">ปุ่มนี้แค่เติมคะแนนลงตาราง ยังไม่บันทึก — ตรวจสอบแล้วกดปุ่ม "บันทึก" ด้านบนของหน้ากรอกคะแนน</p>';
    }
    body += '<div class="d-flex justify-content-between mt-2"><button class="btn btn-link text-danger p-0" id="eiReset">เปลี่ยนรหัสเชื่อมต่อ</button><div><button class="btn btn-secondary me-2" id="eiCancel">ยกเลิก</button><button class="btn btn-success" id="eiApply"' + (res.full && ok.length ? '' : ' disabled') + '>เติมคะแนนลงตาราง</button></div></div>';
    modal(head('นำเข้าคะแนนจากระบบสอบ') + body); bindClose();
    document.getElementById('eiExam').onchange = function () { st.sel = { exam: this.value, target: document.getElementById('eiTarget').value }; render(); };
    document.getElementById('eiTarget').onchange = function () { st.sel = { exam: document.getElementById('eiExam').value, target: this.value }; render(); };
    document.getElementById('eiCancel').onclick = closeModal;
    document.getElementById('eiReset').onclick = function () { setKey(''); askKey(''); };
    var ap = document.getElementById('eiApply');
    if (ap) ap.onclick = function () {
      ok.forEach(function (x) {
        var inp = inputOf(x.tr, target); if (!inp) return;
        inp.value = x.val;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('blur', { bubbles: true }));
      });
      var n = ok.length; closeModal();
      var note = document.createElement('div');
      note.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2100;background:#166534;color:#fff;padding:12px 16px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.3)';
      note.textContent = 'เติมคะแนน ' + n + ' คนแล้ว — ตรวจสอบและกด "บันทึก" เพื่อยืนยัน';
      document.body.appendChild(note); setTimeout(function () { note.remove(); }, 7000);
    };
  }

  function inject() {
    var bar = document.querySelector('.score-entry-main-content .toolbar-actions');
    if (!bar || document.getElementById('btnExamImport')) return;
    var b = document.createElement('button');
    b.id = 'btnExamImport'; b.type = 'button'; b.className = 'btn btn-outline-warning btn-sm';
    b.innerHTML = '<i class="fas fa-file-import"></i> นำเข้าจากระบบสอบ';
    b.title = 'ดึงคะแนนสอบกลางภาค/ปลายภาคจากห้องสอบดิจิทัล';
    b.onclick = start;
    bar.insertBefore(b, bar.firstChild);
  }
  var t = null;
  new MutationObserver(function () { clearTimeout(t); t = setTimeout(inject, 150); }).observe(document.documentElement, { childList: true, subtree: true });
  inject();
  window.ExamImport = { start: start, _compute: function () { return st; } };
})();
