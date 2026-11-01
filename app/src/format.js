export function initial(name) {
  const trimmed = (name || '?').trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

export function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function dayLabel(iso) {
  const date = new Date(iso);
  const today = new Date();
  const start = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((start(today) - start(date)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

export function listTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return timeLabel(iso);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function durationLabel(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function previewLabel(message) {
  if (!message) return '';
  if (message.type === 'image') return 'Photo';
  if (message.type === 'voice') return 'Voice message';
  return message.text || '';
}
