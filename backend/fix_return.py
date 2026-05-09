import re

with open('automation.py', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Fix the corrupted return line - use a flexible regex to match whatever is there
fixed = re.sub(
    r'return True, f[^\n]+Drive[^\n]*\n',
    'return True, f"[{self.port}] Finished. Uploaded {downloaded}/{real_count} bills to Drive."\n',
    content
)

with open('automation.py', 'w', encoding='utf-8') as f:
    f.write(fixed)

print("Done. Verifying syntax...")
import ast, sys
try:
    ast.parse(fixed)
    print("syntax OK")
except SyntaxError as e:
    print(f"SyntaxError: {e}")
    sys.exit(1)
