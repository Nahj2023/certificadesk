const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { getDb, logActivity, logDataTreatment } = require("../database/db");
const { validatePassword } = require("../middleware/auth");
const { anonymize } = require("../services/crypto");

// GET /admin/usuarios
router.get("/usuarios", (req, res) => {
  const users = getDb()
    .prepare(
      `SELECT u.*, o.name as org_name FROM users u
       JOIN organizations o ON u.org_id = o.id
       WHERE u.org_id = ? ORDER BY u.created_at DESC`
    )
    .all(req.user.org_id);
  res.render("admin/users", { title: "Usuarios", users });
});

// GET /admin/usuarios/nuevo
router.get("/usuarios/nuevo", (req, res) => {
  res.render("admin/user-form", {
    title: "Nuevo usuario",
    editUser: null,
    roles: getRoles(),
    error: null,
  });
});

// POST /admin/usuarios
router.post("/usuarios", (req, res) => {
  const { username, display_name, email, password, role } = req.body;
  if (!username || !display_name || !password) {
    return res.render("admin/user-form", {
      title: "Nuevo usuario",
      editUser: null,
      roles: getRoles(),
      error: "Complete todos los campos obligatorios",
    });
  }
  const pwError = validatePassword(password);
  if (pwError) {
    return res.render("admin/user-form", {
      title: "Nuevo usuario",
      editUser: null,
      roles: getRoles(),
      error: pwError,
    });
  }
  const exists = getDb()
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username);
  if (exists) {
    return res.render("admin/user-form", {
      title: "Nuevo usuario",
      editUser: null,
      roles: getRoles(),
      error: "El usuario ya existe",
    });
  }
  const hash = bcrypt.hashSync(password, 10);
  const result = getDb()
    .prepare(
      `INSERT INTO users (org_id, username, password, display_name, role, email)
       VALUES (?,?,?,?,?,?)`
    )
    .run(req.user.org_id, username, hash, display_name, role || "consulta", email || null);
  logActivity(req.user.org_id, req.user.id, "create_user", "users", result.lastInsertRowid, null, req.ip);
  res.flash("Usuario creado correctamente");
  res.redirect("/admin/usuarios");
});

// GET /admin/usuarios/:id/editar
router.get("/usuarios/:id/editar", (req, res) => {
  const editUser = getDb()
    .prepare("SELECT * FROM users WHERE id = ? AND org_id = ?")
    .get(req.params.id, req.user.org_id);
  if (!editUser) return res.redirect("/admin/usuarios");
  res.render("admin/user-form", {
    title: "Editar usuario",
    editUser,
    roles: getRoles(),
    error: null,
  });
});

// POST /admin/usuarios/:id
router.post("/usuarios/:id", (req, res) => {
  const { display_name, email, role } = req.body;
  const target = getDb()
    .prepare("SELECT * FROM users WHERE id = ? AND org_id = ?")
    .get(req.params.id, req.user.org_id);
  if (!target) return res.redirect("/admin/usuarios");
  getDb()
    .prepare(
      "UPDATE users SET display_name = ?, email = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .run(display_name, email || null, role, target.id);
  logActivity(req.user.org_id, req.user.id, "update_user", "users", target.id, `role=${role}`, req.ip);
  res.flash("Usuario actualizado");
  res.redirect("/admin/usuarios");
});

// POST /admin/usuarios/:id/password
router.post("/usuarios/:id/password", (req, res) => {
  const { password } = req.body;
  const target = getDb()
    .prepare("SELECT * FROM users WHERE id = ? AND org_id = ?")
    .get(req.params.id, req.user.org_id);
  if (!target) return res.redirect("/admin/usuarios");
  const pwError = validatePassword(password);
  if (pwError) {
    return res.render("admin/user-form", {
      title: "Editar usuario",
      editUser: target,
      roles: getRoles(),
      error: pwError,
    });
  }
  const hash = bcrypt.hashSync(password, 10);
  const newVersion = (target.token_version || 1) + 1;
  getDb()
    .prepare("UPDATE users SET password = ?, token_version = ? WHERE id = ?")
    .run(hash, newVersion, target.id);
  logActivity(req.user.org_id, req.user.id, "reset_password", "users", target.id, null, req.ip);
  res.flash("Contrasena actualizada — sesiones anteriores invalidadas");
  res.redirect("/admin/usuarios");
});

// POST /admin/usuarios/:id/toggle
router.post("/usuarios/:id/toggle", (req, res) => {
  const target = getDb()
    .prepare("SELECT * FROM users WHERE id = ? AND org_id = ?")
    .get(req.params.id, req.user.org_id);
  if (!target || target.id === req.user.id) return res.redirect("/admin/usuarios");
  const newActive = target.active ? 0 : 1;
  getDb().prepare("UPDATE users SET active = ? WHERE id = ?").run(newActive, target.id);
  if (!newActive) {
    const newVersion = (target.token_version || 1) + 1;
    getDb().prepare("UPDATE users SET token_version = ? WHERE id = ?").run(newVersion, target.id);
  }
  logActivity(req.user.org_id, req.user.id, newActive ? "activate_user" : "deactivate_user", "users", target.id, null, req.ip);
  res.flash(newActive ? "Usuario activado" : "Usuario desactivado");
  res.redirect("/admin/usuarios");
});

// GET /admin/logs
router.get("/logs", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;
  const total = getDb()
    .prepare("SELECT COUNT(*) as c FROM activity_log WHERE org_id = ?")
    .get(req.user.org_id).c;
  const logs = getDb()
    .prepare(
      `SELECT a.*, u.display_name as user_name
       FROM activity_log a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.org_id = ?
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(req.user.org_id, limit, offset);
  res.render("admin/access-log", {
    title: "Log de acceso",
    logs,
    page,
    totalPages: Math.ceil(total / limit),
    total,
  });
});

// ── ARCO ──
router.get("/arco", (req, res) => {
  const requests = getDb()
    .prepare("SELECT * FROM arco_requests ORDER BY created_at DESC")
    .all();
  res.render("admin/arco", { title: "Solicitudes ARCO", requests });
});

router.post("/arco/:id/responder", (req, res) => {
  const { response } = req.body;
  getDb()
    .prepare(
      "UPDATE arco_requests SET status='completada', response=?, responded_by=?, responded_at=CURRENT_TIMESTAMP WHERE id=?"
    )
    .run(response, req.user.id, req.params.id);
  logActivity(req.user.org_id, req.user.id, "respond_arco", "arco_requests", parseInt(req.params.id), null, req.ip);
  res.flash("Solicitud ARCO respondida");
  res.redirect("/admin/arco");
});

// ── Retencion ──
router.get("/retencion", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const org = db.prepare("SELECT retention_years FROM organizations WHERE id=?").get(oid);
  const retention_years = org?.retention_years || 5;

  const stats = {
    total: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=? AND anonymized=0").get(oid).c,
    expired: db.prepare(
      `SELECT COUNT(*) as c FROM candidates WHERE org_id=? AND anonymized=0
       AND created_at < datetime('now', '-' || ? || ' years')`
    ).get(oid, retention_years).c,
    anonymized: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=? AND anonymized=1").get(oid).c,
  };

  const treatments = db
    .prepare(
      `SELECT d.*, u.display_name as user_name FROM data_treatment_log d
       LEFT JOIN users u ON d.user_id=u.id WHERE d.org_id=?
       ORDER BY d.created_at DESC LIMIT 50`
    )
    .all(oid);

  res.render("admin/retention", { title: "Retencion de datos", retention_years, stats, treatments });
});

router.post("/retencion", (req, res) => {
  const years = parseInt(req.body.retention_years) || 5;
  getDb()
    .prepare("UPDATE organizations SET retention_years=? WHERE id=?")
    .run(Math.max(1, Math.min(20, years)), req.user.org_id);
  logActivity(req.user.org_id, req.user.id, "update_retention", "organizations", req.user.org_id, `years=${years}`, req.ip);
  res.flash("Periodo de retencion actualizado");
  res.redirect("/admin/retencion");
});

router.post("/retencion/ejecutar", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const org = db.prepare("SELECT retention_years FROM organizations WHERE id=?").get(oid);
  const years = org?.retention_years || 5;

  const expired = db
    .prepare(
      `SELECT id, name FROM candidates WHERE org_id=? AND anonymized=0
       AND created_at < datetime('now', '-' || ? || ' years')`
    )
    .all(oid, years);

  let count = 0;
  for (const c of expired) {
    const anonName = "Anonimizado-" + anonymize(c.name);
    db.prepare(
      `UPDATE candidates SET name=?, rut=NULL, email=NULL, phone=NULL, notes=NULL,
       anonymized=1, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).run(anonName, c.id);
    logDataTreatment(oid, req.user.id, "anonymize", "candidato", c.id, "rut,email,phone,name,notes", "retencion_automatica", req.ip);
    count++;
  }

  logActivity(oid, req.user.id, "run_retention", "candidates", null, `${count} anonimizados`, req.ip);
  res.flash(`${count} registro${count !== 1 ? "s" : ""} anonimizado${count !== 1 ? "s" : ""}`);
  res.redirect("/admin/retencion");
});

function getRoles() {
  return [
    { value: "admin", label: "Administrador", desc: "Acceso total + gestion usuarios" },
    { value: "responsable", label: "Responsable CEC", desc: "Todas las operaciones" },
    { value: "evaluador", label: "Evaluador", desc: "Evaluaciones, evidencias, conflictos" },
    { value: "consulta", label: "Consulta", desc: "Solo lectura" },
  ];
}

module.exports = router;
