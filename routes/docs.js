const router = require("express").Router();
const { getDb } = require("../database/db");

// Certificado de Competencia Laboral
router.get("/certificado/:candidateId", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const candidate = db.prepare(
    `SELECT c.*, p.name as profile_name, p.code as profile_code, p.sector as profile_sector
     FROM candidates c LEFT JOIN profiles p ON c.profile_id=p.id
     WHERE c.id=? AND c.org_id=? AND c.status='certificado'`
  ).get(req.params.candidateId, oid);
  if (!candidate) return res.redirect("/candidatos");

  const decision = db.prepare(
    `SELECT cd.*, u.display_name as decided_by_name
     FROM certification_decisions cd LEFT JOIN users u ON cd.decided_by=u.id
     WHERE cd.candidate_id=? AND cd.org_id=? AND cd.decision='certificar'
     ORDER BY cd.created_at DESC LIMIT 1`
  ).get(req.params.candidateId, oid);

  const evaluation = db.prepare(
    `SELECT e.*, ev.name as evaluator_name
     FROM evaluations e LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     WHERE e.candidate_id=? AND e.org_id=? AND e.status='completada'
     ORDER BY e.completed_at DESC LIMIT 1`
  ).get(req.params.candidateId, oid);

  const org = db.prepare("SELECT * FROM organizations WHERE id=?").get(oid);
  const folio = `CEC-${org.rut ? org.rut.replace(/[.-]/g,'').slice(0,6) : 'XXX'}-${String(candidate.id).padStart(4,'0')}`;

  res.render("print/certificado", { candidate, decision, evaluation, org, folio });
});

// Informe de Evaluacion Individual
router.get("/informe/:evaluationId", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const evaluation = db.prepare(
    `SELECT e.*, c.name as candidate_name, c.rut as candidate_rut, c.email as candidate_email,
     c.phone as candidate_phone, c.region as candidate_region, c.education_level, c.work_experience_years,
     p.name as profile_name, p.code as profile_code, p.sector as profile_sector,
     ev.name as evaluator_name, ev.rut as evaluator_rut, ev.specialties as evaluator_specialties
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     WHERE e.id=? AND e.org_id=? AND e.status='completada'`
  ).get(req.params.evaluationId, oid);
  if (!evaluation) return res.redirect("/evaluaciones");

  const org = db.prepare("SELECT * FROM organizations WHERE id=?").get(oid);
  const folio = `INF-${String(evaluation.id).padStart(4,'0')}`;

  res.render("print/informe-evaluacion", { evaluation, org, folio });
});

// Acta de Comite de Decision
router.get("/acta/:decisionId", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const decision = db.prepare(
    `SELECT cd.*, c.name as candidate_name, c.rut as candidate_rut,
     u.display_name as decided_by_name,
     e.score_ponderado, e.score_conocimientos, e.score_jefe_directo, e.score_terreno, e.score_evidencias,
     e.result, e.observations, e.completed_at as eval_completed_at, e.tipo_jefe, e.tipo_terreno,
     p.name as profile_name, p.code as profile_code,
     ev.name as evaluator_name, ev.rut as evaluator_rut
     FROM certification_decisions cd
     LEFT JOIN candidates c ON cd.candidate_id=c.id
     LEFT JOIN evaluations e ON cd.evaluation_id=e.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     LEFT JOIN users u ON cd.decided_by=u.id
     WHERE cd.id=? AND cd.org_id=?`
  ).get(req.params.decisionId, oid);
  if (!decision) return res.redirect("/evaluaciones");

  const org = db.prepare("SELECT * FROM organizations WHERE id=?").get(oid);
  const folio = `ACT-${String(decision.id).padStart(4,'0')}`;

  res.render("print/acta-comite", { decision, org, folio });
});

module.exports = router;
