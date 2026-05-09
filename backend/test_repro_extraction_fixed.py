import re
from datetime import datetime

def test_extraction_fixed(text):
    trans_table = str.maketrans("०१२३४५६७८९", "0123456789")
    text_trans = text.translate(trans_table)
    
    data = {"reading_date": None}
    
    # NEW LOGIC from processing.py
    # Step 1: Highly specific match
    rd_match = re.search(r"(?:Reading|Current|वाचन|रीडिंग|रिडींग|रिडिंग|मीटर\s*वाचन|चालू?\s*[रर][ीि]ड[ीि]?ं?ंग)\s*(?:Date|दिनांक)?\s*[:\-]*\s*(\d{2}[-/]\d{2}[-/]\d{4})", text_trans, re.IGNORECASE)
    
    if not rd_match:
        print("Step 1 failed, trying Step 2...")
        # Step 2: More flexible match but EXPLICTLY skip Agreement/Commission dates
        for m in re.finditer(r"(\d{2}[-/]\d{2}[-/]\d{4})", text_trans):
            d_str = m.group(1)
            start_idx = m.start()
            context = text_trans[max(0, start_idx-40):start_idx].upper()
            
            print(f"Checking date: {d_str}, Context: '{context.strip()}'")
            
            if any(x in context for x in ["AGREEMENT", "COMMISSION", "PURVATHA", "पुरवठा", "मंजूर"]):
                print(f"Skipping {d_str} due to bad keyword in context")
                continue
            
            if any(x in context for x in ["DATE", "दिनांक", "तारीख", "READING", "CURRENT", "चालू", "रीडिंग", "रिडिंग"]):
                print(f"Accepted {d_str} as reading date")
                raw_rd = d_str.replace("/", "-")
                try:
                    data["reading_date"] = datetime.strptime(raw_rd, "%d-%m-%Y").strftime("%Y-%m-%d")
                    break 
                except: pass
    
    if rd_match:
        print(f"Step 1 Matched: {rd_match.group(0)}")
        raw_rd = rd_match.group(1).replace("/", "-")
        data["reading_date"] = datetime.strptime(raw_rd, "%d-%m-%Y").strftime("%Y-%m-%d")

    print(f"FINAL RESULT: {data['reading_date']}")

# Sample text with Agreement date BEFORE reading date
sample_text = """
BILL NO.(GGN): 000003277901763
बीलींग युनिट : 4684/MANEWADA S/DN./NAGPUR MAHAL SOLAR AGREEMENT DATE : 02-07-2020 
दर संकेत ** : 90/LT I Res 1-Phase पुरवठा दिनांक : 27-03-1986 
पोल क्रमांक : SN-16 मंजुर भार : 5.00 KW 
चालू रिडिंग दिनांक : 20-03-2026 
"""

test_extraction_fixed(sample_text)
