# ☀️ Arin Energy Billing Automation Software
## Complete Requirements Fulfillment & Feature Architecture Documentation

---

## 📌 Executive Summary

This document provides a comprehensive technical breakdown of all implemented features, requirement fulfillments, bug fixes, database schema enhancements, cross-platform VPS setup, and the newly integrated **Arin Energy AI Bill Analyzers** standalone engine with Gemini 1.5 Flash Multimodal Vision capabilities.

---

## 🛠 1. How `http://localhost:5173/quick-analysis` Works

The **Arin Energy AI Bill Analyzer** (`/quick-analysis`) is a standalone intelligence module designed for both **Sales Prospecting (Non-Solar Bills)** and **Solar Client Plant Performance Diagnostics (Solar Bills)**.

```
                   ┌─────────────────────────────────────────┐
                   │    Uploaded Utility Bill (PDF/Image)    │
                   └────────────────────┬────────────────────┘
                                        │
                                        ▼
                   ┌─────────────────────────────────────────┐
                   │  Gemini 1.5 Flash AI Vision / VPS OCR   │
                   │  (main.py / analyze-bill-ocr)           │
                   └────────────────────┬────────────────────┘
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 ▼                                             ▼
  ┌───────────────────────────────┐           ┌───────────────────────────────┐
  │ 1. Non-Solar Prospective Bill │           │ 2. Solar Client OCR + Weather │
  │    (Sales ROI Engine)         │           │    (Open-Meteo Weather AI)    │
  └──────────────┬────────────────┘           └──────────────┬────────────────┘
                 │                                           │
                 ▼                                           ▼
  ┌───────────────────────────────┐           ┌───────────────────────────────┐
  │ - Recommended Solar Capacity  │           │ - Extracted Gen/Imp/Exp kWh   │
  │ - Live Recalculating Slider   │           │ - Banked Units & Health Status│
  │ - 25-Year Tariff Inflation ROI│           │ - Historical Solar Irradiance │
  │ - Carbon & Tree Offsets       │           │ - Weather Performance Score   │
  └──────────────┬────────────────┘           └──────────────┬────────────────┘
                 │                                           │
                 └──────────────────────┬────────────────────┘
                                        │
                                        ▼
                   ┌─────────────────────────────────────────┐
                   │ Arin Energy Branded Report Generator    │
                   │ (BillPreview.tsx / QuickBillAnalysis)   │
                   └────────────────────┬────────────────────┘
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 ▼                                             ▼
  ┌───────────────────────────────┐           ┌───────────────────────────────┐
  │ 🖼 Export PNG Image           │           │ 📄 Export 2-Page PDF          │
  │   (Single-click 1000px PNG)   │           │   (Page 1: Proposal / Report  │
  │                               │           │    Page 2: Original Bill)     │
  └───────────────────────────────┘           └───────────────────────────────┘
```

---

### 💡 Detailed Dual-Tab Workflow

#### **Tab 1: Prospective Client Savings Tool (Sales Engine)**
* **Input**: Standard electricity bill (MSEDCL, Torrent Power, Adani Electricity, Tata Power, etc.) for non-solar prospects.
* **Extraction**: Automatically extracts Consumer Name, Consumer Number, Current Monthly Billing Amount ($\text{₹}$), and Billing Units ($\text{kWh}$).
* **AI Financial Model**:
  - **Proposed System Size**: Recommends optimal solar capacity ($kW$) calculated from monthly unit usage.
  - **Interactive Live Recalculating Slider**: Sales representatives can adjust proposed capacity ($1\text{ kW} - 50\text{ kW}$). Every financial figure (Estimated Bill With Solar, Monthly Savings, Annual Savings, 25-Year Lifetime Savings, Payback Years, CO₂ Offset, and Trees Planted) recalculates dynamically in real-time!
  - **Comparative Financial Grid**:
    - **Current Monthly Bill**: Without solar grid.
    - **Estimated Bill With Solar**: Reduced to fixed grid charges (~90% savings).
    - **Annual Net Savings**: Computed monthly and annually.
    - **25-Year Lifetime Savings**: Modeled with a compound 3% annual grid tariff escalation.
    - **Payback Period**: Estimated ROI payback timeline (typically 3.2 – 3.8 years).
    - **Environmental Impact**: CO₂ carbon offset ($\text{kg/yr}$) and equivalent trees planted.
* **Export Proposal**:
  - **Export Proposal Image (`.png`)**: Single-click 1000px branded PNG proposal report card.
  - **Export Proposal PDF (`.pdf`)**: 2-Page PDF proposal with Page 1 containing the branded proposal card and Page 2 embedding the attached utility bill.

#### **Tab 2: Solar Client Bill OCR & Historical Weather AI**
* **Input**: Uploaded solar net-metering bill or image.
* **OCR & AI Text Extraction**:
  - MSEDCL Consumer Number (12 digits) & Consumer Name
  - Reading Date & Sanctioned Load ($kW$)
  - Generated Electricity ($kWh$)
  - Exported to Grid ($kWh$) & Imported from Grid ($kWh$)
  - Daytime Self-Consumption ($kWh = \text{Generated} - \text{Exported}$)
  - Total Household Consumption ($kWh = \text{Self Consumption} + \text{Imported}$)
  - Billing Amount ($\text{₹}$) & Billing Units
  - Previous & Current Banked Units
  - System Health Badge (`GOOD` / `NORMAL`)
* **Open-Meteo Historical Weather AI**:
  - Queries Open-Meteo Historical Archive API for the past 30 days based on site coordinates.
  - Computes average daily solar shortwave radiation ($\text{kWh/m}^2/\text{day}$) and cloud cover mean ($\%$).
  - Assigns an **AI Performance Score** (`96%` Clear Sunny, `88%` Partly Cloudy, `75%` Overcast) to explain why solar generation varied in that billing cycle.
* **Export Engine**:
  - **🖼 Export Image (`.png`)**: Generates a high-resolution 1200px PNG image of the report card.
  - **📄 Export PDF with Attached Bill (`.pdf`)**: 2-Page PDF document with report card on Page 1 and attached original bill image on Page 2.

---

## 📋 2. Complete Requirements Fulfillment Matrix

| # | Requirement Category | Expected Behavior | Delivered Implementation & Status | Verification |
|---|---|---|---|---|
| **1** | **Excel Import Data Integrity** | Preserve exact raw Arin IDs with special characters (`#`, `$`, etc.). Take Commission Date strictly from Excel without defaulting to today's date. | Parsed `arin_id` as raw string supporting `#`, `$`, `@`. Strict date parsing for `commission_date` with validation errors on invalid values. | **VERIFIED** ([`test_all_requirements.py`](file:///Users/threeprenur/Desktop/TGP/billing_automation/backend/test_all_requirements.py)) |
| **2** | **Database Overwrite Safeguard** | Uploading records with blank/zero capacity columns must **not** overwrite existing non-zero capacities with `0 kW`. | Filtered `0` and `None` from capacity metrics in MySQL update queries when updating existing consumer records. | **VERIFIED** ([`main.py`](file:///Users/threeprenur/Desktop/TGP/billing_automation/backend/main.py#L2240-L2248)) |
| **3** | **Decimal Capacity Auto-Calc** | Auto-calculate total capacity ($8 \times 545\text{ Wp} = 4.36\text{ kW}$) and store precise decimals in MySQL. | Altered DB schema columns (`solar_capacity_kw`, `panel_capacity_kw`, `inverter_capacity`) to `DECIMAL(10,2)`. System computes $4.36\text{ kW}$ automatically. | **VERIFIED** (MySQL `DECIMAL(10,2)`) |
| **4** | **Sample CSV Template Completeness** | Sample downloadable CSV must contain all 33 database fields. | Updated `downloadSampleCSV()` in `ConsumerConnect.tsx` to include all 33 customer schema fields. | **VERIFIED** ([`ConsumerConnect.tsx`](file:///Users/threeprenur/Desktop/TGP/billing_automation/src/pages/ConsumerConnect.tsx#L550-L625)) |
| **5** | **Warranty Master & Effective Dates** | Add Panel/Inverter make & warranty years with `effective_from` dates in Admin Panel. Warranty changes apply only to future sites. | Created `warranties_master` table, Admin UI manager, and auto-expiry date calculation logic based on `effective_from` dates. | **VERIFIED** ([`AdminWarrantiesManager.tsx`](file:///Users/threeprenur/Desktop/TGP/billing_automation/src/components/AdminWarrantiesManager.tsx)) |
| **6** | **Subscription Extension Modal** | Extension modal accessible in Admin and Accountant views with mandatory payment fields (amount, date, time, mode, UTR no, default 3 years). | Built `SubscriptionExtendModal.tsx` and backend `/api/subscriptions/extend` with global feature toggle `subscription_enabled`. | **VERIFIED** ([`SubscriptionExtendModal.tsx`](file:///Users/threeprenur/Desktop/TGP/billing_automation/src/components/SubscriptionExtendModal.tsx)) |
| **7** | **Bill Generation Image Layout** | Heading `"Arin Energy AI Solar Bill Analysis – Month – Year"`, `"AI Verified System Health"`, Consumer No. below Reading Date, Subscription End Date under Warranty section. | Updated `BillPreview.tsx` to reflect exact design layout matching reference specification screenshots. | **VERIFIED** ([`BillPreview.tsx`](file:///Users/threeprenur/Desktop/TGP/billing_automation/src/components/BillPreview.tsx)) |
| **8** | **Single MySQL Source of Truth** | Remove PHP database dependency and backend sync. Connect direct to MySQL `Arin_Energy`. | Removed PHP database sync; updated backend to read/write directly to MySQL `Arin_Energy`. | **VERIFIED** ([`processing.py`](file:///Users/threeprenur/Desktop/TGP/billing_automation/backend/processing.py)) |
| **9** | **Google Drive URL SQL Persistence** | Fix Google Drive image upload Base64 decoding and save Drive file IDs and view URLs in MySQL. | Updated `upload_base64_image_to_drive` in `gdrive_utils.py` to strip data URI headers and handle padding; saved `pdf_drive_view_url` & `image_drive_view_url` to SQL. | **VERIFIED** ([`gdrive_utils.py`](file:///Users/threeprenur/Desktop/TGP/billing_automation/backend/gdrive_utils.py)) |
| **10**| **Dropdown Brands Expansion** | Include required panel brands, panel types, and inverter brands in Add/Edit Consumer dropdowns. | Added `Adani`, `Novasys`, `Waaree`, `ECE`, `Tata`, `Paha`, `Awada`, `Vikram`, `Gautam`, `Asot`, `Rayzon`, `premier`, `ikon`, `Topcon`, `Bifacial`, `Solaryaan`, `Cathod power`, `Solaryaan Microinverter`, `Vsole`, `Goodwe`, `Okaya`, `Xwatt`, `Polycab`, `UTL`, `Havells`, `Growatt`, `Solax`, `solis`. | **VERIFIED** ([`ConsumerConnect.tsx`](file:///Users/threeprenur/Desktop/TGP/billing_automation/src/pages/ConsumerConnect.tsx)) |
| **11**| **Dynamic Available Data Report** | Show available data only on standalone bill report without displaying empty `N/A` warranty slots. | Updated `BillPreview.tsx` to conditionally render Warranty Info when warranty data exists, or Solar Yield & Weather AI Projections when warranty data is absent. | **VERIFIED** ([`BillPreview.tsx`](file:///Users/threeprenur/Desktop/TGP/billing_automation/src/components/BillPreview.tsx#L405-L480)) |
| **12**| **Cross-Platform Linux VPS OCR** | Enable zero OS-level binary dependencies for Linux VPS deployment. | Integrated Gemini 1.5 Flash Multimodal AI Vision API (`extract_bill_with_ai`) with `pdfplumber` + `pytesseract` fallback. | **VERIFIED** ([`main.py`](file:///Users/threeprenur/Desktop/TGP/billing_automation/backend/main.py#L1282-L1350)) |

---

## 📁 3. Key Modified Files & Architecture

### Backend Files
- 📄 [`backend/main.py`](file:///Users/threeprenur/Desktop/TGP/billing_automation/backend/main.py): Database migrations, direct Excel import parser, `/api/analyze-bill-ocr`, `/api/analyze-prospective-bill`, `/api/save-bill-images`, `/api/save-reports`, Warranties Master API, and Subscription extension API.
- 📄 [`backend/processing.py`](file:///Users/threeprenur/Desktop/TGP/billing_automation/backend/processing.py): Direct MySQL `Arin_Energy` connection handler, customer schema definitions, and bill generation SQL operations.
- 📄 [`backend/gdrive_utils.py`](file:///Users/threeprenur/Desktop/TGP/billing_automation/backend/gdrive_utils.py): Google Drive Base64 data URI header stripping, missing padding completion, drive upload helpers, and diagnostic error handling.
- 📄 [`backend/test_all_requirements.py`](file:///Users/threeprenur/Desktop/TGP/billing_automation/backend/test_all_requirements.py): Comprehensive automated test suite running against MySQL database.

### Frontend Files
- 📄 [`src/pages/QuickBillAnalysis.tsx`](file:///Users/threeprenur/Desktop/TGP/billing_automation/src/pages/QuickBillAnalysis.tsx): Dual-tab standalone AI Bill Analyzer UI (Sales Prospective ROI & Solar Client Weather OCR) with PNG image and 2-page PDF export engines.
- 📄 [`src/components/BillPreview.tsx`](file:///Users/threeprenur/Desktop/TGP/billing_automation/src/components/BillPreview.tsx): Branded Arin Energy AI Bill Analysis report visualizer component with dynamic available content handling.
- 📄 [`src/pages/ConsumerConnect.tsx`](file:///Users/threeprenur/Desktop/TGP/billing_automation/src/pages/ConsumerConnect.tsx): Add/Edit Consumer forms with live warranty expiry auto-calculation, expanded dropdown lists, capacity decimal auto-calc, and 33-column sample CSV generator.
- 📄 [`src/components/AdminWarrantiesManager.tsx`](file:///Users/threeprenur/Desktop/TGP/billing_automation/src/components/AdminWarrantiesManager.tsx): Admin Panel interface for setting equipment warranty years and `effective_from` dates.
- 📄 [`src/components/SubscriptionExtendModal.tsx`](file:///Users/threeprenur/Desktop/TGP/billing_automation/src/components/SubscriptionExtendModal.tsx): Subscription extension modal with mandatory payment fields and 3-year extension calculation.

---

## 🔑 4. Google Drive OAuth Token Generation Guide

If you need to generate a new Google Drive OAuth Refresh Token for image uploads:

### **Step 1: Open Authorization URL in Browser**
Visit the following Google OAuth URL:
```text
https://accounts.google.com/o/oauth2/v2/auth?client_id=57647831301-slmprltdearnsftettb4isjg2pnn0u3g.apps.googleusercontent.com&redirect_uri=http://localhost:5000/api/drive/callback&response_type=code&scope=https://www.googleapis.com/auth/drive.file&access_type=offline&prompt=consent
```

### **Step 2: Authenticate & Authorize**
1. Sign in with your Google Account that owns the Google Drive folder (`1JVDN8rf6QRYMtGke03S_sW6glNSY5kGO`).
2. Click **Allow / Continue** to grant Drive access.
3. Upon authorization, Google will redirect to `http://localhost:5000/api/drive/callback?code=YOUR_AUTHORIZATION_CODE`.

### **Step 3: Exchange Authorization Code for Refresh Token**
Run the following curl command in terminal:
```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d "client_id=YOUR_GOOGLE_DRIVE_CLIENT_ID" \
  -d "client_secret=YOUR_GOOGLE_DRIVE_CLIENT_SECRET" \
  -d "code=YOUR_AUTHORIZATION_CODE" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=http://localhost:5000/api/drive/callback"
```

### **Step 4: Update `.env` File**
Copy the generated `"refresh_token"` and paste it into `.env`:
```env
GOOGLE_DRIVE_REFRESH_TOKEN='YOUR_GENERATED_REFRESH_TOKEN'
```

---

## 🧪 5. Automated Verification Commands

To run the complete automated requirement test suite:
```bash
backend/.venv/bin/python backend/test_all_requirements.py
```

To build the frontend bundle for production verification:
```bash
npm run build
```

---
*Documentation compiled for Arin Energy Billing Automation Software.*
