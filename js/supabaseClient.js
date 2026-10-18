// Supabase data layer for the original GAS user interface.
// This file intentionally contains no student records, passwords, or service-role key.
(function initPP5Data(global) {
  'use strict';

  const config = global.SUPABASE_CONFIG || {};
  const client = global.dbClient || (
    global.supabase && config.url && config.key
      ? global.supabase.createClient(config.url, config.key)
      : null
  );
  if (!client) throw new Error('ไม่สามารถเริ่ม Supabase client ได้');
  global.dbClient = client;
  try { global.__PP5_PASSWORD_RECOVERY = global.sessionStorage.getItem('pp5_password_recovery') === '1'; } catch (_) {}
  client.auth.onAuthStateChange?.((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      global.__PP5_PASSWORD_RECOVERY = true;
      try { global.sessionStorage.setItem('pp5_password_recovery', '1'); } catch (_) {}
      global.document?.dispatchEvent?.(new Event('pp5:password-recovery'));
    } else if (event === 'SIGNED_OUT') {
      global.__PP5_PASSWORD_RECOVERY = false;
      try { global.sessionStorage.removeItem('pp5_password_recovery'); } catch (_) {}
    }
  });

  const OPTIONAL_SCHEMA_CODES = new Set(['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205', '42501']);
  // registrar = เจ้าหน้าที่ธุรการ (งานทะเบียน, SQL 202610180036)
  const ACTIVE_ROLES = new Set(['admin', 'teacher', 'parent', 'registrar']);

  function appError(message, cause, code) {
    const error = new Error(message);
    error.code = code || cause?.code || 'PP5_ERROR';
    error.cause = cause;
    return error;
  }

  function throwIfError(error, context) {
    if (error) throw appError(`${context}: ${error.message || 'Supabase error'}`, error);
  }

  // A failed Auth request is not always a password mismatch. Keep provider
  // messages out of the UI; they may include request details. Use code/name
  // first, with HTTP status as a fallback for transport and service failures.
  function loginError(error) {
    const code = asText(error?.code);
    const status = Number(error?.status || 0);
    if (code === 'invalid_credentials') return appError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', error, 'AUTH_INVALID');
    if (code === 'email_not_confirmed') return appError('บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณาตรวจอีเมลยืนยันบัญชี', error, 'AUTH_EMAIL_UNCONFIRMED');
    if (code === 'user_banned') return appError('บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแลระบบ', error, 'AUTH_BANNED');
    if (code === 'over_request_rate_limit' || status === 429) return appError('ลองเข้าสู่ระบบถี่เกินไป กรุณารอสักครู่แล้วลองใหม่', error, 'AUTH_RATE_LIMIT');
    if (code === 'request_timeout') return appError('บริการเข้าสู่ระบบตอบกลับช้า กรุณาลองใหม่อีกครั้ง', error, 'AUTH_TIMEOUT');
    if (code === 'captcha_failed') return appError('การตรวจสอบ CAPTCHA ไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ', error, 'AUTH_CAPTCHA');
    if (status >= 500) return appError('บริการเข้าสู่ระบบขัดข้อง กรุณาลองใหม่ภายหลัง', error, 'AUTH_SERVICE_UNAVAILABLE');
    if (['AuthRetryableFetchError','TypeError','FunctionsFetchError','FunctionsRelayError'].includes(error?.name)) return appError('เชื่อมต่อบริการเข้าสู่ระบบไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่', error, 'AUTH_CONNECTION');
    const reference = /^[a-z0-9_]{1,60}$/.test(code) ? ` (รหัส: ${code})` : '';
    return appError('เข้าสู่ระบบไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ' + reference, error, 'AUTH_FAILED');
  }

  function isOptionalSchemaError(error) {
    return !!error && (
      OPTIONAL_SCHEMA_CODES.has(error.code) ||
      /does not exist|schema cache|column .* not found/i.test(error.message || '')
    );
  }

  function asText(value, fallback = '') {
    return value === null || value === undefined ? fallback : String(value);
  }

  function asNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  // Keep the recorded score intact, but use the school's half-up rule when
  // mapping a score to a grade. For example, 79.5 remains 79.5 in the
  // database/export, while its grade is calculated from 80.
  function gradeBasisScore(total) {
    return Math.round(asNumber(total) + Number.EPSILON);
  }

  function asNullableNumber(value) {
    if (value === null || value === undefined || asText(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function extractDriveFileId(value) {
    const input = asText(value).trim();
    // รูปที่ฝังเป็นข้อมูล (data:/blob:) ไม่ใช่ลิงก์ Drive: ตัวอักษร base64 บังเอิญมี "/d/" ตามด้วย 20 ตัวได้
    // (owner 2026-10-14: โลโก้วัดก้านเหลืองถูกบันทึกเป็นลิงก์ Google ปลอมแทนรูป)
    if (/^(?:data:|blob:)/i.test(input)) return '';
    const fromUrl = input.match(/(?:\/d\/|[?&]id=)([-\w]{20,})/i);
    if (fromUrl) return fromUrl[1];
    return /^[-\w]{20,}$/.test(input) ? input : '';
  }

  function normalizeLogoValue(value) {
    const input = asText(value).trim();
    if (!input) return '';
    const fileId = extractDriveFileId(input);
    return fileId ? `https://lh3.googleusercontent.com/d/${fileId}` : input;
  }

  function compactObject(value) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
  }

  function clearLegacySession() {
    ['loggedIn', 'username', 'role', 'displayName', 'firstName', 'lastName', 'className', 'authToken']
      .forEach((key) => localStorage.removeItem(key));
    global.__authTokenValidated = false;
  }

  function normalizeProfile(user, profile) {
    const metadata = user?.user_metadata || {};
    const appMetadata = user?.app_metadata || {};
    const candidateRole = profile?.role;
    const role = candidateRole;
    const email = asText(user?.email);
    const username = asText(profile?.username || metadata.username || email.split('@')[0]);
    const displayName = asText(
      profile?.display_name || metadata.display_name || metadata.full_name || username,
      'ผู้ใช้'
    );
    return {
      id: user?.id || profile?.id || '',
      username,
      role,
      displayName,
      firstName: asText(profile?.first_name || metadata.first_name || displayName),
      lastName: asText(profile?.last_name || metadata.last_name),
      className: asText(profile?.grade || metadata.grade),
      room: asText(profile?.room || metadata.room),
      allowExport: profile?.allow_export === true || appMetadata.allow_export === true,
      active: profile?.active !== false
    };
  }

  async function loadProfile(user) {
    if (!user?.id) throw appError('ไม่พบข้อมูลผู้ใช้จาก Supabase Auth', null, 'AUTH_PROFILE_REQUIRED');
    const { data, error } = await client.from('user_profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) {
      const message = isOptionalSchemaError(error)
        ? 'ระบบสิทธิ์ผู้ใช้ยังไม่ได้ติดตั้ง กรุณาใช้ migration ระยะแรกก่อน'
        : 'อ่านสิทธิ์ผู้ใช้ไม่สำเร็จ';
      throw appError(message, error, 'AUTH_PROFILE_NOT_READY');
    }
    if (!data) throw appError('บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานจากผู้ดูแลระบบ', null, 'AUTH_PROFILE_REQUIRED');
    if (!ACTIVE_ROLES.has(data.role)) throw appError('บัญชีนี้มีสิทธิ์ไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ', null, 'AUTH_PROFILE_INVALID');
    return normalizeProfile(user, data);
  }

  function syncLegacySession(session, profile) {
    if (!session?.access_token || !profile?.active) {
      clearLegacySession();
      return;
    }
    localStorage.setItem('loggedIn', 'true');
    localStorage.setItem('username', profile.username);
    localStorage.setItem('role', profile.role);
    localStorage.setItem('displayName', profile.displayName);
    localStorage.setItem('firstName', profile.firstName);
    localStorage.setItem('lastName', profile.lastName);
    localStorage.setItem('className', profile.className || 'ทุกระดับชั้น');
    localStorage.setItem('authToken', session.access_token);
    global.__authTokenValidated = true;
  }

  // ชื่อผู้ใช้ -> อีเมลบัญชีเข้าระบบจริง (owner 2026-10-12): บัญชีที่สร้างพร้อมอีเมลจริงใช้อีเมลนั้นเป็นบัญชี Auth
  // จึงเข้าด้วย "ชื่อ@pp5smart.local" ไม่ได้  pp5_login_email (migration 202610120028) คืนอีเมลเฉพาะชื่อที่ตรงตัวเดียว
  // ของครู/ผู้ดูแลที่ยังใช้งาน  การตรวจรหัสผ่านยังเกิดในเบราว์เซอร์ของผู้ใช้เอง (ไม่รวมทุกคนไว้ที่ IP เดียว)
  // ยังไม่ลง migration / ไม่พบ / ผิดพลาด = ใช้ ชื่อ@pp5smart.local แบบเดิม
  async function usernameEmail(username) {
    if (typeof client.rpc !== 'function') return '';
    try {
      const { data, error } = await client.rpc('pp5_login_email', { p_username: username });
      if (error) return '';
      const email = asText(data).trim().toLowerCase();
      return email.includes('@') ? email : '';
    } catch (_) {
      return '';
    }
  }
  const auth = {
    async signIn(loginName, password) {
      const input = asText(loginName).trim();
      if (!input || !password) throw appError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', null, 'AUTH_REQUIRED');
      const normalizedInput = input.toLowerCase();
      const configuredAlias = config.loginAliases?.[normalizedInput];
      let email = input.includes('@')
        ? normalizedInput
        : asText(configuredAlias, `${normalizedInput}@pp5smart.local`).trim().toLowerCase();
      if (!input.includes('@') && !configuredAlias) email = (await usernameEmail(normalizedInput)) || email;
      let response;
      try { response = await client.auth.signInWithPassword({ email, password }); }
      catch (error) { throw loginError(error); }
      const { data, error } = response;
      if (error) throw loginError(error);
      let profile;
      try {
        profile = await loadProfile(data.user);
      } catch (profileError) {
        await client.auth.signOut({ scope: 'local' });
        clearLegacySession();
        throw profileError;
      }
      if (!profile.active) {
        await client.auth.signOut({ scope: 'local' });
        // ลงทะเบียนเองแล้วยังไม่อนุมัติ (js/self-register.js, admin-users register): บอกให้รอ ไม่ใช่ "ถูกระงับ"
        if (data.user?.app_metadata?.pp5_pending === true) throw appError('บัญชีนี้รอผู้ดูแลระบบอนุมัติ เมื่ออนุมัติแล้วจะเข้าสู่ระบบได้ทันที', null, 'AUTH_PENDING');
        throw appError('บัญชีนี้ถูกระงับการใช้งาน', null, 'AUTH_INACTIVE');
      }
      syncLegacySession(data.session, profile);
      return { session: data.session, user: data.user, profile };
    },

    async session() {
      const { data, error } = await client.auth.getSession();
      throwIfError(error, 'ตรวจสอบเซสชันไม่สำเร็จ');
      if (!data.session?.user) {
        clearLegacySession();
        return null;
      }
      let profile;
      try {
        profile = await loadProfile(data.session.user);
      } catch (profileError) {
        await client.auth.signOut({ scope: 'local' });
        clearLegacySession();
        throw profileError;
      }
      if (!profile.active) {
        await client.auth.signOut({ scope: 'local' });
        clearLegacySession();
        return null;
      }
      syncLegacySession(data.session, profile);
      return { session: data.session, user: data.session.user, profile };
    },

    async validate() {
      const state = await this.session();
      return state ? { valid: true, ...state.profile } : { valid: false };
    },

    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' });
      clearLegacySession();
      if (error) throwIfError(error, 'ออกจากระบบไม่สำเร็จ');
      return { success: true };
    },

    async resetPassword(email, redirectTo) {
      const normalized = asText(email).trim().toLowerCase();
      if (!normalized.includes('@')) throw appError('กรุณากรอกอีเมลที่ใช้กับบัญชี', null, 'EMAIL_REQUIRED');
      const { error } = await client.auth.resetPasswordForEmail(
        normalized,
        redirectTo ? { redirectTo } : undefined
      );
      throwIfError(error, 'ส่งอีเมลตั้งรหัสผ่านใหม่ไม่สำเร็จ');
      return { success: true };
    },

    async updatePassword(password, currentPassword) {
      let res = await client.auth.updateUser(compactObject({ password, current_password: currentPassword || undefined }));
      if (res.error && currentPassword) {
        res = await client.auth.updateUser({ password });
      }
      throwIfError(res.error, 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
      return { success: true };
    },

    async requireUser() {
      const state = await this.session();
      if (!state) throw appError('กรุณาเข้าสู่ระบบใหม่', null, 'AUTH_REQUIRED');
      return state;
    }
  };

  function calculateAge(dateValue) {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const beforeBirthday = today.getMonth() < date.getMonth() ||
      (today.getMonth() === date.getMonth() && today.getDate() < date.getDate());
    if (beforeBirthday) age -= 1;
    return age >= 0 ? age : '';
  }

  function mapStudent(row, detail, growth) {
    const id = asText(row.id);
    const prefix = asText(row.prefix);
    const firstName = asText(row.first_name);
    const lastName = asText(row.last_name);
    const fullName = `${prefix}${firstName} ${lastName}`.trim();
    const birthdate = detail?.birth_date || row.birth_date || '';
    const detailSourceData = detail?.source_data && typeof detail.source_data === 'object'
      ? detail.source_data
      : {};
    return {
      id, studentId: id, student_id: id,
      studentNumber: row.student_number, student_number: row.student_number,
      idCard: asText(row.national_id), id_card: asText(row.national_id), national_id: asText(row.national_id),
      title: prefix, prefix,
      firstname: firstName, first_name: firstName,
      lastname: lastName, last_name: lastName,
      fullName, name: fullName,
      grade: asText(row.grade),
      classNo: asText(row.room, '1'), class_no: asText(row.room, '1'), room: asText(row.room, '1'),
      gender: asText(row.gender),
      academic_year: asText(row.academic_year), status: asText(row.status, 'active'),
      birthdate, age: calculateAge(birthdate),
      weight: growth?.weight_kg ?? '', height: growth?.height_cm ?? '',
      // photoRef = ค่าที่เก็บจริง ("sb:student-photos/..." หรือลิงก์เดิม)  photoUrl = ลิงก์ที่เปิดดูได้
      // (enrichStudents เปลี่ยน sb: เป็นลิงก์ชั่วคราวที่ลงชื่อแล้ว)
      photoRef: asText(detail?.source_data?.photo_url || row.photo_url),
      photoUrl: asText(detail?.source_data?.photo_url || row.photo_url),
      photo_url: asText(detail?.source_data?.photo_url || row.photo_url),
      religion: asText(detail?.religion), blood_type: asText(detail?.blood_type),
      ethnicity: asText(detail?.ethnicity), nationality: asText(detail?.nationality),
      address: asText(detail?.address), subdistrict: asText(detail?.subdistrict),
      district: asText(detail?.district), province: asText(detail?.province),
      father_name: asText(detail?.father_name), father_last_name: asText(detail?.father_last_name),
      father_occupation: asText(detail?.father_occupation),
      mother_name: asText(detail?.mother_name), mother_last_name: asText(detail?.mother_last_name),
      mother_occupation: asText(detail?.mother_occupation),
      guardian_name: asText(detail?.guardian_name), guardian_relation: asText(detail?.guardian_relation),
      guardian_phone: asText(detail?.guardian_phone), guardian_occupation: asText(detail?.guardian_occupation),
      disadvantage: asText(detail?.disadvantage), disposal_blocked: asText(detail?.disposal_blocked),
      postalCode: asText(detail?.postal_code ?? detailSourceData.postal_code ?? detailSourceData.postalCode),
      fatherPhone: asText(detail?.father_phone ?? detailSourceData.father_phone ?? detailSourceData.fatherPhone),
      fatherStatus: asText(detail?.father_status ?? detailSourceData.father_status ?? detailSourceData.fatherStatus),
      motherPhone: asText(detail?.mother_phone ?? detailSourceData.mother_phone ?? detailSourceData.motherPhone),
      motherStatus: asText(detail?.mother_status ?? detailSourceData.mother_status ?? detailSourceData.motherStatus),
      growthMonthLabel: growth?.measured_on || '',
      growthAcademicYear: growth?.academic_year || asText(row.academic_year)
    };
  }

  async function optionalRows(table, configure) {
    let query = client.from(table).select('*');
    if (configure) query = configure(query);
    const { data, error } = await query;
    if (error && isOptionalSchemaError(error)) return [];
    throwIfError(error, `อ่านตาราง ${table} ไม่สำเร็จ`);
    return data || [];
  }

  async function enrichStudents(rows, academicYear = '') {
    const ids = rows.map((row) => asText(row.id)).filter(Boolean);
    if (!ids.length) return [];
    const requestedYear = asText(academicYear).trim();
    const [details, growthRows] = await Promise.all([
      optionalRows('student_details', (query) => query.in('student_id', ids)),
      optionalRows('student_growth', (query) => {
        let growthQuery = query.in('student_id', ids);
        if (requestedYear) growthQuery = growthQuery.eq('academic_year', requestedYear);
        return growthQuery.order('measured_on', { ascending: false });
      })
    ]);
    const detailMap = new Map(details.map((row) => [asText(row.student_id), row]));
    const growthMap = new Map();
    growthRows.forEach((row) => {
      const id = asText(row.student_id);
      if (!growthMap.has(id)) growthMap.set(id, row);
    });
    const list = rows.map((row) => mapStudent(row, detailMap.get(asText(row.id)), growthMap.get(asText(row.id))));
    await signStudentPhotos(list);
    return list;
  }

  // ---------- รูปนักเรียน (Supabase Storage แบบส่วนตัว, migration 202610060023) ----------
  // ใน student_details.source_data.photo_url เก็บ "sb:student-photos/<รหัส>/<เวลา>.jpg" ไม่เก็บลิงก์สาธารณะ
  // ตอนอ่านรายชื่อ ขอลิงก์ชั่วคราว 6 ชม. ทีเดียวทั้งรายการ และจำไว้ใช้ซ้ำ (เบราว์เซอร์จึงแคชรูปได้)
  const PHOTO_BUCKET = 'student-photos';
  const PHOTO_REF_PREFIX = `sb:${PHOTO_BUCKET}/`;
  const PHOTO_SIGN_SECONDS = 6 * 60 * 60;
  const signedPhotoCache = new Map();

  function photoPathFromRef(ref) {
    const value = asText(ref).trim();
    return value.startsWith(PHOTO_REF_PREFIX) ? value.slice(PHOTO_REF_PREFIX.length) : '';
  }

  // ลิงก์ชั่วคราวของรูปเราเอง ห้ามถูกบันทึกทับค่าอ้างอิงเมื่อฟอร์มส่ง photoUrl กลับมา
  function isSignedPhotoUrl(value) {
    return asText(value).includes(`/object/sign/${PHOTO_BUCKET}/`);
  }

  async function signStudentPhotos(list) {
    const now = Date.now();
    const paths = [...new Set(list.map((student) => photoPathFromRef(student.photoRef)).filter(Boolean))];
    const missing = paths.filter((path) => !(signedPhotoCache.get(path)?.expires > now + 30 * 60 * 1000));
    if (missing.length && client.storage?.from) {
      try {
        const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrls(missing, PHOTO_SIGN_SECONDS);
        if (!error) {
          (data || []).forEach((item) => {
            if (item?.signedUrl && !item.error) {
              signedPhotoCache.set(item.path, { url: item.signedUrl, expires: now + PHOTO_SIGN_SECONDS * 1000 });
            }
          });
        }
      } catch (_) { /* ไม่มีรูปก็แสดงไอคอนแทน */ }
    }
    list.forEach((student) => {
      const path = photoPathFromRef(student.photoRef);
      if (!path) return;
      const url = signedPhotoCache.get(path)?.url || '';
      student.photoUrl = url;
      student.photo_url = url;
    });
    return list;
  }

  async function readPhotoRef(studentId) {
    const { data, error } = await client.from('student_details')
      .select('source_data').eq('student_id', studentId).maybeSingle();
    throwIfError(error, 'อ่านรายละเอียดนักเรียนไม่สำเร็จ');
    return { sourceData: data?.source_data && typeof data.source_data === 'object' ? data.source_data : {}, exists: !!data };
  }

  async function writePhotoRef(studentId, ref) {
    const current = await readPhotoRef(studentId);
    const sourceData = { ...current.sourceData, photo_url: ref };
    const { error } = await client.from('student_details')
      .upsert({ student_id: studentId, source_data: sourceData }, { onConflict: 'student_id' });
    throwIfError(error, 'บันทึกรูปนักเรียนไม่สำเร็จ');
    return asText(current.sourceData.photo_url);
  }

  const studentPhotos = {
    bucket: PHOTO_BUCKET,
    pathFromRef: photoPathFromRef,

    // blob = รูปที่ย่อแล้ว (JPEG)  คืนค่าอ้างอิงใหม่  รูปเก่าของคนนั้นลบทิ้งหลังบันทึกสำเร็จ
    async upload(studentId, blob) {
      await auth.requireUser();
      const id = asText(studentId).trim();
      if (!id) throw appError('กรุณาระบุรหัสนักเรียน');
      if (!blob || !blob.size) throw appError('ไฟล์รูปว่างเปล่า');
      const path = `${id}/${Date.now()}.jpg`;
      const bucket = client.storage.from(PHOTO_BUCKET);
      const { error } = await bucket.upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false, cacheControl: '86400' });
      throwIfError(error, 'อัปโหลดรูปไม่สำเร็จ');
      let previous = '';
      try {
        previous = await writePhotoRef(id, PHOTO_REF_PREFIX + path);
      } catch (writeError) {
        await bucket.remove([path]).catch(() => {});
        throw writeError;
      }
      const oldPath = photoPathFromRef(previous);
      if (oldPath && oldPath !== path) await bucket.remove([oldPath]).catch(() => {});
      return PHOTO_REF_PREFIX + path;
    },

    async remove(studentId) {
      await auth.requireUser();
      const id = asText(studentId).trim();
      if (!id) throw appError('กรุณาระบุรหัสนักเรียน');
      const previous = await writePhotoRef(id, '');
      const oldPath = photoPathFromRef(previous);
      if (oldPath) await client.storage.from(PHOTO_BUCKET).remove([oldPath]).catch(() => {});
      return !!oldPath;
    }
  };

  // หน้าที่จำค่าตั้งไว้ (เช่นแบนเนอร์หน้าหลัก js/school-branding.js) ฟังเหตุการณ์นี้แล้วโหลดใหม่ ไม่ต้องรอหมดเวลา
  const announceSettingsSaved = () => {
    try { global.document?.dispatchEvent?.(new Event('pp5:settings-saved')); } catch (_) { /* no DOM events */ }
  };

  const settings = {
    async get() {
      const { data, error } = await client.from('school_settings').select('*').limit(1).maybeSingle();
      throwIfError(error, 'อ่านการตั้งค่าระบบไม่สำเร็จ');
      if (!data) throw appError('ยังไม่มีข้อมูลตั้งค่าของโรงเรียน', null, 'SETTINGS_EMPTY');
      return {
        ...data,
        schoolName: data.school_name,
        schoolAddress: data.school_address,
        academicYear: asText(data.academic_year),
        semester: asNumber(data.semester, 1),
        directorName: data.director_name,
        affiliation: data.affiliation || data.settings_json?.affiliation || '',
        academicHead: data.academic_head || data.settings_json?.academic_head || '',
        phone: data.school_phone || data.settings_json?.phone || '',
        schoolPhone: data.school_phone || data.settings_json?.phone || '',
        footerNote: data.footer_note || data.settings_json?.footer_note || '',
        logoFileId: extractDriveFileId(data.logo_base64),
        // ลายน้ำ "ผลระหว่างปี" บนเอกสารรายภาคเรียน + แถบหน้าผู้ปกครอง (ค่าเริ่มต้นเปิด, ปิดได้ในหน้าตั้งค่า)
        interimWatermark: data.settings_json?.interim_watermark !== false,
        // ข้อความลายน้ำที่โรงเรียนพิมพ์เอง (ว่าง = ใช้ข้อความเดิมของระบบ) ไม่เกิน 60 ตัวอักษร
        interimWatermarkText: asText(data.settings_json?.interim_watermark_text).replace(/\s+/g, ' ').trim().slice(0, 60)
      };
    },

    async save(values) {
      await auth.requireUser();
      const { data: current, error: currentError } = await client
        .from('school_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      throwIfError(currentError, 'อ่านการตั้งค่าระบบเดิมไม่สำเร็จ');
      const has = (key) => Object.prototype.hasOwnProperty.call(values, key);
      const submitted = (keys, fallback) => {
        const key = keys.find((candidate) => has(candidate));
        return key === undefined ? fallback : values[key];
      };
      const submittedLogo = submitted(['logo_base64', 'logo', 'logoDataUrl', 'logoFileId'], undefined);
      const submittedSchoolName = submitted(['school_name', 'schoolName', 'ชื่อโรงเรียน'], current?.school_name);
      const payload = compactObject({
        id: values.id ?? current?.id,
        school_name: asText(submittedSchoolName).trim() || current?.school_name,
        school_address: submitted(['school_address', 'schoolAddress', 'ที่อยู่โรงเรียน'], current?.school_address),
        director_name: submitted(['director_name', 'directorName', 'ชื่อผู้อำนวยการ'], current?.director_name),
        logo_base64: submittedLogo === null ? null : (asText(submittedLogo).trim() ? normalizeLogoValue(submittedLogo) : current?.logo_base64),
        academic_year: submitted(['academic_year', 'academicYear', 'ปีการศึกษา'], current?.academic_year),
        semester: submitted(['semester', 'ภาคเรียน'], current?.semester),
        affiliation: submitted(['affiliation', 'สังกัด'], current?.affiliation),
        school_phone: submitted(['school_phone', 'phone', 'เบอร์โทรศัพท์โรงเรียน'], current?.school_phone),
        director_position: submitted(['director_position', 'directorPosition', 'ตำแหน่งผู้อำนวยการ'], current?.director_position),
        academic_head: submitted(['academic_head', 'academicHead', 'supervisorName', 'ชื่อหัวหน้างานวิชาการ'], current?.academic_head),
        footer_note: submitted(['footer_note', 'footerNote'], current?.footer_note),
        updated_at: new Date().toISOString()
      });
      if (!payload.school_name) throw appError('กรุณาระบุชื่อโรงเรียนก่อนบันทึก', null, 'SCHOOL_NAME_REQUIRED');
      const { data, error } = await client.from('school_settings').upsert(payload).select().single();
      throwIfError(error, 'บันทึกการตั้งค่าระบบไม่สำเร็จ');
      announceSettingsSaved();
      return data;
    },

    // เปลี่ยนคีย์เดียวใน settings_json โดยไม่แตะคีย์อื่น (save() ด้านบนส่งเฉพาะคอลัมน์ของตัวเอง จึงไม่ทับค่าเหล่านี้)
    // มี migration 202610070024: รวมค่าในคำสั่งเดียวฝั่งฐานข้อมูล (pp5_merge_settings_json) สองคนบันทึกพร้อมกันไม่ทับกัน
    // ยังไม่มี: อ่าน -> รวม -> เขียน แบบเดิม (ทำงานได้ แต่ถ้าบันทึกคนละคีย์ในเสี้ยววินาทีเดียวกัน ค่าหนึ่งอาจทับอีกค่า)
    async patchSettingsJson(key, value, failMessage) {
      await auth.requireUser();
      const message = failMessage || 'บันทึกการตั้งค่าระบบไม่สำเร็จ';
      const rpc = typeof client.rpc === 'function'
        ? await client.rpc('pp5_merge_settings_json', { p_key: key, p_value: value })
        : { error: { code: 'PGRST202' } };
      if (!rpc.error) {
        announceSettingsSaved();
        return value;
      }
      if (!['PGRST202', '42883'].includes(rpc.error.code)) throwIfError(rpc.error, message);
      const { data: row, error: readError } = await client.from('school_settings').select('id, settings_json').limit(1).maybeSingle();
      throwIfError(readError, 'อ่านการตั้งค่าระบบไม่สำเร็จ');
      if (!row) throw appError('ยังไม่มีข้อมูลตั้งค่าของโรงเรียน', null, 'SETTINGS_EMPTY');
      const settingsJson = { ...(row.settings_json && typeof row.settings_json === 'object' ? row.settings_json : {}), [key]: value };
      const { error } = await client.from('school_settings').update({ settings_json: settingsJson }).eq('id', row.id);
      throwIfError(error, message);
      announceSettingsSaved();
      return value;
    },

    // สวิตช์ลายน้ำ "ผลระหว่างปี": settings_json.interim_watermark
    async setInterimWatermark(on) {
      return this.patchSettingsJson('interim_watermark', on !== false, 'บันทึกการตั้งค่าลายน้ำไม่สำเร็จ');
    },

    // ข้อความลายน้ำที่พิมพ์เอง: ช่องว่างหลายช่องรวมเป็นช่องเดียว ไม่เกิน 60 ตัวอักษร  ว่าง = กลับไปใช้ข้อความเดิม
    async setInterimWatermarkText(value) {
      const text = asText(value).replace(/\s+/g, ' ').trim().slice(0, 60);
      await this.patchSettingsJson('interim_watermark_text', text, 'บันทึกข้อความลายน้ำไม่สำเร็จ');
      return text;
    },

    // หน้าตาโรงเรียน (ธีมสี คำขวัญ สโลแกน แบนเนอร์หน้าหลัก): settings_json.branding แทนทั้งก้อน
    // ค่าที่ส่งมาผ่าน PP5SchoolBranding.normalize แล้ว (js/school-branding.js) ที่นี่ตรวจแค่ว่าเป็น object
    async setBranding(branding) {
      if (!branding || typeof branding !== 'object' || Array.isArray(branding)) throw appError('ข้อมูลหน้าตาโรงเรียนไม่ถูกต้อง');
      return this.patchSettingsJson('branding', branding, 'บันทึกหน้าตาโรงเรียนไม่สำเร็จ');
    }
  };

  const students = {
    async list(filters = {}) {
      const requestedYear = asText(filters.academicYear).trim();
      const applyFilters = (baseQuery) => {
        let query = baseQuery;
        if (filters.active !== false) query = query.eq('status', filters.status || 'active');
        else if (filters.status) query = query.eq('status', filters.status);
        if (filters.grade) query = query.eq('grade', filters.grade);
        if (filters.room) query = query.eq('room', asText(filters.room));
        return query.order('grade').order('room').order('student_number', { ascending: true });
      };

      if (requestedYear) {
        const rosterResult = await applyFilters(
          client.from('student_year_rosters').select('*').eq('academic_year', requestedYear)
        );
        if (!rosterResult.error) {
          const rosterRows = (rosterResult.data || []).map((row) => ({ ...row, id: row.student_id }));
          return enrichStudents(rosterRows, requestedYear);
        }
        if (!isOptionalSchemaError(rosterResult.error)) {
          throwIfError(rosterResult.error, 'อ่านทะเบียนนักเรียนรายปีไม่สำเร็จ');
        }
      }

      let query = client.from('students').select('*');
      if (requestedYear) query = query.eq('academic_year', requestedYear);
      const { data, error } = await applyFilters(query);
      throwIfError(error, 'อ่านข้อมูลนักเรียนไม่สำเร็จ');
      return enrichStudents(data || [], requestedYear);
    },

    async get(id) {
      const list = await this.list({ active: false });
      return list.find((student) => asText(student.id) === asText(id)) || null;
    },

    async save(values) {
      const state = await auth.requireUser();
      const studentId = asText(
        values.id ?? values.studentId ?? values.student_id ?? values.studentCode
      ).trim();
      if (!studentId) {
        throw appError('กรุณาระบุรหัสนักเรียนก่อนบันทึก', null, 'STUDENT_ID_REQUIRED');
      }
      const academicYear = asText(values.academic_year ?? values.academicYear).trim();
      const submittedRoom = values.room ?? values.classNo ?? values.class_no ?? values.classroom;
      const core = compactObject({
        id: studentId,
        national_id: values.national_id ?? values.nationalId ?? values.idCard ?? values.id_card,
        student_number: values.student_number ?? values.studentNumber,
        prefix: values.prefix ?? values.title,
        first_name: values.first_name ?? values.firstname ?? values.firstName,
        last_name: values.last_name ?? values.lastname ?? values.lastName,
        gender: values.gender, grade: values.grade,
        room: submittedRoom === undefined ? undefined : asText(submittedRoom, '1'),
        academic_year: academicYear || undefined,
        status: values.status || 'active', updated_at: new Date().toISOString()
      });
      const scopedTeacher = state.profile.role === 'teacher' && global.PP5Permissions
        && (await global.PP5Permissions.context()).enabled;
      const coreQuery = scopedTeacher
        ? client.from('students').update(core).eq('id', studentId)
        : client.from('students').upsert(core);
      const { data, error } = await coreQuery.select().single();
      throwIfError(error, 'บันทึกข้อมูลนักเรียนไม่สำเร็จ');
      const savedAcademicYear = asText(data.academic_year || academicYear).trim();
      const roster = {
        academic_year: savedAcademicYear,
        student_id: studentId,
        national_id: data.national_id,
        student_number: data.student_number,
        prefix: data.prefix,
        first_name: data.first_name,
        last_name: data.last_name,
        gender: data.gender,
        grade: data.grade,
        room: data.room,
        status: data.status,
        updated_at: new Date().toISOString()
      };
      if (roster.academic_year) {
        const rosterResult = scopedTeacher
          ? await client.from('student_year_rosters').update(roster).eq('academic_year', savedAcademicYear).eq('student_id', studentId)
          : await client.from('student_year_rosters').upsert(roster, { onConflict: 'academic_year,student_id' });
        if (rosterResult.error && (scopedTeacher || !isOptionalSchemaError(rosterResult.error))) {
          throwIfError(rosterResult.error, 'บันทึกทะเบียนนักเรียนรายปีไม่สำเร็จ');
        }
      }
      const submittedPhoto = values.photo_url ?? values.photoUrl;
      // ลิงก์ชั่วคราวของรูปที่อัปโหลด (หมดอายุใน 6 ชม.) ห้ามบันทึกทับค่าอ้างอิง sb:
      const photoValue = isSignedPhotoUrl(submittedPhoto) ? undefined : submittedPhoto;
      let sourceData = values.source_data ?? values.sourceData;
      const submittedValue = (...keys) => {
        const key = keys.find((candidate) => Object.prototype.hasOwnProperty.call(values, candidate));
        return key === undefined ? undefined : values[key];
      };
      const legacyParentSourceData = compactObject({
        father_phone: submittedValue('father_phone', 'fatherPhone'),
        father_status: submittedValue('father_status', 'fatherStatus'),
        mother_phone: submittedValue('mother_phone', 'motherPhone'),
        mother_status: submittedValue('mother_status', 'motherStatus'),
        postal_code: submittedValue('postal_code', 'postalCode')
      });
      if (photoValue !== undefined || Object.keys(legacyParentSourceData).length) {
        const currentDetail = await client.from('student_details')
          .select('source_data').eq('student_id', studentId).maybeSingle();
        if (currentDetail.error && !isOptionalSchemaError(currentDetail.error)) {
          throwIfError(currentDetail.error, 'อ่านรายละเอียดนักเรียนเดิมไม่สำเร็จ');
        }
        sourceData = {
          ...(currentDetail.data?.source_data || {}),
          ...(sourceData && typeof sourceData === 'object' ? sourceData : {}),
          ...legacyParentSourceData,
          ...(photoValue !== undefined ? { photo_url: asText(photoValue).trim() } : {})
        };
      }
      const detail = compactObject({
        student_id: studentId,
        birth_date: values.birth_date ?? values.birthdate,
        religion: values.religion, blood_type: values.blood_type, address: values.address,
        subdistrict: values.subdistrict, district: values.district, province: values.province,
        father_name: values.father_name ?? values.fatherName,
        father_last_name: values.father_last_name ?? values.father_lastname ?? values.fatherLastname,
        father_occupation: values.father_occupation ?? values.fatherOccupation,
        mother_name: values.mother_name ?? values.motherName,
        mother_last_name: values.mother_last_name ?? values.mother_lastname ?? values.motherLastname,
        mother_occupation: values.mother_occupation ?? values.motherOccupation,
        guardian_name: values.guardian_name ?? values.guardianName,
        guardian_occupation: values.guardian_occupation ?? values.guardianOccupation,
        guardian_relation: values.guardian_relation ?? values.guardianRelation,
        guardian_phone: values.guardian_phone ?? values.guardianPhone,
        source_data: sourceData,
        updated_at: new Date().toISOString()
      });
      if (Object.keys(detail).length > 2) {
        const result = await client.from('student_details').upsert(detail);
        if (result.error && (scopedTeacher || !isOptionalSchemaError(result.error))) {
          throwIfError(result.error, 'บันทึกรายละเอียดนักเรียนไม่สำเร็จ');
        }
      }
      const weightValue = values.weight_kg ?? values.weight;
      const heightValue = values.height_cm ?? values.height;
      let growth = null;
      if (asText(weightValue).trim() || asText(heightValue).trim()) {
        growth = {
          student_id: studentId,
          measured_on: asText(values.measured_on ?? values.measuredOn).trim() || new Date().toISOString().slice(0, 10),
          academic_year: savedAcademicYear,
          weight_kg: asNullableNumber(weightValue),
          height_cm: asNullableNumber(heightValue),
          recorded_by: state.user.id,
          updated_at: new Date().toISOString()
        };
        const growthResult = await client.from('student_growth')
          .upsert(growth, { onConflict: 'student_id,measured_on' });
        if (growthResult.error && (scopedTeacher || !isOptionalSchemaError(growthResult.error))) {
          throwIfError(growthResult.error, 'บันทึกน้ำหนักและส่วนสูงไม่สำเร็จ');
        }
      }
      return mapStudent(data, detail, growth);
    },

    async deactivate(id) {
      await auth.requireUser();
      const { data: updated, error } = await client.from('students')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('id', id).select('academic_year').single();
      throwIfError(error, 'จำหน่ายนักเรียนไม่สำเร็จ');
      if (updated?.academic_year) {
        const rosterResult = await client.from('student_year_rosters')
          .update({ status: 'inactive', updated_at: new Date().toISOString() })
          .eq('academic_year', updated.academic_year).eq('student_id', id);
        if (rosterResult.error && !isOptionalSchemaError(rosterResult.error)) {
          throwIfError(rosterResult.error, 'ปรับสถานะทะเบียนนักเรียนรายปีไม่สำเร็จ');
        }
      }
      return { success: true };
    }
  };

  const subjects = {
    async list(grade) {
      let query = client.from('subjects').select('*');
      const targetGrade = typeof grade === 'object' && grade !== null ? (grade.grade || '') : (grade || '');
      if (targetGrade) query = query.eq('grade', targetGrade);
      const { data, error } = await query.order('id');
      throwIfError(error, 'อ่านรายวิชาไม่สำเร็จ');
      return (data || []).map((row) => ({
        ...row,
        subjectId: row.id, subjectCode: row.code || asText(row.id), subjectName: row.name,
        code: row.code || asText(row.id), fullScore: asNumber(row.full_score, 100),
        passScore: asNumber(row.pass_score, 50)
      }));
    }
  };

  const holidays = {
    async list() {
      const { data, error } = await client.from('holidays').select('*').order('holiday_date');
      throwIfError(error, 'อ่านวันหยุดไม่สำเร็จ');
      return data || [];
    }
  };

  const attendance = {
    async daily(date, studentIds) {
      if (!studentIds?.length) return [];
      const { data, error } = await client.from('attendance_daily').select('*')
        .eq('attendance_date', date).in('student_id', studentIds);
      throwIfError(error, 'อ่านเวลาเรียนรายวันไม่สำเร็จ');
      return data || [];
    },

    async saveDaily(records) {
      const state = await auth.requireUser();
      const normalized = records.map((row) => compactObject({
        student_id: row.student_id ?? row.studentId,
        attendance_date: row.attendance_date ?? row.date,
        status: row.status, remark: row.remark, recorded_by: state.user.id,
        academic_year: row.academic_year ?? row.academicYear,
        updated_at: new Date().toISOString()
      }));
      const { data, error } = await client.from('attendance_daily')
        .upsert(normalized, { onConflict: 'student_id,attendance_date' }).select();
      throwIfError(error, 'บันทึกเวลาเรียนรายวันไม่สำเร็จ');
      return data || [];
    },

    async monthly(yearMonth, studentIds) {
      if (!studentIds?.length) return [];
      const { data, error } = await client.from('attendance_monthly').select('*')
        .eq('year_month', yearMonth).in('student_id', studentIds);
      if (error && isOptionalSchemaError(error)) return [];
      throwIfError(error, 'อ่านเวลาเรียนรายเดือนไม่สำเร็จ');
      return data || [];
    },

    async saveMonthly(records) {
      await auth.requireUser();
      const { data, error } = await client.from('attendance_monthly')
        .upsert(records, { onConflict: 'student_id,year_month,day_number' }).select();
      throwIfError(error, 'บันทึกเวลาเรียนรายเดือนไม่สำเร็จ');
      return data || [];
    }
  };

  const scores = {
    async list(subjectId, semester, studentIds) {
      let query = client.from('scores').select('*').eq('subject_id', subjectId);
      if (semester) query = query.eq('semester', semester);
      if (studentIds?.length) query = query.in('student_id', studentIds);
      const { data, error } = await query;
      throwIfError(error, 'อ่านคะแนนไม่สำเร็จ');
      return data || [];
    },

    async saveBatch(records, context) {
      await auth.requireUser();
      const normalized = records.map((row) => compactObject({
        student_id: asText(row.student_id ?? row.studentId),
        subject_id: row.subject_id ?? row.subjectId,
        semester: row.semester, academic_year: asText(row.academic_year ?? row.academicYear),
        formative_score: row.formative_score ?? row.formativeScore,
        summative_score: row.summative_score ?? row.summativeScore,
        total_score: row.total_score ?? row.totalScore,
        grade_point: row.grade_point ?? row.gradePoint, grade_text: row.grade_text ?? row.gradeText,
        score_breakdown: row.score_breakdown ?? row.scoreBreakdown
      }));
      const { data, error } = await client.rpc('pp5_save_score_batch', {
        p_subject_id: asText(context.subjectId), p_semester: context.semester,
        p_academic_year: asText(context.academicYear), p_rows: normalized,
        p_clear_student_ids: context.clearStudentIds || [],
        p_expected_updated_at: context.expectedUpdatedAt > 0 ? new Date(context.expectedUpdatedAt).toISOString() : null
      });
      // Never fall back to sequential delete/upsert: that can destroy rows on a failed save.
      if (error && ['PGRST202', '42883'].includes(error.code)) {
        throw appError('ยังไม่ได้ติดตั้งระบบบันทึกคะแนนแบบครบชุด กรุณาติดตั้ง migration 202609240013 ก่อนบันทึก', error, 'MIGRATION_REQUIRED');
      }
      throwIfError(error, 'บันทึกคะแนนทั้งชุดไม่สำเร็จ');
      if (!Array.isArray(data) || data.length !== records.length) throw appError('ผลยืนยันการบันทึกคะแนนไม่ครบ กรุณาโหลดข้อมูลตรวจสอบ');
      return data;
    },

    async save(records) {
      const state = await auth.requireUser();
      const normalized = records.map((row) => compactObject({
        student_id: row.student_id ?? row.studentId,
        subject_id: row.subject_id ?? row.subjectId,
        semester: asNumber(row.semester, 1), academic_year: asText(row.academic_year ?? row.academicYear),
        formative_score: row.formative_score ?? row.formativeScore,
        summative_score: row.summative_score ?? row.summativeScore,
        total_score: row.total_score ?? row.totalScore,
        grade_point: row.grade_point ?? row.gradePoint, grade_text: row.grade_text ?? row.gradeText,
        score_breakdown: row.score_breakdown ?? row.scoreBreakdown,
        recorded_by: state.user.id, updated_at: new Date().toISOString()
      }));
      const { data, error } = await client.from('scores')
        .upsert(normalized, { onConflict: 'student_id,subject_id,semester,academic_year' }).select();
      throwIfError(error, 'บันทึกคะแนนไม่สำเร็จ');
      return data || [];
    }
  };

  const assessments = {
    async list(type, semester, studentIds, academicYear) {
      if (!studentIds?.length) return [];
      const year = asText(academicYear).trim();
      if (!/^\d{4}$/.test(year)) throw appError('กรุณาระบุปีการศึกษาที่ต้องการอ่านผลประเมิน');
      let query = client.from('assessments').select('*').eq('assessment_type', type);
      query = query.eq('academic_year', year);
      if (semester) query = query.eq('semester', semester);
      if (studentIds?.length) query = query.in('student_id', studentIds);
      const { data, error } = await query;
      throwIfError(error, 'อ่านผลประเมินไม่สำเร็จ');
      return data || [];
    },

    async save(records) {
      await auth.requireUser();
      const normalized = records.map((row) => compactObject({
        student_id: row.student_id ?? row.studentId,
        assessment_type: row.assessment_type ?? row.assessmentType,
        criteria_code: row.criteria_code ?? row.criteriaCode,
        score: row.score, academic_year: asText(row.academic_year ?? row.academicYear),
        semester: asNumber(row.semester, 1), updated_at: new Date().toISOString(),
        // note = ข้อความประกอบ (เช่น ชื่อชุมนุม) ส่งเฉพาะแถวที่ระบุมา
        note: row.note === undefined ? undefined : (asText(row.note).trim().slice(0, 200) || null)
      }));
      if (normalized.some((row) => !row.student_id || !/^\d{4}$/.test(row.academic_year) ||
          ![1, 2].includes(row.semester) || row.score === null || row.score === undefined ||
          asText(row.score).trim() === '' || !Number.isInteger(Number(row.score)) || Number(row.score) < 0 ||
          Number(row.score) > (row.assessment_type === 'activity' ? 1 : 3))) {
        throw appError('ข้อมูลประเมินไม่ถูกต้อง กรุณาตรวจปี ภาคเรียน และคะแนนทุกคนก่อนบันทึก');
      }
      const upsert = (list) => client.from('assessments')
        .upsert(list, { onConflict: 'student_id,assessment_type,criteria_code,semester,academic_year' })
        .select();
      let { data, error } = await upsert(normalized);
      // ฐานข้อมูลที่ยังไม่ได้รัน migration 202610060022 ไม่มีคอลัมน์ note: บันทึกผลต่อได้ ข้ามแค่ข้อความประกอบ
      if (error && isOptionalSchemaError(error) && /note/i.test(error.message || '') &&
          normalized.some((row) => 'note' in row)) {
        ({ data, error } = await upsert(normalized.map(({ note, ...rest }) => rest)));
      }
      throwIfError(error, 'บันทึกผลประเมินไม่สำเร็จ');
      return data || [];
    },

    // ลบผลประเมินที่บันทึกไว้ ใช้เมื่อต้องการล้างค่ากลับเป็น "ยังไม่ประเมิน"
    // (ฝั่งบันทึกปฏิเสธค่า null โดยตั้งใจ จึงต้องลบแถวเท่านั้น)
    // ส่งได้สองแบบ: keys = [{ studentId, criteriaCode }] หรือ studentIds = [...] (+ criteriaCode ทางเลือก)
    async clear(request) {
      await auth.requireUser();
      const type = asText(request?.type ?? request?.assessmentType).trim();
      const year = asText(request?.academicYear).trim();
      const semester = asNumber(request?.semester, 1);
      if (!type || !/^\d{4}$/.test(year) || ![1, 2].includes(semester)) {
        throw appError('ข้อมูลสำหรับล้างผลประเมินไม่ถูกต้อง กรุณาตรวจปีและภาคเรียน');
      }

      const keys = Array.isArray(request?.keys) ? request.keys : [];
      const removed = [];

      if (keys.length) {
        // จัดกลุ่มตาม criteria_code เพื่อลดจำนวนคำขอ (ตารางมี unique key ระดับ student+type+criteria+semester+year)
        const byCriteria = new Map();
        keys.forEach((row) => {
          const studentId = asText(row?.studentId ?? row?.student_id).trim();
          const criteriaCode = asText(row?.criteriaCode ?? row?.criteria_code).trim();
          if (!studentId || !criteriaCode) return;
          if (!byCriteria.has(criteriaCode)) byCriteria.set(criteriaCode, new Set());
          byCriteria.get(criteriaCode).add(studentId);
        });
        for (const [criteriaCode, ids] of byCriteria) {
          const { data, error } = await client.from('assessments').delete()
            .eq('assessment_type', type)
            .eq('academic_year', year)
            .eq('semester', semester)
            .eq('criteria_code', criteriaCode)
            .in('student_id', [...ids])
            .select();
          throwIfError(error, 'ล้างผลประเมินไม่สำเร็จ');
          if (data) removed.push(...data);
        }
        return removed;
      }

      const studentIds = (Array.isArray(request?.studentIds) ? request.studentIds : [])
        .map((id) => asText(id).trim()).filter(Boolean);
      if (!studentIds.length) return [];
      let query = client.from('assessments').delete()
        .eq('assessment_type', type)
        .eq('academic_year', year)
        .eq('semester', semester)
        .in('student_id', studentIds);
      const criteriaCode = asText(request?.criteriaCode).trim();
      if (criteriaCode) query = query.eq('criteria_code', criteriaCode);
      const { data, error } = await query.select();
      throwIfError(error, 'ล้างผลประเมินไม่สำเร็จ');
      return data || [];
    }
  };

  const helpers = {
    asText, asNumber, compactObject, isOptionalSchemaError, gradeBasisScore,
    calculateGrade(total) {
      const value = gradeBasisScore(total);
      if (value >= 80) return '4';
      if (value >= 75) return '3.5';
      if (value >= 70) return '3';
      if (value >= 65) return '2.5';
      if (value >= 60) return '2';
      if (value >= 55) return '1.5';
      if (value >= 50) return '1';
      return '0';
    }
  };

  // ใบรายงาน PDF ชั่วคราว (migration 202610070025): ผู้ปกครองใน LINE (Android) ดาวน์โหลดไฟล์ที่สร้างในหน้าเว็บไม่ได้
  // จึงอัปโหลดไว้ในโฟลเดอร์ของตัวเอง แล้วคืนลิงก์ชั่วคราว 10 นาทีให้ LINE เปิดด้วย Chrome (ไม่ต้องล็อกอินใหม่)
  const REPORT_EXPORT_BUCKET = 'report-exports';
  const reportExports = {
    async share(blob, fileName) {
      const state = await auth.requireUser();
      const uid = asText(state?.user?.id).trim();
      if (!uid) throw appError('กรุณาเข้าสู่ระบบใหม่', null, 'AUTH_REQUIRED');
      if (!blob || !blob.size) throw appError('ไฟล์ใบรายงานว่างเปล่า');
      const bucket = client.storage.from(REPORT_EXPORT_BUCKET);
      const path = `${uid}/${Date.now()}.pdf`;
      const { error: uploadError } = await bucket.upload(path, blob, { contentType: 'application/pdf', upsert: false, cacheControl: '60' });
      throwIfError(uploadError, 'เตรียมไฟล์ใบรายงานไม่สำเร็จ');
      const safeName = asText(fileName).replace(/[^\w.-]/g, '') || 'report.pdf';
      const { data, error } = await bucket.createSignedUrl(path, 600, { download: safeName });
      throwIfError(error, 'สร้างลิงก์ใบรายงานไม่สำเร็จ');
      // เก็บไว้แค่ไฟล์ล่าสุดของคนนี้ (ลบไม่ได้ก็ไม่เป็นไร)
      try {
        const listed = await bucket.list(uid, { limit: 100 });
        const old = (listed?.data || []).map((item) => `${uid}/${item.name}`).filter((name) => name !== path);
        if (old.length) await bucket.remove(old);
      } catch (_) { /* ignore */ }
      if (!/^https:\/\//.test(asText(data?.signedUrl))) throw appError('สร้างลิงก์ใบรายงานไม่สำเร็จ');
      return data.signedUrl;
    }
  };

  global.PP5Data = { client, auth, settings, students, studentPhotos, reportExports, subjects, holidays, attendance, scores, assessments, helpers };
  global.__PP5_AUTH_READY = auth.session().catch((error) => {
    console.warn('ไม่พบ Supabase session ที่ใช้งานได้:', error.message);
    clearLegacySession();
    return null;
  });
})(window);
