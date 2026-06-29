require("dotenv/config");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const path = require("path");
const { requireAuth } = require("./middleware/auth");
const { csrfProtection } = require("./middleware/csrf");
const { requireWriteRole, requireAdmin, logAccess } = require("./middleware/roles");
const { runBreachCheck } = require("./services/breach-detector");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3300;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "cdn.jsdelivr.net",
          "fonts.googleapis.com",
        ],
        fontSrc: ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(csrfProtection);

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.flash = (msg) =>
    res.cookie("flash", msg, { maxAge: 5000, httpOnly: false, path: "/" });
  next();
});

// Public
app.use("/", require("./routes/landing"));
app.use("/", require("./routes/auth"));
app.use("/arco", require("./routes/arco"));
app.get("/privacidad", (req, res) => res.render("privacy"));

// Protected
app.use(requireAuth);
app.use("/dashboard", require("./routes/dashboard"));
app.use("/candidatos", requireWriteRole("candidatos"), logAccess("candidatos"), require("./routes/candidates"));
app.use("/evaluaciones", requireWriteRole("evaluaciones"), logAccess("evaluaciones"), require("./routes/evaluations"));
app.use("/evaluadores", requireWriteRole("evaluadores"), logAccess("evaluadores"), require("./routes/evaluators"));
app.use("/auditorias", requireWriteRole("auditorias"), require("./routes/audits"));
app.use("/reclamos", requireWriteRole("reclamos"), require("./routes/complaints"));
app.use("/documentos", requireWriteRole("documentos"), require("./routes/documents"));
app.use("/satisfaccion", requireWriteRole("satisfaccion"), require("./routes/satisfaction"));
app.use("/reportes", requireWriteRole("reportes"), require("./routes/reports"));
app.use("/conflictos", requireWriteRole("conflictos"), require("./routes/conflicts"));
app.use("/registros", requireWriteRole("registros"), require("./routes/records"));
app.use("/evidencias", requireWriteRole("evidencias"), require("./routes/evidence"));
app.use("/franquicia", requireWriteRole("franquicia"), require("./routes/franquicia"));
app.use("/docs", require("./routes/docs"));
app.use("/busqueda", require("./routes/search"));
app.use("/agentes", require("./routes/agents"));
app.use("/admin", requireAdmin, require("./routes/admin"));

app.use((req, res) => {
  res.status(404).render("error", {
    title: "No encontrado",
    message: "Pagina no encontrada",
  });
});

app.use((err, req, res, next) => {
  console.error("[Error]", err.message);
  res.status(500).render("error", {
    title: "Error",
    message: "Error interno del servidor",
  });
});

app.listen(PORT, () => {
  console.log(`[CertificaDesk] Puerto ${PORT} - ${new Date().toISOString()}`);
  // Breach detection every 15 minutes
  setInterval(runBreachCheck, 15 * 60 * 1000);
});
