"""
Check all DB records where bank units are 0 - these may need fixing.
"""
import mysql.connector
from dotenv import load_dotenv
import os

load_dotenv()

DB_CONFIG = {
    'host': os.getenv('DB_HOST', '166.62.28.141'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'user': os.getenv('DB_USER', 'Arin'),
    'password': os.getenv('DB_PASSWORD', 'Arin@098123'),
    'database': os.getenv('DB_NAME', 'Arin_Energy')
}

conn = mysql.connector.connect(**DB_CONFIG)
cursor = conn.cursor(dictionary=True)

# All records with 0 bank units
cursor.execute("""
    SELECT id, consumer_number, month_year,
           import_units, export_units, generation_units,
           bank_solar_units, prev_bank_units, billing_amount
    FROM bill_generation_details
    WHERE bank_solar_units = 0 OR prev_bank_units = 0
    ORDER BY month_year DESC
""")
rows = cursor.fetchall()

print(f"Records with bank_solar_units=0 OR prev_bank_units=0: {len(rows)}")
print("="*70)
for r in rows:
    print(f"ID={r['id']} | consumer={r['consumer_number']} | month={r['month_year']}")
    print(f"  import={r['import_units']}  export={r['export_units']}  gen={r['generation_units']}")
    print(f"  bank_solar_units={r['bank_solar_units']}  prev_bank_units={r['prev_bank_units']}")
    print(f"  amount={r['billing_amount']}")
    print()

conn.close()
