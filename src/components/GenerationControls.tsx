import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Eye, Download, FolderDown, Settings, User, Hash, Zap, Calendar as CalendarLucide, Loader2, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ConsumerData, BillInputs, mockConsumers, calculateBillData } from '@/lib/billCalculations';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';

interface RealConsumer {
  consumer_number: string;
  consumer_name: string;
  capacity: any;
  comm_date: string;
}

interface GenerationControlsProps {
  onGenerate: (consumer: Partial<ConsumerData>, inputs: BillInputs) => void;
  onDownloadImage: () => void;
  onDownloadAllImages: (selectedIds: string[]) => void;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  isBulkDownloading?: boolean;
  isGeneratingSingle?: boolean;
  onSelectionUpdate?: (selectedConsumers: any[]) => void;
  externalSelectedId?: string;
  onFetchingChange?: (isFetching: boolean) => void;
}

export function GenerationControls({
  onGenerate,
  onDownloadImage,
  onDownloadAllImages,
  selectedDate,
  onDateChange,
  isBulkDownloading = false,
  isGeneratingSingle = false,
  onSelectionUpdate,
  externalSelectedId,
  onFetchingChange,
}: GenerationControlsProps) {
  const [allBills, setAllBills] = useState<any[]>([]);
  const [dayConsumerIds, setDayConsumerIds] = useState<string[]>([]);
  const [selectedConsumerId, setSelectedConsumerId] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [healthThreshold, setHealthThreshold] = useState<number>(75);
  const [isBlacklisted, setIsBlacklisted] = useState<boolean>(false);
  const [blacklistReason, setBlacklistReason] = useState<string>('');
  const [selectedForDownload, setSelectedForDownload] = useState<Set<string>>(new Set());
  const [searchNumber, setSearchNumber] = useState<string>('');
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'profiles' | 'editor' | 'settings'>('profiles');
  const [consumerFilterQuery, setConsumerFilterQuery] = useState<string>('');
  const [portalAccounts, setPortalAccounts] = useState<any[]>([]);

  const [inputs, setInputs] = useState<BillInputs>({
    consumerName: '',
    consumerNumber: '',
    readingDate: format(selectedDate, 'dd/MM/yy'),
    generatedElectricity: 0,
    exportedToGrid: 0,
    importedFromGrid: 0,
    billingAmount: 0,
    previousBankedUnit: 0,
    currentBankedUnit: 0,
    commissioningDate: 'N/A',
    capacity: 0,
    panelWarranty: '25 Years',
    systemWarranty: '5 Years',
    inverterWarranty: '10 Years',
    systemHealth: 'GOOD',
    billStatus: 'Normal',
    panel_name: 'Other',
    inverter_name: 'Other',
  });

  useEffect(() => {
    const fetchDbConsumers = async () => {
      try {
        const data = await api.getBills();
        setAllBills(data);
      } catch (e) {
        console.error("Failed to fetch consumers", e);
      }
    };
    fetchDbConsumers();
  }, []);

  useEffect(() => {
    const fetchPortalAccounts = async () => {
      try {
        const res = await api.getPortalCredentials();
        if (res.status === 'success' && res.data) {
          setPortalAccounts(res.data);
        }
      } catch (e) {
        console.error("Failed to fetch portal accounts", e);
      }
    };
    fetchPortalAccounts();
  }, []);

  // Removed redundant fetchDateConsumers for dayConsumerIds as we filter by allBills month/year

  const dayBills = useMemo(() => {
    const unique = new Map();
    const selMonth = selectedDate.getMonth();
    const selYear = selectedDate.getFullYear();

    allBills.forEach((b: any) => {
      // 1. Include if month matches
      const bDate = new Date(b.month_year || b.bill_month);
      const isMonthMatch = bDate.getMonth() === selMonth && bDate.getFullYear() === selYear;
      
      // 2. Include if it's the currently selected consumer OR in the "ticked" list
      const isSelected = selectedConsumerId === b.consumer_number || selectedForDownload.has(b.consumer_number);

      if (isMonthMatch || isSelected) {
        // Filter by selected ID if one is picked (Portal Account filter)
        if (selectedId && isMonthMatch) {
          const consumerArinId = String(b.arin_id || "").toLowerCase();
          const targetId = selectedId.toLowerCase();
          
          const idNumMatch = selectedId.match(/\d+/);
          const idNumStr = idNumMatch ? idNumMatch[0] : "";
          const idNum = parseInt(idNumStr, 10);
          
          const consumerArinIdNumStr = consumerArinId.replace(/\D/g, "");
          const consumerIdNum = parseInt(consumerArinIdNumStr, 10);

          const isExactMatch = consumerArinId.includes(targetId) || targetId.includes(consumerArinId);
          const isDigitMatch = (idNumStr && consumerArinIdNumStr.includes(idNumStr)) || 
                               (!isNaN(idNum) && !isNaN(consumerIdNum) && idNum === consumerIdNum);

          if (!isExactMatch && !isDigitMatch) {
            return;
          }
        }

        if (!unique.has(b.consumer_number)) {
          unique.set(b.consumer_number, {
            ...b,
            consumer_number: b.consumer_number,
            consumer_name: b.customer_name || b.consumer_name || "N/A",
          });
        }
      }
    });
    return Array.from(unique.values());
  }, [allBills, selectedDate, selectedId, selectedConsumerId, selectedForDownload]);

  const filteredDayBills = useMemo(() => {
    if (!consumerFilterQuery.trim()) return dayBills;
    const query = consumerFilterQuery.toLowerCase().trim();
    return dayBills.filter(b => 
      b.consumer_number.toLowerCase().includes(query) ||
      b.consumer_name.toLowerCase().includes(query) ||
      String(b.arin_id || "").toLowerCase().includes(query)
    );
  }, [dayBills, consumerFilterQuery]);

  useEffect(() => {
    // Clear selections and previous list bindings when month changes
    setSelectedForDownload(new Set());
    setSelectedConsumerId('');
  }, [selectedDate]);

  useEffect(() => {
    if (onSelectionUpdate) {
      const selected = dayBills.filter(b => selectedForDownload.has(b.consumer_number));
      onSelectionUpdate(selected);
    }
  }, [selectedForDownload, dayBills]);

  useEffect(() => {
    if (externalSelectedId && externalSelectedId !== selectedConsumerId) {
      setSelectedConsumerId(externalSelectedId);
      setActiveTab('editor');
    }
  }, [externalSelectedId]);

  useEffect(() => {
    if (onFetchingChange) {
      onFetchingChange(isFetching);
    }
  }, [isFetching, onFetchingChange]);

  const isAllSelected = dayBills.length > 0 && selectedForDownload.size === dayBills.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedForDownload(new Set());
    } else {
      setSelectedForDownload(new Set(dayBills.map(b => b.consumer_number)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedForDownload);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedForDownload(newSet);
  };

  const selectedConsumer = dayBills.find(c => c.consumer_number === selectedConsumerId) || allBills.find(c => c.consumer_number === selectedConsumerId);

  useEffect(() => {
    if (selectedConsumer) {
      setIsBlacklisted(!!selectedConsumer.is_blacklisted);
      setBlacklistReason(selectedConsumer.blacklisted_reason || 'No reason provided');
    } else {
      setIsBlacklisted(false);
      setBlacklistReason('');
    }
  }, [selectedConsumer]);

  const handleSearch = async () => {
    // Support both single and multiple numbers separated by spaces, commas, or newlines
    const numbers = searchNumber.trim().split(/[\s,]+/).filter(n => n.length >= 10);
    
    if (numbers.length === 0) {
      toast({ 
        title: "Input Required", 
        description: "Please enter at least one valid consumer number (10+ digits).", 
        variant: "destructive" 
      });
      return;
    }

    setIsFetching(true);
    try {
      const newSelected = new Set(selectedForDownload);
      let processedCount = 0;
      
      numbers.forEach(num => {
        if (!newSelected.has(num)) {
          newSelected.add(num);
          processedCount++;
        }
      });
      
      setSelectedForDownload(newSelected);
      
      // Automatically load the first number into the editor/preview
      setSelectedConsumerId(numbers[0]);
      
      toast({
        title: numbers.length > 1 ? "Bulk Selection Applied" : "Consumer Selected",
        description: numbers.length > 1 
          ? `Ticked ${numbers.length} numbers. Loading profile for ${numbers[0]}...`
          : `Selected ${numbers[0]} and loaded profile.`,
      });
      
      setSearchNumber(''); // Clear the textarea on success
    } catch (e) {
      toast({
        title: "Search Error",
        description: "Failed to process the provided numbers.",
        variant: "destructive",
      });
    } finally {
      setIsFetching(false);
    }
  };

  const fetchDataAndGenerate = async (targetId: string, targetDate: Date) => {
    if (!targetId) return;

    setIsFetching(true);
    try {
      setIsBlacklisted(false);
      setBlacklistReason('');
      
      const monthStr = format(targetDate, 'MMM-yyyy').toUpperCase();
      const consumer = allBills.find(c => c.consumer_number === targetId) || { consumer_number: targetId };

      const data = await api.getBillingAnalysis(targetId, monthStr);

      const formatDateStr = (dateStr: string) => {
        if (!dateStr || dateStr === 'N/A') return format(targetDate, 'dd/MM/yy');
        if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) {
          const [y, m, d] = dateStr.split('T')[0].split('-');
          return `${d}/${m}/${y.slice(2)}`;
        }
        return dateStr;
      };

      const rawInputs: BillInputs = {
        consumerName: data.customer_name || (consumer as any).consumer_name || (consumer as any).customer_name || 'N/A',
        consumerNumber: data.consumer_number || (consumer as any).consumer_number,
        readingDate: formatDateStr(data.reading_date),
        generatedElectricity: data.generated || 0,
        exportedToGrid: data.export || 0,
        importedFromGrid: data.import || 0,
        billingAmount: data.amount || 0,
        previousBankedUnit: data.prev_banked || 0,
        currentBankedUnit: data.curr_banked || 0,
        commissioningDate: formatDateStr(data.commission_date || (consumer as any).commission_date || (consumer as any).comm_date),
        capacity: parseFloat(data.capacity || (consumer as any).capacity) || 0,
        inverter_name: data.inverter_name || (consumer as any).inverter_name || 'Other',
        panel_name: data.panel_name || (consumer as any).panel_name || 'Other',
        panelWarranty: '',
        systemWarranty: '',
        inverterWarranty: '',
        systemHealth: data.system_health || 'POOR',
        billStatus: data.bill_status || 'Normal',
        healthThreshold: healthThreshold,
        panel_warranty_expiry_date: data.panel_warranty_expiry_date || (consumer as any).panel_warranty_expiry_date,
        inverter_warranty_expiry_date: data.inverter_warranty_expiry_date || (consumer as any).inverter_warranty_expiry_date,
        system_warranty_expiry_date: data.system_warranty_expiry_date || (consumer as any).system_warranty_expiry_date,
        general_warranty_expiry_date: data.general_warranty_expiry_date || (consumer as any).general_warranty_expiry_date,
      };

      const calculated = calculateBillData(rawInputs, consumer as any);
      const newInputs: BillInputs = {
        ...rawInputs,
        generatedElectricity: calculated.generatedElectricity,
        currentBankedUnit: calculated.currentBankedUnit,
        panelWarranty: calculated.panelWarranty,
        systemWarranty: calculated.systemWarranty,
        inverterWarranty: calculated.inverterWarranty,
        systemHealth: calculated.systemHealth as 'Normal' | 'POOR' | 'GOOD',
        panel_name: calculated.panel_name,
        inverter_name: calculated.inverter_name,
      };

      setInputs(newInputs);
      onGenerate({ id: targetId } as any, newInputs);

      toast({
        title: "Profile Loaded",
        description: `Analysis data for ${newInputs.consumerName} sync'd successfully.`,
      });
    } catch (e: any) {
      if (e.message && e.message.includes("blacklisted")) {
        setIsBlacklisted(true);
        const reasonMatch = e.message.match(/Reason:\s*(.*)/);
        const reason = reasonMatch ? reasonMatch[1] : "Customer is blacklisted";
        setBlacklistReason(reason);
        toast({
          title: "Blacklisted Customer",
          description: e.message,
          variant: "destructive"
        });
        setIsFetching(false);
        return;
      }
      
      try {
        const details = await api.getCustomerDetails(targetId);
        setIsBlacklisted(!!details.is_blacklisted);
        setBlacklistReason(details.blacklisted_reason || 'No reason provided');
        
        const basicInputs: BillInputs = {
          ...inputs,
          consumerName: details.customer_name || 'N/A',
          consumerNumber: details.consumer_number,
          capacity: parseFloat(details.capacity) || 0,
          commissioningDate: details.commission_date ? format(new Date(details.commission_date), 'dd/MM/yy') : 'N/A',
          billStatus: 'Waiting for Sync',
          healthThreshold: healthThreshold,
          panel_warranty_expiry_date: details.panel_warranty_expiry_date,
          inverter_warranty_expiry_date: details.inverter_warranty_expiry_date,
          system_warranty_expiry_date: details.system_warranty_expiry_date,
          general_warranty_expiry_date: details.general_warranty_expiry_date,
        };
        setInputs(basicInputs);
        onGenerate({ id: targetId } as any, basicInputs);
      } catch (innerE) {
        console.error("Critical fail on auto-fill", innerE);
      }
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (selectedConsumerId) {
      fetchDataAndGenerate(selectedConsumerId, selectedDate);
    }
  }, [selectedConsumerId, selectedDate]);

  const handleInputChange = (field: keyof BillInputs, value: any) => {
    setInputs(prev => ({ ...prev, [field]: value }));
  };

  const manualSubmit = () => {
    onGenerate({ id: 'manual' }, inputs);
    toast({ title: "Analysis Updated", description: "Preview refreshed with your changes." });
  };

  const handleGenerateAndSaveSingle = () => {
    if (isBlacklisted) return;
    onGenerate({ id: selectedConsumerId || 'manual' } as any, inputs);
    setTimeout(() => {
      onDownloadImage();
    }, 150);
  };

  return (
    <Card className="h-[calc(100vh-160px)] min-h-[650px] border-2 border-slate-100 shadow-xl overflow-hidden flex flex-col bg-white">
      <CardHeader className="pb-4 bg-slate-50 border-b border-slate-100 shrink-0">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-black text-arin-teal uppercase tracking-tight flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Bill Buddy Editor
          </CardTitle>
          <div className="flex gap-1.5 p-1 bg-slate-100 rounded-lg">
            {[
              { id: 'profiles', label: 'Selection', icon: <User className="w-3.5 h-3.5" /> },
              { id: 'editor', label: 'Form', icon: <Eye className="w-3.5 h-3.5" /> },
              { id: 'settings', label: 'Config', icon: <Settings className="w-3.5 h-3.5" /> },
            ].filter(tab => tab.id === 'profiles' || !!selectedConsumerId).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md transition-all",
                  activeTab === tab.id
                    ? "bg-white text-arin-teal shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col min-h-0 p-0 justify-between overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar min-h-0">
          
          {/* TAB 1: SELECTION */}
          {activeTab === 'profiles' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Month Selection */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Analysis Month</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-bold h-11 bg-slate-50 border-slate-200 rounded-xl"
                    >
                      <CalendarLucide className="mr-2 h-4 w-4 text-arin-teal" />
                      {format(selectedDate, 'MMMM yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => date && onDateChange(date)}
                      initialFocus
                      className="p-3"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* ID Selection */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Portal Account Filter</Label>
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-100">
                  {portalAccounts.map((account) => (
                    <button
                      key={account.username}
                      type="button"
                      onClick={() => setSelectedId(selectedId === account.username ? "" : account.username)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border",
                        selectedId === account.username 
                          ? "bg-arin-teal text-white border-arin-teal" 
                          : "bg-white text-slate-500 border-slate-200 hover:border-arin-teal/50 hover:text-arin-teal"
                      )}
                    >
                      {account.username}
                    </button>
                  ))}
                  <button
                     type="button"
                     onClick={() => setSelectedId("")}
                     className={cn(
                       "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border",
                       selectedId === "" 
                         ? "bg-slate-200 text-slate-700 border-slate-300" 
                         : "bg-white text-slate-400 border-slate-200"
                     )}
                  >
                    ALL
                  </button>
                </div>
              </div>



              {/* Consumer Selector List */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                    Select Consumer Profile
                  </Label>
                  {filteredDayBills.length > 0 && (
                    <span className="text-[10px] font-bold text-arin-teal tracking-wider">
                      {filteredDayBills.length} FOUND
                    </span>
                  )}
                </div>

                {/* Filter Textbox inside the list */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="Search by name or number..."
                    value={consumerFilterQuery}
                    onChange={(e) => setConsumerFilterQuery(e.target.value)}
                    className="pl-9 h-9 text-xs rounded-xl border-slate-200 font-medium"
                  />
                </div>

                {/* Select All Checkbox */}
                {filteredDayBills.length > 0 && (
                  <div
                    className="flex items-center gap-3 p-2.5 bg-arin-teal/5 border border-arin-teal/20 rounded-xl cursor-pointer hover:bg-arin-teal/10 transition-all"
                    onClick={toggleSelectAll}
                  >
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleSelectAll}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-[10px] font-black uppercase text-arin-teal tracking-wider">
                      {isAllSelected ? `Deselect All (${filteredDayBills.length})` : `Select All (${filteredDayBills.length})`}
                    </span>
                  </div>
                )}

                <div className="max-h-56 overflow-y-auto space-y-2 pr-2 border border-slate-100 rounded-xl p-2 bg-white custom-scrollbar">
                  {filteredDayBills.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6 font-medium">No consumers found</p>
                  ) : (
                    filteredDayBills.map((c) => (
                      <div 
                        key={c.consumer_number} 
                        className={cn(
                          "flex items-center justify-between p-2.5 hover:bg-slate-50 rounded-xl border transition-all cursor-pointer",
                          selectedConsumerId === c.consumer_number 
                            ? "border-arin-teal/30 bg-arin-teal/5" 
                            : "border-transparent"
                        )}
                        onClick={() => {
                          setSelectedConsumerId(c.consumer_number);
                          setActiveTab('editor');
                        }}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <Checkbox
                            checked={selectedForDownload.has(c.consumer_number)}
                            onCheckedChange={() => toggleSelect(c.consumer_number)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-slate-700 truncate">{c.consumer_name}</span>
                            <span className="text-[10px] font-mono text-slate-400">{c.consumer_number}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {c.is_blacklisted ? (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-red-100 text-red-600">Blocked</span>
                          ) : c.system_health === 'POOR' ? (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-amber-100 text-amber-600">Poor</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-green-100 text-green-600">Normal</span>
                          )}
                          {selectedConsumerId === c.consumer_number && (
                            <span className="w-2.5 h-2.5 rounded-full bg-arin-orange" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <Button
                onClick={() => fetchDataAndGenerate(selectedConsumerId!, selectedDate)}
                disabled={!selectedConsumerId || isFetching}
                variant="secondary"
                className="w-full font-black text-[10px] tracking-widest uppercase h-10 rounded-xl border border-slate-200 hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
              >
                {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Resync Profile Data
              </Button>
            </div>
          )}

          {/* TAB 2: DATA EDITOR */}
          {activeTab === 'editor' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              
              {/* Fieldset 1: Customer Profile */}
              <div className="space-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <h3 className="text-[10px] font-black uppercase text-arin-teal tracking-widest border-b pb-1">Client Profile</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[9px] font-black uppercase text-slate-500">Consumer Name</Label>
                    <Input value={inputs.consumerName} onChange={(e) => handleInputChange('consumerName', e.target.value)} className="font-bold h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase text-slate-500">Consumer Number</Label>
                    <Input value={inputs.consumerNumber} onChange={(e) => handleInputChange('consumerNumber', e.target.value)} className="font-bold h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase text-slate-500">Commission Date</Label>
                    <Input value={inputs.commissioningDate} onChange={(e) => handleInputChange('commissioningDate', e.target.value)} className="font-bold h-9 text-xs" />
                  </div>
                </div>
              </div>

              {/* Fieldset 2: Energy & Readings */}
              <div className="space-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <h3 className="text-[10px] font-black uppercase text-arin-orange tracking-widest border-b pb-1">Energy Readings (kWh)</h3>
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase text-slate-500">Generation</Label>
                    <Input type="number" value={inputs.generatedElectricity} onChange={(e) => handleInputChange('generatedElectricity', parseFloat(e.target.value) || 0)} className="font-bold h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase text-slate-500">Import</Label>
                    <Input type="number" value={inputs.importedFromGrid} onChange={(e) => handleInputChange('importedFromGrid', parseFloat(e.target.value) || 0)} className="font-bold h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase text-slate-500">Export</Label>
                    <Input type="number" value={inputs.exportedToGrid} onChange={(e) => handleInputChange('exportedToGrid', parseFloat(e.target.value) || 0)} className="font-bold h-9 text-xs" />
                  </div>
                </div>
              </div>

              {/* Fieldset 3: Banking & Accounts */}
              <div className="space-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <h3 className="text-[10px] font-black uppercase text-arin-teal tracking-widest border-b pb-1">Billing & Banking</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase text-slate-500">Bill Amount (₹)</Label>
                    <Input type="number" value={inputs.billingAmount} onChange={(e) => handleInputChange('billingAmount', parseFloat(e.target.value) || 0)} className="font-bold h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase text-slate-500">Bill Status</Label>
                    <Input value={inputs.billStatus} onChange={(e) => handleInputChange('billStatus', e.target.value)} className="font-bold h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase text-slate-500">Prev Banked Solar</Label>
                    <Input type="number" value={inputs.previousBankedUnit} onChange={(e) => handleInputChange('previousBankedUnit', parseFloat(e.target.value) || 0)} className="font-bold h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase text-slate-500">Bank Solar (Units)</Label>
                    <Input type="number" value={inputs.currentBankedUnit} onChange={(e) => handleInputChange('currentBankedUnit', parseFloat(e.target.value) || 0)} className="font-bold h-9 text-xs" />
                  </div>
                </div>
              </div>

              {/* Fieldset 4: System Specs & Warranties */}
              <div className="space-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <h3 className="text-[10px] font-black uppercase text-slate-600 tracking-widest border-b pb-1">System & Warranty Expiry</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase text-slate-500">Capacity (kW)</Label>
                    <Input type="number" value={inputs.capacity} onChange={(e) => handleInputChange('capacity', parseFloat(e.target.value) || 0)} className="font-bold h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase text-slate-500">Panel Warranty</Label>
                    <Input value={inputs.panelWarranty} onChange={(e) => handleInputChange('panelWarranty', e.target.value)} className="font-bold h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase text-slate-500">System Warranty</Label>
                    <Input value={inputs.systemWarranty} onChange={(e) => handleInputChange('systemWarranty', e.target.value)} className="font-bold h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] font-black uppercase text-slate-500">Inverter Warranty</Label>
                    <Input value={inputs.inverterWarranty} onChange={(e) => handleInputChange('inverterWarranty', e.target.value)} className="font-bold h-9 text-xs" />
                  </div>
                </div>
              </div>

              {/* Paste IDs Tool Moved to Bottom of Form */}
              <div className="space-y-2 mt-4 border-t pt-4">
                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                  Bulk Paste Consumer IDs
                </Label>
                <div className="flex flex-col gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <Textarea
                    placeholder="Paste IDs separated by comma, space or newline..."
                    value={searchNumber}
                    onChange={(e) => setSearchNumber(e.target.value)}
                    className="min-h-[70px] border-slate-200 focus-visible:ring-arin-teal font-bold text-xs bg-white rounded-lg p-2 resize-none"
                  />
                  <Button 
                    onClick={handleSearch}
                    disabled={isFetching || !searchNumber}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-black uppercase text-[10px] tracking-widest w-full h-9 rounded-lg transition-all"
                  >
                    {isFetching ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Select From Paste"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CONFIGURATION */}
          {activeTab === 'settings' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="space-y-3 bg-slate-50/50 p-5 rounded-xl border border-slate-100">
                <h3 className="text-[10px] font-black uppercase text-arin-teal tracking-widest border-b pb-1">Threshold Parameter</h3>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground">Good Generation Threshold (kWh / kW)</Label>
                  <Input
                    type="number"
                    value={healthThreshold}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setHealthThreshold(val);
                      setInputs(prev => {
                        const updated = { ...prev, healthThreshold: val };
                        const calculated = calculateBillData(updated, selectedConsumer || {});
                        return {
                          ...updated,
                          systemHealth: calculated.systemHealth as 'Normal' | 'POOR' | 'GOOD'
                        };
                      });
                    }}
                    className="font-bold border-2 focus:border-arin-teal h-10 rounded-xl"
                    placeholder="Default is 75"
                  />
                  <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                    Threshold formula evaluates: if monthly generation divided by capacity (kW) is greater than this value, the system health shows as GOOD, otherwise POOR.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
        
        {/* Pinned Persistent Action Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/70 space-y-3 shrink-0">
          {isBlacklisted && (
            <div className="p-3 bg-red-500/10 border-2 border-red-500 rounded-xl text-red-500 text-[11px] font-bold space-y-1 mb-2">
              <p className="font-black uppercase tracking-wider text-[9px]">⚠️ Warning: Blacklisted Consumer</p>
              <p>Generation is blocked. Reason: {blacklistReason}</p>
            </div>
          )}
          
          <Button
            onClick={manualSubmit}
            disabled={!selectedConsumerId || isBlacklisted || isGeneratingSingle || isBulkDownloading}
            className="w-full bg-arin-teal hover:bg-arin-teal/90 font-black uppercase text-xs h-11 rounded-xl shadow-lg shadow-arin-teal/15 disabled:opacity-50"
          >
            {isBlacklisted ? "Generation Blocked (Blacklisted)" : "Apply Edits & Refresh Preview"}
          </Button>
          
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={handleGenerateAndSaveSingle}
              disabled={!selectedConsumerId || isBlacklisted || isGeneratingSingle || isBulkDownloading}
              className="border-2 font-bold h-11 text-xs rounded-xl hover:bg-slate-50 disabled:opacity-50"
            >
              {isGeneratingSingle ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-arin-teal" />
              ) : (
                <Download className="mr-2 h-4 w-4 text-arin-teal" />
              )}
              {isGeneratingSingle ? "Generating..." : "Generate & Save Single"}
            </Button>
            
            <Button
              variant="outline"
              onClick={() => onDownloadAllImages(Array.from(selectedForDownload))}
              disabled={selectedForDownload.size === 0 || isBulkDownloading || isGeneratingSingle || isBlacklisted}
              className="border-2 font-bold h-11 text-[10px] rounded-xl hover:bg-slate-50"
            >
              {isBulkDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-arin-teal" />
              ) : (
                <FolderDown className="mr-2 h-4 w-4 text-arin-teal" />
              )}
              {isBulkDownloading ? "Generating..." : `Generate & Save Batch (${selectedForDownload.size})`}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
