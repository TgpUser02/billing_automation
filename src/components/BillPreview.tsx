import { forwardRef } from 'react';
import { getMonthYear } from '@/lib/billCalculations';
import logo from "@/assets/arin_logo.jpg";
import solarHeader from "@/assets/solar_header_v2.png";
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
  ArrowRight
} from 'lucide-react';

interface BillPreviewProps {
  consumer: any;
  billData: any;
  selectedDate: Date;
}

const styles = {
  container: {
    width: "1200px",
    backgroundColor: "#f4f7f6", 
    padding: "30px",
    borderRadius: "24px",
    fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: "#334155",
    display: "flex",
    flexDirection: "column" as const,
    gap: "28px",
    boxSizing: "border-box" as const,
    overflow: "hidden",
  },
  headerTitle: {
    textAlign: "center" as const,
    fontSize: "32px",
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: "10px",
    letterSpacing: "0.5px",
  },
  topCard: {
    backgroundColor: "#ffffff",
    borderRadius: "20px",
    padding: "20px 35px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.05)",
    border: "1px solid #e2e8f0",
    overflow: "hidden",
    position: "relative" as const,
    height: "165px",
  },
  logoSection: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    gap: "0px",
    flex: "0 0 200px",
  },
  logo: {
    height: "120px",
    objectFit: "contain" as const,
  },
  headerInfo: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
    flex: 1,
    marginLeft: "40px",
    justifyContent: "center",
  },
  infoItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    fontSize: "20px",
    color: "#1e293b",
    fontWeight: "500",
  },
  infoLabel: {
    fontWeight: "700",
    color: "#64748b",
    minWidth: "120px",
  },
  headerImageContainer: {
    flex: "0 0 250px",
    height: "120px",
    borderRadius: "16px",
    overflow: "hidden",
    alignSelf: "center",
    marginRight: "20px",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
  },
  headerImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1.8fr 1.1fr 1.1fr",
    gap: "28px",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "20px",
    padding: "25px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.03)",
    border: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column" as const,
    gap: "18px",
  },
  cardTitle: {
    fontSize: "20px",
    fontWeight: "700",
    color: "#475569",
    marginBottom: "8px",
    borderBottom: "2px solid #f8fafc",
    paddingBottom: "8px",
  },
  cardTitleAlt: {
    fontSize: "20px",
    fontWeight: "700",
    color: "#475569",
    marginBottom: "8px",
    borderBottom: "2px solid #f1f5f9",
    paddingBottom: "8px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0",
    borderBottom: "1px solid #f1f5f9",
  },
  rowLabel: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "16px",
    fontWeight: "600",
    color: "#475569",
  },
  rowValue: {
    fontSize: "24px",
    fontWeight: "800",
    color: "#0f172a",
  },
  iconBox: {
    width: "36px",
    height: "36px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  healthCard: {
    marginTop: "auto",
    padding: "15px",
    borderRadius: "16px",
    textAlign: "center" as const,
    color: "#fff",
    fontWeight: "900",
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
  },
  warrantyGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "18px",
  },
  warrantyCard: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "12px 20px",
    display: "flex",
    alignItems: "center",
    gap: "15px",
    border: "1px solid #e2e8f0",
  },
  footerBanner: {
    display: "flex",
    gap: "20px",
    height: "60px",
  },
  bannerLeft: {
    flex: 1,
    backgroundColor: "#3d704f", 
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 25px",
    fontSize: "16px",
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
    padding: "0 25px",
    fontSize: "16px",
    fontWeight: "600",
    borderRadius: "16px",
    border: "1px solid #e2e8f0",
    whiteSpace: "nowrap" as const,
  },
};

export const BillPreview = forwardRef<HTMLDivElement, BillPreviewProps>(
  ({ billData, selectedDate }, ref) => {
    if (!billData) {
      return (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', padding: '40px', minHeight: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.2 }}>☀️</div>
            <p style={{ fontSize: '14px' }}>Select a consumer or enter manual data to analyze journey</p>
          </div>
        </div>
      );
    }

    const monthYear = getMonthYear(selectedDate);
    const isHealthPoor = (billData.systemHealth || 'GOOD').toUpperCase() === 'POOR';

    return (
      <div style={styles.container} ref={ref} id="bill-preview">
        <div style={styles.headerTitle}>
          Solar Bill Analysis – {monthYear}
        </div>

        {/* Top Header Card */}
        <div style={styles.topCard}>
          <div style={styles.logoSection}>
            <img src={logo} alt="Arin Energy" style={styles.logo} />
          </div>

          <div style={styles.headerInfo}>
            <div style={styles.infoItem}>
              <User size={24} color="#16a34a" />
              <span style={styles.infoLabel}>Consumer:</span>
              <span style={{color: '#1e293b', fontWeight: '700'}}>{billData.consumerName}</span>
            </div>
            <div style={styles.infoItem}>
              <Zap size={24} color="#16a34a" />
              <span style={styles.infoLabel}>Capacity:</span>
              <span style={{color: '#1e293b', fontWeight: '700'}}>{billData.capacity} kW</span>
            </div>
            <div style={styles.infoItem}>
              <Calendar size={24} color="#16a34a" />
              <span style={styles.infoLabel}>Reading Date:</span>
              <span style={{color: '#1e293b', fontWeight: '700'}}>{billData.readingDate}</span>
            </div>
          </div>

          <div style={styles.headerImageContainer}>
            <img src={solarHeader} alt="Solar Energy" style={styles.headerImage} />
          </div>
        </div>

        <div style={styles.mainGrid}>
          {/* Combined Column 1 & 2 - Energy & Consumption Summary */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Energy & Consumption Summary</div>
            
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px'}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                    <div style={styles.row}>
                        <div style={styles.rowLabel}>
                            <div style={{...styles.iconBox, backgroundColor: "#fbbf24"}}><Zap size={20} color="#fff" /></div>
                            Generated
                        </div>
                        <div style={styles.rowValue}>{billData.generatedElectricity}</div>
                    </div>

                    <div style={styles.row}>
                        <div style={styles.rowLabel}>
                            <div style={{...styles.iconBox, backgroundColor: "#f97316"}}><ArrowUpRight size={20} color="#fff" /></div>
                            Exported
                        </div>
                        <div style={styles.rowValue}>{billData.exportedToGrid}</div>
                    </div>

                    <div style={styles.row}>
                        <div style={styles.rowLabel}>
                            <div style={{...styles.iconBox, backgroundColor: "#22c55e"}}><ArrowDownLeft size={20} color="#fff" /></div>
                            Imported
                        </div>
                        <div style={styles.rowValue}>{billData.importedFromGrid}</div>
                    </div>
                </div>

                <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                    <div style={styles.row}>
                        <div style={styles.rowLabel}>
                            <RotateCcw size={20} color="#22c55e" />
                            Self Day Consumption
                        </div>
                        <div style={styles.rowValue}>{billData.daytimeSelfConsumption}</div>
                    </div>
                    <div style={{fontSize: '11px', color: '#94a3b8', marginTop: '-15px', textAlign: 'right'}}>
                       = Generated - Exported
                    </div>

                    <div style={styles.row}>
                        <div style={styles.rowLabel}>
                            <span style={{fontWeight: '700', fontSize: '18px'}}>Total Consumption</span>
                        </div>
                        <div style={styles.rowValue}>{billData.totalConsumption}</div>
                    </div>
                    
                    <div style={{fontSize: '11px', color: '#94a3b8', marginTop: '-15px', textAlign: 'right'}}>
                       = Self + Imported
                    </div>
                </div>
            </div>

            <div style={{marginTop: 'auto', borderTop: '2px solid #f1f5f9', paddingTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '12px 20px', borderRadius: '12px'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px', color: '#64748b', fontWeight: '600'}}>
                        <div style={{width: '32px', height: '32px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'}}><Zap size={16} /></div>
                        Previous Banked Unit
                    </div>
                    <span style={{fontWeight: '900', fontSize: '20px', color: '#1e293b'}}>{billData.previousBankedUnit} Units</span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '12px 20px', borderRadius: '12px'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px', color: '#64748b', fontWeight: '600'}}>
                        <div style={{width: '32px', height: '32px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'}}><Zap size={16} /></div>
                        Current Banked Unit
                    </div>
                    <span style={{fontWeight: '900', fontSize: '20px', color: '#1e293b'}}>{billData.currentBankedUnit} Units</span>
                </div>
            </div>
          </div>

          {/* Column 3 - Billing */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Billing</div>

            <div style={styles.row}>
              <div style={styles.rowLabel}>
                 <div style={{width: '32px', height: '32px', borderRadius: '8px', background: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><IndianRupee size={18} color="#fff" /></div>
                 Amount
              </div>
              <div style={{...styles.rowValue, color: '#1e293b'}}>₹{billData.billingAmount}</div>
            </div>

            <div style={styles.row}>
              <div style={styles.rowLabel}>
                 <div style={{width: '32px', height: '32px', borderRadius: '8px', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><CheckCircle size={18} color="#fff" /></div>
                 Status
              </div>
              <div style={{...styles.rowValue, color: "#22c55e", fontSize: "18px"}}>Normal</div>
            </div>

            <div style={{padding: '12px', background: '#f8fafc', borderRadius: '12px', margin: '5px 0'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <div style={styles.rowLabel}><Wind size={20} color="#fbbf24" /> Billing Units</div>
                    <span style={{fontWeight: '800'}}>{billData.billingUnits} kWh</span>
                </div>
                <div style={{fontSize: '11px', color: '#94a3b8', textAlign: 'right', marginTop: '4px'}}>
                   = Total Consumption - Generated
                </div>
            </div>


            <div style={{
                ...styles.healthCard, 
                background: isHealthPoor 
                    ? "linear-gradient(90deg, #ef4444 0%, #dc2626 100%)" 
                    : "linear-gradient(90deg, #22c55e 0%, #16a34a 100%)",
            }}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px', letterSpacing: '1px'}}>
                <AlertTriangle size={20} color="#fff" />
                SYSTEM HEALTH:
              </div>
              <div style={{
                  backgroundColor: '#fff', 
                  color: isHealthPoor ? '#ef4444' : '#22c55e',
                  padding: '6px',
                  borderRadius: '10px',
                  fontSize: '22px',
                  fontWeight: '900'
              }}>
                {(billData.systemHealth || 'GOOD').toUpperCase()}
              </div>
            </div>
          </div>

          {/* Column 4 - Warranty */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Warranty Info</div>
            
            <div style={{...styles.row, borderBottom: '1px solid #f1f5f9', padding: '12px 0'}}>
              <div style={styles.rowLabel}>
                <div style={{...styles.iconBox, backgroundColor: "#f1f5f9", width: '45px', height: '45px'}}>
                   <img src={solarHeader} style={{width: '35px', height: '25px', objectFit: 'contain'}} />
                </div>
                <div style={{display: 'flex', flexDirection: 'column'}}>
                   <span style={{fontSize: '15px', fontWeight: '700', color: '#475569'}}>Panel</span>
                </div>
              </div>
              <div style={{textAlign: 'right'}}>
                <div style={{fontSize: '16px', fontWeight: '800', color: '#0f172a'}}>{billData.panelWarranty}</div>
                <div style={{fontSize: '10px', color: '#94a3b8'}}>Expiry Date</div>
              </div>
            </div>

            <div style={{...styles.row, borderBottom: '1px solid #f1f5f9', padding: '12px 0'}}>
              <div style={styles.rowLabel}>
                <div style={{...styles.iconBox, backgroundColor: "#f1f5f9", width: '45px', height: '45px'}}>
                   <Settings size={28} color="#16a34a" />
                </div>
                <div style={{display: 'flex', flexDirection: 'column'}}>
                   <span style={{fontSize: '15px', fontWeight: '700', color: '#475569'}}>System</span>
                </div>
              </div>
              <div style={{textAlign: 'right'}}>
                <div style={{fontSize: '16px', fontWeight: '800', color: '#0f172a'}}>{billData.systemWarranty}</div>
                <div style={{fontSize: '10px', color: '#94a3b8'}}>Expiry Date</div>
              </div>
            </div>

            <div style={{...styles.row, borderBottom: 'none', padding: '12px 0'}}>
              <div style={styles.rowLabel}>
                <div style={{...styles.iconBox, backgroundColor: "#f1f5f9", width: '45px', height: '45px'}}>
                   <Monitor size={28} color="#16a34a" />
                </div>
                <div style={{display: 'flex', flexDirection: 'column'}}>
                   <span style={{fontSize: '15px', fontWeight: '700', color: '#475569'}}>Inverter</span>
                </div>
              </div>
              <div style={{textAlign: 'right'}}>
                <div style={{fontSize: '16px', fontWeight: '800', color: '#0f172a'}}>{billData.inverterWarranty}</div>
                <div style={{fontSize: '10px', color: '#94a3b8'}}>Expiry Date</div>
              </div>
            </div>
            

          </div>
        </div>

        {/* Footer Banner */}
        <div style={{...styles.footerBanner, gap: '35px', height: '60px'}}>
          <div style={{...styles.bannerLeft, borderRadius: '16px'}}>
            <span style={{marginRight: '15px'}}>Your solar plant working for you since</span> <span style={{fontSize: '28px', fontWeight: '900', color: '#fbbf24', letterSpacing: '2px', display: 'inline-block'}}>{billData.daysSinceInstallation}</span> <span style={{marginLeft: '15px'}}>Days</span>
          </div>
          <div style={{...styles.bannerRight, borderRadius: '16px', flex: '1.6'}}>
            <span style={{marginRight: '15px'}}>Facing an issue? Let's solve it together - Call us</span> <strong style={{fontSize: '22px', color: '#16a34a', letterSpacing: '0.5px'}}>+91 7620101758</strong>
          </div>
        </div>
      </div>
    );
  }
);

BillPreview.displayName = 'BillPreview';
