import re
from datetime import datetime

def test_extraction_mojibake(text):
    trans_table = str.maketrans("०१२३४५६७८९", "0123456789")
    text_trans = text.translate(trans_table)
    
    data = {"reading_date": None}
    
    # LOGIC from updated processing.py
    # Step 1: Highly specific match (with Mojibake)
    rd_match = re.search(r"(?:Reading|Current|वाचन|रीडिंग|रिडींग|रिडिंग|मीटर\s*वाचन|चालू?\s*[रर][ीि]ड[ीि]?ं?ंग|°îîÑîõ|ïÏï¸ëë¬î)\s*(?:Date|दिनांक|तारीख|ï¿Æîîë´ø|ï¿Æîë´ø)?\s*[:\-]*\s*(\d{2}[-/]\d{2}[-/]\d{4})", text_trans, re.IGNORECASE)
    
    if not rd_match:
        # Step 2: More flexible fallback match
        for m in re.finditer(r"(\d{2}[-/]\d{2}[-/]\d{4})", text_trans):
            d_str = m.group(1)
            start_idx = m.start()
            context = text_trans[max(0, start_idx-50):start_idx].upper()
            
            if any(x in context for x in ["AGREEMENT", "COMMISSION", "PURVATHA", "पुरवठा", "मंजूर", "SUPPLY"]):
                continue
            
            if any(x in context for x in ["DATE", "दिनांक", "तारीख", "READING", "CURRENT", "चालू", "रीडिंग", "रिडिंग", "BILL", "ï¿Æîîë´ø", "ï¿Æîë´ø", "°îîÑîõ", "ïÏï¸ëë¬î"]):
                raw_rd = d_str.replace("/", "-")
                try:
                    data["reading_date"] = datetime.strptime(raw_rd, "%d-%m-%Y").strftime("%Y-%m-%d")
                    if any(r in context for r in ["READING", "CURRENT", "चालू", "रीडिंग", "रिडिंग", "°îîÑîõ", "ïÏï¸ëë¬î"]):
                        break 
                except: pass
    
    if rd_match:
        raw_rd = rd_match.group(1).replace("/", "-")
        data["reading_date"] = datetime.strptime(raw_rd, "%d-%m-%Y").strftime("%Y-%m-%d")

    print(f"RESULT: {data['reading_date']}")

# Sample text from the garbled PDF dump
sample_text = """
SOLAR AGREEMENT DATE : 31-10-2025
ïÉîÑîóë¬î ÌîõïÆî¶ :4685/TULSHIBAG S/DN./NAGPUR MAHAL ÇîõÏÒî·þî ï¿Æîîë´ø : 25-07-2015
¿Ï Öîë´úø»î ** :92/LT I Res 3-Phase Ëîëë²îõÏ ÊîîÏ : 14.00 KW
ÇîîúÑî ´èøËîîëë´ø : FEEDER ÖîõÏàîî ·úøÒî ²îËîî (Ïâ) : 14000.00
Çîó.þÖîó./°î´èø+Ëîî¬îì-´èøËî/ï¸.¶þó.Öîó. :1/01/1222/2440/4685291 °îîÑîõ ïÏï¸ëë¬î ï¿Æîîë´ø : 20-03-2026
"""

test_extraction_mojibake(sample_text)
