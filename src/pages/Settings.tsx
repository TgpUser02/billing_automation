import React, { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { confirmAction } from "@/lib/swal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Settings as SettingsIcon,
    Layers,
    Plus,
    Trash2,
    Search,
    Shield,
    Key,
    Tag,
    Cpu,
    MapPin,
    Wrench,
    Zap,
    Loader2,
    CheckCircle2,
    Sparkles,
    AlertCircle,
    Database,
    ShieldCheck,
    Sun,
    Calendar,
    Edit2,
    Check,
    HardDrive,
    UploadCloud,
    RotateCcw,
    Download,
    Clock,
    FileArchive,
    ExternalLink,
    Server,
    RefreshCw,
    FileText,
    Image as ImageIcon,
    Cloud,
    Folder,
    FileSpreadsheet
} from "lucide-react";

interface LookupItem {
    id: number;
    category: string;
    value: string;
    label: string;
    is_active: number;
    validity_years?: number | null;
}

const CATEGORIES = [
    {
        id: "panel_name",
        label: "Panel Brands",
        singular: "Panel Brand",
        icon: Tag,
        color: "from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
        badgeColor: "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/40",
        placeholder: "e.g. Adani, NovaSys, Waaree, ECE, Tata, Pahal, Awada, Vikram, Gautam, Asot, Rayzon, Premier, Ikon",
        defaultValidity: 12,
        description: "Brands available in consumer profiles, generator, and Excel template dropdowns with default warranty validity."
    },
    {
        id: "inverter_name",
        label: "Inverter Brands",
        singular: "Inverter Brand",
        icon: Cpu,
        color: "from-blue-500/20 to-cyan-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
        badgeColor: "bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800/40",
        placeholder: "e.g. Solaryaan, Cathod Power, Solaryaan Microinverter, Vsole, Goodwe, Okaya, Xwatt, Polycab, UTL, Havells, Growatt, Solax, Solis",
        defaultValidity: 5,
        description: "Inverter makes selectable across the entire billing automation platform with default warranty validity."
    },
    {
        id: "panel_type",
        label: "Panel Types",
        singular: "Panel Type",
        icon: Layers,
        color: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
        badgeColor: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40",
        placeholder: "e.g. Topcon, Bifacial, Monocrystalline, Polycrystalline",
        description: "Solar panel cell and module architectures."
    },
    {
        id: "zone",
        label: "Zones & Regions",
        singular: "Zone / Region",
        icon: MapPin,
        color: "from-indigo-500/20 to-purple-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400",
        badgeColor: "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/40",
        placeholder: "e.g. Katol, Umred, Nagpur Rural, Hingna, Wardha, Saoner",
        description: "Operational territories for consumer segmentation and filter presets."
    },
    {
        id: "maintenance_tenure",
        label: "Maintenance Tenures",
        singular: "Tenure Option",
        icon: Wrench,
        color: "from-rose-500/20 to-pink-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400",
        badgeColor: "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/40",
        placeholder: "e.g. 1 Year, 2 Years, 3 Years, 5 Years, 10 Years, Lifetime AMC",
        description: "AMC and service package terms shown in billing and warranty tabs."
    },
    {
        id: "tariff_category",
        label: "Tariff Categories",
        singular: "Tariff Category",
        icon: Zap,
        color: "from-purple-500/20 to-violet-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400",
        badgeColor: "bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800/40",
        placeholder: "e.g. LT-I (Residential), LT-II (Commercial), Industrial, Agricultural",
        description: "Electricity tariff classifications for bill rate calculations."
    }
];

export default function Settings() {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState("lookups");
    const [selectedCategory, setSelectedCategory] = useState("panel_name");

    // Lookups data
    const [rawLookups, setRawLookups] = useState<LookupItem[]>([]);
    const [isLoadingLookups, setIsLoadingLookups] = useState(true);
    const [searchFilter, setSearchFilter] = useState("");
    const [newOptionValue, setNewOptionValue] = useState("");
    const [newOptionValidity, setNewOptionValidity] = useState<string>("25");
    const [isAddingOption, setIsAddingOption] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    // Editing inline validity
    const [editingValidityId, setEditingValidityId] = useState<number | null>(null);
    const [editValidityVal, setEditValidityVal] = useState<string>("");
    const [isSavingValidity, setIsSavingValidity] = useState(false);

    // Category Bulk Validity
    const [bulkValidityYears, setBulkValidityYears] = useState<string>("25");
    const [isBulkUpdating, setIsBulkUpdating] = useState(false);

    // MSEDCL Portal Users
    const [portalUsers, setPortalUsers] = useState<any[]>([]);
    const [newPortalUser, setNewPortalUser] = useState("");
    const [newPortalPass, setNewPortalPass] = useState("");
    const [isSavingPortalUser, setIsSavingPortalUser] = useState(false);

    // Change Password
    const [currentPassword, setCurrentPassword] = useState("");
    const [ownNewPassword, setOwnNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isChangingPass, setIsChangingPass] = useState(false);

    // Database & Auto-Backup State
    const [dbStats, setDbStats] = useState<any>(null);
    const [dbBackups, setDbBackups] = useState<any[]>([]);
    const [isLoadingBackups, setIsLoadingBackups] = useState(false);
    const [isCreatingBackup, setIsCreatingBackup] = useState(false);
    const [isSavingBackupSettings, setIsSavingBackupSettings] = useState(false);
    const [isTestingDrive, setIsTestingDrive] = useState(false);
    const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
    const [autoBackupFreq, setAutoBackupFreq] = useState("daily");
    const [autoBackupTime, setAutoBackupTime] = useState("02:00");
    const [autoBackupRetention, setAutoBackupRetention] = useState("30");

    // Google Drive Synchronized Files State
    const [driveFiles, setDriveFiles] = useState<any[]>([]);
    const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);
    const [driveSearchQuery, setDriveSearchQuery] = useState("");
    const [driveFilterType, setDriveFilterType] = useState("all");

    const fetchDriveFiles = async () => {
        setIsLoadingDriveFiles(true);
        try {
            const res = await api.getDriveFiles(undefined, undefined, 200);
            if (res.data && Array.isArray(res.data)) {
                setDriveFiles(res.data);
            }
        } catch (err: any) {
            console.error("Failed to load drive files:", err);
        } finally {
            setIsLoadingDriveFiles(false);
        }
    };
    const fetchLookups = async () => {
        setIsLoadingLookups(true);
        try {
            const res = await api.getLookups();
            if (res.raw && Array.isArray(res.raw)) {
                setRawLookups(res.raw);
            }
        } catch (err: any) {
            console.error("Failed to load lookups:", err);
            toast({
                title: "Failed to load options",
                description: err.message || "Could not fetch master lookups",
                variant: "destructive"
            });
        } finally {
            setIsLoadingLookups(false);
        }
    };

    // Fetch portal credentials
    const fetchPortalUsers = async () => {
        try {
            const res = await api.getPortalCredentials();
            if (res.data && Array.isArray(res.data)) {
                setPortalUsers(res.data);
            }
        } catch (err: any) {
            console.error("Failed to load portal credentials:", err);
        }
    };

    // Fetch DB Backup Info & Stats
    const fetchDbBackupsAndStats = async () => {
        setIsLoadingBackups(true);
        try {
            const [statsRes, backupsRes] = await Promise.all([
                api.getDbStats(),
                api.getDbBackups()
            ]);
            if (statsRes) {
                setDbStats(statsRes);
                setAutoBackupEnabled(statsRes.auto_backup_enabled ?? true);
                setAutoBackupFreq(statsRes.auto_backup_frequency || "daily");
                setAutoBackupTime(statsRes.auto_backup_time || "02:00");
                setAutoBackupRetention(String(statsRes.auto_backup_retention_days || 30));
            }
            if (backupsRes && Array.isArray(backupsRes.data)) {
                setDbBackups(backupsRes.data);
            }
        } catch (err: any) {
            console.error("Failed to load database backup info:", err);
        } finally {
            setIsLoadingBackups(false);
        }
    };

    const handleCreateBackup = async () => {
        setIsCreatingBackup(true);
        try {
            const res = await api.createDbBackup();
            if (res.status === "success") {
                toast({
                    title: "Backup Created Successfully",
                    description: `Archive: ${res.filename} (${res.file_size}). Cloud Sync: ${res.drive_sync_status}`,
                    className: "bg-emerald-600 text-white font-bold"
                });
                await fetchDbBackupsAndStats();
            } else {
                toast({
                    title: "Backup Notice",
                    description: res.message || "Backup completed with notices",
                    variant: "destructive"
                });
            }
        } catch (err: any) {
            toast({
                title: "Backup Failed",
                description: err.message || "Failed to create database backup",
                variant: "destructive"
            });
        } finally {
            setIsCreatingBackup(false);
        }
    };

    const handleSaveBackupSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingBackupSettings(true);
        try {
            await api.updateDbBackupSettings({
                enabled: autoBackupEnabled,
                frequency: autoBackupFreq,
                time: autoBackupTime,
                retention_days: parseInt(autoBackupRetention) || 30
            });
            toast({
                title: "Backup Policy Updated",
                description: "Auto-backup schedule and retention rules saved.",
                className: "bg-emerald-600 text-white font-bold"
            });
            await fetchDbBackupsAndStats();
        } catch (err: any) {
            toast({
                title: "Failed to Save",
                description: err.message || "Could not update backup settings",
                variant: "destructive"
            });
        } finally {
            setIsSavingBackupSettings(false);
        }
    };

    const handleTestDrive = async () => {
        setIsTestingDrive(true);
        try {
            const res = await api.testDriveConnection();
            if (res.connected) {
                toast({
                    title: "Google Drive Connected!",
                    description: `Account: ${res.user_display_name || res.user_email} (${res.storage_usage_mb} MB used / ${res.storage_limit_mb} MB)`,
                    className: "bg-emerald-600 text-white font-bold"
                });
            } else {
                toast({
                    title: "Google Drive Issue",
                    description: res.message || "Could not connect to Google Drive.",
                    variant: "destructive"
                });
            }
        } catch (err: any) {
            toast({
                title: "Drive Test Failed",
                description: err.message || "Failed to reach Google Drive API.",
                variant: "destructive"
            });
        } finally {
            setIsTestingDrive(false);
        }
    };

    useEffect(() => {
        fetchLookups();
        fetchPortalUsers();
        fetchDbBackupsAndStats();
        fetchDriveFiles();
    }, []);

    useEffect(() => {
        if (activeTab === "drive") {
            fetchDriveFiles();
        } else if (activeTab === "backups") {
            fetchDbBackupsAndStats();
        }
    }, [activeTab]);

    const driveCounts = useMemo(() => {
        let pdfs = 0, images = 0, sheets = 0, backups = 0;
        driveFiles.forEach(f => {
            const isSheet = f.file_name?.match(/\.(xlsx|xls|csv)$/i) || f.mime_type?.includes("spreadsheet") || f.mime_type === "text/csv";
            const isBackup = f.category === "database_backup" || f.category === "db_backup" || f.file_name?.includes("backup");
            const isImg = f.file_type === "image" || f.file_name?.match(/\.(png|jpg|jpeg)$/i) || f.category === "bill_image";
            const isPdf = (f.file_type === "pdf" || f.file_name?.endsWith(".pdf") || f.category === "bill_pdf") && !isSheet;
            
            if (isBackup) backups++;
            else if (isSheet) sheets++;
            else if (isImg) images++;
            else if (isPdf) pdfs++;
        });
        return { pdfs, images, sheets, backups, total: driveFiles.length };
    }, [driveFiles]);

    const filteredDriveFiles = useMemo(() => {
        return driveFiles.filter(f => {
            const matchSearch = !driveSearchQuery || 
                (f.file_name && f.file_name.toLowerCase().includes(driveSearchQuery.toLowerCase())) ||
                (f.consumer_number && String(f.consumer_number).includes(driveSearchQuery)) ||
                (f.category && f.category.toLowerCase().includes(driveSearchQuery.toLowerCase()));
            
            const isSheet = f.file_name?.match(/\.(xlsx|xls|csv)$/i) || f.mime_type?.includes("spreadsheet") || f.mime_type === "text/csv";
            const isBackup = f.category === "database_backup" || f.category === "db_backup" || f.file_name?.includes("backup");
            const isImg = f.file_type === "image" || f.file_name?.match(/\.(png|jpg|jpeg)$/i) || f.category === "bill_image";
            const isPdf = (f.file_type === "pdf" || f.file_name?.endsWith(".pdf") || f.category === "bill_pdf") && !isSheet;

            const matchType = driveFilterType === "all" || 
                (driveFilterType === "pdf" && isPdf) ||
                (driveFilterType === "image" && isImg) ||
                (driveFilterType === "sheet" && isSheet) ||
                (driveFilterType === "backup" && isBackup);

            return matchSearch && matchType;
        });
    }, [driveFiles, driveSearchQuery, driveFilterType]);

    // Active category config
    const currentCategoryConfig = useMemo(() => {
        const found = CATEGORIES.find(c => c.id === selectedCategory) || CATEGORIES[0];
        return found;
    }, [selectedCategory]);

    useEffect(() => {
        if (selectedCategory === "panel_name") {
            setNewOptionValidity("25");
            setBulkValidityYears("25");
        } else if (selectedCategory === "inverter_name") {
            setNewOptionValidity("8");
            setBulkValidityYears("8");
        }
    }, [selectedCategory]);

    const filteredOptions = useMemo(() => {
        if (selectedCategory === "zone") return [];
        const categoryItems = rawLookups.filter(item => item.category === selectedCategory);
        if (!searchFilter.trim()) return categoryItems;
        const q = searchFilter.toLowerCase();
        return categoryItems.filter(item =>
            item.value.toLowerCase().includes(q) || item.label.toLowerCase().includes(q)
        );
    }, [rawLookups, selectedCategory, searchFilter]);



    // Add option with validity
    const handleAddOption = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (selectedCategory === "zone") return;
        const trimmed = newOptionValue.trim();
        if (!trimmed) {
            toast({
                title: "Value required",
                description: `Please enter a name for the new ${currentCategoryConfig.singular.toLowerCase()}.`,
                variant: "destructive"
            });
            return;
        }

        const exists = rawLookups.some(
            item => item.category === selectedCategory && item.value.toLowerCase() === trimmed.toLowerCase()
        );
        if (exists) {
            toast({
                title: "Option already exists",
                description: `"${trimmed}" is already present in ${currentCategoryConfig.label}.`,
                variant: "destructive"
            });
            return;
        }

        setIsAddingOption(true);
        try {
            const valYears = (selectedCategory === "panel_name" || selectedCategory === "inverter_name")
                ? parseInt(newOptionValidity) || currentCategoryConfig.defaultValidity || 5
                : undefined;

            await api.addLookup(selectedCategory, trimmed, trimmed, valYears);
            toast({
                title: "Option Added Successfully",
                description: `Added "${trimmed}" (${valYears ? `${valYears} Yrs validity` : ''}) to ${currentCategoryConfig.label}.`,
                className: "bg-emerald-600 text-white font-bold"
            });
            setNewOptionValue("");
            await fetchLookups();
        } catch (err: any) {
            console.error("Failed to add option:", err);
            toast({
                title: "Failed to add",
                description: err.message || "Could not register option.",
                variant: "destructive"
            });
        } finally {
            setIsAddingOption(false);
        }
    };

    // Save inline validity years
    const handleSaveInlineValidity = async (item: LookupItem) => {
        const parsed = parseInt(editValidityVal);
        if (isNaN(parsed) || parsed <= 0) {
            toast({ title: "Invalid value", description: "Validity years must be greater than 0.", variant: "destructive" });
            return;
        }

        setIsSavingValidity(true);
        try {
            await api.updateLookup(item.id, { validity_years: parsed });
            toast({
                title: "Validity Updated",
                description: `Set validity duration for ${item.label} to ${parsed} Years.`,
                className: "bg-emerald-600 text-white font-bold"
            });
            setEditingValidityId(null);
            await fetchLookups();
        } catch (err: any) {
            toast({ title: "Update Failed", description: err.message, variant: "destructive" });
        } finally {
            setIsSavingValidity(false);
        }
    };

    // Bulk category validity update
    const handleBulkCategoryValidity = async () => {
        const years = parseInt(bulkValidityYears);
        if (isNaN(years) || years <= 0) {
            toast({ title: "Invalid value", description: "Please enter valid number of years.", variant: "destructive" });
            return;
        }

        const count = rawLookups.filter(i => i.category === selectedCategory).length;
        const confirmed = await confirmAction({
            title: `Bulk Update ${currentCategoryConfig.label}?`,
            text: `This will set the default validity duration to ${years} Years for ALL ${count} ${currentCategoryConfig.label.toLowerCase()}.`,
            icon: "question",
            confirmButtonText: `Yes, Set all to ${years} Yrs`,
            cancelButtonText: "Cancel"
        });

        if (!confirmed) return;

        setIsBulkUpdating(true);
        try {
            const res = await api.bulkUpdateCategoryValidity(selectedCategory, years);
            toast({
                title: "Bulk Update Complete",
                description: res.message || `Updated all ${currentCategoryConfig.label.toLowerCase()} to ${years} Years.`,
                className: "bg-emerald-600 text-white font-bold"
            });
            await fetchLookups();
        } catch (err: any) {
            toast({ title: "Bulk Update Failed", description: err.message, variant: "destructive" });
        } finally {
            setIsBulkUpdating(false);
        }
    };

    // Remove lookup option
    const handleRemoveOption = async (item: LookupItem) => {
        const confirmed = await confirmAction({
            title: `Remove "${item.label}"?`,
            text: `Are you sure you want to delete this option from ${currentCategoryConfig.label}?`,
            icon: "warning",
            confirmButtonText: "Yes, Remove",
            cancelButtonText: "Cancel"
        });

        if (!confirmed) return;

        setDeletingId(item.id);
        try {
            await api.deleteLookup(item.id);
            toast({
                title: "Option Removed",
                description: `Removed "${item.label}" from ${currentCategoryConfig.label}.`,
            });
            await fetchLookups();
        } catch (err: any) {
            toast({
                title: "Delete Failed",
                description: err.message || "Could not remove option.",
                variant: "destructive"
            });
        } finally {
            setDeletingId(null);
        }
    };



    // Add portal user
    const handleAddPortalUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPortalUser.trim() || !newPortalPass.trim()) {
            toast({ title: "Missing details", description: "Username and password required.", variant: "destructive" });
            return;
        }

        setIsSavingPortalUser(true);
        try {
            await api.savePortalCredential(newPortalUser.trim(), newPortalPass.trim(), "Custom Portal User");
            toast({
                title: "Portal Account Saved",
                description: `Saved login for ${newPortalUser.trim()}`,
                className: "bg-emerald-600 text-white font-bold"
            });
            setNewPortalUser("");
            setNewPortalPass("");
            await fetchPortalUsers();
        } catch (err: any) {
            toast({ title: "Failed to save account", description: err.message, variant: "destructive" });
        } finally {
            setIsSavingPortalUser(false);
        }
    };

    // Remove portal user
    const handleRemovePortalUser = async (username: string) => {
        const confirmed = await confirmAction({
            title: `Delete Portal Account?`,
            text: `Delete saved login credential for "${username}"?`,
            icon: "warning",
            confirmButtonText: "Yes, Delete",
            cancelButtonText: "Cancel"
        });
        if (!confirmed) return;

        try {
            await api.deletePortalCredential(username);
            toast({ title: "Deleted", description: `Account "${username}" removed.` });
            await fetchPortalUsers();
        } catch (err: any) {
            toast({ title: "Delete Failed", description: err.message, variant: "destructive" });
        }
    };

    // Change password
    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentPassword || !ownNewPassword || !confirmPassword) {
            toast({ title: "Error", description: "All fields are required", variant: "destructive" });
            return;
        }
        if (ownNewPassword !== confirmPassword) {
            toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
            return;
        }
        if (ownNewPassword.length < 6) {
            toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
            return;
        }

        setIsChangingPass(true);
        try {
            await api.changePassword(currentPassword, ownNewPassword);
            toast({
                title: "Password Changed",
                description: "Your login password has been updated.",
                className: "bg-emerald-600 text-white font-bold"
            });
            setCurrentPassword("");
            setOwnNewPassword("");
            setConfirmPassword("");
        } catch (error: any) {
            toast({ title: "Update Failed", description: error.message, variant: "destructive" });
        } finally {
            setIsChangingPass(false);
        }
    };

    const hasValidity = selectedCategory === "panel_name" || selectedCategory === "inverter_name";
    const isZone = selectedCategory === "zone";

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-accent/5 to-secondary/20 pb-16">
            <main className="w-full px-4 lg:px-8 py-6 space-y-6">
                {/* Page Title */}
                <PageHeader
                    title="Settings & Master Data"
                    description="Configure master brand lists, warranty policies, portal accounts, and security."
                    icon={SettingsIcon}
                />

                {/* Main Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 w-full">
                    <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full bg-card border border-border p-1.5 rounded-2xl shadow-sm gap-1">
                        <TabsTrigger value="lookups" className="flex items-center justify-center gap-2 rounded-xl text-xs font-bold py-2.5">
                            <Database className="w-4 h-4 text-emerald-600" />
                            Dropdowns
                        </TabsTrigger>
                        <TabsTrigger value="drive" className="flex items-center justify-center gap-2 rounded-xl text-xs font-bold py-2.5">
                            <Cloud className="w-4 h-4 text-blue-600" />
                            Drive Files
                            {driveCounts.total > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                                    {driveCounts.total}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="backups" className="flex items-center justify-center gap-2 rounded-xl text-xs font-bold py-2.5">
                            <HardDrive className="w-4 h-4 text-cyan-600" />
                            DB & Backups
                        </TabsTrigger>
                        <TabsTrigger value="portal" className="flex items-center justify-center gap-2 rounded-xl text-xs font-bold py-2.5">
                            <Shield className="w-4 h-4 text-blue-600" />
                            Portal Logins
                        </TabsTrigger>
                        <TabsTrigger value="security" className="flex items-center justify-center gap-2 rounded-xl text-xs font-bold py-2.5">
                            <Key className="w-4 h-4 text-purple-600" />
                            Security
                        </TabsTrigger>
                    </TabsList>

                    {/* TAB 1: MASTER DROPDOWNS & BRAND MANAGER */}
                    <TabsContent value="lookups" className="space-y-6 animate-in fade-in-50 duration-300">
                        {/* Category Selector Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            {CATEGORIES.map((cat) => {
                                const Icon = cat.icon;
                                const isSelected = selectedCategory === cat.id;
                                const count = cat.id === "zone" ? 0 : rawLookups.filter(i => i.category === cat.id).length;
                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedCategory(cat.id);
                                            setSearchFilter("");
                                            setEditingValidityId(null);
                                        }}
                                        className={`flex flex-col items-start p-4 rounded-2xl border transition-all text-left relative overflow-hidden ${
                                            isSelected
                                                ? "bg-card border-emerald-500 ring-2 ring-emerald-500/20 shadow-md shadow-emerald-500/5 scale-[1.02]"
                                                : "bg-card/70 border-border/60 hover:border-border hover:bg-card hover:shadow-sm"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between w-full mb-2">
                                            <div className={`p-2 rounded-xl border bg-gradient-to-br ${cat.color}`}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <Badge variant="secondary" className="font-mono text-[10px] font-bold px-1.5 py-0.5">
                                                {count}
                                            </Badge>
                                        </div>
                                        <span className="text-xs font-black text-foreground tracking-tight line-clamp-1">{cat.label}</span>
                                        <span className="text-[10px] text-muted-foreground mt-0.5">{cat.singular}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Main Category Card */}
                        <div className="bg-card border border-border rounded-3xl p-6 lg:p-8 shadow-xl space-y-6">
                            {/* Card Header & Description */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border/60">
                                <div className="flex items-center gap-3.5">
                                    <div className={`p-3 rounded-2xl border bg-gradient-to-br ${currentCategoryConfig.color}`}>
                                        <currentCategoryConfig.icon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-foreground flex items-center gap-2">
                                            {currentCategoryConfig.label} Manager
                                            <Badge variant="outline" className="text-xs font-bold border-emerald-500/30 text-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/40">
                                                {isZone ? "0 options" : `${filteredOptions.length} of ${rawLookups.filter(i => i.category === selectedCategory).length} options`}
                                            </Badge>
                                        </h2>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {isZone ? "Zone and region management." : currentCategoryConfig.description}
                                        </p>
                                    </div>
                                </div>

                                {/* Bulk Validity Duration Bar for Panels & Inverters */}
                                {hasValidity && (
                                    <div className="flex items-center gap-2 bg-muted/40 p-2 rounded-2xl border border-border/70">
                                        <span className="text-xs font-bold text-muted-foreground whitespace-nowrap pl-2">
                                            Bulk Default:
                                        </span>
                                        <Input
                                            type="number"
                                            min="1"
                                            max="50"
                                            value={bulkValidityYears}
                                            onChange={e => setBulkValidityYears(e.target.value)}
                                            className="w-16 h-9 text-center font-bold text-sm bg-background rounded-xl"
                                        />
                                        <span className="text-xs font-bold text-muted-foreground">Yrs</span>
                                        <Button
                                            type="button"
                                            size="sm"
                                            disabled={isBulkUpdating}
                                            onClick={handleBulkCategoryValidity}
                                            className="h-9 px-3 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-xl shadow-sm"
                                        >
                                            {isBulkUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Apply to All"}
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Add Option Form & Search Bar */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                                {/* Add Option Bar */}
                                <form onSubmit={handleAddOption} className="lg:col-span-8 flex flex-col sm:flex-row gap-2.5">
                                    <div className="relative flex-1">
                                        <Input
                                            type="text"
                                            placeholder={isZone ? "Adding new zones is disabled" : currentCategoryConfig.placeholder}
                                            value={isZone ? "" : newOptionValue}
                                            onChange={e => !isZone && setNewOptionValue(e.target.value)}
                                            disabled={isZone || isAddingOption}
                                            className={`h-12 rounded-xl bg-background border-border pr-4 font-semibold text-sm shadow-sm ${
                                                isZone ? "opacity-60 cursor-not-allowed bg-muted/20 select-none" : ""
                                            }`}
                                        />
                                    </div>

                                    {/* Validity Years Input for Panels and Inverters */}
                                    {hasValidity && !isZone && (
                                        <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-3 h-12 shrink-0">
                                            <span className="text-[10px] font-black text-muted-foreground uppercase">Validity:</span>
                                            <Input
                                                type="number"
                                                min="1"
                                                max="50"
                                                value={newOptionValidity}
                                                onChange={e => setNewOptionValidity(e.target.value)}
                                                className="w-14 h-8 p-1 text-center font-bold text-xs border-0 shadow-none focus-visible:ring-0"
                                            />
                                            <span className="text-xs font-bold text-muted-foreground">Yrs</span>
                                        </div>
                                    )}

                                    <Button
                                        type="submit"
                                        disabled={isZone || isAddingOption || !newOptionValue.trim()}
                                        className={`h-12 px-6 rounded-xl bg-gradient-to-r from-arin-green to-arin-teal hover:opacity-95 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-arin-green/20 shrink-0 ${
                                            isZone ? "opacity-50 cursor-not-allowed pointer-events-none" : ""
                                        }`}
                                    >
                                        {isAddingOption ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Adding...
                                            </>
                                        ) : (
                                            <>
                                                <Plus className="w-4 h-4 mr-1.5" />
                                                Add {currentCategoryConfig.singular}
                                            </>
                                        )}
                                    </Button>
                                </form>

                                {/* Live Search Box */}
                                <div className="lg:col-span-4 relative">
                                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        type="text"
                                        placeholder={isZone ? "Search disabled" : `Filter ${currentCategoryConfig.label.toLowerCase()}...`}
                                        value={isZone ? "" : searchFilter}
                                        onChange={e => !isZone && setSearchFilter(e.target.value)}
                                        disabled={isZone}
                                        className={`h-12 pl-10 rounded-xl bg-background border-border text-sm ${
                                            isZone ? "opacity-60 cursor-not-allowed bg-muted/20 select-none" : ""
                                        }`}
                                    />
                                    {!isZone && searchFilter && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchFilter("")}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground font-bold px-1.5 py-0.5 rounded"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Options Display List */}
                            <div className="pt-2">
                                {isZone ? null : isLoadingLookups ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                                        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                                        <span className="text-xs font-bold uppercase tracking-wider">Loading options...</span>
                                    </div>
                                ) : filteredOptions.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-border/80 rounded-2xl text-center p-6 bg-muted/10">
                                        <AlertCircle className="w-10 h-10 text-muted-foreground/40 mb-3" />
                                        <h3 className="text-sm font-black text-foreground">No options found</h3>
                                        <p className="text-xs text-muted-foreground max-w-sm mt-1">
                                            {searchFilter
                                                ? `No results match "${searchFilter}". Try clearing your search filter.`
                                                : `No ${currentCategoryConfig.label.toLowerCase()} have been added yet. Use the form above to add custom entries.`}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                        {filteredOptions.map((item) => {
                                            const isEditingThis = editingValidityId === item.id;
                                            return (
                                                <div
                                                    key={item.id}
                                                    className="group flex items-center justify-between p-3.5 rounded-2xl border border-border/70 bg-card hover:border-emerald-500/50 hover:shadow-md transition-all duration-200"
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-xs font-bold text-foreground truncate" title={item.value}>
                                                                {item.label || item.value}
                                                            </span>

                                                            {/* Validity duration badge & editor */}
                                                            {hasValidity && (
                                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                                    {isEditingThis ? (
                                                                        <div className="flex items-center gap-1">
                                                                            <Input
                                                                                type="number"
                                                                                min="1"
                                                                                max="50"
                                                                                value={editValidityVal}
                                                                                onChange={e => setEditValidityVal(e.target.value)}
                                                                                className="h-6 w-12 px-1 text-center text-[11px] font-bold rounded"
                                                                                autoFocus
                                                                            />
                                                                            <Button
                                                                                type="button"
                                                                                size="sm"
                                                                                disabled={isSavingValidity}
                                                                                onClick={() => handleSaveInlineValidity(item)}
                                                                                className="h-6 w-6 p-0 bg-emerald-600 hover:bg-emerald-700 text-white rounded"
                                                                            >
                                                                                <Check className="w-3 h-3" />
                                                                            </Button>
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setEditingValidityId(item.id);
                                                                                setEditValidityVal(String(item.validity_years || currentCategoryConfig.defaultValidity || 5));
                                                                            }}
                                                                            className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-md border border-amber-200 dark:border-amber-900/40 hover:bg-amber-100 transition-colors"
                                                                            title="Click to edit validity years"
                                                                        >
                                                                            <span>{item.validity_years || currentCategoryConfig.defaultValidity || 5} Yrs Validity</span>
                                                                            <Edit2 className="w-2.5 h-2.5 opacity-60" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        disabled={deletingId === item.id}
                                                        onClick={() => handleRemoveOption(item)}
                                                        className="opacity-50 group-hover:opacity-100 p-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/50 text-muted-foreground hover:text-rose-600 transition-colors shrink-0"
                                                        title={`Remove ${item.label}`}
                                                    >
                                                        {deletingId === item.id ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" />
                                                        ) : (
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Pro-Tip Footer Notice */}
                            <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300">
                                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>
                                    <strong>Auto-Sync Active:</strong> Whenever an Excel template (.xlsx) is imported with new brands, types, or zones, they are auto-saved here and immediately populated in dropdown menus.
                                </span>
                            </div>
                        </div>
                    </TabsContent>

                    {/* TAB 2: GOOGLE DRIVE CLOUD FILES EXPLORER */}
                    <TabsContent value="drive" className="space-y-6 animate-in fade-in-50 duration-300">
                        {/* Top Action & Overview Bar */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card border border-border/80 rounded-3xl p-6 shadow-sm">
                            <div className="flex items-center gap-3.5">
                                <div className="p-3 rounded-2xl border bg-blue-50 dark:bg-blue-950/50 border-blue-500/20 text-blue-600 dark:text-blue-400">
                                    <Cloud className="w-6 h-6" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-black text-foreground">Google Drive Cloud Files & Assets</h2>
                                        <Badge variant="outline" className="text-xs font-black border-blue-500/30 text-blue-700 bg-blue-50/50 dark:bg-blue-950/40">
                                            {filteredDriveFiles.length} / {driveCounts.total} files
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Centralized index of all downloaded bills, ROI image cards, zero-gen spreadsheets, and database backups uploaded to Google Drive.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2.5 w-full sm:w-auto">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleTestDrive}
                                    disabled={isTestingDrive}
                                    className="rounded-xl border-border text-xs font-bold gap-1.5 h-10 px-3.5"
                                >
                                    <UploadCloud className={`w-3.5 h-3.5 text-blue-500 ${isTestingDrive ? "animate-spin" : ""}`} />
                                    Test Drive Connection
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={fetchDriveFiles}
                                    disabled={isLoadingDriveFiles}
                                    className="rounded-xl border-border text-xs font-bold gap-1.5 h-10 px-3.5"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDriveFiles ? "animate-spin" : ""}`} />
                                    Refresh List
                                </Button>
                                <a
                                    href="https://drive.google.com/drive/folders/1JVDN8rf6QRYMtGke03S_sW6glNSY5kGO"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md h-10 px-4 transition-colors"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    Open Folder
                                </a>
                            </div>
                        </div>

                        {/* Summary Metrics Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-xs">
                                <div className="flex items-center justify-between">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Synced</p>
                                    <Cloud className="w-4 h-4 text-blue-600" />
                                </div>
                                <p className="text-2xl font-black text-foreground mt-1">{driveCounts.total}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Total files in Google Drive</p>
                            </div>
                            <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-xs">
                                <div className="flex items-center justify-between">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Bill PDFs & Visuals</p>
                                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                                </div>
                                <p className="text-2xl font-black text-emerald-600 mt-1">{driveCounts.pdfs + driveCounts.images}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{driveCounts.pdfs} PDFs, {driveCounts.images} Image Cards</p>
                            </div>
                            <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-xs">
                                <div className="flex items-center justify-between">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Excel & CSV Reports</p>
                                    <FileSpreadsheet className="w-4 h-4 text-amber-600" />
                                </div>
                                <p className="text-2xl font-black text-amber-600 mt-1">{driveCounts.sheets}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Zero-Gen & billing summaries</p>
                            </div>
                            <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-xs">
                                <div className="flex items-center justify-between">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Database Backups</p>
                                    <FileArchive className="w-4 h-4 text-cyan-600" />
                                </div>
                                <p className="text-2xl font-black text-cyan-600 mt-1">{driveCounts.backups}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Compressed SQL snapshots</p>
                            </div>
                        </div>

                        {/* Search & Filter Toolbar */}
                        <div className="bg-card border border-border/80 rounded-3xl p-6 shadow-sm space-y-5">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="relative flex-1 w-full sm:max-w-md">
                                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        type="text"
                                        placeholder="Search by Consumer No, File Name, or Category..."
                                        value={driveSearchQuery}
                                        onChange={(e) => setDriveSearchQuery(e.target.value)}
                                        className="pl-10 h-10 text-xs rounded-xl bg-background border-border/80"
                                    />
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 bg-muted/60 p-1 rounded-xl">
                                    {[
                                        { id: "all", label: `All (${driveCounts.total})` },
                                        { id: "sheet", label: `Reports (${driveCounts.sheets})` },
                                        { id: "image", label: `Images (${driveCounts.images})` },
                                        { id: "pdf", label: `PDFs (${driveCounts.pdfs})` },
                                        { id: "backup", label: `Backups (${driveCounts.backups})` },
                                    ].map((tab) => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setDriveFilterType(tab.id)}
                                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all ${
                                                driveFilterType === tab.id
                                                    ? "bg-card text-foreground shadow-xs"
                                                    : "text-muted-foreground hover:text-foreground"
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Files Table */}
                            <div className="border border-border/60 rounded-2xl overflow-hidden bg-background">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40 text-[10px] font-black uppercase tracking-wider">
                                            <TableHead className="py-3 px-4">Upload Date & Time</TableHead>
                                            <TableHead>Consumer No</TableHead>
                                            <TableHead>File Name</TableHead>
                                            <TableHead>Category / Purpose</TableHead>
                                            <TableHead>Drive Folder Path</TableHead>
                                            <TableHead className="text-right px-4">Google Drive Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoadingDriveFiles ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-40 text-center">
                                                    <Loader2 className="w-7 h-7 animate-spin text-blue-600 mx-auto mb-2" />
                                                    <span className="text-xs text-muted-foreground">Loading files from Google Drive...</span>
                                                </TableCell>
                                            </TableRow>
                                        ) : filteredDriveFiles.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-40 text-center text-xs text-muted-foreground">
                                                    No files found matching your search.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredDriveFiles.map((file) => (
                                                <TableRow key={file.id} className="hover:bg-muted/20 text-xs">
                                                    <TableCell className="py-3 px-4 font-mono text-muted-foreground">
                                                        {file.uploaded_at || "Recent"}
                                                    </TableCell>
                                                    <TableCell className="font-mono font-bold text-foreground">
                                                        {file.consumer_number ? (
                                                            <span className="bg-muted px-2 py-0.5 rounded text-xs">
                                                                {file.consumer_number}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground italic">System / Master</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="font-semibold text-foreground">
                                                        <div className="flex items-center gap-2.5">
                                                            {file.file_name?.match(/\.(xlsx|xls|csv)$/i) || file.mime_type?.includes("spreadsheet") || file.mime_type === "text/csv" ? (
                                                                <FileSpreadsheet className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                                            ) : file.file_type === "image" || file.file_name?.match(/\.(png|jpg|jpeg)$/i) ? (
                                                                <ImageIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                                            ) : file.file_type === "pdf" || file.file_name?.endsWith(".pdf") ? (
                                                                <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                                                            ) : (
                                                                <FileArchive className="w-4 h-4 text-cyan-500 flex-shrink-0" />
                                                            )}
                                                            <span className="truncate max-w-[280px]" title={file.file_name}>
                                                                {file.file_name}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                                                            {file.category || file.file_type || "file"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-[11px] font-mono">
                                                        {file.folder_path ? file.folder_path : "Bill_Generation1"}
                                                    </TableCell>
                                                    <TableCell className="text-right px-4">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {file.view_url && (
                                                                <a
                                                                    href={file.view_url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-colors shadow-2xs"
                                                                >
                                                                    <UploadCloud className="w-3.5 h-3.5" />
                                                                    <span>Open</span>
                                                                    <ExternalLink className="w-3 h-3 opacity-70" />
                                                                </a>
                                                            )}
                                                            {file.download_url && file.download_url !== file.view_url && (
                                                                <a
                                                                    href={file.download_url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-xl transition-colors"
                                                                >
                                                                    <Download className="w-3.5 h-3.5" />
                                                                    <span>Download</span>
                                                                </a>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </TabsContent>

                    {/* TAB: DATABASE MANAGEMENT & AUTO-BACKUP */}
                    <TabsContent value="backups" className="space-y-6 animate-in fade-in-50 duration-300">
                        {/* Top Action Bar */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card border border-border/80 rounded-3xl p-6 shadow-sm">
                            <div className="flex items-center gap-3.5">
                                <div className="p-3 rounded-2xl border bg-cyan-50 dark:bg-cyan-950/50 border-cyan-500/20 text-cyan-600 dark:text-cyan-400">
                                    <HardDrive className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-foreground">Database & Automated Backups</h2>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Automated daily snapshots, gzip archives, local retention, and off-site cloud sync to Google Drive.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2.5 w-full sm:w-auto">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleTestDrive}
                                    disabled={isTestingDrive}
                                    className="rounded-xl border-border text-xs font-bold gap-1.5 h-10 px-3.5"
                                >
                                    <UploadCloud className={`w-3.5 h-3.5 text-blue-500 ${isTestingDrive ? "animate-spin" : ""}`} />
                                    Test Google Drive Link
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={fetchDbBackupsAndStats}
                                    disabled={isLoadingBackups}
                                    className="rounded-xl border-border text-xs font-bold gap-1.5 h-10 px-3.5"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBackups ? "animate-spin" : ""}`} />
                                    Refresh
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleCreateBackup}
                                    disabled={isCreatingBackup}
                                    className="bg-gradient-to-r from-arin-green to-arin-teal hover:opacity-95 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md h-10 px-4 gap-2"
                                >
                                    {isCreatingBackup ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Dumping & Uploading...
                                        </>
                                    ) : (
                                        <>
                                            <UploadCloud className="w-4 h-4" />
                                            Create Instant Backup
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>

                        {/* Database Health Metrics Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm space-y-2">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-[10px] font-black uppercase tracking-widest">Database Storage</span>
                                    <Database className="w-4 h-4 text-cyan-600" />
                                </div>
                                <div className="text-2xl font-black text-foreground">
                                    {dbStats?.total_size_display || "Calculating..."}
                                </div>
                                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                    <Server className="w-3.5 h-3.5 text-cyan-500" />
                                    <span>{dbStats?.table_count || 68} Active MySQL Tables</span>
                                </div>
                            </div>

                            <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm space-y-2">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-[10px] font-black uppercase tracking-widest">Total Live Records</span>
                                    <Layers className="w-4 h-4 text-emerald-600" />
                                </div>
                                <div className="text-2xl font-black text-foreground">
                                    {dbStats?.total_rows ? Number(dbStats.total_rows).toLocaleString() : "..."}
                                </div>
                                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    <span>Consumers, Bills & Assets</span>
                                </div>
                            </div>

                            <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm space-y-2">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-[10px] font-black uppercase tracking-widest">Auto-Backup Status</span>
                                    <Clock className="w-4 h-4 text-amber-600" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                                        autoBackupEnabled 
                                            ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300"
                                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                                    }`}>
                                        {autoBackupEnabled ? "Active Schedule" : "Disabled"}
                                    </span>
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                    {autoBackupFreq === "daily" ? `Daily at ${autoBackupTime}` : `Every ${autoBackupFreq}`}
                                </div>
                            </div>

                            <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm space-y-2">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="text-[10px] font-black uppercase tracking-widest">Latest Cloud Backup</span>
                                    <UploadCloud className="w-4 h-4 text-blue-600" />
                                </div>
                                <div className="text-sm font-black text-foreground truncate">
                                    {dbStats?.last_backup_time || "No backup yet"}
                                </div>
                                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                                    <span>Sync: {dbStats?.last_backup_sync || "Ready"} ({dbStats?.last_backup_size || ""})</span>
                                </div>
                            </div>
                        </div>

                        {/* Configuration & Controls Form */}
                        <div className="bg-card border border-border/80 rounded-3xl p-6 lg:p-7 shadow-sm space-y-5">
                            <div className="flex items-center justify-between pb-4 border-b border-border/60">
                                <div>
                                    <h3 className="text-base font-black text-foreground">Auto-Backup Policy & Schedule</h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Configure frequency, daily execution hour, and local archive retention.
                                    </p>
                                </div>
                            </div>

                            <form onSubmit={handleSaveBackupSettings} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Automated Backup</Label>
                                    <select
                                        value={autoBackupEnabled ? "true" : "false"}
                                        onChange={e => setAutoBackupEnabled(e.target.value === "true")}
                                        className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm font-semibold focus:ring-2 focus:ring-arin-green/30"
                                    >
                                        <option value="true">Enabled (Recommended)</option>
                                        <option value="false">Disabled</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Backup Frequency</Label>
                                    <select
                                        value={autoBackupFreq}
                                        onChange={e => setAutoBackupFreq(e.target.value)}
                                        className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm font-semibold focus:ring-2 focus:ring-arin-green/30"
                                    >
                                        <option value="daily">Daily</option>
                                        <option value="12hours">Every 12 Hours</option>
                                        <option value="6hours">Every 6 Hours</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Daily Scheduled Time</Label>
                                    <Input
                                        type="time"
                                        value={autoBackupTime}
                                        onChange={e => setAutoBackupTime(e.target.value)}
                                        className="h-11 rounded-xl text-sm font-semibold"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Local Retention (Days)</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        max="365"
                                        value={autoBackupRetention}
                                        onChange={e => setAutoBackupRetention(e.target.value)}
                                        className="h-11 rounded-xl text-sm font-semibold"
                                    />
                                </div>

                                <div className="sm:col-span-2 lg:col-span-4 flex justify-end pt-2">
                                    <Button
                                        type="submit"
                                        disabled={isSavingBackupSettings}
                                        className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-xs uppercase tracking-wider rounded-xl px-5 h-10 shadow-sm"
                                    >
                                        {isSavingBackupSettings ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
                                        Save Backup Policy
                                    </Button>
                                </div>
                            </form>
                        </div>

                        {/* Backups History Table */}
                        <div className="bg-card border border-border/80 rounded-3xl p-6 lg:p-7 shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-base font-black text-foreground">Backup Archives & Snapshots</h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Compressed SQL archives stored locally and synchronized to Google Drive.
                                    </p>
                                </div>
                                <span className="text-xs font-bold text-muted-foreground">
                                    Total Backups: {dbBackups.length}
                                </span>
                            </div>

                            <div className="border border-border/60 rounded-2xl overflow-hidden bg-background">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40 text-[10px] font-black uppercase tracking-wider">
                                            <TableHead className="py-3 px-4">Date & Time</TableHead>
                                            <TableHead>Archive Filename</TableHead>
                                            <TableHead>Size</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Cloud Sync (Google Drive)</TableHead>
                                            <TableHead className="text-right px-4">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoadingBackups ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-32 text-center">
                                                    <Loader2 className="w-6 h-6 animate-spin text-arin-green mx-auto mb-2" />
                                                    <span className="text-xs text-muted-foreground">Loading backup logs...</span>
                                                </TableCell>
                                            </TableRow>
                                        ) : dbBackups.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground">
                                                    No backup archives found. Click "Create Instant Backup" above to generate the first snapshot.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            dbBackups.map((b) => (
                                                <TableRow key={b.id} className="hover:bg-muted/20 text-xs">
                                                    <TableCell className="py-3 px-4 font-mono text-muted-foreground">
                                                        {b.created_at}
                                                    </TableCell>
                                                    <TableCell className="font-semibold text-foreground">
                                                        <div className="flex items-center gap-1.5">
                                                            <FileArchive className="w-4 h-4 text-cyan-600 flex-shrink-0" />
                                                            <span className="truncate max-w-[260px]">{b.backup_filename}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-mono font-bold text-foreground">
                                                        {b.file_size_display}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                            b.backup_type === "automated"
                                                                ? "bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300"
                                                                : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300"
                                                        }`}>
                                                            {b.backup_type}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        {b.drive_view_url ? (
                                                            <a
                                                                href={b.drive_view_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                                                            >
                                                                <UploadCloud className="w-3.5 h-3.5 text-blue-500" />
                                                                View on Drive
                                                                <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
                                                            </a>
                                                        ) : (
                                                            <span className="text-[11px] text-muted-foreground">
                                                                {b.drive_sync_status || "Local only"}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right px-4">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={async () => {
                                                                    try {
                                                                        await api.downloadDbBackup(b.id, b.backup_filename);
                                                                    } catch (err: any) {
                                                                        toast({
                                                                            title: "Download Failed",
                                                                            description: err.message || "Could not download backup file.",
                                                                            variant: "destructive"
                                                                        });
                                                                    }
                                                                }}
                                                                className="h-8 px-3 rounded-lg border border-border bg-card text-foreground hover:bg-muted font-bold text-xs gap-1.5 shadow-xs transition-colors"
                                                            >
                                                                <Download className="w-3.5 h-3.5 text-cyan-600" />
                                                                <span>Download</span>
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </TabsContent>

                    {/* TAB 4: MSEDCL PORTAL USERS */}
                    <TabsContent value="portal" className="space-y-6 animate-in fade-in-50 duration-300 w-full">
                        <div className="w-full bg-card border border-border/80 rounded-3xl p-6 lg:p-8 shadow-sm space-y-6">
                            <div className="flex items-center gap-3.5 pb-6 border-b border-border/60">
                                <div className="p-3 rounded-2xl border bg-blue-50 dark:bg-blue-950/50 border-blue-500/20 text-blue-600">
                                    <Shield className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-foreground">MSEDCL Portal Logins</h2>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Saved credentials for automated MSEDCL portal scraping and bill downloading.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                {/* Left Col: Add Account Form (5 cols) */}
                                <div className="lg:col-span-5 space-y-4">
                                    <form onSubmit={handleAddPortalUser} className="bg-muted/20 border border-border/70 rounded-2xl p-5 space-y-4">
                                        <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Add New Portal Account</span>
                                        <div className="space-y-3">
                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Portal Username</Label>
                                                <Input
                                                    placeholder="e.g. arin_solar_admin"
                                                    value={newPortalUser}
                                                    onChange={e => setNewPortalUser(e.target.value)}
                                                    className="h-11 rounded-xl bg-background text-sm font-semibold"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Portal Password</Label>
                                                <Input
                                                    type="password"
                                                    placeholder="••••••••••••"
                                                    value={newPortalPass}
                                                    onChange={e => setNewPortalPass(e.target.value)}
                                                    className="h-11 rounded-xl bg-background text-sm"
                                                />
                                            </div>
                                        </div>
                                        <Button
                                            type="submit"
                                            disabled={isSavingPortalUser || !newPortalUser.trim() || !newPortalPass.trim()}
                                            className="w-full h-11 bg-gradient-to-r from-arin-green to-arin-teal hover:opacity-95 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md"
                                        >
                                            {isSavingPortalUser ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
                                            Save Portal Account
                                        </Button>
                                    </form>
                                </div>

                                {/* Right Col: Active Accounts Grid (7 cols) */}
                                <div className="lg:col-span-7 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Active Portal Accounts ({portalUsers.length})</span>
                                    </div>
                                    {portalUsers.length === 0 ? (
                                        <div className="p-12 text-center border-2 border-dashed border-border rounded-2xl text-muted-foreground text-xs">
                                            No portal credentials saved yet. Add your first MSEDCL account using the form on the left.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {portalUsers.map((u, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-4 rounded-xl border border-border bg-background shadow-xs hover:border-border/80 transition-all">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-black text-foreground">{u.username}</span>
                                                        <span className="text-[10px] font-mono text-muted-foreground">Saved Credential ••••••••</span>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleRemovePortalUser(u.username)}
                                                        className="text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    {/* TAB 5: ACCOUNT & PASSWORD SECURITY */}
                    <TabsContent value="security" className="space-y-6 animate-in fade-in-50 duration-300 w-full">
                        <div className="w-full bg-card border border-border/80 rounded-3xl p-6 lg:p-8 shadow-sm space-y-6">
                            <div className="flex items-center gap-3.5 pb-6 border-b border-border/60">
                                <div className="p-3 rounded-2xl border bg-purple-50 dark:bg-purple-950/50 border-purple-500/20 text-purple-600">
                                    <Key className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-foreground">Account Security & Password</h2>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Update your personal login credentials and view system security recommendations.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                {/* Left: Password Change Form (7 cols) */}
                                <div className="lg:col-span-7">
                                    <form onSubmit={handlePasswordChange} className="space-y-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Current Password</Label>
                                            <Input
                                                type="password"
                                                placeholder="Enter your existing password"
                                                value={currentPassword}
                                                onChange={e => setCurrentPassword(e.target.value)}
                                                className="h-12 rounded-xl text-sm"
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">New Password</Label>
                                                <Input
                                                    type="password"
                                                    placeholder="Min 6 characters"
                                                    value={ownNewPassword}
                                                    onChange={e => setOwnNewPassword(e.target.value)}
                                                    className="h-12 rounded-xl text-sm"
                                                />
                                            </div>

                                            <div className="space-y-1.5">
                                                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Confirm New Password</Label>
                                                <Input
                                                    type="password"
                                                    placeholder="Repeat new password"
                                                    value={confirmPassword}
                                                    onChange={e => setConfirmPassword(e.target.value)}
                                                    className="h-12 rounded-xl text-sm"
                                                />
                                            </div>
                                        </div>

                                        <Button
                                            type="submit"
                                            disabled={isChangingPass || !currentPassword || !ownNewPassword || !confirmPassword}
                                            className="w-full h-12 bg-gradient-to-r from-arin-green to-arin-teal hover:opacity-95 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-arin-green/20 mt-2"
                                        >
                                            {isChangingPass ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                            Update My Password
                                        </Button>
                                    </form>
                                </div>

                                {/* Right: Security Best Practices (5 cols) */}
                                <div className="lg:col-span-5 bg-muted/20 border border-border/70 rounded-2xl p-6 space-y-4">
                                    <div className="flex items-center gap-2 text-foreground font-black text-sm">
                                        <ShieldCheck className="w-5 h-5 text-emerald-600" />
                                        Security Recommendations
                                    </div>
                                    <ul className="space-y-2.5 text-xs text-muted-foreground">
                                        <li className="flex items-start gap-2">
                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0"></span>
                                            Use a strong passphrase containing uppercase, lowercase, numbers, and special symbols.
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0"></span>
                                            Do not share admin credentials across multiple operators. Use User Management to provision individual staff accounts.
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0"></span>
                                            All failed login attempts are rate-limited and logged for proactive security audits.
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}
