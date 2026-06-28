// CertificaDesk — Franquicia Tributaria SENCE Migration
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'certificadesk.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('[Migration FT] Starting...');

db.exec(`
CREATE TABLE IF NOT EXISTS acciones_ft (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  empresa_rut TEXT NOT NULL,
  empresa_nombre TEXT NOT NULL,
  empresa_direccion TEXT,
  empresa_region TEXT,
  empresa_comuna TEXT,
  responsable_nombre TEXT,
  responsable_rut TEXT,
  responsable_email TEXT,
  responsable_telefono TEXT,
  tipo TEXT DEFAULT 'contrato',
  profile_id INTEGER,
  fecha_inicio DATE,
  fecha_termino DATE,
  valor_ucl REAL DEFAULT 0,
  tiene_comite_bipartito INTEGER DEFAULT 0,
  comite_programa TEXT,
  estado TEXT DEFAULT 'borrador',
  sence_id TEXT,
  ft001_generado INTEGER DEFAULT 0,
  observaciones TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS accion_ft_participantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  accion_id INTEGER NOT NULL,
  candidate_id INTEGER,
  rut TEXT NOT NULL,
  nombre TEXT NOT NULL,
  nivel_ocupacional TEXT,
  nivel_educacional TEXT,
  tramo_franquicia INTEGER DEFAULT 1,
  porcentaje_franquicia INTEGER DEFAULT 90,
  copago REAL DEFAULT 0,
  fecha_contrato DATE,
  fecha_finiquito DATE,
  resultado TEXT DEFAULT 'pendiente',
  ucls_evaluadas INTEGER DEFAULT 0,
  ucls_total INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (accion_id) REFERENCES acciones_ft(id),
  FOREIGN KEY (candidate_id) REFERENCES candidates(id)
);

CREATE TABLE IF NOT EXISTS accion_ft_documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  accion_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  nombre TEXT,
  file_path TEXT,
  file_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (accion_id) REFERENCES acciones_ft(id)
);
`);

console.log('[Migration FT] Tables created: acciones_ft, accion_ft_participantes, accion_ft_documentos');
console.log('[Migration FT] Complete!');
db.close();
