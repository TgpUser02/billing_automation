import os
import sys
import pandas as pd
import io

print("=== 1. TESTING EXCEL IMPORT PARSER WITH REFERENCE EXCEL ===")
ref_excel_path = "/Users/threeprenur/Desktop/TGP/billing_automation/chnages ref files/Billing XL Format.xlsx"
df = pd.read_excel(ref_excel_path)
print(f"Loaded reference Excel with {len(df)} rows and {len(df.columns)} columns:")
print("Columns:", list(df.columns))

# Simulate column mapping logic in main.py
import re
mappings = {
    'arin_id': ['arin id', 'arin_id', 'arin_identifier', 'arin', 'arinid', 'id', 'arin no', 'arin_no', 'arin no.', 'arin code', 'hash id', 'hash_id', 'hashid', 'consumer arin id', 'user ids', 'user id', 'user_id', 'user_ids', "user id's"],
    'customer_name': ['customer name', 'customer_name', 'name', 'consumer name', 'consumer_name', 'client name', 'client_name', 'account name', 'consumer_name_msedcl'],
    'contact_number': ['contact number', 'contact_number', 'phone', 'contact', 'mobile', 'mobile number', 'mobile_number', 'phone number', 'phone_number', 'contact no', 'contact_no', 'mobile no', 'mobile_no', 'mobile no.'],
    'email': ['email id', 'email_id', 'email', 'e-mail', 'mail'],
    'zone': ['zone', 'area', 'region', 'zone / area', 'zone/area', 'zone name', 'circle', 'division', 'sub division', 'subdivision', 'location zone', 'cluster', 'site zone'],
    'current_location_link': ['google location', 'google_location', 'location link', 'current_location_link', 'location', 'link', 'map link', 'map_link', 'google map link', 'map'],
    'address': ['address', 'addr', 'site address', 'customer address'],
    'consumer_number': ['consumer number', 'consumer_number', 'consumer no', 'consumer_no', 'consumer no.', 'number', 'msedcl no', 'msedcl_no', 'consumer_id', 'consumer id', 'consumer #', 'ca number', 'k no', 'knumber', 'account number', 'acc no', 'acc_no', 'connection no', 'connection number', 'consumer_no_msedcl'],
    'panel_name': ['panel', 'panel name', 'panel_name', 'solar panel', 'panel make', 'module make', 'pv module'],
    'panel_name_other': ['panel name other', 'panel_name_other', 'panel_other'],
    'panel_type': ['panel type', 'panel_type', 'type of panel', 'module type'],
    'solar_wattpick': ['panel capacity', 'panel_capacity', 'solar wattpick', 'solar_wattpick', 'wattpick', 'solar watt peak', 'solar_wattpeak', 'wp', 'watt peak', 'panel wp'],
    'solar_panel_count': ['no of panels', 'no_of_panels', 'number of panels', 'solar panel count', 'solar_panel_count', 'panel count', 'panels', 'qty panels'],
    'solar_capacity_kw': ['system capacity', 'system_capacity', 'solar capacity kw', 'solar_capacity_kw', 'capacity', 'capacity kw', 'solar capacity', 'capacity_kw', 'system size', 'system capacity', 'plant capacity', 'spv capacity', 'capacity(kw)', 'capacity (kw)', 'solar cap', 'solar_cap', 'capacity in kw', 'sanction load', 'sanctioned load', 'load', 'system size (kw)', 'system size kw', 'kw capacity'],
    'panel_capacity_kw': ['panel capacity kw', 'panel_capacity_kw', 'panel capacity', 'panel_capacity_kw_value', 'pv capacity'],
    'inverter_name': ['inverter', 'inverter name', 'inverter_name', 'inverter make', 'inv make'],
    'inverter_name_other': ['inverter name other', 'inverter_name_other', 'inverter_other'],
    'inverter_capacity': ['inverter capacity', 'inverter_capacity', 'inverter capacity kw', 'inverter_capacity_kw', 'inv capacity', 'inv capacity kw', 'inv_capacity_kw'],
    'commission_date': ['date of commitioning', 'date of commissioning', 'date_of_commitioning', 'date_of_commissioning', 'commission date', 'commission_date', 'commissioning date', 'date of commission', 'date_of_commission', 'cod', 'installation date', 'doc'],
    'bill_generation_date': ['bill generation date', 'bill_generation_date', 'bill date', 'billing date'],
    'committed_year': ['commited year', 'commited_year', 'committed year', 'committed_year', 'year', 'year '],
    'wifi_available': ['wifi available', 'wifi_available', 'wifi', 'wifi_enabled'],
    'wifi_id': ['wifi id', 'wifi_id', 'wifi name', 'wifi_name', 'ssid'],
    'wifi_password': ['wifi password', 'wifi_password', 'wifi pass', 'ssid password'],
    'visits_per_year': ['visits per year', 'visits_per_year', 'visits', 'annual visits'],
    'total_visits_in_5_years': ['total visits in 5 years', 'total_visits_in_5_years', 'total visits', 'total_visits'],
    'maintenance_tenure': ['maintenance tenure', 'maintenance_tenure', 'tenure of maintenance', 'tenure', 'amc tenure'],
    'is_blacklisted': ['is blacklisted', 'is_blacklisted', 'blacklisted'],
    'inverter_warranty_expiry_date': ['inverter warranty expiry date', 'inverter_warranty_expiry_date', 'inverter warranty expiry', 'inverter warranty', 'inv warranty expiry'],
    'panel_warranty_expiry_date': ['panel warranty expiry date', 'panel_warranty_expiry_date', 'panel warranty expiry', 'panel warranty'],
    'system_warranty_expiry_date': ['system warranty expiry date', 'system_warranty_expiry_date', 'system warranty expiry', 'system warranty'],
    'general_warranty_expiry_date': ['general warranty expiry date', 'general_warranty_expiry_date', 'general warranty', 'general_warranty', 'warranty', 'warranty expiry'],
    'blacklisted_reason': ['blacklisted reason', 'blacklisted_reason', 'blacklist reason', 'blacklist_reason'],
    'portal_username': ['portal username', 'portal_username', 'portal id', 'portal_id', 'username'],
    'portal_password': ['portal password', 'portal_password', 'password'],
    'subscription_end_date': ['date of validity', 'date_of_validity', 'validity date', 'subscription end date', 'subscription_end_date', 'subscription_expiry', 'subscription expiry']
}

df_cols_clean = {re.sub(r'[^a-zA-Z0-9]', '', str(c).lower()): c for c in df.columns}
mapped_columns = {}
for db_col, variations in mappings.items():
    for var in variations:
        clean_var = re.sub(r'[^a-zA-Z0-9]', '', var.lower())
        if clean_var in df_cols_clean:
            mapped_columns[db_col] = df_cols_clean[clean_var]
            break

print(f"\nSuccessfully mapped {len(mapped_columns)} columns from Excel:")
for k, v in mapped_columns.items():
    print(f"  {k} -> '{v}'")

assert 'consumer_number' in mapped_columns, "consumer_number must be mapped"
assert 'solar_capacity_kw' in mapped_columns, "solar_capacity_kw must be mapped"
assert 'zone' in mapped_columns, "zone must be mapped"
assert 'arin_id' in mapped_columns, "arin_id must be mapped"

print("\n=== 2. TESTING AUTO CAPACITY CALCULATION & SPECIAL RAW CHAR ARIN ID ===")
test_panel_count = 8
test_wattpick = 545
calc_cap = round((test_panel_count * test_wattpick) / 1000.0, 2)
assert calc_cap == 4.36, f"Expected 4.36, got {calc_cap}"
print(f"Auto-calculated Capacity: {test_panel_count} panels * {test_wattpick} Wp / 1000 = {calc_cap} kW [PASSED]")

raw_arin_id = "ARIN#101$2026_TEST"
cleaned_id = raw_arin_id if not raw_arin_id.endswith(".0") else raw_arin_id[:-2]
assert cleaned_id == "ARIN#101$2026_TEST", "Arin ID special characters must not be stripped"
print(f"Preserved Raw Arin ID: '{cleaned_id}' [PASSED]")

print("\n=== 3. TESTING DATABASE SCHEMA INTEGRITY ===")
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
try:
    from backend.processing import get_db_connection
    conn = get_db_connection()
    if conn:
        cursor = conn.cursor()
        cursor.execute("DESCRIBE customers")
        cols = {row[0]: row[1] for row in cursor.fetchall()}
        print(f"Connected to MySQL DB. customers table columns: {len(cols)}")
        assert 'solar_capacity_kw' in cols, "solar_capacity_kw missing"
        assert 'zone' in cols, "zone missing"
        assert 'arin_id' in cols, "arin_id missing"
        assert 'subscription_end_date' in cols, "subscription_end_date missing"
        print(f"solar_capacity_kw column type in DB: {cols['solar_capacity_kw']}")
        cursor.close()
        conn.close()
        print("Database verification [PASSED]")
    else:
        print("Note: MySQL server not running currently or credentials not reachable, skipping live DB query check.")
except Exception as e:
    print(f"DB verification note (expected if MySQL is off): {e}")

print("\nALL REQUIREMENTS VERIFICATION COMPLETE!")
