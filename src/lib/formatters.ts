export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateString: string): string {
  if (!dateString || dateString === "N/A") return "N/A";

  // If it's already in YYYY-MM-DD format
  if (dateString.includes('-') && dateString.split('-')[0].length === 4) {
    const [y, m, d] = dateString.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date).replace(/\//g, '/');
}
