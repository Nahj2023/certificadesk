const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

router.get("/", (req, res) => {
  const audits = getDb().prepare(
    "SELECT a.*, u.display_name as auditor_name FROM audits a LEFT JOIN users u ON a.auditor_id=u.id WHERE a.org_id=? ORDER BY a.scheduled_date DESC"
  ).all(req.user.org_id);
  res.render("audits/list", { audits });
});

router.get("/nueva", (req, res) => {
  const auditors = getDb().prepare("SELECT id, display_name FROM users WHERE org_id=? AND role='auditor'").all(req.user.org_id);
  res.render("audits/form", { audit: null, auditors, error: null });
});

router.post("/", (req, res) => {
  const { auditor_id, type, scope, scheduled_date } = req.body;
  const r = getDb().prepare(
    "INSERT INTO audits (org_id, auditor_id, type, scope, scheduled_date) VALUES (?,?,?,?,?)"
  ).run(req.user.org_id, auditor_id||null, type||"interna", scope, scheduled_date);
  logActivity(req.user.org_id, req.user.id, "crear", "auditoria", r.lastInsertRowid);
  res.flash("Registro guardado"); res.redirect("/auditorias");
});

router.post("/:id/completar", (req, res) => {
  const { observations, findings_count, non_conformities } = req.body;
  getDb().prepare(
    "UPDATE audits SET status='completada', observations=?, findings_count=?, non_conformities=?, completed_at=CURRENT_TIMESTAMP WHERE id=? AND org_id=?"
  ).run(observations, parseInt(findings_count)||0, parseInt(non_conformities)||0, req.params.id, req.user.org_id);
  logActivity(req.user.org_id, req.user.id, "completar", "auditoria", req.params.id);
  res.flash("Registro guardado"); res.redirect("/auditorias");
});

module.exports = router;
