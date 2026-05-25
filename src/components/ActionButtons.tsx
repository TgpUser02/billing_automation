import { Filter, Download, Upload, Plus } from "lucide-react";
import { Button } from "./ui/button";

interface ActionButtonsProps {
  onFilter: () => void;
  onExport: () => void;
  onImport: () => void;
  onAdd?: () => void;
  showAdd?: boolean;
}

export function ActionButtons({ onFilter, onExport, onImport, onAdd, showAdd = false }: ActionButtonsProps) {
  return (
    <div className="flex items-center gap-2">
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
        className="border-border bg-card hover:bg-secondary text-arin-teal"
      >
        <Upload className="w-4 h-4 mr-2" />
        Import Consumers
      </Button>

      <Button
        onClick={onExport}
        className="bg-success hover:bg-success/90 text-success-foreground"
      >
        <Download className="w-4 h-4 mr-2" />
        Export Data
      </Button>
    </div>
  );
}
