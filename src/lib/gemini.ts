import { GoogleGenAI, Type } from "@google/genai";
import { Comment } from "../types";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    // In Vite, process.env.GEMINI_API_KEY is defined via vite.config.ts
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey || apiKey === "undefined" || apiKey === "" || apiKey === "null") {
      console.warn("GEMINI_API_KEY is not defined or invalid. AI features will not work.");
      return null;
    }
    
    try {
      aiInstance = new GoogleGenAI({ apiKey });
    } catch (e) {
      console.error("Failed to initialize GoogleGenAI:", e);
      return null;
    }
  }
  return aiInstance;
}

export async function analyzeSentiment(comments: Comment[]): Promise<Comment[]> {
  const ai = getAI();
  if (!ai) return comments.map(c => ({ ...c, sentiment: "Neutral", score: 0, category: "General" }));

  const prompt = `Analiza el sentimiento de los siguientes comentarios de redes sociales. 
  Para cada comentario, determina si es "Positivo", "Negativo" o "Neutral", asigna un score de -1 a 1, y una categoría breve (ej. Servicio, Producto, Precio, Soporte).
  
  Comentarios:
  ${comments.map(c => `ID ${c.id}: ${c.text}`).join("\n")}
  
  Responde estrictamente en formato JSON.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.NUMBER },
                sentiment: { type: Type.STRING, enum: ["Positivo", "Negativo", "Neutral"] },
                score: { type: Type.NUMBER },
                category: { type: Type.STRING }
              },
              required: ["id", "sentiment", "score", "category"]
            }
          }
        }
      });

      const results = JSON.parse(response.text || "[]");
      
      return comments.map(comment => {
        const analysis = results.find((r: any) => r.id === comment.id);
        return {
          ...comment,
          sentiment: (analysis?.sentiment as any) || "Neutral",
          score: analysis?.score || 0,
          category: analysis?.category || "General"
        };
      });
    } catch (error) {
      console.error("Error analyzing sentiment:", error);
      return comments.map(c => ({ ...c, sentiment: "Neutral", score: 0, category: "General" }));
    }
  }
  
  export async function generateBulkData(keyword: string, count: number = 1500): Promise<Comment[]> {
    const ai = getAI();
    if (!ai) {
      console.error("AI instance not initialized. Cannot generate data.");
      return [];
    }
  
    const profilePrompt = `Define el perfil de reputación digital para la marca/tema: "${keyword}".
    Necesito que definas:
    1. Distribución de sentimiento (ej. 60% pos, 20% neg, 20% neu).
    2. Categorías principales (ej. Servicio, Precio, Calidad).
    3. Plataformas dominantes.
    4. 5 ejemplos de comentarios reales que representen este perfil.
    
    Responde en JSON:
    {
      "pos_ratio": number,
      "neg_ratio": number,
      "neu_ratio": number,
      "categories": string[],
      "platforms": string[],
      "examples": Array<{user: string, text: string, platform: string}>
    }`;
  
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: profilePrompt,
        config: { responseMimeType: "application/json" }
      });
  
      let profile = JSON.parse(response.text || "{}");
      
      // Basic validation and defaults
      profile = {
        pos_ratio: profile.pos_ratio ?? 0.4,
        neg_ratio: profile.neg_ratio ?? 0.3,
        neu_ratio: profile.neu_ratio ?? 0.3,
        categories: profile.categories?.length ? profile.categories : ["Servicio", "Producto", "General"],
        platforms: profile.platforms?.length ? profile.platforms : ["Twitter", "Instagram", "Facebook"],
        examples: profile.examples?.length ? profile.examples : [{user: "@anon", text: `Interesante lo de ${keyword}`, platform: "Twitter"}]
      };

      const data: Comment[] = [];
      const now = new Date();
  
      // Procedural generation based on AI profile
      for (let i = 0; i < count; i++) {
        const rand = Math.random();
        let sentiment: "Positivo" | "Negativo" | "Neutral";
        let score: number;
  
        if (rand < profile.pos_ratio) {
          sentiment = "Positivo";
          score = 0.5 + Math.random() * 0.5;
        } else if (rand < profile.pos_ratio + profile.neg_ratio) {
          sentiment = "Negativo";
          score = -1 + Math.random() * 0.5;
        } else {
          sentiment = "Neutral";
          score = -0.2 + Math.random() * 0.4;
        }
  
        const example = profile.examples[Math.floor(Math.random() * profile.examples.length)];
        const date = new Date(now.getTime() - Math.random() * 86400000 * 7); // Last 7 days
  
        data.push({
          id: Date.now() + i,
          brand: keyword,
          user: i < profile.examples.length ? profile.examples[i].user : `@user_${Math.floor(Math.random() * 10000)}`,
          text: i < profile.examples.length ? profile.examples[i].text : `Comentario aleatorio sobre ${keyword} #${i}`,
          platform: profile.platforms[Math.floor(Math.random() * profile.platforms.length)],
          date: date.toISOString(),
          sentiment,
          score,
          category: profile.categories[Math.floor(Math.random() * profile.categories.length)],
          likes: Math.floor(Math.random() * 500),
          shares: Math.floor(Math.random() * 100),
          reach: Math.floor(Math.random() * 5000) + 100,
          influencerScore: Math.floor(Math.random() * 100)
        });
      }
  
      return data;
    } catch (error) {
      console.error("Error generating bulk data:", error);
      return [];
    }
  }
