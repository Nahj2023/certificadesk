// CertificaDesk v2 — D016-01-18 Compliance Migration
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'certificadesk.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('[Migration] Starting v2 upgrade...');

// 1. New tables
db.exec(`
CREATE TABLE IF NOT EXISTS contact_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cec_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS certification_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  evaluation_id INTEGER NOT NULL,
  candidate_id INTEGER NOT NULL,
  committee_date DATE,
  members TEXT,
  evaluator_recommendation TEXT,
  audit_status TEXT DEFAULT 'sin_auditoria',
  portfolio_reviewed INTEGER DEFAULT 0,
  decision TEXT DEFAULT 'pendiente',
  justification TEXT,
  decided_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (evaluation_id) REFERENCES evaluations(id),
  FOREIGN KEY (candidate_id) REFERENCES candidates(id),
  FOREIGN KEY (decided_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS evaluator_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  evaluator_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  score_deadlines INTEGER NOT NULL,
  score_report_quality INTEGER NOT NULL,
  score_procedure_compliance INTEGER NOT NULL,
  overall_score REAL NOT NULL,
  observations TEXT,
  action_required TEXT DEFAULT 'ninguna',
  reviewed_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (evaluator_id) REFERENCES evaluators(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);
`);
console.log('[Migration] Tables created: contact_requests, certification_decisions, evaluator_reviews');

// 2. Seed ChileValora manuals if not present
const orgExists = db.prepare("SELECT id FROM organizations LIMIT 1").get();
if (orgExists) {
  const oid = orgExists.id;
  const manualCount = db.prepare("SELECT COUNT(*) as c FROM documents WHERE org_id=? AND category='manual_chilevalora'").get(oid).c;
  if (manualCount === 0) {
    const stmt = db.prepare("INSERT INTO documents (org_id, category, name, version, status) VALUES (?,?,?,?,?)");
    stmt.run(oid, 'manual_chilevalora', 'Manual del Candidato — Guia de Evaluacion y Certificacion', '1.0', 'vigente');
    stmt.run(oid, 'manual_chilevalora', 'Manual del Evaluador — Metodologia e Instrumentos', '1.0', 'vigente');
    stmt.run(oid, 'manual_chilevalora', 'Manual del Auditor — Procedimiento de Auditoria Interna', '1.0', 'vigente');
    console.log('[Migration] Seeded 3 ChileValora manuals');
  } else {
    console.log('[Migration] Manuals already exist, skipping seed');
  }
}

// 3. Add 'elegible' and 'pendiente_comite' to existing candidates status if needed
// (SQLite doesn't enforce CHECK constraints, so no ALTER needed — just update the code)

console.log('[Migration] v2 upgrade complete!');
db.close();
