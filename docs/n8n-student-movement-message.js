const input = $input.first().json.body;
if (!input || typeof input !== 'object') throw new Error('JSON body required');
const requiredText = (field, limit = 150) => {
  const value = input[field];
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\r\n\u0000-\u001f]/.test(value)) throw new Error('Invalid ' + field);
  return value.trim();
};
const notificationId = requiredText('notification_id');
const studentName = requiredText('student_name');
const recipient = requiredText('to', 16).replace(/^\+/, '');
if (!/^[1-9]\d{7,14}$/.test(recipient)) throw new Error('Use guardian phone with country code');
if (!['student_exit', 'student_return'].includes(input.event)) throw new Error('Unsupported event');
const timestamp = requiredText('occurred_at', 40);
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)) throw new Error('Use an ISO timestamp with timezone');
const occurredAt = new Date(timestamp);
if (!Number.isFinite(occurredAt.getTime())) throw new Error('Invalid occurred_at');
const fullTime = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(occurredAt);
let message;
if (input.test_template_index !== undefined || input.test_template_bundle !== undefined) throw new Error('Template selection is no longer supported');
if (input.event === 'student_exit') {
  const companion = requiredText('companion_name');
  const relationship = requiredText('companion_relationship');
  const exitDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'long', year: 'numeric' }).format(occurredAt);
  const exitTime = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(occurredAt);
  message = "Dear Parent\nThe following campus departure has been recorded for your information:\n\n*Student:* " + studentName + "\n*Accompanying person:* " + companion + "\n*Relationship:* " + relationship + "\n*Departure date:* " + exitDate + "\n*Exit time:* " + exitTime + " IST\n\nWe are sharing this update to help you stay informed about your child's movements. For any clarification or correction to the recorded details, please get in touch with the institution.\n— *Ribathul Quran*";
} else {
  message = 'Dear Parent, ' + studentName + ' arrived back on campus on ' + fullTime + '.\n— Ribathul Quran';
}
const payload = { to: recipient, body: message };
if (input.wa_number_id !== undefined) payload.wa_number_id = requiredText('wa_number_id');
return [{ json: { notification_id: notificationId, payload } }];
