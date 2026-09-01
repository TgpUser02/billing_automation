import { forwardRef } from 'react';
import { format } from 'date-fns';
import { getMonthYear } from '@/lib/billCalculations';
import logo from "@/assets/arin_logo.jpg";
import solarRooftopImg from "@/assets/solar_rooftop_system.png";
import panelIconImg from "@/assets/panel_icon.png";
import {
  Zap,
  ArrowUpRight,
  ArrowDownLeft,
  User,
  Calendar,
  RotateCcw,
  Wind,
  IndianRupee,
  CheckCircle,
  AlertTriangle,
  Grid,
  Settings,
  Monitor,
  ArrowRight,
  Sun,
  ShieldCheck,
  Cpu,
  Hash,
  Activity
} from 'lucide-react';

interface BillPreviewProps {
  consumer?: any;
  billData: any;
  selectedDate: Date;
}

const styles = {
  container: {
    width: "1200px",
    minWidth: "1200px",
    flexShrink: 0,
    backgroundColor: "#f8fafc",
    padding: "26px",
    borderRadius: "24px",
    fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    boxShadow: "0 20px 40px rgba(0,0,0,0.08)",
    color: "#1e293b",
    boxSizing: "border-box" as const,
    display: "flex",
    flexDirection: "column" as const,
    gap: "20px",
  },
  headerTitle: {
    fontSize: "28px",
    fontWeight: "900",
    color: "#0f172a",
    textAlign: "center" as const,
    letterSpacing: "-0.5px",
    paddingBottom: "4px",
  },
  topCard: {
    backgroundColor: "#ffffff",
    borderRadius: "20px",
    padding: "20px 28px",
    display: "grid",
    gridTemplateColumns: "230px 1fr 230px",
    alignItems: "center",
    gap: "24px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.03)",
    border: "1px solid #e2e8f0",
  },
  logoSection: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  logo: {
    height: "92px",
    maxHeight: "95px",
    maxWidth: "220px",
    objectFit: "contain" as const,
  },
  headerInfoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "14px 24px",
    padding: "0 12px",
  },
  infoItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  infoLabel: {
    fontSize: "13px",
    color: "#64748b",
    fontWeight: "700",
  },
  infoValue: {
    fontSize: "15px",
    fontWeight: "800",
    color: "#0f172a",
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1.35fr 1fr 1fr",
    gap: "16px",
    alignItems: "stretch",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "20px",
    padding: "20px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.03)",
    border: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column" as const,
    gap: "14px",
    height: "100%",
    boxSizing: "border-box" as const,
  },
  cardTitle: {
    fontSize: "17px",
    fontWeight: "800",
    color: "#0f172a",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    borderBottom: "1px solid #f1f5f9",
    paddingBottom: "10px",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    backgroundColor: "#f8fafc",
    borderRadius: "12px",
    border: "1px solid #f1f5f9",
  },
  rowLabel: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#475569",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  rowValue: {
    fontSize: "16px",
    fontWeight: "800",
    color: "#0f172a",
  },
  iconBox: {
    width: "30px",
    height: "30px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  healthCard: {
    borderRadius: "16px",
    padding: "16px 20px",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center" as const,
    gap: "10px",
    width: "100%",
    boxSizing: "border-box" as const,
    marginTop: "auto",
  },
  footerBanner: {
    display: "flex",
    gap: "16px",
    height: "56px",
  },
  bannerLeft: {
    flex: 1,
    backgroundColor: "#2d6a4f",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 20px",
    fontSize: "14px",
    fontWeight: "600",
    borderRadius: "16px",
    whiteSpace: "nowrap" as const,
  },
  bannerRight: {
    backgroundColor: "#fffbeb",
    color: "#1e293b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 20px",
    fontSize: "14px",
    fontWeight: "600",
    borderRadius: "16px",
    border: "1px solid #fef08a",
    whiteSpace: "nowrap" as const,
  }
};

export const BillPreview = forwardRef<HTMLDivElement, BillPreviewProps>(
  ({ billData, selectedDate }, ref) => {
    if (!billData) {
      return (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', padding: '40px', minHeight: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.2 }}>☀️</div>
            <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#64748b' }}>Analysis Data Not Found</p>
            <p style={{ fontSize: '12px', marginTop: '8px' }}>Billing data has not been fully processed or generated for this consumer yet.</p>
          </div>
        </div>
      );
    }

    const safeDate = selectedDate instanceof Date && !isNaN(selectedDate.getTime()) ? selectedDate : new Date();
    const monthName = format(safeDate, 'MMMM').toUpperCase();
    const yearStr = format(safeDate, 'yyyy');
    const isHealthPoor = (billData.systemHealth || 'GOOD').toUpperCase() === 'POOR';

    const hasWarrantyInfo = Boolean(
      (billData.panelWarranty && billData.panelWarranty !== 'N/A') ||
      (billData.systemWarranty && billData.systemWarranty !== 'N/A') ||
      (billData.inverterWarranty && billData.inverterWarranty !== 'N/A')
    );

    return (
      <div style={styles.container} ref={ref} id="bill-preview">
        {/* Main Title Heading */}
        <div style={styles.headerTitle}>
          Arin Energy AI Solar Bill Analysis – {monthName} {yearStr}
        </div>

        {/* Top Header Card */}
        <div style={styles.topCard}>
          <div style={styles.logoSection}>
            <img src={logo} alt="Arin Energy" style={styles.logo} />
          </div>

          <div style={styles.headerInfoGrid}>
            <div style={styles.infoItem}>
              <User size={18} color="#16a34a" />
              <span style={styles.infoLabel}>Consumer:</span>
              <span style={{ color: '#0f172a', fontWeight: '800', fontSize: '15px' }}>{billData.consumerName}</span>
            </div>
            <div style={styles.infoItem}>
              <Zap size={18} color="#16a34a" />
              <span style={styles.infoLabel}>Capacity:</span>
              <span style={{ color: '#0f172a', fontWeight: '800', fontSize: '15px' }}>{billData.capacity} kW</span>
            </div>
            <div style={styles.infoItem}>
              <Calendar size={18} color="#16a34a" />
              <span style={styles.infoLabel}>Reading Date:</span>
              <span style={{ color: '#0f172a', fontWeight: '800', fontSize: '15px' }}>{billData.readingDate}</span>
            </div>
            <div style={styles.infoItem}>
              <Hash size={18} color="#16a34a" />
              <span style={styles.infoLabel}>Consumer No:</span>
              <span style={{ color: '#0f172a', fontWeight: '800', fontSize: '15px', letterSpacing: '0.5px' }}>
                {billData.consumerNumber || billData.consumerNo || 'N/A'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <img 
              src={solarRooftopImg} 
              alt="Solar Rooftop System" 
              style={{ width: '230px', height: '92px', objectFit: 'cover', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }} 
            />
          </div>
        </div>

        {/* 3 Columns Side-by-Side */}
        <div style={styles.mainGrid}>
          
          {/* Card 1: Energy & Consumption Summary */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Energy & Consumption Summary</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={styles.row}>
                  <div style={styles.rowLabel}>
                    <div style={{ ...styles.iconBox, backgroundColor: "#fbbf24" }}><Zap size={18} color="#fff" /></div>
                    Generated
                  </div>
                  <div style={styles.rowValue}>{billData.generatedElectricity}</div>
                </div>

                <div style={styles.row}>
                  <div style={styles.rowLabel}>
                    <div style={{ ...styles.iconBox, backgroundColor: "#f97316" }}><ArrowUpRight size={18} color="#fff" /></div>
                    Exported
                  </div>
                  <div style={styles.rowValue}>{billData.exportedToGrid}</div>
                </div>

                <div style={styles.row}>
                  <div style={styles.rowLabel}>
                    <div style={{ ...styles.iconBox, backgroundColor: "#22c55e" }}><ArrowDownLeft size={18} color="#fff" /></div>
                    Imported
                  </div>
                  <div style={styles.rowValue}>{billData.importedFromGrid}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={styles.row}>
                  <div style={styles.rowLabel}>
                    <RotateCcw size={18} color="#22c55e" />
                    Self Day Consumption
                  </div>
                  <div style={styles.rowValue}>{billData.daytimeSelfConsumption}</div>
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '-8px', textAlign: 'right' }}>
                  = Generated - Exported
                </div>

                <div style={styles.row}>
                  <div style={styles.rowLabel}>
                    <span style={{ fontWeight: '700', fontSize: '14px' }}>Total Consumption</span>
                  </div>
                  <div style={styles.rowValue}>{billData.totalConsumption}</div>
                </div>

                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '-8px', textAlign: 'right' }}>
                  = Self + Imported
                </div>
              </div>
            </div>

            <div style={{ marginTop: 'auto', borderTop: '2px solid #f1f5f9', paddingTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontWeight: '600', fontSize: '12px' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}><Zap size={14} color="#fbbf24" /></div>
                  Previous Banked
                </div>
                <span style={{ fontWeight: '900', fontSize: '15px', color: '#1e293b' }}>{billData.previousBankedUnit} Units</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontWeight: '600', fontSize: '12px' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}><Zap size={14} color="#22c55e" /></div>
                  Current Banked
                </div>
                <span style={{ fontWeight: '900', fontSize: '15px', color: '#1e293b' }}>{billData.currentBankedUnit} Units</span>
              </div>
            </div>
          </div>

          {/* Card 2: Billing */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Billing</div>

            <div style={styles.row}>
              <div style={styles.rowLabel}>
                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IndianRupee size={16} color="#fff" /></div>
                Amount
              </div>
              <div style={{ ...styles.rowValue, color: '#1e293b' }}>₹{billData.billingAmount}</div>
            </div>

            <div style={styles.row}>
              <div style={styles.rowLabel}>
                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircle size={16} color="#fff" /></div>
                Status
              </div>
              <div style={{ ...styles.rowValue, color: "#22c55e", fontSize: "16px" }}>Normal</div>
            </div>

            <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={styles.rowLabel}><Wind size={18} color="#fbbf24" /> Billing Units</div>
                <span style={{ fontWeight: '800', fontSize: '15px' }}>{billData.billingUnits} kWh</span>
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'right', marginTop: '3px' }}>
                = Total Consumption - Generated
              </div>
            </div>

            {/* AI Verified System Health Card */}
            <div style={{
              ...styles.healthCard,
              background: isHealthPoor
                ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                : "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '12px', fontWeight: '800', letterSpacing: '0.8px', textTransform: 'uppercase', color: '#ffffff' }}>
                <Activity size={16} color="#fff" />
                AI VERIFIED SYSTEM HEALTH:
              </div>
              <div style={{
                backgroundColor: '#ffffff',
                color: isHealthPoor ? '#ef4444' : '#16a34a',
                padding: '8px 0',
                width: '100%',
                borderRadius: '12px',
                fontSize: '22px',
                fontWeight: '900',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                letterSpacing: '1px'
              }}>
                {(billData.systemHealth || 'GOOD').toUpperCase()}
              </div>
            </div>
          </div>

          {/* Card 3: Dynamic Content — Warranty Info (if available) OR Solar Yield & Weather AI Insights */}
          <div style={styles.card}>
            {hasWarrantyInfo ? (
              <>
                <div style={styles.cardTitle}>Warranty Info</div>

                {/* Panel Row */}
                <div style={{ ...styles.row, borderBottom: '1px solid #f1f5f9', padding: '8px 12px' }}>
                  <div style={styles.rowLabel}>
                    <div style={{ ...styles.iconBox, backgroundColor: "#f0fdf4", width: '36px', height: '36px' }}>
                      <img src={panelIconImg} alt="Panel" style={{ width: '22px', height: '22px', objectFit: 'contain' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Panel</span>
                      {billData.panel_name && billData.panel_name !== 'Other' && (
                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600' }}>{billData.panel_name}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>{billData.panelWarranty}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Expiry Date</div>
                  </div>
                </div>

                {/* System Row */}
                <div style={{ ...styles.row, borderBottom: '1px solid #f1f5f9', padding: '8px 12px' }}>
                  <div style={styles.rowLabel}>
                    <div style={{ ...styles.iconBox, backgroundColor: "#f0fdf4", width: '36px', height: '36px' }}>
                      <Settings size={20} color="#16a34a" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>System</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>{billData.systemWarranty}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Expiry Date</div>
                  </div>
                </div>

                {/* Inverter Row */}
                <div style={{ ...styles.row, borderBottom: '1px solid #f1f5f9', padding: '8px 12px' }}>
                  <div style={styles.rowLabel}>
                    <div style={{ ...styles.iconBox, backgroundColor: "#f0fdf4", width: '36px', height: '36px' }}>
                      <Monitor size={20} color="#16a34a" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Inverter</span>
                      {billData.inverter_name && billData.inverter_name !== 'Other' && (
                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600' }}>{billData.inverter_name}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>{billData.inverterWarranty}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Expiry Date</div>
                  </div>
                </div>

                {/* Subscription Row */}
                <div style={{ ...styles.row, borderBottom: 'none', padding: '8px 12px' }}>
                  <div style={styles.rowLabel}>
                    <div style={{ ...styles.iconBox, backgroundColor: "#f0fdf4", width: '36px', height: '36px' }}>
                      <ShieldCheck size={20} color="#16a34a" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Subscription</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>{billData.subscriptionEndDate || 'N/A'}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Expiry Date</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={styles.cardTitle}>Solar Yield & Performance AI</div>

                <div style={{ ...styles.row, borderBottom: '1px solid #f1f5f9', padding: '8px 12px' }}>
                  <div style={styles.rowLabel}>
                    <div style={{ ...styles.iconBox, backgroundColor: "#f0fdf4", width: '36px', height: '36px' }}>
                      <Sun size={20} color="#16a34a" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Optimal Solar Size</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#16a34a' }}>{billData.recommendedCapacity || '4.0'} kW System</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Recommended Load</div>
                  </div>
                </div>

                <div style={{ ...styles.row, borderBottom: '1px solid #f1f5f9', padding: '8px 12px' }}>
                  <div style={styles.rowLabel}>
                    <div style={{ ...styles.iconBox, backgroundColor: "#f0fdf4", width: '36px', height: '36px' }}>
                      <IndianRupee size={20} color="#16a34a" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Estimated Annual Savings</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>₹{billData.annualSavings || '45,000'} / year</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Grid Offset</div>
                  </div>
                </div>

                <div style={{ ...styles.row, borderBottom: '1px solid #f1f5f9', padding: '8px 12px' }}>
                  <div style={styles.rowLabel}>
                    <div style={{ ...styles.iconBox, backgroundColor: "#f0fdf4", width: '36px', height: '36px' }}>
                      <Activity size={20} color="#16a34a" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Weather Condition</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>{billData.weatherCondition || 'Mostly Sunny'}</div>
                    <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: '700' }}>Score: {billData.performanceScore || '94%'}</div>
                  </div>
                </div>

                <div style={{ ...styles.row, borderBottom: 'none', padding: '8px 12px' }}>
                  <div style={styles.rowLabel}>
                    <div style={{ ...styles.iconBox, backgroundColor: "#f0fdf4", width: '36px', height: '36px' }}>
                      <ShieldCheck size={20} color="#16a34a" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>25-Year Lifetime ROI</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#16a34a' }}>
                      {billData.lifetimeSavings ? (billData.lifetimeSavings.startsWith('₹') ? billData.lifetimeSavings : `₹${billData.lifetimeSavings}`) : '₹12.5 Lakhs'}
                    </div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Est. Cumulative ROI</div>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>

        {/* Footer Banners */}
        <div style={styles.footerBanner}>
          <div style={styles.bannerLeft}>
            <span>Your solar plant working for you since</span>
            <span style={{ fontSize: '24px', fontWeight: '900', color: '#fbbf24', margin: '0 8px', letterSpacing: '1px' }}>
              {billData.daysSinceInstallation || 392}
            </span>
            <span>Days</span>
          </div>
          <div style={styles.bannerRight}>
            <span>Facing an issue? Let's solve it together - Call us</span>
            <strong style={{ fontSize: '20px', color: '#16a34a', marginLeft: '10px', letterSpacing: '0.5px' }}>
              +91 7620101758
            </strong>
          </div>
        </div>
      </div>
    );
  }
);

BillPreview.displayName = 'BillPreview';
