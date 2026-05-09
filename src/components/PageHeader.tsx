import { Sun, Database, ArrowLeft } from "lucide-react";
import { Link } from 'react-router-dom';

export function PageHeader() {
  return (
    <header className="header-gradient px-6 py-4 flex justify-between items-center">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/20">
          <Sun className="w-6 h-6 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-primary-foreground flex items-center gap-2">
            <Database className="w-5 h-5" />
            Consumer Database
          </h1>
          <p className="text-sm text-primary-foreground/70">
            Solar Energy Billing System
          </p>
        </div>
      </div>
      <div>
        <Link to="/" className="flex items-center gap-2 text-sm text-primary-foreground/80 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>
    </header>
  );
}
