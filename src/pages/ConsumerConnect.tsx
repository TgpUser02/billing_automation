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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
    Upload,
    FileText,
    AlertTriangle,
    Download,
    Plus,
    Edit2,
    Wifi,
    History,
    User,
    Wrench,
    Search,
    Loader2,
    Trash2
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formatters";

const emptyCustomerProfile = {
    arin_id: "",
    customer_name: "",
    contact_number: "N/A",
    zone: "Other",
    current_location_link: "",
    address: "N/A",
    consumer_number: "",
    panel_name: "Other",
    panel_name_other: "",
    panel_type: "",
    solar_wattpick: 0,
    solar_panel_count: 0,
    solar_capacity_kw: 0,
    panel_capacity_kw: 0,
    inverter_name: "Other",
    inverter_name_other: "",
    inverter_capacity: 0,
    commission_date: new Date().toISOString().split('T')[0],
    wifi_available: 0,
    wifi_id: "",
    wifi_password: "",
    visits_per_year: 2,
    total_visits_in_5_years: 10,
    maintenance_tenure: "",
    is_blacklisted: 0,
    inverter_warranty_expiry_date: "",
    panel_warranty_expiry_date: "",
    system_warranty_expiry_date: "",
    general_warranty_expiry_date: "",
    blacklisted_reason: "",
    portal_username: "",
    portal_password: ""
};

const ConsumerConnect = () => {
    const { toast } = useToast();
    const [viewMode, setViewMode] = useState<'profiles' | 'bills'>('profiles');

    const [searchQuery, setSearchQuery] = useState("");
    const [selectedMonth, setSelectedMonth] = useState("All Months");
    const [selectedConsumer, setSelectedConsumer] = useState<Consumer | null>(null);

    // Lists
    const [consumers, setConsumers] = useState<any[]>([]); // Bills
    const [profiles, setProfiles] = useState<any[]>([]); // Customer Profiles
    const [isLoading, setIsLoading] = useState(true);

    // Advanced Filters
    const [selectedZone, setSelectedZone] = useState("All Zones");
    const [selectedStatus, setSelectedStatus] = useState("All");
    const [minCapacity, setMinCapacity] = useState("");
    const [maxCapacity, setMaxCapacity] = useState("");

    // Import Dialog States
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isDragActive, setIsDragActive] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState<any>(null);
    const [importError, setImportError] = useState<string | null>(null);

    // Manual Save Dialog States
    const [isSaveOpen, setIsSaveOpen] = useState(false);
    const [selectedCustomerForEdit, setSelectedCustomerForEdit] = useState<any | null>(null);
    const [formData, setFormData] = useState<any>({ ...emptyCustomerProfile });
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Delete Confirmation States
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [customerToDelete, setCustomerToDelete] = useState<any | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Deduplicate States
    const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
    const [isDeduplicateOpen, setIsDeduplicateOpen] = useState(false);
    const [isDeduplicating, setIsDeduplicating] = useState(false);

    // Pagination for profiles
    const [profilePage, setProfilePage] = useState(1);
    const profilePageSize = 50;

    const loadAllData = async () => {
        setIsLoading(true);
        try {
            const [billsData, profilesData] = await Promise.all([
                api.getBills(),
                api.getAllCustomersDB()
            ]);

            // Map bills
            const mappedBills = billsData.map((b: any) => {
                const dateObj = b.month_year ? new Date(b.month_year) : null;
                const monthLabel = (dateObj && !isNaN(dateObj.getTime()))
                    ? dateObj.toLocaleString('default', { month: 'long', year: 'numeric' })
                    : "Unknown";

                return {
                    id: String(b.id || Math.random()),
                    arinId: b.arin_id || "N/A",
                    consumerNo: b.consumer_number || b.cust_consumer_no || "N/A",
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
                    status: "Active",
                    zone: b.zone || "Other",
                    isBlacklisted: !!b.is_blacklisted
                };
            });
            setConsumers(mappedBills);

            // Map profiles
            if (profilesData && profilesData.status === "success") {
                setProfiles(profilesData.data);
            }
        } catch (err) {
            console.error("Failed to load data", err);
            toast({
                title: "Fetch Error",
                description: "Could not load database records.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadAllData();
    }, [toast]);

    // Derive months list dynamically from loaded data
    const months = useMemo(() => {
        const unique = Array.from(new Set(consumers.map((c: any) => c.month).filter(Boolean)));
        unique.sort((a: string, b: string) => {
            const da = new Date(a);
            const db = new Date(b);
            return isNaN(db.getTime()) || isNaN(da.getTime()) ? 0 : db.getTime() - da.getTime();
        });
        return ["All Months", ...unique];
    }, [consumers]);

    // Derive zones list dynamically from profiles data
    const zonesList = useMemo(() => {
        const unique = Array.from(new Set(profiles.map(p => p.zone).filter(Boolean)));
        unique.sort();
        return ["All Zones", ...unique];
    }, [profiles]);

    // Derive duplicates dynamically from profiles
    const duplicateConsumerNumbers = useMemo(() => {
        const counts = new Map<string, number>();
        profiles.forEach(p => {
            if (p.consumer_number) {
                const cleanNum = p.consumer_number.trim();
                counts.set(cleanNum, (counts.get(cleanNum) || 0) + 1);
            }
        });
        return new Set(Array.from(counts.entries()).filter(([_, c]) => c > 1).map(([n, _]) => n));
    }, [profiles]);

    const duplicateProfiles = useMemo(() => {
        return profiles.filter(p => p.consumer_number && duplicateConsumerNumbers.has(p.consumer_number.trim()));
    }, [profiles, duplicateConsumerNumbers]);

    // Filtered lists
    const filteredProfiles = useMemo(() => {
        return profiles.filter((profile) => {
            const matchesSearch =
                searchQuery === "" ||
                profile.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                profile.consumer_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (profile.arin_id && String(profile.arin_id).toLowerCase().includes(searchQuery.toLowerCase()));

            const matchesZone =
                selectedZone === "All Zones" || profile.zone === selectedZone;

            let matchesStatus = true;
            if (selectedStatus === "Active") {
                matchesStatus = !profile.is_blacklisted;
            } else if (selectedStatus === "Blacklisted") {
                matchesStatus = !!profile.is_blacklisted;
            }

            const capacity = Number(profile.solar_capacity_kw || 0);
            const matchesMinCap = minCapacity === "" || capacity >= Number(minCapacity);
            const matchesMaxCap = maxCapacity === "" || capacity <= Number(maxCapacity);

            const matchesDuplicate = !showDuplicatesOnly || (profile.consumer_number && duplicateConsumerNumbers.has(profile.consumer_number.trim()));

            return matchesSearch && matchesZone && matchesStatus && matchesMinCap && matchesMaxCap && matchesDuplicate;
        });
    }, [searchQuery, selectedZone, selectedStatus, minCapacity, maxCapacity, profiles, showDuplicatesOnly, duplicateConsumerNumbers]);

    const filteredConsumers = useMemo(() => {
        return consumers.filter((consumer) => {
            const matchesSearch =
                searchQuery === "" ||
                consumer.consumerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                consumer.consumerNo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (consumer.arinId && String(consumer.arinId).toLowerCase().includes(searchQuery.toLowerCase()));

            const matchesMonth =
                selectedMonth === "All Months" || consumer.month?.includes(selectedMonth);

            const matchesZone =
                selectedZone === "All Zones" || consumer.zone === selectedZone;

            let matchesStatus = true;
            if (selectedStatus === "Active") {
                matchesStatus = !consumer.isBlacklisted;
            } else if (selectedStatus === "Blacklisted") {
                matchesStatus = !!consumer.isBlacklisted;
            }

            const capacity = Number(consumer.capacityKW || 0);
            const matchesMinCap = minCapacity === "" || capacity >= Number(minCapacity);
            const matchesMaxCap = maxCapacity === "" || capacity <= Number(maxCapacity);

            return matchesSearch && matchesMonth && matchesZone && matchesStatus && matchesMinCap && matchesMaxCap;
        });
    }, [searchQuery, selectedMonth, selectedZone, selectedStatus, minCapacity, maxCapacity, consumers]);

    const totalPages = Math.ceil(filteredProfiles.length / profilePageSize);
    const safeProfilePage = Math.min(profilePage, Math.max(1, totalPages));
    const currentProfilesData = useMemo(() => {
        return filteredProfiles.slice((safeProfilePage - 1) * profilePageSize, safeProfilePage * profilePageSize);
    }, [filteredProfiles, safeProfilePage]);

    const handleFilter = () => {
        toast({
            title: "Filters Applied",
            description: `Filtered list contains ${viewMode === 'profiles' ? filteredProfiles.length : filteredConsumers.length} records.`,
        });
    };

    const handleExport = () => {
        const dataToExport = viewMode === 'profiles' ? filteredProfiles : filteredConsumers;
        if (dataToExport.length === 0) {
            toast({
                title: "No Data to Export",
                description: "Please adjust your filters to include some data",
                variant: "destructive",
            });
            return;
        }

        exportToCSV(dataToExport, viewMode === 'profiles' ? "solar_consumer_profiles" : "solar_billing_data");
        toast({
            title: "Export Successful",
            description: `${dataToExport.length} records exported to CSV`,
        });
    };

    const handleRowClick = (consumer: any) => {
        setSelectedConsumer(consumer);
    };

    // Manual Save Logic
    const handleAddCustomer = () => {
        setSelectedCustomerForEdit(null);
        setFormData({ ...emptyCustomerProfile });
        setSaveError(null);
        setIsSaveOpen(true);
    };

    const handleEditCustomer = (profile: any) => {
        setSelectedCustomerForEdit(profile);
        setFormData({
            arin_id: profile.arin_id || "",
            customer_name: profile.customer_name || "",
            contact_number: profile.contact_number || "N/A",
            zone: profile.zone || "Other",
            current_location_link: profile.current_location_link || "",
            address: profile.address || "N/A",
            consumer_number: profile.consumer_number || "",
            panel_name: profile.panel_name || "Other",
            panel_name_other: profile.panel_name_other || "",
            panel_type: profile.panel_type || "",
            solar_wattpick: profile.solar_wattpick || 0,
            solar_panel_count: profile.solar_panel_count || 0,
            solar_capacity_kw: profile.solar_capacity_kw || 0,
            panel_capacity_kw: profile.panel_capacity_kw || 0,
            inverter_name: profile.inverter_name || "Other",
            inverter_name_other: profile.inverter_name_other || "",
            inverter_capacity: profile.inverter_capacity || 0,
            commission_date: profile.commission_date ? profile.commission_date.split('T')[0] : new Date().toISOString().split('T')[0],
            wifi_available: profile.wifi_available ? 1 : 0,
            wifi_id: profile.wifi_id || "",
            wifi_password: profile.wifi_password || "",
            visits_per_year: profile.visits_per_year || 2,
            total_visits_in_5_years: profile.total_visits_in_5_years || 10,
            maintenance_tenure: profile.maintenance_tenure || "",
            is_blacklisted: profile.is_blacklisted ? 1 : 0,
            inverter_warranty_expiry_date: profile.inverter_warranty_expiry_date ? profile.inverter_warranty_expiry_date.split('T')[0] : "",
            panel_warranty_expiry_date: profile.panel_warranty_expiry_date ? profile.panel_warranty_expiry_date.split('T')[0] : "",
            system_warranty_expiry_date: profile.system_warranty_expiry_date ? profile.system_warranty_expiry_date.split('T')[0] : "",
            general_warranty_expiry_date: profile.general_warranty_expiry_date ? profile.general_warranty_expiry_date.split('T')[0] : "",
            blacklisted_reason: profile.blacklisted_reason || "",
            portal_username: profile.portal_username || "",
            portal_password: profile.portal_password || ""
        });
        setSaveError(null);
        setIsSaveOpen(true);
    };

    const handleViewHistory = (profile: any) => {
        // Map profile representation to a mock consumer for history panel
        const matched = consumers.find(c => c.consumerNo === profile.consumer_number);
        if (matched) {
            setSelectedConsumer(matched);
        } else {
            setSelectedConsumer({
                id: "mock-" + profile.consumer_number,
                consumerNo: profile.consumer_number,
                consumerName: profile.customer_name,
                capacityKW: profile.solar_capacity_kw,
                commissionDate: profile.commission_date,
                amount: 0,
                totalGeneration: 0,
                exportUnits: 0,
                importUnits: 0,
                previousUnit: 0,
                currentUnit: 0,
                month: "N/A",
                readingDate: "N/A"
            });
        }
    };

    const handleSaveCustomerSubmit = async () => {
        if (!formData.customer_name.trim() || !formData.consumer_number.trim()) {
            setSaveError("Name and Consumer Number are required fields.");
            return;
        }
        setIsSaving(true);
        setSaveError(null);
        try {
            const result = await api.saveCustomer(formData);
            if (result.status === "success") {
                toast({
                    title: "Profile Saved",
                    description: `Successfully saved profile for ${formData.customer_name}.`,
                });
                setIsSaveOpen(false);
                loadAllData(); // Reload both lists
            } else {
                setSaveError(result.message || "Failed to save customer profile.");
            }
        } catch (err: any) {
            console.error("Save customer failed:", err);
            setSaveError(err.message || "An unexpected error occurred.");
        } finally {
            setIsSaving(false);
        }
    };

    // Delete Handlers
    const handleDeleteCustomer = (profile: any) => {
        setCustomerToDelete(profile);
        setIsDeleteOpen(true);
    };

    const handleDeleteCustomerSubmit = async () => {
        if (!customerToDelete) return;
        setIsDeleting(true);
        try {
            const result = await api.deleteCustomer(customerToDelete.consumer_number);
            if (result.status === "success") {
                toast({
                    title: "Profile Deleted",
                    description: `Successfully deleted profile for ${customerToDelete.customer_name}.`,
                });
                setIsDeleteOpen(false);
                setCustomerToDelete(null);
                loadAllData(); // Reload counts and lists
            } else {
                toast({
                    title: "Delete Failed",
                    description: result.message || "Failed to delete customer profile.",
                    variant: "destructive",
                });
            }
        } catch (err: any) {
            console.error("Delete customer failed:", err);
            toast({
                title: "Delete Error",
                description: err.message || "An unexpected error occurred during deletion.",
                variant: "destructive",
            });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleResolveDuplicates = async () => {
        setIsDeduplicating(true);
        try {
            const result = await api.deduplicateCustomers();
            if (result.status === "success") {
                toast({
                    title: "Deduplication Complete",
                    description: result.message || "Successfully resolved duplicate customer profiles.",
                });
                setIsDeduplicateOpen(false);
                setShowDuplicatesOnly(false);
                loadAllData(); // Reload both lists to sync counts
            } else {
                toast({
                    title: "Deduplication Failed",
                    description: result.message || "Failed to resolve duplicate customer profiles.",
                    variant: "destructive",
                });
            }
        } catch (err: any) {
            console.error("Deduplication error:", err);
            toast({
                title: "Deduplication Error",
                description: err.message || "An unexpected error occurred.",
                variant: "destructive",
            });
        } finally {
            setIsDeduplicating(false);
        }
    };

    const handleFileSelect = (file: File) => {
        setSelectedFile(file);
        setImportError(null);
        setImportResult(null);
    };

    const handleImportSubmit = async () => {
        if (!selectedFile) return;
        setIsImporting(true);
        setImportError(null);
        setImportResult(null);
        try {
            const result = await api.importConsumers(selectedFile);
            setImportResult(result);
            if (result.status === "success") {
                toast({
                    title: "Import Successful",
                    description: `Successfully processed ${result.imported + result.updated} consumers.`,
                });
                loadAllData(); // Reload both lists
            } else {
                setImportError(result.message || "Failed to import consumers.");
            }
        } catch (err: any) {
            console.error("Import failed:", err);
            setImportError(err.message || "An unexpected error occurred during import.");
        } finally {
            setIsImporting(false);
        }
    };

    const handleDownloadTemplate = () => {
        const headers = [
            "Arin ID",
            "Consumer Number",
            "Customer Name",
            "Contact Number",
            "Zone",
            "Address",
            "Panel Name",
            "Panel Type",
            "Solar Panel Count",
            "Solar Capacity KW",
            "Panel Capacity KW",
            "Inverter Name",
            "Inverter Capacity",
            "Commission Date",
            "Wifi Available",
            "Wifi ID",
            "Wifi Password",
            "Visits Per Year",
            "Total Visits In 5 Years",
            "Is Blacklisted"
        ];
        const rows = [
            ["ARIN-001", "425320007691", "Naresh Energy Corp", "9876543210", "Zone A", "Mumbai, India", "Tata Solar", "Monocrystalline", "20", "5", "5", "Growatt", "5", "2026-01-01", "1", "Naresh_WiFi", "pass123", "2", "10", "0"]
        ];
        const csvContent = "data:text/csv;charset=utf-8,"
            + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "arin_consumers_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
                            Access, manage, and edit comprehensive consumer records and profiles.
                        </p>
                    </div>
                    {/* Stats Summary Bubble */}
                    <div className="flex items-center gap-3 bg-white/50 backdrop-blur border border-white/20 px-4 py-2 rounded-full shadow-sm">
                        <div className="flex flex-col items-center px-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase">Total Profiles</span>
                            <span className="text-lg font-bold text-arin-dark">{profiles.length}</span>
                        </div>
                        <div className="w-px h-8 bg-gray-200" />
                        <div className="flex flex-col items-center px-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase">Filtered</span>
                            <span className="text-lg font-bold text-arin-teal">
                                {viewMode === 'profiles' ? filteredProfiles.length : filteredConsumers.length}
                            </span>
                        </div>
                    </div>
                </div>

                {/* View Mode Toggle & Actions Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50 shadow-inner">
                        <button
                            onClick={() => setViewMode('profiles')}
                            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all uppercase tracking-wider ${viewMode === 'profiles'
                                    ? 'bg-gradient-to-r from-arin-green to-arin-teal text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                        >
                            <User className="w-3.5 h-3.5" />
                            Consumer Profiles
                        </button>
                        <button
                            onClick={() => setViewMode('bills')}
                            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all uppercase tracking-wider ${viewMode === 'bills'
                                    ? 'bg-gradient-to-r from-arin-green to-arin-teal text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                        >
                            <History className="w-3.5 h-3.5" />
                            Billing History
                        </button>
                    </div>
                </div>

                {/* Duplicate Alert Banner */}
                {duplicateConsumerNumbers.size > 0 && viewMode === 'profiles' && (
                    <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-800 rounded-xl mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="flex items-center gap-3">
                            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                            <div>
                                <AlertTitle className="font-bold text-amber-900">Duplicate Customers Detected</AlertTitle>
                                <AlertDescription className="text-amber-800 text-xs mt-0.5">
                                    Found {duplicateConsumerNumbers.size} consumer numbers with duplicate profiles ({duplicateProfiles.length} records total).
                                </AlertDescription>
                            </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
                                className={`h-8 rounded-lg border-amber-500/30 font-semibold text-xs transition-all ${showDuplicatesOnly ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-white text-amber-700 hover:bg-amber-50'}`}
                            >
                                {showDuplicatesOnly ? "Show All Profiles" : "Show Only Duplicates"}
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => setIsDeduplicateOpen(true)}
                                className="h-8 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-sm"
                            >
                                Resolve Duplicates
                            </Button>
                        </div>
                    </Alert>
                )}

                {/* Glassmorphic Controls Panel */}
                <div className="glass-card rounded-xl p-4 shadow-md border-t-4 border-t-arin-teal space-y-4">
                    <div className="flex flex-wrap items-center gap-4 justify-between">
                        <div className="flex flex-1 items-center gap-4 min-w-[300px]">
                            <SearchBar value={searchQuery} onChange={setSearchQuery} />
                            {viewMode === 'bills' && (
                                <MonthFilter
                                    value={selectedMonth}
                                    onChange={setSelectedMonth}
                                    months={months}
                                />
                            )}
                        </div>
                        <ActionButtons
                            onFilter={handleFilter}
                            onExport={handleExport}
                            onImport={() => setIsImportOpen(true)}
                            onAdd={handleAddCustomer}
                            showAdd={viewMode === 'profiles'}
                        />
                    </div>

                    {/* Advanced Filters Grid */}
                    <div className={`grid grid-cols-1 sm:grid-cols-2 ${viewMode === 'profiles' ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4 pt-4 border-t border-border/60`}>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Zone</Label>
                            <select
                                value={selectedZone}
                                onChange={(e) => setSelectedZone(e.target.value)}
                                className="flex h-10 w-full rounded-xl border border-slate-200 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arin-teal"
                            >
                                {zonesList.map(z => <option key={z} value={z}>{z}</option>)}
                            </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</Label>
                            <select
                                value={selectedStatus}
                                onChange={(e) => setSelectedStatus(e.target.value)}
                                className="flex h-10 w-full rounded-xl border border-slate-200 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arin-teal"
                            >
                                <option value="All">All Statuses</option>
                                <option value="Active">Active Only</option>
                                <option value="Blacklisted">Blacklisted Only</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Min Capacity (kW)</Label>
                            <Input
                                type="number"
                                min="0"
                                value={minCapacity}
                                onChange={(e) => setMinCapacity(e.target.value)}
                                placeholder="Min kW"
                                className="h-10 rounded-xl border-slate-200"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Max Capacity (kW)</Label>
                            <Input
                                type="number"
                                min="0"
                                value={maxCapacity}
                                onChange={(e) => setMaxCapacity(e.target.value)}
                                placeholder="Max kW"
                                className="h-10 rounded-xl border-slate-200"
                            />
                        </div>

                        {viewMode === 'profiles' && (
                            <div className="flex flex-col gap-1.5 justify-center">
                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Duplicates Filter</Label>
                                <div className="flex items-center gap-2 h-10">
                                    <input
                                        id="filter_duplicates"
                                        type="checkbox"
                                        checked={showDuplicatesOnly}
                                        onChange={e => setShowDuplicatesOnly(e.target.checked)}
                                        className="w-4.5 h-4.5 rounded border-slate-300 text-arin-teal focus:ring-arin-teal cursor-pointer"
                                    />
                                    <Label htmlFor="filter_duplicates" className="text-xs font-semibold text-slate-700 cursor-pointer">
                                        Show Duplicates Only
                                    </Label>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Filter Status Chips */}
                {(selectedMonth !== "All Months" || searchQuery || selectedZone !== "All Zones" || selectedStatus !== "All" || minCapacity || maxCapacity || showDuplicatesOnly) && (
                    <div className="flex flex-wrap gap-2 animate-in fade-in zoom-in duration-300">
                        {viewMode === 'bills' && selectedMonth !== "All Months" && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20">
                                Month: {selectedMonth}
                                <button onClick={() => setSelectedMonth("All Months")} className="ml-1 font-bold text-sm">×</button>
                            </span>
                        )}
                        {searchQuery && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
                                Search: "{searchQuery}"
                                <button onClick={() => setSearchQuery("")} className="ml-1 font-bold text-sm">×</button>
                            </span>
                        )}
                        {selectedZone !== "All Zones" && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-semibold border border-emerald-500/20">
                                Zone: {selectedZone}
                                <button onClick={() => setSelectedZone("All Zones")} className="ml-1 font-bold text-sm">×</button>
                            </span>
                        )}
                        {selectedStatus !== "All" && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 text-xs font-semibold border border-blue-500/20">
                                Status: {selectedStatus}
                                <button onClick={() => setSelectedStatus("All")} className="ml-1 font-bold text-sm">×</button>
                            </span>
                        )}
                        {(minCapacity || maxCapacity) && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 text-xs font-semibold border border-amber-500/20">
                                Capacity: {minCapacity || "0"} - {maxCapacity || "∞"} kW
                                <button onClick={() => { setMinCapacity(""); setMaxCapacity(""); }} className="ml-1 font-bold text-sm">×</button>
                            </span>
                        )}
                        {showDuplicatesOnly && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 text-xs font-semibold border border-amber-500/20">
                                Duplicates Only
                                <button onClick={() => setShowDuplicatesOnly(false)} className="ml-1 font-bold text-sm">×</button>
                            </span>
                        )}
                    </div>
                )}

                {/* Table Container */}
                <div className="glass-card rounded-xl overflow-hidden shadow-xl border border-white/20">
                    <div className="bg-muted/30 px-6 py-3 border-b border-border flex justify-between items-center text-xs text-muted-foreground">
                        <span>{viewMode === 'profiles' ? 'CONSUMER_PROFILES_V1' : 'BILLING_RECORDS_V1'}</span>
                        <span>
                            {viewMode === 'profiles' ? filteredProfiles.length : filteredConsumers.length} RECORDS FOUND
                        </span>
                    </div>
                    <div className="p-0">
                        {viewMode === 'profiles' ? (
                            <div className="flex flex-col gap-4">
                                <div className="overflow-x-auto rounded-lg border border-table-border">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th className="w-16 text-center">S.No</th>
                                                <th className="w-28 text-center font-black">Arin ID</th>
                                                <th className="min-w-[200px]">Customer Name</th>
                                                <th className="w-36">Consumer No</th>
                                                <th className="w-28">Zone</th>
                                                <th className="w-28 text-center">Capacity (kW)</th>
                                                <th className="w-36">Inverter Details</th>
                                                <th className="w-32">Commission Date</th>
                                                <th className="w-24 text-center">Wifi</th>
                                                <th className="w-28 text-center">Status</th>
                                                <th className="w-32 text-center">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {isLoading ? (
                                                Array.from({ length: 8 }).map((_, i) => (
                                                    <tr key={i} className="animate-pulse">
                                                        <td className="text-center py-4"><div className="h-4 w-6 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                                                        <td><div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                                                        <td><div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" /></td>
                                                        <td><div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded font-mono" /></td>
                                                        <td><div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded" /></td>
                                                        <td><div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                                                        <td>
                                                            <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded mb-1" />
                                                            <div className="h-3.5 w-12 bg-slate-200 dark:bg-slate-800 rounded" />
                                                        </td>
                                                        <td><div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded" /></td>
                                                        <td><div className="h-5 w-12 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto" /></td>
                                                        <td><div className="h-5 w-16 bg-slate-200 dark:bg-slate-800 rounded-full mx-auto" /></td>
                                                        <td><div className="h-8 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg mx-auto" /></td>
                                                    </tr>
                                                ))
                                            ) : filteredProfiles.length === 0 ? (
                                                <tr>
                                                    <td colSpan={11} className="text-center py-8 text-muted-foreground">
                                                        No profiles found matching your criteria
                                                    </td>
                                                </tr>
                                            ) : (
                                                currentProfilesData.map((profile, index) => (
                                                    <tr key={profile.id || index} className="hover:bg-muted/50 transition-colors">
                                                        <td className="font-medium text-center">{(safeProfilePage - 1) * profilePageSize + index + 1}</td>
                                                        <td className="text-arin-teal font-black text-xs text-center">{profile.arin_id || "N/A"}</td>
                                                        <td className="font-semibold text-primary">{profile.customer_name}</td>
                                                        <td className="font-mono text-sm">{profile.consumer_number}</td>
                                                        <td>{profile.zone}</td>
                                                        <td className="text-center font-bold text-arin-dark">{profile.solar_capacity_kw} kW</td>
                                                        <td className="text-xs">
                                                            <div className="font-medium">{profile.inverter_name}</div>
                                                            <div className="text-muted-foreground text-[10px]">{profile.inverter_capacity} kW</div>
                                                        </td>
                                                        <td>{formatDate(profile.commission_date)}</td>
                                                        <td className="text-center">
                                                            {profile.wifi_available ? (
                                                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-bold gap-1 text-[10px]">
                                                                    <Wifi className="w-3 h-3" /> Yes
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-muted-foreground text-xs">No</span>
                                                            )}
                                                        </td>
                                                        <td className="text-center">
                                                            {profile.is_blacklisted ? (
                                                                <div className="flex flex-col items-center">
                                                                    <Badge 
                                                                        className="bg-red-500 text-white font-bold text-[10px]"
                                                                        title={profile.blacklisted_reason ? `Reason: ${profile.blacklisted_reason}` : "Blacklisted"}
                                                                    >
                                                                        Blacklisted
                                                                    </Badge>
                                                                    {profile.blacklisted_reason && (
                                                                        <span className="text-[9px] text-red-500 max-w-[100px] truncate block font-medium" title={profile.blacklisted_reason}>
                                                                            {profile.blacklisted_reason}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 font-bold text-[10px]">
                                                                    Active
                                                                </Badge>
                                                            )}
                                                        </td>
                                                        <td className="text-center">
                                                            <div className="flex justify-center gap-1.5">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => handleEditCustomer(profile)}
                                                                    className="px-2.5 py-1 h-8 rounded-lg hover:bg-secondary text-arin-teal border-slate-200"
                                                                >
                                                                    <Edit2 className="w-3 h-3 mr-1" /> Edit
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => handleViewHistory(profile)}
                                                                    className="px-2 py-1 h-8 rounded-lg hover:bg-secondary border-slate-200"
                                                                >
                                                                    <History className="w-3 h-3" />
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => handleDeleteCustomer(profile)}
                                                                    className="px-2 py-1 h-8 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-red-500 border-slate-200"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {totalPages > 1 && (
                                    <div className="flex justify-between items-center px-4 py-2 bg-muted/20 rounded-lg">
                                        <span className="text-sm text-muted-foreground">
                                            Showing {(safeProfilePage - 1) * profilePageSize + 1} to {Math.min(safeProfilePage * profilePageSize, filteredProfiles.length)} of {filteredProfiles.length} entries
                                        </span>
                                        <div className="flex gap-2">
                                            <button
                                                disabled={safeProfilePage === 1}
                                                onClick={() => setProfilePage(safeProfilePage - 1)}
                                                className="px-3 py-1 rounded bg-background border border-border disabled:opacity-50 text-sm"
                                            >
                                                Previous
                                            </button>
                                            <span className="px-3 py-1 text-sm flex items-center font-medium">
                                                Page {safeProfilePage} of {totalPages}
                                            </span>
                                            <button
                                                disabled={safeProfilePage === totalPages}
                                                onClick={() => setProfilePage(safeProfilePage + 1)}
                                                className="px-3 py-1 rounded bg-background border border-border disabled:opacity-50 text-sm"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <ConsumerTable
                                consumers={filteredConsumers}
                                onRowClick={handleRowClick}
                                isLoading={isLoading}
                            />
                        )}
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

            {/* Delete Customer Confirmation Dialog */}
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent className="max-w-md bg-card border-border shadow-2xl rounded-2xl p-6 glass-card">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-red-600 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                            Delete Consumer Profile
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground text-sm mt-2">
                            Are you sure you want to delete the profile for <strong>{customerToDelete?.customer_name}</strong> ({customerToDelete?.consumer_number})?
                            <br /><br />
                            This action will permanently delete their profile and all associated billing data from the database. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter className="mt-6 gap-2 flex justify-end">
                        <Button
                            variant="outline"
                            onClick={() => setIsDeleteOpen(false)}
                            disabled={isDeleting}
                            className="rounded-xl border-slate-200"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteCustomerSubmit}
                            disabled={isDeleting}
                            className="rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                "Delete Permanently"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Resolve Duplicates Dialog */}
            <Dialog open={isDeduplicateOpen} onOpenChange={setIsDeduplicateOpen}>
                <DialogContent className="max-w-2xl bg-card border-border shadow-2xl rounded-2xl p-6 glass-card">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold text-amber-600 flex items-center gap-2">
                            <AlertTriangle className="w-6 h-6 text-amber-500 animate-bounce" />
                            Resolve Duplicate Customer Profiles
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground text-sm mt-2">
                            The database has multiple customer profiles sharing the same <strong>Consumer Number</strong>.
                            Deduplication will merge these records by keeping the <strong>oldest customer profile</strong> (first created/lowest ID) and permanently deleting the duplicates.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 my-4">
                        <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-800 rounded-xl">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            <AlertTitle className="font-bold">Important Safeguard</AlertTitle>
                            <AlertDescription className="text-xs">
                                All duplicate backups under the same consumer number in the synchronization cache will also be cleaned up. This prevents duplicates from returning on subsequent imports.
                            </AlertDescription>
                        </Alert>

                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                            Detected Duplicates ({duplicateConsumerNumbers.size} Groups / {duplicateProfiles.length} Total Records)
                        </span>

                        <ScrollArea className="h-60 rounded-xl border border-border bg-slate-50 p-4">
                            <div className="space-y-4">
                                {Array.from(duplicateConsumerNumbers).map((cnum) => {
                                    const matching = duplicateProfiles.filter(p => p.consumer_number && p.consumer_number.trim() === cnum);
                                    // Sort by ID to see which one is kept (lowest ID first)
                                    const sortedMatching = [...matching].sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
                                    const keptProfile = sortedMatching[0];
                                    const deletedProfiles = sortedMatching.slice(1);

                                    return (
                                        <div key={cnum} className="border-b border-slate-200 last:border-0 pb-3 last:pb-0">
                                            <div className="flex justify-between items-center bg-slate-100 p-2 rounded-lg mb-2">
                                                <span className="font-mono text-sm font-bold text-slate-700">Consumer No: {cnum}</span>
                                                <Badge className="bg-amber-500 text-white text-[10px] font-bold">
                                                    {matching.length} instances
                                                </Badge>
                                            </div>
                                            <div className="pl-2 space-y-1.5">
                                                <div className="text-xs flex items-center gap-1.5 text-emerald-600 font-semibold">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                    Keep (Oldest ID: {keptProfile?.id || "N/A"}): <strong className="text-emerald-700">{keptProfile?.customer_name}</strong>
                                                </div>
                                                {deletedProfiles.map((dp, idx) => (
                                                    <div key={dp.id || idx} className="text-xs flex items-center gap-1.5 text-red-500">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                        Delete (ID: {dp.id || "N/A"}): <strong className="text-red-700">{dp.customer_name}</strong>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>

                    <DialogFooter className="border-t border-border/40 pt-4 gap-2 flex justify-end">
                        <Button
                            variant="outline"
                            onClick={() => setIsDeduplicateOpen(false)}
                            disabled={isDeduplicating}
                            className="rounded-xl border-slate-200"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleResolveDuplicates}
                            disabled={isDeduplicating}
                            className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold"
                        >
                            {isDeduplicating ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Deduplicating...
                                </>
                            ) : (
                                "Resolve & Deduplicate"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Manual Save Customer Dialog */}
            <Dialog open={isSaveOpen} onOpenChange={setIsSaveOpen}>
                <DialogContent className="max-w-2xl bg-card border-border shadow-2xl rounded-2xl p-6 glass-card">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-arin-teal to-arin-green">
                            {selectedCustomerForEdit ? "Edit Consumer Profile" : "Add Consumer Profile"}
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground text-sm">
                            Configure customer general specifications, technical values, and WiFi connectivity.
                        </DialogDescription>
                    </DialogHeader>

                    {saveError && (
                        <Alert variant="destructive" className="rounded-xl border border-destructive/20 bg-destructive/10">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Validation Error</AlertTitle>
                            <AlertDescription>{saveError}</AlertDescription>
                        </Alert>
                    )}

                    <Tabs defaultValue="general" className="mt-4">
                        <TabsList className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 border border-slate-200/50">
                            <TabsTrigger value="general" className="rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5" /> General Info
                            </TabsTrigger>
                            <TabsTrigger value="technical" className="rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <Wrench className="w-3.5 h-3.5" /> Technical & WiFi
                            </TabsTrigger>
                        </TabsList>

                        <div className="py-4 min-h-[350px] max-h-[450px] overflow-y-auto pr-1">
                            <TabsContent value="general" className="space-y-4 m-0">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="cust_name" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Customer Name *</Label>
                                        <Input
                                            id="cust_name"
                                            value={formData.customer_name}
                                            onChange={e => setFormData(prev => ({ ...prev, customer_name: e.target.value }))}
                                            placeholder="Enter Customer Name"
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="c_num" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Consumer Number *</Label>
                                        <Input
                                            id="c_num"
                                            value={formData.consumer_number}
                                            onChange={e => setFormData(prev => ({ ...prev, consumer_number: e.target.value }))}
                                            placeholder="12 Digit consumer number"
                                            className="rounded-xl font-mono"
                                            disabled={!!selectedCustomerForEdit} // Consumer number is key identifier
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="arin_id" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Arin ID</Label>
                                        <Input
                                            id="arin_id"
                                            value={formData.arin_id}
                                            onChange={e => setFormData(prev => ({ ...prev, arin_id: e.target.value }))}
                                            placeholder="ARIN-XXXX"
                                            className="rounded-xl font-mono"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="contact" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Contact Number</Label>
                                        <Input
                                            id="contact"
                                            value={formData.contact_number}
                                            onChange={e => setFormData(prev => ({ ...prev, contact_number: e.target.value }))}
                                            placeholder="Contact phone"
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="zone" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Zone</Label>
                                        <Input
                                            id="zone"
                                            value={formData.zone}
                                            onChange={e => setFormData(prev => ({ ...prev, zone: e.target.value }))}
                                            placeholder="Zone/Area Name"
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="map_link" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Map Link</Label>
                                        <Input
                                            id="map_link"
                                            value={formData.current_location_link}
                                            onChange={e => setFormData(prev => ({ ...prev, current_location_link: e.target.value }))}
                                            placeholder="Google Maps URL"
                                            className="rounded-xl"
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="addr" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Address</Label>
                                    <textarea
                                        id="addr"
                                        value={formData.address}
                                        onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
                                        placeholder="Full address details"
                                        rows={3}
                                        className="flex w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arin-teal"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4 border-t border-border/40 pt-3 mt-2">
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="portal_user" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Portal Username</Label>
                                        <Input
                                            id="portal_user"
                                            value={formData.portal_username || ""}
                                            onChange={e => setFormData(prev => ({ ...prev, portal_username: e.target.value }))}
                                            placeholder="Enter Portal Username"
                                            className="rounded-xl font-bold"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="portal_pass" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Portal Password</Label>
                                        <Input
                                            id="portal_pass"
                                            value={formData.portal_password || ""}
                                            onChange={e => setFormData(prev => ({ ...prev, portal_password: e.target.value }))}
                                            placeholder="Enter Portal Password"
                                            className="rounded-xl font-bold"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5 col-span-2">
                                        <div className="flex items-center gap-2">
                                            <input
                                                id="blacklisted"
                                                type="checkbox"
                                                checked={formData.is_blacklisted === 1}
                                                onChange={e => setFormData(prev => ({ ...prev, is_blacklisted: e.target.checked ? 1 : 0 }))}
                                                className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-500"
                                            />
                                            <Label htmlFor="blacklisted" className="text-xs font-bold uppercase tracking-wider text-red-600 cursor-pointer">Mark as Blacklisted / Inactive</Label>
                                        </div>
                                    </div>
                                    {formData.is_blacklisted === 1 && (
                                        <div className="flex flex-col gap-1.5 col-span-2 animate-in slide-in-from-top-2 duration-200">
                                            <Label htmlFor="blacklist_reason" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Blacklisted Reason</Label>
                                            <Input
                                                id="blacklist_reason"
                                                value={formData.blacklisted_reason || ""}
                                                onChange={e => setFormData(prev => ({ ...prev, blacklisted_reason: e.target.value }))}
                                                placeholder="Enter reason for blacklisting"
                                                className="rounded-xl font-bold"
                                            />
                                        </div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="technical" className="space-y-4 m-0">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="solar_cap" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Solar Capacity (kW)</Label>
                                        <Input
                                            id="solar_cap"
                                            type="number"
                                            value={formData.solar_capacity_kw}
                                            onChange={e => setFormData(prev => ({ ...prev, solar_capacity_kw: Number(e.target.value) }))}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="panel_count" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Solar Panel Count</Label>
                                        <Input
                                            id="panel_count"
                                            type="number"
                                            value={formData.solar_panel_count}
                                            onChange={e => setFormData(prev => ({ ...prev, solar_panel_count: Number(e.target.value) }))}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="panel_name" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Panel Make Brand</Label>
                                        <Input
                                            id="panel_name"
                                            value={formData.panel_name}
                                            onChange={e => setFormData(prev => ({ ...prev, panel_name: e.target.value }))}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="solar_wattpick" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Solar Panel Wp</Label>
                                        <Input
                                            id="solar_wattpick"
                                            type="number"
                                            value={formData.solar_wattpick}
                                            onChange={e => setFormData(prev => ({ ...prev, solar_wattpick: Number(e.target.value) }))}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="panel_cap" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Panel Capacity (kW)</Label>
                                        <Input
                                            id="panel_cap"
                                            type="number"
                                            value={formData.panel_capacity_kw}
                                            onChange={e => setFormData(prev => ({ ...prev, panel_capacity_kw: Number(e.target.value) }))}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="inverter_name" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Inverter Name / Brand</Label>
                                        <Input
                                            id="inverter_name"
                                            value={formData.inverter_name}
                                            onChange={e => setFormData(prev => ({ ...prev, inverter_name: e.target.value }))}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="inverter_cap" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Inverter Capacity</Label>
                                        <Input
                                            id="inverter_cap"
                                            type="number"
                                            value={formData.inverter_capacity}
                                            onChange={e => setFormData(prev => ({ ...prev, inverter_capacity: Number(e.target.value) }))}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="comm_date" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">System Commissioning date</Label>
                                        <Input
                                            id="comm_date"
                                            type="date"
                                            value={formData.commission_date}
                                            onChange={e => setFormData(prev => ({ ...prev, commission_date: e.target.value }))}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="panel_warranty_date" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Panel Warranty Expiry</Label>
                                        <Input
                                            id="panel_warranty_date"
                                            type="date"
                                            value={formData.panel_warranty_expiry_date || ""}
                                            onChange={e => setFormData(prev => ({ ...prev, panel_warranty_expiry_date: e.target.value }))}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="inverter_warranty_date" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Inverter Warranty Expiry</Label>
                                        <Input
                                            id="inverter_warranty_date"
                                            type="date"
                                            value={formData.inverter_warranty_expiry_date || ""}
                                            onChange={e => setFormData(prev => ({ ...prev, inverter_warranty_expiry_date: e.target.value }))}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="system_warranty_date" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">System Warranty Expiry</Label>
                                        <Input
                                            id="system_warranty_date"
                                            type="date"
                                            value={formData.system_warranty_expiry_date || ""}
                                            onChange={e => setFormData(prev => ({ ...prev, system_warranty_expiry_date: e.target.value }))}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="general_warranty_date" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">General Warranty Expiry</Label>
                                        <Input
                                            id="general_warranty_date"
                                            type="date"
                                            value={formData.general_warranty_expiry_date || ""}
                                            onChange={e => setFormData(prev => ({ ...prev, general_warranty_expiry_date: e.target.value }))}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5 col-span-2 border-t border-border/40 pt-3 mt-1">
                                        <div className="flex items-center gap-2">
                                            <input
                                                id="wifi_av"
                                                type="checkbox"
                                                checked={formData.wifi_available === 1}
                                                onChange={e => setFormData(prev => ({ ...prev, wifi_available: e.target.checked ? 1 : 0 }))}
                                                className="w-4 h-4 rounded border-gray-300 text-arin-teal focus:ring-arin-teal"
                                            />
                                            <Label htmlFor="wifi_av" className="text-xs font-bold uppercase tracking-wider text-slate-700 cursor-pointer">WiFi Connection Available</Label>
                                        </div>
                                    </div>

                                    {formData.wifi_available === 1 && (
                                        <>
                                            <div className="flex flex-col gap-1.5 animate-in slide-in-from-top-2 duration-200">
                                                <Label htmlFor="wifi_id" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">WiFi SSID / ID</Label>
                                                <Input
                                                    id="wifi_id"
                                                    value={formData.wifi_id}
                                                    onChange={e => setFormData(prev => ({ ...prev, wifi_id: e.target.value }))}
                                                    placeholder="SSID Name"
                                                    className="rounded-xl"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1.5 animate-in slide-in-from-top-2 duration-200">
                                                <Label htmlFor="wifi_pass" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">WiFi Password</Label>
                                                <Input
                                                    id="wifi_pass"
                                                    value={formData.wifi_password}
                                                    onChange={e => setFormData(prev => ({ ...prev, wifi_password: e.target.value }))}
                                                    placeholder="Password"
                                                    className="rounded-xl"
                                                />
                                            </div>
                                        </>
                                    )}

                                    {/* Maintenance / Visits Section */}
                                    <div className="flex flex-col gap-1.5 col-span-2 border-t border-border/40 pt-3 mt-2">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Maintenance / Visits</h4>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="visits_per_year" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">No. of Visits per year</Label>
                                        <Input
                                            id="visits_per_year"
                                            type="number"
                                            value={formData.visits_per_year}
                                            onChange={e => setFormData(prev => ({ ...prev, visits_per_year: Number(e.target.value) }))}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="tenure" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tenure of Maintenance</Label>
                                        <Input
                                            id="tenure"
                                            value={formData.maintenance_tenure}
                                            onChange={e => setFormData(prev => ({ ...prev, maintenance_tenure: e.target.value }))}
                                            placeholder="e.g. 5 Years"
                                            className="rounded-xl"
                                        />
                                    </div>
                                </div>
                            </TabsContent>
                        </div>
                    </Tabs>

                    <DialogFooter className="border-t border-border/40 pt-4 gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setIsSaveOpen(false)}
                            className="rounded-xl border border-border"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveCustomerSubmit}
                            disabled={isSaving}
                            className="bg-gradient-to-r from-arin-teal to-arin-green hover:opacity-90 text-white font-semibold rounded-xl"
                        >
                            {isSaving && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                            {isSaving ? "Saving..." : "Save Profile"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Import Consumers Dialog */}
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                <DialogContent className="max-w-xl bg-card border-border shadow-2xl rounded-2xl p-6 glass-card">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-arin-teal to-arin-green">
                            Import Consumers
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground text-sm">
                            Upload a CSV or Excel file containing consumer profiles. New records will be inserted and matching ones will be updated.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 mt-4">
                        {/* Download Template Button */}
                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Template File</span>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleDownloadTemplate}
                                className="flex items-center justify-center gap-2 border-dashed border-arin-teal/50 text-arin-teal hover:bg-arin-teal/5 transition-all text-sm font-semibold rounded-xl py-6"
                            >
                                <Download className="w-4 h-4" />
                                Download Excel/CSV Template
                            </Button>
                        </div>

                        {/* File Upload Zone */}
                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select File</span>
                            {!selectedFile ? (
                                <div
                                    onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
                                    onDragLeave={() => setIsDragActive(false)}
                                    onDrop={(e) => { e.preventDefault(); setIsDragActive(false); if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]); }}
                                    className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all duration-300 min-h-[160px] ${isDragActive
                                            ? 'border-arin-teal bg-arin-teal/5 shadow-inner scale-[0.99]'
                                            : 'border-muted hover:border-arin-teal hover:bg-accent/5'
                                        }`}
                                    onClick={() => document.getElementById("file-import-upload")?.click()}
                                >
                                    <input
                                        id="file-import-upload"
                                        type="file"
                                        accept=".csv, .xlsx, .xls"
                                        className="hidden"
                                        onChange={(e) => { if (e.target.files && e.target.files[0]) handleFileSelect(e.target.files[0]); }}
                                    />
                                    <Upload className="w-10 h-10 text-muted-foreground mb-3 animate-pulse" />
                                    <p className="font-semibold text-center text-foreground text-sm">Drag and drop file here, or click to browse</p>
                                    <p className="text-xs text-muted-foreground mt-1">Supports CSV, XLS, XLSX formats</p>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between border border-border p-4 rounded-xl bg-accent/10">
                                    <div className="flex items-center gap-3">
                                        <FileText className="w-8 h-8 text-arin-teal" />
                                        <div>
                                            <p className="font-semibold text-foreground text-sm truncate max-w-[280px]">{selectedFile.name}</p>
                                            <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => { setSelectedFile(null); setImportResult(null); setImportError(null); }}
                                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                                    >
                                        Remove
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Error Notification */}
                        {importError && (
                            <Alert variant="destructive" className="rounded-xl border border-destructive/20 bg-destructive/10">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Import Error</AlertTitle>
                                <AlertDescription className="text-sm">{importError}</AlertDescription>
                            </Alert>
                        )}

                        {/* Summary / Progress Section */}
                        {isImporting && (
                            <div className="flex flex-col items-center justify-center p-6 space-y-3">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-arin-teal"></div>
                                <p className="text-sm font-semibold text-muted-foreground">Processing and importing records...</p>
                            </div>
                        )}

                        {importResult && (
                            <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Import Summary</span>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                                        <p className="text-xs text-emerald-600 font-semibold uppercase">Imported</p>
                                        <p className="text-2xl font-bold text-emerald-500 mt-1">{importResult.imported}</p>
                                    </div>
                                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
                                        <p className="text-xs text-blue-600 font-semibold uppercase">Updated</p>
                                        <p className="text-2xl font-bold text-blue-500 mt-1">{importResult.updated}</p>
                                    </div>
                                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                                        <p className="text-xs text-amber-600 font-semibold uppercase">Skipped</p>
                                        <p className="text-2xl font-bold text-amber-500 mt-1">{importResult.skipped}</p>
                                    </div>
                                </div>

                                {importResult.warnings && importResult.warnings.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                            Import Log / Warnings ({importResult.warnings.length})
                                        </p>
                                        <ScrollArea className="h-28 rounded-xl border border-border bg-slate-950 p-3">
                                            <div className="space-y-1.5 text-amber-400 font-mono text-[11px] leading-relaxed">
                                                {importResult.warnings.map((warn: string, idx: number) => (
                                                    <div key={idx} className="font-mono">⚠ {warn}</div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Import Dialog Action Button */}
                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => { setIsImportOpen(false); setSelectedFile(null); setImportResult(null); setImportError(null); }}
                                className="rounded-xl border border-border"
                            >
                                Close
                            </Button>
                            {selectedFile && !importResult && (
                                <Button
                                    onClick={handleImportSubmit}
                                    disabled={isImporting}
                                    className="bg-gradient-to-r from-arin-teal to-arin-green hover:opacity-90 text-white font-semibold rounded-xl"
                                >
                                    {isImporting && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                                    {isImporting ? "Importing..." : "Start Import"}
                                </Button>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ConsumerConnect;
