const jwt = require("jsonwebtoken");
const { getDb } = require("../database/db");

if (!process.env.JWT_SECRET) {
  console.error("[FATAL] JWT_SECRET no configurado en .env — abortando");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = "24h";

function generateToken(user) {
  return jwt.sign(
    { id: user.id, org_id: user.org_id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.redirect("/login");
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = getDb().prepare(
      "SELECT u.*, o.name as org_name, o.plan as org_plan FROM users u JOIN organizations o ON u.org_id = o.id WHERE u.id = ? AND u.active = 1"
    ).get(decoded.id);
    if (!user) return res.redirect("/login");
    req.user = user;
    res.locals.user = user;
    next();
  } catch {
    res.clearCookie("token");
    return res.redirect("/login");
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).render("error", { title: "Acceso denegado", message: "No tiene permisos para esta sección" });
    }
    next();
  };
}

function apiAuth(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No autorizado" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = getDb().prepare("SELECT * FROM users WHERE id = ? AND active = 1").get(decoded.id);
    if (!user) return res.status(401).json({ error: "Usuario no válido" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

function validatePassword(password) {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (!/[A-Z]/.test(password)) return "La contraseña debe incluir al menos una mayúscula";
  if (!/[0-9]/.test(password)) return "La contraseña debe incluir al menos un número";
  return null;
}

module.exports = { generateToken, requireAuth, requireRole, apiAuth, validatePassword };
