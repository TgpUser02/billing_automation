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
}

export function GenerationControls({
  onGenerate,
  onDownloadImage,
  onDownloadAllImages,
  selectedDate,
  onDateChange,
  isBulkDownloading = false,
}: GenerationControlsProps) {
  const [allBills, setAllBills] = useState<any[]>([]);
  const [dayConsumerIds, setDayConsumerIds] = useState<string[]>([]);
  const [selectedConsumerId, setSelectedConsumerId] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedForDownload, setSelectedForDownload] = useState<Set<string>>(new Set());
  const [isFetching, setIsFetching] = useState(false);
  const [searchNumber, setSearchNumber] = useState('');
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
        // Filter by selected ID if one is picked (Arin ID filter)
        if (selectedId && isMonthMatch) {
          const idNumMatch = selectedId.match(/\d+/);
          const idNum = idNumMatch ? idNumMatch[0] : "";
          const consumerArinId = String(b.arin_id || "").replace(/\D/g, "");
          
          if (idNum && !consumerArinId.includes(idNum)) {
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

  useEffect(() => {
    // Clear selections and previous list bindings when month changes
    setSelectedForDownload(new Set());
    setSelectedConsumerId('');
  }, [selectedDate]);

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

  // Refactored to be reusable and automatic
  const fetchDataAndGenerate = async (targetId: string, targetDate: Date) => {
    if (!targetId) return;

    setIsFetching(true);
    try {
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
        panelWarranty: '', // Calculated below
        systemWarranty: '', // Calculated below
        inverterWarranty: '', // Calculated below
        systemHealth: data.system_health || 'POOR',
        billStatus: data.bill_status || 'Normal',
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
      // AUTOMATIC PREVIEW (Rule #10)
      onGenerate({ id: targetId } as any, newInputs);

      toast({
        title: "Profile Loaded",
        description: `Analysis data for ${newInputs.consumerName} sync'd successfully.`,
      });
    } catch (e) {
      // Fallback to basic details if analysis is missing
      try {
        const details = await api.getCustomerDetails(targetId);
        const basicInputs: BillInputs = {
          ...inputs,
          consumerName: details.customer_name || 'N/A',
          consumerNumber: details.consumer_number,
          capacity: parseFloat(details.capacity) || 0,
          commissioningDate: details.commission_date ? format(new Date(details.commission_date), 'dd/MM/yy') : 'N/A',
          billStatus: 'Waiting for Sync'
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

  return (
    <Card className="h-full border-2 border-slate-100 shadow-xl overflow-hidden">
      <CardHeader className="pb-4 bg-slate-50 border-b border-slate-100">
        <CardTitle className="text-lg font-black text-arin-teal uppercase tracking-tight flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Bill Analysis & Editor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">


        {/* Month Selection */}
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase text-muted-foreground">Analysis Month</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-bold h-11 bg-slate-50 border-slate-200"
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

        {/* ID Selection - New logic based on selected date */}
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase text-muted-foreground">Reference ID Filter</Label>
          <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-100">
            {[`Arin#${String(selectedDate.getDate()).padStart(3, '0')}`, `Arin$${String(selectedDate.getDate()).padStart(3, '0')}`, ...(() => {
                try {
                  const stored = localStorage.getItem('arin_savedIds');
                  return stored ? JSON.parse(stored) : [];
                } catch { return []; }
              })()].map((id) => (
              <button
                key={id}
                onClick={() => setSelectedId(selectedId === id ? "" : id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border",
                  selectedId === id 
                    ? "bg-arin-teal text-white border-arin-teal" 
                    : "bg-white text-slate-500 border-slate-200 hover:border-arin-teal/50 hover:text-arin-teal"
                )}
              >
                {id}
              </button>
            ))}
            <button
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

        {/* Picker */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
          {/* New Search Section Styled like Image */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
              Bulk Paste Consumer IDs
            </Label>
            <div className="flex gap-2 bg-white p-2 rounded-xl border-2 border-slate-100 shadow-inner group focus-within:border-arin-teal/50 transition-all">
              <Textarea
                placeholder="Paste IDs separated by comma, space or newline..."
                value={searchNumber}
                onChange={(e) => setSearchNumber(e.target.value)}
                className="min-h-[60px] border-none shadow-none focus-visible:ring-0 font-bold text-xs resize-none p-2 bg-transparent"
              />
              <Button 
                onClick={handleSearch}
                disabled={isFetching || !searchNumber}
                className="bg-slate-900 hover:bg-slate-800 text-white font-black uppercase text-[10px] tracking-widest px-4 h-auto min-w-[140px] rounded-lg shadow-xl shadow-slate-200 transition-all active:scale-95"
              >
                {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Select From Paste"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center mb-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground flex justify-between w-full">
                <span>Select Consumer Profile</span>
                {dayBills.length > 0 && <span className="text-arin-teal">{dayBills.length} AVAILABLE</span>}
              </Label>
            </div>

            {/* Select All */}
            {dayBills.length > 0 && (
              <div
                className="flex items-center gap-3 p-2 mb-1 bg-arin-teal/5 border border-arin-teal/20 rounded-lg cursor-pointer hover:bg-arin-teal/10 transition-colors"
                onClick={toggleSelectAll}
              >
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={toggleSelectAll}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="text-[10px] font-black uppercase text-arin-teal tracking-wider">
                  {isAllSelected ? `Deselect All (${dayBills.length})` : `Select All (${dayBills.length})`}
                </span>
              </div>
            )}

            <div className="max-h-48 overflow-y-auto space-y-2 pr-2 border rounded-md p-2 bg-white">
              {dayBills.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No consumers available for selected date</p>
              ) : (
                dayBills.map((c) => (
                  <div key={c.consumer_number} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-md border border-transparent hover:border-slate-100 cursor-pointer transition-colors" onClick={() => setSelectedConsumerId(c.consumer_number)}>
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        checked={selectedForDownload.has(c.consumer_number)}
                        onCheckedChange={() => toggleSelect(c.consumer_number)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">{c.consumer_name}</span>
                        <span className="text-[10px] font-mono text-slate-500">{c.consumer_number}</span>
                      </div>
                    </div>
                    {selectedConsumerId === c.consumer_number && (
                      <span className="w-2 h-2 rounded-full bg-arin-orange" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          <Button
            onClick={() => fetchDataAndGenerate(selectedConsumerId!, selectedDate)}
            disabled={!selectedConsumerId || isFetching}
            variant="secondary"
            className="w-full font-black text-[10px] tracking-widest uppercase h-9 rounded-xl border border-slate-200 hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
          >
            {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            Resync Profile Data
          </Button>
        </div>

        {/* Editable Fields Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label className="text-[10px] font-black uppercase text-arin-orange flex items-center gap-1">
              <User className="w-3 h-3" /> Consumer Name
            </Label>
            <Input
              value={inputs.consumerName}
              onChange={(e) => handleInputChange('consumerName', e.target.value)}
              className="font-bold border-2 focus:border-arin-teal"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-arin-orange flex items-center gap-1">
              <Hash className="w-3 h-3" /> Number
            </Label>
            <Input
              value={inputs.consumerNumber}
              onChange={(e) => handleInputChange('consumerNumber', e.target.value)}
              className="font-bold border-2"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-arin-orange flex items-center gap-1">
              <CalendarLucide className="w-3 h-3" /> Reading Date
            </Label>
            <Input
              value={inputs.readingDate}
              onChange={(e) => handleInputChange('readingDate', e.target.value)}
              className="font-bold border-2"
            />
          </div>

          {[
            { label: "Generation", field: "generatedElectricity", icon: <Zap className="w-3 h-3" /> },
            { label: "Import", field: "importedFromGrid", icon: <Hash className="w-3 h-3" /> },
            { label: "Export", field: "exportedToGrid", icon: <Hash className="w-3 h-3" /> },
            { label: "Amount", field: "billingAmount", icon: <Zap className="w-3 h-3" /> },
            { label: "Prev Banked", field: "previousBankedUnit", icon: <Hash className="w-3 h-3" /> },
            { label: "Bank Solar", field: "currentBankedUnit", icon: <Hash className="w-3 h-3" /> },
            { label: "Commission Date", field: "commissioningDate", type: "text" },
            { label: "Capacity (KW)", field: "capacity", type: "number" },
            { label: "Panel Warranty", field: "panelWarranty", type: "text" },
            { label: "System Warranty", field: "systemWarranty", type: "text" },
            { label: "Inverter Warranty", field: "inverterWarranty", type: "text" },
          ].map((item) => (
            <div key={item.field} className="space-y-1.5">
              <Label className="text-[9px] font-black uppercase text-slate-500 flex items-center gap-1">
                {item.icon} {item.label}
              </Label>
              <Input
                type={item.type || "number"}
                value={(inputs as any)[item.field]}
                onChange={(e) => handleInputChange(item.field as any, item.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
                className="border-2 font-bold h-9 text-xs"
              />
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-6 border-t border-slate-100">
          <Button
            onClick={manualSubmit}
            className="w-full bg-arin-teal hover:bg-arin-teal/90 font-black uppercase text-xs h-12 shadow-lg shadow-arin-teal/20"
          >
            Refresh Preview with Edits
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={onDownloadImage}
              className="border-2 font-bold h-11 text-xs"
            >
              <Download className="mr-2 h-4 w-4" /> Save Image
            </Button>
            <Button
              variant="outline"
              onClick={() => onDownloadAllImages(Array.from(selectedForDownload))}
              disabled={selectedForDownload.size === 0 || isBulkDownloading}
              className="border-2 font-bold h-11 text-[10px]"
            >
              {isBulkDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FolderDown className="mr-2 h-4 w-4" />
              )}
              {isBulkDownloading ? "Processing..." : `Batch Save (${selectedForDownload.size})`}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
