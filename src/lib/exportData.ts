export function exportToCSV(data: any[], filename: string = "consumer_data") {
  if (!data || data.length === 0) return;

  // Check if we are exporting profiles or billing records
  const isProfile = 'customer_name' in data[0] || 'consumer_number' in data[0];

  let headers: string[];
  let rows: any[][];

  if (isProfile) {
    headers = [
      "S.No",
      "Arin ID",
      "Customer Name",
      "Consumer Number",
      "Zone",
      "Capacity (kW)",
      "Inverter Name",
      "Inverter Capacity (kW)",
      "Commission Date",
      "WiFi Available",
      "Status"
    ];
    rows = data.map((item, index) => [
      index + 1,
      item.arin_id || "N/A",
      item.customer_name || "N/A",
      item.consumer_number || "N/A",
      item.zone || "N/A",
      item.solar_capacity_kw || 0,
      item.inverter_name || "N/A",
      item.inverter_capacity || 0,
      item.commission_date || "N/A",
      item.wifi_available ? "Yes" : "No",
      item.is_blacklisted ? "Blacklisted" : "Active"
    ]);
  } else {
    // Billing records format
    headers = [
      "S.No",
      "Month",
      "Consumer Name",
      "Consumer No",
      "Capacity (kW)",
      "Commission Date",
      "Import Units",
      "Export Units",
      "Generation of Month",
      "Reading Date",
      "Amount (₹)",
      "Previous Unit",
    ];
    rows = data.map((consumer, index) => [
      index + 1,
      consumer.month,
      consumer.consumerName || "N/A",
      consumer.consumerNo || "N/A",
      consumer.capacityKW || 0,
      consumer.commissionDate || "N/A",
      consumer.importUnits || 0,
      consumer.exportUnits || 0,
      consumer.totalGeneration || 0,
      consumer.readingDate || "N/A",
      consumer.amount || 0,
      consumer.previousUnit || 0,
    ]);
  }

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const cellStr = cell === null || cell === undefined ? "" : String(cell);
          return cellStr.includes(",") || cellStr.includes("\n") || cellStr.includes('"')
            ? `"${cellStr.replace(/"/g, '""')}"`
            : cellStr;
        })
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
