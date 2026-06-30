const router = require("express").Router();
const { getDb } = require("../database/db");
const Groq = require("groq-sdk");

let groq;
try {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
} catch {
  groq = new (Groq.default || Groq)({ apiKey: process.env.GROQ_API_KEY });
}

// GET /guia — public chat page
router.get("/", (req, res) => {
  const db = getDb();
  const agent = db.prepare("SELECT * FROM ai_agents WHERE code='guia' AND active=1").get();
  if (!agent) return res.status(404).send("Agente no disponible");
  res.render("agents/public-chat", { agent });
});

// POST /guia/api/chat — public chat API (no auth, no tools)
router.post("/api/chat", async (req, res) => {
  if (!groq || !process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "Servicio no disponible" });
  }

  const db = getDb();
  const { conversation_id, content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: "Mensaje vacio" });

  const agent = db.prepare("SELECT * FROM ai_agents WHERE code='guia' AND active=1 AND is_public=1").get();
  if (!agent) return res.status(404).json({ error: "Agente no disponible" });

  let convId = conversation_id ? parseInt(conversation_id) : null;
  if (!convId) {
    const r = db.prepare(
      "INSERT INTO ai_conversations (org_id, user_id, agent_id, title) VALUES (1,0,?,?)"
    ).run(agent.id, content.substring(0, 80));
    convId = r.lastInsertRowid;
  }

  db.prepare("INSERT INTO ai_messages (conversation_id, role, content) VALUES (?,?,?)").run(convId, "user", content.trim());

  const history = db.prepare(
    "SELECT role, content FROM ai_messages WHERE conversation_id=? AND role IN ('user','assistant') ORDER BY created_at DESC LIMIT 10"
  ).all(convId).reverse();

  try {
    const response = await groq.chat.completions.create({
      model: agent.model || "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: agent.system_prompt }, ...history],
      temperature: agent.temperature || 0.5,
      max_tokens: agent.max_tokens || 1024,
    });

    const assistantContent = response.choices[0].message.content || "";
    const tokensUsed = response.usage?.total_tokens || 0;

    db.prepare("INSERT INTO ai_messages (conversation_id, role, content, tokens_used) VALUES (?,?,?,?)").run(convId, "assistant", assistantContent, tokensUsed);
    db.prepare("UPDATE ai_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(convId);

    res.json({ conversation_id: convId, content: assistantContent, tokens_used: tokensUsed });
  } catch (err) {
    console.error("[Guia] Error:", err.message);
    res.status(500).json({ error: "Error al procesar tu consulta" });
  }
});

module.exports = router;
