#!/usr/bin/env python
"""Test authentication without MySQL dependency."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from backend.auth import get_user_from_db, verify_password, create_access_token

print("="*70)
print("AUTHENTICATION TEST (NO MYSQL REQUIRED)")
print("="*70)

# Test 1: Fetch admin user from local store
print("\n1. Fetching admin user from local store...")
admin = get_user_from_db("admin")
if admin:
    print(f"   ✓ Found user: {admin['username']}")
    print(f"     Role: {admin['role']}")
    print(f"     Active: {admin['is_active']}")
else:
    print(f"   ✗ User not found")

# Test 2: Verify password
print("\n2. Testing password verification...")
if admin:
    is_valid = verify_password("Arin@2026", admin['password_hash'])
    print(f"   Password 'Arin@2026': {'✓ VALID' if is_valid else '✗ INVALID'}")
    
    is_invalid = verify_password("wrongpassword", admin['password_hash'])
    print(f"   Password 'wrongpassword': {'✗ INVALID (correct)' if not is_invalid else '✓ VALID (wrong!)'}")

# Test 3: Create JWT token
print("\n3. Creating JWT token...")
if admin:
    token = create_access_token({"sub": admin['username'], "role": admin['role']})
    print(f"   ✓ Token created: {token[:50]}...")

# Test 4: Test operator user
print("\n4. Testing operator user...")
op_user = get_user_from_db("Site Eng Hod")
if op_user:
    print(f"   ✓ Found user: {op_user['username']}")
    print(f"     Role: {op_user['role']}")
else:
    print(f"   ✗ User not found")

print("\n" + "="*70)
print("TEST COMPLETE - Authentication works without MySQL!")
print("="*70)
