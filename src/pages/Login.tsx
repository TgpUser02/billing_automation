import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Sun, Lock, Shield, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { api, clearToken, isTokenExpired } from "@/lib/api";

// Google reCAPTCHA v2 script loader
function loadRecaptchaScript(siteKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="recaptcha"]')) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=explicit`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load reCAPTCHA"));
    document.head.appendChild(script);
  });
}

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [siteKey, setSiteKey] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaContainerRef = useRef<HTMLDivElement>(null);
  const captchaWidgetId = useRef<number | null>(null);
  const navigate = useNavigate();
  const [attemptsOverlay, setAttemptsOverlay] = useState<{show: boolean, msg: string}>({show: false, msg: ""});

  // Fetch reCAPTCHA site key from backend
  useEffect(() => {
    // If already logged in, skip login page
    if (!isTokenExpired() && sessionStorage.getItem("arin_auth") === "true") {
      navigate("/", { replace: true });
      return;
    }

    api.getRecaptchaConfig()
      .then((config) => {
        if (config.siteKey) {
          setSiteKey(config.siteKey);
        }
      })
      .catch((err) => console.error("Failed to fetch reCAPTCHA config:", err));
  }, [navigate]);

  // Initialize reCAPTCHA widget when site key is available
  useEffect(() => {
    if (!siteKey || !captchaContainerRef.current) return;

    loadRecaptchaScript(siteKey)
      .then(() => {
        const waitForGrecaptcha = setInterval(() => {
          if ((window as any).grecaptcha && (window as any).grecaptcha.render) {
            clearInterval(waitForGrecaptcha);
            try {
              // Only render if not already rendered
              if (captchaWidgetId.current === null && captchaContainerRef.current) {
                captchaContainerRef.current.innerHTML = "";
                captchaWidgetId.current = (window as any).grecaptcha.render(
                  captchaContainerRef.current,
                  {
                    sitekey: siteKey,
                    theme: "dark",
                    callback: (token: string) => setCaptchaToken(token),
                    "expired-callback": () => setCaptchaToken(null),
                  }
                );
              }
            } catch (e) {
              console.error("reCAPTCHA render error:", e);
            }
          }
        }, 200);

        // Cleanup interval after 10 seconds
        setTimeout(() => clearInterval(waitForGrecaptcha), 10000);
      })
      .catch((err) => console.error("reCAPTCHA script load error:", err));
  }, [siteKey]);

  const resetCaptcha = useCallback(() => {
    if (captchaWidgetId.current !== null && (window as any).grecaptcha) {
      try {
        (window as any).grecaptcha.reset(captchaWidgetId.current);
      } catch { /* ignore */ }
    }
    setCaptchaToken(null);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!username.trim() || !password.trim()) {
      setErrorMessage("Please enter both username and password.");
      return;
    }

    if (siteKey && !captchaToken) {
      setErrorMessage("Please complete the CAPTCHA verification.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await api.login(username, password, captchaToken || undefined);

      if (result.status === "success") {
        toast({
          title: "Welcome Back",
          description: `Logged in as ${result.username}`,
        });
        navigate("/");
      }
    } catch (error: any) {
      const isNetworkError = error.message === "Failed to fetch";
      let msg = error.message || "Login failed. Please try again.";
      
      if (isNetworkError) {
        msg = "Cannot reach the server. Please ensure the backend is running on port 5000 and allowed through your firewall.";
      }

      setErrorMessage(msg);
      
      // SHOW LOCKOUT POPUP (Rule #2)
      const lowerMsg = msg.toLowerCase();
      if (!isNetworkError && (lowerMsg.includes("attempt") || lowerMsg.includes("lock") || lowerMsg.includes("invalid"))) {
        setAttemptsOverlay({ show: true, msg: msg });
      }

      toast({
        title: isNetworkError ? "Connection Error" : "Access Denied",
        description: msg,
        variant: "destructive",
      });
      resetCaptcha();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-arin-teal/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-arin-green/20 blur-[120px]" />
        <div className="absolute top-[50%] left-[50%] w-[30%] h-[30%] rounded-full bg-arin-orange/10 blur-[100px] -translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* ERROR OVERLAY POPUP */}
      {attemptsOverlay.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-sm bg-slate-900 border-2 border-red-500/30 rounded-2xl p-8 shadow-2xl text-center space-y-4 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Security Warning</h3>
              <p className="text-slate-400 text-sm font-medium">
                {attemptsOverlay.msg || errorMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAttemptsOverlay({ show: false, msg: "" })}
              className="w-full h-11 bg-red-500 hover:bg-red-600 text-white font-black rounded-xl uppercase tracking-widest text-xs transition-all shadow-lg shadow-red-500/20"
            >
              Understand & Try Again
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-md p-8 rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-2xl z-10 shadow-2xl relative">
        {/* Logo & Title */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-arin-teal/20 mb-4 transition-transform hover:scale-105 overflow-hidden p-2">
            <img src="/arin_logo.jpg" alt="Arin Energy Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Arin Energy</h1>
          <p className="text-slate-400 text-[10px] font-medium mt-1 uppercase tracking-[0.2em]">Billing Automation Software</p>
        </div>

        {/* Security Badge */}
        <div className="flex items-center justify-center gap-2 mb-6 py-2 px-4 rounded-full bg-arin-green/10 border border-arin-green/20 mx-auto w-fit">
          <Shield className="w-3 h-3 text-arin-green" />
          <span className="text-[10px] font-black text-arin-green uppercase tracking-widest">Secured with reCAPTCHA &amp; JWT</span>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-red-400 text-xs font-medium">{errorMessage}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-4">
            {/* Username */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                Username
              </label>
              <input
                id="login-username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-12 px-4 bg-slate-800/80 border border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:outline-none focus:border-arin-teal focus:ring-1 focus:ring-arin-teal/50 transition-all font-medium"
                required
                autoComplete="username"
                disabled={isLoading}
              />
            </div>

            {/* Password */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 px-4 pr-12 bg-slate-800/80 border border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:outline-none focus:border-arin-teal focus:ring-1 focus:ring-arin-teal/50 transition-all font-medium tracking-[0.15em]"
                  required
                  autoComplete="current-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  onClick={() => {
                    toast({
                      title: "Password Reset",
                      description: "Please contact Arin Energy Admin (admin@arinenergy.com) to reset your password.",
                    });
                  }}
                  className="text-[10px] font-black text-arin-teal uppercase tracking-widest hover:text-arin-green transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
            </div>

            {/* Google reCAPTCHA v2 Widget */}
            <div className="flex justify-center">
              <div ref={captchaContainerRef} id="recaptcha-container" />
            </div>
          </div>

          {/* Submit Button */}
          <button
            id="login-submit"
            type="submit"
            disabled={isLoading}
            className="w-full h-12 flex items-center justify-center bg-gradient-to-r from-arin-green to-arin-teal hover:opacity-90 text-white font-black rounded-xl shadow-xl shadow-arin-green/20 border-0 transition-all active:scale-[0.98] uppercase tracking-wider text-sm gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Authenticating...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" /> Secure Login
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-[10px] text-slate-600 font-medium">
            Protected by bcrypt encryption &amp; rate limiting
          </p>
        </div>
      </div>
    </div>
  );
}
