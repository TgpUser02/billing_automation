import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ShieldAlert, Plus, Trash2, ShieldCheck, Sun, Zap, ToggleLeft, ToggleRight } from "lucide-react";
import { api } from "@/lib/api";

interface WarrantyRule {
  id: number;
  equipment_type: "panel" | "inverter";
  make_name: string;
  warranty_years: number;
  effective_from: string;
  created_at?: string;
}

export const AdminWarrantiesManager: React.FC = () => {
  const [rules, setRules] = useState<WarrantyRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);

  // Form state
  const [equipmentType, setEquipmentType] = useState<"panel" | "inverter">("panel");
  const [makeName, setMakeName] = useState("");
  const [warrantyYears, setWarrantyYears] = useState("5");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split("T")[0]);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const data = await api.getWarrantiesMaster();
      if (data.status === "success") {
        setRules(data.data || []);
      }
    } catch (err) {
      console.error("Failed to load warranty rules:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscriptionSettings = async () => {
    try {
      const data = await api.getSubscriptionSettings();
      if (data.status === "success") {
        setSubscriptionEnabled(data.subscription_enabled);
      }
    } catch (err) {
      console.error("Failed to load subscription settings:", err);
    }
  };

  useEffect(() => {
    fetchRules();
    fetchSubscriptionSettings();
  }, []);

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!makeName.trim()) {
      toast.error("Make name is required.");
      return;
    }
    if (!warrantyYears || parseInt(warrantyYears) <= 0) {
      toast.error("Warranty duration must be greater than 0.");
      return;
    }

    try {
      const data = await api.createWarrantyMaster({
        equipment_type: equipmentType,
        make_name: makeName.trim(),
        warranty_years: parseInt(warrantyYears),
        effective_from: effectiveFrom,
      });

      toast.success("Warranty rule added successfully!");
      setMakeName("");
      fetchRules();
    } catch (err: any) {
      toast.error(err.message || "Failed to add warranty rule.");
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!confirm("Are you sure you want to delete this warranty rule?")) return;
    try {
      await api.deleteWarrantyMaster(id);
      toast.success("Rule deleted successfully.");
      fetchRules();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete rule.");
    }
  };

  const handleToggleSubscription = async () => {
    const nextState = !subscriptionEnabled;
    try {
      const data = await api.updateSubscriptionSettings(nextState);
      setSubscriptionEnabled(data.subscription_enabled);
      toast.success(`Subscription feature ${data.subscription_enabled ? "enabled" : "disabled"}.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle subscription.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Global Subscription Toggle Card */}
      <Card className="border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Subscription Feature Status
            </CardTitle>
            <CardDescription className="text-xs">
              When enabled, customer subscription expiration dates are tracked and enforced in bill generation.
            </CardDescription>
          </div>
          <Button
            variant={subscriptionEnabled ? "default" : "outline"}
            className={subscriptionEnabled ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
            onClick={handleToggleSubscription}
          >
            {subscriptionEnabled ? (
              <span className="flex items-center gap-2">
                <ToggleRight className="h-5 w-5 text-white" />
                Active (ON)
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                Inactive (OFF)
              </span>
            )}
          </Button>
        </CardHeader>
      </Card>

      {/* Equipment Warranty Master Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Panel & Inverter Master Warranty Configuration
          </CardTitle>
          <CardDescription className="text-xs">
            Set default warranty durations by make/brand. Rules take effect for new sites finalized on or after the effective date.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Add Rule Form */}
          <form onSubmit={handleAddRule} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end bg-muted/40 p-4 rounded-lg border">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Equipment Type</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={equipmentType}
                onChange={(e) => setEquipmentType(e.target.value as any)}
              >
                <option value="panel">Solar Panel</option>
                <option value="inverter">Inverter</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Make / Brand Name</Label>
              <Input
                placeholder="e.g. Polycab, Growatt, Tata"
                value={makeName}
                onChange={(e) => setMakeName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Warranty (Years)</Label>
              <Input
                type="number"
                min="1"
                max="30"
                placeholder="e.g. 5 or 8"
                value={warrantyYears}
                onChange={(e) => setWarrantyYears(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Effective From</Label>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
              />
            </div>

            <div>
              <Button type="submit" className="w-full bg-primary text-primary-foreground flex items-center justify-center gap-1.5">
                <Plus className="h-4 w-4" />
                Add Warranty Rule
              </Button>
            </div>
          </form>

          {/* Master Warranties Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[120px]">Type</TableHead>
                  <TableHead>Make / Brand</TableHead>
                  <TableHead>Warranty Duration</TableHead>
                  <TableHead>Effective From Date</TableHead>
                  <TableHead className="text-right w-[100px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                      No warranty rules configured yet. Default manufacturer warranties will be applied.
                    </TableCell>
                  </TableRow>
                ) : (
                  rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-semibold capitalize">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                          rule.equipment_type === "panel" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                        }`}>
                          {rule.equipment_type === "panel" ? <Sun className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                          {rule.equipment_type}
                        </span>
                      </TableCell>
                      <TableCell className="font-bold text-foreground">{rule.make_name}</TableCell>
                      <TableCell className="font-semibold text-emerald-600">{rule.warranty_years} Years</TableCell>
                      <TableCell className="text-muted-foreground">{rule.effective_from}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
