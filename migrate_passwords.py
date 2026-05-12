#!/usr/bin/env python
"""Migrate plain text passwords to bcrypt hashes for all users."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from backend.processing import get_db_connection
from backend.auth import hash_password

conn = get_db_connection()
if not conn:
    print("✗ Could not connect to database")
    sys.exit(1)

try:
    cursor = conn.cursor(dictionary=True)
    
    # Find all users with no password_hash
    cursor.execute("""
        SELECT id, username, password 
        FROM users 
        WHERE (password_hash IS NULL OR password_hash = '') 
        AND password IS NOT NULL 
        AND password != ''
    """)
    
    users_to_migrate = cursor.fetchall()
    
    print("="*70)
    print("PASSWORD MIGRATION")
    print("="*70)
    print(f"\nFound {len(users_to_migrate)} users to migrate...\n")
    
    migrated = 0
    failed = 0
    
    for user in users_to_migrate:
        try:
            hashed = hash_password(user['password'])
            cursor.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (hashed, user['id'])
            )
            print(f"✓ {user['username']:30} - password hashed")
            migrated += 1
        except Exception as e:
            print(f"✗ {user['username']:30} - ERROR: {e}")
            failed += 1
    
    conn.commit()
    
    print(f"\n{'='*70}")
    print(f"Migration complete: {migrated} succeeded, {failed} failed")
    print(f"{'='*70}")
    
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
finally:
    conn.close()
