import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "lucide-react";

interface MonthFilterProps {
  value: string;
  onChange: (value: string) => void;
  months: string[];
}

export function MonthFilter({ value, onChange, months }: MonthFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-muted-foreground" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-48 bg-card border-border">
          <SelectValue placeholder="Select Month" />
        </SelectTrigger>
        <SelectContent className="bg-card border-border z-50">
          {months.map((month) => (
            <SelectItem key={month} value={month}>
              {month}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
