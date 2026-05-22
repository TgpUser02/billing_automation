import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ControlPanel from "@/components/ControlPanel";
import ConsumerFilter from "@/components/ConsumerFilter";
import ExecutionConsole from "@/components/ExecutionConsole";
import { RemoteBrowser } from "@/components/RemoteBrowser";
import OutputPreview from "@/components/OutputPreview";
import { api, API_BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DownloadCloud, FileText, Zap, Database, CheckCircle2, RotateCcw, FolderDown, Monitor, PanelBottom, Layers, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
  type: "info" | "success" | "error" | "process";
}

interface DownloadedFile {
  id: number;
  filename: string;
  status: "complete" | "pending";
  timestamp: string;
}

interface Consumer {
  index: number;
  consumerNumber: string;
  name: string;
  selected: boolean;
}

// Safe sessionStorage helper — prevents JSON.parse crashes from corrupted/stale values
function safeSessionGet<T>(key: string, fallback: T): T {
  try {
    const val = sessionStorage.getItem(key);
    return val !== null ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
}

const Index = () => {
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState(() => safeSessionGet('arin_isRunning', false));
  const [currentStep, setCurrentStep] = useState(() => safeSessionGet('arin_currentStep', 1));
  const [logs, setLogs] = useState<LogEntry[]>(() => safeSessionGet('arin_logs', []));
  const [downloadedFiles, setDownloadedFiles] = useState<DownloadedFile[]>(() => safeSessionGet('arin_downloadedFiles', []));
  const [downloadCount, setDownloadCount] = useState(() => safeSessionGet('arin_downloadCount', 0));
  const [failedCount, setFailedCount] = useState(() => safeSessionGet('arin_failedCount', 0));
  const [downloadResults, setDownloadResults] = useState<{ success: string[], failed: string[] }>({ success: [], failed: [] });
  const [storagePath, setStoragePath] = useState("Desktop\\arin\\[Date]\\");
  const [totalBills, setTotalBills] = useState(() => safeSessionGet('arin_totalBills', 0));
  const [workers, setWorkers] = useState(1);
  const [consumers, setConsumers] = useState<Consumer[]>(() => safeSessionGet('arin_consumers', []));
  const [excelData, setExcelData] = useState<any[]>(() => safeSessionGet('arin_excelData', []));
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => {
    try {
      const saved = sessionStorage.getItem('arin_selectedDate');
      if (saved) { const d = new Date(saved); if (!isNaN(d.getTime())) return d; }
    } catch { /* ignore */ }
    return new Date();
  });
  const [isDone, setIsDone] = useState(false);
  const [currentCustomId, setCurrentCustomId] = useState<string | undefined>(() => {
    try { return sessionStorage.getItem('arin_customId') || undefined; } catch { return undefined; }
  });
  const [processingProgress, setProcessingProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showProcessSuccess, setShowProcessSuccess] = useState(false);
  const [processDetails, setProcessDetails] = useState<{ success: string[], failed: string[], not_in_db: string[] }>({ success: [], failed: [], not_in_db: [] });

  // Refs to safely manage interval and prevent double-firing handleProcess
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasProcessedRef = useRef(false);

  // Save state to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem('arin_isRunning', JSON.stringify(isRunning));
    sessionStorage.setItem('arin_currentStep', JSON.stringify(currentStep));
    sessionStorage.setItem('arin_logs', JSON.stringify(logs));
    sessionStorage.setItem('arin_downloadedFiles', JSON.stringify(downloadedFiles));
    sessionStorage.setItem('arin_downloadCount', JSON.stringify(downloadCount));
    sessionStorage.setItem('arin_failedCount', JSON.stringify(failedCount));
    sessionStorage.setItem('arin_totalBills', JSON.stringify(totalBills));
    if (selectedDate) sessionStorage.setItem('arin_selectedDate', selectedDate.toISOString());
    sessionStorage.setItem('arin_consumers', JSON.stringify(consumers));
    sessionStorage.setItem('arin_excelData', JSON.stringify(excelData));
    sessionStorage.setItem('arin_isProcessing', JSON.stringify(isProcessing));
    if (currentCustomId) sessionStorage.setItem('arin_customId', currentCustomId);
  }, [isRunning, currentStep, logs, downloadedFiles, downloadCount, failedCount, totalBills, selectedDate, consumers, excelData, isProcessing, currentCustomId]);

  // Persistence: Check for active session and sync with backend.
  // If backend has no active download, clear any stale sessionStorage state (Issue #13).
  useEffect(() => {
    const syncWithBackend = async () => {
      try {
        const data = await api.getDownloadStatus();
        if (data.total > 0 && data.completed < data.total) {
          // Genuine in-progress download — restore state
          setIsRunning(true);
          setCurrentStep(4);
          setTotalBills(data.total);
          setDownloadCount(data.completed);
          hasProcessedRef.current = false;

          if (logs.length === 0) {
            setLogs([{
              id: Date.now(),
              timestamp: new Date().toLocaleTimeString(),
              message: "Resuming active download session...",
              type: "info"
            }]);
          }
        } else {
          // Backend has no active download — clear any stale isRunning / currentStep
          // so we never show a stuck downloading dialog after a crash/restart
          const storedStep = safeSessionGet('arin_currentStep', 1);
          if (storedStep >= 4) {
            sessionStorage.removeItem('arin_isRunning');
            sessionStorage.removeItem('arin_currentStep');
            setIsRunning(false);
            setCurrentStep(1);
          }
        }
      } catch (e) {
        console.error("Failed to sync session with backend", e);
        // If backend is unreachable, don't leave UI in a stuck downloading state
        setIsRunning(false);
        setCurrentStep(1);
      }
    };
    syncWithBackend();
  }, []);

  const [dbSearchInput, setDbSearchInput] = useState("");
  const [isSearchingDb, setIsSearchingDb] = useState(false);
  const [dbSearchResults, setDbSearchResults] = useState<any[]>([]);

  const handleDbSearch = async () => {
    if (!dbSearchInput.trim()) return;

    setIsSearchingDb(true);
    const numbers = dbSearchInput
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    try {
      const res = await api.searchConsumersDB(numbers);
      if (res.status === "success") {
        setDbSearchResults(res.data);
        if (res.data.length === 0) {
          toast({
            title: "No matches found",
            description: "None of the consumer numbers were found in the database.",
          });
        } else {
          // AUTO-TICK FOUND CONSUMERS (Rule #9)
          const foundNumbers = res.data.map((d: any) => d.consumer_number);
          setConsumers(prev => prev.map(c => {
            if (foundNumbers.includes(c.consumerNumber)) {
              return { ...c, selected: true };
            }
            return c;
          }));

          toast({
            title: "Search successful",
            description: `Found ${res.data.length} consumers in the database and updated selection.`,
          });
        }
      }
    } catch (err) {
      console.error("DB Search Error", err);
      toast({
        title: "Search Error",
        description: "Failed to search the database.",
        variant: "destructive"
      });
    } finally {
      setIsSearchingDb(false);
    }
  };

  const [isFetchingAllDb, setIsFetchingAllDb] = useState(false);

  const handleViewAllConsumers = async () => {
    setIsFetchingAllDb(true);
    try {
      const res = await api.getAllCustomersDB();
      if (res.status === "success") {
        setDbSearchResults(res.data);
        toast({
          title: "Database Fetched",
          description: `Loaded ${res.data.length} consumers from database.`,
        });
      } else {
        toast({
          title: "Fetch Error",
          description: res.message || "Failed to load consumers from database.",
          variant: "destructive"
        });
      }
    } catch (err) {
      console.error("DB Fetch Error", err);
      toast({
        title: "Fetch Error",
        description: "Failed to load consumers from database.",
        variant: "destructive"
      });
    } finally {
      setIsFetchingAllDb(false);
    }
  };

  const handleLaunch = async (date: Date, customId?: string) => {
    setSelectedDate(date);
    setCurrentCustomId(customId);
    // Format local date as YYYY-MM-DD
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    // Update storage path display (Backend uses USERPROFILE/Desktop/arin/date)
    setStoragePath(`Desktop\\arin\\${dateStr}\\`);

    // Only reset state if not already running a browser session
    if (!isRunning) {
      setIsRunning(true);
      setCurrentStep(2);
      setLogs([]);
      setDownloadedFiles([]);
      setDownloadCount(0);
      setConsumers([]);
    } else {
      // Soft sync: stay on current step or go to 3 if we were at 1
      if (currentStep < 3) setCurrentStep(3);
    }

    setLogs((prev) => [
      ...prev,
      {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        message: isRunning
          ? `Syncing Portal for new date: ${dateStr}...`
          : `Initializing Headless Login (ID: ${customId || 'Auto'})...`,
        type: "info",
      },
    ]);

    setCurrentStep(3); // Waiting for input / login
  };



  const handleCompleteReset = async () => {
    try {
      await api.resetSystem();
    } catch (e) {
      console.error("Reset API failed:", e);
    }
    const keysToRemove = Object.keys(sessionStorage).filter(key =>
      key.startsWith('arin_') &&
      !['arin_jwt_token', 'arin_auth', 'arin_current_user'].includes(key)
    );
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
    setIsRunning(false);
    setLogs([]);
    setDownloadedFiles([]);
    setDownloadCount(0);
    setFailedCount(0);
    setTotalBills(0);
    setConsumers([]);
    setExcelData([]);
    setIsProcessing(false);
    setCurrentStep(1);
    toast({
      title: "System Reset",
      description: "All sessions have been cleanly terminated.",
    });
  };

  const handleFetchConsumers = async () => {
    setLogs(prev => [...prev, { id: Date.now(), timestamp: new Date().toLocaleTimeString(), message: "Fetching consumer list...", type: "info" }]);
    try {
      const data = await api.fetchConsumers();
      if (Array.isArray(data)) {
        // Use a Map to deduplicate by consumerNumber
        const uniqueItems = new Map();
        data.forEach((item: any) => {
          if (!uniqueItems.has(item.consumerNumber)) {
            uniqueItems.set(item.consumerNumber, item);
          }
        });

        const dedupedData = Array.from(uniqueItems.values());

        setConsumers(dedupedData.map((c: any) => ({
          index: c.index,
          consumerNumber: c.consumerNumber,
          name: c.name,
          selected: true
        })));
        setLogs(prev => [...prev, { id: Date.now(), timestamp: new Date().toLocaleTimeString(), message: `Fetched ${dedupedData.length} unique consumers.`, type: "success" }]);
      }
    } catch (e: any) {
      setLogs(prev => [...prev, { id: Date.now(), timestamp: new Date().toLocaleTimeString(), message: "Failed to fetch consumers.", type: "error" }]);
    }
  };

  const handleExcelUpload = async (file: File) => {
    setLogs(prev => [...prev, { id: Date.now(), timestamp: new Date().toLocaleTimeString(), message: `Uploading ${file.name}...`, type: "info" }]);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE_URL}/upload-excel`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (result.status === "success" && Array.isArray(result.data)) {
        setExcelData(result.data);

        // Auto-update date if present in Excel
        const firstValidDate = result.data.find((item: any) => item.date)?.date;
        if (firstValidDate) {
          const newDate = new Date(firstValidDate);
          if (!isNaN(newDate.getTime())) {
            setSelectedDate(newDate);
            const yyyy = newDate.getFullYear();
            const mm = String(newDate.getMonth() + 1).padStart(2, '0');
            const dd = String(newDate.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            setStoragePath(`C:\\Users\\Manasi\\Desktop\\arin\\${dateStr}\\`);

            setLogs(prev => [...prev, {
              id: Date.now(),
              timestamp: new Date().toLocaleTimeString(),
              message: `Reference date set from Excel: ${dateStr}`,
              type: "info"
            }]);
          }
        }

        setLogs(prev => [...prev, { id: Date.now(), timestamp: new Date().toLocaleTimeString(), message: `Excel loaded: ${result.data.length} records.`, type: "success" }]);
      }
    } catch (e) {
      setLogs(prev => [...prev, { id: Date.now(), timestamp: new Date().toLocaleTimeString(), message: "Excel upload failed.", type: "error" }]);
    }
  };

  const handleDownloadAndProcess = async () => {
    const selectedIndices = consumers.filter(c => c.selected).map(c => c.index);
    if (selectedIndices.length === 0) {
      setLogs(prev => [...prev, { id: Date.now(), timestamp: new Date().toLocaleTimeString(), message: "No bills selected.", type: "error" }]);
      return;
    }

    setTotalBills(selectedIndices.length); // Instant update for progress bar
    setCurrentStep(4);
    setIsDone(false);
    setLogs(prev => [...prev, {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      message: `Starting Turbo Download for ${selectedIndices.length} bills...`,
      type: "process"
    }]);

    try {
      await api.startDownload(workers, selectedIndices, currentCustomId);
      setLogs(prev => [...prev, { id: Date.now(), timestamp: new Date().toLocaleTimeString(), message: "Processing tabs in single window...", type: "info" }]);
    } catch (e: any) {
      setLogs(prev => [...prev, { id: Date.now(), timestamp: new Date().toLocaleTimeString(), message: "Download start failed.", type: "error" }]);
    }
  };

  // Polling effect: only tracks download progress — does NOT call handleProcess (Issue #3, #7)
  useEffect(() => {
    if (currentStep >= 4 && !isDone) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const data = await api.getDownloadStatus();
          setTotalBills(data.total);
          setDownloadCount(data.completed);
          setFailedCount(data.failed || 0);

          if (data.filenames) {
            setDownloadedFiles(data.filenames.map((name: string, i: number) => ({
              id: i,
              filename: name,
              status: "complete",
              timestamp: new Date().toLocaleTimeString()
            })));
          }

          if (data.success_list) {
            const succ = data.success_list;
            const requested = consumers.filter(c => c.selected);
            if (requested.length > 0) {
              const fail = requested.filter(c => !succ.includes(c.consumerNumber)).map(c => c.consumerNumber);
              setDownloadResults({ success: succ, failed: fail });
            } else {
              setDownloadResults({ success: succ, failed: [] });
            }
          }

          if (data.total > 0 && data.in_progress === false) {
            // Clear interval IMMEDIATELY and synchronously before doing anything else (Issue #2, #3)
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsDone(true);
            setShowSuccessModal(true);
            setLogs(prev => [...prev, { id: Date.now(), timestamp: new Date().toLocaleTimeString(), message: "Download Operations Completed.", type: "success" }]);
            toast({
              title: "Download Finished",
              description: `Successfully downloaded ${data.completed} bills. Failed: ${data.failed || 0}.`,
              variant: (data.failed || 0) > 0 ? "destructive" : "default"
            });
            // handleProcess is now triggered via the isDone useEffect below (Issue #7)
          }
        } catch (e) {
          console.error(e);
        }
      }, 400);
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [currentStep, isDone]);

  const processPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isProcessing) {
      processPollIntervalRef.current = setInterval(async () => {
        try {
          const res = await api.getProcessStatus();
          if (res.total > 0) {
            setProcessingProgress(Math.round((res.completed / res.total) * 100));
          }

          if (res.in_progress === false && res.total !== undefined) {
            if (processPollIntervalRef.current) {
              clearInterval(processPollIntervalRef.current);
              processPollIntervalRef.current = null;
            }
            
            setIsProcessing(false);
            setProcessDetails(res.results || { success: [], failed: [], not_in_db: [] });
            setShowProcessSuccess(true);

            const successCount = res.results?.success?.length || 0;
            const notInDbCount = res.results?.not_in_db?.length || 0;
            const totalCount = res.total || 0;

            if (totalCount === 0) {
              setLogs(prev => [...prev, {
                id: Date.now(),
                timestamp: new Date().toLocaleTimeString(),
                message: "No downloaded bills found to process.",
                type: "info"
              }]);
              toast({
                title: "Process Finished",
                description: "No new downloaded bills were found in the storage folder.",
                variant: "default"
              });
            } else {
              setLogs(prev => [...prev, {
                id: Date.now(),
                timestamp: new Date().toLocaleTimeString(),
                message: `Analysis Finished: ${successCount} saved, ${notInDbCount} not in DB.`,
                type: successCount > 0 ? "success" : "warning"
              }]);

              toast({
                title: successCount > 0 ? "Data Synced" : "Process Finished",
                description: `Processed ${totalCount} files: ${successCount} saved, ${notInDbCount} skipped.`,
                className: successCount > 0 ? "bg-green-600 text-white border-none shadow-2xl font-bold" : "bg-orange-600 text-white border-none shadow-2xl font-bold",
              });
            }
          }
        } catch (e) {
          console.error("Process polling error", e);
        }
      }, 500);
    }

    return () => {
      if (processPollIntervalRef.current) clearInterval(processPollIntervalRef.current);
    }
  }, [isProcessing]);

  const handleProcess = async () => {
    setLogs(prev => [...prev, { id: Date.now(), timestamp: new Date().toLocaleTimeString(), message: "Starting background DB saving task...", type: "process" }]);
    setIsProcessing(true);
    setProcessingProgress(0);

    try {
      await api.processData();
      // Polling takes over from here!
    } catch (e) {
      setIsProcessing(false);
      setProcessingProgress(0);
      setLogs(prev => [...prev, { id: Date.now(), timestamp: new Date().toLocaleTimeString(), message: "Processing start failed.", type: "error" }]);
    }
  };

  // We removed the auto-triggering effect so that handleProcess only runs when the user clicks "Continue to Analysis"

  return (
    <div className="min-h-screen bg-transparent p-4 lg:p-8 animate-in fade-in duration-700">
      {/* Page Header - Clean & Minimal */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8 border-b border-border/10 pb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-foreground bg-clip-text text-transparent bg-gradient-to-r from-arin-teal to-arin-green">
            Auto Downloader
          </h1>
          <p className="text-muted-foreground mt-1 font-medium">
            Batch automate MSEDCL bill downloads with parallel execution.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={async () => {
              try {
                toast({ title: "Uploading...", description: "Generating Zero-Gen CSV and uploading to Google Drive." });
                const res = await api.uploadZeroGenReport();
                toast({ title: "Success", description: res.message });
              } catch (err: any) {
                toast({ title: "Error", description: err.message, variant: "destructive" });
              }
            }}
            variant="outline"
            className="rounded-xl border-2 border-arin-orange text-arin-orange hover:bg-arin-orange/5 font-black uppercase text-[10px] tracking-widest h-10 px-4"
          >
            <FolderDown className="w-3.5 h-3.5 mr-2" /> Upload Zero-Gen
          </Button>
          <Button
            onClick={handleCompleteReset}
            variant="outline"
            className="rounded-xl border-dashed border-2 border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-all font-black text-[10px] uppercase tracking-widest h-10 px-4"
          >
            <RotateCcw className="w-3 h-3 mr-2" /> Force Reset System
          </Button>
          <div className="flex items-center gap-3 bg-white/50 backdrop-blur-sm border border-white/20 px-4 py-2 rounded-2xl shadow-sm">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none">System Health</span>
              <span className="text-sm font-bold text-arin-green flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-arin-green animate-pulse" />
                High Performance Mode
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid - Using 12-column layout for better control */}
      <div className="grid grid-cols-12 gap-8">

        {/* Column 1: Config (3/12) */}
        <div className="col-span-12 xl:col-span-3 space-y-6">
          <ControlPanel
            onLaunch={handleLaunch}
            isRunning={isRunning}
            currentStep={currentStep}
            date={selectedDate}
            setDate={setSelectedDate}
          />
        </div>

        {/* Column 2: Management (Middle - 6/12) */}
        <div className="col-span-12 xl:col-span-6 space-y-8">
          <ConsumerFilter
            consumers={consumers}
            setConsumers={setConsumers}
            onFetch={handleFetchConsumers}
            onExcelUpload={handleExcelUpload}
            excelData={excelData}
            selectedDate={selectedDate}
          />

          {/* Database ID Lookup Panel */}
          <Card className="glass-card border-slate-200 shadow-xl rounded-2xl overflow-hidden bg-white/80">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Database className="w-6 h-6 text-blue-500" />
                </div>
                <h2 className="text-xl font-black text-[#1E293B] tracking-tight">Database ID Lookup</h2>
              </div>
              <div className="flex flex-col gap-4">
                <textarea
                  className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none shadow-inner font-mono text-xs"
                  rows={3}
                  placeholder="Paste consumer numbers (comma or newline separated)"
                  value={dbSearchInput}
                  onChange={(e) => setDbSearchInput(e.target.value)}
                />
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={handleDbSearch}
                    disabled={isSearchingDb || isFetchingAllDb}
                    className="bg-slate-900 hover:bg-black text-white rounded-xl font-black uppercase tracking-widest text-[10px] w-full sm:w-auto self-start shadow-lg shadow-slate-900/20 py-6 px-8 transition-all active:scale-95"
                  >
                    {isSearchingDb ? "Searching..." : "Search Database"}
                  </Button>
                  <Button
                    onClick={handleViewAllConsumers}
                    disabled={isSearchingDb || isFetchingAllDb}
                    variant="outline"
                    className="bg-white hover:bg-slate-50 text-slate-800 rounded-xl font-black uppercase tracking-widest text-[10px] w-full sm:w-auto self-start shadow-sm border-slate-200 py-6 px-8 transition-all active:scale-95"
                  >
                    {isFetchingAllDb ? "Loading..." : "View All Consumers"}
                  </Button>
                </div>

                {dbSearchResults.length > 0 && (
                  <div className="mt-2 bg-[#F8FAFC] rounded-2xl border border-slate-200 p-1 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex border-b border-slate-200 py-3 px-6">
                      <div className="flex-1 text-xs font-black text-[#64748B] uppercase tracking-widest">Consumer Number</div>
                      <div className="flex-1 text-xs font-black text-[#64748B] uppercase tracking-widest text-right">ARIN ID</div>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {dbSearchResults.map((res: any, idx) => (
                        <div key={idx} className="flex py-3 px-6 items-center hover:bg-white transition-colors">
                          <div className="flex-1 font-mono text-xs font-bold text-[#1E293B]">{res.consumer_number}</div>
                          <div className="flex-1 text-right text-blue-500 font-black text-sm">{res.arin_id || res.id}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Progress Indicators - Prominent Central Position */}
          {(totalBills > 0 || isProcessing) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {totalBills > 0 && (
                <Card className="p-6 border-arin-teal/20 bg-arin-teal/5 backdrop-blur-sm shadow-lg">
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <div className="flex items-center gap-2">
                        <DownloadCloud className="w-5 h-5 text-arin-teal" />
                        <span className="text-sm font-black text-slate-700 uppercase tracking-widest">Download Progress</span>
                      </div>
                      <span className="text-xl font-black text-arin-teal">{Math.round((downloadCount / totalBills) * 100)}%</span>
                    </div>
                    <div className="w-full h-4 bg-white rounded-full overflow-hidden border border-arin-teal/30 p-1">
                      <div
                        className="h-full bg-gradient-to-r from-arin-teal to-arin-green rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(45,212,191,0.5)]"
                        style={{ width: `${(downloadCount / totalBills) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                      <span>{downloadCount} Bills Saved</span>
                      {failedCount > 0 && <span className="text-red-500 font-black">{failedCount} Failed</span>}
                      <span>{totalBills} Total Selected</span>
                    </div>
                  </div>
                </Card>
              )}

              {isProcessing && (
                <Card className="p-6 border-arin-orange/20 bg-arin-orange/5 backdrop-blur-sm shadow-lg">
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <div className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-arin-orange" />
                        <span className="text-sm font-black text-slate-700 uppercase tracking-widest">Saving to DB</span>
                      </div>
                      <span className="text-xl font-black text-arin-orange">{processingProgress}%</span>
                    </div>
                    <div className="w-full h-4 bg-white rounded-full overflow-hidden border border-arin-orange/30 p-1">
                      <div
                        className="h-full bg-gradient-to-r from-arin-orange to-arin-orange/60 rounded-full transition-all duration-1000 ease-out animate-pulse"
                        style={{ width: `${processingProgress}%` }}
                      />
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}

          <div className="grid gap-8 lg:grid-cols-1">
            <ExecutionConsole logs={logs} isRunning={isRunning} />
          </div>
        </div>

        {/* Column 3: Engine (3/12) */}
        <div className="col-span-12 xl:col-span-3 space-y-6">
          <RemoteBrowser isRunning={isRunning} date={selectedDate} customId={currentCustomId} onReset={handleCompleteReset} />
          
          <Card className="glass-card rounded-[2rem] p-8 shadow-2xl border-white/20 bg-white/70 backdrop-blur-xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-[#FFF8E7] flex items-center justify-center shadow-inner">
                <Zap className="w-6 h-6 text-arin-orange fill-arin-orange/20" />
              </div>
              <h3 className="text-xl font-black tracking-tight text-[#0F172A]">Turbo Mode</h3>
            </div>

            <div className="space-y-6">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <span className="text-[10px] font-black text-[#64748B] uppercase tracking-[0.1em]">Engine Status</span>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-black text-arin-teal mt-1">Ready</span>
                </div>
              </div>
              <div className="pt-2">
                <p className="text-[10px] font-medium text-slate-500 leading-relaxed italic">
                  Note: The system now reuses your active session for all consumers. No more browser restarts or repeated logins!
                </p>
              </div>
            </div>

            <div className="grid gap-3 pt-6 mt-6 border-t border-slate-100">
              <Button
                onClick={handleDownloadAndProcess}
                disabled={currentStep < 3}
                className="w-full py-6 bg-gradient-to-br from-arin-orange to-arin-orange/80 text-white rounded-[1.25rem] font-black text-sm shadow-xl shadow-arin-orange/30 hover:scale-[1.02] active:scale-95 transition-all border-0 uppercase tracking-wider disabled:opacity-50"
              >
                <DownloadCloud className="mr-2 h-5 w-5" />
                Start Batch
              </Button>
              <Button
                onClick={handleProcess}
                variant="outline"
                className="w-full py-5 rounded-[1.25rem] font-bold bg-white/50 border-slate-200 text-slate-400 hover:text-arin-teal transition-all shadow-sm uppercase text-[10px] tracking-widest"
              >
                <FileText className="mr-2 h-4 w-4" />
                Save Data
              </Button>
            </div>
          </Card>

          <OutputPreview
            downloadedFiles={downloadedFiles}
            totalDownloaded={downloadCount}
            totalConsumers={totalBills}
            storagePath={storagePath}
          />
        </div>
      </div>

      {/* Persistent Downloading Popup */}
      <Dialog open={currentStep >= 4 && !isDone} onOpenChange={() => { }}>
        <DialogContent
          className="rounded-[2rem] sm:max-w-[440px] border-none bg-white/90 backdrop-blur-2xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.15)] overflow-hidden p-0"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="absolute top-0 left-0 w-full h-2 bg-slate-100">
            <div
              className="h-full bg-gradient-to-r from-arin-teal to-arin-green transition-all duration-500 ease-out"
              style={{ width: `${(downloadCount / (totalBills || 1)) * 100}%` }}
            />
          </div>

          <div className="p-8 pt-12 text-center">
            <div className="relative mx-auto w-20 h-20 mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-slate-50"></div>
              <div className="absolute inset-0 rounded-full border-4 border-arin-teal border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <DownloadCloud className="w-8 h-8 text-arin-teal animate-bounce" />
              </div>
            </div>

            <DialogHeader className="space-y-2">
              <DialogTitle className="text-2xl font-black text-slate-900 tracking-tight text-center">
                Downloading PDFs...
              </DialogTitle>
              <p className="text-slate-500 font-medium text-center text-sm">
                Parallel workers are fetching your bills from the portal.
              </p>
            </DialogHeader>

            <div className="mt-8 space-y-4">
              <div className="bg-slate-50/80 rounded-2xl p-6 border border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Progress Status</span>
                  <span className="text-sm font-black text-arin-teal">{Math.round((downloadCount / (totalBills || 1)) * 100)}%</span>
                </div>
                <div className="flex items-end justify-center gap-2">
                  <span className="text-4xl font-black text-slate-900 leading-none">{downloadCount}</span>
                  <span className="text-lg font-bold text-slate-300 mb-1">/ {totalBills}</span>
                </div>
                <p className="text-[10px] text-slate-400 font-bold mt-3 uppercase tracking-tighter flex items-center justify-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Processing active threads...
                </p>
              </div>

              <div className="flex items-center gap-3 justify-center text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white rounded-xl py-3 border border-slate-100">
                <Zap className="w-3 h-3 text-arin-orange fill-arin-orange/20" />
                <span>Turbo Mode Enabled</span>
                <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                <span>{workers} Parallel Workers</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Popup — Download Complete */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-[400px] border-none bg-white p-0 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
          <div className="h-20 bg-gradient-to-r from-arin-teal to-arin-green flex items-center justify-center shrink-0">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/30">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="p-6 text-center flex-1 overflow-y-auto custom-scrollbar">
            <DialogHeader>
              <DialogTitle className="text-xl font-black text-slate-900 text-center mb-1">
                Download Summary
              </DialogTitle>
              <p className="text-slate-500 font-bold text-xs text-center leading-relaxed mb-6">
                {downloadCount} bills downloaded successfully. {failedCount > 0 ? `${failedCount} bills failed to download.` : ''}
              </p>
            </DialogHeader>

            <div className="space-y-4 text-left">
              {downloadResults.success.length > 0 && (
                <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                  <h3 className="text-[10px] font-black text-green-700 uppercase tracking-widest mb-2 flex justify-between items-center">
                    ✅ Successful
                    <span className="bg-green-200 text-green-800 px-2 py-0.5 rounded-full">{downloadResults.success.length}</span>
                  </h3>
                  <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
                    {downloadResults.success.map((num, i) => (
                      <div key={`s-${i}`} className="text-xs font-mono font-bold text-green-700">- {num}</div>
                    ))}
                  </div>
                </div>
              )}

              {downloadResults.failed.length > 0 && (
                <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                  <h3 className="text-[10px] font-black text-red-700 uppercase tracking-widest mb-2 flex justify-between items-center">
                    ❌ Failed
                    <span className="bg-red-200 text-red-800 px-2 py-0.5 rounded-full">{downloadResults.failed.length}</span>
                  </h3>
                  <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
                    {downloadResults.failed.map((num, i) => (
                      <div key={`f-${i}`} className="text-xs font-mono font-bold text-red-600">- {num}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 shrink-0">
              <Button
                onClick={() => {
                  setShowSuccessModal(false);
                }}
                className="w-full h-12 rounded-2xl bg-slate-900 hover:bg-black text-white font-black uppercase tracking-widest text-xs shadow-xl transition-all active:scale-95"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Saving Data / Process Success Popup */}
      <Dialog open={isProcessing || showProcessSuccess} onOpenChange={() => { }}>
        <DialogContent
          className="rounded-[2.5rem] sm:max-w-[400px] border-none bg-white p-0 overflow-hidden shadow-2xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {isProcessing ? (
            <div className="p-10 text-center">
              <div className="relative mx-auto w-24 h-24 mb-8">
                <div className="absolute inset-0 rounded-full border-4 border-arin-orange/10"></div>
                <div className="absolute inset-0 rounded-full border-4 border-arin-orange border-t-transparent animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Database className="w-10 h-10 text-arin-orange animate-pulse" />
                </div>
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2">Saving data... Please wait.</h2>
              <p className="text-slate-500 font-bold text-sm">Processing PDFs and updating database records.</p>
              <div className="mt-8 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-arin-orange transition-all duration-300"
                  style={{ width: `${processingProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="p-8 text-center animate-in zoom-in-95 duration-300 max-h-[85vh] overflow-y-auto custom-scrollbar">
              <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-green-100">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2">Sync Complete</h2>
              <div className="flex items-center justify-center gap-3 mb-8">
                  <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-black uppercase tracking-widest">{processDetails.success.length} Saved</div>
                  <div className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-[10px] font-black uppercase tracking-widest">{processDetails.not_in_db.length} Skipped</div>
                  <div className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-black uppercase tracking-widest">{processDetails.failed.length} Failed</div>
              </div>
              
              <div className="space-y-4">
                  {/* 1. SUCCESS SECTION - Primary Focus */}
                  {processDetails.success.length > 0 && (
                      <div className="bg-green-50 p-5 rounded-2xl border border-green-100 text-left shadow-sm">
                          <h3 className="text-[10px] font-black text-green-700 uppercase tracking-[0.1em] mb-3 flex justify-between items-center">
                              ✅ Successfully Saved to DB
                              <span className="bg-green-200/50 text-green-800 px-2 py-0.5 rounded-lg border border-green-200">{processDetails.success.length}</span>
                          </h3>
                          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                              {processDetails.success.map((num, i) => (
                                  <span key={`s-${i}`} className="bg-white px-2 py-1.5 rounded-lg text-[10px] font-mono font-black text-green-700 border border-green-100 shadow-sm">{num}</span>
                              ))}
                          </div>
                      </div>
                  )}

                  {/* 2. NOT IN DB SECTION - Action Required */}
                  {processDetails.not_in_db.length > 0 && (
                      <div className="bg-orange-50 p-5 rounded-2xl border border-orange-100 text-left shadow-sm">
                          <h3 className="text-[10px] font-black text-orange-700 uppercase tracking-[0.1em] mb-2 flex justify-between items-center">
                              ⚠ Not Registered in Master
                              <span className="bg-orange-200/50 text-orange-800 px-2 py-0.5 rounded-lg border border-orange-200">{processDetails.not_in_db.length}</span>
                          </h3>
                          <p className="text-[9px] text-orange-500 font-bold mb-3 uppercase tracking-tighter leading-tight">These consumers were skipped because they are not in the "Customer Master" table.</p>
                          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                              {processDetails.not_in_db.map((num, i) => (
                                  <span key={`ndb-${i}`} className="bg-white px-2 py-1.5 rounded-lg text-[10px] font-mono font-black text-orange-700 border border-orange-100 shadow-sm">{num}</span>
                              ))}
                          </div>
                      </div>
                  )}

                  {/* 3. FAILED SECTION - Technical Issues */}
                  {processDetails.failed.length > 0 && (
                      <div className="bg-red-50 p-5 rounded-2xl border border-red-100 text-left shadow-sm">
                          <h3 className="text-[10px] font-black text-red-700 uppercase tracking-[0.1em] mb-3 flex justify-between items-center">
                              ❌ Extraction/Save Errors
                              <span className="bg-red-200/50 text-red-800 px-2 py-0.5 rounded-lg border border-red-200">{processDetails.failed.length}</span>
                          </h3>
                          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto custom-scrollbar pr-1">
                              {processDetails.failed.map((num, i) => (
                                  <span key={`f-${i}`} className="bg-white px-2 py-1.5 rounded-lg text-[10px] font-mono font-black text-red-700 border border-red-100 shadow-sm">{num}</span>
                              ))}
                          </div>
                      </div>
                  )}
              </div>
              
              <Button onClick={() => setShowProcessSuccess(false)} className="mt-8 w-full h-14 rounded-2xl bg-slate-900 hover:bg-black text-white font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-xl shadow-slate-200">
                 Done & Sync Dashboard
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
