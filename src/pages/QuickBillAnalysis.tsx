import React, { useState, useRef, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Upload, FileText, CloudSun, Zap, CheckCircle2, Cpu, Loader2, 
  ArrowUpRight, ArrowDownLeft, ShieldCheck, Sun, TrendingUp, 
  Download, Image as ImageIcon, FileCheck, Activity, Calendar,
  Sparkles, Clock, Leaf, Trees, Sliders, Info, AlertTriangle,
  Save, RefreshCw, CheckCircle, ShieldAlert, ChevronDown
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { BillPreview } from "@/components/BillPreview";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import logo from "@/assets/arin_logo.png";

export default function QuickBillAnalysis() {
  const [activeTab, setActiveTab] = useState<"prospective" | "solar">("prospective");
  const reportRef = useRef<HTMLDivElement>(null);
  const prospectiveReportRef = useRef<HTMLDivElement>(null);
  
  // Prospective Sales Non-Solar Bill States
  const [prospectiveFile, setProspectiveFile] = useState<File | null>(null);
  const [isAnalyzingProspective, setIsAnalyzingProspective] = useState(false);
  const [prospectiveResult, setProspectiveResult] = useState<any>(null);
  const [customCapacity, setCustomCapacity] = useState<number | null>(null);

  // Solar Bill OCR States
  const [solarFile, setSolarFile] = useState<File | null>(null);
  const [isAnalyzingSolar, setIsAnalyzingSolar] = useState(false);
  const [solarResult, setSolarResult] = useState<any>(null);

  // Solar Plant Health & Benchmark Formula States
  const [commissioningDateInput, setCommissioningDateInput] = useState<string>("");
  const [benchmarkXInput, setBenchmarkXInput] = useState<string>("100");
  const [showBenchmarkMatrix, setShowBenchmarkMatrix] = useState<boolean>(false);
  const [isSavingBenchmarks, setIsSavingBenchmarks] = useState<boolean>(false);
  const [monthlyBenchmarks, setMonthlyBenchmarks] = useState<Record<string, number>>({
    January: 100, February: 100, March: 100, April: 100,
    May: 100, June: 100, July: 100, August: 100,
    September: 100, October: 100, November: 100, December: 100
  });

  // Export & Preview States
  const [uploadedBillPreviewUrl, setUploadedBillPreviewUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Drag and Drop active states
  const [isDragActiveProspective, setIsDragActiveProspective] = useState<boolean>(false);
  const [isDragActiveSolar, setIsDragActiveSolar] = useState<boolean>(false);

  // Prevent unwanted browser file opens when dropping outside target zone
  useEffect(() => {
    const preventWindowDrop = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener("dragover", preventWindowDrop);
    window.addEventListener("drop", preventWindowDrop);
    return () => {
      window.removeEventListener("dragover", preventWindowDrop);
      window.removeEventListener("drop", preventWindowDrop);
    };
  }, []);

  // Load 12-month benchmarks from backend on mount
  useEffect(() => {
    api.getSystemBenchmarks().then((res: any) => {
      if (res?.benchmarks) {
        setMonthlyBenchmarks(res.benchmarks);
      }
    }).catch((err) => {
      console.debug("Could not load benchmarks:", err);
    });
  }, []);

  // Compute live plant age in years from commissioningDateInput
  const liveAgeYears = useMemo(() => {
    if (!commissioningDateInput) return 0;
    try {
      const s = commissioningDateInput.trim();
      let d: Date | null = null;
      if (s.includes('-')) {
        const parts = s.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          } else {
            let yr = parseInt(parts[2], 10);
            if (yr < 100) yr += yr < 50 ? 2000 : 1900;
            d = new Date(yr, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
          }
        }
      } else if (s.includes('/')) {
        const parts = s.split('/');
        if (parts.length === 3) {
          let yr = parseInt(parts[2], 10);
          if (yr < 100) yr += yr < 50 ? 2000 : 1900;
          d = new Date(yr, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        }
      }
      if (d && !isNaN(d.getTime())) {
        const diffMs = Math.max(0, Date.now() - d.getTime());
        return Number((diffMs / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1));
      }
    } catch {
      return 0;
    }
    return 0;
  }, [commissioningDateInput]);

  const liveDegradationPct = Number((liveAgeYears * 1.0).toFixed(1));
  const liveTargetGeneration = useMemo(() => {
    const x = parseFloat(benchmarkXInput) || 100;
    const cap = parseFloat(String(solarResult?.extracted_data?.capacity || "3.0")) || 3.0;
    const plantBase = x <= 200 ? cap * x : x;
    const factor = Math.max(0.70, 1.0 - (liveAgeYears * 0.01));
    return Number((plantBase * factor).toFixed(1));
  }, [benchmarkXInput, liveAgeYears, solarResult]);

  const handleSaveBenchmarks = async () => {
    setIsSavingBenchmarks(true);
    try {
      await api.saveSystemBenchmarks(monthlyBenchmarks);
      toast.success("12-month generation benchmarks (X) saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save benchmarks.");
    } finally {
      setIsSavingBenchmarks(false);
    }
  };

  const processProspectiveFile = (file: File) => {
    const validExtensions = [".pdf", ".png", ".jpg", ".jpeg"];
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!validExtensions.includes(ext) && !file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Unsupported file format. Please upload a PDF or Image file (.pdf, .png, .jpg, .jpeg).");
      return;
    }
    setProspectiveFile(file);
    setProspectiveResult(null);
    const reader = new FileReader();
    reader.onload = () => setUploadedBillPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
    toast.success(`Selected file: ${file.name}`);
  };

  const processSolarFile = (file: File) => {
    const validExtensions = [".pdf", ".png", ".jpg", ".jpeg"];
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!validExtensions.includes(ext) && !file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Unsupported file format. Please upload a PDF or Image file (.pdf, .png, .jpg, .jpeg).");
      return;
    }
    setSolarFile(file);
    setSolarResult(null);
    const reader = new FileReader();
    reader.onload = () => setUploadedBillPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
    toast.success(`Selected file: ${file.name}`);
  };

  const handleProspectiveFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processProspectiveFile(e.target.files[0]);
    }
  };

  const handleSolarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSolarFile(e.target.files[0]);
    }
  };

  const handleProspectiveDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActiveProspective(true);
  };

  const handleProspectiveDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActiveProspective(true);
  };

  const handleProspectiveDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragActiveProspective(false);
  };

  const handleProspectiveDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActiveProspective(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processProspectiveFile(e.dataTransfer.files[0]);
    }
  };

  const handleSolarDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActiveSolar(true);
  };

  const handleSolarDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActiveSolar(true);
  };

  const handleSolarDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragActiveSolar(false);
  };

  const handleSolarDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActiveSolar(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSolarFile(e.dataTransfer.files[0]);
    }
  };

  const handleAnalyzeProspective = async () => {
    if (!prospectiveFile) return;
    setIsAnalyzingProspective(true);
    try {
      const formData = new FormData();
      formData.append("file", prospectiveFile);
      const res = await api.analyzeProspectiveBill(formData);
      setProspectiveResult(res);
      toast.success("Prospective bill analyzed! Solar cost-savings proposal ready.");
    } catch (err: any) {
      toast.error(err.message || "Failed to analyze prospective bill.");
    } finally {
      setIsAnalyzingProspective(false);
    }
  };

  const handleAnalyzeSolar = async () => {
    if (!solarFile) return;
    setIsAnalyzingSolar(true);
    try {
      const formData = new FormData();
      formData.append("file", solarFile);
      formData.append("monthly_benchmarks_json", JSON.stringify(monthlyBenchmarks));

      const res = await api.analyzeBillOcr(formData);
      setSolarResult(res);

      if (res?.extracted_data?.commissioning_date) {
        setCommissioningDateInput(res.extracted_data.commissioning_date);
      }
      if (res?.extracted_data?.benchmark_x) {
        setBenchmarkXInput(String(res.extracted_data.benchmark_x));
      }

      if (res?.extracted_data?.is_ai_extracted && !res?.extracted_data?.fallback_used) {
        toast.success(`✨ Report generated by Real AI Vision (${res.extracted_data.ai_model || "Gemini"})!`);
      } else {
        toast.warning("⚠️ AI Vision unavailable: Report generated using Fallback Formula Engine (Target = X × [1 - Age × 1%]).");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to analyze solar bill.");
    } finally {
      setIsAnalyzingSolar(false);
    }
  };

  // Export Handlers for Prospective Proposal
  const handleExportProspectiveImage = async () => {
    if (!prospectiveReportRef.current) {
      toast.error("Proposal report preview element not ready.");
      return;
    }
    try {
      setIsExporting(true);
      const canvas = await html2canvas(prospectiveReportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 1000
      });
      const imgData = canvas.toDataURL("image/png", 1.0);
      const link = document.createElement("a");
      const cNum = prospectiveResult?.extracted_data?.consumer_number || "Client";
      link.download = `Arin_Energy_Solar_Proposal_${cNum}.png`;
      link.href = imgData;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Sales proposal report image downloaded successfully!");
    } catch (err: any) {
      toast.error("Proposal image export failed: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportProspectivePDF = async () => {
    if (!prospectiveReportRef.current) {
      toast.error("Proposal report preview element not ready.");
      return;
    }
    try {
      setIsExporting(true);
      const reportCanvas = await html2canvas(prospectiveReportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 1000
      });
      const reportImg = reportCanvas.toDataURL("image/jpeg", 0.95);

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [reportCanvas.width, reportCanvas.height]
      });

      // Page 1: Compact Sales Proposal Report Card
      pdf.addImage(reportImg, "JPEG", 0, 0, reportCanvas.width, reportCanvas.height);

      // Page 2: Attached Original Non-Solar Utility Bill
      if (uploadedBillPreviewUrl && uploadedBillPreviewUrl.startsWith("data:image")) {
        pdf.addPage([reportCanvas.width, reportCanvas.height], "landscape");

        pdf.setFillColor(15, 23, 42); // slate-900
        pdf.rect(0, 0, reportCanvas.width, 70, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(22);
        const cNum = prospectiveResult?.extracted_data?.consumer_number || "MSEDCL";
        pdf.text(`ATTACHED UTILITY ELECTRICITY BILL — CONSUMER NO: ${cNum}`, 40, 44);

        pdf.addImage(uploadedBillPreviewUrl, "JPEG", 40, 90, reportCanvas.width - 80, reportCanvas.height - 130, undefined, "FAST");
      }

      const cNum = prospectiveResult?.extracted_data?.consumer_number || "Client";
      pdf.save(`Arin_Energy_Solar_Proposal_${cNum}.pdf`);
      toast.success("Sales proposal PDF with attached bill downloaded successfully!");
    } catch (err: any) {
      toast.error("Proposal PDF export failed: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Export Handlers for Solar Client Bill
  // CTA 1: Download Report Only (supports PDF and PNG)
  const handleExportReportOnly = async (formatChoice: "pdf" | "png" = "pdf") => {
    if (!reportRef.current) {
      toast.error("Report preview element not ready.");
      return;
    }
    try {
      setIsExporting(true);
      const reportCanvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 1200
      });
      const cNum = solarResult?.extracted_data?.consumer_number || "Bill";

      if (formatChoice === "png") {
        const imgData = reportCanvas.toDataURL("image/png", 1.0);
        const link = document.createElement("a");
        link.download = `Arin_Energy_AI_Solar_Bill_Report_${cNum}.png`;
        link.href = imgData;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("Report image (.png) downloaded successfully!");

        // Background Drive Save
        try {
          const rawCNum = solarResult?.extracted_data?.consumer_number;
          const bDate = solarResult?.extracted_data?.billing_date || solarResult?.extracted_data?.reading_date || format(new Date(), "yyyy-MM-dd");
          if (rawCNum) {
            api.saveBillImage(rawCNum, bDate, imgData).catch((err) => console.warn("Drive image save warning:", err));
          }
        } catch (saveErr) {
          console.warn("Background drive save error:", saveErr);
        }
      } else {
        const reportImg = reportCanvas.toDataURL("image/jpeg", 0.95);
        const pdf = new jsPDF({
          orientation: "landscape",
          unit: "px",
          format: [reportCanvas.width, reportCanvas.height]
        });

        // Page 1 Only (Clean Report without attached section)
        pdf.addImage(reportImg, "JPEG", 0, 0, reportCanvas.width, reportCanvas.height);
        pdf.save(`Arin_Energy_AI_Solar_Bill_Report_${cNum}.pdf`);
        toast.success("Report PDF downloaded successfully!");

        // Background Drive Save
        try {
          const rawCNum = solarResult?.extracted_data?.consumer_number;
          const bDate = solarResult?.extracted_data?.billing_date || solarResult?.extracted_data?.reading_date || format(new Date(), "yyyy-MM-dd");
          if (rawCNum) {
            const pdfBase64 = pdf.output("datauristring");
            api.saveBillImage(rawCNum, bDate, reportImg, pdfBase64).catch((err) => console.warn("Drive PDF save warning:", err));
          }
        } catch (saveErr) {
          console.warn("Background drive save error:", saveErr);
        }
      }
    } catch (err: any) {
      toast.error("Report export failed: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // CTA 2: Download Report with Attached Section (2-Page PDF)
  const handleExportReportWithAttached = async () => {
    if (!reportRef.current) {
      toast.error("Report preview element not ready.");
      return;
    }
    try {
      setIsExporting(true);
      // Render Page 1: Arin Energy AI Bill Analysis Report
      const reportCanvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 1200
      });
      const reportImg = reportCanvas.toDataURL("image/jpeg", 0.95);

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [reportCanvas.width, reportCanvas.height]
      });

      // Page 1: Report
      pdf.addImage(reportImg, "JPEG", 0, 0, reportCanvas.width, reportCanvas.height);

      // Page 2: Attached Original Uploaded Solar Bill
      if (uploadedBillPreviewUrl && uploadedBillPreviewUrl.startsWith("data:image")) {
        pdf.addPage([reportCanvas.width, reportCanvas.height], "landscape");

        // Top Dark Header Banner for Page 2
        pdf.setFillColor(15, 23, 42); // slate-900
        pdf.rect(0, 0, reportCanvas.width, 70, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(22);
        const cNum = solarResult?.extracted_data?.consumer_number || "MSEDCL";
        pdf.text(`ATTACHED ORIGINAL UTILITY BILL — CONSUMER NO: ${cNum}`, 40, 44);

        // Render Original Image centered on Page 2
        pdf.addImage(uploadedBillPreviewUrl, "JPEG", 40, 90, reportCanvas.width - 80, reportCanvas.height - 130, undefined, "FAST");
      }

      const cNum = solarResult?.extracted_data?.consumer_number || "Bill";
      pdf.save(`Arin_Energy_AI_Solar_Bill_Analysis_With_Attached_${cNum}.pdf`);
      toast.success("Report PDF with Attached Section downloaded successfully!");

      // Background Drive Save
      try {
        const rawCNum = solarResult?.extracted_data?.consumer_number;
        const bDate = solarResult?.extracted_data?.billing_date || solarResult?.extracted_data?.reading_date || format(new Date(), "yyyy-MM-dd");
        if (rawCNum) {
          const pdfBase64 = pdf.output("datauristring");
          api.saveBillImage(rawCNum, bDate, reportImg, pdfBase64).catch((err) => console.warn("Drive PDF save warning:", err));
        }
      } catch (saveErr) {
        console.warn("Background drive save error:", saveErr);
      }
    } catch (err: any) {
      toast.error("Export with attached section failed: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Backwards compatibility aliases
  const handleExportImage = () => handleExportReportOnly("png");
  const handleExportPDF = () => handleExportReportWithAttached();

  // Dynamic Calculations for Prospective Tool (re-evaluates live when dynamicCap slider changes)
  const currentMonthlyBill = prospectiveResult?.extracted_data?.current_monthly_bill ?? prospectiveResult?.extracted_data?.billing_amount ?? 0;
  const currentUnits = prospectiveResult?.extracted_data?.monthly_consumption_kwh ?? prospectiveResult?.extracted_data?.billing_units ?? 0;
  const defaultRecommendedCap = prospectiveResult?.solar_savings_analysis?.recommended_capacity_kw ?? prospectiveResult?.financial_proposals?.recommended_solar_capacity_kw ?? (currentUnits > 0 ? Math.max(1, Math.round(currentUnits / 120)) : 3);
  const dynamicCap = customCapacity !== null ? customCapacity : defaultRecommendedCap;
  
  // Live dynamic metrics based on dynamicCap
  const estMonthlySolarGen = Math.round(dynamicCap * 120); // 120 kWh per kW
  const dynamicNewMonthlyBill = Math.round(Math.max(350, currentMonthlyBill - (dynamicCap * 120 * 9.0))); // ~₹9/unit tariff offset
  const dynamicMonthlySavings = Math.max(0, currentMonthlyBill - dynamicNewMonthlyBill);
  const dynamicAnnualSavings = dynamicMonthlySavings * 12;

  const estSystemCost = dynamicCap * 55000;
  const dynamicPaybackYears = dynamicAnnualSavings > 0 ? Number((estSystemCost / dynamicAnnualSavings).toFixed(1)) : 3.5;
  const dynamicCo2Saved = Math.round(dynamicCap * 120 * 12 * 0.82);
  const dynamicTrees = Math.round(dynamicCo2Saved / 20);

  let runningSavings = dynamicAnnualSavings;
  let dynamicLifetimeSavings = 0;
  for (let i = 0; i < 25; i++) {
    dynamicLifetimeSavings += runningSavings;
    runningSavings *= 1.03;
  }
  dynamicLifetimeSavings = Math.round(dynamicLifetimeSavings);

  // Dynamic Solar Calculations for mappedBillData
  const parsedGenUnits = parseFloat(String(solarResult?.extracted_data.generated_electricity || "0").replace(/[^0-9.]/g, '')) || 0;
  const parsedCap = parseFloat(String(solarResult?.extracted_data.capacity || "3.0").replace(/[^0-9.]/g, '')) || 3.0;
  const dynAnnualSavingsVal = solarResult?.extracted_data.annual_savings 
    ? Number(solarResult.extracted_data.annual_savings) 
    : Math.round((parsedGenUnits > 0 ? parsedGenUnits : parsedCap * 120) * 12 * 8.5);
  const dynLifetimeSavingsVal = solarResult?.extracted_data.lifetime_savings
    ? String(solarResult.extracted_data.lifetime_savings)
    : `${(dynAnnualSavingsVal * 25 / 100000).toFixed(1)} Lakhs`;

  // Dynamic Banking & Net Billing Units Calculation (MSEDCL Rules)
  const rawPrevBanked = parseFloat(String(solarResult?.extracted_data.previous_banked_unit || "0").replace(/[^0-9.]/g, '')) || 0;
  const rawExpUnits = parseFloat(String(solarResult?.extracted_data.exported_to_grid || "0").replace(/[^0-9.]/g, '')) || 0;
  const rawImpUnits = parseFloat(String(solarResult?.extracted_data.imported_from_grid || "0").replace(/[^0-9.]/g, '')) || 0;
  
  const netExportUnits = rawExpUnits - rawImpUnits;
  let calculatedBanked = 0;
  let dynamicBilledUnits = 0;

  if (netExportUnits >= 0) {
    calculatedBanked = Math.round(rawPrevBanked + netExportUnits);
    dynamicBilledUnits = 0;
  } else {
    const deficitUnits = Math.abs(netExportUnits);
    if (rawPrevBanked >= deficitUnits) {
      calculatedBanked = Math.round(rawPrevBanked - deficitUnits);
      dynamicBilledUnits = 0;
    } else {
      calculatedBanked = 0;
      dynamicBilledUnits = Math.round(deficitUnits - rawPrevBanked);
    }
  }

  // Check if OCR / database provided an explicit current banked units value that is valid
  const rawPassedBanked = solarResult?.extracted_data.current_banked_unit !== undefined
    ? parseFloat(String(solarResult.extracted_data.current_banked_unit).replace(/[^0-9.]/g, ''))
    : NaN;
  if (!isNaN(rawPassedBanked)) {
    const isFrozenLegacyBug = (rawPassedBanked === rawPrevBanked && rawExpUnits !== rawImpUnits && rawPassedBanked !== calculatedBanked);
    if (!isFrozenLegacyBug) {
      calculatedBanked = rawPassedBanked;
    }
  }

  // Map Solar OCR Result into BillPreview Props
  const mappedBillData = solarResult ? {
    consumerName: solarResult.extracted_data.consumer_name || "MSEDCL Consumer",
    consumerNumber: solarResult.extracted_data.consumer_number || "",
    capacity: String(parsedCap),
    readingDate: solarResult.extracted_data.reading_date || format(new Date(), "dd/MM/yyyy"),
    billingDate: solarResult.extracted_data.billing_date || solarResult.extracted_data.bill_date || solarResult.extracted_data.month_year || solarResult.extracted_data.reading_date || format(new Date(), "dd/MM/yyyy"),
    billMonth: solarResult.extracted_data.bill_month || "",
    billingAmount: String(solarResult.extracted_data.billing_amount ?? 0),
    billingUnits: String(dynamicBilledUnits),
    generatedElectricity: String(solarResult.extracted_data.generated_electricity || `${Math.round(parsedCap * 120)} kWh`),
    exportedToGrid: String(solarResult.extracted_data.exported_to_grid || `${Math.round(parsedCap * 65)} kWh`),
    importedFromGrid: String(solarResult.extracted_data.imported_from_grid || `${Math.round(parsedCap * 55)} kWh`),
    daytimeSelfConsumption: String(solarResult.extracted_data.daytime_self_consumption || `${Math.round(parsedCap * 55)} kWh`),
    totalConsumption: String(solarResult.extracted_data.total_consumption || `${Math.round(parsedCap * 110)} kWh`),
    previousBankedUnit: String(rawPrevBanked),
    currentBankedUnit: String(calculatedBanked),
    systemHealth: solarResult.extracted_data.system_health || "POOR",
    targetGeneration: solarResult.extracted_data.target_generation_kwh ?? liveTargetGeneration,
    benchmarkX: solarResult.extracted_data.benchmark_x ?? parseFloat(benchmarkXInput),
    plantAgeYears: solarResult.extracted_data.plant_age_years ?? liveAgeYears,
    degradationPercent: solarResult.extracted_data.degradation_percent ?? liveDegradationPct,
    systemHealthReason: solarResult.extracted_data.system_health_reason,
    commissioningDate: solarResult.extracted_data.commissioning_date || commissioningDateInput,
    commissioningDateSource: solarResult.extracted_data.commissioning_date_source,
    isAiExtracted: solarResult.extracted_data.is_ai_extracted ?? false,
    fallbackUsed: solarResult.extracted_data.fallback_used ?? false,
    aiModel: solarResult.extracted_data.ai_model,
    analysisEngine: solarResult.extracted_data.analysis_engine,
    engineNotice: solarResult.extracted_data.engine_notice,
    weatherCondition: solarResult.weather_ai_analysis?.weather_condition,
    performanceScore: solarResult.weather_ai_analysis?.performance_score,
    recommendedCapacity: String(parsedCap),
    annualSavings: `₹${dynAnnualSavingsVal.toLocaleString()}`,
    lifetimeSavings: dynLifetimeSavingsVal,
    meterReadings: solarResult.extracted_data.meter_readings,
    pastYearHistory: solarResult.extracted_data.past_year_history,
  } : null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 text-slate-800">
      <div className="container mx-auto max-w-6xl space-y-8">
        
        {/* Top Header & Tab Navigation */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-emerald-600" />
              Arin Energy AI Bill Analyzers
            </h1>
            <p className="text-slate-500 font-semibold text-xs uppercase tracking-widest mt-1">
              Sales Prospect Savings Estimator & Solar Plant Performance Intelligence
            </p>
          </div>

          <div className="flex bg-slate-200/70 p-1.5 rounded-2xl gap-2 shadow-inner">
            <button
              onClick={() => setActiveTab("prospective")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                activeTab === "prospective"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Prospective Savings Tool (Sales)
            </button>
            <button
              onClick={() => setActiveTab("solar")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                activeTab === "solar"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Cpu className="w-4 h-4" />
              Solar Client Bill & Weather OCR
            </button>
          </div>
        </div>

        {/* TAB 1: PROSPECTIVE CLIENT SAVINGS TOOL */}
        {activeTab === "prospective" && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Upload Non-Solar Bill */}
            <Card className="border border-emerald-500/20 bg-white shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-emerald-600" />
                      Upload Prospective Client Electricity Bill (Non-Solar)
                    </CardTitle>
                    <CardDescription className="text-xs font-medium text-slate-500 mt-1">
                      Upload standard electricity bill (MSEDCL / Torrent / Adani / Tata). AI extracts consumption & rates to generate an instant comparative solar ROI visualizer.
                    </CardDescription>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 font-bold text-[11px] rounded-full border border-emerald-200">
                    <Sparkles className="w-3.5 h-3.5" /> Sales Conversion AI
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  onDragOver={handleProspectiveDragOver}
                  onDragEnter={handleProspectiveDragEnter}
                  onDragLeave={handleProspectiveDragLeave}
                  onDrop={handleProspectiveDrop}
                  onClick={() => document.getElementById("prospective-bill-upload")?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 cursor-pointer ${
                    isDragActiveProspective
                      ? "border-emerald-500 bg-emerald-500/15 shadow-xl ring-4 ring-emerald-500/20 scale-[1.01]"
                      : prospectiveFile
                      ? "border-emerald-400 bg-emerald-50/50 hover:border-emerald-500"
                      : "border-slate-300 hover:border-emerald-500/60 bg-slate-50/60 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="file"
                    id="prospective-bill-upload"
                    className="hidden"
                    accept=".pdf, .png, .jpg, .jpeg"
                    onChange={handleProspectiveFileChange}
                  />
                  <div className="pointer-events-none space-y-3">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto shadow-inner transition-transform duration-200 ${
                      isDragActiveProspective
                        ? "bg-emerald-600 text-white scale-110 animate-bounce"
                        : prospectiveFile
                        ? "bg-emerald-500 text-white shadow-emerald-500/30"
                        : "bg-emerald-100 text-emerald-600"
                    }`}>
                      {prospectiveFile ? <CheckCircle2 className="w-7 h-7" /> : <Upload className="w-7 h-7" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {isDragActiveProspective
                          ? "Drop Standard Electricity Bill here!"
                          : prospectiveFile
                          ? prospectiveFile.name
                          : "Click to select or drag & drop Standard Electricity Bill (PDF/Image)"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {prospectiveFile
                          ? `${(prospectiveFile.size / 1024).toFixed(1)} KB • Click or drop new file to replace`
                          : "Accepts PDF, JPG, PNG formats"}
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleAnalyzeProspective}
                  disabled={!prospectiveFile || isAnalyzingProspective}
                  className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 text-white font-black text-sm uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-600/15 flex items-center justify-center gap-2"
                >
                  {isAnalyzingProspective ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Analyzing Usage & Calculating Solar Savings...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-5 h-5" />
                      Generate Solar Cost-Savings Analysis
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Results & Comparative Savings Visualizer */}
            {prospectiveResult && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* EXPORT ACTION BAR FOR PROSPECTIVE ANALYSIS */}
                <Card className="border border-emerald-500/30 bg-gradient-to-r from-slate-900 to-emerald-950 text-white shadow-xl">
                  <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-black flex items-center gap-2 text-emerald-400">
                        <FileCheck className="w-5 h-5 text-emerald-400" />
                        Export Sales Proposal Report
                      </h3>
                      <p className="text-xs text-slate-300 mt-1">
                        Download compact sales proposal report image or PDF with attached utility bill to share with clients.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        onClick={handleExportProspectiveImage}
                        disabled={isExporting}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                      >
                        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                        Export Proposal Image (.png)
                      </Button>

                      <Button
                        onClick={handleExportProspectivePDF}
                        disabled={isExporting}
                        className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:opacity-90 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl flex items-center gap-2 shadow-lg shadow-teal-600/20"
                      >
                        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Export Proposal PDF (.pdf)
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Visualizer Hero Card */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-8 shadow-2xl border border-emerald-500/30 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                    <Sun className="w-64 h-64 text-emerald-400" />
                  </div>

                  <div className="relative z-10 space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-6">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Prospective Solar Analysis</span>
                        <h2 className="text-2xl font-black text-white mt-1">
                          Solar Cost-Benefit & Payback Proposal
                        </h2>
                        <p className="text-xs text-slate-300">
                          Prepared for: <strong>{prospectiveResult.extracted_data.consumer_name}</strong> (Consumer No: {prospectiveResult.extracted_data.consumer_number})
                        </p>
                      </div>

                      <div className="bg-emerald-500/20 border border-emerald-400/30 px-4 py-2 rounded-2xl flex items-center gap-3">
                        <Zap className="w-6 h-6 text-yellow-400" />
                        <div>
                          <span className="text-[10px] font-bold text-slate-300 block uppercase">Recommended Solar Size</span>
                          <span className="text-xl font-black text-emerald-400">{dynamicCap} kW System</span>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Capacity Adjustment */}
                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-300">Fine-tune Proposed System Capacity:</span>
                        <span className="font-black text-emerald-400">{dynamicCap} kW</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="50"
                        step="0.5"
                        value={dynamicCap}
                        onChange={(e) => setCustomCapacity(parseFloat(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                    </div>

                    {/* Comparative Financial Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="bg-white/10 backdrop-blur-md p-5 rounded-2xl border border-white/10">
                        <span className="text-[10px] font-bold text-slate-300 uppercase block">Current Monthly Bill</span>
                        <strong className="text-2xl font-black text-red-400 block mt-1">
                          ₹{currentMonthlyBill.toLocaleString()}
                        </strong>
                        <span className="text-[10px] text-slate-400">Without Solar Grid</span>
                      </div>

                      <div className="bg-white/10 backdrop-blur-md p-5 rounded-2xl border border-white/10">
                        <span className="text-[10px] font-bold text-slate-300 uppercase block">Estimated Bill With Solar</span>
                        <strong className="text-2xl font-black text-emerald-400 block mt-1">
                          ₹{dynamicNewMonthlyBill.toLocaleString()}
                        </strong>
                        <span className="text-[10px] text-slate-400">Fixed grid charges only</span>
                      </div>

                      <div className="bg-emerald-600/30 backdrop-blur-md p-5 rounded-2xl border border-emerald-400/30">
                        <span className="text-[10px] font-bold text-emerald-300 uppercase block">Annual Net Savings</span>
                        <strong className="text-2xl font-black text-white block mt-1">
                          ₹{dynamicAnnualSavings.toLocaleString()}
                        </strong>
                        <span className="text-[10px] text-emerald-200">₹{dynamicMonthlySavings.toLocaleString()} / month</span>
                      </div>

                      <div className="bg-emerald-500/40 backdrop-blur-md p-5 rounded-2xl border border-emerald-400/40">
                        <span className="text-[10px] font-bold text-yellow-300 uppercase block">25-Year Lifetime Savings</span>
                        <strong className="text-2xl font-black text-yellow-400 block mt-1">
                          ₹{dynamicLifetimeSavings.toLocaleString()}
                        </strong>
                        <span className="text-[10px] text-slate-200">With 3% tariff escalation</span>
                      </div>
                    </div>

                    {/* Environmental & ROI Highlights */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                      <div className="bg-slate-800/80 p-4 rounded-2xl border border-white/10 flex items-center gap-4">
                        <div className="p-3 bg-amber-500/20 text-yellow-400 rounded-xl">
                          <Clock className="w-6 h-6" />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Estimated ROI Payback</span>
                          <strong className="text-lg font-black text-white">{dynamicPaybackYears} Years</strong>
                        </div>
                      </div>

                      <div className="bg-slate-800/80 p-4 rounded-2xl border border-white/10 flex items-center gap-4">
                        <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl">
                          <Leaf className="w-6 h-6" />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">CO₂ Carbon Offset</span>
                          <strong className="text-lg font-black text-emerald-400">{dynamicCo2Saved.toLocaleString()} kg/yr</strong>
                        </div>
                      </div>

                      <div className="bg-slate-800/80 p-4 rounded-2xl border border-white/10 flex items-center gap-4">
                        <div className="p-3 bg-green-500/20 text-green-400 rounded-xl">
                          <Trees className="w-6 h-6" />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Equivalent Trees Planted</span>
                          <strong className="text-lg font-black text-green-400">{dynamicTrees} Trees</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* COMPACT BRANDED PROPOSAL REPORT CARD FOR EXPORT / SHARING */}
                <div className="overflow-x-auto pb-4 flex justify-center bg-slate-200/50 p-6 rounded-3xl border border-slate-300/50">
                  <div
                    ref={prospectiveReportRef}
                    style={{
                      width: "1000px",
                      backgroundColor: "#ffffff",
                      padding: "24px",
                      borderRadius: "24px",
                      fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                      boxShadow: "0 20px 40px rgba(0,0,0,0.08)",
                      color: "#1e293b",
                      display: "flex",
                      flexDirection: "column",
                      gap: "20px"
                    }}
                  >
                    {/* Banner Header */}
                    <div style={{ backgroundColor: "#0f172a", color: "#ffffff", padding: "14px 20px", borderRadius: "16px", fontSize: "18px", fontWeight: "900", textAlign: "center", letterSpacing: "1px" }}>
                      Arin Energy Prospective Solar Proposal & 25-Year ROI Estimate
                    </div>

                    {/* Header Info Card */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f8fafc", padding: "16px 20px", borderRadius: "20px", border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                        <img src={logo} alt="Arin Energy" style={{ height: "64px", objectFit: "contain" }} />
                        <div>
                          <h4 style={{ fontSize: "16px", fontWeight: "900", color: "#0f172a", margin: 0 }}>
                            {prospectiveResult.extracted_data.consumer_name || "Prospective Client"}
                          </h4>
                          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "600" }}>
                            Consumer No: {prospectiveResult.extracted_data.consumer_number}
                          </span>
                        </div>
                      </div>

                      <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", padding: "10px 18px", borderRadius: "14px", textAlign: "right" }}>
                        <span style={{ fontSize: "10px", fontWeight: "800", color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.5px", display: "block" }}>Proposed System Capacity</span>
                        <strong style={{ fontSize: "20px", fontWeight: "900", color: "#15803d" }}>{dynamicCap} kW System</strong>
                      </div>
                    </div>

                    {/* Financial Comparison Grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "14px" }}>
                      <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", padding: "14px", borderRadius: "16px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "800", color: "#991b1b", textTransform: "uppercase" }}>Current Monthly Bill</span>
                        <strong style={{ fontSize: "22px", fontWeight: "900", color: "#dc2626", display: "block", marginTop: "4px" }}>
                          ₹{currentMonthlyBill.toLocaleString()}
                        </strong>
                        <span style={{ fontSize: "10px", color: "#7f1d1d" }}>Without Solar Grid</span>
                      </div>

                      <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", padding: "14px", borderRadius: "16px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "800", color: "#166534", textTransform: "uppercase" }}>Est. Bill With Solar</span>
                        <strong style={{ fontSize: "22px", fontWeight: "900", color: "#16a34a", display: "block", marginTop: "4px" }}>
                          ₹{dynamicNewMonthlyBill.toLocaleString()}
                        </strong>
                        <span style={{ fontSize: "10px", color: "#14532d" }}>Fixed grid charges (~90% savings)</span>
                      </div>

                      <div style={{ backgroundColor: "#15803d", color: "#ffffff", padding: "14px", borderRadius: "16px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "800", color: "#dcfce7", textTransform: "uppercase" }}>Annual Net Savings</span>
                        <strong style={{ fontSize: "22px", fontWeight: "900", color: "#ffffff", display: "block", marginTop: "4px" }}>
                          ₹{dynamicAnnualSavings.toLocaleString()}
                        </strong>
                        <span style={{ fontSize: "10px", color: "#bbf7d0" }}>₹{dynamicMonthlySavings.toLocaleString()} / month</span>
                      </div>

                      <div style={{ backgroundColor: "#0f172a", color: "#ffffff", padding: "14px", borderRadius: "16px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "800", color: "#fef08a", textTransform: "uppercase" }}>25-Yr Lifetime Savings</span>
                        <strong style={{ fontSize: "22px", fontWeight: "900", color: "#facc15", display: "block", marginTop: "4px" }}>
                          ₹{dynamicLifetimeSavings.toLocaleString()}
                        </strong>
                        <span style={{ fontSize: "10px", color: "#cbd5e1" }}>With 3% annual tariff escalation</span>
                      </div>
                    </div>

                    {/* Highlights Grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                      <div style={{ backgroundColor: "#fffbeb", border: "1px solid #fef3c7", padding: "12px 16px", borderRadius: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ backgroundColor: "#f59e0b", color: "#fff", width: "36px", height: "36px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Clock size={20} />
                        </div>
                        <div>
                          <span style={{ fontSize: "10px", fontWeight: "700", color: "#92400e", textTransform: "uppercase" }}>ROI Payback</span>
                          <strong style={{ fontSize: "16px", fontWeight: "900", color: "#78350f", display: "block" }}>{dynamicPaybackYears} Years</strong>
                        </div>
                      </div>

                      <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px 16px", borderRadius: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ backgroundColor: "#16a34a", color: "#fff", width: "36px", height: "36px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Leaf size={20} />
                        </div>
                        <div>
                          <span style={{ fontSize: "10px", fontWeight: "700", color: "#166534", textTransform: "uppercase" }}>CO₂ Carbon Offset</span>
                          <strong style={{ fontSize: "16px", fontWeight: "900", color: "#14532d", display: "block" }}>{dynamicCo2Saved.toLocaleString()} kg/yr</strong>
                        </div>
                      </div>

                      <div style={{ backgroundColor: "#ecfdf5", border: "1px solid #a7f3d0", padding: "12px 16px", borderRadius: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ backgroundColor: "#059669", color: "#fff", width: "36px", height: "36px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Trees size={20} />
                        </div>
                        <div>
                          <span style={{ fontSize: "10px", fontWeight: "700", color: "#065f46", textTransform: "uppercase" }}>Trees Planted Equiv.</span>
                          <strong style={{ fontSize: "16px", fontWeight: "900", color: "#047857", display: "block" }}>{dynamicTrees} Trees</strong>
                        </div>
                      </div>
                    </div>

                    {/* Footer Banner */}
                    <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", padding: "12px 20px", borderRadius: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "13px", fontWeight: "700", color: "#334155" }}>
                        Switch to Clean Solar Energy with Arin Energy – Harnessing Sunshine!
                      </span>
                      <span style={{ fontSize: "13px", fontWeight: "800", color: "#16a34a" }}>
                        Book Free Site Survey: +91 7620101758
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SOLAR CLIENT BILL OCR & WEATHER AI ANALYSIS */}
        {activeTab === "solar" && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Upload Card with Health Formula & Benchmark Controls */}
            <Card className="border border-emerald-500/20 bg-white shadow-sm">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-emerald-600" />
                      Upload Solar Client Bill & Real AI Performance Diagnostic
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Extract generation and verify plant health against Arin Energy's 1%/year degradation benchmark formula.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBenchmarkMatrix(!showBenchmarkMatrix)}
                    className="text-xs font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-xl flex items-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    {showBenchmarkMatrix ? "Hide 12-Month Matrix" : "Configure 12-Month Benchmarks (X)"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* 12-Month Benchmarks Matrix (Collapsible) */}
                {showBenchmarkMatrix && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                      <div>
                        <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                          <Sliders className="w-4 h-4 text-emerald-600" />
                          Monthly Generation Benchmark Matrix (X per Month in kWh)
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Set the base expected generation (X) for each calendar month. The analyzer automatically applies 1% degradation per year.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleSaveBenchmarks}
                        disabled={isSavingBenchmarks}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 px-3 rounded-xl flex items-center gap-1.5"
                      >
                        {isSavingBenchmarks ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save Defaults
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 pt-1">
                      {Object.entries(monthlyBenchmarks).map(([month, val]) => (
                        <div key={month} className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
                          <Label className="text-[10px] font-black uppercase text-slate-500 block mb-1">{month}</Label>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={val}
                              onChange={(e) => {
                                const newBM = { ...monthlyBenchmarks, [month]: parseFloat(e.target.value) || 0 };
                                setMonthlyBenchmarks(newBM);
                              }}
                              className="h-8 text-xs font-bold text-center"
                            />
                            <span className="text-[10px] font-bold text-slate-400">kWh</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload Area */}
                <div
                  onDragOver={handleSolarDragOver}
                  onDragEnter={handleSolarDragEnter}
                  onDragLeave={handleSolarDragLeave}
                  onDrop={handleSolarDrop}
                  onClick={() => document.getElementById("quick-bill-upload")?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-200 cursor-pointer ${
                    isDragActiveSolar
                      ? "border-emerald-500 bg-emerald-500/15 shadow-xl ring-4 ring-emerald-500/20 scale-[1.01]"
                      : solarFile
                      ? "border-emerald-400 bg-emerald-50/50 hover:border-emerald-500"
                      : "border-slate-300 hover:border-emerald-500/60 bg-slate-50/60 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="file"
                    id="quick-bill-upload"
                    className="hidden"
                    accept=".pdf, .png, .jpg, .jpeg"
                    onChange={handleSolarFileChange}
                  />
                  <div className="pointer-events-none space-y-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto shadow-inner transition-transform duration-200 ${
                      isDragActiveSolar
                        ? "bg-emerald-600 text-white scale-110 animate-bounce"
                        : solarFile
                        ? "bg-emerald-500 text-white shadow-emerald-500/30"
                        : "bg-emerald-100 text-emerald-600"
                    }`}>
                      {solarFile ? <CheckCircle2 className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {isDragActiveSolar
                          ? "Drop Solar Electricity Bill here for AI Analysis!"
                          : solarFile
                          ? solarFile.name
                          : "Click to select or drag & drop Solar Electricity Bill (PDF/Image)"}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {solarFile
                          ? `${(solarFile.size / 1024).toFixed(1)} KB • Click or drop new file to replace`
                          : "Supports MSEDCL PDF and high-res image formats"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Automatic Health Engine & Fallback Model Indicator */}
                <div className="bg-gradient-to-r from-slate-50 via-emerald-50/40 to-teal-50/40 border border-emerald-200/70 p-4 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-600/10 text-emerald-700 flex items-center justify-center font-bold">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">
                          Automatic Health Diagnosis & Fallback Engine
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Solar age is auto-extracted from database by Consumer ID. No manual parameters required.
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-emerald-800 bg-white px-3 py-1 rounded-full border border-emerald-300 shadow-xs">
                      Formula: Target = (Capacity in kW × X) × [1 − (Solar Age × 1%)]
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                    <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">1. Auto Solar Age</span>
                      <p className="font-bold text-slate-800 mt-0.5">Consumer ID Database Match</p>
                      <span className="text-[10px] text-slate-500">Auto-retrieves commissioning date from customer profile</span>
                    </div>

                    <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">2. Monthly Benchmark (X)</span>
                      <p className="font-bold text-slate-800 mt-0.5">Base Monthly Target</p>
                      <span className="text-[10px] text-slate-500">Loaded from 12-month baseline table (default 100 kWh)</span>
                    </div>

                    <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">3. Fallback Formula Policy</span>
                      <p className="font-bold text-slate-800 mt-0.5">Automated AI → Rule Fallback</p>
                      <span className="text-[10px] text-slate-500">If AI is unreachable, fallback formula runs seamlessly</span>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleAnalyzeSolar}
                  disabled={!solarFile || isAnalyzingSolar}
                  className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 text-white font-bold text-sm uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                >
                  {isAnalyzingSolar ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Analyzing Bill & Running AI Health Diagnosis...
                    </>
                  ) : (
                    <>
                      <Cpu className="w-5 h-5" />
                      Generate Real AI Analysis Report
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Results View & Branded Report Export Container */}
            {solarResult && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* PROMINENT ENGINE SOURCE BANNER: REAL AI VISION vs FALLBACK FORMULA ENGINE */}
                {solarResult.extracted_data.is_ai_extracted && !solarResult.extracted_data.fallback_used ? (
                  <div className="p-4 sm:p-5 rounded-2xl border-2 border-emerald-400 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/5 shadow-md flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30">
                        <Sparkles className="w-6 h-6 animate-pulse" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                            Verified Real AI Vision
                          </span>
                          <span className="text-xs text-slate-500 font-bold">
                            Model: {solarResult.extracted_data.ai_model || "Gemini 3.1 Flash"}
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-black text-slate-900 mt-1 flex items-center gap-2">
                          ✨ Report Generated by Real AI Multimodal Vision
                        </h3>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {solarResult.extracted_data.engine_notice || "Direct multimodal AI vision parsed all readings, billing parameters, and solar degradation."}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white/90 px-3.5 py-2 rounded-xl border border-emerald-200 shadow-xs">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Engine Status</span>
                        <strong className="text-xs font-black text-emerald-700">AI Active & Confirmed</strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 sm:p-5 rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-yellow-500/10 shadow-lg flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-lg shadow-amber-500/30">
                        <AlertTriangle className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                            Fallback Formula Engine Active
                          </span>
                          <span className="text-xs text-amber-800 font-bold">
                            Deterministic Degradation Rule Policy
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-black text-amber-950 mt-1 flex items-center gap-2">
                          ⚠️ Report Generated by Fallback Formula Engine
                        </h3>
                        <p className="text-xs text-amber-900 mt-0.5">
                          {solarResult.extracted_data.engine_notice || "AI Vision was unavailable. System health was accurately calculated using Arin Energy's Fallback Formula: Target = (X) × [1 - (Solar Age × 1%)]."}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white/90 px-3.5 py-2 rounded-xl border border-amber-300 shadow-xs">
                      <Cpu className="w-4 h-4 text-amber-600" />
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Formula Used</span>
                        <strong className="text-xs font-black text-amber-800">Target = (X) × [1 - (Age × 1%)]</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI PLANT HEALTH & DEGRADATION DIAGNOSIS RESULT CARD */}
                <Card className={`border shadow-lg transition-all ${
                  (solarResult.extracted_data.system_health || "POOR").toUpperCase() === "GOOD"
                    ? "border-emerald-500/40 bg-gradient-to-br from-white via-emerald-50/30 to-teal-50/20"
                    : "border-rose-500/40 bg-gradient-to-br from-white via-rose-50/30 to-orange-50/20"
                }`}>
                  <CardContent className="p-6 space-y-6">
                    {/* Header Status Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
                      <div className="flex items-center gap-3.5">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md ${
                          (solarResult.extracted_data.system_health || "POOR").toUpperCase() === "GOOD"
                            ? "bg-emerald-600 text-white"
                            : "bg-rose-600 text-white"
                        }`}>
                          {(solarResult.extracted_data.system_health || "POOR").toUpperCase() === "GOOD" ? (
                            <CheckCircle className="w-7 h-7" />
                          ) : (
                            <AlertTriangle className="w-7 h-7" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                              Arin Energy Plant Diagnosis
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              (solarResult.extracted_data.system_health || "POOR").toUpperCase() === "GOOD"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : "bg-rose-100 text-rose-800 border border-rose-200"
                            }`}>
                              {(solarResult.extracted_data.system_health || "POOR").toUpperCase() === "GOOD" ? "Optimal Performance" : "Attention Required"}
                            </span>
                          </div>
                          <h2 className={`text-2xl font-black tracking-tight ${
                            (solarResult.extracted_data.system_health || "POOR").toUpperCase() === "GOOD"
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }`}>
                            {solarResult.extracted_data.is_ai_extracted ? "AI VERIFIED" : "FALLBACK VERIFIED"} SYSTEM HEALTH: {(solarResult.extracted_data.system_health || "POOR").toUpperCase()}
                          </h2>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border ${
                          solarResult.extracted_data.is_ai_extracted
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : "bg-amber-50 text-amber-800 border-amber-300"
                        }`}>
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          {solarResult.extracted_data.is_ai_extracted ? `Real AI (${solarResult.extracted_data.ai_model || "Gemini 3.1 Flash"})` : "Fallback Formula Engine"}
                        </span>
                        <p className="text-[10px] font-medium text-slate-400 mt-1">
                          Formula: (Capacity × X) × [1 - (Age × 1%)]
                        </p>
                      </div>
                    </div>

                    {/* 4-Stat Mathematical Comparison Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Actual Generation
                        </span>
                        <strong className={`text-xl font-black block mt-1 ${
                          (solarResult.extracted_data.system_health || "POOR").toUpperCase() === "GOOD" ? "text-emerald-600" : "text-rose-600"
                        }`}>
                          {solarResult.extracted_data.generated_electricity || "0 kWh"}
                        </strong>
                        <span className="text-[10px] font-medium text-slate-400">Recorded from MSEDCL meter</span>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Good Health Target
                        </span>
                        <strong className="text-xl font-black text-slate-900 block mt-1">
                          ≥ {solarResult.extracted_data.target_generation_kwh ?? liveTargetGeneration} kWh
                        </strong>
                        <span className="text-[10px] font-medium text-slate-400">
                          {solarResult.extracted_data.capacity ? `Scaled for ${solarResult.extracted_data.capacity} kW plant` : "Degraded threshold"}
                        </span>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Monthly Benchmark (X)
                        </span>
                        <strong className="text-xl font-black text-slate-900 block mt-1">
                          {solarResult.extracted_data.benchmark_x ?? benchmarkXInput} kWh/kW
                        </strong>
                        <span className="text-[10px] font-medium text-slate-400">
                          {solarResult.extracted_data.plant_base_benchmark
                            ? `Plant baseline: ${solarResult.extracted_data.plant_base_benchmark} kWh`
                            : `Baseline: ${Math.round((parseFloat(String(solarResult.extracted_data.capacity || "1"))) * (Number(solarResult.extracted_data.benchmark_x) || 100))} kWh`}
                        </span>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Solar Age & Degradation
                        </span>
                        <strong className="text-xl font-black text-slate-900 block mt-1">
                          {solarResult.extracted_data.plant_age_years ?? solarResult.extracted_data.solar_age_years ?? liveAgeYears} Yrs
                          <span className="text-xs font-bold text-slate-500 ml-1">
                            (-{solarResult.extracted_data.degradation_percent ?? liveDegradationPct}%)
                          </span>
                        </strong>
                        <span className="text-[10px] font-medium text-emerald-700 block truncate" title={solarResult.extracted_data.commissioning_date_source || "From Database"}>
                          {solarResult.extracted_data.commissioning_date
                            ? `DB: ${solarResult.extracted_data.commissioning_date}`
                            : "Auto-extracted by Consumer ID"}
                        </span>
                      </div>
                    </div>

                    {/* AI Diagnostic Reasoning Box */}
                    {solarResult.extracted_data.system_health_reason && (
                      <div className={`p-4 rounded-2xl border text-xs font-medium leading-relaxed ${
                        (solarResult.extracted_data.system_health || "POOR").toUpperCase() === "GOOD"
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-950"
                          : "bg-rose-500/10 border-rose-500/20 text-rose-950"
                      }`}>
                        <strong className="font-bold flex items-center gap-1.5 mb-1 uppercase tracking-wider text-[11px]">
                          <Info className="w-3.5 h-3.5" />
                          AI Diagnostic Analysis & Evaluation:
                        </strong>
                        <p>{solarResult.extracted_data.system_health_reason}</p>
                      </div>
                    )}

                    {/* AI Engineering Advice & Maintenance Recommendation */}
                    {solarResult.extracted_data.ai_recommendation && (
                      <div className="p-4 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 to-purple-50/60 text-indigo-950 text-xs font-medium leading-relaxed">
                        <strong className="font-bold flex items-center gap-1.5 mb-1 uppercase tracking-wider text-[11px] text-indigo-900">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                          AI Engineering & Maintenance Recommendation:
                        </strong>
                        <p>{solarResult.extracted_data.ai_recommendation}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                {/* EXPORT BUTTONS ACTION BAR */}
                <Card className="border border-emerald-500/30 bg-gradient-to-r from-slate-900 to-emerald-950 text-white shadow-xl">
                  <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-black flex items-center gap-2 text-emerald-400">
                        <FileCheck className="w-5 h-5 text-emerald-400" />
                        Export AI Bill Analysis Report
                      </h3>
                      <p className="text-xs text-slate-300 mt-1">
                        Select an option to download report only or complete report with attached utility bill.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {/* CTA 1: Download Report Only */}
                      <DropdownMenu>
                        <div className="inline-flex rounded-xl shadow-lg shadow-emerald-600/20 overflow-hidden border border-emerald-500/40">
                          <Button
                            onClick={() => handleExportReportOnly("pdf")}
                            disabled={isExporting}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-none flex items-center gap-2 border-r border-emerald-500/50"
                            title="Download 1-page visual report as PDF"
                          >
                            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                            Download Report Only
                          </Button>
                          <DropdownMenuTrigger asChild>
                            <Button
                              disabled={isExporting}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-3 rounded-none flex items-center justify-center transition-colors"
                              title="Select format: PDF or Image (.png)"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                        </div>
                        <DropdownMenuContent align="end" className="w-52 bg-slate-900 border-slate-800 text-white shadow-2xl p-1.5">
                          <DropdownMenuItem
                            onClick={() => handleExportReportOnly("pdf")}
                            className="hover:bg-slate-800 focus:bg-slate-800 cursor-pointer text-xs font-bold py-2.5 px-3 rounded-lg flex items-center gap-2.5 text-slate-200"
                          >
                            <FileText className="w-4 h-4 text-emerald-400" />
                            Download as PDF (.pdf)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleExportReportOnly("png")}
                            className="hover:bg-slate-800 focus:bg-slate-800 cursor-pointer text-xs font-bold py-2.5 px-3 rounded-lg flex items-center gap-2.5 text-slate-200"
                          >
                            <ImageIcon className="w-4 h-4 text-emerald-400" />
                            Download as Image (.png)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* CTA 2: Download Report with Attached Section */}
                      <Button
                        onClick={handleExportReportWithAttached}
                        disabled={isExporting}
                        className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:opacity-90 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl flex items-center gap-2 shadow-lg shadow-teal-600/20 border border-teal-400/30"
                        title="Download 2-page report PDF with original utility bill attached"
                      >
                        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Download Report with Attached Section
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Weather AI Integration Banner */}
                <Card className="border border-amber-500/20 bg-gradient-to-r from-amber-50 to-orange-50">
                  <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-md">
                        <CloudSun className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                          Past Month Weather AI Performance Breakdown
                        </h3>
                        <p className="text-xs text-slate-600 font-semibold mt-0.5">
                          Condition: <strong className="text-amber-800">{solarResult.weather_ai_analysis.weather_condition}</strong>
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-right">
                      <div className="bg-white/80 p-3 rounded-xl border">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Solar Irradiance</span>
                        <strong className="text-lg font-black text-slate-800">
                          {solarResult.weather_ai_analysis.avg_solar_irradiance_kwh_m2} kWh/m²
                        </strong>
                      </div>
                      <div className="bg-white/80 p-3 rounded-xl border">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Performance Score</span>
                        <strong className="text-lg font-black text-emerald-600">
                          {solarResult.weather_ai_analysis.performance_score}
                        </strong>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* VISUAL ARIN ENERGY BRANDED REPORT CARD (REF FOR EXPORT) */}
                {mappedBillData && (
                  <div className="space-y-6">
                    <div className="overflow-x-auto pb-4 flex justify-center bg-slate-200/50 p-6 rounded-3xl border border-slate-300/50">
                      <BillPreview
                        ref={reportRef}
                        billData={mappedBillData}
                        selectedDate={new Date()}
                      />
                    </div>

                    {/* MSEDCL Detailed Meter Readings & 12-Month History Card */}
                    {(solarResult?.extracted_data?.meter_readings || (solarResult?.extracted_data?.past_year_history && solarResult.extracted_data.past_year_history.length > 0)) && (
                      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 animate-in slide-in-from-bottom-4 transition-all">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-100 pb-4 mb-5">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider">
                                MSEDCL Official Meter Readings & Historical Breakdown
                              </h3>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Extracted directly from MSEDCL Bill • Consumer No: <strong className="font-mono text-slate-700">{solarResult.extracted_data.consumer_number}</strong> • Reading Date: <strong>{solarResult.extracted_data.reading_date}</strong> • Billing Date: <strong>{solarResult.extracted_data.billing_date}</strong>
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold">
                              Bank Solar Units: {solarResult.extracted_data.current_banked_unit || calculatedBanked}
                            </span>
                            <span className="px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold">
                              Prev Bank Units: {solarResult.extracted_data.previous_banked_unit || rawPrevBanked}
                            </span>
                          </div>
                        </div>

                        {/* 1. Meter Readings Table */}
                        {solarResult.extracted_data.meter_readings && (
                          <div className="mb-6">
                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 mb-2.5 flex items-center gap-2">
                              <Activity className="w-3.5 h-3.5 text-emerald-600" />
                              Current & Previous Month Meter Readings
                            </h4>
                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                                  <tr>
                                    <th className="px-4 py-3">Reading Parameter</th>
                                    <th className="px-4 py-3 text-right">चालू रिडिंग (Current)</th>
                                    <th className="px-4 py-3 text-right">मागील रिडिंग (Previous)</th>
                                    <th className="px-4 py-3 text-center">MF</th>
                                    <th className="px-4 py-3 text-right">आकारणी युनिट (Consumption)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-medium">
                                  <tr className="hover:bg-slate-50/70 transition-colors">
                                    <td className="px-4 py-2.5 font-bold text-slate-800 flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                      Net Import (आयात)
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-700">{solarResult.extracted_data.meter_readings.import.current}</td>
                                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">{solarResult.extracted_data.meter_readings.import.previous}</td>
                                    <td className="px-4 py-2.5 text-center font-mono text-slate-500">{solarResult.extracted_data.meter_readings.import.mf}</td>
                                    <td className="px-4 py-2.5 text-right font-mono font-bold text-blue-600">{solarResult.extracted_data.meter_readings.import.consumption} kWh</td>
                                  </tr>
                                  <tr className="hover:bg-slate-50/70 transition-colors">
                                    <td className="px-4 py-2.5 font-bold text-slate-800 flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                      Net Export (निर्यात)
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-700">{solarResult.extracted_data.meter_readings.export.current}</td>
                                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">{solarResult.extracted_data.meter_readings.export.previous}</td>
                                    <td className="px-4 py-2.5 text-center font-mono text-slate-500">{solarResult.extracted_data.meter_readings.export.mf}</td>
                                    <td className="px-4 py-2.5 text-right font-mono font-bold text-orange-600">{solarResult.extracted_data.meter_readings.export.consumption} kWh</td>
                                  </tr>
                                  <tr className="hover:bg-emerald-50/40 bg-emerald-50/20 transition-colors">
                                    <td className="px-4 py-2.5 font-bold text-emerald-950 flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                      Solar Generation (सौर ऊर्जा निर्मिती)
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-800">{solarResult.extracted_data.meter_readings.generation.current}</td>
                                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">{solarResult.extracted_data.meter_readings.generation.previous}</td>
                                    <td className="px-4 py-2.5 text-center font-mono text-slate-500">{solarResult.extracted_data.meter_readings.generation.mf}</td>
                                    <td className="px-4 py-2.5 text-right font-mono font-black text-emerald-700">{solarResult.extracted_data.meter_readings.generation.consumption} kWh</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* 2. 12-Month Energy History Table */}
                        {solarResult.extracted_data.past_year_history && solarResult.extracted_data.past_year_history.length > 0 && (
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 mb-2.5 flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-amber-600" />
                              Past 12-Month Generation & Consumption History
                            </h4>
                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                                  <tr>
                                    <th className="px-4 py-2.5">Month</th>
                                    <th className="px-4 py-2.5 text-right">Import Units (IMP)</th>
                                    <th className="px-4 py-2.5 text-right">Export Units (EXP)</th>
                                    <th className="px-4 py-2.5 text-right">Generation Units (GEN)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-mono">
                                  {solarResult.extracted_data.past_year_history.map((h: any, i: number) => (
                                    <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                                      <td className="px-4 py-2 font-sans font-bold text-slate-800">{h.month}</td>
                                      <td className="px-4 py-2 text-right text-blue-600 font-bold">{h.import_units}</td>
                                      <td className="px-4 py-2 text-right text-orange-600 font-bold">{h.export_units}</td>
                                      <td className="px-4 py-2 text-right text-emerald-600 font-black">{h.generation_units}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
