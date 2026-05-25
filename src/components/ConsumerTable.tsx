import { useState } from "react";
import { Consumer } from "@/types/consumer";
import { formatCurrency, formatDate } from "@/lib/formatters";

interface ConsumerTableProps {
  consumers: Consumer[];
  onRowClick: (consumer: Consumer) => void;
  isLoading?: boolean;
}

export function ConsumerTable({ consumers, onRowClick, isLoading = false }: ConsumerTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  
  // Reset to page 1 if consumers change
  const totalPages = Math.ceil(consumers.length / pageSize);
  const safePage = Math.min(currentPage, Math.max(1, totalPages));
  
  const currentData = consumers.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="flex flex-col gap-4">
    <div className="overflow-x-auto rounded-lg border border-table-border panel-shadow">
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-16">S.No</th>
            <th className="w-24">Arin ID</th>
            <th className="w-32">Month</th>
            <th className="min-w-[200px]">Consumer Name</th>
            <th className="w-36">Consumer No</th>
            <th className="w-28">Capacity (kW)</th>
            <th className="w-32">Commission Date</th>
            <th className="w-28">Import Units</th>
            <th className="w-28">Export Units</th>
            <th className="w-32">Total Generation</th>
            <th className="w-28">Reading Date</th>
            <th className="w-32">Amount (₹)</th>
            <th className="w-28">Prev Banked</th>
            <th className="w-28">Bank Solar</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td className="text-center py-4"><div className="h-4 w-6 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                <td><div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                <td><div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded" /></td>
                <td><div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" /></td>
                <td><div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded font-mono" /></td>
                <td><div className="h-4 w-8 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                <td><div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded" /></td>
                <td><div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                <td><div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                <td><div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                <td><div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded" /></td>
                <td><div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                <td><div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
                <td><div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded mx-auto" /></td>
              </tr>
            ))
          ) : consumers.length === 0 ? (
            <tr>
              <td colSpan={14} className="text-center py-8 text-muted-foreground">
                No consumers found matching your criteria
              </td>
            </tr>
          ) : (
            currentData.map((consumer, index) => (
              <tr
                key={consumer.id}
                onClick={() => onRowClick(consumer)}
                className="transition-colors cursor-pointer hover:bg-muted/50"
              >
                <td className="font-medium text-center">{(safePage - 1) * pageSize + index + 1}</td>
                <td className="text-arin-teal font-black text-xs">{(consumer as any).arinId}</td>
                <td>{consumer.month}</td>
                <td className="font-medium text-primary">{consumer.consumerName}</td>
                <td className="font-mono text-sm">{consumer.consumerNo}</td>
                <td className="text-center">{consumer.capacityKW}</td>
                <td>{formatDate(consumer.commissionDate)}</td>
                <td className="text-center font-medium">{consumer.importUnits.toLocaleString()}</td>
                <td className="text-center font-medium text-success">{consumer.exportUnits.toLocaleString()}</td>
                <td className="text-center font-semibold">{consumer.totalGeneration.toLocaleString()}</td>
                <td>{formatDate(consumer.readingDate)}</td>
                <td className="font-semibold text-primary">{formatCurrency(consumer.amount)}</td>
                <td className="text-center">{consumer.previousUnit.toLocaleString()}</td>
                <td className="text-center font-bold text-arin-teal">{consumer.currentUnit.toLocaleString()}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
    
    {totalPages > 1 && (
      <div className="flex justify-between items-center px-4 py-2 bg-muted/20 rounded-lg">
        <span className="text-sm text-muted-foreground">
          Showing {(safePage - 1) * pageSize + 1} to {Math.min(safePage * pageSize, consumers.length)} of {consumers.length} entries
        </span>
        <div className="flex gap-2">
          <button 
            disabled={safePage === 1}
            onClick={() => setCurrentPage(safePage - 1)}
            className="px-3 py-1 rounded bg-background border border-border disabled:opacity-50 text-sm"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm flex items-center font-medium">
            Page {safePage} of {totalPages}
          </span>
          <button 
            disabled={safePage === totalPages}
            onClick={() => setCurrentPage(safePage + 1)}
            className="px-3 py-1 rounded bg-background border border-border disabled:opacity-50 text-sm"
          >
            Next
          </button>
        </div>
      </div>
    )}
    </div>
  );
}
