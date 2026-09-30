const DAY_MS = 24 * 60 * 60 * 1000;

export const utcToday = () => new Date().toISOString().slice(0, 10);

export const getMouStatus = (validUntil, today = utcToday()) => {
  const end = String(validUntil || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return 'Active';
  const daysLeft = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS;
  if (daysLeft < 0) return 'Expired';
  if (daysLeft <= 30) return 'Expiring Soon';
  return 'Active';
};
