const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

router.get("/", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const surveys = db.prepare(
    "SELECT s.*, c.name as candidate_name FROM satisfaction s LEFT JOIN candidates c ON s.candidate_id=c.id WHERE s.org_id=? ORDER BY s.created_at DESC"
  ).all(oid);
  const avg = db.prepare("SELECT AVG(score_overall) as avg, COUNT(*) as total FROM satisfaction WHERE org_id=?").get(oid);

  const dims = db.prepare(
    `SELECT AVG(score_overall) as general, AVG(score_evaluator) as evaluador,
     AVG(score_process) as proceso, AVG(score_infrastructure) as infraestructura,
     AVG(score_communication) as comunicacion
     FROM satisfaction WHERE org_id=?`
  ).get(oid);

  const satDims = {
    general: dims.general ? Number(dims.general).toFixed(1) : 0,
    evaluador: dims.evaluador ? Number(dims.evaluador).toFixed(1) : 0,
    proceso: dims.proceso ? Number(dims.proceso).toFixed(1) : 0,
    infraestructura: dims.infraestructura ? Number(dims.infraestructura).toFixed(1) : 0,
    comunicacion: dims.comunicacion ? Number(dims.comunicacion).toFixed(1) : 0
  };

  // Trend by month
  const trend = db.prepare(
    `SELECT strftime('%Y-%m', created_at) as month, AVG(score_overall) as avg, COUNT(*) as total
     FROM satisfaction WHERE org_id=?
     GROUP BY month ORDER BY month DESC LIMIT 6`
  ).all(oid).reverse();

  res.render("satisfaction/list", { surveys, avg, satDims, trend });
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
