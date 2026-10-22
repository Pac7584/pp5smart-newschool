// แผง "ความตรงกันของข้อมูล" ในหน้าตรวจความพร้อม ปพ.5 (pp5_readiness) — owner 2026-10-22: "ถ้าสอนรายวิชา แล้วปรับมาเป็น
// รายชั้นจะแมตกันไหม รวมทั้งเวลาเรียน รายงานผล ออก ปพ.5-6"
// ข้อมูลมาจาก getPp5ReadinessSummary(...).sections.consistency (gas-bridge pp5ConsistencyChecks) — อ่านอย่างเดียว
// ห่อ GasServer.getPp5ReadinessSummary (ส่งผลเดิมกลับ) เพื่อจำผลล่าสุด แล้ววางแผงต่อท้ายผลของหน้าเดิม (#pp5rOutput)
// ข้อความสรุปแต่ละหัวข้อขึ้นในรายการ "ต้องแก้ไข / ควรตรวจเพิ่ม" ของหน้าเดิมอยู่แล้ว แผงนี้บอกรายละเอียดว่าใคร วันไหน วิชาไหน
(function initPp5Consistency(global) {
  'use strict';
  const server = global.GasServer;
  const doc = global.document;
  if (!server || !doc || server.__pp5ConsistencyWrapped) return;
  server.__pp5ConsistencyWrapped = true;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let last = null;

  const original = server.getPp5ReadinessSummary;
  if (typeof original === 'function') {
    server.getPp5ReadinessSummary = async function (...args) {
      const result = await original.apply(this, args);
      last = result;
      schedule();
      return result;
    };
  }

  const SOURCES = '<p class="pp5r-muted" style="margin:6px 0 0">เวลาเรียนมี 2 แหล่ง: <b>ปพ.5 ประจำชั้น · ปพ.6 · สรุปเวลาเรียน</b> นับจากเช็คชื่อรายวัน '
    + 'ส่วน <b>ปพ.5 รายวิชา · เสี่ยง มส. · คำเตือน มส. ในหน้ากรอกคะแนน</b> นับจากเช็คชื่อรายวิชา (ถ้าวิชานั้นมี) · คะแนนและเกรดใช้ชุดเดียวกันทุกเอกสาร</p>';

  function panelHtml(consistency) {
    const items = Array.isArray(consistency?.items) ? consistency.items : [];
    const checked = consistency?.checked || {};
    const notes = [];
    if (!checked.subjectAttendance) notes.push('ห้องนี้ยังไม่มีเช็คชื่อรายวิชา — เวลาเรียนทุกเอกสารนับจากเช็คชื่อรายวันอย่างเดียว จึงไม่มีอะไรต้องเทียบ');
    if (consistency?.error) notes.push(`ตรวจบางข้อไม่สำเร็จ: ${consistency.error}`);
    const body = items.length ? items.map((item) => {
      const badge = item.level === 'bad' ? '<span class="pp5r-badge bad">ต้องแก้</span>' : '<span class="pp5r-badge warn">ควรตรวจ</span>';
      const more = item.count > item.rows.length ? `<p class="pp5r-muted">แสดง ${item.rows.length} รายการแรกจาก ${item.count}</p>` : '';
      return `<details class="pp5c-item" data-key="${esc(item.key)}"${item.level === 'bad' ? ' open' : ''}>
  <summary>${badge} ${esc(item.title)} <b>${esc(item.count)} รายการ</b></summary>
  <table class="pp5r-table"><thead><tr><th>นักเรียน / ห้อง</th><th>วันที่ / วิชา</th><th>รายละเอียด</th></tr></thead><tbody>
  ${item.rows.map((row) => `<tr><td>${esc(row.who)}</td><td>${esc(row.when)}</td><td>${esc(row.what)}</td></tr>`).join('')}
  </tbody></table>${more}</details>`;
    }).join('') : '<p style="margin:8px 0 0"><span class="pp5r-badge ok">ไม่พบข้อมูลที่ขัดกัน</span></p>';
    return `<div class="pp5r-panel" id="pp5ConsistencyPanel">
  <h3 class="pp5r-section-title"><i class="bi bi-arrow-left-right"></i> ความตรงกันของข้อมูล (ปพ.5 ประจำชั้น · ปพ.5 รายวิชา · ปพ.6)</h3>
  ${SOURCES}${notes.map((n) => `<p class="pp5r-muted" style="margin:6px 0 0">${esc(n)}</p>`).join('')}
  ${body}
</div>
<style>#pp5ConsistencyPanel .pp5c-item{margin-top:10px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px}
#pp5ConsistencyPanel .pp5c-item summary{cursor:pointer;line-height:1.5}
#pp5ConsistencyPanel .pp5c-item table{margin-top:8px}</style>`;
  }

  function apply() {
    const out = doc.getElementById('pp5rOutput');
    if (!out || !last || !last.success || !out.querySelector('.pp5r-score') || out.querySelector('#pp5ConsistencyPanel')) return;
    const consistency = last.sections?.consistency;
    if (!consistency) return;
    out.insertAdjacentHTML('beforeend', panelHtml(consistency));
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; apply(); }, 0);
  }

  function start() {
    const frame = doc.getElementById('contentFrame') || doc.body;
    if (typeof global.MutationObserver === 'function') new global.MutationObserver(schedule).observe(frame, { childList: true, subtree: true });
  }

  global.PP5Consistency = { panelHtml, apply };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
