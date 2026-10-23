// Direct PDF generation for official PP5 reports.
// Sarabun is bundled under the SIL Open Font License in assets/fonts/OFL.txt.
(function initPP5Pdf(global) {
  'use strict';

  const FONT_REGULAR_URL = 'assets/fonts/Sarabun-Regular.ttf';
  const FONT_BOLD_URL = 'assets/fonts/Sarabun-Bold.ttf';
  const SCHOOL_LOGO_FALLBACK_URL = 'assets/school-logo.png';
  let fontPromise;

  function text(value, fallback = '') {
    return value === null || value === undefined ? fallback : String(value);
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  function gradeForScore(value) {
    const calculateGrade = global.PP5Data?.helpers?.calculateGrade;
    if (typeof calculateGrade === 'function') return text(calculateGrade(value));
    const score = Math.round(number(value) + Number.EPSILON);
    if (score >= 80) return '4';
    if (score >= 75) return '3.5';
    if (score >= 70) return '3';
    if (score >= 65) return '2.5';
    if (score >= 60) return '2';
    if (score >= 55) return '1.5';
    if (score >= 50) return '1';
    return '0';
  }


  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  async function fetchBase64(url) {
    const response = await fetch(new URL(url, document.baseURI));
    if (!response.ok) throw new Error(`โหลดทรัพยากร PDF ไม่สำเร็จ: HTTP ${response.status}`);
    return arrayBufferToBase64(await response.arrayBuffer());
  }

  async function loadFonts() {
    if (!fontPromise) {
      fontPromise = Promise.all([fetchBase64(FONT_REGULAR_URL), fetchBase64(FONT_BOLD_URL)]);
    }
    return fontPromise;
  }

  async function installFonts(doc) {
    try {
      const [regular, bold] = await loadFonts();
      if (regular && bold) {
        doc.addFileToVFS('Sarabun-Regular.ttf', regular);
        doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
        doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'italic');
        doc.addFileToVFS('Sarabun-Bold.ttf', bold);
        doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');
        doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bolditalic');
        doc.setFont('Sarabun', 'normal');
        liftThaiToneMarks(doc);
      }
    } catch (error) {
      console.warn('โหลดฟอนต์ Sarabun TTF ไม่สำเร็จ (ใช้ฟอนต์มาตรฐานแทน):', error.message);
    }
  }

  function normalizeLogoSource(value) {
    const source = text(value).trim();
    if (!source) return '';
    if (/^(?:\.\/)?assets\/[A-Za-z0-9._/-]+$/i.test(source)) return source;
    if (/^https:\/\/lh3\.googleusercontent\.com\/d\/[^?=]+$/i.test(source)) return `${source}=s360`;
    if (/^(data:image\/|https?:\/\/|blob:)/i.test(source)) return source;
    if (/^[A-Za-z0-9+/=\s]+$/.test(source) && source.replace(/\s/g, '').length > 100) {
      return `data:image/png;base64,${source.replace(/\s/g, '')}`;
    }
    return '';
  }

  async function sourceToDataUrl(source) {
    const normalized = normalizeLogoSource(source);
    if (!normalized) return '';
    if (normalized.startsWith('data:image/')) return normalized;
    try {
      const response = await fetch(normalized, { mode: 'cors' });
      if (!response.ok) return '';
      const blob = await response.blob();
      const mimeType = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png';
      return `data:${mimeType};base64,${arrayBufferToBase64(await blob.arrayBuffer())}`;
    } catch (_error) {
      return '';
    }
  }

  async function rasterizeLogo(source) {
    const dataUrl = await sourceToDataUrl(source);
    if (!dataUrl) return '';
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const size = 360;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, size, size);
        const ratio = Math.min(size / image.naturalWidth, size / image.naturalHeight);
        const width = image.naturalWidth * ratio;
        const height = image.naturalHeight * ratio;
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = () => resolve('');
      image.src = dataUrl;
    });
  }

  async function loadOfficialLogo(source) {
    return await rasterizeLogo(source) || await rasterizeLogo(SCHOOL_LOGO_FALLBACK_URL);
  }

  function getJsPdf() {
    const jsPDF = global.jspdf?.jsPDF;
    if (!jsPDF) throw new Error('ไม่พบไลบรารีสร้าง PDF');
    return jsPDF;
  }

  function runAutoTable(doc, options) {
    if (typeof doc.autoTable === 'function') return doc.autoTable(options);
    if (typeof global.jspdfAutoTable?.autoTable === 'function') return global.jspdfAutoTable.autoTable(doc, options);
    throw new Error('ไม่พบไลบรารีสร้างตาราง PDF');
  }

  function tableDefaults(overrides = {}) {
    return {
      theme: 'grid',
      styles: {
        font: 'Sarabun', fontStyle: 'normal', fontSize: 9, cellPadding: 1.5,
        lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0],
        valign: 'middle', halign: 'center', overflow: 'linebreak'
      },
      headStyles: { font: 'Sarabun', fontStyle: 'bold', fillColor: [242, 242, 242], textColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      margin: { left: 10, right: 10, bottom: 12 },
      ...overrides
    };
  }

  function officialMeta(options) {
    const rawFooterNote = text(options.footerNote).trim();
    return {
      schoolName: text(options.schoolName || 'โรงเรียน'),
      affiliation: text(options.affiliation),
      schoolAddress: text(options.schoolAddress),
      schoolPhone: text(options.schoolPhone),
      footerNote: rawFooterNote === '-' ? '' : rawFooterNote,
      meta: text(options.meta),
      logo: options.logo,
      grade: text(options.grade),
      classNo: text(options.classNo),
      classTeacher: text(options.classTeacher),
      academicHead: text(options.academicHead),
      directorName: text(options.directorName),
      directorPosition: text(options.directorPosition || 'ผู้อำนวยการโรงเรียน'),
      academicYear: text(options.academicYear),
      growthMonthLabel: text(options.growthMonthLabel),
      teacherSignature: options.teacherSignature || options.teacher_signature || '',
      academicHeadSignature: options.academicHeadSignature || options.academic_head_signature || '',
      directorSignature: options.directorSignature || options.director_signature || '',
      schoolStamp: options.schoolStamp || options.school_stamp || '',
      // ภาคเรียนที่พิมพ์แยก ('1' | '2'): ระดับประถมตัดสินผลเป็นรายปี จึงใส่ลายน้ำ + หมายเหตุ (owner 2026-10-07)
      interimTerm: ['1', '2'].includes(text(options.interimTerm)) ? text(options.interimTerm) : '',
      // ข้อความลายน้ำที่โรงเรียนตั้งเอง (หน้าตั้งค่า) ว่าง = ข้อความเดิม INTERIM_WATERMARK
      interimText: text(options.interimWatermarkText).replace(/\s+/g, ' ').trim().slice(0, 60),
      includeSignatures: options.includeSignatures !== false
    };
  }

  async function createDocument(title, options, pageTitleSuffix = '') {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    drawHeader(doc, title, meta, logo, pageTitleSuffix);
    doc.setProperties({ title, subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    return { doc, meta, logo, startY: headerBottom(meta, logo, pageTitleSuffix) };
  }

  function headerBottom(meta, logo, pageTitleSuffix) {
    let y = logo ? 30 : 12;
    y += 5.5;
    if (meta.schoolName) y += 4.5;
    if (meta.affiliation) y += 3.5;
    if (meta.schoolAddress || meta.schoolPhone) y += 3.5;
    if (meta.meta || pageTitleSuffix) y += 4.5;
    return y + 3;
  }

  function drawHeader(doc, title, meta, logo, pageTitleSuffix = '', layout = {}) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentLeft = Number.isFinite(Number(layout.leftMargin)) ? Number(layout.leftMargin) : 10;
    const contentRight = Number.isFinite(Number(layout.rightMargin)) ? Number(layout.rightMargin) : 10;
    const contentCenter = (contentLeft + pageWidth - contentRight) / 2;
    let y = 8;
    if (logo) {
      doc.addImage(logo, 'PNG', contentCenter - 9, y, 18, 18, undefined, 'FAST');
      y += 22;
    }
    doc.setTextColor(0, 0, 0);
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(13.5);
    doc.text(title, contentCenter, y, { align: 'center' });
    y += 5.5;
    doc.setFontSize(11.5);
    doc.text(meta.schoolName, contentCenter, y, { align: 'center' });
    doc.setFont('Sarabun', 'normal');
    if (meta.affiliation) {
      y += 3.8;
      doc.setFontSize(8.5);
      doc.text(meta.affiliation, contentCenter, y, { align: 'center' });
    }
    const contactLine = [
      meta.schoolAddress,
      meta.schoolPhone ? 'โทร. ' + meta.schoolPhone : ''
    ].filter(Boolean).join('   ');
    if (contactLine) {
      y += 3.8;
      doc.setFontSize(8.5);
      doc.text(contactLine, contentCenter, y, { align: 'center' });
    }
    const metaLine = [meta.meta, pageTitleSuffix].filter(Boolean).join(' - ');
    if (metaLine) {
      y += 4.5;
      doc.setFontSize(9.5);
      doc.text(metaLine, contentCenter, y, { align: 'center' });
    }
    y += 3.5;
    doc.setLineWidth(0.35);
    doc.line(contentLeft, y, pageWidth - contentRight, y);
  }

  // ลายเซ็นที่อัปโหลดไว้ (หน้าตั้งค่า) วางเหนือเส้น "ลงชื่อ" — เคารพสวิตช์ "ใช้ลายเซ็น" (includeSignatures) เหมือนปก ปพ.5
  // owner 2026-10-23 "เมื่อเราตั้งใช้ลายเซ็นแล้ว ทำไมในใบผลการประเมินถึงไม่แสดงลายเซ็น"
  function drawSignatureImage(doc, meta, image, centerX, lineY, width = 30) {
    if (meta?.includeSignatures === false || !image) return;
    try { doc.addImage(image, 'PNG', centerX - width / 2, lineY - 8.5, width, 9.5); } catch (_) { /* รูปเสียไม่ทำให้เอกสารพัง */ }
  }
  function drawSchoolStamp(doc, meta, centerX, lineY, size = 17) {
    if (meta?.includeSignatures === false || !meta?.schoolStamp) return;
    try { doc.addImage(meta.schoolStamp, 'PNG', centerX - size / 2, lineY - size + 3, size, size); } catch (_) { /* ignore */ }
  }

  function addSignatures(doc, meta, startY) {
    let y = Math.max(number(startY, 230) + 14, 238);
    if (y > 262) {
      doc.addPage('a4', 'portrait');
      y = 45;
    }
    const pageWidth = doc.internal.pageSize.getWidth();
    const centers = [pageWidth * 0.2, pageWidth * 0.5, pageWidth * 0.8];
    const cells = [
      { role: `ครูประจำชั้น ${meta.grade}/${meta.classNo}`, name: meta.classTeacher, sig: meta.teacherSignature },
      { role: 'หัวหน้างานวิชาการ', name: meta.academicHead, sig: meta.academicHeadSignature },
      { role: meta.directorPosition, name: meta.directorName, sig: meta.directorSignature }
    ];
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8.5);
    cells.forEach((cell, index) => {
      const name = cell.name || '................................................';
      if (meta?.includeSignatures !== false && cell.sig) {
        try {
          doc.addImage(cell.sig, 'PNG', centers[index] - 13, y - 8.5, 26, 9.5);
        } catch (_) {}
      }
      doc.text('ลงชื่อ................................................', centers[index], y, { align: 'center' });
      doc.text(`(${name})`, centers[index], y + 6, { align: 'center' });
      doc.text(cell.role, centers[index], y + 12, { align: 'center' });
    });
  }

  const INTERIM_WATERMARK = 'ผลระหว่างปี — ตัดสินผลการเรียนเป็นรายปี';
  function interimNoteText(term) {
    return `หมายเหตุ: ระดับประถมศึกษาตัดสินผลการเรียนเป็นรายปี ผลภาคเรียนที่ ${term} เป็นผลระหว่างปี ยังไม่ใช่ผลการตัดสิน`;
  }

  // ลายน้ำ 2 แถว (ช่วงบนและช่วงล่าง ไม่ทับลายน้ำ "ฉบับร่าง" ที่อยู่กลางหน้า) + หมายเหตุท้ายทุกหน้า
  // หมายเหตุอยู่ซ้ายบนบรรทัดเดียวกับเลขหน้า (เลขหน้าอยู่ขวา) เพราะบางรายงานตารางลงไปถึงราว 10 มม. จากขอบล่าง
  function renderInterimMarks(doc, term, customText) {
    const mark = customText || INTERIM_WATERMARK;
    const pageCount = doc.internal.getNumberOfPages();
    const note = interimNoteText(term);
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();
      try {
        if (typeof doc.saveGraphicsState === 'function') doc.saveGraphicsState();
        if (typeof doc.setGState === 'function' && typeof doc.GState === 'function') doc.setGState(new doc.GState({ opacity: 0.12 }));
        doc.setFont('Sarabun', 'bold');
        doc.setFontSize(Math.min(24, width / 9));
        doc.setTextColor(150, 150, 150);
        const landscape = width > height;
        (landscape ? [0.45, 0.8] : [0.3, 0.74]).forEach((ratio) => {
          try {
            doc.text(mark, width / 2, height * ratio, { align: 'center', angle: landscape ? 12 : 10 });
          } catch (_) {
            doc.text(mark, width / 2, height * ratio, { align: 'center' });
          }
        });
        if (typeof doc.restoreGraphicsState === 'function') doc.restoreGraphicsState();
      } catch (_) {}
      doc.setFont('Sarabun', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(90, 90, 90);
      doc.text(note, 10, height - 5, { maxWidth: width - 50 });
      doc.setTextColor(0, 0, 0);
    }
  }

  function finish(doc, meta) {
    if (meta?.interimTerm) renderInterimMarks(doc, meta.interimTerm, meta.interimText);
    if (meta?.footerNote) {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setPage(pageCount);
      doc.setFont('Sarabun', 'normal');
      doc.setFontSize(8);
      doc.text(meta.footerNote, 16, doc.internal.pageSize.getHeight() - (meta.interimTerm ? 8.5 : 7), { maxWidth: doc.internal.pageSize.getWidth() - 26 });
    }
    return URL.createObjectURL(doc.output('blob'));
  }

  async function createSummary(title, rows, options) {
    const { doc, meta, startY } = await createDocument(title, options);
    const body = (rows || []).map((item, index) => {
      const present = number(item.present);
      const leave = number(item.leave);
      const absent = number(item.absent);
      const total = number(item.total, present + leave + absent);
      const percentage = total ? `${((present / total) * 100).toFixed(1)}%` : '0.0%';
      return [index + 1, text(item.studentId), text(item.name || '-'), present, leave, absent, total, percentage];
    });
    runAutoTable(doc, tableDefaults({
      startY,
      head: [['ลำดับ', 'รหัส', 'ชื่อ-นามสกุล', 'มา', 'ลา', 'ขาด', 'รวมวันเรียน', 'ร้อยละมาเรียน']],
      body,
      columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 18 }, 2: { halign: 'left', cellWidth: 58 } }
    }));
    addSignatures(doc, meta, doc.lastAutoTable?.finalY);
    return finish(doc, meta);
  }

  async function createStudent(detail, options) {
    const { doc, meta, startY } = await createDocument('รายงานการมาเรียนรายบุคคล', options);
    const summary = detail?.summary || {};
    const boxWidth = 43;
    const labels = [
      ['มา', number(summary.totalPresent)], ['ลา', number(summary.totalLeave)],
      ['ขาด', number(summary.totalAbsent)], ['ร้อยละมาเรียน', `${text(summary.percentage, '0.0')}%`]
    ];
    doc.setFontSize(9);
    labels.forEach((item, index) => {
      const x = 10 + index * (boxWidth + 3);
      doc.rect(x, startY, boxWidth, 14);
      doc.setFont('Sarabun', 'normal');
      doc.text(item[0], x + boxWidth / 2, startY + 5, { align: 'center' });
      doc.setFont('Sarabun', 'bold');
      doc.setFontSize(11);
      doc.text(text(item[1]), x + boxWidth / 2, startY + 11, { align: 'center' });
      doc.setFontSize(9);
    });
    const body = (detail?.monthlyData || []).map((item) => [
      `${text(item.monthName)} ${text(item.year)}`, number(item.present), number(item.leave),
      number(item.absent), number(item.total), `${text(item.percentage, '0.0')}%`
    ]);
    runAutoTable(doc, tableDefaults({
      startY: startY + 19,
      head: [['เดือน', 'มา', 'ลา', 'ขาด', 'รวมวันเรียน', 'ร้อยละ']],
      body,
      columnStyles: { 0: { halign: 'left', cellWidth: 60 } }
    }));
    addSignatures(doc, meta, doc.lastAutoTable?.finalY);
    return finish(doc, meta);
  }

  // สรุปวันมาเรียนแต่ละเดือน: เลือกตัวอักษรใหญ่ที่สุดที่ตารางยังกว้างไม่เกินหน้า A4 (190 มม.) และไม่เกินความสูงหน้าแรก
  // วัดจากข้อความจริง (ชื่อยาวสุด หัวคอลัมน์ ตัวเลข) แทนความกว้างตายตัว — เดิม 5.4pt เล็กจนอ่านไม่ออก (owner 2026-10-18)
  function fitMatrixColumns(doc, head, body, startY) {
    const tableWidth = 190;
    const rowsHeight = 248 - startY; // ตารางจบไม่เกิน 248 มม. ช่องลงชื่อจึงอยู่หน้าเดียวกัน (addSignatures)
    const measure = (value, style) => {
      doc.setFont('Sarabun', style);
      return Math.max(...String(value).split('\n').map((line) => doc.getTextWidth(line)));
    };
    let best = null;
    for (let fontSize = 11; fontSize >= 5; fontSize -= 0.25) {
      const padding = { top: fontSize * 0.14, bottom: fontSize * 0.14, left: 0.7, right: 0.7 };
      doc.setFontSize(fontSize);
      const widths = head.map((label, index) => {
        let width = measure(label, 'bold');
        body.forEach((row) => { width = Math.max(width, measure(row[index], 'normal')); });
        return width + padding.left + padding.right + 0.4;
      });
      const total = widths.reduce((sum, width) => sum + width, 0);
      const lineHeight = fontSize * 0.3528 * 1.15;
      const rowPad = padding.top + padding.bottom;
      const height = (lineHeight * 2 + rowPad) + body.length * (lineHeight + rowPad);
      best = { fontSize, padding, widths, total };
      // ห้องใหญ่: ยอมขึ้นหน้า 2 เมื่อตัวอักษรต้องเล็กกว่า 6.5pt จึงจะพอหน้าเดียว
      if (total <= tableWidth && (height <= rowsHeight || fontSize <= 6.5)) break;
    }
    // ที่เหลือ: ให้ช่องชื่อกว้างขึ้นเล็กน้อย แล้วแบ่งเท่า ๆ กันให้ตารางเต็มความกว้างหน้า
    let spare = tableWidth - best.total;
    if (spare > 0) {
      const toName = Math.min(spare, 12);
      best.widths[2] += toName;
      spare -= toName;
      best.widths = best.widths.map((width, index) => (index === 2 ? width : width + spare / (best.widths.length - 1)));
    } else if (spare < 0) {
      best.widths = best.widths.map((width) => width * (tableWidth / best.total));
    }
    doc.setFont('Sarabun', 'normal');
    return best;
  }

  async function createMatrix(matrix, options) {
    const { doc, meta, startY } = await createDocument('สรุปวันมาเรียนแต่ละเดือน', options);
    const months = matrix?.months || [];
    // ใต้ชื่อเดือนแสดงจำนวนวันเรียนจริงของเดือนนั้น (เหมือนตารางบนจอ) แทนปี พ.ศ. — ปีอยู่ที่หัวรายงานแล้ว (owner 2026-10-18)
    const schoolDaysLabel = (month) => (Number(month.schoolDays) > 0 ? `${Number(month.schoolDays)} วัน` : '-');
    const head = ['ที่', 'รหัส', 'ชื่อ-นามสกุล', ...months.map((month) => `${text(month.shortName)}\n${schoolDaysLabel(month)}`), 'รวมมา', 'รวมวัน', 'ร้อยละ'];
    const body = (matrix?.students || []).map((student, index) => [
      index + 1, text(student.id), text(student.name),
      ...months.map((month) => number(student.monthlyData?.[month.key])),
      number(student.totalPresent), number(student.totalDays), `${number(student.percentage).toFixed(1)}%`
    ]);
    const fit = fitMatrixColumns(doc, head, body, startY);
    const columnStyles = {};
    fit.widths.forEach((cellWidth, index) => { columnStyles[index] = index === 2 ? { cellWidth, halign: 'left' } : { cellWidth }; });
    runAutoTable(doc, tableDefaults({
      startY,
      head: [head],
      body,
      styles: { font: 'Sarabun', fontSize: fit.fontSize, cellPadding: fit.padding, lineColor: [0, 0, 0], lineWidth: 0.18, valign: 'middle', halign: 'center', overflow: 'linebreak' },
      headStyles: { font: 'Sarabun', fontStyle: 'bold', fontSize: fit.fontSize, fillColor: [242, 242, 242], textColor: [0, 0, 0] },
      columnStyles
    }));
    addSignatures(doc, meta, doc.lastAutoTable?.finalY);
    return finish(doc, meta);
  }

  function drawDailyAttendancePage(doc, monthData, meta, logo) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 1. Logo
    let y = 12;
    if (logo) {
      const logoW = 18;
      const logoH = 18;
      doc.addImage(logo, 'PNG', (pageWidth - logoW) / 2, y, logoW, logoH, undefined, 'FAST');
      y += 22;
    } else {
      y += 6;
    }

    // 2. Header
    doc.setTextColor(0, 0, 0);
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(12.5);
    doc.text(meta.schoolName || 'โรงเรียน', pageWidth / 2, y, { align: 'center' });
    y += 5.5;

    const gradeRaw = text(monthData?.grade || meta.grade || 'ป.3');
    const classText = text(monthData?.classNo || meta.classNo || '1');
    const gradeDigit = gradeRaw.replace(/[^\d]/g, '') || '3';
    const gradeText = gradeRaw.startsWith('ม.') ? `ม.${gradeDigit}` : gradeRaw.startsWith('อ.') ? `อ.${gradeDigit}` : `ป.${gradeDigit}`;
    const monthName = text(monthData?.monthName || '');
    const yearBE = text(monthData?.yearBE || meta.academicYear || '2569');
    doc.setFontSize(12);
    // title / subjectLine / countLine / unit: ใช้กับ "สรุปเวลาเรียนรายวิชา" (owner 2026-10-15 "ดูตัวอย่างแบบรายชั้น") — รายชั้นใช้ค่าเดิม
    doc.text(text(monthData?.title) || `บันทึกเวลาเรียน ชั้น ${gradeText}/${classText} เดือน ${monthName} ${yearBE}`, pageWidth / 2, y, { align: 'center' });
    y += 5;
    if (text(monthData?.subjectLine)) {
      doc.setFontSize(10.5);
      doc.text(text(monthData.subjectLine), pageWidth / 2, y, { align: 'center' });
      y += 4.8;
    }

    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9.5);
    const semester = text(monthData?.semester || 'ภาคเรียนที่ 1');
    const academicYear = text(monthData?.academicYear || meta.academicYear || '2569');
    doc.text(`${semester} | ปีการศึกษา ${academicYear}`, pageWidth / 2, y, { align: 'center' });
    y += 4.5;

    doc.setFontSize(8.5);
    const days = monthData?.days || [];
    const students = monthData?.students || [];
    const actualSchoolDays = number(monthData?.actualSchoolDays, days.length);
    const totalDaysInMonth = number(monthData?.totalDaysInMonth, 31);
    doc.text(text(monthData?.countLine) || `แสดงเฉพาะวันที่มีการเรียน: ${actualSchoolDays} วัน (จาก ${totalDaysInMonth} วันในเดือน)`, pageWidth / 2, y, { align: 'center' });
    y += 3.5;

    // 3. Table
    const headRow1 = [
      { content: 'ที่', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
      { content: 'รหัส', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
      { content: 'ชื่อ - สกุล', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } }
    ];
    days.forEach((d) => headRow1.push({ content: text(d.label), styles: { halign: 'center', valign: 'middle' } }));

    const headRow2 = days.map((d) => ({ content: text(d.dow), styles: { halign: 'center', valign: 'middle' } }));

    const body = students.map((s, idx) => {
      const row = [
        idx + 1,
        text(s.id || s.student_code || s.code),
        text(s.name || s.fullName)
      ];
      days.forEach((d) => {
        const mark = text(s.statusMap?.[d.label] || '');
        row.push(mark);
      });
      return row;
    });

    const leftMargin = 10;
    const rightMargin = 10;
    const totalTableWidth = pageWidth - leftMargin - rightMargin;
    const col0Width = 8;
    const col1Width = 14;
    const numDays = Math.max(days.length, 1);
    const col2Width = Math.min(54, Math.max(38, totalTableWidth - col0Width - col1Width - (numDays * 6.2)));
    const remainingWidth = totalTableWidth - col0Width - col1Width - col2Width;
    const dayColWidth = remainingWidth / numDays;

    const columnStyles = {
      0: { cellWidth: col0Width, halign: 'center' },
      1: { cellWidth: col1Width, halign: 'center' },
      2: { cellWidth: col2Width, halign: 'left' }
    };
    days.forEach((_d, idx) => {
      columnStyles[3 + idx] = { cellWidth: dayColWidth, halign: 'center' };
    });

    runAutoTable(doc, tableDefaults({
      startY: y,
      head: [headRow1, headRow2],
      body,
      margin: { left: leftMargin, right: rightMargin, bottom: 6 },
      styles: {
        font: 'Sarabun',
        fontSize: days.length > 22 ? 7.5 : 8.5,
        cellPadding: 1.2,
        halign: 'center',
        valign: 'middle',
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.2
      },
      headStyles: {
        font: 'Sarabun',
        fontStyle: 'bold',
        fontSize: days.length > 22 ? 7.5 : 8.5,
        fillColor: [245, 245, 245],
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.2
      },
      columnStyles,
      willDrawCell: function(data) {
        if (data.section === 'body' && data.column.index >= 3) {
          const val = String(data.cell.raw || '').trim();
          if (val === 'ล') {
            data.cell.styles.textColor = [230, 81, 0];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === 'ข') {
            data.cell.styles.textColor = [198, 40, 40];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === '✓' || val === '/' || val === '1' || val === 'present' || val === 'ม') {
            data.cell.text = [''];
          }
        }
      },
      didDrawCell: function(data) {
        if (data.section === 'body' && data.column.index >= 3) {
          const val = String(data.cell.raw || '').trim();
          if (val === '✓' || val === '/' || val === '1' || val === 'present' || val === 'ม') {
            const x = data.cell.x + data.cell.width / 2;
            const y = data.cell.y + data.cell.height / 2;
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.35);
            doc.line(x - 1.3, y, x - 0.3, y + 1.1);
            doc.line(x - 0.3, y + 1.1, x + 1.5, y - 1.3);
          }
        }
      }
    }));

    // 4. Footer Legend
    const endY = doc.lastAutoTable?.finalY || (y + 100);
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    const legendY = endY + 7;
    doc.text(
      `หมายเหตุ:        = มาเรียน   ล = ลา   ข = ขาด   |   นักเรียน: ${students.length} คน   |   ${text(monthData?.unitLabel) || 'วันเรียน'}: ${actualSchoolDays} ${text(monthData?.unit) || 'วัน'}`,
      pageWidth / 2,
      legendY,
      { align: 'center' }
    );
    // รายชั้นใช้ตำแหน่งเดิม · รายวิชา (unit ตั้งเอง) ข้อความยาวต่างกัน: วัดจากความกว้างจริงของบรรทัด
    const legendText = `หมายเหตุ:        = มาเรียน   ล = ลา   ข = ขาด   |   นักเรียน: ${students.length} คน   |   ${text(monthData?.unitLabel) || 'วันเรียน'}: ${actualSchoolDays} ${text(monthData?.unit) || 'วัน'}`;
    const checkX = text(monthData?.unit)
      ? (pageWidth / 2) - doc.getTextWidth(legendText) / 2 + doc.getTextWidth('หมายเหตุ:    ') + 1.6
      : (pageWidth / 2) - 61.5;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.line(checkX - 1.2, legendY - 1, checkX - 0.3, legendY + 0.1);
    doc.line(checkX - 0.3, legendY + 0.1, checkX + 1.4, legendY - 2.1);
  }

  function attendanceStatusCategory(value) {
    const status = text(value).trim().toLowerCase();
    if (status === '✓' || status === '/' || status === '1' || status === 'present' || status === 'ม') return 'present';
    if (status === 'leave' || status === 'ล' || status === 'l') return 'leave';
    if (status === 'absent' || status === 'ข' || status === '0') return 'absent';
    return '';
  }

  function monthlyAttendanceCounts(student, days) {
    const counts = { present: 0, leave: 0, absent: 0, total: 0 };
    (days || []).forEach((day) => {
      const category = attendanceStatusCategory(student?.statusMap?.[day?.label]);
      if (category) counts[category] += 1;
    });
    counts.total = counts.present + counts.leave + counts.absent;
    return counts;
  }

  function drawMonthlyAttendanceSummaryPage(doc, monthData, meta, logo) {
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 16;
    if (logo) {
      const logoW = 17;
      const logoH = 17;
      doc.addImage(logo, 'PNG', (pageWidth - logoW) / 2, y, logoW, logoH, undefined, 'FAST');
      y += 22;
    }

    const gradeRaw = text(monthData?.grade || meta.grade || 'ป.3');
    const classText = text(monthData?.classNo || meta.classNo || '1');
    const monthName = text(monthData?.monthName || '');
    const yearBE = text(monthData?.yearBE || meta.academicYear || '');
    const academicYear = text(monthData?.academicYear || meta.academicYear || '');
    const days = monthData?.days || [];
    const students = monthData?.students || [];

    doc.setTextColor(0, 0, 0);
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(14);
    doc.text('บันทึกเวลาเรียน (เช็คชื่อรายเดือน)', pageWidth / 2, y, { align: 'center' });
    y += 6;
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(10.5);
    doc.text(
      `${meta.schoolName || 'โรงเรียน'} | ชั้น${gradeRaw}/${classText} | เดือน${monthName} ${yearBE} | ปีการศึกษา ${academicYear}`,
      pageWidth / 2,
      y,
      { align: 'center' }
    );
    y += 7;

    const totals = { present: 0, leave: 0, absent: 0, total: 0 };
    const body = students.map((student, index) => {
      const counts = monthlyAttendanceCounts(student, days);
      totals.present += counts.present;
      totals.leave += counts.leave;
      totals.absent += counts.absent;
      totals.total += counts.total;
      return [
        index + 1,
        text(student?.name || student?.fullName),
        counts.present,
        counts.leave,
        counts.absent,
        counts.total
      ];
    });
    body.push([
      { content: 'รวมทั้งห้อง', colSpan: 2, styles: { fontStyle: 'bold', halign: 'center', fillColor: [235, 235, 235] } },
      { content: totals.present, styles: { fontStyle: 'bold', fillColor: [235, 235, 235] } },
      { content: totals.leave, styles: { fontStyle: 'bold', fillColor: [235, 235, 235] } },
      { content: totals.absent, styles: { fontStyle: 'bold', fillColor: [235, 235, 235] } },
      { content: totals.total, styles: { fontStyle: 'bold', fillColor: [235, 235, 235] } }
    ]);

    runAutoTable(doc, tableDefaults({
      startY: y,
      head: [['ที่', 'ชื่อ-นามสกุล', 'มา', 'ลา', 'ขาด', 'รวม']],
      body,
      margin: { top: y, left: 30, right: 30, bottom: 18 },
      styles: {
        font: 'Sarabun',
        fontSize: 10.5,
        cellPadding: 2.4,
        halign: 'center',
        valign: 'middle',
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.22
      },
      headStyles: {
        font: 'Sarabun',
        fontStyle: 'bold',
        fontSize: 10.5,
        fillColor: [238, 238, 238],
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.22
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 68, halign: 'left' },
        2: { cellWidth: 18 },
        3: { cellWidth: 18 },
        4: { cellWidth: 18 },
        5: { cellWidth: 18 }
      }
    }));
  }
  async function createChecklist(tableData, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);

    let monthData = tableData;
    if (!monthData?.monthName) {
      const students = tableData?.students || [];
      const calendarDays = tableData?.days || [];
      const recordedDays = calendarDays.filter((day) => students.some((student) => {
        const mark = text(student.statusMap?.[day.label]);
        return mark === '/' || mark === '✓' || mark === 'ล' || mark === 'ข';
      }));
      const days = recordedDays.length ? recordedDays : calendarDays;
      monthData = {
        grade: meta.grade,
        classNo: meta.classNo,
        monthName: meta.meta || '',
        yearBE: meta.academicYear || '2569',
        semester: 'ภาคเรียนที่ 1',
        academicYear: meta.academicYear || '2569',
        actualSchoolDays: days.length,
        totalDaysInMonth: calendarDays.length || 31,
        days,
        students
      };
    }

    drawDailyAttendancePage(doc, monthData, meta, logo);
    return finish(doc, meta);
  }

  function formatThaiBirthDate(value) {
    const source = text(value).trim();
    if (!source) return '';
    const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return source;
    const year = Number(match[1]);
    return `${match[3]}/${match[2]}/${year < 2400 ? year + 543 : year}`;
  }

  function studentListColumnDefinitions() {
    return {
      order: { label: 'ลำดับ', width: 8, value: (_student, index) => index + 1 },
      studentNumber: { label: 'เลขที่', width: 10, value: (student, index) => text(student.studentNumber || student.student_number || index + 1) },
      studentId: { label: 'รหัส', width: 14, value: (student) => text(student.id || student.studentId) },
      fullName: { label: 'ชื่อ-นามสกุล', width: 48, value: (student) => text(student.fullName || student.name), align: 'left' },
      nationalId: { label: 'เลขประจำตัวประชาชน', width: 30, value: (student) => text(student.idCard || student.national_id) },
      birthDate: { label: 'วันเดือนปีเกิด', width: 23, value: (student) => formatThaiBirthDate(student.birthdate || student.birth_date) },
      grade: { label: 'ชั้น', width: 11, value: (student) => text(student.grade) },
      room: { label: 'ห้อง', width: 9, value: (student) => text(student.classNo || student.room) },
      gender: { label: 'เพศ', width: 10, value: (student) => text(student.gender) }
    };
  }

  function normalizeStudentListSelection(selection) {
    const definitions = studentListColumnDefinitions();
    const requested = Array.isArray(selection?.columns) ? selection.columns : [];
    const columns = [...new Set(requested)].filter((key) => definitions[key]);
    if (!columns.length) columns.push('studentNumber', 'fullName', 'studentId');
    return { columns, scoreSlots: selection?.scoreSlots === true };
  }

  const STUDENT_LIST_ONE_PAGE_LIMIT = 20;

  function addStudentListSignatures(doc, meta, startY, orientation) {
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = number(startY, 0) + 9;
    if (y + 12 > pageHeight - 8) {
      doc.addPage('a4', orientation);
      y = 45;
    }
    const pageWidth = doc.internal.pageSize.getWidth();
    const centers = [pageWidth * 0.2, pageWidth * 0.5, pageWidth * 0.8];
    const cells = [
      { role: `ครูประจำชั้น ${meta.grade || ''}/${meta.classNo || ''}`, name: meta.classTeacher },
      { role: 'หัวหน้างานวิชาการ', name: meta.academicHead },
      { role: meta.directorPosition, name: meta.directorName }
    ];
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8.5);
    cells.forEach((cell, index) => {
      const name = cell.name || '................................................';
      doc.text('ลงชื่อ................................................', centers[index], y, { align: 'center' });
      doc.text(`(${name})`, centers[index], y + 6, { align: 'center' });
      doc.text(cell.role, centers[index], y + 12, { align: 'center' });
    });
  }

  function addDocumentPageNumbers(doc, options = {}) {
    const pageCount = doc.internal.getNumberOfPages();
    const skipFirstPage = Boolean(options?.skipFirstPage || options?.hasCover);
    const startPage = skipFirstPage ? 2 : 1;
    const totalCount = skipFirstPage ? pageCount - 1 : pageCount;
    if (totalCount <= 0) return;

    for (let page = startPage; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFont('Sarabun', 'normal');
      doc.setFontSize(7.5);
      const displayPage = skipFirstPage ? page - 1 : page;
      doc.text(`หน้า ${displayPage}/${totalCount}`, doc.internal.pageSize.getWidth() - 8, doc.internal.pageSize.getHeight() - 5, { align: 'right' });
    }
  }

  async function createStudentList(students, options, selection) {
    const normalized = normalizeStudentListSelection(selection);
    const definitions = studentListColumnDefinitions();
    const scoreKeys = normalized.scoreSlots ? Array.from({ length: 10 }, (_item, index) => `score${index + 1}`) : [];
    const orientation = normalized.scoreSlots || normalized.columns.length > 6 ? 'landscape' : 'portrait';
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    drawHeader(doc, 'บัญชีรายชื่อนักเรียน', meta, logo);
    const startY = headerBottom(meta, logo, '');
    const bindingMarginLeft = 16;
    const pageMarginRight = 7;
    const availableWidth = doc.internal.pageSize.getWidth() - bindingMarginLeft - pageMarginRight;
    const selectedDefinitions = normalized.columns.map((key) => ({ key, ...definitions[key] }));
    const selectedWidth = selectedDefinitions.reduce((sum, column) => sum + column.width, 0);
    const scoreWidth = normalized.scoreSlots
      ? Math.max(8, Math.min(19, (availableWidth - selectedWidth) / 10))
      : 0;
    const allDefinitions = selectedDefinitions.concat(scoreKeys.map((key, index) => ({
      key, label: String(index + 1), width: scoreWidth, value: () => ''
    })));
    const body = (students || []).map((student, index) => allDefinitions.map((column) => column.value(student, index)));
    const firstHeaderRow = selectedDefinitions.map((column) => ({ content: column.label, rowSpan: normalized.scoreSlots ? 2 : 1 }));
    if (normalized.scoreSlots) firstHeaderRow.push({ content: 'ช่องบันทึกคะแนน', colSpan: 10 });
    const head = normalized.scoreSlots
      ? [firstHeaderRow, scoreKeys.map((_key, index) => String(index + 1))]
      : [firstHeaderRow];
    const columnStyles = {};
    allDefinitions.forEach((column, index) => {
      columnStyles[index] = {
        cellWidth: column.width,
        halign: column.align || 'center',
        overflow: column.key === 'fullName' ? 'ellipsize' : 'linebreak'
      };
    });
    const compact = normalized.scoreSlots || allDefinitions.length > 7;
    const pageHeight = doc.internal.pageSize.getHeight();
    const signatureReserve = 32;
    const headerReserve = normalized.scoreSlots ? 12 : 7;
    const rowCount = Math.max((students || []).length, 1);
    const fittingRowCount = Math.min(rowCount, STUDENT_LIST_ONE_PAGE_LIMIT);
    const compactRowHeight = Math.max(5, Math.min(7.2, (pageHeight - startY - signatureReserve - headerReserve) / fittingRowCount));
    runAutoTable(doc, tableDefaults({
      startY,
      head,
      body: body.length ? body : [allDefinitions.map((_column, index) => index === 0 ? 'ไม่พบนักเรียนตามเงื่อนไข' : '')],
      margin: { top: startY, left: bindingMarginLeft, right: pageMarginRight, bottom: signatureReserve },
      styles: {
        font: 'Sarabun', fontStyle: 'normal', fontSize: compact ? 7 : 9,
        cellPadding: compact ? 1.1 : 1.5, lineColor: [0, 0, 0], lineWidth: 0.2,
        textColor: [0, 0, 0], valign: 'middle', halign: 'center', minCellHeight: normalized.scoreSlots ? compactRowHeight : 7
      },
      headStyles: {
        font: 'Sarabun', fontStyle: 'bold', fontSize: compact ? 7 : 8.5,
        fillColor: [242, 242, 242], textColor: [0, 0, 0], valign: 'middle', halign: 'center'
      },
      columnStyles,
      didDrawPage(data) {
        if (data.pageNumber > 1) drawHeader(doc, 'บัญชีรายชื่อนักเรียน', meta, logo);
      }
    }));
    addStudentListSignatures(doc, meta, doc.lastAutoTable?.finalY || startY, orientation);
    addDocumentPageNumbers(doc);
    doc.setProperties({ title: 'บัญชีรายชื่อนักเรียน', subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    return finish(doc, meta);
  }

  async function createGrowthMonthlyReport(report, options = {}) {
    const doc = new (getJsPdf())({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options);
    const monthNames = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const months = report.months || [];
    const showClass = !report.grade || !report.classNo;
    const headings = ['ที่','รหัส','ชื่อ-นามสกุล','รอบ','วันที่ชั่งวัด','ชั้น/ห้อง','น้ำหนัก (กก.)','ส่วนสูง (ซม.)','BMI','ภาวะโภชนาการ','หมายเหตุ'];
    const widths = [7,12,38,8,20,13,15,15,12,26,20];
    if (!showClass) { headings.splice(5, 1); widths.splice(5, 1); widths[2] += 13; }
    const columnStyles = Object.fromEntries(widths.map((cellWidth,index) => [index, { cellWidth }]));
    const sections = months.flatMap(month => {
      const monthRows = report.rows.filter(row => Number(row.month) === month);
      const rounds = [...new Set(monthRows.map(row => Number(row.round_no)))].sort((a,b) => a-b);
      return rounds.length ? rounds.map(round => ({ month, round, rows: monthRows.filter(row => Number(row.round_no) === round) }))
        : [{ month, round: null, rows: [] }];
    });
    sections.forEach(({ month, round, rows: sectionRows }, sectionIndex) => {
      if (sectionIndex) doc.addPage();
      const rows = sectionRows.slice().sort((a,b) =>
        Number(a.round_no) - Number(b.round_no) || text(a.grade).localeCompare(text(b.grade), 'th') ||
        text(a.class_no).localeCompare(text(b.class_no), undefined, { numeric: true }) || Number(a.student_number) - Number(b.student_number));
      const header = () => {
        doc.setFont('Sarabun', 'bold'); doc.setFontSize(16);
        doc.text(`รายงานน้ำหนัก - ส่วนสูง เดือน${monthNames[month - 1]}${round === null ? '' : ` รอบที่ ${round}`}`, 105, 16, { align: 'center' });
        doc.setFont('Sarabun', 'normal'); doc.setFontSize(11);
        doc.text(meta.schoolName, 105, 24, { align: 'center' });
        doc.setFontSize(9);
        doc.text(text(report.label), 105, 31, { align: 'center' });
        doc.text(`นักเรียนที่มีข้อมูล ${new Set(rows.map(row => row.student_id)).size} คน · บันทึกการชั่งวัด ${rows.length} รายการ`, 105, 38, { align: 'center' });
        doc.setFontSize(8);
        doc.text('ภาวะโภชนาการ: คัดกรอง BMI ตามอายุและเพศ (WHO 2007) ไม่ใช่การวินิจฉัย', 105, 44, { align: 'center' });
      };
      header();
      runAutoTable(doc, tableDefaults({
        startY: 49, margin: { top: 49, left: 12, right: 12, bottom: 15 },
        head: [headings],
        body: rows.length ? rows.map((row,index) => {
          const cells = [index+1,row.student_id,row.student_name,row.round_no,formatLegacyThaiDate(row.measure_date),
            `${row.grade}/${row.class_no}`,row.weight_kg,row.height_cm,row.bmi,row.nutrition_status,row.note];
          if (!showClass) cells.splice(5, 1);
          return cells;
        }) : [[{ content: 'ไม่มีข้อมูลที่บันทึกในเดือนนี้ตามเงื่อนไขที่เลือก', colSpan: headings.length }]],
        styles: { font: 'Sarabun', fontStyle: 'normal', fontSize: 8, cellPadding: 1, minCellHeight: 8, valign: 'middle', textColor: [0,0,0] },
        headStyles: { font: 'Sarabun', fontStyle: 'bold', fillColor: [235,240,246], textColor: [0,0,0], halign: 'center' },
        columnStyles,
        rowPageBreak: 'avoid', didDrawPage(){ header(); }
      }));
    });
    addDocumentPageNumbers(doc);
    doc.setProperties({ title: 'รายงานน้ำหนัก–ส่วนสูงรายเดือน', author: meta.schoolName, creator: 'PP5Smart' });
    return finish(doc, { ...meta, footerNote: '' });
  }

  async function createGrowthSheet(students, options = {}, selection = {}) {
    const mode = selection.mode || 'saved';
    const custom = mode === 'custom';
    const title = custom ? text(selection.title || 'ตารางบันทึกเอนกประสงค์').slice(0, 80) : 'น้ำหนัก - ส่วนสูง';
    const labels = custom ? (selection.labels || ['รายการ 1', 'รายการ 2', 'หมายเหตุ']).slice(0, 3)
      : ['น้ำหนัก (กก.)', 'ส่วนสูง (ซม.)'];
    const doc = new (getJsPdf())({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options);
    const sections = selection.sections?.length ? selection.sections : [{ students, semester: selection.semester, periodLabel: selection.periodLabel }];
    for (const [sectionIndex, section] of sections.entries()) {
    if (sectionIndex) doc.addPage('a4', 'portrait');
    const header = () => {
      doc.setFont('Sarabun', 'bold'); doc.setFontSize(15);
      doc.text(doc.splitTextToSize(title, 178), 105, 17, { align: 'center' });
      doc.setFont('Sarabun', 'normal'); doc.setFontSize(11);
      doc.text(`ภาคเรียนที่ ${text(section.semester || '1')}  ปีการศึกษา ${meta.academicYear}`, 105, 30, { align: 'center' });
      doc.text(doc.splitTextToSize(`ชั้น ${meta.grade} ห้อง ${meta.classNo}  ${meta.schoolName}`, 178), 105, 37, { align: 'center' });
      doc.setFontSize(9);
      doc.text(text(section.periodLabel), 105, 46, { align: 'center' });
    };
    header();
    const columns = ['เลขที่', 'รหัส', 'เลขประจำตัวประชาชน', 'ชื่อ-สกุล (ภาษาไทย)', ...labels];
    const body = section.students.map((s, index) => [
      s.student_number || index + 1, text(s.student_id), text(s.national_id), text(s.student_name),
      ...(custom ? labels.map(() => '') : [mode === 'saved' ? text(s.weight_kg) : '', mode === 'saved' ? text(s.height_cm) : ''])
    ]);
    for (let index = 0; index < 5; index++) body.push(columns.map(() => ''));
    const widths = [10, 17, 38, custom ? 55 : 65];
    const extraWidth = (182 - widths.reduce((sum, value) => sum + value, 0)) / labels.length;
    const columnStyles = {};
    [...widths, ...labels.map(() => extraWidth)].forEach((width, index) => {
      columnStyles[index] = { cellWidth: width, halign: index === 3 ? 'left' : 'center' };
    });
    runAutoTable(doc, tableDefaults({
      startY: 51, head: [columns], body,
      margin: { top: 51, left: 14, right: 14, bottom: 38 },
      styles: { font: 'Sarabun', fontStyle: 'normal', fontSize: 9, cellPadding: 1.4,
        minCellHeight: 8, valign: 'middle', lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0] },
      headStyles: { font: 'Sarabun', fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0], halign: 'center' },
      columnStyles, rowPageBreak: 'avoid',
      didDrawPage(data) { if (data.pageNumber > 1) header(); }
    }));
    const y = Math.min((doc.lastAutoTable?.finalY || 51) + 14, 270);
    doc.setFont('Sarabun', 'normal'); doc.setFontSize(11);
    doc.text('ลงชื่อ........................................................', 105, y, { align: 'center' });
    doc.text(`(${meta.classTeacher || '........................................................'})`, 105, y + 7, { align: 'center' });
    doc.text('ครูประจำชั้น', 105, y + 14, { align: 'center' });
    }
    addDocumentPageNumbers(doc);
    doc.setProperties({ title, author: meta.schoolName, creator: 'PP5Smart' });
    return finish(doc, { ...meta, footerNote: '' });
  }

  function chunkRows(rows, size) {
    const source = Array.isArray(rows) ? rows : [];
    if (!source.length) return [[]];
    const chunks = [];
    for (let index = 0; index < source.length; index += size) chunks.push(source.slice(index, index + size));
    return chunks;
  }

  function formatLegacyThaiDate(value) {
    const source = text(value).trim();
    if (!source) return '-';
    const match = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return source;
    const months = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const year = Number(match[1]);
    return `${Number(match[3])} ${months[Number(match[2])] || match[2]} ${year < 2400 ? year + 543 : year}`;
  }

  function drawLegacyStudentListHeader(doc, meta, logo) {
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 8;
    if (logo) {
      doc.addImage(logo, 'PNG', (pageWidth - 18) / 2, y, 18, 18, undefined, 'FAST');
      y += 22;
    }
    doc.setTextColor(0, 0, 0);
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(13.5);
    doc.text('บัญชีรายชื่อนักเรียน', pageWidth / 2, y, { align: 'center' });
    y += 5.5;
    doc.setFontSize(11.5);
    doc.text(meta.schoolName, pageWidth / 2, y, { align: 'center' });
    y += 5;
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9.5);
    doc.text(meta.meta, pageWidth / 2, y, { align: 'center' });
    y += 4.5;
    doc.setLineWidth(0.35);
    doc.line(16, y, pageWidth - 5, y);
    return y + 3;
  }

  async function createLegacyStudentList(students, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    const chunks = chunkRows(students, 20);
    chunks.forEach((studentChunk, chunkIndex) => {
      if (chunkIndex > 0) doc.addPage('a4', 'portrait');
      const startY = drawLegacyStudentListHeader(doc, meta, logo);
      const body = studentChunk.map((student) => [
        text(student.id || student.studentId),
        text(student.idCard || student.national_id),
        text(student.fullName || student.name),
        text(student.grade),
        text(student.classNo || student.room),
        text(student.gender),
        formatLegacyThaiDate(student.birthdate || student.birth_date),
        text(student.age)
      ]);
      runAutoTable(doc, tableDefaults({
        startY,
        head: [['รหัส', 'เลข ปชช.', 'ชื่อ - สกุล', 'ชั้น', 'ห้อง', 'เพศ', 'วันเกิด', 'อายุ']],
        body: body.length ? body : [['-', '-', 'ไม่พบข้อมูลนักเรียน', '-', '-', '-', '-', '-']],
        margin: { top: startY, left: 16, right: 5, bottom: 9 },
        styles: {
          font: 'Sarabun', fontStyle: 'normal', fontSize: 7.3, cellPadding: 0.9,
          lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0],
          valign: 'middle', halign: 'center', minCellHeight: 9, overflow: 'linebreak'
        },
        headStyles: {
          font: 'Sarabun', fontStyle: 'normal', fontSize: 7.2, cellPadding: 0.7,
          fillColor: [242, 242, 242], textColor: [0, 0, 0], valign: 'middle', halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 16 }, 1: { cellWidth: 32 },
          2: { cellWidth: 64, halign: 'left', overflow: 'ellipsize' },
          3: { cellWidth: 14 }, 4: { cellWidth: 13 }, 5: { cellWidth: 14 },
          6: { cellWidth: 24 }, 7: { cellWidth: 12 }
        }
      }));
    });
    doc.setProperties({ title: 'บัญชีรายชื่อนักเรียน', subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    return finish(doc, { ...meta, footerNote: '' });
  }

  function birthDateParts(value) {
    const match = text(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return { day: '', month: '', year: '' };
    const year = Number(match[1]);
    return { day: String(Number(match[3])), month: String(Number(match[2])), year: String(year < 2400 ? year + 543 : year) };
  }

  function joinedDetailName(first, last) {
    return [text(first).trim(), text(last).trim()].filter(Boolean).join(' ').trim();
  }

  function registryGradeLabel(grade) {
    const value = text(grade).trim();
    if (/^ป\.\d+$/.test(value)) return `ชั้นประถมศึกษาปีที่ ${value.replace('ป.', '')}`;
    if (/^ม\.\d+$/.test(value)) return `ชั้นมัธยมศึกษาปีที่ ${value.replace('ม.', '')}`;
    if (/^อ\.\d+$/.test(value)) return `ชั้นอนุบาล ${value.replace('อ.', '')}`;
    return value ? `ชั้น ${value}` : 'ทุกระดับชั้น';
  }

  function drawStudentRegistryHeader(doc, meta, logo, sectionTitle) {
    const pageWidth = doc.internal.pageSize.getWidth();
    if (logo) doc.addImage(logo, 'PNG', 16, 7, 18, 18, undefined, 'FAST');
    doc.setTextColor(0, 0, 0);
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(13.5);
    doc.text(sectionTitle, pageWidth / 2, 12, { align: 'center' });
    doc.setFontSize(11);
    doc.text(`${registryGradeLabel(meta.grade)} | ปีการศึกษา ${meta.academicYear || '-'}`, pageWidth / 2, 18, { align: 'center' });
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9.5);
    doc.text(meta.schoolName, pageWidth / 2, 23.5, { align: 'center' });
    doc.setLineWidth(0.35);
    doc.line(16, 27.5, pageWidth - 6, 27.5);
    return 30.5;
  }

  function parentReportValue(student, ...keys) {
    for (const key of keys) {
      const value = text(student?.[key]).trim();
      if (value && value !== '-') return value;
    }
    return '';
  }

  function parentReportFullName(student, firstKeys, lastKeys) {
    const firstName = parentReportValue(student, ...firstKeys);
    const lastName = parentReportValue(student, ...lastKeys);
    if (!firstName || !lastName || firstName === lastName || firstName.endsWith(` ${lastName}`)) {
      return firstName || lastName;
    }
    return `${firstName} ${lastName}`;
  }

  function parentReportStudentName(student) {
    const direct = parentReportValue(student, 'fullName', 'full_name', 'name', 'studentName', 'student_name');
    if (direct) return direct;
    const title = parentReportValue(student, 'title', 'prefix');
    const firstName = parentReportValue(student, 'firstname', 'firstName', 'first_name');
    const lastName = parentReportValue(student, 'lastname', 'lastName', 'last_name');
    return [title, firstName, lastName].filter(Boolean).join(' ');
  }

  function parentReportAddress(student) {
    const address = parentReportValue(student, 'address', 'currentAddress', 'current_address', 'homeAddress', 'home_address');
    const appendIfMissing = (parts, value, label = '') => {
      const detail = text(value).trim();
      if (!detail || detail === '-') return;
      const exists = parts.some((part) => part.includes(detail));
      if (!exists) parts.push(label ? `${label}${detail}` : detail);
    };
    const parts = address ? [address] : [];
    appendIfMissing(parts, parentReportValue(student, 'houseNo', 'house_no', 'houseNumber', 'house_number'));
    appendIfMissing(parts, parentReportValue(student, 'moo', 'villageNo', 'village_no'), '\u0e2b\u0e21\u0e39\u0e48 ');
    appendIfMissing(parts, parentReportValue(student, 'road', 'street'));
    appendIfMissing(parts, parentReportValue(student, 'subdistrict', 'sub_district'), '\u0e15\u0e33\u0e1a\u0e25 ');
    appendIfMissing(parts, parentReportValue(student, 'district'), '\u0e2d\u0e33\u0e40\u0e20\u0e2d ');
    appendIfMissing(parts, parentReportValue(student, 'province'), '\u0e08\u0e31\u0e07\u0e2b\u0e27\u0e31\u0e14 ');
    appendIfMissing(parts, parentReportValue(student, 'postalCode', 'postal_code', 'zipCode', 'zip_code'));
    return parts.join(' ') || '-';
  }

  function parentReportGuardian(student, father, mother) {
    const guardianName = parentReportValue(student, 'guardianName', 'guardian_name');
    const guardianRelation = parentReportValue(student, 'guardianRelation', 'guardian_relation');
    const guardianOccupation = parentReportValue(student, 'guardianOccupation', 'guardian_occupation');
    const guardianPhone = parentReportValue(student, 'guardianPhone', 'guardian_phone');
    const fallback = father.name
      ? { name: father.name, relation: '\u0e1a\u0e34\u0e14\u0e32', occupation: father.occupation, phone: father.phone }
      : (mother.name ? { name: mother.name, relation: '\u0e21\u0e32\u0e23\u0e14\u0e32', occupation: mother.occupation, phone: mother.phone } : null);
    const detail = guardianName
      ? { name: guardianName, relation: guardianRelation, occupation: guardianOccupation, phone: guardianPhone }
      : fallback;
    if (!detail) return '-';
    return [
      detail.name,
      detail.relation ? `\u0e04\u0e27\u0e32\u0e21\u0e2a\u0e31\u0e21\u0e1e\u0e31\u0e19\u0e18\u0e4c: ${detail.relation}` : '',
      detail.occupation ? `\u0e2d\u0e32\u0e0a\u0e35\u0e1e: ${detail.occupation}` : '',
      detail.phone ? `\u0e42\u0e17\u0e23. ${detail.phone}` : ''
    ].filter(Boolean).join('\n');
  }

  async function createParentInfoReport(students, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    const title = '\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e1c\u0e39\u0e49\u0e1b\u0e01\u0e04\u0e23\u0e2d\u0e07';
    const classLabel = [
      meta.grade ? `\u0e0a\u0e31\u0e49\u0e19 ${meta.grade}` : '',
      meta.classNo ? `\u0e2b\u0e49\u0e2d\u0e07 ${meta.classNo}` : ''
    ].filter(Boolean).join(' ');
    drawHeader(doc, title, meta, logo, classLabel);
    const startY = headerBottom(meta, logo, classLabel);
    const source = Array.isArray(students) ? students : [];
    const body = source.map((student, index) => {
      const father = {
        name: parentReportFullName(student,
          ['fatherName', 'father_name', 'fatherFirstName', 'father_firstname', 'fatherFirstname'],
          ['fatherLastName', 'father_last_name', 'father_lastname', 'fatherLName', 'father_lname']),
        occupation: parentReportValue(student, 'fatherOccupation', 'father_occupation'),
        phone: parentReportValue(student, 'fatherPhone', 'father_phone')
      };
      const mother = {
        name: parentReportFullName(student,
          ['motherName', 'mother_name', 'motherFirstName', 'mother_firstname', 'motherFirstname'],
          ['motherLastName', 'mother_last_name', 'mother_lastname', 'motherLName', 'mother_lname']),
        occupation: parentReportValue(student, 'motherOccupation', 'mother_occupation'),
        phone: parentReportValue(student, 'motherPhone', 'mother_phone')
      };
      const studentNo = parentReportValue(student, 'studentNo', 'studentNumber', 'student_number', 'number');
      return [
        studentNo || String(index + 1),
        parentReportStudentName(student) || '-',
        father.name || '-',
        father.occupation || '-',
        mother.name || '-',
        mother.occupation || '-',
        parentReportGuardian(student, father, mother),
        parentReportAddress(student)
      ];
    });
    const head = [[
      { content: '\u0e25\u0e33\u0e14\u0e31\u0e1a', rowSpan: 2 },
      { content: '\u0e0a\u0e37\u0e48\u0e2d - \u0e19\u0e32\u0e21\u0e2a\u0e01\u0e38\u0e25', rowSpan: 2 },
      { content: '\u0e1a\u0e34\u0e14\u0e32', colSpan: 2 },
      { content: '\u0e21\u0e32\u0e23\u0e14\u0e32', colSpan: 2 },
      { content: '\u0e1c\u0e39\u0e49\u0e1b\u0e01\u0e04\u0e23\u0e2d\u0e07 / \u0e1c\u0e39\u0e49\u0e14\u0e39\u0e41\u0e25', rowSpan: 2 },
      { content: '\u0e17\u0e35\u0e48\u0e2d\u0e22\u0e39\u0e48\u0e1b\u0e31\u0e08\u0e08\u0e38\u0e1a\u0e31\u0e19', rowSpan: 2 }
    ], ['\u0e0a\u0e37\u0e48\u0e2d - \u0e2a\u0e01\u0e38\u0e25', '\u0e2d\u0e32\u0e0a\u0e35\u0e1e', '\u0e0a\u0e37\u0e48\u0e2d - \u0e2a\u0e01\u0e38\u0e25', '\u0e2d\u0e32\u0e0a\u0e35\u0e1e']];
    runAutoTable(doc, tableDefaults({
      startY,
      head,
      body: body.length ? body : [['', '\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e1c\u0e39\u0e49\u0e1b\u0e01\u0e04\u0e23\u0e2d\u0e07', '', '', '', '', '', '']],
      margin: { top: startY, left: 10, right: 10, bottom: 10 },
      styles: {
        font: 'Sarabun', fontStyle: 'normal', fontSize: 7.3, cellPadding: 1,
        lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0],
        valign: 'middle', halign: 'center', minCellHeight: 9, overflow: 'linebreak'
      },
      headStyles: {
        font: 'Sarabun', fontStyle: 'bold', fontSize: 7.5, cellPadding: 1,
        fillColor: [242, 242, 242], textColor: [0, 0, 0], valign: 'middle', halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 38, halign: 'left' },
        2: { cellWidth: 36, halign: 'left' },
        3: { cellWidth: 25, halign: 'left' },
        4: { cellWidth: 36, halign: 'left' },
        5: { cellWidth: 25, halign: 'left' },
        6: { cellWidth: 48, halign: 'left' },
        7: { cellWidth: 59, halign: 'left' }
      },
      didDrawPage(data) {
        if (data.pageNumber > 1) drawHeader(doc, title, meta, logo, classLabel);
      }
    }));
    addDocumentPageNumbers(doc);
    doc.setProperties({ title, subject: meta.meta, author: meta.schoolName, creator: 'PP5Smart' });
    return finish(doc, meta);
  }
  async function createStudentRegistry(students, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    const chunks = chunkRows(students, 20);
    let pageStarted = false;
    chunks.forEach((studentChunk, chunkIndex) => {
      if (pageStarted) doc.addPage('a4', 'portrait');
      pageStarted = true;
      const startY1 = drawStudentRegistryHeader(doc, meta, logo, 'ทะเบียนข้อมูลนักเรียน (ปพ.5)');
      const identityRows = studentChunk.map((student, index) => {
        const birth = birthDateParts(student.birthdate || student.birth_date);
        return [
          chunkIndex * 20 + index + 1,
          text(student.id || student.studentId),
          text(student.idCard || student.national_id),
          text(student.fullName || student.name),
          birth.day, birth.month, birth.year,
          text(student.age),
          text(student.blood_type || student.bloodType)
        ];
      });
      runAutoTable(doc, tableDefaults({
        startY: startY1,
        head: [[
          { content: 'เลขที่', rowSpan: 2 },
          { content: 'เลขประจำตัวนักเรียน', rowSpan: 2 },
          { content: 'เลขประจำตัวประชาชน', rowSpan: 2 },
          { content: 'ชื่อ - สกุล', rowSpan: 2 },
          { content: 'วัน เดือน ปี เกิด', colSpan: 3 },
          { content: 'อายุ', rowSpan: 2 },
          { content: 'หมู่โลหิต', rowSpan: 2 }
        ], ['วัน', 'เดือน', 'พ.ศ.']],
        body: identityRows,
        margin: { top: startY1, left: 16, right: 6, bottom: 8 },
        styles: {
          font: 'Sarabun', fontStyle: 'normal', fontSize: 8, cellPadding: 0.9,
          lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0],
          valign: 'middle', halign: 'center', minCellHeight: 10.5, overflow: 'linebreak'
        },
        headStyles: { font: 'Sarabun', fontStyle: 'bold', fontSize: 7.7, fillColor: [242, 242, 242], textColor: [0, 0, 0] },
        columnStyles: {
          0: { cellWidth: 8 }, 1: { cellWidth: 23 }, 2: { cellWidth: 29 },
          3: { cellWidth: 54, halign: 'left', overflow: 'ellipsize' },
          4: { cellWidth: 11 }, 5: { cellWidth: 11 }, 6: { cellWidth: 15 },
          7: { cellWidth: 12 }, 8: { cellWidth: 25 }
        }
      }));

      doc.addPage('a4', 'portrait');
      const startY2 = drawStudentRegistryHeader(doc, meta, logo, 'ข้อมูลผู้ปกครองนักเรียน');
      const parentRows = studentChunk.map((student, index) => [
        chunkIndex * 20 + index + 1,
        joinedDetailName(student.father_name, student.father_last_name),
        text(student.father_occupation),
        joinedDetailName(student.mother_name, student.mother_last_name),
        text(student.mother_occupation),
        text(student.address)
      ]);
      runAutoTable(doc, tableDefaults({
        startY: startY2,
        head: [[
          { content: 'เลขที่', rowSpan: 2 },
          { content: 'ข้อมูลบิดา', colSpan: 2 },
          { content: 'ข้อมูลมารดา', colSpan: 2 },
          { content: 'ที่อยู่ปัจจุบัน', rowSpan: 2 }
        ], ['ชื่อ-สกุล', 'อาชีพ', 'ชื่อ-สกุล', 'อาชีพ']],
        body: parentRows,
        margin: { top: startY2, left: 16, right: 6, bottom: 8 },
        styles: {
          font: 'Sarabun', fontStyle: 'normal', fontSize: 8, cellPadding: 0.9,
          lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0],
          valign: 'middle', halign: 'center', minCellHeight: 10.5, overflow: 'linebreak'
        },
        headStyles: { font: 'Sarabun', fontStyle: 'bold', fontSize: 8, fillColor: [242, 242, 242], textColor: [0, 0, 0] },
        columnStyles: {
          0: { cellWidth: 10 }, 1: { cellWidth: 40, halign: 'left' },
          2: { cellWidth: 25 }, 3: { cellWidth: 40, halign: 'left' },
          4: { cellWidth: 25 }, 5: { cellWidth: 48, halign: 'left', fontSize: 7.2 }
        }
      }));
    });
    doc.setProperties({ title: 'ทะเบียนข้อมูลนักเรียน ปพ.5', subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    return finish(doc, { ...meta, footerNote: '' });
  }

  async function createSubjectRtwReport(report, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    const title = 'แบบประเมินการอ่าน คิดวิเคราะห์ เขียน';
    drawHeader(doc, title, meta, logo);
    const startY = headerBottom(meta, logo, '');

    const head = [[
      { content: 'ที่', rowSpan: 2 },
      { content: 'รหัส', rowSpan: 2 },
      { content: 'ชื่อ - นามสกุล', rowSpan: 2 },
      { content: 'ผลการประเมินรายวิชา (ระดับ 1-3 หรือ 0)', colSpan: 8 },
      { content: 'สรุปผล', rowSpan: 2 }
    ], ['ไทย', 'คณิต', 'วิทย์', 'สังคม', 'สุขะ', 'ศิลปะ', 'การงาน', 'อังกฤษ']];

    const body = [];
    (report?.students || []).forEach((student, index) => {
      const scores = student.scores || {};
      const subjectScores = [
        scores.thai, scores.math, scores.science, scores.social,
        scores.health, scores.art, scores.work, scores.english
      ];
      const validScores = subjectScores.filter((s) => s !== '' && s !== null && s !== undefined && !isNaN(Number(s))).map(Number);
      let result = '-';
      if (validScores.length === 8) {
        const count0 = validScores.filter((s) => s === 0).length;
        const count3 = validScores.filter((s) => s === 3).length;
        const count2up = validScores.filter((s) => s >= 2).length;
        const hasBelow2 = validScores.some((s) => s < 2);
        if (count0 >= 2) result = 'ไม่ผ่าน';
        else if (count3 >= 6 && !hasBelow2) result = 'ดีเยี่ยม';
        else if (count2up >= 6 && count0 === 0) result = 'ดี';
        else result = 'ผ่าน';
      }
      body.push([
        index + 1,
        text(student.studentId || student.id),
        text(student.name || student.fullName),
        scores.thai !== '' && scores.thai != null ? scores.thai : '-',
        scores.math !== '' && scores.math != null ? scores.math : '-',
        scores.science !== '' && scores.science != null ? scores.science : '-',
        scores.social !== '' && scores.social != null ? scores.social : '-',
        scores.health !== '' && scores.health != null ? scores.health : '-',
        scores.art !== '' && scores.art != null ? scores.art : '-',
        scores.work !== '' && scores.work != null ? scores.work : '-',
        scores.english !== '' && scores.english != null ? scores.english : '-',
        result
      ]);
    });

    const columnStyles = {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 54, halign: 'left', overflow: 'ellipsize' },
      3: { cellWidth: 11, halign: 'center' },
      4: { cellWidth: 11, halign: 'center' },
      5: { cellWidth: 11, halign: 'center' },
      6: { cellWidth: 11, halign: 'center' },
      7: { cellWidth: 11, halign: 'center' },
      8: { cellWidth: 11, halign: 'center' },
      9: { cellWidth: 11, halign: 'center' },
      10: { cellWidth: 11, halign: 'center' },
      11: { cellWidth: 20, halign: 'center' }
    };

    runAutoTable(doc, tableDefaults({
      startY,
      head,
      body: body.length ? body : [['', '', 'ไม่พบข้อมูลนักเรียน', '', '', '', '', '', '', '', '', '']],
      margin: { top: startY, left: 16, right: 6, bottom: 8 },
      styles: {
        font: 'Sarabun', fontStyle: 'normal', fontSize: 8.5, cellPadding: 1.2,
        lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0],
        valign: 'middle', halign: 'center', minCellHeight: 6.5, overflow: 'linebreak'
      },
      headStyles: {
        font: 'Sarabun', fontStyle: 'bold', fontSize: 8, cellPadding: 1,
        fillColor: [242, 242, 242], textColor: [0, 0, 0], valign: 'middle', halign: 'center'
      },
      columnStyles,
      didDrawPage(data) {
        if (data.pageNumber > 1) drawHeader(doc, title, meta, logo);
      }
    }));

    addSignatures(doc, meta, doc.lastAutoTable?.finalY || startY);
    addDocumentPageNumbers(doc);
    doc.setProperties({ title, subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    const blobUrl = finish(doc, meta);
    const dataUri = doc.output('datauristring');
    return { blobUrl, dataUri };
  }

  async function createCharacteristicReport(report, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    const title = 'รายงานการประเมินคุณลักษณะอันพึงประสงค์';
    drawHeader(doc, title, meta, logo);
    const startY = headerBottom(meta, logo, '');

    const head = [[
      { content: 'ที่', rowSpan: 2 },
      { content: 'ชื่อ - นามสกุล', rowSpan: 2 },
      { content: 'คุณลักษณะอันพึงประสงค์ 8 ประการ', colSpan: 8 },
      { content: 'รวม', rowSpan: 2 },
      { content: 'เฉลี่ย', rowSpan: 2 },
      { content: 'ผลการประเมิน', rowSpan: 2 }
    ], [
      '1.รักชาติฯ', '2.ซื่อสัตย์ฯ', '3.มีวินัย', '4.ใฝ่เรียนรู้',
      '5.พอเพียง', '6.มุ่งมั่นฯ', '7.รักไทย', '8.จิตสาธารณะ'
    ]];

    let excellentCount = 0;
    let goodCount = 0;
    let passCount = 0;
    let improveCount = 0;

    const body = [];
    (report?.students || []).forEach((student, index) => {
      const rawScores = Array.isArray(student.scores) ? student.scores : Array(8).fill('');
      const scores = Array.from({ length: 8 }, (_, i) => {
        const val = rawScores[i];
        return val !== '' && val !== null && val !== undefined && !isNaN(Number(val)) ? Number(val) : '';
      });
      const validScores = scores.filter((s) => s !== '');
      const total = validScores.length === 8 ? validScores.reduce((a, b) => a + b, 0) : '';
      const avg = validScores.length === 8 ? (total / 8).toFixed(2) : '';
      let result = '-';
      if (avg !== '') {
        const avgNum = parseFloat(avg);
        if (avgNum >= 2.5) {
          result = 'ดีเยี่ยม';
          excellentCount++;
        } else if (avgNum >= 2.0) {
          result = 'ดี';
          goodCount++;
        } else if (avgNum >= 1.0) {
          result = 'ผ่าน';
          passCount++;
        } else {
          result = 'ปรับปรุง';
          improveCount++;
        }
      }
      body.push([
        index + 1,
        text(student.name || student.fullName),
        scores[0] !== '' ? scores[0] : '-',
        scores[1] !== '' ? scores[1] : '-',
        scores[2] !== '' ? scores[2] : '-',
        scores[3] !== '' ? scores[3] : '-',
        scores[4] !== '' ? scores[4] : '-',
        scores[5] !== '' ? scores[5] : '-',
        scores[6] !== '' ? scores[6] : '-',
        scores[7] !== '' ? scores[7] : '-',
        total !== '' ? total : '-',
        avg !== '' ? avg : '-',
        result
      ]);
    });

    const columnStyles = {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 50, halign: 'left', overflow: 'ellipsize' },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 12, halign: 'center' },
      5: { cellWidth: 12, halign: 'center' },
      6: { cellWidth: 12, halign: 'center' },
      7: { cellWidth: 12, halign: 'center' },
      8: { cellWidth: 12, halign: 'center' },
      9: { cellWidth: 12, halign: 'center' },
      10: { cellWidth: 10, halign: 'center' },
      11: { cellWidth: 11, halign: 'center' },
      12: { cellWidth: 15, halign: 'center' }
    };

    runAutoTable(doc, tableDefaults({
      startY,
      head,
      body: body.length ? body : [['', 'ไม่พบข้อมูลนักเรียน', '', '', '', '', '', '', '', '', '', '', '']],
      margin: { top: startY, left: 16, right: 6, bottom: 8 },
      styles: {
        font: 'Sarabun', fontStyle: 'normal', fontSize: 8, cellPadding: 1,
        lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0],
        valign: 'middle', halign: 'center', minCellHeight: 6, overflow: 'linebreak'
      },
      headStyles: {
        font: 'Sarabun', fontStyle: 'bold', fontSize: 7.2, cellPadding: 0.8,
        fillColor: [242, 242, 242], textColor: [0, 0, 0], valign: 'middle', halign: 'center'
      },
      columnStyles,
      didDrawPage(data) {
        if (data.pageNumber > 1) drawHeader(doc, title, meta, logo);
      }
    }));

    let finalY = doc.lastAutoTable?.finalY || startY;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();

    if (finalY + 38 > pageHeight) {
      doc.addPage('a4', 'portrait');
      finalY = 20;
    }

    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8.5);
    doc.text(`สรุปผลการประเมิน: ดีเยี่ยม ${excellentCount} คน | ดี ${goodCount} คน | ผ่าน ${passCount} คน | ปรับปรุง ${improveCount} คน | รวมทั้งหมด ${(report?.students || []).length} คน`, pageWidth / 2, finalY + 6, { align: 'center' });

    addSignatures(doc, meta, finalY + 8);
    addDocumentPageNumbers(doc);
    doc.setProperties({ title, subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    const blobUrl = finish(doc, meta);
    const dataUri = doc.output('datauristring');
    return { blobUrl, dataUri };
  }

  async function createActivityReport(report, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    const title = 'รายงานการประเมินกิจกรรมพัฒนาผู้เรียน';
    drawHeader(doc, title, meta, logo);
    const startY = headerBottom(meta, logo, '');

    const head = [[
      'ที่', 'ชื่อ - นามสกุล', 'แนะแนว', 'ลูกเสือ/เนตรนารี', 'ชุมนุม', 'ชื่อชุมนุม', 'เพื่อสังคมฯ', 'สรุปผล'
    ]];

    let passCount = 0;
    let failCount = 0;
    let pendingCount = 0;

    const body = [];
    (report?.students || []).forEach((student, index) => {
      const act = student.activities || {};
      const guidance = act.guidance || '-';
      const scout = act.scout || '-';
      const club = act.club || '-';
      const clubName = act.clubName || '';
      const social = act.social || '-';
      const overall = act.overall || '-';

      if (overall === 'ผ่าน') passCount++;
      else if (overall === 'ไม่ผ่าน') failCount++;
      else pendingCount++;

      body.push([
        index + 1,
        text(student.name || student.fullName),
        guidance,
        scout,
        club,
        clubName || '-',
        social,
        overall
      ]);
    });

    const columnStyles = {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 48, halign: 'left', overflow: 'ellipsize' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 26, halign: 'center' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 28, halign: 'left', overflow: 'ellipsize' },
      6: { cellWidth: 22, halign: 'center' },
      7: { cellWidth: 20, halign: 'center' }
    };

    runAutoTable(doc, tableDefaults({
      startY,
      head,
      body: body.length ? body : [['', 'ไม่พบข้อมูลนักเรียน', '', '', '', '', '', '']],
      margin: { top: startY, left: 16, right: 6, bottom: 8 },
      styles: {
        font: 'Sarabun', fontStyle: 'normal', fontSize: 8.5, cellPadding: 1.2,
        lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0],
        valign: 'middle', halign: 'center', minCellHeight: 6.5, overflow: 'linebreak'
      },
      headStyles: {
        font: 'Sarabun', fontStyle: 'bold', fontSize: 8, cellPadding: 1,
        fillColor: [242, 242, 242], textColor: [0, 0, 0], valign: 'middle', halign: 'center'
      },
      columnStyles,
      didDrawPage(data) {
        if (data.pageNumber > 1) drawHeader(doc, title, meta, logo);
      }
    }));

    let finalY = doc.lastAutoTable?.finalY || startY;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();

    if (finalY + 38 > pageHeight) {
      doc.addPage('a4', 'portrait');
      finalY = 20;
    }

    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8.5);
    doc.text(`เกณฑ์: ผ่าน = เข้าร่วมกิจกรรมครบตามเกณฑ์ | ไม่ผ่าน = เข้าร่วมกิจกรรมไม่ครบตามเกณฑ์`, pageWidth / 2, finalY + 5, { align: 'center' });
    doc.setFont('Sarabun', 'bold');
    doc.text(`สรุปผลการประเมิน: ผ่าน ${passCount} คน | ไม่ผ่าน ${failCount} คน | ยังไม่ประเมิน ${pendingCount} คน | รวมทั้งหมด ${(report?.students || []).length} คน`, pageWidth / 2, finalY + 10, { align: 'center' });

    addSignatures(doc, meta, finalY + 12);
    addDocumentPageNumbers(doc);
    doc.setProperties({ title, subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    const blobUrl = finish(doc, meta);
    const dataUri = doc.output('datauristring');
    return { blobUrl, dataUri };
  }

  async function createCompetencyReport(report, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    const title = 'รายงานการประเมินสมรรถนะสำคัญของผู้เรียน';
    drawHeader(doc, title, meta, logo);
    const startY = headerBottom(meta, logo, '');

    const head = [[
      { content: 'ที่', rowSpan: 2 },
      { content: 'ชื่อ - นามสกุล', rowSpan: 2 },
      { content: 'สมรรถนะสำคัญ 5 ด้าน (คะแนนเฉลี่ย)', colSpan: 5 },
      { content: 'รวม', rowSpan: 2 },
      { content: 'เฉลี่ย', rowSpan: 2 },
      { content: 'ผลประเมิน', rowSpan: 2 }
    ], [
      'การสื่อสาร', 'การคิด', 'แก้ปัญหา', 'ทักษะชีวิต', 'เทคโนโลยี'
    ]];

    const body = [];
    (report?.students || []).forEach((student, index) => {
      const rawScores = Array.isArray(student.scores) ? student.scores : Array(25).fill('');
      const scores = Array.from({ length: 25 }, (_, i) => {
        const val = rawScores[i];
        return val !== '' && val !== null && val !== undefined && !isNaN(Number(val)) ? Number(val) : '';
      });

      const competencyAvgs = [];
      for (let c = 0; c < 5; c++) {
        const part = scores.slice(c * 5, c * 5 + 5);
        const validPart = part.filter((s) => s !== '');
        if (validPart.length === 5) {
          const sum = validPart.reduce((a, b) => a + b, 0);
          competencyAvgs.push((sum / 5).toFixed(2));
        } else {
          competencyAvgs.push('-');
        }
      }

      const validAll = scores.filter((s) => s !== '');
      let totalSum = '-';
      let totalAvg = '-';
      let result = '-';

      if (validAll.length === 25) {
        const sum = validAll.reduce((a, b) => a + b, 0);
        const avg = sum / 25;
        totalSum = sum;
        totalAvg = avg.toFixed(2);
        if (avg >= 2.5) result = 'ดีเยี่ยม';
        else if (avg >= 2.0) result = 'ดี';
        else if (avg >= 1.0) result = 'ผ่าน';
        else result = 'ปรับปรุง';
      }

      body.push([
        index + 1,
        text(student.name || student.fullName),
        competencyAvgs[0],
        competencyAvgs[1],
        competencyAvgs[2],
        competencyAvgs[3],
        competencyAvgs[4],
        totalSum,
        totalAvg,
        result
      ]);
    });

    const columnStyles = {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 62, halign: 'left', overflow: 'ellipsize' },
      2: { cellWidth: 26, halign: 'center' },
      3: { cellWidth: 26, halign: 'center' },
      4: { cellWidth: 26, halign: 'center' },
      5: { cellWidth: 26, halign: 'center' },
      6: { cellWidth: 26, halign: 'center' },
      7: { cellWidth: 18, halign: 'center' },
      8: { cellWidth: 18, halign: 'center' },
      9: { cellWidth: 24, halign: 'center' }
    };

    runAutoTable(doc, tableDefaults({
      startY,
      head,
      body: body.length ? body : [['', 'ไม่พบข้อมูลนักเรียน', '', '', '', '', '', '', '', '']],
      margin: { top: startY, left: 17.5, right: 17.5, bottom: 8 },
      styles: {
        font: 'Sarabun', fontStyle: 'normal', fontSize: 8.5, cellPadding: 1.2,
        lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0],
        valign: 'middle', halign: 'center', minCellHeight: 6, overflow: 'linebreak'
      },
      headStyles: {
        font: 'Sarabun', fontStyle: 'bold', fontSize: 8, cellPadding: 1.2,
        fillColor: [242, 242, 242], textColor: [0, 0, 0], valign: 'middle', halign: 'center'
      },
      columnStyles,
      didDrawPage(data) {
        if (data.pageNumber > 1) drawHeader(doc, title, meta, logo);
      }
    }));

    let finalY = doc.lastAutoTable?.finalY || startY;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();

    if (finalY + 38 > pageHeight) {
      doc.addPage('a4', 'landscape');
      finalY = 20;
    }

    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8.5);
    doc.text(`เกณฑ์การให้คะแนน: ดีเยี่ยม = 3 | ดี = 2 | พอใช้ = 1 | ปรับปรุง = 0    เกณฑ์ผลประเมิน: ดีเยี่ยม ≥ 2.50 | ดี ≥ 2.00 | ผ่าน ≥ 1.00 | ปรับปรุง < 1.00`, pageWidth / 2, finalY + 5, { align: 'center' });

    addSignatures(doc, meta, finalY + 8);
    addDocumentPageNumbers(doc);
    doc.setProperties({ title, subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    const blobUrl = finish(doc, meta);
    const dataUri = doc.output('datauristring');
    return { blobUrl, dataUri };
  }

  async function createCompetencySummaryReport(report, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    const title = 'รายงานสรุปผลการประเมินสมรรถนะสำคัญของผู้เรียน';
    drawHeader(doc, title, meta, logo);
    const startY = headerBottom(meta, logo, '');

    const competencyNames = [
      'ความสามารถในการสื่อสาร',
      'ความสามารถในการคิด',
      'ความสามารถในการแก้ปัญหา',
      'ความสามารถในการใช้ทักษะชีวิต',
      'ความสามารถในการใช้เทคโนโลยี'
    ];

    const students = report?.students || [];
    const stats = competencyNames.map((name, c) => {
      let excellent = 0, good = 0, pass = 0, improve = 0;
      students.forEach((stu) => {
        const scores = Array.isArray(stu.scores) ? stu.scores : Array(25).fill('');
        const part = scores.slice(c * 5, c * 5 + 5).map((s) => Number(s) || 0);
        const avg = part.reduce((a, b) => a + b, 0) / 5;
        if (avg >= 2.5) excellent++;
        else if (avg >= 2.0) good++;
        else if (avg >= 1.0) pass++;
        else improve++;
      });
      return { name, excellent, good, pass, improve, total: students.length };
    });

    let overallExcellent = 0, overallGood = 0, overallPass = 0, overallImprove = 0;
    students.forEach((stu) => {
      const scores = Array.isArray(stu.scores) ? stu.scores : Array(25).fill('');
      const all = scores.map((s) => Number(s) || 0);
      const totalAvg = all.reduce((a, b) => a + b, 0) / 25;
      if (totalAvg >= 2.5) overallExcellent++;
      else if (totalAvg >= 2.0) overallGood++;
      else if (totalAvg >= 1.0) overallPass++;
      else overallImprove++;
    });

    const head = [[
      'ที่', 'สมรรถนะสำคัญของผู้เรียน', 'ดีเยี่ยม (คน)', 'ดี (คน)', 'ผ่าน (คน)', 'ปรับปรุง (คน)', 'รวม (คน)'
    ]];

    const body = stats.map((item, index) => [
      index + 1,
      item.name,
      item.excellent,
      item.good,
      item.pass,
      item.improve,
      item.total
    ]);

    body.push([
      '',
      'สรุปผลการประเมินภาพรวม',
      overallExcellent,
      overallGood,
      overallPass,
      overallImprove,
      students.length
    ]);

    const columnStyles = {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 70, halign: 'left' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 20, halign: 'center' },
      6: { cellWidth: 20, halign: 'center' }
    };

    runAutoTable(doc, tableDefaults({
      startY,
      head,
      body,
      margin: { top: startY, left: 15, right: 15, bottom: 8 },
      styles: {
        font: 'Sarabun', fontStyle: 'normal', fontSize: 9, cellPadding: 2.2,
        lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0],
        valign: 'middle', halign: 'center', minCellHeight: 7
      },
      headStyles: {
        font: 'Sarabun', fontStyle: 'bold', fontSize: 8.5, cellPadding: 1.8,
        fillColor: [242, 242, 242], textColor: [0, 0, 0], valign: 'middle', halign: 'center'
      },
      columnStyles,
      didDrawPage(data) {
        if (data.pageNumber > 1) drawHeader(doc, title, meta, logo);
      }
    }));

    let finalY = doc.lastAutoTable?.finalY || startY;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(9.5);
    doc.text(`ภาพรวมผลการประเมิน: ดีเยี่ยม ${overallExcellent} คน | ดี ${overallGood} คน | ผ่าน ${overallPass} คน | ปรับปรุง ${overallImprove} คน`, pageWidth / 2, finalY + 6, { align: 'center' });

    if (finalY + 44 > pageHeight) {
      doc.addPage('a4', 'portrait');
      finalY = 20;
    }

    addSignatures(doc, meta, finalY + 12);
    addDocumentPageNumbers(doc);
    doc.setProperties({ title, subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    const blobUrl = finish(doc, meta);
    const dataUri = doc.output('datauristring');
    return { blobUrl, dataUri };
  }

  function drawPp5CoverPage(doc, report, meta, logo) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 1. Top Logo
    let y = 12;
    if (logo) {
      const logoW = 24;
      const logoH = 24;
      doc.addImage(logo, 'PNG', (pageWidth - logoW) / 2, y, logoW, logoH, undefined, 'FAST');
      y += 28;
    } else {
      y += 8;
    }

    // 2. Titles & Headers
    doc.setTextColor(0, 0, 0);
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(14);
    doc.text('แบบรายงานผลการพัฒนาคุณภาพผู้เรียน (ปพ.5)', pageWidth / 2, y, { align: 'center' });
    y += 6.5;

    doc.setFontSize(12.5);
    doc.text(meta.schoolName || 'โรงเรียน', pageWidth / 2, y, { align: 'center' });
    y += 5.5;

    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9.5);
    const affiliation = meta.affiliation || ''; // ไม่มีค่าสำรองเป็นสังกัดของโรงเรียนใดโรงเรียนหนึ่ง
    if (affiliation) {
      doc.text(affiliation, pageWidth / 2, y, { align: 'center' });
      y += 5.5;
    }

    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(11.5);
    const academicYear = text(report?.academicYear || meta.academicYear || '2569');
    doc.text(`ปีการศึกษา ${academicYear}`, pageWidth / 2, y, { align: 'center' });
    y += 5.5;

    doc.setFontSize(10.5);
    const gradeRaw = text(report?.grade || meta.grade || '');
    const gradeDigit = gradeRaw.replace(/[^\d]/g, '') || '3';
    const gradeText = text(report?.gradeFullName || (gradeRaw.startsWith('ม.') ? `ชั้นมัธยมศึกษาปีที่ ${gradeDigit}` : gradeRaw.startsWith('อ.') ? `ชั้นอนุบาลปีที่ ${gradeDigit}` : `ชั้นประถมศึกษาปีที่ ${gradeDigit}`));
    const classText = text(report?.classNo || meta.classNo || '1');
    const students = report?.students || [];
    const studentCount = number(report?.studentCount, students.length);
    doc.text(`${gradeText} ห้อง ${classText}   จำนวนนักเรียน ${studentCount} คน`, pageWidth / 2, y, { align: 'center' });
    y += 5;

    // 3. Table 1: ระดับผลการเรียนรายวิชา (คน)
    const defaultSubjectOrder = [
      'ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์และเทคโนโลยี', 'สังคมศึกษา ศาสนา และวัฒนธรรม',
      'ประวัติศาสตร์', 'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'การงานอาชีพ', 'ภาษาอังกฤษ',
      'หน้าที่พลเมือง', 'การป้องกันการทุจริต'
    ];

    const rawSubjects = report?.subjectSummary || [];
    const subjectList = rawSubjects;

    // ปพ.5 ประถมพิมพ์ผลสิ้นปี: นักเรียนที่ยังไม่มีผลครบทั้งปี (หรือได้ ร/มส) อยู่ในช่อง "รอผล"
    // ไม่ใช่หายไปจากตาราง  ถ้า payload เก่าไม่มี pending ให้คำนวณจากจำนวนนักเรียนที่เหลือ
    const pendingOf = (c) => {
      if (c.pending !== undefined && c.pending !== null) return Number(c.pending) || 0;
      const graded = ['4', '3.5', '3', '2.5', '2', '1.5', '1', '0'].reduce((sum, key) => sum + (Number(c[key]) || 0), 0);
      return Math.max(0, number(report?.studentCount, (report?.students || []).length) - graded);
    };
    const subjectRows = subjectList.map((sub, idx) => {
      const c = sub.count || {};
      return [
        idx + 1,
        text(sub.name || sub.subjectName),
        c['4'] || 0,
        c['3.5'] || 0,
        c['3'] || 0,
        c['2.5'] || 0,
        c['2'] || 0,
        c['1.5'] || 0,
        c['1'] || 0,
        c['0'] || 0,
        pendingOf(c)
      ];
    });
    const anySubjectPending = subjectList.some((sub) => pendingOf(sub.count || {}) > 0);

    runAutoTable(doc, tableDefaults({
      startY: y,
      head: [
        [
          { content: 'ที่', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
          { content: 'ชื่อวิชา', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
          { content: 'ระดับผลการเรียนรายวิชา สิ้นปีการศึกษา (คน)', colSpan: 8, styles: { halign: 'center' } },
          { content: 'รอผล', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } }
        ],
        ['4', '3.5', '3', '2.5', '2', '1.5', '1', '0']
      ],
      body: subjectRows,
      margin: { left: 10, right: 10, bottom: 4 },
      styles: { font: 'Sarabun', fontSize: 9.5, cellPadding: 2.0, halign: 'center', valign: 'middle', textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
      headStyles: { font: 'Sarabun', fontStyle: 'bold', fontSize: 9.5, fillColor: [245, 245, 245], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 56, halign: 'left' },
        2: { cellWidth: 14 },
        3: { cellWidth: 14 },
        4: { cellWidth: 14 },
        5: { cellWidth: 14 },
        6: { cellWidth: 14 },
        7: { cellWidth: 14 },
        8: { cellWidth: 14 },
        9: { cellWidth: 14 },
        10: { cellWidth: 12 }
      }
    }));

    // 4. Section Title: การประเมินผลแบบบูรณาการ
    const endTable1Y = doc.lastAutoTable?.finalY || (y + 75);
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(12);
    doc.text('การประเมินผลแบบบูรณาการ', pageWidth / 2, endTable1Y + 7.5, { align: 'center' });

    // 5. Table 2: การประเมินผลแบบบูรณาการ
    const reading = report?.reading || {};
    const attributes = report?.attributes || {};
    const activity = report?.activity || {};

    const calcPct = (cnt) => studentCount > 0 ? ((Number(cnt) || 0) / studentCount * 100).toFixed(1) : '0.0';

    const actPass = Number(activity['ผ่าน'] || 0);
    const actFail = Number(activity['ไม่ผ่าน'] || 0);
    const actPending = Math.max(0, studentCount - actPass - actFail);
    const readingAssessed = ['level3', 'level2', 'level1', 'level0'].reduce((sum, key) => sum + (Number(reading[key]) || 0), 0);
    const readingPending = Math.max(0, studentCount - readingAssessed);
    const attributesAssessed = ['ดีเยี่ยม', 'ดี', 'ผ่าน', 'ไม่ผ่าน'].reduce((sum, key) => sum + (Number(attributes[key]) || 0), 0);
    const attributesPending = Math.max(0, studentCount - attributesAssessed);

    const assessBody = [
      [
        'ดีเยี่ยม', reading.level3 || 0, calcPct(reading.level3),
        'ดีเยี่ยม', attributes['ดีเยี่ยม'] || 0, calcPct(attributes['ดีเยี่ยม']),
        'ผ่าน', actPass, calcPct(actPass)
      ],
      [
        'ดี', reading.level2 || 0, calcPct(reading.level2),
        'ดี', attributes['ดี'] || 0, calcPct(attributes['ดี']),
        'ไม่ผ่าน', actFail, calcPct(actFail)
      ],
      [
        'ผ่านเกณฑ์', reading.level1 || 0, calcPct(reading.level1),
        'ผ่านเกณฑ์', attributes['ผ่าน'] || 0, calcPct(attributes['ผ่าน']),
        'ยังไม่ประเมิน', actPending, calcPct(actPending)
      ],
      [
        'ไม่ผ่านเกณฑ์', reading.level0 || 0, calcPct(reading.level0),
        'ไม่ผ่านเกณฑ์', attributes['ไม่ผ่าน'] || 0, calcPct(attributes['ไม่ผ่าน']),
        '', '', ''
      ],
      // นักเรียนที่ยังประเมินไม่ครบต้องปรากฏในตาราง ไม่ใช่หายไปเฉย ๆ (ร้อยละรวมจึงครบ 100)
      [
        'ยังไม่ประเมิน', readingPending, calcPct(readingPending),
        'ยังไม่ประเมิน', attributesPending, calcPct(attributesPending),
        '', '', ''
      ]
    ];

    runAutoTable(doc, tableDefaults({
      startY: endTable1Y + 11,
      head: [
        [
          { content: 'การอ่าน คิดวิเคราะห์และเขียน', colSpan: 3, styles: { halign: 'center' } },
          { content: 'คุณลักษณะอันพึงประสงค์', colSpan: 3, styles: { halign: 'center' } },
          { content: 'กิจกรรมพัฒนาผู้เรียน', colSpan: 3, styles: { halign: 'center' } }
        ],
        ['ระดับคุณภาพ', 'คน', 'ร้อยละ', 'ระดับคุณภาพ', 'คน', 'ร้อยละ', 'การผ่าน', 'คน', 'ร้อยละ']
      ],
      body: assessBody,
      margin: { left: 10, right: 10, bottom: 4 },
      styles: { font: 'Sarabun', fontSize: 9.5, cellPadding: 2.2, halign: 'center', valign: 'middle', textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
      headStyles: { font: 'Sarabun', fontStyle: 'bold', fontSize: 9.5, fillColor: [245, 245, 245], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
      columnStyles: {
        0: { cellWidth: 26, halign: 'center' },
        1: { cellWidth: 18.5 },
        2: { cellWidth: 18.5 },
        3: { cellWidth: 26, halign: 'center' },
        4: { cellWidth: 18.5 },
        5: { cellWidth: 18.5 },
        6: { cellWidth: 27, halign: 'center' },
        7: { cellWidth: 18.5 },
        8: { cellWidth: 18.5 }
      }
    }));

    // 6. Signatures & Checkboxes
    const endTable2Y = doc.lastAutoTable?.finalY || (endTable1Y + 45);

    // ปพ.5 ประถมพิมพ์ผลสิ้นปีการศึกษา: บอกชัดว่าตัวเลขคือผลอะไร และถ้ายังมีรอผลให้เห็นทันที
    {
      const notes = [`* ผลการเรียนสิ้นปีการศึกษา ${academicYear} (เฉลี่ยภาคเรียนที่ 1 และ 2) และผลการประเมินประจำปีการศึกษา ${academicYear}`];
      if (anySubjectPending) notes.push('  รอผล = ยังไม่มีผลครบทั้งปี (ต้องมีคะแนนสอบปลายภาคครบทั้ง 2 ภาคเรียน) หรือได้ ร / มส');
      doc.setFont('Sarabun', 'normal');
      doc.setFontSize(8);
      notes.forEach((line, i) => doc.text(line, 10, endTable2Y + 4 + i * 3.6));
    }

    // ตราประทับวางเหนือเส้น "ลงชื่อ" (ทับลายเซ็นตามธรรมเนียม) จึงยกแถวเช็คบ็อกซ์ขึ้นไปให้พ้นตรา
    // และไม่ให้ตราลงไปทับชื่อ/ตำแหน่งผู้อำนวยการด้านล่าง
    const sigY = Math.max(endTable2Y + 36, pageHeight - 30);

    // ชื่อผู้ลงนามมาจากหน้าตั้งค่าของแต่ละโรงเรียน ไม่มีค่าสำรองเป็นชื่อคนจริง (เดิมใส่ชื่อบุคลากรของโรงเรียนต้นแบบไว้
    // ทำให้โรงเรียนอื่นที่ยังไม่กรอกได้ชื่อคนอื่นในเอกสาร) ว่าง = เส้นจุดให้ลงชื่อด้วยมือ
    const blankSigner = '...................................';
    const teacherName = text(report?.teacherName || meta.classTeacher || meta.homeroomTeacher || blankSigner);
    const academicHead = text(meta.academicHead || blankSigner);
    const directorName = text(meta.directorName || blankSigner);
    const directorPosition = text(meta.directorPosition || `ผู้อำนวยการ${meta.schoolName || 'โรงเรียน'}`);

    const col1 = pageWidth * 0.22;
    const col2 = pageWidth * 0.50;
    const col3 = pageWidth * 0.78;

    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);

    // Checkboxes above Column 2 (หัวหน้างานวิชาการ)
    const cbY2 = sigY - 21;
    doc.setLineWidth(0.2);
    doc.setDrawColor(0, 0, 0);
    doc.rect(col2 - 30, cbY2 - 3.0, 3.0, 3.0);
    doc.text('เห็นควรอนุมัติ', col2 - 25, cbY2);
    doc.rect(col2 + 3, cbY2 - 3.0, 3.0, 3.0);
    doc.text('เห็นควรปรับปรุง', col2 + 8, cbY2);

    // Checkboxes above Column 3 (ผู้อำนวยการ)
    const cbY3 = sigY - 21;
    doc.rect(col3 - 23, cbY3 - 3.0, 3.0, 3.0);
    doc.text('อนุมัติ', col3 - 18, cbY3);
    doc.rect(col3 + 2, cbY3 - 3.0, 3.0, 3.0);
    doc.text('ไม่อนุมัติ', col3 + 7, cbY3);

    // Column 1: ครูประจำชั้น
    if (meta?.includeSignatures !== false && (meta?.teacherSignature || report?.teacherSignature)) {
      try {
        doc.addImage(meta.teacherSignature || report.teacherSignature, 'PNG', col1 - 15, sigY - 8.5, 30, 9.5);
      } catch (_) {}
    }
    doc.text('ลงชื่อ................................................', col1, sigY, { align: 'center' });
    doc.text(`(${teacherName})`, col1, sigY + 6, { align: 'center' });
    doc.text('ครูประจำชั้น', col1, sigY + 11.5, { align: 'center' });

    // Column 2: หัวหน้างานวิชาการ
    if (meta?.includeSignatures !== false && (meta?.academicHeadSignature || report?.academicHeadSignature)) {
      try {
        doc.addImage(meta.academicHeadSignature || report.academicHeadSignature, 'PNG', col2 - 15, sigY - 8.5, 30, 9.5);
      } catch (_) {}
    }
    doc.text('ลงชื่อ................................................', col2, sigY, { align: 'center' });
    doc.text(`(${academicHead})`, col2, sigY + 6, { align: 'center' });
    doc.text('หัวหน้างานวิชาการ', col2, sigY + 11.5, { align: 'center' });

    // Column 3: ผู้อำนวยการโรงเรียน & ตราประทับ
    // ตราประทับอยู่ระหว่างแถวเช็คบ็อกซ์ (สิ้นสุดที่ sigY-21) กับเส้น "ลงชื่อ" (sigY):
    // ไม่ทับ "อนุมัติ/ไม่อนุมัติ" ด้านบน และไม่ทับชื่อ (sigY+6) / ตำแหน่ง (sigY+11.5) ด้านล่าง
    if (meta?.includeSignatures !== false && (meta?.schoolStamp || report?.schoolStamp)) {
      try {
        const stampSize = 17;
        doc.addImage(meta.schoolStamp || report.schoolStamp, 'PNG', col3 - stampSize / 2, sigY - 19, stampSize, stampSize);
      } catch (_) {}
    }
    if (meta?.includeSignatures !== false && (meta?.directorSignature || report?.directorSignature)) {
      try {
        doc.addImage(meta.directorSignature || report.directorSignature, 'PNG', col3 - 15, sigY - 8.5, 30, 9.5);
      } catch (_) {}
    }
    doc.text('ลงชื่อ................................................', col3, sigY, { align: 'center' });
    doc.text(`(${directorName})`, col3, sigY + 6, { align: 'center' });
    doc.text(directorPosition, col3, sigY + 11.5, { align: 'center' });
  }

  async function createPp5Cover(report, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    drawPp5CoverPage(doc, report, meta, logo);
    doc.setProperties({ title: 'ปก ปพ.5 รวมวิชา', subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    const blobUrl = finish(doc, meta);
    const dataUri = doc.output('datauristring');
    return { blobUrl, dataUri };
  }

  // ---- ปก ปพ.5 แบบรายวิชา "แบบบันทึกผลการเรียนประจำรายวิชา" (owner 2026-10-14, ตามตัวอย่างที่เจ้าของส่งมา)
  // หน้าละ 1 วิชา: หัวกระดาษ + ข้อมูลวิชา (ช่องจุด) + ตารางสรุปผลการเรียน + ตารางคุณลักษณะ/อ่านคิดวิเคราะห์ฯ + ลงนาม
  // ข้อมูลมาจาก gas-bridge computePp5SubjectSheets  หัวหน้างานวัดผล = หัวหน้าฝ่ายวิชาการ (ช่องลงนามเดียว)
  function pp5GradeFullName(grade) {
    const g = text(grade);
    const n = g.replace(/[^\d]/g, '');
    if (g.startsWith('ม.')) return `มัธยมศึกษาปีที่ ${n}`;
    if (g.startsWith('อ.')) return `อนุบาลปีที่ ${n}`;
    if (g.startsWith('ป.')) return `ประถมศึกษาปีที่ ${n}`;
    return g;
  }

  // วรรณยุกต์ซ้อนสระบน (owner 2026-10-14: "ที่ตั้ง พื้นฐาน ครูประจำชั้น อ่านไม่ออก"): jsPDF ไม่จัดตำแหน่งเครื่องหมายไทย
  // (ไม่มี GPOS) และ Sarabun ไม่มีรูปวรรณยุกต์ยกสูงใน PUA — วรรณยุกต์ที่ตามหลังสระบน (ั ิ ี ึ ื ็ ํ) หรืออยู่หน้า ำ
  // จึงทับสระ  แก้ที่เอกสารนี้: ครอบ doc.text ให้วาดข้อความโดยถอดวรรณยุกต์ตัวนั้นออก แล้ววาดวรรณยุกต์แยกยกขึ้น
  // ตรงตำแหน่งเดิม (เครื่องหมายไทยใน Sarabun กว้าง 0 จึงวางที่ความกว้างของข้อความก่อนหน้าได้)  ใช้ได้ทั้ง doc.text
  // และข้อความในตาราง autotable ซึ่งเรียก doc.text ของเอกสารเดียวกัน
  const THAI_UPPER_VOWELS = new Set([0x0E31, 0x0E34, 0x0E35, 0x0E36, 0x0E37, 0x0E47, 0x0E4D]);
  const THAI_SARA_AM = 0x0E33;
  const isThaiTone = (code) => code >= 0x0E48 && code <= 0x0E4C;
  function splitLiftedThaiMarks(line) {
    const chars = Array.from(String(line));
    let base = '';
    const marks = [];
    chars.forEach((ch, i) => {
      const code = ch.codePointAt(0);
      const prev = i > 0 ? chars[i - 1].codePointAt(0) : 0;
      const next = i + 1 < chars.length ? chars[i + 1].codePointAt(0) : 0;
      if (isThaiTone(code) && (THAI_UPPER_VOWELS.has(prev) || next === THAI_SARA_AM)) marks.push({ at: base.length, ch });
      else base += ch;
    });
    return { base, marks };
  }
  // ใช้กับทุก PDF ผ่าน installFonts (owner 2026-10-14 "ไล่เลยทีละข้อ": วรรณยุกต์ทับสระใน PDF อื่นด้วย) — เรียกซ้ำไม่ซ้อน
  // ข้อความที่ส่ง maxWidth มา (ตัดบรรทัดตามความกว้าง) ตัดบรรทัดเองก่อนแล้ววาดทีละบรรทัด ยกเว้นจัดเต็มแนว (justify) และ
  // ข้อความเอียง (angle เช่น ลายน้ำ) ซึ่งส่งต่อให้ jsPDF ตามเดิม
  function liftThaiToneMarks(doc) {
    if (!doc || doc.__pp5LiftedThai) return doc;
    doc.__pp5LiftedThai = true;
    const original = doc.text.bind(doc);
    doc.text = function liftedText(value, x, y, options, ...rest) {
      const opts = options && typeof options === 'object' ? options : {};
      let lines = Array.isArray(value) ? value.map((v) => String(v ?? '')) : [String(value ?? '')];
      if (typeof x !== 'number' || typeof y !== 'number' || opts.angle || opts.align === 'justify'
        || !lines.some((line) => splitLiftedThaiMarks(line).marks.length)) {
        return original(value, x, y, options, ...rest);
      }
      if (opts.maxWidth) lines = lines.flatMap((line) => doc.splitTextToSize(line, opts.maxWidth));
      const scale = doc.internal.scaleFactor;
      const fontSize = doc.getFontSize();
      const factor = Number(opts.lineHeightFactor) || (doc.getLineHeightFactor ? doc.getLineHeightFactor() : 1.15);
      const lineHeight = (fontSize * factor) / scale;
      const rise = (fontSize / scale) * 0.24;
      const align = opts.align === 'center' || opts.align === 'right' ? opts.align : 'left';
      const plain = { ...opts, align: 'left' };
      delete plain.maxWidth;
      lines.forEach((line, row) => {
        const { base, marks } = splitLiftedThaiMarks(line);
        const width = doc.getTextWidth(base);
        const startX = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
        const lineY = y + row * lineHeight;
        original(base, startX, lineY, plain);
        marks.forEach((mark) => original(mark.ch, startX + doc.getTextWidth(base.slice(0, mark.at)), lineY - rise, plain));
      });
      return doc;
    };
    return doc;
  }

  function drawPp5SubjectSheet(doc, report, sheet, meta, logo) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const left = 10;
    const blank = '...................................';
    doc.setTextColor(0, 0, 0);
    // หัวกระดาษแบบเดียวกับปก ปพ.5 รายชั้น (drawPp5CoverPage): ตรากลาง ชื่อเอกสาร โรงเรียน สังกัด ปีการศึกษา ชั้น/ห้อง/จำนวนนักเรียน
    let y = 12;
    if (logo) {
      try { doc.addImage(logo, 'PNG', (pageWidth - 22) / 2, y, 22, 22, undefined, 'FAST'); } catch (_) {}
      y += 26;
    } else {
      y += 8;
    }
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(14);
    doc.text('แบบบันทึกผลการเรียนประจำรายวิชา', pageWidth / 2, y, { align: 'center' });
    y += 6.5;
    doc.setFontSize(12.5);
    doc.text(meta.schoolName || 'โรงเรียน', pageWidth / 2, y, { align: 'center' });
    y += 5.5;
    if (text(meta.affiliation)) {
      doc.setFont('Sarabun', 'normal');
      doc.setFontSize(9.5);
      doc.text(text(meta.affiliation), pageWidth / 2, y, { align: 'center' });
      y += 5.5;
    }
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(11.5);
    doc.text(`ปีการศึกษา ${text(report.academicYear)}`, pageWidth / 2, y, { align: 'center' });
    y += 5.5;
    doc.setFontSize(10.5);
    doc.text(`ชั้น${pp5GradeFullName(report.grade)} ห้อง ${text(report.classNo)}   จำนวนนักเรียน ${number(report.studentCount, 0)} คน`, pageWidth / 2, y, { align: 'center' });
    y += 3;

    // ข้อมูลรายวิชาเป็นตาราง (ป้ายพื้นเทาเหมือนหัวตารางของปกรายชั้น)
    const hours = text(sheet.hours) ? `${text(sheet.hours)} ชั่วโมง/${sheet.semester ? 'ภาคเรียน' : 'ปี'}` : '';
    const label = (content) => ({ content, styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } });
    runAutoTable(doc, tableDefaults({
      startY: y,
      body: [
        [label('รายวิชา'), text(sheet.name), label('รหัสวิชา'), text(sheet.code)],
        [label('กลุ่มสาระการเรียนรู้'), text(sheet.group), label('ประเภทวิชา'), text(sheet.type)],
        [label('เวลาเรียน'), hours, label('ครูผู้สอน'), text(sheet.teacher) || blank],
        [label('ครูประจำชั้น'), text(meta.classTeacher) || blank, label('ที่ตั้ง'), text(report.schoolAddress)]
      ],
      margin: { left, right: 10, bottom: 4 },
      styles: { font: 'Sarabun', fontSize: 9.5, cellPadding: 1.8, halign: 'left', valign: 'middle', textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 63 }, 2: { cellWidth: 24 }, 3: { cellWidth: 71 } }
    }));
    y = (doc.lastAutoTable?.finalY || y) + 2;

    const total = number(report.studentCount, 0);
    const pct = (n) => (total > 0 ? ((Number(n) || 0) / total * 100).toFixed(1) : '');
    const show = (n) => (Number(n) ? String(n) : '');
    const g = sheet.grades || {};
    const gradeKeys = ['4', '3.5', '3', '2.5', '2', '1.5', '1', '0', 'ร', 'มส'];
    const passGrades = ['4', '3.5', '3', '2.5', '2', '1.5', '1'].reduce((s, k) => s + (Number(g[k]) || 0), 0);
    const failGrades = ['0', 'ร', 'มส'].reduce((s, k) => s + (Number(g[k]) || 0), 0);
    const tableStyle = {
      margin: { left, right: 10, bottom: 4 },
      styles: { font: 'Sarabun', fontSize: 9.5, cellPadding: 1.6, halign: 'center', valign: 'middle', textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
      headStyles: { font: 'Sarabun', fontStyle: 'bold', fontSize: 9.5, fillColor: [245, 245, 245], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 }
    };
    // ช่องผลการเรียน/ผลการประเมินกว้างเท่ากันทุกช่อง (ไม่ยืดตามความยาวข้อความ)
    const cellWidth = (doc.internal.pageSize.getWidth() - left - 10 - 17) / 12;
    const equalColumns = { 0: { cellWidth: 17 } };
    for (let i = 1; i <= 12; i += 1) equalColumns[i] = { cellWidth };
    runAutoTable(doc, tableDefaults({
      ...tableStyle,
      startY: y + 2,
      head: [
        [{ content: 'จำนวน\nนักเรียน', rowSpan: 3 }, { content: 'สรุปผลการเรียน', colSpan: 12 }],
        [{ content: 'จำนวนนักเรียนที่ได้ระดับผลการเรียน', colSpan: 10 }, { content: 'ผ่าน\nการ\nประเมิน', rowSpan: 2, styles: { fontSize: 8.5, cellPadding: { top: 1.6, bottom: 1.6, left: 0.6, right: 0.6 } } }, { content: 'ไม่ผ่าน\nการ\nประเมิน', rowSpan: 2, styles: { fontSize: 8.5, cellPadding: { top: 1.6, bottom: 1.6, left: 0.6, right: 0.6 } } }],
        gradeKeys
      ],
      body: [
        [String(total), ...gradeKeys.map((k) => show(g[k])), show(passGrades), show(failGrades)],
        ['ร้อยละ', ...gradeKeys.map((k) => (Number(g[k]) ? pct(g[k]) : '')), passGrades ? pct(passGrades) : '', failGrades ? pct(failGrades) : '']
      ],
      columnStyles: equalColumns
    }));

    const c = sheet.character || {};
    const r = sheet.reading || {};
    const levelKeys = ['3', '2', '1', '0'];
    const passOf = (o) => ['3', '2', '1'].reduce((s, k) => s + (Number(o[k]) || 0), 0);
    runAutoTable(doc, tableDefaults({
      ...tableStyle,
      startY: (doc.lastAutoTable?.finalY || y) + 5,
      head: [
        [{ content: 'จำนวน\nนักเรียน', rowSpan: 3 }, { content: 'สรุปผลการประเมิน', colSpan: 12 }],
        [{ content: 'คุณลักษณะอันพึงประสงค์ของสถานศึกษา', colSpan: 6 }, { content: 'การอ่าน คิดวิเคราะห์และเขียนสื่อความ', colSpan: 6 }],
        [...levelKeys, 'ผ่าน', 'ไม่ผ่าน', ...levelKeys, 'ผ่าน', 'ไม่ผ่าน']
      ],
      body: [
        [String(total), ...levelKeys.map((k) => show(c[k])), show(passOf(c)), show(c['0']), ...levelKeys.map((k) => show(r[k])), show(passOf(r)), show(r['0'])],
        ['ร้อยละ', ...levelKeys.map((k) => (Number(c[k]) ? pct(c[k]) : '')), passOf(c) ? pct(passOf(c)) : '', Number(c['0']) ? pct(c['0']) : '',
          ...levelKeys.map((k) => (Number(r[k]) ? pct(r[k]) : '')), passOf(r) ? pct(passOf(r)) : '', Number(r['0']) ? pct(r['0']) : '']
      ],
      columnStyles: equalColumns
    }));

    // ก. สรุปเวลาเรียน (owner 2026-10-14: แบบที่ 1 + ก + ข) — คิดจากเช็คชื่อรายวัน รายละเอียดรายคนอยู่หน้าถัดไป
    const att = sheet.attendance;
    const hourly = att?.mode === 'hourly';
    if (att) {
      runAutoTable(doc, tableDefaults({
        ...tableStyle,
        startY: (doc.lastAutoTable?.finalY || y) + 5,
        head: [
          [{ content: 'จำนวน\nนักเรียน', rowSpan: 2 }, { content: hourly ? 'สรุปเวลาเรียน (เช็คชื่อรายชั่วโมง)' : 'สรุปเวลาเรียน (คิดจากการเช็คชื่อรายวัน)', colSpan: 5 }],
          ['เวลาเรียน\n(ชั่วโมง)', hourly ? 'สอนแล้ว\n(ชั่วโมง)' : 'เช็คชื่อแล้ว\n(วัน)', 'มาเรียน\nร้อยละ 80 ขึ้นไป', 'ไม่ถึงร้อยละ 80\n(มส)', 'ยังไม่มี\nข้อมูลเช็คชื่อ']
        ],
        body: [
          [String(total), show(att.hours), String(number(hourly ? att.taughtHours : att.schoolDays, 0)), show(att.over), show(att.under), show(att.noData)],
          ['ร้อยละ', '', '', Number(att.over) ? pct(att.over) : '', Number(att.under) ? pct(att.under) : '', Number(att.noData) ? pct(att.noData) : '']
        ],
        columnStyles: { 0: { cellWidth: 17 } }
      }));
    }

    let noteY = (doc.lastAutoTable?.finalY || y) + 4.5;
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8);
    const notes = [];
    if (Number(g.pending)) notes.push(`ยังไม่มีผลการเรียนครบ ${g.pending} คน`);
    if (Number(c.pending)) notes.push(`ยังไม่ได้ประเมินคุณลักษณะ ${c.pending} คน`);
    // readingBy (gas-bridge, แบบประเมินอ่านฯ ของโรงเรียน): 'group' = คะแนนกลุ่มสาระ · 'subject' / 'homeroom' = 5 เกณฑ์ ไม่ขึ้นกับกลุ่มสาระ
    if (Number(r.pending)) notes.push(sheet.readingBy !== 'group' ? `ยังไม่ได้ประเมินการอ่านฯ ${r.pending} คน`
      : sheet.group ? `ยังไม่ได้ประเมินการอ่านฯ ของกลุ่มสาระนี้ ${r.pending} คน` : 'ไม่พบกลุ่มสาระของวิชานี้ จึงไม่มีผลการอ่านฯ');
    if (notes.length) { doc.text(`* ${notes.join(' · ')}`, left, noteY); noteY += 4; }
    // SQL 034: ถ้าครูผู้สอนประเมินในวิชานี้เอง ใช้ผลของวิชา (gas-bridge subjectOwn) ไม่ใช่ผลรวมของนักเรียน
    doc.text(sheet.characterBy === 'subject' || sheet.readingBy === 'subject'
      ? `* ${[sheet.characterBy === 'subject' ? 'คุณลักษณะ' : '', sheet.readingBy === 'subject' ? 'การอ่านฯ' : ''].filter(Boolean).join(' และ ')}ใช้ผลประเมินของครูผู้สอนวิชานี้ (ดีเยี่ยม = 3, ดี = 2, ผ่าน = 1, ไม่ผ่าน = 0)`
      : '* คุณลักษณะอันพึงประสงค์ใช้ผลการประเมินรวมของนักเรียน (ดีเยี่ยม = 3, ดี = 2, ผ่าน = 1, ไม่ผ่าน = 0)', left, noteY);

    // ลงนาม 3 ช่องแบบปกรายชั้น: ครูผู้สอน | หัวหน้าฝ่ายวิชาการ/งานวัดผล (เห็นควรอนุมัติ/ปรับปรุง) | ผู้อำนวยการ (อนุมัติ/ไม่อนุมัติ + ตรา)
    const signs = meta?.includeSignatures !== false;
    const col1 = pageWidth * 0.2;
    const col2 = pageWidth * 0.5;
    const col3 = pageWidth * 0.8;
    const sigY = Math.max(noteY + 36, pageHeight - 30);
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9.5);
    doc.setLineWidth(0.2);
    doc.setDrawColor(0, 0, 0);
    const box = (x, label, yy) => { doc.rect(x, yy - 3, 3, 3); doc.text(label, x + 5, yy); };
    box(col2 - 30, 'เห็นควรอนุมัติ', sigY - 21);
    box(col2 + 3, 'เห็นควรปรับปรุง', sigY - 21);
    box(col3 - 23, 'อนุมัติ', sigY - 21);
    box(col3 + 2, 'ไม่อนุมัติ', sigY - 21);
    drawSignatureImage(doc, meta, sheet.teacherSignature, col1, sigY);
    doc.text('ลงชื่อ................................................', col1, sigY, { align: 'center' });
    doc.text(`( ${text(sheet.teacher) || blank} )`, col1, sigY + 6, { align: 'center' });
    doc.text('ครูผู้สอน', col1, sigY + 11.5, { align: 'center' });
    if (signs && meta?.academicHeadSignature) { try { doc.addImage(meta.academicHeadSignature, 'PNG', col2 - 15, sigY - 8.5, 30, 9.5); } catch (_) {} }
    doc.text('ลงชื่อ................................................', col2, sigY, { align: 'center' });
    doc.text(`( ${text(meta.academicHead) || blank} )`, col2, sigY + 6, { align: 'center' });
    doc.text('หัวหน้าฝ่ายวิชาการ / งานวัดผล', col2, sigY + 11.5, { align: 'center' });
    if (signs && meta?.schoolStamp) { try { doc.addImage(meta.schoolStamp, 'PNG', col3 - 8.5, sigY - 19, 17, 17); } catch (_) {} }
    if (signs && meta?.directorSignature) { try { doc.addImage(meta.directorSignature, 'PNG', col3 - 15, sigY - 8.5, 30, 9.5); } catch (_) {} }
    doc.text('ลงชื่อ................................................', col3, sigY, { align: 'center' });
    doc.text(`( ${text(meta.directorName) || blank} )`, col3, sigY + 6, { align: 'center' });
    doc.text(text(meta.directorPosition) || `ผู้อำนวยการ${meta.schoolName || 'โรงเรียน'}`, col3, sigY + 11.5, { align: 'center' });
  }

  // ข. หน้า "บันทึกเวลาเรียนรายวิชา" ต่อท้ายปกของแต่ละวิชา: รายชื่อนักเรียน วันมา/ลา/ขาด ร้อยละ ชั่วโมงที่เรียน และ มส
  function drawPp5SubjectAttendance(doc, report, sheet, meta) {
    const att = sheet.attendance;
    if (!att) return;
    // hourly = ครูเช็คชื่อรายชั่วโมงของวิชานี้ (SQL 031) · daily = คิดจากเช็คชื่อรายวัน (ยังไม่มีบันทึกรายชั่วโมง)
    // mixed = วิชาทั้งปีที่ภาคหนึ่งเช็ครายคาบ อีกภาคใช้เช็คชื่อรายวันแปลงเป็นชั่วโมง (gas-bridge mixedAttendance) — แสดงเป็นชั่วโมง
    const hourly = att.mode === 'hourly' || att.mode === 'mixed';
    const pageWidth = doc.internal.pageSize.getWidth();
    const left = 16;
    doc.setTextColor(0, 0, 0);
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(14);
    doc.text('บันทึกเวลาเรียนรายวิชา', pageWidth / 2, 18, { align: 'center' });
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(10.5);
    const period = sheet.semester ? `ภาคเรียนที่ ${sheet.semester}` : 'ทั้งปีการศึกษา';
    doc.text(`รายวิชา ${text(sheet.name)}${sheet.code ? ` รหัสวิชา ${text(sheet.code)}` : ''} · ชั้น${pp5GradeFullName(report.grade)} ห้อง ${text(report.classNo)} · ปีการศึกษา ${text(report.academicYear)}`, pageWidth / 2, 25, { align: 'center' });
    doc.setFontSize(9.5);
    doc.text(`เวลาเรียน ${att.hours ? `${att.hours} ชั่วโมง` : '-'} · ${period} · ${hourly ? `สอนและเช็คชื่อแล้ว ${number(att.taughtHours, 0)} ชั่วโมง (${number(att.schoolDays, 0)} วัน)` : `เช็คชื่อแล้ว ${number(att.schoolDays, 0)} วัน`}${meta.schoolName ? ` · ${meta.schoolName}` : ''}`, pageWidth / 2, 31, { align: 'center' });
    const remark = (row) => (row.pct === null ? 'ไม่มีข้อมูล' : row.below ? 'มส' : '');
    runAutoTable(doc, tableDefaults({
      startY: 35,
      margin: { left, right: 16, bottom: 14 },
      styles: { font: 'Sarabun', fontSize: 9, cellPadding: 1.2, halign: 'center', valign: 'middle', textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
      headStyles: { font: 'Sarabun', fontStyle: 'bold', fontSize: 9, fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
      head: [
        [{ content: 'เลขที่', rowSpan: 2 }, { content: 'เลขประจำตัว', rowSpan: 2 }, { content: 'ชื่อ - สกุล', rowSpan: 2 },
          { content: hourly ? 'จำนวนชั่วโมง' : 'จำนวนวัน', colSpan: 4 }, { content: 'ร้อยละ\nเวลาเรียน', rowSpan: 2 },
          { content: hourly ? `ชั่วโมง\nที่เรียน\n(สอน ${number(att.taughtHours, 0)})` : `ชั่วโมง\nที่เรียน${att.hours ? `\n(จาก ${att.hours})` : ''}`, rowSpan: 2 }, { content: 'หมายเหตุ', rowSpan: 2 }],
        ['มา', 'ลา', 'ขาด', 'รวม']
      ],
      body: att.students.map((row) => [row.no, row.code, row.name, String(row.present), String(row.leave), String(row.absent), String(row.total),
        row.pct === null ? '-' : row.pct.toFixed(1), row.hours === null ? '-' : String(row.hours), remark(row)]),
      columnStyles: { 0: { cellWidth: 11 }, 1: { cellWidth: 20 }, 2: { halign: 'left', cellWidth: 52 }, 9: { cellWidth: 18 } },
      didParseCell: (data) => { if (data.section === 'body' && data.column.index === 9 && data.cell.raw === 'มส') data.cell.styles.fontStyle = 'bold'; }
    }));
    let y = (doc.lastAutoTable?.finalY || 35) + 5;
    if (y > doc.internal.pageSize.getHeight() - 42) { doc.addPage(); y = 20; }
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8);
    doc.text(`* สรุป: มาเรียนร้อยละ 80 ขึ้นไป ${att.over} คน · ไม่ถึงร้อยละ 80 (มส) ${att.under} คน${att.noData ? ` · ยังไม่มีข้อมูลเช็คชื่อ ${att.noData} คน` : ''}`, left, y);
    // owner 2026-10-16 มส. ตามระเบียบ (gas-bridge attendanceRulePct): เทียบกับเวลาเรียนทั้งหมดของวิชา ลาไม่นับเป็นขาด
    const rule = att.fullHours
      ? `ร้อยละเวลาเรียน = (${att.fullHours} ชม. − ชั่วโมงที่ขาด) ÷ ${att.fullHours} ชม. · ลาไม่นับเป็นขาด`
      : 'ร้อยละเวลาเรียน = (เวลาที่บันทึก − เวลาที่ขาด) ÷ เวลาที่บันทึก (วิชานี้ยังไม่ได้ตั้งชั่วโมงเรียน) · ลาไม่นับเป็นขาด';
    doc.text(att.mode === 'mixed'
      ? `* ${text(att.note)} · ${rule}`
      : hourly
      ? `* ${text(att.note) || 'คิดจากการเช็คชื่อรายชั่วโมงของวิชานี้'} · ${rule}`
      : `* คิดจากการเช็คชื่อรายวันของห้อง (1 วันที่ขาด = ชั่วโมงของวิชา ÷ 200 วัน/ปี หรือ 100 วัน/ภาค) · ${rule}`, left, y + 4, { maxWidth: pageWidth - left * 2 });
    doc.text('* นักเรียนที่มีเวลาเรียนไม่ถึงร้อยละ 80 ของเวลาเรียนทั้งหมด (ขาดเกินร้อยละ 20) ไม่มีสิทธิ์ได้รับการวัดผลปลายภาค/ปลายปี (มส)', left, y + 12);
    const cx = pageWidth * 0.72;
    const sy = y + 24;
    doc.setFontSize(10.5);
    drawSignatureImage(doc, meta, sheet.teacherSignature, cx, sy);
    doc.text('ลงชื่อ ..........................................', cx, sy, { align: 'center' });
    doc.text(`( ${text(sheet.teacher) || '...................................'} )`, cx, sy + 6.5, { align: 'center' });
    doc.text('ครูผู้สอน', cx, sy + 13, { align: 'center' });
  }

  // บันทึกเวลาเรียนรายเดือนของวิชา (owner 2026-10-14 ส่งภาพบันทึกเวลาเรียนรายเดือน "มันต้องมีอย่างนี้ด้วย"): หน้าละเดือน
  // รูปแบบเดียวกับ drawDailyAttendancePage — คอลัมน์ = วันที่สอนวิชานั้น (รายชั่วโมงมีแถวจำนวนชั่วโมง) ✓ / ล / ข
  // ท้ายตารางมีรวมของเดือน (ชั่วโมงหรือวันที่มา / ที่สอน)
  // hourStart = ชั่วโมงที่สอนไปแล้วในเดือนก่อน ๆ ของปี (owner 2026-10-23 "อยากให้นับรวมทั้งปี") · คืนค่าชั่วโมงสุดท้ายของเดือนนี้
  function drawPp5SubjectMonthPage(doc, report, sheet, month, meta, logo, hourStart = 0) {
    const att = sheet.attendance;
    // แต่ละเดือนบอกเองว่าเป็นรายคาบหรือรายวัน (วิชาทั้งปีแบบ mixed มีทั้งสองแบบในเล่มเดียว)
    const hourly = typeof month.hourly === 'boolean' ? month.hourly : att.mode === 'hourly';
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 12;
    if (logo) {
      try { doc.addImage(logo, 'PNG', (pageWidth - 16) / 2, y, 16, 16, undefined, 'FAST'); } catch (_) {}
      y += 20;
    } else y += 6;
    doc.setTextColor(0, 0, 0);
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(12.5);
    doc.text(meta.schoolName || 'โรงเรียน', pageWidth / 2, y, { align: 'center' });
    y += 5.5;
    doc.setFontSize(12);
    doc.text(`บันทึกเวลาเรียนรายวิชา${text(sheet.name) ? ` ${text(sheet.name)}` : ''}${sheet.code ? ` (${text(sheet.code)})` : ''} ชั้น ${text(report.grade)}/${text(report.classNo)} เดือน ${text(month.monthName)} ${text(month.yearBE)}`, pageWidth / 2, y, { align: 'center' });
    y += 5;
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9.5);
    doc.text(`ภาคเรียนที่ ${month.semester || 1} | ปีการศึกษา ${text(report.academicYear)}${sheet.teacher ? ` | ครูผู้สอน ${text(sheet.teacher)}` : ''}`, pageWidth / 2, y, { align: 'center' });
    y += 4.5;
    doc.setFontSize(8.5);
    doc.text(hourly
      ? `เช็คชื่อรายชั่วโมง: สอน ${month.days.length} ครั้ง รวม ${number(month.taught, 0)} ชั่วโมงในเดือนนี้${(month.days || []).length ? ` (ชั่วโมงที่ ${hourStart + 1}–${hourStart + (month.days || []).reduce((sum, d) => sum + Math.max(1, number(d.hours, 1)), 0)} ของปี)` : ''}`
      : `คิดจากเช็คชื่อรายวัน (ยังไม่มีการเช็คชื่อรายชั่วโมงของวิชานี้): เรียน ${month.days.length} วันในเดือนนี้`, pageWidth / 2, y, { align: 'center' });
    y += 3.5;

    const days = month.days || [];
    const unit = hourly ? 'ชม.' : 'วัน';
    // หัวตาราง (owner 2026-10-23 "ทำให้ชื่อ นามสกุลแสดงในบรรทัดเดียว ปรับหัวตารางให้เป็นตัวไม่หนา"): วันที่เดียวกันหลายคาบรวมเป็นหัวเดียว
    //   (เดิม "12-2" ในช่องแคบจึงตกบรรทัดเป็นแนวตั้ง) · แถว 2 = วัน · แถว 3 (รายชั่วโมง) = ชั่วโมงที่สอนช่องนั้น
    const groupsByDate = [];
    days.forEach((d) => { const g = groupsByDate[groupsByDate.length - 1]; const key = text(d.date) || text(d.label); if (g && g.key === key) g.n += 1; else groupsByDate.push({ key, d, n: 1 }); });
    const dateLabel = (d) => text(d.label).split('-')[0];
    const span = hourly ? 3 : 2;
    const headRow1 = [
      { content: 'ที่', rowSpan: span }, { content: 'รหัส', rowSpan: span }, { content: 'ชื่อ - สกุล', rowSpan: span },
      ...groupsByDate.map((g) => (g.n > 1 ? { content: dateLabel(g.d), colSpan: g.n } : dateLabel(g.d))),
      { content: `มา\n(${unit})`, rowSpan: span }, { content: `${hourly ? 'สอน' : 'เรียน'}\n(${unit})`, rowSpan: span }
    ];
    const head = [headRow1, groupsByDate.map((g) => (g.n > 1 ? { content: text(g.d.dow), colSpan: g.n } : text(g.d.dow)))];
    // แถว 3 = ชั่วโมงที่ นับต่อกันทั้งปี (owner 2026-10-23 "นับเป็น ชม.ที่ 1 2 3 4" -> "อยากให้นับรวมทั้งปี"): เดือนนี้เริ่มต่อจากเดือนก่อน
    //   ช่องที่สอนหลายชั่วโมงในแถวเดียว (ข้อมูลเก่าก่อน SQL 032) แสดงชั่วโมงสุดท้ายของช่องนั้น
    let hourNo = hourStart;
    if (hourly) head.push(days.map((d) => { hourNo += Math.max(1, number(d.hours, 1)); return String(hourNo); }));
    const body = month.students.map((st) => [st.no, st.code, st.name, ...st.cells, String(st.present), String(st.total)]);
    // ช่องชื่อกว้างพอให้ชื่อ-สกุลยาวที่สุดอยู่บรรทัดเดียว ช่องวันใช้ที่เหลือ (ไม่เกิน 9 มม. ไม่ต่ำกว่า 4.2 มม.)
    const small = days.length > 22 ? 7.5 : 8.5;
    const maxWidth = pageWidth - 16;
    const numDays = Math.max(days.length, 1);
    const fixed = 7 + 12 + 20;
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(small);
    const longest = Math.max(0, ...month.students.map((st) => doc.getTextWidth(text(st.name))));
    let nameWidth = Math.min(64, Math.max(34, longest + 3));
    let dayWidth = Math.min(9, (maxWidth - fixed - nameWidth) / numDays);
    if (dayWidth < 4.2) { dayWidth = 4.2; nameWidth = Math.max(34, maxWidth - fixed - dayWidth * numDays); }
    const left = (pageWidth - (fixed + nameWidth + dayWidth * numDays)) / 2;
    const columnStyles = { 0: { cellWidth: 7 }, 1: { cellWidth: 12 }, 2: { cellWidth: nameWidth, halign: 'left' } };
    days.forEach((_d, i) => { columnStyles[3 + i] = { cellWidth: dayWidth, cellPadding: { top: 1.1, bottom: 1.1, left: 0.2, right: 0.2 } }; });
    columnStyles[3 + days.length] = { cellWidth: 10 };
    columnStyles[4 + days.length] = { cellWidth: 10 };
    const isMark = (column) => column >= 3 && column < 3 + days.length;
    runAutoTable(doc, tableDefaults({
      startY: y,
      head,
      body,
      margin: { left, right: left, bottom: 8 },
      styles: { font: 'Sarabun', fontSize: small, cellPadding: 1.1, halign: 'center', valign: 'middle', textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
      headStyles: { font: 'Sarabun', fontStyle: 'bold', fontSize: small, fillColor: [245, 245, 245], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
      columnStyles,
      // หัวช่องวันที่/วัน/ชั่วโมงเป็นตัวปกติ (ช่องแคบ ตัวหนาล้น) · หัวอื่นยังตัวหนา · ชื่อ-สกุลไม่ตัดบรรทัด
      didParseCell: (data) => {
        if (data.section === 'head' && isMark(data.column.index)) { data.cell.styles.fontStyle = 'normal'; data.cell.styles.cellPadding = { top: 1, bottom: 1, left: 0.2, right: 0.2 }; }
        // เลข 3 หลัก (ชั่วโมงที่ 100 ขึ้นไป) ย่อตัวให้อยู่ในช่องเดิม ตารางไม่ขยาย
        if (data.section === 'head' && data.row.index === 2 && isMark(data.column.index) && String(data.cell.raw ?? '').length >= 3) data.cell.styles.fontSize = Math.min(small, 6);
        if (data.section === 'body' && data.column.index === 2) data.cell.styles.overflow = 'ellipsize';
      },
      willDrawCell: (data) => {
        if (data.section !== 'body' || !isMark(data.column.index)) return;
        const val = String(data.cell.raw || '').trim();
        if (val === 'ล') { data.cell.styles.textColor = [230, 81, 0]; data.cell.styles.fontStyle = 'bold'; }
        else if (val === 'ข') { data.cell.styles.textColor = [198, 40, 40]; data.cell.styles.fontStyle = 'bold'; }
        else if (val === '✓') data.cell.text = [''];
      },
      didDrawCell: (data) => {
        if (data.section !== 'body' || !isMark(data.column.index) || String(data.cell.raw || '').trim() !== '✓') return;
        const x = data.cell.x + data.cell.width / 2;
        const cy = data.cell.y + data.cell.height / 2;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.35);
        doc.line(x - 1.3, cy, x - 0.3, cy + 1.1);
        doc.line(x - 0.3, cy + 1.1, x + 1.5, cy - 1.3);
      }
    }));
    const endY = (doc.lastAutoTable?.finalY || y + 100) + 6;
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9);
    // Sarabun ไม่มีตัว ✓ จึงวาดเครื่องหมายถูกเป็นเส้นแบบเดียวกับในตาราง
    const prefix = 'หมายเหตุ: ';
    const rest = `= มาเรียน   ล = ลา   ข = ขาด${hourly ? '   |   แถวที่ 3 ของหัวตาราง = ชั่วโมงที่ (นับต่อกันทั้งปี)' : ''}   |   นักเรียน ${month.students.length} คน`;
    const startX = pageWidth / 2 - (doc.getTextWidth(prefix) + 5 + doc.getTextWidth(rest)) / 2;
    doc.text(prefix, startX, endY);
    const cx = startX + doc.getTextWidth(prefix) + 2;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.line(cx - 1.3, endY - 1.2, cx - 0.3, endY - 0.1);
    doc.line(cx - 0.3, endY - 0.1, cx + 1.5, endY - 2.5);
    doc.text(rest, startX + doc.getTextWidth(prefix) + 5, endY);
    return hourNo;
  }

  // ---- เล่ม ปพ.5 รายวิชา (owner 2026-10-14: "พิมพ์ ปพ.5 รายวิชารวมเล่มด้วย เหมือนแบบรวมชั้น ไม่ใช่พิมพ์ได้แค่ปก")
  // ส่วนที่เจ้าของเลือก: ปก + เวลาเรียน · บันทึกคะแนนรายครั้ง · อ่าน คิดวิเคราะห์ เขียน รายคน · คุณลักษณะ รายคน
  const PP5_LEVEL_TEXT = { 3: 'ดีเยี่ยม', 2: 'ดี', 1: 'ผ่าน', 0: 'ไม่ผ่าน' };
  const PP5_CHARACTERISTICS = ['รักชาติ ศาสน์ กษัตริย์', 'ซื่อสัตย์สุจริต', 'มีวินัย', 'ใฝ่เรียนรู้', 'อยู่อย่างพอเพียง', 'มุ่งมั่นในการทำงาน', 'รักความเป็นไทย', 'มีจิตสาธารณะ'];
  function subjectBookHeader(doc, title, report, sheet, meta, extra) {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setTextColor(0, 0, 0);
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(13.5);
    doc.text(title, pageWidth / 2, 16, { align: 'center' });
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(10.5);
    doc.text(`รายวิชา ${text(sheet.name)}${sheet.code ? ` รหัสวิชา ${text(sheet.code)}` : ''} · ชั้น${pp5GradeFullName(report.grade)} ห้อง ${text(report.classNo)} · ปีการศึกษา ${text(report.academicYear)}`, pageWidth / 2, 23, { align: 'center' });
    doc.setFontSize(9.5);
    doc.text([meta.schoolName, sheet.teacher ? `ครูผู้สอน ${text(sheet.teacher)}` : '', extra].filter(Boolean).join(' · '), pageWidth / 2, 29, { align: 'center' });
    return 33;
  }
  function subjectBookSignature(doc, sheet, y, meta) {
    const pageWidth = doc.internal.pageSize.getWidth();
    let sy = y + 14;
    if (sy > doc.internal.pageSize.getHeight() - 24) { doc.addPage(); sy = 30; }
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(10.5);
    drawSignatureImage(doc, meta, sheet.teacherSignature, pageWidth * 0.72, sy);
    doc.text('ลงชื่อ ..........................................', pageWidth * 0.72, sy, { align: 'center' });
    doc.text(`( ${text(sheet.teacher) || '...................................'} )`, pageWidth * 0.72, sy + 6.5, { align: 'center' });
    doc.text('ครูผู้สอน', pageWidth * 0.72, sy + 13, { align: 'center' });
  }
  const bookTable = (extra) => ({
    margin: { left: 12, right: 12, bottom: 12 },
    styles: { font: 'Sarabun', fontSize: 8.5, cellPadding: 1.1, halign: 'center', valign: 'middle', textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
    headStyles: { font: 'Sarabun', fontStyle: 'bold', fontSize: 8.5, fillColor: [245, 245, 245], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
    ...extra
  });
  const blank = (v) => (v === '' || v === null || v === undefined ? '' : String(v));

  // บันทึกคะแนนรายครั้ง: ภาคละ 1 หน้า (ช่องที่คะแนนเต็มเป็น 0 ไม่แสดง) แล้วสรุปทั้งปี
  function drawPp5SubjectScorePages(doc, report, sheet, meta, newPage) {
    const book = sheet.book?.scores;
    if (!book) return;
    book.semesters.forEach((sem) => {
      newPage();
      const y = subjectBookHeader(doc, 'บันทึกคะแนนรายวิชา', report, sheet, meta, `ภาคเรียนที่ ${sem.semester}`);
      const rounds = sem.full.map((full, i) => ({ i, full: Number(full) || 0, label: text(sem.labels?.[i]) })).filter((r) => r.full > 0);
      const roundsCount = Math.max(rounds.length, 1);
      const head = [
        [{ content: 'เลขที่', rowSpan: 3 }, { content: 'ชื่อ - สกุล', rowSpan: 3 }, { content: 'คะแนนระหว่างภาค', colSpan: roundsCount + 1 },
          { content: 'ปลาย\nภาค', rowSpan: 2 }, { content: 'รวม', rowSpan: 2 }, { content: 'ผลการ\nเรียน', rowSpan: 3 }],
        // หัวคอลัมน์เป็นเลขครั้งที่ (ช่องแคบ ชื่องานยาวจะถูกตัดกลางคำ) ชื่องานอยู่ในหมายเหตุใต้ตาราง
        [...(rounds.length ? rounds.map((r) => String(r.i + 1)) : ['-']), 'รวม'],
        [...(rounds.length ? rounds.map((r) => String(r.full)) : ['']), String(sem.midMax), String(sem.finalMax), String(number(sem.midMax, 0) + number(sem.finalMax, 0))]
      ];
      const body = sem.rows.map((row) => [row.no, row.name, ...(rounds.length ? rounds.map((r) => blank(row.scores[r.i])) : ['']), blank(row.mid), blank(row.final), blank(row.total), blank(row.grade)]);
      const nameWidth = 46;
      const fixed = 9 + nameWidth + 13 + 12 + 12 + 13;
      const roundWidth = Math.min(16, (doc.internal.pageSize.getWidth() - 24 - fixed) / roundsCount);
      // ช่องชื่อไม่กำหนดความกว้าง: รับที่เหลือของหน้าให้ตารางเต็มแนว (nameWidth ใช้กันที่ไว้ให้ชื่อขั้นต่ำ)
      const columnStyles = { 0: { cellWidth: 9 }, 1: { halign: 'left', minCellWidth: nameWidth } };
      for (let i = 0; i < roundsCount; i += 1) columnStyles[2 + i] = { cellWidth: roundWidth };
      columnStyles[2 + roundsCount] = { cellWidth: 13 };
      columnStyles[3 + roundsCount] = { cellWidth: 12 };
      columnStyles[4 + roundsCount] = { cellWidth: 12 };
      columnStyles[5 + roundsCount] = { cellWidth: 13 };
      runAutoTable(doc, tableDefaults(bookTable({
        startY: y, head, body, columnStyles,
      })));
      doc.setFont('Sarabun', 'normal');
      doc.setFontSize(8);
      const noteY = (doc.lastAutoTable?.finalY || y) + 4.5;
      doc.text('* แถวที่ 2 ของหัวตาราง = ครั้งที่ · แถวที่ 3 = คะแนนเต็ม · ช่องว่าง = ยังไม่ได้บันทึกคะแนน', 12, noteY);
      const named = rounds.filter((r) => r.label);
      if (named.length) doc.text(`* ${named.map((r) => `ครั้งที่ ${r.i + 1} ${r.label}`).join(' · ')}`, 12, noteY + 4, { maxWidth: doc.internal.pageSize.getWidth() - 24 });
      subjectBookSignature(doc, sheet, noteY + (named.length ? 8 : 0), meta);
    });
    if (book.semesters.length > 1) {
      newPage();
      const y = subjectBookHeader(doc, 'สรุปผลการเรียนรายวิชา (ทั้งปี)', report, sheet, meta, '');
      runAutoTable(doc, tableDefaults(bookTable({
        startY: y,
        head: [[{ content: 'เลขที่', rowSpan: 2 }, { content: 'เลขประจำตัว', rowSpan: 2 }, { content: 'ชื่อ - สกุล', rowSpan: 2 },
          { content: 'คะแนนรวม', colSpan: 2 }, { content: 'เฉลี่ย\nทั้งปี', rowSpan: 2 }, { content: 'ผลการเรียน', rowSpan: 2 }],
        book.semesters.map((sem) => `ภาคเรียนที่ ${sem.semester}`)],
        body: book.year.map((row) => [row.no, row.code, row.name, ...row.totals.map(blank), blank(row.average), blank(row.grade)]),
        columnStyles: { 0: { cellWidth: 11 }, 1: { cellWidth: 22 }, 2: { cellWidth: 62, halign: 'left' } }
      })));
      subjectBookSignature(doc, sheet, (doc.lastAutoTable?.finalY || y), meta);
    }
  }

  // เครื่องหมายถูกในช่องระดับ (Sarabun ไม่มีตัว ✓)
  function checkColumnsTable(doc, startY, firstColumns, levelColumns, rows, extra) {
    runAutoTable(doc, tableDefaults(bookTable({
      startY,
      head: extra.head,
      body: rows,
      columnStyles: extra.columnStyles,
      willDrawCell: (data) => { if (data.section === 'body' && levelColumns.includes(data.column.index) && data.cell.raw === '✓') data.cell.text = ['']; },
      didDrawCell: (data) => {
        if (data.section !== 'body' || !levelColumns.includes(data.column.index) || data.cell.raw !== '✓') return;
        const x = data.cell.x + data.cell.width / 2;
        const cy = data.cell.y + data.cell.height / 2;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.35);
        doc.line(x - 1.3, cy, x - 0.3, cy + 1.1);
        doc.line(x - 0.3, cy + 1.1, x + 1.5, cy - 1.3);
      }
    })));
  }

  function drawPp5SubjectRtwPage(doc, report, sheet, meta, newPage) {
    const rows = sheet.book?.rtw;
    if (!rows) return;
    newPage();
    const y = subjectBookHeader(doc, 'ผลการประเมินการอ่าน คิดวิเคราะห์ และเขียน', report, sheet, meta, sheet.group ? `กลุ่มสาระการเรียนรู้${sheet.group}` : '');
    const levels = [3, 2, 1, 0];
    const body = rows.map((row) => [row.no, row.code, row.name, ...levels.map((l) => (row.score === l ? '✓' : '')), row.score === '' ? 'ยังไม่ประเมิน' : PP5_LEVEL_TEXT[row.score]]);
    const count = (l) => rows.filter((row) => row.score === l).length;
    body.push([{ content: 'รวม (คน)', colSpan: 3, styles: { fontStyle: 'bold' } }, ...levels.map((l) => String(count(l))), '']);
    checkColumnsTable(doc, y, 3, [3, 4, 5, 6], body, {
      head: [[{ content: 'เลขที่', rowSpan: 2 }, { content: 'เลขประจำตัว', rowSpan: 2 }, { content: 'ชื่อ - สกุล', rowSpan: 2 }, { content: 'ระดับผลการประเมิน', colSpan: 4 }, { content: 'สรุปผล', rowSpan: 2 }],
        ['ดีเยี่ยม\n(3)', 'ดี\n(2)', 'ผ่าน\n(1)', 'ไม่ผ่าน\n(0)']],
      columnStyles: { 0: { cellWidth: 11 }, 1: { cellWidth: 22 }, 2: { cellWidth: 58, halign: 'left' }, 7: { cellWidth: 24 } }
    });
    subjectBookSignature(doc, sheet, doc.lastAutoTable?.finalY || y, meta);
  }

  function drawPp5SubjectCharacterPage(doc, report, sheet, meta, newPage) {
    const rows = sheet.book?.character;
    if (!rows) return;
    newPage();
    const y = subjectBookHeader(doc, 'ผลการประเมินคุณลักษณะอันพึงประสงค์', report, sheet, meta, 'ผลการประเมินรวมของนักเรียน');
    const body = rows.map((row) => [row.no, row.name, ...row.scores.map(blank), row.level === '' ? 'ยังไม่ครบ' : PP5_LEVEL_TEXT[row.level]]);
    runAutoTable(doc, tableDefaults(bookTable({
      startY: y,
      head: [[{ content: 'เลขที่', rowSpan: 2 }, { content: 'ชื่อ - สกุล', rowSpan: 2 }, { content: 'คุณลักษณะอันพึงประสงค์ (ข้อ)', colSpan: 8 }, { content: 'สรุปผล', rowSpan: 2 }],
        ['1', '2', '3', '4', '5', '6', '7', '8']],
      body,
      columnStyles: { 0: { cellWidth: 11 }, 1: { cellWidth: 62, halign: 'left' }, 10: { cellWidth: 22 } }
    })));
    const endY = doc.lastAutoTable?.finalY || y;
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8);
    doc.text(`* ${PP5_CHARACTERISTICS.map((name, i) => `${i + 1} ${name}`).join(' · ')}`, 12, endY + 4.5, { maxWidth: doc.internal.pageSize.getWidth() - 24 });
    doc.text('* ระดับ 3 = ดีเยี่ยม 2 = ดี 1 = ผ่าน 0 = ไม่ผ่าน · สรุปผลจากค่าเฉลี่ย 8 ข้อ', 12, endY + 9);
    subjectBookSignature(doc, sheet, endY + 10, meta);
  }

  async function createPp5SubjectCover(report, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    const sheets = report?.sheets || [];
    // parts ไม่ส่งมา = ปกเดิม (ปก + เวลาเรียน)  หน้าแรกของไฟล์ไม่ต้อง addPage
    const parts = { cover: true, scores: false, rtw: false, character: false, ...(report?.parts || {}) };
    let started = false;
    const newPage = () => { if (started) doc.addPage(); started = true; };
    // options.onProgress(done, total) ไม่บังคับ: แถบความคืบหน้า — รอหนึ่งจังหวะระหว่างวิชาให้หน้าจอวาดแถบใหม่ได้
    const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
    const tick = (done) => { if (!onProgress) return null; try { onProgress(done, sheets.length); } catch (_) { /* ignore */ } return new Promise((resolve) => setTimeout(resolve, 0)); };
    for (const [index, sheet] of sheets.entries()) {
      await tick(index);
      if (parts.cover) {
        newPage();
        drawPp5SubjectSheet(doc, report, sheet, meta, logo);
        if (sheet.attendance) { newPage(); drawPp5SubjectAttendance(doc, report, sheet, meta); }
        if (sheet.attendance && report.includeMonthly !== false) {
          let yearHours = 0;
          (sheet.attendance.months || []).forEach((month) => { newPage(); yearHours = drawPp5SubjectMonthPage(doc, report, sheet, month, meta, logo, yearHours); });
        }
      }
      if (parts.scores) drawPp5SubjectScorePages(doc, report, sheet, meta, newPage);
      if (parts.rtw) drawPp5SubjectRtwPage(doc, report, sheet, meta, newPage);
      if (parts.character) drawPp5SubjectCharacterPage(doc, report, sheet, meta, newPage);
    }
    await tick(sheets.length);
    doc.setProperties({ title: 'แบบบันทึกผลการเรียนประจำรายวิชา', subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    const blobUrl = finish(doc, meta);
    const dataUri = doc.output('datauristring');
    return { blobUrl, dataUri };
  }

  async function createPp5FullBook(report, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);

    const parts = report?.parts || { part1: true, part2: true, part3: true };
    const students = report?.students || [];

    // ==========================================
    // ส่วนที่ 1: ปก + ข้อมูลนักเรียน + ข้อมูลผู้ปกครอง + เวลาเรียน
    // ==========================================
    if (parts.part1) {
      // 1.1 ปก ปพ.5
      drawPp5CoverPage(doc, report, meta, logo);

      // 1.2 ข้อมูลนักเรียน (บัญชีรายชื่อ)
      if (students.length) {
        doc.addPage('a4', 'portrait');
        drawHeader(doc, 'ข้อมูลนักเรียน (บัญชีรายชื่อ)', meta, logo);
        const startY = headerBottom(meta, logo, '');
        const studentRows = students.map((s, idx) => {
          const bd = birthDateParts(s.birthdate || s.birth_date);
          return [
            idx + 1,
            text(s.studentId || s.id),
            text(s.citizenId || s.idCard || s.national_id || '-'),
            text(s.name || s.fullName),
            bd.day || '-',
            bd.month || '-',
            bd.year || '-',
            text(s.age || '-'),
            text(s.weight || '-'),
            text(s.height || '-')
          ];
        });
        runAutoTable(doc, tableDefaults({
          startY,
          head: [['ที่', 'เลขประจำตัว', 'เลข ปชช.', 'ชื่อ - สกุล', 'วัน', 'เดือน', 'ปี', 'อายุ', 'น้ำหนัก', 'ส่วนสูง']],
          body: studentRows,
          margin: { top: startY, left: 12, right: 10, bottom: 8 },
          styles: { font: 'Sarabun', fontSize: 8.5, halign: 'center' },
          columnStyles: {
            0: { cellWidth: 8 },
            1: { cellWidth: 20 },
            2: { cellWidth: 32 },
            3: { cellWidth: 54, halign: 'left' },
            4: { cellWidth: 10 },
            5: { cellWidth: 12 },
            6: { cellWidth: 14 },
            7: { cellWidth: 12 },
            8: { cellWidth: 13 },
            9: { cellWidth: 13 }
          }
        }));

        // 1.3 ข้อมูลผู้ปกครอง
        doc.addPage('a4', 'portrait');
        drawHeader(doc, 'ข้อมูลผู้ปกครองนักเรียน', meta, logo);
        const startYParents = headerBottom(meta, logo, '');
        const parentRows = students.map((s, idx) => [
          idx + 1,
          text(s.name || s.fullName),
          joinedDetailName(s.father_name, s.father_last_name) || '-',
          text(s.father_occupation) || '-',
          joinedDetailName(s.mother_name, s.mother_last_name) || '-',
          text(s.mother_occupation) || '-',
          text(s.address) || '-'
        ]);
        runAutoTable(doc, tableDefaults({
          startY: startYParents,
          head: [['ที่', 'ชื่อ - สกุล นักเรียน', 'ชื่อ - สกุล บิดา', 'อาชีพ', 'ชื่อ - สกุล มารดา', 'อาชีพ', 'ที่อยู่ปัจจุบัน']],
          body: parentRows,
          margin: { top: startYParents, left: 12, right: 10, bottom: 8 },
          styles: { font: 'Sarabun', fontSize: 8, halign: 'center' },
          columnStyles: {
            0: { cellWidth: 8 },
            1: { cellWidth: 42, halign: 'left' },
            2: { cellWidth: 34, halign: 'left' },
            3: { cellWidth: 20 },
            4: { cellWidth: 34, halign: 'left' },
            5: { cellWidth: 20 },
            6: { cellWidth: 30, halign: 'left' }
          }
        }));

        // 1.4 สรุปเวลาเรียน (รวมภาค 1 และ 2)
        doc.addPage('a4', 'portrait');
        drawHeader(doc, 'สรุปเวลาเรียน รวมภาคเรียนที่ 1 และ 2', meta, logo);
        const startYAtt = headerBottom(meta, logo, '');
        const att1Map = {};
        (report?.attendance1 || []).forEach((a) => {
          if (a.studentId) att1Map[text(a.studentId)] = a;
          if (a.student_id) att1Map[text(a.student_id)] = a;
          if (a.id) att1Map[text(a.id)] = a;
          if (a.name) att1Map[text(a.name).trim()] = a;
        });
        const att2Map = {};
        (report?.attendance2 || []).forEach((a) => {
          if (a.studentId) att2Map[text(a.studentId)] = a;
          if (a.student_id) att2Map[text(a.student_id)] = a;
          if (a.id) att2Map[text(a.id)] = a;
          if (a.name) att2Map[text(a.name).trim()] = a;
        });

        const attRows = students.map((s, idx) => {
          const sid = text(s.studentId || s.student_id || s.id || s.code);
          const sname = text(s.name || s.fullName).trim();
          const a1 = att1Map[sid] || att1Map[sname] || { present: 0, leave: 0, absent: 0, total: 0 };
          const a2 = att2Map[sid] || att2Map[sname] || { present: 0, leave: 0, absent: 0, total: 0 };
          const p1 = number(a1.present, 0), l1 = number(a1.leave, 0), ab1 = number(a1.absent, 0), t1 = number(a1.total, p1 + l1 + ab1);
          const p2 = number(a2.present, 0), l2 = number(a2.leave, 0), ab2 = number(a2.absent, 0), t2 = number(a2.total, p2 + l2 + ab2);
          const tp = p1 + p2, tl = l1 + l2, tab = ab1 + ab2, tt = t1 + t2;
          const pct = tt > 0 ? ((tp / tt) * 100).toFixed(1) + '%' : '0.0%';
          return [
            idx + 1,
            text(s.name || s.fullName),
            p1, l1, ab1, t1,
            p2, l2, ab2, t2,
            tp, tl, tab, tt, pct
          ];
        });

        runAutoTable(doc, tableDefaults({
          startY: startYAtt,
          head: [
            [
              { content: 'ที่', rowSpan: 2 },
              { content: 'ชื่อ - นามสกุล', rowSpan: 2 },
              { content: 'ภาคเรียนที่ 1 (วัน)', colSpan: 4 },
              { content: 'ภาคเรียนที่ 2 (วัน)', colSpan: 4 },
              { content: 'รวมทั้งปี', colSpan: 5 }
            ],
            ['มา', 'ลา', 'ขาด', 'รวม', 'มา', 'ลา', 'ขาด', 'รวม', 'มา', 'ลา', 'ขาด', 'รวม', '%มา']
          ],
          body: attRows,
          margin: { top: startYAtt, left: 12, right: 10, bottom: 8 },
          styles: { font: 'Sarabun', fontSize: 8, halign: 'center' },
          headStyles: { font: 'Sarabun', fontStyle: 'bold', fontSize: 7.5, fillColor: [242, 242, 242], textColor: [0, 0, 0] },
          columnStyles: {
            0: { cellWidth: 8 },
            1: { cellWidth: 44, halign: 'left' },
            2: { cellWidth: 10 }, 3: { cellWidth: 10 }, 4: { cellWidth: 10 }, 5: { cellWidth: 11 },
            6: { cellWidth: 10 }, 7: { cellWidth: 10 }, 8: { cellWidth: 10 }, 9: { cellWidth: 11 },
            10: { cellWidth: 10 }, 11: { cellWidth: 10 }, 12: { cellWidth: 10 }, 13: { cellWidth: 11 }, 14: { cellWidth: 13 }
          }
        }));
        addSignatures(doc, meta, doc.lastAutoTable?.finalY || startYAtt);

        // 1.5 สรุปเวลาเรียนรายปี 11 เดือน (พ.ค. - มี.ค.)
        if (report?.yearlyAttendance && report.yearlyAttendance.students?.length) {
          doc.addPage('a4', 'portrait');
          drawHeader(doc, 'บันทึกเวลาเรียนรายปีการศึกษา (รายเดือน)', meta, logo);
          const startYMatrix = headerBottom(meta, logo, '');
          const yMatrix = report.yearlyAttendance;
          const monthColumns = yMatrix.months || ['พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.'];
          const matrixBody = (yMatrix.students || []).map((stu, idx) => {
            const mCounts = monthColumns.map((m) => stu.monthMap?.[m] ?? stu.months?.[m] ?? '-');
            return [
              idx + 1,
              text(stu.name || stu.fullName),
              ...mCounts,
              stu.totalPresent ?? '-',
              stu.totalDays ?? '-',
              stu.percentage ? `${stu.percentage}%` : '-'
            ];
          });
          runAutoTable(doc, tableDefaults({
            startY: startYMatrix,
            head: [['ที่', 'ชื่อ - สกุล', ...monthColumns, 'รวมมา', 'วันเรียน', '%']],
            body: matrixBody,
            margin: { top: startYMatrix, left: 12, right: 10, bottom: 8 },
            styles: { font: 'Sarabun', fontSize: 7.5, halign: 'center' },
            columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 40, halign: 'left' } }
          }));
          addSignatures(doc, meta, doc.lastAutoTable?.finalY || startYMatrix);
        }

        // 1.6 บันทึกเวลาเรียนรายวัน (เช็คชื่อรายวันแต่ละเดือนที่มีการเรียน)
        const monthlyDaily = report?.monthlyDailyAttendance || [];
        monthlyDaily.forEach((m) => {
          doc.addPage('a4', 'portrait');
          drawDailyAttendancePage(doc, m, meta, logo);
          doc.addPage('a4', 'portrait');
          drawMonthlyAttendanceSummaryPage(doc, m, meta, logo);
        });
      }
    }

    // ==========================================
    // ส่วนที่ 2: คะแนน/ผลการเรียนรายวิชา
    // ==========================================
    if (parts.part2) {
      const subjects = report?.subjects || [];
      const scoreMap = report?.subjectScoresMap || {};

      if (subjects.length) {
        subjects.forEach((sub) => {
          doc.addPage('a4', 'portrait');
          const subTitle = `ผลการประเมิน รายวิชา: ${text(sub.name || sub.subjectName)} (${text(sub.code || sub.subjectCode || '-')})`;
          drawHeader(doc, subTitle, meta, logo);
          const startYSub = headerBottom(meta, logo, '');

          const rows = scoreMap[sub.id] || [];
          const rowMap = {};
          rows.forEach((r) => {
            const sid = text(r.student_id || r.studentId);
            rowMap[`${sid}_${r.semester}`] = r;
          });

          const subBody = students.map((s, idx) => {
            const sid = text(s.studentId || s.id);
            const r1 = rowMap[`${sid}_1`] || {};
            const r2 = rowMap[`${sid}_2`] || {};
            const s1 = r1.total_score !== undefined && r1.total_score !== null ? Number(r1.total_score) : '';
            const g1 = s1 !== '' ? gradeForScore(s1) : text(r1.grade_text || '');
            const s2 = r2.total_score !== undefined && r2.total_score !== null ? Number(r2.total_score) : '';
            const g2 = s2 !== '' ? gradeForScore(s2) : text(r2.grade_text || '');
            
            let avg = '';
            let finalGrade = '';
            if (s1 !== '' && s2 !== '') {
              avg = Math.round((s1 + s2) / 2);
              finalGrade = gradeForScore(avg);
            } else if (s1 !== '') {
              avg = s1;
              finalGrade = g1;
            } else if (s2 !== '') {
              avg = s2;
              finalGrade = g2;
            }

            return [
              idx + 1,
              sid,
              text(s.name || s.fullName),
              s1 !== '' ? s1 : '-',
              g1 || '-',
              s2 !== '' ? s2 : '-',
              g2 || '-',
              avg !== '' ? avg : '-',
              finalGrade || '-'
            ];
          });

          runAutoTable(doc, tableDefaults({
            startY: startYSub,
            head: [
              [
                { content: 'เลขที่', rowSpan: 2 },
                { content: 'รหัส', rowSpan: 2 },
                { content: 'ชื่อ - นามสกุล', rowSpan: 2 },
                { content: 'ภาคเรียนที่ 1', colSpan: 2 },
                { content: 'ภาคเรียนที่ 2', colSpan: 2 },
                { content: 'รวมทั้งปี', colSpan: 2 }
              ],
              ['คะแนน', 'เกรด', 'คะแนน', 'เกรด', 'เฉลี่ย', 'เกรดรวม']
            ],
            body: subBody.length ? subBody : [['', '', 'ไม่พบข้อมูลคะแนน', '', '', '', '', '', '']],
            margin: { top: startYSub, left: 14, right: 10, bottom: 8 },
            styles: { font: 'Sarabun', fontSize: 8.5, halign: 'center' },
            columnStyles: {
              0: { cellWidth: 10 },
              1: { cellWidth: 20 },
              2: { cellWidth: 48, halign: 'left' },
              3: { cellWidth: 18 },
              4: { cellWidth: 18 },
              5: { cellWidth: 18 },
              6: { cellWidth: 18 },
              7: { cellWidth: 18 },
              8: { cellWidth: 18 }
            }
          }));

          // Teacher & Director signatures
          let ySig = Math.max(number(doc.lastAutoTable?.finalY, 230) + 14, 240);
          if (ySig > 265) {
            doc.addPage('a4', 'portrait');
            ySig = 40;
          }
          const pWidth = doc.internal.pageSize.getWidth();
          const teacherName = text(sub.teacher_name || meta.classTeacher || '................................................');
          const directorName = text(meta.directorName || '................................................');
          // ลายเซ็นครู = ลายเซ็นครูประจำชั้นที่อัปโหลดไว้ ใช้เฉพาะเมื่อผู้สอนวิชานี้คือครูประจำชั้น (ครูวิชาอื่นยังไม่มีลายเซ็นในระบบ)
          const homeroomTeaches = !text(sub.teacher_name) || text(sub.teacher_name) === text(meta.classTeacher);
          // ลายเซ็นที่ครูผู้สอนอัปโหลดเอง (SQL 042) มาก่อน · ไม่มีจึงใช้ของครูประจำชั้นเมื่อครูประจำชั้นสอนเอง
          drawSignatureImage(doc, meta, sub.teacher_signature || (homeroomTeaches ? meta.teacherSignature : ''), pWidth * 0.3 - 6, ySig);
          drawSchoolStamp(doc, meta, pWidth * 0.7 + 14, ySig - 6);
          drawSignatureImage(doc, meta, meta.directorSignature, pWidth * 0.7 - 8, ySig);
          doc.setFont('Sarabun', 'normal');
          doc.setFontSize(8.5);
          doc.text('ลงชื่อ...............................................ครูผู้สอน', pWidth * 0.3, ySig, { align: 'center' });
          doc.text(`(${teacherName})`, pWidth * 0.3, ySig + 6, { align: 'center' });
          doc.text('ตำแหน่ง ครู', pWidth * 0.3, ySig + 11, { align: 'center' });

          doc.text('ลงชื่อ...............................................ผู้อำนวยการ', pWidth * 0.7, ySig, { align: 'center' });
          doc.text(`(${directorName})`, pWidth * 0.7, ySig + 6, { align: 'center' });
          doc.text(meta.directorPosition || 'ผู้อำนวยการสถานศึกษา', pWidth * 0.7, ySig + 11, { align: 'center' });
        });
      }
    }

    // ==========================================
    // ส่วนที่ 3: ผลการประเมินด้านต่างๆ
    // ==========================================
    if (parts.part3) {
      // 3.1 คุณลักษณะอันพึงประสงค์ (8 ข้อ)
      const charStudents = report?.characteristic || [];
      if (charStudents.length) {
        doc.addPage('a4', 'portrait');
        drawHeader(doc, 'รายงานการประเมินคุณลักษณะอันพึงประสงค์ 8 ข้อ', meta, logo);
        const startYChar = headerBottom(meta, logo, '');
        const charBody = charStudents.map((s, idx) => {
          const scores = s.scores || [];
          const valid = scores.filter((v) => v !== '' && v !== null && v !== undefined && !isNaN(Number(v))).map(Number);
          const sum = valid.length ? valid.reduce((a, b) => a + b, 0) : 0;
          const avg = valid.length === 8 ? (sum / 8).toFixed(2) : '-';
          let res = '-';
          if (valid.length === 8) {
            const numAvg = sum / 8;
            if (numAvg >= 2.5) res = 'ดีเยี่ยม';
            else if (numAvg >= 2.0) res = 'ดี';
            else if (numAvg >= 1.0) res = 'ผ่าน';
            else res = 'ปรับปรุง';
          }
          return [
            idx + 1,
            text(s.name || s.fullName),
            ...Array.from({ length: 8 }, (_, i) => scores[i] !== undefined && scores[i] !== '' ? scores[i] : '-'),
            sum || '-',
            avg,
            res
          ];
        });

        runAutoTable(doc, tableDefaults({
          startY: startYChar,
          head: [['ที่', 'ชื่อ - สกุล', 'ข้อ1', 'ข้อ2', 'ข้อ3', 'ข้อ4', 'ข้อ5', 'ข้อ6', 'ข้อ7', 'ข้อ8', 'รวม', 'เฉลี่ย', 'ผลประเมิน']],
          body: charBody,
          margin: { top: startYChar, left: 12, right: 10, bottom: 8 },
          styles: { font: 'Sarabun', fontSize: 8, halign: 'center' },
          columnStyles: {
            0: { cellWidth: 8 },
            1: { cellWidth: 44, halign: 'left' },
            2: { cellWidth: 12 }, 3: { cellWidth: 12 }, 4: { cellWidth: 12 }, 5: { cellWidth: 12 },
            6: { cellWidth: 12 }, 7: { cellWidth: 12 }, 8: { cellWidth: 12 }, 9: { cellWidth: 12 },
            10: { cellWidth: 12 }, 11: { cellWidth: 14 }, 12: { cellWidth: 16 }
          }
        }));
        addSignatures(doc, meta, doc.lastAutoTable?.finalY || startYChar);
      }

      // 3.2 กิจกรรมพัฒนาผู้เรียน (4 ด้าน)
      const actStudents = report?.activity || [];
      if (actStudents.length) {
        doc.addPage('a4', 'portrait');
        drawHeader(doc, 'รายงานการประเมินกิจกรรมพัฒนาผู้เรียน', meta, logo);
        const startYAct = headerBottom(meta, logo, '');
        const actBody = actStudents.map((s, idx) => {
          const a = s.activities || {};
          return [
            idx + 1,
            text(s.name || s.fullName),
            text(a.guidance || '-'),
            text(a.scout || '-'),
            text(a.club || '-'),
            text(a.social || '-'),
            text(a.overall || '-')
          ];
        });

        runAutoTable(doc, tableDefaults({
          startY: startYAct,
          head: [['ที่', 'ชื่อ - สกุล', 'แนะแนว', 'ลูกเสือ/เนตรฯ', 'ชุมนุม/ชมรม', 'เพื่อสังคมฯ', 'สรุปผล']],
          body: actBody,
          margin: { top: startYAct, left: 14, right: 10, bottom: 8 },
          styles: { font: 'Sarabun', fontSize: 8.5, halign: 'center' },
          columnStyles: {
            0: { cellWidth: 10 },
            1: { cellWidth: 54, halign: 'left' },
            2: { cellWidth: 26 },
            3: { cellWidth: 28 },
            4: { cellWidth: 28 },
            5: { cellWidth: 28 },
            6: { cellWidth: 22 }
          }
        }));
        addSignatures(doc, meta, doc.lastAutoTable?.finalY || startYAct);
      }

      // 3.3 อ่าน คิดวิเคราะห์ และเขียน
      const rtwStudents = report?.rtw || [];
      if (rtwStudents.length) {
        doc.addPage('a4', 'portrait');
        drawHeader(doc, 'รายงานการประเมินการอ่าน คิดวิเคราะห์ และเขียน', meta, logo);
        const startYRtw = headerBottom(meta, logo, '');
        // แบบประเมินของโรงเรียน (gas-bridge loadPp5YearAssessments: report.rtwMode, s.level 0–3 / null, s.criteria 5 ข้อ)
        // 5 เกณฑ์ = ตาราง 5 ข้อ · อื่น ๆ = ตาราง 8 กลุ่มสาระ แต่ "สรุปผล" ใช้ s.level (อัตโนมัติ: 8 กลุ่มสาระไม่ครบใช้ 5 เกณฑ์)
        const RTW_LEVEL_RESULT = { 3: 'ดีเยี่ยม', 2: 'ดี', 1: 'ผ่าน', 0: 'ไม่ผ่าน' };
        const rtwCriteriaMode = report?.rtwMode === 'criteria';
        const cell = (v) => (v !== undefined && v !== null && v !== '' ? v : '-');
        const rtwBody = rtwStudents.map((s, idx) => {
          if (rtwCriteriaMode) {
            const cr = Array.isArray(s.criteria) ? s.criteria : [];
            return [idx + 1, text(s.name || s.fullName), ...[0, 1, 2, 3, 4].map((i) => cell(cr[i])), RTW_LEVEL_RESULT[s.level] || '-'];
          }
          const sc = s.scores || {};
          const subjectScores = [sc.thai, sc.math, sc.science, sc.social, sc.health, sc.art, sc.work, sc.english];
          const valid = subjectScores.filter((v) => v !== '' && v !== null && v !== undefined && !isNaN(Number(v))).map(Number);
          let res = '-';
          if (valid.length === 8) {
            const count0 = valid.filter((v) => v === 0).length;
            const count3 = valid.filter((v) => v === 3).length;
            const count2up = valid.filter((v) => v >= 2).length;
            const hasBelow2 = valid.some((v) => v < 2);
            if (count0 >= 2) res = 'ไม่ผ่าน';
            else if (count3 >= 6 && !hasBelow2) res = 'ดีเยี่ยม';
            else if (count2up >= 6 && count0 === 0) res = 'ดี';
            else res = 'ผ่าน';
          }
          if (s.level !== undefined) res = RTW_LEVEL_RESULT[s.level] || '-';
          return [
            idx + 1,
            text(s.name || s.fullName),
            sc.thai !== undefined && sc.thai !== '' ? sc.thai : '-',
            sc.math !== undefined && sc.math !== '' ? sc.math : '-',
            sc.science !== undefined && sc.science !== '' ? sc.science : '-',
            sc.social !== undefined && sc.social !== '' ? sc.social : '-',
            sc.health !== undefined && sc.health !== '' ? sc.health : '-',
            sc.art !== undefined && sc.art !== '' ? sc.art : '-',
            sc.work !== undefined && sc.work !== '' ? sc.work : '-',
            sc.english !== undefined && sc.english !== '' ? sc.english : '-',
            res
          ];
        });

        if (rtwCriteriaMode) runAutoTable(doc, tableDefaults({
          startY: startYRtw,
          head: [['ที่', 'ชื่อ - สกุล', 'อ่านหาข้อมูล', 'จับประเด็น', 'เชื่อมโยง', 'แสดงความคิดเห็น', 'ถ่ายทอดการเขียน', 'สรุปผล']],
          body: rtwBody,
          margin: { top: startYRtw, left: 14, right: 10, bottom: 8 },
          styles: { font: 'Sarabun', fontSize: 8.5, halign: 'center' },
          columnStyles: {
            0: { cellWidth: 10 }, 1: { cellWidth: 56, halign: 'left' },
            2: { cellWidth: 20 }, 3: { cellWidth: 20 }, 4: { cellWidth: 20 }, 5: { cellWidth: 22 }, 6: { cellWidth: 22 },
            7: { cellWidth: 16 }
          }
        }));
        else runAutoTable(doc, tableDefaults({
          startY: startYRtw,
          head: [['ที่', 'ชื่อ - สกุล', 'ไทย', 'คณิต', 'วิทย์', 'สังคม', 'สุขะ', 'ศิลปะ', 'การงาน', 'อังกฤษ', 'สรุปผล']],
          body: rtwBody,
          margin: { top: startYRtw, left: 14, right: 10, bottom: 8 },
          styles: { font: 'Sarabun', fontSize: 8.5, halign: 'center' },
          columnStyles: {
            0: { cellWidth: 10 },
            1: { cellWidth: 50, halign: 'left' },
            2: { cellWidth: 14 }, 3: { cellWidth: 14 }, 4: { cellWidth: 14 }, 5: { cellWidth: 14 },
            6: { cellWidth: 14 }, 7: { cellWidth: 14 }, 8: { cellWidth: 14 }, 9: { cellWidth: 14 },
            10: { cellWidth: 20 }
          }
        }));
        addSignatures(doc, meta, doc.lastAutoTable?.finalY || startYRtw);
      }

      // 3.4 สรุปผลสัมฤทธิ์ทางการเรียนรายวิชา ใช้ canonical grade summary เดียวกับหน้าสรุปรายชั้น
      const canonicalGradeSummary = report?.gradeSummary?.success ? report.gradeSummary : null;
      const gradeSummarySubjects = canonicalGradeSummary?.subjects?.length
        ? canonicalGradeSummary.subjects
        : (report?.subjects || []).map((subject) => text(subject.name || subject.subjectName));
      if (students.length && gradeSummarySubjects.length) {
        doc.addPage('a4', 'portrait');
        let gradesBody;

        if (canonicalGradeSummary) {
          gradesBody = (canonicalGradeSummary.students || []).map((student, index) => [
            index + 1,
            text(student.studentId),
            text(student.fullName),
            ...gradeSummarySubjects.map((subjectName) => Object.prototype.hasOwnProperty.call(student.grades || {}, subjectName)
              ? student.grades[subjectName]
              : (student.specialGrades?.[subjectName] || '-')),
            student.average || '-',
            student.rank || '-'
          ]);
        } else {
          const subjects = report.subjects || [];
          const scoreMap = report.subjectScoresMap || {};
          const studentGrades = students.map((student, index) => {
            const studentId = text(student.studentId || student.id);
            let totalCreditPoints = 0;
            let totalCredits = 0;
            const grades = subjects.map((subject) => {
              const rows = scoreMap[subject.id] || [];
              const term1 = rows.find((row) => text(row.student_id || row.studentId) === studentId && Number(row.semester) === 1);
              const term2 = rows.find((row) => text(row.student_id || row.studentId) === studentId && Number(row.semester) === 2);
              const term1Score = term1?.total_score !== undefined && term1?.total_score !== null ? Number(term1.total_score) : null;
              const term2Score = term2?.total_score !== undefined && term2?.total_score !== null ? Number(term2.total_score) : null;
              let average = null;
              if (term1Score !== null && term2Score !== null) average = (term1Score + term2Score) / 2;
              else if (term1Score !== null) average = term1Score;
              else if (term2Score !== null) average = term2Score;
              if (average === null) return '-';
              const gradePoint = Number(gradeForScore(average));
              const credit = number(subject.credit, 1);
              totalCreditPoints += gradePoint * credit;
              totalCredits += credit;
              return displayScoreNumber(gradePoint);
            });
            return {
              index: index + 1,
              studentId,
              name: text(student.name || student.fullName),
              grades,
              gpaNumber: totalCredits > 0 ? totalCreditPoints / totalCredits : null
            };
          });
          const ranked = studentGrades.filter((student) => student.gpaNumber !== null).sort((left, right) => right.gpaNumber - left.gpaNumber);
          const ranks = new Map(ranked.map((student, index) => [student.studentId, index + 1]));
          gradesBody = studentGrades.map((student) => [
            student.index,
            student.studentId,
            student.name,
            ...student.grades,
            student.gpaNumber === null ? '-' : student.gpaNumber.toFixed(2),
            ranks.get(student.studentId) || '-'
          ]);
        }

        const embeddedSubjects = gradeSummarySubjects.map((subjectName) => ({
          id: text(subjectName),
          code: text(subjectName),
          name: text(subjectName)
        }));
        const embeddedStudents = gradesBody.map((row) => {
          const subjectScores = {
            gpa: row[3 + embeddedSubjects.length] ?? '-',
            rank: row[4 + embeddedSubjects.length] ?? '-'
          };
          embeddedSubjects.forEach((subject, index) => {
            subjectScores[subject.id] = row[index + 3] ?? '-';
          });
          return { studentId: row[1], name: row[2], subjectScores };
        });
        const embeddedMeta = {
          ...meta,
          meta: [
            'ชั้น ' + text(report?.grade) + ' ห้อง ' + text(report?.classNo),
            meta.academicYear ? 'ปีการศึกษา ' + meta.academicYear : ''
          ].filter(Boolean).join('   ')
        };
        await createClassSubjectScoreReport({
          title: 'แบบสรุปผลสัมฤทธิ์ทางการเรียนรายชั้น',
          students: embeddedStudents,
          subjects: embeddedSubjects,
          orientation: 'portrait',
          includeRank: true
        }, embeddedMeta, { doc, meta: embeddedMeta, logo, embedded: true });

      }

      // 3.5 สรุปผลการประเมินรวม 4 ด้าน
      doc.addPage('a4', 'portrait');
      drawHeader(doc, 'สรุปผลการประเมินพัฒนาการ 4 ด้าน', meta, logo);
      const startYSum = headerBottom(meta, logo, '');
      const headSum = [['ที่', 'ชื่อ - นามสกุล', 'อ่านคิดวิเคราะห์', 'คุณลักษณะ 8 ด้าน', 'กิจกรรมพัฒนาผู้เรียน', 'สมรรถนะสำคัญ']];
      const sumBody = students.map((s, idx) => {
        const sid = text(s.studentId || s.id);
        const charItem = (report?.characteristic || []).find((c) => text(c.studentId || c.id) === sid);
        const actItem = (report?.activity || []).find((a) => text(a.studentId || a.id) === sid);
        const rtwItem = (report?.rtw || []).find((r) => text(r.studentId || r.id) === sid);
        const compItem = (report?.competency || []).find((cp) => text(cp.studentId || cp.id) === sid);

        let charRes = s.charResult || '-';
        if (charItem?.scores) {
          const valid = charItem.scores.filter((v) => v !== '' && v !== null && !isNaN(Number(v))).map(Number);
          if (valid.length === 8) {
            const avg = valid.reduce((a, b) => a + b, 0) / 8;
            charRes = avg >= 2.5 ? 'ดีเยี่ยม' : avg >= 2.0 ? 'ดี' : avg >= 1.0 ? 'ผ่าน' : 'ปรับปรุง';
          }
        }

        let actRes = s.activityResult || actItem?.activities?.overall || '-';
        let rtwRes = s.rtwResult || '-';
        if (rtwItem?.scores) {
          const sc = rtwItem.scores;
          const valid = [sc.thai, sc.math, sc.science, sc.social, sc.health, sc.art, sc.work, sc.english].filter((v) => v !== '' && v !== null && !isNaN(Number(v))).map(Number);
          if (valid.length === 8) {
            const count0 = valid.filter((v) => v === 0).length;
            const count3 = valid.filter((v) => v === 3).length;
            const count2up = valid.filter((v) => v >= 2).length;
            const hasBelow2 = valid.some((v) => v < 2);
            if (count0 >= 2) rtwRes = 'ไม่ผ่าน';
            else if (count3 >= 6 && !hasBelow2) rtwRes = 'ดีเยี่ยม';
            else if (count2up >= 6 && count0 === 0) rtwRes = 'ดี';
            else rtwRes = 'ผ่าน';
          }
        }
        // ระดับตามแบบประเมินของโรงเรียน (gas-bridge rtwLevel_) — ตรงกับหน้า 3.3 และปก ปพ.5
        if (rtwItem && rtwItem.level !== undefined) rtwRes = ({ 3: 'ดีเยี่ยม', 2: 'ดี', 1: 'ผ่าน', 0: 'ไม่ผ่าน' })[rtwItem.level] || '-';

        let compRes = s.compResult || '-';
        if (compItem?.scores) {
          const valid = compItem.scores.filter((v) => v !== '' && v !== null && !isNaN(Number(v))).map(Number);
          if (valid.length === 25) {
            const avg = valid.reduce((a, b) => a + b, 0) / 25;
            compRes = avg >= 2.5 ? 'ดีเยี่ยม' : avg >= 2.0 ? 'ดี' : avg >= 1.0 ? 'ผ่าน' : 'ปรับปรุง';
          }
        }

        return [
          idx + 1,
          text(s.name || s.fullName),
          rtwRes,
          charRes,
          actRes,
          compRes
        ];
      });

      runAutoTable(doc, tableDefaults({
        startY: startYSum,
        head: headSum,
        body: sumBody.length ? sumBody : [['', 'ไม่พบข้อมูลการประเมิน', '', '', '', '']],
        margin: { top: startYSum, left: 16, right: 16, bottom: 8 },
        styles: { font: 'Sarabun', fontSize: 9, halign: 'center' },
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 54, halign: 'left' }, 2: { cellWidth: 28 }, 3: { cellWidth: 28 }, 4: { cellWidth: 32 }, 5: { cellWidth: 26 } }
      }));
      addSignatures(doc, meta, doc.lastAutoTable?.finalY || startYSum);
    }

    addDocumentPageNumbers(doc, { hasCover: Boolean(parts.part1) });
    doc.setProperties({ title: 'เอกสารประจำชั้น', subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    const blobUrl = finish(doc, meta);
    const dataUri = doc.output('datauristring');
    return { blobUrl, dataUri };
  }

  // place = { y, angle } ใช้เมื่อมีลายน้ำ "ผลระหว่างปี" ด้วย: วางขนานแถวกลาง ไม่ไขว้กัน (owner 2026-10-07)
  function renderDraftWatermark(doc, pageWidth, pageHeight, label = 'ฉบับร่าง (รอการอนุมัติ)', place = null) {
    const y = place?.y ?? pageHeight / 2;
    const angle = place?.angle ?? 45;
    try {
      if (typeof doc.saveGraphicsState === 'function') doc.saveGraphicsState();
      if (typeof doc.setGState === 'function' && typeof doc.GState === 'function') {
        doc.setGState(new doc.GState({ opacity: 0.14 }));
      }
      doc.setFont('Sarabun', 'bold');
      doc.setFontSize(28);
      doc.setTextColor(180, 180, 180);
      try {
        doc.text(label, pageWidth / 2, y, { align: 'center', angle });
      } catch (_) {
        doc.text(label, pageWidth / 2, y, { align: 'center' });
      }
      if (typeof doc.restoreGraphicsState === 'function') doc.restoreGraphicsState();
    } catch (_) {}
  }

  async function createPp6Report(report, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const isBooklet = options?.reportFormat === 'booklet' || report?.reportFormat === 'booklet';
    const students = report?.students || (report?.student ? [report.student] : []);

    students.forEach((stu, sIdx) => {
      const studentFirstPage = doc.internal.getNumberOfPages();
      // -------------------------------------------------------------
      // 1. PAGE 1: COVER PAGE (FOR BOOKLET MODE)
      // -------------------------------------------------------------
      if (isBooklet) {
        if (sIdx > 0) {
          doc.addPage('a4', 'portrait');
        }

        // Center School Logo
        if (logo) {
          try {
            doc.addImage(logo, 'PNG', (pageWidth - 26) / 2, 20, 26, 26);
          } catch (_) {}
        }

        doc.setFont('Sarabun', 'bold');
        doc.setFontSize(15);
        doc.text('แบบรายงานผลการพัฒนาคุณภาพผู้เรียนรายบุคคล ( ปพ.6 )', pageWidth / 2, 54, { align: 'center' });

        const yearText = text(stu.academicYear || report?.academicYear || meta.academicYear || '-');
        doc.setFontSize(13);
        doc.text(`ปีการศึกษา ${yearText}`, pageWidth / 2, 63, { align: 'center' });

        const schoolName = text(meta.schoolName || report?.schoolName || 'โรงเรียน');
        doc.setFontSize(14);
        doc.text(schoolName, pageWidth / 2, 72, { align: 'center' });

        const affiliation = text(stu.affiliation || report?.affiliation || meta.affiliation || '');
        doc.setFont('Sarabun', 'normal');
        doc.setFontSize(11);
        doc.text(affiliation, pageWidth / 2, 79, { align: 'center' });

        // Student Info Box
        const idText = text(stu.studentId || stu.id || '-');
        const nameText = text(stu.fullName || stu.name);
        const gradeText = text(stu.grade || report?.grade || '-');
        const classText = text(stu.classNo || report?.classNo || '-');
        const studentNumberText = text(stu.classNumber || stu.studentNumber || stu.student_number || '-');
        const nationalIdText = text(stu.nationalId || stu.national_id || stu.idCard || '-');

        doc.setFont('Sarabun', 'bold');
        doc.setFontSize(11.5);
        doc.text(`ชื่อ-นามสกุล  ${nameText}`, 24, 102);
        doc.text(`ชั้น  ${gradeText}/${classText}   เลขที่  ${studentNumberText}`, 24, 111);
        doc.text(`เลขประจำตัว  ${idText}   เลขประจำตัวประชาชน  ${nationalIdText}`, 24, 120);

        // Message to Parents
        doc.setFont('Sarabun', 'bold');
        doc.setFontSize(11);
        doc.text('เรียน ท่านผู้ปกครอง', 32, 146);

        doc.setFont('Sarabun', 'normal');
        doc.setFontSize(10.5);
        const parentMsg = 'เมื่อท่านได้รับสมุดรายงานการพัฒนาคุณภาพผู้เรียนรายบุคคล (ปพ.6) ฉบับนี้ โปรดสละเวลาพิจารณาผลการเรียน การอ่าน คิดวิเคราะห์และเขียน การประเมินคุณลักษณะอันพึงประสงค์ การเข้าร่วมกิจกรรมพัฒนาผู้เรียน และกรุณาแสดงความคิดเห็นเกี่ยวกับตัวนักเรียนด้วยความจริงใจ เพื่อร่วมกันพัฒนานักเรียนให้ถูกต้องเหมาะสมต่อไป';
        const splitMsg = doc.splitTextToSize(parentMsg, 148);
        let msgY = 154;
        doc.text(splitMsg[0], 42, msgY);
        for (let m = 1; m < splitMsg.length; m++) {
          msgY += 6.2;
          doc.text(splitMsg[m], 32, msgY);
        }

        // Director Sign-off
        const directorName = text(stu.principalName || meta.directorName || '');
        const sigX = pageWidth / 2 + 25;
        let dirY = 206;
        doc.text('ขอแสดงความนับถือ', sigX, dirY, { align: 'center' });
        // ลายเซ็น ผอ. บนปกเหมือนหน้าผลการเรียน (owner 2026-10-18: ปกว่าง แต่ตัวรายงานมีลายเซ็น)
        if (meta?.includeSignatures !== false && (stu.directorSignature || meta?.directorSignature)) {
          try {
            doc.addImage(stu.directorSignature || meta.directorSignature, 'PNG', sigX - 15, dirY + 5, 30, 9.5);
          } catch (_) {}
        }
        dirY += 18;
        doc.text(`( ${directorName} )`, sigX, dirY, { align: 'center' });
        dirY += 6.5;
        doc.text(`ผู้อำนวยการโรงเรียน${schoolName.replace(/^โรงเรียน/, '')}`, sigX, dirY, { align: 'center' });

        // -------------------------------------------------------------
        // 2. PAGE 2: STUDENT PROFILE & ATTENDANCE / GROWTH
        // -------------------------------------------------------------
        doc.addPage('a4', 'portrait');

        doc.setFont('Sarabun', 'bold');
        doc.setFontSize(13);
        doc.text('ข้อมูลส่วนตัวผู้เรียน', pageWidth / 2, 16, { align: 'center' });

        doc.setFont('Sarabun', 'bold');
        doc.setFontSize(9.5);
        let profY = 24;
        const leftX = 14;
        const lineH = 6.2;

        const birthdateThai = text(stu.birthdateThai || stu.birthdate || '-');
        const religion = text(stu.religion || '-');
        const ethnicity = text(stu.ethnicity || '-');
        const nationality = text(stu.nationality || '-');
        const address = text(stu.address || '-');
        const fatherName = text(stu.father_name || stu.fatherName || '-');
        const fatherOcc = text(stu.father_occupation || stu.fatherOccupation || '-');
        const motherName = text(stu.mother_name || stu.motherName || '-');
        const motherOcc = text(stu.mother_occupation || stu.motherOccupation || '-');
        const guardianName = text(stu.guardian_name || stu.guardianName || '-');
        const guardianRel = text(stu.guardian_relation || stu.guardianRelation || '-');

        doc.text(`ชื่อ-นามสกุล  ${nameText}   เลขประจำตัว  ${idText}`, leftX, profY);
        profY += lineH;
        doc.text(`เลขประจำตัวประชาชน  ${nationalIdText}`, leftX, profY);
        profY += lineH;
        doc.text(`วัน เดือน ปี เกิด  ${birthdateThai}   ศาสนา  ${religion}   เชื้อชาติ  ${ethnicity}   สัญชาติ  ${nationality}`, leftX, profY);
        profY += lineH;
        doc.text(`ที่อยู่เลขที่  ${address}`, leftX, profY);
        profY += lineH;
        doc.text(`ชื่อบิดา  ${fatherName}   อาชีพ  ${fatherOcc}`, leftX, profY);
        profY += lineH;
        doc.text(`ชื่อมารดา  ${motherName}   อาชีพ  ${motherOcc}`, leftX, profY);
        profY += lineH;
        doc.text(`ชื่อผู้ปกครอง  ${guardianName}   เกี่ยวข้องเป็น  ${guardianRel}`, leftX, profY);

        profY += 9;
        doc.setFont('Sarabun', 'bold');
        doc.setFontSize(11);
        doc.text('ข้อมูลเวลาเรียนและความเจริญเติบโต', leftX, profY);

        const monthsList = [
          'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม',
          'พฤศจิกายน', 'ธันวาคม', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม'
        ];

        let sumTot = 0, sumPre = 0, sumAbs = 0, sumSck = 0, sumLev = 0;
        const attRows = monthsList.map((mName, mIdx) => {
          const rowData = stu.monthlyAttendance?.[mIdx] || {};
          const tot = Number(rowData.total || rowData.totalDays) || 0;
          const pre = Number(rowData.present) || 0;
          const abs = Number(rowData.absent) || 0;
          const sck = Number(rowData.sick) || 0;
          const lev = Number(rowData.leave) || 0;

          sumTot += tot; sumPre += pre; sumAbs += abs; sumSck += sck; sumLev += lev;

          return [
            mName,
            tot > 0 ? String(tot) : '',
            pre > 0 ? String(pre) : '',
            abs > 0 ? String(abs) : '',
            sck > 0 ? String(sck) : '',
            lev > 0 ? String(lev) : '',
            text(rowData.age || ''),
            text(rowData.weight || ''),
            text(rowData.height || '')
          ];
        });

        attRows.push([
          'รวม',
          sumTot > 0 ? String(sumTot) : '',
          sumPre > 0 ? String(sumPre) : '',
          sumAbs > 0 ? String(sumAbs) : '',
          sumSck > 0 ? String(sumSck) : '',
          sumLev > 0 ? String(sumLev) : '',
          '', '', ''
        ]);

        runAutoTable(doc, tableDefaults({
          startY: profY + 3,
          head: [['เดือน', 'เวลาเรียน', 'มาเรียน', 'ขาด', 'ป่วย', 'ลากิจ', 'อายุ (ปี)', 'น้ำหนัก', 'ส่วนสูง']],
          body: attRows,
          margin: { left: 14, right: 14 },
          styles: {
            font: 'Sarabun',
            fontSize: 8.5,
            cellPadding: 1.2,
            lineColor: [0, 0, 0],
            lineWidth: 0.2,
            textColor: [0, 0, 0],
            valign: 'middle',
            halign: 'center',
            minCellHeight: 5.5
          },
          headStyles: {
            font: 'Sarabun',
            fontStyle: 'bold',
            fontSize: 9,
            fillColor: [245, 245, 245],
            textColor: [0, 0, 0],
            lineColor: [0, 0, 0],
            lineWidth: 0.2,
            halign: 'center',
            valign: 'middle'
          },
          columnStyles: {
            0: { cellWidth: 32, halign: 'left' },
            1: { cellWidth: 18 },
            2: { cellWidth: 18 },
            3: { cellWidth: 16 },
            4: { cellWidth: 16 },
            5: { cellWidth: 16 },
            6: { cellWidth: 20 },
            7: { cellWidth: 23 },
            8: { cellWidth: 23 }
          },
          didParseCell: function(data) {
            if (data.row.index === 11) {
              data.cell.styles.fontStyle = 'bold';
              if (data.column.index === 0) data.cell.styles.halign = 'center';
            }
          }
        }));
      }

      // -------------------------------------------------------------
      // 3. PAGE 3: GRADE REPORT (ปพ.6 แบบสรุปผลการเรียน)
      if (!isBooklet && sIdx > 0) {
        doc.addPage('a4', 'portrait');
      } else if (isBooklet) {
        doc.addPage('a4', 'portrait');
      }

      // Top Right Badge "ปพ.6"
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(pageWidth - 26, 10, 14, 6);
      doc.setFont('Sarabun', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text('ปพ.6', pageWidth - 19, 14.2, { align: 'center' });

      // Top Left Logo
      if (logo) {
        try {
          doc.addImage(logo, 'PNG', 12, 10, 18, 18);
        } catch (_) {}
      }

      // Centered Header
      doc.setFont('Sarabun', 'bold');
      doc.setFontSize(13);
      doc.text('แบบรายงานผลการพัฒนาคุณภาพผู้เรียนรายบุคคล', pageWidth / 2, 14.5, { align: 'center' });

      const yearText = text(stu.academicYear || report?.academicYear || meta.academicYear || '-');
      let termSuffix = '';
      const chosenTerm = String(stu.term || report?.term || options?.term || 'year');
      if (chosenTerm === '1') {
        termSuffix = ' ภาคเรียนที่ 1';
      } else if (chosenTerm === '2') {
        termSuffix = ' ภาคเรียนที่ 2';
      }
      doc.setFont('Sarabun', 'normal');
      doc.setFontSize(10.5);
      doc.text(`ปีการศึกษา ${yearText}${termSuffix}`, pageWidth / 2, 19.5, { align: 'center' });

      const schoolName = text(meta.schoolName || report?.schoolName || 'โรงเรียน');
      doc.setFont('Sarabun', 'bold');
      doc.setFontSize(12);
      doc.text(schoolName, pageWidth / 2, 24.5, { align: 'center' });

      const affiliation = text(stu.affiliation || report?.affiliation || meta.affiliation || '');
      doc.setFont('Sarabun', 'normal');
      doc.setFontSize(10);
      doc.text(affiliation, pageWidth / 2, 29, { align: 'center' });

      // Student Info Line
      const idText = text(stu.studentId || stu.id || '-');
      const nameText = text(stu.fullName || stu.name);
      const gradeText = text(stu.grade || report?.grade || '-');
      const classText = text(stu.classNo || report?.classNo || '-');

      doc.setFont('Sarabun', 'bold');
      doc.setFontSize(10);
      doc.text(`รหัสประจำตัวนักเรียน : ${idText}   ชื่อ - นามสกุล : ${nameText}   ชั้น ${gradeText} ห้อง ${classText}`, 12, 36);

      // Main Subject Table (Official 7-column Government Format)
      // ปพ.6 แบบมีคะแนน (owner 2026-10-09): "คะแนนที่ได้" before "ระดับผลการเรียน" and no "หมายเหตุ".
      // Either way the grade column is index pp6GradeCol.
      const pp6WithScores = report?.withScores === true || options?.pp6WithScores === true;
      const pp6GradeCol = pp6WithScores ? 6 : 5;
      const head = [
        [
          { content: 'ลำดับ' },
          { content: 'รหัสวิชา' },
          { content: 'ชื่อวิชา' },
          { content: 'ประเภท' },
          { content: 'จำนวน\nชั่วโมง' },
          ...(pp6WithScores
            ? [{ content: 'คะแนน\nที่ได้' }, { content: 'ระดับผล\nการเรียน' }]
            : [{ content: 'ระดับผล\nการเรียน' }, { content: 'หมายเหตุ' }])
        ]
      ];

      const subjects = stu.subjects || [];
      const body = subjects.map((sub, i) => {
        const isAct = sub.type === 'กิจกรรม' || sub.isActivity;
        const finalGrade = isAct
          ? (sub.grade || sub.fg || 'ยังไม่ประเมิน')
          : (sub.grade ?? sub.fg ?? (sub.t2 ? sub.g2 : sub.g1) ?? '');
        const scoreText = !isAct && sub.score !== undefined && sub.score !== null && sub.score !== '' && Number.isFinite(Number(sub.score))
          ? String(Math.round(Number(sub.score) * 10) / 10) : '';
        return [
          sub.no !== undefined && sub.no !== '' ? sub.no : (isAct ? '' : (i + 1)),
          // กิจกรรมพัฒนาผู้เรียนไม่แสดงรหัสวิชา (owner 2026-10-14: "ใน ปพ.6 ไม่ต้องแสดง รหัสวิชา ประเภทกิจกรรม ปล่อยว่างเลย")
          isAct ? '' : (sub.code || ''),
          sub.name || '',
          sub.type || '',
          sub.hours !== undefined && sub.hours !== null && sub.hours !== '' ? String(sub.hours) : '',
          ...(pp6WithScores ? [scoreText, finalGrade] : [finalGrade, ''])
        ];
      });

      // Pad empty rows up to 18 rows total for official layout
      const targetTotalRows = 18;
      while (body.length < targetTotalRows) {
        body.push(['', '', '', '', '', '', '']);
      }

      runAutoTable(doc, tableDefaults({
        startY: 39,
        head,
        body,
        margin: { left: 12, right: 12 },
        styles: {
          font: 'Sarabun',
          fontStyle: 'normal',
          fontSize: 8.5,
          cellPadding: 0.8,
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          textColor: [0, 0, 0],
          valign: 'middle',
          halign: 'center',
          minCellHeight: 5.2
        },
        headStyles: {
          font: 'Sarabun',
          fontStyle: 'bold',
          fontSize: 8.5,
          cellPadding: 0.8,
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          halign: 'center',
          valign: 'middle'
        },
        columnStyles: {
          0: { cellWidth: 12 },
          1: { cellWidth: 20 },
          2: { cellWidth: 68, halign: 'left' },
          3: { cellWidth: 18 },
          4: { cellWidth: 18 },
          // score + grade (24 + 26) or grade + remark (26 + 24): the grade column stays 26 mm
          5: { cellWidth: pp6WithScores ? 24 : 26 },
          6: { cellWidth: pp6WithScores ? 26 : 24 }
        },
        didParseCell: function(data) {
          if (data.row.raw && data.row.raw[3] === 'กิจกรรม') {
            if (data.column.index === pp6GradeCol) {
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      }));

      const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 145;
      let bottomStartY = Math.max(finalY + 3, 148);
      // Keep the evaluation block and all three signatures on the same page.
      if (bottomStartY + 70 > pageHeight - 12) {
        doc.addPage('a4', 'portrait');
        doc.setFont('Sarabun', 'bold');
        doc.setFontSize(11);
        doc.text('สรุปผลการประเมิน (ต่อ) - ' + nameText, pageWidth / 2, 17, { align: 'center' });
        bottomStartY = 23;
      }

      // Left Side: Summary Evaluation Table
      const summaryHead = [
        [
          { content: 'สรุปผลการประเมิน', rowSpan: 2 },
          { content: 'ผลการเรียน', colSpan: 2 }
        ],
        [
          { content: 'ที่เรียน' },
          { content: 'ที่ได้' }
        ]
      ];

      const basicCredTotal = text(stu.basicCreditsTotal ?? '-');
      const basicCredEarned = text(stu.basicCreditsEarned ?? '-');
      const addCredTotal = text(stu.addCreditsTotal ?? '-');
      const addCredEarned = text(stu.addCreditsEarned ?? '-');
      const totCredTotal = text(stu.totalCreditsTotal ?? '-');
      const totCredEarned = text(stu.totalCreditsEarned ?? '-');
      const gpa = text(stu.gpaInfo?.gpa ?? (stu.gpa !== undefined && stu.gpa !== null ? stu.gpa : '-'));

      const isShowRank = stu.showRank !== false && report?.showRank !== false && options?.showRank !== false;
      const classRank = isShowRank ? text(stu.gpaInfo?.classRank ?? (stu.classRank || '-')) : '';
      const totalStudents = text(stu.gpaInfo?.totalStudents ?? (stu.totalStudents ?? '-'));
      const rankRowLabel = isShowRank ? `อันดับที่ในห้องเรียน จากนักเรียนจำนวน ${totalStudents} คน` : 'อันดับที่ในห้องเรียน';

      const charResult = text(stu.assessments?.character?.result || 'ยังไม่ประเมิน');
      const rtwResult = text(stu.assessments?.reading?.result || 'ยังไม่ประเมิน');
      const actResult = text(stu.assessments?.activities?.result || 'ยังไม่ประเมิน');

      const summaryBody = [
        ['จำนวนหน่วยกิต/น้ำหนักวิชาพื้นฐาน', basicCredTotal, basicCredEarned],
        ['จำนวนหน่วยกิต/น้ำหนักวิชาเพิ่มเติม', addCredTotal, addCredEarned],
        ['รวมจำนวนหน่วยกิต/น้ำหนัก', totCredTotal, totCredEarned],
        [{ content: 'ระดับผลการเรียนเฉลี่ย(GPA)', colSpan: 2 }, gpa],
        // ยังมีวิชาที่เป็น ร / มส: เกรดเฉลี่ยยังไม่รวมวิชาเหล่านั้น — บอกไว้ในเอกสาร (owner 2026-10-20)
        ...(Number(stu.gpaInfo?.specialCount) > 0 ? [[{ content: `หมายเหตุ: ยังมีผล ร / มส ${stu.gpaInfo.specialCount} วิชา ยังไม่นำมาคิดเกรดเฉลี่ย`, colSpan: 3, styles: { halign: 'left', fontSize: 9, textColor: [180, 83, 9] } }]] : []),
        [{ content: 'การประเมินคุณลักษณะ', colSpan: 3, styles: { fontStyle: 'bold', halign: 'left', fillColor: [248, 248, 248] } }],
        [{ content: 'ผลการประเมินคุณลักษณะอันพึงประสงค์', colSpan: 2 }, charResult],
        [{ content: 'ผลการประเมินการอ่าน คิดวิเคราะห์ และเขียน', colSpan: 2 }, rtwResult],
        [{ content: 'ผลการประเมินกิจกรรมพัฒนาผู้เรียน', colSpan: 2 }, actResult],
        [{ content: rankRowLabel, colSpan: 2 }, classRank]
      ];

      runAutoTable(doc, tableDefaults({
        startY: bottomStartY,
        pageBreak: 'avoid',
        head: summaryHead,
        body: summaryBody,
        margin: { left: 12, right: 102 },
        styles: {
          font: 'Sarabun',
          fontStyle: 'normal',
          fontSize: 8,
          cellPadding: 0.8,
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          textColor: [0, 0, 0],
          valign: 'middle',
          halign: 'center',
          minCellHeight: 4.6
        },
        headStyles: {
          font: 'Sarabun',
          fontStyle: 'bold',
          fontSize: 8,
          cellPadding: 0.8,
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          halign: 'center',
          valign: 'middle'
        },
        // "ยังไม่ประเมิน" is 14.9 mm at 8 pt (+1.6 mm padding): a 16 mm result column wrapped it to
        // "ยังไม่ประเมิ / น". Column 0's longest label is ~41 mm, so it gives 4 mm; the total stays 96 mm.
        columnStyles: {
          0: { cellWidth: 60, halign: 'left' },
          1: { cellWidth: 16, halign: 'center' },
          2: { cellWidth: 20, halign: 'center' }
        }
      }));

      // Right Side: Signatures
      const sigCenterX = 158;
      const teacherName = text(stu.homeroomTeacher || meta.homeroomTeacher);
      const directorName = text(stu.principalName || meta.directorName || '');
      const teacherRole = meta?.teacherPosition || stu?.teacherPosition || (text(stu.grade || meta.grade).includes('ม') ? 'ครูที่ปรึกษา' : 'ครูประจำชั้น');

      // Signature 1: ครูประจำชั้น / ครูที่ปรึกษา
      let sigY = bottomStartY + 5.5;
      doc.setFont('Sarabun', 'normal');
      doc.setFontSize(9.5);
      if (meta?.includeSignatures !== false && (stu.teacherSignature || meta?.teacherSignature)) {
        try {
          doc.addImage(stu.teacherSignature || meta.teacherSignature, 'PNG', sigCenterX - 14, sigY - 8, 28, 9.5);
        } catch (_) {}
      }
      doc.text('ลงชื่อ.......................................................', sigCenterX, sigY, { align: 'center' });
      sigY += 5.5;
      doc.text(teacherName ? `( ${teacherName} )`: '(  )', sigCenterX, sigY, { align: 'center' });
      sigY += 5.5;
      doc.text(teacherRole, sigCenterX, sigY, { align: 'center' });

      // Signature 2: ผู้อำนวยการโรงเรียน & ตราประทับ
      sigY = bottomStartY + 28.5;
      if (meta?.includeSignatures !== false && (meta?.schoolStamp || stu.schoolStamp)) {
        try {
          doc.addImage(meta.schoolStamp || stu.schoolStamp, 'PNG', sigCenterX - 9.5, sigY - 5.5, 19, 19);
        } catch (_) {}
      }
      if (meta?.includeSignatures !== false && (stu.directorSignature || meta?.directorSignature)) {
        try {
          doc.addImage(stu.directorSignature || meta.directorSignature, 'PNG', sigCenterX - 14, sigY - 8, 28, 9.5);
        } catch (_) {}
      }
      doc.text('ลงชื่อ.......................................................', sigCenterX, sigY, { align: 'center' });
      sigY += 5.5;
      doc.text(`( ${directorName} )`, sigCenterX, sigY, { align: 'center' });
      sigY += 5.5;
      doc.text(meta.directorPosition || 'ผู้อำนวยการโรงเรียน', sigCenterX, sigY, { align: 'center' });

      // Signature 3: ผู้ปกครอง
      sigY = bottomStartY + 50.5;
      doc.text('ลงชื่อ.......................................................', sigCenterX, sigY, { align: 'center' });
      sigY += 5.5;
      doc.text('ผู้ปกครอง', sigCenterX, sigY, { align: 'center' });
      
      // 4. PAGE 4: TEACHER & PARENT COMMENTS (FOR BOOKLET MODE)
      // -------------------------------------------------------------
      if (isBooklet) {
        doc.addPage('a4', 'portrait');

        doc.setFont('Sarabun', 'bold');
        doc.setFontSize(14);
        doc.text('ความเห็นครูประจำชั้นและผู้ปกครอง', pageWidth / 2, 18, { align: 'center' });

        function renderTermCommentBox(termLabel, startBoxY, teacherCommentText) {
          const boxX = 14;
          const boxW = 182;
          const boxH = 104;
          const colW = boxW / 2;

          doc.setFont('Sarabun', 'bold');
          doc.setFontSize(12);
          doc.text(termLabel, boxX, startBoxY - 2.5);

          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.3);
          doc.rect(boxX, startBoxY, boxW, boxH);
          doc.line(boxX + colW, startBoxY, boxX + colW, startBoxY + boxH);
          doc.line(boxX, startBoxY + 8, boxX + boxW, startBoxY + 8);

          doc.setFont('Sarabun', 'bold');
          doc.setFontSize(10);
          doc.text('ความเห็นของครูประจำชั้น', boxX + colW / 2, startBoxY + 5.5, { align: 'center' });
          doc.text('ความเห็นของผู้ปกครอง', boxX + colW + colW / 2, startBoxY + 5.5, { align: 'center' });

          if (teacherCommentText) {
            doc.setFont('Sarabun', 'normal');
            doc.setFontSize(9.5);
            const splitComment = doc.splitTextToSize(teacherCommentText, colW - 8);
            doc.text(splitComment, boxX + 4, startBoxY + 14);
          }

          const footerY = startBoxY + boxH - 18;
          doc.line(boxX, footerY, boxX + boxW, footerY);

          doc.setFont('Sarabun', 'normal');
          doc.setFontSize(9);
          doc.text('ลงชื่อ.......................................................', boxX + colW / 2, footerY + 5.5, { align: 'center' });
          doc.text('ครูประจำชั้น/ครูที่ปรึกษา', boxX + colW / 2, footerY + 11.5, { align: 'center' });

          doc.text('ลงชื่อ.......................................................', boxX + colW + colW / 2, footerY + 5.5, { align: 'center' });
          doc.text('ผู้ปกครอง', boxX + colW + colW / 2, footerY + 11.5, { align: 'center' });
        }

        // ความเห็นแยกตามภาค ไม่ยืมความเห็นภาค 1 ไปใส่ภาค 2 และพิมพ์ภาคเรียนที่ 1 = ช่องภาค 2 ว่าง (owner 2026-10-18)
        // teacherComment (ค่าเดียว) ใช้เฉพาะข้อมูลแบบเก่าที่ไม่มีความเห็นรายภาค
        const hasTermComments = stu.teacherCommentTerm1 !== undefined || stu.teacherCommentTerm2 !== undefined;
        const printedTerm = String(report?.term ?? options?.term ?? '');
        const tComment1 = text(hasTermComments ? (stu.teacherCommentTerm1 || '') : (stu.teacherComment || ''));
        const tComment2 = printedTerm === '1' ? '' : text(hasTermComments ? (stu.teacherCommentTerm2 || '') : '');

        renderTermCommentBox('ภาคเรียนที่ 1', 28, tComment1);
        renderTermCommentBox('ภาคเรียนที่ 2', 146, tComment2);
      }

      // ลายน้ำ "ฉบับร่าง (ข้อมูลยังไม่ครบ)" เอาออกแล้ว (owner 2026-10-07) เหลือเฉพาะ "รอการอนุมัติ" (ผลเลื่อนชั้นยังไม่อนุมัติ)
      if (!options?.suppressDraftWatermark && (report?.promotionStatus === 'pending' || report?.requiresApproval === true)) {
        const label = 'ฉบับร่าง (รอการอนุมัติ)';
        const lastPage = doc.internal.getNumberOfPages();
        for (let page = studentFirstPage; page <= lastPage; page++) {
          doc.setPage(page);
          renderDraftWatermark(doc, pageWidth, pageHeight, label, options?.interimTerm ? { y: pageHeight * 0.52, angle: 10 } : null);
        }
      }
    });

    addDocumentPageNumbers(doc);
    doc.setProperties({ title: isBooklet ? 'เล่ม ปพ.6 แบบรายงานผลรายบุคคล' : 'ปพ.6 แบบรายงานผลรายบุคคล', subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    const blobUrl = finish(doc, meta);
    const dataUri = doc.output('datauristring');
    return { blobUrl, dataUri };
  }

    async function createOnePageReport(report, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const stu = report?.student || {};

    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.6);
    doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

    const title = 'แบบรายงานผลการพัฒนาคุณภาพผู้เรียน (ปพ.๖)';
    drawHeader(doc, title, meta, logo);
    let curY = headerBottom(meta, logo, '');
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);

    const rankText = report?.showRank && report?.rank ? `    ลำดับที่ในห้อง: ${report.rank}` : '';
    doc.text(`เลขประจำตัว: ${text(stu.studentId || stu.id)}    ชื่อ - สกุล: ${text(stu.name || stu.fullName)}    ชั้น: ${text(report?.grade || stu.grade)}/${text(report?.classNo || stu.classNo)}    เลขที่: ${text(stu.studentNumber || stu.student_number || '-')}${rankText}`, 12, curY);
    curY += 5;

    const subjects = report?.subjects || stu.subjects || [];
    const subBody = subjects.map((sub, idx) => [
      idx + 1,
      text(sub.code || sub.subject_code || '-'),
      text(sub.name || sub.subject_name),
      text(sub.hours ?? sub.hoursPerYear ?? '-'),
      text(sub.score ?? '-'),
      text(sub.grade ?? '-')
    ]);

    const gpa = report?.gpa ?? stu.gpa ?? '-';
    subBody.push(['', '', 'ผลการเรียนเฉลี่ยรวม (GPA)', '', '', gpa]);

    runAutoTable(doc, tableDefaults({
      startY: curY,
      head: [['ที่', 'รหัสวิชา', 'รายวิชาพื้นฐาน / เพิ่มเติม', 'ชม./ปี', 'คะแนน', 'เกรด']],
      body: subBody,
      margin: { top: curY, left: 12, right: 12, bottom: 6 },
      styles: { font: 'Sarabun', fontSize: 8, halign: 'center', cellPadding: 1.5 },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 20 }, 2: { cellWidth: 96, halign: 'left' }, 3: { cellWidth: 16 }, 4: { cellWidth: 18 }, 5: { cellWidth: 18 } }
    }));

    curY = doc.lastAutoTable?.finalY || curY + 50;
    curY += 4;
    if (curY + 44 > pageHeight - 40) {
      doc.addPage('a4', 'portrait');
      drawHeader(doc, title, meta, logo);
      curY = headerBottom(meta, logo, '') + 4;
    }

    const boxWidth = (pageWidth - 28) / 2;
    const boxHeight = 36;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(12, curY, boxWidth, boxHeight, 2, 2, 'FD');

    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 51, 102);
    doc.text('สรุปผลการประเมินกิจกรรมและพัฒนาการ', 15, curY + 6);

    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(`1. การอ่าน คิดวิเคราะห์ เขียน: ${text(report?.rtwResult || stu.rtwResult || 'ยังไม่ประเมิน')}`, 15, curY + 13);
    doc.text(`2. คุณลักษณะอันพึงประสงค์: ${text(report?.charResult || stu.charResult || 'ยังไม่ประเมิน')}`, 15, curY + 19);
    doc.text(`3. กิจกรรมพัฒนาผู้เรียน: ${text(report?.activityResult || stu.activityResult || 'ยังไม่ประเมิน')}`, 15, curY + 25);
    doc.text(`4. สมรรถนะสำคัญ: ${text(report?.compResult || stu.compResult || 'ยังไม่ประเมิน')}`, 15, curY + 31);

    const rightBoxX = 12 + boxWidth + 4;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(rightBoxX, curY, boxWidth, boxHeight, 2, 2, 'FD');

    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 51, 102);
    doc.text('การตัดสินผลการเรียนและเลื่อนชั้น', rightBoxX + 4, curY + 6);

    const promoStatus = report?.promotionStatus === 'retain' ? 'ซ้ำชั้น' : report?.promotionStatus === 'promote' ? 'ผ่านเกณฑ์ เลื่อนชั้น' : 'รอการอนุมัติ';
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(`• ผลการตัดสิน: ${promoStatus}`, rightBoxX + 4, curY + 14);
    const appDate = text(report?.approvalDate || '-');
    doc.text(`• วันที่อนุมัติผลการเรียน: ${appDate}`, rightBoxX + 4, curY + 22);
    const attendText = text(report?.attendance || stu.attendance || 'ยังไม่มีข้อมูล');
    doc.text(`• สรุปเวลาเรียน: ${attendText}`, rightBoxX + 4, curY + 30);

    const sigY = pageHeight - 32;
    const col1 = pageWidth * 0.28;
    const col2 = pageWidth * 0.72;
    const teacherName = text(report?.teacherName || meta.homeroomTeacher || '....................................................');
    const directorName = text(meta.directorName || '....................................................');

    drawSignatureImage(doc, meta, meta.teacherSignature || report?.teacherSignature, col1, sigY, 26);
    drawSchoolStamp(doc, meta, col2 + 24, sigY, 15);
    drawSignatureImage(doc, meta, meta.directorSignature || report?.directorSignature, col2, sigY, 26);
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(8);
    doc.text('ลงชื่อ................................................', col1, sigY, { align: 'center' });
    doc.text(`(${teacherName})`, col1, sigY + 5, { align: 'center' });
    doc.text('ครูประจำชั้น', col1, sigY + 9, { align: 'center' });

    doc.text('ลงชื่อ................................................', col2, sigY, { align: 'center' });
    doc.text(`(${directorName})`, col2, sigY + 5, { align: 'center' });
    doc.text(meta.directorPosition || 'ผู้อำนวยการสถานศึกษา', col2, sigY + 9, { align: 'center' });

    // ลายน้ำ "ฉบับร่าง (ข้อมูลยังไม่ครบ)" เอาออกแล้ว (owner 2026-10-07) เหลือเฉพาะ "รอการอนุมัติ" (ผลเลื่อนชั้นยังไม่อนุมัติ)
    if (!options?.suppressDraftWatermark && (report?.promotionStatus === 'pending' || report?.requiresApproval === true)) {
      const label = 'ฉบับร่าง (รอการอนุมัติ)';
      renderDraftWatermark(doc, pageWidth, pageHeight, label, options?.interimTerm ? { y: pageHeight * 0.52, angle: 10 } : null);
    }
    doc.setProperties({ title: 'รายงานผลการเรียนหน้าเดียว', subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    const blobUrl = finish(doc, meta);
    const dataUri = doc.output('datauristring');
    return { blobUrl, dataUri };
  }

  async function createClassSubjectScoreReport(report, options, target = null) {
    const jsPDF = getJsPdf();
    const orientation = report?.orientation === 'landscape' ? 'landscape' : 'portrait';
    const isPortrait = orientation === 'portrait';
    const doc = target?.doc || new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    if (!target?.doc) await installFonts(doc);
    const meta = target?.meta || officialMeta(options || {});
    const logo = target && Object.prototype.hasOwnProperty.call(target, 'logo') ? target.logo : await loadOfficialLogo(meta.logo);
    const title = text(report?.title || 'แบบสรุปผลสัมฤทธิ์ทางการเรียนรายชั้น');
    const bindingLeftMargin = isPortrait ? 18 : 10;
    const outerRightMargin = isPortrait ? 7 : 10;
    drawHeader(doc, title, meta, logo, '', { leftMargin: bindingLeftMargin, rightMargin: outerRightMargin });
    const startY = headerBottom(meta, logo, '');

    const students = report?.students || [];
    const subjects = report?.subjects || [];
    const includeRank = report?.includeRank !== false;
    const subHeaders = subjects.length ? subjects.map((subject) => text(subject.name || subject.subjectName || subject.code)) : ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์', 'สังคมศึกษา', 'สุขศึกษา', 'ศิลปะ', 'การงานอาชีพ', 'ภาษาอังกฤษ'];
    const displayedSubjectHeaders = subHeaders.map((label) => isPortrait ? '' : label);
    const tailHeaders = includeRank ? ['GPA', 'อันดับ'] : ['GPA'];
    const head = [['ที่', 'รหัส', 'ชื่อ - นามสกุล', ...displayedSubjectHeaders, ...tailHeaders]];
    const body = students.map((student, index) => {
      const scores = student.subjectScores || {};
      const subjectValues = subjects.length ? subjects.map((subject) => scores[subject.id || subject.code] ?? '-') : [
        scores.thai ?? '-', scores.math ?? '-', scores.science ?? '-', scores.social ?? '-',
        scores.health ?? '-', scores.art ?? '-', scores.work ?? '-', scores.english ?? '-'
      ];
      const row = [
        index + 1,
        text(student.studentId || student.id),
        text(student.name || student.fullName),
        ...subjectValues,
        scores.gpa ?? scores.avg ?? '-'
      ];
      if (includeRank) row.push(scores.rank ?? student.rank ?? '-');
      return row;
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const availableTableWidth = pageWidth - bindingLeftMargin - outerRightMargin;
    const numberColumnWidth = isPortrait ? 8 : 9;
    const idColumnWidth = isPortrait ? 14 : 18;
    const gpaColumnWidth = isPortrait ? 10 : 12;
    const rankColumnWidth = includeRank ? (isPortrait ? 9 : 11) : 0;
    const subjectCount = Math.max(subHeaders.length, 1);
    const nameColumnWidth = isPortrait
      ? Math.max(38, Math.min(52, availableTableWidth - numberColumnWidth - idColumnWidth - gpaColumnWidth - rankColumnWidth - subjectCount * 5.8))
      : 46;
    const subjectColumnWidth = isPortrait
      ? (availableTableWidth - numberColumnWidth - idColumnWidth - nameColumnWidth - gpaColumnWidth - rankColumnWidth) / subjectCount
      : 'auto';
    const bodyFontSize = isPortrait ? Math.max(6.6, Math.min(8, subjectColumnWidth + 0.2)) : 7.5;
    let subjectHeaderFontSize = isPortrait ? Math.max(6, Math.min(7.2, subjectColumnWidth)) : 7.2;
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(subjectHeaderFontSize);
    let longestSubjectHeader = Math.max(...subHeaders.map((label) => doc.getTextWidth(label)), 0);
    while (isPortrait && longestSubjectHeader > 40 && subjectHeaderFontSize > 5.6) {
      subjectHeaderFontSize = Math.max(5.6, subjectHeaderFontSize - 0.2);
      doc.setFontSize(subjectHeaderFontSize);
      longestSubjectHeader = Math.max(...subHeaders.map((label) => doc.getTextWidth(label)), 0);
    }
    const subjectHeaderHeight = isPortrait ? Math.max(34, Math.min(45, longestSubjectHeader + 5)) : 7;
    const columnStyles = {
      0: { cellWidth: numberColumnWidth },
      1: { cellWidth: idColumnWidth },
      2: { cellWidth: nameColumnWidth, halign: 'left', overflow: 'ellipsize' }
    };
    subHeaders.forEach((_label, index) => {
      columnStyles[index + 3] = { cellWidth: subjectColumnWidth };
    });
    const gpaColumnIndex = subHeaders.length + 3;
    columnStyles[gpaColumnIndex] = { cellWidth: gpaColumnWidth };
    if (includeRank) columnStyles[gpaColumnIndex + 1] = { cellWidth: rankColumnWidth };

    runAutoTable(doc, tableDefaults({
      startY,
      head,
      body: body.length ? body : [['', '', 'ไม่พบข้อมูลนักเรียน', ...subHeaders.map(() => ''), '', ...(includeRank ? [''] : [])]],
      margin: { top: startY, left: bindingLeftMargin, right: outerRightMargin, bottom: 8 },
      styles: {
        font: 'Sarabun', fontSize: bodyFontSize, cellPadding: isPortrait ? 0.75 : 1,
        lineColor: [0, 0, 0], lineWidth: 0.18, textColor: [0, 0, 0], fillColor: [255, 255, 255],
        halign: 'center', valign: 'middle', minCellHeight: isPortrait ? 7.2 : 7
      },
      headStyles: {
        font: 'Sarabun', fontStyle: 'bold', fontSize: isPortrait ? Math.max(6.8, bodyFontSize - 0.2) : 7.2,
        fillColor: [245, 245, 245], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.22,
        valign: 'middle', halign: 'center'
      },
      bodyStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      columnStyles,
      didParseCell(cell) {
        if (isPortrait && cell.section === 'head' && cell.column.index >= 3 && cell.column.index < gpaColumnIndex) {
          cell.cell.text = [''];
          cell.cell.styles.minCellHeight = subjectHeaderHeight;
          cell.cell.styles.cellPadding = 0.4;
        }
      },
      didDrawCell(cell) {
        if (!isPortrait || cell.section !== 'head' || cell.column.index < 3 || cell.column.index >= gpaColumnIndex) return;
        const label = subHeaders[cell.column.index - 3] || '';
        doc.setFont('Sarabun', 'normal');
        doc.setFontSize(subjectHeaderFontSize);
        doc.setTextColor(0, 0, 0);
        doc.text(label, cell.cell.x + cell.cell.width / 2 + subjectHeaderFontSize * 0.16, cell.cell.y + cell.cell.height - 2.5, { angle: 90, align: 'left' });
      }
    }));

    addSignatures(doc, meta, doc.lastAutoTable?.finalY || startY);
    if (target?.embedded) {
      return { embedded: true, finalY: doc.lastAutoTable?.finalY || startY };
    }
    addDocumentPageNumbers(doc);
    doc.setProperties({ title, subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    const blobUrl = finish(doc, meta);
    const dataUri = doc.output('datauristring');
    return { blobUrl, dataUri };
  }

  async function createClassAssessmentSummaryReport(report, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    const title = text(report?.title || 'แบบสรุปผลการประเมินรายชั้น');
    drawHeader(doc, title, meta, logo);
    const startY = headerBottom(meta, logo, '');

    const students = report?.students || [];
    const head = [['ที่', 'เลข\nประจำตัว', 'ชื่อ - สกุล', 'รวมคะแนน', 'คะแนน\nเต็ม', 'ร้อยละ', 'GPA', 'อันดับห้อง', 'อันดับชั้น', 'อ่านคิดวิเคราะห์', 'คุณลักษณะ\n8 ด้าน', 'กิจกรรมพัฒนา', 'สมรรถนะสำคัญ']];
    const numericCell = (value, digits) => value === null || value === undefined || text(value).trim() === '' || !Number.isFinite(Number(value))
      ? '-' : (digits === undefined ? text(value) : Number(value).toFixed(digits));
    const body = students.map((s, idx) => [
      idx + 1,
      text(s.studentId || s.id),
      text(s.name || s.fullName),
      numericCell(s.sumTotal),
      numericCell(s.fullScore),
      numericCell(s.pct, 2),
      numericCell(s.gpa, 2),
      text(s.classRank ?? '-'),
      text(s.gradeRank ?? '-'),
      text(s.rtwResult || s.rtw || '-'),
      text(s.charResult || s.characteristic || '-'),
      text(s.activityResult || s.activity || '-'),
      text(s.compResult || s.competency || '-')
    ]);

    runAutoTable(doc, tableDefaults({
      startY,
      head,
      body: body.length ? body : [['', '', 'ไม่พบข้อมูลนักเรียน', '', '', '', '', '', '', '', '', '', '']],
      margin: { top: startY, left: 14, right: 14, bottom: 8 },
      styles: { font: 'Sarabun', fontSize: 8, halign: 'center' },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 18 }, 2: { cellWidth: 49, halign: 'left' }, 3: { cellWidth: 18 }, 4: { cellWidth: 16 }, 5: { cellWidth: 18 }, 6: { cellWidth: 16 }, 7: { cellWidth: 16 }, 8: { cellWidth: 16 }, 9: { cellWidth: 24 }, 10: { cellWidth: 24 }, 11: { cellWidth: 23 }, 12: { cellWidth: 23 } }
    }));

    addSignatures(doc, meta, doc.lastAutoTable?.finalY || startY);
    addDocumentPageNumbers(doc);
    doc.setProperties({ title, subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    const blobUrl = finish(doc, meta);
    const dataUri = doc.output('datauristring');
    return { blobUrl, dataUri };
  }

  async function createScoreSheet(report, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    const title = text(report?.title || 'แบบบันทึกคะแนนรายวิชา');
    drawHeader(doc, title, meta, logo);
    const startY = headerBottom(meta, logo, '');
    const fullScores = Array.from({ length: 9 }, (_item, index) => number(report?.fullScores?.[index]));
    const fullMid = fullScores.reduce((sum, value) => sum + value, 0);
    const fullFinal = number(report?.fullFinal, 30);
    const fullTotal = fullMid + fullFinal;

    // หัวตารางขึ้นบรรทัดเองทุกคำ: ปล่อยให้ตัดเองจะได้ "กลางภ าค" / "รวมระหว่า งภาค"
    const head = [[
      { content: 'ที่', rowSpan: 2 },
      { content: 'รหัส', rowSpan: 2 },
      { content: 'ชื่อ-นามสกุล', rowSpan: 2 },
      { content: 'คะแนนก่อนกลางภาค', colSpan: 5 },
      { content: 'ครั้งที่ 5\nกลางภาค', rowSpan: 2 },
      { content: 'คะแนนหลังกลางภาค', colSpan: 5 },
      { content: 'รวม\nระหว่างภาค', rowSpan: 2 },
      { content: 'ครั้งที่ 10\nปลายภาค', rowSpan: 2 },
      { content: 'รวม\nทั้งหมด', rowSpan: 2 },
      { content: 'เกรด', rowSpan: 2 }
    ], ['1', '2', '3', '4', 'รวม', '6', '7', '8', '9', 'รวม']];

    const body = [[
      { content: 'คะแนนเต็ม', colSpan: 3 },
      fullScores[0], fullScores[1], fullScores[2], fullScores[3],
      fullScores.slice(0, 4).reduce((sum, value) => sum + value, 0),
      fullScores[4],
      fullScores[5], fullScores[6], fullScores[7], fullScores[8],
      fullScores.slice(5, 9).reduce((sum, value) => sum + value, 0),
      fullMid, fullFinal, fullTotal, ''
    ]];
    (report?.rows || []).forEach((row, index) => {
      const saved = row?.saved !== false;
      const scores = Array.from({ length: 9 }, (_item, scoreIndex) => saved ? displayScoreNumber(row?.scores?.[scoreIndex]) : '');
      body.push([
        index + 1,
        text(row?.id),
        text(row?.name),
        scores[0], scores[1], scores[2], scores[3],
        saved ? displayScoreNumber(scores.slice(0, 4).reduce((sum, value) => sum + number(value), 0)) : '',
        scores[4],
        scores[5], scores[6], scores[7], scores[8],
        saved ? displayScoreNumber(scores.slice(5, 9).reduce((sum, value) => sum + number(value), 0)) : '',
        saved ? displayScoreNumber(row?.mid) : '',
        saved ? displayScoreNumber(row?.final) : '',
        saved ? displayScoreNumber(row?.total) : '',
        saved ? text(row?.grade) : ''
      ]);
    });

    // ตารางเต็มความกว้างกระดาษ ขอบซ้าย-ขวาเท่ากัน (เดิมกว้างรวม ~203 มม. ชิดซ้าย เหลือที่ว่างด้านขวา)
    const pageWidth = doc.internal.pageSize.getWidth();
    const sideMargin = 12;
    const usableWidth = pageWidth - sideMargin * 2;
    const scoreColumn = 10.5;
    const fixedWidths = {
      0: 8, 1: 15,
      3: scoreColumn, 4: scoreColumn, 5: scoreColumn, 6: scoreColumn, 7: 12,
      8: 14,
      9: scoreColumn, 10: scoreColumn, 11: scoreColumn, 12: scoreColumn, 13: 12,
      14: 18, 15: 15, 16: 14, 17: 11
    };
    const nameWidth = usableWidth - Object.values(fixedWidths).reduce((sum, value) => sum + value, 0);
    const columnStyles = { 2: { cellWidth: nameWidth, halign: 'left', overflow: 'ellipsize', cellPadding: { left: 2.5, right: 1, top: 0.6, bottom: 0.6 } } };
    Object.entries(fixedWidths).forEach(([index, width]) => { columnStyles[index] = { cellWidth: width }; });
    // คอลัมน์ผลรวมของแต่ละช่วงพื้นสีอ่อน แยกจากคะแนนรายครั้งให้อ่านง่าย
    const summaryColumns = new Set([7, 13, 14, 16, 17]);

    runAutoTable(doc, tableDefaults({
      startY,
      head,
      body,
      margin: { top: startY, left: sideMargin, right: sideMargin, bottom: 10 },
      tableWidth: usableWidth,
      styles: {
        font: 'Sarabun', fontStyle: 'normal', fontSize: 8.6, cellPadding: 0.6,
        lineColor: [0, 0, 0], lineWidth: 0.18, textColor: [0, 0, 0],
        valign: 'middle', halign: 'center', minCellHeight: 6.4, overflow: 'linebreak'
      },
      headStyles: {
        font: 'Sarabun', fontStyle: 'bold', fontSize: 8.2, cellPadding: 0.8,
        fillColor: [235, 235, 235], textColor: [0, 0, 0], valign: 'middle', halign: 'center'
      },
      columnStyles,
      didParseCell(cell) {
        if (cell.section !== 'body') return;
        if (cell.row.index === 0) {
          cell.cell.styles.fontStyle = 'bold';
          cell.cell.styles.fillColor = [242, 242, 242];
          if (cell.column.index === 0) cell.cell.styles.halign = 'center';
        } else if (summaryColumns.has(cell.column.index)) {
          cell.cell.styles.fillColor = [248, 248, 248];
          if (cell.column.index === 16 || cell.column.index === 17) cell.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawPage(data) {
        if (data.pageNumber > 1) drawHeader(doc, title, meta, logo);
      }
    }));

    // ลายเซ็น 3 ช่องจัดกึ่งกลางตามความกว้างตาราง และยกไปหน้าใหม่ทั้งชุดถ้าเหลือที่ไม่พอ
    let signatureY = (doc.lastAutoTable?.finalY || startY) + 12;
    const pageHeight = doc.internal.pageSize.getHeight();
    if (signatureY + 16 > pageHeight - 10) {
      doc.addPage('a4', 'landscape');
      drawHeader(doc, title, meta, logo);
      signatureY = headerBottom(meta, logo, '') + 14;
    }
    const signatures = [
      { role: `ครูประจำชั้น ${meta.grade}/${meta.classNo}`, name: meta.classTeacher },
      { role: 'หัวหน้างานวิชาการ', name: meta.academicHead },
      { role: meta.directorPosition, name: meta.directorName }
    ];
    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(10);
    signatures.forEach((signature, index) => {
      const x = sideMargin + usableWidth * ((index * 2 + 1) / 6);
      doc.text('ลงชื่อ ..................................................', x, signatureY, { align: 'center' });
      doc.text(`(${signature.name || '..................................................'})`, x, signatureY + 7, { align: 'center' });
      doc.text(signature.role, x, signatureY + 13.5, { align: 'center' });
    });
    addDocumentPageNumbers(doc);
    doc.setProperties({ title, subject: meta.meta, author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    return finish(doc, meta);
  }

  function displayScoreNumber(value) {
    const parsed = number(value);
    const rounded = Math.round(parsed * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  }

  async function createSarAnalyticsPdf(sarData, options) {
    const jsPDF = getJsPdf();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const yearText = text(sarData?.academicYear || meta.academicYear || '2569');

    drawHeader(doc, 'รายงานสรุปผลสัมฤทธิ์ทางการเรียนและการประเมินพัฒนาการผู้เรียน (สำหรับเล่ม SAR)', meta, logo);
    let currentY = headerBottom(meta, logo, '') + 4;

    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(10.5);
    doc.text(`ตารางที่ 1: สรุปผลสัมฤทธิ์ทางการเรียน 8 กลุ่มสาระการเรียนรู้ ประจำปีการศึกษา ${yearText}`, 10, currentY);
    currentY += 3.5;

    const areas = sarData?.areas || sarData?.subjectAreas || [];
    const areaHead = [
      [
        { content: 'กลุ่มสาระการเรียนรู้', rowSpan: 2 },
        { content: 'จำนวน\nนักเรียน', rowSpan: 2 },
        { content: 'จำนวนนักเรียนที่ได้ระดับผลการเรียน (คน)', colSpan: 8 },
        { content: 'ได้ระดับ 3 ขึ้นไป', colSpan: 2 },
        { content: 'GPA\nเฉลี่ย', rowSpan: 2 }
      ],
      ['4', '3.5', '3', '2.5', '2', '1.5', '1', '0', 'คน', 'ร้อยละ']
    ];

    let totalEvaluatedAll = 0;
    let totalGoodPlusAll = 0;
    const countTotals = { '4': 0, '3.5': 0, '3': 0, '2.5': 0, '2': 0, '1.5': 0, '1': 0, '0': 0 };
    let gpaSum = 0;
    let gpaCount = 0;

    const areaBody = areas.map((a) => {
      const c = a.counts || {};
      const tot = number(a.total, 0);
      const gp = number(a.goodPlus ?? a.goodPlusCount, 0);
      const pct = tot > 0 ? ((gp / tot) * 100).toFixed(1) + '%' : '-';
      const gpa = (tot > 0 && a.meanGpa && a.meanGpa !== '-' && !isNaN(Number(a.meanGpa))) ? Number(a.meanGpa).toFixed(2) : '-';

      totalEvaluatedAll += tot;
      totalGoodPlusAll += gp;
      if (tot > 0) {
        Object.keys(countTotals).forEach((k) => { countTotals[k] += number(c[k], 0); });
        if (a.meanGpa && a.meanGpa !== '-' && !isNaN(Number(a.meanGpa))) {
          gpaSum += Number(a.meanGpa);
          gpaCount += 1;
        }
      }

      return [
        text(a.name),
        tot || 0,
        tot > 0 ? (c['4'] ?? 0) : '-',
        tot > 0 ? (c['3.5'] ?? 0) : '-',
        tot > 0 ? (c['3'] ?? 0) : '-',
        tot > 0 ? (c['2.5'] ?? 0) : '-',
        tot > 0 ? (c['2'] ?? 0) : '-',
        tot > 0 ? (c['1.5'] ?? 0) : '-',
        tot > 0 ? (c['1'] ?? 0) : '-',
        tot > 0 ? (c['0'] ?? 0) : '-',
        tot > 0 ? gp : '-',
        pct,
        gpa
      ];
    });

    const overallGpPct = totalEvaluatedAll > 0
      ? ((totalGoodPlusAll / totalEvaluatedAll) * 100).toFixed(1) + '%'
      : '-';
    const overallGpa = gpaCount > 0 ? (gpaSum / gpaCount).toFixed(2) : '-';

    areaBody.push([
      'รวม / เฉลี่ยทั้งโรงเรียน',
      totalEvaluatedAll || 0,
      totalEvaluatedAll > 0 ? countTotals['4'] : '-',
      totalEvaluatedAll > 0 ? countTotals['3.5'] : '-',
      totalEvaluatedAll > 0 ? countTotals['3'] : '-',
      totalEvaluatedAll > 0 ? countTotals['2.5'] : '-',
      totalEvaluatedAll > 0 ? countTotals['2'] : '-',
      totalEvaluatedAll > 0 ? countTotals['1.5'] : '-',
      totalEvaluatedAll > 0 ? countTotals['1'] : '-',
      totalEvaluatedAll > 0 ? countTotals['0'] : '-',
      totalEvaluatedAll > 0 ? totalGoodPlusAll : '-',
      overallGpPct,
      overallGpa
    ]);

    runAutoTable(doc, tableDefaults({
      startY: currentY,
      head: areaHead,
      body: areaBody,
      margin: { left: 10, right: 10 },
      styles: { font: 'Sarabun', fontSize: 8, halign: 'center', cellPadding: 1 },
      headStyles: { font: 'Sarabun', fontStyle: 'bold', fontSize: 7.5, fillColor: [240, 244, 248], textColor: [0, 0, 0] },
      columnStyles: {
        0: { cellWidth: 42, halign: 'left' },
        1: { cellWidth: 14 },
        10: { cellWidth: 13, fontStyle: 'bold' },
        11: { cellWidth: 15, fontStyle: 'bold' },
        12: { cellWidth: 13, fontStyle: 'bold' }
      },
      didParseCell(data) {
        if (data.row.index === areaBody.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [245, 245, 245];
        }
      }
    }));

    currentY = (doc.lastAutoTable?.finalY || currentY) + 7;

    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(10.5);
    doc.text(`ตารางที่ 2: สรุปผลการประเมินพัฒนาการผู้เรียน 4 ด้าน ประจำปีการศึกษา ${yearText}`, 10, currentY);
    currentY += 3.5;

    const assess = sarData?.assessments || {};
    const read = assess.reading || { total: 0, excellent: 0, good: 0, pass: 0, fail: 0 };
    const char = assess.character || { total: 0, excellent: 0, good: 0, pass: 0, fail: 0 };
    const act = assess.activity || { total: 0, pass: 0, fail: 0 };
    const comp = assess.competency || { total: 0, excellent: 0, good: 0, pass: 0, fail: 0 };

    function calcPct(n, tot) {
      if (!tot) return '-';
      return ((number(n, 0) / tot) * 100).toFixed(1) + '%';
    }

    function formatCell(count, tot) {
      if (!tot) return '-';
      return `${number(count, 0)} (${calcPct(count, tot)})`;
    }

    const assessHead = [
      ['รายการประเมิน', 'จำนวนที่ประเมิน', 'ดีเยี่ยม (คน/%)', 'ดี (คน/%)', 'ผ่าน (คน/%)', 'ไม่ผ่าน (คน/%)', 'ร้อยละผ่านเกณฑ์']
    ];

    const assessBody = [
      [
        '1. การอ่าน คิดวิเคราะห์ และเขียน',
        read.total ? number(read.total, 0) : 0,
        formatCell(read.excellent, read.total),
        formatCell(read.good, read.total),
        formatCell(read.pass, read.total),
        formatCell(read.fail, read.total),
        read.total ? calcPct((read.excellent || 0) + (read.good || 0) + (read.pass || 0), read.total) : '-'
      ],
      [
        '2. คุณลักษณะอันพึงประสงค์ 8 ประการ',
        char.total ? number(char.total, 0) : 0,
        formatCell(char.excellent, char.total),
        formatCell(char.good, char.total),
        formatCell(char.pass, char.total),
        formatCell(char.fail, char.total),
        char.total ? calcPct((char.excellent || 0) + (char.good || 0) + (char.pass || 0), char.total) : '-'
      ],
      [
        '3. กิจกรรมพัฒนาผู้เรียน',
        act.total ? number(act.total, 0) : 0,
        '-',
        '-',
        formatCell(act.pass, act.total),
        formatCell(act.fail, act.total),
        act.total ? calcPct(act.pass, act.total) : '-'
      ],
      [
        '4. สมรรถนะสำคัญของผู้เรียน 5 ด้าน',
        comp.total ? number(comp.total, 0) : 0,
        formatCell(comp.excellent, comp.total),
        formatCell(comp.good, comp.total),
        formatCell(comp.pass, comp.total),
        formatCell(comp.fail, comp.total),
        comp.total ? calcPct((comp.excellent || 0) + (comp.good || 0) + (comp.pass || 0), comp.total) : '-'
      ]
    ];

    runAutoTable(doc, tableDefaults({
      startY: currentY,
      head: assessHead,
      body: assessBody,
      margin: { left: 10, right: 10 },
      styles: { font: 'Sarabun', fontSize: 8.5, halign: 'center', cellPadding: 1.5 },
      headStyles: { font: 'Sarabun', fontStyle: 'bold', fontSize: 8, fillColor: [240, 244, 248], textColor: [0, 0, 0] },
      columnStyles: {
        0: { cellWidth: 54, halign: 'left' },
        1: { cellWidth: 22 },
        6: { fontStyle: 'bold', cellWidth: 24 }
      }
    }));

    const finalTableY = doc.lastAutoTable?.finalY || currentY;
    let sigY = Math.max(finalTableY + 16, pageHeight - 36);
    if (sigY > pageHeight - 25) {
      doc.addPage('a4', 'portrait');
      sigY = 40;
    }

    const academicHead = text(meta.academicHead || sarData?.academicHead || 'หัวหน้าฝ่ายวิชาการ');
    const directorName = text(meta.directorName || sarData?.directorName || 'ผู้อำนวยการสถานศึกษา');
    const directorPos = text(meta.directorPosition || 'ผู้อำนวยการสถานศึกษา');
    const center1 = pageWidth * 0.32;
    const center2 = pageWidth * 0.72;

    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9);

    // Signature 1: หัวหน้างานวิชาการ
    if (meta.includeSignatures && (meta.academicHeadSignature || sarData?.academicHeadSignature)) {
      try {
        doc.addImage(meta.academicHeadSignature || sarData.academicHeadSignature, 'PNG', center1 - 15, sigY - 8.5, 30, 9.5);
      } catch (_) {}
    }
    doc.text('ลงชื่อ................................................', center1, sigY, { align: 'center' });
    doc.text(`(${academicHead})`, center1, sigY + 6, { align: 'center' });
    doc.text('หัวหน้าฝ่ายวิชาการ / งานวัดผล', center1, sigY + 11.5, { align: 'center' });

    // Signature 2: ผู้อำนวยการโรงเรียน & ตราประทับ
    if (meta.includeSignatures && (meta.schoolStamp || sarData?.schoolStamp)) {
      try {
        doc.addImage(meta.schoolStamp || sarData.schoolStamp, 'PNG', center2 - 9, sigY - 14, 22, 22);
      } catch (_) {}
    }
    if (meta.includeSignatures && (meta.directorSignature || sarData?.directorSignature)) {
      try {
        doc.addImage(meta.directorSignature || sarData.directorSignature, 'PNG', center2 - 15, sigY - 8.5, 30, 9.5);
      } catch (_) {}
    }
    doc.text('ลงชื่อ................................................', center2, sigY, { align: 'center' });
    doc.text(`(${directorName})`, center2, sigY + 6, { align: 'center' });
    doc.text(directorPos, center2, sigY + 11.5, { align: 'center' });

    doc.setProperties({
      title: 'รายงานสรุปผลสัมฤทธิ์ทางการเรียนสำหรับเล่ม SAR',
      subject: `ปีการศึกษา ${yearText}`,
      author: meta.schoolName,
      creator: 'ระบบ ปพ.5 ออนไลน์'
    });

    const blobUrl = finish(doc, meta);
    const dataUri = doc.output('datauristring');
    return { blobUrl, dataUri };
  }

  // สรุปภาพรวมโรงเรียน 1 หน้า (Smart Dashboard, owner 2026-10-08): ตัวเลขสำคัญ, เช็คชื่อวันเรียนล่าสุดรายห้อง,
  // งานที่ยังค้างรายห้อง (คะแนน + ประเมิน) และนักเรียนที่ต้องติดตาม  เป็นเอกสารภายใน ไม่มีช่องลงชื่อ
  // summary = { title, metaLine, kpis: [{label, value, note}], today: {heading, rows: [[...]]},
  //             pending: {heading, types: [label], rows: [[...]]}, watch: [label, value][] , footer }
  async function createDashboardSummary(summary, options = {}) {
    const s = summary || {};
    const { doc, meta, startY } = await createDocument(text(s.title, 'สรุปภาพรวมโรงเรียน'), { ...options, meta: text(s.metaLine) });
    const pageWidth = doc.internal.pageSize.getWidth();
    const small = { fontSize: 8.5, cellPadding: 1.2 };
    let y = startY;
    const heading = (label) => {
      doc.setFont('Sarabun', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(0, 0, 0);
      doc.text(text(label), 10, y + 4);
      y += 5.5;
    };
    const table = (head, body, extra = {}) => {
      runAutoTable(doc, tableDefaults({ startY: y, head, body, styles: { ...tableDefaults().styles, ...small }, ...extra }));
      y = (doc.lastAutoTable?.finalY || y) + 4;
    };

    const kpis = Array.isArray(s.kpis) ? s.kpis : [];
    if (kpis.length) {
      heading('ตัวเลขสำคัญ');
      table([kpis.map((k) => text(k.label))], [
        kpis.map((k) => text(k.value, '-')),
        kpis.map((k) => text(k.note))
      ], {
        didParseCell: (cell) => {
          if (cell.section === 'body' && cell.row.index === 0) { cell.cell.styles.fontStyle = 'bold'; cell.cell.styles.fontSize = 12; }
          if (cell.section === 'body' && cell.row.index === 1) { cell.cell.styles.fontSize = 7.5; cell.cell.styles.textColor = [70, 70, 70]; }
        }
      });
    }

    const today = s.today || {};
    if (Array.isArray(today.rows) && today.rows.length) {
      heading(today.heading || 'เช็คชื่อรายห้อง');
      table([['ห้อง', 'นักเรียน', 'เช็คแล้ว', 'มา', 'ลา', 'ขาด', 'สถานะ']], today.rows, {
        columnStyles: { 0: { cellWidth: 22 }, 6: { halign: 'left' } }
      });
    }

    const pending = s.pending || {};
    if (Array.isArray(pending.rows) && pending.rows.length) {
      heading(pending.heading || 'งานที่ยังค้าง');
      table([['ห้อง', 'คะแนน (วิชา)', ...(pending.types || []).map((t) => text(t))]], pending.rows, {
        columnStyles: { 0: { cellWidth: 22 } }
      });
    }

    const watch = Array.isArray(s.watch) ? s.watch : [];
    if (watch.length) {
      heading('นักเรียนที่ต้องติดตาม');
      table([watch.map((w) => text(w[0]))], [watch.map((w) => text(w[1], '0'))]);
    }

    if (s.footer) {
      doc.setFont('Sarabun', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(80, 80, 80);
      doc.text(text(s.footer), 10, Math.min(y + 2, doc.internal.pageSize.getHeight() - 8), { maxWidth: pageWidth - 20 });
      doc.setTextColor(0, 0, 0);
    }
    return finish(doc, meta);
  }

  // สรุปเวลาเรียนรายวิชา (owner 2026-10-15 "ไม่คิดจะทำปุ่มส่งออก pdf ให้หน่อยเหรอ") — หน้า subject_attendance_summary
  //   report = { title, subtitle, landscape, head: [[…]], body: [[…]], nameColumn, statusColumn, markFrom, markTo, note,
  //              signers: [{ role, name }] } · ตารางรายเดือนแนวนอน (คอลัมน์ต่อคาบ) · รายภาค/ทั้งปีแนวตั้ง
  async function createSubjectAttendanceReport(report, options) {
    const jsPDF = getJsPdf();
    const orientation = report.landscape ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    await installFonts(doc);
    const meta = officialMeta(options || {});
    const logo = await loadOfficialLogo(meta.logo);
    const title = text(report.title, 'สรุปเวลาเรียนรายวิชา');
    const subtitle = text(report.subtitle);
    drawHeader(doc, title, meta, logo, subtitle);
    doc.setProperties({ title, subject: [meta.meta, subtitle].filter(Boolean).join(' - '), author: meta.schoolName, creator: 'ระบบ ปพ.5 ออนไลน์' });
    const columns = (report.head?.[0] || []).length;
    // A4 แนวตั้งที่คอลัมน์เยอะ (ทั้งปี 11 เดือน = 20 คอลัมน์, owner 2026-10-15 "ปรับให้มีขนาด a4 แนวตั้ง"): ย่อแบบ
    // createMatrix รายชั้น — ตัวอักษรเล็ก แบ่งความกว้างที่เหลือเท่ากันทุกคอลัมน์ ให้ลงหน้าเดียวพอดี 190 มม.
    const compact = !report.landscape && columns > 15;
    const fontSize = compact ? 6.4 : report.landscape && columns > 24 ? 6.5 : report.landscape || columns > 12 ? 7.5 : 9;
    const base = tableDefaults();
    const nameColumn = Number.isInteger(report.nameColumn) ? report.nameColumn : 1;
    const compactStyles = {};
    if (compact) {
      // ร้อยละ ("100.0%") และสถานะ ("ใกล้ มส.") ต้องไม่ตัดบรรทัด — กำหนดกว้างคงที่ ที่เหลือแบ่งให้เดือนและยอดรวม
      const fixed = { 0: 6, 1: 9, [nameColumn]: 36 };
      if (Number.isInteger(report.statusColumn)) { fixed[report.statusColumn] = 11; fixed[report.statusColumn - 1] = 11.5; }
      const rest = (doc.internal.pageSize.getWidth() - 20 - Object.values(fixed).reduce((a, b) => a + b, 0)) / (columns - Object.keys(fixed).length);
      for (let i = 0; i < columns; i += 1) compactStyles[i] = { cellWidth: fixed[i] || rest };
      compactStyles[nameColumn].halign = 'left';
    }
    const isMark = (index) => Number.isInteger(report.markFrom) && index >= report.markFrom && index <= report.markTo;
    runAutoTable(doc, tableDefaults({
      startY: headerBottom(meta, logo, subtitle),
      head: report.head || [],
      body: report.body || [],
      styles: { ...base.styles, fontSize, cellPadding: compact ? 0.7 : report.landscape ? 0.8 : 1.4 },
      headStyles: { ...base.headStyles, fontSize: compact ? 6 : Math.max(6, fontSize - 0.5) },
      // หัวคอลัมน์แรก 'ลำดับ' (แบบรายงานรายภาครายชั้น) กว้าง 12 มม. เหมือน createSummary · 'ที่' 9 มม.
      columnStyles: compact ? compactStyles : { 0: { cellWidth: text(report.head?.[0]?.[0]).length > 3 ? 12 : 9 }, [nameColumn]: { halign: 'left', cellWidth: report.landscape ? 44 : columns > 12 ? 40 : 58 } },
      margin: { left: 10, right: 10, bottom: 14 },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const value = text(data.cell.raw);
        if (data.column.index === report.statusColumn) {
          if (value === 'มส.') { data.cell.styles.textColor = [190, 30, 30]; data.cell.styles.fontStyle = 'bold'; }
          else if (value === 'ใกล้ มส.') data.cell.styles.textColor = [170, 90, 0];
        }
        if (isMark(data.column.index)) {
          if (value === 'ข') { data.cell.styles.textColor = [190, 30, 30]; data.cell.styles.fontStyle = 'bold'; }
          else if (value === 'ล') data.cell.styles.textColor = [170, 90, 0];
        }
      }
    }));
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = number(doc.lastAutoTable?.finalY, 60) + 5;
    if (report.note) {
      doc.setFont('Sarabun', 'normal');
      doc.setFontSize(8);
      doc.text(text(report.note), 10, y, { maxWidth: pageWidth - 20 });
      y += 6;
    }
    const signers = (report.signers || []).filter((s) => s && s.role);
    if (signers.length) {
      y += 12;
      if (y > pageHeight - 26) { doc.addPage('a4', orientation); y = 40; }
      doc.setFont('Sarabun', 'normal');
      doc.setFontSize(8.5);
      signers.forEach((signer, index) => {
        const x = (pageWidth / (signers.length + 1)) * (index + 1);
        doc.text('ลงชื่อ................................................', x, y, { align: 'center' });
        doc.text(`(${text(signer.name) || '................................................'})`, x, y + 6, { align: 'center' });
        doc.text(text(signer.role), x, y + 12, { align: 'center' });
      });
    }
    addDocumentPageNumbers(doc);
    return finish(doc, meta);
  }

  global.PP5PDF = {
    createSubjectAttendanceReport,
    createSummary,
    createDashboardSummary,
    createStudent,
    createMatrix,
    createChecklist,
    createStudentList,
    createGrowthSheet,
    createGrowthMonthlyReport,
    createLegacyStudentList,
    createStudentRegistry,
    createParentInfoReport,
    createScoreSheet,
    createSubjectRtwReport,
    createCharacteristicReport,
    createActivityReport,
    createCompetencyReport,
    createCompetencySummaryReport,
    createPp5Cover,
    createPp5SubjectCover,
    createPp5FullBook,
    createPp6Report,
    createOnePageReport,
    createClassSubjectScoreReport,
    createClassAssessmentSummaryReport,
    createSarAnalyticsPdf
  };
  document.documentElement.dataset.pp5Pdf = 'ready';
})(window);

