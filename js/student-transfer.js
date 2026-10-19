// นักเรียนย้ายออก (owner 2026-10-18: "เพิ่มเมนูนักเรียนย้าย เลือกนักเรียนแล้วออกเอกสารให้ ผอ.เซ็น")
// ข้อตกลงกับเจ้าของ: รอบแรกพิมพ์ แบบ พฐ.19 (คำร้องผู้ปกครอง) + พฐ.19/1 (หนังสือส่งตัว ๓ ชุด) ตามคู่มือที่เจ้าของส่งมา
//   2026-10-18 (แทน บค.19/บค.20 เดิม) · เก็บประวัติ · ตัวอักษรบาง ไม่มีตัวหนา ·
//   นักเรียนออกจากรายชื่อห้องเมื่อผู้ดูแลกด "ยืนยันย้ายออก" เท่านั้น · เลขที่หนังสือกรอกเอง (จำคำนำหน้าให้)
//   ช่องลงชื่อเว้นว่างให้เซ็นด้วยมือ · ตราครุฑลายเส้น assets/brand/garuda-line.svg (Wikimedia Commons, สาธารณสมบัติ)
// หน้า "นักเรียนย้ายออก" (student_transfer) เฉพาะผู้ดูแล: ① ทำเรื่องย้าย  ② ประวัติการย้าย (พิมพ์ซ้ำ/แก้/ยืนยัน/ยกเลิก)
// ฐานข้อมูล: supabase/migrations/202610180035_student_transfers.sql (ตาราง student_transfers + pp5_confirm_student_transfer)
(function initStudentTransfer(global) {
  'use strict';
  const doc = global.document;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const client = () => global.PP5Data?.client;
  const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
    'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
  const GARUDA = 'assets/brand/garuda-line.svg';
  const REASONS = ['ย้ายตามผู้ปกครอง', 'ผู้ปกครองย้ายที่อยู่', 'ผู้ปกครองย้ายที่ทำงาน', 'ใกล้ที่พักอาศัย'];
  const missingSchema = (error) => /student_transfers|pp5_confirm_student_transfer|schema cache|does not exist|PGRST20[25]/i
    .test(String(error?.message || error?.code || ''));
  const SETUP_HINT = 'เมนูนี้ยังไม่พร้อม: ผู้ดูแลต้องรัน SQL <b>202610180035_student_transfers.sql</b> ใน Supabase ก่อน';

  // ---------------------------------------------------------------- ตัวช่วยข้อความในเอกสาร
  const thaiDigits = (value) => String(value ?? '').replace(/[0-9]/g, (d) => THAI_DIGITS[d]);
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

  // วันที่ ISO (ค.ศ. หรือ พ.ศ.) -> { day, month, year พ.ศ. }
  function dateParts(value) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value || ''));
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!month || month > 12 || !day || day > 31) return null;
    return { day, month: MONTHS[month - 1], year: year < 2400 ? year + 543 : year };
  }
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // "ป.3" -> "ประถมศึกษาปีที่ 3"
  function gradeLong(grade) {
    const m = /^(อ|ป|ม)\.?\s*(\d+)/.exec(clean(grade));
    if (!m) return clean(grade);
    return ({ อ: 'อนุบาลปีที่ ', ป: 'ประถมศึกษาปีที่ ', ม: 'มัธยมศึกษาปีที่ ' })[m[1]] + m[2];
  }

  // ที่อยู่ข้อความเดียวจาก DMC เช่น "12/3 ม.4 ต.บ้านใหม่" -> บ้านเลขที่ + หมู่
  function parseAddress(text) {
    const value = clean(text);
    const house = (/^(?:บ้านเลขที่\s*)?([0-9][0-9/\-]*)/.exec(value) || [])[1] || '';
    const moo = (/(?:หมู่(?:ที่)?|ม\.)\s*([0-9]+)/.exec(value) || [])[1] || '';
    return { house, moo };
  }

  const schoolLabel = (name) => clean(name).replace(/^โรงเรียน\s*/, '');

  // สิ่งที่ส่งมาด้วย (เจ้าของเลือก 2026-10-18: ติ๊กเลือกได้ พิมพ์เฉพาะที่ติ๊ก เรียงเลขใหม่) — ๓ ข้อแรกตามแบบ พฐ.19/1
  // ติ๊กไว้ก่อน · ปพ.๖ และใบรับรองเวลาเรียนตามคู่มือการย้าย · form.attachments = [{ label, count }] เฉพาะที่ติ๊ก
  const ATTACHMENTS = [
    { key: 'pp9', label: 'ปพ.๙', on: true },
    { key: 'pp1', label: 'ปพ.๑', on: true },
    { key: 'health', label: 'บัตรบันทึกสุขภาพและหรือระเบียนสะสม', on: true },
    { key: 'pp6', label: 'สมุดรายงานประจำตัวนักเรียน (ปพ.๖)', on: false },
    { key: 'time', label: 'ใบรับรองเวลาเรียนและคะแนนเก็บ', on: false }
  ];
  // เรื่องที่บันทึกก่อนมีรายการติ๊ก (pp9/pp1/health) ยังพิมพ์ซ้ำได้: ใช้เฉพาะรายการที่มีจำนวน
  function attachmentsOf(form) {
    const f = form || {};
    if (Array.isArray(f.attachments)) return f.attachments.filter((a) => clean(a?.label));
    return ATTACHMENTS.slice(0, 3).map((a) => ({ label: a.label, count: f[a.key] })).filter((a) => Number(a.count) > 0);
  }
  const fullName = (s) => clean(`${s?.prefix || ''}${s?.first_name || ''} ${s?.last_name || ''}`);

  // ---------------------------------------------------------------- เอกสาร พฐ.19 / พฐ.19/1 (ตัวบาง ไม่หนา ตามแบบราชการ)
  // ตามคู่มือการย้ายนักเรียน (เจ้าของส่งมา 2026-10-18): พฐ.19 คำร้องผู้ปกครอง · พฐ.19/1 หนังสือส่งตัว ๓ ชุด (แทน บค.20)
  // ค่าที่กรอกพิมพ์ทับเส้นจุดแบบฟอร์ม (ตัวปกติ ไม่หนา) · ค่าว่างพิมพ์เป็นเส้นจุดให้เขียนด้วยมือ
  const fill = (value, width = 'm') => {
    const v = clean(value);
    return v ? `<span class="v">${esc(thaiDigits(v))}</span>` : `<span class="blank ${width}"></span>`;
  };
  function dateLine(iso) {
    const p = dateParts(iso);
    return `วันที่${fill(p?.day, 's')}เดือน${fill(p?.month)}พ.ศ.${fill(p?.year, 's')}`;
  }
  // แบบฟอร์มพิมพ์ "เขต/อำเภอ/กิ่งอำเภอ" แต่กิ่งอำเภอยกเลิกแล้ว (2550) เจ้าของให้ตัดออก 2026-10-19 -> "เขต/อำเภอ"
  const address = (a) => `บ้านเลขที่${fill(a?.house, 's')}หมู่ที่${fill(a?.moo, 's')}แขวง/ตำบล${fill(a?.subdistrict)}`
    + `เขต/อำเภอ${fill(a?.district)}จังหวัด${fill(a?.province)}`;
  // ที่ตั้งโรงเรียนแยกบรรทัดตามที่พิมพ์ไว้ในตั้งค่า (ขึ้นบรรทัดใหม่ หรือคั่นด้วยจุลภาค)
  // ที่อยู่บรรทัดเดียว (ไม่มีขึ้นบรรทัด/จุลภาค) ขึ้นบรรทัดใหม่ก่อน "จังหวัด" เหมือนหนังสือจริง ไม่ตัดกลางชื่อจังหวัด
  const addressLines = (school) => {
    if (!clean(school.address)) return [];
    const lines = String(school.address).split(/\s*(?:\n|,)\s*/).map(clean).filter(Boolean);
    return lines.length === 1 ? lines[0].split(/\s+(?=(?:จังหวัด|จ\.)\S)/).map(clean).filter(Boolean) : lines;
  };
  // "เขียนที่" บรรทัดแรกชื่อโรงเรียน บรรทัดต่อไปที่ตั้ง (ตามแบบมีเส้นจุดสองบรรทัด)
  const writtenAt = (school) => `<div class="block">เขียนที่${fill(school.name, 'l')}</div>`
    + (addressLines(school).length
      ? addressLines(school).map((line) => `<div class="block indent">${esc(thaiDigits(line))}</div>`).join('')
      : '<div class="block"><span class="blank xl"></span></div>');
  function studentLine(snap, n = 1) {
    const born = dateParts(snap?.birth_date);
    return `${thaiDigits(n)}.${fill(fullName(snap), 'l')}เกิดวันที่${fill(born?.day, 's')}เดือน${fill(born?.month)}พ.ศ.${fill(born?.year, 's')}`
      + `เลขประจำตัวประชาชน${fill(snap?.national_id)}นักเรียนชั้น${fill(gradeLong(snap?.grade))}`;
  }

  // แบบ พฐ.19 (คำร้องขอย้ายนักเรียน) — พี่น้องที่ยื่นพร้อมกันอยู่ในคำร้องฉบับเดียว (ข้อ ๑. ๒. ตามแบบ)
  function bk19(records, school) {
    const list = Array.isArray(records) ? records : [records];
    const record = list[0];
    const f = record.form || {};
    const dest = { subdistrict: f.dest_subdistrict, district: f.dest_district, province: f.dest_province };
    return `<section class="sheet bk19">
<div class="code">แบบ พฐ.๑๙</div>
<div class="title">คำร้องขอย้ายนักเรียน</div>
${writtenAt(school)}
<div class="block">${dateLine(f.request_date)}</div>
<p class="topic">เรื่อง&emsp;ขอย้ายนักเรียน</p>
<p class="topic">เรียน&emsp;ผู้อำนวยการโรงเรียน${fill(schoolLabel(school.name), 'l')}</p>
<p class="para">ด้วย ข้าพเจ้า${fill(f.guardian_name, 'l')}อยู่${address(f.guardian)}
มีความประสงค์ขอย้ายนักเรียนในปกครองของข้าพเจ้าซึ่งปัจจุบันเรียนอยู่ในสถานศึกษานี้ไปเข้าเรียนที่${fill(record.destination_school, 'l')}
แขวง/ตำบล${fill(dest.subdistrict)}เขต/อำเภอ${fill(dest.district)}จังหวัด${fill(dest.province)} ดังนี้</p>
${list.map((r, i) => `<p class="para">${studentLine(r.student_snapshot || {}, i + 1)}</p>`).join('\n')}
<p class="para">ทั้งนี้ เนื่องจาก${fill(f.reason, 'xl')}และการย้ายไปเข้าเรียนในโรงเรียนดังกล่าว
นักเรียนจะพักอยู่${address(f.new_address)}</p>
<p class="para">จึงเรียนมาเพื่อโปรดพิจารณา</p>
<div class="sign"><div>ขอแสดงความนับถือ</div><div class="gap"></div>
<div>(ลงชื่อ)<span class="blank l"></span></div><div>(${fill(f.guardian_name, 'l')})</div><div>ผู้ปกครอง</div></div>
</section>`;
  }

  // แบบ พฐ.19/1 (หนังสือส่งนักเรียนไปเข้าเรียนในสถานศึกษาที่ขอย้ายเข้า) — พี่น้องอยู่ในหนังสือฉบับเดียว ข้อ ๑. ๒.
  function bk20(records, school) {
    const list = Array.isArray(records) ? records : [records];
    const record = list[0];
    const f = record.form || {};
    const count = (n) => fill(Number(n) > 0 ? String(Number(n)) : '', 's');
    const position = clean(school.directorPosition) || `ผู้อำนวยการโรงเรียน${schoolLabel(school.name)}`;
    // วางตามหนังสือภายนอก (ระเบียบงานสารบรรณ): ครุฑ ๓ ซม. กลางหน้า · "ที่" ชิดซ้าย และชื่อ/ที่ตั้งโรงเรียนด้านขวา
    // บรรทัดแรกอยู่ระดับช่วงล่างของครุฑ · วันที่เริ่มกึ่งกลางหน้า · ลงท้าย ชื่อในวงเล็บ + ตำแหน่ง (เว้นที่ลงนาม)
    const date = dateParts(record.doc_date);
    return `<section class="sheet bk20 letter">
<div class="code">แบบ พฐ.๑๙/๑</div>
<div class="letterhead">
  <img class="garuda" src="${esc(school.base)}${GARUDA}" alt="ตราครุฑ">
  <div class="docno">ที่ ${clean(record.doc_no) ? esc(thaiDigits(clean(record.doc_no))) : '<span class="blank l"></span>'}</div>
  <div class="owner"><div>${esc(thaiDigits(clean(school.name)))}</div>${addressLines(school).map((line) => `<div>${esc(thaiDigits(line))}</div>`).join('')}</div>
</div>
<div class="letterdate">${date ? esc(thaiDigits(`${date.day} ${date.month} ${date.year}`)) : '<span class="blank l"></span>'}</div>
<div class="row"><span>เรื่อง</span><span>ส่งนักเรียนขอย้ายมาเข้าเรียน</span></div>
<div class="row"><span>เรียน</span><span>ผู้อำนวยการโรงเรียน${fill(schoolLabel(record.destination_school), 'l')}</span></div>
${attachmentsOf(f).length ? `<table class="enc">${attachmentsOf(f).map((a, i) => `<tr><td>${i ? '' : 'สิ่งที่ส่งมาด้วย'}</td>`
  + `<td>${thaiDigits(i + 1)}. ${esc(thaiDigits(clean(a.label)))}</td><td class="n">จำนวน${count(a.count)}ฉบับ</td></tr>`).join('')}</table>` : ''}
<p class="para">ด้วย ${fill(f.guardian_name, 'l')}อยู่${address(f.guardian)}
ได้ขอย้ายนักเรียนในปกครองมาเข้าเรียนในสถานศึกษานี้ ได้แก่</p>
${list.map((r, i) => `<p class="para">${studentLine(r.student_snapshot || {}, i + 1)}</p>`).join('\n')}
<p class="para">เนื่องจาก${fill(f.reason, 'xl')}อนึ่ง นักเรียนที่ย้ายมาเข้าเรียนนี้จะพักอยู่${address(f.new_address)}</p>
<p class="para">จึงเรียนมาเพื่อโปรดทราบและดำเนินการต่อไป</p>
<div class="closing"><div>ขอแสดงความนับถือ</div><div class="signspace"></div>
<div>(${clean(school.director) ? esc(clean(school.director)) : '<span class="blank l"></span>'})</div><div>${esc(thaiDigits(position))}</div></div>
${clean(school.phone) ? `<div class="contact"><div>${esc(thaiDigits(clean(school.name)))}</div><div>โทร. ${esc(thaiDigits(clean(school.phone)))}</div></div>` : ''}
</section>`;
  }

  // ฟอนต์หนังสือราชการ TH Sarabun New ๑๖ พอยต์ (ติดตั้งในเครื่องโรงเรียนเกือบทุกเครื่อง) — เทียบกับหนังสือจริงที่เจ้าของส่งมา
  // 2026-10-18: Sarabun ของ Google เส้นหนาและตัวใหญ่กว่าแม้ตั้งน้ำหนักบาง · เครื่องที่ไม่มีฟอนต์ราชการใช้ Sarabun ของระบบแทน
  // ไม่มีตัวหนาในเอกสาร
  const printStyle = (base) => `
@font-face{font-family:'PP5Sarabun';src:url('${base}assets/fonts/Sarabun-Regular.ttf') format('truetype');font-weight:400;font-style:normal}
@page{size:A4;margin:20mm 20mm 16mm 30mm}
*{box-sizing:border-box}
body{margin:0;font-family:'TH Sarabun New','TH SarabunPSK','TH SarabunIT๙','PP5Sarabun',sans-serif;font-weight:400;font-size:16pt;line-height:1.2;color:#000}
b,strong,h1,h2,h3{font-weight:400}
.letter .v{border-bottom:0;padding:0 .15em}
.block.indent{padding-left:2.2em}
.sheet{position:relative;page-break-after:always;break-after:page}
.sheet:last-child{page-break-after:auto;break-after:auto}
.code{text-align:right}
.title{text-align:center;margin:2px 0 6px}
.block{margin-left:55%}
.topic{margin:6px 0}
.para{text-indent:2.5cm;margin:2px 0;text-align:justify;text-justify:inter-character}
.v{border-bottom:1px dotted #000;padding:0 .25em}
.blank{display:inline-block;border-bottom:1px dotted #000;height:1.15em;vertical-align:baseline;margin:0 .15em}
.blank.s{width:2.8em}.blank.m{width:7em}.blank.l{width:12em}.blank.xl{width:22em}
.bk20 .code{position:absolute;right:0;top:-1.2em}
.letterhead{position:relative;min-height:3cm;padding-top:2.05cm}
.letterhead .garuda{position:absolute;top:0;left:50%;transform:translateX(-50%);height:3cm}
.letterhead .docno{position:absolute;left:0;top:2.05cm}
.letterhead .owner{margin-left:calc(50% + 1.8cm)}
.letterdate{margin:10px 0 8px 50%}
.row{display:grid;grid-template-columns:1.6cm 1fr;margin:6px 0}
.enc{border-collapse:collapse;margin:5px 0;width:100%}.enc td{padding:0 10px 0 0;vertical-align:top}
.enc td:first-child{width:2.9cm;white-space:nowrap}.enc td.n{text-align:right;white-space:nowrap;padding-right:0}
.closing{margin:24px 0 0 40%;text-align:center}.closing .signspace{height:1.6cm}
.contact{margin-top:1.4cm}
.sign{margin:22px 0 0 40%;text-align:center;line-height:1.5}.sign .gap{height:30px}
.cert .ctitle{text-align:center;font-size:18pt}
.cert .csub{text-align:center;margin-bottom:6px}
.cert .para{margin-bottom:4px;line-height:1.15}
.ct{width:100%;border-collapse:collapse;margin:4px 0;font-size:13pt;line-height:1.1}
.ct th,.ct td{border:1px solid #000;padding:1px 6px;font-weight:400;vertical-align:middle}
.ct th{text-align:center}.ct td.c{text-align:center}
.ct tr.grp td{background:#f1f1f1}
.ct .w1{width:2.4cm}.ct .w2{width:2.2cm}.ct .w3{width:1.6cm}.ct .w4{width:3.2cm}.ct .w5{width:6.2cm}
.cnote{font-size:13pt;margin:4px 0 0}
.csigns{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;margin-top:14px}
.csign{text-align:center;line-height:1.35;font-size:14pt}.csign .blank.l{width:7em}.csign .role{white-space:nowrap}
.cert .clogo{display:block;height:2.2cm;max-width:5cm;object-fit:contain;margin:0 auto 4px}
.cissued{text-align:right;margin-top:8px;font-size:13pt}
@media screen{body{background:#e5e7eb;padding:16px}.sheet{background:#fff;width:210mm;max-width:100%;min-height:297mm;margin:0 auto 16px;padding:20mm 20mm 16mm 30mm;box-shadow:0 2px 10px rgba(0,0,0,.15)}
.bk20 .code{right:20mm;top:calc(20mm - 1.2em)}}`;

  // พี่น้องที่บันทึกพร้อมกัน (ผู้ปกครอง ปลายทาง เหตุผล วันที่ ที่พัก เลขหนังสือเดียวกัน) รวมเป็น พฐ.19 / พฐ.19/1 ฉบับเดียว
  function requestGroups(records) {
    const groups = new Map();
    records.forEach((r) => {
      const f = r.form || {};
      const key = JSON.stringify([clean(f.guardian_name), clean(r.destination_school), f.request_date || '', clean(f.reason),
        f.new_address || {}, f.guardian || {}, clean(r.doc_no), r.doc_date || '']);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    return [...groups.values()];
  }

  // records: แถว student_transfers (หรือร่างที่ยังไม่บันทึก) · which: 'both' | 'bk19' | 'bk20'
  function buildDocument(records, school, { which = 'both', copies = 3 } = {}) {
    const sheets = [];
    const groups = requestGroups(records);
    if (which !== 'bk20') groups.forEach((group) => sheets.push(bk19(group, school)));
    if (which !== 'bk19') groups.forEach((group) => {
      for (let i = 0; i < Math.max(1, Math.min(5, Number(copies) || 1)); i += 1) sheets.push(bk20(group, school));
    });
    const title = records.length === 1 ? `เอกสารย้ายนักเรียน ${fullName(records[0].student_snapshot)}` : `เอกสารย้ายนักเรียน ${records.length} คน`;
    const endScript = '<' + '/script>';
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${printStyle(esc(school.base || ''))}</style></head><body>
${sheets.join('\n')}
<script>Promise.all([document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()].concat(Array.from(document.images).map(function(i){return i.complete?0:new Promise(function(r){i.onload=i.onerror=r;});}))).then(function(){setTimeout(function(){window.print();},300);});${endScript}</body></html>`;
  }

  // ---------------------------------------------------------------- ไฟล์ Word (.docx) (เจ้าของขอ 2026-10-19)
  // ข้อความชุดเดียวกับฉบับพิมพ์ (tools/student-transfer-contract.cjs เทียบข้อความทั้งสองแบบทุกครั้ง) · TH Sarabun New ๑๖ พอยต์
  // ไม่มีตัวหนา · A4 ขอบ ๓/๒ ซม. · ครุฑ ๓ ซม. ลอยกลางหน้า (PNG ที่วาดจาก SVG ตอนดาวน์โหลด) · ค่าที่กรอกใน พฐ.19 ขีดเส้นจุด
  // หน่วย twip (๑ ซม. = ๕๖๗) · กว้างพื้นที่พิมพ์ = A4 11906 - ซ้าย 1701 - ขวา 1134
  const DX = { width: 9071, half: 4536, block: 4990, owner: 5556, tabTopic: 907, tabEnc: 1644, indent: 1418, closing: 3629 };
  const DOTS = { s: '........', m: '................', l: '..........................', xl: '..............................................' };
  function docxBuilder() {
    let pictureId = 0;
    const run = (text, { u = false, size = 0 } = {}) => (text === '' || text == null ? '' : `<w:r>${u || size ? `<w:rPr>${u ? '<w:u w:val="dotted"/>' : ''}${size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`);
    const tab = '<w:r><w:tab/></w:r>';
    // ค่าที่กรอก: พิมพ์ทับเส้นจุด (dotted = แบบฟอร์ม พฐ.19) หรือข้อความเรียบ (หนังสือ พฐ.19/1) · ค่าว่าง = จุดให้เขียนด้วยมือ
    const val = (value, width = 'm', dotted = true) => {
      const v = clean(value);
      return v ? run(` ${thaiDigits(v)} `, { u: dotted }) : run(DOTS[width] || DOTS.m);
    };
    const para = (runs, o = {}) => `<w:p><w:pPr>${o.pageBreak ? '<w:pageBreakBefore/>' : ''}${o.tabs ? `<w:tabs>${o.tabs.map(([kind, pos]) => `<w:tab w:val="${kind}" w:pos="${pos}"/>`).join('')}</w:tabs>` : ''}`
      + `<w:spacing w:before="${o.before || 0}" w:after="${o.after || 0}" ${o.exact ? `w:line="${o.exact}" w:lineRule="exact"` : 'w:line="240" w:lineRule="auto"'}/>`
      + `${o.left || o.first ? `<w:ind w:left="${o.left || 0}"${o.first ? ` w:firstLine="${o.first}"` : ''}/>` : ''}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${runs}</w:p>`;
    // ชิดซ้าย: ทดสอบกับ Word 2026-10-19 — thaiDistribute ยืดทุกตัวอักษร ("เ ข ต / อ ำ เ ภ อ") และ both ยืดช่องว่างจนห่างมาก
    // ในบรรทัดที่มีคำน้อย (Word ไม่ตัดข้อความไทยยาวที่ไม่มีวรรค)
    const body = (runs) => para(runs, { first: DX.indent });
    const address = (a, dotted) => run('บ้านเลขที่') + val(a?.house, 's', dotted) + run('หมู่ที่') + val(a?.moo, 's', dotted) + run('แขวง/ตำบล')
      + val(a?.subdistrict, 'm', dotted) + run('เขต/อำเภอ') + val(a?.district, 'm', dotted) + run('จังหวัด') + val(a?.province, 'm', dotted);
    const studentLine = (snap, n, dotted) => {
      const born = dateParts(snap?.birth_date);
      return run(`${thaiDigits(n)}.`) + val(fullName(snap), 'l', dotted) + run('เกิดวันที่') + val(born?.day, 's', dotted) + run('เดือน')
        + val(born?.month, 'm', dotted) + run('พ.ศ.') + val(born?.year, 's', dotted) + run('เลขประจำตัวประชาชน') + val(snap?.national_id, 'm', dotted)
        + run('นักเรียนชั้น') + val(gradeLong(snap?.grade), 'm', dotted);
    };
    // ครุฑลอยกลางหน้า ชิดขอบบนพื้นที่พิมพ์ สูง ๓ ซม. (EMU: ๑ ซม. = 360000)
    const garuda = () => {
      pictureId += 1;
      const cy = 1080000;
      const cx = Math.round(cy * 105.6 / 112.4);
      return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${pictureId}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">`
        + '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="margin"><wp:align>center</wp:align></wp:positionH>'
        + `<wp:positionV relativeFrom="margin"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>`
        + `<wp:docPr id="${pictureId}" name="ตราครุฑ ${pictureId}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`
        + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
        + `<pic:nvPicPr><pic:cNvPr id="${pictureId}" name="garuda.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdGaruda"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
        + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
    };

    function request(records, school, pageBreak) {
      const list = Array.isArray(records) ? records : [records];
      const record = list[0];
      const f = record.form || {};
      const p = dateParts(f.request_date);
      const lines = addressLines(school);
      return [
        para(run('แบบ พฐ.๑๙'), { jc: 'right', pageBreak }),
        para(run('คำร้องขอย้ายนักเรียน'), { jc: 'center', after: 120 }),
        para(run('เขียนที่') + val(school.name, 'l'), { left: DX.block }),
        ...(lines.length ? lines.map((line) => para(run(thaiDigits(line)), { left: DX.block + 600 })) : [para(run(DOTS.xl), { left: DX.block })]),
        para(run('วันที่') + val(p?.day, 's') + run('เดือน') + val(p?.month) + run('พ.ศ.') + val(p?.year, 's'), { left: DX.block, after: 120 }),
        para(run('เรื่อง') + tab + run('ขอย้ายนักเรียน'), { tabs: [['left', DX.tabTopic]], before: 120 }),
        para(run('เรียน') + tab + run('ผู้อำนวยการโรงเรียน') + val(schoolLabel(school.name), 'l'), { tabs: [['left', DX.tabTopic]], before: 60, after: 120 }),
        body(run('ด้วย ข้าพเจ้า') + val(f.guardian_name, 'l') + run('อยู่') + address(f.guardian, true)
          + run('มีความประสงค์ขอย้ายนักเรียนในปกครองของข้าพเจ้าซึ่งปัจจุบันเรียนอยู่ในสถานศึกษานี้ไปเข้าเรียนที่') + val(record.destination_school, 'l')
          + run('แขวง/ตำบล') + val(f.dest_subdistrict) + run('เขต/อำเภอ') + val(f.dest_district) + run('จังหวัด') + val(f.dest_province) + run(' ดังนี้')),
        ...list.map((r, i) => body(studentLine(r.student_snapshot || {}, i + 1, true))),
        body(run('ทั้งนี้ เนื่องจาก') + val(f.reason, 'xl') + run('และการย้ายไปเข้าเรียนในโรงเรียนดังกล่าว นักเรียนจะพักอยู่') + address(f.new_address, true)),
        body(run('จึงเรียนมาเพื่อโปรดพิจารณา')),
        para(run('ขอแสดงความนับถือ'), { left: DX.closing, jc: 'center', before: 360 }),
        para('', { exact: 600 }),
        para(run('(ลงชื่อ)') + run(DOTS.l), { left: DX.closing, jc: 'center' }),
        para(run('(') + val(f.guardian_name, 'l') + run(')'), { left: DX.closing, jc: 'center' }),
        para(run('ผู้ปกครอง'), { left: DX.closing, jc: 'center' })
      ].join('');
    }

    function letter(records, school, pageBreak) {
      const list = Array.isArray(records) ? records : [records];
      const record = list[0];
      const f = record.form || {};
      const date = dateParts(record.doc_date);
      const position = clean(school.directorPosition) || `ผู้อำนวยการโรงเรียน${schoolLabel(school.name)}`;
      const items = attachmentsOf(f);
      return [
        para(run('แบบ พฐ.๑๙/๑', { size: 28 }), { jc: 'right', exact: 360, pageBreak }),
        // บรรทัด "ที่" อยู่ ๒.๐๕ ซม. จากขอบบน (ระดับช่วงล่างของครุฑ) เหมือนฉบับพิมพ์
        para(garuda(), { exact: 1162 - 360 }),
        para(run(`ที่ ${clean(record.doc_no) ? thaiDigits(clean(record.doc_no)) : DOTS.l}`) + tab + run(thaiDigits(clean(school.name))), { tabs: [['left', DX.owner]] }),
        ...addressLines(school).map((line) => para(run(thaiDigits(line)), { left: DX.owner })),
        para(run(date ? thaiDigits(`${date.day} ${date.month} ${date.year}`) : DOTS.l), { left: DX.half, before: 200, after: 160 }),
        para(run('เรื่อง') + tab + run('ส่งนักเรียนขอย้ายมาเข้าเรียน'), { tabs: [['left', DX.tabTopic]], after: 80 }),
        para(run('เรียน') + tab + run('ผู้อำนวยการโรงเรียน') + val(schoolLabel(record.destination_school), 'l', false), { tabs: [['left', DX.tabTopic]], after: 80 }),
        ...items.map((a, i) => para((i ? '' : run('สิ่งที่ส่งมาด้วย')) + tab + run(`${thaiDigits(i + 1)}. ${thaiDigits(clean(a.label))}`) + tab
          + run('จำนวน') + val(Number(a.count) > 0 ? String(Number(a.count)) : '', 's', false) + run('ฉบับ'), { tabs: [['left', DX.tabEnc], ['right', DX.width]], after: i === items.length - 1 ? 80 : 0 })),
        body(run('ด้วย ') + val(f.guardian_name, 'l', false) + run('อยู่') + address(f.guardian, false) + run('ได้ขอย้ายนักเรียนในปกครองมาเข้าเรียนในสถานศึกษานี้ ได้แก่')),
        ...list.map((r, i) => body(studentLine(r.student_snapshot || {}, i + 1, false))),
        body(run('เนื่องจาก') + val(f.reason, 'xl', false) + run('อนึ่ง นักเรียนที่ย้ายมาเข้าเรียนนี้จะพักอยู่') + address(f.new_address, false)),
        body(run('จึงเรียนมาเพื่อโปรดทราบและดำเนินการต่อไป')),
        para(run('ขอแสดงความนับถือ'), { left: DX.closing, jc: 'center', before: 360 }),
        para('', { exact: 907 }),
        para(run(`(${clean(school.director) || DOTS.l})`), { left: DX.closing, jc: 'center' }),
        para(run(thaiDigits(position)), { left: DX.closing, jc: 'center' }),
        ...(clean(school.phone) ? [para('', { exact: 794 }), para(run(thaiDigits(clean(school.name)))), para(run(`โทร. ${thaiDigits(clean(school.phone))}`))] : [])
      ].join('');
    }
    return { request, letter };
  }

  // ส่วนประกอบของไฟล์ .docx (ยกเว้นรูปครุฑ word/media/garuda.png ที่วาดในเบราว์เซอร์) — แยกไว้ให้ทดสอบได้โดยไม่ต้องมีเบราว์เซอร์
  function buildDocxParts(records, school, { which = 'both', copies = 3 } = {}) {
    const b = docxBuilder();
    const pages = [];
    const groups = requestGroups(records);
    if (which !== 'bk20') groups.forEach((group) => pages.push((first) => b.request(group, school, !first)));
    if (which !== 'bk19') groups.forEach((group) => {
      for (let i = 0; i < Math.max(1, Math.min(5, Number(copies) || 1)); i += 1) pages.push((first) => b.letter(group, school, !first));
    });
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const font = '<w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:eastAsia="TH Sarabun New" w:cs="TH Sarabun New"/>';
    return {
      '[Content_Types].xml': `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>`,
      '_rels/.rels': `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      'word/_rels/document.xml.rels': `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdGaruda" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/garuda.png"/></Relationships>`,
      'word/settings.xml': `${head}<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`,
      'word/styles.xml': `${head}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="32"/><w:szCs w:val="32"/><w:lang w:val="th-TH" w:eastAsia="en-US" w:bidi="th-TH"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`,
      'word/document.xml': `${head}<w:document ${NS}><w:body>${pages.map((page, i) => page(i === 0)).join('')}`
        + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="907" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>'
    };
  }

  // ครุฑลายเส้น SVG -> PNG ความสูง ๓ ซม. ที่ ๓๐๐ dpi (Word รุ่นเก่าไม่แสดง SVG)
  async function garudaPng(base) {
    const img = new global.Image();
    img.src = `${base}${GARUDA}`;
    await img.decode();
    const canvas = doc.createElement('canvas');
    canvas.height = 354;
    canvas.width = Math.round(354 * 105.6 / 112.4);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('วาดตราครุฑไม่สำเร็จ'))), 'image/png'));
  }
  // ตัวสร้างไฟล์ zip โหลดเมื่อกดดาวน์โหลดครั้งแรก (ตัวเดียวกับที่หน้าสำรองข้อมูลใช้)
  function loadJsZip() {
    if (global.JSZip) return Promise.resolve(global.JSZip);
    return new Promise((resolve, reject) => {
      const script = doc.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      script.onload = () => (global.JSZip ? resolve(global.JSZip) : reject(new Error('โหลดตัวสร้างไฟล์ Word ไม่สำเร็จ')));
      script.onerror = () => reject(new Error('โหลดตัวสร้างไฟล์ Word ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'));
      doc.head.appendChild(script);
    });
  }
  async function downloadDocx(records, school, options) {
    const [JSZip, png] = await Promise.all([loadJsZip(), garudaPng(school.base || '')]);
    const zip = new JSZip();
    Object.entries(buildDocxParts(records, school, options)).forEach(([name, content]) => zip.file(name, content));
    zip.file('word/media/garuda.png', png);
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const who = records.length === 1 ? fullName(records[0].student_snapshot) : `${records.length}คน`;
    const link = doc.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `เอกสารย้ายนักเรียน_${who.replace(/[\\/:*?"<>|\s]+/g, '_')}.docx`;
    doc.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
  }

  // ---------------------------------------------------------------- ใบรับรองเวลาเรียน/ผลการเรียน (เจ้าของขอ 2026-10-19)
  // ข้อตกลง: เวลาเรียนรวมทั้งภาคจากเช็คชื่อรายวัน (ระบบไม่มีชั่วโมงที่ขาดรายวิชา) · คะแนนระหว่างเรียน เต็ม/ได้ · ไม่มีหน่วยกิต
  // (ประถม) · คุณลักษณะ / อ่าน คิดวิเคราะห์ เขียน ประเมินรายคน จึงสรุปใต้ตาราง (ใช้ฟังก์ชันเดียวกับ ปพ.6) · ลงนาม ครูประจำชั้น
  // + หัวหน้างานวิชาการ + ผู้อำนวยการ
  // ชั่วโมงต่อภาค: วิชาเฉพาะภาค (semester 1/2) = hours_per_year ของภาคนั้น · วิชาทั้งปี = ครึ่งหนึ่ง
  function certificateRows(subjects, scores, term) {
    const byId = new Map((scores || []).map((row) => [String(row.subject_id), row]));
    const breakdownOf = (row) => {
      let raw = row?.score_breakdown || {};
      if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (_) { raw = {}; } }
      return raw && typeof raw === 'object' ? raw : {};
    };
    const configOf = (subject) => {
      let raw = subject?.score_config || {};
      if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (_) { raw = {}; } }
      return raw && typeof raw === 'object' ? raw : {};
    };
    return (subjects || [])
      .filter((s) => s.active !== false && (!Number(s.semester) || Number(s.semester) === Number(term)))
      .map((s) => {
        const row = byId.get(String(s.id));
        const breakdown = breakdownOf(row);
        const rounds = Array.isArray(breakdown.fullScores) ? breakdown.fullScores.reduce((sum, v) => sum + (Number(v) || 0), 0) : 0;
        const full = rounds > 0 ? rounds : (Number(configOf(s).formative_max) || 70);
        const got = row ? (row.formative_score ?? breakdown.mid ?? null) : null;
        const yearHours = Number(s.hours_per_year);
        const hours = Number.isFinite(yearHours) && yearHours > 0 ? (Number(s.semester) ? yearHours : yearHours / 2) : null;
        return { code: clean(s.code), name: clean(s.name), type: clean(s.subject_type), hours, full, got: got === null || got === '' ? null : Number(got) };
      })
      .sort((a, b) => (subjectOrder(a.name) - subjectOrder(b.name)) || a.code.localeCompare(b.code, 'th', { numeric: true }) || a.name.localeCompare(b.name, 'th'));
  }
  // ลำดับวิชาเดียวกับ ปพ.6 (PARENT_SUBJECT_ORDER_ ใน gas-bridge): ภาษาไทย คณิต วิทย์ ... หน้าที่พลเมือง การป้องกันการทุจริต
  // เดิมเรียงตามรหัสวิชา จึงได้ ค ง ท พ ว ... (owner 2026-10-18 "ไม่เรียงตามวิชาเหมือนที่เราเคยเรียง")
  const SUBJECT_ORDER = ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์', 'เทคโนโลยี', 'สังคมศึกษา', 'ประวัติศาสตร์', 'สุขศึกษา', 'ศิลปะ', 'การงาน', 'ภาษาอังกฤษ', 'หน้าที่พลเมือง', 'การป้องกัน'];
  function subjectOrder(name) {
    const index = SUBJECT_ORDER.findIndex((item) => String(name || '').includes(item));
    return index < 0 ? 999 : index;
  }
  // กิจกรรมพัฒนาผู้เรียน: ชั่วโมงจากวิชาประเภทกิจกรรม (จับคู่ตามชื่อ) · ผลจากการประเมินกิจกรรมของ ปพ.6
  const ACTIVITY_MATCH = [/แนะแนว/, /ลูกเสือ|เนตรนารี|ยุวกาชาด|ผู้บำเพ็ญ/, /ชุมนุม/, /สังคม|สาธารณ/];
  function certificateActivities(rows, summaryItems) {
    const activityRows = (rows || []).filter((r) => r.type === 'กิจกรรม');
    return ACTIVITY_MATCH.map((pattern, i) => {
      const item = (summaryItems || [])[i] || {};
      const label = clean(item.label).replace(/^\d+\.\s*/, '') || ['กิจกรรมแนะแนว', 'ลูกเสือ-เนตรนารี', 'ชุมนุม', 'เพื่อสังคมและสาธารณประโยชน์'][i];
      const hours = activityRows.filter((r) => pattern.test(r.name)).reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
      const val = clean(item.val);
      return { label, hours: hours || null, result: val && val !== 'ยังไม่ประเมิน' ? val : 'ยังไม่ประเมิน' };
    });
  }
  function certificateAttendance(rows) {
    const counted = (rows || []).filter((r) => ['present', 'leave', 'absent', 'late'].includes(String(r.status)));
    const count = (status) => counted.filter((r) => r.status === status).length;
    const present = count('present') + count('late');
    const dates = counted.map((r) => String(r.attendance_date)).sort();
    return { present, leave: count('leave'), absent: count('absent'), total: counted.length, from: dates[0] || '', to: dates[dates.length - 1] || '' };
  }

  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? '-' : thaiDigits(String(Math.round(Number(v) * 100) / 100)));
  const longDate = (iso) => { const p = dateParts(iso); return p ? thaiDigits(`${p.day} ${p.month} ${p.year}`) : ''; };
  // ตราโรงเรียนจากหน้าตั้งค่า: รูปที่ฝังไว้ ลิงก์รูป หรือรหัสไฟล์ Google Drive
  function logoSrc(value) {
    const v = clean(value);
    if (!v) return '';
    if (/^(?:data:image\/|https?:\/\/|blob:)/i.test(v)) {
      const id = /^data:/i.test(v) ? '' : (v.match(/(?:\/d\/|[?&]id=)([-\w]{20,})/) || [])[1];
      return id ? `https://lh3.googleusercontent.com/d/${id}` : v;
    }
    if (/^[-\w]{20,}$/.test(v)) return `https://lh3.googleusercontent.com/d/${v}`;
    if (/^[A-Za-z0-9+/=\s]+$/.test(v) && v.length > 100) return `data:image/png;base64,${v.replace(/\s/g, '')}`;
    return '';
  }
  function certificateSheet(c, school) {
    const snap = c.student || {};
    const att = c.attendance || {};
    const pct = att.total ? Math.round((att.present / att.total) * 10000) / 100 : null;
    const subjectRows = (type, title) => {
      const list = (c.rows || []).filter((r) => r.type === type);
      if (!list.length) return '';
      return `<tr class="grp"><td colspan="5">${title}</td></tr>` + list.map((r) => `<tr><td class="c">${esc(thaiDigits(r.code)) || '-'}</td><td>${esc(r.name)}</td>`
        + `<td class="c">${num(r.hours)}</td><td class="c">${num(r.full)}</td><td class="c">${num(r.got)}</td></tr>`).join('');
    };
    const position = clean(school.directorPosition) || `ผู้อำนวยการโรงเรียน${schoolLabel(school.name)}`;
    const signer = (name, role) => `<div class="csign"><div>ลงชื่อ<span class="blank l"></span></div><div>(${clean(name) ? esc(clean(name)) : '<span class="blank l"></span>'})</div><div class="role">${esc(thaiDigits(role))}</div></div>`;
    const logo = logoSrc(school.logo);
    return `<section class="sheet cert">
${logo ? `<img class="clogo" src="${esc(logo)}" alt="">` : ''}<div class="ctitle">ใบรับรองเวลาเรียนและผลการเรียน</div>
<div class="csub">${esc(thaiDigits(clean(school.name)))} ${esc(thaiDigits(addressLines(school).join(' ')))}</div>
<p class="para">ขอรับรองว่า${fill(fullName(snap), 'l')}เลขประจำตัว${fill(c.studentId, 's')}ศึกษาอยู่ชั้น${fill(gradeLong(snap.grade))}
ภาคเรียนที่${fill(String(c.term), 's')}ปีการศึกษา${fill(c.year, 's')} มีเวลาเรียนและผลการเรียน ตั้งแต่วันที่${fill(longDate(att.from), 'l')}ถึงวันที่${fill(longDate(att.to), 'l')} ดังนี้</p>
<table class="ct"><thead><tr><th rowspan="2" class="w1">รหัสวิชา</th><th rowspan="2">ชื่อวิชา</th><th rowspan="2" class="w2">ชั่วโมง<br>ต่อภาค</th><th colspan="2">คะแนนระหว่างเรียน</th></tr>
<tr><th class="w3">เต็ม</th><th class="w3">ได้</th></tr></thead><tbody>
${subjectRows('พื้นฐาน', 'สาระพื้นฐาน')}${subjectRows('เพิ่มเติม', 'สาระเพิ่มเติม')}
</tbody></table>
<table class="ct"><thead><tr><th>กิจกรรมพัฒนาผู้เรียน</th><th class="w2">ชั่วโมงต่อภาค</th><th class="w4">ผลการประเมิน</th></tr></thead><tbody>
${(c.activities || []).map((a) => `<tr><td>${esc(a.label)}</td><td class="c">${num(a.hours)}</td><td class="c">${esc(a.result)}</td></tr>`).join('')}
</tbody></table>
<table class="ct"><tbody>
<tr><td class="w5">เวลาเรียน</td><td>มาเรียน ${num(att.present)} วัน ลา ${num(att.leave)} วัน ขาด ${num(att.absent)} วัน จากวันเรียน ${num(att.total)} วัน${pct === null ? '' : ` (ร้อยละ ${num(pct)})`}</td></tr>
<tr><td>คุณลักษณะอันพึงประสงค์</td><td>${esc(clean(c.character) || 'ยังไม่ประเมิน')}</td></tr>
<tr><td>การอ่าน คิดวิเคราะห์ และเขียน</td><td>${esc(clean(c.reading) || 'ยังไม่ประเมิน')}</td></tr>
</tbody></table>
<p class="cnote">หมายเหตุ คะแนนระหว่างเรียนและเวลาเรียนเป็นข้อมูลที่บันทึกในระบบถึงวันที่ออกใบรับรองนี้</p>
<div class="csigns">${signer(c.homeroom, 'ครูประจำชั้น')}${signer(school.academicHead, 'หัวหน้างานวิชาการ')}${signer(school.director, position)}</div>
<div class="cissued">ออกให้ ณ วันที่ ${esc(longDate(c.issued))}</div>
</section>`;
  }
  function buildCertificateDocument(list, school) {
    const endScript = '<' + '/script>';
    const title = list.length === 1 ? `ใบรับรองเวลาเรียน ${fullName(list[0].student)}` : `ใบรับรองเวลาเรียน ${list.length} คน`;
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${printStyle(esc(school.base || ''))}
.cert .ctitle{font-weight:700}</style></head><body>
${list.map((c) => certificateSheet(c, school)).join('\n')}
<script>(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){window.print();},300);});${endScript}</body></html>`;
  }

  // ---------------------------------------------------------------- หน้าเว็บ
  const STYLE = `
.pp5-tr{max-width:1100px;margin:0 auto;display:grid;gap:14px}
.pp5-tr-card{background:var(--bg-card,#fff);border:1px solid var(--border-color,#e2e8f0);border-radius:16px;padding:18px 20px;box-shadow:0 2px 10px rgba(15,23,42,.05)}
.pp5-tr-head h2{margin:0;font-size:1.35rem;font-weight:800}
.pp5-tr-head p{margin:4px 0 0;color:var(--text-secondary,#64748b)}
.pp5-tr-tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--border-color,#e2e8f0);margin:12px 0 0}
.pp5-tr-tabs button{border:0;background:none;padding:9px 14px;font-weight:600;color:var(--text-secondary,#64748b);border-radius:9px 9px 0 0;cursor:pointer}
.pp5-tr-tabs button[aria-selected="true"]{color:var(--primary);box-shadow:inset 0 -3px 0 var(--primary);background:color-mix(in srgb,var(--primary) 7%,transparent)}
.pp5-tr h3{font-size:1.02rem;font-weight:700;margin:16px 0 8px}
.pp5-tr h3:first-child{margin-top:0}
.pp5-tr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px 14px}
.pp5-tr-grid label,.pp5-tr-pick label.f{display:grid;gap:4px;font-weight:600;font-size:.9rem}
.pp5-tr-grid .wide{grid-column:1/-1}
.pp5-tr-pick{display:flex;gap:12px;flex-wrap:wrap;align-items:end}
.pp5-tr-pick select{min-width:110px}
.pp5-tr-students{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px;margin-top:10px;max-height:300px;overflow:auto;padding:2px}
.pp5-tr-students label{display:flex;gap:8px;align-items:center;padding:7px 10px;border:1px solid var(--border-color,#e2e8f0);border-radius:10px;cursor:pointer}
.pp5-tr-students label:has(input:checked){border-color:var(--primary);background:color-mix(in srgb,var(--primary) 8%,transparent)}
.pp5-tr-hint{color:var(--text-secondary,#64748b);font-size:.88rem}
.pp5-tr table{width:100%;border-collapse:collapse}
.pp5-tr th,.pp5-tr td{padding:8px;border-bottom:1px solid var(--border-color,#eef2f7);text-align:left;vertical-align:middle}
.pp5-tr-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px}
.pp5-tr-pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.82rem;font-weight:700;white-space:nowrap}
.pp5-tr-pill.requested{background:#fef9c3;color:#854d0e}.pp5-tr-pill.transferred{background:#dcfce7;color:#166534}.pp5-tr-pill.cancelled{background:#e2e8f0;color:#475569}
.pp5-tr-msg{padding:10px 14px;border-radius:12px;font-weight:600}
.pp5-tr-msg.info{background:#eff6ff;color:#1e40af}.pp5-tr-msg.ok{background:#dcfce7;color:#166534}.pp5-tr-msg.err{background:#fee2e2;color:#991b1b}
.pp5-tr-row-actions{display:flex;gap:6px;flex-wrap:wrap}
.pp5-tr-att{display:grid;gap:6px;margin-top:12px;padding:12px 14px;border:1px solid var(--border-color,#e2e8f0);border-radius:12px}
.pp5-tr-att-head{font-weight:700}
.pp5-tr-att-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pp5-tr-att-row .form-check-input{margin:0;width:1.15em;height:1.15em;flex:none}
.pp5-tr-att-row [data-att-label]{max-width:280px;flex:1 1 180px}
.pp5-tr-att-n{display:inline-flex;align-items:center;gap:6px;margin-left:auto;white-space:nowrap}
.pp5-tr-att-n input{width:4.5em}
.pp5-tr [hidden]{display:none!important}
.pp5-tr-preview{position:fixed;inset:0;z-index:2000;background:rgba(15,23,42,.72);display:flex;flex-direction:column;padding:12px;gap:8px}
.pp5-tr-preview-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;color:#0f172a;border-radius:12px;padding:10px 14px}
.pp5-tr-preview-bar strong{font-size:1rem}
.pp5-tr-preview-hint{color:#475569;font-size:.88rem;flex:1 1 220px}
.pp5-tr-preview iframe{flex:1;width:100%;border:0;border-radius:12px;background:#e5e7eb}
[data-theme="dark"] .pp5-tr-pill.requested{background:#713f12;color:#fef08a}[data-theme="dark"] .pp5-tr-pill.transferred{background:#14532d;color:#bbf7d0}
[data-theme="dark"] .pp5-tr-pill.cancelled{background:#334155;color:#e2e8f0}
@media (max-width:640px){.pp5-tr-card{padding:14px}.pp5-tr-hide-sm{display:none}}`;

  function shell() {
    return `<div class="pp5-tr" id="pp5TransferPage"><style>${STYLE}</style>
<div class="pp5-tr-card pp5-tr-head">
  <h2><i class="bi bi-box-arrow-right" style="color:var(--primary)"></i> นักเรียนย้ายออก</h2>
  <p>เลือกนักเรียน กรอกข้อมูลการย้าย แล้วพิมพ์ แบบ พฐ.๑๙ (คำร้องผู้ปกครอง) และ พฐ.๑๙/๑ (หนังสือส่งตัว) ให้ผู้อำนวยการลงนาม</p>
  <div class="pp5-tr-tabs" role="tablist">
    <button type="button" role="tab" data-tab="new" aria-selected="true">ทำเรื่องย้าย</button>
    <button type="button" role="tab" data-tab="history" aria-selected="false">ประวัติการย้าย</button>
  </div>
</div>
<div class="pp5-tr-msg" data-msg hidden role="status"></div>
<div class="pp5-tr-card" data-body><div class="pp5-tr-hint">กำลังโหลด…</div></div>
</div>`;
  }

  async function mount(root) {
    const role = String(global.localStorage?.getItem('role') || '').toLowerCase();
    const state = {
      // เจ้าหน้าที่ธุรการ (registrar, SQL 036) ใช้หน้านี้ได้ทั้งหมด ยกเว้นปุ่ม "ยืนยันย้ายออก" (owner 2026-10-18: ผู้ดูแลระบบกดเท่านั้น)
      isAdmin: role === 'admin',
      canUse: role === 'admin' || role === 'registrar',
      year: '', school: {}, students: [], transfers: [], tab: 'new', editing: null, selected: new Set(), details: new Map(),
      grade: '', room: ''
    };
    const $ = (sel) => root.querySelector(sel);
    const body = $('[data-body]');
    // ข้อความแสดงทั้งบนสุดของหน้า และข้างปุ่มบันทึก (ถ้ามีฟอร์ม) จะได้เห็นทุกครั้งที่กด
    const say = (text, kind) => {
      root.querySelectorAll('[data-msg],[data-form-msg]').forEach((box) => {
        box.hidden = !text;
        box.className = `pp5-tr-msg ${kind || 'info'}`;
        box.innerHTML = text || '';
      });
    };
    if (!state.canUse) { body.innerHTML = '<div class="pp5-tr-hint">เมนูนี้สำหรับผู้ดูแลระบบและเจ้าหน้าที่ธุรการ (งานทะเบียน)</div>'; return; }

    const settings = await global.PP5Data.settings.get();
    state.year = String(settings.academicYear || settings.academic_year || '');
    state.semester = Number(settings.semester) === 2 ? 2 : 1;
    state.school = {
      name: settings.school_name || settings.schoolName || '',
      address: settings.school_address || settings.schoolAddress || '',
      director: settings.director_name || settings.directorName || '',
      directorPosition: settings.director_position || '',
      academicHead: settings.academic_head || settings.academicHead || '',
      logo: settings.logo_base64 || settings.logoDataUrl || settings.logo || '',
      phone: settings.school_phone || settings.schoolPhone || settings.phone || '',
      base: new URL('.', global.location.href).href
    };

    async function loadStudents() {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await client().from('students')
          .select('id,national_id,prefix,first_name,last_name,grade,room,student_number')
          .eq('status', 'active').order('grade').order('room').order('student_number').range(from, from + 999);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      state.students = rows;
    }
    async function loadTransfers() {
      const { data, error } = await client().from('student_transfers').select('*').order('created_at', { ascending: false }).limit(300);
      if (error) throw error;
      state.transfers = data || [];
    }
    async function loadDetails(ids) {
      const missing = ids.filter((id) => !state.details.has(id));
      for (let i = 0; i < missing.length; i += 100) {
        const chunk = missing.slice(i, i + 100);
        const { data, error } = await client().from('student_details')
          .select('student_id,birth_date,address,subdistrict,district,province,father_name,father_last_name,mother_name,mother_last_name,guardian_name,guardian_relation')
          .in('student_id', chunk);
        if (error) throw error;
        chunk.forEach((id) => state.details.set(id, null));
        (data || []).forEach((row) => state.details.set(String(row.student_id), row));
      }
    }

    try {
      await Promise.all([loadStudents(), loadTransfers()]);
    } catch (error) {
      body.innerHTML = `<div class="pp5-tr-msg err">${missingSchema(error) ? SETUP_HINT : esc(error.message || error)}</div>`;
      return;
    }

    const studentById = (id) => state.students.find((s) => String(s.id) === String(id));
    const lastPrefix = () => {
      const last = state.transfers.find((t) => clean(t.doc_no));
      return last ? clean(last.doc_no).replace(/[0-9๐-๙]+\s*$/, '') : '';
    };
    // ชื่อ + นามสกุล (ข้อมูล DMC เก็บแยกช่อง; ถ้าชื่อมีนามสกุลอยู่แล้วไม่ต่อซ้ำ)
    const joinName = (first, last) => (clean(last) && !clean(first).endsWith(clean(last)) ? clean(`${first || ''} ${last}`) : clean(first));
    const guardianChoices = (detail) => [
      { key: 'guardian', name: clean(detail?.guardian_name), label: `ผู้ปกครองตามทะเบียน${clean(detail?.guardian_relation) ? ` (${clean(detail.guardian_relation)})` : ''}` },
      { key: 'father', name: joinName(detail?.father_name, detail?.father_last_name), label: 'บิดา' },
      { key: 'mother', name: joinName(detail?.mother_name, detail?.mother_last_name), label: 'มารดา' }
    ].filter((c) => c.name);
    state.guardianChoices = [];

    function snapshotOf(student, detail) {
      return {
        prefix: student.prefix || '', first_name: student.first_name || '', last_name: student.last_name || '',
        national_id: student.national_id || '', birth_date: detail?.birth_date || '', grade: student.grade || '',
        room: student.room || '', student_number: student.student_number ?? null
      };
    }

    // ---------------- แท็บ ทำเรื่องย้าย
    function addressFields(prefix, a = {}) {
      return `<label>บ้านเลขที่<input class="form-control" name="${prefix}_house" maxlength="30" value="${esc(a.house)}"></label>
<label>หมู่ที่<input class="form-control" name="${prefix}_moo" maxlength="10" value="${esc(a.moo)}"></label>
<label>แขวง/ตำบล<input class="form-control" name="${prefix}_subdistrict" maxlength="80" value="${esc(a.subdistrict)}"></label>
<label>เขต/อำเภอ<input class="form-control" name="${prefix}_district" maxlength="80" value="${esc(a.district)}"></label>
<label>จังหวัด<input class="form-control" name="${prefix}_province" maxlength="80" value="${esc(a.province)}"></label>`;
    }

    // เรื่องใหม่ใช้รายการสิ่งที่ส่งมาด้วยของเรื่องล่าสุดเป็นค่าเริ่มต้น (เจ้าของขอ 2026-10-19 ไม่ต้องติ๊กใหม่ทุกครั้ง)
    function lastAttachments() {
      const last = state.transfers.find((t) => Array.isArray(t.form?.attachments));
      return last ? last.form.attachments : null;
    }
    // saved: รายการที่บันทึกไว้ (โหมดแก้ไข / เรื่องล่าสุด) หรือ null = ค่าเริ่มต้นตามแบบ
    function attachmentRows(saved) {
      const byLabel = new Map((saved || []).map((a) => [clean(a.label), a]));
      const known = new Set(ATTACHMENTS.map((a) => a.label));
      const other = (saved || []).find((a) => !known.has(clean(a.label)));
      const row = (key, label, on, count, editable) => `<div class="pp5-tr-att-row">
  <input type="checkbox" class="form-check-input" data-att-on="${key}" aria-label="แนบ ${esc(label || 'อื่น ๆ')}"${on ? ' checked' : ''}>
  ${editable ? `<input class="form-control form-control-sm" data-att-label="${key}" maxlength="120" placeholder="อื่น ๆ (ระบุ)" value="${esc(label)}">` : `<span>${esc(label)}</span>`}
  <span class="pp5-tr-att-n">จำนวน <input class="form-control form-control-sm" type="number" min="0" max="9" data-att-count="${key}" value="${esc(count)}"> ฉบับ</span></div>`;
      return ATTACHMENTS.map((a) => {
        const s = byLabel.get(a.label);
        return row(a.key, a.label, saved ? !!s : a.on, s ? s.count : 1, false);
      }).join('') + row('other', other?.label || '', !!other, other ? other.count : 1, true);
    }

    function renderNew() {
      const editing = state.editing;
      const f = editing?.form || {};
      // อนุบาล -> ประถม -> มัธยม (ฐานข้อมูลเรียงตามตัวอักษร ทำให้ อ. ไปอยู่ท้าย ม.)
      const rank = (g) => { const m = /^(อ|ป|ม)\.?\s*(\d+)/.exec(clean(g)); return m ? ({ อ: 0, ป: 100, ม: 200 })[m[1]] + Number(m[2]) : 999; };
      const grades = [...new Set(state.students.map((s) => s.grade))].sort((a, b) => rank(a) - rank(b) || String(a).localeCompare(String(b), 'th'));
      if (!state.grade || !grades.includes(state.grade)) state.grade = grades[0] || '';
      const rooms = [...new Set(state.students.filter((s) => s.grade === state.grade).map((s) => String(s.room)))];
      if (!rooms.includes(state.room)) state.room = rooms[0] || '';
      const list = state.students.filter((s) => s.grade === state.grade && String(s.room) === state.room);
      body.innerHTML = `
${editing ? `<div class="pp5-tr-msg info">กำลังแก้ไขเรื่องย้ายของ <b>${esc(fullName(editing.student_snapshot))}</b> <button type="button" class="btn btn-sm btn-outline-secondary" data-cancel-edit>เลิกแก้ไข</button></div>` : `
<h3>๑. เลือกนักเรียน</h3>
<div class="pp5-tr-pick">
  <label class="f">ชั้น<select class="form-select" data-grade>${grades.map((g) => `<option${g === state.grade ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
  <label class="f">ห้อง<select class="form-select" data-room>${rooms.map((r) => `<option${r === state.room ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
  <span class="pp5-tr-hint">เลือกได้หลายคน (เช่น พี่น้องที่ย้ายพร้อมกัน) · ข้อมูลผู้ปกครองและที่อยู่ใช้ร่วมกัน</span>
</div>
<div class="pp5-tr-students" role="group" aria-label="นักเรียนในห้อง">${list.map((s) => `<label><input type="checkbox" data-student="${esc(s.id)}"${state.selected.has(String(s.id)) ? ' checked' : ''}>
  <span>${esc(s.student_number ?? '')}. ${esc(fullName(s))}</span></label>`).join('') || '<div class="pp5-tr-hint">ไม่มีนักเรียนในห้องนี้</div>'}</div>
<div class="pp5-tr-hint" data-selected-note style="margin-top:6px"></div>`}
<form data-form novalidate>
<h3>๒. โรงเรียนที่จะย้ายไป</h3>
<div class="pp5-tr-grid">
  <label class="wide">ชื่อโรงเรียนปลายทาง *<input class="form-control" name="destination_school" required maxlength="200" value="${esc(editing?.destination_school)}" placeholder="เช่น โรงเรียนบ้านหนองแวง"></label>
  <label>แขวง/ตำบล<input class="form-control" name="dest_subdistrict" maxlength="80" value="${esc(f.dest_subdistrict)}"></label>
  <label>เขต/อำเภอ<input class="form-control" name="dest_district" maxlength="80" value="${esc(f.dest_district)}"></label>
  <label>จังหวัด<input class="form-control" name="dest_province" maxlength="80" value="${esc(f.dest_province)}"></label>
  <label class="wide">เหตุผลที่ย้าย *<input class="form-control" name="reason" required maxlength="300" list="pp5TransferReasons" value="${esc(f.reason)}" autocomplete="off"></label>
  <datalist id="pp5TransferReasons">${REASONS.map((r) => `<option value="${esc(r)}">`).join('')}</datalist>
</div>
<h3>๓. ผู้ปกครองที่ยื่นคำร้อง</h3>
<div class="pp5-tr-grid">
  <label>ผู้ยื่นคำร้อง<select class="form-select" name="guardian_pick" data-guardian-pick><option value="custom">พิมพ์เอง</option></select></label>
  <label class="wide">ชื่อ-สกุลผู้ยื่นคำร้อง (พร้อมคำนำหน้า)<input class="form-control" name="guardian_name" maxlength="160" value="${esc(f.guardian_name)}"></label>
  ${addressFields('guardian', f.guardian)}
</div>
<h3>๔. ที่พักของนักเรียนหลังย้าย</h3>
<div class="pp5-tr-actions" style="margin-top:0"><button type="button" class="btn btn-sm btn-outline-primary" data-copy-address>ใช้ที่อยู่เดียวกับผู้ปกครอง</button></div>
<div class="pp5-tr-grid" style="margin-top:8px">${addressFields('new', f.new_address)}</div>
<h3>๕. หนังสือส่งตัว (พฐ.๑๙/๑)</h3>
<div class="pp5-tr-grid">
  <label class="wide">เลขที่หนังสือ (ที่ ...)<input class="form-control" name="doc_no" maxlength="80" value="${esc(editing ? editing.doc_no || '' : lastPrefix())}" placeholder="เช่น ศธ ๐๔๐๐๑.๐๐๑/๑๒๓"></label>
  <label>วันที่เขียนคำร้อง (พฐ.๑๙)<input class="form-control" type="date" name="request_date" value="${esc(f.request_date || todayIso())}"></label>
  <label>วันที่ออกหนังสือ (พฐ.๑๙/๑)<input class="form-control" type="date" name="doc_date" value="${esc(editing?.doc_date || todayIso())}"></label>
  <label>พิมพ์ พฐ.๑๙/๑ (ชุด)<input class="form-control" type="number" min="1" max="5" name="copies" value="3"></label>
</div>
<div class="pp5-tr-att" data-attachments role="group" aria-label="สิ่งที่ส่งมาด้วย">
  <div class="pp5-tr-att-head">สิ่งที่ส่งมาด้วย <span class="pp5-tr-hint">(พิมพ์เฉพาะรายการที่ติ๊ก เรียงเลขให้เอง)</span></div>
  ${attachmentRows(editing ? attachmentsOf(f) : lastAttachments())}
</div>
<p class="pp5-tr-hint" style="margin:6px 0 0">พฐ.๑๙/๑ ทำ ๓ ชุด: ส่งโรงเรียนปลายทาง ๑ ชุด · ให้ผู้ปกครองถือไป ๑ ชุด · เก็บไว้ที่โรงเรียน ๑ ชุด · พี่น้องที่ย้ายพร้อมกันอยู่ในหนังสือฉบับเดียว</p>
<div class="pp5-tr-msg" data-form-msg hidden role="status" style="margin-top:12px"></div>
<div class="pp5-tr-actions">
  <button type="submit" class="btn btn-primary" data-save><i class="bi bi-printer"></i> ${editing ? 'บันทึกการแก้ไขและพิมพ์' : 'บันทึกและพิมพ์ พฐ.๑๙ + พฐ.๑๙/๑'}</button>
  <button type="button" class="btn btn-outline-secondary" data-preview>ดูตัวอย่าง (ยังไม่บันทึก)</button>
  <button type="button" class="btn btn-outline-secondary" data-docx><i class="bi bi-file-earmark-word"></i> ดาวน์โหลด Word (ยังไม่บันทึก)</button>
  <button type="button" class="btn btn-outline-secondary" data-cert><i class="bi bi-card-checklist"></i> พิมพ์ใบรับรองเวลาเรียน</button>
  <span class="pp5-tr-hint">ช่องที่ว่างจะพิมพ์เป็นเส้นจุดให้เขียนด้วยมือ · ช่องลงชื่อเว้นว่างให้ลงนาม</span>
</div>
</form>`;
      bindNew();
      renderDocNos();
    }

    function selectedStudents() {
      if (state.editing) return [{ id: state.editing.student_id, snapshot: state.editing.student_snapshot, transfer: state.editing }];
      return [...state.selected].map((id) => studentById(id)).filter(Boolean).map((s) => ({ id: String(s.id), student: s }));
    }

    function renderDocNos() {
      const note = $('[data-selected-note]');
      const items = selectedStudents();
      if (note) note.textContent = items.length ? `เลือกแล้ว ${items.length} คน: ${items.map((i) => fullName(i.student)).join(', ')}` : 'ยังไม่ได้เลือกนักเรียน';
    }

    // เติมผู้ปกครอง/ที่อยู่จากข้อมูลนักเรียนคนแรกที่เลือก (เฉพาะช่องที่ยังว่าง)
    async function prefillFromStudent() {
      const items = selectedStudents();
      if (!items.length || state.editing) return;
      try { await loadDetails(items.map((i) => i.id)); } catch (error) { say(esc(error.message || error), 'err'); return; }
      const detail = state.details.get(items[0].id);
      if (!detail) return;
      const form = $('[data-form]');
      const parsed = parseAddress(detail.address);
      const setIfEmpty = (name, value) => { const el = form.elements[name]; if (el && !clean(el.value) && clean(value)) el.value = clean(value); };
      // ตัวเลือกผู้ยื่นคำร้อง (เจ้าของเลือก 2026-10-18): ผู้ปกครองตามทะเบียน (ค่าเริ่มต้น) / บิดา / มารดา / พิมพ์เอง
      const pick = form.elements.guardian_pick;
      const previous = new Set(state.guardianChoices.map((c) => c.name));
      state.guardianChoices = guardianChoices(detail);
      pick.innerHTML = state.guardianChoices.map((c) => `<option value="${c.key}">${esc(c.label)}: ${esc(c.name)}</option>`).join('')
        + '<option value="custom">พิมพ์เอง</option>';
      const nameEl = form.elements.guardian_name;
      if (!clean(nameEl.value) || previous.has(clean(nameEl.value))) {
        const first = state.guardianChoices[0];
        pick.value = first ? first.key : 'custom';
        if (first) nameEl.value = first.name;
      } else {
        pick.value = state.guardianChoices.find((c) => c.name === clean(nameEl.value))?.key || 'custom';
      }
      setIfEmpty('guardian_house', parsed.house);
      setIfEmpty('guardian_moo', parsed.moo);
      setIfEmpty('guardian_subdistrict', detail.subdistrict);
      setIfEmpty('guardian_district', detail.district);
      setIfEmpty('guardian_province', detail.province);
    }

    function readForm() {
      const form = $('[data-form]');
      const v = (name) => clean(form.elements[name]?.value);
      const addr = (p) => ({ house: v(`${p}_house`), moo: v(`${p}_moo`), subdistrict: v(`${p}_subdistrict`), district: v(`${p}_district`), province: v(`${p}_province`) });
      const attachments = [...form.querySelectorAll('[data-att-on]')].filter((box) => box.checked).map((box) => {
        const key = box.dataset.attOn;
        const label = key === 'other' ? clean(form.querySelector('[data-att-label="other"]')?.value) : ATTACHMENTS.find((a) => a.key === key)?.label;
        const count = Math.max(0, Math.min(9, Number(form.querySelector(`[data-att-count="${key}"]`)?.value) || 0));
        return { label, count };
      }).filter((a) => clean(a.label));
      return {
        destination_school: v('destination_school'),
        doc_no: v('doc_no') || null,
        doc_date: v('doc_date') || null,
        copies: Math.max(1, Math.min(5, Number(v('copies')) || 3)),
        form: {
          dest_subdistrict: v('dest_subdistrict'), dest_district: v('dest_district'), dest_province: v('dest_province'),
          reason: v('reason'), guardian_name: v('guardian_name'), guardian: addr('guardian'), new_address: addr('new'),
          request_date: v('request_date') || null, attachments
        }
      };
    }

    async function buildRecords(input) {
      const items = selectedStudents();
      await loadDetails(items.filter((i) => i.student).map((i) => i.id));
      return items.map((i) => ({
        id: i.transfer?.id || null,
        student_id: i.id,
        academic_year: i.transfer?.academic_year || state.year,
        destination_school: input.destination_school,
        doc_no: input.doc_no,
        doc_date: input.doc_date,
        form: input.form,
        student_snapshot: i.transfer ? i.transfer.student_snapshot : snapshotOf(i.student, state.details.get(i.id))
      }));
    }

    // ดูตัวอย่างก่อนพิมพ์ (เจ้าของขอ 2026-10-19 "อยากให้โหลดเป็น pdf ก่อนจะได้ตรวจสอบ"): เอกสารแสดงในกรอบบนหน้าเดิม
    // ตรวจแล้วกด "พิมพ์ / บันทึกเป็น PDF" · ไม่เปิดหน้าต่างใหม่ (หน้าต่างพิมพ์ที่ค้างอยู่หลังหน้าต่างอื่นเคยล็อกทั้งหน้า)
    function openPrint(records, options) {
      const names = records.map((r) => fullName(r.student_snapshot)).filter(Boolean);
      return printHtml(buildDocument(records, state.school, options), `เอกสารย้ายนักเรียน ${names.slice(0, 3).join(' ')}${names.length > 3 ? ' และคนอื่น' : ''}`);
    }
    function printHtml(html, title) {
      doc.getElementById('pp5TransferPreview')?.remove();
      const overlay = doc.createElement('div');
      overlay.id = 'pp5TransferPreview';
      overlay.className = 'pp5-tr-preview';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'ตัวอย่างเอกสารก่อนพิมพ์');
      overlay.innerHTML = `<div class="pp5-tr-preview-bar"><strong>${esc(title)}</strong>
<span class="pp5-tr-preview-hint">ตรวจเอกสารก่อน แล้วกดพิมพ์ · ต้องการไฟล์ PDF ให้เลือกเครื่องพิมพ์ "บันทึกเป็น PDF"</span>
<button type="button" class="btn btn-primary btn-sm" data-pv-print disabled><i class="bi bi-printer"></i> พิมพ์ / บันทึกเป็น PDF</button>
<button type="button" class="btn btn-light btn-sm" data-pv-close>ปิด</button></div>
<iframe title="ตัวอย่างเอกสาร"></iframe>`;
      doc.body.appendChild(overlay);
      const previousOverflow = doc.body.style.overflow;
      doc.body.style.overflow = 'hidden';
      const frame = overlay.querySelector('iframe');
      const printButton = overlay.querySelector('[data-pv-print]');
      const close = () => { overlay.remove(); doc.body.style.overflow = previousOverflow; doc.removeEventListener('keydown', onKey); };
      const onKey = (event) => { if (event.key === 'Escape') close(); };
      doc.addEventListener('keydown', onKey);
      overlay.querySelector('[data-pv-close]').addEventListener('click', close);
      frame.addEventListener('load', async () => {
        const fdoc = frame.contentDocument;
        try {
          await Promise.all([fdoc.fonts?.ready, ...Array.from(fdoc.images).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))]);
        } catch (_) { /* print anyway */ }
        printButton.disabled = false;
        printButton.focus();
      }, { once: true });
      printButton.addEventListener('click', () => {
        // ชื่อไฟล์ PDF มาจากชื่อหน้า: ตั้งชื่อเอกสารชั่วคราวระหว่างพิมพ์
        const previousTitle = doc.title;
        doc.title = title;
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(() => { doc.title = previousTitle; }, 1500);
      });
      frame.srcdoc = html.replace(/<script>[\s\S]*?<\/script>/, '');
      return true;
    }

    // ข้อมูลใบรับรองเวลาเรียนของนักเรียน 1 คน (ภาคเรียนปัจจุบันของระบบ)
    async function loadCertificate(studentId, snap) {
      const year = state.year;
      const term = state.semester;
      const grade = clean(snap?.grade);
      const room = clean(snap?.room);
      const take = (res) => { if (res.error) throw res.error; return res.data || []; };
      const [subjects, scores, assessments, attendance, teacher] = await Promise.all([
        client().from('subjects').select('id,code,name,subject_type,hours_per_year,semester,score_config,active').eq('grade', grade).eq('active', true).then(take),
        client().from('scores').select('subject_id,formative_score,score_breakdown').eq('student_id', studentId).eq('academic_year', year).eq('semester', term).then(take),
        client().from('assessments').select('assessment_type,criteria_code,score,semester').eq('student_id', studentId).eq('academic_year', year).then(take),
        client().from('attendance_daily').select('attendance_date,status').eq('student_id', studentId).eq('academic_year', year).order('attendance_date').limit(1000).then(take),
        client().from('teacher_assignments').select('teacher_name').eq('grade', grade).eq('room', room).eq('academic_year', year).limit(1).then(take).catch(() => [])
      ]);
      const rows = certificateRows(subjects, scores, term);
      const summary = typeof global.PP5ReportAssessmentSummary === 'function' ? global.PP5ReportAssessmentSummary(assessments, String(term)) : null;
      return {
        studentId, student: snap, year, term, rows,
        activities: certificateActivities(rows, summary?.activities?.items),
        attendance: certificateAttendance(attendance),
        character: summary?.character?.result || '', reading: summary?.reading?.result || '',
        homeroom: teacher[0]?.teacher_name || '', issued: todayIso()
      };
    }
    async function printCertificates(items, button) {
      if (button) button.disabled = true;
      say('กำลังรวบรวมเวลาเรียนและคะแนน…', 'info');
      try {
        const list = [];
        for (const item of items) list.push(await loadCertificate(item.id, item.snapshot));
        printHtml(buildCertificateDocument(list, state.school), `ใบรับรองเวลาเรียน ${list.map((c) => fullName(c.student)).slice(0, 3).join(' ')}`);
        say(`ใบรับรองเวลาเรียน ${list.length} คน · ภาคเรียนที่ ${state.semester}/${state.year}`, 'ok');
      } catch (error) {
        say(esc(error.message || error), 'err');
      } finally {
        if (button) button.disabled = false;
      }
    }

    // ข้อมูลไม่ครบ: ข้อความขึ้นข้างปุ่มด้วย และเลื่อนไปช่องที่ขาด (เจ้าของแจ้ง "บันทึกและพิมพ์ไม่ตอบสนอง" —
    // ข้อความเคยขึ้นเฉพาะบนสุดของหน้าซึ่งเลื่อนพ้นจอไปแล้ว)
    function validate(input) {
      const form = $('[data-form]');
      const goTo = (el) => { el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.focus?.({ preventScroll: true }); };
      if (!selectedStudents().length) { goTo($('.pp5-tr-students')); return 'กรุณาเลือกนักเรียนอย่างน้อย ๑ คน'; }
      if (!input.destination_school) { goTo(form?.elements.destination_school); return 'กรุณากรอกชื่อโรงเรียนปลายทาง'; }
      if (!input.form.reason) { goTo(form?.elements.reason); return 'กรุณากรอกเหตุผลที่ย้าย'; }
      return '';
    }

    function bindNew() {
      $('[data-cancel-edit]')?.addEventListener('click', () => { state.editing = null; say(''); renderNew(); });
      $('[data-grade]')?.addEventListener('change', (e) => { state.grade = e.target.value; state.room = ''; renderNew(); });
      $('[data-room]')?.addEventListener('change', (e) => { state.room = e.target.value; renderNew(); });
      root.querySelectorAll('[data-student]').forEach((box) => box.addEventListener('change', () => {
        if (box.checked) state.selected.add(box.dataset.student); else state.selected.delete(box.dataset.student);
        renderDocNos();
        if (box.checked) prefillFromStudent();
      }));
      $('[data-guardian-pick]').addEventListener('change', (e) => {
        const nameEl = $('[data-form]').elements.guardian_name;
        const choice = state.guardianChoices.find((c) => c.key === e.target.value);
        if (choice) nameEl.value = choice.name;
        else { nameEl.value = ''; nameEl.focus(); }
      });
      $('[data-copy-address]').addEventListener('click', () => {
        const form = $('[data-form]');
        ['house', 'moo', 'subdistrict', 'district', 'province'].forEach((k) => { form.elements[`new_${k}`].value = form.elements[`guardian_${k}`].value; });
      });
      $('[data-preview]').addEventListener('click', async () => {
        const input = readForm();
        const problem = validate(input);
        if (problem) { say(problem, 'err'); return; }
        say('');
        try { openPrint(await buildRecords(input), { copies: input.copies }); } catch (error) { say(esc(error.message || error), 'err'); }
      });
      $('[data-cert]').addEventListener('click', (event) => {
        const items = selectedStudents().map((i) => ({ id: i.id, snapshot: i.snapshot || snapshotOf(i.student, null) }));
        if (!items.length) { say('กรุณาเลือกนักเรียนอย่างน้อย ๑ คน', 'err'); return; }
        printCertificates(items, event.currentTarget);
      });
      $('[data-docx]').addEventListener('click', async (event) => {
        const input = readForm();
        const problem = validate(input);
        if (problem) { say(problem, 'err'); return; }
        const button = event.currentTarget;
        button.disabled = true;
        say('กำลังสร้างไฟล์ Word…', 'info');
        try { await downloadDocx(await buildRecords(input), state.school, { copies: input.copies }); say('ดาวน์โหลดไฟล์ Word แล้ว (ยังไม่ได้บันทึกเรื่องย้าย)', 'ok'); } catch (error) { say(esc(error.message || error), 'err'); } finally { button.disabled = false; }
      });
      $('[data-form]').addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = readForm();
        const problem = validate(input);
        if (problem) { say(problem, 'err'); return; }
        const button = $('[data-save]');
        button.disabled = true;
        try {
          const records = await buildRecords(input);
          const saved = [];
          for (const record of records) {
            const row = {
              destination_school: record.destination_school, doc_no: record.doc_no, doc_date: record.doc_date,
              form: record.form, student_snapshot: record.student_snapshot
            };
            const query = record.id
              ? client().from('student_transfers').update(row).eq('id', record.id).select('*').single()
              : client().from('student_transfers').insert({ ...row, student_id: record.student_id, academic_year: record.academic_year }).select('*').single();
            const { data, error } = await query;
            if (error) {
              if (/duplicate|unique/i.test(error.message || '')) throw new Error(`${fullName(record.student_snapshot)} มีเรื่องย้ายที่ยังไม่ปิดอยู่แล้ว ดูได้ในแท็บ "ประวัติการย้าย"`);
              throw error;
            }
            saved.push(data);
          }
          openPrint(saved, { copies: input.copies });
          await loadTransfers();
          state.selected.clear();
          state.editing = null;
          renderNew();
          say(`✅ บันทึกเรื่องย้าย ${saved.length} คนแล้ว (สถานะ: ส่งเรื่องแล้ว) · นักเรียนยังอยู่ในรายชื่อห้องจนกว่าจะกด "ยืนยันย้ายออก" ในแท็บประวัติ`, 'ok');
        } catch (error) {
          say(missingSchema(error) ? SETUP_HINT : esc(error.message || error), 'err');
        } finally {
          button.disabled = false;
        }
      });
    }

    // ---------------- แท็บ ประวัติการย้าย
    const STATUS = { requested: 'ส่งเรื่องแล้ว', transferred: 'ย้ายออกแล้ว', cancelled: 'ยกเลิก' };
    function thaiShortDate(iso) {
      const p = dateParts(iso);
      return p ? `${p.day} ${p.month.slice(0, 3)}${p.month.length > 3 ? '.' : ''} ${String(p.year).slice(2)}` : '-';
    }
    function renderHistory() {
      const rows = state.transfers.map((t) => {
        const snap = t.student_snapshot || {};
        const open = t.status === 'requested';
        return `<tr data-id="${esc(t.id)}">
  <td>${esc(thaiShortDate(t.doc_date || t.created_at))}</td>
  <td><strong>${esc(fullName(snap))}</strong><div class="pp5-tr-hint">${esc(snap.grade || '')}/${esc(snap.room || '')}</div></td>
  <td class="pp5-tr-hide-sm">${esc(t.destination_school)}</td>
  <td class="pp5-tr-hide-sm">${esc(t.doc_no || '-')}</td>
  <td><span class="pp5-tr-pill ${esc(t.status)}">${esc(STATUS[t.status] || t.status)}</span></td>
  <td><div class="pp5-tr-row-actions">
    <button type="button" class="btn btn-sm btn-outline-primary" data-print><i class="bi bi-printer"></i> พิมพ์</button>
    <button type="button" class="btn btn-sm btn-outline-primary" data-docx-row aria-label="ดาวน์โหลดไฟล์ Word"><i class="bi bi-file-earmark-word"></i> Word</button>
    <button type="button" class="btn btn-sm btn-outline-primary" data-cert-row><i class="bi bi-card-checklist"></i> ใบรับรอง</button>
    ${open ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-edit>แก้ไข</button>
    ${state.isAdmin ? '<button type="button" class="btn btn-sm btn-success" data-confirm>ยืนยันย้ายออก</button>' : '<span class="pp5-tr-hint" style="margin:0" data-await-admin>รอผู้ดูแลระบบยืนยันย้ายออก</span>'}
    <button type="button" class="btn btn-sm btn-outline-danger" data-cancel>ยกเลิกเรื่อง</button>` : ''}
    ${state.isAdmin ? '<button type="button" class="btn btn-sm btn-outline-danger" data-delete aria-label="ลบเรื่องย้ายนี้ออกจากประวัติ"><i class="bi bi-trash"></i> ลบ</button>' : ''}
  </div></td></tr>`;
      }).join('');
      body.innerHTML = `<p class="pp5-tr-hint" style="margin-top:0">${state.isAdmin ? '' : 'เจ้าหน้าที่ธุรการบันทึก แก้ไข พิมพ์ และยกเลิกเรื่องได้ ผู้ดูแลระบบเป็นผู้กด '}"ยืนยันย้ายออก" เมื่อการย้ายเสร็จแล้ว (เช่น เขตพื้นที่อนุญาตหรือโรงเรียนใหม่รับแล้ว): นักเรียนจะออกจากรายชื่อห้อง
ส่วนผลการเรียน เวลาเรียน และประวัติทั้งหมดยังเก็บไว้${state.isAdmin ? ' · ปุ่ม "ลบ" (เฉพาะผู้ดูแลระบบ) ลบเรื่องย้ายออกจากประวัติถาวร ไม่เปลี่ยนสถานะนักเรียน' : ''}</p>
<div style="overflow-x:auto"><table><thead><tr><th>วันที่</th><th>นักเรียน</th><th class="pp5-tr-hide-sm">ย้ายไป</th><th class="pp5-tr-hide-sm">เลขที่หนังสือ</th><th>สถานะ</th><th></th></tr></thead>
<tbody>${rows || '<tr><td colspan="6" class="pp5-tr-hint">ยังไม่มีเรื่องย้าย</td></tr>'}</tbody></table></div>`;
      body.querySelectorAll('tr[data-id]').forEach((tr) => {
        const t = state.transfers.find((x) => x.id === tr.dataset.id);
        tr.querySelector('[data-print]').addEventListener('click', () => openPrint([t], { copies: 3 }));
        tr.querySelector('[data-cert-row]').addEventListener('click', (event) => printCertificates([{ id: t.student_id, snapshot: t.student_snapshot }], event.currentTarget));
        tr.querySelector('[data-docx-row]').addEventListener('click', async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          try { await downloadDocx([t], state.school, { copies: 3 }); } catch (error) { say(esc(error.message || error), 'err'); } finally { button.disabled = false; }
        });
        tr.querySelector('[data-edit]')?.addEventListener('click', () => { state.editing = t; selectTab('new'); });
        // ปุ่มสองจังหวะ (ไม่ใช้กล่องยืนยันของเบราว์เซอร์): กดครั้งแรกเปลี่ยนเป็น "กดอีกครั้งเพื่อยืนยัน"
        const twoStep = (button, label, run) => button?.addEventListener('click', async () => {
          if (!button.dataset.armed) {
            button.dataset.armed = '1';
            button.textContent = label;
            setTimeout(() => { if (button.isConnected && button.dataset.armed) { delete button.dataset.armed; renderHistory(); } }, 6000);
            return;
          }
          button.disabled = true;
          try { await run(); await Promise.all([loadTransfers(), loadStudents()]); renderHistory(); } catch (error) { say(esc(error.message || error), 'err'); button.disabled = false; }
        });
        twoStep(tr.querySelector('[data-confirm]'), 'กดอีกครั้งเพื่อยืนยัน', async () => {
          const { error } = await client().rpc('pp5_confirm_student_transfer', { p_transfer_id: t.id });
          if (error) throw error;
          say(`✅ ยืนยันย้ายออกแล้ว: ${esc(fullName(t.student_snapshot))} ออกจากรายชื่อห้อง ${esc(t.student_snapshot?.grade || '')}/${esc(t.student_snapshot?.room || '')}`, 'ok');
        });
        twoStep(tr.querySelector('[data-cancel]'), 'กดอีกครั้งเพื่อยกเลิก', async () => {
          const { error } = await client().from('student_transfers').update({ status: 'cancelled' }).eq('id', t.id);
          if (error) throw error;
          say(`ยกเลิกเรื่องย้ายของ ${esc(fullName(t.student_snapshot))} แล้ว นักเรียนยังอยู่ในห้องเดิม`, 'info');
        });
        // ลบออกจากประวัติ (owner 2026-10-19): ผู้ดูแลระบบเท่านั้น — RLS student_transfers_admin_all อนุญาต delete เฉพาะ admin
        // (เจ้าหน้าที่ธุรการไม่มีนโยบาย delete) ถ้าฐานข้อมูลไม่ลบให้ จะได้ 0 แถวโดยไม่มี error จึงตรวจจำนวนแถวที่ลบด้วย
        twoStep(tr.querySelector('[data-delete]'), 'กดอีกครั้งเพื่อลบ', async () => {
          const { data, error } = await client().from('student_transfers').delete().eq('id', t.id).select('id');
          if (error) throw error;
          if (!data || !data.length) throw new Error('ลบไม่สำเร็จ: ต้องเป็นผู้ดูแลระบบ');
          say(`ลบเรื่องย้ายของ ${esc(fullName(t.student_snapshot))} ออกจากประวัติแล้ว${t.status === 'transferred' ? ' (นักเรียนยังเป็นสถานะจำหน่ายเหมือนเดิม)' : ''}`, 'info');
        });
      });
    }

    function selectTab(tab) {
      state.tab = tab;
      root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
      if (tab === 'new') renderNew(); else renderHistory();
    }
    root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { say(''); if (b.dataset.tab === 'new') state.editing = null; selectTab(b.dataset.tab); }));
    selectTab('new');
  }

  // ----------------------------------------------------------------
  function apply() {
    const root = doc?.getElementById('pp5TransferPage');
    if (root && !root.__pp5Mounted) {
      root.__pp5Mounted = true;
      mount(root).catch((error) => {
        const box = root.querySelector('[data-body]');
        if (box) box.innerHTML = `<div class="pp5-tr-msg err">${missingSchema(error) ? SETUP_HINT : esc(error.message || error)}</div>`;
      });
    }
  }
  function watch() {
    const frame = doc?.getElementById('contentFrame');
    if (!frame || frame.__pp5Transfer) return;
    frame.__pp5Transfer = true;
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(apply).observe(frame, { childList: true, subtree: true });
    apply();
  }

  global.GAS_PAGES = global.GAS_PAGES || {};
  global.GAS_PAGES.student_transfer = shell();
  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
    else watch();
  }
  global.PP5StudentTransfer = { shell, buildDocument, buildDocxParts, buildCertificateDocument, certificateRows, certificateActivities, certificateAttendance, bk19, bk20, parseAddress, gradeLong, dateParts, thaiDigits };
})(window);
