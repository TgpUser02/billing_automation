import { X, User, Zap, Calendar, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Consumer } from "@/types/consumer";
import { formatCurrency, formatDate } from "@/lib/formatters";

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

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-foreground/20 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg bg-panel border-l border-panel-border panel-shadow animate-slide-in-right overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-panel border-b border-panel-border p-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Consumer History
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Full billing history till date
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="hover:bg-secondary"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Consumer Info */}
        <div className="p-4 border-b border-panel-border bg-secondary/30">
          <h3 className="font-semibold text-lg text-primary">
            {consumer.consumerName}
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Consumer No:</span>
              <span className="ml-2 font-mono font-medium">{consumer.consumerNo}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Capacity:</span>
              <span className="ml-2 font-medium">{consumer.capacityKW} kW</span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Commission Date:</span>
              <span className="ml-2 font-medium">
                {formatDate(consumer.commissionDate)}
              </span>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="p-4 grid grid-cols-3 gap-3">
          <div className="bg-primary/5 rounded-lg p-3 text-center border border-primary/10">
            <Zap className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Total Generation</p>
            <p className="text-lg font-bold text-primary">
              {totalGeneration.toLocaleString()}
            </p>
          </div>
          <div className="bg-success/5 rounded-lg p-3 text-center border border-success/10">
            <TrendingUp className="w-5 h-5 text-success mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Total Export</p>
            <p className="text-lg font-bold text-success">
              {totalExport.toLocaleString()}
            </p>
          </div>
          <div className="bg-accent/5 rounded-lg p-3 text-center border border-accent/10">
            <Calendar className="w-5 h-5 text-accent mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Total Amount</p>
            <p className="text-lg font-bold text-accent">
              {formatCurrency(totalAmount)}
            </p>
          </div>
        </div>

        {/* History Table */}
        <div className="p-4">
          <h4 className="font-semibold text-sm text-foreground mb-3">
            Month-wise Billing Records
          </h4>
          <div className="space-y-2">
            {history.map((record, index) => (
              <div
                key={record.id}
                className="bg-card border border-border rounded-lg p-3 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-primary">
                    {record.month}
                  </span>
                  <span className="font-bold text-lg">
                    {formatCurrency(record.amount)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Import:</span>
                    <span className="font-medium">{record.importUnits.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Export:</span>
                    <span className="font-medium text-success">{record.exportUnits.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Generation:</span>
                    <span className="font-medium">{record.totalGeneration.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Previous Unit:</span>
                    <span className="font-medium">{record.previousUnit.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Banked Solar:</span>
                    <span className="font-medium text-arin-teal font-bold">{record.currentUnit.toLocaleString()}</span>
                  </div>
                  <div className="col-span-2 flex justify-between">
                    <span className="text-muted-foreground">Reading Date:</span>
                    <span className="font-medium">{formatDate(record.readingDate)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
