import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FolderDown, FileText, Database, Zap, Clock, Activity, Map as MapIcon, ChevronRight, DownloadCloud, LayoutDashboard, TrendingUp, BarChart3, Info } from 'lucide-react';
import { api } from '@/lib/api';
import {
    ResponsiveContainer, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, AreaChart, Area
} from 'recharts';
import { Button } from "@/components/ui/button";
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const COLORS = ['#0D9488', '#F97316', '#8B5CF6', '#10B981', '#EC4899', '#3B82F6', '#F59E0B', '#6366F1'];

const Dashboard = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState({
        totalConsumers: 0,
        totalBills: 0,
        energySaved: "0 kWh",
        pendingCount: 0,
        totalAmount: 0,
        areaDistribution: [] as any[],
        healthDistribution: [] as any[],
        statusDistribution: [] as any[],
        monthDistribution: [] as any[],
        generationDistribution: [] as any[],
        revenueDistribution: [] as any[],
        areaRevenue: [] as any[],
        hourlyActivity: [] as any[],
        recentBills: [] as any[]
    });

    useEffect(() => {
        const fetchStats = async (isFirst = false) => {
            if (isFirst) setIsLoading(true);
            try {
                const data = await api.getStats();
                setStats(data);
            } catch (err) {
                console.error("Failed to fetch dashboard stats", err);
            } finally {
                if (isFirst) setIsLoading(false);
            }
        };

        fetchStats(true);
        const interval = setInterval(() => fetchStats(false), 5000);
        return () => clearInterval(interval);
    }, []);

    // Prepare Comparison Data
    const comparisonData = stats.recentBills.slice(0, 10).map((b: any) => ({
        name: b.consumer_name && b.consumer_name !== "N/A" ? b.consumer_name.split(' ')[0] : b.consumer_number.slice(-4),
        import: b.import || 0,
        export: b.export || 0,
        generation: b.generated || 0,
        amount: parseFloat(b.amount) || 0,
        prevBanked: b.prev_banked || 0,
        currBanked: b.curr_banked || 0,
        capacity: parseFloat(b.capacity) || 0
    }));

    const exportSpecialList = async (list: any[], filename: string, fileFormat: 'pdf' | 'xlsx') => {
        if (list.length === 0) {
            toast({ title: "No data", description: "The list is empty for this category." });
            return;
        }

        try {
            // Use today's date for the report folder
            const dateStr = format(new Date(), 'yyyy-MM-dd');
            
            toast({
                title: "Saving Report",
                description: `Writing ${filename}.${fileFormat} to Desktop...`,
            });
            
            const res = await api.saveReports(`${filename}.${fileFormat}`, list, dateStr);
            
            toast({ 
                title: "✅ Report Saved Directly", 
                description: `Location: Desktop/arin/${dateStr}/reports/`,
                variant: "default",
                className: "bg-green-50 border-green-200"
            });
        } catch (e: any) {
            console.error("Export failed", e);
            toast({ 
                title: "❌ Export Failed", 
                description: e.message || "Could not save the file to local storage.", 
                variant: "destructive" 
            });
        }
    };

    return (
        <div className="min-h-screen bg-transparent p-4 lg:p-8 animate-in fade-in duration-700">
            <main className="container mx-auto max-w-7xl">
                {/* Header Section */}
                <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-border/10 pb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-arin-teal rounded-2xl shadow-lg shadow-arin-teal/20">
                            <LayoutDashboard className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black tracking-tighter text-foreground bg-clip-text text-transparent bg-gradient-to-r from-arin-orange to-arin-teal">
                                Dashboard Overview
                            </h1>
                            <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest mt-1">System Vital Metrics</p>
                        </div>
                    </div>
                </div>

                {/* Primary Stats Grid */}
                <div className="grid gap-6 md:grid-cols-2 mb-10">
                    <Card className="glass-card border-l-4 border-l-arin-teal shadow-lg p-6">
                        <CardHeader className="flex flex-row items-center justify-between pb-4">
                            <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground">Portfolio</CardTitle>
                            <Database className="h-6 w-6 text-arin-teal" />
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="h-16 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                            ) : (
                                <div className="text-6xl font-black">{stats.totalConsumers}</div>
                            )}
                            <p className="text-xs text-muted-foreground mt-2 font-black uppercase tracking-widest">Registered Consumers</p>
                        </CardContent>
                    </Card>
                    <Card className="glass-card border-l-4 border-l-arin-orange shadow-lg p-6">
                        <CardHeader className="flex flex-row items-center justify-between pb-4">
                            <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground">Volume</CardTitle>
                            <FileText className="h-6 w-6 text-arin-orange" />
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="h-16 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                            ) : (
                                <div className="text-6xl font-black">{stats.totalBills}</div>
                            )}
                            <p className="text-xs text-muted-foreground mt-2 font-black uppercase tracking-widest">Extracted Bill Records</p>
                        </CardContent>
                    </Card>
                </div>

                <div className="text-center py-12 border-t border-black/5 opacity-50">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">
                        Arin Analytics Infrastructure • v2.2.0
                    </p>
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
