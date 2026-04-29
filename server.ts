import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://mfpabfsovmrihxnnueda.supabase.co";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "sb_publishable_LcF9CHbus2yiACGpogKhmQ_0zJBqFyz";

const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/comments", async (req, res) => {
    if (!supabase) {
      console.info("Supabase not configured. Using AI Simulation Mode.");
      return res.json([]);
    }

    try {
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .order("date", { ascending: false })
        .limit(100);

      if (error) throw error;
      
      if (data && data.length > 0) {
        console.info(`Supabase Activity: Successfully fetched ${data.length} comments.`);
      } else {
        console.info("Supabase connected! However, your 'comments' table is currently empty.");
      }
      
      res.json(data || []);
    } catch (error: any) {
      const errorMessage = error?.message || error?.details || "Connection failed";
      console.info(`Supabase connection unavailable (${errorMessage}). Using Simulation Mode.`);
      res.json([]);
    }
  });

  // Webhook for MAKE (Integromat)
  app.post("/api/webhook/make", async (req, res) => {
    const { user, text, platform, brand, sentiment, category } = req.body;
    
    if (!user || !text) {
      return res.status(400).json({ error: "Missing required fields: user, text" });
    }

    const newComment = {
      user,
      text,
      platform: platform || "Webhook",
      brand: brand || "General",
      sentiment: sentiment || "Neutral",
      category: category || "General",
      date: new Date().toISOString(),
      likes: Math.floor(Math.random() * 100),
      shares: Math.floor(Math.random() * 20),
      reach: Math.floor(Math.random() * 5000)
    };

    try {
      const { data, error } = await supabase
        .from("comments")
        .insert([newComment])
        .select();

      if (error) throw error;
      
      res.status(201).json({ 
        status: "success", 
        data: data?.[0] 
      });
    } catch (error) {
      console.error("Webhook Supabase insert failed:", error);
      res.status(500).json({ error: "Failed to save comment" });
    }
  });

  // Export for Power BI
  // Provides a clean JSON endpoint that Power BI can consume as a Web Data Source
  app.get("/api/export/powerbi", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .order("date", { ascending: false });

      if (error) throw error;
      
      res.json({
        timestamp: new Date().toISOString(),
        total_comments: data?.length || 0,
        data: data || []
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch data for export" });
    }
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
