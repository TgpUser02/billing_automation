/**
 * Warranty Calculation Module Tests
 */

import {
  calculateWarrantyExpiry,
  calculateBulkWarranties,
  normalizeBrand,
  getSupportedInverterBrands,
  getSupportedPanelBrands,
  CustomerWarrantyData,
  WarrantyCalculationResult,
} from './warrantyCalculation';

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Warranty Calculation Module', () => {
  describe('normalizeBrand', () => {
    it('should return "Other" for null values', () => {
      expect(normalizeBrand(null)).toBe('Other');
    });

    it('should return "Other" for undefined values', () => {
      expect(normalizeBrand(undefined)).toBe('Other');
    });

    it('should return "Other" for empty strings', () => {
      expect(normalizeBrand('')).toBe('Other');
    });

    it('should return "Other" for whitespace-only strings', () => {
      expect(normalizeBrand('   ')).toBe('Other');
    });

    it('should trim whitespace from valid brands', () => {
      expect(normalizeBrand('  Delta  ')).toBe('Delta');
    });

    it('should return the brand as-is for valid inputs', () => {
      expect(normalizeBrand('Waaree')).toBe('Waaree');
    });
  });

  describe('calculateWarrantyExpiry - Inverter Warranties', () => {
    it('should apply 10 years warranty for Delta inverter', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: 'Delta',
        panel_brand: 'Tata Solar',
        commissioning_date: '2020-01-01',
      });
      expect(result.inverter_warranty_years).toBe(10);
      expect(result.inverter_warranty_expiry_date).toBe('2030-01-01');
    });

    it('should apply 3 years warranty for Microtech inverter', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: 'Microtech',
        panel_brand: 'Tata Solar',
        commissioning_date: '2020-01-01',
      });
      expect(result.inverter_warranty_years).toBe(3);
      expect(result.inverter_warranty_expiry_date).toBe('2023-01-01');
    });

    it('should apply 3 years warranty for Luminous inverter', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: 'Luminous',
        panel_brand: 'Tata Solar',
        commissioning_date: '2021-06-15',
      });
      expect(result.inverter_warranty_years).toBe(3);
      expect(result.inverter_warranty_expiry_date).toBe('2024-06-15');
    });

    it('should apply 5 years warranty for Growatt inverter', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: 'Growatt',
        panel_brand: 'Tata Solar',
        commissioning_date: '2022-01-01',
      });
      expect(result.inverter_warranty_years).toBe(5);
      expect(result.inverter_warranty_expiry_date).toBe('2027-01-01');
    });

    it('should apply 5 years warranty for Polycab inverter', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: 'Polycab',
        panel_brand: 'Tata Solar',
        commissioning_date: '2022-05-15',
      });
      expect(result.inverter_warranty_years).toBe(5);
      expect(result.inverter_warranty_expiry_date).toBe('2027-05-15');
    });
  });

  describe('calculateWarrantyExpiry - Panel Warranties', () => {
    it('should apply 30 years warranty for Waaree panel', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: 'Delta',
        panel_brand: 'Waaree',
        commissioning_date: '2020-01-01',
      });
      expect(result.panel_warranty_years).toBe(30);
      expect(result.panel_warranty_expiry_date).toBe('2050-01-01');
    });

    it('should apply 27 years warranty for Vikram Solar panel', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: 'Delta',
        panel_brand: 'Vikram Solar',
        commissioning_date: '2020-01-01',
      });
      expect(result.panel_warranty_years).toBe(27);
      expect(result.panel_warranty_expiry_date).toBe('2047-01-01');
    });

    it('should apply 25 years warranty for Tata Solar panel', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: 'Delta',
        panel_brand: 'Tata Solar',
        commissioning_date: '2020-01-01',
      });
      expect(result.panel_warranty_years).toBe(25);
      expect(result.panel_warranty_expiry_date).toBe('2045-01-01');
    });

    it('should apply 25 years warranty for Adani panel', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: 'Delta',
        panel_brand: 'Adani',
        commissioning_date: '2021-07-20',
      });
      expect(result.panel_warranty_years).toBe(25);
      expect(result.panel_warranty_expiry_date).toBe('2046-07-20');
    });

    it('should apply 25 years warranty for Goldi Solar panel', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: 'Delta',
        panel_brand: 'Goldi Solar',
        commissioning_date: '2022-03-10',
      });
      expect(result.panel_warranty_years).toBe(25);
      expect(result.panel_warranty_expiry_date).toBe('2047-03-10');
    });
  });

  describe('calculateWarrantyExpiry - Edge Cases', () => {
    it('should default to 5 years for inverter and 25 years for panel when brand is NULL', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: null,
        panel_brand: null,
        commissioning_date: '2020-01-01',
      });
      expect(result.inverter_warranty_years).toBe(5);
      expect(result.panel_warranty_years).toBe(25);
      expect(result.inverter_brand).toBe('Other');
      expect(result.panel_brand).toBe('Other');
    });

    it('should default to Other for unknown inverter brands', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: 'UnknownInverter',
        panel_brand: 'Tata Solar',
        commissioning_date: '2020-01-01',
      });
      expect(result.inverter_warranty_years).toBe(5);
      expect(result.inverter_brand).toBe('Other');
    });

    it('should default to Other for unknown panel brands', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: 'Delta',
        panel_brand: 'UnknownPanel',
        commissioning_date: '2020-01-01',
      });
      expect(result.panel_warranty_years).toBe(25);
      expect(result.panel_brand).toBe('Other');
    });

    it('should handle empty string brands', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: '',
        panel_brand: '',
        commissioning_date: '2020-01-01',
      });
      expect(result.inverter_warranty_years).toBe(5);
      expect(result.panel_warranty_years).toBe(25);
    });

    it('should handle whitespace-only brands', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: '   ',
        panel_brand: '   ',
        commissioning_date: '2020-01-01',
      });
      expect(result.inverter_warranty_years).toBe(5);
      expect(result.panel_warranty_years).toBe(25);
    });

    it('should return N/A for invalid commissioning date', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: 'Delta',
        panel_brand: 'Waaree',
        commissioning_date: 'invalid-date',
      });
      expect(result.inverter_warranty_expiry_date).toBe('N/A');
      expect(result.panel_warranty_expiry_date).toBe('N/A');
    });

    it('should handle DD/MM/YYYY format for commissioning date', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: 'Delta',
        panel_brand: 'Waaree',
        commissioning_date: '01/01/2020',
      });
      expect(result.inverter_warranty_expiry_date).toBe('2030-01-01');
      expect(result.panel_warranty_expiry_date).toBe('2050-01-01');
    });
  });

  describe('calculateWarrantyExpiry - Example from Requirements', () => {
    it('should produce correct output for Delta + Waaree example', () => {
      const result = calculateWarrantyExpiry({
        inverter_brand: 'Delta',
        panel_brand: 'Waaree',
        commissioning_date: '2020-01-01',
      });
      
      expect(result.inverter_warranty_expiry_date).toBe('2030-01-01');
      expect(result.panel_warranty_expiry_date).toBe('2050-01-01');
    });
  });

  describe('calculateBulkWarranties', () => {
    it('should process multiple customers correctly', () => {
      const customers: CustomerWarrantyData[] = [
        { inverter_brand: 'Delta', panel_brand: 'Waaree', commissioning_date: '2020-01-01' },
        { inverter_brand: 'Growatt', panel_brand: 'Tata Solar', commissioning_date: '2022-05-15' },
      ];
      
      const results = calculateBulkWarranties(customers);
      
      expect(results).toHaveLength(2);
      expect(results[0].inverter_warranty_expiry_date).toBe('2030-01-01');
      expect(results[0].panel_warranty_expiry_date).toBe('2050-01-01');
      expect(results[1].inverter_warranty_expiry_date).toBe('2027-05-15');
      expect(results[1].panel_warranty_expiry_date).toBe('2047-05-15');
    });
  });

  describe('getSupportedInverterBrands', () => {
    it('should return all supported inverter brands', () => {
      const brands = getSupportedInverterBrands();
      expect(brands['Delta']).toBe(10);
      expect(brands['Microtech']).toBe(3);
      expect(brands['Luminous']).toBe(3);
      expect(brands['Growatt']).toBe(5);
      expect(brands['Polycab']).toBe(5);
    });
  });

  describe('getSupportedPanelBrands', () => {
    it('should return all supported panel brands', () => {
      const brands = getSupportedPanelBrands();
      expect(brands['Waaree']).toBe(30);
      expect(brands['Vikram Solar']).toBe(27);
      expect(brands['Tata Solar']).toBe(25);
      expect(brands['Adani']).toBe(25);
    });
  });
});
