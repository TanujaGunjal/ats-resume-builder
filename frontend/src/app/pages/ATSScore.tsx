import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router";

import {
  ChevronLeft, CheckCircle, AlertCircle, Zap,
  Loader, TrendingUp, Target, FileText, RefreshCw
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { atsAPI, resumeAPI } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import StepProgress from "../components/StepProgress";

// ──────────────────── TYPES ────────────────────

interface Suggestion {
  id: string;
  section: string;
  itemIndex?: number;
  bulletIndex?: number;
  currentText: string;
  improvedText: string;
  impact: "high" | "medium" | "low";
  reason: string;
  type: string;
}

interface ScoreBreakdown {
  keyword_match?: number;
  formatting?: number;
  completeness?: number;
  action_verbs?: number;
  readability?: number;
}

interface OverallFeedback {
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

// ──────────────────── HELPERS ────────────────────

/** Safely normalize any impact value to "high" | "medium" | "low" */
const safeImpact = (impact: any): "high" | "medium" | "low" => {
  if (typeof impact === "number") {
    if (impact >= 8) return "high";
    if (impact >= 5) return "medium";
    return "low";
  }
  if (typeof impact === "string") {
    const l = impact.toLowerCase().trim();
    if (l === "high" || l === "critical") return "high";
    if (l === "medium" || l === "important" || l === "moderate") return "medium";
    return "low";
  }
  return "low";
};

const getScoreColor = (s: number) =>
  s >= 80 ? "text-green-600" : s >= 60 ? "text-yellow-600" : "text-red-600";

const getScoreStroke = (s: number) =>
  s >= 80 ? "#10B981" : s >= 60 ? "#EAB308" : "#EF4444";

const getScoreLabel = (s: number) =>
  s >= 80
    ? { text: "Excellent", bg: "bg-green-50", tc: "text-green-700" }
    : s >= 60
    ? { text: "Good",      bg: "bg-yellow-50", tc: "text-yellow-700" }
    : { text: "Needs Work", bg: "bg-red-50",   tc: "text-red-700" };

const impactConfig = {
  high:   { bg: "bg-red-100",    text: "text-red-700",    dot: "bg-red-500",    label: "HIGH" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-700", dot: "bg-yellow-500", label: "MEDIUM" },
  low:    { bg: "bg-blue-100",   text: "text-blue-700",   dot: "bg-blue-500",   label: "LOW" },
};

/** Normalize breakdown fields from backend response */
const normalizeBreakdown = (bd: any): ScoreBreakdown => {
  if (!bd) return {};
  
  // Backend returns flat structure: keywordMatch, sectionCompleteness, formatting, actionVerbs, readability
  // Map to UI keys for display
  return {
    keyword_match: bd.keywordMatch ?? 0,
    formatting:    bd.formatting ?? 0,
    completeness:  bd.sectionCompleteness ?? 0,  // ✅ FIXED: Was looking for wrong keys
    action_verbs:  bd.actionVerbs ?? 0,          // ✅ FIXED: Was looking for wrong keys
    readability:   bd.readability ?? 0,
  };
};

// ──────────────────── COMPONENT ────────────────────

export default function ATSScore() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const resumeId = searchParams.get("id");

  console.log("🔵 ATSScore component MOUNTED with resumeId:", resumeId);

  // Prevent concurrent apply operations
  const isApplyingRef = useRef(false);

  const hasResumeId = !!resumeId?.trim();

  const [isLoading,        setIsLoading]        = useState(true);
  const [isApplying,       setIsApplying]        = useState<string | "all" | null>(null);
  const [score,            setScore]             = useState<number | null>(null);
  const [hasJdLinked,      setHasJdLinked]       = useState(false);
  const [jdId,             setJdId]              = useState<string | null>(null);
  const [scoringMode,      setScoringMode]       = useState<"general" | "job-specific" | "no-jd">("no-jd");
  const [breakdown,        setBreakdown]         = useState<ScoreBreakdown>({});
  const [suggestions,      setSuggestions]       = useState<Suggestion[]>([]);
  const [missingKeywords,  setMissingKeywords]   = useState<string[]>([]);
  const [missingSections,  setMissingSections]   = useState<string[]>([]);
  const [scoreMessage,     setScoreMessage]      = useState("");
  const [overallFeedback,  setOverallFeedback]   = useState<OverallFeedback | null>(null);
  const [activeFilter,     setActiveFilter]      = useState<"all" | "high" | "medium" | "low">("all");
  const [isRedirecting,    setIsRedirecting]     = useState(false);

  // ── Auth Guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth");
  }, [isAuthenticated, authLoading, navigate]);
  // ── Load ATS Score ────────────────────────────────────────────────────────
  const loadATSScore = useCallback(async () => {
    if (!resumeId) {
      console.error("🔥 ATSScore: No resumeId provided");
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      console.log("🔵 ATSScore: Starting loadATSScore for resumeId:", resumeId);

      // 1. Check if JD is linked
      const resumeResponse = await resumeAPI.getResumeById(resumeId);
      const resumeData = resumeResponse?.data;
      const jdLinked = Boolean(resumeData?.jdId);
      const jdId = resumeData?.jdId;
      
      console.log("🔵 ATSScore: Loaded resume, jdLinked:", jdLinked, "jdId:", jdId);
      setHasJdLinked(jdLinked);
      setJdId(jdId);  // ✅ Store jdId in state for later use

      if (!jdLinked) {
        console.log("⚠️ ATSScore: No JD linked, showing 'Add Job Description' prompt");
        setScore(null);
        setScoringMode("no-jd");
        setBreakdown({});
        setMissingKeywords([]);
        setMissingSections([]);
        setScoreMessage("Add a Job Description to calculate your ATS Score and see keyword matches.");
        setOverallFeedback(null);
        setSuggestions([]);
        setIsLoading(false);
        return;
      }

      // 2. Calculate fresh ATS score
      console.log("🔵 ATSScore: Fetching ATS score...");
      const scoreResponse = await atsAPI.calculateScore(resumeId);
      
      if (!scoreResponse) {
        throw new Error("Server returned empty response");
      }

      console.log("✅ ATSScore: Score response:", JSON.stringify(scoreResponse, null, 2));

      const scoreData = scoreResponse.data || scoreResponse;

      // 3. Validate score data
      if (!scoreData) {
        throw new Error("Invalid score data structure");
      }

      // 4. Handle no-JD response
      if (scoreData.totalScore === null || scoreData.totalScore === undefined) {
        console.log("⚠️ ATSScore: No score calculated - JD may not have extractedKeywords");
        setScoringMode("no-jd");
        setScore(null);
        setBreakdown({});
        setMissingKeywords(scoreData.missingKeywords || []);
        setMissingSections(scoreData.missingSections || []);
        setScoreMessage(
          scoreData.message ||
          "Job Description is linked but couldn't be analyzed. Please ensure it contains relevant keywords."
        );
        setOverallFeedback(null);
        setSuggestions([]);
        setIsLoading(false);
        return;
      }

      // 5. Normalize and set score data
      console.log("✅ ATSScore: Score calculated:", scoreData.totalScore);
      const rawBreakdown = normalizeBreakdown(scoreData.breakdown);
      setScore(scoreData.totalScore);
      setScoringMode(scoreData.scoringMode || "job-specific");
      setBreakdown(rawBreakdown);
      setMissingKeywords(scoreData.missingKeywords || []);
      setMissingSections(scoreData.missingSections || []);
      setScoreMessage("");
      
      // Set overall feedback with defaults
      const feedback: OverallFeedback = {
        strengths:       (scoreData.overallFeedback?.strengths || []),
        weaknesses:      (scoreData.overallFeedback?.weaknesses || []),
        recommendations: (scoreData.overallFeedback?.recommendations || [])
      };
      setOverallFeedback(feedback);

      // Normalize suggestions
      const normalizedSuggestions = (scoreData.suggestions || []).map((s: any) => ({
        id:            s.id || `sugg-${Math.random().toString(36).substr(2, 9)}`,
        section:       s.section || "",
        itemIndex:     s.itemIndex,
        bulletIndex:   s.bulletIndex,
        currentText:   s.currentText || "",
        improvedText:  s.improvedText || "",
        impact:        safeImpact(s.impact || "medium"),
        reason:        s.reason || "",
        type:          s.type || "content",
      }));
      setSuggestions(normalizedSuggestions);

      console.log("✅ ATSScore: Page updated with score:", scoreData.totalScore);
      
    } catch (error) {
      console.error("🔥 ATSScore ERROR:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to load ATS score";
      
      if (errorMsg.includes("empty response")) {
        toast.error("Backend error: Server returned empty response. Check if backend is running.");
      } else if (errorMsg.includes("401") || errorMsg.includes("Unauthorized")) {
        toast.error("Session expired. Please login again.");
        setTimeout(() => navigate("/auth"), 2000);
      } else {
        toast.error(`Error: ${errorMsg}`);
      }
      
      setScore(0);
      setBreakdown({});
      setSuggestions([]);
      setMissingKeywords([]);
      setMissingSections([]);
      setOverallFeedback(null);
      
    } finally {
      setIsLoading(false);
    }
  }, [resumeId, navigate]);
  // ── Initial Load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !isAuthenticated || isRedirecting || !hasResumeId) return;

    const trimmed = resumeId!.trim();
    if (!/^[0-9a-f]{24}$/i.test(trimmed)) {
      toast.error("Invalid resume ID. Returning to dashboard...");
      setIsRedirecting(true);
      setTimeout(() => navigate("/dashboard"), 1500);
      return;
    }
    // Always load fresh, especially after returning from add JD flow
    loadATSScore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasResumeId, resumeId, isAuthenticated, authLoading, isRedirecting, loadATSScore]);

  // ── Apply Single Suggestion ────────────────────────────────────────────
  const applySuggestion = async (suggestion: any) => {
    if (!resumeId || !jdId || isApplyingRef.current) return;

    try {
      isApplyingRef.current = true;
      setIsApplying(suggestion.id);

      console.log(`[applySuggestion] Applying:`, {
        id: suggestion.id,
        section: suggestion.section,
        improvedText: suggestion.improvedText?.substring(0, 50),
      });

      const result = await atsAPI.applySuggestion(resumeId, jdId, {
        section: suggestion.section,
        itemIndex: suggestion.itemIndex,
        bulletIndex: suggestion.bulletIndex,
        improvedText: suggestion.improvedText,
        suggestedText: suggestion.suggestedText || suggestion.improvedText,
        suggestionId: suggestion.id,
      });

      if (!result.success) {
        throw new Error(result.message);
      }

      // Update score
      if (result.data?.updatedScore != null) {
        setScore(result.data.updatedScore);
        console.log(`[applySuggestion] Score updated:`, result.data.updatedScore);
      }

      // Update breakdown
      if (result.data?.updatedBreakdown) {
        setBreakdown(result.data.updatedBreakdown);
      }

      // Update suggestions list with fresh data from server
      if (result.data?.updatedSuggestions) {
        const newSuggestions = (result.data.updatedSuggestions || []).map((s: any) => ({
          id: s.id,
          section: s.section,
          itemIndex: s.itemIndex,
          bulletIndex: s.bulletIndex,
          currentText: s.currentText || '',
          improvedText: s.improvedText || '',
          impact: s.impact,
          reason: s.reason,
          type: s.type,
        }));

        setSuggestions(newSuggestions);
        console.log(`[applySuggestion] Suggestions updated:`, newSuggestions.length, "remaining");
      }

      // Update keywords and feedback
      if (result.data?.missingKeywords) {
        setMissingKeywords(result.data.missingKeywords);
      }

      if (result.data?.overallFeedback) {
        setOverallFeedback(result.data.overallFeedback);
      }

      toast.success('Suggestion applied!');

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to apply';
      console.error('[applySuggestion]', msg);
      toast.error(msg);
    } finally {
      isApplyingRef.current = false;
      setIsApplying(null);
    }
  };

  // ── Apply All Suggestions ──────────────────────────────────────────────
  const applyAllSuggestions = async () => {
    if (!resumeId || !jdId || isApplyingRef.current) return;

    const suggestionCount = suggestions.length;

    if (suggestionCount === 0) {
      toast.info('No suggestions available.');
      return;
    }

    try {
      isApplyingRef.current = true;
      setIsApplying('all');

      console.log(`[applyAllSuggestions] Starting batch apply:`, {
        totalCount: suggestionCount,
      });

      const result = await atsAPI.applyAllSuggestions(resumeId, jdId);

      if (!result.success) {
        throw new Error(result.message);
      }

      const applied = result.data.appliedCount || 0;

      console.log(`[applyAllSuggestions] Batch complete:`, {
        appliedCount: applied,
        totalCount: suggestionCount,
      });

      if (applied > 0) {
        // Update score first for immediate visual feedback
        if (result.data?.updatedScore != null) {
          setScore(result.data.updatedScore);
          console.log(`[applyAllSuggestions] Score updated:`, result.data.updatedScore);
        }

        // Update breakdown
        if (result.data?.updatedBreakdown) {
          setBreakdown(result.data.updatedBreakdown);
        }

        // Update suggestions with fresh data from server
        if (result.data?.updatedSuggestions) {
          const newSuggestions = (result.data.updatedSuggestions || []).map((s: any) => ({
            id: s.id,
            section: s.section,
            itemIndex: s.itemIndex,
            bulletIndex: s.bulletIndex,
            currentText: s.currentText || '',
            improvedText: s.improvedText || '',
            impact: s.impact,
            reason: s.reason,
            type: s.type,
          }));

          setSuggestions(newSuggestions);
        }

        // Update keywords and feedback
        if (result.data?.missingKeywords) {
          setMissingKeywords(result.data.missingKeywords);
        }

        if (result.data?.overallFeedback) {
          setOverallFeedback(result.data.overallFeedback);
        }

        // Show success message
        const plural = applied !== 1 ? 'es' : '';
        toast.success(`✅ Applied ${applied} fix${plural}!`);
      } else {
        toast.info('No changes were made.');
      }

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[applyAllSuggestions]', msg);
      toast.error(`Failed to apply fixes: ${msg}`);
    } finally {
      isApplyingRef.current = false;
      setIsApplying(null);
    }
  };

  const refreshScore = () => loadATSScore();

  // ── Derived State ───────────────────────────────────────────────────────
  const filteredSuggestions =
    activeFilter === "all"
      ? suggestions
      : suggestions.filter(s => safeImpact(s.impact) === activeFilter);

  const hasValidScore = score !== null && score !== undefined;
  const shouldShowNoSuggestionsPlaceholder =
    activeFilter === "all" &&
    hasValidScore &&
    (score as number) >= 85 &&
    missingKeywords.length === 0 &&
    missingSections.length === 0 &&
    suggestions.length === 0;

  const showJdRequiredState = !hasJdLinked;
  const progressValue = hasValidScore ? (score as number) : 0;
  const circumference = 2 * Math.PI * 88;
  const strokeDash    = (progressValue / 100) * circumference;
  const scoreLabel    = getScoreLabel(progressValue);
  const noJDMessage   = scoreMessage || "Add a Job Description to calculate ATS Score and see keyword match.";

  // Count by impact
  const impactCounts = {
    all:    suggestions.length,
    high:   suggestions.filter(s => safeImpact(s.impact) === "high").length,
    medium: suggestions.filter(s => safeImpact(s.impact) === "medium").length,
    low:    suggestions.filter(s => safeImpact(s.impact) === "low").length,
  };

  // ── Empty State (no resumeId) ─────────────────────────────────────────────
  if (!hasResumeId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-16 gap-4">
              <Link to="/dashboard" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
                <ChevronLeft className="w-5 h-5" />
                <span className="text-sm font-medium">Dashboard</span>
              </Link>
              <div className="w-px h-5 bg-gray-300" />
              <h1 className="text-lg font-semibold text-gray-900">ATS Score Report</h1>
            </div>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-16">
          <Card className="border border-gray-200">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Target className="w-8 h-8 text-indigo-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Select a Resume to Analyze</h2>
              <p className="text-gray-600 mb-8">Choose a resume from your dashboard to view its ATS score.</p>
              <Link to="/dashboard">
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">Go to Dashboard</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Loading State ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-16 h-16 text-indigo-600 animate-spin mx-auto mb-6" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Analyzing Your Resume</h2>
          <p className="text-gray-500 mb-6">Running ATS checks across 5 scoring dimensions…</p>
          <div className="flex flex-wrap justify-center gap-2">
            {["Keywords", "Formatting", "Completeness", "Action Verbs", "Readability"].map(item => (
              <span key={item} className="px-3 py-1 bg-indigo-50 text-indigo-600 text-xs rounded-full animate-pulse">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Main Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link to="/dashboard" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
                <ChevronLeft className="w-5 h-5" />
                <span className="text-sm font-medium">Dashboard</span>
              </Link>
              <div className="w-px h-5 bg-gray-300" />
              <h1 className="text-lg font-semibold text-gray-900">ATS Score Report</h1>
            </div>

            <div className="flex items-center gap-3">
              {!showJdRequiredState && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshScore}
                  className="text-gray-500 hover:text-gray-700"
                  disabled={isLoading || isApplying !== null}
                  title="Refresh score"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
              )}

              {hasValidScore && (
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${scoreLabel.bg} ${scoreLabel.tc}`}>
                  <span>{score}/100</span>
                  <span>·</span>
                  <span>{scoreLabel.text}</span>
                </div>
              )}

              {filteredSuggestions.length > 0 && (
                <Button
                  size="sm"
                  onClick={applyAllSuggestions}
                  disabled={isApplying !== null}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {isApplying === "all"
                    ? <><Loader className="w-4 h-4 mr-1.5 animate-spin" />Applying…</>
                    : <><Zap className="w-4 h-4 mr-1.5" />Apply All Fixes ({filteredSuggestions.length})</>
                  }
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <StepProgress currentStep={3} />
        </div>

        {/* ── JD Required Banner ─────────────────────────────────────────── */}
        {showJdRequiredState && (
          <Card className="border border-orange-200 bg-orange-50">
            <CardContent className="p-8 text-center">
              <h2 className="text-xl font-bold text-orange-800 mb-3">Job Description Required</h2>
              <p className="text-sm text-orange-700 mb-6">
                Add a Job Description to calculate your ATS Score and see which keywords are missing.
              </p>
              <Button
                className="bg-orange-600 hover:bg-orange-700 text-white"
                onClick={() => navigate(`/ats/add-jd?id=${resumeId}`)}
              >
                Add Job Description
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Main Content ────────────────────────────────────────────────── */}
        {!showJdRequiredState && (
          <div className="grid lg:grid-cols-3 gap-8">

            {/* ── Left Column: Score + Breakdown ────────────────────────── */}
            <div className="lg:col-span-1 space-y-6">

              <Card className="border border-gray-200">
                <CardContent className="p-8">
                  <h2 className="text-base font-semibold text-gray-900 mb-6 text-center">ATS Score</h2>

                  {hasValidScore ? (
                    <div className="relative w-48 h-48 mx-auto mb-6">
                      <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 192 192">
                        <circle cx="96" cy="96" r="88" stroke="#E5E7EB" strokeWidth="12" fill="none" />
                        <circle
                          cx="96" cy="96" r="88"
                          stroke={getScoreStroke(progressValue)}
                          strokeWidth="12"
                          fill="none"
                          strokeDasharray={`${strokeDash} ${circumference}`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div className={`text-5xl font-bold ${getScoreColor(progressValue)}`}>{score}</div>
                          <div className="text-xs text-gray-400 mt-1">out of 100</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                      <p className="text-sm font-medium text-amber-800">{noJDMessage}</p>
                    </div>
                  )}

                  {hasValidScore && (
                    <>
                      <div className={`flex items-center justify-center gap-2 px-4 py-2 rounded-full mb-3 ${scoreLabel.bg}`}>
                        {progressValue >= 80
                          ? <CheckCircle className={`w-4 h-4 ${scoreLabel.tc}`} />
                          : <AlertCircle className={`w-4 h-4 ${scoreLabel.tc}`} />}
                        <span className={`text-sm font-semibold ${scoreLabel.tc}`}>{scoreLabel.text}</span>
                      </div>
                      <p className="text-xs text-gray-500 text-center">
                        {progressValue >= 80
                          ? "Your resume is highly optimized for ATS!"
                          : progressValue >= 60
                          ? "Good foundation — apply suggestions to boost."
                          : "Several improvements needed."}
                      </p>
                    </>
                  )}

                  {/* Score Breakdown */}
                  <div className="mt-8 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">Score Breakdown</h3>

                    {(() => {
                      // Define weights based on scoringMode
                      const breakdownWeights = (scoringMode === 'job-specific' || scoringMode === 'general')
                        ? [
                            { key: 'keyword_match', label: 'Keyword Match', weight: 40 },
                            { key: 'formatting', label: 'Formatting', weight: 20 },
                            { key: 'completeness', label: 'Completeness', weight: 20 },
                            { key: 'action_verbs', label: 'Action Verbs', weight: 10 },
                            { key: 'readability', label: 'Readability', weight: 10 },
                          ]
                        : [
                            { key: 'formatting', label: 'Formatting', weight: 30 },
                            { key: 'completeness', label: 'Completeness', weight: 30 },
                            { key: 'action_verbs', label: 'Action Verbs', weight: 20 },
                            { key: 'readability', label: 'Readability', weight: 20 },
                          ];

                      return (
                        <>
                          {breakdownWeights.map(({ key, label, weight }) => {
                            const val = (breakdown as any)[key] ?? 0;
                            return (
                              <div key={key}>
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-gray-600">{label}</span>
                                    <span className="text-xs text-gray-400">({weight}%)</span>
                                  </div>
                                  <span className={`text-xs font-bold ${getScoreColor(val)}`}>{val}%</span>
                                </div>
                                <Progress value={val} className="h-1.5" />
                              </div>
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>

                  {/* Missing Keywords */}
                  {missingKeywords.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <Target className="w-4 h-4 text-red-500" />
                        Missing Keywords ({missingKeywords.length})
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {missingKeywords.slice(0, 12).map(kw => (
                          <span key={kw} className="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded border border-red-200">
                            {kw}
                          </span>
                        ))}
                        {missingKeywords.length > 12 && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
                            +{missingKeywords.length - 12} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Missing Sections */}
                  {missingSections.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        Missing Sections ({missingSections.length})
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {missingSections.map(sec => (
                          <span key={sec} className="px-2 py-0.5 bg-amber-50 text-amber-800 text-xs rounded border border-amber-200">
                            {sec}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* AI Analysis Card */}
              {overallFeedback && (
                (overallFeedback.strengths?.length ?? 0) > 0 || (overallFeedback.weaknesses?.length ?? 0) > 0
              ) && (
                <Card className="border border-gray-200">
                  <CardContent className="p-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-indigo-500" />
                      AI Analysis
                    </h3>

                    {overallFeedback.strengths.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">✓ Strengths</p>
                        <ul className="space-y-1.5">
                          {overallFeedback.strengths.map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                              <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {overallFeedback.weaknesses.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">✗ Needs Work</p>
                        <ul className="space-y-1.5">
                          {overallFeedback.weaknesses.map((w, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                              {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {overallFeedback.recommendations?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-2">Recommendations</p>
                        <ul className="space-y-1.5">
                          {overallFeedback.recommendations.map((r, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                              <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                                {i + 1}
                              </span>
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ── Right Column: Suggestions ──────────────────────────────── */}
            <div className="lg:col-span-2 space-y-6">

              {missingKeywords.length > 0 && (
                <Card className="border-l-4 border-l-yellow-500 bg-yellow-50 border border-yellow-200">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-semibold text-yellow-900 mb-1">
                          {missingKeywords.length} Keyword{missingKeywords.length !== 1 ? "s" : ""} Missing from Your Resume
                        </h3>
                        <p className="text-xs text-yellow-800">
                          Adding these keywords can significantly boost your ATS match rate.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Filter Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Improvement Suggestions</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {suggestions.length} total · sorted by impact
                  </p>
                </div>

                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  {(["all", "high", "medium", "low"] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setActiveFilter(f)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        activeFilter === f
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)} ({impactCounts[f]})
                    </button>
                  ))}
                </div>
              </div>

              {/* Suggestions List */}
              {filteredSuggestions.length === 0 ? (
                shouldShowNoSuggestionsPlaceholder ? (
                  <Card className="border border-gray-200 bg-green-50">
                    <CardContent className="p-10 text-center">
                      <CheckCircle className="w-14 h-14 text-green-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No Suggestions!</h3>
                      <p className="text-sm text-gray-600">Your resume is well-optimized. Great job!</p>
                    </CardContent>
                  </Card>
                ) : null
              ) : (
                <div className="space-y-4">
                  {filteredSuggestions.map(suggestion => {
                    const impact   = safeImpact(suggestion.impact);
                    const cfg      = impactConfig[impact];
                    const applying = isApplying === suggestion.id || isApplying === "all";

                    return (
                      <Card
                        key={suggestion.id}
                        className="border border-gray-200 hover:border-indigo-200 transition-colors"
                      >
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between gap-4 mb-4">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label} IMPACT
                              </div>
                              <h3 className="font-semibold text-gray-900 text-sm leading-snug">
                                {suggestion.reason || suggestion.improvedText.slice(0, 70)}
                              </h3>
                            </div>

                            <Button
                              size="sm"
                              className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-xs"
                              onClick={() => applySuggestion(suggestion)}
                              disabled={isApplying !== null}
                            >
                              {applying
                                ? <><Loader className="w-3 h-3 mr-1 animate-spin" />Applying…</>
                                : "Apply Fix"}
                            </Button>
                          </div>

                          {/* Section badge */}
                          <div className="mb-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                              <FileText className="w-3 h-3" />
                              {suggestion.section}
                            </span>
                          </div>

                          {/* Current / Improved text */}
                          {(suggestion.currentText || suggestion.improvedText) && (
                            <div className="grid sm:grid-cols-2 gap-3">
                              {suggestion.currentText && (
                                <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                                  <p className="text-xs font-semibold text-red-700 mb-1.5 uppercase">Current Text</p>
                                  <p className="text-xs text-gray-700 leading-relaxed line-clamp-4">
                                    {suggestion.currentText}
                                  </p>
                                </div>
                              )}
                              {suggestion.improvedText && (
                                <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                                  <p className="text-xs font-semibold text-green-700 mb-1.5 uppercase">Improved Text</p>
                                  <p className="text-xs text-gray-700 leading-relaxed line-clamp-4">
                                    {suggestion.improvedText}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}