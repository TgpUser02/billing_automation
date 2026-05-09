import re
from datetime import datetime

def test_extraction(text):
    trans_table = str.maketrans("०१२३४५६७८९", "0123456789")
    text_trans = text.translate(trans_table)
    
    print(f"Text Trans Snippet: {text_trans[-200:]}")
    
    # Existing regex from processing.py
    rd_match_old = re.search(r"(?:Reading|Current|वाचन|रीडिंग|रिडींग|रिडिंग|मीटर\s*वाचन|चालू?\s*रिडी?ं?ंग)\s*(?:Date|दिनांक)?\s*[:\-]*\s*(\d{2}[-/]\d{2}[-/]\d{4})", text_trans, re.IGNORECASE)
    
    if rd_match_old:
        print(f"Old Regex Match: {rd_match_old.group(0)}")
        print(f"Extracted Date: {rd_match_old.group(1)}")
    else:
        print("Old Regex Failed")
        
    # Secondary generic match from processing.py
    if not rd_match_old:
        rd_match_secondary = re.search(r"(?:दिनांक|Date|चालू?\s*रिडी?ं?ंग\s*दिनांक)\s*[:\-]*\s*(\d{2}[-/]\d{2}[-/]\d{4})", text_trans, re.IGNORECASE)
        if rd_match_secondary:
            print(f"Secondary Regex Match: {rd_match_secondary.group(0)}")
            print(f"Extracted Date: {rd_match_secondary.group(1)}")
        else:
            print("Secondary Regex Failed")

# Sample text based on the image
sample_text = """
BILL NO.(GGN): 000003277901763
ग्राहक क्रमांक : 410012512051 मोबाईल/ईमेल :76xxxxxx58 SOLAR NET METER (5.00KW) 
KRUSHNAMURTI MAHADEORAO AMBADWAR 
PLOT NO.34;SUYOG NAGAR NEAR NERANDRA NAGAR NAGPUR 440015 

बीलींग युनिट : 4684/MANEWADA S/DN./NAGPUR MAHAL SOLAR AGREEMENT DATE : 02-07-2020 
दर संकेत ** : 90/LT I Res 1-Phase पुरवठा दिनांक : 27-03-1986 
पोल क्रमांक : SN-16 मंजुर भार : 5.00 KW 
पी. सी./चक्र+मार्ग-क्रम/डि.टी.सी. :4/27/7362/1314/4684351 सुरक्षा ठेव जमा (रु) : 5471.20 
चालू रिडिंग दिनांक : 20-03-2026 
"""

test_extraction(sample_text)
