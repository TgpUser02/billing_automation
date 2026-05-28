import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderDown, FileSpreadsheet, FileText, RefreshCw, Calendar, FileJson, Search, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface GeneratedReport {
    date: string;
    filename: string;
    size: number;
    modified: number;
    path: string;
}

export default function Reports() {
    const [reports, setReports] = useState<GeneratedReport[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterDate, setFilterDate] = useState("all");

    const fetchReports = async (showToast = false) => {
        setIsLoading(true);
        try {
            const res = await api.listReports();
            if (res.status === "success" && res.reports) {
                setReports(res.reports);
                if (showToast) {
                    toast({ title: "Reports Updated", description: `Found ${res.reports.length} generated files.` });
                }
            }
        } catch (err: any) {
            console.error("Failed to fetch reports:", err);
            toast({
                title: "Error",
                description: err.message || "Failed to load generated files list.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, []);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleDownload = async (report: GeneratedReport) => {
        try {
            toast({
                title: "Downloading...",
                description: `Preparing ${report.filename} for download...`,
            });
            const blob = await api.downloadReport(report.path);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = report.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            toast({
                title: "✓ Download Complete",
                description: `${report.filename} downloaded successfully.`,
                className: "bg-green-600 text-white font-bold border-none"
            });
        } catch (err: any) {
            console.error("Failed to download file:", err);
            toast({
                title: "Download Failed",
                description: err.message || "Could not retrieve the file from server.",
                variant: "destructive"
            });
        }
    };

    // Get unique dates for filter dropdown
    const uniqueDates = Array.from(new Set(reports.map(r => r.date))).sort().reverse();

    // Filtered reports
    const filteredReports = reports.filter(r => {
        const matchesSearch = r.filename.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesDate = filterDate === "all" || r.date === filterDate;
        return matchesSearch && matchesDate;
    });

    const getFileIcon = (filename: string) => {
        const ext = filename.split('.').pop()?.toLowerCase();
        if (ext === 'xlsx' || ext === 'xls') {
            return <FileSpreadsheet className="w-8 h-8 text-green-600" />;
        }
        if (ext === 'pdf') {
            return <FileText className="w-8 h-8 text-red-500" />;
        }
        if (ext === 'json') {
            return <FileJson className="w-8 h-8 text-yellow-600" />;
        }
        return <FolderDown className="w-8 h-8 text-arin-teal" />;
    };

    return (
        <div className="min-h-screen bg-transparent p-4 lg:p-8 animate-in fade-in duration-700">
            <main className="container mx-auto max-w-7xl">
                {/* Header Section */}
                <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-border/10 pb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-arin-teal rounded-2xl shadow-lg shadow-arin-teal/20">
                            <FolderDown className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black tracking-tighter text-foreground bg-clip-text text-transparent bg-gradient-to-r from-arin-orange to-arin-teal">
                                Generated Reports
                            </h1>
                            <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest mt-1">Browse and Download Saved Files</p>
                        </div>
                    </div>
                    
                    <Button 
                        onClick={() => fetchReports(true)} 
                        disabled={isLoading}
                        className="h-11 px-5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl shadow-sm text-sm flex items-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh Files
                    </Button>
                </div>

                {/* Filters Row */}
                <div className="grid gap-4 md:grid-cols-3 mb-6 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                    <div className="relative">
                        <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by filename..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-arin-teal"
                        />
                    </div>
                    
                    <div className="relative">
                        <Calendar className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                        <select
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-arin-teal appearance-none"
                        >
                            <option value="all">All Dates / Folders</option>
                            {uniqueDates.map(date => (
                                <option key={date} value={date}>{date}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2 justify-end text-xs text-slate-500 font-medium pr-2">
                        <ShieldCheck className="w-4 h-4 text-green-500" />
                        Storage Root: <code className="bg-slate-100 px-2 py-1 rounded text-slate-600 font-mono">Desktop/arin/Report/</code>
                    </div>
                </div>

                {/* Reports Grid */}
                {isLoading ? (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map(i => (
                            <Card key={i} className="animate-pulse border-slate-100">
                                <CardContent className="h-40 bg-slate-50/50 rounded-2xl" />
                            </Card>
                        ))}
                    </div>
                ) : filteredReports.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
                        <FolderDown className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-black text-slate-700">No Generated Files Found</h3>
                        <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
                            {searchQuery || filterDate !== "all" 
                                ? "No files match your search criteria. Try modifying your filters."
                                : "Reports generated during batch processing or dashboards will appear here."}
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {filteredReports.map((report, idx) => (
                            <Card key={idx} className="glass-card hover:shadow-xl transition-all duration-300 border-slate-100 hover:border-arin-teal/20 overflow-hidden flex flex-col justify-between">
                                <CardHeader className="flex flex-row items-start gap-4 pb-3">
                                    <div className="p-3 bg-slate-50 rounded-xl shrink-0">
                                        {getFileIcon(report.filename)}
                                    </div>
                                    <div className="overflow-hidden">
                                        <h3 className="font-black text-sm text-slate-800 break-all line-clamp-2" title={report.filename}>
                                            {report.filename}
                                        </h3>
                                        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider mt-1.5 flex items-center gap-1.5">
                                            <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-mono">{report.date}</span>
                                        </p>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-0 flex flex-col gap-4">
                                    <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-50 pt-3">
                                        <div>
                                            <span className="text-slate-400 font-semibold block">File Size</span>
                                            <span className="font-bold text-slate-700">{formatBytes(report.size)}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400 font-semibold block">Generated At</span>
                                            <span className="font-bold text-slate-700">
                                                {format(new Date(report.modified * 1000), 'dd MMM yyyy, HH:mm')}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <Button 
                                        onClick={() => handleDownload(report)}
                                        className="w-full h-10 bg-slate-50 hover:bg-arin-teal hover:text-white border border-slate-100 hover:border-none text-slate-700 font-black rounded-xl text-xs transition-all flex items-center justify-center gap-2"
                                    >
                                        <FolderDown className="w-3.5 h-3.5" />
                                        Download File
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                <div className="text-center py-12 border-t border-black/5 opacity-50 mt-10">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">
                        Arin Analytics Infrastructure • Reports Manager
                    </p>
                </div>
            </main>
        </div>
    );
}
