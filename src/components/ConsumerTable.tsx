import { Consumer } from "@/types/consumer";
import { formatCurrency, formatDate } from "@/lib/formatters";

interface ConsumerTableProps {
  consumers: Consumer[];
  onRowClick: (consumer: Consumer) => void;
}

export function ConsumerTable({ consumers, onRowClick }: ConsumerTableProps) {
  return (
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
          {consumers.length === 0 ? (
            <tr>
              <td colSpan={14} className="text-center py-8 text-muted-foreground">
                No consumers found matching your criteria
              </td>
            </tr>
          ) : (
            consumers.map((consumer, index) => (
              <tr
                key={consumer.id}
                onClick={() => onRowClick(consumer)}
                className="transition-colors"
              >
                <td className="font-medium text-center">{index + 1}</td>
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
  );
}
