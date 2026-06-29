const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

router.get("/", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const surveys = db.prepare(
    "SELECT s.*, c.name as candidate_name FROM satisfaction s LEFT JOIN candidates c ON s.candidate_id=c.id WHERE s.org_id=? ORDER BY s.created_at DESC"
  ).all(oid);
  const avg = db.prepare("SELECT AVG(score_overall) as avg, COUNT(*) as total FROM satisfaction WHERE org_id=?").get(oid);
  res.render("satisfaction/list", { surveys, avg });
});

router.get("/nueva", (req, res) => {
  const candidates = getDb().prepare(
    "SELECT id, name FROM candidates WHERE org_id=? AND status IN ('certificado','no_certificado') ORDER BY name"
  ).all(req.user.org_id);
  res.render("satisfaction/form", { survey: null, candidates, error: null });
});

router.post("/", (req, res) => {
  const { candidate_id, score_overall, score_evaluator, score_process, score_infrastructure, score_communication, comments } = req.body;
  const r = getDb().prepare(
    "INSERT INTO satisfaction (org_id, candidate_id, score_overall, score_evaluator, score_process, score_infrastructure, score_communication, comments) VALUES (?,?,?,?,?,?,?,?)"
  ).run(req.user.org_id, candidate_id||null, parseInt(score_overall), parseInt(score_evaluator)||null, parseInt(score_process)||null, parseInt(score_infrastructure)||null, parseInt(score_communication)||null, comments);
  logActivity(req.user.org_id, req.user.id, "crear", "encuesta", r.lastInsertRowid);
  res.flash("Encuesta registrada"); res.redirect("/satisfaccion");
});

module.exports = router;
