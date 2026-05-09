import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    'host': os.getenv('DB_HOST', '166.62.28.141'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'user': os.getenv('DB_USER', 'Arin'),
    'password': os.getenv('DB_PASSWORD', 'Arin@098123'),
    'database': os.getenv('DB_NAME', 'Arin_Energy')
}

def dump_schema():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        with open("full_schema_dump.txt", "w") as f:
            for table in ['customers', 'bill_generation_details']:
                f.write(f"\n--- TABLE: {table} ---\n")
                cursor.execute(f"DESCRIBE {table}")
                cols = cursor.fetchall()
                for col in cols:
                    f.write(f"{col}\n")
                
                # Show keys/constraints
                f.write(f"\n--- KEYS for {table} ---\n")
                cursor.execute(f"SHOW INDEX FROM {table}")
                indexes = cursor.fetchall()
                for idx in indexes:
                    f.write(f"{idx}\n")
                    
        print("Schema dumped to full_schema_dump.txt")
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    dump_schema()
