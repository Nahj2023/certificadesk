const router = require("express").Router();
const { getDb, logActivity, logDataTreatment } = require("../database/db");
const { encrypt, decryptRecord, decryptAll, anonymize } = require("../services/crypto");

const PII_FIELDS = ["rut", "email", "phone"];

router.get("/", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const { status, q } = req.query;

  let sql = `SELECT c.*, p.name as profile_name FROM candidates c
    LEFT JOIN profiles p ON c.profile_id = p.id WHERE c.org_id = ? AND c.anonymized = 0`;
  const params = [oid];

  if (status) {
    sql += " AND c.status = ?";
    params.push(status);
  }
  sql += " ORDER BY c.created_at DESC";

  let candidates = decryptAll(db.prepare(sql).all(...params), PII_FIELDS);

  if (q) {
    const ql = q.toLowerCase();
    candidates = candidates.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(ql)) ||
        (c.rut && c.rut.toLowerCase().includes(ql)) ||
        (c.email && c.email.toLowerCase().includes(ql))
    );
  }

  const statuses = [
    "registrado",
    "elegible",
    "evaluando",
    "pendiente_comite",
    "certificado",
    "no_certificado",
    "apelacion",
  ];
  res.render("candidates/list", { candidates, statuses, filters: { status, q } });
});

router.get("/nuevo", (req, res) => {
  const profiles = getDb()
    .prepare("SELECT * FROM profiles WHERE active=1 ORDER BY name")
    .all();
  res.render("candidates/form", { candidate: null, profiles, error: null });
});

router.post("/", (req, res) => {
  const db = getDb();
  const {
    rut, name, email, phone, region, education_level,
    work_experience_years, profile_id, notes, consent,
  } = req.body;

  if (!consent) {
    const profiles = db.prepare("SELECT * FROM profiles WHERE active=1 ORDER BY name").all();
    return res.render("candidates/form", {
      candidate: req.body,
      profiles,
      error: "Debe obtener consentimiento informado del candidato antes de registrar sus datos",
    });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO candidates (org_id, rut, name, email, phone, region, education_level,
         work_experience_years, profile_id, notes, created_by, consent_given, consent_date, consent_ip)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,?)`
      )
      .run(
        req.user.org_id,
        encrypt(rut),
        name,
        encrypt(email),
        encrypt(phone),
        region,
        education_level,
        parseInt(work_experience_years) || 0,
        profile_id || null,
        notes,
        req.user.id,
        req.ip
      );

    logActivity(req.user.org_id, req.user.id, "crear", "candidato", result.lastInsertRowid, name, req.ip);
    logDataTreatment(req.user.org_id, req.user.id, "write", "candidato", result.lastInsertRowid, "rut,email,phone", "registro_candidato", req.ip);
    res.flash("Candidato creado exitosamente");
    res.redirect("/candidatos");
  } catch (e) {
    const profiles = db.prepare("SELECT * FROM profiles WHERE active=1 ORDER BY name").all();
    res.render("candidates/form", { candidate: req.body, profiles, error: e.message });
  }
});

router.get("/:id", (req, res) => {
  const db = getDb();
  const raw = db
    .prepare(
      `SELECT c.*, p.name as profile_name FROM candidates c
       LEFT JOIN profiles p ON c.profile_id=p.id WHERE c.id=? AND c.org_id=?`
    )
    .get(req.params.id, req.user.org_id);
  if (!raw) return res.redirect("/candidatos");

  const candidate = decryptRecord(raw, PII_FIELDS);

  const evaluations = db
    .prepare(
      `SELECT e.*, ev.name as evaluator_name FROM evaluations e
       LEFT JOIN evaluators ev ON e.evaluator_id=ev.id WHERE e.candidate_id=? ORDER BY e.scheduled_date DESC`
    )
    .all(candidate.id);

  const decisions = db
    .prepare(
      `SELECT cd.*, u.display_name as decided_by_name FROM certification_decisions cd
       LEFT JOIN users u ON cd.decided_by=u.id WHERE cd.candidate_id=? ORDER BY cd.created_at DESC`
    )
    .all(candidate.id);

  logDataTreatment(req.user.org_id, req.user.id, "read", "candidato", candidate.id, "rut,email,phone,name", "consulta_detalle", req.ip);
  res.render("candidates/detail", { candidate, evaluations, decisions });
});

router.get("/:id/editar", (req, res) => {
  const db = getDb();
  const raw = db
    .prepare("SELECT * FROM candidates WHERE id=? AND org_id=?")
    .get(req.params.id, req.user.org_id);
  if (!raw) return res.redirect("/candidatos");
  const candidate = decryptRecord(raw, PII_FIELDS);
  const profiles = db.prepare("SELECT * FROM profiles WHERE active=1 ORDER BY name").all();
  res.render("candidates/form", { candidate, profiles, error: null });
});

router.post("/:id/elegibilidad", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const candidate = db
    .prepare("SELECT * FROM candidates WHERE id=? AND org_id=?")
    .get(req.params.id, oid);
  if (!candidate || candidate.status !== "registrado")
    return res.redirect(`/candidatos/${req.params.id}`);

  const {
    charla_informativa, entrevista_inicial, entrevista_notas,
    carta_compromiso, autorizacion_chilevalora, autorizacion_jefe,
    cedula_identidad, cv_entregado, informe_elegibilidad,
    perfil_verificado, requisitos_cumplidos, documentacion_ok, sin_conflictos,
  } = req.body;

  if (!perfil_verificado || !requisitos_cumplidos || !documentacion_ok || !sin_conflictos) {
    return res.redirect(`/candidatos/${req.params.id}?error=elegibilidad`);
  }

  db.prepare(
    `UPDATE candidates SET
    status='elegible',
    charla_informativa=?, entrevista_inicial=?, entrevista_notas=?,
    carta_compromiso=?, autorizacion_chilevalora=?, autorizacion_jefe=?,
    cedula_identidad=?, cv_entregado=?, informe_elegibilidad=?,
    updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND org_id=?`
  ).run(
    charla_informativa || null,
    entrevista_inicial || null,
    entrevista_notas || null,
    carta_compromiso ? 1 : 0,
    autorizacion_chilevalora ? 1 : 0,
    autorizacion_jefe ? 1 : 0,
    cedula_identidad ? 1 : 0,
    cv_entregado ? 1 : 0,
    informe_elegibilidad || null,
    req.params.id,
    oid
  );

  res.flash("Candidato marcado como elegible");
  logActivity(oid, req.user.id, "elegibilidad", "candidato", req.params.id, null, req.ip);
  res.redirect(`/candidatos/${req.params.id}`);
});

router.post("/:id", (req, res) => {
  const db = getDb();
  const {
    rut, name, email, phone, region, education_level,
    work_experience_years, profile_id, status, notes,
  } = req.body;
  db.prepare(
    `UPDATE candidates SET rut=?, name=?, email=?, phone=?, region=?, education_level=?,
     work_experience_years=?, profile_id=?, status=?, notes=?, updated_at=CURRENT_TIMESTAMP
     WHERE id=? AND org_id=?`
  ).run(
    encrypt(rut),
    name,
    encrypt(email),
    encrypt(phone),
    region,
    education_level,
    parseInt(work_experience_years) || 0,
    profile_id || null,
    status,
    notes,
    req.params.id,
    req.user.org_id
  );

  logActivity(req.user.org_id, req.user.id, "editar", "candidato", req.params.id, name, req.ip);
  logDataTreatment(req.user.org_id, req.user.id, "write", "candidato", parseInt(req.params.id), "rut,email,phone", "edicion_candidato", req.ip);
  res.flash("Candidato actualizado");
  res.redirect(`/candidatos/${req.params.id}`);
});

router.post("/:id/eliminar", (req, res) => {
  const db = getDb();
  const candidate = db
    .prepare("SELECT * FROM candidates WHERE id=? AND org_id=?")
    .get(req.params.id, req.user.org_id);
  if (!candidate) return res.redirect("/candidatos");

  const anonName = "Anonimizado-" + anonymize(candidate.name);
  db.prepare(
    `UPDATE candidates SET
     name=?, rut=NULL, email=NULL, phone=NULL, notes=NULL,
     anonymized=1, updated_at=CURRENT_TIMESTAMP
     WHERE id=? AND org_id=?`
  ).run(anonName, req.params.id, req.user.org_id);

  logActivity(req.user.org_id, req.user.id, "anonimizar", "candidato", req.params.id, null, req.ip);
  logDataTreatment(req.user.org_id, req.user.id, "anonymize", "candidato", parseInt(req.params.id), "rut,email,phone,name,notes", "eliminacion_datos", req.ip);
  res.flash("Datos del candidato anonimizados");
  res.redirect("/candidatos");
});

module.exports = router;
