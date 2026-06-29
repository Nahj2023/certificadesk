require("dotenv/config");
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const { requireAuth } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3300;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.flash = (msg) => res.cookie("flash", msg, { maxAge: 5000, httpOnly: false, path: "/" });
  next();
});

// Public
app.use("/", require("./routes/landing"));
app.use("/", require("./routes/auth"));

// Protected
app.use(requireAuth);
app.use("/dashboard", require("./routes/dashboard"));
app.use("/candidatos", require("./routes/candidates"));
app.use("/evaluaciones", require("./routes/evaluations"));
app.use("/evaluadores", require("./routes/evaluators"));
app.use("/auditorias", require("./routes/audits"));
app.use("/reclamos", require("./routes/complaints"));
app.use("/documentos", require("./routes/documents"));
app.use("/satisfaccion", require("./routes/satisfaction"));
app.use("/reportes", require("./routes/reports"));
app.use("/conflictos", require("./routes/conflicts"));
app.use("/registros", require("./routes/records"));
app.use("/evidencias", require("./routes/evidence"));
app.use("/franquicia", require("./routes/franquicia"));
app.use("/docs", require("./routes/docs"));
app.use("/busqueda", require("./routes/search"));

app.use((req, res) => {
  res.status(404).render("error", { title: "No encontrado", message: "Página no encontrada" });
});

app.use((err, req, res, next) => {
  console.error("[Error]", err.message);
  res.status(500).render("error", { title: "Error", message: "Error interno del servidor" });
});

app.listen(PORT, () => console.log(`[CertificaDesk] Puerto ${PORT} - ${new Date().toISOString()}`));
