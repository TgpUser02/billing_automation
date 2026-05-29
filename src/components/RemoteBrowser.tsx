import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  Loader2,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RemoteBrowserProps {
  isRunning: boolean;
  date?: Date;
  customId?: string | null;
  onReset?: () => void;
  onFetchConsumers?: () => Promise<void>;
  onStatusChange?: (status: string) => void;
  compact?: boolean;
  linkModalOpen?: boolean;
  onLinkModalOpenChange?: (open: boolean) => void;
}

export function RemoteBrowser({
  isRunning,
  date,
  customId,
  onReset,
  onFetchConsumers,
  onStatusChange,
  compact = false,
  linkModalOpen,
  onLinkModalOpenChange,
}: RemoteBrowserProps) {
  const [localShowLinkModal, setLocalShowLinkModal] = useState(false);
  const showLinkModal = linkModalOpen !== undefined ? linkModalOpen : localShowLinkModal;
  const setShowLinkModal = onLinkModalOpenChange !== undefined ? onLinkModalOpenChange : setLocalShowLinkModal;

  const [status, setStatus] = useState<
    | "IDLE"
    | "STARTING"
    | "CAPTCHA_REQUIRED"
    | "OTP_REQUIRED"
    | "SUCCESS"
    | "ERROR"
  >("IDLE");

  const resetLocalSession = () => {
    setStatus("IDLE");
    setCaptchaImage("");
    setCaptchaInput("");
    setOtpInput("");
    setOtpEmail("");
    setOtpMobile("");
    setErrorMessage("");
    setUsername("");
    setPassword("");
    setShowPass(false);
    setRemoteViewImage("");
    setRemoteViewMeta({});
    setIsFetchingRemoteView(false);
    setLinkConsumerNo("");
    setLinkBillingUnit("");
    setLinkStatus(null);
    setIsLinking(false);
    setLinkStage("INPUT");
    setLinkCaptchaImage("");
    setLinkCaptchaInput("");
    setLinkOtpInput("");
  };
  const [captchaImage, setCaptchaImage] = useState<string>("");
  const [captchaInput, setCaptchaInput] = useState<string>("");
  const [otpInput, setOtpInput] = useState<string>("");
  const [otpEmail, setOtpEmail] = useState<string>("");
  const [otpMobile, setOtpMobile] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [remoteViewImage, setRemoteViewImage] = useState<string>("");
  const [remoteViewMeta, setRemoteViewMeta] = useState<{ title?: string; url?: string }>({});
  const [isFetchingRemoteView, setIsFetchingRemoteView] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isFetchingConsumers, setIsFetchingConsumers] = useState(false);
  const [isRefreshingTab, setIsRefreshingTab] = useState(false);

  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showpass, setShowPass] = useState(false);
  const [portalCredentials, setPortalCredentials] = useState<any[]>([]);

  const [linkConsumerNo, setLinkConsumerNo] = useState("");
  const [linkBillingUnit, setLinkBillingUnit] = useState("");
  const [linkConsumerType, setLinkConsumerType] = useState<string>("1");
  const [isLinking, setIsLinking] = useState(false);
  const [linkStatus, setLinkStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [linkStage, setLinkStage] = useState<"INPUT" | "CAPTCHA" | "OTP">("INPUT");
  const [linkCaptchaImage, setLinkCaptchaImage] = useState<string>("");
  const [linkCaptchaInput, setLinkCaptchaInput] = useState<string>("");
  const [linkOtpInput, setLinkOtpInput] = useState<string>("");

  const [subdivisions, setSubdivisions] = useState<{ value: string; label: string }[]>([]);
  const [isFetchingSubdivisions, setIsFetchingSubdivisions] = useState(false);
  const [subdivisionSearch, setSubdivisionSearch] = useState("");

  const filteredSubdivisions = subdivisions.filter((sub) =>
    sub.label.toLowerCase().includes(subdivisionSearch.toLowerCase()) ||
    sub.value.toLowerCase().includes(subdivisionSearch.toLowerCase())
  );

  const fetchSubdivisions = async (consumerType: string = "1") => {
    setIsFetchingSubdivisions(true);
    try {
      const res = await api.getAddConsumerOptions(consumerType);
      if (res.status === "SUCCESS" && res.options) {
        setSubdivisions(res.options);
      } else {
        console.error("Failed to load subdivisions:", res.message);
      }
    } catch (err) {
      console.error("Error fetching subdivisions:", err);
    } finally {
      setIsFetchingSubdivisions(false);
    }
  };

  const handleConsumerTypeChange = async (val: string) => {
    setLinkConsumerType(val);
    setLinkBillingUnit("");
    setSubdivisionSearch("");
    await fetchSubdivisions(val);
  };

  useEffect(() => {
    if (status === "SUCCESS" && subdivisions.length === 0 && (showLinkModal || !compact)) {
      fetchSubdivisions(linkConsumerType);
    }
  }, [status, showLinkModal, compact, subdivisions.length, linkConsumerType]);

  const handleFetchConsumersFromSite = async () => {
    setIsFetchingConsumers(true);
    try {
      if (onFetchConsumers) {
        await onFetchConsumers();
      } else {
        await api.fetchConsumers();
      }
      toast({
        title: "Consumers Fetched",
        description: "Consumer list has been fetched from MSEDCL site successfully.",
      });
    } catch (err: any) {
      toast({
        title: "Fetch Failed",
        description: err.message || "Failed to fetch consumers from site.",
        variant: "destructive",
      });
    } finally {
      setIsFetchingConsumers(false);
    }
  };

  const handleRefreshRemoteTab = async () => {
    setIsRefreshingTab(true);
    try {
      await api.refreshTab();
      toast({
        title: "Tab Refreshed",
        description: "The remote browser tab has been reloaded.",
      });
      await fetchRemoteViewSilent();
    } catch (err: any) {
      toast({
        title: "Refresh Failed",
        description: err.message || "Failed to refresh remote tab.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshingTab(false);
    }
  };

  const handleLinkConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNo = linkConsumerNo.trim();
    const cleanBu = linkBillingUnit.trim();
    if (!cleanNo || !cleanBu) return;

    if (!/^\d+$/.test(cleanNo)) {
      setLinkStatus({ type: "error", message: "Consumer number must contain only numeric digits." });
      return;
    }

    if (linkConsumerType === "1" && cleanNo.length !== 12) {
      setLinkStatus({ type: "error", message: "LT Consumer number must be exactly 12 digits." });
      return;
    }

    if (linkConsumerType === "2" && cleanNo.length !== 10) {
      setLinkStatus({ type: "error", message: "HT Consumer number must be exactly 10 digits." });
      return;
    }

    setIsLinking(true);
    setLinkStatus(null);
    try {
      const res = await api.startAddConsumer(cleanNo, cleanBu, linkConsumerType);
      if (res.status === "CAPTCHA_REQUIRED") {
        setLinkCaptchaImage(res.captchaImage || "");
        setLinkStage("CAPTCHA");
        setLinkCaptchaInput("");
      } else if (res.status === "SUCCESS") {
        setLinkStatus({ type: "success", message: res.message || "Consumer linked successfully!" });
        setLinkConsumerNo("");
        setLinkBillingUnit("");
        setTimeout(() => {
          setShowLinkModal(false);
          setLinkStatus(null);
        }, 2000);
      } else {
        setLinkStatus({ type: "error", message: res.message || "Failed to initiate consumer link." });
      }
    } catch (err: unknown) {
      setLinkStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to link consumer connection." });
    } finally {
      setIsLinking(false);
      await fetchRemoteViewSilent();
    }
  };

  const handleSubmitLinkCaptcha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkCaptchaInput.trim()) return;

    setIsLinking(true);
    setLinkStatus(null);
    try {
      const res = await api.submitAddConsumerCaptcha(linkCaptchaInput.trim());
      if (res.status === "OTP_REQUIRED") {
        setLinkStage("OTP");
        setLinkOtpInput("");
      } else if (res.status === "SUCCESS") {
        setLinkStatus({ type: "success", message: res.message || "Consumer linked successfully!" });
        setLinkStage("INPUT");
        setLinkConsumerNo("");
        setLinkBillingUnit("");
        setTimeout(() => {
          setShowLinkModal(false);
          setLinkStatus(null);
        }, 2000);
      } else {
        setLinkStatus({ type: "error", message: res.message || "CAPTCHA verification failed." });
      }
    } catch (err: unknown) {
      setLinkStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to verify CAPTCHA." });
    } finally {
      setIsLinking(false);
      await fetchRemoteViewSilent();
    }
  };

  const handleSubmitLinkOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkOtpInput.trim()) return;

    setIsLinking(true);
    setLinkStatus(null);
    try {
      const res = await api.submitAddConsumerOtp(linkOtpInput.trim());
      if (res.status === "SUCCESS") {
        setLinkStatus({ type: "success", message: res.message || "Consumer connection linked successfully!" });
        setLinkStage("INPUT");
        setLinkConsumerNo("");
        setLinkBillingUnit("");
        setTimeout(() => {
          setShowLinkModal(false);
          setLinkStatus(null);
        }, 2000);
      } else {
        setLinkStatus({ type: "error", message: res.message || "OTP verification failed." });
      }
    } catch (err: unknown) {
      setLinkStatus({ type: "error", message: err instanceof Error ? err.message : "Failed to verify OTP." });
    } finally {
      setIsLinking(false);
      await fetchRemoteViewSilent();
    }
  };

  const handleCancelLink = async () => {
    setLinkStage("INPUT");
    setLinkStatus(null);
    setLinkCaptchaImage("");
    setLinkCaptchaInput("");
    setLinkOtpInput("");
    try {
      await api.cancelAddConsumer();
      await fetchRemoteViewSilent();
    } catch (err) {
      console.error("Failed to return to dashboard:", err);
    }
  };

  const handleGoToMyAccount = async () => {
    try {
      await api.cancelAddConsumer();
      await fetchRemoteViewSilent();
    } catch (err) {
      console.error("Failed to navigate to my account:", err);
    }
  };

  useEffect(() => {
    let active = true;
    if (compact && !showLinkModal && status === "SUCCESS") {
      api.cancelAddConsumer().then(() => {
        if (active) fetchRemoteViewSilent();
      }).catch(err => {
        console.error("Failed to cancel add consumer on modal close:", err);
      });
    }
    return () => {
      active = false;
    };
  }, [showLinkModal, compact, status]);

  useEffect(() => {
    const fetchCreds = async () => {
      try {
        const res = await api.getPortalCredentials();
        if (res.status === "success" && res.data) {
          setPortalCredentials(res.data);
        }
      } catch (err) {
        console.error("Failed to fetch portal credentials in RemoteBrowser:", err);
      }
    };
    if (isRunning) {
      fetchCreds();
    }
  }, [isRunning]);

  useEffect(() => {
    if (isRunning && status === "IDLE" && date) {
      if (!customId) {
        setUsername("");
        setPassword("");
        return;
      }
      setUsername(customId);

      const matched = portalCredentials.find(c => c.username === customId);
      if (matched) {
        setPassword(matched.password);
      } else {
        setPassword("");
      }
    }
  }, [isRunning, date, customId, status, portalCredentials]);

  useEffect(() => {
    if (!isRunning) {
      resetLocalSession();
    }
  }, [isRunning]);

  // Notify parent whenever login status changes
  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(status);
    }
  }, [status, onStatusChange]);

  const startLogin = async (user: string, pass: string) => {
    setStatus("STARTING");
    setErrorMessage("");
    try {
      const dateStr = date
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
        : undefined;
      const res = await api.startLogin(
        user,
        pass,
        dateStr,
        customId || undefined,
      );
      handleResponse(res);
    } catch (err: unknown) {
      setStatus("ERROR");
      setErrorMessage(err instanceof Error ? err.message : "Failed to start login");
    }
  };

  const handleResponse = (res: {
    status: string;
    captchaImage?: string;
    otpEmail?: string;
    otpMobile?: string;
    message?: string;
  }) => {
    if (res.status === "CAPTCHA_REQUIRED") {
      setStatus("CAPTCHA_REQUIRED");
      setCaptchaImage(res.captchaImage);
      setCaptchaInput("");
    } else if (res.status === "OTP_REQUIRED") {
      setStatus("OTP_REQUIRED");
      setOtpEmail(res.otpEmail || "");
      setOtpMobile(res.otpMobile || "");
      setOtpInput("");
    } else if (res.status === "SUCCESS") {
      setStatus("SUCCESS");
    } else {
      setStatus("ERROR");
      setErrorMessage(res.message || "Unknown error occurred");
    }
  };

  const submitCaptcha = async () => {
    if (!captchaInput.trim()) return;
    setStatus("STARTING"); // Using STARTING as a generic loading state
    setErrorMessage("");
    try {
      const res = await api.submitCaptcha(captchaInput);
      handleResponse(res);
    } catch (err: unknown) {
      setStatus("ERROR");
      setErrorMessage(err instanceof Error ? err.message : "Failed to submit captcha");
    }
  };

  const submitOtp = async () => {
    if (!otpInput.trim()) return;
    setStatus("STARTING");
    setErrorMessage("");
    try {
      const res = await api.submitOtp(otpInput);
      handleResponse(res);
    } catch (err: unknown) {
      setStatus("ERROR");
      setErrorMessage(err instanceof Error ? err.message : "Failed to submit OTP");
    }
  };

  const fetchRemoteView = async () => {
    setIsFetchingRemoteView(true);
    setErrorMessage("");
    try {
      const res = await api.fetchRemoteView();
      if (res.status === "success" && res.image) {
        setRemoteViewImage(res.image);
        setRemoteViewMeta({ title: res.title, url: res.url });

        const currentUrl = (res.url || "").toLowerCase();
        const pageTitle = (res.title || "").toLowerCase();
        if (
          currentUrl.includes("getmyaccount") ||
          currentUrl.includes("getaddconsumer") ||
          pageTitle.includes("माझे खाते") ||
          pageTitle.includes("my account")
        ) {
          if (status !== "SUCCESS") {
            setStatus("SUCCESS");
          }
        }

        const viewer = window.open("about:blank", "_blank", "width=1280,height=900");
        if (viewer) {
          const title = res.title || "Remote View";
          const urlLabel = res.url || "/api/remote-view";
          viewer.document.write(`
            <!doctype html>
            <html lang="en">
              <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>${title.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</title>
                <style>
                  body {
                    margin: 0;
                    font-family: Arial, sans-serif;
                    background: #0f172a;
                    color: #e2e8f0;
                    display: grid;
                    place-items: center;
                    min-height: 100vh;
                    padding: 24px;
                    box-sizing: border-box;
                  }
                  .wrap {
                    width: min(100%, 1240px);
                  }
                  .meta {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    margin-bottom: 16px;
                    font-size: 12px;
                  }
                  .meta strong { font-size: 14px; }
                  img {
                    width: 100%;
                    height: auto;
                    border-radius: 16px;
                    background: #fff;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
                  }
                </style>
              </head>
              <body>
                <div class="wrap">
                  <div class="meta">
                    <strong>${title.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</strong>
                    <span>${urlLabel.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</span>
                  </div>
                  <img src="${res.image}" alt="Remote browser view" />
                </div>
              </body>
            </html>
          `);
          viewer.document.close();
          viewer.focus();
        }

        if (!viewer) {
          window.location.href = res.image;
        }
      } else {
        setErrorMessage(res.message || "Failed to fetch remote view");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to fetch remote view");
    } finally {
      setIsFetchingRemoteView(false);
    }
  };

  const fetchRemoteViewSilent = async () => {
    try {
      const res = await api.fetchRemoteView();
      if (res.status === "success" && res.image) {
        setRemoteViewImage(res.image);
        setRemoteViewMeta({ title: res.title, url: res.url });

        const currentUrl = (res.url || "").toLowerCase();
        const pageTitle = (res.title || "").toLowerCase();
        if (
          currentUrl.includes("getmyaccount") ||
          currentUrl.includes("getaddconsumer") ||
          currentUrl.includes("viewbill") ||
          (currentUrl.includes("wss/wss") && !currentUrl.includes("getcustaccountlogin")) ||
          pageTitle.includes("माझे खाते") ||
          pageTitle.includes("my account") ||
          pageTitle.includes("view bill")
        ) {
          if (status !== "SUCCESS") {
            setStatus("SUCCESS");
          }
        }
      }
    } catch (err) {
      // Ignore background errors silently
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning && autoRefresh) {
      fetchRemoteViewSilent();
      interval = setInterval(() => {
        fetchRemoteViewSilent();
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, autoRefresh]);

  if (!isRunning) {
    return null;
  }

  return (
    <Card className={cn("glass-card rounded-[2rem] shadow-xl border-white/20 bg-white/80 backdrop-blur-xl w-full h-auto flex flex-col justify-start relative", compact ? "p-4 min-h-0" : "p-6 min-h-[350px]")}>
      {/* Title Header */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-arin-teal/10 flex items-center justify-center text-arin-teal">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black tracking-tight text-slate-800 uppercase">
              Secure Live Engine
            </h3>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              Portal Connection Session
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {compact && status === "SUCCESS" && (
            <div className="flex items-center gap-1.5 mr-1">
              <Button
                onClick={() => setShowLinkModal(true)}
                className="h-7 px-2.5 bg-arin-teal hover:bg-arin-teal/90 text-white font-black text-[9px] uppercase tracking-widest rounded-lg shadow-sm flex items-center justify-center"
              >
                Link Consumer
              </Button>
              <Button
                onClick={handleGoToMyAccount}
                variant="outline"
                className="h-7 px-2.5 border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-50 font-black text-[9px] uppercase tracking-widest rounded-lg shadow-sm flex items-center justify-center"
              >
                Go to My Account
              </Button>
            </div>
          )}
          <span className={cn(
            "text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1.5 border",
            status === "SUCCESS" ? "bg-green-50 text-green-600 border-green-200" :
              status === "ERROR" ? "bg-red-50 text-red-600 border-red-200" :
                "bg-orange-50 text-orange-600 border-orange-200 animate-pulse"
          )}>
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              status === "SUCCESS" ? "bg-green-500" :
                status === "ERROR" ? "bg-red-500" : "bg-orange-500 animate-pulse"
            )} />
            {status}
          </span>
        </div>
      </div>

      {/* Grid Layout inside Card */}
      <div className={cn("grid gap-6 items-start", compact ? "grid-cols-1" : "grid-cols-12")}>
        {/* Left pane: Live browser stream shell */}
        <div className={cn("flex flex-col", compact ? "col-span-1" : "col-span-12 lg:col-span-7")}>
          <div className="w-full rounded-2xl border border-slate-200 bg-slate-900/5 overflow-hidden shadow-inner flex flex-col">
            {/* Browser chrome headers */}
            <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-3 select-none">
              <div className="flex gap-1.5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
              </div>
              <div className="bg-white border border-slate-200/80 rounded-lg px-3 py-1 text-[9px] text-slate-500 font-mono flex-1 text-center truncate max-w-md shadow-sm">
                🔒 {remoteViewMeta.url || "https://msedcl.co.in/portal"}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="rounded border-slate-300 text-arin-teal focus:ring-arin-teal h-3 w-3 cursor-pointer"
                  />
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Live</span>
                </label>
                <button
                  type="button"
                  onClick={fetchRemoteViewSilent}
                  disabled={isFetchingRemoteView}
                  className="p-1 rounded hover:bg-slate-200 text-slate-500 transition-colors"
                  title="Refresh Screen"
                >
                  <RotateCcw className={cn("w-3 h-3", isFetchingRemoteView && "animate-spin")} />
                </button>
              </div>
            </div>

            {/* Screen Image Container */}
            <div className={cn("relative w-full bg-slate-950 flex items-center justify-center overflow-hidden", compact ? "aspect-[16/9] max-h-[200px]" : "aspect-[4/3]")}>
              {remoteViewImage ? (
                <img
                  src={remoteViewImage}
                  alt="Live Browser View"
                  className="w-full h-full object-contain bg-slate-950 cursor-zoom-in"
                  onClick={fetchRemoteView}
                  title="Click to expand browser view in a new window"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-arin-teal mb-3" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Connecting to Live Feed...</p>
                </div>
              )}
            </div>
          </div>
          <div className="mt-2 text-center">
            <span className="text-[8px] font-medium text-slate-400 italic">
              💡 Tip: Click the live feed screenshot to open it in a larger standalone window.
            </span>
          </div>
        </div>

        {/* Right pane: User inputs and flows (5 columns) */}
        {!compact && <div className="col-span-12 lg:col-span-5 flex flex-col justify-center min-h-[250px] border-t lg:border-t-0 lg:border-l border-slate-100 pt-6 lg:pt-0 lg:pl-6">
          <div className="space-y-4 w-full">
            {/* IDLE state */}
            {status === "IDLE" && (
              <div className="w-full space-y-4 animate-in fade-in duration-300">
                <div className="text-center lg:text-left">
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Portal Authentication</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Step 1: Check credentials</p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      Login ID
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-white h-10 rounded-xl px-3 font-mono text-xs font-bold border border-slate-200 focus:border-arin-teal outline-none transition-all"
                      placeholder="Username"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPass(!showpass)}
                        className="text-[8px] text-slate-400 hover:text-slate-600 font-bold uppercase tracking-wider"
                      >
                        {showpass ? "Hide" : "Show"}
                      </button>
                    </div>
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        username &&
                        password &&
                        startLogin(username, password)
                      }
                      className="w-full bg-white h-10 rounded-xl px-3 font-mono text-xs font-bold border border-slate-200 focus:border-arin-teal outline-none transition-all"
                      placeholder="Password"
                      type={showpass ? "text" : "password"}
                    />
                  </div>
                  <Button
                    onClick={() => startLogin(username, password)}
                    disabled={!username.trim() || !password.trim()}
                    className="w-full h-11 bg-arin-teal hover:bg-arin-teal/90 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md shadow-arin-teal/20 mt-2"
                  >
                    Start Connection
                  </Button>
                </div>
              </div>
            )}

            {/* Error Message */}
            {status === "ERROR" && (
              <div className="w-full bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 flex flex-col items-center gap-3 text-center animate-in fade-in duration-300">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <p className="text-xs font-medium">{errorMessage}</p>
                <Button
                  onClick={() => setStatus("IDLE")}
                  variant="outline"
                  className="mt-2 text-[10px] h-8 px-4 font-bold border-slate-200"
                >
                  Try Again
                </Button>
              </div>
            )}

            {/* Status Loading */}
            {status === "STARTING" && (
              <div className="flex flex-col items-center justify-center gap-3 py-6 text-center animate-in fade-in duration-300">
                <Loader2 className="w-8 h-8 animate-spin text-arin-teal" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Processing Login Action...
                </p>
              </div>
            )}

            {/* CAPTCHA Step */}
            {status === "CAPTCHA_REQUIRED" && (
              <div className="w-full space-y-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="text-center lg:text-left">
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Security Check</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Step 2: Enter Captcha</p>
                </div>
                <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200 flex justify-center min-h-[60px]">
                  {captchaImage ? (
                    <img
                      src={captchaImage}
                      alt="CAPTCHA"
                      className="max-h-16 object-contain rounded"
                    />
                  ) : (
                    <p className="text-xs text-slate-400 self-center">
                      Loading CAPTCHA...
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Enter CAPTCHA
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitCaptcha()}
                    className="w-full bg-white h-10 rounded-xl px-3 text-center font-mono text-base font-bold tracking-widest border border-slate-200 focus:border-arin-teal outline-none transition-all"
                    placeholder="Type characters"
                  />
                  <Button
                    onClick={submitCaptcha}
                    disabled={!captchaInput.trim()}
                    className="w-full h-11 bg-arin-teal hover:bg-arin-teal/90 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md shadow-arin-teal/20"
                  >
                    Submit CAPTCHA
                  </Button>
                </div>
              </div>
            )}

            {/* OTP Step */}
            {status === "OTP_REQUIRED" && (
              <div className="w-full space-y-3 animate-in fade-in zoom-in-95 duration-300">
                <div className="text-center lg:text-left">
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Verification</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Step 3: Enter OTP</p>
                </div>
                <div className="bg-orange-50 text-orange-800 p-4 rounded-xl border border-orange-200 flex flex-col gap-2">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <Key className="w-4 h-4 shrink-0 text-orange-600" />
                    <p className="text-[9px] text-orange-700 leading-normal font-semibold">
                      OTP has been successfully sent to registered contact details:
                    </p>
                  </div>

                  {otpEmail && (
                    <p className="text-xs font-black text-red-600 truncate">
                      {otpEmail}
                    </p>
                  )}
                  {otpMobile && (
                    <p className="text-xs font-black text-red-600 truncate">
                      {otpMobile}
                    </p>
                  )}

                  {!otpEmail && !otpMobile && (
                    <p className="text-xs font-black text-red-600">
                      Registered mobile/email.
                    </p>
                  )}
                </div>
                <div className="w-full flex justify-center">
                  <small className="text-[9px] text-center text-slate-400 w-full uppercase tracking-wider font-bold">
                    OTP will be of 7 digits
                  </small>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Enter OTP
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitOtp()}
                    className="w-full bg-white h-10 rounded-xl px-3 text-center font-mono text-base font-bold tracking-[0.2em] border border-slate-200 focus:border-arin-teal outline-none transition-all"
                    placeholder="XXXXXXX"
                    maxLength={7}
                  />
                  <Button
                    onClick={submitOtp}
                    disabled={!otpInput.trim()}
                    className="w-full h-11 bg-arin-teal hover:bg-arin-teal/90 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md shadow-arin-teal/20"
                  >
                    Verify & Login
                  </Button>
                </div>
              </div>
            )}

            {/* Success / Connection Linking */}
            {status === "SUCCESS" && (
              <div className="w-full space-y-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex flex-col items-center gap-1.5 py-2 border-b border-slate-100">
                  <div className="w-9 h-9 bg-green-100 text-green-600 rounded-full flex items-center justify-center animate-bounce">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                    Login Successful!
                  </h4>
                </div>

                {/* Fetch and Refresh Buttons */}
                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-100">
                  <Button
                    onClick={handleFetchConsumersFromSite}
                    disabled={isFetchingConsumers}
                    className="bg-arin-teal hover:bg-arin-teal/90 text-white font-black text-[9px] uppercase tracking-widest rounded-xl h-11 shadow-md shadow-arin-teal/10 flex items-center justify-center text-center leading-normal col-span-2 md:col-span-1"
                  >
                    {isFetchingConsumers ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Fetch Consumers from Site"
                    )}
                  </Button>
                  <Button
                    onClick={handleRefreshRemoteTab}
                    disabled={isRefreshingTab}
                    variant="outline"
                    className="border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-50 font-black text-[9px] uppercase tracking-widest rounded-xl h-11 flex items-center justify-center text-center leading-normal col-span-2 md:col-span-1"
                  >
                    {isRefreshingTab ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Refresh Current Remote Tab"
                    )}
                  </Button>
                  <Button
                    onClick={handleGoToMyAccount}
                    variant="secondary"
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[9px] uppercase tracking-widest rounded-xl h-11 flex items-center justify-center text-center leading-normal col-span-2"
                  >
                    Go to My Account (Dashboard)
                  </Button>
                </div>

                {/* Link Connection form */}
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 w-full text-left">
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    Add Connection to Portal
                  </p>

                  {linkStage === "INPUT" && (
                    <form onSubmit={handleLinkConnection} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Consumer Type
                        </label>
                        <select
                          required
                          value={linkConsumerType}
                          onChange={(e) => handleConsumerTypeChange(e.target.value)}
                          className="w-full bg-white h-9 rounded-xl px-3 text-xs font-bold border border-slate-200 outline-none focus:border-arin-teal"
                        >
                          <option value="1">LT Consumer</option>
                          <option value="2">HT Consumer</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Consumer Number
                        </label>
                        <input
                          type="text"
                          required
                          value={linkConsumerNo}
                          onChange={(e) => setLinkConsumerNo(e.target.value)}
                          className="w-full bg-white h-9 rounded-xl px-3 font-mono text-xs font-bold border border-slate-200 outline-none focus:border-arin-teal"
                          placeholder="e.g. 425320007691"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Billing Unit / Subdivision
                        </label>
                        {isFetchingSubdivisions ? (
                          <div className="flex items-center gap-2 h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-400 font-bold">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-arin-teal" />
                            Loading subdivisions...
                          </div>
                        ) : subdivisions.length > 0 ? (
                          <div className="space-y-1.5">
                            <input
                              type="text"
                              value={subdivisionSearch}
                              onChange={(e) => setSubdivisionSearch(e.target.value)}
                              className="w-full bg-white h-9 rounded-xl px-3 text-xs font-bold border border-slate-200 outline-none focus:border-arin-teal"
                              placeholder="Type to search subdivisions..."
                            />
                            <select
                              required
                              value={linkBillingUnit}
                              onChange={(e) => setLinkBillingUnit(e.target.value)}
                              className="w-full bg-white h-9 rounded-xl px-3 text-xs font-bold border border-slate-200 outline-none focus:border-arin-teal"
                            >
                              <option value="">-- Select Subdivision ({filteredSubdivisions.length} matches) --</option>
                              {filteredSubdivisions.map((sub) => (
                                <option key={sub.value} value={sub.value}>
                                  {sub.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <input
                            type="text"
                            required
                            value={linkBillingUnit}
                            onChange={(e) => setLinkBillingUnit(e.target.value)}
                            className="w-full bg-white h-9 rounded-xl px-3 font-mono text-xs font-bold border border-slate-200 outline-none focus:border-arin-teal"
                            placeholder="e.g. 4151 or subdivision name"
                          />
                        )}
                      </div>

                      {linkStatus && (
                        <div className={cn(
                          "p-2.5 rounded-xl text-[10px] font-bold border leading-normal",
                          linkStatus.type === "success" 
                            ? "bg-green-50 text-green-600 border-green-200" 
                            : "bg-red-50 text-red-600 border-red-200"
                        )}>
                          {linkStatus.message}
                        </div>
                      )}

                      <Button
                        type="submit"
                        disabled={isLinking || !linkConsumerNo.trim() || !linkBillingUnit.trim()}
                        className="w-full h-10 bg-arin-teal hover:bg-arin-teal/90 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md transition-all active:scale-95"
                      >
                        {isLinking ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Link Connection"}
                      </Button>
                    </form>
                  )}

                  {linkStage === "CAPTCHA" && (
                    <form onSubmit={handleSubmitLinkCaptcha} className="space-y-3">
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                        Step 1: Enter Link Captcha
                      </p>
                      
                      <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200 flex justify-center min-h-[60px]">
                        {linkCaptchaImage ? (
                          <img
                            src={linkCaptchaImage}
                            alt="Link Captcha"
                            className="max-h-16 object-contain rounded"
                          />
                        ) : (
                          <p className="text-xs text-slate-400 self-center">
                            Loading Link CAPTCHA...
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Enter CAPTCHA
                        </label>
                        <input
                          type="text"
                          required
                          autoFocus
                          value={linkCaptchaInput}
                          onChange={(e) => setLinkCaptchaInput(e.target.value)}
                          className="w-full bg-white h-9 rounded-xl px-3 text-center font-mono text-sm font-bold tracking-widest border border-slate-200 focus:border-arin-teal outline-none"
                          placeholder="Type captcha"
                        />
                      </div>

                      {linkStatus && (
                        <div className="p-2.5 rounded-xl text-[10px] font-bold border leading-normal bg-red-50 text-red-600 border-red-200">
                          {linkStatus.message}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={handleCancelLink}
                          className="flex-1 h-10 border border-slate-200 text-xs font-bold text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={isLinking || !linkCaptchaInput.trim()}
                          className="flex-1 h-10 bg-arin-teal hover:bg-arin-teal/90 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md transition-all"
                        >
                          {isLinking ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Verify Captcha"}
                        </Button>
                      </div>
                    </form>
                  )}

                  {linkStage === "OTP" && (
                    <form onSubmit={handleSubmitLinkOtp} className="space-y-3">
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                        Step 2: Enter OTP Code
                      </p>
                      
                      <div className="bg-orange-50 text-orange-800 p-3 rounded-xl border border-orange-100">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-orange-700">
                          Verification Required
                        </p>
                        <p className="text-[10px] mt-0.5 leading-relaxed font-semibold">
                          OTP has been sent to the registered mobile/email of this connection.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          Enter OTP Code
                        </label>
                        <input
                          type="text"
                          required
                          autoFocus
                          value={linkOtpInput}
                          onChange={(e) => setLinkOtpInput(e.target.value)}
                          className="w-full bg-white h-9 rounded-xl px-3 text-center font-mono text-sm font-bold tracking-widest border border-slate-200 focus:border-arin-teal outline-none"
                          placeholder="OTP Code"
                        />
                      </div>

                      {linkStatus && (
                        <div className="p-2.5 rounded-xl text-[10px] font-bold border leading-normal bg-red-50 text-red-600 border-red-200">
                          {linkStatus.message}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={handleCancelLink}
                          className="flex-1 h-10 border border-slate-200 text-xs font-bold text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={isLinking || !linkOtpInput.trim()}
                          className="flex-1 h-10 bg-arin-teal hover:bg-arin-teal/90 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md transition-all"
                        >
                          {isLinking ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Verify & Link"}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>}
      </div>
      {compact && (
        <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
          <DialogContent className="glass-card shadow-2xl border-white/20 sm:max-w-md rounded-2xl p-6 bg-white/95 backdrop-blur-md">
            <DialogHeader>
              <DialogTitle className="text-base font-black bg-clip-text text-transparent bg-gradient-to-r from-arin-teal to-arin-green uppercase tracking-wider">
                Link Connection to Portal
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 w-full text-left mt-3">
              {linkStage === "INPUT" && (
                <form onSubmit={handleLinkConnection} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      Consumer Type
                    </label>
                    <select
                      required
                      value={linkConsumerType}
                      onChange={(e) => handleConsumerTypeChange(e.target.value)}
                      className="w-full bg-white h-9 rounded-xl px-3 text-xs font-bold border border-slate-200 outline-none focus:border-arin-teal"
                    >
                      <option value="1">LT Consumer</option>
                      <option value="2">HT Consumer</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      Consumer Number
                    </label>
                    <input
                      type="text"
                      required
                      value={linkConsumerNo}
                      onChange={(e) => setLinkConsumerNo(e.target.value)}
                      className="w-full bg-white h-9 rounded-xl px-3 font-mono text-xs font-bold border border-slate-200 outline-none focus:border-arin-teal"
                      placeholder="e.g. 425320007691"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      Billing Unit / Subdivision
                    </label>
                    {isFetchingSubdivisions ? (
                      <div className="flex items-center gap-2 h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-400 font-bold">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-arin-teal" />
                        Loading subdivisions...
                      </div>
                    ) : subdivisions.length > 0 ? (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={subdivisionSearch}
                          onChange={(e) => setSubdivisionSearch(e.target.value)}
                          className="w-full bg-white h-9 rounded-xl px-3 text-xs font-bold border border-slate-200 outline-none focus:border-arin-teal"
                          placeholder="Type to search subdivisions..."
                        />
                        <select
                          required
                          value={linkBillingUnit}
                          onChange={(e) => setLinkBillingUnit(e.target.value)}
                          className="w-full bg-white h-9 rounded-xl px-3 text-xs font-bold border border-slate-200 outline-none focus:border-arin-teal"
                        >
                          <option value="">-- Select Subdivision ({filteredSubdivisions.length} matches) --</option>
                          {filteredSubdivisions.map((sub) => (
                            <option key={sub.value} value={sub.value}>
                              {sub.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <input
                        type="text"
                        required
                        value={linkBillingUnit}
                        onChange={(e) => setLinkBillingUnit(e.target.value)}
                        className="w-full bg-white h-9 rounded-xl px-3 font-mono text-xs font-bold border border-slate-200 outline-none focus:border-arin-teal"
                        placeholder="e.g. 4151 or subdivision name"
                      />
                    )}
                  </div>

                  {linkStatus && (
                    <div className={cn(
                      "p-2.5 rounded-xl text-[10px] font-bold border leading-normal",
                      linkStatus.type === "success" 
                        ? "bg-green-50 text-green-600 border-green-200" 
                        : "bg-red-50 text-red-600 border-red-200"
                    )}>
                      {linkStatus.message}
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={isLinking || !linkConsumerNo.trim() || !linkBillingUnit.trim()}
                    className="w-full h-10 bg-arin-teal hover:bg-arin-teal/90 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md transition-all active:scale-95"
                  >
                    {isLinking ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Link Connection"}
                  </Button>
                </form>
              )}

              {linkStage === "CAPTCHA" && (
                <form onSubmit={handleSubmitLinkCaptcha} className="space-y-3">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                    Step 1: Enter Link Captcha
                  </p>
                  
                  <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200 flex justify-center min-h-[60px]">
                    {linkCaptchaImage ? (
                      <img
                        src={linkCaptchaImage}
                        alt="Link Captcha"
                        className="max-h-16 object-contain rounded"
                      />
                    ) : (
                      <p className="text-xs text-slate-400 self-center">
                        Loading Link CAPTCHA...
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      Enter CAPTCHA
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={linkCaptchaInput}
                      onChange={(e) => setLinkCaptchaInput(e.target.value)}
                      className="w-full bg-white h-9 rounded-xl px-3 text-center font-mono text-sm font-bold tracking-widest border border-slate-200 focus:border-arin-teal outline-none"
                      placeholder="Type captcha"
                    />
                  </div>

                  {linkStatus && (
                    <div className="p-2.5 rounded-xl text-[10px] font-bold border leading-normal bg-red-50 text-red-600 border-red-200">
                      {linkStatus.message}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleCancelLink}
                      className="flex-1 h-10 border border-slate-200 text-xs font-bold text-slate-500 hover:text-slate-700"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isLinking || !linkCaptchaInput.trim()}
                      className="flex-1 h-10 bg-arin-teal hover:bg-arin-teal/90 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md transition-all"
                    >
                      {isLinking ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Verify Captcha"}
                    </Button>
                  </div>
                </form>
              )}

              {linkStage === "OTP" && (
                <form onSubmit={handleSubmitLinkOtp} className="space-y-3">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                    Step 2: Enter OTP Code
                  </p>
                  
                  <div className="bg-orange-50 text-orange-800 p-3 rounded-xl border border-orange-100">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-orange-700">
                      Verification Required
                    </p>
                    <p className="text-[10px] mt-0.5 leading-relaxed font-semibold">
                      OTP has been sent to the registered mobile/email of this connection.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      Enter OTP Code
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={linkOtpInput}
                      onChange={(e) => setLinkOtpInput(e.target.value)}
                      className="w-full bg-white h-9 rounded-xl px-3 text-center font-mono text-sm font-bold tracking-widest border border-slate-200 focus:border-arin-teal outline-none"
                      placeholder="OTP Code"
                    />
                  </div>

                  {linkStatus && (
                    <div className="p-2.5 rounded-xl text-[10px] font-bold border leading-normal bg-red-50 text-red-600 border-red-200">
                      {linkStatus.message}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleCancelLink}
                      className="flex-1 h-10 border border-slate-200 text-xs font-bold text-slate-500 hover:text-slate-700"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isLinking || !linkOtpInput.trim()}
                      className="flex-1 h-10 bg-arin-teal hover:bg-arin-teal/90 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md transition-all"
                    >
                      {isLinking ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Verify & Link"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

export default RemoteBrowser;
