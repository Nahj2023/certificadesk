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
    registrados: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=? AND status='registrado'").get(oid).c,
    elegibles: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=? AND status='elegible'").get(oid).c,
    evaluando: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=? AND status='evaluando'").get(oid).c,
    pendiente_comite: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=? AND status='pendiente_comite'").get(oid).c,
    certificados: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=? AND status='certificado'").get(oid).c,
    manuales: db.prepare("SELECT COUNT(*) as c FROM documents WHERE org_id=? AND category='manual_chilevalora'").get(oid).c,
    eval_reviews_pending: db.prepare(
      `SELECT COUNT(*) as c FROM evaluators WHERE org_id=? AND active=1
       AND id NOT IN (SELECT evaluator_id FROM evaluator_reviews WHERE org_id=? AND period LIKE ?)`
    ).get(oid, oid, new Date().getFullYear() + '%').c,
  };

  const recent = db.prepare(
    "SELECT * FROM activity_log WHERE org_id=? ORDER BY created_at DESC LIMIT 10"
  ).all(oid);

  const upcoming = db.prepare(
    `SELECT e.*, c.name as candidate_name, p.name as profile_name FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id LEFT JOIN profiles p ON e.profile_id=p.id
     WHERE e.org_id=? AND e.status=? ORDER BY e.scheduled_date ASC LIMIT 5`
  ).all(oid, "programada");

  // Chart data: candidates by profile
  const byProfile = db.prepare(
    `SELECT p.name as label, COUNT(*) as value FROM candidates c
     LEFT JOIN profiles p ON c.profile_id=p.id WHERE c.org_id=? AND c.profile_id IS NOT NULL
     GROUP BY c.profile_id ORDER BY value DESC LIMIT 8`
  ).all(oid);

  // Chart data: evaluations by month (last 6 months)
  const byMonth = db.prepare(
    `SELECT strftime('%Y-%m', COALESCE(completed_at, scheduled_date)) as month,
     SUM(CASE WHEN result='competente' THEN 1 ELSE 0 END) as competentes,
     SUM(CASE WHEN result='aun_no_competente' THEN 1 ELSE 0 END) as no_competentes,
     COUNT(*) as total
     FROM evaluations WHERE org_id=? AND status='completada'
     GROUP BY month ORDER BY month DESC LIMIT 6`
  ).all(oid).reverse();

  // Chart data: score distribution
  const scoreDistrib = db.prepare(
    `SELECT
       SUM(CASE WHEN score_ponderado < 2.0 THEN 1 ELSE 0 END) as bajo,
       SUM(CASE WHEN score_ponderado >= 2.0 AND score_ponderado < 3.0 THEN 1 ELSE 0 END) as medio,
       SUM(CASE WHEN score_ponderado >= 3.0 AND score_ponderado < 3.5 THEN 1 ELSE 0 END) as competente,
       SUM(CASE WHEN score_ponderado >= 3.5 THEN 1 ELSE 0 END) as destacado
     FROM evaluations WHERE org_id=? AND status='completada' AND score_ponderado IS NOT NULL`
  ).get(oid);

  const charts = {
    pipeline: [stats.registrados, stats.elegibles, stats.evaluando, stats.pendiente_comite, stats.certificados],
    byProfile: byProfile.length ? byProfile : [{ label: "Sin datos", value: 0 }],
    byMonth: byMonth.length ? byMonth : [],
    scoreDistrib: scoreDistrib || { bajo: 0, medio: 0, competente: 0, destacado: 0 }
  };

  res.render("dashboard", { stats, recent, upcoming, charts });
});

module.exports = router;
