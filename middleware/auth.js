const jwt = require("jsonwebtoken");
const { getDb } = require("../database/db");

if (!process.env.JWT_SECRET) {
  console.error("[FATAL] JWT_SECRET no configurado en .env — abortando");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = "30m";
const PASSWORD_MAX_AGE_DAYS = 90;

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      org_id: user.org_id,
      username: user.username,
      role: user.role,
      tv: user.token_version || 1,
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.redirect("/login");
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = getDb()
      .prepare(
        "SELECT u.*, o.name as org_name, o.plan as org_plan FROM users u JOIN organizations o ON u.org_id = o.id WHERE u.id = ? AND u.active = 1"
      )
      .get(decoded.id);
    if (!user) return res.redirect("/login");
    if (decoded.tv && user.token_version && decoded.tv !== user.token_version) {
      res.clearCookie("token");
      return res.redirect("/login");
    }

    // Password expiration check
    if (isPasswordExpired(user) && req.path !== "/mi-cuenta/password" && req.method === "GET") {
      return res.redirect("/mi-cuenta/password?expired=1");
    }

    // Sliding session: refresh token on each request
    const freshToken = generateToken(user);
    res.cookie("token", freshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 30 * 60 * 1000,
    });

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
      return res.status(403).render("error", {
        title: "Acceso denegado",
        message: "No tiene permisos para esta sección",
      });
    }
    next();
  };
}

function apiAuth(req, res, next) {
  const token =
    req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No autorizado" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = getDb()
      .prepare("SELECT * FROM users WHERE id = ? AND active = 1")
      .get(decoded.id);
    if (!user) return res.status(401).json({ error: "Usuario no válido" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

function validatePassword(password) {
  if (password.length < 8)
    return "La contraseña debe tener al menos 8 caracteres";
  if (!/[A-Z]/.test(password))
    return "La contraseña debe incluir al menos una mayúscula";
  if (!/[0-9]/.test(password))
    return "La contraseña debe incluir al menos un número";
  return null;
}

function isPasswordExpired(user) {
  if (!user.password_changed_at) return true;
  const changed = new Date(user.password_changed_at);
  const now = new Date();
  const diffDays = (now - changed) / (1000 * 60 * 60 * 24);
  return diffDays > PASSWORD_MAX_AGE_DAYS;
}

const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

function checkLockout(user) {
  if (!user.locked_until) return null;
  const lockedUntil = new Date(user.locked_until);
  if (new Date() < lockedUntil) {
    const mins = Math.ceil((lockedUntil - new Date()) / 60000);
    return `Cuenta bloqueada. Intente en ${mins} minuto${mins !== 1 ? "s" : ""}`;
  }
  getDb()
    .prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?")
    .run(user.id);
  return null;
}

function recordFailedAttempt(user) {
  const attempts = (user.failed_attempts || 0) + 1;
  if (attempts >= LOCKOUT_ATTEMPTS) {
    const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    getDb()
      .prepare("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?")
      .run(attempts, lockUntil, user.id);
    return `Cuenta bloqueada por ${LOCKOUT_MINUTES} minutos (${LOCKOUT_ATTEMPTS} intentos fallidos)`;
  }
  getDb()
    .prepare("UPDATE users SET failed_attempts = ? WHERE id = ?")
    .run(attempts, user.id);
  const remaining = LOCKOUT_ATTEMPTS - attempts;
  return remaining <= 2
    ? `Credenciales inválidas. ${remaining} intento${remaining !== 1 ? "s" : ""} restante${remaining !== 1 ? "s" : ""}`
    : null;
}

function resetFailedAttempts(userId) {
  getDb()
    .prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?")
    .run(userId);
}

module.exports = {
  generateToken,
  requireAuth,
  requireRole,
  apiAuth,
  validatePassword,
  isPasswordExpired,
  checkLockout,
  recordFailedAttempt,
  resetFailedAttempts,
  LOCKOUT_ATTEMPTS,
  LOCKOUT_MINUTES,
  PASSWORD_MAX_AGE_DAYS,
};
