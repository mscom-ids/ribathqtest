export function isWhatsAppSendingEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.WHATSAPP_SENDING_ENABLED === 'true'
    && environment.N8N_STUDENT_MOVEMENT_TEST_ENABLED !== 'true';
}

export function isStaffWhatsAppSendingEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return isWhatsAppSendingEnabled(environment) && environment.WHATSAPP_STAFF_SENDING_ENABLED === 'true';
}
