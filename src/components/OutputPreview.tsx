import { Folder, FileText, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DownloadedFile {
  id: number;
  filename: string;
  status: "complete" | "pending";
  timestamp: string;
}

interface OutputPreviewProps {
  downloadedFiles: DownloadedFile[];
  totalDownloaded: number;
  totalConsumers: number;
  storagePath: string;
}

const OutputPreview = ({
  downloadedFiles,
  totalDownloaded,
  totalConsumers,
  storagePath,
}: OutputPreviewProps) => {
  return (
    <Card className="glass-card">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
              <Folder className="h-5 w-5 text-warning" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">
                Local Storage Path
              </CardTitle>
              <p className="font-mono text-xs text-muted-foreground">
                {storagePath || "C:\\Users\\titik\\Desktop\\arin\\[Date]\\"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-foreground">
              {totalDownloaded}
              <span className="text-lg text-muted-foreground">
                /{totalConsumers}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">PDFs Downloaded</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Recent Downloads
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-2">
            {downloadedFiles.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No files downloaded yet
              </p>
            ) : (
              downloadedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-secondary/50"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-destructive" />
                    <span className="font-mono text-sm">{file.filename}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {file.timestamp}
                    </span>
                    {file.status === "complete" ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Clock className="h-4 w-4 text-warning animate-pulse" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default OutputPreview;
