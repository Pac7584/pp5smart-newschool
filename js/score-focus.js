// หน้ากรอกคะแนนบนมือถือ: "กรอกทีละครั้ง" (owner 2026-10-08, มือถือ รอบ 3)
// แถบปุ่ม ทั้งหมด · 1 2 3 4 · 5 กลางภาค · 6 7 8 9 · 10 ปลายภาค เหนือตารางภาค 1 / ภาค 2
// เลือกครั้งไหน = เหลือคอลัมน์ ที่ / ชื่อ / ครั้งนั้น / รวมทั้งหมด / เกรด (ช่องกรอกใหญ่ขึ้น)  "ทั้งหมด" = ตารางเดิม
// แสดงเฉพาะจอ <= 768px (css/score-focus.css) จอคอมไม่เปลี่ยน  ไม่แตะค่าคะแนนหรือการบันทึก แค่ซ่อน/แสดงช่อง
// คอลัมน์หาจากแถวนักเรียนแถวแรก (input.score-entry-input data-index 0-8 = ครั้งที่ 1-9,
// input.score-entry-final-input = ครั้งที่ 10) หัวตารางมี rowspan/colspan จึงคำนวณตำแหน่งคอลัมน์จริงของทุกช่อง
(function initScoreFocus(global) {
  'use strict';

  const KEY = 'pp5ScoreFocusRound';
  const CONTAINERS = ['scoreEntryTerm1Container', 'scoreEntryTerm2Container'];
  const CHIPS = [
    ['all', 'ทั้งหมด'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5 กลางภาค'],
    ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9'], ['10', '10 ปลายภาค']
  ];
  const doc = global.document;

  function current() {
    try { const v = global.sessionStorage.getItem(KEY); return CHIPS.some(([k]) => k === v) ? v : 'all'; } catch (_) { return 'all'; }
  }
  function remember(v) {
    try { global.sessionStorage.setItem(KEY, v); } catch (_) { /* private mode */ }
  }

  // ตำแหน่งคอลัมน์จริงของทุกช่อง (นับ rowspan/colspan เดิม ไม่ใช่ที่เราปรับ)
  function layout(table) {
    const taken = [];
    const cells = [];
    [...table.rows].forEach((row, r) => {
      let c = 0;
      [...row.cells].forEach((cell) => {
        while (taken[r]?.[c]) c += 1;
        const span = Number(cell.dataset.sfSpan || cell.colSpan) || 1;
        const rows = Math.max(1, Number(cell.rowSpan) || 1);
        for (let dr = 0; dr < rows; dr += 1) {
          taken[r + dr] ||= [];
          for (let dc = 0; dc < span; dc += 1) taken[r + dr][c + dc] = true;
        }
        cells.push({ cell, start: c, span });
        c += span;
      });
    });
    return cells;
  }

  // คอลัมน์ที่เก็บไว้: ที่, ชื่อ, ครั้งที่เลือก, รวมทั้งหมด, เกรด
  function keepColumns(table, round) {
    const row = table.tBodies[0] && [...table.tBodies[0].rows].find((tr) => tr.querySelector('input.score-entry-input'));
    if (!row) return null;
    const keep = new Set();
    let c = 0;
    [...row.cells].forEach((cell) => {
      const span = Number(cell.dataset.sfSpan || cell.colSpan) || 1;
      const input = cell.querySelector('input.score-entry-input, input.score-entry-final-input');
      const isRound = input && (input.classList.contains('score-entry-final-input') ? round === '10' : String(Number(input.dataset.index) + 1) === round);
      if (c === 0 || cell.classList.contains('score-entry-student-name') || cell.classList.contains('score-entry-total')
        || cell.classList.contains('score-entry-grade') || isRound) {
        for (let k = 0; k < span; k += 1) keep.add(c + k);
      }
      c += span;
    });
    return keep;
  }

  function apply(table, round) {
    const focus = round !== 'all';
    const keep = focus ? keepColumns(table, round) : null;
    if (focus && !keep) return;
    table.classList.toggle('pp5-sf-focus', focus);
    layout(table).forEach(({ cell, start, span }) => {
      if (!focus) {
        cell.classList.remove('pp5-sf-off');
        if (cell.dataset.sfSpan) { cell.colSpan = Number(cell.dataset.sfSpan); delete cell.dataset.sfSpan; }
        return;
      }
      let visible = 0;
      for (let k = 0; k < span; k += 1) if (keep.has(start + k)) visible += 1;
      cell.classList.toggle('pp5-sf-off', visible === 0);
      if (span > 1 && visible > 0) {
        if (!cell.dataset.sfSpan) cell.dataset.sfSpan = String(span);
        cell.colSpan = visible;
      }
    });
  }

  function applyAll(frame) {
    const round = current();
    CONTAINERS.forEach((id) => {
      frame.querySelectorAll(`#${id} table.score-entry-table`).forEach((table) => apply(table, round));
    });
    frame.querySelectorAll('#pp5ScoreFocus [data-round]').forEach((btn) => {
      const on = btn.getAttribute('data-round') === round;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      // ปุ่มที่เลือกอยู่ต้องมองเห็นในแถบ (แถบเลื่อนซ้าย-ขวาได้) โดยไม่เลื่อนทั้งหน้า
      if (on) {
        const chips = btn.parentElement;
        const left = btn.offsetLeft - chips.offsetLeft;
        if (left < chips.scrollLeft || left + btn.offsetWidth > chips.scrollLeft + chips.clientWidth) chips.scrollLeft = Math.max(0, left - 8);
      }
    });
  }

  function mountBar(frame) {
    const anchor = frame.querySelector('#scoreEntryTerm1Container')?.closest('.tab-content');
    if (!anchor || frame.querySelector('#pp5ScoreFocus')) return;
    const bar = doc.createElement('div');
    bar.id = 'pp5ScoreFocus';
    bar.className = 'pp5-sf-bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'กรอกทีละครั้ง');
    bar.innerHTML = '<span class="pp5-sf-label"><i class="bi bi-funnel"></i> กรอกทีละครั้ง</span><div class="pp5-sf-chips">'
      + CHIPS.map(([k, label]) => `<button type="button" class="pp5-sf-chip${k === 'all' ? ' is-all' : ''}" data-round="${k}">${label}</button>`).join('')
      + '</div>';
    anchor.before(bar);
    bar.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-round]');
      if (!btn) return;
      remember(btn.getAttribute('data-round'));
      applyAll(frame);
      // พร้อมกรอก: ไปช่องแรกของครั้งนั้น (ห้องที่ยังไม่มีคะแนน = เริ่มกรอกได้เลย)
      if (btn.getAttribute('data-round') !== 'all') {
        const table = frame.querySelector('.tab-pane.active table.score-entry-table.pp5-sf-focus');
        table?.closest('.score-entry-table-container')?.scrollTo?.({ left: 0 });
      }
    });
  }

  function watch() {
    const frame = doc.getElementById('contentFrame');
    if (!frame || frame.__pp5ScoreFocus) return;
    frame.__pp5ScoreFocus = true;
    let timer = null;
    const run = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!frame.querySelector('#scoreEntryTerm1Container')) return;
        mountBar(frame);
        applyAll(frame);
      }, 60);
    };
    // ตารางถูกสร้างใหม่ทุกครั้งที่เปลี่ยนห้อง/วิชา/ภาค: ใส่โหมดเดิมให้ตารางใหม่ (ฟังเฉพาะการเพิ่มลบ element)
    if (typeof MutationObserver === 'function') {
      new MutationObserver((records) => {
        if (records.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1 && (n.matches?.('table, .score-entry-table-container, tbody, tr') || n.querySelector?.('table.score-entry-table'))))) run();
      }).observe(frame, { childList: true, subtree: true });
    }
    run();
  }

  global.PP5ScoreFocus = { apply, layout, keepColumns, CHIPS };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
})(window);
