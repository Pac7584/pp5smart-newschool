// line-notify — LINE notifications for parents.
//
//  • LINE webhook (request carries x-line-signature): verifies the signature with
//    LINE_CHANNEL_SECRET, then links a parent when they type their one-time code,
//    deactivates links on unfollow, and answers with short help texts.
//  • App actions (request carries the user's Supabase JWT):
//      status        any signed-in user: is LINE configured, OA id, how many parents linked
//      send-absence  teacher/admin: notify parents of students marked absent on a date
//      send-grades   admin: notify parents that a term's results are out
//      liff-link     parent: link the LINE user of a LIFF ID token to the signed-in parent
//  • LIFF (opened from the LINE rich menu, no Supabase JWT):
//      liff-config   public: the LIFF id
//      liff-session  LINE ID token (verified with LINE) of a LINKED parent → one-time sign-in
//                    token hash for supabase.auth.verifyOtp, so the parent sees grades at once
//
// Secrets (Supabase → Edge Functions → Secrets): LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET,
// optional LINE_OA_BASIC_ID (e.g. @abc1234x) and PP5_PORTAL_URL; for LIFF also LINE_LOGIN_CHANNEL_ID
// (the LINE Login channel that owns the LIFF app) and LINE_LIFF_ID. SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided by the platform. Deploy with --no-verify-jwt because
// LINE's webhook does not send a Supabase JWT; every app action checks the JWT itself.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  verifyLineSignature, parseLinkCode, isLineUserId, isAbsentStatus, linkAttemptBlocked, nextFailureRow,
  absenceMessage, gradesMessage, recipientsByStudent, parentForLineUser,
  WELCOME_TEXT, LINKED_TEXT, BAD_CODE_TEXT, BLOCKED_TEXT, HELP_TEXT
} from './core.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
});

const env = (name: string) => Deno.env.get(name) || '';
const LINE_API = 'https://api.line.me/v2/bot/message';
type Admin = ReturnType<typeof createClient>;

async function lineCall(path: string, body: unknown): Promise<{ ok: boolean; status: number; detail: string }> {
  const response = await fetch(`${LINE_API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env('LINE_CHANNEL_ACCESS_TOKEN')}` },
    body: JSON.stringify(body)
  });
  const detail = response.ok ? '' : (await response.text()).slice(0, 300);
  return { ok: response.ok, status: response.status, detail };
}
const reply = (replyToken: string, text: string) => lineCall('reply', { replyToken, messages: [{ type: 'text', text }] });

// ───────────────────────── webhook ─────────────────────────
async function handleWebhook(request: Request, admin: Admin): Promise<Response> {
  const raw = await request.text();
  if (!(await verifyLineSignature(env('LINE_CHANNEL_SECRET'), raw, request.headers.get('x-line-signature')))) {
    return new Response('bad signature', { status: 401 });
  }
  let events: Array<Record<string, any>> = [];
  try { events = JSON.parse(raw).events || []; } catch { return new Response('ok'); }
  for (const event of events) {
    try { await handleEvent(event, admin); } catch (error) { console.error('line event failed', error); }
  }
  return new Response('ok'); // LINE only needs a 200; failures are logged, never retried by LINE.
}

async function handleEvent(event: Record<string, any>, admin: Admin) {
  const lineUserId = String(event.source?.userId || '');
  if (event.source?.type !== 'user' || !isLineUserId(lineUserId)) return;
  if (event.type === 'unfollow') {
    await admin.from('line_links').update({ active: false, unlinked_at: new Date().toISOString() }).eq('line_user_id', lineUserId).eq('active', true);
    return;
  }
  if (event.type === 'follow') { await reply(event.replyToken, WELCOME_TEXT); return; }
  if (event.type !== 'message' || event.message?.type !== 'text') return;

  const code = parseLinkCode(event.message.text);
  if (!code) { await reply(event.replyToken, HELP_TEXT); return; }

  const { data: failure } = await admin.from('line_link_failures').select('failures, window_start').eq('line_user_id', lineUserId).maybeSingle();
  if (linkAttemptBlocked(failure)) { await reply(event.replyToken, BLOCKED_TEXT); return; }

  const { data: found } = await admin.from('line_link_codes').select('parent_user_id, expires_at').eq('code', code).maybeSingle();
  if (!found || new Date(found.expires_at).getTime() < Date.now()) {
    await admin.from('line_link_failures').upsert({ line_user_id: lineUserId, ...nextFailureRow(failure) });
    await reply(event.replyToken, BAD_CODE_TEXT);
    return;
  }
  const { error } = await admin.from('line_links').upsert(
    { parent_user_id: found.parent_user_id, line_user_id: lineUserId, active: true, linked_at: new Date().toISOString(), unlinked_at: null },
    { onConflict: 'parent_user_id,line_user_id' }
  );
  if (error) throw error;
  await admin.from('line_link_codes').delete().eq('parent_user_id', found.parent_user_id);
  await admin.from('line_link_failures').delete().eq('line_user_id', lineUserId);
  await reply(event.replyToken, LINKED_TEXT);
}

// ───────────────────────── LIFF ─────────────────────────
// Verifies a LIFF ID token with LINE (signature, expiry and audience = our LINE Login channel).
async function lineUserFromIdToken(idToken: unknown): Promise<string | null> {
  const channelId = env('LINE_LOGIN_CHANNEL_ID');
  if (!channelId || typeof idToken !== 'string' || !idToken) return null;
  const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }).toString()
  });
  if (!response.ok) return null;
  const claims = await response.json();
  return isLineUserId(claims?.sub) ? String(claims.sub) : null;
}

async function handleLiffSession(body: Record<string, any>, admin: Admin): Promise<Response> {
  const lineUserId = await lineUserFromIdToken(body.idToken);
  if (!lineUserId) return json({ error: 'LINE ยืนยันตัวตนไม่สำเร็จ กรุณาเปิดจากเมนูใน LINE อีกครั้ง' }, 401);
  const { data: links } = await admin.from('line_links').select('parent_user_id, active, linked_at').eq('line_user_id', lineUserId).eq('active', true);
  const parentIds = [...new Set((links || []).map((l) => l.parent_user_id))];
  const { data: profiles } = parentIds.length
    ? await admin.from('user_profiles').select('id, role, active').in('id', parentIds)
    : { data: [] };
  const parentId = parentForLineUser(links || [], profiles || []);
  if (!parentId) return json({ success: true, linked: false });
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(parentId);
  const email = userData?.user?.email;
  if (userError || !email) return json({ success: true, linked: false });
  // A magic-link token is only generated here (never e-mailed) and is single-use and short-lived.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return json({ error: 'สร้างการเข้าสู่ระบบไม่สำเร็จ' }, 500);
  return json({ success: true, linked: true, tokenHash });
}

// ───────────────────────── app actions ─────────────────────────
async function recipientsFor(admin: Admin, studentIds: string[]) {
  if (!studentIds.length) return new Map<string, string[]>();
  const { data: parentLinks, error: e1 } = await admin.from('parent_student_links').select('parent_user_id, student_id').in('student_id', studentIds);
  if (e1) throw e1;
  const parentIds = [...new Set((parentLinks || []).map((p) => p.parent_user_id))];
  const { data: lineLinks, error: e2 } = parentIds.length
    ? await admin.from('line_links').select('parent_user_id, line_user_id, active').in('parent_user_id', parentIds).eq('active', true)
    : { data: [], error: null };
  if (e2) throw e2;
  return recipientsByStudent(studentIds, parentLinks || [], lineLinks || []);
}

// Sends one text per student to every linked LINE user, at most once per dedupe key.
async function sendAll(admin: Admin, kind: 'absence' | 'grades', callerId: string,
  items: Array<{ studentId: string; key: string; text: string }>) {
  const summary = { students: items.length, sent: 0, alreadySent: 0, noRecipient: 0, failed: 0, quotaExceeded: false };
  if (!items.length) return summary;
  const { data: done } = await admin.from('line_notifications').select('dedupe_key').in('dedupe_key', items.map((i) => i.key)).eq('status', 'sent');
  const sentKeys = new Set((done || []).map((d) => d.dedupe_key));
  const recipients = await recipientsFor(admin, items.map((i) => i.studentId));
  for (const item of items) {
    if (sentKeys.has(item.key)) { summary.alreadySent += 1; continue; }
    const users = recipients.get(item.studentId) || [];
    let status = 'no_recipient';
    let detail = '';
    if (users.length && !summary.quotaExceeded) {
      // multicast = one request for every LINE user of this student (max 500 per call)
      const result = await lineCall('multicast', { to: users.slice(0, 500), messages: [{ type: 'text', text: item.text }] });
      status = result.ok ? 'sent' : 'failed';
      detail = result.detail;
      if (result.status === 429) summary.quotaExceeded = true;
    } else if (users.length) {
      status = 'failed';
      detail = 'skipped after LINE monthly quota was reached';
    }
    if (status === 'sent') summary.sent += 1; else if (status === 'failed') summary.failed += 1; else summary.noRecipient += 1;
    await admin.from('line_notifications').upsert(
      { kind, dedupe_key: item.key, student_id: item.studentId, recipients: status === 'sent' ? users.length : 0, status, detail: detail || null, created_by: callerId, created_at: new Date().toISOString() },
      { onConflict: 'dedupe_key' }
    );
  }
  return summary;
}

async function handleApp(request: Request, body: Record<string, any>, admin: Admin): Promise<Response> {
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const caller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false }
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);
  const { data: profile } = await admin.from('user_profiles').select('role, active').eq('id', userData.user.id).maybeSingle();
  if (!profile || profile.active !== true) return json({ error: 'Forbidden' }, 403);
  const role = String(profile.role);

  if (body.action === 'liff-link') {
    if (role !== 'parent') return json({ error: 'Forbidden' }, 403);
    const lineUserId = await lineUserFromIdToken(body.idToken);
    if (!lineUserId) return json({ error: 'LINE ยืนยันตัวตนไม่สำเร็จ กรุณาเปิดจากเมนูใน LINE อีกครั้ง' }, 401);
    const { error } = await admin.from('line_links').upsert(
      { parent_user_id: userData.user.id, line_user_id: lineUserId, active: true, linked_at: new Date().toISOString(), unlinked_at: null },
      { onConflict: 'parent_user_id,line_user_id' }
    );
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, linked: true });
  }

  const configured = Boolean(env('LINE_CHANNEL_ACCESS_TOKEN') && env('LINE_CHANNEL_SECRET'));
  const portalUrl = env('PP5_PORTAL_URL') || '';

  if (body.action === 'status') {
    let linkedParents = 0;
    if (role === 'admin' || role === 'teacher') {
      const { data } = await admin.from('line_links').select('parent_user_id').eq('active', true);
      linkedParents = new Set((data || []).map((r) => r.parent_user_id)).size;
    }
    return json({ success: true, configured, oaBasicId: env('LINE_OA_BASIC_ID') || null, linkedParents });
  }
  if (!configured) return json({ error: 'ยังไม่ได้ตั้งค่า LINE (LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET)' }, 503);

  if (body.action === 'send-absence') {
    if (role !== 'admin' && role !== 'teacher') return json({ error: 'Forbidden' }, 403);
    const date = String(body.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'วันที่ไม่ถูกต้อง' }, 400);
    const { data: rows, error } = await admin.from('attendance_daily').select('student_id, status').eq('attendance_date', date);
    if (error) return json({ error: error.message }, 500);
    let absentIds = [...new Set((rows || []).filter((r) => isAbsentStatus(r.status)).map((r) => String(r.student_id)))];
    let query = admin.from('students').select('id, first_name, grade, room').in('id', absentIds.length ? absentIds : ['-']);
    if (body.grade) query = query.eq('grade', String(body.grade));
    if (body.room) query = query.eq('room', String(body.room));
    const { data: students, error: e2 } = await query;
    if (e2) return json({ error: e2.message }, 500);
    const items = (students || []).map((s) => ({ studentId: String(s.id), key: `absence|${s.id}|${date}`, text: absenceMessage(String(s.first_name || ''), date, portalUrl) }));
    return json({ success: true, ...(await sendAll(admin, 'absence', userData.user.id, items)) });
  }

  if (body.action === 'send-grades') {
    if (role !== 'admin') return json({ error: 'Forbidden' }, 403);
    const grade = String(body.grade || '');
    const semester = String(body.semester || '');
    const year = String(body.academicYear || '');
    if (!grade || !['1', '2', 'year'].includes(semester) || !/^\d{4}$/.test(year)) return json({ error: 'กรุณาระบุชั้น ภาคเรียน และปีการศึกษา' }, 400);
    const { data: roster, error } = await admin.from('student_year_rosters').select('student_id').eq('academic_year', year).eq('grade', grade);
    if (error) return json({ error: error.message }, 500);
    const ids = [...new Set((roster || []).map((r) => String(r.student_id)))];
    const { data: students } = ids.length ? await admin.from('students').select('id, first_name').in('id', ids) : { data: [] };
    const items = (students || []).map((s) => ({ studentId: String(s.id), key: `grades|${year}|${semester}|${s.id}`, text: gradesMessage(String(s.first_name || ''), semester, year, portalUrl) }));
    return json({ success: true, ...(await sendAll(admin, 'grades', userData.user.id, items)) });
  }

  return json({ error: 'Unknown action' }, 400);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY') || !env('SUPABASE_ANON_KEY')) return json({ error: 'Function secrets are incomplete' }, 500);
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  try {
    if (request.headers.has('x-line-signature')) return await handleWebhook(request, admin);
    let body: Record<string, any>;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (body?.action === 'liff-config') return json({ success: true, liffId: env('LINE_LIFF_ID') || null });
    if (body?.action === 'liff-session') return await handleLiffSession(body, admin);
    return await handleApp(request, body || {}, admin);
  } catch (error) {
    console.error('line-notify failed', error);
    return json({ error: 'Internal error' }, 500);
  }
});
