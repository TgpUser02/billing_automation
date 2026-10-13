# PDF & Document Storage Architecture

This document describes how all PDF documents, images, generated reports, and database backups are stored, indexed, and referenced in the **Arin Energy Billing Automation** system.

---

## 1. Storage Architecture Overview

The system uses a **Hybrid Cloud & Metadata Pointer Pattern**:
- **Binary Files** (PDFs, images, spreadsheets, `.sql.gz` backups) are **not** stored as binary BLOBs inside MySQL. Storing BLOBs directly in relational tables degrades query latency, balloons backup sizes, and complicates caching.
- Instead, files reside in two storage tiers:
  1. **Local Filesystem** (VPS SSD / local development disk) for high-speed download, batch processing, and extraction cache.
  2. **Google Drive Cloud Storage** for permanent, secure archival and instant web preview via public viewer URLs.
- **MySQL Database** stores:
  1. **Document pointers & cloud metadata** (local file paths, Google Drive File IDs, web preview links, download URLs).
  2. **Structured data extracted from PDFs** (consumer number, billing amounts, units, meter reading tables, 12-month historical consumption).
  3. **A centralized audit registry** of every file uploaded to the cloud.

```
                          ┌───────────────────────────┐
                          │    MSEDCL Portal / User   │
                          └─────────────┬─────────────┘
                                        │ (Download / Upload)
                                        ▼
                          ┌───────────────────────────┐
                          │   Local Disk Storage      │
                          │  /var/arin/YYYY-MM-DD/    │
                          └──────┬─────────────┬──────┘
             Extract Data (OCR)  │             │ Cloud Upload
                                 ▼             ▼
                     ┌──────────────────┐  ┌──────────────────┐
                     │  MySQL Database  │  │   Google Drive   │
                     │  (Data & URLs)   │◄─┤  (Permanent File │
                     │                  │  │     Storage)     │
                     └──────────────────┘  └──────────────────┘
```

---

## 2. Database Tables & Schema Structure

Three primary tables manage documents, PDFs, and their extracted data:

```
┌─────────────────────────────────┐       ┌──────────────────────────────┐
│           customers             │       │    drive_uploads_meta        │
│ ─────────────────────────────── │       │ ──────────────────────────── │
│ id (PK)                         │       │ id (PK)                      │
│ consumer_number (UNIQUE) ───────┼───┐   │ file_id (Google Drive ID)    │
│ arin_id                         │   │   │ file_name                    │
│ customer_name                   │   │   │ file_type (pdf, image, etc.) │
└─────────────────────────────────┘   │   │ view_url, download_url       │
                                      │   │ folder_id, folder_path       │
                                      │   │ consumer_number ─────────────┤ (Index)
                                      ▼   │ category (bill_pdf, report)  │
┌─────────────────────────────────────────┐└──────────────────────────────┘
│       bill_generation_details           │
│ ─────────────────────────────────────── │       ┌──────────────────────────────┐
│ id (PK)                                 │       │       db_backups_log         │
│ customer_id (FK -> customers.id)        │       │ ──────────────────────────── │
│ consumer_number (Indexed)               │       │ id (PK)                      │
│ month_year (Billing cycle)              │       │ backup_filename              │
│ ── Document Pointers ──                 │       │ file_path (Local path)       │
│ pdf_path (Local file path)              │       │ drive_file_id                │
│ pdf_drive_file_id (Drive File ID)       │       │ drive_view_url               │
│ pdf_drive_view_url (Web view link)      │       │ drive_sync_status            │
│ pdf_file_name (Stored filename)         │       └──────────────────────────────┘
│ image_url, image_drive_view_url         │
│ ── Extracted PDF Data ──                │
│ import_units, export_units, generation  │
│ meter_readings_json, past_year_history  │
└─────────────────────────────────────────┘
```

---

### Table 1: `bill_generation_details`

This is the **primary table** for all consumer electricity bill PDFs and meter photos. Each record represents a specific consumer's bill for a given month.

#### Document Storage Columns

| Column Name | SQL Type | Description |
|---|---|---|
| `pdf_path` | `TEXT NULL` | Absolute local filesystem path to the bill PDF on the server (e.g., `/var/arin/2026-05-29/410010744109_May_2026.pdf`). |
| `pdf_drive_file_id` | `VARCHAR(255) NULL` | Google Drive unique file ID (e.g., `1A2b3c4D5E6F...`). |
| `pdf_drive_view_url` | `TEXT NULL` | Full Google Drive preview link (`https://drive.google.com/file/d/<file_id>/view`). Used by frontend to preview bills. |
| `pdf_file_name` | `VARCHAR(255) NULL` | Normalized file name in Google Drive (e.g., `May_2026.pdf` or `410010744109_May_2026.pdf`). |
| `image_url` | `TEXT NULL` | URL or base link for meter photo / bill screenshot. |
| `image_drive_file_id`| `VARCHAR(255) NULL` | Google Drive unique file ID for the meter reading photo. |
| `image_drive_view_url`| `TEXT NULL` | Full Google Drive preview link for the meter image. |
| `image_file_name` | `VARCHAR(255) NULL` | File name for the meter image in Google Drive. |

#### Extracted Bill Data Columns (Extracted from the PDF)

| Column Name | SQL Type | Description |
|---|---|---|
| `customer_id` | `INT NULL` | Foreign key referencing `customers.id`. |
| `consumer_number` | `VARCHAR(50) NOT NULL` | 12-digit MSEDCL consumer number (Indexed). |
| `month_year` | `VARCHAR(20) NOT NULL` | Billing month/cycle identifier (e.g., `2026-05-01` or `2026-05-29`). |
| `bill_month` | `VARCHAR(50) NULL` | Formatted month string (e.g., `May 2026`). |
| `billing_date` | `DATE NULL` | Bill issuance date (देयक दिनांक). |
| `reading_date` | `DATE NULL` | Meter reading date (वाचन दिनांक). |
| `import_units` | `DECIMAL(10,2)` | Electricity imported from the grid (kWh). |
| `export_units` | `DECIMAL(10,2)` | Solar energy exported to the grid (kWh). |
| `generation_units` | `DECIMAL(10,2)` | Total solar generation units recorded. |
| `billing_amount` | `DECIMAL(10,2)` | Final bill payable amount (₹). |
| `billing_units` | `DECIMAL(10,2)` | Net billable units consumed. |
| `day_consumption` | `DECIMAL(10,2)` | Day-time consumption units. |
| `total_consumption`| `DECIMAL(10,2)` | Total electricity consumption units. |
| `prev_bank_units` | `DECIMAL(10,2)` | Previous banked solar units balance. |
| `bank_solar_units` | `DECIMAL(10,2)` | Current banked solar units balance. |
| `net_billed_units` | `DECIMAL(10,2)` | Net billed units after solar credit adjustment. |
| `solar_capacity` | `DECIMAL(10,2)` | Contracted/installed solar capacity in kW. |
| `system_health` | `VARCHAR(50)` | System diagnostic status (`GOOD`, `LOW_GEN`, `ZERO_GEN`). |
| `bill_status` | `VARCHAR(50)` | Operational status (`Normal`, `Zero Generation`, `No Generation`). |
| `meter_readings_json`| `TEXT NULL` | Raw JSON string of complete meter readings extracted from PDF tables (TOD zones, peak/off-peak, maximum demand). |
| `past_year_history_json`| `TEXT NULL`| Raw JSON string of past 12-month consumption/generation extracted from PDF history table. |
| `created_at` | `TIMESTAMP` | Record creation timestamp. |
| `updated_at` | `TIMESTAMP` | Record last modification timestamp. |

#### Constraints & Indexes
```sql
UNIQUE KEY unique_consumer_month (consumer_number, month_year),
INDEX idx_bill_consumer (consumer_number),
INDEX idx_bill_month (month_year)
```

---

### Table 2: `drive_uploads_meta`

This is the **centralized audit log and lookup registry** for **all files** uploaded to Google Drive. It records bill PDFs, meter photos, exported system reports (PDF, XLSX, CSV), and AI solar proposals.

#### Table Definition

```sql
CREATE TABLE IF NOT EXISTS drive_uploads_meta (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_id VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) DEFAULT 'file',
    file_size BIGINT DEFAULT 0,
    mime_type VARCHAR(150),
    folder_id VARCHAR(255),
    folder_path VARCHAR(500),
    view_url TEXT,
    download_url TEXT,
    consumer_number VARCHAR(100),
    month_year VARCHAR(50),
    category VARCHAR(100) DEFAULT 'general',
    uploaded_by VARCHAR(100) DEFAULT 'system',
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_file_id (file_id),
    INDEX idx_consumer (consumer_number),
    INDEX idx_month_year (month_year),
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### Field Explanations

| Column | Description | Example Values |
|---|---|---|
| `file_id` | Google Drive unique file identifier | `1AbCdEfGhIjKlMnOpQrStUvWxYz` |
| `file_name` | Name of the file stored in Google Drive | `410010744109_May_2026.pdf`, `Zero_Gen_2026-05-29.xlsx` |
| `file_type` | Categorical classification | `'pdf'`, `'image'`, `'file'` |
| `file_size` | Size of the file in bytes | `348210` (approx 340 KB) |
| `mime_type` | Standard MIME type | `application/pdf`, `image/png`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `folder_id` | Google Drive ID of the parent folder | `1ZyxWvUtSrQpOnMlKj` |
| `folder_path` | Human-readable path representation | `Bill_Generation1/410010744109/` or `billing_automation/Report/29 May 2026/` |
| `view_url` | Direct preview link for browsers | `https://drive.google.com/file/d/1AbCdEf.../view` |
| `download_url` | Direct download endpoint | `https://drive.google.com/uc?id=1AbCdEf...` |
| `consumer_number` | Linked consumer number (if consumer-specific) | `410010744109` or `NULL` for generic reports |
| `month_year` | Linked billing cycle | `2026-05-01` |
| `category` | Functional tag | `'bill_pdf'`, `'bill_image'`, `'report_pdf'`, `'report_excel'`, `'general'` |
| `uploaded_by` | Who triggered the upload | `'system'`, `'admin'`, or username |
| `uploaded_at` | Upload timestamp | `2026-05-29 14:32:05` |

---

### Table 3: `db_backups_log`

Tracks database dumps (`.sql.gz`) generated locally and backed up to Google Drive.

```sql
CREATE TABLE IF NOT EXISTS db_backups_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    backup_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    file_size_display VARCHAR(50) DEFAULT '0 KB',
    backup_type VARCHAR(50) DEFAULT 'manual',
    status VARCHAR(50) DEFAULT 'completed',
    drive_file_id VARCHAR(255),
    drive_view_url TEXT,
    drive_download_url TEXT,
    drive_sync_status VARCHAR(50) DEFAULT 'pending',
    table_count INT DEFAULT 0,
    created_by VARCHAR(100) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created_at (created_at),
    INDEX idx_backup_type (backup_type),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 3. Physical Storage Structure

### A. Local Filesystem Layout

On VPS production, storage is rooted at `ARIN_STORAGE_PATH` (defaults to `/var/arin` or `./downloads` in local dev):

```
/var/arin/ (or ./downloads/)
├── 2026-05-29/                                  <-- Daily batch bill folder
│   ├── 410010744101_May_2026.pdf                <-- Downloaded & renamed PDF
│   ├── 410010744102_May_2026.pdf
│   ├── _tmp_410010744103.pdf                    <-- In-progress burst download
│   └── extracted_cache.json                     <-- Fast UI progress cache
│
├── Report/                                      <-- Generated batch reports
│   └── 29 May 2026/
│       ├── Normal_Bills_20260529_110000.pdf
│       ├── Zero_Generation_20260529_110000.xlsx
│       ├── Generation_Mismatch_20260529_110000.csv
│       └── Export_Analysis_20260529_110000.pdf
│
└── backups/                                     <-- Database backup dumps
    ├── db_backup_2026-05-28_020000.sql.gz
    └── db_backup_2026-05-29_020000.sql.gz
```

### B. Google Drive Cloud Hierarchy

Files uploaded to Google Drive adhere to this folder organization:

```
📁 Root Folder (GOOGLE_DRIVE_FOLDER_ID)
│
├── 📁 Bill_Generation1                         <-- Consumer bill repository
│   ├── 📁 410010744101/                         <-- Consumer folder (Consumer Number)
│   │   ├── 📄 May_2026.pdf                     <-- Monthly Bill PDF
│   │   ├── 📄 Jun_2026.pdf
│   │   └── 🖼️ May_2026.png                     <-- Meter photo / screenshot
│   ├── 📁 410010744102/
│   │   └── 📄 May_2026.pdf
│   └── ...
│
└── 📁 billing_automation                        <-- Automation artifacts
    └── 📁 Report                                <-- Generated operational reports
        ├── 📁 29 May 2026/
        │   ├── 📄 Zero_Generation_Report.pdf
        │   └── 📊 Normal_Bills_Report.xlsx
        └── 📁 30 May 2026/
            └── ...
```

> **Public Sharing**: When a PDF or image is uploaded via `upload_file_to_drive()`, Google Drive API automatically grants `reader` permission to `anyoneWithLink`. This allows the React dashboard to stream and preview PDFs via `pdf_drive_view_url` without requiring end-user Google authentication.

---

## 4. End-to-End Processing & Storage Workflow

### 1. Automated Bill Download Loop
1. **Automation Worker** (`backend/automation.py`):
   - Opens MSEDCL WSS Portal using headless Chrome & CDP sessions.
   - Downloads PDF to `/var/arin/<Date>/_tmp_<consumer>.pdf`.
2. **Text & Data Extraction** (`backend/processing.py`):
   - `pdfplumber` parses Marathi & English glyphs, extracting consumer info, meter readings, solar units, and billing amounts.
   - The file is renamed to `/var/arin/<Date>/<consumer_no>_<Month>_<Year>.pdf`.
3. **Database Persistence** (`backend/processing.py:store_bill_data_in_mysql`):
   - Upserts record in `bill_generation_details` with extracted metrics and sets `pdf_path`.
4. **Cloud Upload** (`backend/gdrive_utils.py:upload_file_to_drive`):
   - Uploads PDF to `Bill_Generation1/<consumer_no>/<Month>_<Year>.pdf`.
   - Updates `bill_generation_details` with `pdf_drive_file_id`, `pdf_drive_view_url`, and `pdf_file_name`.
   - Inserts audit record into `drive_uploads_meta` with `category='bill_pdf'`.

### 2. Manual Bill Upload & OCR Endpoint (`/api/analyze-bill-ocr`)
1. User uploads a PDF or image through the web interface.
2. Direct parser / Tesseract OCR / Gemini AI parses bill contents into JSON.
3. File is pushed to Google Drive and recorded in `drive_uploads_meta`.
4. If customer exists, `bill_generation_details` is populated with both extracted values and Drive links.

### 3. Report Generation (`/api/save-reports`)
1. User triggers report export (Normal Bills, Zero Gen, Mismatch).
2. Report is compiled into `.xlsx`, `.pdf` (via `FPDF`), or `.csv`.
3. Saved locally under `/var/arin/Report/<Formatted Date>/`.
4. Uploaded to Google Drive under `billing_automation/Report/<Formatted Date>/`.
5. Audit row added to `drive_uploads_meta` (`category='report_pdf'` or `'report_excel'`).

---

## 5. Common Database Queries

### A. Retrieve All Bills and Drive PDF Links for a Consumer
```sql
SELECT 
    b.consumer_number,
    c.customer_name,
    b.month_year,
    b.billing_amount,
    b.generation_units,
    b.export_units,
    b.pdf_file_name,
    b.pdf_drive_view_url,
    b.image_drive_view_url
FROM bill_generation_details b
LEFT JOIN customers c ON b.consumer_number = c.consumer_number
WHERE b.consumer_number = '410010744109'
ORDER BY b.month_year DESC;
```

### B. Find Bills That Have Not Yet Synced to Google Drive
```sql
SELECT 
    consumer_number, 
    month_year, 
    pdf_path, 
    created_at
FROM bill_generation_details
WHERE (pdf_drive_file_id IS NULL OR pdf_drive_file_id = '')
  AND pdf_path IS NOT NULL;
```

### C. List All Uploaded PDF Reports in a Given Date Range
```sql
SELECT 
    file_name, 
    file_size, 
    view_url, 
    download_url, 
    category, 
    uploaded_at
FROM drive_uploads_meta
WHERE category IN ('report_pdf', 'report_excel')
  AND uploaded_at >= '2026-05-01'
ORDER BY uploaded_at DESC;
```

### D. Inspect Extracted Meter Readings (Stored as JSON in PDF Row)
```sql
SELECT 
    consumer_number, 
    month_year, 
    meter_readings_json
FROM bill_generation_details
WHERE consumer_number = '410010744109'
  AND month_year = '2026-05-01';
```
