import { Filter, Download, Upload, Plus, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "./ui/button";

interface ActionButtonsProps {
  onFilter: () => void;
  onExport: () => void;
  onExportExcel?: () => void;
  isExportingExcel?: boolean;
  onImport: () => void;
  onAdd?: () => void;
  showAdd?: boolean;
}

export function ActionButtons({
  onFilter,
  onExport,
  onExportExcel,
  isExportingExcel = false,
  onImport,
  onAdd,
  showAdd = false
}: ActionButtonsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {showAdd && onAdd && (
        <Button
          onClick={onAdd}
          className="bg-arin-teal hover:bg-arin-teal/90 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Consumer
        </Button>
      )}
      <Button
        variant="outline"
        onClick={onImport}
        className="border-border bg-card hover:bg-secondary hover:text-arin-green text-arin-teal"
      >
        <Upload className="w-4 h-4 mr-2" />
        Import Consumers
      </Button>

      {onExportExcel && (
        <Button
          onClick={onExportExcel}
          disabled={isExportingExcel}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm transition-all"
          title="Download complete bill generation details for all customers in Excel (.xlsx)"
        >
          {isExportingExcel ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FileSpreadsheet className="w-4 h-4 mr-2" />
          )}
          Export to Excel
        </Button>
      )}

      <Button
        onClick={onExport}
        variant="outline"
        className="border-slate-200 hover:bg-slate-100 text-slate-700 font-medium"
      >
        <Download className="w-4 h-4 mr-2" />
        Export CSV
      </Button>
    </div>
  );
}
