from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import time

options = Options()
options.add_argument("--headless")
options.add_argument("--disable-gpu")
service = Service(ChromeDriverManager().install())
driver = webdriver.Chrome(service=service, options=options)
driver.set_window_size(1400, 900)
driver.get("https://example.com")
try:
    driver.execute_cdp_cmd('Input.dispatchMouseEvent', {
        'type': 'mousePressed',
        'x': 100,
        'y': 100,
        'button': 'left',
        'clickCount': 1
    })
    print("Success CDP")
except Exception as e:
    print("Failed CDP:", e)
driver.quit()
