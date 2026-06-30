const router = require("express").Router();
const { getDb } = require("../database/db");

router.get("/", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;

  const stats = {
    candidates: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=?").get(oid).c,
    evaluations: db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE org_id=?").get(oid).c,
    evaluations_done: db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE org_id=? AND status='completada'").get(oid).c,
    certified: db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE org_id=? AND result=?").get(oid, "competente").c,
    not_certified: db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE org_id=? AND result='aun_no_competente'").get(oid).c,
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

  // Tasa de certificacion
  stats.certification_rate = stats.evaluations_done > 0
    ? ((stats.certified / stats.evaluations_done) * 100).toFixed(1)
    : 0;

  // DJS por vencer (evaluadores con DJS expirando en 30 dias)
  stats.djs_expiring = db.prepare(
    "SELECT COUNT(*) as c FROM evaluators WHERE org_id=? AND active=1 AND djs_expiry <= date('now','+30 days') AND djs_expiry >= date('now')"
  ).get(oid).c;

  // DJS vencidas
  stats.djs_expired = db.prepare(
    "SELECT COUNT(*) as c FROM evaluators WHERE org_id=? AND active=1 AND djs_expiry < date('now')"
  ).get(oid).c;

  // Satisfaccion por dimension
  const satDims = db.prepare(
    `SELECT AVG(score_overall) as general, AVG(score_evaluator) as evaluador,
     AVG(score_process) as proceso, AVG(score_infrastructure) as infraestructura,
     AVG(score_communication) as comunicacion,
     COUNT(*) as total
     FROM satisfaction WHERE org_id=?`
  ).get(oid);

  // D016 compliance score (8 procedimientos)
  const complaintsTotal = db.prepare("SELECT COUNT(*) as c FROM complaints WHERE org_id=?").get(oid).c;
  const complaintsResolved = db.prepare("SELECT COUNT(*) as c FROM complaints WHERE org_id=? AND status='resuelto'").get(oid).c;
  const auditsCompleted = db.prepare("SELECT COUNT(*) as c FROM audits WHERE org_id=? AND status='completada'").get(oid).c;
  const profilesCount = db.prepare("SELECT COUNT(*) as c FROM profiles WHERE active=1").get().c;

  const complianceChecks = [
    profilesCount > 0,                       // P1: Perfiles activos
    stats.evaluators > 0,                     // P2: Evaluadores registrados
    stats.evaluations > 0,                    // P3: Evaluaciones realizadas
    stats.manuales >= 3,                      // P4: Manuales ChileValora
    stats.eval_reviews_pending === 0,         // P5: Evaluacion desempeno al dia
    complaintsTotal === 0 || complaintsResolved > 0, // P6: Reclamos gestionados
    satDims.total > 0,                        // P7: Encuestas realizadas
    auditsCompleted > 0,                      // P8: Auditorias completadas
  ];
  stats.compliance_score = Math.round((complianceChecks.filter(Boolean).length / 8) * 100);
  stats.compliance_checks = complianceChecks;

  // Alertas urgentes
  const alerts = [];
  if (stats.djs_expired > 0) alerts.push({ type: 'danger', icon: 'exclamation-octagon', text: stats.djs_expired + ' evaluador(es) con DJS vencida' });
  if (stats.djs_expiring > 0) alerts.push({ type: 'warning', icon: 'clock-history', text: stats.djs_expiring + ' DJS por vencer en 30 dias' });
  if (stats.docs_expiring > 0) alerts.push({ type: 'warning', icon: 'file-earmark-x', text: stats.docs_expiring + ' documento(s) por vencer' });
  if (stats.eval_reviews_pending > 0) alerts.push({ type: 'info', icon: 'clipboard2-check', text: stats.eval_reviews_pending + ' evaluacion(es) de desempeno pendiente(s)' });
  if (stats.complaints_open > 0) alerts.push({ type: 'warning', icon: 'exclamation-triangle', text: stats.complaints_open + ' reclamo(s) abierto(s)' });

  const recent = db.prepare(
    "SELECT * FROM activity_log WHERE org_id=? ORDER BY created_at DESC LIMIT 10"
  ).all(oid);

  const upcoming = db.prepare(
    `SELECT e.*, c.name as candidate_name, p.name as profile_name FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id LEFT JOIN profiles p ON e.profile_id=p.id
     WHERE e.org_id=? AND e.status=? ORDER BY e.scheduled_date ASC LIMIT 5`
  ).all(oid, "programada");

  const byProfile = db.prepare(
    `SELECT p.name as label, COUNT(*) as value,
     SUM(CASE WHEN c.status='certificado' THEN 1 ELSE 0 END) as certificados,
     SUM(CASE WHEN c.status='no_certificado' THEN 1 ELSE 0 END) as no_certificados
     FROM candidates c
     LEFT JOIN profiles p ON c.profile_id=p.id WHERE c.org_id=? AND c.profile_id IS NOT NULL
     GROUP BY c.profile_id ORDER BY value DESC LIMIT 8`
  ).all(oid);

  const byMonth = db.prepare(
    `SELECT strftime('%Y-%m', COALESCE(completed_at, scheduled_date)) as month,
     SUM(CASE WHEN result='competente' THEN 1 ELSE 0 END) as competentes,
     SUM(CASE WHEN result='aun_no_competente' THEN 1 ELSE 0 END) as no_competentes,
     COUNT(*) as total
     FROM evaluations WHERE org_id=? AND status='completada'
     GROUP BY month ORDER BY month DESC LIMIT 6`
  ).all(oid).reverse();

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
    byProfile: byProfile.length ? byProfile : [{ label: "Sin datos", value: 0, certificados: 0, no_certificados: 0 }],
    byMonth: byMonth.length ? byMonth : [],
    scoreDistrib: scoreDistrib || { bajo: 0, medio: 0, competente: 0, destacado: 0 },
    satDims: {
      general: satDims.general ? Number(satDims.general).toFixed(1) : 0,
      evaluador: satDims.evaluador ? Number(satDims.evaluador).toFixed(1) : 0,
      proceso: satDims.proceso ? Number(satDims.proceso).toFixed(1) : 0,
      infraestructura: satDims.infraestructura ? Number(satDims.infraestructura).toFixed(1) : 0,
      comunicacion: satDims.comunicacion ? Number(satDims.comunicacion).toFixed(1) : 0,
      total: satDims.total
    }
  };

  res.render("dashboard", { stats, recent, upcoming, charts, alerts });
});

module.exports = router;
