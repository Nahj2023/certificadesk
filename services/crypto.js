const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";

function getKey() {
  if (!process.env.ENCRYPTION_KEY) {
    console.error("[FATAL] ENCRYPTION_KEY no configurado en .env");
    process.exit(1);
  }
  return Buffer.from(process.env.ENCRYPTION_KEY, "hex");
}

function encrypt(text) {
  if (!text) return null;
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(String(text), "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

function decrypt(ciphertext) {
  if (!ciphertext || !ciphertext.includes(":")) return ciphertext;
  try {
    const [ivB64, tagB64, data] = ciphertext.split(":");
    const key = getKey();
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(tagB64, "base64");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(data, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return ciphertext;
  }
}

function decryptRecord(record, fields) {
  if (!record) return record;
  const result = { ...record };
  for (const f of fields) {
    if (result[f]) result[f] = decrypt(result[f]);
  }
  return result;
}

function decryptAll(records, fields) {
  return records.map((r) => decryptRecord(r, fields));
}

function anonymize(text) {
  if (!text) return null;
  return crypto.createHash("sha256").update(String(text)).digest("hex").slice(0, 16);
}

module.exports = { encrypt, decrypt, decryptRecord, decryptAll, anonymize };
