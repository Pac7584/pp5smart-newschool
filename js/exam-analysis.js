// วิเคราะห์ผลสอบ (exam_analysis) — read-only report page.
//   • เทียบห้อง: average score per subject per room + grade distribution
//   • ค่าเฉลี่ยรายครั้ง: average % of full score for ครั้งที่ 1-9 (the system stores score rounds,
//     not indicator codes, so rounds are what can be analysed honestly)
//   • เทียบปี: the same grade/term across the academic years the school has
// Numbers come from GasServer.getExamAnalysis, which applies the same rules as
// "สรุปผลการเรียนรายชั้น". Nothing on this page writes data.
(function (global) {
  'use strict';

  const ROOM_COLORS = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#76b7b2', '#edc948', '#b07aa1', '#9c755f'];
  const GRADE_KEYS = ['4', '3.5', '3', '2.5', '2', '1.5', '1', '0'];
  const GRADE_COLORS = ['#1a9850', '#66bd63', '#a6d96a', '#d9ef8b', '#fee08b', '#fdae61', '#f46d43', '#d73027'];
  const TERM_LABEL = { 1: 'ภาคเรียนที่ 1', 2: 'ภาคเรียนที่ 2', year: 'ทั้งปี (เฉลี่ย 2 ภาค)' };
  const MAX_COMPARE_YEARS = 5;

  const txt = (value) => (value === null || value === undefined ? '' : String(value));
  const esc = (value) => txt(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (value, digits = 1) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? '-' : Number(value).toFixed(digits));
  const passRate = (stats) => (stats && stats.count ? ((stats.count - (stats.grades?.['0'] || 0)) / stats.count) * 100 : null);
  const roomColor = (index) => ROOM_COLORS[index % ROOM_COLORS.length];

  // Cell tint for an average score: red under 50, amber 50-69, green 70+.
  function scoreTone(value) {
    if (value === null || value === undefined) return '';
    if (value < 50) return 'pp5ea-bad';
    if (value < 70) return 'pp5ea-mid';
    return 'pp5ea-good';
  }

  function injectStyles() {
    if (document.getElementById('pp5ExamAnalysisStyles')) return;
    const style = document.createElement('style');
    style.id = 'pp5ExamAnalysisStyles';
    style.textContent = `
.pp5ea{max-width:1200px;margin:0 auto;padding:4px 0 32px}
.pp5ea-head{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.pp5ea-head i{font-size:1.6rem;color:#4e79a7}
.pp5ea-head h4{margin:0;font-weight:700}
.pp5ea-card{background:#fff;border-radius:16px;box-shadow:0 4px 18px rgba(30,27,58,.06);padding:18px;margin-bottom:16px}
.pp5ea-card h5{font-size:1.05rem;font-weight:700;margin:0 0 4px}
.pp5ea-note{font-size:.85rem;color:#64748b;margin:0 0 12px}
.pp5ea-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;align-items:end}
.pp5ea-filters label{font-size:.85rem;font-weight:600;color:#475569;margin-bottom:4px;display:block}
.pp5ea-chart{position:relative;height:320px}
.pp5ea-table{font-size:.9rem}
.pp5ea-table th,.pp5ea-table td{text-align:center;vertical-align:middle;white-space:nowrap}
.pp5ea-table td.pp5ea-subject,.pp5ea-table th.pp5ea-subject{text-align:left;white-space:normal;min-width:150px}
.pp5ea-table td.pp5ea-good{--bs-table-bg:#e8f5e9;background:#e8f5e9}
.pp5ea-table td.pp5ea-mid{--bs-table-bg:#fff8e1;background:#fff8e1}
.pp5ea-table td.pp5ea-bad{--bs-table-bg:#fdecea;--bs-table-color:#b71c1c;background:#fdecea;color:#b71c1c;font-weight:600}
.pp5ea-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px}
.pp5ea-kpi{background:#fff;border-radius:14px;padding:14px;box-shadow:0 4px 18px rgba(30,27,58,.06)}
.pp5ea-kpi b{display:block;font-size:1.5rem;color:#1e293b}
.pp5ea-kpi span{font-size:.82rem;color:#64748b}
.pp5ea-status{padding:14px;border-radius:12px;background:#f1f5f9;color:#475569}
.pp5ea-status.err{background:#fdecea;color:#b71c1c}
@media (max-width:576px){.pp5ea-chart{height:260px}.pp5ea-card{padding:14px}}
`;
    document.head.appendChild(style);
  }

  const PAGE_HTML = `
<div class="pp5ea" id="pp5ExamAnalysisRoot"></div>
<script>window.PP5ExamAnalysis && window.PP5ExamAnalysis.mountPage(document.getElementById('pp5ExamAnalysisRoot'));<\/script>`;

  function server() {
    if (!global.GasServer?.getExamAnalysis) throw new Error('ระบบยังโหลดไม่เสร็จ กรุณาโหลดหน้าเว็บใหม่');
    return global.GasServer;
  }

  // ───────────────────────── data shaping (pure, exposed for tests) ─────────────────────────
  function subjectRows(result) {
    return (result?.subjects || []).filter((subject) => subject.overall && subject.overall.count > 0);
  }

  function summaryAoa(result) {
    const rooms = result.rooms || [];
    const header = ['รายวิชา', ...rooms.map((room) => `ห้อง ${room}`), 'เฉลี่ยทั้งชั้น', 'จำนวนนักเรียน', 'ร้อยละผ่าน (เกรด 1 ขึ้นไป)'];
    const rows = subjectRows(result).map((subject) => [
      subject.name,
      ...rooms.map((room) => (subject.byRoom?.[room]?.count ? Number(fmt(subject.byRoom[room].mean, 2)) : '')),
      Number(fmt(subject.overall.mean, 2)),
      subject.overall.count,
      Number(fmt(passRate(subject.overall), 1))
    ]);
    return [header, ...rows];
  }

  function yearComparison(resultsByYear) {
    const years = Object.keys(resultsByYear).sort();
    const names = [];
    years.forEach((year) => subjectRows(resultsByYear[year]).forEach((subject) => { if (!names.includes(subject.name)) names.push(subject.name); }));
    return {
      years,
      subjects: names,
      means: years.map((year) => names.map((name) => {
        const subject = subjectRows(resultsByYear[year]).find((item) => item.name === name);
        return subject ? subject.overall.mean : null;
      }))
    };
  }

  // ───────────────────────── page ─────────────────────────
  function mountPage(root) {
    if (!root) return;
    injectStyles();
    const state = { result: null, charts: [], loading: false };
    root.innerHTML = `
      <div class="pp5ea-head"><i class="bi bi-graph-up-arrow"></i><div><h4>วิเคราะห์ผลสอบ</h4>
        <div class="pp5ea-note mb-0">เทียบห้อง เทียบปี และค่าเฉลี่ยรายครั้งของคะแนนเก็บ — หน้านี้อ่านข้อมูลอย่างเดียว ไม่แก้ไขคะแนน</div></div></div>
      <div class="pp5ea-card">
        <div class="pp5ea-filters">
          <div><label for="pp5eaYear">ปีการศึกษา</label><select id="pp5eaYear" class="form-select"></select></div>
          <div><label for="pp5eaGrade">ระดับชั้น</label><select id="pp5eaGrade" class="form-select"></select></div>
          <div><label for="pp5eaTerm">ภาคเรียน</label><select id="pp5eaTerm" class="form-select">
            <option value="1">ภาคเรียนที่ 1</option><option value="2">ภาคเรียนที่ 2</option><option value="year">ทั้งปี (เฉลี่ย 2 ภาค)</option></select></div>
          <div><button type="button" id="pp5eaRun" class="btn btn-primary w-100"><i class="bi bi-bar-chart-line me-1"></i>วิเคราะห์</button></div>
        </div>
      </div>
      <div id="pp5eaStatus" class="pp5ea-status" aria-live="polite">กำลังโหลดตัวเลือก...</div>
      <div id="pp5eaResult" hidden>
        <div class="pp5ea-kpis" id="pp5eaKpis"></div>
        <div class="pp5ea-card">
          <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
            <div><h5>ค่าเฉลี่ยรายวิชา แยกตามห้อง</h5><p class="pp5ea-note">คะแนนเต็ม 100 · สีแดง = ต่ำกว่า 50 · สีเหลือง = 50–69 · สีเขียว = 70 ขึ้นไป</p></div>
            <button type="button" id="pp5eaExcel" class="btn btn-outline-success btn-sm"><i class="bi bi-file-earmark-excel me-1"></i>ดาวน์โหลด Excel</button>
          </div>
          <div class="table-responsive"><table class="table table-sm table-bordered pp5ea-table mb-0" id="pp5eaTable"></table></div>
        </div>
        <div class="pp5ea-card">
          <h5>เทียบห้อง</h5><p class="pp5ea-note">ค่าเฉลี่ยคะแนนรวมของแต่ละวิชา แยกสีตามห้อง</p>
          <div class="pp5ea-chart"><canvas id="pp5eaRoomChart"></canvas></div>
        </div>
        <div class="pp5ea-card">
          <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-2">
            <div><h5>รายละเอียดรายวิชา</h5><p class="pp5ea-note mb-0">การกระจายเกรด และค่าเฉลี่ยคะแนนเก็บรายครั้ง (ร้อยละของคะแนนเต็มครั้งนั้น)</p></div>
            <div style="min-width:220px"><label for="pp5eaSubject" class="form-label small fw-semibold mb-1">รายวิชา</label><select id="pp5eaSubject" class="form-select form-select-sm"></select></div>
          </div>
          <div class="row g-3">
            <div class="col-lg-6"><div class="pp5ea-chart"><canvas id="pp5eaGradeChart"></canvas></div></div>
            <div class="col-lg-6"><div class="pp5ea-chart"><canvas id="pp5eaRoundChart"></canvas></div></div>
          </div>
          <div id="pp5eaRoundNote" class="pp5ea-note mt-2 mb-0"></div>
        </div>
        <div class="pp5ea-card">
          <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
            <div><h5>เทียบปีการศึกษา</h5><p class="pp5ea-note">ค่าเฉลี่ยทั้งชั้นของวิชาเดียวกัน ในชั้นและภาคเรียนเดียวกัน ย้อนหลังสูงสุด ${MAX_COMPARE_YEARS} ปี</p></div>
            <button type="button" id="pp5eaYears" class="btn btn-outline-primary btn-sm"><i class="bi bi-calendar3 me-1"></i>เทียบกับปีอื่น</button>
          </div>
          <div id="pp5eaYearStatus" class="pp5ea-note"></div>
          <div class="pp5ea-chart" id="pp5eaYearWrap" hidden><canvas id="pp5eaYearChart"></canvas></div>
        </div>
      </div>`;

    const $ = (id) => root.querySelector('#' + id);
    const status = (message, isError) => {
      const box = $('pp5eaStatus');
      box.hidden = !message;
      box.textContent = message || '';
      box.classList.toggle('err', !!isError);
    };
    const chartLib = () => global.Chart;
    const destroy = (key) => {
      state.charts = state.charts.filter((entry) => {
        if (key && entry.key !== key) return true;
        try { entry.chart.destroy(); } catch (_) { /* already gone */ }
        return false;
      });
    };
    const draw = (key, canvasId, config) => {
      destroy(key);
      const Chart = chartLib();
      const canvas = $(canvasId);
      if (!Chart || !canvas) return;
      config.options = Object.assign({ responsive: true, maintainAspectRatio: false }, config.options || {});
      state.charts.push({ key, chart: new Chart(canvas.getContext('2d'), config) });
    };

    function renderTable(result) {
      const rooms = result.rooms || [];
      const subjects = subjectRows(result);
      const head = `<thead class="table-light"><tr><th class="pp5ea-subject">รายวิชา</th>${rooms.map((room) => `<th>ห้อง ${esc(room)}</th>`).join('')}<th>ทั้งชั้น</th><th>ร้อยละผ่าน</th></tr></thead>`;
      const body = subjects.map((subject) => `<tr><td class="pp5ea-subject">${esc(subject.name)}</td>${rooms.map((room) => {
        const stats = subject.byRoom?.[room];
        return stats?.count ? `<td class="${scoreTone(stats.mean)}" title="${stats.count} คน">${fmt(stats.mean)}</td>` : '<td class="text-muted">-</td>';
      }).join('')}<td class="${scoreTone(subject.overall.mean)} fw-semibold">${fmt(subject.overall.mean)}</td><td>${fmt(passRate(subject.overall))}%</td></tr>`).join('');
      $('pp5eaTable').innerHTML = head + `<tbody>${body}</tbody>`;
    }

    function renderKpis(result) {
      const subjects = subjectRows(result);
      const all = subjects.map((subject) => subject.overall.mean).filter((value) => value !== null);
      const mean = all.length ? all.reduce((sum, value) => sum + value, 0) / all.length : null;
      const fails = subjects.reduce((sum, subject) => sum + (subject.overall.grades?.['0'] || 0), 0);
      const weakest = subjects.slice().sort((left, right) => left.overall.mean - right.overall.mean)[0];
      $('pp5eaKpis').innerHTML = [
        [result.studentCount, `นักเรียน ${result.rooms.length} ห้อง`],
        [subjects.length, 'วิชาที่มีคะแนน'],
        [fmt(mean), 'ค่าเฉลี่ยทุกวิชา'],
        [fails, 'ผลการเรียน 0 (รวมทุกวิชา)'],
        [weakest ? esc(weakest.name) : '-', 'วิชาที่ค่าเฉลี่ยต่ำสุด']
      ].map(([value, label]) => `<div class="pp5ea-kpi"><b>${value}</b><span>${label}</span></div>`).join('');
    }

    function renderRoomChart(result) {
      const subjects = subjectRows(result);
      draw('room', 'pp5eaRoomChart', {
        type: 'bar',
        data: {
          labels: subjects.map((subject) => subject.name),
          datasets: result.rooms.map((room, index) => ({
            label: `ห้อง ${room}`,
            backgroundColor: roomColor(index),
            data: subjects.map((subject) => (subject.byRoom?.[room]?.count ? subject.byRoom[room].mean : null))
          }))
        },
        options: { scales: { y: { min: 0, max: 100, title: { display: true, text: 'คะแนนเฉลี่ย' } } } }
      });
    }

    function renderSubjectDetail(result) {
      const subject = subjectRows(result).find((item) => item.id === $('pp5eaSubject').value);
      if (!subject) { destroy('grade'); destroy('round'); $('pp5eaRoundNote').textContent = ''; return; }
      draw('grade', 'pp5eaGradeChart', {
        type: 'bar',
        data: {
          labels: result.rooms.map((room) => `ห้อง ${room}`).concat('ทั้งชั้น'),
          datasets: GRADE_KEYS.map((key, index) => ({
            label: `เกรด ${key}`,
            backgroundColor: GRADE_COLORS[index],
            data: result.rooms.map((room) => subject.byRoom?.[room]?.grades?.[key] || 0).concat(subject.overall.grades?.[key] || 0)
          }))
        },
        options: {
          plugins: { title: { display: true, text: `การกระจายเกรด — ${subject.name}` } },
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'จำนวนนักเรียน' } } }
        }
      });
      const rounds = (subject.rounds || []).filter((round) => round.count > 0);
      if (!rounds.length) {
        destroy('round');
        $('pp5eaRoundNote').textContent = 'วิชานี้ยังไม่มีคะแนนเก็บรายครั้ง หรือยังไม่ได้ตั้งคะแนนเต็มของแต่ละครั้งในหน้าจัดการรายวิชา';
        return;
      }
      draw('round', 'pp5eaRoundChart', {
        type: 'bar',
        data: {
          labels: rounds.map((round) => `ครั้งที่ ${round.round} (เต็ม ${round.full})`),
          datasets: result.rooms.map((room, index) => ({
            label: `ห้อง ${room}`,
            backgroundColor: roomColor(index),
            data: rounds.map((round) => round.byRoom?.[room]?.percent ?? null)
          })).concat([{ type: 'line', label: 'ทั้งชั้น', borderColor: '#334155', backgroundColor: '#334155', data: rounds.map((round) => round.percent) }])
        },
        options: {
          plugins: { title: { display: true, text: `ค่าเฉลี่ยคะแนนเก็บรายครั้ง — ${subject.name}` } },
          scales: { y: { min: 0, max: 100, title: { display: true, text: 'ร้อยละของคะแนนเต็ม' } } }
        }
      });
      const weakest = rounds.slice().sort((left, right) => left.percent - right.percent)[0];
      $('pp5eaRoundNote').textContent = `ครั้งที่นักเรียนทำได้น้อยที่สุด: ครั้งที่ ${weakest.round} (เฉลี่ย ${fmt(weakest.percent)}% ของคะแนนเต็ม) — ใช้ประกอบการวางแผนสอนซ่อมเสริม`;
    }

    function renderResult(result) {
      state.result = result;
      const subjects = subjectRows(result);
      if (!subjects.length) {
        $('pp5eaResult').hidden = true;
        destroy();
        status(`ยังไม่มีคะแนนที่กรอกแล้วของชั้น ${result.grade} ปีการศึกษา ${result.academicYear} (${TERM_LABEL[result.term]})`);
        return;
      }
      status('');
      $('pp5eaResult').hidden = false;
      const keep = $('pp5eaSubject').value;
      $('pp5eaSubject').innerHTML = subjects.map((subject) => `<option value="${esc(subject.id)}">${esc(subject.name)}</option>`).join('');
      if (subjects.some((subject) => subject.id === keep)) $('pp5eaSubject').value = keep;
      renderKpis(result);
      renderTable(result);
      renderRoomChart(result);
      renderSubjectDetail(result);
      destroy('year');
      $('pp5eaYearWrap').hidden = true;
      $('pp5eaYearStatus').textContent = '';
      if (!chartLib()) status('โหลดไลบรารีกราฟไม่สำเร็จ แสดงเฉพาะตาราง — ตรวจการเชื่อมต่อแล้วโหลดหน้าใหม่', true);
    }

    const filters = () => ({ academicYear: $('pp5eaYear').value, grade: $('pp5eaGrade').value, semester: $('pp5eaTerm').value });

    async function run() {
      if (state.loading) return;
      const options = filters();
      if (!options.grade) { status('กรุณาเลือกระดับชั้น', true); return; }
      state.loading = true;
      $('pp5eaRun').disabled = true;
      status(`กำลังวิเคราะห์ชั้น ${options.grade} ปีการศึกษา ${options.academicYear}...`);
      try {
        renderResult(await server().getExamAnalysis(options));
      } catch (error) {
        $('pp5eaResult').hidden = true;
        status('วิเคราะห์ไม่สำเร็จ: ' + (error?.message || error), true);
      } finally {
        state.loading = false;
        $('pp5eaRun').disabled = false;
      }
    }

    async function compareYears() {
      if (!state.result) return;
      const years = [...$('pp5eaYear').options].map((option) => option.value).slice(0, MAX_COMPARE_YEARS);
      if (years.length < 2) {
        $('pp5eaYearStatus').textContent = 'ระบบมีข้อมูลเพียงปีการศึกษาเดียว — กราฟเทียบปีจะใช้ได้เมื่อมีข้อมูลปีถัดไป';
        return;
      }
      const button = $('pp5eaYears');
      button.disabled = true;
      $('pp5eaYearStatus').textContent = 'กำลังอ่านข้อมูลแต่ละปี...';
      try {
        const { grade, term } = state.result;
        const resultsByYear = {};
        for (const year of years) {
          resultsByYear[year] = await server().getExamAnalysis({ grade, academicYear: year, semester: term });
        }
        const comparison = yearComparison(resultsByYear);
        const withData = comparison.years.filter((year, index) => comparison.means[index].some((value) => value !== null));
        if (withData.length < 2) {
          $('pp5eaYearStatus').textContent = `มีคะแนนของชั้น ${grade} (${TERM_LABEL[term]}) เพียง ${withData.length} ปี — ยังเทียบไม่ได้`;
          return;
        }
        $('pp5eaYearStatus').textContent = `เทียบ ${withData.length} ปีการศึกษา: ${withData.join(', ')}`;
        $('pp5eaYearWrap').hidden = false;
        draw('year', 'pp5eaYearChart', {
          type: 'bar',
          data: {
            labels: comparison.subjects,
            datasets: comparison.years.map((year, index) => ({
              label: `ปี ${year}`, backgroundColor: roomColor(index), data: comparison.means[index]
            }))
          },
          options: { scales: { y: { min: 0, max: 100, title: { display: true, text: 'คะแนนเฉลี่ยทั้งชั้น' } } } }
        });
      } catch (error) {
        $('pp5eaYearStatus').textContent = 'อ่านข้อมูลปีอื่นไม่สำเร็จ: ' + (error?.message || error);
      } finally {
        button.disabled = false;
      }
    }

    function downloadExcel() {
      const result = state.result;
      if (!result) return;
      if (!global.XLSX?.utils) { status('โหลดไลบรารี Excel ไม่สำเร็จ กรุณาโหลดหน้าเว็บใหม่', true); return; }
      const book = global.XLSX.utils.book_new();
      global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet(summaryAoa(result)), 'ค่าเฉลี่ยรายวิชา');
      const term = result.term === 'year' ? 'ทั้งปี' : `ภาค${result.term}`;
      global.XLSX.writeFile(book, `วิเคราะห์ผลสอบ_${result.grade}_${result.academicYear}_${term}.xlsx`);
    }

    $('pp5eaRun').addEventListener('click', run);
    $('pp5eaSubject').addEventListener('change', () => state.result && renderSubjectDetail(state.result));
    $('pp5eaYears').addEventListener('click', compareYears);
    $('pp5eaExcel').addEventListener('click', downloadExcel);

    (async () => {
      try {
        const options = await server().getExamAnalysisOptions();
        $('pp5eaYear').innerHTML = options.years.map((year) => `<option value="${esc(year)}">${esc(year)}</option>`).join('');
        $('pp5eaYear').value = options.current;
        $('pp5eaGrade').innerHTML = '<option value="">— เลือกชั้น —</option>'
          + options.grades.map((grade) => `<option value="${esc(grade)}">${esc(grade)}</option>`).join('');
        const ownClass = txt(global.localStorage?.getItem?.('className')).trim();
        const ownMatch = ownClass.match(/([อปม])\.\s*([0-9]+)/);
        const savedGrade = options.grades.includes(ownClass) ? ownClass : (ownMatch ? `${ownMatch[1]}.${ownMatch[2]}` : '');
        if (options.grades.includes(savedGrade)) $('pp5eaGrade').value = savedGrade;
        status($('pp5eaGrade').value ? '' : 'เลือกระดับชั้นแล้วกด "วิเคราะห์"');
        if ($('pp5eaGrade').value) run();
      } catch (error) {
        status('โหลดตัวเลือกไม่สำเร็จ: ' + (error?.message || error), true);
      }
    })();
  }

  // ───────────────────────── home hub card ─────────────────────────
  function enhanceHomeHub(hubPage) {
    if (!hubPage) return;
    const role = txt(global.localStorage?.getItem?.('role')).toLowerCase();
    if (role !== 'admin' && role !== 'teacher') return;
    const grid = hubPage.querySelector('.hub-section[data-section="scores"] .hub-grid');
    if (!grid || grid.querySelector('[data-page="exam_analysis"]')) return;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'hub-card c-purple';
    card.setAttribute('data-page', 'exam_analysis');
    card.setAttribute('data-label', 'วิเคราะห์ผลสอบ');
    card.setAttribute('data-roles', 'admin,teacher');
    card.innerHTML = '<i class="bi bi-graph-up-arrow hub-card-icon"></i><span class="hub-card-label">วิเคราะห์ผลสอบ</span>';
    card.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); global.navigateTo?.('exam_analysis'); });
    grid.appendChild(card);
  }

  global.GAS_PAGES = global.GAS_PAGES || {};
  global.GAS_PAGES.exam_analysis = PAGE_HTML;
  global.PP5ExamAnalysis = { mountPage, enhanceHomeHub, _internal: { subjectRows, summaryAoa, yearComparison, passRate, scoreTone } };
})(window);
