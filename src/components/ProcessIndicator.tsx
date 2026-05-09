import { Check } from "lucide-react";

interface ProcessStep {
  id: number;
  label: string;
  status: "pending" | "active" | "complete";
}

interface ProcessIndicatorProps {
  currentStep: number;
}

const ProcessIndicator = ({ currentStep }: ProcessIndicatorProps) => {
  const steps: ProcessStep[] = [
    { id: 1, label: "Select Date", status: currentStep > 1 ? "complete" : currentStep === 1 ? "active" : "pending" },
    { id: 2, label: "Launch Selenium", status: currentStep > 2 ? "complete" : currentStep === 2 ? "active" : "pending" },
    { id: 3, label: "Manual OTP Entry", status: currentStep > 3 ? "complete" : currentStep === 3 ? "active" : "pending" },
    { id: 4, label: "Downloading", status: currentStep > 4 ? "complete" : currentStep === 4 ? "active" : "pending" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {steps.map((step, index) => (
        <div key={step.id} className="relative flex items-start gap-4">
          {/* Vertical Connecting Line */}
          {index < steps.length - 1 && (
            <div
              className={`absolute left-4 top-8 -ml-px h-full w-0.5 transition-colors duration-300 ${step.status === "complete" ? "bg-arin-green" : "bg-border"
                }`}
            />
          )}

          <div
            className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 shadow-sm ${step.status === "complete"
                ? "border-arin-green bg-arin-green"
                : step.status === "active"
                  ? "border-arin-teal bg-arin-teal/10 animate-pulse"
                  : "border-border bg-white/50"
              }`}
          >
            {step.status === "complete" ? (
              <Check className="h-4 w-4 text-white" />
            ) : (
              <span
                className={`text-xs font-bold ${step.status === "active"
                    ? "text-arin-teal"
                    : "text-muted-foreground"
                  }`}
              >
                {step.id}
              </span>
            )}
          </div>
          <div className="flex flex-col pt-1">
            <span
              className={`text-xs font-bold uppercase tracking-tight ${step.status === "complete"
                  ? "text-arin-green"
                  : step.status === "active"
                    ? "text-arin-teal font-extrabold"
                    : "text-muted-foreground"
                }`}
            >
              {step.label}
            </span>
            {step.status === "active" && (
              <span className="text-[10px] text-arin-teal/70 animate-pulse">Running task...</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProcessIndicator;
