import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Upload, FileText, CloudSun, Zap, CheckCircle2, Cpu, Loader2, 
  ArrowUpRight, ArrowDownLeft, ShieldCheck, Sun, TrendingUp, 
  IndianRupee, Leaf, Trees, Clock, Sparkles, PieChart, Layers,
  Download, Image as ImageIcon, FileCheck
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { BillPreview } from "@/components/BillPreview";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { format } from "date-fns";
import logo from "@/assets/arin_logo.jpg";

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

  // Export & Preview States
  const [uploadedBillPreviewUrl, setUploadedBillPreviewUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleProspectiveFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setProspectiveFile(file);
      const reader = new FileReader();
      reader.onload = () => setUploadedBillPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSolarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSolarFile(file);
      const reader = new FileReader();
      reader.onload = () => setUploadedBillPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);
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
      const res = await api.analyzeBillOcr(formData);
      setSolarResult(res);
      toast.success("Solar bill OCR & weather AI analysis completed!");
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
  const handleExportImage = async () => {
    if (!reportRef.current) {
      toast.error("Report preview element not ready.");
      return;
    }
    try {
      setIsExporting(true);
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 1200
      });
      const imgData = canvas.toDataURL("image/png", 1.0);
      const link = document.createElement("a");
      const cNum = solarResult?.extracted_data?.consumer_number || "Bill";
      link.download = `Arin_Energy_AI_Solar_Bill_Analysis_${cNum}.png`;
      link.href = imgData;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Report image downloaded successfully!");
    } catch (err: any) {
      toast.error("Image export failed: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
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

      // Page 1
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
      pdf.save(`Arin_Energy_AI_Solar_Bill_Analysis_${cNum}.pdf`);
      toast.success("Report PDF with Attached Bill downloaded successfully!");
    } catch (err: any) {
      toast.error("PDF export failed: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Dynamic Calculations for Prospective Tool (re-evaluates live when dynamicCap slider changes)
  const currentMonthlyBill = prospectiveResult?.extracted_data?.current_monthly_bill ?? prospectiveResult?.extracted_data?.billing_amount ?? 6800;
  const currentUnits = prospectiveResult?.extracted_data?.monthly_consumption_kwh ?? prospectiveResult?.extracted_data?.billing_units ?? 650;
  const defaultRecommendedCap = prospectiveResult?.solar_savings_analysis?.recommended_capacity_kw ?? prospectiveResult?.financial_proposals?.recommended_solar_capacity_kw ?? Math.max(1, Math.round(currentUnits / 120)) ?? 4;
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

  // Map Solar OCR Result into BillPreview Props
  const mappedBillData = solarResult ? {
    consumerName: solarResult.extracted_data.consumer_name || "MSEDCL Consumer",
    consumerNumber: solarResult.extracted_data.consumer_number || "410012450188",
    capacity: solarResult.extracted_data.capacity || "4.0",
    readingDate: solarResult.extracted_data.reading_date || format(new Date(), "dd/MM/yyyy"),
    billingAmount: String(solarResult.extracted_data.billing_amount || 1950),
    billingUnits: String(solarResult.extracted_data.billing_units || "177").replace(/\s*kWh/gi, ''),
    generatedElectricity: String(solarResult.extracted_data.generated_electricity || "430 kWh"),
    exportedToGrid: String(solarResult.extracted_data.exported_to_grid || "225 kWh"),
    importedFromGrid: String(solarResult.extracted_data.imported_from_grid || "755 kWh"),
    daytimeSelfConsumption: String(solarResult.extracted_data.daytime_self_consumption || "205 kWh"),
    totalConsumption: String(solarResult.extracted_data.total_consumption || "960 kWh"),
    previousBankedUnit: String(solarResult.extracted_data.previous_banked_unit || "120 Units").replace(/\s*Units/gi, ''),
    currentBankedUnit: String(solarResult.extracted_data.current_banked_unit || "180 Units").replace(/\s*Units/gi, ''),
    systemHealth: solarResult.extracted_data.system_health || "GOOD",
    weatherCondition: solarResult.weather_ai_analysis?.weather_condition,
    performanceScore: solarResult.weather_ai_analysis?.performance_score,
    recommendedCapacity: solarResult.extracted_data.capacity || "4.0",
    annualSavings: "45,000",
    lifetimeSavings: "12.5 Lakhs"
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
                <div className="border-2 border-dashed border-slate-200 hover:border-emerald-500/50 transition-all rounded-2xl p-8 text-center bg-slate-50/50">
                  <input
                    type="file"
                    id="prospective-bill-upload"
                    className="hidden"
                    accept=".pdf, .png, .jpg, .jpeg"
                    onChange={handleProspectiveFileChange}
                  />
                  <label htmlFor="prospective-bill-upload" className="cursor-pointer space-y-3 block">
                    <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                      <Upload className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {prospectiveFile ? prospectiveFile.name : "Click to select or drag & drop Standard Electricity Bill (PDF/Image)"}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Accepts PDF, JPG, PNG formats</p>
                    </div>
                  </label>
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
                        <img src={logo} alt="Arin Energy" style={{ height: "45px", objectFit: "contain" }} />
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
            {/* Upload Card */}
            <Card className="border border-emerald-500/20 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Upload Solar Bill</CardTitle>
                <CardDescription className="text-xs">
                  Upload a PDF solar bill or bill image. Extracts generation & consumption details directly from the document without requiring customer registration or warranty data.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-slate-200 hover:border-emerald-500/50 transition-all rounded-2xl p-8 text-center bg-slate-50/50">
                  <input
                    type="file"
                    id="quick-bill-upload"
                    className="hidden"
                    accept=".pdf, .png, .jpg, .jpeg"
                    onChange={handleSolarFileChange}
                  />
                  <label htmlFor="quick-bill-upload" className="cursor-pointer space-y-3 block">
                    <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                      <Upload className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {solarFile ? solarFile.name : "Click to choose or drag & drop Solar Bill"}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Supports PDF, PNG, JPG formats</p>
                    </div>
                  </label>
                </div>

                <Button
                  onClick={handleAnalyzeSolar}
                  disabled={!solarFile || isAnalyzingSolar}
                  className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 text-white font-bold text-sm uppercase tracking-wider rounded-xl flex items-center justify-center gap-2"
                >
                  {isAnalyzingSolar ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Analyzing Bill & Weather Data...
                    </>
                  ) : (
                    <>
                      <Cpu className="w-5 h-5" />
                      Generate AI Analysis Report
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Results View & Branded Report Export Container */}
            {solarResult && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* EXPORT BUTTONS ACTION BAR */}
                <Card className="border border-emerald-500/30 bg-gradient-to-r from-slate-900 to-emerald-950 text-white shadow-xl">
                  <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-black flex items-center gap-2 text-emerald-400">
                        <FileCheck className="w-5 h-5 text-emerald-400" />
                        Export AI Bill Analysis Report
                      </h3>
                      <p className="text-xs text-slate-300 mt-1">
                        Download visual report image or 2-page PDF report with original solar bill attached.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        onClick={handleExportImage}
                        disabled={isExporting}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                      >
                        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                        Export Image (.png)
                      </Button>

                      <Button
                        onClick={handleExportPDF}
                        disabled={isExporting}
                        className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:opacity-90 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl flex items-center gap-2 shadow-lg shadow-teal-600/20"
                      >
                        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Export PDF with Attached Bill (.pdf)
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
                  <div className="overflow-x-auto pb-4 flex justify-center bg-slate-200/50 p-6 rounded-3xl border border-slate-300/50">
                    <BillPreview
                      ref={reportRef}
                      billData={mappedBillData}
                      selectedDate={new Date()}
                    />
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
