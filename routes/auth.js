const router = require("express").Router();
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { getDb } = require("../database/db");
const { generateToken, validatePassword } = require("../middleware/auth");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  handler: (req, res) => {
    res.render("login", { error: "Demasiados intentos. Espere 15 minutos." });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/login", (req, res) => {
  if (req.cookies?.token) return res.redirect("/dashboard");
  res.render("login", { error: null });
});

router.post("/login", loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const user = getDb()
    .prepare("SELECT * FROM users WHERE username = ? AND active = 1")
    .get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render("login", { error: "Credenciales inválidas" });
  }
  getDb()
    .prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?")
    .run(user.id);
  const token = generateToken(user);
  res.cookie("token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 86400000,
  });
  res.redirect("/dashboard");
});

router.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});

module.exports = router;
