export const formatDate = (date) => {
  if (!date) return 'N/A';
  const text = String(date);
  const datePart = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const value = new Date(datePart ? `${datePart}T00:00:00` : date);
  if (Number.isNaN(value.getTime())) return 'N/A';
  return value.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};
