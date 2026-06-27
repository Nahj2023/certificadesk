const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { getDb } = require("../database/db");
const { generateToken } = require("../middleware/auth");

router.get("/login", (req, res) => {
  if (req.cookies?.token) return res.redirect("/dashboard");
  res.render("login", { error: null });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = getDb().prepare("SELECT * FROM users WHERE username = ? AND active = 1").get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.render("login", { error: "Credenciales inválidas" });
  }
  getDb().prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
  const token = generateToken(user);
  res.cookie("token", token, { httpOnly: true, maxAge: 86400000, sameSite: "lax" });
  res.redirect("/dashboard");
});

router.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});

module.exports = router;
