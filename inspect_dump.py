from bs4 import BeautifulSoup

with open("post_login_dump.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")
table = soup.find("table", {"id": "grdCustList"})

if table:
    print("Table found!")
    rows = table.find_all("tr")
    if len(rows) > 1:
        row = rows[1]
        cols = row.find_all(["th", "td"])
        print(f"Row 1 len={len(cols)}:")
        for j, col in enumerate(cols):
             print(f"  Col {j}: {repr(col.get_text(strip=True))}")
else:
    print("Table not found.")
