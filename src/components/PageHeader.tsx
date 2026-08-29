import React from "react";
import { ArrowLeft, LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

interface PageHeaderProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  badge?: string;
  backTo?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}

export function PageHeader({
  title = "Page Title",
  description,
  icon: Icon,
  badge,
  backTo = "/",
  backLabel = "Back to Dashboard",
  actions
}: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
      <div className="flex items-center gap-3.5">
        {Icon && (
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-arin-green/15 to-arin-teal/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 shadow-sm shrink-0">
            <Icon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {title}
            </h1>
            {badge && (
              <Badge variant="outline" className="text-xs font-bold border-emerald-500/30 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40">
                {badge}
              </Badge>
            )}
          </div>
          {description && (
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {actions}
        {backTo && (
          <Link
            to={backTo}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-card border border-border hover:border-emerald-500/40 shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
            {backLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
export default PageHeader;
