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

  // Certificaciones por mes (ultimos 12 meses)
  const certByMonth = db.prepare(
    `SELECT strftime('%Y-%m', COALESCE(completed_at, scheduled_date)) as month,
     SUM(CASE WHEN result='competente' THEN 1 ELSE 0 END) as competentes,
     SUM(CASE WHEN result='aun_no_competente' THEN 1 ELSE 0 END) as no_competentes,
     COUNT(*) as total
     FROM evaluations WHERE org_id=? AND status='completada'
     GROUP BY month ORDER BY month DESC LIMIT 12`
  ).all(oid).reverse();

  // Satisfaccion por dimension
  const satDims = db.prepare(
    `SELECT AVG(score_overall) as general, AVG(score_evaluator) as evaluador,
     AVG(score_process) as proceso, AVG(score_infrastructure) as infraestructura,
     AVG(score_communication) as comunicacion,
     COUNT(*) as total
     FROM satisfaction WHERE org_id=?`
  ).get(oid);

  // Por perfil ocupacional
  const byProfile = db.prepare(
    `SELECT p.name as label, p.code,
     COUNT(e.id) as total,
     SUM(CASE WHEN e.result='competente' THEN 1 ELSE 0 END) as competentes,
     SUM(CASE WHEN e.result='aun_no_competente' THEN 1 ELSE 0 END) as no_competentes
     FROM evaluations e
     LEFT JOIN profiles p ON e.profile_id=p.id
     WHERE e.org_id=? AND e.status='completada'
     GROUP BY p.id ORDER BY total DESC LIMIT 10`
  ).all(oid);

  // Evaluador workload
  const evalWorkload = db.prepare(
    `SELECT ev.name, COUNT(e.id) as evaluaciones,
     AVG(CASE WHEN e.result='competente' THEN 1.0 ELSE 0.0 END) as tasa_cert
     FROM evaluations e
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     WHERE e.org_id=? AND e.status='completada' AND ev.name IS NOT NULL
     GROUP BY ev.id ORDER BY evaluaciones DESC LIMIT 8`
  ).all(oid);

  const charts = {
    certByMonth: certByMonth,
    satDims: {
      general: satDims.general ? Number(satDims.general).toFixed(1) : 0,
      evaluador: satDims.evaluador ? Number(satDims.evaluador).toFixed(1) : 0,
      proceso: satDims.proceso ? Number(satDims.proceso).toFixed(1) : 0,
      infraestructura: satDims.infraestructura ? Number(satDims.infraestructura).toFixed(1) : 0,
      comunicacion: satDims.comunicacion ? Number(satDims.comunicacion).toFixed(1) : 0,
      total: satDims.total
    },
    byProfile: byProfile,
    evalWorkload: evalWorkload
  };

  res.render("reports/index", { summary, rate, charts });
});

// Reporte ChileValora mensual — D016 Proc 1.3
router.get("/chilevalora", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const periodo = req.query.periodo || new Date().toISOString().substring(0, 7);
  const [year, month] = periodo.split('-');
  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;

  const evaluaciones = db.prepare(
    `SELECT e.*, c.name as candidate_name, c.rut as candidate_rut, p.name as profile_name, p.code as profile_code,
     ev.name as evaluator_name, ev.rut as evaluator_rut
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     WHERE e.org_id=? AND e.completed_at >= ? AND e.completed_at < ?
     ORDER BY e.completed_at`
  ).all(oid, startDate, endDate);

  const decisiones = db.prepare(
    `SELECT cd.*, c.name as candidate_name, c.rut as candidate_rut
     FROM certification_decisions cd
     LEFT JOIN candidates c ON cd.candidate_id=c.id
     WHERE cd.org_id=? AND cd.created_at >= ? AND cd.created_at < ?`
  ).all(oid, startDate, endDate);

  const auditorias = db.prepare(
    `SELECT a.*, u.display_name as auditor_name FROM audits a
     LEFT JOIN users u ON a.auditor_id=u.id
     WHERE a.org_id=? AND a.completed_at >= ? AND a.completed_at < ?`
  ).all(oid, startDate, endDate);

  const satisfaccion = db.prepare(
    `SELECT AVG(score_overall) as avg, COUNT(*) as total FROM satisfaction
     WHERE org_id=? AND created_at >= ? AND created_at < ?`
  ).get(oid, startDate, endDate);

  const apelaciones = db.prepare(
    `SELECT COUNT(*) as c FROM candidates WHERE org_id=? AND status='apelacion'
     AND updated_at >= ? AND updated_at < ?`
  ).get(oid, startDate, endDate).c;

  const perfiles = db.prepare(
    `SELECT p.name, p.code,
     COUNT(e.id) as total,
     SUM(CASE WHEN e.result='competente' THEN 1 ELSE 0 END) as competentes,
     SUM(CASE WHEN e.result='aun_no_competente' THEN 1 ELSE 0 END) as no_competentes
     FROM evaluations e
     LEFT JOIN profiles p ON e.profile_id=p.id
     WHERE e.org_id=? AND e.completed_at >= ? AND e.completed_at < ?
     GROUP BY p.id`
  ).all(oid, startDate, endDate);

  const evaluadores = db.prepare(
    `SELECT DISTINCT ev.name, ev.rut, COUNT(e.id) as evaluaciones
     FROM evaluations e
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     WHERE e.org_id=? AND e.completed_at >= ? AND e.completed_at < ?
     GROUP BY ev.id`
  ).all(oid, startDate, endDate);

  const org = db.prepare("SELECT * FROM organizations WHERE id=?").get(oid);

  res.render("reports/chilevalora", {
    periodo, org, evaluaciones, decisiones, auditorias,
    satisfaccion, apelaciones, perfiles, evaluadores
  });
});

// Export CSV
router.get("/chilevalora/export", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const periodo = req.query.periodo || new Date().toISOString().substring(0, 7);
  const [year, month] = periodo.split('-');
  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;

  const rows = db.prepare(
    `SELECT c.rut as candidato_rut, c.name as candidato_nombre, p.code as perfil_codigo, p.name as perfil_nombre,
     e.scheduled_date as fecha_evaluacion, e.result as resultado, e.score as puntaje,
     ev.name as evaluador_nombre, ev.rut as evaluador_rut, e.type as tipo_evaluacion
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     WHERE e.org_id=? AND e.completed_at >= ? AND e.completed_at < ?
     ORDER BY e.completed_at`
  ).all(oid, startDate, endDate);

  const header = 'RUT Candidato,Nombre Candidato,Codigo Perfil,Perfil,Fecha Evaluacion,Resultado,Puntaje,Evaluador,RUT Evaluador,Tipo\n';
  const csv = header + rows.map(r =>
    `${r.candidato_rut||''},${r.candidato_nombre||''},${r.perfil_codigo||''},${r.perfil_nombre||''},${r.fecha_evaluacion||''},${r.resultado||''},${r.puntaje||''},${r.evaluador_nombre||''},${r.evaluador_rut||''},${r.tipo_evaluacion||''}`
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=chilevalora-${periodo}.csv`);
  res.send('﻿' + csv);
});

module.exports = router;
