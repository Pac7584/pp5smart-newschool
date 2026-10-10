(function(global) {
  'use strict';
  const PREFIX = 'pp5_score_draft_v2:';
  const installedContainers = new WeakSet();
  const storage = () => global.localStorage;

  function key(context, term) {
    const user = storage()?.getItem('username') || '';
    const values = [user, context?.academicYear, context?.grade, context?.classNo, context?.subjectCode, term];
    if (values.some(value => value == null || String(value).trim() === '') || !['term1', 'term2'].includes(term)) return null;
    return PREFIX + values.map(value => encodeURIComponent(String(value))).join(':');
  }

  function read(context, term) {
    const k = key(context, term);
    if (!k) return null;
    try { return JSON.parse(storage()?.getItem(k) || 'null'); } catch (_) { return null; }
  }

  function save(context, term, rows, fullScores) {
    const k = key(context, term);
    if (!k) return false;
    try {
      storage()?.setItem(k, JSON.stringify({ version: 2, savedAt: Date.now(), rows, fullScores }));
      return true;
    } catch (_) { return false; }
  }

  function capture(context, term) {
    try {
      const k = key(context, term);
      const serial = k ? storage()?.getItem(k) : null;
      return k && serial ? { key: k, serial } : null;
    } catch (_) { return null; }
  }

  function clear(context, term) {
    const k = typeof context === 'string' ? context : key(context, term);
    try {
      if (k) storage()?.removeItem(k);
      if (typeof global.document !== 'undefined' && typeof global.document.querySelectorAll === 'function') {
        const bars = global.document.querySelectorAll('[data-score-draft-bar]');
        bars.forEach(bar => {
          if (!k || bar.dataset.draftKey === k) bar.remove();
        });
      }
      return true;
    } catch (_) { return false; }
  }

  function acknowledge(snapshot) {
    try {
      if (snapshot && snapshot.key) {
        storage()?.removeItem(snapshot.key);
      }
      if (typeof global.document !== 'undefined' && typeof global.document.querySelectorAll === 'function') {
        const bars = global.document.querySelectorAll('[data-score-draft-bar]');
        bars.forEach(bar => {
          if (!snapshot || !snapshot.key || bar.dataset.draftKey === snapshot.key) {
            bar.remove();
          }
        });
      }
      return true;
    } catch (_) { return false; }
  }

  function hasDifferences(draft, currentRows, getInputs, currentFullScores) {
    if (!draft || !draft.rows || !currentRows.length) return false;
    if (draft.fullScores && Array.isArray(currentFullScores)) {
      if (currentFullScores.some((val, idx) => String(val ?? '').trim() !== String(draft.fullScores[idx] ?? '').trim())) {
        return true;
      }
    }
    if (draft.rows.length !== currentRows.length) return true;
    for (let i = 0; i < currentRows.length; i++) {
      const row = currentRows[i];
      const draftRow = draft.rows[i];
      if (!draftRow || String(row.dataset.studentId) !== String(draftRow.sid)) return true;
      const currentVals = getInputs(row).map(inp => String(inp.value ?? '').trim());
      const draftVals = (draftRow.scores || []).map(val => String(val ?? '').trim());
      if (currentVals.length !== draftVals.length) return true;
      for (let j = 0; j < currentVals.length; j++) {
        if (currentVals[j] !== draftVals[j]) return true;
      }
    }
    return false;
  }

  function install(frame, system) {
    if (!frame) return;
    function context() {
      const ctx = system?.getCurrentData?.()?.context;
      if (!ctx) return null;
      const grade = frame.querySelector('#scoreEntryGradeSelect')?.value;
      const classNo = frame.querySelector('#scoreEntryClassSelect')?.value;
      const raw = frame.querySelector('#scoreEntrySubjectSelect')?.value;
      let subject;
      try { subject = JSON.parse(raw); } catch (_) { return null; }
      if (String(grade) !== String(ctx.grade) || String(classNo) !== String(ctx.classNo)
        || String(subject.code || subject.id) !== String(ctx.subjectCode)) return null;
      return ctx;
    }

    for (const [term, containerId] of [['term1', 'scoreEntryTerm1Container'], ['term2', 'scoreEntryTerm2Container']]) {
      const container = frame.querySelector('#' + containerId);
      if (!container || installedContainers.has(container)) continue;
      installedContainers.add(container);
      const inputs = row => Array.from(row.querySelectorAll('.score-entry-input, .score-entry-final-input'));
      const rows = () => Array.from(container.querySelectorAll('tbody tr[data-student-id]'));
      const fullScores = () => Array.from(container.querySelectorAll('.score-entry-full-score')).map(input => input.value);
      const persist = () => {
        const ctx = context();
        if (!ctx || !rows().length) return;
        try {
          save(ctx, term, rows().map(row => ({ sid: row.dataset.studentId, scores: inputs(row).map(input => input.value) })), fullScores());
        } catch (_) {
          const status = frame.querySelector('#scoreEntryStatusMessage');
          if (status) status.textContent = 'เก็บฉบับร่างในเครื่องไม่ได้ กรุณาบันทึกคะแนนและตรวจผลก่อนออกจากหน้า';
        }
      };

      container.addEventListener('input', event => {
        if (event.target.matches('.score-entry-input, .score-entry-final-input, .score-entry-full-score')) persist();
      });

      const offerRestore = () => {
        const ctx = context();
        const tableRows = rows();
        if (!ctx || !tableRows.length) return;
        const draft = read(ctx, term);
        const k = key(ctx, term);
        const existing = container.querySelector('[data-score-draft-bar]');

        // If no draft in storage, remove any existing bar and return
        if (!draft?.rows?.length) {
          existing?.remove();
          return;
        }

        // If table content is already identical to draft (e.g. while actively typing), do not show warning bar
        if (!hasDifferences(draft, tableRows, inputs, fullScores())) {
          existing?.remove();
          return;
        }

        if (existing?.dataset.draftKey === k) return;
        existing?.remove();

        const bar = document.createElement('div');
        bar.dataset.scoreDraftBar = '1';
        bar.dataset.draftKey = k;
        bar.className = 'alert alert-warning d-flex gap-2 align-items-center flex-wrap py-2 px-3 my-2 rounded shadow-sm border-warning';
        bar.style.fontSize = '13px';

        const label = document.createElement('span');
        label.innerHTML = `<strong>พบฉบับร่างในเครื่องนี้:</strong> มีข้อมูลคะแนนที่ยังไม่ได้บันทึกลงระบบ (${term === 'term1' ? 'ภาคเรียนที่ 1' : 'ภาคเรียนที่ 2'} ปี ${ctx.academicYear})`;

        const btnGroup = document.createElement('div');
        btnGroup.className = 'd-flex gap-2 ms-auto align-items-center';

        const restore = document.createElement('button');
        restore.type = 'button';
        restore.className = 'btn btn-sm btn-primary py-0.5 px-2';
        restore.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i> กู้ฉบับร่าง';
        restore.addEventListener('click', () => {
          if (key(context(), term) !== k) return;
          const latest = read(ctx, term);
          if (!latest || !latest.rows || !latest.rows.length) {
            if (global.alert) global.alert('ไม่พบข้อมูลฉบับร่างในเครื่อง (อาจถูกบันทึกลงระบบไปแล้ว)');
            bar.remove();
            return;
          }
          const rowMap = new Map(rows().map(row => [String(row.dataset.studentId), row]));
          const compatible = latest && JSON.stringify(latest.fullScores) === JSON.stringify(fullScores())
            && latest.rows.length === rowMap.size
            && latest.rows.every(row => rowMap.has(String(row.sid)) && inputs(rowMap.get(String(row.sid))).length === row.scores.length);
          if (!compatible) {
            let reason = 'รายชื่อหรือคะแนนเต็มของตารางปัจจุบันไม่ตรงกับฉบับร่าง';
            if (JSON.stringify(latest.fullScores) !== JSON.stringify(fullScores())) {
              reason = 'คะแนนเต็มของแต่ละช่องในตารางไม่ตรงกับฉบับร่าง';
            } else if (latest.rows.length !== rowMap.size) {
              reason = `จำนวนนักเรียนในตาราง (${rowMap.size} คน) ไม่ตรงกับฉบับร่าง (${latest.rows.length} คน)`;
            }
            if (global.alert) global.alert(`ไม่สามารถกู้ฉบับร่างได้: ${reason}\nกรุณาตรวจสอบหรือกด "ละทิ้งฉบับร่าง"`);
            return;
          }
          if (!global.confirm('ต้องการนำคะแนนฉบับร่างกลับมาที่หน้าจอใช่หรือไม่?\n(ข้อมูลจะยังไม่ถูกบันทึกลงระบบ จนกว่าจะกดบันทึกคะแนน)')) return;
          latest.rows.forEach(row => inputs(rowMap.get(String(row.sid))).forEach((input, index) => {
            input.value = row.scores[index];
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }));
          bar.remove();
        });

        const discard = document.createElement('button');
        discard.type = 'button';
        discard.className = 'btn btn-sm btn-outline-secondary py-0.5 px-2';
        discard.innerHTML = '<i class="bi bi-trash"></i> ละทิ้งฉบับร่าง';
        discard.addEventListener('click', () => {
          if (global.confirm('ต้องการละทิ้งฉบับร่างนี้ใช่หรือไม่? ข้อมูลฉบับร่างในเครื่องนี้จะถูกลบออก')) {
            storage()?.removeItem(k);
            bar.remove();
          }
        });

        btnGroup.append(restore, discard);
        bar.append(label, btnGroup);
        container.prepend(bar);
      };

      const observer = new MutationObserver(offerRestore);
      observer.observe(container, { childList: true, subtree: true });
      const parentObserver = new MutationObserver(() => {
        if (!container.isConnected) {
          observer.disconnect();
          parentObserver.disconnect();
        }
      });
      if (global.document?.documentElement) parentObserver.observe(global.document.documentElement, { childList: true, subtree: true });
      offerRestore();
    }
  }

  global.PP5ScoreDrafts = { key, read, save, capture, clear, acknowledge, install };
})(window);
