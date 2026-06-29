const router = require("express").Router();
const path = require("path");
const ejs = require("ejs");
const { getDb } = require("../database/db");
const { renderPdf } = require("../services/pdf");

function renderTemplate(template, data) {
  const file = path.join(__dirname, "..", "views", "print", template + ".ejs");
  return new Promise((resolve, reject) => {
    ejs.renderFile(file, data, (err, html) => err ? reject(err) : resolve(html));
  });
}

// --- Data loaders ---

function loadCertificado(oid, candidateId) {
  const db = getDb();
  const candidate = db.prepare(
    `SELECT c.*, p.name as profile_name, p.code as profile_code, p.sector as profile_sector
     FROM candidates c LEFT JOIN profiles p ON c.profile_id=p.id
     WHERE c.id=? AND c.org_id=? AND c.status='certificado'`
  ).get(candidateId, oid);
  if (!candidate) return null;

  const decision = db.prepare(
    `SELECT cd.*, u.display_name as decided_by_name
     FROM certification_decisions cd LEFT JOIN users u ON cd.decided_by=u.id
     WHERE cd.candidate_id=? AND cd.org_id=? AND cd.decision='certificar'
     ORDER BY cd.created_at DESC LIMIT 1`
  ).get(candidateId, oid);

  const evaluation = db.prepare(
    `SELECT e.*, ev.name as evaluator_name
     FROM evaluations e LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     WHERE e.candidate_id=? AND e.org_id=? AND e.status='completada'
     ORDER BY e.completed_at DESC LIMIT 1`
  ).get(candidateId, oid);

  const org = db.prepare("SELECT * FROM organizations WHERE id=?").get(oid);
  const folio = `CEC-${org.rut ? org.rut.replace(/[.-]/g,'').slice(0,6) : 'XXX'}-${String(candidate.id).padStart(4,'0')}`;

  return { candidate, decision, evaluation, org, folio };
}

function loadInforme(oid, evaluationId) {
  const db = getDb();
  const evaluation = db.prepare(
    `SELECT e.*, c.name as candidate_name, c.rut as candidate_rut, c.email as candidate_email,
     c.phone as candidate_phone, c.region as candidate_region, c.education_level, c.work_experience_years,
     p.name as profile_name, p.code as profile_code, p.sector as profile_sector,
     ev.name as evaluator_name, ev.rut as evaluator_rut, ev.specialties as evaluator_specialties
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     WHERE e.id=? AND e.org_id=? AND e.status='completada'`
  ).get(evaluationId, oid);
  if (!evaluation) return null;

  const org = db.prepare("SELECT * FROM organizations WHERE id=?").get(oid);
  const folio = `INF-${String(evaluation.id).padStart(4,'0')}`;

  return { evaluation, org, folio };
}

function loadActa(oid, decisionId) {
  const db = getDb();
  const decision = db.prepare(
    `SELECT cd.*, c.name as candidate_name, c.rut as candidate_rut,
     u.display_name as decided_by_name,
     e.score_ponderado, e.score_conocimientos, e.score_jefe_directo, e.score_terreno, e.score_evidencias,
     e.result, e.observations, e.completed_at as eval_completed_at, e.tipo_jefe, e.tipo_terreno,
     p.name as profile_name, p.code as profile_code,
     ev.name as evaluator_name, ev.rut as evaluator_rut
     FROM certification_decisions cd
     LEFT JOIN candidates c ON cd.candidate_id=c.id
     LEFT JOIN evaluations e ON cd.evaluation_id=e.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     LEFT JOIN users u ON cd.decided_by=u.id
     WHERE cd.id=? AND cd.org_id=?`
  ).get(decisionId, oid);
  if (!decision) return null;

  const org = db.prepare("SELECT * FROM organizations WHERE id=?").get(oid);
  const folio = `ACT-${String(decision.id).padStart(4,'0')}`;

  return { decision, org, folio };
}

// --- HTML preview routes ---

router.get("/certificado/:candidateId", (req, res) => {
  const data = loadCertificado(req.user.org_id, req.params.candidateId);
  if (!data) return res.redirect("/candidatos");
  res.render("print/certificado", data);
});

router.get("/informe/:evaluationId", (req, res) => {
  const data = loadInforme(req.user.org_id, req.params.evaluationId);
  if (!data) return res.redirect("/evaluaciones");
  res.render("print/informe-evaluacion", data);
});

router.get("/acta/:decisionId", (req, res) => {
  const data = loadActa(req.user.org_id, req.params.decisionId);
  if (!data) return res.redirect("/evaluaciones");
  res.render("print/acta-comite", data);
});

// --- PDF download routes ---

router.get("/pdf/certificado/:candidateId", async (req, res) => {
  try {
    const data = loadCertificado(req.user.org_id, req.params.candidateId);
    if (!data) return res.redirect("/candidatos");
    const html = await renderTemplate("certificado", data);
    const pdf = await renderPdf(html, { format: "A4", landscape: true });
    const filename = `Certificado-${data.candidate.name.replace(/\s+/g, '_')}-${data.folio}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (e) {
    console.error("[PDF] Certificado error:", e.message);
    res.status(500).send("Error generando PDF");
  }
});

router.get("/pdf/informe/:evaluationId", async (req, res) => {
  try {
    const data = loadInforme(req.user.org_id, req.params.evaluationId);
    if (!data) return res.redirect("/evaluaciones");
    const html = await renderTemplate("informe-evaluacion", data);
    const pdf = await renderPdf(html);
    const filename = `Informe-${data.evaluation.candidate_name.replace(/\s+/g, '_')}-${data.folio}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (e) {
    console.error("[PDF] Informe error:", e.message);
    res.status(500).send("Error generando PDF");
  }
});

router.get("/pdf/acta/:decisionId", async (req, res) => {
  try {
    const data = loadActa(req.user.org_id, req.params.decisionId);
    if (!data) return res.redirect("/evaluaciones");
    const html = await renderTemplate("acta-comite", data);
    const pdf = await renderPdf(html);
    const filename = `Acta-Comite-${data.decision.candidate_name.replace(/\s+/g, '_')}-${data.folio}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (e) {
    console.error("[PDF] Acta error:", e.message);
    res.status(500).send("Error generando PDF");
  }
});

module.exports = router;
