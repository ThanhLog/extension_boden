/**
 * decrypt.js — Giải mã project.enc, khôi phục toàn bộ source code
 *
 * Cách dùng:
 *   node decrypt.js <mật-khẩu> [project.enc]
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DEFAULT_INPUT = path.join(ROOT, 'project.enc');
const OUTPUT_DIR = path.join(ROOT, 'decrypted');

function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('❌ Vui lòng nhập mật khẩu: node decrypt.js <mật-khẩu> [file.enc]');
    process.exit(1);
  }

  const inputFile = process.argv[3] || DEFAULT_INPUT;
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Không tìm thấy file: ${inputFile}`);
    process.exit(1);
  }

  console.log('📖 Đang đọc file mã hóa...');
  const raw = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

  const salt = Buffer.from(raw.salt, 'base64');
  const iv = Buffer.from(raw.iv, 'base64');
  const encrypted = Buffer.from(raw.data, 'base64');

  console.log('🔑 Đang giải mã...');
  let key;
  try {
    key = crypto.scryptSync(password, salt, 32);
  } catch (e) {
    console.error('❌ Lỗi tạo key:', e.message);
    process.exit(1);
  }

  let decrypted;
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch (e) {
    console.error('❌ Giải mã thất bại — sai mật khẩu hoặc file hỏng!');
    process.exit(1);
  }

  const bundle = JSON.parse(decrypted.toString('utf8'));
  const fileCount = Object.keys(bundle).length;
  console.log(`   Tìm thấy ${fileCount} file`);

  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }

  for (const [rel, b64] of Object.entries(bundle)) {
    const outPath = path.join(OUTPUT_DIR, rel);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
    console.log(`   ✓ ${rel}`);
  }

  console.log(`\n✅ Đã giải mã → ${OUTPUT_DIR}/`);
  console.log('💡 Sau đó copy thủ công vào thư mục gốc nếu cần.');
}

main();
