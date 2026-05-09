import logo from "./assets/arin_logo.jpg";

const billData = {
  monthYear: "February 2026",
  consumerName: "SHRI KISHOR MADHAO RANGARI",
  capacity: "3",
  readingDate: "13/02/26",
  generatedElectricity: "436",
  exportedToGrid: "294",
  importedFromGrid: "91",
  daytimeSelfConsumption: "142",
  totalConsumption: "233",
  billingUnits: "-203",
  billingAmount: "140",
  previousBankedUnit: "42",
  currentBankedUnit: "245",
  systemHealth: "GOOD",
  billStatus: "Normal",
  panelWarranty: "31/12/50",
  inverterWarranty: "04/01/36",
  systemWarranty: "05/01/31",
  daysWorking: "45",
  supportNumber: "+91 7620101758",
};

const styles = {
  page: {
    width: "1500px",
    margin: "0 auto",
    border: "1px solid #333",
    fontFamily: "Arial, sans-serif",
    backgroundColor: "#f8f8f8",
    color: "#111",
  },
  title: {
    fontFamily: "Georgia, serif",
    textAlign: "center",
    fontSize: "48px",
    lineHeight: 1,
    padding: "8px 8px 6px",
    borderBottom: "1px solid #333",
    fontWeight: 700,
  },
  titleGreen: { color: "#4d7b40" },
  titleRed: { color: "#7f0000" },
  titleDarkGreen: { color: "#5c7f3d" },
  topRow: {
    width: "100%",
    borderCollapse: "collapse",
  },
  topCellLabel: {
    width: "215px",
    borderRight: "1px solid #333",
    borderBottom: "1px solid #333",
    padding: "5px 8px",
    fontSize: "34px",
    fontWeight: 500,
    background: "#f2f2f2",
  },
  topCellValue: {
    borderRight: "1px solid #333",
    borderBottom: "1px solid #333",
    padding: "5px 8px",
    textAlign: "center",
    fontSize: "38px",
    fontWeight: 500,
    background: "#fafafa",
  },
  topCellLogo: {
    width: "240px",
    borderBottom: "1px solid #333",
    textAlign: "center",
    background: "#fff",
  },
  logoImage: {
    width: "220px",
    height: "auto",
    display: "block",
    margin: "0 auto",
  },
  mainTable: {
    width: "100%",
    borderCollapse: "collapse",
  },
  headerLeft: {
    background: "#efba00",
    color: "#fff",
    fontSize: "40px",
    fontWeight: 800,
    textAlign: "center",
    borderRight: "1px solid #333",
    borderBottom: "1px solid #333",
    padding: "4px 8px",
    fontFamily: "Arial Black, Arial, sans-serif",
  },
  headerRight: {
    width: "245px",
    background: "#efba00",
    color: "#fff",
    fontSize: "40px",
    fontWeight: 800,
    textAlign: "center",
    borderBottom: "1px solid #333",
    padding: "4px 6px",
    fontFamily: "Arial Black, Arial, sans-serif",
  },
  labelCell: {
    borderRight: "1px solid #333",
    borderBottom: "1px solid #333",
    textAlign: "center",
    fontSize: "37px",
    fontWeight: 700,
    padding: "2px 8px",
    background: "#f8f8f8",
  },
  valueCell: {
    borderBottom: "1px solid #333",
    textAlign: "center",
    fontSize: "37px",
    fontWeight: 500,
    padding: "2px 8px",
    background: "#f8f8f8",
  },
  healthCell: {
    borderBottom: "1px solid #333",
    textAlign: "center",
    fontSize: "37px",
    fontWeight: 500,
    padding: "2px 8px",
    background: "#8bc34a",
  },
  warrantyRow: {
    width: "100%",
    borderCollapse: "collapse",
  },
  warrantyLabel: {
    background: "#ecebbb",
    borderRight: "1px solid #333",
    borderBottom: "1px solid #333",
    fontSize: "39px",
    fontWeight: 700,
    padding: "4px 8px",
  },
  warrantyValue: {
    background: "#ecebbb",
    borderRight: "1px solid #333",
    borderBottom: "1px solid #333",
    fontSize: "39px",
    fontWeight: 700,
    padding: "4px 8px",
    width: "180px",
  },
  warrantyLabelRight: {
    background: "#ecebbb",
    borderRight: "1px solid #333",
    borderBottom: "1px solid #333",
    fontSize: "39px",
    fontWeight: 700,
    padding: "4px 8px",
    width: "170px",
  },
  warrantyValueRight: {
    background: "#ecebbb",
    borderBottom: "1px solid #333",
    fontSize: "39px",
    fontWeight: 700,
    padding: "4px 8px",
    width: "240px",
  },
  bottomBanner: {
    display: "grid",
    gridTemplateColumns: "1fr 130px 1fr",
    alignItems: "center",
    background: "#ecebbb",
    borderBottom: "1px solid #333",
    padding: "6px 8px",
    fontFamily: "Georgia, serif",
    fontWeight: 700,
    fontSize: "49px",
    color: "#4d7b40",
    textAlign: "center",
  },
  days: {
    color: "#4d7b40",
    fontWeight: 800,
  },
  helpText: {
    fontFamily: "Arial, sans-serif",
    textAlign: "center",
    padding: "8px",
    fontSize: "39px",
    color: "#8d1120",
    fontWeight: 500,
  },
  supportNumber: {
    color: "#111",
    fontWeight: 700,
    marginLeft: "8px",
  },
};

const tableRows = [
  ["Reading Date", billData.readingDate],
  ["Generated Electricity", billData.generatedElectricity],
  ["Exported to Grid", billData.exportedToGrid],
  ["Imported from Grid", billData.importedFromGrid],
  [
    "Daytime Self Consumption = Generated - Exported",
    billData.daytimeSelfConsumption,
  ],
  [
    "Total Consumption = Self consumption + Imported",
    billData.totalConsumption,
  ],
  ["Billing Units = Total Consumption - Generated", billData.billingUnits],
  ["Billing Amount", billData.billingAmount],
  ["Previous Banked unit", billData.previousBankedUnit],
  ["Current Banked Unit", billData.currentBankedUnit],
  ["System Health", billData.systemHealth],
  ["Bill Status", billData.billStatus],
];

export default function Bill() {
  return (
    <div style={styles.page}>
      <div style={styles.title}>
        <span style={styles.titleGreen}>Your </span>
        <span style={styles.titleRed}>Solar Journey</span>
        <span style={styles.titleGreen}> with </span>
        <span style={styles.titleRed}>Arin Energy</span>
        <span style={styles.titleDarkGreen}> of {billData.monthYear}</span>
      </div>

      <table style={styles.topRow}>
        <tbody>
          <tr>
            <td style={styles.topCellLabel}>Consumer Name :</td>
            <td style={styles.topCellValue}>{billData.consumerName}</td>
            <td style={styles.topCellLogo} rowSpan={2}>
              <img src={logo} alt="Arin Energy" style={styles.logoImage} />
            </td>
          </tr>
          <tr>
            <td style={styles.topCellLabel}>Capacity:</td>
            <td style={styles.topCellValue}>{billData.capacity}</td>
          </tr>
        </tbody>
      </table>

      <table style={styles.mainTable}>
        <thead>
          <tr>
            <th style={styles.headerLeft}>Parameter</th>
            <th style={styles.headerRight}>Units(kWh) /Amount</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map(([label, value]) => (
            <tr key={label}>
              <td style={styles.labelCell}>{label}</td>
              <td
                style={
                  label === "System Health"
                    ? styles.healthCell
                    : styles.valueCell
                }
              >
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <table style={styles.warrantyRow}>
        <tbody>
          <tr>
            <td style={styles.warrantyLabel}>Panel Warranty:</td>
            <td style={styles.warrantyValue}>{billData.panelWarranty}</td>
            <td style={styles.warrantyLabelRight}>Inverter Warranty:</td>
            <td style={styles.warrantyValueRight}>
              {billData.inverterWarranty}
            </td>
          </tr>
          <tr>
            <td style={styles.warrantyLabel}>System Warranty:</td>
            <td style={styles.warrantyValue}>{billData.systemWarranty}</td>
            <td style={styles.warrantyLabelRight} />
            <td style={styles.warrantyValueRight} />
          </tr>
        </tbody>
      </table>

      <div style={styles.bottomBanner}>
        <span>Your personal power plant working for you since</span>
        <span style={styles.days}>{billData.daysWorking}</span>
        <span>Days!</span>
      </div>

      <div style={styles.helpText}>
        Facing an Issue? Let’s Solve It Together – Call Us
        <span style={styles.supportNumber}>{billData.supportNumber}</span>
      </div>
    </div>
  );
}
