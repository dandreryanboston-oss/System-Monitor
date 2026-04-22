import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Mock Dataset
  const mockComments = [
    { id: 1, user: "@tech_guru", text: "El nuevo servicio es increíble, muy rápido y eficiente.", platform: "Twitter", date: "2024-04-15T08:00:00Z" },
    { id: 2, user: "@angry_customer", text: "Pésima atención al cliente, llevo esperando 3 horas.", platform: "Twitter", date: "2024-04-15T08:30:00Z" },
    { id: 3, user: "@user123", text: "Me gusta la interfaz, pero faltan algunas funciones básicas.", platform: "Instagram", date: "2024-04-15T09:00:00Z" },
    { id: 4, user: "@news_daily", text: "La empresa anuncia expansión regional tras éxito en ventas.", platform: "LinkedIn", date: "2024-04-15T09:15:00Z" },
    { id: 5, user: "@hater99", text: "No entiendo cómo alguien usa esto, es una basura total.", platform: "Twitter", date: "2024-04-15T09:45:00Z" },
    { id: 6, user: "@fan_boy", text: "Simplemente lo mejor que he probado este año.", platform: "Instagram", date: "2024-04-15T10:00:00Z" },
    { id: 7, user: "@critico_dev", text: "La API tiene muchos bugs, no es confiable para producción.", platform: "Twitter", date: "2024-04-15T10:30:00Z" },
    { id: 8, user: "@happy_user", text: "Gracias por solucionar mi problema tan rápido!", platform: "Twitter", date: "2024-04-15T11:00:00Z" },
    { id: 9, user: "@troll_face", text: "Estafa total, no caigan en esto.", platform: "Facebook", date: "2024-04-15T11:15:00Z" },
    { id: 10, user: "@biz_insider", text: "Reportan caída masiva del servicio en toda Latinoamérica.", platform: "Twitter", date: "2024-04-15T11:30:00Z" },
  ];

  // In-memory storage for comments (simulating a DB)
  let dynamicComments = [...mockComments];

  // API Routes
  app.get("/api/comments", (req, res) => {
    res.json(dynamicComments);
  });

  // Webhook for MAKE (Integromat)
  // This allows receiving real data from social media automation flows
  app.post("/api/webhook/make", (req, res) => {
    const { user, text, platform, brand } = req.body;
    
    if (!user || !text) {
      return res.status(400).json({ error: "Missing required fields: user, text" });
    }

    const newComment = {
      id: Date.now(),
      user,
      text,
      platform: platform || "Webhook",
      brand: brand || "General",
      date: new Date().toISOString(),
      likes: Math.floor(Math.random() * 100),
      shares: Math.floor(Math.random() * 20)
    };

    dynamicComments = [newComment, ...dynamicComments];
    console.log("New comment received via Webhook:", newComment.id);
    
    res.status(201).json({ 
      status: "success", 
      message: "Comment received and queued for analysis",
      data: newComment 
    });
  });

  // Export for Power BI
  // Provides a clean JSON endpoint that Power BI can consume as a Web Data Source
  app.get("/api/export/powerbi", (req, res) => {
    // In a real app, we would calculate metrics here or return raw data for PBI to process
    res.json({
      timestamp: new Date().toISOString(),
      total_comments: dynamicComments.length,
      data: dynamicComments
    });
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
