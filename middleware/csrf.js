const crypto = require("crypto");

function csrfProtection(req, res, next) {
  if (req.path.startsWith("/api/") || req.path.startsWith("/agentes/api/")) return next();

  if (req.method === "GET" || req.method === "HEAD") {
    let token = req.cookies?._csrf;
    if (!token) {
      token = crypto.randomBytes(32).toString("hex");
      res.cookie("_csrf", token, {
        httpOnly: false,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
      });
    }
    res.locals.csrfToken = token;
    return next();
  }

  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    const cookieToken = req.cookies?._csrf;
    const bodyToken = req.body?._csrf;
    if (!cookieToken || !bodyToken || cookieToken !== bodyToken) {
      return res.status(403).render("error", {
        title: "Error de seguridad",
        message: "Token CSRF inválido. Recargue la página e intente nuevamente.",
      });
    }
    res.locals.csrfToken = cookieToken;
    return next();
  }

  next();
}

module.exports = { csrfProtection };
