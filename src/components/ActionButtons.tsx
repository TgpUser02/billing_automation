import { Button } from "@/components/ui/button";
import { Filter, Download } from "lucide-react";

interface ActionButtonsProps {
  onFilter: () => void;
  onExport: () => void;
}

export function ActionButtons({ onFilter, onExport }: ActionButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        onClick={onFilter}
        className="border-border bg-card hover:bg-secondary"
      >
        <Filter className="w-4 h-4 mr-2" />
        Filter
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
