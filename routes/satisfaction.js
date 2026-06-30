const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

router.get("/export/csv", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const rows = db.prepare(
    `SELECT s.id, c.name as candidato, s.score_overall, s.score_evaluator,
     s.score_process, s.score_infrastructure, s.score_communication,
     s.comments, s.created_at
     FROM satisfaction s LEFT JOIN candidates c ON s.candidate_id=c.id
     WHERE s.org_id=? ORDER BY s.created_at DESC`
  ).all(oid);

  const header = "ID,Candidato,General,Evaluador,Proceso,Infraestructura,Comunicacion,Comentarios,Fecha\n";
  const csv = header + rows.map(r =>
    [r.id, `"${(r.candidato||'').replace(/"/g,'""')}"`, r.score_overall, r.score_evaluator||'', r.score_process||'', r.score_infrastructure||'', r.score_communication||'', `"${(r.comments||'').replace(/"/g,'""')}"`, r.created_at].join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=satisfaccion_${new Date().toISOString().slice(0,10)}.csv`);
  res.send('﻿' + csv);
});

router.get("/", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const { perfil, periodo, page: pageQ } = req.query;
  const page = Math.max(1, parseInt(pageQ) || 1);
  const perPage = 20;

  let where = "s.org_id=?";
  const params = [oid];

  if (perfil) {
    where += " AND c.profile_id=?";
    params.push(perfil);
  }
  if (periodo) {
    where += " AND strftime('%Y-%m', s.created_at)=?";
    params.push(periodo);
  }

  const totalRow = db.prepare(`SELECT COUNT(*) as c FROM satisfaction s LEFT JOIN candidates c ON s.candidate_id=c.id WHERE ${where}`).get(...params);
  const total = totalRow.c;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const surveys = db.prepare(
    `SELECT s.*, c.name as candidate_name, p.name as profile_name
     FROM satisfaction s
     LEFT JOIN candidates c ON s.candidate_id=c.id
     LEFT JOIN profiles p ON c.profile_id=p.id
     WHERE ${where} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, perPage, (page - 1) * perPage);

  // Aggregates (all data, no pagination filter)
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

  // NPS
  const npsData = db.prepare(
    `SELECT
       SUM(CASE WHEN score_overall >= 4 THEN 1 ELSE 0 END) as promoters,
       SUM(CASE WHEN score_overall = 3 THEN 1 ELSE 0 END) as passives,
       SUM(CASE WHEN score_overall <= 2 THEN 1 ELSE 0 END) as detractors,
       COUNT(*) as total
     FROM satisfaction WHERE org_id=?`
  ).get(oid);
  const nps = npsData.total > 0
    ? Math.round(((npsData.promoters / npsData.total) - (npsData.detractors / npsData.total)) * 100)
    : null;

  // Trend by month (last 12)
  const trend = db.prepare(
    `SELECT strftime('%Y-%m', created_at) as month, AVG(score_overall) as avg, COUNT(*) as total
     FROM satisfaction WHERE org_id=?
     GROUP BY month ORDER BY month DESC LIMIT 12`
  ).all(oid).reverse();

  // Period comparison (current vs previous quarter)
  const now = new Date();
  const curQ = Math.floor(now.getMonth() / 3);
  const curYear = now.getFullYear();
  const curStart = `${curYear}-${String(curQ * 3 + 1).padStart(2, '0')}-01`;
  const prevQ = curQ === 0 ? 3 : curQ - 1;
  const prevYear = curQ === 0 ? curYear - 1 : curYear;
  const prevStart = `${prevYear}-${String(prevQ * 3 + 1).padStart(2, '0')}-01`;
  const prevEnd = curStart;

  const qCurrent = db.prepare(
    "SELECT AVG(score_overall) as avg, COUNT(*) as total FROM satisfaction WHERE org_id=? AND created_at >= ?"
  ).get(oid, curStart);
  const qPrev = db.prepare(
    "SELECT AVG(score_overall) as avg, COUNT(*) as total FROM satisfaction WHERE org_id=? AND created_at >= ? AND created_at < ?"
  ).get(oid, prevStart, prevEnd);

  const comparison = {
    current: { avg: qCurrent.avg ? Number(qCurrent.avg).toFixed(1) : null, total: qCurrent.total, label: `Q${curQ + 1} ${curYear}` },
    previous: { avg: qPrev.avg ? Number(qPrev.avg).toFixed(1) : null, total: qPrev.total, label: `Q${prevQ + 1} ${prevYear}` }
  };

  // Filters data
  const profiles = db.prepare("SELECT id, name FROM profiles WHERE active=1 ORDER BY name").all();
  const periodos = db.prepare(
    "SELECT DISTINCT strftime('%Y-%m', created_at) as m FROM satisfaction WHERE org_id=? ORDER BY m DESC"
  ).all(oid).map(r => r.m);

  res.render("satisfaction/list", {
    surveys, avg, satDims, trend, nps, npsData, comparison,
    profiles, periodos, filters: { perfil, periodo },
    page, totalPages, total
  });
});

router.get("/nueva", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const candidates = db.prepare(
    "SELECT id, name FROM candidates WHERE org_id=? AND status IN ('certificado','no_certificado','evaluando') ORDER BY name"
  ).all(oid);
  const evaluations = db.prepare(
    `SELECT e.id, e.candidate_id, c.name as candidate_name, p.name as profile_name
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     WHERE e.org_id=? AND e.status='completada'
     AND e.id NOT IN (SELECT evaluation_id FROM satisfaction WHERE evaluation_id IS NOT NULL AND org_id=?)
     ORDER BY e.completed_at DESC`
  ).all(oid, oid);
  res.render("satisfaction/form", { survey: null, candidates, evaluations, error: null });
});

router.get("/:id", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const survey = db.prepare(
    `SELECT s.*, c.name as candidate_name, c.rut as candidate_rut,
     p.name as profile_name, ev.name as evaluator_name
     FROM satisfaction s
     LEFT JOIN candidates c ON s.candidate_id=c.id
     LEFT JOIN profiles p ON c.profile_id=p.id
     LEFT JOIN evaluations e ON s.evaluation_id=e.id
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     WHERE s.id=? AND s.org_id=?`
  ).get(req.params.id, oid);
  if (!survey) return res.redirect("/satisfaccion");
  res.render("satisfaction/detail", { survey });
});

router.get("/:id/editar", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const survey = db.prepare("SELECT * FROM satisfaction WHERE id=? AND org_id=?").get(req.params.id, oid);
  if (!survey) return res.redirect("/satisfaccion");
  const candidates = db.prepare(
    "SELECT id, name FROM candidates WHERE org_id=? ORDER BY name"
  ).all(oid);
  const evaluations = db.prepare(
    `SELECT e.id, e.candidate_id, c.name as candidate_name, p.name as profile_name
     FROM evaluations e LEFT JOIN candidates c ON e.candidate_id=c.id LEFT JOIN profiles p ON e.profile_id=p.id
     WHERE e.org_id=? AND e.status='completada' ORDER BY e.completed_at DESC`
  ).all(oid);
  res.render("satisfaction/form", { survey, candidates, evaluations, error: null });
});

router.post("/", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const { candidate_id, evaluation_id, score_overall, score_evaluator, score_process, score_infrastructure, score_communication, comments } = req.body;

  if (!score_overall || parseInt(score_overall) < 1 || parseInt(score_overall) > 5) {
    return res.status(400).send("Puntaje general requerido (1-5)");
  }

  // Duplicate check
  if (evaluation_id) {
    const exists = db.prepare("SELECT id FROM satisfaction WHERE org_id=? AND evaluation_id=?").get(oid, evaluation_id);
    if (exists) {
      res.flash("Ya existe una encuesta para esta evaluacion");
      return res.redirect("/satisfaccion");
    }
  }

  const r = db.prepare(
    `INSERT INTO satisfaction (org_id, candidate_id, evaluation_id, score_overall, score_evaluator, score_process, score_infrastructure, score_communication, comments)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(oid, candidate_id || null, evaluation_id || null, parseInt(score_overall),
    parseInt(score_evaluator) || null, parseInt(score_process) || null,
    parseInt(score_infrastructure) || null, parseInt(score_communication) || null, comments);
  logActivity(oid, req.user.id, "crear", "encuesta_satisfaccion", r.lastInsertRowid);
  res.flash("Encuesta registrada");
  res.redirect("/satisfaccion");
});

router.post("/:id", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const survey = db.prepare("SELECT id FROM satisfaction WHERE id=? AND org_id=?").get(req.params.id, oid);
  if (!survey) return res.redirect("/satisfaccion");

  const { candidate_id, evaluation_id, score_overall, score_evaluator, score_process, score_infrastructure, score_communication, comments } = req.body;

  db.prepare(
    `UPDATE satisfaction SET candidate_id=?, evaluation_id=?, score_overall=?, score_evaluator=?, score_process=?, score_infrastructure=?, score_communication=?, comments=?
     WHERE id=? AND org_id=?`
  ).run(candidate_id || null, evaluation_id || null, parseInt(score_overall),
    parseInt(score_evaluator) || null, parseInt(score_process) || null,
    parseInt(score_infrastructure) || null, parseInt(score_communication) || null,
    comments, req.params.id, oid);
  logActivity(oid, req.user.id, "editar", "encuesta_satisfaccion", req.params.id);
  res.flash("Encuesta actualizada");
  res.redirect("/satisfaccion/" + req.params.id);
});

router.post("/:id/eliminar", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  db.prepare("DELETE FROM satisfaction WHERE id=? AND org_id=?").run(req.params.id, oid);
  logActivity(oid, req.user.id, "eliminar", "encuesta_satisfaccion", req.params.id);
  res.flash("Encuesta eliminada");
  res.redirect("/satisfaccion");
});

module.exports = router;
