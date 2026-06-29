const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const { getDb, logActivity } = require("../database/db");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "..", "uploads")),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname.replace(/\s/g, "_"))
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

router.get("/", (req, res) => {
  const documents = getDb().prepare(
    "SELECT d.*, u.display_name as uploaded_by_name FROM documents d LEFT JOIN users u ON d.uploaded_by=u.id WHERE d.org_id=? ORDER BY d.uploaded_at DESC"
  ).all(req.user.org_id);
  res.render("documents/list", { documents });
});

router.get("/nuevo", (req, res) => {
  res.render("documents/form", { document: null, error: null });
});

router.post("/", upload.single("file"), (req, res) => {
  const { category, name, version, expiry_date } = req.body;
  const r = getDb().prepare(
    "INSERT INTO documents (org_id, category, name, version, file_path, file_name, expiry_date, uploaded_by) VALUES (?,?,?,?,?,?,?,?)"
  ).run(req.user.org_id, category, name, version||"1.0", req.file?.path||null, req.file?.originalname||null, expiry_date||null, req.user.id);
  logActivity(req.user.org_id, req.user.id, "subir", "documento", r.lastInsertRowid, name);
  res.flash("Documento guardado"); res.redirect("/documentos");
});

module.exports = router;
