const router = require("express").Router();
const { getDb } = require("../database/db");

router.get("/", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;

  const summary = {
    candidates_total: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=?").get(oid).c,
    certified: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=? AND status='certificado'").get(oid).c,
    not_certified: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=? AND status='no_certificado'").get(oid).c,
    evaluations_done: db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE org_id=? AND status='completada'").get(oid).c,
    satisfaction_avg: db.prepare("SELECT AVG(score_overall) as avg FROM satisfaction WHERE org_id=?").get(oid).avg || 0,
    complaints_total: db.prepare("SELECT COUNT(*) as c FROM complaints WHERE org_id=?").get(oid).c,
    complaints_resolved: db.prepare("SELECT COUNT(*) as c FROM complaints WHERE org_id=? AND status='resuelto'").get(oid).c,
    audits_done: db.prepare("SELECT COUNT(*) as c FROM audits WHERE org_id=? AND status='completada'").get(oid).c,
  };
  const rate = summary.candidates_total > 0 ? ((summary.certified / summary.candidates_total) * 100).toFixed(1) : 0;

  res.render("reports/index", { summary, rate });
});

module.exports = router;
