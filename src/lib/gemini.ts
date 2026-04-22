import { GoogleGenAI, Type } from "@google/genai";
import { Comment } from "../types";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not defined. AI features will not work.");
      // We return a dummy object that throws on usage instead of crashing on load
      return null;
    }
    aiInstance = new GoogleGenAI(apiKey);
  }
  return aiInstance;
}

export async function analyzeSentiment(comments: Comment[]): Promise<Comment[]> {
  const ai = getAI();
  if (!ai) return comments.map(c => ({ ...c, sentiment: "Neutral", score: 0, category: "General" }));

  const prompt = `Analyze the sentiment of the following social media comments. 
  For each comment, determine if it is "Positive", "Negative", or "Neutral", assign a score from -1 to 1, and a brief category (e.g., Service, Product, Price, Support).
  
  Comments:
  ${comments.map(c => `ID ${c.id}: ${c.text}`).join("\n")}
  
  Respond strictly in JSON format.`;

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
              sentiment: { type: Type.STRING, enum: ["Positive", "Negative", "Neutral"] },
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

  const profilePrompt = `Define the digital reputation profile for the brand/topic: "${keyword}".
  I need you to define:
  1. Sentiment distribution (e.g., 60% pos, 20% neg, 20% neu).
  2. Main categories (e.g., Service, Price, Quality).
  3. Dominant platforms.
  4. 5 examples of real comments representing this profile.
  
  Respond in JSON:
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

    const profile = JSON.parse(response.text || "{}");
    const data: Comment[] = [];
    const now = new Date();

    // Procedural generation based on AI profile
    for (let i = 0; i < count; i++) {
      const rand = Math.random();
      let sentiment: "Positive" | "Negative" | "Neutral";
      let score: number;

      if (rand < profile.pos_ratio) {
        sentiment = "Positive";
        score = 0.5 + Math.random() * 0.5;
      } else if (rand < profile.pos_ratio + profile.neg_ratio) {
        sentiment = "Negative";
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
