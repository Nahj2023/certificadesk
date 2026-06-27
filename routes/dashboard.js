const router = require("express").Router();
const { getDb } = require("../database/db");

router.get("/", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;

  const stats = {
    candidates: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=?").get(oid).c,
    evaluations: db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE org_id=?").get(oid).c,
    certified: db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE org_id=? AND result=?").get(oid, "competente").c,
    pending: db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE org_id=? AND status=?").get(oid, "programada").c,
    evaluators: db.prepare("SELECT COUNT(*) as c FROM evaluators WHERE org_id=? AND active=1").get(oid).c,
    complaints_open: db.prepare("SELECT COUNT(*) as c FROM complaints WHERE org_id=? AND status=?").get(oid, "abierto").c,
    docs_expiring: db.prepare("SELECT COUNT(*) as c FROM documents WHERE org_id=? AND expiry_date <= date(?,?)")
      .get(oid, "now", "+30 days").c,
    satisfaction_avg: db.prepare("SELECT AVG(score_overall) as avg FROM satisfaction WHERE org_id=?").get(oid).avg || 0,
  };

  const recent = db.prepare(
    "SELECT * FROM activity_log WHERE org_id=? ORDER BY created_at DESC LIMIT 10"
  ).all(oid);

  const upcoming = db.prepare(
    "SELECT e.*, c.name as candidate_name, p.name as profile_name FROM evaluations e LEFT JOIN candidates c ON e.candidate_id=c.id LEFT JOIN profiles p ON e.profile_id=p.id WHERE e.org_id=? AND e.status=? ORDER BY e.scheduled_date ASC LIMIT 5"
  ).all(oid, "programada");

  res.render("dashboard", { stats, recent, upcoming });
});

module.exports = router;
