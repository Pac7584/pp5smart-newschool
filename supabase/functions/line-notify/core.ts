// Pure helpers for the line-notify Edge Function. No imports, no I/O, so the same file runs
// under Deno (the function) and Node (tools/line-notify-contract.mjs).

export const LINK_CODE_TTL_MINUTES = 15;
export const MAX_LINK_FAILURES = 5;
export const ABSENT_STATUSES = ['absent', 'ขาด', 'ข', '0'];

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

// LINE signs the raw request body with HMAC-SHA256(channel secret), base64 in x-line-signature.
export async function verifyLineSignature(channelSecret: string, rawBody: string, signature: string | null): Promise<boolean> {
  if (!channelSecret || !signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(channelSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const expected = base64FromBytes(mac);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

// Accepts "123456", "123 456", Thai digits; anything else is not a code.
export function parseLinkCode(text: unknown): string | null {
  const thai = '๐๑๒๓๔๕๖๗๘๙';
  const normalized = String(text ?? '')
    .replace(/[๐-๙]/g, (d) => String(thai.indexOf(d)))
    .replace(/[\s-]/g, '');
  return /^[0-9]{6}$/.test(normalized) ? normalized : null;
}

export function isLineUserId(value: unknown): boolean {
  return /^U[0-9a-f]{32}$/.test(String(value ?? ''));
}

export function isAbsentStatus(value: unknown): boolean {
  return ABSENT_STATUSES.includes(String(value ?? '').trim().toLowerCase());
}

export function thaiDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) return String(iso);
  return `${Number(m[3])} ${THAI_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
}

// The failure window: more than MAX_LINK_FAILURES wrong codes inside one hour locks the LINE user.
export function linkAttemptBlocked(row: { failures?: number; window_start?: string } | null, now = new Date()): boolean {
  if (!row) return false;
  const started = new Date(String(row.window_start || 0)).getTime();
  if (now.getTime() - started > 60 * 60 * 1000) return false;
  return Number(row.failures || 0) >= MAX_LINK_FAILURES;
}

export function nextFailureRow(row: { failures?: number; window_start?: string } | null, now = new Date()) {
  const started = row ? new Date(String(row.window_start || 0)).getTime() : 0;
  const fresh = !row || now.getTime() - started > 60 * 60 * 1000;
  return { failures: fresh ? 1 : Number(row!.failures || 0) + 1, window_start: fresh ? now.toISOString() : String(row!.window_start) };
}

// Messages carry the child's first name and what happened — never scores or ID numbers —
// and point to the login-protected parent portal.
export function absenceMessage(firstName: string, dateIso: string, portalUrl: string): string {
  return [
    `แจ้งจากโรงเรียน: ${firstName || 'บุตรของท่าน'} ไม่มาเรียนวันที่ ${thaiDate(dateIso)}`,
    'หากลาป่วยหรือลากิจ กรุณาแจ้งครูประจำชั้น',
    `ดูเวลาเรียน: ${portalUrl}`
  ].join('\n');
}

export function gradesMessage(firstName: string, semester: string, academicYear: string, portalUrl: string): string {
  const term = semester === 'year' ? 'ทั้งปีการศึกษา' : `ภาคเรียนที่ ${semester}`;
  return [
    `ผลการเรียน${term} ปีการศึกษา ${academicYear} ของ ${firstName || 'บุตรของท่าน'} ออกแล้ว`,
    `ดูได้ที่: ${portalUrl} (เข้าสู่ระบบด้วยบัญชีผู้ปกครอง)`
  ].join('\n');
}

export const WELCOME_TEXT = 'ขอบคุณที่เพิ่มเพื่อนกับโรงเรียน\nถ้าต้องการรับแจ้งเตือนเรื่องบุตรหลาน ให้เข้าหน้าผู้ปกครองในระบบ ปพ.5 กด "เชื่อม LINE" แล้วพิมพ์รหัส 6 หลักที่ได้ลงในแชทนี้';
export const LINKED_TEXT = 'เชื่อมบัญชีเรียบร้อยแล้ว ✅\nจะได้รับแจ้งเมื่อบุตรหลานขาดเรียน และเมื่อผลการเรียนออก\nยกเลิกได้ที่หน้าผู้ปกครอง หรือบล็อกบัญชีนี้';
export const BAD_CODE_TEXT = 'รหัสไม่ถูกต้องหรือหมดอายุ (รหัสใช้ได้ 15 นาที) กรุณากด "เชื่อม LINE" ในหน้าผู้ปกครองเพื่อขอรหัสใหม่';
export const BLOCKED_TEXT = 'พิมพ์รหัสผิดหลายครั้ง กรุณาลองใหม่ในอีก 1 ชั่วโมง';
export const HELP_TEXT = 'บัญชีนี้ใช้แจ้งเตือนผู้ปกครองจากระบบ ปพ.5\nเชื่อมบัญชี: เข้าหน้าผู้ปกครอง กด "เชื่อม LINE" แล้วพิมพ์รหัส 6 หลักลงในแชทนี้';

// LIFF auto sign-in: the parent account to open for a LINE user = the most recently linked
// ACTIVE link whose account is an active parent. Anything else (teacher/admin/inactive) never
// gets a session through LINE.
export function parentForLineUser(
  links: Array<{ parent_user_id: string; active?: boolean; linked_at?: string }>,
  profiles: Array<{ id: string; role?: string; active?: boolean }>
): string | null {
  const okParent = new Set(profiles.filter((p) => p.role === 'parent' && p.active === true).map((p) => p.id));
  const candidates = links
    .filter((l) => l.active !== false && okParent.has(l.parent_user_id))
    .sort((a, b) => String(b.linked_at || '').localeCompare(String(a.linked_at || '')));
  return candidates.length ? candidates[0].parent_user_id : null;
}

// Groups LINE user ids per student: students -> parent_student_links -> active line_links.
export function recipientsByStudent(
  studentIds: string[],
  parentLinks: Array<{ parent_user_id: string; student_id: string }>,
  lineLinks: Array<{ parent_user_id: string; line_user_id: string; active?: boolean }>
): Map<string, string[]> {
  const lineByParent = new Map<string, Set<string>>();
  lineLinks.filter((l) => l.active !== false && isLineUserId(l.line_user_id)).forEach((l) => {
    if (!lineByParent.has(l.parent_user_id)) lineByParent.set(l.parent_user_id, new Set());
    lineByParent.get(l.parent_user_id)!.add(l.line_user_id);
  });
  const out = new Map<string, string[]>();
  studentIds.forEach((id) => {
    const users = new Set<string>();
    parentLinks.filter((p) => String(p.student_id) === String(id)).forEach((p) => {
      (lineByParent.get(p.parent_user_id) || new Set()).forEach((u) => users.add(u));
    });
    out.set(String(id), [...users]);
  });
  return out;
}
