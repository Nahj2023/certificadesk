const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

router.get("/", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const evaluations = db.prepare(
    `SELECT e.*, c.name as candidate_name, c.rut as candidate_rut, c.status as candidate_status,
     p.name as profile_name, ev.name as evaluator_name
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     WHERE e.org_id=? ORDER BY e.scheduled_date DESC`
  ).all(oid);
  res.render("evaluations/list", { evaluations });
});

router.get("/nueva", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const candidates = db.prepare("SELECT id, name, rut FROM candidates WHERE org_id=? AND status='elegible' ORDER BY name").all(oid);
  const evaluators = db.prepare("SELECT id, name FROM evaluators WHERE org_id=? AND active=1 ORDER BY name").all(oid);
  const profiles = db.prepare("SELECT id, code, name FROM profiles WHERE active=1 ORDER BY name").all();
  res.render("evaluations/form", { evaluation: null, candidates, evaluators, profiles, error: null });
});

router.post("/", (req, res) => {
  const db = getDb();
  const { candidate_id, profile_id, evaluator_id, scheduled_date, location, type } = req.body;
  try {
    const cand = db.prepare("SELECT status FROM candidates WHERE id=? AND org_id=?").get(candidate_id, req.user.org_id);
    if (!cand || cand.status !== 'elegible') return res.redirect("/evaluaciones/nueva");

    const r = db.prepare(
      "INSERT INTO evaluations (org_id, candidate_id, profile_id, evaluator_id, type, scheduled_date, location) VALUES (?,?,?,?,?,?,?)"
    ).run(req.user.org_id, candidate_id, profile_id||null, evaluator_id||null, type||"terreno", scheduled_date, location);
    db.prepare("UPDATE candidates SET status='evaluando' WHERE id=? AND org_id=?").run(candidate_id, req.user.org_id);
    logActivity(req.user.org_id, req.user.id, "crear", "evaluacion", r.lastInsertRowid);
    res.redirect("/evaluaciones");
  } catch(e) {
    res.redirect("/evaluaciones/nueva");
  }
});

// Resultado de evaluacion — ahora va a pendiente_comite
router.post("/:id/resultado", (req, res) => {
  const db = getDb();
  const { result, score, observations } = req.body;
  db.prepare(
    "UPDATE evaluations SET result=?, score=?, observations=?, status='completada', completed_at=CURRENT_TIMESTAMP WHERE id=? AND org_id=?"
  ).run(result, parseFloat(score)||null, observations, req.params.id, req.user.org_id);

  const ev = db.prepare("SELECT candidate_id FROM evaluations WHERE id=?").get(req.params.id);
  if (ev) {
    db.prepare("UPDATE candidates SET status='pendiente_comite' WHERE id=?").run(ev.candidate_id);
  }
  logActivity(req.user.org_id, req.user.id, "resultado", "evaluacion", req.params.id, result);
  res.redirect("/evaluaciones");
});

// Comite de Decision — D016 Proc 1.3
router.get("/:id/comite", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const evaluation = db.prepare(
    `SELECT e.*, c.name as candidate_name, c.rut as candidate_rut, p.name as profile_name, ev.name as evaluator_name
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     WHERE e.id=? AND e.org_id=?`
  ).get(req.params.id, oid);
  if (!evaluation || evaluation.status !== 'completada') return res.redirect("/evaluaciones");

  const existingDecision = db.prepare("SELECT * FROM certification_decisions WHERE evaluation_id=?").get(req.params.id);
  res.render("evaluations/committee", { evaluation, decision: existingDecision });
});

router.post("/:id/comite", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const evaluation = db.prepare("SELECT * FROM evaluations WHERE id=? AND org_id=?").get(req.params.id, oid);
  if (!evaluation || evaluation.status !== 'completada') return res.redirect("/evaluaciones");

  const { committee_date, members, evaluator_recommendation, audit_status, portfolio_reviewed, decision, justification } = req.body;

  db.prepare(`INSERT INTO certification_decisions
    (org_id, evaluation_id, candidate_id, committee_date, members, evaluator_recommendation, audit_status, portfolio_reviewed, decision, justification, decided_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(oid, req.params.id, evaluation.candidate_id, committee_date, members, evaluator_recommendation, audit_status||'sin_auditoria', portfolio_reviewed?1:0, decision, justification, req.user.id);

  const newStatus = decision === 'certificar' ? 'certificado' : 'no_certificado';
  db.prepare("UPDATE candidates SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(newStatus, evaluation.candidate_id);

  logActivity(oid, req.user.id, "comite_decision", "evaluacion", req.params.id, `Decision: ${decision}`);
  res.redirect("/evaluaciones");
});

module.exports = router;
