(function (global) {
  'use strict';
  global.PP5GrowthExport = {
    enhance(frame) {
      if (!frame || frame.querySelector('#sgPdfPanel')) return;
      const anchor = frame.querySelector('.growth-report > .gr-band');
      if (!anchor) return;
      let autoLoadTimer;
      frame.addEventListener('change', event => {
        if (!['grGrade', 'grClass'].includes(event.target.id)) return;
        clearTimeout(autoLoadTimer);
        autoLoadTimer = setTimeout(() => {
          if (frame.isConnected && frame.querySelector('.growth-report')) global.SGReport?.load();
        }, 350);
      });
      const panel = document.createElement('div');
      panel.id = 'sgPdfPanel'; panel.className = 'gr-band';
      panel.innerHTML = `<strong>ดาวน์โหลด PDF / แบบกรอกบนกระดาษ</strong>
        <div class="gr-muted">ใช้ชั้น/ห้อง ปีการศึกษา เดือนและรอบจากตัวกรองด้านบน เลือกทั้งปีหรือทุกรอบเพื่อดาวน์โหลดรายงานรวมได้</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-top:10px">
          <label class="gr-field">รูปแบบ<select id="sgPdfMode"><option value="saved">น้ำหนัก–ส่วนสูงที่บันทึกแล้ว</option><option value="blank">แบบชั่งวัดเปล่า</option><option value="custom">ตารางเอนกประสงค์</option></select></label>
          <label class="gr-field">ภาคเรียน<select id="sgPdfTerm"><option value="1">1</option><option value="2">2</option></select></label>
          <button type="button" class="gr-btn" id="sgPdfBtn">ดาวน์โหลด PDF</button>
        </div>
        <div id="sgPdfCustom" hidden style="margin-top:10px">
          <label class="gr-field">ชื่อเอกสาร<input id="sgPdfTitle" maxlength="80" value="ตารางบันทึกเอนกประสงค์"></label>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">${[1,2,3].map(i => `<label class="gr-field">หัวคอลัมน์ ${i}<input id="sgPdfLabel${i}" maxlength="25" value="${i === 3 ? 'หมายเหตุ' : 'รายการ ' + i}"></label>`).join('')}</div>
        </div>
        <div id="sgPdfStatus" role="status" style="margin-top:8px"></div>
        <a id="sgPdfLink" hidden>เปิด / ดาวน์โหลด PDF อีกครั้ง</a>`;
      anchor.after(panel);
      const get = id => panel.querySelector('#' + id);
      const period = frame.querySelector('#grPeriod');
      const syncTerm = () => { if (period?.value === 'term1' || period?.value === 'term2') get('sgPdfTerm').value = period.value === 'term2' ? '2' : '1'; };
      syncTerm(); period?.addEventListener('change', syncTerm);
      get('sgPdfMode').addEventListener('change', () => { get('sgPdfCustom').hidden = get('sgPdfMode').value !== 'custom'; });
      let previousUrl;
      get('sgPdfBtn').addEventListener('click', async () => {
        const button = get('sgPdfBtn'), status = get('sgPdfStatus'), link = get('sgPdfLink');
        const value = id => frame.querySelector('#' + id)?.value || '';
        if (!value('grGrade') || !value('grClass')) { status.textContent = 'กรุณาเลือกชั้นและห้องจากตัวกรองด้านบนก่อน'; return; }
        button.disabled = true; link.hidden = true; status.textContent = 'กำลังสร้าง PDF...';
        try {
          const filters = {
            grade: value('grGrade'), classNo: value('grClass'), academicYear: value('grYear'),
            month: value('grMonth'), roundNo: value('grRound'), semester: get('sgPdfTerm').value,
            mode: get('sgPdfMode').value, title: get('sgPdfTitle').value,
            labels: [1,2,3].map(i => get('sgPdfLabel' + i).value.trim() || 'รายการ ' + i)
          };
          const result = await global.GasServer.exportStudentGrowthSheetPdf({ ...filters, period: value('grPeriod') || 'year' });
          if (!result?.success || !result.url) throw new Error(result?.message || 'สร้าง PDF ไม่สำเร็จ');
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          previousUrl = result.url; link.href = result.url; link.download = result.fileName;
          link.target = '_blank'; link.rel = 'noopener'; link.hidden = false; link.click();
          status.textContent = 'สร้าง PDF เรียบร้อยแล้ว หากยังไม่ดาวน์โหลด ให้กดลิงก์ด้านล่าง';
        } catch (error) { status.textContent = error.message || String(error); }
        finally { button.disabled = false; }
      });
    }
  };
})(window);
