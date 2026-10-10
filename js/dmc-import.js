// DMC student-file parser and validator.
// Keeps personal data in memory only; persistence is handled atomically by Supabase RPC.
(function initPP5DmcImport(global) {
  'use strict';

  function asText(value) {
    return value === null || value === undefined
      ? ''
      : String(value).replace(/\u00a0/g, ' ').trim();
  }

  function parseCsv(source) {
    const input = asText(source).replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];
      if (quoted) {
        if (char === '"' && input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n') {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
    if (field || row.length) {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
    }
    return rows;
  }

  function base64Bytes(source) {
    const binary = global.atob(asText(source));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  function parseXlsx(source) {
    if (!global.XLSX?.read || !global.XLSX?.utils?.sheet_to_json) {
      throw new Error('ไม่สามารถเปิดไฟล์ XLSX ได้ กรุณาตรวจการเชื่อมต่อแล้วโหลดหน้าเว็บใหม่');
    }
    const workbook = global.XLSX.read(base64Bytes(source), { type: 'array', cellDates: false });
    const firstSheetName = workbook.SheetNames?.[0];
    if (!firstSheetName) throw new Error('ไฟล์ XLSX ไม่มีแผ่นงาน');
    return global.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false
    });
  }

  function isoDate(year, month, day) {
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
      return '';
    }
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function parseThaiDate(value) {
    const input = asText(value);
    if (!input) return '';
    let match = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      let year = Number(match[1]);
      if (year > 2400) year -= 543;
      return isoDate(year, Number(match[2]), Number(match[3]));
    }
    match = input.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (!match) return '';
    let year = Number(match[3]);
    if (year > 2400) year -= 543;
    return isoDate(year, Number(match[2]), Number(match[1]));
  }

  function normalizeGender(value) {
    const gender = asText(value).toLowerCase();
    if (['ช', 'ชาย', 'เด็กชาย', 'นาย', 'm', 'male'].includes(gender)) return 'ชาย';
    if (['ญ', 'หญิง', 'เด็กหญิง', 'นางสาว', 'f', 'female'].includes(gender)) return 'หญิง';
    return '';
  }

  function optionalNumber(value) {
    const input = asText(value).replaceAll(',', '');
    if (!input) return { value: null, valid: true };
    const parsed = Number(input);
    return { value: Number.isFinite(parsed) ? parsed : null, valid: Number.isFinite(parsed) };
  }

  function joinName(parts) {
    return parts.map(asText).filter(Boolean).join(' ');
  }

  function headerMap(headers) {
    const result = new Map();
    (headers || []).forEach((header, index) => {
      const key = asText(header);
      if (key && !result.has(key)) result.set(key, index);
    });
    return result;
  }

  function column(map, header, fallback) {
    return map.has(header) ? map.get(header) : fallback;
  }

  function assertDmcLayout(rows) {
    if (!Array.isArray(rows) || rows.length <= 2) {
      throw new Error('ไม่พบข้อมูลนักเรียนในแถวที่ 3 เป็นต้นไป');
    }
    const headers = rows[1] || [];
    const required = [
      [3, 'ชั้น'], [4, 'ห้อง'], [5, 'เลขประจำตัวนักเรียน'],
      [6, 'เพศ'], [8, 'ชื่อ'], [9, 'นามสกุล']
    ];
    const mismatches = required.filter(([index, label]) => !asText(headers[index]).includes(label));
    if (headers.length < 37 || mismatches.length) {
      throw new Error('รูปแบบคอลัมน์ไม่ตรงกับไฟล์นักเรียน DMC (ต้องมีหัวตารางแถวที่ 2 และข้อมูลเริ่มแถวที่ 3)');
    }
  }

  function analyzeRows(rows) {
    assertDmcLayout(rows);
    const headers = rows[1] || [];
    const map = headerMap(headers);
    const col = {
      address: column(map, 'บ้านเลขที่', 18),
      moo: column(map, 'หมู่', 19),
      road: column(map, 'ถนน/ซอย', 20),
      subdistrict: column(map, 'ตำบล', 21),
      district: column(map, 'อำเภอ', 22),
      province: column(map, 'จังหวัด', 23),
      guardianTitle: column(map, 'คำนำหน้าชื่อผู้ปกครอง', 24),
      guardianFirstName: column(map, 'ชื่อผู้ปกครอง', 25),
      guardianLastName: column(map, 'นามสกุลผู้ปกครอง', 26),
      guardianOccupation: column(map, 'อาชีพของผู้ปกครอง', 27),
      guardianRelation: column(map, 'ความเกี่ยวข้องของผู้ปกครองกับนักเรียน', 28),
      fatherTitle: column(map, 'คำนำหน้าชื่อบิดา', 29),
      fatherFirstName: column(map, 'ชื่อบิดา', 30),
      fatherLastName: column(map, 'นามสกุลบิดา', 31),
      fatherOccupation: column(map, 'อาชีพของบิดา', 32),
      motherTitle: column(map, 'คำนำหน้าชื่อมารดา', 33),
      motherFirstName: column(map, 'ชื่อมารดา', 34),
      motherLastName: column(map, 'นามสกุลมารดา', 35),
      motherOccupation: column(map, 'อาชีพของมารดา', 36),
      disadvantage: column(map, 'ความด้อยโอกาส', 37),
      disposalBlocked: column(map, 'ยังไม่สามารถจำหน่ายได้ (3.1.8)', 38)
    };
    const datePattern = /\d{1,2}\s*[ก-ฮ.]{1,3}\s*\d{4}|^\d{4}-\d{2}-\d{2}|^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i;
    const validRows = [];
    const skipped = [];
    const seenIds = new Set();
    const classCounters = new Map();

    rows.slice(2).forEach((sourceRow, offset) => {
      const row = Array.isArray(sourceRow) ? sourceRow : [];
      const sourceRowNumber = offset + 3;
      if (!row.some((value) => asText(value))) return;
      const studentId = asText(row[5]);
      const nationalId = asText(row[2]);
      const firstName = asText(row[8]);
      const lastName = asText(row[9]);
      const grade = asText(row[3]);
      const room = asText(row[4]) || '1';
      const gender = normalizeGender(row[6]);
      const birthInput = asText(row[10]);
      const birthDate = parseThaiDate(birthInput);
      const weight = optionalNumber(row[12]);
      const height = optionalNumber(row[13]);
      const reasons = [];

      if (!studentId || !/^\d+$/.test(studentId)) reasons.push('รหัสนักเรียนไม่ถูกต้อง');
      if (studentId && seenIds.has(studentId)) reasons.push('รหัสนักเรียนซ้ำในไฟล์');
      if (nationalId && !/^\d{13}$/.test(nationalId)) reasons.push('เลขประชาชนไม่ใช่ 13 หลัก');
      if (!firstName || datePattern.test(firstName)) reasons.push('ชื่อไม่ถูกต้อง');
      if (!lastName || datePattern.test(lastName)) reasons.push('นามสกุลไม่ถูกต้อง');
      if (!/^[ปอม]\.\d+$/.test(grade)) reasons.push('ระดับชั้นต้องเป็น ป.X, อ.X หรือ ม.X');
      if (!/^\d+$/.test(room)) reasons.push('ห้องเรียนไม่ถูกต้อง');
      if (!gender) reasons.push('เพศไม่ถูกต้อง');
      if (birthInput && !birthDate) reasons.push('วันเกิดไม่ถูกต้อง');
      if (!weight.valid) reasons.push('น้ำหนักไม่ใช่ตัวเลข');
      if (!height.valid) reasons.push('ส่วนสูงไม่ใช่ตัวเลข');

      if (studentId) seenIds.add(studentId);
      if (reasons.length) {
        skipped.push({ row: sourceRowNumber, studentId: studentId || '-', reasons });
        return;
      }

      const classKey = `${grade}|${room}`;
      const studentNumber = (classCounters.get(classKey) || 0) + 1;
      classCounters.set(classKey, studentNumber);
      const fatherLastName = asText(row[col.fatherLastName]);
      const motherLastName = asText(row[col.motherLastName]);
      const addressParts = [
        asText(row[col.address]),
        asText(row[col.moo]) ? `หมู่ ${asText(row[col.moo])}` : '',
        asText(row[col.road]),
        asText(row[col.subdistrict]) ? `ต.${asText(row[col.subdistrict])}` : '',
        asText(row[col.district]) ? `อ.${asText(row[col.district])}` : '',
        asText(row[col.province]) ? `จ.${asText(row[col.province])}` : ''
      ].filter(Boolean);

      validRows.push({
        source_row: sourceRowNumber,
        student_id: studentId,
        national_id: nationalId || null,
        student_number: studentNumber,
        prefix: asText(row[7]),
        first_name: firstName,
        last_name: lastName,
        gender,
        grade,
        room,
        birth_date: birthDate || null,
        weight_kg: weight.value,
        height_cm: height.value,
        blood_type: asText(row[14]) || null,
        religion: asText(row[15]) || null,
        ethnicity: asText(row[16]) || null,
        nationality: asText(row[17]) || null,
        address: addressParts.join(' ') || null,
        subdistrict: asText(row[col.subdistrict]) || null,
        district: asText(row[col.district]) || null,
        province: asText(row[col.province]) || null,
        guardian_name: joinName([row[col.guardianTitle], row[col.guardianFirstName], row[col.guardianLastName]]) || null,
        guardian_occupation: asText(row[col.guardianOccupation]) || null,
        guardian_relation: asText(row[col.guardianRelation]) || null,
        father_name: joinName([row[col.fatherTitle], row[col.fatherFirstName], fatherLastName]) || null,
        father_last_name: fatherLastName || null,
        father_occupation: asText(row[col.fatherOccupation]) || null,
        mother_name: joinName([row[col.motherTitle], row[col.motherFirstName], motherLastName]) || null,
        mother_last_name: motherLastName || null,
        mother_occupation: asText(row[col.motherOccupation]) || null,
        disadvantage: asText(row[col.disadvantage]) || null,
        disposal_blocked: asText(row[col.disposalBlocked]) || null,
        source_data: {
          school_code: asText(row[0]),
          school_name: asText(row[1]),
          disadvantage: asText(row[col.disadvantage]),
          disposal_blocked: asText(row[col.disposalBlocked])
        }
      });
    });

    if (!validRows.length) throw new Error('ไม่พบแถวนักเรียนที่ผ่านการตรวจสอบ');
    const gradeCounts = validRows.reduce((result, row) => {
      const key = `${row.grade}/${row.room}`;
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});
    return {
      totalRows: validRows.length + skipped.length,
      validCount: validRows.length,
      skippedCount: skipped.length,
      skipped,
      gradeCounts,
      headerCount: headers.length,
      rows: validRows
    };
  }

  async function parseFile(fileType, fileData) {
    const type = asText(fileType).toLowerCase();
    if (!['csv', 'xlsx'].includes(type)) throw new Error('รองรับเฉพาะไฟล์ .xlsx หรือ .csv เท่านั้น');
    const rows = type === 'xlsx' ? parseXlsx(fileData) : parseCsv(fileData);
    return analyzeRows(rows);
  }

  global.PP5DmcImport = {
    parseCsv,
    parseThaiDate,
    normalizeGender,
    analyzeRows,
    parseFile
  };
})(window);
