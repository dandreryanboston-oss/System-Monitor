export interface Comment {
  id: number;
  user: string;
  text: string;
  platform: string;
  date: string;
  sentiment?: "Positivo" | "Negativo" | "Neutral";
  score?: number; // -1 to 1
  category?: string;
  brand?: string;
  likes?: number;
  shares?: number;
  reach?: number; // Estimated reach
  influencerScore?: number; // 0 to 100
}

export interface ReputationMetrics {
  totalMencions: number;
  sentimentDistribution: {
    positive: number;
    negative: number;
    neutral: number;
  };
  reputationScore: number; // 0 to 100
  nps: number; // -100 to 100
  avgEngagement: number;
  engagementRate: number; // %
  totalReach: number;
  sov: number; // Share of Voice %
  influencerImpact: number; // 0 to 100
  isCrisis: boolean;
  brandName?: string;
  trends: {
    sentiment: number; // % change
    volume: number; // % change
  };
}
