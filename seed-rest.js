require('dotenv').config();
const db = require('better-sqlite3')('certificadesk.db');
const crypto = require('./services/crypto');
const enc = v => { try { return crypto.encrypt(v); } catch(e) { return v; } };

const allEv = db.prepare("SELECT id FROM evaluators WHERE org_id=1").all().map(r=>r.id);
const allCand = db.prepare("SELECT id FROM candidates WHERE org_id=1").all().map(r=>r.id);

// Complaints
const ic = db.prepare("INSERT INTO complaints (org_id, type, from_name, from_email, subject, description, status, priority, created_at) VALUES (1,?,?,?,?,?,?,?,datetime('now',?))");
ic.run('reclamo','Manuel Ortiz',enc('m.ortiz@email.cl'),'Demora en entrega de certificado','Han pasado 3 semanas desde la evaluacion y aun no recibo el certificado fisico.','en_investigacion','media','-15 days');
ic.run('sugerencia','Ana Soto Bravo',enc('ana.soto@email.cl'),'Horarios de evaluacion','Seria util ofrecer evaluaciones en horario vespertino para trabajadores con turno diurno.','resuelto','baja','-30 days');
ic.run('felicitacion','Jorge Tapia',enc('jorge.tapia@email.cl'),'Excelente proceso','Quiero felicitar al evaluador por la claridad en las instrucciones y el trato profesional.','cerrado','baja','-20 days');
console.log('Complaints: 3');

// Conflicts
const iconf = db.prepare("INSERT INTO conflicts_of_interest (org_id, evaluator_id, candidate_id, type, description, declaration_date, status) VALUES (1,?,?,?,?,?,?)");
iconf.run(allEv[0], allCand[3], 'familiar', 'Candidata es prima segunda del evaluador', '2026-05-08', 'resuelto');
iconf.run(allEv[1]||allEv[0], allCand[6], 'laboral', 'Trabaje con el candidato en empresa anterior hace 2 anos', '2026-05-20', 'declarado');
console.log('Conflicts: 2');

// Certification decisions
const compEvals = db.prepare("SELECT id, candidate_id, result FROM evaluations WHERE org_id=1 AND status='completada' ORDER BY id").all();
const idec = db.prepare("INSERT INTO certification_decisions (org_id, evaluation_id, candidate_id, committee_date, members, evaluator_recommendation, decision, justification, decided_by, created_at) VALUES (1,?,?,date('now',?),?,?,?,?,1,datetime('now',?))");
compEvals.slice(0,6).forEach((e,i) => {
  const dec = e.result === 'competente' ? 'competente' : 'aun_no_competente';
  const days = '-' + (30 - i*5) + ' days';
  idec.run(e.id, e.candidate_id, days, 'Juan Valle H., Patricia Arce, Ricardo Fuentes', dec, dec, dec === 'competente' ? 'Candidato demuestra dominio en todos los criterios evaluados' : 'No alcanza puntaje minimo en 2 de 4 instrumentos', 1, days);
});
console.log('Decisions:', Math.min(6, compEvals.length));

// Evaluator reviews
const ir = db.prepare("INSERT OR IGNORE INTO evaluator_reviews (evaluator_id, org_id, period, score_deadlines, score_report_quality, score_procedure_compliance, created_at) VALUES (?,1,?,?,?,?,datetime('now'))");
allEv.forEach(id => {
  ir.run(id, 'Q1 2026', 4, 5, 4);
  ir.run(id, 'Q2 2026', 5, 4, 5);
});
console.log('Reviews: done');

// Documents
try {
  const idoc = db.prepare("INSERT INTO documents (org_id, title, category, version, status, file_path, file_name, uploaded_by, created_at) VALUES (1,?,?,?,?,?,?,1,datetime('now',?))");
  idoc.run('Manual de Calidad CEC','manual','3.0','vigente','/docs/manual-calidad-v3.pdf','manual-calidad-v3.pdf','-60 days');
  idoc.run('Procedimiento P1 - Certificacion','procedimiento','2.1','vigente','/docs/p1-certificacion.pdf','p1-certificacion.pdf','-45 days');
  idoc.run('Formato Informe de Brechas','formato','1.2','vigente','/docs/formato-brechas.docx','formato-brechas.docx','-30 days');
  idoc.run('Politica de Conflictos de Interes','politica','1.0','vigente','/docs/politica-conflictos.pdf','politica-conflictos.pdf','-90 days');
  idoc.run('Instructivo Evaluacion en Terreno','instructivo','1.1','en_revision','/docs/instructivo-terreno.pdf','instructivo-terreno.pdf','-10 days');
  console.log('Documents: 5');
} catch(e) { console.log('Documents:', e.message); }

db.close();
console.log('SEED COMPLETE');
