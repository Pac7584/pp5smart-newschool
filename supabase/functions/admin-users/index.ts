import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function normalizeStudentIds(value: unknown) {
  if (value !== undefined && value !== null && !Array.isArray(value) && typeof value !== 'string') {
    throw new Error('Student IDs must be a comma-separated string or an array');
  }
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  if (source.some((item) => typeof item !== 'string' && typeof item !== 'number')) {
    throw new Error('Each student ID must be text or a number');
  }
  return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))];
}

async function validateStudentIds(client: ReturnType<typeof createClient>, studentIds: string[]) {
  if (!studentIds.length) return;
  const { data, error } = await client.from('students').select('id').in('id', studentIds);
  if (error) throw error;
  const found = new Set((data || []).map((row) => String(row.id)));
  if (studentIds.some((id) => !found.has(id))) throw new Error('One or more student IDs do not exist');
}

async function replaceParentLinks(client: ReturnType<typeof createClient>, userId: string, studentIds: string[]) {
  const { error } = await client.rpc('pp5_replace_parent_links', {
    p_parent_user_id: userId, p_student_ids: studentIds
  });
  if (error) throw error;
}

function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return 'R9!' + Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

const MAX_PENDING_REGISTRATIONS = 30;
const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// บัญชีที่ลงทะเบียนเองและยังรออนุมัติ: id -> ข้อมูลที่ผู้สมัครกรอก (เบอร์ อีเมล เวลาสมัคร)
async function pendingRegistrations(client: ReturnType<typeof createClient>) {
  const pending = new Map<string, Record<string, unknown>>();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users || [];
    for (const user of users) {
      if (user.app_metadata?.pp5_pending !== true) continue;
      pending.set(user.id, {
        phone: user.user_metadata?.phone || '',
        email: user.email && !user.email.endsWith('@pp5smart.local') ? user.email : '',
        registeredAt: user.created_at || ''
      });
    }
    if (users.length < 1000) break;
  }
  return pending;
}

async function selfRegister(client: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  if (String(body.website || '').trim()) return json({ error: 'ลงทะเบียนไม่สำเร็จ' }, 400); // ช่องกับดักบอท
  const firstName = String(body.firstName || '').trim().slice(0, 60);
  const lastName = String(body.lastName || '').trim().slice(0, 60);
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const phone = String(body.phone || '').replace(/[^\d+-]/g, '').slice(0, 20);
  const givenEmail = String(body.email || '').trim().toLowerCase();
  if (!firstName || !lastName) return json({ error: 'กรุณากรอกชื่อและนามสกุล' }, 400);
  if (!USERNAME_PATTERN.test(username)) return json({ error: 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ยาว 3-30 ตัว' }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: 'รหัสผ่านต้องยาว 8 ตัวขึ้นไป' }, 400);
  if (givenEmail && !EMAIL_PATTERN.test(givenEmail)) return json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' }, 400);

  if ((await pendingRegistrations(client)).size >= MAX_PENDING_REGISTRATIONS) {
    return json({ error: 'มีคำขอรออนุมัติจำนวนมาก กรุณาติดต่อผู้ดูแลระบบ' }, 429);
  }
  const { data: taken, error: takenError } = await client.from('user_profiles').select('id').eq('username', username).maybeSingle();
  if (takenError) throw takenError;
  if (taken) return json({ error: 'ชื่อผู้ใช้นี้มีคนใช้แล้ว กรุณาเลือกชื่ออื่น' }, 409);

  const displayName = `${firstName} ${lastName}`;
  const { data: created, error: createError } = await client.auth.admin.createUser({
    email: givenEmail || `${username}@pp5smart.local`,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName, phone, self_registered: true },
    app_metadata: { role: 'teacher', pp5_pending: true }
  });
  if (createError || !created.user) {
    const message = String(createError?.message || '');
    if (/already|registered|exists/i.test(message)) return json({ error: 'อีเมลหรือชื่อผู้ใช้นี้มีบัญชีอยู่แล้ว' }, 409);
    throw createError || new Error('ลงทะเบียนไม่สำเร็จ');
  }
  const { error: insertError } = await client.from('user_profiles').insert({
    id: created.user.id, username, role: 'teacher', display_name: displayName, active: false
  });
  if (insertError) {
    await client.auth.admin.deleteUser(created.user.id);
    throw insertError;
  }
  return json({ success: true, message: 'ส่งคำขอลงทะเบียนแล้ว กรุณารอผู้ดูแลระบบอนุมัติ' }, 201);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization') || '';
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Function secrets are incomplete' }, 500);

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }
  const action = String(body.action || '');

  // ลงทะเบียนบุคลากรด้วยตนเอง (owner 2026-10-14): 2 คำสั่งที่ไม่ต้องเข้าสู่ระบบ ใช้ได้เฉพาะเมื่อผู้ดูแลเปิดสวิตช์
  // (settings_json.self_registration = true) บัญชีใหม่ active = false + app_metadata.pp5_pending จนผู้ดูแลอนุมัติ
  // ต้องปิด "Verify JWT" ของฟังก์ชันนี้ใน Dashboard (ผู้ไม่ได้เข้าระบบส่ง publishable key ซึ่งไม่ใช่ JWT)
  // คำสั่งอื่นทั้งหมดยังตรวจผู้เรียกด้วย auth.getUser() + บทบาท admin เหมือนเดิม
  if (action === 'registration-status' || action === 'register') {
    const publicClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    try {
      const { data: settingsRow, error: settingsError } = await publicClient
        .from('school_settings').select('settings_json').limit(1).maybeSingle();
      if (settingsError) throw settingsError;
      const enabled = settingsRow?.settings_json?.self_registration === true;
      if (action === 'registration-status') return json({ success: true, enabled });
      if (!enabled) return json({ error: 'ขณะนี้ปิดรับลงทะเบียน กรุณาติดต่อผู้ดูแลระบบ' }, 403);
      return await selfRegister(publicClient, body);
    } catch (error) {
      console.error('admin-users register:', error);
      return json({ error: error instanceof Error ? error.message : 'ลงทะเบียนไม่สำเร็จ' }, 400);
    }
  }

  if (!authorization.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false }
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return json({ error: 'Unauthorized' }, 401);
  const { data: callerProfile, error: profileError } = await adminClient
    .from('user_profiles')
    .select('role,active')
    .eq('id', callerData.user.id)
    .maybeSingle();
  if (profileError || callerProfile?.role !== 'admin' || callerProfile?.active !== true) {
    return json({ error: 'Forbidden' }, 403);
  }

  try {
    if (action === 'list') {
      const { data, error } = await adminClient.from('user_profiles')
        .select('id,username,role,display_name,grade,room,allow_export,active,created_at,updated_at')
        .order('username');
      if (error) throw error;
      const { data: links, error: linksError } = await adminClient.from('parent_student_links').select('parent_user_id,student_id');
      if (linksError) throw linksError;
      const linkMap = new Map<string, string[]>();
      (links || []).forEach((link) => {
        const current = linkMap.get(link.parent_user_id) || [];
        current.push(String(link.student_id));
        linkMap.set(link.parent_user_id, current);
      });
      const pending = await pendingRegistrations(adminClient);
      return json({ success: true, users: (data || []).map((profile) => ({
        ...profile,
        studentIds: (linkMap.get(profile.id) || []).join(','),
        pending: pending.has(profile.id),
        registration: pending.get(profile.id) || null
      })) });
    }

    if (action === 'import-legacy') {
      const batchSize = Math.max(1, Math.min(20, Number(body.batchSize) || 15));
      const { data: staged, error: stagingError } = await adminClient
        .from('legacy_user_import_staging')
        .select('username,role,display_name,email,student_ids,active,source_row')
        .is('imported_at', null)
        .order('source_row')
        .limit(batchSize);
      if (stagingError) {
        if (stagingError.code === '42P01' || /legacy_user_import_staging|schema cache/i.test(stagingError.message || '')) {
          return json({ error: 'ยังไม่ได้ติดตั้ง migration รายชื่อผู้ใช้เดิม 202608290009' }, 409);
        }
        throw stagingError;
      }

      const { data: profiles, error: profilesError } = await adminClient
        .from('user_profiles')
        .select('id,username');
      if (profilesError) throw profilesError;
      const { data: authPage, error: authListError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (authListError) throw authListError;

      const profileByUsername = new Map((profiles || []).map((profile) => [String(profile.username).toLowerCase(), profile]));
      const profileById = new Map((profiles || []).map((profile) => [String(profile.id), profile]));
      const authByEmail = new Map((authPage.users || []).filter((user) => user.email).map((user) => [String(user.email).toLowerCase(), user]));
      const authById = new Map((authPage.users || []).map((user) => [String(user.id), user]));
      const credentials: Array<{ username: string; temporaryPassword: string; role: string; displayName: string }> = [];
      const failures: Array<{ username: string; message: string }> = [];
      let created = 0;
      let matched = 0;

      for (const source of staged || []) {
        const username = String(source.username || '').trim().toLowerCase();
        const role = String(source.role || 'teacher');
        const displayName = String(source.display_name || username);
        const preferredEmail = String(source.email || (username + '@pp5smart.local')).trim().toLowerCase();
        const aliasEmail = username + '@pp5smart.local';
        const existingProfile = profileByUsername.get(username);
        let userId = existingProfile?.id || '';
        let disposition: 'created' | 'matched' = 'matched';
        let generatedPassword = '';
        let createdAuthId = '';

        try {
          const studentIds = role === 'parent' ? normalizeStudentIds(source.student_ids) : [];
          await validateStudentIds(adminClient, studentIds);
          if (!userId) {
            const preferredAuth = authByEmail.get(preferredEmail);
            const preferredProfile = preferredAuth ? profileById.get(preferredAuth.id) : null;
            if (preferredAuth && (!preferredProfile || String(preferredProfile.username).toLowerCase() === username)) {
              userId = preferredAuth.id;
            } else {
              const targetEmail = preferredAuth ? aliasEmail : preferredEmail;
              const aliasAuth = authByEmail.get(targetEmail);
              const aliasProfile = aliasAuth ? profileById.get(aliasAuth.id) : null;
              if (aliasAuth && (!aliasProfile || String(aliasProfile.username).toLowerCase() === username)) {
                userId = aliasAuth.id;
              } else {
                generatedPassword = temporaryPassword();
                const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
                  email: targetEmail,
                  password: generatedPassword,
                  email_confirm: true,
                  user_metadata: { username, display_name: displayName, temporary_password: true },
                  app_metadata: { role }
                });
                if (createError || !createdUser.user) throw createError || new Error('Create user failed');
                userId = createdUser.user.id;
                createdAuthId = userId;
                disposition = 'created';
                authByEmail.set(targetEmail, createdUser.user);
                authById.set(userId, createdUser.user);
              }
            }
          }

          const currentAuth = authById.get(userId);
          const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
            app_metadata: { ...(currentAuth?.app_metadata || {}), role },
            user_metadata: {
              ...(currentAuth?.user_metadata || {}),
              username,
              display_name: displayName,
              temporary_password: disposition === 'created'
            }
          });
          if (authUpdateError) throw authUpdateError;

          const profile = {
            id: userId,
            username,
            role,
            display_name: displayName,
            grade: null,
            room: null,
            allow_export: role === 'admin',
            active: source.active !== false
          };
          const { error: profileError } = await adminClient.from('user_profiles').upsert(profile, { onConflict: 'id' });
          if (profileError) throw profileError;

          await replaceParentLinks(callerClient, userId, studentIds);

          const { error: stagedUpdateError } = await adminClient.from('legacy_user_import_staging').update({
            imported_user_id: userId,
            import_disposition: disposition,
            imported_at: new Date().toISOString(),
            last_error: null
          }).eq('username', username);
          if (stagedUpdateError) throw stagedUpdateError;

          profileByUsername.set(username, profile);
          profileById.set(userId, profile);
          if (disposition === 'created') {
            created += 1;
            credentials.push({ username, temporaryPassword: generatedPassword, role, displayName });
          } else {
            matched += 1;
          }
        } catch (importError) {
          if (createdAuthId) await adminClient.auth.admin.deleteUser(createdAuthId);
          const message = importError instanceof Error ? importError.message : 'Import failed';
          failures.push({ username, message });
          await adminClient.from('legacy_user_import_staging').update({ last_error: message }).eq('username', username);
        }
      }

      const { count: remaining, error: countError } = await adminClient
        .from('legacy_user_import_staging')
        .select('*', { count: 'exact', head: true })
        .is('imported_at', null);
      if (countError) throw countError;
      return json({ success: failures.length === 0, created, matched, failures, credentials, remaining: remaining || 0 });
    }

    if (action === 'create') {
      const username = String(body.username || '').trim().toLowerCase();
      const email = String(body.email || (username ? `${username}@pp5smart.local` : '')).trim().toLowerCase();
      const password = String(body.password || '');
      const role = String(body.role || 'teacher');
      if (!username || !email || password.length < 10) return json({ error: 'Username, email and password (10+ chars) are required' }, 400);
      if (!['admin', 'teacher', 'parent'].includes(role)) return json({ error: 'Invalid role' }, 400);
      const studentIds = normalizeStudentIds(body.studentIds);
      if (role !== 'parent' && studentIds.length) return json({ error: 'Only parents can have student links' }, 400);
      await validateStudentIds(adminClient, studentIds);
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, display_name: String(body.displayName || username) },
        app_metadata: { role }
      });
      if (createError || !created.user) throw createError || new Error('Create user failed');
      const profile = {
        id: created.user.id,
        username,
        role,
        display_name: String(body.displayName || username),
        grade: body.grade || null,
        room: body.room || null,
        allow_export: body.allowExport === true,
        active: body.active !== false
      };
      const { error: insertError } = await adminClient.from('user_profiles').insert(profile);
      if (insertError) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        throw insertError;
      }
      if (role === 'parent') {
        try {
          await replaceParentLinks(callerClient, created.user.id, studentIds);
        } catch (linkError) {
          await adminClient.auth.admin.deleteUser(created.user.id);
          throw linkError;
        }
      }
      return json({ success: true, user: profile }, 201);
    }

    if (action === 'reset-parent-passwords') {
      const password = String(body.password || '');
      if (password.length < 10) return json({ error: 'Password must contain at least 10 characters' }, 400);
      if (body.confirmAllParents !== true) return json({ error: 'Explicit confirmation is required to reset all parent accounts' }, 400);
      const { data: parents, error: parentsError } = await adminClient
        .from('user_profiles')
        .select('id,username')
        .eq('role', 'parent');
      if (parentsError) throw parentsError;

      const failures: Array<{ username: string; message: string }> = [];
      let updated = 0;
      const batchSize = 8;
      for (let offset = 0; offset < (parents || []).length; offset += batchSize) {
        const batch = (parents || []).slice(offset, offset + batchSize);
        const results = await Promise.all(batch.map(async (parent) => {
          const { error } = await adminClient.auth.admin.updateUserById(parent.id, { password });
          return { username: parent.username, error };
        }));
        for (const result of results) {
          if (result.error) failures.push({ username: result.username, message: result.error.message || 'Password reset failed' });
          else updated += 1;
        }
      }
      return json({ success: failures.length === 0, total: (parents || []).length, updated, failures });
    }

    const userId = String(body.userId || body.id || '');
    if (!userId) return json({ error: 'userId is required' }, 400);
    if (userId === callerData.user.id && (action === 'delete' || body.active === false)) {
      return json({ error: 'ผู้ดูแลไม่สามารถลบหรือระงับบัญชีที่กำลังใช้งานอยู่' }, 400);
    }

    if (action === 'update') {
      const profileChanges: Record<string, unknown> = {};
      const mapping: Record<string, string> = {
        username: 'username', role: 'role', displayName: 'display_name', grade: 'grade',
        room: 'room', allowExport: 'allow_export', active: 'active'
      };
      for (const [input, column] of Object.entries(mapping)) {
        if (Object.hasOwn(body, input)) profileChanges[column] = body[input];
      }
      if (profileChanges.role && !['admin', 'teacher', 'parent'].includes(String(profileChanges.role))) {
        return json({ error: 'Invalid role' }, 400);
      }
      if (userId === callerData.user.id && profileChanges.role && profileChanges.role !== 'admin') {
        return json({ error: 'ผู้ดูแลไม่สามารถเปลี่ยนบทบาทบัญชีที่กำลังใช้งานอยู่' }, 400);
      }
      const { data: before, error: beforeError } = await adminClient.from('user_profiles').select('role').eq('id', userId).single();
      if (beforeError) throw beforeError;
      const nextRole = String(profileChanges.role || before.role);
      const replaceLinks = Object.hasOwn(body, 'studentIds') || nextRole !== 'parent';
      const studentIds = normalizeStudentIds(body.studentIds);
      if (nextRole !== 'parent' && studentIds.length) return json({ error: 'Only parents can have student links' }, 400);
      await validateStudentIds(adminClient, studentIds);
      const { data, error } = await adminClient.from('user_profiles').update(profileChanges).eq('id', userId).select().single();
      if (error) throw error;
      if (profileChanges.role || profileChanges.username || profileChanges.display_name) {
        const { data: authRecord, error: authReadError } = await adminClient.auth.admin.getUserById(userId);
        if (authReadError) throw authReadError;
        const authChanges: {
          email?: string;
          email_confirm?: boolean;
          app_metadata?: Record<string, unknown>;
          user_metadata?: Record<string, unknown>;
        } = {
          app_metadata: { ...authRecord.user?.app_metadata, role: profileChanges.role || data.role },
          user_metadata: {
            ...authRecord.user?.user_metadata,
            username: profileChanges.username || data.username,
            display_name: profileChanges.display_name || data.display_name
          }
        };
        if (profileChanges.username && authRecord.user?.email?.endsWith('@pp5smart.local')) {
          authChanges.email = `${String(profileChanges.username).toLowerCase()}@pp5smart.local`;
          authChanges.email_confirm = true;
        }
        const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, authChanges);
        if (authUpdateError) throw authUpdateError;
      }
      if (replaceLinks) await replaceParentLinks(callerClient, userId, nextRole === 'parent' ? studentIds : []);
      return json({ success: true, user: data });
    }

    // อนุมัติคำขอลงทะเบียน: ผู้ดูแลเลือกเป็นครูหรือผู้ดูแลระบบ (owner 2026-10-14)
    if (action === 'approve-registration') {
      const role = String(body.role || 'teacher');
      if (!['teacher', 'admin'].includes(role)) return json({ error: 'Invalid role' }, 400);
      const { data: authRecord, error: readError } = await adminClient.auth.admin.getUserById(userId);
      if (readError || !authRecord.user) throw readError || new Error('ไม่พบบัญชี');
      if (authRecord.user.app_metadata?.pp5_pending !== true) return json({ error: 'บัญชีนี้ไม่ได้รออนุมัติ' }, 400);
      const { data, error } = await adminClient.from('user_profiles').update({ role, active: true }).eq('id', userId).select().single();
      if (error) throw error;
      const { pp5_pending: _done, ...appMetadata } = authRecord.user.app_metadata || {};
      const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
        app_metadata: { ...appMetadata, role, pp5_approved_at: new Date().toISOString() }
      });
      if (authError) throw authError;
      return json({ success: true, user: data });
    }

    // ปฏิเสธคำขอ: ลบบัญชีที่ยังรออนุมัติเท่านั้น (บัญชีที่ใช้งานอยู่ลบด้วยปุ่ม "ลบ" เดิม)
    if (action === 'reject-registration') {
      const { data: authRecord, error: readError } = await adminClient.auth.admin.getUserById(userId);
      if (readError || !authRecord.user) throw readError || new Error('ไม่พบบัญชี');
      if (authRecord.user.app_metadata?.pp5_pending !== true) return json({ error: 'บัญชีนี้ไม่ได้รออนุมัติ' }, 400);
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ success: true });
    }

    if (action === 'reset-password') {
      const password = String(body.password || '');
      if (password.length < 10) return json({ error: 'Password must contain at least 10 characters' }, 400);
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      return json({ success: true });
    }

    if (action === 'delete') {
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('admin-users:', error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 400);
  }
});
