const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

router.get("/", (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const oid = req.user.org_id;

  const evaluator = db.prepare(
    "SELECT * FROM evaluators WHERE user_id=? AND org_id=?"
  ).get(uid, oid);

  if (!evaluator) {
    return res.render("portal/dashboard", {
      evaluator: null, stats: {}, evaluations: [], alerts: []
    });
  }

  const evaluations = db.prepare(
    `SELECT e.*, c.name as candidate_name, c.rut as candidate_rut,
     p.name as profile_name, p.code as profile_code
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     WHERE e.evaluator_id=? AND e.org_id=?
     ORDER BY CASE e.status WHEN 'programada' THEN 1 WHEN 'en_proceso' THEN 2 WHEN 'completada' THEN 3 ELSE 4 END, e.scheduled_date ASC`
  ).all(evaluator.id, oid);

  const stats = {
    total: evaluations.length,
    programadas: evaluations.filter(e => e.status === 'programada').length,
    en_proceso: evaluations.filter(e => e.status === 'en_proceso').length,
    completadas: evaluations.filter(e => e.status === 'completada').length,
    competentes: evaluations.filter(e => e.result === 'competente').length,
  };

  const alerts = [];
  if (evaluator.djs_expiry) {
    const djs = new Date(evaluator.djs_expiry);
    const now = new Date();
    const days = Math.ceil((djs - now) / (1000 * 60 * 60 * 24));
    if (days < 0) alerts.push({ type: 'danger', text: 'Tu DJS esta vencida. Contacta al CEC para renovarla.' });
    else if (days <= 30) alerts.push({ type: 'warning', text: `Tu DJS vence en ${days} dias (${evaluator.djs_expiry}).` });
  }
  if (stats.programadas > 0) alerts.push({ type: 'info', text: `Tienes ${stats.programadas} evaluacion(es) programada(s).` });

  const conflicts = db.prepare(
    "SELECT COUNT(*) as c FROM conflicts_of_interest WHERE evaluator_id=? AND org_id=?"
  ).get(evaluator.id, oid).c;

  res.render("portal/dashboard", { evaluator, stats, evaluations, alerts, conflicts });
});

router.get("/evaluacion/:id", (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const oid = req.user.org_id;

  const evaluator = db.prepare("SELECT id FROM evaluators WHERE user_id=? AND org_id=?").get(uid, oid);
  if (!evaluator) return res.redirect("/portal");

  const evaluation = db.prepare(
    `SELECT e.*, c.name as candidate_name, c.rut as candidate_rut,
     p.name as profile_name, p.code as profile_code, p.sector as profile_sector
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     WHERE e.id=? AND e.evaluator_id=? AND e.org_id=?`
  ).get(req.params.id, evaluator.id, oid);

  if (!evaluation) return res.redirect("/portal");

  const evidence = db.prepare(
    "SELECT * FROM evidence WHERE evaluation_id=? AND org_id=? ORDER BY created_at DESC"
  ).all(req.params.id, oid);

  const instruments = db.prepare(
    "SELECT * FROM evaluation_instruments WHERE evaluation_id=? ORDER BY instrument_type"
  ).all(req.params.id);

  res.render("portal/evaluacion", { evaluation, evidence, instruments, evaluator });
});

module.exports = router;
