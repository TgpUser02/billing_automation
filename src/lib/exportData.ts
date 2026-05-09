import { Consumer } from "@/types/consumer";

export function exportToCSV(consumers: Consumer[], filename: string = "consumer_data") {
  const headers = [
    "S.No",
    "Month",
    "Consumer Name",
    "Consumer No",
    "Capacity (kW)",
    "Commission Date",
    "Import Units",
    "Export Units",
    "Total Generation",
    "Reading Date",
    "Amount (₹)",
    "Previous Unit",
  ];

  const rows = consumers.map((consumer, index) => [
    index + 1,
    consumer.month,
    consumer.consumerName,
    consumer.consumerNo,
    consumer.capacityKW,
    consumer.commissionDate,
    consumer.importUnits,
    consumer.exportUnits,
    consumer.totalGeneration,
    consumer.readingDate,
    consumer.amount,
    consumer.previousUnit,
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell) =>
          typeof cell === "string" && cell.includes(",")
            ? `"${cell}"`
            : cell
        )
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
