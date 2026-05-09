import mysql.connector
import os
from dotenv import load_dotenv

def check_db():
    try:
        conn = mysql.connector.connect(
            host="localhost",
            user="root",
            password="",
            database="arin_billing"
        )
        cursor = conn.cursor()
        
        print("--- Table: bill_generation_details ---")
        cursor.execute("SELECT COUNT(*) FROM bill_generation_details")
        print(f"Count: {cursor.fetchone()[0]}")
        
        print("\n--- Table: customers ---")
        cursor.execute("SELECT COUNT(*) FROM customers")
        print(f"Count: {cursor.fetchone()[0]}")
        
        print("\n--- Columns in bill_generation_details ---")
        cursor.execute("DESCRIBE bill_generation_details")
        for col in cursor.fetchall():
            print(col)
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_db()
