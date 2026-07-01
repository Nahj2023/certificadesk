require("dotenv").config();
const db = require('better-sqlite3')('certificadesk.db');
const crypto = require('./services/crypto');

const enc = (v) => { try { return crypto.encrypt(v); } catch(e) { return v; } };

// ══════════════════════════════════════
// CANDIDATES (12)
// ══════════════════════════════════════
const candidates = [
  { name: 'Carlos Muñoz Vega', rut: '12.345.678-9', email: 'carlos.munoz@email.cl', phone: '+56912345678', region: 'Metropolitana', education: 'media_completa', exp: 8, profile: 1, status: 'en_evaluacion' },
  { name: 'Ana Soto Bravo', rut: '13.456.789-0', email: 'ana.soto@email.cl', phone: '+56913456789', region: 'Valparaiso', education: 'tecnico', exp: 5, profile: 2, status: 'certificado' },
  { name: 'Pedro Riquelme Lagos', rut: '14.567.890-1', email: 'pedro.riquelme@email.cl', phone: '+56914567890', region: 'Biobio', education: 'media_completa', exp: 12, profile: 3, status: 'certificado' },
  { name: 'María Fernández Díaz', rut: '15.678.901-2', email: 'maria.fernandez@email.cl', phone: '+56915678901', region: 'Metropolitana', education: 'tecnico', exp: 3, profile: 1, status: 'en_evaluacion' },
  { name: 'Jorge Tapia Contreras', rut: '16.789.012-3', email: 'jorge.tapia@email.cl', phone: '+56916789012', region: 'Araucania', education: 'universitaria', exp: 15, profile: 4, status: 'certificado' },
  { name: 'Claudia Morales Ruiz', rut: '17.890.123-4', email: 'claudia.morales@email.cl', phone: '+56917890123', region: 'OHiggins', education: 'media_completa', exp: 6, profile: 5, status: 'en_evaluacion' },
  { name: 'Roberto Henríquez Pinto', rut: '18.901.234-5', email: 'roberto.h@email.cl', phone: '+56918901234', region: 'Metropolitana', education: 'tecnico', exp: 10, profile: 2, status: 'certificado' },
  { name: 'Daniela Campos Sáez', rut: '19.012.345-6', email: 'daniela.campos@email.cl', phone: '+56919012345', region: 'Valparaiso', education: 'media_completa', exp: 4, profile: 3, status: 'no_competente' },
  { name: 'Andrés Villalobos Mena', rut: '20.123.456-7', email: 'andres.v@email.cl', phone: '+56920123456', region: 'Los Lagos', education: 'universitaria', exp: 7, profile: 4, status: 'registrado' },
  { name: 'Francisca Reyes Olivares', rut: '21.234.567-8', email: 'francisca.r@email.cl', phone: '+56921234567', region: 'Metropolitana', education: 'tecnico', exp: 9, profile: 5, status: 'en_evaluacion' },
  { name: 'Luis Araya Guzmán', rut: '22.345.678-9', email: 'luis.araya@email.cl', phone: '+56922345678', region: 'Coquimbo', education: 'media_completa', exp: 11, profile: 1, status: 'certificado' },
  { name: 'Valentina Parra Muñoz', rut: '23.456.789-0', email: 'valentina.p@email.cl', phone: '+56923456789', region: 'Maule', education: 'tecnico', exp: 2, profile: 3, status: 'registrado' },
];

const insertCandidate = db.prepare(`INSERT INTO candidates (org_id, rut, name, email, phone, region, education_level, work_experience_years, profile_id, status, charla_informativa, entrevista_inicial, carta_compromiso, consent_given, consent_date, created_at) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,1,1,datetime('now'),datetime('now'))`);

const candidateIds = [];
for (const c of candidates) {
  try {
    const r = insertCandidate.run(enc(c.rut), c.name, enc(c.email), enc(c.phone), c.region, c.education, c.exp, c.profile, c.status, '2026-04-01', '2026-04-05');
    candidateIds.push(r.lastInsertRowid);
  } catch(e) { candidateIds.push(null); console.log('Skip candidate:', c.name, e.message); }
}
console.log('Candidates inserted:', candidateIds.filter(Boolean).length);

// ══════════════════════════════════════
// EVALUATORS (3 more)
// ══════════════════════════════════════
const evaluators = [
  { name: 'Patricia Arce Molina', rut: '10.111.222-3', email: 'p.arce@evaluadores.cl', phone: '+56910111222', spec: 'Soldadura, Maquinaria Pesada', contract: 'honorarios', djs: '2027-03-15', hab: 'HAB-2024-0892' },
  { name: 'Ricardo Fuentes Cáceres', rut: '10.222.333-4', email: 'r.fuentes@evaluadores.cl', phone: '+56910222333', spec: 'Electricidad Industrial, Grúas', contract: 'honorarios', djs: '2026-09-30', hab: 'HAB-2023-1205' },
];

const insertEvaluator = db.prepare(`INSERT INTO evaluators (org_id, rut, name, email, phone, specialties, contract_type, djs_expiry, habilitacion_cv, performance_score) VALUES (1,?,?,?,?,?,?,?,?,?)`);
for (const ev of evaluators) {
  try {
    insertEvaluator.run(enc(ev.rut), ev.name, enc(ev.email), enc(ev.phone), ev.spec, ev.contract, ev.djs, ev.hab, (Math.random() * 2 + 3).toFixed(1));
  } catch(e) { console.log('Skip evaluator:', ev.name, e.message); }
}
console.log('Evaluators: done');

// Get all evaluator IDs
const allEvaluators = db.prepare("SELECT id FROM evaluators WHERE org_id=1").all().map(r => r.id);

// ══════════════════════════════════════
// EVALUATIONS (15)
// ══════════════════════════════════════
const evalData = [
  { cand: 0, profile: 1, eval: 0, date: '2026-04-15', status: 'completada', result: 'competente', sk: 82, sj: 78, st: 85, se: 80 },
  { cand: 1, profile: 2, eval: 0, date: '2026-04-20', status: 'completada', result: 'competente', sk: 75, sj: 88, st: 90, se: 72 },
  { cand: 2, profile: 3, eval: 1, date: '2026-05-02', status: 'completada', result: 'competente', sk: 90, sj: 85, st: 92, se: 88 },
  { cand: 3, profile: 1, eval: 1, date: '2026-05-10', status: 'en_proceso', result: null, sk: 70, sj: null, st: null, se: null },
  { cand: 4, profile: 4, eval: 0, date: '2026-05-15', status: 'completada', result: 'competente', sk: 88, sj: 92, st: 95, se: 85 },
  { cand: 5, profile: 5, eval: 1, date: '2026-05-20', status: 'en_proceso', result: null, sk: 65, sj: 72, st: null, se: null },
  { cand: 6, profile: 2, eval: 0, date: '2026-05-25', status: 'completada', result: 'competente', sk: 78, sj: 82, st: 88, se: 76 },
  { cand: 7, profile: 3, eval: 1, date: '2026-06-01', status: 'completada', result: 'aun_no_competente', sk: 55, sj: 60, st: 58, se: 52 },
  { cand: 8, profile: 4, eval: 0, date: '2026-06-10', status: 'programada', result: null, sk: null, sj: null, st: null, se: null },
  { cand: 9, profile: 5, eval: 1, date: '2026-06-15', status: 'programada', result: null, sk: null, sj: null, st: null, se: null },
  { cand: 10, profile: 1, eval: 0, date: '2026-06-05', status: 'completada', result: 'competente', sk: 85, sj: 80, st: 88, se: 82 },
  { cand: 0, profile: 1, eval: 1, date: '2026-06-20', status: 'programada', result: null, sk: null, sj: null, st: null, se: null },
  { cand: 11, profile: 3, eval: 0, date: '2026-06-25', status: 'programada', result: null, sk: null, sj: null, st: null, se: null },
  { cand: 1, profile: 2, eval: 1, date: '2026-06-12', status: 'completada', result: 'competente', sk: 80, sj: 85, st: 88, se: 78 },
  { cand: 7, profile: 3, eval: 0, date: '2026-06-18', status: 'en_proceso', result: null, sk: 68, sj: 70, st: null, se: null },
];

const insertEval = db.prepare(`INSERT INTO evaluations (org_id, candidate_id, profile_id, evaluator_id, scheduled_date, status, result, score_conocimientos, score_jefe_directo, score_terreno, score_evidencias, score_ponderado, completed_at, created_at) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`);

let evalCount = 0;
for (const e of evalData) {
  const candId = candidateIds[e.cand];
  if (!candId) continue;
  const evalId = allEvaluators[e.eval % allEvaluators.length];
  let ponderado = null;
  if (e.sk !== null) {
    const w = [0.20, 0.25, 0.30, 0.25];
    const v = [e.sk, e.sj, e.st, e.se];
    let sum = 0, ws = 0;
    v.forEach((val, i) => { if (val !== null) { sum += val * w[i]; ws += w[i]; } });
    ponderado = ws > 0 ? sum / ws : null;
  }
  const completed = e.status === 'completada' ? e.date : null;
  try {
    insertEval.run(candId, e.profile, evalId, e.date, e.status, e.result, e.sk, e.sj, e.st, e.se, ponderado, completed);
    evalCount++;
  } catch(err) { console.log('Skip eval:', err.message); }
}
console.log('Evaluations inserted:', evalCount);

// ══════════════════════════════════════
// AUDITS (3) + FINDINGS (6)
// ══════════════════════════════════════
const insertAudit = db.prepare(`INSERT INTO audits (org_id, auditor_id, type, scope, scheduled_date, status, findings_count, non_conformities, observations, completed_at, created_at) VALUES (1,?,?,?,?,?,?,?,?,?,datetime('now'))`);
const insertFinding = db.prepare(`INSERT INTO audit_findings (audit_id, type, procedure_ref, description, corrective_action, status, due_date) VALUES (?,?,?,?,?,?,?)`);

const a1 = insertAudit.run(1, 'interna', 'Procedimientos 1-4', '2026-04-10', 'completada', 3, 1, 'Auditoría semestral completa. Se revisaron 4 procedimientos.', '2026-04-10').lastInsertRowid;
insertFinding.run(a1, 'no_conformidad', 'P1 - Certificación', 'Evaluaciones sin firma del candidato en carta compromiso', 'Implementar firma digital obligatoria en formulario de inscripción', 'cerrado', '2026-05-10');
insertFinding.run(a1, 'observacion', 'P3 - Evaluadores', 'DJS de 1 evaluador próxima a vencer sin alerta registrada', 'Configurar alertas automáticas 30 días antes del vencimiento', 'cerrado', '2026-05-15');
insertFinding.run(a1, 'observacion', 'P4 - Reclamos', 'Canal de reclamos sin difusión a candidatos', 'Incluir información del canal en charla informativa', 'cerrado', '2026-05-20');

const a2 = insertAudit.run(1, 'interna', 'Procedimientos 5-8', '2026-06-15', 'completada', 2, 0, 'Auditoría de seguimiento. Sin no conformidades.', '2026-06-15').lastInsertRowid;
insertFinding.run(a2, 'observacion', 'P6 - Documentos', 'Documentos sin fecha de última revisión visible', 'Agregar campo de fecha de revisión en lista maestra', 'abierto', '2026-07-15');
insertFinding.run(a2, 'oportunidad_mejora', 'P8 - Satisfacción', 'Encuestas realizadas solo post-certificación, no post-evaluación', 'Extender encuesta a todos los candidatos evaluados', 'abierto', '2026-08-01');

const a3 = insertAudit.run(1, 'seguimiento', 'Seguimiento hallazgos abril', '2026-07-10', 'programada', 0, 0, null, null).lastInsertRowid;

console.log('Audits:', 3, 'Findings:', 6);

// ══════════════════════════════════════
// EVIDENCE (8)
// ══════════════════════════════════════
const allEvals = db.prepare("SELECT id FROM evaluations WHERE org_id=1 AND status IN ('completada','en_proceso') ORDER BY id").all();
const insertEvidence = db.prepare(`INSERT INTO evidence (evaluation_id, org_id, criterion, type, file_path, file_name, file_size, uploaded_by, verified, uploaded_at) VALUES (?,1,?,?,?,?,?,1,?,datetime('now'))`);

const evidenceData = [
  { criterion: 'UCL1 - Criterio 1.1', type: 'foto', name: 'operacion-maquinaria-01.jpg', size: 2450000, verified: 1 },
  { criterion: 'UCL1 - Criterio 1.2', type: 'documento', name: 'certificado-capacitacion-2024.pdf', size: 890000, verified: 1 },
  { criterion: 'UCL1 - Criterio 2.1', type: 'video', name: 'evaluacion-terreno-soldadura.mp4', size: 15200000, verified: 1 },
  { criterion: 'UCL2 - Criterio 1.1', type: 'informe', name: 'informe-jefe-directo.pdf', size: 340000, verified: 1 },
  { criterion: 'UCL1 - Criterio 3.1', type: 'foto', name: 'evidencia-epp-uso.jpg', size: 1800000, verified: 0 },
  { criterion: 'UCL2 - Criterio 2.2', type: 'planilla', name: 'registro-horas-practica.xlsx', size: 125000, verified: 0 },
  { criterion: 'UCL1 - Criterio 1.3', type: 'documento', name: 'licencia-clase-d.pdf', size: 560000, verified: 1 },
  { criterion: 'UCL3 - Criterio 1.1', type: 'certificado', name: 'curso-seguridad-electrica.pdf', size: 720000, verified: 1 },
];

let evCount = 0;
for (let i = 0; i < evidenceData.length && i < allEvals.length; i++) {
  const ev = evidenceData[i];
  try {
    insertEvidence.run(allEvals[i % allEvals.length].id, ev.criterion, ev.type, '/uploads/evidence/' + ev.name, ev.name, ev.size, ev.verified);
    evCount++;
  } catch(e) { console.log('Skip evidence:', e.message); }
}
console.log('Evidence inserted:', evCount);

// ══════════════════════════════════════
// COMPLAINTS (3)
// ══════════════════════════════════════
const insertComplaint = db.prepare(`INSERT INTO complaints (org_id, type, complainant_name, complainant_email, subject, description, status, priority, created_at) VALUES (1,?,?,?,?,?,?,?,datetime('now',?))`);
try {
  insertComplaint.run('reclamo', 'Manuel Ortiz', enc('m.ortiz@email.cl'), 'Demora en entrega de certificado', 'Han pasado 3 semanas desde la evaluación y aún no recibo el certificado físico.', 'en_investigacion', 'media', '-15 days');
  insertComplaint.run('sugerencia', 'Ana Soto Bravo', enc('ana.soto@email.cl'), 'Horarios de evaluación', 'Sería útil ofrecer evaluaciones en horario vespertino para trabajadores con turno diurno.', 'resuelto', 'baja', '-30 days');
  insertComplaint.run('felicitacion', 'Jorge Tapia', enc('jorge.tapia@email.cl'), 'Excelente proceso', 'Quiero felicitar al evaluador por la claridad en las instrucciones y el trato profesional.', 'cerrado', 'baja', '-20 days');
  console.log('Complaints: 3');
} catch(e) { console.log('Complaints error:', e.message); }

// ══════════════════════════════════════
// CONFLICTS OF INTEREST (2)
// ══════════════════════════════════════
const insertConflict = db.prepare(`INSERT INTO conflicts_of_interest (org_id, evaluator_id, candidate_id, type, description, declaration_date, status) VALUES (1,?,?,?,?,?,?)`);
try {
  insertConflict.run(allEvaluators[0], candidateIds[3], 'familiar', 'Candidata es prima segunda del evaluador', '2026-05-08', 'resuelto');
  insertConflict.run(allEvaluators[1] || allEvaluators[0], candidateIds[6], 'laboral', 'Trabajé con el candidato en empresa anterior hace 2 años', '2026-05-20', 'declarado');
  console.log('Conflicts: 2');
} catch(e) { console.log('Conflicts error:', e.message); }

// ══════════════════════════════════════
// EVALUATOR REVIEWS (4)
// ══════════════════════════════════════
const insertReview = db.prepare(`INSERT INTO evaluator_reviews (evaluator_id, org_id, period, score_deadlines, score_report_quality, score_procedure_compliance, created_at) VALUES (?,1,?,?,?,?,datetime('now'))`);
for (const evId of allEvaluators) {
  try {
    insertReview.run(evId, 'Q1 2026', 4, 5, 4, );
    insertReview.run(evId, 'Q2 2026', 5, 4, 5);
  } catch(e) {}
}
console.log('Reviews: done');

// ══════════════════════════════════════
// DOCUMENTS (5)
// ══════════════════════════════════════
try {
  const insertDoc = db.prepare(`INSERT INTO documents (org_id, title, category, version, status, file_path, file_name, uploaded_by, created_at) VALUES (1,?,?,?,?,?,?,1,datetime('now',?))`);
  insertDoc.run('Manual de Calidad CEC', 'manual', '3.0', 'vigente', '/docs/manual-calidad-v3.pdf', 'manual-calidad-v3.pdf', '-60 days');
  insertDoc.run('Procedimiento P1 - Certificación', 'procedimiento', '2.1', 'vigente', '/docs/p1-certificacion.pdf', 'p1-certificacion.pdf', '-45 days');
  insertDoc.run('Formato Informe de Brechas', 'formato', '1.2', 'vigente', '/docs/formato-informe-brechas.docx', 'formato-informe-brechas.docx', '-30 days');
  insertDoc.run('Política de Conflictos de Interés', 'politica', '1.0', 'vigente', '/docs/politica-conflictos.pdf', 'politica-conflictos.pdf', '-90 days');
  insertDoc.run('Instructivo Evaluación en Terreno', 'instructivo', '1.1', 'en_revision', '/docs/instructivo-terreno.pdf', 'instructivo-terreno.pdf', '-10 days');
  console.log('Documents: 5');
} catch(e) { console.log('Documents:', e.message); }

// ══════════════════════════════════════
// CERTIFICATION DECISIONS (5)
// ══════════════════════════════════════
try {
  const insertDecision = db.prepare(`INSERT INTO certification_decisions (org_id, evaluation_id, decision, quorum, votes_favor, votes_against, justification, decided_by, decided_at) VALUES (1,?,?,?,?,?,?,1,datetime('now',?))`);
  const completedEvals = db.prepare("SELECT id, result FROM evaluations WHERE org_id=1 AND status='completada' ORDER BY id").all();
  for (const ev of completedEvals.slice(0, 5)) {
    const decision = ev.result === 'competente' ? 'competente' : 'aun_no_competente';
    insertDecision.run(ev.id, decision, 3, decision === 'competente' ? 3 : 1, decision === 'competente' ? 0 : 2, decision === 'competente' ? 'Candidato demuestra dominio en todos los criterios evaluados' : 'Candidato no alcanza puntaje mínimo en 2 de 4 instrumentos', '-' + (Math.floor(Math.random() * 30) + 1) + ' days');
  }
  console.log('Decisions:', Math.min(5, completedEvals.length));
} catch(e) { console.log('Decisions:', e.message); }

db.close();
console.log('\n=== SEED COMPLETE ===');
