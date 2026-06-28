const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

const TRAMOS = {
  contrato: [
    { tramo: 1, label: '90% / Entre 0-10 UTM', pct: 90 },
    { tramo: 2, label: '70% / Entre 10-25 UTM', pct: 70 },
    { tramo: 3, label: '50% / Entre 25-50 UTM', pct: 50 },
    { tramo: 4, label: '0% / Mayor de 50 UTM', pct: 0 },
  ],
  pre_contrato: [
    { tramo: 5, label: '100% / Pre Contrato', pct: 100 },
  ],
  post_contrato: [
    { tramo: 1, label: '90% / Entre 0-10 UTM', pct: 90 },
    { tramo: 2, label: '70% / Entre 10-25 UTM', pct: 70 },
  ],
};

const ESTADOS = ['borrador', 'comunicada', 'autorizada', 'evaluada', 'pre_liquidada', 'liquidada', 'rechazada'];

// Dashboard Franquicia
router.get("/", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;

  const stats = {
    total: db.prepare("SELECT COUNT(*) as c FROM acciones_ft WHERE org_id=?").get(oid).c,
    borrador: db.prepare("SELECT COUNT(*) as c FROM acciones_ft WHERE org_id=? AND estado='borrador'").get(oid).c,
    comunicadas: db.prepare("SELECT COUNT(*) as c FROM acciones_ft WHERE org_id=? AND estado='comunicada'").get(oid).c,
    autorizadas: db.prepare("SELECT COUNT(*) as c FROM acciones_ft WHERE org_id=? AND estado='autorizada'").get(oid).c,
    evaluadas: db.prepare("SELECT COUNT(*) as c FROM acciones_ft WHERE org_id=? AND estado='evaluada'").get(oid).c,
    liquidadas: db.prepare("SELECT COUNT(*) as c FROM acciones_ft WHERE org_id=? AND estado='liquidada'").get(oid).c,
    rechazadas: db.prepare("SELECT COUNT(*) as c FROM acciones_ft WHERE org_id=? AND estado='rechazada'").get(oid).c,
  };

  const acciones = db.prepare(
    `SELECT a.*, p.name as profile_name, p.code as profile_code,
     (SELECT COUNT(*) FROM accion_ft_participantes WHERE accion_id=a.id) as participantes_count
     FROM acciones_ft a LEFT JOIN profiles p ON a.profile_id=p.id
     WHERE a.org_id=? ORDER BY a.created_at DESC LIMIT 20`
  ).all(oid);

  const proxVencer = db.prepare(
    `SELECT a.*, p.name as profile_name,
     julianday(a.fecha_termino, '+60 days') - julianday('now') as dias_restantes
     FROM acciones_ft a LEFT JOIN profiles p ON a.profile_id=p.id
     WHERE a.org_id=? AND a.estado IN ('autorizada','comunicada')
     AND julianday(a.fecha_termino, '+60 days') - julianday('now') <= 15
     ORDER BY dias_restantes ASC`
  ).all(oid);

  res.render("franquicia/index", { stats, acciones, proxVencer, ESTADOS });
});

// Nueva accion
router.get("/nueva", (req, res) => {
  const profiles = getDb().prepare("SELECT * FROM profiles WHERE active=1 ORDER BY name").all();
  res.render("franquicia/accion-form", { accion: null, profiles, TRAMOS, error: null });
});

router.post("/", (req, res) => {
  const db = getDb();
  const { empresa_rut, empresa_nombre, empresa_direccion, empresa_region, empresa_comuna,
    responsable_nombre, responsable_rut, responsable_email, responsable_telefono,
    tipo, profile_id, fecha_inicio, fecha_termino, valor_ucl, tiene_comite_bipartito, comite_programa, observaciones } = req.body;

  try {
    const r = db.prepare(
      `INSERT INTO acciones_ft (org_id, empresa_rut, empresa_nombre, empresa_direccion, empresa_region, empresa_comuna,
       responsable_nombre, responsable_rut, responsable_email, responsable_telefono,
       tipo, profile_id, fecha_inicio, fecha_termino, valor_ucl, tiene_comite_bipartito, comite_programa, observaciones, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(req.user.org_id, empresa_rut, empresa_nombre, empresa_direccion, empresa_region, empresa_comuna,
      responsable_nombre, responsable_rut, responsable_email, responsable_telefono,
      tipo || 'contrato', profile_id || null, fecha_inicio, fecha_termino, parseFloat(valor_ucl) || 0,
      tiene_comite_bipartito ? 1 : 0, comite_programa || null, observaciones || null, req.user.id);

    logActivity(req.user.org_id, req.user.id, "crear", "accion_ft", r.lastInsertRowid, `${empresa_nombre} - ${tipo}`);
    res.redirect(`/franquicia/${r.lastInsertRowid}`);
  } catch (e) {
    const profiles = db.prepare("SELECT * FROM profiles WHERE active=1 ORDER BY name").all();
    res.render("franquicia/accion-form", { accion: req.body, profiles, TRAMOS, error: e.message });
  }
});

// Detalle accion
router.get("/:id", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const accion = db.prepare(
    `SELECT a.*, p.name as profile_name, p.code as profile_code, p.sector as profile_sector
     FROM acciones_ft a LEFT JOIN profiles p ON a.profile_id=p.id
     WHERE a.id=? AND a.org_id=?`
  ).get(req.params.id, oid);
  if (!accion) return res.redirect("/franquicia");

  const participantes = db.prepare("SELECT * FROM accion_ft_participantes WHERE accion_id=? ORDER BY nombre").all(accion.id);
  const documentos = db.prepare("SELECT * FROM accion_ft_documentos WHERE accion_id=? ORDER BY created_at DESC").all(accion.id);

  const diasRestantes = accion.fecha_termino ?
    Math.ceil((new Date(accion.fecha_termino).getTime() + 60*86400000 - Date.now()) / 86400000) : null;

  const costos = calcularCostos(accion, participantes);

  res.render("franquicia/accion-detail", { accion, participantes, documentos, diasRestantes, costos, TRAMOS, ESTADOS });
});

// Editar accion
router.get("/:id/editar", (req, res) => {
  const db = getDb();
  const accion = db.prepare("SELECT * FROM acciones_ft WHERE id=? AND org_id=?").get(req.params.id, req.user.org_id);
  if (!accion) return res.redirect("/franquicia");
  const profiles = db.prepare("SELECT * FROM profiles WHERE active=1 ORDER BY name").all();
  res.render("franquicia/accion-form", { accion, profiles, TRAMOS, error: null });
});

router.post("/:id", (req, res) => {
  const db = getDb();
  const { empresa_rut, empresa_nombre, empresa_direccion, empresa_region, empresa_comuna,
    responsable_nombre, responsable_rut, responsable_email, responsable_telefono,
    tipo, profile_id, fecha_inicio, fecha_termino, valor_ucl, tiene_comite_bipartito, comite_programa, observaciones } = req.body;

  db.prepare(
    `UPDATE acciones_ft SET empresa_rut=?, empresa_nombre=?, empresa_direccion=?, empresa_region=?, empresa_comuna=?,
     responsable_nombre=?, responsable_rut=?, responsable_email=?, responsable_telefono=?,
     tipo=?, profile_id=?, fecha_inicio=?, fecha_termino=?, valor_ucl=?, tiene_comite_bipartito=?, comite_programa=?, observaciones=?, updated_at=CURRENT_TIMESTAMP
     WHERE id=? AND org_id=?`
  ).run(empresa_rut, empresa_nombre, empresa_direccion, empresa_region, empresa_comuna,
    responsable_nombre, responsable_rut, responsable_email, responsable_telefono,
    tipo, profile_id || null, fecha_inicio, fecha_termino, parseFloat(valor_ucl) || 0,
    tiene_comite_bipartito ? 1 : 0, comite_programa || null, observaciones || null, req.params.id, req.user.org_id);

  logActivity(req.user.org_id, req.user.id, "editar", "accion_ft", req.params.id, empresa_nombre);
  res.redirect(`/franquicia/${req.params.id}`);
});

// Cambiar estado
router.post("/:id/estado", (req, res) => {
  const db = getDb();
  const { estado } = req.body;
  if (!ESTADOS.includes(estado)) return res.redirect(`/franquicia/${req.params.id}`);

  db.prepare("UPDATE acciones_ft SET estado=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND org_id=?")
    .run(estado, req.params.id, req.user.org_id);
  logActivity(req.user.org_id, req.user.id, "cambiar_estado", "accion_ft", req.params.id, `Estado: ${estado}`);
  res.redirect(`/franquicia/${req.params.id}`);
});

// Agregar participante
router.post("/:id/participante", (req, res) => {
  const db = getDb();
  const accion = db.prepare("SELECT * FROM acciones_ft WHERE id=? AND org_id=?").get(req.params.id, req.user.org_id);
  if (!accion) return res.redirect("/franquicia");

  const { rut, nombre, nivel_ocupacional, nivel_educacional, tramo_franquicia, copago, fecha_contrato, fecha_finiquito, candidate_id } = req.body;
  const tramo = parseInt(tramo_franquicia) || 1;
  const pct = TRAMOS[accion.tipo]?.find(t => t.tramo === tramo)?.pct || 90;

  db.prepare(
    `INSERT INTO accion_ft_participantes (accion_id, candidate_id, rut, nombre, nivel_ocupacional, nivel_educacional, tramo_franquicia, porcentaje_franquicia, copago, fecha_contrato, fecha_finiquito)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(req.params.id, candidate_id || null, rut, nombre, nivel_ocupacional, nivel_educacional, tramo, pct, parseFloat(copago) || 0, fecha_contrato || null, fecha_finiquito || null);

  res.redirect(`/franquicia/${req.params.id}`);
});

// Eliminar participante
router.post("/:id/participante/:pid/eliminar", (req, res) => {
  getDb().prepare("DELETE FROM accion_ft_participantes WHERE id=? AND accion_id=?").run(req.params.pid, req.params.id);
  res.redirect(`/franquicia/${req.params.id}`);
});

// Resultado participante
router.post("/:id/participante/:pid/resultado", (req, res) => {
  const { resultado } = req.body;
  getDb().prepare("UPDATE accion_ft_participantes SET resultado=? WHERE id=? AND accion_id=?").run(resultado, req.params.pid, req.params.id);
  res.redirect(`/franquicia/${req.params.id}`);
});

// Export FT001
router.get("/:id/ft001", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const accion = db.prepare(
    `SELECT a.*, p.name as profile_name, p.code as profile_code FROM acciones_ft a
     LEFT JOIN profiles p ON a.profile_id=p.id WHERE a.id=? AND a.org_id=?`
  ).get(req.params.id, oid);
  if (!accion) return res.redirect("/franquicia");

  const participantes = db.prepare("SELECT * FROM accion_ft_participantes WHERE accion_id=?").all(accion.id);
  const org = db.prepare("SELECT * FROM organizations WHERE id=?").get(oid);
  const costos = calcularCostos(accion, participantes);

  db.prepare("UPDATE acciones_ft SET ft001_generado=1 WHERE id=?").run(accion.id);

  res.render("franquicia/ft001", { accion, participantes, org, costos });
});

// Export CSV participantes
router.get("/:id/export-csv", (req, res) => {
  const db = getDb();
  const accion = db.prepare("SELECT * FROM acciones_ft WHERE id=? AND org_id=?").get(req.params.id, req.user.org_id);
  if (!accion) return res.redirect("/franquicia");

  const rows = db.prepare("SELECT * FROM accion_ft_participantes WHERE accion_id=?").all(accion.id);
  const header = 'RUT,Nombre,Nivel Ocupacional,Nivel Educacional,Tramo,% Franquicia,Copago,Resultado\n';
  const csv = header + rows.map(r =>
    `${r.rut},${r.nombre},${r.nivel_ocupacional||''},${r.nivel_educacional||''},${r.tramo_franquicia},${r.porcentaje_franquicia}%,${r.copago},${r.resultado}`
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=accion-ft-${accion.id}-participantes.csv`);
  res.send('﻿' + csv);
});

function calcularCostos(accion, participantes) {
  const valorUcl = accion.valor_ucl || 0;
  let totalBruto = 0;
  let totalFranquicia = 0;
  let totalCopago = 0;

  for (const p of participantes) {
    const uclCount = p.ucls_total || 1;
    const bruto = valorUcl * uclCount;
    const franq = bruto * (p.porcentaje_franquicia / 100);
    totalBruto += bruto;
    totalFranquicia += franq;
    totalCopago += p.copago || 0;
  }

  return {
    participantes: participantes.length,
    valorUcl,
    totalBruto,
    totalFranquicia,
    totalCopago,
    costoEmpresa: totalBruto - totalFranquicia - totalCopago,
  };
}

module.exports = router;
