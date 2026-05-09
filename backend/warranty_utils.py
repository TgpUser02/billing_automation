from datetime import datetime, date

# Inverter Warranty Rules (in years)
INVERTER_WARRANTY_MAP = {
    'Polycab': 5,
    'Havells': 5,
    'Evvo': 5,
    'Ksolare': 5,
    'Anchor': 5,
    'Xwatt': 5,
    'Sofar Solar': 5,
    'Deye': 5,
    'Solax': 5,
    'Solar Yaan': 5,
    'VSOLE': 5,
    'Cathode Power': 5,
    'Growatt': 5,
    'Other': 5,
    'Microtech': 3,
    'Luminous': 3,
    'Delta': 10,
}

# Panel Warranty Rules (in years)
PANEL_WARRANTY_MAP = {
    'Waaree': 30,
    'Vikram Solar': 27,
    'Tata Solar': 25,
    'Adani': 25,
    'Luminous': 25,
    'Goldi Solar': 25,
    'Renewsys': 25,
    'Premier Solar': 25,
    'ECE India': 25,
    'EN-Icon': 25,
    'Novasys': 25,
    'Navitas': 25,
    'Pahal': 25,
    'Other': 25,
}

def normalize_brand(brand):
    """
    Normalizes brand name by handling None, and whitespace
    Returns 'Other' for invalid/empty brands
    """
    if not brand or not isinstance(brand, str) or brand.strip() == '':
        return 'Other'
    return brand.strip()

def get_warranty_years(brand, warranty_map):
    """
    Looks up warranty years from a map, defaulting to 'Other' if not found
    """
    normalized = normalize_brand(brand)
    # Try exact match first, then fallback to 'Other', then default to 5
    return warranty_map.get(normalized) or warranty_map.get('Other') or 5

def add_years(start_date, years):
    """
    Adds years to a date or datetime object, handling leap years
    """
    if not start_date:
        return None
        
    try:
        # Handle Leap Year: If Feb 29th and next date is not leap year, move to Feb 28th
        return start_date.replace(year=start_date.year + years)
    except ValueError:
        # This happens if it's Feb 29 and the target year is not a leap year
        return start_date.replace(year=start_date.year + years, day=28)

def calculate_warranty_expiry(brand, commission_date, warranty_map):
    """
    Calculates the warranty expiry date based on brand and commissioning date
    """
    if not commission_date:
        return None
    
    # Parse date if it's a string
    if isinstance(commission_date, str):
        try:
            if '-' in commission_date:
                # Assuming YYYY-MM-DD
                dt = datetime.strptime(commission_date, '%Y-%m-%d').date()
            elif '/' in commission_date:
                # Assuming DD/MM/YYYY
                parts = commission_date.split('/')
                if len(parts[2]) == 2:
                    dt = datetime.strptime(commission_date, '%d/%m/%y').date()
                else:
                    dt = datetime.strptime(commission_date, '%d/%m/%Y').date()
            else:
                return None
        except:
            return None
    elif isinstance(commission_date, (datetime, date)):
        dt = commission_date
        if isinstance(dt, datetime):
            dt = dt.date()
    else:
        return None
        
    years = get_warranty_years(brand, warranty_map)
    expiry_date = add_years(dt, years)
    
    return expiry_date

def get_inverter_warranty_expiry(brand, commission_date):
    """Specific helper for Inverters"""
    return calculate_warranty_expiry(brand, commission_date, INVERTER_WARRANTY_MAP)

def get_panel_warranty_expiry(brand, commission_date):
    """Specific helper for Panels"""
    return calculate_warranty_expiry(brand, commission_date, PANEL_WARRANTY_MAP)

if __name__ == "__main__":
    # Test cases
    test_cases = [
        ("Delta", "2020-01-01"),
        ("Waaree", "2020-01-01"),
        ("Microtech", "2022-05-15"),
        ("None", "2023-01-01")
    ]
    
    print("Testing Inverter Warranty:")
    for brand, d in test_cases:
        expiry = get_inverter_warranty_expiry(brand, d)
        print(f"  Brand: {brand:10} | Start: {d} | Expiry: {expiry}")
        
    print("\nTesting Panel Warranty:")
    for brand, d in test_cases:
        expiry = get_panel_warranty_expiry(brand, d)
        print(f"  Brand: {brand:10} | Start: {d} | Expiry: {expiry}")
