import { useState, useRef, useCallback, useEffect } from 'react';
import { GenerationControls } from '@/components/GenerationControls';
import { BillPreview } from '@/components/BillPreview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Zap, Users, Eye, DownloadCloud, ArrowRight, CheckCircle2, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import {
    CalculatedBillData,
    calculateBillData
} from '@/lib/billCalculations';
import { toast } from '@/hooks/use-toast';
import { Progress } from "@/components/ui/progress";
import { Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const downloadCSVClient = (data: any[], filename: string) => {
    if (!data) data = [];
    const headers = ["Consumer Number", "Consumer Name", "Arin ID", "Generation", "Capacity (kW)"];
    const rows = data.map(item => [
        item.consumer_no || "",
        item.consumer_name || "",
        item.arin_id || "",
        item.generated ?? 0,
        item.capacity ?? 0
    ]);
    const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(val => typeof val === 'string' && val.includes(',') ? `"${val}"` : val).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const downloadXLSXClient = (data: any[], filename: string) => {
    if (!data) data = [];
    if (data.length === 0) {
        data = [{ "Consumer Number": "", "Consumer Name": "", "Arin ID": "", "Generation": 0, "Capacity (kW)": 0, "Export": 0 }];
    }
    const worksheet = XLSX.utils.json_to_sheet(data.map(item => ({
        "Consumer Number": item.consumer_no || "",
        "Consumer Name": item.consumer_name || "",
        "Arin ID": item.arin_id || "",
        "Generation": item.generated ?? 0,
        "Capacity (kW)": item.capacity ?? 0,
        "Export": item.export ?? 0
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    XLSX.writeFile(workbook, filename);
};

const downloadPDFClient = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(filename.replace(".pdf", "").replace(/_/g, " ").toUpperCase(), 14, 15);
    
    const headers = [["Arin ID", "Consumer Number", "Consumer Name", "Generation", "Capacity (kW)", "Export"]];
    const rows = data.map(item => [
        item.arin_id || "",
        item.consumer_no || "",
        item.consumer_name || "",
        item.generated ?? 0,
        item.capacity ?? 0,
        item.export ?? 0
    ]);
    
    autoTable(doc, {
        startY: 22,
        head: headers,
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [13, 148, 136] }, // arin-teal
        styles: { fontSize: 8 }
    });
    
    doc.save(filename);
};

export default function ArinBillGenerator() {
    const [dbConsumers, setDbConsumers] = useState<any[]>([]);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [selectedConsumer, setSelectedConsumer] = useState<any | null>(null);
    const [billData, setBillData] = useState<CalculatedBillData | null>(null);
    const [selectedForDownload, setSelectedForDownload] = useState<any[]>([]);
    const [externalSelectedId, setExternalSelectedId] = useState<string | undefined>();
    const [isFetchingPreview, setIsFetchingPreview] = useState(false);
    const [isBulkDownloading, setIsBulkDownloading] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
    const [showEditorSidebar, setShowEditorSidebar] = useState(true);
    const [isGeneratingSingle, setIsGeneratingSingle] = useState(false);
    const [zoomScale, setZoomScale] = useState(1);
    const previewWrapperRef = useRef<HTMLDivElement>(null);
    const billPreviewRef = useRef<HTMLDivElement>(null);

    const uiPhase: "SETUP" | "PREVIEW" | "GENERATING" =
        isBulkDownloading
            ? "GENERATING"
            : selectedConsumer
                ? "PREVIEW"
                : "SETUP";

    useEffect(() => {
        const handleResize = () => {
            if (previewWrapperRef.current) {
                const containerWidth = previewWrapperRef.current.clientWidth - 48; // Padding offset
                const scale = Math.min(1, containerWidth / 1200);
                setZoomScale(scale);
            }
        };
        handleResize();
        const timer = setTimeout(handleResize, 150); // Short delay for sidebar animations
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(timer);
        };
    }, [showEditorSidebar, billData]);

    useEffect(() => {
        const fetchConsumers = async () => {
            try {
                const data = await api.getBills();
                const unique = new Map();
                data.forEach((b: any) => {
                    if (!unique.has(b.consumer_number)) {
                        unique.set(b.consumer_number, {
                            id: b.consumer_number,
                            consumerNumber: b.consumer_number,
                            name: b.customer_name || b.consumer_name || "N/A",
                            capacity: b.capacity,
                            comm_date: b.commission_date,
                            panel_name: b.panel_name || 'Other',
                            inverter_name: b.inverter_name || 'Other',
                            arin_id: b.arin_id || ""
                        });
                    }
                });
                setDbConsumers(Array.from(unique.values()));
            } catch (e) {
                console.error("Failed to fetch consumers", e);
            }
        };
        fetchConsumers();
    }, []);

    const handleGenerate = useCallback((consumer: any, inputs: any) => {
        if (inputs.generatedElectricity === 0) {
            toast({
                title: "Bill Generation Skipped",
                description: `Solar generation is 0 for ${inputs.consumerName || consumer.name}. Bill generation is restricted.`,
                variant: "destructive"
            });
            setBillData(null);
            return;
        }

        const calculated = calculateBillData(inputs, consumer);
        setSelectedConsumer(consumer);
        setBillData(calculated);
        toast({
            title: "Bill Generated",
            description: `Preview generated for ${inputs.consumerName || consumer.name}`,
        });
    }, []);

    const handleDownloadImage = useCallback(async () => {
        if (!billPreviewRef.current || !billData) {
            toast({
                title: "Error",
                description: "Please generate a bill preview first",
                variant: "destructive",
                className: "font-bold shadow-xl"
            });
            return;
        }

        setIsGeneratingSingle(true);
        const element = billPreviewRef.current;
        const parent = element?.parentElement;
        let originalTransform = '';
        let originalMarginBottom = '';
        if (parent) {
            originalTransform = parent.style.transform;
            originalMarginBottom = parent.style.marginBottom;
            parent.style.transform = 'none';
            parent.style.marginBottom = '0px';
        }

        try {
            const canvas = await html2canvas(element, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false,
                width: 1200,
                scrollX: 0,
                scrollY: 0,
                windowWidth: 1200,
            });

            const base64Image = canvas.toDataURL('image/jpeg', 1.0);
            
            // 1. Local Download
            const link = document.createElement('a');
            link.download = `bill-${billData.consumerNumber}-${selectedDate.getMonth() + 1}-${selectedDate.getFullYear()}.jpg`;
            link.href = base64Image;
            link.click();

            // 2. Google Drive Save
            toast({
                title: "Uploading to Drive",
                description: "Saving this bill to your Google Drive folder...",
                className: "font-semibold shadow-md"
            });
            
            const dayStr = format(selectedDate, 'yyyy-MM-dd');
            const res = await api.saveBillImage(billData.consumerNumber, dayStr, base64Image);
            
            toast({
                title: "Saved",
                description: res.message || "Bill image has been saved to Drive.",
                className: "bg-green-600 text-white font-bold border-none shadow-2xl"
            });
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || "Failed to process image save",
                variant: "destructive",
                className: "font-bold shadow-xl"
            });
        } finally {
            if (parent) {
                parent.style.transform = originalTransform;
                parent.style.marginBottom = originalMarginBottom;
            }
            setIsGeneratingSingle(false);
        }
    }, [billData, selectedDate]);

    const exportList = (list: any[], filename: string) => {
        if (list.length === 0) return;

        // 1. Export CSV
        const csvContent = "Consumer Number,Consumer Name\n" + 
            list.map(item => `"${item.number}","${item.name}"`).join("\n");
        const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const csvUrl = URL.createObjectURL(csvBlob);
        const csvLink = document.createElement("a");
        csvLink.setAttribute("href", csvUrl);
        csvLink.setAttribute("download", `${filename}.csv`);
        csvLink.click();

        // 2. Export Excel
        const ws = XLSX.utils.json_to_sheet(list.map(i => ({ "Consumer Number": i.number, "Consumer Name": i.name })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Consumers");
        XLSX.writeFile(wb, `${filename}.xlsx`);

        // 3. Export PDF
        const doc = new jsPDF();
        doc.text(filename.replace(/_/g, ' ').toUpperCase(), 14, 15);
        autoTable(doc, {
            startY: 20,
            head: [['Consumer Number', 'Consumer Name']],
            body: list.map(item => [item.number, item.name]),
        });
        doc.save(`${filename}.pdf`);
    };

    const handleDownloadAllImages = useCallback(async (selectedIds: string[]) => {
        if (!selectedIds.length) return;
        
        setIsBulkDownloading(true);
        setBatchProgress({ current: 0, total: selectedIds.length });
        const dayStr = format(selectedDate, 'yyyy-MM-dd');
        const monthStr = format(selectedDate, 'MMM-yyyy').toUpperCase();
        
        toast({
            title: "Automated Batch Started",
            description: `Gathering data and generating ${selectedIds.length} bills. Please wait...`,
            duration: 5000,
        });

        const zeroGenList: any[] = [];
        const poorStatusList: any[] = [];
        const genLessThanExportList: any[] = [];
        const genEqualToExportList: any[] = [];
        const billAmtGreaterThan1000List: any[] = [];
        let successCount = 0;
        let processedCount = 0;

        try {
            for (const targetId of selectedIds) {
                processedCount++;
                
                // Fetch the latest analysis data for this targetId and month
                let targetData;
                try {
                    targetData = await api.getBillingAnalysis(targetId, monthStr);
                } catch (e) {
                    console.error(`Failed to fetch analysis for ${targetId}`, e);
                    continue; // Skip if analysis fetch fails
                }

                // Map/Fallback logic identical to GenerationControls fetchDataAndGenerate
                const formatDate = (dateStr: string) => {
                    if (!dateStr || dateStr === 'N/A') return format(selectedDate, 'dd/MM/yy');
                    if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) {
                        const [y, m, d] = dateStr.split('T')[0].split('-');
                        return `${d}/${m}/${y.slice(2)}`;
                    }
                    return dateStr;
                };

                const consumer = dbConsumers.find(c => c.consumerNumber === targetId) || {
                    id: targetId,
                    consumerNumber: targetId,
                    name: targetData.customer_name || `Consumer ${targetId}`,
                    capacity: targetData.capacity || 0,
                };

                const rawInputs = {
                    arin_id: targetData.arin_id || consumer.arin_id || "",
                    consumerName: targetData.customer_name || consumer.name || "N/A",
                    consumerNumber: targetData.consumer_number || targetId,
                    readingDate: formatDate(targetData.reading_date),
                    generatedElectricity: targetData.generated || 0,
                    exportedToGrid: targetData.export || 0,
                    importedFromGrid: targetData.import || 0,
                    billingAmount: targetData.amount || 0,
                    previousBankedUnit: targetData.prev_banked || 0,
                    currentBankedUnit: targetData.curr_banked || 0,
                    commissioningDate: formatDate(targetData.commission_date || consumer.comm_date),
                    capacity: parseFloat(targetData.capacity || consumer.capacity) || 0,
                    systemHealth: targetData.system_health || 'GOOD',
                    billStatus: targetData.bill_status || 'Normal',
                    panel_name: targetData.panel_name || consumer.panel_name || 'Other',
                    inverter_name: targetData.inverter_name || consumer.inverter_name || 'Other',
                    panelWarranty: '',
                    systemWarranty: '',
                    inverterWarranty: '',
                };

                const calculated = calculateBillData(rawInputs as any, consumer as any);
                
                // Compare generation to export
                if (rawInputs.generatedElectricity < rawInputs.exportedToGrid) {
                    genLessThanExportList.push({
                        consumer_no: targetId,
                        consumer_name: rawInputs.consumerName,
                        arin_id: targetData.arin_id || consumer.arin_id || "",
                        generated: rawInputs.generatedElectricity,
                        capacity: rawInputs.capacity,
                        export: rawInputs.exportedToGrid
                    });
                } else if (rawInputs.generatedElectricity === rawInputs.exportedToGrid) {
                    genEqualToExportList.push({
                        consumer_no: targetId,
                        consumer_name: rawInputs.consumerName,
                        arin_id: targetData.arin_id || consumer.arin_id || "",
                        generated: rawInputs.generatedElectricity,
                        capacity: rawInputs.capacity,
                        export: rawInputs.exportedToGrid
                    });
                }

                // Bill Amount > 1000 Rs Filter
                if (rawInputs.billingAmount > 1000) {
                    billAmtGreaterThan1000List.push({
                        consumer_no: targetId,
                        consumer_name: rawInputs.consumerName,
                        arin_id: targetData.arin_id || consumer.arin_id || "",
                        generated: rawInputs.generatedElectricity,
                        capacity: rawInputs.capacity,
                        export: rawInputs.exportedToGrid,
                        amount: rawInputs.billingAmount
                    });
                }

                // 1. ZERO GENERATION FILTER (STRICT - using internal raw input)
                if (rawInputs.generatedElectricity === 0) {
                    zeroGenList.push({ 
                        consumer_no: targetId, 
                        consumer_name: rawInputs.consumerName,
                        arin_id: targetData.arin_id || consumer.arin_id || "",
                        generated: 0,
                        capacity: rawInputs.capacity
                    });
                    
                    // Rule: Record to DB but skip image generation
                    try {
                        await api.saveBillData(rawInputs);
                    } catch (e) {
                        console.error("Failed to record zero gen to DB", e);
                    }
                    
                    continue; // Skip bill generation exactly as requested
                }

                // 2. POOR STATUS FILTER (REQUIRED - generate but list)
                if (calculated.systemHealth === 'POOR' || rawInputs.billStatus === 'POOR') {
                    poorStatusList.push({ 
                        consumer_no: targetId, 
                        consumer_name: rawInputs.consumerName,
                        arin_id: targetData.arin_id || consumer.arin_id || "",
                        generated: rawInputs.generatedElectricity,
                        capacity: rawInputs.capacity
                    });
                }

                // Update Preview State and capture screenshot
                setSelectedConsumer(consumer);
                setBillData(calculated);

                await new Promise(r => setTimeout(r, 600));

                if (billPreviewRef.current) {
                    const element = billPreviewRef.current;
                    const parent = element.parentElement;
                    let originalTransform = '';
                    let originalMarginBottom = '';
                    if (parent) {
                        originalTransform = parent.style.transform;
                        originalMarginBottom = parent.style.marginBottom;
                        parent.style.transform = 'none';
                        parent.style.marginBottom = '0px';
                    }
                    try {
                        const canvas = await html2canvas(element, { 
                            scale: 2, 
                            useCORS: true,
                            logging: false,
                            width: 1200,
                            scrollX: 0,
                            scrollY: 0,
                            windowWidth: 1200,
                        });
                        const base64Image = canvas.toDataURL('image/jpeg', 1.0);
                        await api.saveBillImage(targetId, dayStr, base64Image);
                        successCount++;
                    } finally {
                        if (parent) {
                            parent.style.transform = originalTransform;
                            parent.style.marginBottom = originalMarginBottom;
                        }
                    }
                }

                // Update real-time progress state
                setBatchProgress(prev => ({ ...prev, current: processedCount }));
            }

            // ── 3. AUTOMATED REPORT PERSISTENCE (Rule #1 & #2) ──
            // Always create/update reports in the background on the server
            // identifying them as csv/xlsx format specifically, even if empty
            await api.saveReports("zero_generation_consumers.csv", zeroGenList, dayStr);
            
            await api.saveReports("poor_consumers.csv", poorStatusList, dayStr);
            
            await api.saveReports(`generation_less_than_export.xlsx`, genLessThanExportList, dayStr);
            
            await api.saveReports(`generation_equal_to_export.xlsx`, genEqualToExportList, dayStr);
            
            await api.saveReports("bill_amount_greater_than_1000.xlsx", billAmtGreaterThan1000List, dayStr);

            // ── 4. COMPLETION SUMMARY POPUP (User Request) ──
            toast({
                title: "🔥 Batch Process Complete",
                description: (
                    <div className="space-y-1">
                        <p className="font-bold text-green-600 underline">Client Summary:</p>
                        <ul className="text-xs list-disc pl-4">
                            <li>Total Analyzed: {selectedIds.length}</li>
                            <li>Saved to Drive: {successCount}</li>
                            <li>Skipped (Zero Gen): {zeroGenList.length}</li>
                            <li>Poor Progress: {poorStatusList.length}</li>
                            <li>Gen &lt; Export: {genLessThanExportList.length}</li>
                            <li>Gen = Export: {genEqualToExportList.length}</li>
                            <li>Bill &gt; 1000 Rs: {billAmtGreaterThan1000List.length}</li>
                        </ul>
                        <p className="text-[9px] pt-1 italic opacity-70 border-t mt-1">
                            Files saved on Desktop/arin/{dayStr}/reports/
                        </p>
                    </div>
                ),
                duration: 9000, // Persistent for client visibility 
            });
        } catch (e) {
            console.error("Batch processing error", e);
            toast({
                title: "Batch Failure",
                description: "An error occurred during automated generation.",
                variant: "destructive"
            });
        } finally {
            setIsBulkDownloading(false);
        }
    }, [selectedDate, dbConsumers]);

    return (
        <div className="min-h-screen bg-transparent p-4 lg:p-8 animate-in fade-in duration-700 relative">
            {isBulkDownloading && (
                <div className="fixed top-0 left-0 w-full z-[100] bg-white/95 backdrop-blur-md border-b-2 border-arin-teal/20 p-4 shadow-xl animate-in slide-in-from-top duration-500">
                    <div className="max-w-xl mx-auto space-y-3">
                        <div className="flex justify-between items-end">
                            <div className="space-y-1">
                                <span className="flex items-center gap-2 text-xs font-black uppercase text-arin-teal tracking-tighter">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Automated Batch Finalizing
                                </span>
                                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    Analysis & Google Drive Archival
                                </h3>
                            </div>
                            <div className="text-right">
                                <span className="text-2xl font-black tabular-nums text-slate-800 tracking-tighter">
                                    {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                                </span>
                                <p className="text-[9px] font-black uppercase text-slate-400">
                                    {batchProgress.current} / {batchProgress.total} Bills Saved
                                </p>
                            </div>
                        </div>
                        <Progress 
                            value={batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0} 
                            className="h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200"
                        />
                    </div>
                </div>
            )}
            {/* Header */}
            <div className="mb-8 border-b border-border/10 pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-black tracking-tighter text-foreground bg-clip-text text-transparent bg-gradient-to-r from-arin-orange to-arin-teal">
                        Bill Analysis Generation
                    </h1>
                    <p className="text-muted-foreground mt-1 font-medium">
                        Analyze and generate visual reports for consumer solar journeys.
                    </p>
                </div>
                <Button
                    onClick={() => setShowEditorSidebar(!showEditorSidebar)}
                    variant="outline"
                    className="rounded-xl border-2 border-arin-teal text-arin-teal hover:bg-arin-teal/5 font-black uppercase text-xs h-10 px-4 shadow-sm"
                >
                    {showEditorSidebar ? "Hide Editor" : "Show Editor"}
                </Button>
            </div>

            {/* Step Breadcrumb Indicator */}
            <div className="flex items-center gap-1 mb-6 bg-white/60 backdrop-blur-sm border border-white/30 rounded-2xl px-5 py-3 shadow-sm w-fit">
                {[
                    { key: "SETUP", label: "Select Consumers", icon: Users },
                    { key: "PREVIEW", label: "Review & Edit", icon: Eye },
                    { key: "GENERATING", label: "Generate", icon: DownloadCloud },
                ].map((step, idx, arr) => {
                    const phases = ["SETUP", "PREVIEW", "GENERATING"];
                    const currentIdx = phases.indexOf(uiPhase);
                    const stepIdx = phases.indexOf(step.key);
                    const isActive = step.key === uiPhase;
                    const isDone = stepIdx < currentIdx;
                    const Icon = step.icon;
                    return (
                        <div key={step.key} className="flex items-center gap-1">
                            <div
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                    isActive
                                        ? "bg-arin-teal text-white shadow-md shadow-arin-teal/20"
                                        : isDone
                                            ? "bg-green-50 text-green-600 border border-green-200"
                                            : "text-slate-400 bg-slate-50 border border-slate-100"
                                )}
                            >
                                {isDone ? (
                                    <CheckCircle2 className="w-3 h-3" />
                                ) : (
                                    <Icon className="w-3 h-3" />
                                )}
                                <span className="hidden sm:inline">{step.label}</span>
                            </div>
                            {idx < arr.length - 1 && (
                                <ArrowRight className="w-3 h-3 text-slate-300 mx-0.5" />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Main Content Sections - Side-by-Side Flex Layout */}
            <div className="flex flex-col lg:flex-row gap-8 items-start">
                {/* Section 1 - Controls (Editor Sidebar) */}
                {showEditorSidebar && (
                    <div className="w-full lg:w-[420px] shrink-0 transition-all duration-300">
                        <GenerationControls
                            onGenerate={handleGenerate}
                            onDownloadImage={handleDownloadImage}
                            onDownloadAllImages={handleDownloadAllImages}
                            selectedDate={selectedDate}
                            onDateChange={setSelectedDate}
                            isBulkDownloading={isBulkDownloading}
                            isGeneratingSingle={isGeneratingSingle}
                            onSelectionUpdate={setSelectedForDownload}
                            externalSelectedId={externalSelectedId}
                            onFetchingChange={setIsFetchingPreview}
                        />
                    </div>
                )}

                {/* Section 2 - Preview (Main Content Area) */}
                <div className="flex-1 w-full min-w-0">
                    <Card className="glass-card shadow-2xl border-white/20 overflow-hidden">
                        <CardHeader className="bg-white/50 border-b border-border/10 py-4 flex flex-row items-center justify-between">
                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                                <Zap className="w-5 h-5 text-arin-orange fill-current" />
                                Live Premium Preview
                            </CardTitle>
                            {uiPhase !== "SETUP" && (
                                <Button 
                                    onClick={handleDownloadImage}
                                    disabled={isGeneratingSingle || isBulkDownloading || isFetchingPreview}
                                    size="sm"
                                    variant="outline"
                                    className="h-8 gap-2 font-bold text-xs border-arin-teal text-arin-teal hover:bg-arin-teal/10"
                                >
                                    {isGeneratingSingle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DownloadCloud className="w-3.5 h-3.5" />}
                                    Download Image
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent className="p-0 overflow-hidden">
                            <div ref={previewWrapperRef} className="bg-slate-100/50 p-4 lg:p-8 flex justify-center min-h-[600px] overflow-hidden">
                                {uiPhase === "SETUP" ? (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-center">
                                        <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-slate-400 mb-4 border border-slate-200">
                                            <Monitor className="w-8 h-8" />
                                        </div>
                                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Waiting for Selection</h3>
                                        <p className="text-xs text-slate-500 max-w-xs mt-2 leading-relaxed font-medium">
                                            Select a consumer profile from the sidebar on the left to load their bill preview and enable editing.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center w-full">
                                        <div 
                                            style={{ 
                                                transform: `scale(${zoomScale})`, 
                                                transformOrigin: 'top center',
                                                width: '1200px',
                                                flexShrink: 0,
                                                transition: 'transform 0.15s ease-out',
                                                marginBottom: `-${(1 - zoomScale) * 800}px` // Approximate height compensation
                                            }}
                                            className={cn("relative shadow-2xl transition-all duration-300", uiPhase === "GENERATING" ? "opacity-50 blur-[2px]" : "opacity-100")}
                                        >
                                            {isFetchingPreview && (
                                                <div className="absolute inset-0 z-50 bg-white/40 backdrop-blur-[2px] flex items-center justify-center rounded-lg">
                                                    <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3">
                                                        <Loader2 className="w-8 h-8 animate-spin text-arin-teal" />
                                                        <span className="text-sm font-black uppercase text-slate-600 tracking-widest">Loading Profile...</span>
                                                    </div>
                                                </div>
                                            )}
                                            <BillPreview
                                                ref={billPreviewRef}
                                                consumer={selectedConsumer}
                                                billData={billData}
                                                selectedDate={selectedDate}
                                            />
                                        </div>
                                        {/* Selected Consumers List */}
                                        {selectedForDownload.length > 0 && uiPhase === "PREVIEW" && (
                                            <div 
                                                className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 p-4 animate-in slide-in-from-bottom-4"
                                                style={{ width: `${1200 * zoomScale}px`, maxWidth: '100%', zIndex: 10 }}
                                            >
                                                <h3 className="text-[10px] font-black uppercase text-slate-500 mb-3 tracking-widest flex items-center gap-2">
                                                    <Users className="w-3.5 h-3.5" />
                                                    Selected for Batch ({selectedForDownload.length})
                                                </h3>
                                                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                                    {selectedForDownload.map(c => (
                                                        <button
                                                            key={c.consumer_number}
                                                            onClick={() => setExternalSelectedId(c.consumer_number)}
                                                            className={cn(
                                                                "flex flex-col items-start min-w-[160px] max-w-[200px] p-2.5 rounded-lg border text-left transition-all shrink-0",
                                                                selectedConsumer?.consumer_number === c.consumer_number
                                                                    ? "border-arin-teal bg-arin-teal/5 shadow-sm"
                                                                    : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
                                                            )}
                                                        >
                                                            <span className="text-xs font-bold text-slate-700 truncate w-full">{c.consumer_name}</span>
                                                            <span className="text-[10px] font-mono text-slate-500">{c.consumer_number}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
