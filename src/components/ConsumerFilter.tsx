import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Trash2, Upload, Edit2, X, RefreshCw, Layers, Plus, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

interface Consumer {
  index: number;
  consumerNumber: string;
  name: string;
  bu?: string;
  month?: string;
  selected: boolean;
}

interface ConsumerFilterProps {
  consumers: Consumer[];
  setConsumers: React.Dispatch<React.SetStateAction<Consumer[]>>;
  onFetch: () => void;
  onExcelUpload: (file: File) => void;
  excelData: any[];
  selectedDate?: Date;
  onLinkConsumerClick?: () => void;
}

const ConsumerFilter = ({ consumers, setConsumers, onFetch, onExcelUpload, excelData, selectedDate, onLinkConsumerClick }: ConsumerFilterProps) => {
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkNumbers, setBulkNumbers] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingConsumer, setEditingConsumer] = useState<Consumer | null>(null);
  const [newConsumerNumber, setNewConsumerNumber] = useState("");
  const [newConsumerName, setNewConsumerName] = useState("");
  const [isMissingModalOpen, setIsMissingModalOpen] = useState(false);
  const [missingNumbersList, setMissingNumbersList] = useState<string[]>([]);
  const { toast } = useToast();


  const handleAddConsumer = () => {
    if (newConsumerNumber) {
      const name = newConsumerName || `Manual - ${newConsumerNumber.slice(-4)}`;
      setConsumers([
        {
          index: Date.now(),
          consumerNumber: newConsumerNumber,
          name: name,
          selected: true,
        },
        ...consumers,
      ]);
      setNewConsumerNumber("");
      setNewConsumerName("");
      setIsEditModalOpen(false);
      toast({ title: "Added", description: `Added ${newConsumerNumber} to list.` });
    }
  };

  const handleBulkAdd = () => {
    const numbers = bulkNumbers.split(/[,\n\s]/)
      .map(n => n.trim())
      .filter(n => n.length > 5);

    if (numbers.length === 0) {
      toast({ title: "No Numbers", description: "Please paste target consumer numbers.", variant: "destructive" });
      return;
    }

    const existingMap = new Map();
    consumers.forEach(c => existingMap.set(c.consumerNumber, c));

    const missing = numbers.filter(num => !existingMap.has(num));
    if (missing.length > 0) {
      setMissingNumbersList(missing);
      setIsMissingModalOpen(true);
    }

    const updated = [...consumers];
    let addedCount = 0;
    let selectedCountExtra = 0;
    const batchMap = new Map();

    numbers.forEach(num => {
      if (existingMap.has(num)) {
        const existing = updated.find(u => u.consumerNumber === num);
        if (existing && !existing.selected) {
          existing.selected = true;
          selectedCountExtra++;
        }
      } else if (!batchMap.has(num)) {
        updated.unshift({
          index: Date.now() + addedCount,
          consumerNumber: num,
          name: `Bulk Entry - ${num.slice(-4)}`,
          selected: true
        });
        addedCount++;
        batchMap.set(num, true);
      }
    });

    setConsumers(updated);
    setBulkNumbers("");
    setIsBulkModalOpen(false);

    if (missing.length === 0) {
      toast({
        title: "Bulk Success",
        description: `Added ${addedCount} new and selected ${selectedCountExtra + addedCount} total.`
      });
    }
  };

  const handleSelectOnlyPasted = () => {
    const numbers = bulkNumbers.split(/[,\n\s]/)
      .map(n => n.trim())
      .filter(n => n.length > 5);

    if (numbers.length === 0) {
      toast({ title: "No Numbers", description: "Paste numbers to filter.", variant: "destructive" });
      return;
    }

    const existingSet = new Set(consumers.map(c => c.consumerNumber));
    const missing = numbers.filter(num => !existingSet.has(num));

    if (missing.length > 0) {
      setMissingNumbersList(missing);
      setIsMissingModalOpen(true);
    }

    const targetSet = new Set(numbers);
    const updated = consumers.map(c => ({
      ...c,
      selected: targetSet.has(c.consumerNumber)
    }));

    setConsumers(updated);
    setBulkNumbers("");
    setIsBulkModalOpen(false);

    if (missing.length === 0) {
      toast({ title: "Filter Applied", description: `Selected only the ${numbers.length} numbers provided.` });
    }
  };

  const toggleAll = (selected: boolean) => {
    setConsumers(consumers.map(c => ({ ...c, selected })));
  };

  const handleEdit = () => {
    if (editingConsumer) {
      setConsumers(consumers.map(c =>
        c.index === editingConsumer.index
          ? { ...c, consumerNumber: newConsumerNumber, name: newConsumerName }
          : c
      ));
      setEditingConsumer(null);
      setNewConsumerNumber("");
      setNewConsumerName("");
      setIsEditModalOpen(false);
    }
  };

  const openEditModal = (c: Consumer) => {
    setEditingConsumer(c);
    setNewConsumerNumber(c.consumerNumber);
    setNewConsumerName(c.name);
    setIsEditModalOpen(true);
  };

  const deleteConsumer = (index: number) => {
    setConsumers(consumers.filter(c => c.index !== index));
    toast({ title: "Consumer Removed", description: "Record deleted from list." });
  };

  const handleDeleteSelected = () => {
    setConsumers(consumers.filter((c) => !c.selected));
  };

  const toggleConsumerSelection = (index: number) => {
    setConsumers(
      consumers.map((c) =>
        c.index === index ? { ...c, selected: !c.selected } : c
      )
    );
  };

  const applyExcelFilter = (isAutoSync = false) => {
    if (excelData.length === 0 || consumers.length === 0) return;

    const normalizeNum = (num: any) => {
      if (!num) return "";
      let s = String(num).trim();
      if (s.includes('.')) {
        const parts = s.split('.');
        if (parts[1] === '0' || parts[1] === '') s = parts[0];
      }
      return s.replace(/^0+/, "");
    };

    const normalizeDate = (dateVal: any) => {
      if (!dateVal) return null;
      try {
        if (typeof dateVal === 'number') {
          const d = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        }

        let dStr = String(dateVal).trim();
        if (dStr.match(/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/)) {
          const parts = dStr.split(/[\/-]/);
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          const year = parts[2];
          return `${year}-${month}-${day}`;
        }

        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return null;

        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      } catch {
        return null;
      }
    };

    const targetDate = normalizeDate(selectedDate);

    const filteredExcel = excelData.filter(d => {
      if (!targetDate) return true;
      if (!d.date && !d.Date) return false;
      const rowDate = normalizeDate(d.date || d.Date);
      return rowDate === targetDate;
    });

    const excelNumbersSet = new Set(filteredExcel.map(d => normalizeNum(d.consumerNumber || d['Consumer Number'] || d['Consumer No'])));

    setConsumers(prev => {
      const updated = prev.map(c => ({
        ...c,
        selected: excelNumbersSet.has(normalizeNum(c.consumerNumber))
      }));

      const hasChanged = updated.some((c, i) => c.selected !== prev[i].selected);
      if (!hasChanged) return prev;

      const matchedCount = updated.filter(c => c.selected).length;

      if (!isAutoSync) {
        toast({
          title: "Excel Sync Applied",
          description: targetDate
            ? `Found ${matchedCount} consumers matching date ${targetDate}.`
            : `Found ${matchedCount} consumers from Excel list.`
        });
      }
      return updated;
    });
  };

  useEffect(() => {
    if (excelData.length > 0 && consumers.length > 0) {
      applyExcelFilter(true);
    }
  }, [selectedDate, excelData, consumers]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      onExcelUpload(e.target.files[0]);
    }
  };

  const selectedCount = consumers.filter((c) => c.selected).length;

  return (
    <Card className="glass-card border-slate-200 shadow-xl rounded-2xl overflow-hidden bg-white/80">
      <CardHeader className="pb-6 border-b border-slate-50">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-arin-teal/10 flex items-center justify-center">
              <Layers className="w-6 h-6 text-arin-teal" />
            </div>
            <CardTitle className="text-xl font-black text-[#1E293B] tracking-tight">
              Consumer Selection
            </CardTitle>
          </div>

          <div className="flex items-center gap-2">
            {onLinkConsumerClick && (
              <Button
                onClick={onLinkConsumerClick}
                className="bg-arin-teal hover:bg-arin-teal/90 text-white font-black text-[10px] uppercase tracking-widest rounded-xl h-8 px-3.5 shadow-md shadow-arin-teal/10 flex items-center gap-1.5"
              >
                <Plus className="w-3 h-3" />
                Add Consumer to 3rd Party
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => applyExcelFilter(false)}
              className="text-[10px] font-black uppercase tracking-widest text-arin-teal hover:bg-arin-teal/5"
              disabled={excelData.length === 0 || consumers.length === 0}
            >
              Sync with Excel
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`p-4 rounded-xl border-2 transition-all cursor-pointer hover:bg-slate-50 relative overflow-hidden group ${consumers.length > 0 && !excelData.length ? 'border-arin-teal bg-arin-teal/5' : 'border-slate-100'}`} onClick={onFetch}>
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <RefreshCw className="w-16 h-16 text-arin-teal transform rotate-12" />
              </div>
              <div className="flex flex-col gap-2 relative z-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-arin-teal text-white flex items-center justify-center shadow-lg shadow-arin-teal/30">
                    <RefreshCw className="w-4 h-4" />
                  </div>
                  <span className="font-black text-sm text-[#1E293B] uppercase tracking-wide">Fetch from Site</span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                  Automatically scrape the entire consumer list from the active dashboard session.
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-xl border-2 transition-all hover:bg-slate-50 relative overflow-hidden group ${excelData.length > 0 ? 'border-arin-orange bg-arin-orange/5' : 'border-slate-100'}`}>
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                <Upload className="w-16 h-16 text-arin-orange transform -rotate-12" />
              </div>

              <div className="flex flex-col gap-3 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-arin-orange text-white flex items-center justify-center shadow-lg shadow-arin-orange/30">
                      <Upload className="w-4 h-4" />
                    </div>
                    <span className="font-black text-sm text-[#1E293B] uppercase tracking-wide">Upload / Manual</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <label className="flex-1 min-w-[100px] cursor-pointer">
                    <div className="h-8 px-3 rounded-lg bg-white border border-slate-200 hover:border-arin-orange/50 hover:text-arin-orange font-bold text-[10px] text-slate-600 flex items-center justify-center gap-2 transition-all shadow-sm">
                      <Upload className="h-3 w-3" />
                      <span>Excel</span>
                    </div>
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
                  </label>

                  <Button variant="outline" size="sm" className="h-8 px-2 rounded-lg border-slate-200 font-bold text-[9px] uppercase tracking-tighter" onClick={() => toggleAll(true)}>Select All</Button>
                  <Button variant="outline" size="sm" className="h-8 px-2 rounded-lg border-slate-200 font-bold text-[9px] uppercase tracking-tighter" onClick={() => toggleAll(false)}>None</Button>
                  <Button variant="outline" size="sm" className="h-8 px-2 rounded-lg border-arin-orange/20 text-arin-orange hover:bg-arin-orange hover:text-white font-black text-[9px] uppercase tracking-tighter" onClick={() => setIsBulkModalOpen(true)}>Bulk Paste</Button>
                  {onLinkConsumerClick && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 rounded-lg border-arin-teal/20 text-arin-teal hover:bg-arin-teal hover:text-white font-black text-[9px] uppercase tracking-tighter flex items-center gap-1"
                      onClick={onLinkConsumerClick}
                    >
                      <Plus className="h-3 w-3" />
                      Add to 3rd Party Portal
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-8 w-8 px-0 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 disabled:opacity-30 transition-all" onClick={handleDeleteSelected} disabled={selectedCount === 0} title="Clear Selection"><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#F8FAFC] rounded-2xl border border-slate-200 p-1">
            <div className="flex border-b border-slate-200 py-3 px-6">
              <div className="flex-[2] text-xs font-black text-[#64748B] uppercase tracking-widest">Consumer</div>
              <div className="flex-1 text-xs font-black text-[#64748B] uppercase tracking-widest text-right">Details</div>
            </div>

            {consumers.length > 0 ? (
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                {consumers.map((c) => (
                  <div key={c.index} className="flex py-3 px-6 items-center hover:bg-white transition-colors group">
                    <div className="flex-[2] flex items-center gap-3">
                      <Checkbox checked={c.selected} onCheckedChange={() => toggleConsumerSelection(c.index)} />
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-bold text-[#1E293B]">{c.consumerNumber}</span>
                        <span className="text-[10px] text-slate-400 font-medium truncate max-w-[200px]">{c.name}</span>
                      </div>
                    </div>
                    <div className="flex-1 flex justify-end items-center gap-2">
                      <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-slate-100 transition-all" onClick={() => openEditModal(c)}><Edit2 className="w-3.5 h-3.5 text-slate-400" /></Button>
                      <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all" onClick={() => deleteConsumer(c.index)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                      {c.bu && <span className="bg-slate-100 text-[#64748B] text-[9px] font-black px-1.5 py-0.5 rounded ml-1">BU {c.bu}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                <p className="text-sm font-black text-slate-400 uppercase tracking-tighter">Fetch consumers to begin</p>
                {onLinkConsumerClick && (
                  <Button
                    onClick={onLinkConsumerClick}
                    variant="outline"
                    className="text-[10px] font-black uppercase tracking-widest text-arin-teal border-arin-teal/20 hover:bg-arin-teal/5 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Consumer on 3rd Party Website
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {consumers.length} total • {selectedCount} selected
            </p>
          </div>

          <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
            <DialogContent className="rounded-3xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-black">{editingConsumer ? 'Edit Consumer' : 'Add New Consumer'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Consumer Number</label>
                  <Input placeholder="Enter Number" value={newConsumerNumber} onChange={(e) => setNewConsumerNumber(e.target.value)} className="rounded-xl h-12" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Display Name</label>
                  <Input placeholder="Enter Name" value={newConsumerName} onChange={(e) => setNewConsumerName(e.target.value)} className="rounded-xl h-12" />
                </div>
                <Button onClick={editingConsumer ? handleEdit : handleAddConsumer} className="w-full h-12 rounded-xl bg-arin-teal hover:bg-arin-teal/90 font-bold">
                  {editingConsumer ? 'Save Changes' : 'Add to List'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isBulkModalOpen} onOpenChange={setIsBulkModalOpen}>
            <DialogContent className="rounded-3xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-xl font-black">Bulk Manual Entry</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Paste Consumer Numbers</label>
                  <p className="text-[9px] text-slate-400 italic">Separate by comma, space or newline</p>
                  <textarea
                    className="w-full h-32 p-3 rounded-xl border border-slate-200 font-mono text-xs focus:ring-2 focus:ring-arin-orange outline-none transition-all"
                    placeholder="410012345678&#10;410088877766"
                    value={bulkNumbers}
                    onChange={(e) => setBulkNumbers(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={handleBulkAdd} variant="outline" className="h-10 rounded-xl font-bold text-[10px] uppercase">Add & Select</Button>
                  <Button onClick={handleSelectOnlyPasted} className="h-10 rounded-xl bg-arin-orange hover:bg-arin-orange/90 font-black text-[10px] uppercase text-white shadow-lg shadow-arin-orange/20">Select ONLY These</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isMissingModalOpen} onOpenChange={setIsMissingModalOpen}>
            <DialogContent
              className="rounded-3xl sm:max-w-md border-t-4 border-t-red-500"
              onPointerDownOutside={(e) => e.preventDefault()}
              onEscapeKeyDown={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle className="text-xl font-black text-red-600">Numbers Not Found</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                  <p className="text-xs font-bold text-red-700 mb-2 uppercase tracking-tight">The following consumer numbers are not present on the portal:</p>
                  <div className="max-h-40 overflow-y-auto font-mono text-xs text-red-600 bg-white/50 p-3 rounded-xl border border-red-100/50 flex flex-wrap gap-2">
                    {missingNumbersList.map((num, i) => (
                      <span key={i} className="bg-white px-2 py-1 rounded-md border border-red-100 shadow-sm">{num}</span>
                    ))}
                  </div>
                </div>
                <Button
                  onClick={() => setIsMissingModalOpen(false)}
                  className="w-full h-12 rounded-xl bg-slate-900 hover:bg-black text-white font-black uppercase tracking-widest text-xs"
                >
                  OK - I Understand
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
};

export default ConsumerFilter;
