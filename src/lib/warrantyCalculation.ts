/**
 * Warranty Calculation Module
 * Brand-specific warranty rules for inverters and panels
 */

// ============================================================================
// WARRANTY CONFIGURATION - Dictionary/Map-based approach for maintainability
// ============================================================================

// Inverter Warranty Rules (in years)
// Maps brand names to warranty duration
const INVERTER_WARRANTY_MAP: Record<string, number> = {
  // 5 Years Warranty
  'Polycab': 5,
  'Havells': 5,
  'Evvo': 5,
  'Ksolare': 5,
  'Anchor': 5,
  'Xwatt': 5,
  'Sofar Solar': 5,
  'Deye': 5,
  'Solax': 5,
  'Solar Yaan': 5,
  'VSOLE': 5,
  'Cathode Power': 5,
  'Growatt': 5,
  'Other': 5,

  // 3 Years Warranty
  'Microtech': 3,
  'Luminous': 3,

  // 10 Years Warranty
  'Delta': 10,
};

// Panel Warranty Rules (in years)
// Maps brand names to warranty duration
const PANEL_WARRANTY_MAP: Record<string, number> = {
  // 30 Years Warranty
  'Waaree': 30,

  // 27 Years Warranty
  'Vikram Solar': 27,

  // 25 Years Warranty
  'Tata Solar': 25,
  'Adani': 25,
  'Luminous': 25,
  'Goldi Solar': 25,
  'Renewsys': 25,
  'Premier Solar': 25,
  'ECE India': 25,
  'EN-Icon': 25,
  'Novasys': 25,
  'Navitas': 25,
  'Pahal': 25,
  'Other': 25,
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface CustomerWarrantyData {
  inverter_brand: string | null;
  panel_brand: string | null;
  commissioning_date: string;
}

export interface WarrantyCalculationResult {
  inverter_warranty_expiry_date: string;
  panel_warranty_expiry_date: string;
  inverter_brand: string;
  panel_brand: string;
  inverter_warranty_years: number;
  panel_warranty_years: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalizes brand name by handling null, undefined, and whitespace
 * Returns 'Other' for invalid/empty brands
 */
function normalizeBrand(brand: string | null | undefined): string {
  if (!brand || typeof brand !== 'string' || brand.trim() === '') {
    return 'Other';
  }
  return brand.trim();
}

/**
 * Looks up warranty years from a map, defaulting to 'Other' if not found
 */
function getWarrantyYears(brand: string, warrantyMap: Record<string, number>): number {
  const normalizedBrand = normalizeBrand(brand);
  // Try exact match first, then fallback to 'Other'
  return warrantyMap[normalizedBrand] ?? warrantyMap['Other'] ?? 5;
}

/**
 * Adds years to a date string and returns formatted result
 * Supports both 'YYYY-MM-DD' and 'DD/MM/YYYY' formats
 */
function addYearsToDate(dateStr: string, years: number): string {
  if (!dateStr || dateStr === 'N/A') {
    return 'N/A';
  }

  let date: Date;

  // Parse date - support multiple formats
  if (dateStr.includes('-')) {
    // YYYY-MM-DD format
    date = new Date(dateStr);
  } else if (dateStr.includes('/')) {
    // DD/MM/YYYY or DD/MM/YY format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      let year = parseInt(parts[2], 10);
      // Handle 2-digit years
      if (parts[2].length === 2) {
        year += year < 50 ? 2000 : 1900;
      }
      date = new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    } else {
      return 'N/A';
    }
  } else {
    return 'N/A';
  }

  // Validate date
  if (isNaN(date.getTime())) {
    return 'N/A';
  }

  // Add years
  date.setFullYear(date.getFullYear() + years);

  // Return in YYYY-MM-DD format (ISO format for database compatibility)
  return date.toISOString().split('T')[0];
}

/**
 * Formats date to DD/MM/YYYY for display purposes
 */
function formatToDisplayDate(dateStr: string): string {
  if (!dateStr || dateStr === 'N/A') {
    return 'N/A';
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return 'N/A';
  }
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

// ============================================================================
// MAIN CALCULATION FUNCTION
// ============================================================================

/**
 * Calculates warranty expiry dates based on brand-specific rules
 * 
 * @param customerData - Object containing inverter_brand, panel_brand, commissioning_date
 * @param outputFormat - 'iso' for YYYY-MM-DD or 'display' for DD/MM/YYYY
 * @returns Object with warranty expiry dates and metadata
 */
export function calculateWarrantyExpiry(
  customerData: CustomerWarrantyData,
  outputFormat: 'iso' | 'display' = 'iso'
): WarrantyCalculationResult {
  // Extract and normalize brand names
  const normalizedInverterBrand = normalizeBrand(customerData.inverter_brand);
  const normalizedPanelBrand = normalizeBrand(customerData.panel_brand);

  // Get warranty years from maps
  const inverterWarrantyYears = getWarrantyYears(normalizedInverterBrand, INVERTER_WARRANTY_MAP);
  const panelWarrantyYears = getWarrantyYears(normalizedPanelBrand, PANEL_WARRANTY_MAP);

  // Calculate expiry dates
  let inverterExpiry = addYearsToDate(customerData.commissioning_date, inverterWarrantyYears);
  let panelExpiry = addYearsToDate(customerData.commissioning_date, panelWarrantyYears);

  // Apply output format if needed
  if (outputFormat === 'display') {
    inverterExpiry = formatToDisplayDate(inverterExpiry);
    panelExpiry = formatToDisplayDate(panelExpiry);
  }

  return {
    inverter_warranty_expiry_date: inverterExpiry,
    panel_warranty_expiry_date: panelExpiry,
    inverter_brand: normalizedInverterBrand,
    panel_brand: normalizedPanelBrand,
    inverter_warranty_years: inverterWarrantyYears,
    panel_warranty_years: panelWarrantyYears,
  };
}

/**
 * Batch calculation for multiple customers
 * Useful for processing database results
 */
export function calculateBulkWarranties(
  customers: CustomerWarrantyData[],
  outputFormat: 'iso' | 'display' = 'iso'
): WarrantyCalculationResult[] {
  return customers.map(customer => calculateWarrantyExpiry(customer, outputFormat));
}

/**
 * Gets all supported inverter brands with their warranty years
 */
export function getSupportedInverterBrands(): Record<string, number> {
  return { ...INVERTER_WARRANTY_MAP };
}

/**
 * Gets all supported panel brands with their warranty years
 */
export function getSupportedPanelBrands(): Record<string, number> {
  return { ...PANEL_WARRANTY_MAP };
}

// ============================================================================
// EXAMPLE USAGE & TESTING
// ============================================================================

// Example test cases
const exampleCases: CustomerWarrantyData[] = [
  {
    inverter_brand: 'Delta',
    panel_brand: 'Waaree',
    commissioning_date: '2020-01-01',
  },
  {
    inverter_brand: 'Growatt',
    panel_brand: 'Tata Solar',
    commissioning_date: '2022-05-15',
  },
  {
    inverter_brand: 'Microtech',
    panel_brand: 'Vikram Solar',
    commissioning_date: '2019-03-20',
  },
  {
    inverter_brand: null, // Edge case: NULL brand
    panel_brand: 'UnknownBrand', // Edge case: Unknown brand
    commissioning_date: '2021-07-10',
  },
  {
    inverter_brand: '',
    panel_brand: '',
    commissioning_date: '2023-01-01',
  },
];

// Run examples
console.log('=== Warranty Calculation Examples ===\n');
exampleCases.forEach((customer, index) => {
  const result = calculateWarrantyExpiry(customer);
  console.log(`Case ${index + 1}:`);
  console.log(`  Input: Inverter=${customer.inverter_brand}, Panel=${customer.panel_brand}, Commissioning=${customer.commissioning_date}`);
  console.log(`  Normalized: Inverter=${result.inverter_brand}, Panel=${result.panel_brand}`);
  console.log(`  Output: Inverter Expiry=${result.inverter_warranty_expiry_date} (${result.inverter_warranty_years} yrs), Panel Expiry=${result.panel_warranty_expiry_date} (${result.panel_warranty_years} yrs)`);
  console.log('');
});
