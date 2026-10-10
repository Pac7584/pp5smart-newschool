// ชิ้นส่วนกลางของหน้าประเมิน (คุณลักษณะ / สมรรถนะ / กิจกรรม / อ่านคิดวิเคราะห์เขียน 2 หน้า)
//   - ช่องนักเรียน: รูปวงกลม (ไม่มีรูป = ไอคอนนักเรียน) ชื่อ และ "รหัส · เลขที่" ใต้ชื่อ
//   - การ์ดสรุป ทั้งหมด / ประเมินครบ / ยังไม่ครบ / ปรับปรุง กดเพื่อกรองรายชื่อ
//   - แถบบันทึกติดล่างจอ ปุ่มในแถบกดปุ่มเดิมของหน้า (#saveBtn / #exportBtn) จึงบันทึกด้วยวิธีเดิมทุกอย่าง
// ทำงานกับแถวที่หน้าเว็บสร้างไว้ (tr[data-student-id]) ไม่แก้ข้อมูลหรือวิธีบันทึกของหน้า
// เปิดใช้ทีละหน้าผ่าน PAGES (owner decisions 2026-10-06, docs/AGENT_HANDOFF.md §0.4a)
// เรียกจาก pp5EnhanceAssessmentStudentList_ ใน spa-main.js ทุกครั้งที่ตารางเปลี่ยน ต้องไม่แก้ DOM ถ้าค่าไม่เปลี่ยน
// (ไม่งั้น MutationObserver ของหน้าจะวนไม่จบ)
(function initAssessmentUi(global) {
  'use strict';

  const PAGES = {
    characteristic_assessment: {
      nameCell: 1,
      criteria: 8,
      saveLabel: 'บันทึกผลประเมิน',
      // ช่องคะแนนเป็น td.score-cell แสดง 0-3 หรือ "–" และช่องสุดท้ายเป็นผลการประเมิน
      values: (row) => Array.from(row.querySelectorAll('td.score-cell'), (td) => {
        const value = td.textContent.trim();
        return /^[0-3]$/.test(value) ? Number(value) : null;
      }),
      failed: (row) => lastCellText(row) === 'ปรับปรุง'
    },
    // อ่าน คิดวิเคราะห์ และเขียน ราย 8 วิชา: ช่องคะแนนเป็น select.score-input ผลอยู่ในช่องสุดท้าย (ไม่ผ่าน = 0 สองวิชาขึ้นไป)
    read_think_write_form: {
      nameCell: 1,
      criteria: 8,
      saveLabel: 'บันทึกผลประเมิน',
      failLabel: 'ไม่ผ่าน',
      values: selectValues,
      failed: (row) => lastCellText(row) === 'ไม่ผ่าน'
    },
    // อ่าน คิดวิเคราะห์ และเขียน 5 ข้อ: แบบเดียวกัน ผลต่ำสุดคือ "ปรับปรุง" (หน้านี้ไม่มีปุ่ม PDF แถบจึงซ่อนปุ่ม PDF เอง)
    rtw5_assessment: {
      nameCell: 1,
      criteria: 5,
      saveLabel: 'บันทึกผลประเมิน',
      values: selectValues,
      failed: (row) => lastCellText(row) === 'ปรับปรุง'
    }
  };

  // กิจกรรมพัฒนาผู้เรียน: หน้าเดิมใช้ select ผ่าน/ไม่ผ่าน ต่อกิจกรรม (onchange เก็บค่าลงข้อมูลของหน้า)
  // และปุ่ม "ผ่านทั้งห้อง" ของ spa-main ก็ตั้งค่าผ่าน select เหล่านี้ จึงเก็บ select ไว้ (ซ่อน) แล้ววางปุ่มกดสลับทับ
  // กดปุ่ม = เปลี่ยน select + ส่ง change ให้หน้าเดิมเก็บค่าเอง  "รวม" คำนวณจาก 4 กิจกรรมทุกครั้งที่มีการเปลี่ยน
  const ACTIVITY_KEYS = ['guidance', 'scout', 'club', 'social'];
  PAGES.activity_assessment = {
    nameCell: 1,
    criteria: 4,
    saveLabel: 'บันทึกผลประเมิน',
    failLabel: 'ไม่ผ่าน',
    values: (row) => ACTIVITY_KEYS.map((key) => {
      const value = row.querySelector(`select[data-activity="${key}"]`)?.value;
      return value === 'ผ่าน' ? 1 : value === 'ไม่ผ่าน' ? 0 : null;
    }),
    failed: (row) => row.querySelector('select[data-activity="overall"]')?.value === 'ไม่ผ่าน',
    enhanceRow: enhanceActivityRow,
    setup: setupActivityPage
  };

  const ACTIVITY_STATES = {
    '': { cls: 'is-unset', text: '–', title: 'ยังไม่ประเมิน' },
    'ผ่าน': { cls: 'is-pass', text: 'ผ', title: 'ผ่าน' },
    'ไม่ผ่าน': { cls: 'is-fail', text: 'มผ', title: 'ไม่ผ่าน' }
  };
  const ACTIVITY_NEXT = { '': 'ผ่าน', 'ผ่าน': 'ไม่ผ่าน', 'ไม่ผ่าน': '' };

  function activityOverall(row) {
    const values = ACTIVITY_KEYS.map((key) => row.querySelector(`select[data-activity="${key}"]`)?.value || '');
    if (values.includes('ไม่ผ่าน')) return 'ไม่ผ่าน';
    return values.every((value) => value === 'ผ่าน') ? 'ผ่าน' : '';
  }

  // force = ครูเพิ่งเปลี่ยนกิจกรรมในแถวนี้ (ผลว่างได้)  ไม่ force = ตอนวาดแถว: แก้เฉพาะเมื่อผลชัดเจน
  // จะได้ไม่ลบ "รวม" ที่บันทึกไว้ก่อนของแถวที่ยังประเมินไม่ครบ
  function applyActivityOverall(row, force) {
    const overall = row.querySelector('select[data-activity="overall"]');
    if (!overall) return;
    const value = activityOverall(row);
    if (overall.value === value || (!force && !value)) return;
    overall.value = value;
    const studentId = row.getAttribute('data-student-id');
    const assessment = global.ActivityAssessment;
    if (studentId && typeof assessment?.updateActivityScore === 'function') assessment.updateActivityScore(studentId, 'overall', value);
  }

  function syncActivityMark(select, mark, overall) {
    const state = ACTIVITY_STATES[select.value] || ACTIVITY_STATES[''];
    const cls = `${overall ? 'pp5-au-overall' : 'pp5-au-toggle'} ${state.cls}`;
    if (mark.className !== cls) mark.className = cls;
    const text = overall ? (select.value || 'ยังไม่ครบ') : state.text;
    setText(mark, text);
    setAttr(mark, overall ? 'title' : 'aria-label', overall ? `รวม: ${select.value || 'ยังไม่ครบ'}` : state.title);
  }

  function enhanceActivityRow(row) {
    applyActivityOverall(row, false);
    row.querySelectorAll('select.act-select[data-activity]').forEach((select) => {
      const overall = select.getAttribute('data-activity') === 'overall';
      let mark = select.__pp5AuMark;
      if (!mark || !mark.isConnected) {
        mark = document.createElement(overall ? 'span' : 'button');
        if (!overall) mark.type = 'button';
        mark.__pp5AuSelect = select;
        select.__pp5AuMark = mark;
        select.classList.add('pp5-au-hidden-select');
        select.tabIndex = -1;
        select.after(mark);
      }
      syncActivityMark(select, mark, overall);
    });
    // ชื่อชุมนุมย้ายไปไว้ใต้ปุ่มชุมนุม ช่อง "ชื่อชุมนุม" เดิมจึงว่างและถูกซ่อนด้วย CSS
    const name = row.querySelector('input[data-activity="clubName"]');
    const clubCell = row.querySelector('select[data-activity="club"]')?.closest('td');
    if (name && clubCell && name.parentElement !== clubCell) {
      name.parentElement?.classList.add('pp5-au-clubcol');
      name.classList.add('pp5-au-clubname');
      clubCell.appendChild(name);
    }
    const table = row.closest('table');
    if (table && !table.classList.contains('pp5-au-act-table')) table.classList.add('pp5-au-act-table');
  }

  function setupActivityPage(frame, pageName) {
    if (frame.__pp5AuActivity) return;
    frame.__pp5AuActivity = true;
    frame.addEventListener('click', (event) => {
      const mark = event.target.closest('button.pp5-au-toggle');
      const select = mark?.__pp5AuSelect;
      if (!select || !frame.contains(select)) return;
      select.value = ACTIVITY_NEXT[select.value] ?? 'ผ่าน';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // ทั้งปุ่มกดสลับและปุ่ม "ทั้งห้อง" ส่ง change มาที่นี่: คิด "รวม" ของแถวนั้นใหม่ แล้ววาดปุ่มตามค่า
    frame.addEventListener('change', (event) => {
      const select = event.target.closest?.('select.act-select[data-activity]');
      if (!select || !PAGES[pageName]) return;
      const row = select.closest('tr[data-student-id]');
      if (row && select.getAttribute('data-activity') !== 'overall') applyActivityOverall(row, true);
      decorate(frame, pageName);
    });
  }

  // สมรรถนะสำคัญ 5 ด้าน x 5 ข้อ: แท็บละ tbody และหน้าเดิมวาดเฉพาะแท็บที่เปิด ช่องเป็น input number
  // (onchange เก็บค่าลงหน้า) จึงเก็บ input ไว้ (ซ่อน) แล้ววางปุ่มคะแนน + ตัวเลือกระดับทับ แบบเดียวกับหน้ากิจกรรม
  // ผลรวมใช้เกณฑ์เดียวกับ ปพ. (gas-bridge gradeQuality): เฉลี่ย 25 ข้อ < 1 = ปรับปรุง
  const COMPETENCY_TABS = ['communicationTableBody', 'thinkingTableBody', 'problemTableBody', 'lifeTableBody', 'technologyTableBody'];
  PAGES.competency_assessment = {
    nameCell: 1,
    criteria: 25,
    saveLabel: 'บันทึกทั้งหมด',
    saveTarget: 'saveAllBtn',
    pdfTarget: null,
    host: '.container-fluid',
    summaryAnchor: (frame) => frame.querySelector('#competencyTabs'),
    rows: (frame) => Array.from(frame.querySelectorAll('.tab-pane.active tbody > tr[data-student-id]')),
    values: competencyValues,
    failed: (row) => {
      const values = competencyValues(row);
      return values.length === 25 && values.every((value) => value !== null)
        && values.reduce((sum, value) => sum + value, 0) / 25 < 1;
    },
    enhanceRow: enhanceScoreInputs,
    setup: setupScorePicker,
    afterDecorate: enhanceFillBoxes
  };

  // กล่อง "กรอกคะแนนรวมทุกคน" (แท็บละกล่อง) เดิมมีปุ่ม 20+ ปุ่มสีไม่ตรงความหมาย: ซ่อนตารางปุ่มเดิมไว้
  // แล้วแทนด้วย (1) แถบเดียว "ทั้งด้าน 3|2|1|0 + ล้างทั้งด้าน" และ (2) ตัวเลือก "ทั้งคอลัมน์ ▾" ใต้หัวคอลัมน์
  // แบบหน้าอ่าน คิด เขียน  ทุกปุ่มเรียกฟังก์ชันเดิมของหน้า (CompetencyAssessment.*) จึงทำงานเหมือนเดิมทุกอย่าง
  const FILL_LEVELS = ['3', '2', '1', '0'];

  function competencyApi() {
    return global.CompetencyAssessment || null;
  }

  function enhanceFillBoxes(frame) {
    frame.querySelectorAll('.tab-pane > .card.bg-light').forEach((box) => {
      if (box.querySelector('.pp5-au-fillbar')) return;
      const body = box.querySelector('.card-body');
      if (!body) return;
      box.classList.add('pp5-au-fillbox');
      const bar = document.createElement('div');
      bar.className = 'pp5-au-fillbar';
      bar.innerHTML = '<span class="pp5-au-fillbar-label">ให้ทุกคนทั้งด้าน</span>'
        + '<span class="pp5-au-seg" role="group" aria-label="ให้คะแนนทุกคนทั้งด้าน">'
        + FILL_LEVELS.map((v) => `<button type="button" class="pp5-au-seg-btn lvl-${v}" data-fill-tab="${v}" aria-label="ให้ ${v} ทุกคนทั้งด้าน">${v}</button>`).join('')
        + '</span>'
        + '<button type="button" class="pp5-au-clear-tab" data-clear-tab><i class="bi bi-eraser" aria-hidden="true"></i> ล้างทั้งด้าน</button>'
        + '<span class="pp5-au-fillbar-hint">หรือเลือก "ทั้งคอลัมน์" ใต้หัวตาราง</span>';
      bar.addEventListener('click', (event) => {
        const api = competencyApi();
        const fill = event.target.closest('[data-fill-tab]');
        if (fill && api?.fillAllCurrentTab) { api.fillAllCurrentTab(Number(fill.getAttribute('data-fill-tab'))); return; }
        if (event.target.closest('[data-clear-tab]') && api?.clearCurrentTab) api.clearCurrentTab();
      });
      body.appendChild(bar);
      enhanceColumnFills(box.closest('.tab-pane'));
    });
  }

  // หัวคอลัมน์คะแนน (คอลัมน์ที่ 3 เป็นต้นไป) ได้ตัวเลือก "ทั้งคอลัมน์"  หน้าวาดใหม่แค่ tbody จึงใส่ครั้งเดียวพอ
  function enhanceColumnFills(pane) {
    const head = pane?.querySelector('table thead tr');
    if (!head) return;
    Array.from(head.cells).slice(2).forEach((th, column) => {
      if (th.querySelector('.pp5-au-colfill')) return;
      const name = th.textContent.trim();
      th.innerHTML = `<div class="pp5-au-th-name">${esc(name)}</div>`
        + `<span class="pp5-au-colfill"><select aria-label="ให้คะแนนทั้งคอลัมน์ ${esc(name)}">`
        + '<option value="">ทั้งคอลัมน์</option>'
        + FILL_LEVELS.map((v) => `<option value="${v}">${v} ทุกคน</option>`).join('')
        + '</select></span>';
      th.querySelector('select').addEventListener('change', (event) => {
        const value = event.target.value;
        event.target.value = '';
        const api = competencyApi();
        if (value !== '' && api?.fillAllInColumn) api.fillAllInColumn(column, Number(value));
      });
    });
  }

  // ด้านที่วาดอยู่ในหน้า (เคยเปิดแท็บ) อ่านจากช่องจริง  ด้านที่ยังไม่เปิดใช้ค่าตอนโหลด
  function competencyValues(row) {
    const id = row.getAttribute('data-student-id');
    const doc = row.ownerDocument || document;
    const saved = competencyScores.get(id) || [];
    const values = [];
    COMPETENCY_TABS.forEach((tbodyId, tab) => {
      const tbody = doc.getElementById(tbodyId);
      const tabRow = tbody ? Array.from(tbody.rows).find((item) => item.getAttribute('data-student-id') === id) : null;
      const inputs = tabRow ? Array.from(tabRow.querySelectorAll('input.score-input')) : null;
      for (let i = 0; i < 5; i += 1) {
        const raw = inputs && inputs[i] ? inputs[i].value : saved[tab * 5 + i];
        const text = String(raw ?? '').trim();
        values.push(/^[0-3]$/.test(text) ? Number(text) : null);
      }
    });
    return values;
  }

  function syncScoreChip(input, chip) {
    const value = String(input.value ?? '').trim();
    const ok = /^[0-3]$/.test(value);
    const cls = `pp5-au-score ${ok ? `lvl-${value}` : 'is-unset'}`;
    if (chip.className !== cls) chip.className = cls;
    setText(chip, ok ? value : '–');
    setAttr(chip, 'aria-label', ok ? `คะแนน ${value} กดเพื่อเปลี่ยน` : 'ยังไม่ประเมิน กดเพื่อให้คะแนน');
  }

  function enhanceScoreInputs(row) {
    row.querySelectorAll('input.score-input').forEach((input) => {
      let chip = input.__pp5AuMark;
      if (!chip || !chip.isConnected) {
        chip = document.createElement('button');
        chip.type = 'button';
        chip.__pp5AuInput = input;
        input.__pp5AuMark = chip;
        input.classList.add('pp5-au-hidden-select');
        input.tabIndex = -1;
        input.after(chip);
      }
      syncScoreChip(input, chip);
    });
  }

  const SCORE_LEVELS = [
    { v: '3', label: 'ดีเยี่ยม' }, { v: '2', label: 'ดี' }, { v: '1', label: 'พอใช้' }, { v: '0', label: 'ปรับปรุง' }
  ];
  let pickerInput = null;

  function setScoreInput(input, value) {
    if (String(input.value) === value) return;
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function closeScorePicker() {
    document.getElementById('pp5AuPicker')?.remove();
    document.removeEventListener('mousedown', onPickerOutside, true);
    document.removeEventListener('keydown', onPickerKey, true);
    global.removeEventListener('scroll', closeScorePicker, true);
    pickerInput = null;
  }

  function onPickerOutside(event) {
    const box = document.getElementById('pp5AuPicker');
    if (box && !box.contains(event.target) && !event.target.closest?.('.pp5-au-score')) closeScorePicker();
  }

  function choosePicked(value) {
    const input = pickerInput;
    const chip = input?.__pp5AuMark;
    closeScorePicker();
    if (!input) return;
    setScoreInput(input, value);
    chip?.focus();
  }

  function onPickerKey(event) {
    if (!pickerInput) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      const chip = pickerInput.__pp5AuMark;
      closeScorePicker();
      chip?.focus();
    } else if (/^[0-3]$/.test(event.key)) {
      event.preventDefault();
      choosePicked(event.key);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      choosePicked('');
    }
  }

  function openScorePicker(chip) {
    const input = chip.__pp5AuInput;
    const reopen = pickerInput === input;
    closeScorePicker();
    if (!input || reopen) return;
    pickerInput = input;
    const box = document.createElement('div');
    box.id = 'pp5AuPicker';
    box.className = 'pp5-au-picker pp5-au-scope';
    box.setAttribute('role', 'listbox');
    box.innerHTML = SCORE_LEVELS.map((level) => `<button type="button" class="pp5-au-pick lvl-${level.v}" data-v="${level.v}"><b>${level.v}</b><span>${level.label}</span></button>`).join('')
      + '<button type="button" class="pp5-au-pick is-clear" data-v=""><b>–</b><span>ล้าง</span></button>';
    box.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-v]');
      if (btn) choosePicked(btn.getAttribute('data-v'));
    });
    document.body.appendChild(box);
    const rect = chip.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - box.offsetWidth / 2), global.innerWidth - box.offsetWidth - 8);
    let top = rect.bottom + 6;
    if (top + box.offsetHeight > global.innerHeight - 8) top = Math.max(8, rect.top - box.offsetHeight - 6);
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
    document.addEventListener('mousedown', onPickerOutside, true);
    document.addEventListener('keydown', onPickerKey, true);
    global.addEventListener('scroll', closeScorePicker, true);
  }

  function setupScorePicker(frame, pageName) {
    if (frame.__pp5AuScorePicker) return;
    frame.__pp5AuScorePicker = true;
    frame.addEventListener('click', (event) => {
      const chip = event.target.closest('button.pp5-au-score');
      if (chip && frame.contains(chip)) openScorePicker(chip);
    });
    // พิมพ์ 0-3 บนปุ่มได้เลยโดยไม่ต้องเปิดตัวเลือก  Delete = ล้าง
    frame.addEventListener('keydown', (event) => {
      const chip = event.target.closest?.('button.pp5-au-score');
      if (!chip || pickerInput) return;
      if (/^[0-3]$/.test(event.key)) { event.preventDefault(); setScoreInput(chip.__pp5AuInput, event.key); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); setScoreInput(chip.__pp5AuInput, ''); }
    });
    frame.addEventListener('change', (event) => {
      // contentFrame ใช้ร่วมทุกหน้า และหน้ากรอกคะแนนก็มี input.score-input: ทำงานเฉพาะตอนอยู่หน้าสมรรถนะ
      const input = event.target.closest?.('input.score-input');
      if (!input || !input.__pp5AuMark || !frame.querySelector('#competencyTabs')) return;
      if (input.__pp5AuMark) syncScoreChip(input, input.__pp5AuMark);
      decorate(frame, pageName);
    });
  }

  function lastCellText(row) {
    return (row.lastElementChild?.textContent || '').trim();
  }

  function selectValues(row) {
    return Array.from(row.querySelectorAll('select.score-input'), (select) => (
      /^[0-3]$/.test(String(select.value)) ? Number(select.value) : null
    ));
  }

  // ตัวโหลดรายชื่อของทั้ง 5 หน้า: จำรูปและเลขที่ของนักเรียนไว้ใช้วาดช่องนักเรียน
  const LOADERS = [
    'getStudentsForCharacteristic', 'getStudentsForCompetency', 'getStudentsForActivity',
    'getStudentsForRTW5', 'getStudentsForSubjectScore'
  ];
  const people = new Map();
  let filterMode = 'all';
  let filterPage = '';

  // คะแนนสมรรถนะ 25 ข้อตอนโหลด: หน้าสมรรถนะวาดเฉพาะแท็บที่เปิด ด้านที่ยังไม่เปิดจึงนับจากค่านี้
  const competencyScores = new Map();

  function remember(list, loaderName) {
    if (!Array.isArray(list)) return;
    list.forEach((student) => {
      const id = String(student?.studentId ?? student?.id ?? '').trim();
      if (!id) return;
      people.set(id, {
        photoUrl: photoSrc(student.photoUrl || student.photo_url),
        studentNumber: student.studentNumber ?? student.student_number ?? ''
      });
      if (loaderName === 'getStudentsForCompetency') competencyScores.set(id, Array.from(student.scores || []));
    });
  }

  function wrapLoaders(server) {
    if (!server) return;
    LOADERS.forEach((name) => {
      const original = server[name];
      if (typeof original !== 'function' || original.__pp5AssessmentUi) return;
      const wrapped = async function wrappedAssessmentLoader(...args) {
        const result = await original.apply(this, args);
        try { remember(result, name); } catch (_) {}
        return result;
      };
      wrapped.__pp5AssessmentUi = true;
      server[name] = wrapped;
    });
  }

  // ลิงก์ Google Drive แบบแชร์เปิดเป็นรูปตรง ๆ ไม่ได้ ต้องแปลงเป็น lh3 (แบบเดียวกับโลโก้โรงเรียน)
  function photoSrc(value) {
    const input = String(value ?? '').trim();
    if (!input) return '';
    const fromPath = input.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([-\w]{20,})/);
    if (fromPath) return `https://lh3.googleusercontent.com/d/${fromPath[1]}`;
    return /^(https?:|data:image\/)/i.test(input) ? input : '';
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }

  function handles(pageName) {
    return Object.prototype.hasOwnProperty.call(PAGES, pageName);
  }

  function studentRows(frame) {
    return Array.from(frame.querySelectorAll('tbody > tr[data-student-id]'));
  }

  // ---------- ช่องนักเรียน ----------
  function identityHtml(id, name, info) {
    const avatar = info.photoUrl
      ? `<img src="${esc(info.photoUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : '<i class="bi bi-person-fill" aria-hidden="true"></i>';
    const number = String(info.studentNumber ?? '').trim();
    return `<div class="pp5-au-who">`
      + `<span class="pp5-au-avatar${info.photoUrl ? ' has-photo' : ''}">${avatar}</span>`
      + `<span class="pp5-au-text"><span class="pp5-au-name">${esc(name)}</span>`
      + `<span class="pp5-au-meta"><span class="pp5-au-chip"><i class="bi bi-person-vcard" aria-hidden="true"></i>${esc(id)}</span>`
      + (number ? `<span class="pp5-au-no">เลขที่ ${esc(number)}</span>` : '')
      + `</span></span></div>`;
  }

  function decorateIdentity(row, config) {
    const cell = row.cells[config.nameCell];
    if (!cell) return;
    const id = String(row.getAttribute('data-student-id') || '').trim();
    const name = String(row.getAttribute('data-name') || '').trim() || cell.textContent.trim();
    const info = people.get(id) || { photoUrl: '', studentNumber: '' };
    const key = `${id}|${name}|${info.photoUrl}|${info.studentNumber}`;
    if (cell.dataset.pp5AuKey === key && cell.querySelector('.pp5-au-who')) return;
    cell.dataset.pp5AuKey = key;
    cell.classList.add('pp5-au-namecell');
    cell.innerHTML = identityHtml(id, name, info);
    const img = cell.querySelector('img');
    if (img) {
      img.addEventListener('error', () => {
        const box = img.parentElement;
        if (!box) return;
        box.classList.remove('has-photo');
        box.innerHTML = '<i class="bi bi-person-fill" aria-hidden="true"></i>';
      }, { once: true });
    }
  }

  // หัวคอลัมน์ชื่อ (มือถือ: ค้างไว้ทางซ้ายพร้อมช่องชื่อ ดู css/assessment-ui.css "มือถือ รอบ 2")
  // หาในหัวตารางแถวแรกช่องที่ครอบคอลัมน์ nameCell (นับ colspan) ช่องเลขที่/ชื่อเป็น rowspan ทั้งหัว
  function markNameHeaders(rows, config) {
    // ตกแต่งเท่านั้น: ห้ามทำให้การตกแต่งหลักของหน้าล้ม
    const tables = new Set(rows.map((row) => row.closest?.('table')).filter(Boolean));
    tables.forEach((table) => {
      const head = table.tHead?.rows?.[0];
      if (!head || head.querySelector('.pp5-au-nameth')) return;
      let col = 0;
      for (const cell of head.cells) {
        const span = Math.max(1, Number(cell.colSpan) || 1);
        if (col <= config.nameCell && config.nameCell < col + span) { cell.classList.add('pp5-au-nameth'); break; }
        col += span;
      }
    });
  }

  // ---------- สรุปและการกรอง ----------
  function rowState(row, config) {
    const values = config.values(row);
    const filled = values.filter((value) => value !== null).length;
    const done = filled >= config.criteria;
    return { done, todo: !done, fail: done && config.failed(row) };
  }

  function summarize(rows, config) {
    const counts = { all: rows.length, done: 0, todo: 0, fail: 0 };
    const states = rows.map((row) => {
      const state = rowState(row, config);
      if (state.done) counts.done += 1; else counts.todo += 1;
      if (state.fail) counts.fail += 1;
      return state;
    });
    return { counts, states };
  }

  const CARDS = [
    { mode: 'all', icon: 'bi-people-fill', label: 'ทั้งหมด' },
    { mode: 'done', icon: 'bi-check-circle-fill', label: 'ประเมินครบ' },
    { mode: 'todo', icon: 'bi-hourglass-split', label: 'ยังไม่ครบ' },
    { mode: 'fail', icon: 'bi-exclamation-triangle-fill', label: 'ปรับปรุง' }
  ];

  function ensureSummary(frame, anchor, pageName) {
    let box = frame.querySelector('#pp5AuSummary');
    if (box && box.dataset.page !== pageName) { box.remove(); box = null; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'pp5AuSummary';
      box.className = 'pp5-au-summary';
      box.dataset.page = pageName;
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'สรุปการประเมิน กดเพื่อกรองรายชื่อ');
      box.innerHTML = CARDS.map((card) => `<button type="button" class="pp5-au-card is-${card.mode}" data-filter="${card.mode}" aria-pressed="false">`
        + `<i class="bi ${card.icon}" aria-hidden="true"></i>`
        + `<span class="pp5-au-card-num">0</span><span class="pp5-au-card-label">${esc(card.mode === 'fail' ? (PAGES[pageName].failLabel || card.label) : card.label)}</span></button>`).join('');
      box.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-filter]');
        if (!btn) return;
        const mode = btn.getAttribute('data-filter');
        filterMode = filterMode === mode ? 'all' : mode;
        decorate(frame, pageName);
      });
    }
    if (anchor && anchor.parentNode && box.nextElementSibling !== anchor) anchor.parentNode.insertBefore(box, anchor);
    return box;
  }

  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  function setAttr(el, name, value) {
    if (el && el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  function setShown(el, shown) {
    const value = shown ? '' : 'none';
    if (el && el.style.display !== value) el.style.display = value;
  }

  // ---------- แถบบันทึกล่างจอ ----------
  function ensureSaveBar(frame, pageName, config) {
    const host = pageHost(frame, config);
    let bar = frame.querySelector('#pp5AuSaveBar');
    if (bar && bar.dataset.page !== pageName) { bar.remove(); bar = null; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pp5AuSaveBar';
      bar.className = 'pp5-au-savebar';
      bar.dataset.page = pageName;
      bar.innerHTML = '<div class="pp5-au-status"><span class="pp5-au-dot" aria-hidden="true"></span><span class="pp5-au-status-text"></span></div>'
        + '<div class="pp5-au-actions">'
        + `<button type="button" class="pp5-au-btn pp5-au-pdf" data-proxy="${esc(pdfTarget(config) || '')}"><i class="bi bi-file-earmark-pdf" aria-hidden="true"></i><span>PDF</span></button>`
        + `<button type="button" class="pp5-au-btn pp5-au-save" data-proxy="${esc(config.saveTarget || 'saveBtn')}"><i class="bi bi-floppy-fill" aria-hidden="true"></i><span>${esc(config.saveLabel)}</span></button>`
        + '</div>';
      bar.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-proxy]');
        if (!btn || btn.disabled) return;
        const target = frame.querySelector(`#${btn.getAttribute('data-proxy')}`);
        if (target && !target.disabled) target.click();
      });
    }
    if (bar.parentNode !== host || host.lastElementChild !== bar) host.appendChild(bar);
    watchPlacement(bar, host);
    return bar;
  }

  // แถบเป็น position: fixed (sticky ไม่ติดล่างจอในโครงหน้าจริงของเว็บ) จึงต้องวางให้กว้างเท่าการ์ดหน้า
  // ยกขึ้นเหนือเมนูล่างจอของมือถือ และเว้นที่ท้ายหน้าไว้ ไม่ให้บังแถวสุดท้าย
  function placeBar(bar, host) {
    if (!bar.isConnected) return;
    if (bar.style.display === 'none') {
      if (host.style.paddingBottom) host.style.paddingBottom = '';
      return;
    }
    const box = host.getBoundingClientRect();
    const menu = document.querySelector('.mobile-quick-menu');
    const menuHeight = menu && getComputedStyle(menu).display !== 'none' ? menu.getBoundingClientRect().height : 0;
    const gap = 12;
    const set = (el, name, value) => { if (el.style[name] !== value) el.style[name] = value; };
    set(bar, 'left', `${Math.round(Math.max(box.left, 0) + gap)}px`);
    set(bar, 'width', `${Math.round(Math.max(Math.min(box.width, window.innerWidth) - gap * 2, 200))}px`);
    set(bar, 'bottom', `${Math.round(menuHeight + gap)}px`);
    set(host, 'paddingBottom', `${Math.round(bar.offsetHeight + gap * 3)}px`);
  }

  function watchPlacement(bar, host) {
    if (bar.__pp5AuPlaced) return;
    const update = () => {
      if (!bar.isConnected) { cleanup(); return; }
      placeBar(bar, host);
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    function cleanup() {
      window.removeEventListener('resize', update);
      if (observer) observer.disconnect();
    }
    window.addEventListener('resize', update);
    if (observer) observer.observe(host);
    bar.__pp5AuPlaced = update;
  }

  // ปุ่ม PDF ของแถบกดปุ่มไหนของหน้า (ค่าเริ่มต้น #exportBtn, null = หน้านี้ไม่มี PDF ในแถบ)
  function pdfTarget(config) {
    return config.pdfTarget === undefined ? 'exportBtn' : config.pdfTarget;
  }

  function pageHost(frame, config) {
    return (config.host && frame.querySelector(config.host)) || frame.querySelector('.rtw-page') || frame;
  }

  function syncProxy(frame, bar, id, idleLabel, kind) {
    const btn = bar.querySelector(`button.pp5-au-${kind}`);
    const target = id ? frame.querySelector(`#${id}`) : null;
    if (!btn) return;
    setShown(btn, !!target);
    if (!target) return;
    // หน้าเดิมเปิด/ปิดปุ่มด้วย .disabled อย่างเดียว (ไม่มีการเปลี่ยนแถว) จึงต้องคอยดูปุ่มเดิมโดยตรง
    if (!target.__pp5AuWatch && typeof MutationObserver === 'function') {
      target.__pp5AuWatch = new MutationObserver(() => syncProxy(frame, bar, id, idleLabel, kind));
      target.__pp5AuWatch.observe(target, { attributes: true, attributeFilter: ['disabled'] });
    }
    if (btn.disabled !== !!target.disabled) btn.disabled = !!target.disabled;
    // ระหว่างบันทึก หน้าเดิมเปลี่ยนข้อความปุ่ม (กำลังบันทึก / บันทึกสำเร็จ) ให้แถบแสดงตาม
    const busyText = target.textContent.replace(/\s+/g, ' ').trim();
    const label = /กำลัง|สำเร็จ|ผิดพลาด|ไม่สำเร็จ/.test(busyText) ? busyText : idleLabel;
    setText(btn.querySelector('span'), label);
  }

  // ---------- จุดเรียกหลัก ----------
  function decorate(frame, pageName) {
    const config = PAGES[pageName];
    if (!frame || !config) return;
    if (filterPage !== pageName) { filterPage = pageName; filterMode = 'all'; }
    if (config.setup) config.setup(frame, pageName);
    const allRows = studentRows(frame);
    allRows.forEach((row) => {
      decorateIdentity(row, config);
      if (config.enhanceRow) config.enhanceRow(row);
    });
    markNameHeaders(allRows, config);
    // แถวที่นับและกรอง: ปกติทุกแถว  หน้าที่มีหลายแท็บนับเฉพาะแท็บที่เปิด (คนละ 1 แถว)
    const rows = config.rows ? config.rows(frame) : allRows;
    const host = pageHost(frame, config);
    if (host !== frame && !host.classList.contains('rtw-page') && !host.classList.contains('pp5-au-scope')) host.classList.add('pp5-au-scope');

    const tbody = rows[0]?.parentElement;
    const anchor = config.summaryAnchor
      ? (rows.length ? config.summaryAnchor(frame) : null)
      : (tbody ? (tbody.closest('.rtw-table-wrap') || tbody.closest('table')) : null);
    const summary = anchor ? ensureSummary(frame, anchor, pageName) : frame.querySelector('#pp5AuSummary');
    const bar = ensureSaveBar(frame, pageName, config);
    const { counts, states } = summarize(rows, config);

    if (summary) {
      setShown(summary, rows.length > 0);
      CARDS.forEach((card) => {
        const btn = summary.querySelector(`button[data-filter="${card.mode}"]`);
        setText(btn?.querySelector('.pp5-au-card-num'), String(counts[card.mode]));
        setAttr(btn, 'aria-pressed', filterMode === card.mode ? 'true' : 'false');
      });
    }
    rows.forEach((row, index) => {
      const state = states[index];
      setShown(row, filterMode === 'all' || !!state[filterMode]);
    });

    setShown(bar, rows.length > 0);
    bar.classList.toggle('is-complete', rows.length > 0 && counts.done === rows.length);
    const status = counts.done === rows.length
      ? `ประเมินครบทั้ง ${rows.length} คน พร้อมบันทึก`
      : `ประเมินครบ ${counts.done}/${rows.length} คน · เหลือ ${counts.todo} คน`;
    setText(bar.querySelector('.pp5-au-status-text'), status);
    syncProxy(frame, bar, config.saveTarget || 'saveBtn', config.saveLabel, 'save');
    syncProxy(frame, bar, pdfTarget(config), 'PDF', 'pdf');
    if (config.afterDecorate) config.afterDecorate(frame);
    if (bar.__pp5AuPlaced) bar.__pp5AuPlaced();
  }

  wrapLoaders(global.GasServer);
  global.PP5AssessmentUI = { handles, decorate, photoSrc, remember, wrapLoaders, PAGES, activityOverall, applyActivityOverall };
})(window);
