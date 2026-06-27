const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

router.get("/", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const evaluations = db.prepare(
    `SELECT e.*, c.name as candidate_name, c.rut as candidate_rut, p.name as profile_name, ev.name as evaluator_name
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
  const candidates = db.prepare("SELECT id, name, rut FROM candidates WHERE org_id=? AND status IN ('registrado','evaluando') ORDER BY name").all(oid);
  const evaluators = db.prepare("SELECT id, name FROM evaluators WHERE org_id=? AND active=1 ORDER BY name").all(oid);
  const profiles = db.prepare("SELECT id, code, name FROM profiles WHERE active=1 ORDER BY name").all();
  res.render("evaluations/form", { evaluation: null, candidates, evaluators, profiles, error: null });
});

router.post("/", (req, res) => {
  const db = getDb();
  const { candidate_id, profile_id, evaluator_id, scheduled_date, location, type } = req.body;
  try {
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

router.post("/:id/resultado", (req, res) => {
  const db = getDb();
  const { result, score, observations } = req.body;
  db.prepare(
    "UPDATE evaluations SET result=?, score=?, observations=?, status='completada', completed_at=CURRENT_TIMESTAMP WHERE id=? AND org_id=?"
  ).run(result, parseFloat(score)||null, observations, req.params.id, req.user.org_id);

  const ev = db.prepare("SELECT candidate_id FROM evaluations WHERE id=?").get(req.params.id);
  if (ev) {
    const newStatus = result === "competente" ? "certificado" : "no_certificado";
    db.prepare("UPDATE candidates SET status=? WHERE id=?").run(newStatus, ev.candidate_id);
  }
  logActivity(req.user.org_id, req.user.id, "resultado", "evaluacion", req.params.id, result);
  res.redirect("/evaluaciones");
});

module.exports = router;
