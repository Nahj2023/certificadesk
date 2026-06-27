const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { getDb, logActivity } = require("../database/db");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "..", "uploads", "evidencias", String(req.user.org_id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `ev-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

router.get("/", (req, res) => {
  const evaluations = getDb().prepare(`
    SELECT ev.id, ev.scheduled_date, ev.status, ev.result,
      c.name as candidate_name, c.rut as candidate_rut,
      p.name as profile_name, e.name as evaluator_name,
      (SELECT COUNT(*) FROM evidence WHERE evaluation_id=ev.id) as evidence_count
    FROM evaluations ev
    LEFT JOIN candidates c ON ev.candidate_id=c.id
    LEFT JOIN profiles p ON ev.profile_id=p.id
    LEFT JOIN evaluators e ON ev.evaluator_id=e.id
    WHERE ev.org_id=? ORDER BY ev.scheduled_date DESC
  `).all(req.user.org_id);
  res.render("evidence/list", { evaluations });
});

router.get("/:evalId", (req, res) => {
  const evaluation = getDb().prepare(`
    SELECT ev.*, c.name as candidate_name, c.rut as candidate_rut,
      p.name as profile_name, p.code as profile_code,
      e.name as evaluator_name
    FROM evaluations ev
    LEFT JOIN candidates c ON ev.candidate_id=c.id
    LEFT JOIN profiles p ON ev.profile_id=p.id
    LEFT JOIN evaluators e ON ev.evaluator_id=e.id
    WHERE ev.id=? AND ev.org_id=?
  `).get(req.params.evalId, req.user.org_id);
  if (!evaluation) return res.redirect("/evidencias");
  const evidences = getDb().prepare(`
    SELECT ev.*, u.display_name as uploader_name
    FROM evidence ev LEFT JOIN users u ON ev.uploaded_by=u.id
    WHERE ev.evaluation_id=? AND ev.org_id=? ORDER BY ev.uploaded_at DESC
  `).all(req.params.evalId, req.user.org_id);
  res.render("evidence/detail", { evaluation, evidences });
});

router.post("/:evalId/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.redirect(`/evidencias/${req.params.evalId}`);
  const { criterion, type } = req.body;
  const relativePath = `/uploads/evidencias/${req.user.org_id}/${req.file.filename}`;
  getDb().prepare(`
    INSERT INTO evidence (evaluation_id, org_id, criterion, type, file_path, file_name, file_size, uploaded_by)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(req.params.evalId, req.user.org_id, criterion, type || "documento", relativePath, req.file.originalname, req.file.size, req.user.id);
  logActivity(req.user.org_id, req.user.id, "subir_evidencia", "evaluacion", req.params.evalId, req.file.originalname);
  res.redirect(`/evidencias/${req.params.evalId}`);
});

router.post("/:evalId/evidence/:id/verify", (req, res) => {
  getDb().prepare("UPDATE evidence SET verified=1 WHERE id=? AND org_id=?").run(req.params.id, req.user.org_id);
  logActivity(req.user.org_id, req.user.id, "verificar_evidencia", "evidence", req.params.id);
  res.redirect(`/evidencias/${req.params.evalId}`);
});

router.post("/:evalId/evidence/:id/delete", (req, res) => {
  const ev = getDb().prepare("SELECT file_path FROM evidence WHERE id=? AND org_id=?").get(req.params.id, req.user.org_id);
  if (ev) {
    const fullPath = path.join(__dirname, "..", ev.file_path);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    getDb().prepare("DELETE FROM evidence WHERE id=? AND org_id=?").run(req.params.id, req.user.org_id);
    logActivity(req.user.org_id, req.user.id, "eliminar_evidencia", "evidence", req.params.id);
  }
  res.redirect(`/evidencias/${req.params.evalId}`);
});

module.exports = router;
