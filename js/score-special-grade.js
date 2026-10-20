// ใส่ ร / มส ในหน้ากรอกคะแนนรายวิชา (owner 2026-10-20): เดิมหน้านี้ไม่มีทางใส่ ร / มส และการบันทึกเขียนเกรดจากคะแนนทับทุกครั้ง
// กดปุ่ม ▾ ที่ช่องเกรด → เลือก "ตามคะแนน" / "ร" / "มส"
//   - คะแนนที่กรอกยังอยู่และบันทึกตามจริง แต่ผลเป็น ร / มส (gas-bridge saveScoreSheetData เก็บใน grade_text)
//   - หน้าเดิมคำนวณเกรดใหม่ทุกครั้งที่พิมพ์ → MutationObserver ทาสีป้ายกลับเป็น ร / มส ตามแถว (tr.dataset.special)
//   - เปลี่ยนแล้วส่ง input event ที่ช่องคะแนนแรกของแถว ให้หน้าเดิมขึ้น "มีการแก้ไขที่ยังไม่บันทึก" และคำนวณแถวใหม่
//   - ตาราง "รวม 2 ภาค": ภาคใดเป็น ร / มส ผลรวมเป็นค่านั้น (กติกาเดียวกับ ปพ.5 / pp5YearEndResult)
// โหลดจากระบบ: gas-bridge legacyTermScoreData ส่งเกรด ร / มส มาในป้ายเลย จึงอ่านค่าเริ่มต้นจากป้าย
// คำเตือน "ควรเป็น มส" (owner เลือก ก. 2026-10-20): เวลาเรียนวิชานี้ต่ำกว่า 80% → ป้ายเตือนใต้เกรด ตัวเลขจาก
//   gas-bridge getScoreSheetMsWarnings (ตัวเดียวกับ ปพ.5 รายวิชา) · ไม่ใส่ มส ให้เอง ครูกด ▾ เลือกเอง · เป็น มส แล้วป้ายหาย
// กติกาแก้ ร / มส ภายหลัง (0 → สอบแก้ตัว ≤ 1, มส → เรียนเพิ่มแล้วสอบ ≤ 1, ร → ตามคะแนนจริง) เป็นงานระยะ 2 · tools/score-special-grade-contract.cjs
(function initScoreSpecialGrade(global) {
  'use strict';
  const doc = global.document;
  const SPECIALS = ['ร', 'มส'];
  const TERMS = { scoreEntryTerm1Container: 'term1', scoreEntryTerm2Container: 'term2' };
  const OPTIONS = [['', 'ตามคะแนน', 'คิดเกรดจากคะแนนที่กรอก'], ['ร', 'ร', 'รอการตัดสิน (งานไม่ครบ)'], ['มส', 'มส', 'ไม่มีสิทธิ์สอบ (เวลาเรียนไม่ถึง 80%)']];
  const isSpecial = (value) => SPECIALS.includes(String(value || '').trim());
  const STYLE = `
.pp5-sg-cell{white-space:nowrap}
.pp5-sg-btn{margin-left:2px;width:18px;height:22px;padding:0;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#475569;font-size:.7rem;line-height:1;vertical-align:middle;cursor:pointer}
.pp5-sg-btn:hover,.pp5-sg-btn:focus-visible{border-color:var(--primary,#4f46e5);color:var(--primary,#4f46e5);outline:none}
.score-entry-grade-badge.pp5-sg-special{background:#fef3c7!important;color:#92400e!important;border:1px solid #f59e0b!important;font-weight:700}
#pp5SgMenu{position:fixed;z-index:10080;min-width:220px;padding:6px;background:#fff;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 12px 28px rgba(15,23,42,.18);font-family:inherit}
#pp5SgMenu button{display:flex;gap:10px;align-items:baseline;width:100%;padding:8px 10px;border:0;border-radius:8px;background:transparent;text-align:left;font:inherit;cursor:pointer}
#pp5SgMenu button:hover,#pp5SgMenu button:focus-visible{background:#f1f5f9;outline:none}
#pp5SgMenu button[aria-checked="true"]{background:#eef2ff}
#pp5SgMenu b{min-width:56px}#pp5SgMenu small{color:#64748b}
.pp5-sg-warn{display:block;margin-top:2px;padding:0 4px;border-radius:6px;background:#fee2e2;color:#b91c1c;font-size:.62rem;font-weight:700;line-height:1.5;white-space:nowrap}
[data-theme="dark"] .pp5-sg-warn{background:#4c1d1d;color:#fecaca}
[data-theme="dark"] .pp5-sg-btn{background:#1b2232;border-color:#2b3446;color:#cbd5e1}
[data-theme="dark"] #pp5SgMenu{background:#1b2232;border-color:#2b3446}
[data-theme="dark"] #pp5SgMenu button:hover{background:#26304a}`;

  function installStyle() {
    if (!doc || doc.getElementById('pp5SgStyle')) return;
    const style = doc.createElement('style');
    style.id = 'pp5SgStyle';
    style.textContent = STYLE;
    (doc.head || doc.documentElement).appendChild(style);
  }

  // ป้ายเกรดของแถว: ร / มส ทับเกรดจากคะแนน · ไม่มีค่าพิเศษ = ปล่อยให้หน้าเดิมคำนวณ
  function paint(tr) {
    const badge = tr.querySelector('.score-entry-grade-badge');
    if (!badge) return;
    const special = tr.dataset.special || '';
    paintWarning(tr, special);
    if (special) {
      if (badge.textContent.trim() !== special) badge.textContent = special;
      if (!badge.classList.contains('pp5-sg-special')) badge.className = 'score-entry-grade-badge pp5-sg-special';
    } else if (badge.classList.contains('pp5-sg-special')) {
      badge.classList.remove('pp5-sg-special');
    }
  }

  // เวลาเรียนต่ำกว่า 80% และยังไม่ได้เลือก มส → ป้าย "ควรเป็น มส · xx%" (เขียนเฉพาะเมื่อต่าง กัน observer วน)
  let warnings = null;
  function paintWarning(tr, special) {
    const cell = tr.querySelector('.score-entry-grade');
    if (!cell) return;
    const row = warnings ? warnings.get(tr.dataset.studentId) : null;
    const want = row && row.below && special !== 'มส' ? `ควรเป็น มส · ${row.pct}%` : '';
    let chip = cell.querySelector('.pp5-sg-warn');
    if (!want) { if (chip) chip.remove(); return; }
    if (!chip) {
      chip = doc.createElement('span');
      chip.className = 'pp5-sg-warn';
      cell.appendChild(chip);
    }
    if (chip.textContent !== want) {
      chip.textContent = want;
      chip.title = `เวลาเรียนวิชานี้ ${row.pct}% (ต่ำกว่า 80%) ตามเกณฑ์เดียวกับ ปพ.5 — ถ้าใช่ กด ▾ แล้วเลือก มส`;
    }
  }

  let warningsFor = '';
  function loadWarnings() {
    const sheetName = global.PP5ScoreSheetSpecials?.sheetName || '';
    const call = global.GasServer?.getScoreSheetMsWarnings;
    if (!sheetName || sheetName === warningsFor || typeof call !== 'function') return;
    warningsFor = sheetName;
    warnings = null;
    Promise.resolve(call.call(global.GasServer, sheetName)).then((result) => {
      if (warningsFor !== sheetName) return;
      warnings = new Map(((result && result.rows) || []).map((row) => [String(row.id), row]));
      Object.keys(TERMS).forEach((id) => {
        doc.getElementById(id)?.querySelectorAll('tbody tr[data-student-id]').forEach((tr) => paint(tr));
      });
    }).catch(() => {});
  }

  function closeMenu() { doc?.getElementById('pp5SgMenu')?.remove(); }

  function choose(tr, value) {
    if (value) tr.dataset.special = value; else delete tr.dataset.special;
    // ให้หน้าเดิมคำนวณแถวและขึ้น "มีการแก้ไขที่ยังไม่บันทึก" (ฟัง input ที่ช่องคะแนน)
    const input = tr.querySelector('.score-entry-input, .score-entry-final-input');
    if (input) input.dispatchEvent(new global.Event('input', { bubbles: true }));
    paint(tr);
    syncCombined();
  }

  function openMenu(button, tr) {
    closeMenu();
    const menu = doc.createElement('div');
    menu.id = 'pp5SgMenu';
    menu.setAttribute('role', 'menu');
    const current = tr.dataset.special || '';
    menu.innerHTML = OPTIONS.map(([value, label, hint]) => `<button type="button" role="menuitemradio" data-sg="${value}" aria-checked="${value === current}"><b>${label}</b><small>${hint}</small></button>`).join('');
    doc.body.appendChild(menu);
    const rect = button.getBoundingClientRect();
    const width = menu.offsetWidth || 240;
    menu.style.left = `${Math.max(8, Math.min(rect.right - width, (global.innerWidth || 1200) - width - 8))}px`;
    menu.style.top = `${Math.min(rect.bottom + 4, (global.innerHeight || 800) - (menu.offsetHeight || 140) - 8)}px`;
    menu.addEventListener('click', (event) => {
      const item = event.target.closest('[data-sg]');
      if (!item) return;
      choose(tr, item.getAttribute('data-sg'));
      closeMenu();
      button.focus();
    });
    (menu.querySelector('[aria-checked="true"]') || menu.querySelector('button'))?.focus();
  }

  function enhanceRow(tr, term) {
    if (tr.__pp5Sg) return;
    const cell = tr.querySelector('.score-entry-grade');
    const badge = cell?.querySelector('.score-entry-grade-badge');
    if (!cell || !badge) return;
    tr.__pp5Sg = true;
    // ค่าที่บันทึกไว้มาจาก gas-bridge getScoreSheetData (PP5ScoreSheetSpecials) — ป้ายถูกหน้าเดิมคำนวณทับก่อนถึงตรงนี้
    const saved = global.PP5ScoreSheetSpecials?.[term]?.[tr.dataset.studentId];
    if (isSpecial(saved)) tr.dataset.special = saved;
    else if (isSpecial(badge.textContent)) tr.dataset.special = badge.textContent.trim();
    cell.classList.add('pp5-sg-cell');
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'pp5-sg-btn';
    button.setAttribute('data-pp5-btn-skip', '');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-label', 'เลือกผล ร / มส');
    button.title = 'เลือก ร / มส';
    button.textContent = '▾';
    button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); openMenu(button, tr); });
    cell.appendChild(button);
    if (typeof global.MutationObserver === 'function') {
      new global.MutationObserver(() => paint(tr)).observe(badge, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    paint(tr);
  }

  // รวม 2 ภาค: ภาคใดเป็น ร / มส → ผลรวมเป็นค่านั้น (อ่านจากแถวของตารางภาค 1 / 2)
  function syncCombined() {
    const combined = doc?.getElementById('scoreEntryCombinedContainer');
    if (!combined) return;
    const specialOf = new Map();
    Object.keys(TERMS).forEach((id) => {
      doc.getElementById(id)?.querySelectorAll('tbody tr[data-student-id]').forEach((tr) => {
        if (tr.dataset.special && !specialOf.has(tr.dataset.studentId)) specialOf.set(tr.dataset.studentId, tr.dataset.special);
      });
    });
    combined.querySelectorAll('tbody tr[data-student-id]').forEach((tr) => {
      const special = specialOf.get(tr.dataset.studentId);
      if (!special) return;
      let badge = tr.querySelector('.score-entry-grade-badge');
      // มีผลภาคเดียว: ช่องผลรวมเป็นข้อความ "—" ไม่มีป้าย — ใส่ป้าย ร / มส แทน (ภาคใดเป็น ร / มส ทั้งปีเป็นค่านั้น)
      if (!badge) {
        const cell = tr.querySelector('.score-entry-grade');
        if (!cell) return;
        badge = doc.createElement('span');
        cell.replaceChildren(badge);
      }
      // เขียนเฉพาะเมื่อต่าง: การเขียนค่าเดิมซ้ำทำให้ MutationObserver ของหน้าเรียก apply วนไม่จบ
      if (badge.textContent.trim() !== special) badge.textContent = special;
      if (badge.className !== 'score-entry-grade-badge pp5-sg-special') badge.className = 'score-entry-grade-badge pp5-sg-special';
    });
  }

  function apply() {
    if (!doc?.getElementById('scoreEntryPage')) return;
    installStyle();
    Object.keys(TERMS).forEach((id) => {
      doc.getElementById(id)?.querySelectorAll('table.score-entry-table tbody tr[data-student-id]').forEach((tr) => enhanceRow(tr, TERMS[id]));
    });
    syncCombined();
    loadWarnings();
  }

  function watch() {
    const frame = doc?.getElementById('contentFrame');
    if (!frame || frame.__pp5Sg) return;
    frame.__pp5Sg = true;
    let timer = null;
    if (typeof global.MutationObserver === 'function') {
      new global.MutationObserver(() => { global.clearTimeout(timer); timer = global.setTimeout(apply, 60); }).observe(frame, { childList: true, subtree: true });
    }
    doc.addEventListener('click', (event) => { if (!event.target.closest?.('#pp5SgMenu')) closeMenu(); });
    doc.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
    apply();
  }

  global.PP5ScoreSpecialGrade = { apply, paint, choose, isSpecial, loadWarnings, OPTIONS };
  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
    else watch();
  }
})(window);
