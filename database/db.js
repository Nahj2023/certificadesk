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

  const orgCount = db
    .prepare("SELECT COUNT(*) as c FROM organizations")
    .get().c;
  if (orgCount === 0) {
    seedDefaults();
  }
  seedManuals();
  migrateColumns();
}

function seedDefaults() {
  const hash = bcrypt.hashSync("admin2026", 10);

  db.prepare(
    `INSERT INTO organizations (name, rut, region, email, plan)
    VALUES (?, ?, ?, ?, ?)`
  ).run(
    "CEC Demo",
    "76.000.000-0",
    "Metropolitana",
    "demo@certificadesk.cl",
    "professional"
  );

  db.prepare(
    `INSERT INTO users (org_id, username, password, display_name, role, email)
    VALUES (?, ?, ?, ?, ?, ?)`
  ).run(1, "admin", hash, "Administrador", "admin", "admin@certificadesk.cl");

  const profiles = [
    ["UCL0001", "Operador de Maquinaria Pesada", "Mineria", "Extraccion"],
    ["UCL0002", "Soldador por Arco Manual", "Manufactura", "Metalmecanica"],
    [
      "UCL0003",
      "Electricista de Instalaciones Domiciliarias",
      "Construccion",
      "Instalaciones",
    ],
    ["UCL0004", "Guia de Turismo Aventura", "Turismo", "Actividades"],
    ["UCL0005", "Operador de Grua Horquilla", "Logistica", "Transporte"],
  ];
  const stmt = db.prepare(
    "INSERT INTO profiles (code, name, sector, subsector) VALUES (?,?,?,?)"
  );
  for (const p of profiles) stmt.run(...p);

  console.log("[DB] Seed: org demo + admin + 5 perfiles");
}

function seedManuals() {
  const org = db.prepare("SELECT id FROM organizations LIMIT 1").get();
  if (!org) return;
  const count = db
    .prepare(
      "SELECT COUNT(*) as c FROM documents WHERE org_id=? AND category='manual_chilevalora'"
    )
    .get(org.id).c;
  if (count >= 3) return;

  const stmt = db.prepare(
    "INSERT INTO documents (org_id, category, name, version, status) VALUES (?,?,?,?,?)"
  );
  const manuals = [
    "Manual del Candidato — Guia de Evaluacion y Certificacion",
    "Manual del Evaluador — Metodologia e Instrumentos",
    "Manual del Auditor — Procedimiento de Auditoria Interna",
  ];
  for (const m of manuals) {
    const exists = db
      .prepare(
        "SELECT id FROM documents WHERE org_id=? AND category='manual_chilevalora' AND name=?"
      )
      .get(org.id, m);
    if (!exists) stmt.run(org.id, "manual_chilevalora", m, "1.0", "vigente");
  }
  console.log("[DB] Manuales ChileValora verificados");
}

function migrateColumns() {
  const migrations = [
    ["users", "token_version", "ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1"],
    ["activity_log", "ip", "ALTER TABLE activity_log ADD COLUMN ip TEXT"],
    ["candidates", "consent_given", "ALTER TABLE candidates ADD COLUMN consent_given INTEGER DEFAULT 0"],
    ["candidates", "consent_date", "ALTER TABLE candidates ADD COLUMN consent_date DATETIME"],
    ["candidates", "consent_ip", "ALTER TABLE candidates ADD COLUMN consent_ip TEXT"],
    ["candidates", "anonymized", "ALTER TABLE candidates ADD COLUMN anonymized INTEGER DEFAULT 0"],
    ["organizations", "retention_years", "ALTER TABLE organizations ADD COLUMN retention_years INTEGER DEFAULT 5"],
  ];

  for (const [table, col, sql] of migrations) {
    try {
      db.prepare(`SELECT ${col} FROM ${table} LIMIT 1`).get();
    } catch {
      db.exec(sql);
      console.log(`[DB] Migración: ${table}.${col} añadido`);
    }
  }

  db.exec(`CREATE TABLE IF NOT EXISTS arco_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER,
    type TEXT NOT NULL,
    requester_name TEXT NOT NULL,
    requester_rut TEXT,
    requester_email TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pendiente',
    response TEXT,
    responded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS data_treatment_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    fields_accessed TEXT,
    purpose TEXT,
    ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

function logActivity(orgId, userId, action, entityType, entityId, details, ip) {
  getDb()
    .prepare(
      "INSERT INTO activity_log (org_id, user_id, action, entity_type, entity_id, details, ip) VALUES (?,?,?,?,?,?,?)"
    )
    .run(orgId, userId, action, entityType, entityId, details || null, ip || null);
}

function logDataTreatment(orgId, userId, action, entityType, entityId, fields, purpose, ip) {
  getDb()
    .prepare(
      "INSERT INTO data_treatment_log (org_id, user_id, action, entity_type, entity_id, fields_accessed, purpose, ip) VALUES (?,?,?,?,?,?,?,?)"
    )
    .run(orgId, userId, action, entityType, entityId, fields || null, purpose || null, ip || null);
}

module.exports = { getDb, logActivity, logDataTreatment };
