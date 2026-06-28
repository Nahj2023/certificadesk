const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

router.get("/", (req, res) => {
  const evaluators = getDb().prepare(
    "SELECT * FROM evaluators WHERE org_id=? ORDER BY name"
  ).all(req.user.org_id);
  res.render("evaluators/list", { evaluators });
});

router.get("/nuevo", (req, res) => {
  res.render("evaluators/form", { evaluator: null, error: null });
});

router.post("/", (req, res) => {
  const { rut, name, email, phone, specialties, contract_type, djs_expiry } = req.body;
  try {
    const r = getDb().prepare(
      "INSERT INTO evaluators (org_id, rut, name, email, phone, specialties, contract_type, djs_expiry) VALUES (?,?,?,?,?,?,?,?)"
    ).run(req.user.org_id, rut, name, email, phone, specialties, contract_type, djs_expiry||null);
    logActivity(req.user.org_id, req.user.id, "crear", "evaluador", r.lastInsertRowid, name);
    res.redirect("/evaluadores");
  } catch(e) {
    res.render("evaluators/form", { evaluator: req.body, error: e.message });
  }
});

// Detalle evaluador + historial reviews
router.get("/:id", (req, res) => {
  const db = getDb();
  const evaluator = db.prepare("SELECT * FROM evaluators WHERE id=? AND org_id=?").get(req.params.id, req.user.org_id);
  if (!evaluator) return res.redirect("/evaluadores");

  const reviews = db.prepare(
    "SELECT r.*, u.display_name as reviewer_name FROM evaluator_reviews r LEFT JOIN users u ON r.reviewed_by=u.id WHERE r.evaluator_id=? ORDER BY r.created_at DESC"
  ).all(evaluator.id);

  const evalCount = db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE evaluator_id=? AND org_id=?").get(evaluator.id, req.user.org_id).c;
  const evalCompleted = db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE evaluator_id=? AND org_id=? AND status='completada'").get(evaluator.id, req.user.org_id).c;

  res.render("evaluators/detail", { evaluator, reviews, evalCount, evalCompleted });
});

router.get("/:id/editar", (req, res) => {
  const evaluator = getDb().prepare("SELECT * FROM evaluators WHERE id=? AND org_id=?").get(req.params.id, req.user.org_id);
  if (!evaluator) return res.redirect("/evaluadores");
  res.render("evaluators/form", { evaluator, error: null });
});

router.post("/:id", (req, res) => {
  const { rut, name, email, phone, specialties, contract_type, djs_expiry } = req.body;
  const active = req.body.active ? 1 : 0;
  getDb().prepare(
    "UPDATE evaluators SET rut=?, name=?, email=?, phone=?, specialties=?, contract_type=?, djs_expiry=?, active=? WHERE id=? AND org_id=?"
  ).run(rut, name, email, phone, specialties, contract_type, djs_expiry||null, active, req.params.id, req.user.org_id);
  logActivity(req.user.org_id, req.user.id, "editar", "evaluador", req.params.id, name);
  res.redirect("/evaluadores");
});

// Evaluacion de desempeno — D016 Proc 2.4
router.get("/:id/evaluar", (req, res) => {
  const evaluator = getDb().prepare("SELECT * FROM evaluators WHERE id=? AND org_id=?").get(req.params.id, req.user.org_id);
  if (!evaluator) return res.redirect("/evaluadores");
  res.render("evaluators/review-form", { evaluator });
});

router.post("/:id/evaluar", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const evaluator = db.prepare("SELECT * FROM evaluators WHERE id=? AND org_id=?").get(req.params.id, oid);
  if (!evaluator) return res.redirect("/evaluadores");

  const { period, score_deadlines, score_report_quality, score_procedure_compliance, observations } = req.body;
  const s1 = parseInt(score_deadlines) || 3;
  const s2 = parseInt(score_report_quality) || 3;
  const s3 = parseInt(score_procedure_compliance) || 3;
  const overall = parseFloat(((s1 + s2 + s3) / 3).toFixed(1));

  let action = 'ninguna';
  if (overall < 3.0) action = 'suspension';
  else if (overall < 4.0) action = 'capacitacion';

  db.prepare(
    `INSERT INTO evaluator_reviews (org_id, evaluator_id, period, score_deadlines, score_report_quality, score_procedure_compliance, overall_score, observations, action_required, reviewed_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(oid, req.params.id, period, s1, s2, s3, overall, observations||null, action, req.user.id);

  db.prepare("UPDATE evaluators SET performance_score=? WHERE id=?").run(overall, req.params.id);
  logActivity(oid, req.user.id, "evaluar_desempeno", "evaluador", req.params.id, `Score: ${overall} - Accion: ${action}`);
  res.redirect(`/evaluadores/${req.params.id}`);
});

module.exports = router;
