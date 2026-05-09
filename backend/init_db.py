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
        ]
        
        for aq in alter_queries:
            try:
                cursor.execute(aq)
            except Exception:
                pass # Ignore if column already exists
                
        logger.info("Table 'users' created/verified.")
        
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
