import { useState, useMemo, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SearchBar } from "@/components/SearchBar";
import { MonthFilter } from "@/components/MonthFilter";
import { ActionButtons } from "@/components/ActionButtons";
import { ConsumerTable } from "@/components/ConsumerTable";
import { ConsumerHistoryPanel } from "@/components/ConsumerHistoryPanel";
import { api } from "@/lib/api";
import { Consumer } from "@/types/consumer";
import { exportToCSV } from "@/lib/exportData";
import { useToast } from "@/hooks/use-toast";
// months list is now derived dynamically (Issue #9 — no more hardcoded list)

const ConsumerConnect = () => {
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedMonth, setSelectedMonth] = useState("All Months");
    const [selectedConsumer, setSelectedConsumer] = useState<Consumer | null>(null);
    const [consumers, setConsumers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchConsumers = async () => {
            try {
                const data = await api.getBills();
                // Map backend data to frontend consumer type
                const mappedData = data.map((b: any) => {
                    const dateObj = b.month_year ? new Date(b.month_year) : null;
                    const monthLabel = (dateObj && !isNaN(dateObj.getTime()))
                        ? dateObj.toLocaleString('default', { month: 'long', year: 'numeric' })
                        : "Unknown";

                    return {
                        id: String(b.id || Math.random()),
                        arinId: b.arin_id || "N/A",
                        consumerNo: b.consumer_number || b.cust_consumer_no || "N/A",
                        // Merging data from both tables (customer table + bill table)
                        consumerName: b.customer_name || b.consumer_name || "N/A",
                        month: monthLabel,
                        capacityKW: b.capacity || 0,
                        commissionDate: b.commission_date || "N/A",
                        importUnits: b.import_units || 0,
                        exportUnits: b.export_units || 0,
                        generationUnits: b.generation_units || 0,
                        totalGeneration: b.generation_units || 0,
                        billAmount: b.billing_amount || 0,
                        amount: b.billing_amount || 0,
                        readingDate: b.reading_date || "N/A",
                        previousUnit: b.prev_bank_units || 0,
                        currentUnit: b.bank_solar_units || 0,
                        status: "Active"
                    };
                });
                setConsumers(mappedData);
            } catch (err) {
                console.error("Failed to fetch consumers", err);
                toast({
                    title: "Fetch Error",
                    description: "Could not load consumer data.",
                    variant: "destructive"
                });
            } finally {
                setIsLoading(false);
            }
        };
        fetchConsumers();
    }, [toast]);

    // Derive months list dynamically from loaded data (Issue #9)
    const months = useMemo(() => {
        const unique = Array.from(new Set(consumers.map((c: any) => c.month).filter(Boolean)));
        // Sort descending (newest first)
        unique.sort((a: string, b: string) => {
            const da = new Date(a);
            const db = new Date(b);
            return isNaN(db.getTime()) || isNaN(da.getTime()) ? 0 : db.getTime() - da.getTime();
        });
        return ["All Months", ...unique];
    }, [consumers]);

    const filteredConsumers = useMemo(() => {
        return consumers.filter((consumer) => {
            const matchesSearch =
                searchQuery === "" ||
                consumer.consumerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                consumer.consumerNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (consumer.arinId && String(consumer.arinId).toLowerCase().includes(searchQuery.toLowerCase()));

            const matchesMonth =
                selectedMonth === "All Months" || consumer.month?.includes(selectedMonth);

            return matchesSearch && matchesMonth;
        });
    }, [searchQuery, selectedMonth, consumers]);

    const handleFilter = () => {
        toast({
            title: "Filters Applied",
            description: `Showing ${filteredConsumers.length} consumer records`,
        });
    };

    const handleExport = () => {
        if (filteredConsumers.length === 0) {
            toast({
                title: "No Data to Export",
                description: "Please adjust your filters to include some data",
                variant: "destructive",
            });
            return;
        }

        exportToCSV(filteredConsumers, "solar_consumer_data");
        toast({
            title: "Export Successful",
            description: `${filteredConsumers.length} records exported to CSV`,
        });
    };

    const handleRowClick = (consumer: any) => {
        setSelectedConsumer(consumer);
    };

    const consumerHistory = useMemo(() => {
        if (!selectedConsumer) return [];
        return consumers.filter(c => c.consumerNo === selectedConsumer.consumerNo);
    }, [selectedConsumer, consumers]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-accent/5 to-secondary/20">

            {/* Main Content Area */}
            <main className="container mx-auto p-4 lg:p-6 space-y-6">
                {/* Page Title Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-arin-teal to-arin-green">
                            Consumer Database
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Access and manage comprehensive consumer records.
                        </p>
                    </div>
                    {/* Stats Summary Bubble */}
                    <div className="flex items-center gap-3 bg-white/50 backdrop-blur border border-white/20 px-4 py-2 rounded-full shadow-sm">
                        <div className="flex flex-col items-center px-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase">Total</span>
                            <span className="text-lg font-bold text-arin-dark">{consumers.length}</span>
                        </div>
                        <div className="w-px h-8 bg-gray-200" />
                        <div className="flex flex-col items-center px-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase">Visible</span>
                            <span className="text-lg font-bold text-arin-teal">{filteredConsumers.length}</span>
                        </div>
                    </div>
                </div>

                {/* Glassmorphic Controls Panel */}
                <div className="glass-card rounded-xl p-4 shadow-md border-t-4 border-t-arin-teal">
                    <div className="flex flex-wrap items-center gap-4 justify-between">
                        <div className="flex flex-1 items-center gap-4 min-w-[300px]">
                            <SearchBar value={searchQuery} onChange={setSearchQuery} />
                            <MonthFilter
                                value={selectedMonth}
                                onChange={setSelectedMonth}
                                months={months}
                            />
                        </div>
                        <ActionButtons onFilter={handleFilter} onExport={handleExport} />
                    </div>
                </div>

                {/* Results Filter Chips */}
                {(selectedMonth !== "All Months" || searchQuery) && (
                    <div className="flex gap-2 animate-in fade-in zoom-in duration-300">
                        {selectedMonth !== "All Months" && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20">
                                Month: {selectedMonth}
                                <button onClick={() => setSelectedMonth("All Months")} className="ml-1 hover:text-primary-foreground hover:bg-primary rounded-full p-0.5 transition-colors">×</button>
                            </span>
                        )}
                        {searchQuery && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent/10 text-accent-foreground text-sm font-medium border border-accent/20">
                                Search: "{searchQuery}"
                                <button onClick={() => setSearchQuery("")} className="ml-1 hover:text-accent-foreground hover:bg-accent rounded-full p-0.5 transition-colors">×</button>
                            </span>
                        )}
                    </div>
                )}

                {/* Table Container with enhanced shadow */}
                <div className="glass-card rounded-xl overflow-hidden shadow-xl border border-white/20">
                    <div className="bg-muted/30 px-6 py-3 border-b border-border flex justify-between items-center text-xs text-muted-foreground">
                        <span>DATABASE_VIEW_V1</span>
                        <span>{filteredConsumers.length} ROWS FOUND</span>
                    </div>
                    <div className="p-0">
                        <ConsumerTable
                            consumers={filteredConsumers}
                            onRowClick={handleRowClick}
                        />
                    </div>
                </div>
            </main>

            {/* Consumer History Panel Slide-over */}
            {selectedConsumer && (
                <ConsumerHistoryPanel
                    consumer={selectedConsumer}
                    history={consumerHistory}
                    onClose={() => setSelectedConsumer(null)}
                />
            )}
        </div>
    );
};

export default ConsumerConnect;
