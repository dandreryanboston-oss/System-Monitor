import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = 
  process.env.NEXT_PUBLIC_SUPABASE_URL || 
  process.env.VITE_SUPABASE_URL || 
  process.env.SUPABASE_URL || 
  "https://mfpabfsovmrihxnnueda.supabase.co";

const supabaseAnonKey = 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
  process.env.VITE_SUPABASE_ANON_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  "sb_publishable_LcF9CHbus2yiACGpogKhmQ_0zJBqFyz";

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
      let query = supabase.from("social_mentions").select("*").limit(500);
      const { data, error } = await query;

      if (error) throw error;
      
      if (data && data.length > 0) {
        const mappedData = data.map((item: any) => ({
          ...item,
          id: item.id || Math.random(),
          user: item.author || "@desconocido",
          date: item.created_at || new Date().toISOString(),
          sentiment: item.sentiment ? (item.sentiment.charAt(0).toUpperCase() + item.sentiment.slice(1)) : "Neutral",
          brand: item.brand || "General",
          likes: item.likes || 0,
          shares: item.shares || 0,
          reach: item.reach || 0,
          score: item.score || 0
        }));
        
        const sortedData = mappedData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return res.json(sortedData);
      } else {
        return res.json([]);
      }
    } catch (error: any) {
      res.json([]);
    }
  });

  // Aggregated Stats for Dashboard
  app.get("/api/stats", async (req, res) => {
    if (!supabase) return res.json({ total: 0 });

    try {
      const { data, error } = await supabase.from("social_mentions").select("sentiment, brand, platform, score, reach, likes, shares, created_at");
      
      if (error) throw error;

      const stats = {
        total: data.length,
        sentiments: { Positivo: 0, Negativo: 0, Neutral: 0 },
        platforms: {} as Record<string, number>,
        brands: {} as Record<string, number>,
        avgScore: 0,
        totalReach: 0,
        totalEngagement: 0,
        recentActivity: [] as any[]
      };

      data.forEach((item: any) => {
        // Sentiment mapping
        const rawSentiment = item.sentiment?.toLowerCase() || "neutral";
        let s = "Neutral";
        if (rawSentiment.startsWith("pos")) s = "Positivo";
        if (rawSentiment.startsWith("neg")) s = "Negativo";
        
        if (stats.sentiments[s as keyof typeof stats.sentiments] !== undefined) {
          stats.sentiments[s as keyof typeof stats.sentiments]++;
        }
        
        stats.platforms[item.platform || "Web"] = (stats.platforms[item.platform || "Web"] || 0) + 1;
        stats.brands[item.brand || "General"] = (stats.brands[item.brand || "General"] || 0) + 1;
        stats.totalReach += (item.reach || 0);
        stats.totalEngagement += (item.likes || 0) + (item.shares || 0);
        stats.avgScore += (item.score || 0);
      });

      if (stats.total > 0) {
        stats.avgScore = parseFloat((stats.avgScore / stats.total).toFixed(2));
      }

      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
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
        .from("social_mentions")
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
        .from("social_mentions")
        .select("*")
        .order("created_at", { ascending: false });

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
