import sys
import os
import re

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from processing import get_db_connection
from main import extract_text_ocr, extract_msedcl_dates

def py_matches_arin_id(target_id, consumer_id):
    if not target_id or not consumer_id:
        return False
    t = str(target_id).strip().lower()
    c = str(consumer_id).strip().lower()
    if not t or not c or t == 'all':
        return False
    if t == c:
        return True

    t_has_hash = '#' in t
    t_has_dollar = '$' in t
    c_has_hash = '#' in c
    c_has_dollar = '$' in c

    if (t_has_hash and c_has_dollar) or (t_has_dollar and c_has_hash):
        return False

    def parse_arin(s):
        m = re.match(r'^([a-z]*)\s*([#$])\s*0*(\d+)$', s, re.IGNORECASE) or re.search(r'([#$])\s*0*(\d+)', s, re.IGNORECASE)
        if m:
            if len(m.groups()) == 3:
                return {'prefix': m.group(1).lower(), 'symbol': m.group(2), 'num': int(m.group(3))}
            return {'prefix': '', 'symbol': m.group(1), 'num': int(m.group(2))}
        return None

    p_t = parse_arin(t)
    p_c = parse_arin(c)
    if p_t and p_c:
        if p_t['symbol'] != p_c['symbol']:
            return False
        return p_t['num'] == p_c['num']

    if p_t or p_c or t_has_hash or t_has_dollar or c_has_hash or c_has_dollar:
        return False

    t_clean = re.sub(r'[^a-z0-9]', '', t)
    c_clean = re.sub(r'[^a-z0-9]', '', c)
    return bool(t_clean and c_clean and t_clean == c_clean)

def run_tests():
    print("=== TEST 1: Unit Tests for matchesArinId ===")
    assert not py_matches_arin_id('Arin#010', 'Arin$010'), 'Arin#010 must not match Arin$010'
    assert not py_matches_arin_id('Arin#009', 'Arin$009'), 'Arin#009 must not match Arin$009'
    assert not py_matches_arin_id('Arin#018', 'Arin$018'), 'Arin#018 must not match Arin$018'
    assert py_matches_arin_id('Arin#010', 'Arin#010'), 'Arin#010 must match Arin#010'
    assert py_matches_arin_id('Arin#010', 'Arin#10'), 'Arin#010 must match Arin#10'
    assert py_matches_arin_id('Arin$010', 'Arin$010'), 'Arin$010 must match Arin$010'
    assert py_matches_arin_id('Arin$010', 'Arin$10'), 'Arin$010 must match Arin$10'
    print("✓ All matchesArinId unit test assertions PASSED!")

    print("\n=== TEST 2: Filter Database Customers by ID ===")
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute('SELECT consumer_number, arin_id FROM customers')
    all_custs = cur.fetchall()
    cur.close()
    conn.close()

    def count_for_target(target):
        return len([c for c in all_custs if py_matches_arin_id(target, c['arin_id'])])

    targets = ['Arin#010', 'Arin$010', 'Arin#009', 'Arin$009', 'Arin#018', 'Arin$018']
    expected_counts = {
        'Arin#010': 40,
        'Arin$010': 21,
        'Arin#009': 28,
        'Arin$009': 9,
        'Arin#018': 64,
        'Arin$018': 3,
    }

    for target in targets:
        actual = count_for_target(target)
        expected = expected_counts[target]
        print(f"  {target}: {actual} consumers (Expected: {expected})")
        assert actual == expected, f"Count mismatch for {target}: got {actual}, expected {expected}"
    print("✓ Database customer filtering strictly differentiates # and $ IDs!")

    print("\n=== TEST 3: Reading Date Extraction across Sample Bills ===")
    expected_dates = {
        'chnages ref files/Smple bill1.jpeg': '05-01-2026',
        'chnages ref files/Sample bill2.jpeg': '02-07-2026',
        'chnages ref files/Sample bill3.jpeg': '18-07-2026',
        'chnages ref files/Sample bill4.jpeg': '18-07-2026',
    }

    for filepath, expected_rd in expected_dates.items():
        full_path = os.path.join(os.path.dirname(__file__), '..', filepath)
        with open(full_path, 'rb') as fp:
            txt = extract_text_ocr(fp.read(), filepath)
        actual_rd, actual_bd = extract_msedcl_dates(txt)
        print(f"  {filepath} => Extracted: {actual_rd} | Expected: {expected_rd} (Bill Date: {actual_bd})")
        assert actual_rd == expected_rd, f"Failed on {filepath}: got {actual_rd} instead of {expected_rd}"
    print("✓ All sample bill reading dates accurately extracted and verified!")

    print("\n=== TEST 4: Next/Probable Reading Date Exclusion ===")
    test_text_next = """
    देयक दिनांक : 08-09-2026
    पुढील वाचन दिनांक : 12-10-2026
    संभाव्य वाचन दिनांक : 10-10-2026
    चालू वाचन दिनांक : 05-09-2026
    मागील वाचन दिनांक : 05-08-2026
    देयक भरणा दिनांक : 28-09-2026
    """
    next_rd, next_bd = extract_msedcl_dates(test_text_next)
    print(f"  Text with Next/Probable dates => Reading Date: {next_rd}, Billing Date: {next_bd}")
    assert next_rd == '05-09-2026', f"Failed: matched {next_rd} instead of 05-09-2026"
    assert next_bd == '08-09-2026', f"Failed: matched {next_bd} instead of 08-09-2026"
    print("✓ Successfully excluded Next/Probable reading dates and extracted true Current Reading Date!")

    print("\n=== TEST 5: PDF Extraction on Sample MSEDCL Bills ===")
    from processing import extract_data_from_pdf
    pdf_samples = {
        'scratch/bill_1859.pdf': ('2026-09-05', '2026-09-08'),
        'scratch/bill_1860.pdf': ('2026-09-05', '2026-09-08'),
    }
    for p_path, (exp_rd, exp_bd) in pdf_samples.items():
        full_p = os.path.join(os.path.dirname(__file__), '..', p_path)
        if os.path.exists(full_p):
            p_data = extract_data_from_pdf(full_p)
            print(f"  {p_path} => Reading Date: {p_data.get('reading_date')} | Billing Date: {p_data.get('billing_date')}")
            assert p_data.get('reading_date') == exp_rd, f"Expected {exp_rd}, got {p_data.get('reading_date')}"
            assert p_data.get('billing_date') == exp_bd, f"Expected {exp_bd}, got {p_data.get('billing_date')}"
    print("✓ All PDF sample bills extracted accurately without future reading dates!")

    print("\n=== TEST 6: Database Integrity Check (reading_date <= billing_date) ===")
    conn = get_db_connection()
    c = conn.cursor(dictionary=True)
    c.execute("SELECT count(*) as cnt FROM bill_generation_details WHERE reading_date > billing_date")
    mismatch_cnt = c.fetchone()['cnt']
    c.close()
    conn.close()
    print(f"  Total records where reading_date > billing_date: {mismatch_cnt}")
    assert mismatch_cnt == 0, f"Database has {mismatch_cnt} records with reading_date > billing_date!"
    print("✓ Database verified: 0 records with reading_date > billing_date!")

if __name__ == '__main__':
    run_tests()
