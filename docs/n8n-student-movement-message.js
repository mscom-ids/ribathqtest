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
let templateIndex;
const preview = input.test_template_index !== undefined || input.test_template_bundle === true;
if (input.event === 'student_exit') {
  const companion = requiredText('companion_name');
  const relationship = requiredText('companion_relationship');
  if (preview) {
    if (input.student_id !== 'R999' || input.test_notification !== true || recipient !== '918921551686') throw new Error('Template previews require the dedicated test student and recipient');
    templateIndex = input.test_template_index;
    if (!Number.isInteger(templateIndex) || templateIndex < 1 || templateIndex > 5) throw new Error('Invalid test template index');
  } else {
    templateIndex = Math.floor(Math.random() * 5) + 1;
  }
    const exitDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'long', year: 'numeric' }).format(occurredAt);
    const exitTime = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(occurredAt);
    const templates = [
      `Dear Parent/Guardian,\nThis is to confirm that ${studentName} left campus with ${companion} (${relationship}) on ${exitDate} at ${exitTime}. This notification is being shared to keep you informed of your child's departure. If any of these details are incorrect or unexpected, please contact Ribathul Quran promptly.\n— Ribathul Quran`,
      `Dear Parent/Guardian,\nWe would like to inform you that ${studentName} departed from campus on ${exitDate} at ${exitTime}, accompanied by ${companion} (${relationship}). Please review these details for your information. Should you have any questions regarding this departure, kindly contact the institution.\n— Ribathul Quran`,
      `Dear Parent/Guardian,\nPlease note that the campus departure of ${studentName} was recorded on ${exitDate} at ${exitTime}. The accompanying person was ${companion}, whose relationship to the student is ${relationship}. If this departure was not expected, please contact Ribathul Quran immediately for clarification.\n— Ribathul Quran`,
      `Dear Parent/Guardian,\nOur records show that ${studentName} left campus with ${companion} (${relationship}) on ${exitDate} at ${exitTime}. We are sharing this update to help you stay informed about your child's movements. For any clarification or correction to the recorded details, please get in touch with the institution.\n— Ribathul Quran`,
      `Dear Parent/Guardian,\nThe following campus departure has been recorded for your information:\n\nStudent: ${studentName}\nAccompanying person: ${companion}\nRelationship: ${relationship}\nDeparture date: ${exitDate}\nExit time: ${exitTime}\n\nPlease review the information above. If you notice an incorrect detail or were not expecting this departure, kindly contact Ribathul Quran promptly.\n— Ribathul Quran`,
    ];
    message = preview && input.test_template_bundle === true
      ? templates.map((text, index) => 'TEST TEMPLATE ' + (index + 1) + '\n\n' + text).join('\n\n--------------------\n\n')
      : templates[templateIndex - 1];
} else {
  if (preview) throw new Error('Departure templates cannot be used for arrivals');
  message = 'Dear Parent, ' + studentName + ' arrived back on campus on ' + fullTime + '.\n— Ribathul Quran';
}
const payload = { to: recipient, body: message };
if (input.wa_number_id !== undefined) payload.wa_number_id = requiredText('wa_number_id');
return [{ json: { notification_id: notificationId, payload, ...(templateIndex === undefined ? {} : { selected_template_index: templateIndex }), ...(preview ? { test_template_index: templateIndex, ...(input.test_template_bundle === true ? { test_template_bundle: true } : {}) } : {}) } }];
