const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, "../uploads/evidence");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_"))
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(jpg|jpeg|png|gif|pdf|doc|docx|xls|xlsx|mp4|webm|zip)$/i.test(file.originalname);
    cb(null, ok);
  }
});

function getEvaluator(req) {
  return getDb().prepare("SELECT * FROM evaluators WHERE user_id=? AND org_id=?").get(req.user.id, req.user.org_id);
}

// ──────────────── DASHBOARD ────────────────
router.get("/", (req, res) => {
  const db = getDb();
  const ev = getEvaluator(req);
  if (!ev) return res.render("portal/dashboard", { evaluator: null, stats: {}, evaluations: [], alerts: [], conflicts: 0, reviews: [] });

  const oid = req.user.org_id;
  const evaluations = db.prepare(
    `SELECT e.*, c.name as candidate_name, c.rut as candidate_rut,
     p.name as profile_name, p.code as profile_code
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     WHERE e.evaluator_id=? AND e.org_id=?
     ORDER BY CASE e.status WHEN 'programada' THEN 1 WHEN 'en_proceso' THEN 2 WHEN 'completada' THEN 3 ELSE 4 END, e.scheduled_date ASC`
  ).all(ev.id, oid);

  const stats = {
    total: evaluations.length,
    programadas: evaluations.filter(e => e.status === "programada").length,
    en_proceso: evaluations.filter(e => e.status === "en_proceso").length,
    completadas: evaluations.filter(e => e.status === "completada").length,
    competentes: evaluations.filter(e => e.result === "competente").length,
    no_competentes: evaluations.filter(e => e.result === "aun_no_competente").length,
  };
  stats.tasa = stats.completadas > 0 ? ((stats.competentes / stats.completadas) * 100).toFixed(0) : null;

  const alerts = [];
  if (ev.djs_expiry) {
    const days = Math.ceil((new Date(ev.djs_expiry) - new Date()) / 86400000);
    if (days < 0) alerts.push({ type: "danger", icon: "exclamation-octagon", text: "Tu DJS esta vencida. Contacta al CEC para renovarla." });
    else if (days <= 30) alerts.push({ type: "warning", icon: "clock-history", text: `Tu DJS vence en ${days} dias (${ev.djs_expiry}).` });
  }
  if (stats.programadas > 0) alerts.push({ type: "info", icon: "calendar-event", text: `${stats.programadas} evaluacion(es) programada(s) pendiente(s).` });

  const conflicts = db.prepare("SELECT COUNT(*) as c FROM conflicts_of_interest WHERE evaluator_id=? AND org_id=?").get(ev.id, oid).c;

  const reviews = db.prepare(
    "SELECT * FROM evaluator_reviews WHERE evaluator_id=? AND org_id=? ORDER BY created_at DESC LIMIT 3"
  ).all(ev.id, oid);

  res.render("portal/dashboard", { evaluator: ev, stats, evaluations, alerts, conflicts, reviews });
});

// ──────────────── MIS EVALUACIONES (detalle) ────────────────
router.get("/evaluacion/:id", (req, res) => {
  const db = getDb();
  const ev = getEvaluator(req);
  if (!ev) return res.redirect("/portal");
  const oid = req.user.org_id;

  const evaluation = db.prepare(
    `SELECT e.*, c.name as candidate_name, c.rut as candidate_rut,
     p.name as profile_name, p.code as profile_code, p.sector as profile_sector
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     WHERE e.id=? AND e.evaluator_id=? AND e.org_id=?`
  ).get(req.params.id, ev.id, oid);
  if (!evaluation) return res.redirect("/portal");

  const evidence = db.prepare(
    "SELECT * FROM evidence WHERE evaluation_id=? AND org_id=? ORDER BY uploaded_at DESC"
  ).all(req.params.id, oid);

  res.render("portal/evaluacion", { evaluation, evidence, evaluator: ev });
});

// ──────────────── INSTRUMENTOS — llenar puntajes ────────────────
router.post("/evaluacion/:id/instrumentos", (req, res) => {
  const db = getDb();
  const ev = getEvaluator(req);
  if (!ev) return res.redirect("/portal");

  const evaluation = db.prepare(
    "SELECT id FROM evaluations WHERE id=? AND evaluator_id=? AND org_id=? AND status IN ('programada','en_proceso')"
  ).get(req.params.id, ev.id, req.user.org_id);
  if (!evaluation) return res.redirect("/portal");

  const { score_conocimientos, score_jefe_directo, score_terreno, score_evidencias, tipo_jefe, tipo_terreno, observations, plan_trabajo } = req.body;

  const sc = parseFloat(score_conocimientos) || null;
  const sj = parseFloat(score_jefe_directo) || null;
  const st = parseFloat(score_terreno) || null;
  const se = parseFloat(score_evidencias) || null;

  let ponderado = null;
  const scores = [sc, sj, st, se].filter(s => s !== null);
  if (scores.length > 0) {
    const weights = [0.20, 0.25, 0.30, 0.25];
    const vals = [sc, sj, st, se];
    let sum = 0, wsum = 0;
    vals.forEach((v, i) => { if (v !== null) { sum += v * weights[i]; wsum += weights[i]; } });
    ponderado = wsum > 0 ? sum / wsum : null;
  }

  db.prepare(
    `UPDATE evaluations SET
     score_conocimientos=?, score_jefe_directo=?, score_terreno=?, score_evidencias=?,
     score_ponderado=?, tipo_jefe=?, tipo_terreno=?, observations=?, plan_trabajo=?,
     status=CASE WHEN status='programada' THEN 'en_proceso' ELSE status END
     WHERE id=?`
  ).run(sc, sj, st, se, ponderado, tipo_jefe || "jefe_directo", tipo_terreno || "terreno", observations || null, plan_trabajo || null, req.params.id);

  logActivity(req.user.org_id, req.user.id, "evaluar_instrumentos", "evaluacion", req.params.id);
  res.flash("Instrumentos guardados");
  res.redirect("/portal/evaluacion/" + req.params.id);
});

// ──────────────── EVIDENCIAS — subir ────────────────
router.get("/evidencias", (req, res) => {
  const db = getDb();
  const ev = getEvaluator(req);
  if (!ev) return res.redirect("/portal");

  const evidence = db.prepare(
    `SELECT ev.*, e.id as eval_id, c.name as candidate_name, p.name as profile_name
     FROM evidence ev
     JOIN evaluations e ON ev.evaluation_id=e.id
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     WHERE e.evaluator_id=? AND ev.org_id=?
     ORDER BY ev.uploaded_at DESC`
  ).all(ev.id, req.user.org_id);

  const evaluations = db.prepare(
    `SELECT e.id, c.name as candidate_name FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     WHERE e.evaluator_id=? AND e.org_id=? AND e.status IN ('programada','en_proceso')
     ORDER BY e.scheduled_date`
  ).all(ev.id, req.user.org_id);

  res.render("portal/evidencias", { evidence, evaluations, evaluator: ev });
});

router.post("/evidencias/subir", upload.single("archivo"), (req, res) => {
  const db = getDb();
  const ev = getEvaluator(req);
  if (!ev) return res.redirect("/portal");

  const { evaluation_id, criterion, type } = req.body;
  const evaluation = db.prepare(
    "SELECT id FROM evaluations WHERE id=? AND evaluator_id=? AND org_id=?"
  ).get(evaluation_id, ev.id, req.user.org_id);
  if (!evaluation) { res.flash("Evaluacion no valida"); return res.redirect("/portal/evidencias"); }

  if (!req.file) { res.flash("Selecciona un archivo"); return res.redirect("/portal/evidencias"); }

  db.prepare(
    "INSERT INTO evidence (evaluation_id, org_id, criterion, type, file_path, file_name, file_size, uploaded_by) VALUES (?,?,?,?,?,?,?,?)"
  ).run(evaluation_id, req.user.org_id, criterion || null, type || "documento", req.file.path, req.file.originalname, req.file.size, req.user.id);

  logActivity(req.user.org_id, req.user.id, "subir_evidencia", "evidence", evaluation_id);
  res.flash("Evidencia subida correctamente");
  res.redirect("/portal/evidencias");
});

// ──────────────── MI DJS ────────────────
router.get("/djs", (req, res) => {
  const ev = getEvaluator(req);
  if (!ev) return res.redirect("/portal");

  const reviews = getDb().prepare(
    "SELECT * FROM evaluator_reviews WHERE evaluator_id=? AND org_id=? ORDER BY created_at DESC"
  ).all(ev.id, req.user.org_id);

  const evaluations = getDb().prepare(
    `SELECT COUNT(*) as total,
     SUM(CASE WHEN result='competente' THEN 1 ELSE 0 END) as competentes,
     SUM(CASE WHEN result='aun_no_competente' THEN 1 ELSE 0 END) as no_competentes
     FROM evaluations WHERE evaluator_id=? AND org_id=? AND status='completada'`
  ).get(ev.id, req.user.org_id);

  res.render("portal/djs", { evaluator: ev, reviews, evaluations });
});

// ──────────────── CONFLICTOS ────────────────
router.get("/conflictos", (req, res) => {
  const db = getDb();
  const ev = getEvaluator(req);
  if (!ev) return res.redirect("/portal");

  const conflicts = db.prepare(
    `SELECT coi.*, c.name as candidate_name
     FROM conflicts_of_interest coi
     LEFT JOIN candidates c ON coi.candidate_id=c.id
     WHERE coi.evaluator_id=? AND coi.org_id=?
     ORDER BY coi.created_at DESC`
  ).all(ev.id, req.user.org_id);

  const candidates = db.prepare(
    "SELECT id, name FROM candidates WHERE org_id=? ORDER BY name"
  ).all(req.user.org_id);

  res.render("portal/conflictos", { conflicts, candidates, evaluator: ev });
});

router.post("/conflictos", (req, res) => {
  const db = getDb();
  const ev = getEvaluator(req);
  if (!ev) return res.redirect("/portal");

  const { candidate_id, type, description } = req.body;
  if (!type) { res.flash("Tipo de conflicto requerido"); return res.redirect("/portal/conflictos"); }

  db.prepare(
    "INSERT INTO conflicts_of_interest (org_id, evaluator_id, candidate_id, type, description, declaration_date, status) VALUES (?,?,?,?,?,date('now'),'declarado')"
  ).run(req.user.org_id, ev.id, candidate_id || null, type, description || null);

  logActivity(req.user.org_id, req.user.id, "declarar_conflicto", "conflicts_of_interest", ev.id);
  res.flash("Conflicto de interes declarado");
  res.redirect("/portal/conflictos");
});

// ──────────────── MI PERFIL ────────────────
router.get("/perfil", (req, res) => {
  const ev = getEvaluator(req);
  if (!ev) return res.redirect("/portal");

  const stats = getDb().prepare(
    `SELECT COUNT(*) as total,
     SUM(CASE WHEN status='completada' THEN 1 ELSE 0 END) as completadas,
     SUM(CASE WHEN result='competente' THEN 1 ELSE 0 END) as competentes,
     MIN(scheduled_date) as primera, MAX(completed_at) as ultima
     FROM evaluations WHERE evaluator_id=? AND org_id=?`
  ).get(ev.id, req.user.org_id);

  res.render("portal/perfil", { evaluator: ev, stats });
});

router.post("/perfil", (req, res) => {
  const ev = getEvaluator(req);
  if (!ev) return res.redirect("/portal");
  const { specialties, habilitacion_cv } = req.body;
  getDb().prepare("UPDATE evaluators SET specialties=?, habilitacion_cv=? WHERE id=? AND org_id=?")
    .run(specialties || null, habilitacion_cv || null, ev.id, req.user.org_id);
  res.flash("Perfil actualizado");
  res.redirect("/portal/perfil");
});

// ──────────────── PORTAFOLIO (historial) ────────────────
router.get("/portafolio", (req, res) => {
  const db = getDb();
  const ev = getEvaluator(req);
  if (!ev) return res.redirect("/portal");

  const { year, result } = req.query;
  let where = "e.evaluator_id=? AND e.org_id=? AND e.status='completada'";
  const params = [ev.id, req.user.org_id];
  if (year) { where += " AND strftime('%Y', e.completed_at)=?"; params.push(year); }
  if (result) { where += " AND e.result=?"; params.push(result); }

  const evaluations = db.prepare(
    `SELECT e.*, c.name as candidate_name, p.name as profile_name, p.code as profile_code, p.sector as profile_sector
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     WHERE ${where} ORDER BY e.completed_at DESC`
  ).all(...params);

  const years = db.prepare(
    "SELECT DISTINCT strftime('%Y', completed_at) as y FROM evaluations WHERE evaluator_id=? AND org_id=? AND status='completada' ORDER BY y DESC"
  ).all(ev.id, req.user.org_id).map(r => r.y);

  const totals = db.prepare(
    `SELECT COUNT(*) as total,
     SUM(CASE WHEN result='competente' THEN 1 ELSE 0 END) as competentes,
     SUM(CASE WHEN result='aun_no_competente' THEN 1 ELSE 0 END) as no_competentes,
     AVG(score_ponderado) as avg_score
     FROM evaluations WHERE evaluator_id=? AND org_id=? AND status='completada'`
  ).get(ev.id, req.user.org_id);

  const byProfile = db.prepare(
    `SELECT p.name as profile, COUNT(*) as total,
     SUM(CASE WHEN e.result='competente' THEN 1 ELSE 0 END) as competentes
     FROM evaluations e LEFT JOIN profiles p ON e.profile_id=p.id
     WHERE e.evaluator_id=? AND e.org_id=? AND e.status='completada'
     GROUP BY e.profile_id ORDER BY total DESC`
  ).all(ev.id, req.user.org_id);

  res.render("portal/portafolio", { evaluations, years, totals, byProfile, filters: { year, result }, evaluator: ev });
});

module.exports = router;
