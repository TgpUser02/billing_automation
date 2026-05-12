#!/usr/bin/env python
"""Quick verification of login setup."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from backend.processing import get_db_connection
from backend.auth import verify_password

conn = get_db_connection()
if conn:
    cursor = conn.cursor(dictionary=True)
    
    print("="*60)
    print("ADMIN USER VERIFICATION")
    print("="*60)
    
    cursor.execute('SELECT username, password, password_hash FROM users WHERE username = %s', ('admin',))
    user = cursor.fetchone()
    
    if user:
        print(f"\n✓ Admin user found")
        print(f"  Username: {user['username']}")
        print(f"  Password (plain): {user['password']}")
        print(f"  Password Hash: {user['password_hash'][:50]}..." if user['password_hash'] else "  Password Hash: NOT SET")
        
        if user['password_hash']:
            # Test password verification
            test_passwords = ["Arin@2026", "admin", user['password']]
            print(f"\n  Testing password verification:")
            for pwd in test_passwords:
                try:
                    is_valid = verify_password(pwd, user['password_hash'])
                    status = "✓ VALID" if is_valid else "✗ invalid"
                    print(f"    - '{pwd}': {status}")
                except Exception as e:
                    print(f"    - '{pwd}': ERROR - {e}")
        else:
            print(f"\n  ⚠️  WARNING: password_hash is not set!")
            print(f"     Try setting it using init_db.py")
    else:
        print("✗ Admin user NOT found!")
    
    print(f"\nAll users in database:")
    cursor.execute('SELECT COUNT(*) FROM users')
    total = cursor.fetchone()[0]
    print(f"  Total users: {total}")
    
    cursor.close()
    conn.close()
else:
    print("✗ Could not connect to database")
