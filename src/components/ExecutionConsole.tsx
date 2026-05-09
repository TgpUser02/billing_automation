import { useEffect, useRef } from "react";
import { Terminal, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | "process";
}

interface ExecutionConsoleProps {
  logs: LogEntry[];
  isRunning: boolean;
}

const ExecutionConsole = ({ logs, isRunning }: ExecutionConsoleProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLogColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "success":
        return "text-terminal-text";
      case "warning":
        return "text-warning";
      case "error":
        return "text-destructive";
      case "process":
        return "text-accent";
      default:
        return "text-terminal-dim";
    }
  };

  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="border-b border-border bg-terminal-bg py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-terminal-text" />
            <CardTitle className="text-sm font-medium text-terminal-text">
              Live Execution Console
            </CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            <Circle className="h-3 w-3 fill-destructive text-destructive" />
            <Circle className="h-3 w-3 fill-warning text-warning" />
            <Circle className="h-3 w-3 fill-success text-success" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div
          ref={scrollRef}
          className="h-64 overflow-y-auto bg-terminal-bg p-4 font-mono text-sm"
        >
          {logs.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-terminal-dim">
                Awaiting automation launch...
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-2">
                  <span className="text-terminal-dim shrink-0">
                    [{log.timestamp}]
                  </span>
                  <span className={getLogColor(log.type)}>
                    {">"} {log.message}
                  </span>
                </div>
              ))}
              {isRunning && (
                <div className="flex items-center gap-2">
                  <span className="text-terminal-dim">
                    [{new Date().toLocaleTimeString()}]
                  </span>
                  <span className="text-terminal-text">
                    {">"}{" "}
                    <span className="animate-cursor-blink">▊</span>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ExecutionConsole;
