// Bill calculation utility functions
// These can be easily connected to a MongoDB backend later
import { calculateWarrantyExpiry } from './warrantyCalculation';

export interface ConsumerData {
  id: string;
  consumerNumber: string;
  name: string;
  capacity: number;
  installationDate: Date;
  panelWarranty: string;
  systemWarranty: string;
  inverterWarranty: string;
  panel_warranty_expiry_date?: string;
  inverter_warranty_expiry_date?: string;
  system_warranty_expiry_date?: string;
  general_warranty_expiry_date?: string;
  blacklisted_reason?: string;
  portal_username?: string;
  portal_password?: string;
  arin_id?: string;
}

export interface BillInputs {
  consumerName: string;
  consumerNumber: string;
  readingDate: string;
  generatedElectricity: number;
  exportedToGrid: number;
  importedFromGrid: number;
  billingAmount: number;
  previousBankedUnit: number;
  currentBankedUnit: number;
  commissioningDate: string;
  capacity: number;
  panelWarranty: string;
  systemWarranty: string;
  inverterWarranty: string;
  panel_name: string;
  inverter_name: string;
  systemHealth: 'Normal' | 'POOR' | 'GOOD';
  billStatus: string;
  healthThreshold?: number;
  panel_warranty_expiry_date?: string;
  inverter_warranty_expiry_date?: string;
  system_warranty_expiry_date?: string;
  general_warranty_expiry_date?: string;
  arin_id?: string;
}

export interface CalculatedBillData {
  consumerName: string;
  consumerNumber: string;
  readingDate: string;
  generatedElectricity: number;
  exportedToGrid: number;
  importedFromGrid: number;
  daytimeSelfConsumption: number;
  totalConsumption: number;
  billingUnits: number;
  billingAmount: number;
  previousBankedUnit: number;
  currentBankedUnit: number;
  commissioningDate: string;
  capacity: number;
  panelWarranty: string;
  systemWarranty: string;
  inverterWarranty: string;
  generalWarranty?: string;
  systemHealth: 'Normal' | 'POOR' | 'GOOD';
  billStatus: string;
  panel_name: string;
  inverter_name: string;
  daysSinceInstallation: number;
  arin_id?: string;
}

export function calculateBillData(
  inputs: BillInputs,
  consumer: Partial<ConsumerData>
): CalculatedBillData {

  // Base raw inputs
  let {
    generatedElectricity: gen,
    exportedToGrid: exp,
    importedFromGrid: imp,
    previousBankedUnit: prevBanked,
    capacity
  } = inputs;

  // 1) daytime self consumption
  const daytimeSelfConsumption = gen - exp;

  // 2) total consumption
  const totalConsumption = daytimeSelfConsumption + imp;

  // 3) billing units
  const billingUnits = totalConsumption - gen;

  // 4) current banked units
  let currentBankedUnit = prevBanked;
  if ((exp - imp) > 0) {
    currentBankedUnit = prevBanked + (exp - imp);
  }

  // 5) system health: GOOD if gen/capacity > threshold, else POOR (default threshold 75)
  const threshold = inputs.healthThreshold !== undefined ? inputs.healthThreshold : 75;
  let systemHealth: 'Normal' | 'POOR' | 'GOOD' = 'POOR';
  if (capacity > 0 && (gen / capacity) > threshold) {
    systemHealth = 'GOOD';
  }

  // Parse Commissioning Date
  let commDateObj = new Date();
  if (inputs.commissioningDate && inputs.commissioningDate !== 'N/A') {
    const parts = inputs.commissioningDate.split('/');
    if (parts.length === 3) {
      let year = parseInt(parts[2], 10);
      year += year < 50 ? 2000 : 1900;
      commDateObj = new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
  } else if (consumer.installationDate) {
    commDateObj = consumer.installationDate;
  }

  // Helper for Warranty Dates
  const addYearsToString = (d: Date, years: number) => {
    const nd = new Date(d);
    nd.setFullYear(nd.getFullYear() + years);
    return `${String(nd.getDate()).padStart(2, '0')}/${String(nd.getMonth() + 1).padStart(2, '0')}/${String(nd.getFullYear()).slice(-2)}`;
  };

  const formatDateStringToDisplay = (dateStr: string | undefined): string | null => {
    if (!dateStr || dateStr === 'N/A' || dateStr === 'null') return null;
    if (dateStr.includes('-')) {
      const parts = dateStr.split('T')[0].split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
      }
    }
    return dateStr;
  };

  // 6) Panel/Inverter Warranty Calculation
  const warrantyResult = calculateWarrantyExpiry({
    inverter_brand: inputs.inverter_name,
    panel_brand: inputs.panel_name,
    commissioning_date: inputs.commissioningDate
  }, 'display');

  // Override with database specific warranty dates if present
  const panelWarranty = formatDateStringToDisplay(inputs.panel_warranty_expiry_date || consumer.panel_warranty_expiry_date) || 
    warrantyResult.panel_warranty_expiry_date;
    
  const inverterWarranty = formatDateStringToDisplay(inputs.inverter_warranty_expiry_date || consumer.inverter_warranty_expiry_date) || 
    warrantyResult.inverter_warranty_expiry_date;
    
  const systemWarranty = formatDateStringToDisplay(inputs.system_warranty_expiry_date || consumer.system_warranty_expiry_date) || 
    addYearsToString(commDateObj, 5);

  const generalWarranty = formatDateStringToDisplay(inputs.general_warranty_expiry_date || consumer.general_warranty_expiry_date) || 
    'N/A';

  // 7) Working Days
  const today = new Date();
  const daysSinceInstallation = Math.floor(
    (today.getTime() - commDateObj.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    consumerName: inputs.consumerName,
    consumerNumber: inputs.consumerNumber,
    readingDate: inputs.readingDate,
    generatedElectricity: gen,
    exportedToGrid: exp,
    importedFromGrid: imp,
    daytimeSelfConsumption,
    totalConsumption,
    billingUnits,
    billingAmount: inputs.billingAmount,
    previousBankedUnit: prevBanked,
    currentBankedUnit,
    commissioningDate: inputs.commissioningDate,
    capacity,
    panelWarranty,
    systemWarranty,
    inverterWarranty,
    generalWarranty,
    systemHealth,
    billStatus: inputs.billStatus,
    panel_name: inputs.panel_name,
    inverter_name: inputs.inverter_name,
    daysSinceInstallation: isNaN(daysSinceInstallation) || daysSinceInstallation < 0 ? 0 : daysSinceInstallation,
    arin_id: inputs.arin_id || consumer.arin_id || "",
  };
}

export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

export function getMonthYear(date: Date): string {
  const months = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Mock consumer data - replace with MongoDB fetch later
export const mockConsumers: ConsumerData[] = [
  {
    id: '1',
    consumerNumber: '410098765432',
    name: 'Priya Patel Industries',
    capacity: 5,
    installationDate: new Date('2021-06-13'),
    panelWarranty: '13/06/46',
    systemWarranty: '18/06/26',
    inverterWarranty: '17/06/31',
  },
  {
    id: '2',
    consumerNumber: '410023456789',
    name: 'Rajesh Kumar Sharma',
    capacity: 5,
    installationDate: new Date('2021-06-13'),
    panelWarranty: '13/06/46',
    systemWarranty: '18/06/26',
    inverterWarranty: '17/06/31',
  },
  {
    id: '3',
    consumerNumber: '410087654321',
    name: 'SHRI DR SATISH BHASKARRAO',
    capacity: 3,
    installationDate: new Date('2021-06-13'),
    panelWarranty: '13/06/46',
    systemWarranty: '18/06/26',
    inverterWarranty: '17/06/31',
  },
  {
    id: '4',
    consumerNumber: '410012345678',
    name: 'Green Tech Solutions',
    capacity: 10,
    installationDate: new Date('2020-03-15'),
    panelWarranty: '15/03/45',
    systemWarranty: '15/03/25',
    inverterWarranty: '15/03/30',
  },
  {
    id: '5',
    consumerNumber: '410099887766',
    name: 'Solar Farms Ltd',
    capacity: 25,
    installationDate: new Date('2019-11-20'),
    panelWarranty: '20/11/44',
    systemWarranty: '20/11/24',
    inverterWarranty: '20/11/29',
  },
];
