const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

router.get("/", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const { status, q } = req.query;

  let sql = `SELECT c.*, p.name as profile_name FROM candidates c
    LEFT JOIN profiles p ON c.profile_id = p.id WHERE c.org_id = ?`;
  const params = [oid];

  if (status) { sql += " AND c.status = ?"; params.push(status); }
  if (q) { sql += " AND (c.name LIKE ? OR c.rut LIKE ? OR c.email LIKE ?)"; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += " ORDER BY c.created_at DESC";

  const candidates = db.prepare(sql).all(...params);
  const statuses = ["registrado", "elegible", "evaluando", "pendiente_comite", "certificado", "no_certificado", "apelacion"];
  res.render("candidates/list", { candidates, statuses, filters: { status, q } });
});

router.get("/nuevo", (req, res) => {
  const profiles = getDb().prepare("SELECT * FROM profiles WHERE active=1 ORDER BY name").all();
  res.render("candidates/form", { candidate: null, profiles, error: null });
});

router.post("/", (req, res) => {
  const db = getDb();
  const { rut, name, email, phone, region, education_level, work_experience_years, profile_id, notes } = req.body;

  try {
    const result = db.prepare(
      `INSERT INTO candidates (org_id, rut, name, email, phone, region, education_level, work_experience_years, profile_id, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(req.user.org_id, rut, name, email, phone, region, education_level, parseInt(work_experience_years)||0, profile_id||null, notes, req.user.id);

    res.flash("Candidato creado exitosamente");
    logActivity(req.user.org_id, req.user.id, "crear", "candidato", result.lastInsertRowid, name);
    res.redirect("/candidatos");
  } catch (e) {
    const profiles = db.prepare("SELECT * FROM profiles WHERE active=1 ORDER BY name").all();
    res.render("candidates/form", { candidate: req.body, profiles, error: e.message });
  }
});

router.get("/:id", (req, res) => {
  const db = getDb();
  const candidate = db.prepare(
    `SELECT c.*, p.name as profile_name FROM candidates c
     LEFT JOIN profiles p ON c.profile_id=p.id WHERE c.id=? AND c.org_id=?`
  ).get(req.params.id, req.user.org_id);
  if (!candidate) return res.redirect("/candidatos");

  const evaluations = db.prepare(
    `SELECT e.*, ev.name as evaluator_name FROM evaluations e
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id WHERE e.candidate_id=? ORDER BY e.scheduled_date DESC`
  ).all(candidate.id);

  const decisions = db.prepare(
    `SELECT cd.*, u.display_name as decided_by_name FROM certification_decisions cd
     LEFT JOIN users u ON cd.decided_by=u.id WHERE cd.candidate_id=? ORDER BY cd.created_at DESC`
  ).all(candidate.id);

  res.render("candidates/detail", { candidate, evaluations, decisions });
});

router.get("/:id/editar", (req, res) => {
  const db = getDb();
  const candidate = db.prepare("SELECT * FROM candidates WHERE id=? AND org_id=?").get(req.params.id, req.user.org_id);
  if (!candidate) return res.redirect("/candidatos");
  const profiles = db.prepare("SELECT * FROM profiles WHERE active=1 ORDER BY name").all();
  res.render("candidates/form", { candidate, profiles, error: null });
});

// Elegibilidad mejorada — Manual del Candidato D016 Proc 1.1
router.post("/:id/elegibilidad", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const candidate = db.prepare("SELECT * FROM candidates WHERE id=? AND org_id=?").get(req.params.id, oid);
  if (!candidate || candidate.status !== 'registrado') return res.redirect(`/candidatos/${req.params.id}`);

  const { charla_informativa, entrevista_inicial, entrevista_notas,
          carta_compromiso, autorizacion_chilevalora, autorizacion_jefe,
          cedula_identidad, cv_entregado, informe_elegibilidad,
          perfil_verificado, requisitos_cumplidos, documentacion_ok, sin_conflictos } = req.body;

  // Validar requisitos minimos
  if (!perfil_verificado || !requisitos_cumplidos || !documentacion_ok || !sin_conflictos) {
    return res.redirect(`/candidatos/${req.params.id}?error=elegibilidad`);
  }

  db.prepare(`UPDATE candidates SET
    status='elegible',
    charla_informativa=?, entrevista_inicial=?, entrevista_notas=?,
    carta_compromiso=?, autorizacion_chilevalora=?, autorizacion_jefe=?,
    cedula_identidad=?, cv_entregado=?, informe_elegibilidad=?,
    updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND org_id=?`
  ).run(
    charla_informativa || null, entrevista_inicial || null, entrevista_notas || null,
    carta_compromiso ? 1 : 0, autorizacion_chilevalora ? 1 : 0, autorizacion_jefe ? 1 : 0,
    cedula_identidad ? 1 : 0, cv_entregado ? 1 : 0, informe_elegibilidad || null,
    req.params.id, oid
  );

  res.flash("Candidato marcado como elegible");
  logActivity(oid, req.user.id, "elegibilidad", "candidato", req.params.id, `${candidate.name} marcado elegible`);
  res.redirect(`/candidatos/${req.params.id}`);
});

router.post("/:id", (req, res) => {
  const db = getDb();
  const { rut, name, email, phone, region, education_level, work_experience_years, profile_id, status, notes } = req.body;
  db.prepare(
    `UPDATE candidates SET rut=?, name=?, email=?, phone=?, region=?, education_level=?,
     work_experience_years=?, profile_id=?, status=?, notes=?, updated_at=CURRENT_TIMESTAMP
     WHERE id=? AND org_id=?`
  ).run(rut, name, email, phone, region, education_level, parseInt(work_experience_years)||0, profile_id||null, status, notes, req.params.id, req.user.org_id);

  res.flash("Candidato actualizado");
  logActivity(req.user.org_id, req.user.id, "editar", "candidato", req.params.id, name);
  res.redirect(`/candidatos/${req.params.id}`);
});

router.post("/:id/eliminar", (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM candidates WHERE id=? AND org_id=?").run(req.params.id, req.user.org_id);
  res.flash("Candidato eliminado");
  logActivity(req.user.org_id, req.user.id, "eliminar", "candidato", req.params.id);
  res.redirect("/candidatos");
});

module.exports = router;
