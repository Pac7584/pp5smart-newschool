// ค่าตั้งของโรงเรียน — ไฟล์เดียวที่ต้องแก้หลังติดตั้ง (ดู docs/ติดตั้ง.md)
// ทุกค่าในไฟล์นี้เปิดเผยได้: anon key เป็นคีย์สาธารณะของ Supabase (สิทธิ์จริงคุมด้วย RLS ในฐานข้อมูล)
// ห้ามใส่ service_role key, รหัสผ่าน หรือ secret ใด ๆ ในไฟล์นี้
window.PP5_CONFIG = {
  // Supabase > Project Settings > API: Project URL และ anon public key
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-PUBLIC-KEY',
  // ที่อยู่เว็บที่ส่งให้ผู้ปกครอง เช่น https://pp5.your-school.ac.th (เว้นว่าง = ใช้ที่อยู่ที่เปิดเว็บอยู่)
  siteUrl: '',
  // ชื่อผู้ใช้สั้น -> อีเมลเข้าระบบ (ไม่บังคับ) เช่น { admin: 'admin@your-school.ac.th' }
  loginAliases: {},
  // นำเข้าคะแนนจากระบบห้องสอบดิจิทัล (ไม่บังคับ) null = ไม่ใช้
  examImport: null
};
