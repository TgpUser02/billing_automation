import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Lock, Shield, Eye, EyeOff, AlertTriangle, Mail, ArrowLeft } from "lucide-react";
import { api, clearToken, isTokenExpired } from "@/lib/api";

export default function Login() {
  const [loginMode, setLoginMode] = useState<"password" | "otp" | "forgot">("password");

  // Password Login
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // OTP Login
  const [otpIdentifier, setOtpIdentifier] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);

  // Forgot Password
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotStep, setForgotStep] = useState<"request" | "reset">("request");
  const [forgotTimer, setForgotTimer] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();
  const [attemptsOverlay, setAttemptsOverlay] = useState<{show: boolean, msg: string}>({show: false, msg: ""});

  // Check login state
  useEffect(() => {
    if (!isTokenExpired() && sessionStorage.getItem("arin_auth") === "true") {
      navigate("/", { replace: true });
      return;
    }
  }, [navigate]);

  // Timers for resending code
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [otpTimer]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (forgotTimer > 0) {
      interval = setInterval(() => {
        setForgotTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [forgotTimer]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!username.trim() || !password.trim()) {
      setErrorMessage("Please enter both username and password.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await api.login(username, password);

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
        msg = "Cannot reach the server. Please ensure the backend is running and allowed through your firewall.";
      }

      setErrorMessage(msg);
      
      // SHOW LOCKOUT POPUP
      const lowerMsg = msg.toLowerCase();
      if (!isNetworkError && (lowerMsg.includes("attempt") || lowerMsg.includes("lock") || lowerMsg.includes("invalid"))) {
        setAttemptsOverlay({ show: true, msg: msg });
      }

      toast({
        title: isNetworkError ? "Connection Error" : "Access Denied",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // OTP Login Handlers
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!otpIdentifier.trim()) {
      setErrorMessage("Please enter your username or email.");
      return;
    }

    setIsLoading(true);

    try {
      await api.loginOtpRequest(otpIdentifier);
      setOtpSent(true);
      setOtpTimer(60);
      toast({
        title: "Verification Code Sent",
        description: "A 6-digit OTP code has been sent to your registered email.",
      });
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to send OTP.");
      toast({
        title: "Error Sending OTP",
        description: error.message || "Could not request OTP.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!otpCode.trim() || otpCode.length !== 6) {
      setErrorMessage("Please enter the 6-digit verification code.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await api.loginOtpVerify(otpIdentifier, otpCode);
      if (result.status === "success") {
        toast({
          title: "Welcome Back",
          description: `Logged in as ${result.username}`,
        });
        navigate("/");
      }
    } catch (error: any) {
      setErrorMessage(error.message || "OTP verification failed.");
      toast({
        title: "Verification Failed",
        description: error.message || "OTP code invalid or expired.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot Password Handlers
  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!forgotIdentifier.trim()) {
      setErrorMessage("Please enter your username or email.");
      return;
    }

    setIsLoading(true);

    try {
      await api.forgotPasswordRequest(forgotIdentifier);
      setForgotStep("reset");
      setForgotTimer(60);
      toast({
        title: "Reset Code Sent",
        description: "A 6-digit password reset code has been sent to your registered email.",
      });
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to send password reset code.");
      toast({
        title: "Request Failed",
        description: error.message || "Could not request reset.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!forgotOtp.trim() || forgotOtp.length !== 6) {
      setErrorMessage("Please enter the 6-digit reset code.");
      return;
    }

    if (forgotNewPassword.length < 6) {
      setErrorMessage("New password must be at least 6 characters.");
      return;
    }

    setIsLoading(true);

    try {
      await api.forgotPasswordReset(forgotIdentifier, forgotOtp, forgotNewPassword);
      toast({
        title: "Password Reset Success",
        description: "Password reset successful! You can now log in.",
      });
      // Reset state and switch to standard login
      setLoginMode("password");
      setForgotStep("request");
      setForgotIdentifier("");
      setForgotOtp("");
      setForgotNewPassword("");
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to reset password.");
      toast({
        title: "Reset Failed",
        description: error.message || "Reset failed. Please verify OTP.",
        variant: "destructive",
      });
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
              Understand &amp; Try Again
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-md p-8 rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-2xl z-10 shadow-2xl relative transition-all duration-300">
        {/* Logo & Title */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-arin-teal/20 mb-4 transition-transform hover:scale-105 overflow-hidden p-2">
            <img src="/arin_logo.jpg" alt="Arin Energy Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Arin Energy</h1>
          <p className="text-slate-400 text-[10px] font-medium mt-1 uppercase tracking-[0.2em]">Billing Automation Software</p>
        </div>

        {/* Security Badge */}
        <div className="flex items-center justify-center gap-2 mb-6 py-2 px-4 rounded-full bg-arin-green/10 border border-arin-green/20 mx-auto w-fit">
          <Shield className="w-3 h-3 text-arin-green" />
          <span className="text-[10px] font-black text-arin-green uppercase tracking-widest">
            {loginMode === "password" ? "Secured with bcrypt & JWT" : "Secure Passwordless OTP"}
          </span>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-red-400 text-xs font-medium">{errorMessage}</p>
          </div>
        )}

        {/* Tab Switcher */}
        {loginMode !== "forgot" && (
          <div className="flex bg-slate-800/80 p-1 rounded-xl mb-6 border border-slate-700">
            <button
              type="button"
              onClick={() => {
                setLoginMode("password");
                setErrorMessage("");
              }}
              className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                loginMode === "password"
                  ? "bg-slate-700 text-white shadow-md border border-slate-650"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginMode("otp");
                setErrorMessage("");
              }}
              className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                loginMode === "otp"
                  ? "bg-slate-700 text-white shadow-md border border-slate-650"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Email OTP
            </button>
          </div>
        )}

        {/* Password Login Form */}
        {loginMode === "password" && (
          <form onSubmit={handlePasswordLogin} className="space-y-5">
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
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMode("forgot");
                      setForgotStep("request");
                      setErrorMessage("");
                    }}
                    className="text-[10px] font-black text-arin-teal uppercase tracking-widest hover:text-arin-green transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
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
        )}

        {/* Email OTP Login Form */}
        {loginMode === "otp" && (
          <div className="space-y-5">
            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                    Username or Email
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Enter username or registered email"
                      value={otpIdentifier}
                      onChange={(e) => setOtpIdentifier(e.target.value)}
                      className="w-full h-12 px-4 pr-10 bg-slate-800/80 border border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:outline-none focus:border-arin-teal focus:ring-1 focus:ring-arin-teal/50 transition-all font-medium"
                      required
                      disabled={isLoading}
                    />
                    <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 flex items-center justify-center bg-gradient-to-r from-arin-green to-arin-teal hover:opacity-90 text-white font-black rounded-xl shadow-xl shadow-arin-green/20 border-0 transition-all active:scale-[0.98] uppercase tracking-wider text-sm gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? "Sending Code..." : "Send Verification OTP"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-center">
                  <p className="text-xs text-slate-300 font-medium">
                    We've sent a 6-digit login OTP to the email associated with <strong className="text-white">{otpIdentifier}</strong>.
                  </p>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block text-center">
                    Enter 6-Digit OTP
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="------"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full h-12 text-center text-xl tracking-[0.5em] bg-slate-800/80 border border-slate-700 text-white rounded-xl focus:outline-none focus:border-arin-teal focus:ring-1 focus:ring-arin-teal/50 transition-all font-bold"
                    required
                    disabled={isLoading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 flex items-center justify-center bg-gradient-to-r from-arin-green to-arin-teal hover:opacity-90 text-white font-black rounded-xl shadow-xl shadow-arin-green/20 border-0 transition-all active:scale-[0.98] uppercase tracking-wider text-sm gap-2 disabled:opacity-50"
                >
                  {isLoading ? "Verifying..." : "Verify & Login"}
                </button>

                <div className="flex justify-between items-center text-xs mt-2 px-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode("");
                      setErrorMessage("");
                    }}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Change Email/User
                  </button>

                  <button
                    type="button"
                    disabled={otpTimer > 0 || isLoading}
                    onClick={handleSendOtp}
                    className="text-arin-teal hover:text-arin-green disabled:text-slate-650 transition-colors uppercase font-black tracking-widest text-[10px]"
                  >
                    {otpTimer > 0 ? `Resend in ${otpTimer}s` : "Resend OTP"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Forgot Password Flow */}
        {loginMode === "forgot" && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => {
                  setLoginMode("password");
                  setErrorMessage("");
                }}
                className="text-slate-400 hover:text-white transition-colors p-1 -ml-1"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-md font-bold text-white">Reset Password</h2>
            </div>

            {forgotStep === "request" ? (
              <form onSubmit={handleForgotRequest} className="space-y-4">
                <p className="text-xs text-slate-400 font-medium">
                  Enter your username or email address and we'll send you a secure OTP to verify identity and reset password.
                </p>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                    Username or Email
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Enter your username or email"
                      value={forgotIdentifier}
                      onChange={(e) => setForgotIdentifier(e.target.value)}
                      className="w-full h-12 px-4 pr-10 bg-slate-800/80 border border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:outline-none focus:border-arin-teal focus:ring-1 focus:ring-arin-teal/50 transition-all font-medium"
                      required
                      disabled={isLoading}
                    />
                    <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 flex items-center justify-center bg-gradient-to-r from-arin-green to-arin-teal hover:opacity-90 text-white font-black rounded-xl shadow-xl shadow-arin-green/20 border-0 transition-all active:scale-[0.98] uppercase tracking-wider text-sm gap-2 disabled:opacity-50"
                >
                  {isLoading ? "Requesting..." : "Send Reset Code"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleForgotReset} className="space-y-4">
                <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-center">
                  <p className="text-xs text-slate-300 font-medium">
                    We've sent a 6-digit password reset OTP to your registered email.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Reset Code */}
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block text-center">
                      6-Digit Reset Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="------"
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ""))}
                      className="w-full h-12 text-center text-xl tracking-[0.5em] bg-slate-800/80 border border-slate-700 text-white rounded-xl focus:outline-none focus:border-arin-teal focus:ring-1 focus:ring-arin-teal/50 transition-all font-bold"
                      required
                      disabled={isLoading}
                    />
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">
                      New Password (min 6 chars)
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter new password"
                        value={forgotNewPassword}
                        onChange={(e) => setForgotNewPassword(e.target.value)}
                        className="w-full h-12 px-4 pr-12 bg-slate-800/80 border border-slate-700 text-white placeholder:text-slate-500 rounded-xl focus:outline-none focus:border-arin-teal focus:ring-1 focus:ring-arin-teal/50 transition-all font-medium tracking-[0.15em]"
                        required
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
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 flex items-center justify-center bg-gradient-to-r from-arin-green to-arin-teal hover:opacity-90 text-white font-black rounded-xl shadow-xl shadow-arin-green/20 border-0 transition-all active:scale-[0.98] uppercase tracking-wider text-sm gap-2 disabled:opacity-50"
                >
                  {isLoading ? "Resetting..." : "Reset Password"}
                </button>

                <div className="flex justify-between items-center text-xs mt-2 px-1">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotStep("request");
                      setForgotOtp("");
                      setErrorMessage("");
                    }}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    Resend Code
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-[10px] text-slate-500 font-medium">
            Protected by bcrypt encryption &amp; rate limiting
          </p>
        </div>
      </div>
    </div>
  );
}
