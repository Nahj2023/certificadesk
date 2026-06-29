const router = require("express").Router();
const bcrypt = require("bcryptjs");
const OTPAuth = require("otpauth");
const QRCode = require("qrcode");
const rateLimit = require("express-rate-limit");
const { getDb, logActivity } = require("../database/db");
const {
  generateToken,
  validatePassword,
  requireAuth,
  checkLockout,
  recordFailedAttempt,
  resetFailedAttempts,
  isPasswordExpired,
} = require("../middleware/auth");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  handler: (req, res) => {
    res.render("login", { error: "Demasiados intentos. Espere 15 minutos.", step: "credentials" });
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

router.get("/login", (req, res) => {
  if (req.cookies?.token) return res.redirect("/dashboard");
  res.render("login", { error: null, step: "credentials" });
});

router.post("/login", loginLimiter, (req, res) => {
  const { username, password, totp_code, step } = req.body;

  // Step 2: TOTP verification
  if (step === "totp") {
    const pendingUser = getDb()
      .prepare("SELECT * FROM users WHERE username = ? AND active = 1")
      .get(username);
    if (!pendingUser || !pendingUser.totp_enabled) {
      return res.render("login", { error: "Sesión expirada. Intente nuevamente.", step: "credentials" });
    }

    const totp = new OTPAuth.TOTP({
      issuer: "CertificaDesk",
      label: pendingUser.username,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(pendingUser.totp_secret),
    });

    const delta = totp.validate({ token: totp_code, window: 1 });
    if (delta === null) {
      return res.render("login", {
        error: "Código 2FA inválido",
        step: "totp",
        username: pendingUser.username,
      });
    }

    resetFailedAttempts(pendingUser.id);
    completeLogin(pendingUser, res);
    return;
  }

  // Step 1: credentials
  const user = getDb()
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username);

  if (!user) {
    return res.render("login", { error: "Credenciales inválidas", step: "credentials" });
  }

  if (!user.active) {
    return res.render("login", { error: "Cuenta desactivada. Contacte al administrador.", step: "credentials" });
  }

  const lockError = checkLockout(user);
  if (lockError) {
    return res.render("login", { error: lockError, step: "credentials" });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    const warning = recordFailedAttempt(user);
    logActivity(user.org_id, user.id, "login_failed", "users", user.id, null, req.ip);
    return res.render("login", {
      error: warning || "Credenciales inválidas",
      step: "credentials",
    });
  }

  // Credentials OK — check if 2FA required
  if (user.totp_enabled) {
    return res.render("login", {
      error: null,
      step: "totp",
      username: user.username,
    });
  }

  resetFailedAttempts(user.id);
  completeLogin(user, res);
});

function completeLogin(user, res) {
  getDb()
    .prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?")
    .run(user.id);
  const token = generateToken(user);
  res.cookie("token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 30 * 60 * 1000,
  });
  res.redirect("/dashboard");
}

router.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});

// ── Mi Cuenta: cambio de contraseña (propio) ──
router.get("/mi-cuenta/password", requireAuth, (req, res) => {
  const expired = req.query.expired === "1";
  res.render("account/change-password", {
    title: "Cambiar contraseña",
    error: null,
    expired,
  });
});

router.post("/mi-cuenta/password", requireAuth, (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;

  if (!bcrypt.compareSync(current_password, req.user.password)) {
    return res.render("account/change-password", {
      title: "Cambiar contraseña",
      error: "Contraseña actual incorrecta",
      expired: false,
    });
  }

  if (new_password !== confirm_password) {
    return res.render("account/change-password", {
      title: "Cambiar contraseña",
      error: "Las contraseñas no coinciden",
      expired: false,
    });
  }

  const pwError = validatePassword(new_password);
  if (pwError) {
    return res.render("account/change-password", {
      title: "Cambiar contraseña",
      error: pwError,
      expired: false,
    });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  const newVersion = (req.user.token_version || 1) + 1;
  getDb()
    .prepare(
      "UPDATE users SET password = ?, token_version = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .run(hash, newVersion, req.user.id);

  logActivity(req.user.org_id, req.user.id, "change_own_password", "users", req.user.id, null, req.ip);

  const token = generateToken({ ...req.user, token_version: newVersion });
  res.cookie("token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 30 * 60 * 1000,
  });

  res.flash("Contraseña actualizada correctamente");
  res.redirect("/dashboard");
});

// ── Mi Cuenta: 2FA setup ──
router.get("/mi-cuenta/2fa", requireAuth, (req, res) => {
  res.render("account/two-factor", {
    title: "Autenticación 2FA",
    error: null,
    qrDataUrl: null,
    secret: null,
    enabled: !!req.user.totp_enabled,
  });
});

router.post("/mi-cuenta/2fa/setup", requireAuth, async (req, res) => {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: "CertificaDesk",
    label: req.user.username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  const uri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(uri);

  getDb()
    .prepare("UPDATE users SET totp_secret = ? WHERE id = ?")
    .run(secret.base32, req.user.id);

  res.render("account/two-factor", {
    title: "Configurar 2FA",
    error: null,
    qrDataUrl,
    secret: secret.base32,
    enabled: false,
  });
});

router.post("/mi-cuenta/2fa/verify", requireAuth, (req, res) => {
  const { totp_code } = req.body;
  const user = getDb().prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);

  if (!user.totp_secret) {
    return res.redirect("/mi-cuenta/2fa");
  }

  const totp = new OTPAuth.TOTP({
    issuer: "CertificaDesk",
    label: user.username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.totp_secret),
  });

  const delta = totp.validate({ token: totp_code, window: 1 });
  if (delta === null) {
    return res.render("account/two-factor", {
      title: "Configurar 2FA",
      error: "Código inválido. Verifique la hora de su dispositivo.",
      qrDataUrl: null,
      secret: user.totp_secret,
      enabled: false,
    });
  }

  getDb()
    .prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?")
    .run(req.user.id);

  logActivity(req.user.org_id, req.user.id, "enable_2fa", "users", req.user.id, null, req.ip);
  res.flash("2FA activado correctamente");
  res.redirect("/mi-cuenta/2fa");
});

router.post("/mi-cuenta/2fa/disable", requireAuth, (req, res) => {
  const { password } = req.body;
  if (!bcrypt.compareSync(password, req.user.password)) {
    return res.render("account/two-factor", {
      title: "Autenticación 2FA",
      error: "Contraseña incorrecta",
      qrDataUrl: null,
      secret: null,
      enabled: true,
    });
  }

  getDb()
    .prepare("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?")
    .run(req.user.id);

  logActivity(req.user.org_id, req.user.id, "disable_2fa", "users", req.user.id, null, req.ip);
  res.flash("2FA desactivado");
  res.redirect("/mi-cuenta/2fa");
});

module.exports = router;
