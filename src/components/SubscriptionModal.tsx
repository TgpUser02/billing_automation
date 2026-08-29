import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, Calendar, DollarSign, Clock, CreditCard, Hash } from "lucide-react";
import { api } from "@/lib/api";

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  consumerNumber: string;
  customerName?: string;
  onSuccess?: (newExpiryDate: string) => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  isOpen,
  onClose,
  consumerNumber,
  customerName,
  onSuccess,
}) => {
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentTime, setPaymentTime] = useState(
    new Date().toTimeString().split(" ")[0].substring(0, 5)
  );
  const [paymentMode, setPaymentMode] = useState("UPI");
  const [utrNumber, setUtrNumber] = useState("");
  const [validityYears, setValidityYears] = useState("3");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!amountPaid || parseFloat(amountPaid) <= 0) {
      toast.error("Please enter a valid amount paid.");
      return;
    }
    if (!paymentDate) {
      toast.error("Payment date is mandatory.");
      return;
    }
    if (!paymentTime) {
      toast.error("Payment time is mandatory.");
      return;
    }
    if (!paymentMode.trim()) {
      toast.error("Mode of payment is mandatory.");
      return;
    }
    if (!utrNumber.trim()) {
      toast.error("UTR No. is mandatory.");
      return;
    }

    setLoading(true);

    try {
      const data = await api.extendSubscription({
        consumer_number: consumerNumber,
        amount_paid: parseFloat(amountPaid),
        payment_date: paymentDate,
        payment_time: paymentTime,
        payment_mode: paymentMode,
        utr_number: utrNumber.trim(),
        validity_years: parseInt(validityYears) || 3,
      });

      toast.success(data.message || "Subscription extended successfully!");
      if (onSuccess && data.subscription_end_date) {
        onSuccess(data.subscription_end_date);
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Subscription extension failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-emerald-600">
            <ShieldCheck className="h-6 w-6" />
            <DialogTitle>Extend Subscription</DialogTitle>
          </div>
          <DialogDescription>
            Record payment details for consumer <strong className="text-foreground">{consumerNumber}</strong> {customerName ? `(${customerName})` : ""}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amountPaid" className="flex items-center gap-1.5 text-xs font-semibold">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                Amount Paid (₹) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="amountPaid"
                type="number"
                step="0.01"
                placeholder="e.g. 1500"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="validityYears" className="flex items-center gap-1.5 text-xs font-semibold">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                Validity (Years)
              </Label>
              <Input
                id="validityYears"
                type="number"
                min="1"
                max="10"
                value={validityYears}
                onChange={(e) => setValidityYears(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paymentDate" className="flex items-center gap-1.5 text-xs font-semibold">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                Payment Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentTime" className="flex items-center gap-1.5 text-xs font-semibold">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Payment Time <span className="text-red-500">*</span>
              </Label>
              <Input
                id="paymentTime"
                type="time"
                value={paymentTime}
                onChange={(e) => setPaymentTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paymentMode" className="flex items-center gap-1.5 text-xs font-semibold">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                Payment Mode <span className="text-red-500">*</span>
              </Label>
              <select
                id="paymentMode"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                <option value="UPI">UPI / GPay / PhonePe</option>
                <option value="NEFT">NEFT / RTGS / IMPS</option>
                <option value="Cheque">Cheque</option>
                <option value="Cash">Cash</option>
                <option value="Card">Credit / Debit Card</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="utrNumber" className="flex items-center gap-1.5 text-xs font-semibold">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                UTR / Reference No <span className="text-red-500">*</span>
              </Label>
              <Input
                id="utrNumber"
                type="text"
                placeholder="e.g. 32918239102"
                value={utrNumber}
                onChange={(e) => setUtrNumber(e.target.value)}
                required
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={loading}>
              {loading ? "Extending..." : "Confirm Extension"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
