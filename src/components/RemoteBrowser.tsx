import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Loader2,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RotateCcw
} from "lucide-react";
import { api } from "@/lib/api";

interface RemoteBrowserProps {
  isRunning: boolean;
  date?: Date;
  customId?: string | null;
  onReset?: () => void;
}

export function RemoteBrowser({
  isRunning,
  date,
  customId,
  onReset
}: RemoteBrowserProps) {
  const [status, setStatus] = useState<
    | "IDLE"
    | "STARTING"
    | "CAPTCHA_REQUIRED"
    | "OTP_REQUIRED"
    | "SUCCESS"
    | "ERROR"
  >("IDLE");
  const [captchaImage, setCaptchaImage] = useState<string>("");
  const [captchaInput, setCaptchaInput] = useState<string>("");
  const [otpInput, setOtpInput] = useState<string>("");
  const [otpEmail, setOtpEmail] = useState<string>("");
  const [otpMobile, setOtpMobile] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showpass, setShowPass] = useState(false);

  useEffect(() => {
    if (isRunning && status === "IDLE" && date) {
      let defaultCred = customId;
      if (!defaultCred) {
        defaultCred = `Arin$${String(date.getDate()).padStart(3, "0")}`;
      }
      setUsername(defaultCred);
      setPassword(defaultCred);
    }
  }, [isRunning, date, customId, status]);

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
    } catch (err: any) {
      setStatus("ERROR");
      setErrorMessage(err.message || "Failed to start login");
    }
  };

  const handleResponse = (res: any) => {
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
    } catch (err: any) {
      setStatus("ERROR");
      setErrorMessage(err.message || "Failed to submit captcha");
    }
  };

  const submitOtp = async () => {
    if (!otpInput.trim()) return;
    setStatus("STARTING");
    setErrorMessage("");
    try {
      const res = await api.submitOtp(otpInput);
      handleResponse(res);
    } catch (err: any) {
      setStatus("ERROR");
      setErrorMessage(err.message || "Failed to submit OTP");
    }
  };

  if (!isRunning) {
    return null;
  }
  return (
    <Card className="glass-card rounded-[1.5rem] p-6 shadow-xl border-white/20 bg-white/70 backdrop-blur-xl w-full h-auto min-h-[250px] flex flex-col justify-center relative">
      <div className="flex flex-col items-center justify-center space-y-4 max-w-sm mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shadow-inner text-white">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-black tracking-tight text-slate-900">
            Secure Login
          </h3>
        </div>

        {/* Credentials Step (IDLE) */}
        {status === "IDLE" && (
          <div className="w-full space-y-4 animate-in fade-in zoom-in-95 duration-300">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Login ID
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-white h-12 rounded-xl px-4 font-mono text-sm font-bold border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                  placeholder="Enter Username"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Password
                </label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    username &&
                    password &&
                    startLogin(username, password)
                  }
                  className="w-full bg-white h-12 rounded-xl px-4 font-mono text-sm font-bold border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                  placeholder="Enter Password"
                  type={showpass ? "text" : "password"}
                />
                <small
                  className="text-[8px] float-end text-slate-500 uppercase tracking-widest cursor-pointer"
                  onClick={() => setShowPass(!showpass)}
                >
                  show password
                </small>
              </div>
              <Button
                onClick={() => startLogin(username, password)}
                disabled={!username.trim() || !password.trim()}
                className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md shadow-orange-500/30 mt-2"
              >
                Start Connection
              </Button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {status === "ERROR" && (
          <div className="w-full bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <p className="text-sm font-medium">{errorMessage}</p>
            <Button
              onClick={() => setStatus("IDLE")}
              variant="outline"
              className="mt-2 text-xs h-8 px-4"
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Status Loading */}
        {status === "STARTING" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Processing...
            </p>
          </div>
        )}

        {/* CAPTCHA Step */}
        {status === "CAPTCHA_REQUIRED" && (
          <div className="w-full space-y-4 animate-in fade-in zoom-in-95 duration-300">
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
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex justify-between">
                Enter CAPTCHA
              </label>
              <input
                type="text"
                autoFocus
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitCaptcha()}
                className="w-full bg-white h-12 rounded-xl px-4 text-center font-mono text-lg font-bold tracking-widest border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                placeholder="Type characters"
              />
              <Button
                onClick={submitCaptcha}
                disabled={!captchaInput.trim()}
                className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md shadow-orange-500/30"
              >
                Submit CAPTCHA
              </Button>
            </div>
          </div>
        )}

        {/* OTP Step */}
        {status === "OTP_REQUIRED" && (
          <div className="w-full space-y-1 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-orange-50 text-orange-800 p-4 rounded-xl border border-orange-200 flex flex-col gap-2">
              <div className="flex items-center gap-2 font-bold mb-1">
                <Key className="w-4 h-4 shrink-0 text-orange-600" />
                <p className="text-[10px] text-orange-700">OTP has been successfully sent to following contact details:</p>
              </div>
              
              {otpEmail && (
                <p className="text-[11px] font-bold text-red-600 truncate">{otpEmail}</p>
              )}
              {otpMobile && (
                <p className="text-[11px] font-bold text-red-600 truncate">{otpMobile}</p>
              )}
              
              {(!otpEmail && !otpMobile) && (
                <p className="text-[11px] font-bold text-red-600">Registered mobile/email.</p>
              )}
            </div>  
            <div className="w-full flex justify-center">
              
 <small className="text-[8px] text-center text-slate-500 w-full uppercase tracking-widest ">
                OTP will be of 7 digits
              </small>
            </div>
           
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Enter OTP
              </label>
              <input
                type="text"
                autoFocus
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitOtp()}
                className="w-full bg-white h-12 rounded-xl px-4 text-center font-mono text-xl font-bold tracking-[0.2em] border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                placeholder="XXXXXXX"
                maxLength={7}
              />
              <Button
                onClick={submitOtp}
                disabled={!otpInput.trim()}
                className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-md shadow-orange-500/30"
              >
                Verify & Login
              </Button>
            </div>
          </div>
        )}

        {/* Success */}
        {status === "SUCCESS" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-black text-slate-800">
              Login Successful!
            </h4>
            <p className="text-xs font-medium text-slate-500 text-center">
              You can now proceed with your tasks.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

export default RemoteBrowser;
