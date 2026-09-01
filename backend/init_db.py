"""
Database Initialization Script — Arin Energy
Creates the `users` table and seeds the default admin user.
Run once: python init_db.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from processing import get_db_connection
from auth import hash_password
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def init_database():
    """Create users table and seed admin user."""
    conn = get_db_connection()
    if not conn:
        logger.error("Cannot connect to database. Check .env configuration.")
        return False
    
    try:
        cursor = conn.cursor()
        
        # ── 1. Create users table ──
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role ENUM('admin', 'operator') DEFAULT 'operator',
                is_active BOOLEAN DEFAULT TRUE,
                failed_attempts INT DEFAULT 0,
                locked_until DATETIME NULL,
                email VARCHAR(100) UNIQUE NULL,
                otp_code VARCHAR(6) NULL,
                otp_expiry DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        
        # ── 1b. Alter existing table (if it missed the new columns) ──
        alter_queries = [
            "ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL",
            "ALTER TABLE users ADD COLUMN role ENUM('admin', 'operator') DEFAULT 'operator'",
            "ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE",
            "ALTER TABLE users ADD COLUMN failed_attempts INT DEFAULT 0",
            "ALTER TABLE users ADD COLUMN locked_until DATETIME NULL",
            "ALTER TABLE users ADD COLUMN email VARCHAR(100) UNIQUE NULL",
            "ALTER TABLE users ADD COLUMN otp_code VARCHAR(6) NULL",
            "ALTER TABLE users ADD COLUMN otp_expiry DATETIME NULL",
        ]
        
        for aq in alter_queries:
            try:
                cursor.execute(aq)
            except Exception:
                pass # Ignore if column already exists
                
        logger.info("Table 'users' created/verified.")
        
        # ── 1c. Create portal_credentials table ──
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS portal_credentials (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(100) NOT NULL,
                description VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        logger.info("Table 'portal_credentials' created/verified.")

        # ── 1d. Create customers table (Single Source of Truth) ──
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS customers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                arin_id VARCHAR(50) NULL,
                customer_name VARCHAR(255) NULL,
                contact_number VARCHAR(50) NULL,
                zone VARCHAR(100) NULL,
                current_location_link TEXT NULL,
                address TEXT NULL,
                consumer_number VARCHAR(50) UNIQUE NOT NULL,
                panel_name VARCHAR(100) NULL,
                panel_name_other VARCHAR(100) NULL,
                panel_type VARCHAR(100) NULL,
                solar_wattpick INT NULL,
                solar_panel_count INT NULL,
                solar_capacity_kw DECIMAL(10,2) NULL,
                panel_capacity_kw DECIMAL(10,2) NULL,
                inverter_name VARCHAR(100) NULL,
                inverter_name_other VARCHAR(100) NULL,
                inverter_capacity DECIMAL(10,2) NULL,
                commission_date DATE NULL,
                wifi_available TINYINT(1) DEFAULT 0,
                wifi_id VARCHAR(100) NULL,
                wifi_password VARCHAR(100) NULL,
                visits_per_year INT NULL,
                total_visits_in_5_years INT NULL,
                maintenance_tenure VARCHAR(100) NULL,
                is_blacklisted TINYINT(1) DEFAULT 0,
                inverter_warranty_expiry_date DATE NULL,
                panel_warranty_expiry_date DATE NULL,
                system_warranty_expiry_date DATE NULL,
                general_warranty_expiry_date DATE NULL,
                blacklisted_reason VARCHAR(255) NULL,
                portal_username VARCHAR(100) NULL,
                portal_password VARCHAR(100) NULL,
                subscription_end_date DATE NULL,
                subscription_active TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_consumer_number (consumer_number),
                INDEX idx_arin_id (arin_id),
                INDEX idx_zone (zone)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
        
        alter_cust_queries = [
            "ALTER TABLE customers MODIFY COLUMN solar_capacity_kw DECIMAL(10,2) NULL",
            "ALTER TABLE customers MODIFY COLUMN panel_capacity_kw DECIMAL(10,2) NULL",
            "ALTER TABLE customers MODIFY COLUMN inverter_capacity DECIMAL(10,2) NULL",
            "ALTER TABLE customers MODIFY COLUMN arin_id VARCHAR(100) NULL",
            "ALTER TABLE customers ADD COLUMN email VARCHAR(100) NULL",
            "ALTER TABLE customers ADD COLUMN bill_generation_date DATE NULL",
            "ALTER TABLE customers ADD COLUMN committed_year VARCHAR(50) NULL",
            "ALTER TABLE customers ADD COLUMN subscription_end_date DATE NULL",
            "ALTER TABLE customers ADD COLUMN subscription_active TINYINT(1) DEFAULT 0",
        ]
        for ac in alter_cust_queries:
            try:
                cursor.execute(ac)
            except Exception:
                pass
                
        logger.info("Table 'customers' created/verified.")

        # ── 1e. Create bill_generation_details table ──
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bill_generation_details (
                id INT AUTO_INCREMENT PRIMARY KEY,
                customer_id INT NULL,
                consumer_number VARCHAR(50) NOT NULL,
                month_year VARCHAR(20) NOT NULL,
                bill_month VARCHAR(50) NULL,
                reading_date DATE NULL,
                import_units DECIMAL(10,2) DEFAULT 0,
                export_units DECIMAL(10,2) DEFAULT 0,
                generation_units DECIMAL(10,2) DEFAULT 0,
                billing_amount DECIMAL(10,2) DEFAULT 0,
                billing_units DECIMAL(10,2) DEFAULT 0,
                day_consumption DECIMAL(10,2) DEFAULT 0,
                total_consumption DECIMAL(10,2) DEFAULT 0,
                prev_bank_units DECIMAL(10,2) DEFAULT 0,
                bank_solar_units DECIMAL(10,2) DEFAULT 0,
                net_billed_units DECIMAL(10,2) DEFAULT 0,
                solar_capacity DECIMAL(10,2) DEFAULT 0,
                system_health VARCHAR(50) DEFAULT 'GOOD',
                bill_status VARCHAR(50) DEFAULT 'Normal',
                image_url TEXT NULL,
                pdf_path TEXT NULL,
                pdf_drive_file_id VARCHAR(255) NULL,
                pdf_drive_view_url TEXT NULL,
                pdf_file_name VARCHAR(255) NULL,
                image_drive_file_id VARCHAR(255) NULL,
                image_drive_view_url TEXT NULL,
                image_file_name VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_consumer_month (consumer_number, month_year),
                INDEX idx_bill_consumer (consumer_number),
                INDEX idx_bill_month (month_year)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        alter_bill_queries = [
            "ALTER TABLE bill_generation_details ADD COLUMN pdf_drive_file_id VARCHAR(255) NULL",
            "ALTER TABLE bill_generation_details ADD COLUMN pdf_drive_view_url TEXT NULL",
            "ALTER TABLE bill_generation_details ADD COLUMN pdf_file_name VARCHAR(255) NULL",
            "ALTER TABLE bill_generation_details ADD COLUMN image_drive_file_id VARCHAR(255) NULL",
            "ALTER TABLE bill_generation_details ADD COLUMN image_drive_view_url TEXT NULL",
            "ALTER TABLE bill_generation_details ADD COLUMN image_file_name VARCHAR(255) NULL",
        ]
        for ab in alter_bill_queries:
            try:
                cursor.execute(ab)
            except Exception:
                pass

        logger.info("Table 'bill_generation_details' created/verified.")

        # ── 1f. Create warranties_master table ──
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS warranties_master (
                id INT AUTO_INCREMENT PRIMARY KEY,
                equipment_type ENUM('panel', 'inverter') NOT NULL,
                make_name VARCHAR(100) NOT NULL,
                warranty_years INT NOT NULL,
                effective_from DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)

        # ── 1g. Create subscriptions_log and system_settings ──
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS subscriptions_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                consumer_number VARCHAR(50) NOT NULL,
                amount_paid DECIMAL(10,2) NOT NULL,
                payment_date DATE NOT NULL,
                payment_time TIME NOT NULL,
                payment_mode VARCHAR(50) NOT NULL,
                utr_number VARCHAR(100) NOT NULL,
                validity_years INT DEFAULT 3,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                created_by VARCHAR(50) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_settings (
                setting_key VARCHAR(100) PRIMARY KEY,
                setting_value TEXT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
        cursor.execute("INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES ('subscription_enabled', 'off')")
        
        # ── 2. Seed default admin user (if not exists) ──
        cursor.execute("SELECT id FROM users WHERE username = 'admin'")
        if not cursor.fetchone():
            admin_hash = hash_password("Arin@2026")
            cursor.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s)",
                ("admin", admin_hash, "admin")
            )
            logger.info("Default admin user created (username: admin, password: Arin@2026)")
        else:
            # Re-hash the password in case it was stored as plain text previously
            admin_hash = hash_password("Arin@2026")
            cursor.execute(
                "UPDATE users SET password_hash = %s WHERE username = 'admin'",
                (admin_hash,)
            )
            logger.info("Admin user already exists, updated password hash.")
        
        conn.commit()
        logger.info("═══ Database initialization complete ═══")
        return True
        
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        import traceback
        traceback.print_exc()
        conn.rollback()
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    success = init_database()
    if success:
        print("\n[SUCCESS] Database ready. You can now start the backend.")
    else:
        print("\n[ERROR] Database initialization failed. Check errors above.")
