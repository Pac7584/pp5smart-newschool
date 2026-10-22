// หน้าบันทึกน้ำหนัก-ส่วนสูง รุ่นใหม่ (owner 2026-10-22 "อยากปรับใหม่ให้สวยกว่าตัวอย่าง"):
//   - การ์ดเลือกห้อง (ปุ่มชั้นด่วนแถวเดียว) + การ์ดข้อมูลการวัด + การ์ดสรุป (ทั้งหมด / กรอกครบ / ค้างกรอก / ภาวะโภชนาการ)
//   - ภาวะโภชนาการทันทีตอนกรอก ตามเกณฑ์ WHO BMI-for-age ของเด็ก (js/growth-nutrition.js ชุดเดียวกับรายงาน)
//     ไม่ใช้ "ปกติ/เฝ้าระวัง" แบบ BMI ผู้ใหญ่ (ใช้กับเด็กไม่ถูก)
//   - ค่ารอบก่อนใต้ช่อง + เตือนสีส้มเมื่อต่างมาก/ค่าผิดปกติ (กันพิมพ์ผิด) แต่ยังบันทึกได้ (owner ข้อ 2)
//   - รูปนักเรียนหน้าชื่อ, ป้ายเพศ, แถบบันทึกติดล่างพร้อมความคืบหน้า, เตือนก่อนออกจากหน้าเมื่อยังไม่บันทึก
//   - มือถือ: การ์ดรายคน ช่องใหญ่ แป้นตัวเลข (owner ข้อ 3)  นำเข้า Excel = รอบหลัง (owner ข้อ 4)
// ใช้ id เดิมของหน้าเดิมทั้งหมด (sgGrade sgClass sgYear sgMonth sgRound sgDate sgSaveBtn sgRows .sg-w .sg-h .sg-note)
// ปุ่มชั้นด่วน / สิทธิ์ครู (teacher-permissions) / Enter ไปช่องถัดไป (spa-main enhanceSupabaseStudentGrowthEntryPage_)
// จึงทำงานเหมือนเดิม  การอ่าน/บันทึกใช้ getStudentGrowthStudents / saveStudentGrowthBatch เดิม (ไม่ต้องรัน SQL)
// ลงทะเบียนทับแม่แบบเดิมใน window.GAS_PAGES (ต้องโหลดหลัง js/gas-pages.js)  แม่แบบเดิมในไฟล์นั้นไม่แตะ
(function registerGrowthEntry(global) {
  'use strict';
  if (!global.GAS_PAGES) return;

  const STYLE = `
  <style>
    .sg2 { --sg-text:#1f2937; --sg-muted:#64748b; --sg-line:#e5e7eb; --sg-card:#fff; --sg-soft:#f8fafc; --sg-input:#fff;
      font-family:'Sarabun',system-ui,sans-serif; color:var(--sg-text); padding-bottom:6px; }
    [data-theme="dark"] .sg2 { --sg-text:#e5e7eb; --sg-muted:#94a3b8; --sg-line:#2a3446; --sg-card:#151d2b; --sg-soft:#1b2436; --sg-input:#0f1623; }
    .sg2 .sg2-card { background:var(--sg-card); border:1px solid var(--sg-line); border-radius:16px; padding:16px 18px; margin-bottom:14px;
      box-shadow:0 4px 14px rgba(15,23,42,.04); }
    .sg2 .sg2-head { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
    .sg2 .sg2-head h3 { font-size:1.05rem; font-weight:800; margin:0; color:var(--sg-text); }
    .sg2 .sg2-head p { margin:2px 0 0; font-size:.82rem; color:var(--sg-muted); }
    .sg2 .sg2-ico { flex:0 0 40px; width:40px; height:40px; border-radius:12px; display:inline-flex; align-items:center; justify-content:center;
      font-size:1.15rem; color:var(--tone); background:color-mix(in srgb, var(--tone) 14%, transparent); }
    .sg2 .t-blue { --tone:#2563eb; } .sg2 .t-violet { --tone:#7c3aed; } .sg2 .t-green { --tone:#059669; }
    .sg2 .t-amber { --tone:#d97706; } .sg2 .t-rose { --tone:#e11d48; } .sg2 .t-sky { --tone:#0284c7; }
    .sg2 .sg2-top { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr); gap:14px; }
    .sg2 .sg2-top .sg2-card { margin-bottom:0; }
    .sg2 .sg2-fields { display:grid; gap:10px; align-items:end; }
    .sg2 .sg2-fields.f-class { grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto; margin-top:10px; }
    .sg2 .sg2-fields.f-measure { grid-template-columns:repeat(2, minmax(0,1fr)); }
    .sg2 .sg2-field label { display:block; font-size:.8rem; font-weight:700; color:var(--sg-muted); margin-bottom:4px; }
    .sg2 .sg2-field input, .sg2 .sg2-field select, .sg2 .sg2-field .thai-date-button {
      width:100%; min-height:40px; border:1px solid var(--sg-line); border-radius:10px; padding:7px 10px; background:var(--sg-input); color:var(--sg-text); font-weight:600; }
    .sg2 #gcQuickBarHost .gc-quick-bar { flex-wrap:wrap; margin:0 !important; }
    .sg2 .sg2-btn { border:1px solid transparent; border-radius:10px; min-height:40px; padding:0 14px; font-weight:700; cursor:pointer;
      display:inline-flex; align-items:center; justify-content:center; gap:6px; white-space:nowrap; transition:transform .12s ease, filter .15s ease; }
    .sg2 .sg2-btn:active { transform:scale(.96); }
    .sg2 .sg2-btn:disabled { opacity:.5; cursor:not-allowed; }
    .sg2 .sg2-btn.ghost { --tone:#0284c7; background:color-mix(in srgb, var(--tone) 10%, transparent); border-color:color-mix(in srgb, var(--tone) 30%, transparent); color:var(--tone); }
    .sg2 .sg2-btn.soft { background:transparent; border-color:var(--sg-line); color:var(--sg-muted); }
    .sg2 .sg2-btn.save { background:linear-gradient(135deg,#22c55e,#059669); color:#fff; box-shadow:0 6px 16px rgba(5,150,105,.3); }

    .sg2 .growth-alert { padding:10px 14px; border-radius:12px; margin:0 0 12px; display:none; font-weight:600; }
    .sg2 .growth-alert.ok { display:block; background:#dcfce7; color:#166534; }
    .sg2 .growth-alert.info { display:block; background:#dbeafe; color:#1e40af; }
    .sg2 .growth-alert.err { display:block; background:#fee2e2; color:#991b1b; }
    .sg2 .growth-loading { display:none; align-items:center; gap:10px; padding:12px 14px; border:1px solid #bfdbfe; border-radius:12px; background:#eff6ff; color:#1d4ed8; margin-bottom:12px; font-weight:700; }
    .sg2 .growth-loading.show { display:flex; }
    .sg2 .growth-spinner { width:18px; height:18px; border:3px solid #bfdbfe; border-top-color:#2563eb; border-radius:50%; animation:sg2Spin .8s linear infinite; }
    @keyframes sg2Spin { to { transform:rotate(360deg); } }

    .sg2 .sg2-sum { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)) minmax(0,1.6fr); gap:12px; margin-bottom:14px; }
    .sg2 .sg2-tile { --tone:#2563eb; display:flex; align-items:center; gap:12px; padding:14px 16px; border-radius:16px;
      background:color-mix(in srgb, var(--tone) 9%, var(--sg-card)); border:1px solid color-mix(in srgb, var(--tone) 22%, transparent); }
    .sg2 .sg2-tile .sg2-ico { background:var(--tone); color:#fff; border-radius:50%; }
    .sg2 .sg2-tile small { display:block; font-size:.8rem; font-weight:700; color:var(--tone); }
    .sg2 .sg2-tile b { font-size:1.45rem; line-height:1.1; color:var(--sg-text); }
    .sg2 .sg2-tile b span { font-size:.85rem; font-weight:700; color:var(--sg-muted); margin-left:3px; }
    .sg2 .sg2-tile.nut { --tone:#7c3aed; flex-wrap:wrap; align-content:center; }
    .sg2 .sg2-nutchips { display:flex; flex-wrap:wrap; gap:6px; }
    .sg2 .sg2-nutchips .sg2-nut { font-size:.78rem; }
    .sg2 .sg2-nutchips .sg2-none { font-size:.82rem; color:var(--sg-muted); }

    .sg2 .sg2-listhead { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:10px; }
    .sg2 .sg2-hint { font-size:.8rem; color:var(--sg-muted); }
    .sg2 .sg2-hint i { color:#f59e0b; }
    .sg2 .sg2-roundnote { display:flex; align-items:center; gap:12px; padding:12px 14px; margin-bottom:12px; border-radius:12px;
      background:color-mix(in srgb,#0284c7 9%,var(--sg-card)); border:1px solid color-mix(in srgb,#0284c7 30%,transparent); }
    .sg2 .sg2-roundnote[hidden] { display:none; }
    .sg2 .sg2-roundnote > i { font-size:1.3rem; color:#0284c7; flex:0 0 auto; }
    .sg2 .sg2-rn-text { flex:1 1 auto; min-width:0; }
    .sg2 .sg2-rn-text b { display:block; color:var(--sg-text); }
    .sg2 .sg2-rn-text span { display:block; font-size:.82rem; color:var(--sg-muted); }
    .sg2 .sg2-roundnote .sg2-btn { flex:0 0 auto; }
    @media (max-width: 768px) { .sg2 .sg2-roundnote { flex-wrap:wrap; } .sg2 .sg2-roundnote .sg2-btn { width:100%; } }
    .sg2 .sg2-table { border:1px solid var(--sg-line); border-radius:12px; overflow:auto; }
    .sg2 .sg2-row { display:grid; align-items:center; gap:8px; padding:9px 12px; border-bottom:1px solid var(--sg-line);
      grid-template-columns:36px minmax(160px,2.2fr) 100px 100px 52px 100px 118px minmax(90px,.8fr); min-width:820px; }
    .sg2 .sg2-row:last-child { border-bottom:0; }
    .sg2 .sg2-row.head { background:var(--sg-soft); font-size:.8rem; font-weight:800; color:var(--sg-muted); padding-top:11px; padding-bottom:11px; }
    .sg2 .sg2-row.is-dirty { background:color-mix(in srgb, #f59e0b 6%, transparent); }
    .sg2 .sg2-empty { padding:22px; text-align:center; color:var(--sg-muted); }
    .sg2 .c-no { text-align:center; font-weight:700; color:var(--sg-muted); }
    .sg2 .c-who { display:flex; align-items:center; gap:10px; min-width:0; }
    .sg2 .sg2-who-text { min-width:0; }
    .sg2 .sg2-name { font-weight:700; color:var(--sg-text); white-space:normal !important; overflow-wrap:anywhere; line-height:1.3; }
    .sg2 .sg2-id { font-size:.75rem; color:var(--sg-muted); }
    .sg2 .sg2-sex { display:inline-block; padding:2px 10px; border-radius:999px; font-size:.78rem; font-weight:700; }
    .sg2 .sg2-sex.m { background:color-mix(in srgb,#0ea5e9 14%,transparent); color:#0369a1; }
    .sg2 .sg2-sex.f { background:color-mix(in srgb,#ec4899 14%,transparent); color:#be185d; }
    [data-theme="dark"] .sg2 .sg2-sex.m { color:#7dd3fc; } [data-theme="dark"] .sg2 .sg2-sex.f { color:#f9a8d4; }
    .sg2 .sg2-flabel { display:none; }
    .sg2 .sg2-num { width:100%; min-height:38px; border:1px solid var(--sg-line); border-radius:10px; padding:6px 10px; font-weight:700; font-size:1rem;
      background:var(--sg-input); color:var(--sg-text); text-align:center; }
    .sg2 .sg2-num:focus, .sg2 .sg-note:focus { outline:2px solid color-mix(in srgb,#2563eb 45%,transparent); border-color:#2563eb; }
    .sg2 .is-warn .sg2-num { border-color:#f59e0b; background:color-mix(in srgb,#f59e0b 10%,var(--sg-input)); }
    .sg2 .sg2-prev { font-size:.72rem; color:var(--sg-muted); margin-top:2px; text-align:center; white-space:nowrap; }
    .sg2 .sg2-warn { font-size:.72rem; color:#b45309; font-weight:700; margin-top:2px; text-align:center; }
    [data-theme="dark"] .sg2 .sg2-warn { color:#fbbf24; }
    .sg2 .sg2-warn:empty { display:none; }
    .sg2 .c-bmi { text-align:center; font-weight:800; }
    .sg2 .sg2-nut { display:inline-block; padding:3px 10px; border-radius:999px; font-size:.8rem; font-weight:800; white-space:nowrap;
      background:color-mix(in srgb, var(--tone) 14%, transparent); color:color-mix(in srgb, var(--tone) 80%, #000); }
    [data-theme="dark"] .sg2 .sg2-nut { color:color-mix(in srgb, var(--tone) 55%, #fff); }
    .sg2 .sg2-nut.n-ok { --tone:#16a34a; } .sg2 .sg2-nut.n-thin { --tone:#d97706; } .sg2 .sg2-nut.n-vthin { --tone:#dc2626; }
    .sg2 .sg2-nut.n-over { --tone:#ea580c; } .sg2 .sg2-nut.n-obese { --tone:#dc2626; } .sg2 .sg2-nut.n-na { --tone:#64748b; font-weight:600; }
    .sg2 .growth-status { display:inline-flex; align-items:center; gap:5px; font-size:.78rem; font-weight:700; color:var(--sg-muted); line-height:1.25; }
    .sg2 .growth-status::before { flex:0 0 8px; }
    .sg2 .growth-status::before { content:""; width:8px; height:8px; border-radius:50%; background:#cbd5e1; }
    .sg2 .growth-status.st-saved { color:#15803d; } .sg2 .growth-status.st-saved::before { background:#22c55e; }
    .sg2 .growth-status.st-dirty { color:#b45309; } .sg2 .growth-status.st-dirty::before { background:#f59e0b; }
    [data-theme="dark"] .sg2 .growth-status.st-saved { color:#4ade80; } [data-theme="dark"] .sg2 .growth-status.st-dirty { color:#fbbf24; }
    .sg2 .sg-note { width:100%; min-height:36px; border:1px solid var(--sg-line); border-radius:10px; padding:6px 10px; background:var(--sg-input); color:var(--sg-text); }

    .sg2 .sg2-savebar { position:sticky; bottom:10px; z-index:30; display:flex; align-items:center; gap:14px; margin-top:12px; padding:10px 12px 10px 16px;
      border-radius:16px; background:color-mix(in srgb, var(--sg-card) 92%, transparent); border:1px solid var(--sg-line);
      box-shadow:0 10px 30px rgba(15,23,42,.16); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); }
    .sg2 .sg2-savebar[hidden] { display:none; }
    .sg2 .sg2-sb-title { font-weight:800; white-space:nowrap; display:flex; align-items:center; gap:6px; }
    .sg2 .sg2-sb-title i { color:#059669; }
    .sg2 .sg2-progress { flex:1 1 auto; min-width:120px; }
    .sg2 .sg2-bar { height:9px; border-radius:999px; background:color-mix(in srgb,#059669 14%,transparent); overflow:hidden; }
    .sg2 .sg2-bar > span { display:block; height:100%; width:0; border-radius:999px; background:linear-gradient(90deg,#22c55e,#059669); transition:width .3s ease; }
    .sg2 .sg2-sb-text { font-size:.78rem; color:var(--sg-muted); margin-top:3px; }
    .sg2 .sg2-sb-text b.warn { color:#b45309; }
    .sg2 .sg2-sb-actions { display:flex; gap:8px; flex:0 0 auto; }

    @media (max-width: 1100px) {
      .sg2 .sg2-top { grid-template-columns:1fr; }
      .sg2 .sg2-sum { grid-template-columns:repeat(3, minmax(0,1fr)); }
      .sg2 .sg2-tile.nut { grid-column:1 / -1; }
    }
    /* มือถือ (owner ข้อ 3): การ์ดรายคน ช่องน้ำหนัก/ส่วนสูงใหญ่ */
    @media (max-width: 768px) {
      .sg2 .sg2-card { padding:12px; border-radius:14px; }
      .sg2 .sg2-fields.f-class { grid-template-columns:1fr 1fr auto; }
      .sg2 .sg2-fields.f-measure { grid-template-columns:1fr 1fr; }
      .sg2 .sg2-sum { grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; }
      .sg2 .sg2-tile { flex-direction:column; align-items:flex-start; gap:6px; padding:10px 12px; }
      .sg2 .sg2-tile .sg2-ico { width:30px; height:30px; flex-basis:30px; font-size:.9rem; }
      .sg2 .sg2-tile.nut { flex-direction:row; align-items:center; }
      .sg2 .sg2-table { border:0; overflow:visible; }
      .sg2 .sg2-row.head { display:none; }
      .sg2 .sg2-row { min-width:0; grid-template-columns:repeat(4, minmax(0,1fr)); gap:8px 10px; padding:12px; margin-bottom:10px;
        border:1px solid var(--sg-line); border-radius:14px; background:var(--sg-card);
        grid-template-areas:"who who who st" "w w h h" "bmi bmi nut nut" "note note note note"; }
      .sg2 .sg2-row:last-child { border-bottom:1px solid var(--sg-line); }
      .sg2 .c-no { display:none; }
      .sg2 .c-who { grid-area:who; } .sg2 .c-status { grid-area:st; justify-self:end; }
      .sg2 .c-w { grid-area:w; } .sg2 .c-h { grid-area:h; }
      .sg2 .c-bmi { grid-area:bmi; display:flex; align-items:center; gap:6px; text-align:left; }
      .sg2 .c-nut { grid-area:nut; justify-self:end; } .sg2 .c-note { grid-area:note; }
      .sg2 .sg2-name { white-space:normal; }
      .sg2 .sg2-flabel { display:block; font-size:.74rem; font-weight:700; color:var(--sg-muted); margin-bottom:3px; }
      .sg2 .c-bmi .sg2-flabel { display:inline; margin:0; }
      .sg2 .sg2-num { min-height:48px; font-size:1.2rem; }
      .sg2 .growth-status { font-size:.74rem; }
      /* แถบบันทึกแถวเดียว: [ความคืบหน้า][✕][บันทึก]  ชื่อห้องอยู่ในปุ่มชั้นด้านบนแล้ว */
      .sg2 .sg2-savebar { gap:8px; padding:8px 8px 8px 12px; bottom:calc(8px + env(safe-area-inset-bottom)); }
      .sg2 .sg2-sb-title { display:none; }
      .sg2 .sg2-progress { min-width:0; }
      .sg2 .sg2-sb-text { font-size:.7rem; line-height:1.25; }
      .sg2 .sg2-sb-text .sg2-sb-more { display:none; }
      .sg2 .sg2-sb-actions .sg2-btn { min-height:40px; padding:0 12px; }
      .sg2 .sg2-sb-actions .sg2-lbl-x { display:none; }
      .sg2 #sg2RevertBtn { padding:0 11px; }
    }
  </style>`;

  const BODY = `
  <div id="sg2BannerHost"></div>
  <div class="sg2-top">
    <section class="sg2-card">
      <div class="sg2-head"><span class="sg2-ico t-blue"><i class="bi bi-mortarboard-fill"></i></span>
        <div><h3>เลือกห้องเรียน</h3><p>แตะปุ่มชั้นด้านล่าง ระบบโหลดรายชื่อให้อัตโนมัติ</p></div></div>
      <div id="gcQuickBarHost"></div>
      <div class="sg2-fields f-class">
        <div class="sg2-field"><label for="sgGrade">ชั้น</label><select id="sgGrade"><option value="">เลือกชั้น</option></select></div>
        <div class="sg2-field"><label for="sgClass">ห้อง</label><select id="sgClass"><option value="">เลือกห้อง</option></select></div>
        <button class="sg2-btn ghost" type="button" onclick="SGEntry.loadStudents()" title="โหลดรายชื่อใหม่"><i class="bi bi-arrow-clockwise"></i> โหลดใหม่</button>
      </div>
    </section>
    <section class="sg2-card">
      <div class="sg2-head"><span class="sg2-ico t-violet"><i class="bi bi-calendar2-week-fill"></i></span>
        <div><h3>ข้อมูลการวัด</h3><p>ปีการศึกษา เดือน รอบที่ และวันที่ชั่งวัด</p></div></div>
      <div class="sg2-fields f-measure">
        <div class="sg2-field"><label for="sgYear">ปีการศึกษา</label><input id="sgYear" inputmode="numeric"></div>
        <div class="sg2-field"><label for="sgMonth">เดือน</label><select id="sgMonth"></select></div>
        <div class="sg2-field"><label for="sgRound">รอบที่</label><select id="sgRound"><option value="1">รอบที่ 1</option><option value="2">รอบที่ 2</option></select></div>
        <div class="sg2-field"><label for="sgDate">วันที่ชั่งวัด</label><input id="sgDate" type="date"></div>
      </div>
    </section>
  </div>
  <div style="height:14px"></div>

  <div id="sgAlert" class="growth-alert"></div>
  <div id="sgLoading" class="growth-loading"><span class="growth-spinner"></span><span id="sgLoadingText">กำลังโหลด...</span></div>

  <div class="sg2-sum" id="sg2Summary">
    <div class="sg2-tile" style="--tone:#2563eb"><span class="sg2-ico"><i class="bi bi-people-fill"></i></span><div><small>นักเรียนทั้งหมด</small><b id="sg2Total">0<span>คน</span></b></div></div>
    <div class="sg2-tile" style="--tone:#059669"><span class="sg2-ico"><i class="bi bi-check-lg"></i></span><div><small>กรอกครบแล้ว</small><b id="sg2Filled">0<span>คน</span></b></div></div>
    <div class="sg2-tile" style="--tone:#ea580c"><span class="sg2-ico"><i class="bi bi-hourglass-split"></i></span><div><small>ค้างกรอก</small><b id="sg2Pending">0<span>คน</span></b></div></div>
    <div class="sg2-tile nut"><span class="sg2-ico"><i class="bi bi-heart-pulse-fill"></i></span><div><small>ภาวะโภชนาการ (เกณฑ์ WHO ตามอายุและเพศ)</small><div class="sg2-nutchips" id="sg2NutChips"><span class="sg2-none">ยังไม่มีข้อมูล</span></div></div></div>
  </div>

  <section class="sg2-card">
    <div class="sg2-listhead">
      <div class="sg2-head" style="margin:0"><span class="sg2-ico t-sky"><i class="bi bi-person-lines-fill"></i></span>
        <div><h3 id="sg2ListTitle">รายชื่อนักเรียน</h3><p class="sg2-hint"><i class="bi bi-lightning-charge-fill"></i> พิมพ์น้ำหนัก กด Enter ไปช่องส่วนสูง ระบบคำนวณ BMI และภาวะโภชนาการให้ทันที</p></div></div>
    </div>
    <div id="sg2RoundNote" class="sg2-roundnote" role="status" hidden></div>
    <div class="sg2-table">
      <div class="sg2-row head"><div class="c-no">เลขที่</div><div>ชื่อ - นามสกุล · เพศ</div><div style="text-align:center">น้ำหนัก (กก.)</div><div style="text-align:center">ส่วนสูง (ซม.)</div><div style="text-align:center">BMI</div><div>ภาวะโภชนาการ</div><div>สถานะ</div><div>หมายเหตุ</div></div>
      <div id="sgRows"><div class="sg2-empty">เลือกชั้นและห้อง ระบบจะโหลดรายชื่ออัตโนมัติ</div></div>
    </div>
  </section>

  <div class="sg2-savebar" id="sg2SaveBar" hidden>
    <div class="sg2-sb-title"><i class="bi bi-floppy2-fill"></i> <span id="sg2SbRoom">บันทึกข้อมูล</span></div>
    <div class="sg2-progress"><div class="sg2-bar"><span id="sg2SbFill"></span></div><div class="sg2-sb-text" id="sg2SbText">0 / 0 คน</div></div>
    <div class="sg2-sb-actions">
      <button class="sg2-btn soft" type="button" id="sg2RevertBtn" onclick="SGEntry.revert()" disabled><i class="bi bi-x-lg"></i><span class="sg2-lbl-x"> ยกเลิก</span></button>
      <button class="sg2-btn save" type="button" id="sgSaveBtn" onclick="SGEntry.save()" disabled><i class="bi bi-floppy-fill"></i> บันทึกทั้งห้อง</button>
    </div>
  </div>`;

  // สคริปต์ของหน้า: SPA รันใหม่ทุกครั้งที่เปิดหน้า ห้าม const/let/class ระดับบนสุด (page-revisit-contract)
  const SCRIPT = `
  <script>
    window.SGEntry = (function(){
      var students = [];
      var isLoading = false;
      var lastLoadKey = '';
      var monthNames = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
      var NUT = { 'ผอมมาก':'n-vthin', 'ผอม':'n-thin', 'สมส่วน':'n-ok', 'น้ำหนักเกิน':'n-over', 'อ้วน':'n-obese' };
      var NUT_ORDER = ['สมส่วน','ผอม','ผอมมาก','น้ำหนักเกิน','อ้วน'];
      function $(id){ return document.getElementById(id); }
      function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
      function token(){ try { return localStorage.getItem('authToken') || ''; } catch (_) { return ''; } }
      function alertBox(msg, ok, info){
        var el = $('sgAlert'); if (!el) return;
        el.textContent = msg || '';
        el.className = msg ? 'growth-alert ' + (info ? 'info' : (ok ? 'ok' : 'err')) : 'growth-alert';
      }
      function busy(on, text){
        var box = $('sgLoading'), label = $('sgLoadingText');
        if (on) { if (label) label.textContent = text || 'กำลังโหลด...'; if (box) box.classList.add('show'); }
        else if (box) box.classList.remove('show');
        if ($('sgSaveBtn')) $('sgSaveBtn').disabled = on || students.length === 0;
      }
      function today(){
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      }
      // "32,5" -> 32.5  ว่าง -> null  ไม่ใช่ตัวเลข -> NaN
      function num(v){
        var s = String(v == null ? '' : v).trim().replace(',', '.');
        if (!s) return null;
        var n = Number(s);
        return isFinite(n) ? n : NaN;
      }
      function one(n){ return (Math.round(n * 10) / 10).toFixed(1); }
      function signed(n){ return (n > 0 ? '+' : '') + one(n); }
      function sexOf(g){ var t = String(g || '').trim(); return /หญิง|^ญ$|^f/i.test(t) ? 'f' : (/ชาย|^ช$|^m/i.test(t) ? 'm' : ''); }

      function nutrition(s, w, h){
        if (!(w > 0) || !(h > 0) || !window.PP5Nutrition) return '';
        return window.PP5Nutrition.classify({ birthdate: s.birthdate, gender: s.gender }, { measured_on: ($('sgDate') || {}).value || today(), weight_kg: w, height_cm: h });
      }
      // กันพิมพ์ผิด (owner ข้อ 2): ค่าที่เป็นไปไม่ได้ และต่างจากรอบก่อนมากผิดปกติ  เป็นคำเตือนเท่านั้น ยังบันทึกได้
      function warnings(s, w, h){
        var out = { w: '', h: '' }, p = s.previous;
        if (w !== null && (isNaN(w) || w < 8 || w > 150)) out.w = isNaN(w) ? 'ไม่ใช่ตัวเลข' : 'น้ำหนักดูผิดปกติ';
        if (h !== null && (isNaN(h) || h < 70 || h > 200)) out.h = isNaN(h) ? 'ไม่ใช่ตัวเลข' : 'ส่วนสูงดูผิดปกติ';
        if (p && !out.w && w > 0 && p.weight_kg > 0 && Math.abs(w - p.weight_kg) > Math.max(6, p.weight_kg * 0.2)) out.w = 'ต่างจากครั้งก่อน ' + signed(w - p.weight_kg) + ' กก.';
        if (p && !out.h && h > 0 && p.height_cm > 0) {
          if (h - p.height_cm < -2) out.h = 'เตี้ยลง ' + one(p.height_cm - h) + ' ซม.';
          else if (h - p.height_cm > 12) out.h = 'สูงขึ้น ' + signed(h - p.height_cm) + ' ซม.';
        }
        return out;
      }
      function studentOf(row){ var id = row.getAttribute('data-id'); return students.find(function(s){ return String(s.student_id) === id; }) || {}; }

      function paintRow(row){
        var s = studentOf(row);
        var w = num(row.querySelector('.sg-w').value), h = num(row.querySelector('.sg-h').value);
        var bmi = w > 0 && h > 0 ? Math.round((w / Math.pow(h / 100, 2)) * 100) / 100 : '';
        row.querySelector('.sg-bmi').textContent = bmi || '-';
        var label = nutrition(s, w, h);
        var nut = row.querySelector('.sg2-nut');
        if (!label) { nut.textContent = ''; nut.className = 'sg2-nut'; nut.hidden = true; }
        else {
          var known = NUT[label];
          nut.hidden = false;
          nut.className = 'sg2-nut ' + (known || 'n-na');
          nut.textContent = known ? label : 'ประเมินไม่ได้';
          nut.title = known ? 'เกณฑ์ WHO BMI-for-age ตามอายุและเพศ' : label;
        }
        var warn = warnings(s, w, h);
        ['w', 'h'].forEach(function(k){
          var cell = row.querySelector('.c-' + k);
          cell.classList.toggle('is-warn', !!warn[k]);
          cell.querySelector('.sg2-warn').textContent = warn[k];
        });
        row.setAttribute('data-filled', w > 0 && h > 0 ? '1' : '0');
        row.setAttribute('data-nut', NUT[label] ? label : '');
        row.setAttribute('data-warn', warn.w || warn.h ? '1' : '0');
      }
      var TH_MONTH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      // "2026-10-02" -> "2 ต.ค." (withYear: "2 ต.ค. 2569")
      function thaiDate(iso, withYear){
        var m = String(iso || '').match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})/);
        if (!m) return '';
        var y = Number(m[1]); if (y < 2400) y += 543;
        return Number(m[3]) + ' ' + TH_MONTH[Number(m[2]) - 1] + (withYear ? ' ' + y : '');
      }
      function setStatus(row, state){
        var st = row.querySelector('.growth-status');
        // owner 2026-10-22: ครูงงว่า "บันทึกแล้ว" ทั้งที่จะเริ่มกรอก -> บอกวันที่ที่บันทึกรอบนี้ไว้ด้วย
        var on = state === 'saved' ? thaiDate(studentOf(row).saved_on) : '';
        st.textContent = state === 'dirty' ? 'แก้ไขแล้ว—ยังไม่บันทึก' : (state === 'saved' ? 'บันทึกแล้ว' + (on ? ' ' + on : '') : 'ยังไม่บันทึกรอบนี้');
        st.className = 'growth-status ' + (state === 'dirty' ? 'st-dirty' : (state === 'saved' ? 'st-saved' : ''));
        row.classList.toggle('is-dirty', state === 'dirty');
      }
      function markDirty(row){ setStatus(row, 'dirty'); summary(); }
      function rows(){ return Array.prototype.slice.call(document.querySelectorAll('#sgRows .sg2-row[data-id]')); }
      function isDirty(){ return rows().some(function(r){ return r.classList.contains('is-dirty'); }); }

      function summary(){
        var list = rows(), total = list.length, filled = 0, warn = 0, dirty = 0, counts = {};
        list.forEach(function(r){
          if (r.getAttribute('data-filled') === '1') filled++;
          if (r.getAttribute('data-warn') === '1') warn++;
          if (r.classList.contains('is-dirty')) dirty++;
          var n = r.getAttribute('data-nut'); if (n) counts[n] = (counts[n] || 0) + 1;
        });
        var set = function(id, v){ var el = $(id); if (el) el.innerHTML = v + '<span>คน</span>'; };
        set('sg2Total', total); set('sg2Filled', filled); set('sg2Pending', total - filled);
        var chips = NUT_ORDER.filter(function(k){ return counts[k]; }).map(function(k){ return '<span class="sg2-nut ' + NUT[k] + '">' + k + ' ' + counts[k] + '</span>'; }).join('');
        if ($('sg2NutChips')) $('sg2NutChips').innerHTML = chips || '<span class="sg2-none">ยังไม่มีข้อมูล</span>';
        var pct = total ? Math.round(filled * 100 / total) : 0;
        if ($('sg2SbFill')) $('sg2SbFill').style.width = pct + '%';
        if ($('sg2SbText')) $('sg2SbText').innerHTML = 'กรอกครบ ' + filled + ' / ' + total + ' คน (' + pct + '%)'
          + (dirty ? '<span class="sg2-sb-more"> · แก้ไข ' + dirty + ' คน ยังไม่บันทึก</span>' : '')
          + (warn ? ' · <b class="warn"><i class="bi bi-exclamation-triangle-fill"></i> ควรตรวจ ' + warn + ' คน</b>' : '');
        if ($('sg2RevertBtn')) $('sg2RevertBtn').disabled = !dirty;
        if ($('sg2SaveBar')) $('sg2SaveBar').hidden = total === 0;
        if ($('sg2SbRoom')) $('sg2SbRoom').textContent = total ? 'บันทึกข้อมูล ' + ($('sgGrade').value || '') + '/' + ($('sgClass').value || '') : 'บันทึกข้อมูล';
        if ($('sg2ListTitle')) $('sg2ListTitle').textContent = 'รายชื่อนักเรียน' + (total ? ' (' + total + ' คน)' : '');
      }

      function avatar(url){
        return url
          ? '<span class="pp5-au-avatar has-photo"><img src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></span>'
          : '<span class="pp5-au-avatar"><i class="bi bi-person-fill" aria-hidden="true"></i></span>';
      }
      function photo(url){
        if (window.PP5AssessmentUI && typeof window.PP5AssessmentUI.photoSrc === 'function') return window.PP5AssessmentUI.photoSrc(url);
        return /^(https?:|data:image[/])/i.test(String(url || '')) ? String(url) : '';
      }
      function prevText(p, unit, key){
        if (!p || !(p[key] > 0)) return '';
        var when = p.month ? monthNames[p.month - 1] + (p.round_no ? ' รอบ ' + p.round_no : '') : '';
        return '<div class="sg2-prev" title="' + esc(when) + '">ครั้งก่อน ' + one(p[key]) + ' ' + unit + '</div>';
      }
      function render(){
        var body = $('sgRows');
        if (!students.length) {
          body.innerHTML = '<div class="sg2-empty">ไม่พบนักเรียนในชั้น/ห้องนี้</div>';
          summary(); busy(false); return;
        }
        body.innerHTML = students.map(function(s, idx){
          var sex = sexOf(s.gender), sexHtml = sex ? '<span class="sg2-sex ' + sex + '">' + (sex === 'f' ? 'หญิง' : 'ชาย') + '</span>' : '';
          var name = s.student_name || '';
          return '<div class="sg2-row" data-id="' + esc(s.student_id) + '">'
            + '<div class="c-no">' + esc(s.student_number || (idx + 1)) + '</div>'
            + '<div class="c-who">' + avatar(photo(s.photoUrl)) + '<div class="sg2-who-text"><div class="sg2-name pp5-au-name">' + esc(name) + '</div>'
            + '<div class="sg2-id">รหัส ' + esc(s.student_id) + ' <span class="sg2-sex-m">' + sexHtml + '</span></div></div></div>'
            + '<div class="c-w"><label class="sg2-flabel">น้ำหนัก (กก.)</label><input class="sg-w sg2-num" type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" aria-label="น้ำหนัก (กก.) ' + esc(name) + '" value="' + esc(s.weight_kg) + '">' + prevText(s.previous, 'กก.', 'weight_kg') + '<div class="sg2-warn"></div></div>'
            + '<div class="c-h"><label class="sg2-flabel">ส่วนสูง (ซม.)</label><input class="sg-h sg2-num" type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" aria-label="ส่วนสูง (ซม.) ' + esc(name) + '" value="' + esc(s.height_cm) + '">' + prevText(s.previous, 'ซม.', 'height_cm') + '<div class="sg2-warn"></div></div>'
            + '<div class="c-bmi"><span class="sg2-flabel">BMI</span><span class="sg-bmi">-</span></div>'
            + '<div class="c-nut"><span class="sg2-nut" hidden></span></div>'
            + '<div class="c-status"><span class="growth-status"></span></div>'
            + '<div class="c-note"><input class="sg-note" placeholder="หมายเหตุ" aria-label="หมายเหตุ ' + esc(name) + '" value="' + esc(s.note) + '"></div>'
            + '</div>';
        }).join('');
        rows().forEach(function(row){
          var s = studentOf(row);
          ['.sg-w', '.sg-h'].forEach(function(sel){ row.querySelector(sel).addEventListener('input', function(){ paintRow(row); markDirty(row); }); });
          row.querySelector('.sg-note').addEventListener('input', function(){ markDirty(row); });
          var img = row.querySelector('.pp5-au-avatar img');
          if (img) img.addEventListener('error', function(){ var box = img.parentElement; box.classList.remove('has-photo'); box.innerHTML = '<i class="bi bi-person-fill" aria-hidden="true"></i>'; }, { once: true });
          paintRow(row);
          setStatus(row, s.has_saved_record ? 'saved' : 'new');
        });
        roundNote();
        summary(); busy(false);
      }

      // รอบที่เลือกมีข้อมูลบันทึกไว้แล้ว (owner 2026-10-22: ครูเปิดหน้ามาเจอตัวเลขเต็ม + "บันทึกแล้ว" แล้วงง):
      //   - ป้ายบอกว่าเดือน/รอบนี้บันทึกไว้แล้วกี่คน เมื่อไร  ชั่งครั้งใหม่ -> ปุ่ม "เริ่มรอบที่ 2" (หรือให้เลือกเดือนถัดไป)
      //   - ช่องวันที่ใช้วันที่ชั่งวัดเดิมของรอบนี้ (เดิมเป็น "วันนี้" เสมอ กดบันทึกซ้ำแล้ววันที่เดิมถูกทับทั้งห้อง)
      //     เปิดรอบที่ยังไม่บันทึก -> กลับเป็นวันนี้ (ถ้าครูไม่ได้เลือกวันที่เอง)
      var autoDate = false, settingDate = false;
      function setDate(iso){
        if (!$('sgDate') || $('sgDate').value === iso) return;
        settingDate = true;
        $('sgDate').value = iso;
        if (typeof Event === 'function') $('sgDate').dispatchEvent(new Event('change'));
        settingDate = false;
      }
      function roundNote(){
        var box = $('sg2RoundNote');
        var saved = students.filter(function(s){ return s.has_saved_record; });
        if (!saved.length) {
          if (box) box.hidden = true;
          if (autoDate) { setDate(today()); autoDate = false; }
          return;
        }
        var tally = {}, most = '';
        saved.forEach(function(s){ if (s.saved_on) tally[s.saved_on] = (tally[s.saved_on] || 0) + 1; });
        Object.keys(tally).forEach(function(d){ if (!most || tally[d] > tally[most]) most = d; });
        if (most) { setDate(most); autoDate = true; }
        if (!box) return;
        var round = String($('sgRound').value || '1');
        var month = monthNames[Number($('sgMonth').value) - 1] || '';
        box.hidden = false;
        box.innerHTML = '<i class="bi bi-info-circle-fill" aria-hidden="true"></i><div class="sg2-rn-text"><b>' + esc(month) + ' รอบที่ ' + esc(round)
          + ' บันทึกไว้แล้ว ' + saved.length + (saved.length < students.length ? ' จาก ' + students.length : '') + ' คน'
          + (most ? ' (ชั่งวัดเมื่อ ' + thaiDate(most, true) + ')' : '') + '</b>'
          + '<span>ตัวเลขในช่องคือค่าที่บันทึกไว้ แก้แล้วกดบันทึกได้  ถ้าจะชั่งครั้งใหม่ '
          + (round === '1' ? 'กดเริ่มรอบที่ 2' : 'ให้เลือกเดือนถัดไป') + '</span></div>'
          + (round === '1' ? '<button type="button" class="sg2-btn ghost" onclick="SGEntry.nextRound()"><i class="bi bi-plus-circle"></i> เริ่มรอบที่ 2</button>' : '');
      }
      function nextRound(){
        if (!confirmDiscard()) return;
        $('sgRound').value = '2';
        loadStudents(true);
      }

      function getLoadKey(){ return [$('sgGrade').value, $('sgClass').value, $('sgYear').value, $('sgMonth').value, $('sgRound').value].join('|'); }
      function confirmDiscard(){ return !isDirty() || window.confirm('มีข้อมูลที่แก้ไขแล้วยังไม่บันทึก ต้องการทิ้งการแก้ไขนี้หรือไม่?'); }
      function autoLoadStudentsIfReady(){
        if (!$('sgGrade').value || !$('sgClass').value || isLoading) return;
        if (getLoadKey() === lastLoadKey) return;
        loadStudents();
      }
      // เปลี่ยนปี/เดือน/รอบ -> โหลดใหม่เอง (เดิมต้องกด "โหลดใหม่")  มีที่แก้ค้าง: ถาม  ไม่ทิ้ง -> ตัวเลือกกลับค่าเดิม
      function onPeriodChange(){
        if (!$('sgGrade').value || !$('sgClass').value || isLoading || getLoadKey() === lastLoadKey) return;
        if (!confirmDiscard()) {
          var last = lastLoadKey.split('|');
          if (last.length === 5) { $('sgYear').value = last[2]; $('sgMonth').value = last[3]; $('sgRound').value = last[4]; }
          return;
        }
        loadStudents(true);
      }
      function loadStudents(skipConfirm){
        if (!$('sgGrade').value || !$('sgClass').value) { alertBox('กรุณาเลือกระดับชั้นและห้อง', false); return; }
        if (skipConfirm !== true && !confirmDiscard()) return;
        isLoading = true;
        lastLoadKey = getLoadKey();
        alertBox(''); busy(true, 'กำลังโหลดรายชื่อนักเรียนและข้อมูลที่เคยบันทึก...');
        google.script.run.withSuccessHandler(function(res){
          isLoading = false;
          if (!res || !res.success) { alertBox((res && res.message) || 'โหลดรายชื่อไม่สำเร็จ', false); students = []; render(); return; }
          students = res.students || [];
          render();
        }).withFailureHandler(function(err){ isLoading = false; alertBox((err && err.message) || String(err), false); busy(false); })
          .getStudentGrowthStudents($('sgGrade').value, $('sgClass').value, $('sgYear').value, $('sgMonth').value, $('sgRound').value, token());
      }
      function revert(){
        if (!isDirty()) return;
        render();
        alertBox('ยกเลิกการแก้ไขแล้ว ค่ากลับเป็นค่าที่บันทึกไว้', true, true);
      }
      function save(){
        var list = rows();
        var bad = list.filter(function(tr){ return isNaN(num(tr.querySelector('.sg-w').value)) || isNaN(num(tr.querySelector('.sg-h').value)); });
        if (bad.length) {
          alertBox('มีช่องที่ไม่ใช่ตัวเลข ' + bad.length + ' คน (เช่น ' + studentOf(bad[0]).student_name + ') กรุณาแก้ก่อนบันทึก', false);
          bad[0].querySelector('.sg-w').focus();
          return;
        }
        var records = list.map(function(tr){
          var s = studentOf(tr), w = num(tr.querySelector('.sg-w').value), h = num(tr.querySelector('.sg-h').value);
          return Object.assign({}, s, { weight_kg: w === null ? '' : String(w), height_cm: h === null ? '' : String(h), note: tr.querySelector('.sg-note').value });
        });
        busy(true, 'กำลังบันทึกข้อมูลทั้งห้อง...');
        alertBox('กำลังบันทึกข้อมูล โปรดรอสักครู่', true, true);
        google.script.run.withSuccessHandler(function(res){
          if (res && res.success) {
            list.forEach(function(tr){ tr.classList.remove('is-dirty'); });
            alertBox(res.message + ' (' + res.saved + ' รายการ)', true);
            lastLoadKey = '';
            loadStudents();
          } else { alertBox((res && res.message) || 'บันทึกไม่สำเร็จ', false); busy(false); }
        }).withFailureHandler(function(err){ alertBox((err && err.message) || String(err), false); busy(false); })
          .saveStudentGrowthBatch({ authToken: token(), academicYear: $('sgYear').value, month: $('sgMonth').value, roundNo: $('sgRound').value,
            measureDate: $('sgDate').value, grade: $('sgGrade').value, classNo: $('sgClass').value, records: records });
      }

      // แถบหัวหน้าแบบเดียวกับหน้าอื่น (js/page-banner.js) วางในหน้าเอง เพราะหน้านี้ไม่มีหัวเดิมให้ซ่อน
      function banner(){
        var host = $('sg2BannerHost'), pb = window.PP5PageBanner;
        if (!host || !pb || typeof pb.build !== 'function' || host.firstChild) return;
        var el = pb.build({ icon: 'bi-clipboard2-pulse-fill', title: 'บันทึกน้ำหนัก-ส่วนสูง', sub: 'ชั่งน้ำหนัก วัดส่วนสูง และดูภาวะโภชนาการตามเกณฑ์ WHO' });
        el.removeAttribute('id');
        host.appendChild(el);
        if (typeof pb.paint === 'function') pb.paint(el);
      }
      // เตือนก่อนออกจากหน้าเมื่อยังไม่บันทึก (ปิดแท็บ/รีเฟรช และเปลี่ยนหน้าในแอป)
      function guardLeaving(){
        if (window.__sg2Guard) return;
        window.__sg2Guard = true;
        window.addEventListener('beforeunload', function(e){
          if (document.getElementById('sg2SaveBar') && window.SGEntry && window.SGEntry.isDirty()) { e.preventDefault(); e.returnValue = ''; }
        });
        var original = window.navigateTo;
        if (typeof original !== 'function') return;
        window.navigateTo = function(){
          if (document.getElementById('sg2SaveBar') && window.SGEntry && window.SGEntry.isDirty()
            && !window.confirm('ข้อมูลน้ำหนัก-ส่วนสูงที่แก้ไขยังไม่ได้บันทึก ออกจากหน้านี้หรือไม่?')) return;
          return original.apply(this, arguments);
        };
      }
      function init(){
        $('sgMonth').innerHTML = monthNames.map(function(n, i){ return '<option value="' + (i + 1) + '">' + n + '</option>'; }).join('');
        $('sgDate').value = today();
        banner();
        guardLeaving();
        google.script.run.withSuccessHandler(function(res){
          if (res && res.success) { $('sgYear').value = res.academicYear || ''; $('sgMonth').value = res.month || '1'; $('sgRound').value = res.roundNo || '1'; }
        }).getStudentGrowthDefaults(token());
        google.script.run.withSuccessHandler(function(grades){
          $('sgGrade').innerHTML = '<option value="">เลือกชั้น</option>' + (grades || []).map(function(g){ return '<option value="' + esc(g) + '">' + esc(g) + '</option>'; }).join('');
        }).getAvailableGrades(token());
        $('sgGrade').addEventListener('change', function(){
          students = [];
          lastLoadKey = '';
          $('sgRows').innerHTML = '<div class="sg2-empty">เลือกห้อง แล้วระบบจะโหลดรายชื่ออัตโนมัติ</div>';
          summary();
          $('sgSaveBtn').disabled = true;
          $('sgClass').innerHTML = '<option value="">กำลังโหลด...</option>';
          google.script.run.withSuccessHandler(function(classes){
            $('sgClass').innerHTML = '<option value="">เลือกห้อง</option>' + (classes || []).map(function(c){ return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
          }).getAvailableClasses($('sgGrade').value, token());
        });
        $('sgClass').addEventListener('change', autoLoadStudentsIfReady);
        // อายุเปลี่ยนตามวันที่ชั่งวัด -> คิดภาวะโภชนาการใหม่ทุกแถว
        $('sgDate').addEventListener('change', function(){ if (!settingDate) autoDate = false; rows().forEach(paintRow); summary(); });
        ['sgYear', 'sgMonth', 'sgRound'].forEach(function(id){ $(id).addEventListener('change', onPeriodChange); });
      }
      setTimeout(init, 0);
      return { loadStudents: loadStudents, save: save, revert: revert, isDirty: isDirty, nextRound: nextRound };
    })();
  </script>`;

  global.GAS_PAGES.student_growth_entry = `<div class="growth-page sg2">${STYLE}${BODY}${SCRIPT}</div>`;
})(window);
