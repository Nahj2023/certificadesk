-- CertificaDesk - Schema v2.0
-- SaaS para CEC ChileValora — D016-01-18 Compliant

CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  rut TEXT UNIQUE,
  address TEXT,
  region TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  plan TEXT DEFAULT 'starter',
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'coordinador',
  email TEXT,
  phone TEXT,
  active INTEGER DEFAULT 1,
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sector TEXT,
  subsector TEXT,
  version TEXT,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  rut TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  region TEXT,
  education_level TEXT,
  work_experience_years INTEGER DEFAULT 0,
  profile_id INTEGER,
  status TEXT DEFAULT 'registrado',
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS evaluators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  user_id INTEGER,
  rut TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  specialties TEXT,
  contract_type TEXT,
  djs_expiry DATE,
  habilitacion_cv TEXT,
  performance_score REAL DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  candidate_id INTEGER NOT NULL,
  profile_id INTEGER,
  evaluator_id INTEGER,
  type TEXT DEFAULT 'terreno',
  scheduled_date DATETIME,
  location TEXT,
  status TEXT DEFAULT 'programada',
  result TEXT,
  score REAL,
  observations TEXT,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (candidate_id) REFERENCES candidates(id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  FOREIGN KEY (evaluator_id) REFERENCES evaluators(id)
);

CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluation_id INTEGER NOT NULL,
  org_id INTEGER NOT NULL,
  criterion TEXT,
  type TEXT DEFAULT 'documento',
  file_path TEXT,
  file_name TEXT,
  file_size INTEGER,
  uploaded_by INTEGER,
  verified INTEGER DEFAULT 0,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (evaluation_id) REFERENCES evaluations(id),
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT DEFAULT '1.0',
  file_path TEXT,
  file_name TEXT,
  expiry_date DATE,
  status TEXT DEFAULT 'vigente',
  uploaded_by INTEGER,
  approved_by INTEGER,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  type TEXT DEFAULT 'reclamo',
  from_name TEXT,
  from_email TEXT,
  from_phone TEXT,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'abierto',
  priority TEXT DEFAULT 'media',
  assigned_to INTEGER,
  resolution TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS conflicts_of_interest (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  evaluator_id INTEGER NOT NULL,
  candidate_id INTEGER,
  evaluation_id INTEGER,
  type TEXT NOT NULL,
  description TEXT,
  declaration_date DATE,
  action_taken TEXT,
  status TEXT DEFAULT 'declarado',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (evaluator_id) REFERENCES evaluators(id)
);

CREATE TABLE IF NOT EXISTS satisfaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  evaluation_id INTEGER,
  candidate_id INTEGER,
  score_overall INTEGER,
  score_evaluator INTEGER,
  score_process INTEGER,
  score_infrastructure INTEGER,
  score_communication INTEGER,
  comments TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (evaluation_id) REFERENCES evaluations(id),
  FOREIGN KEY (candidate_id) REFERENCES candidates(id)
);

CREATE TABLE IF NOT EXISTS audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  auditor_id INTEGER,
  type TEXT DEFAULT 'interna',
  scope TEXT,
  scheduled_date DATE,
  status TEXT DEFAULT 'programada',
  findings_count INTEGER DEFAULT 0,
  non_conformities INTEGER DEFAULT 0,
  observations TEXT,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (auditor_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id INTEGER NOT NULL,
  type TEXT DEFAULT 'observacion',
  procedure_ref TEXT,
  description TEXT NOT NULL,
  corrective_action TEXT,
  status TEXT DEFAULT 'abierto',
  due_date DATE,
  closed_at DATETIME,
  FOREIGN KEY (audit_id) REFERENCES audits(id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  period TEXT,
  title TEXT,
  data_json TEXT,
  generated_by INTEGER,
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (generated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS records_control (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  code TEXT,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'evaluacion',
  procedure_ref TEXT,
  format TEXT DEFAULT 'digital',
  location TEXT,
  responsible_id INTEGER,
  retention_years INTEGER DEFAULT 5,
  retention_date DATE,
  access_level TEXT DEFAULT 'interno',
  status TEXT DEFAULT 'vigente',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (responsible_id) REFERENCES users(id)
);

-- v2: D016-01-18 Compliance tables

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

-- v2.1: Franquicia Tributaria SENCE tables

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

-- v3.0: Formularios de Evaluacion ChileValora

CREATE TABLE IF NOT EXISTS evaluation_forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  weight INTEGER DEFAULT 0,
  description TEXT,
  items_json TEXT NOT NULL,
  is_template INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evaluation_form_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  evaluation_id INTEGER NOT NULL,
  form_id INTEGER NOT NULL,
  responses_json TEXT NOT NULL DEFAULT '{}',
  score REAL,
  status TEXT DEFAULT 'borrador',
  filled_by INTEGER,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (evaluation_id) REFERENCES evaluations(id),
  FOREIGN KEY (form_id) REFERENCES evaluation_forms(id),
  FOREIGN KEY (filled_by) REFERENCES users(id)
);

-- v3.1: Agentes IA

CREATE TABLE IF NOT EXISTS ai_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  description TEXT,
  system_prompt TEXT NOT NULL,
  tools_enabled TEXT,
  model TEXT DEFAULT 'llama-3.3-70b-versatile',
  temperature REAL DEFAULT 0.3,
  max_tokens INTEGER DEFAULT 2048,
  roles_allowed TEXT DEFAULT '["admin","responsable","evaluador","consulta"]',
  is_public INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL,
  user_id INTEGER,
  agent_id INTEGER NOT NULL,
  title TEXT,
  context_path TEXT,
  context_data TEXT,
  pinned INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES ai_agents(id)
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT,
  tool_results TEXT,
  tokens_used INTEGER,
  is_favorite INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
);
