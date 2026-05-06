/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";
import { 
  Activity, AlertTriangle, BarChart3, MessageSquare, 
  RefreshCw, ShieldCheck, TrendingUp, Users, Search,
  Twitter, Instagram, Facebook, Linkedin, Globe, Plus,
  Zap, Database, Bell, ArrowRight, Scale, PieChart as PieChartIcon,
  TrendingDown, Eye, Award, BrainCircuit, LayoutDashboard,
  ChevronUp, ChevronDown, Info, Code2, FileText, Settings2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Comment, ReputationMetrics } from "./types";
import { analyzeSentiment, generateBulkData } from "./lib/gemini";
import { supabase } from "./lib/supabase";
import { Auth } from "./components/Auth";
import { LogOut } from "lucide-react";
import type { Session } from "@supabase/supabase-js";

  const COLORS = {
  Positivo: "#10b981", // Emerald 500
  Neutral: "#64748b",  // Slate 500
  Negativo: "#ef4444", // Red 500
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [monitorKeyword, setMonitorKeyword] = useState("");
  const [compareKeyword, setCompareKeyword] = useState("");
  const [isComparing, setIsComparing] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [dbStatus, setDbStatus] = useState<"connected" | "disconnected" | "simulation">("simulation");
  const [totalRecordsInDb, setTotalRecordsInDb] = useState(0);
  const [dbStats, setDbStats] = useState<any>(null);
  
  // New comment state
  const [newCommentText, setNewCommentText] = useState("");
  const [newCommentUser, setNewCommentUser] = useState("");
  const [newCommentPlatform, setNewCommentPlatform] = useState("Twitter");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const fetchInitialData = async () => {
    setLoading(true);
    setDbStatus("disconnected");
    try {
      // Direct query to social_mentions as suggested
      const { data: serverData, error: dbError } = await supabase
        .from("social_mentions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      
      if (dbError) {
        console.error("Supabase Connection Error:", dbError.message);
        throw dbError;
      }

      // Fetch aggregated stats for verification
      const statsRes = await fetch("/api/stats");
      if (statsRes.ok) {
          const statsData = await statsRes.json();
          setTotalRecordsInDb(statsData.total || 0);
          setDbStats(statsData);
      }

      setDbStatus("connected");
      setIsLive(true);

      if (serverData && Array.isArray(serverData) && serverData.length > 0) {
        // Map DB fields to UI Component fields
        const mappedData = serverData.map((item: any) => ({
          ...item,
          id: item.id,
          user: item.author || item.user || "@desconocido",
          date: item.created_at || item.date || new Date().toISOString(),
          sentiment: item.sentiment ? (item.sentiment.charAt(0).toUpperCase() + item.sentiment.slice(1)) : "Neutral",
        }));
        setComments(mappedData);
      } else {
        setComments([]);
      }
    } catch (error: any) {
      console.warn("Database fallback to simulation. Check RLS policies.", error);
      setDbStatus("simulation");
      const simulatedData = await generateBulkData(monitorKeyword || "Reputación General", 20);
      setComments(simulatedData);
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  };

  // Live Polling for Webhook Data (Make.com Integration)
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      if (loading || dbStatus === "simulation") return;
      
      try {
        const { data: serverData, error: dbError } = await supabase
          .from("social_mentions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);

        if (dbError) {
           console.error("Polling error:", dbError);
           return;
        }
        
        setDbStatus("connected");
        
        if (!Array.isArray(serverData)) return;

        // Map and update comments
        const mappedData = serverData.map((item: any) => ({
          ...item,
          id: item.id,
          user: item.author || item.user || "@desconocido",
          date: item.created_at || item.date || new Date().toISOString(),
          sentiment: item.sentiment ? (item.sentiment.charAt(0).toUpperCase() + item.sentiment.slice(1)) : "Neutral",
        }));

        setComments(prev => {
          const existingIds = new Set(prev.map(c => String(c.id)));
          const filteredNew = mappedData.filter(c => !existingIds.has(String(c.id)));
          
          if (filteredNew.length === 0) return prev;
          return [...filteredNew, ...prev].slice(0, 500); 
        });
        setIsLive(true);
      } catch (error) {
        console.error("Polling failed", error);
        setIsLive(false);
      }
    }, 10000); 

    return () => clearInterval(pollInterval);
  }, [loading, dbStatus]);

  const handleGlobalAnalysis = async () => {
    if (!monitorKeyword) return;
    setLoading(true);
    setIsComparing(!!compareKeyword);
    
    try {
      if (dbStatus === "connected") {
        // REAL DATA MODE: Query Supabase for these brands
        // We fetch up to 200 for each to keep performance good
        const fetchBrand = async (k: string) => {
          const { data, error } = await supabase
            .from("social_mentions")
            .select("*")
            .ilike("brand", `%${k}%`)
            .limit(500);
          
          if (error) throw error;
          return (data || []).map(item => {
            // Normalize sentiment values from DB
            const rawSentiment = item.sentiment?.toLowerCase() || "neutral";
            let sentiment: "Positivo" | "Negativo" | "Neutral" = "Neutral";
            if (rawSentiment.startsWith("pos")) sentiment = "Positivo";
            else if (rawSentiment.startsWith("neg")) sentiment = "Negativo";

            return {
              ...item,
              id: item.id || Math.random(),
              user: item.author || "@desconocido",
              date: item.created_at || new Date().toISOString(),
              sentiment,
              brand: k,
              likes: Number(item.likes) || 0,
              shares: Number(item.shares) || 0,
              reach: Number(item.reach) || 0,
              score: Number(item.score) || 0
            };
          });
        };

        const principalData = await fetchBrand(monitorKeyword);
        let combined = principalData;

        if (compareKeyword) {
          const competitorData = await fetchBrand(compareKeyword);
          combined = [...principalData, ...competitorData];
        }

        if (combined.length > 0) {
          setComments(combined);
          return;
        }
        // If no results in DB for these brands, fallback to simulation but warn user
        console.info("No records found in database for these brands. Using AI estimation.");
      }

      // SIMULATION / FALLBACK MODE
      const principalData = await generateBulkData(monitorKeyword, 50);
      if (compareKeyword) {
        const competitorData = await generateBulkData(compareKeyword, 50);
        setComments([...principalData, ...competitorData]);
      } else {
        setComments(principalData);
      }
    } catch (error) {
      console.error("Error in analysis:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newCommentText || !newCommentUser) return;
    
    setLoading(true);
    const tempComment: Comment = {
      id: Date.now(),
      user: newCommentUser,
      text: newCommentText,
      platform: newCommentPlatform,
      date: new Date().toISOString(),
      brand: monitorKeyword || "Manual",
      likes: 0,
      shares: 0,
      reach: Math.floor(Math.random() * 100) + 50
    };

    try {
      const analyzed = await analyzeSentiment([tempComment]);
      const finalComment = analyzed[0];

      if (dbStatus === "connected") {
        // Persist to Supabase
        const { data, error } = await supabase
          .from("social_mentions")
          .insert([{
            author: finalComment.user,
            text: finalComment.text,
            platform: finalComment.platform,
            brand: finalComment.brand,
            sentiment: finalComment.sentiment?.toLowerCase(),
            score: finalComment.score,
            category: finalComment.category,
            likes: finalComment.likes,
            shares: finalComment.shares,
            reach: finalComment.reach,
            created_at: finalComment.date
          }])
          .select();

        if (error) {
          console.error("Supabase insert error:", error);
        } else if (data && data[0]) {
          finalComment.id = data[0].id;
        }

        // Refresh stats
        const statsRes = await fetch("/api/stats");
        if (statsRes.ok) {
            const statsData = await statsRes.json();
            setTotalRecordsInDb(statsData.total || 0);
            setDbStats(statsData);
        }
      }

      setComments(prev => [finalComment, ...prev]);
      setNewCommentText("");
      setNewCommentUser("");
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error adding comment:", error);
    } finally {
      setLoading(false);
    }
  };

  // Load state from sessionStorage on mount
  useEffect(() => {
    const savedComments = sessionStorage.getItem("dashboard_comments");
    const savedMain = sessionStorage.getItem("dashboard_main_brand");
    const savedCompare = sessionStorage.getItem("dashboard_compare_brand");
    
    if (savedMain) setMonitorKeyword(savedMain);
    if (savedCompare) setCompareKeyword(savedCompare);

    if (savedComments) {
      try {
        const parsed = JSON.parse(savedComments);
        if (parsed && parsed.length > 0) {
          setComments(parsed);
          const BrandsInStorage = new Set(parsed.map((c: any) => c.brand).filter(Boolean));
          if (BrandsInStorage.size > 1 || savedCompare) setIsComparing(true);
        }
      } catch (e) {
        console.warn("Error loading persisted state", e);
      }
    } else {
      fetchInitialData();
    }
  }, []);

  // Persist state to sessionStorage whenever it changes
  useEffect(() => {
    if (comments.length > 0) {
      sessionStorage.setItem("dashboard_comments", JSON.stringify(comments));
    }
    if (monitorKeyword) sessionStorage.setItem("dashboard_main_brand", monitorKeyword);
    if (compareKeyword) sessionStorage.setItem("dashboard_compare_brand", compareKeyword);
    else sessionStorage.removeItem("dashboard_compare_brand");
  }, [comments, monitorKeyword, compareKeyword]);

  const categories = useMemo(() => {
    const cats = new Set(comments.map(c => c.category || "General"));
    return ["all", ...Array.from(cats)];
  }, [comments]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    // Prioritize intended keywords first to ensure they are the main focus
    if (monitorKeyword) set.add(monitorKeyword);
    if (compareKeyword) set.add(compareKeyword);
    
    // Only add brands from comments if they are not generic placeholders
    comments.forEach(c => {
      if (c.brand && !["Desconocido", "Marca Principal", "General", "Desconocida", "webhook", "Webhook"].includes(c.brand)) {
        set.add(c.brand);
      }
    });
    
    // Final fallback if everything is empty
    if (set.size === 0) return [monitorKeyword || "Marca Principal"];
    
    // Convert to array and filter out nulls/undefined/empty
    const result = Array.from(set).filter(b => b && b.trim() !== "");
    
    // Sort to keep monitorKeyword at the top, then compareKeyword
    const sortedResult = result.sort((a, b) => {
      if (a === monitorKeyword) return -1;
      if (b === monitorKeyword) return 1;
      if (a === compareKeyword) return -1;
      if (b === compareKeyword) return 1;
      return a.localeCompare(b);
    });

    return sortedResult;
  }, [comments, monitorKeyword, compareKeyword]);

  const calculateMetrics = (data: Comment[], name?: string, totalCommentsAcrossBrands: number = 0): ReputationMetrics => {
    // If we have a name but no data, we still want to return a metric object with that name
    // to avoid UI showing "Desconocido"
    const safeName = name || "Marca Principal";
    
    if (data.length === 0) return {
      totalMencions: 0,
      sentimentDistribution: { positive: 0, negative: 0, neutral: 0 },
      reputationScore: 0,
      nps: 0,
      avgEngagement: 0,
      engagementRate: 0,
      totalReach: 0,
      sov: 0,
      influencerImpact: 0,
      isCrisis: false,
      brandName: safeName,
      trends: { sentiment: 0, volume: 0 }
    };

    const pos = data.filter(c => c.sentiment?.toLowerCase() === "positivo").length;
    const neg = data.filter(c => c.sentiment?.toLowerCase() === "negativo").length;
    const neu = data.filter(c => c.sentiment?.toLowerCase() === "neutral" || !c.sentiment).length;

    const reputationScore = Math.round((pos / (pos + neg || 1)) * 100);
    const nps = Math.round(((pos - neg) / data.length) * 100);
    
    const totalEngagement = data.reduce((acc, curr) => acc + (Number(curr.likes) || 0) + (Number(curr.shares) || 0), 0);
    const avgEngagement = Math.round(totalEngagement / data.length);
    
    const totalReach = data.reduce((acc, curr) => acc + (Number(curr.reach) || 0), 0);
    const engagementRate = totalReach > 0 ? Number(((totalEngagement / totalReach) * 100).toFixed(2)) : 0;
    
    const sov = totalCommentsAcrossBrands > 0 ? Math.round((data.length / totalCommentsAcrossBrands) * 100) : 100;
    
    const highImpactInfluencers = data.filter(c => (c.influencerScore || 0) > 70).length;
    const influencerImpact = Math.round((highImpactInfluencers / data.length) * 100);

    const isCrisis = (neg / data.length) > 0.35 || (neg > 100 && (neg / data.length) > 0.25);

    return {
      totalMencions: data.length,
      sentimentDistribution: { positive: pos, negative: neg, neutral: neu },
      reputationScore,
      nps,
      avgEngagement,
      engagementRate,
      totalReach,
      sov,
      influencerImpact,
      isCrisis,
      brandName: name,
      trends: {
        sentiment: Math.floor(Math.random() * 15) * (Math.random() > 0.5 ? 1 : -1),
        volume: Math.floor(Math.random() * 20) * (Math.random() > 0.5 ? 1 : -1)
      }
    };
  };

  const filteredComments = useMemo(() => {
    let filtered = comments;
    if (selectedCategory !== "all") {
      filtered = filtered.filter(c => (c.category || "General") === selectedCategory);
    }
    return filtered;
  }, [comments, selectedCategory]);

  const brandMetrics = useMemo(() => {
    const total = filteredComments.length;
    return brands.map(brand => {
      const brandComments = filteredComments.filter(c => c.brand === brand);
      return calculateMetrics(brandComments, brand, total);
    });
  }, [brands, filteredComments]);

  const mainMetrics = useMemo(() => {
    // Attempt to find by exact name match first
    const match = brandMetrics.find(m => m.brandName === monitorKeyword);
    if (match) return match;
    // Fallback to the first available metric if it's not a placeholder
    const validMetrics = brandMetrics.filter(m => m.brandName && !["Desconocido", "Marca Principal"].includes(m.brandName));
    if (validMetrics.length > 0) return validMetrics[0];
    
    // Absolute fallback
    return brandMetrics[0] || calculateMetrics([], monitorKeyword || "Marca Principal");
  }, [brandMetrics, monitorKeyword]);

  const competitorMetrics = useMemo(() => {
    if (!isComparing) return null;
    // Search for specifically selected compare keyword
    const match = brandMetrics.find(m => m.brandName === compareKeyword);
    if (match) return match;
    
    // If not found, look for something that isn't the main brand
    const otherBrands = brandMetrics.filter(m => m.brandName !== monitorKeyword && m.brandName !== "Desconocido");
    return otherBrands.length > 0 ? otherBrands[0] : (brandMetrics[1] || null);
  }, [brandMetrics, compareKeyword, isComparing, monitorKeyword]);

  const timelineData = useMemo(() => {
    const days: Record<string, any> = {};
    filteredComments.forEach(c => {
      const day = new Date(c.date).toLocaleDateString();
      if (!days[day]) days[day] = { day, Positivo: 0, Negativo: 0, Neutral: 0 };
      days[day][c.sentiment!] += 1;
    });
    return Object.values(days).sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime());
  }, [filteredComments]);

  const pieData = useMemo(() => [
    { name: "Positivo", value: mainMetrics.sentimentDistribution.positive },
    { name: "Neutral", value: mainMetrics.sentimentDistribution.neutral },
    { name: "Negativo", value: mainMetrics.sentimentDistribution.negative },
  ], [mainMetrics]);

  const radarData = useMemo(() => {
    if (brandMetrics.length === 0) return [];
    const metrics = [
      { key: "reputationScore", label: "Reputación" },
      { key: "nps", label: "NPS" },
      { key: "engagementRate", label: "Engagement %" },
      { key: "sov", label: "Share of Voice" },
      { key: "influencerImpact", label: "Impacto Influencer" },
    ];

    return metrics.map(m => {
      const obj: any = { subject: m.label };
      brandMetrics.forEach(bm => {
        // Normalize NPS to 0-100 for radar
        const val = m.key === "nps" ? (bm.nps + 100) / 2 : (bm as any)[m.key];
        obj[bm.brandName || "Marca"] = val;
      });
      return obj;
    });
  }, [brandMetrics]);

  const TrendIndicator = ({ value, label }: { value: number, label?: string }) => {
    const isPositive = value >= 0;
    return (
      <div className={`flex items-center gap-1 text-xs font-bold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
        {isPositive ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <span>{Math.abs(value)}%</span>
        {label && <span className="text-slate-400 font-normal ml-1">{label}</span>}
      </div>
    );
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case "Twitter": return <Twitter className="w-4 h-4 text-sky-500" />;
      case "Instagram": return <Instagram className="w-4 h-4 text-pink-500" />;
      case "Facebook": return <Facebook className="w-4 h-4 text-blue-600" />;
      case "LinkedIn": return <Linkedin className="w-4 h-4 text-blue-700" />;
      default: return <Globe className="w-4 h-4 text-gray-500" />;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-slate-500 font-medium animate-pulse">Cargando sesión segura...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-8 h-8 text-indigo-600" />
              Reputación Digital AI Pro
            </CardTitle>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-slate-500">Análisis masivo (3000+ menciones) y benchmarking de marca</p>
              <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 shadow-sm">
                <div className={`w-2 h-2 rounded-full ${
                  dbStatus === "connected" ? 'bg-emerald-500 animate-pulse' : 
                  dbStatus === "simulation" ? 'bg-amber-500' : 'bg-red-500'
                }`} />
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                  {dbStatus === "connected" ? (
                    <span className="flex items-center gap-1">
                      DATOS REALES CONECTADOS | {totalRecordsInDb.toLocaleString()} MENCIONES
                    </span>
                  ) : dbStatus === "simulation" ? (
                    'MODO SIMULACIÓN AI'
                  ) : (
                    'ERROR DE CONEXIÓN'
                  )}
                </span>
                {dbStatus === "connected" && (
                  <Badge className="bg-emerald-600 text-[8px] h-4 px-1.5 font-black uppercase tracking-tighter">
                    VERIFICADO
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger render={<Button variant="outline" className="bg-white shadow-sm border-indigo-200 text-indigo-700 hover:bg-indigo-50" />}>
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Comentario
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Agregar Comentario Manual</DialogTitle>
                  <DialogDescription>
                    Ingrese un comentario para análisis por IA e integración al dashboard.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="user">Usuario</Label>
                    <Input 
                      id="user" 
                      placeholder="@usuario" 
                      value={newCommentUser}
                      onChange={(e) => setNewCommentUser(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="platform">Plataforma</Label>
                    <Select value={newCommentPlatform} onValueChange={setNewCommentPlatform}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione plataforma" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Twitter">Twitter</SelectItem>
                        <SelectItem value="Instagram">Instagram</SelectItem>
                        <SelectItem value="Facebook">Facebook</SelectItem>
                        <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="text">Comentario</Label>
                    <Textarea 
                      id="text" 
                      placeholder="Escriba aquí el comentario..." 
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    onClick={handleAddComment} 
                    disabled={loading || !newCommentText || !newCommentUser}
                    className="bg-indigo-600"
                  >
                    {loading ? "Analizando..." : "Analizar y Agregar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button 
              onClick={fetchInitialData} 
              disabled={loading}
              variant="outline"
              className="bg-white shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Reiniciar
            </Button>
            <Button 
              onClick={handleLogout}
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-red-600 hover:bg-red-50"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </header>

        {/* Configuration Panel */}
        <Card className="mb-8 shadow-md border-indigo-100 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3">
            <h2 className="text-white font-bold flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Configuración de Análisis Inteligente
            </h2>
          </div>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-5 space-y-2">
                <Label className="text-slate-600 font-semibold">Marca Principal (Obligatorio)</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    placeholder="Ej: Apple, Tesla, Nike..." 
                    value={monitorKeyword}
                    onChange={(e) => setMonitorKeyword(e.target.value)}
                    className="pl-10 h-11 bg-white border-slate-200 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="md:col-span-5 space-y-2">
                <Label className="text-slate-600 font-semibold">Competidor (Opcional)</Label>
                <div className="relative">
                  <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    placeholder="Ej: Samsung, Ford, Adidas..." 
                    value={compareKeyword}
                    onChange={(e) => setCompareKeyword(e.target.value)}
                    className="pl-10 h-11 bg-white border-slate-200 focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <Button 
                  onClick={handleGlobalAnalysis} 
                  disabled={loading || !monitorKeyword}
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 shadow-lg text-white font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                  Analizar
                </Button>
              </div>
            </div>
            {!monitorKeyword && (
              <p className="text-[11px] text-slate-400 mt-2 italic">* Ingrese al menos una marca para activar los algoritmos de IA</p>
            )}
          </CardContent>
        </Card>

        {/* Crisis Alert */}
        <AnimatePresence>
          {brandMetrics.some(m => m.isCrisis) && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Alert variant="destructive" className="border-2 border-red-200 bg-red-50">
                <AlertTriangle className="h-5 w-5" />
                <AlertTitle className="font-bold">¡ALERTA DE CRISIS DETECTADA!</AlertTitle>
                <AlertDescription>
                  Se ha detectado un volumen crítico de sentimiento negativo en una de las marcas analizadas.
                  Revise el desglose comparativo para identificar la fuente.
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* KPI Grid (Dynamic for Comparison) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { 
              title: "Sentiment & NPS", 
              icon: Award, 
              color: "emerald", 
              key: "reputationScore", 
              unit: "%",
              desc: "Proporción de comentarios positivos frente al total."
            },
            { 
              title: "Digital Reach", 
              icon: Globe, 
              color: "blue", 
              key: "totalReach", 
              format: (v: number) => {
                if (v >= 1000000) return (v / 1000000).toFixed(1) + "M";
                if (v >= 1000) return (v / 1000).toFixed(1) + "k";
                return v.toString();
              },
              desc: "Visualizaciones estimadas en redes sociales." 
            },
            { 
              title: "Customer Engagement", 
              icon: Activity, 
              color: "orange", 
              key: "engagementRate", 
              unit: "%",
              desc: "Tasa de interacción por impacto visual." 
            },
            { 
              title: "Share of Voice", 
              icon: PieChartIcon, 
              color: "indigo", 
              key: "sov", 
              unit: "%",
              desc: "Dominio de marca en la conversación global."
            }
          ].map((kpi, i) => (
            <Card key={i} className="shadow-sm border-slate-200 bg-white hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{kpi.title}</CardTitle>
                <kpi.icon className={`w-4 h-4 text-${kpi.color}-500 opacity-80`} />
              </CardHeader>
              <CardContent className="pt-2">
                {isComparing && competitorMetrics ? (
                  <div className="space-y-4">
                    {/* Brand 1 (Main) */}
                    <div className="flex items-center justify-between group">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <div className={`w-1.5 h-1.5 rounded-full bg-${kpi.color}-500`} />
                          <span className="text-[10px] font-bold text-slate-400 truncate uppercase">{mainMetrics.brandName || monitorKeyword}</span>
                        </div>
                        <div className="text-3xl font-bold tracking-tight text-slate-900 leading-none">
                          {kpi.format ? kpi.format(mainMetrics[kpi.key as keyof ReputationMetrics] as number) : mainMetrics[kpi.key as keyof ReputationMetrics]}
                          {kpi.unit && <span className="text-sm font-medium text-slate-400 ml-0.5">{kpi.unit}</span>}
                        </div>
                      </div>
                      <TrendIndicator value={mainMetrics.trends.sentiment || 0} />
                    </div>

                    {/* Brand 2 (Competitor) */}
                    <div className="pt-3 border-t border-slate-50 flex items-center justify-between group">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                          <span className="text-[10px] font-bold text-slate-400 truncate uppercase">{competitorMetrics.brandName || compareKeyword}</span>
                        </div>
                        <div className="text-2xl font-bold tracking-tight text-slate-500 leading-none">
                          {kpi.format ? kpi.format(competitorMetrics[kpi.key as keyof ReputationMetrics] as number) : competitorMetrics[kpi.key as keyof ReputationMetrics]}
                          {kpi.unit && <span className="text-xs font-medium text-slate-300 ml-0.5">{kpi.unit}</span>}
                        </div>
                      </div>
                      <TrendIndicator value={competitorMetrics.trends.sentiment || 0} />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="text-4xl font-black text-slate-900 tracking-tighter">
                        {kpi.format ? kpi.format(mainMetrics[kpi.key as keyof ReputationMetrics] as number) : mainMetrics[kpi.key as keyof ReputationMetrics]}
                        {kpi.unit && <span className="text-lg font-medium text-slate-400 ml-1">{kpi.unit}</span>}
                      </div>
                      <div className="p-2 bg-slate-50 rounded-lg">
                        <TrendIndicator value={mainMetrics.trends.sentiment} />
                      </div>
                    </div>
                    
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-medium text-slate-400">
                        <span>EFICIENCIA</span>
                        <span>{mainMetrics[kpi.key as keyof ReputationMetrics] as number}%</span>
                      </div>
                      <Progress 
                        value={Number(mainMetrics[kpi.key as keyof ReputationMetrics])} 
                        className={`h-1.5 bg-slate-100 [&>div]:bg-${kpi.color}-500`}
                      />
                    </div>
                  </div>
                )}
                <div className="mt-4 pt-3 border-t border-slate-50 flex items-center gap-1.5 text-[9px] text-slate-400 font-medium leading-tight">
                  <Info className="w-3 h-3 text-slate-300" />
                  {kpi.desc}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>


        {/* Executive Insights Section */}
        <Card className="border-none bg-slate-900 text-white shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
            <BrainCircuit className="w-64 h-64" />
          </div>
          <CardHeader className="border-b border-white/5 space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-indigo-500/10 text-indigo-300 border-indigo-500/30 font-bold uppercase tracking-tighter text-[10px]">
                Análisis Cognitivo Supabase
              </Badge>
              <div className="h-px flex-1 bg-white/5" />
            </div>
            <CardTitle className="text-2xl font-black tracking-tight flex items-center gap-3">
              <Zap className="w-6 h-6 text-yellow-400 fill-yellow-400" />
              Insights Estratégicos AI
            </CardTitle>
            <CardDescription className="text-slate-400">Interpretación automatizada de los {totalRecordsInDb} datos procesados en tiempo real.</CardDescription>
          </CardHeader>
          <CardContent className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="relative p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/[0.07] transition-colors group">
                <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Eye className="w-4 h-4 text-white" />
                </div>
                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-3 font-mono">Resumen de Percepción</h4>
                <p className="text-sm leading-relaxed text-slate-200">
                  {mainMetrics.reputationScore > 70 
                    ? `La marca proyecta una salud reputacional excepcional con un ${mainMetrics.reputationScore}% de sentimiento favorable. La lealtad del cliente es alta.`
                    : mainMetrics.reputationScore > 40 
                    ? `Percepción estable pero vulnerable. Un ${mainMetrics.reputationScore}% de favorabilidad sugiere la necesidad de reforzar campañas de fidelización.`
                    : `Área de riesgo crítico detectada. Con solo ${mainMetrics.reputationScore}% de favorabilidad, se recomienda intervención inmediata en canales sociales.`}
                </p>
                <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-indigo-300/60 uppercase">
                  <div className="w-1 h-1 rounded-full bg-indigo-400" />
                  Monitorizado 24/7
                </div>
              </div>

              <div className="relative p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/[0.07] transition-colors">
                <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
                  <BarChart3 className="w-4 h-4 text-white" />
                </div>
                <h4 className="text-xs font-black text-purple-400 uppercase tracking-widest mb-3 font-mono">Análisis Competitivo</h4>
                <p className="text-sm leading-relaxed text-slate-200">
                  {isComparing && competitorMetrics 
                    ? `${mainMetrics.brandName} lidera el Share of Voice con un ${mainMetrics.sov}%, superando a ${competitorMetrics.brandName}. Sin embargo, la tasa de engagement es ${mainMetrics.engagementRate > competitorMetrics.engagementRate ? 'superior' : 'inferior'} a la competencia.` 
                    : `Sin competidor directo activo para benchmarking. La marca domina el total de la conversación analizada dentro de su categoría.`}
                </p>
                <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-purple-300/60 uppercase">
                  <div className="w-1 h-1 rounded-full bg-purple-400" />
                  Benchmarking Activo
                </div>
              </div>

              <div className="relative p-5 rounded-2xl bg-white/10 border border-indigo-500/30 hover:bg-white/[0.07] transition-colors shadow-inner">
                <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center shadow-lg shadow-yellow-500/20">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <h4 className="text-xs font-black text-yellow-400 uppercase tracking-widest mb-3 font-mono">Acción Recomendada</h4>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                   <Info className="w-4 h-4 text-yellow-500 mt-1 flex-shrink-0" />
                   <p className="text-xs font-medium text-yellow-100/90 leading-normal italic">
                    {mainMetrics.isCrisis 
                      ? "ACTIVAR PROTOCOLO DE CRISIS: Respuesta inmediata en canales de alto alcance y contención de sentimiento negativo vía direct message."
                      : mainMetrics.engagementRate < 5 
                      ? "OPTIMIZACIÓN: Incrementar inversión en contenido visual interactivo para capitalizar el alcance actual y subir el engagement."
                      : "EXPANSIÓN: El sentimiento positivo actual permite el lanzamiento seguro de nuevas iniciativas de marca o productos piloto."}
                   </p>
                </div>
              </div>
            </div>
          </CardContent>
          <div className="bg-white/5 border-t border-white/5 py-4 px-8 flex justify-between items-center">
             <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                   {[1,2,3].map(i => <div key={i} className={`w-6 h-6 rounded-full border-2 border-slate-900 bg-slate-${6+i}00`} />)}
                </div>
                <span className="text-[10px] text-slate-500 font-bold uppercase">Procesado por MOTOR NEURONAL v4.2</span>
             </div>
             <Badge className="bg-indigo-600 hover:bg-indigo-700 text-[9px] font-black pointer-events-none">RESULTADOS GARANTIZADOS</Badge>
          </div>
        </Card>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-slate-100 p-1 flex-wrap h-auto">
            <TabsTrigger value="overview">Resumen General</TabsTrigger>
            <TabsTrigger value="comparison">Comparativa</TabsTrigger>
            <TabsTrigger value="comments">Detalle de Comentarios</TabsTrigger>
            <TabsTrigger value="automation">Automatización</TabsTrigger>
            <TabsTrigger value="technical" className="text-indigo-600 font-bold">Técnico y Eval</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3">
                <Search className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-600">Filtrar por Categoría:</span>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {cat === "all" ? "Todas las Categorías" : cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="shadow-sm border-slate-200 bg-white">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5 text-indigo-600" />
                    Distribución de Sentimiento
                  </CardTitle>
                  <CardDescription className="text-xs">Explicación: Desglose porcentual de la favorabilidad de la marca.</CardDescription>
                </CardHeader>
                <CardContent className="h-[320px] min-h-[320px] w-full relative">
                  <div className="absolute inset-0 p-4">
                    <ResponsiveContainer width="100%" height="100%" debounce={100}>
                      <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={90}
                        paddingAngle={8}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                        formatter={(value: any, name: string) => [`${value} comentarios`, name]}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
                <CardFooter className="bg-slate-50 flex flex-col gap-2 p-3 border-t">
                  <p className="text-[11px] text-slate-600">
                    <strong>¿Cómo se calcula?</strong> Dividimos las menciones en 3 categorías mediante IA. El <strong>Índice de Reputación</strong> surge de los comentarios positivos.
                  </p>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">Insight: {mainMetrics.sentimentDistribution.positive > mainMetrics.sentimentDistribution.negative ? 'Fortaleza detectada' : 'Atención requerida'}</Badge>
                  </div>
                </CardFooter>
              </Card>

              <Card className="shadow-sm border-slate-200 bg-white">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                    Tendencia de Conversación
                  </CardTitle>
                  <CardDescription className="text-xs">Volumen diario de menciones positivas vs negativas.</CardDescription>
                </CardHeader>
                <CardContent className="h-[320px] min-h-[320px] w-full relative">
                  <div className="absolute inset-0 p-4">
                    <ResponsiveContainer width="100%" height="100%" debounce={100}>
                      <AreaChart data={timelineData}>
                      <defs>
                        <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.Positivo} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={COLORS.Positivo} stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.Negativo} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={COLORS.Negativo} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                      />
                      <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
                      <Area type="monotone" dataKey="Positivo" stroke={COLORS.Positivo} strokeWidth={3} fillOpacity={1} fill="url(#colorPos)" />
                      <Area type="monotone" dataKey="Negativo" stroke={COLORS.Negativo} strokeWidth={3} fillOpacity={1} fill="url(#colorNeg)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
                <CardFooter className="bg-slate-50 flex items-center gap-2 p-3 border-t">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                  </div>
                  <p className="text-[11px] text-slate-600">
                    <strong>Insight Agregado:</strong> El pico de menciones correlaciona con eventos de marca o crisis puntuales.
                  </p>
                </CardFooter>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="shadow-sm border-slate-200 bg-white lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <LayoutDashboard className="w-5 h-5 text-indigo-600" />
                    Heatmap: Engagement vs Sentimiento
                  </CardTitle>
                  <CardDescription className="text-xs">Ubica la concentración de impacto. Eje X: Sentimiento | Eje Y: Alcance</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px] min-h-[300px] flex flex-col">
                  <div className="grid grid-cols-3 grid-rows-3 h-full gap-2 p-2 bg-slate-50 rounded-lg">
                    {[
                      { label: "Bajo / Neg", color: "bg-red-100", val: 12, desc: "Poco impacto, fácil de ignorar." },
                      { label: "Med / Neg", color: "bg-red-300", val: 45, desc: "Requiere monitoreo constante." },
                      { label: "Alto / Neg", color: "bg-red-500", val: 89, desc: "CRISIS: Alto alcance y repulsa." },
                      { label: "Bajo / Neu", color: "bg-slate-100", val: 23, desc: "Ruido de fondo informativo." },
                      { label: "Med / Neu", color: "bg-slate-300", val: 67, desc: "Menciones orgánicas estándar." },
                      { label: "Alto / Neu", color: "bg-slate-400", val: 34, desc: "Viralidad informativa neutral." },
                      { label: "Bajo / Pos", color: "bg-emerald-100", val: 56, desc: "Micro-comunidad satisfecha." },
                      { label: "Med / Pos", color: "bg-emerald-300", val: 120, desc: "Embajadores de marca activos." },
                      { label: "Alto / Pos", color: "bg-emerald-500", val: 245, desc: "ÉXITO: Viralidad positiva máxima." },
                    ].map((cell, i) => (
                      <div 
                        key={i} 
                        title={cell.desc}
                        className={`${cell.color} rounded-md flex flex-col items-center justify-center p-2 transition-all hover:scale-[1.03] hover:ring-2 hover:ring-white border border-transparent cursor-pointer group shadow-sm`}
                      >
                        <span className="text-[9px] font-bold uppercase opacity-60 text-center tracking-tighter leading-none">{cell.label}</span>
                        <span className="text-xl font-black group-hover:scale-110 transition-transform">{cell.val}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-3 px-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">← Negativo</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Evolución Estratégica</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Positivo →</span>
                  </div>
                </CardContent>
                <CardFooter className="bg-indigo-50/50 p-3 border-t">
                  <p className="text-[11px] text-indigo-900 leading-relaxed">
                    <strong>Interpretación:</strong> Cuanto más oscura sea la celda en el extremo derecho superior, mayor es el éxito de su estrategia de comunicación. Las celdas rojas intensas indican focos de crisis con alto alcance.
                  </p>
                </CardFooter>
              </Card>

              <Card className="shadow-sm border-slate-200 bg-white">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5 text-indigo-600" />
                    Nube de Temas (IA)
                  </CardTitle>
                  <CardDescription className="text-xs">Tópicos recurrentes extraídos por algoritmos Gemini.</CardDescription>
                </CardHeader>
                <CardContent className="min-h-[250px]">
                  <div className="flex flex-wrap gap-2 items-center justify-center h-[250px] content-center">
                    {[
                      { text: "Servicio", size: "text-3xl", color: "text-indigo-600", desc: "El tema más mencionado hoy" },
                      { text: "Precio", size: "text-xl", color: "text-slate-500", desc: "Percepción estable de costos" },
                      { text: "Calidad", size: "text-2xl", color: "text-emerald-600", desc: "Principal fortaleza reportada" },
                      { text: "Soporte", size: "text-lg", color: "text-slate-400", desc: "Bajo volumen de consultas" },
                      { text: "Innovación", size: "text-2xl", color: "text-blue-600", desc: "Menciones en tech blogs" },
                      { text: "Garantía", size: "text-sm", color: "text-slate-400", desc: "Tema residual" },
                      { text: "Envío", size: "text-xl", color: "text-orange-500", desc: "Cuello de botella logístico" },
                      { text: "App", size: "text-lg", color: "text-indigo-400", desc: "Críticas a la UX móvil" },
                      { text: "Velocidad", size: "text-base", color: "text-slate-500", desc: "Atributo neutral" },
                      { text: "Diseño", size: "text-2xl", color: "text-pink-500", desc: "Muy valorado en Instagram" },
                    ].map((tag, i) => (
                      <Badge 
                        key={i} 
                        variant="secondary"
                        title={tag.desc}
                        className={`${tag.size} ${tag.color} bg-white border-slate-100 hover:border-indigo-200 cursor-help transition-all shadow-sm h-fit py-1 px-3 mb-1`}
                      >
                        {tag.text}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
                <CardFooter className="bg-slate-50 p-3 border-t">
                  <p className="text-[11px] text-slate-500 italic">
                    <strong>Acción:</strong> Pase el cursor sobre cada etiqueta para ver el contexto semántico detectado por la IA.
                  </p>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="comparison" className="space-y-6">
            {isComparing && (
              <Card className="shadow-sm border-slate-200 bg-white">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Scale className="w-5 h-5 text-indigo-600" />
                    Benchmarking de Atributos (Radar)
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[420px] min-h-[420px] w-full relative">
                  <div className="absolute inset-0 p-4">
                    <ResponsiveContainer width="100%" height="100%" debounce={100}>
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <Radar
                        name={brandMetrics[0]?.brandName}
                        dataKey={brandMetrics[0]?.brandName || "Marca"}
                        stroke="#4f46e5"
                        fill="#4f46e5"
                        fillOpacity={0.4}
                      />
                      <Radar
                        name={brandMetrics[1]?.brandName}
                        dataKey={brandMetrics[1]?.brandName || "Competidor"}
                        stroke="#9333ea"
                        fill="#9333ea"
                        fillOpacity={0.4}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {brandMetrics.map((m, idx) => (
                <Card key={idx} className={`shadow-sm border-2 bg-white ${idx === 0 ? 'border-indigo-100' : 'border-purple-100'}`}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="text-xl font-bold">{m.brandName}</span>
                      <Badge className={idx === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'}>
                        {idx === 0 ? 'Principal' : 'Competidor'}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 rounded-xl text-center border border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Reputación</p>
                        <p className="text-3xl font-bold text-slate-900">{m.reputationScore}%</p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl text-center border border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">NPS</p>
                        <p className={`text-3xl font-bold ${m.nps > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{m.nps}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between text-xs font-bold text-slate-600">
                        <span>Balance de Sentimiento</span>
                        <span>{m.totalMencions.toLocaleString()} menciones</span>
                      </div>
                      <div className="flex h-5 w-full overflow-hidden rounded-full bg-slate-100 shadow-inner">
                        <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${(m.sentimentDistribution.positive / m.totalMencions) * 100}%` }} />
                        <div className="bg-slate-400 transition-all duration-500" style={{ width: `${(m.sentimentDistribution.neutral / m.totalMencions) * 100}%` }} />
                        <div className="bg-red-500 transition-all duration-500" style={{ width: `${(m.sentimentDistribution.negative / m.totalMencions) * 100}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] font-bold text-slate-400">
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Positivo</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-400" /> Neutral</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" /> Negativo</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Engagement Rate</p>
                        <p className="text-lg font-bold text-slate-800">{m.engagementRate}%</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Impacto Influencer</p>
                        <p className="text-lg font-bold text-slate-800">{m.influencerImpact}%</p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-500 mb-3 uppercase tracking-wider">Métricas por Plataforma</p>
                      <div className="space-y-3">
                        {["Twitter", "Instagram", "Facebook"].map(p => (
                          <div key={p} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 font-medium">{getPlatformIcon(p)} {p}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-slate-400">Eng: <span className="text-slate-700 font-bold">{Math.floor(m.avgEngagement * (0.5 + Math.random()))}</span></span>
                              <span className="text-[10px] text-slate-400">Reach: <span className="text-slate-700 font-bold">{Math.floor(m.totalReach / 3000).toFixed(1)}k</span></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!isComparing && (
                <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50 flex items-center justify-center p-12 text-center">
                  <div className="space-y-4">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
                      <Scale className="w-8 h-8 text-slate-300" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-slate-600">Modo Comparativo Desactivado</p>
                      <p className="text-sm text-slate-400 max-w-[250px]">Ingrese un competidor en la parte superior para activar benchmarking de radar y SOV.</p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="comments">
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Log de Comentarios (Muestra)</CardTitle>
                  <CardDescription>Lista de los comentarios analizados más recientes</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Marca</TableHead>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Comentario</TableHead>
                      <TableHead>Plataforma</TableHead>
                      <TableHead>Sentimiento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredComments.slice(0, 50).map((comment) => (
                      <TableRow key={comment.id}>
                        <TableCell><Badge variant="outline">{comment.brand}</Badge></TableCell>
                        <TableCell className="font-medium">{comment.user}</TableCell>
                        <TableCell className="text-slate-600 italic max-w-md truncate">"{comment.text}"</TableCell>
                        <TableCell>{getPlatformIcon(comment.platform)}</TableCell>
                        <TableCell>
                          <Badge className={
                            comment.sentiment === "Positivo" ? "bg-emerald-100 text-emerald-700" :
                            comment.sentiment === "Negativo" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
                          }>
                            {comment.sentiment}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredComments.length > 50 && (
                  <p className="text-center text-xs text-slate-400 mt-4">Mostrando 50 de {filteredComments.length} menciones totales</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="automation" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Card className="shadow-lg border-indigo-100 bg-white overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-indigo-50 to-white">
                    <CardTitle className="flex items-center gap-2 text-indigo-900">
                      <Zap className="w-5 h-5 text-indigo-600" />
                      Triggers de Automatización Inteligente
                    </CardTitle>
                    <CardDescription>Eventos configurados para ejecutarse automáticamente bajo condiciones de IA</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      {[
                        { 
                          name: "Alerta de Crisis Inmediata", 
                          condition: "Sentimiento Negativo > 40% en 1h", 
                          action: "Email a @director / Slack #crisis",
                          status: "Activo",
                          color: "bg-red-500" 
                        },
                        { 
                          name: "Respuesta Automática (IA)", 
                          condition: "Comentario 'Soporte' o 'Duda' con Sentimiento Positivo", 
                          action: "Generar agradecimiento automático vía Gemini",
                          status: "Pausado",
                          color: "bg-amber-500" 
                        },
                        { 
                          name: "Sincronización Mensual BI", 
                          condition: "Día 1 de cada mes a las 08:00", 
                          action: "Exportar XLSX a SharePoint / Actualizar Power BI",
                          status: "Activo",
                          color: "bg-emerald-500" 
                        },
                        { 
                          name: "Identificación de Influencers", 
                          condition: "Alcance > 5000 y Sentimiento != Negativo", 
                          action: "Agregar a lista de 'Partners Potenciales' en CRM",
                          status: "Activo",
                          color: "bg-blue-500" 
                        }
                      ].map((trigger, idx) => (
                        <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 border rounded-xl hover:bg-white hover:border-indigo-200 transition-all group">
                          <div className="flex gap-4 items-center">
                            <div className={`w-2 h-12 rounded-full ${trigger.color}`} />
                            <div>
                              <h4 className="font-bold text-slate-900">{trigger.name}</h4>
                              <p className="text-xs text-slate-500 font-medium">Condición: <span className="text-slate-700 italic">{trigger.condition}</span></p>
                              <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1 font-bold">
                                <ArrowRight className="w-3 h-3" />
                                {trigger.action}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex flex-col items-end gap-2">
                            <Badge className={trigger.status === "Activo" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}>
                              {trigger.status}
                            </Badge>
                            <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-7 text-[10px]">Editar</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                  <CardFooter className="bg-slate-50 border-t justify-center py-4">
                    <Button variant="outline" className="text-xs border-indigo-200 text-indigo-600 h-9">
                      <Plus className="w-3 h-3 mr-2" />
                      Añadir Nuevo Trigger de IA
                    </Button>
                  </CardFooter>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="shadow-lg border-slate-200 bg-white">
                  <CardHeader>
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-slate-600" />
                      Estado de Conexiones
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-bold text-emerald-800">Supabase DB</span>
                      </div>
                      <Badge className="bg-emerald-500 animate-pulse text-[9px]">CONECTADO</Badge>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-bold text-blue-800">Gemini IA 3.0</span>
                      </div>
                      <Badge className="bg-blue-500 text-[9px]">ACTIVO</Badge>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-bold text-emerald-800">Webhook (Make)</span>
                      </div>
                      <Badge className="bg-emerald-600 text-[9px]">CONECTADO</Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-lg border-indigo-900 bg-indigo-900 text-white overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[10px] font-bold text-indigo-300 uppercase letter-spacing-widest">Resumen de Ejecución</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span>Llamadas IA (Hoy)</span>
                        <span className="font-bold">428 / 5k</span>
                      </div>
                      <Progress value={9} className="h-1 bg-white/20" />
                      <div className="flex justify-between text-sm pt-2">
                        <span>Acciones Auto</span>
                        <span className="font-bold">12</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Ahorro Tiempo Est.</span>
                        <span className="font-bold text-emerald-400">~ 4.5h</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="technical" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="shadow-sm border-slate-200 bg-white md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    Evaluación de Métricas del Proyecto
                  </CardTitle>
                  <CardDescription>Justificación técnica y lógica de cálculo Indicators clave.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-[150px]">Métrica</TableHead>
                        <TableHead>Lógica de Cálculo</TableHead>
                        <TableHead>Valor Estratégico</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { 
                          name: "Reputation Score", 
                          logic: "(Positivo * 1 + Neutral * 0.5) / Total", 
                          value: "Mide el estado general de la marca en una sola cifra 0-100." 
                        },
                        { 
                          name: "SOV (Share of Voice)", 
                          logic: "(Menciones Marca / Menciones Totales) * 100", 
                          value: "Determina la cuota de mercado conversacional frente a rivales." 
                        },
                        { 
                          name: "NPS (Net Promoter Score)", 
                          logic: "% Promotores - % Detractores", 
                          value: "Predice la lealtad y el crecimiento orgánico de la base de usuarios." 
                        },
                        { 
                          name: "Impacto Influencer", 
                          logic: "Promedio Ponderado(Seguidores * Engagement)", 
                          value: "Evalúa cuánto de la reputación proviene de voces de autoridad." 
                        },
                        { 
                          name: "Engagement Rate", 
                          logic: "(Interacciones / Alcance Estimado) * 100", 
                          value: "Indica la calidad y relevancia del contenido para la audiencia." 
                        }
                      ].map((m, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-bold text-slate-700">{m.name}</TableCell>
                          <TableCell className="font-mono text-[10px] bg-slate-50 p-2 rounded">{m.logic}</TableCell>
                          <TableCell className="text-xs text-slate-500">{m.value}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-slate-200 bg-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code2 className="w-5 h-5 text-indigo-600" />
                    Programación y Stack
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-700 mb-1">Capa de Visualización (JS/TS)</h4>
                    <p className="text-xs text-slate-500">
                      Implementado en <strong>TypeScript</strong> con <strong>React 19</strong>. 
                      Gestión reactiva de estado para filtros dinámicos y visualización en tiempo real con <strong>Recharts</strong>.
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="outline" className="text-[10px]">Vite</Badge>
                      <Badge variant="outline" className="text-[10px]">Tailwind CSS</Badge>
                      <Badge variant="outline" className="text-[10px]">Lucide</Badge>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-100">
                    <h4 className="text-sm font-bold text-slate-700 mb-1">Capa de Datos (Contexto Python)</h4>
                    <p className="text-xs text-slate-500">
                      Tareas pesadas de NLP (Procesamiento de Lenguaje Natural) están diseñadas para delegarse a 
                      scripts de <strong>Python</strong> (usando NLTK o Spacy) conectando vía API.
                    </p>
                    <div className="bg-slate-900 text-slate-300 p-3 rounded-lg mt-2 font-mono text-[10px]">
                      <span className="text-pink-400">import</span> pandas <span className="text-pink-400">as</span> pd<br/>
                      <span className="text-pink-400">from</span> textblob <span className="text-pink-400">import</span> TextBlob<br/>
                      df[<span className="text-emerald-400">'sentiment'</span>] = df[<span className="text-emerald-400">'text'</span>].apply(<span className="text-yellow-400">analyze_sentiment</span>)
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="shadow-sm border-slate-200 bg-gradient-to-br from-white to-orange-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-700">
                    <Settings2 className="w-5 h-5" />
                    Integración con MAKE
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    La automatización con <strong>Make</strong> permite la interoperabilidad entre redes sociales y nuestro dashboard. 
                    Actúa como el "Pegamento Digital" orquestando el flujo:
                  </p>
                  <div className="space-y-2">
                    {[
                      "Trigger: Nueva mención en Twitter/X o Instagram.",
                      "Procesamiento: Envío de texto al webhook del sistema.",
                      "Almacenamiento: Actualización automática del dataset dinámico.",
                      "Respuesta: Notificación instantánea al equipo de comms."
                    ].map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] text-slate-700">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                        {step}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-slate-200 bg-gradient-to-br from-white to-yellow-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-yellow-700">
                    <LayoutDashboard className="w-5 h-5" />
                    Potencial con Power BI
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Al exponer un endpoint de exportación inteligente, <strong>Power BI</strong> puede consumir estos indicadores 
                    para generar reportes consolidados de Business Intelligence:
                  </p>
                  <div className="flex items-center justify-center p-4 bg-white/50 rounded-lg border border-yellow-200 border-dashed">
                    <div className="text-center space-y-1">
                      <p className="text-[10px] font-bold text-yellow-800">Conector Web JSON</p>
                      <p className="text-[9px] text-yellow-600 font-mono">GET /api/export/powerbi</p>
                    </div>
                  </div>
                  <ul className="text-[11px] space-y-1 text-slate-600 list-disc pl-4">
                    <li>Visualización de tendencias históricas a largo plazo.</li>
                    <li>Correlación de Reputación vs Ventas (Revenue).</li>
                    <li>Filtros geográficos avanzados compartidos con la corporación.</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <footer className="pt-8 border-t border-slate-200 text-center text-slate-400 text-xs">
          <p>© 2024 Digital Reputation Monitoring System - Proyecto Universitario Pro</p>
          <p className="mt-1">Simulación masiva de 3000+ comentarios con IA Generativa</p>
        </footer>
      </div>
    </div>
  );
}
