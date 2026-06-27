const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const DB_PATH = path.join(__dirname, "..", "certificadesk.db");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema() {
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  db.exec(schema);

  const orgCount = db.prepare("SELECT COUNT(*) as c FROM organizations").get().c;
  if (orgCount === 0) {
    seedDefaults();
  }
}

function seedDefaults() {
  const hash = bcrypt.hashSync("admin2026", 10);

  db.prepare(`INSERT INTO organizations (name, rut, region, email, plan)
    VALUES (?, ?, ?, ?, ?)`).run(
    "CEC Demo", "76.000.000-0", "Metropolitana", "demo@certificadesk.cl", "professional"
  );

  db.prepare(`INSERT INTO users (org_id, username, password, display_name, role, email)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    1, "admin", hash, "Administrador", "responsable", "admin@certificadesk.cl"
  );

  const profiles = [
    ["UCL0001", "Operador de Maquinaria Pesada", "Minería", "Extracción"],
    ["UCL0002", "Soldador por Arco Manual", "Manufactura", "Metalmecánica"],
    ["UCL0003", "Electricista de Instalaciones Domiciliarias", "Construcción", "Instalaciones"],
    ["UCL0004", "Guía de Turismo Aventura", "Turismo", "Actividades"],
    ["UCL0005", "Operador de Grúa Horquilla", "Logística", "Transporte"],
  ];
  const stmt = db.prepare("INSERT INTO profiles (code, name, sector, subsector) VALUES (?,?,?,?)");
  for (const p of profiles) stmt.run(...p);

  console.log("[DB] Seed: org demo + admin + 5 perfiles");
}

function logActivity(orgId, userId, action, entityType, entityId, details) {
  getDb().prepare(
    "INSERT INTO activity_log (org_id, user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?,?)"
  ).run(orgId, userId, action, entityType, entityId, details || null);
}

module.exports = { getDb, logActivity };
