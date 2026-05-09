"""
Manual DB fix for consumer 425320007691 - bank units confirmed from bill image:
  bank_solar_units (BSU) = 835  (Bank Solar Units column in bill)
  prev_bank_units  (PBU) = 705  (Prev Bank Units column in bill)
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

CONSUMER = '425320007691'
BSU = 835.0   # Bank Solar Units  - from bill image
PBU = 705.0   # Prev Bank Units   - from bill image
MONTH = '2026-03-25'

conn = mysql.connector.connect(**DB_CONFIG)
cursor = conn.cursor()

cursor.execute(
    "UPDATE bill_generation_details SET bank_solar_units=%s, prev_bank_units=%s "
    "WHERE consumer_number=%s AND month_year=%s",
    (BSU, PBU, CONSUMER, MONTH)
)
rows = cursor.rowcount
conn.commit()
print(f"Updated {rows} row(s) for consumer {CONSUMER}")

# Verify
cursor2 = conn.cursor(dictionary=True)
cursor2.execute(
    "SELECT id, consumer_number, month_year, import_units, export_units, generation_units,"
    " bank_solar_units, prev_bank_units, billing_amount"
    " FROM bill_generation_details WHERE consumer_number=%s",
    (CONSUMER,)
)
for row in cursor2.fetchall():
    print("\nVerification:")
    for k, v in row.items():
        print(f"  {k}: {v}")

conn.close()
print("\nDONE")
