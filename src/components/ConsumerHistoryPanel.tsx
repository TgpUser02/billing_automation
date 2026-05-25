import { 
  X, 
  User, 
  Zap, 
  Calendar, 
  TrendingUp, 
  Sun, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ArrowUp, 
  ArrowDown, 
  Battery, 
  BatteryCharging, 
  Receipt, 
  Activity, 
  Database,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Consumer } from "@/types/consumer";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";

interface ConsumerHistoryPanelProps {
  consumer: Consumer;
  history: Consumer[];
  onClose: () => void;
}

export function ConsumerHistoryPanel({
  consumer,
  history,
  onClose,
}: ConsumerHistoryPanelProps) {
  const totalAmount = history.reduce((sum, h) => sum + h.amount, 0);
  const totalGeneration = history.reduce((sum, h) => sum + h.totalGeneration, 0);
  const totalExport = history.reduce((sum, h) => sum + h.exportUnits, 0);
  const totalImport = history.reduce((sum, h) => sum + h.importUnits, 0);
  const netEnergy = totalImport - totalExport;
  const isNetExporterOverall = netEnergy < 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />
      
      {/* Drawer Panel */}
      <div className="relative w-full max-w-lg bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-l border-slate-200/50 dark:border-slate-800/50 shadow-2xl shadow-slate-950/20 animate-in slide-in-from-right duration-300 ease-out flex flex-col h-full">
        
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800/50 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-arin-teal to-arin-green flex items-center justify-center text-white shadow-md shadow-arin-teal/10">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                Consumer History
                <Sparkles className="w-4 h-4 text-arin-green animate-pulse" />
              </h2>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Detailed Net-Billing Summary
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/40 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin">
          
          {/* Consumer Info Header Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-lg border border-slate-800">
            {/* Background design elements */}
            <div className="absolute right-0 top-0 w-24 h-24 bg-arin-teal/10 rounded-full blur-2xl" />
            <div className="absolute left-1/2 bottom-0 w-32 h-16 bg-arin-green/10 rounded-full blur-2xl" />
            
            <div className="relative space-y-4">
              <div>
                <span className="inline-flex px-2 py-0.5 rounded bg-white/10 text-[10px] font-black uppercase tracking-widest text-arin-teal">
                  Active Connection
                </span>
                <h3 className="font-bold text-xl tracking-tight mt-1 bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-200">
                  {consumer.consumerName}
                </h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/10 text-xs">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Consumer Number</p>
                  <p className="font-mono font-bold text-sm tracking-wide text-slate-100">{consumer.consumerNo}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">System Capacity</p>
                  <p className="font-bold text-sm text-arin-green">{consumer.capacityKW} kW Solar</p>
                </div>
                <div className="col-span-2 space-y-1">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Commissioned Date</p>
                  <p className="font-medium text-slate-200 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-arin-teal" />
                    {formatDate(consumer.commissionDate)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Solar Generation */}
            <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-center space-y-1 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="w-8 h-8 rounded-full bg-amber-500/10 mx-auto flex items-center justify-center">
                <Sun className="w-4 h-4 text-amber-500 animate-spin-slow" />
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Gen</p>
              <p className="text-xl font-black text-amber-600 dark:text-amber-400">
                {totalGeneration.toLocaleString()} <span className="text-xs font-normal">kWh</span>
              </p>
            </div>

            {/* Total Export */}
            <div className="bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center space-y-1 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 mx-auto flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Export</p>
              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                {totalExport.toLocaleString()} <span className="text-xs font-normal">kWh</span>
              </p>
            </div>

            {/* Total Import */}
            <div className="bg-orange-500/5 dark:bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 text-center space-y-1 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="w-8 h-8 rounded-full bg-orange-500/10 mx-auto flex items-center justify-center">
                <ArrowDownLeft className="w-4 h-4 text-orange-500" />
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Import</p>
              <p className="text-xl font-black text-orange-600 dark:text-orange-400">
                {totalImport.toLocaleString()} <span className="text-xs font-normal">kWh</span>
              </p>
            </div>

            {/* Net Status */}
            <div className={`border rounded-2xl p-4 text-center space-y-1 shadow-sm hover:shadow-md transition-all duration-300 ${
              isNetExporterOverall
                ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/20'
                : 'bg-orange-500/5 dark:bg-orange-500/10 border-orange-500/20'
            }`}>
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-900 mx-auto flex items-center justify-center">
                {isNetExporterOverall ? (
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Activity className="w-4 h-4 text-orange-500" />
                )}
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Net Flow</p>
              <p className={`text-xl font-black ${isNetExporterOverall ? 'text-emerald-600' : 'text-orange-600'}`}>
                {isNetExporterOverall ? '-' : '+'}{Math.abs(netEnergy).toLocaleString()} <span className="text-xs font-normal">kWh</span>
              </p>
            </div>

            {/* Total Billing pill */}
            <div className="col-span-2 bg-gradient-to-br from-arin-teal/10 to-arin-green/10 border border-arin-teal/20 rounded-2xl p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-arin-teal/10 flex items-center justify-center text-arin-teal">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Billed Amount</p>
                  <p className="text-xs text-muted-foreground">{history.length} active bills computed</p>
                </div>
              </div>
              <p className="text-2xl font-black text-arin-teal">
                {formatCurrency(totalAmount)}
              </p>
            </div>
          </div>

          {/* Month-wise Records Section */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-xs uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-arin-teal" />
              Monthly Billing Breakdown
            </h4>

            {history.length === 0 ? (
              <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl py-10 text-center text-slate-400">
                <Database className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold">No history records loaded</p>
                <p className="text-xs text-muted-foreground mt-0.5">Import bills to construct history timeline</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((record, index) => {
                  const itemNet = record.importUnits - record.exportUnits;
                  const isNetExporter = itemNet < 0;
                  const importRatio = record.importUnits + record.exportUnits > 0
                    ? (record.importUnits / (record.importUnits + record.exportUnits)) * 100
                    : 50;

                  return (
                    <div
                      key={record.id || index}
                      className="group bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl p-4 space-y-4 hover:border-arin-teal/40 dark:hover:border-arin-teal/30 hover:bg-white dark:hover:bg-slate-900/80 transition-all duration-300 shadow-sm hover:shadow-md"
                    >
                      {/* Card Header */}
                      <div className="flex items-center justify-between border-b border-slate-200/50 dark:border-slate-800/40 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-700 dark:text-slate-200">
                            {record.month}
                          </span>
                          {isNetExporter ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/10 font-bold text-[9px] uppercase tracking-wider flex items-center gap-0.5 py-0 px-2.5">
                              <ArrowUp className="w-2.5 h-2.5" /> Exporter
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/10 font-bold text-[9px] uppercase tracking-wider flex items-center gap-0.5 py-0 px-2.5">
                              <ArrowDown className="w-2.5 h-2.5" /> Consumer
                            </Badge>
                          )}
                        </div>
                        <span className="font-extrabold text-base text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl group-hover:bg-arin-teal/10 group-hover:text-arin-teal transition-all duration-300">
                          {formatCurrency(record.amount)}
                        </span>
                      </div>

                      {/* Energy I/O Flow Visualizer */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                            <ArrowDownLeft className="w-3 h-3" /> Import ({record.importUnits} kWh)
                          </span>
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            Export ({record.exportUnits} kWh) <ArrowUpRight className="w-3 h-3" />
                          </span>
                        </div>
                        
                        {/* Dual colored Meter */}
                        <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
                          <div 
                            style={{ width: `${importRatio}%` }}
                            className="bg-gradient-to-r from-orange-400 to-amber-500 transition-all duration-500" 
                          />
                          <div 
                            style={{ width: `${100 - importRatio}%` }}
                            className="bg-gradient-to-r from-emerald-400 to-arin-teal transition-all duration-500" 
                          />
                        </div>

                        <div className="flex justify-between items-center text-[10px] pt-1">
                          <p className="text-muted-foreground">
                            Net Flow: <span className={`font-bold ${isNetExporter ? 'text-emerald-600' : 'text-orange-600'}`}>
                              {isNetExporter ? '-' : '+'}{Math.abs(itemNet)} kWh
                            </span>
                          </p>
                          <p className="text-muted-foreground flex items-center gap-1">
                            <Sun className="w-3 h-3 text-amber-500" />
                            Solar Gen: <span className="font-bold text-slate-700 dark:text-slate-300">{record.totalGeneration} kWh</span>
                          </p>
                        </div>
                      </div>

                      {/* Technical & Banked Solar Details */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/40 text-[11px]">
                        {/* Banked Solar battery charge card */}
                        <div className="bg-white/40 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800/60 rounded-xl p-2 flex items-center gap-2.5">
                          {record.currentUnit > record.previousUnit ? (
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                              <BatteryCharging className="w-4 h-4 animate-pulse" />
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-arin-teal/10 flex items-center justify-center text-arin-teal">
                              <Battery className="w-4 h-4" />
                            </div>
                          )}
                          <div className="space-y-0.5">
                            <p className="text-[9px] uppercase font-bold text-slate-400 leading-none">Banked Solar</p>
                            <p className="font-bold text-slate-700 dark:text-slate-300">{record.currentUnit} <span className="font-normal text-[9px] text-muted-foreground">kWh</span></p>
                          </div>
                        </div>

                        <div className="bg-white/40 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800/60 rounded-xl p-2 flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                            <Calendar className="w-4 h-4" />
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[9px] uppercase font-bold text-slate-400 leading-none">Reading Date</p>
                            <p className="font-semibold text-slate-600 dark:text-slate-400">{formatDate(record.readingDate)}</p>
                          </div>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
