import { db } from '../config/db';

export interface WhatsAppConfig {
  apiUrl?: string;
  apiToken?: string;
  instanceId?: string;
  provider?: 'generic_http' | 'ultramsg' | 'evolution' | 'greenapi';
}

/**
 * Normalizes phone number to standard international format (e.g. 919876543210)
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return '';
  // Remove all non-numeric characters
  let clean = rawPhone.replace(/\D/g, '');
  // Default to adding country code (e.g. 91 for India if 10 digits) if applicable
  if (clean.length === 10) {
    clean = `91${clean}`;
  }
  return clean;
}

/**
 * Sends a WhatsApp message via an unofficial WhatsApp HTTP Gateway
 */
export async function sendWhatsAppMessage(
  toPhone: string,
  message: string,
  configOverride?: WhatsAppConfig
): Promise<{ success: boolean; error?: string }> {
  const phone = normalizePhoneNumber(toPhone);
  if (!phone) {
    return { success: false, error: 'Invalid phone number' };
  }

  const apiUrl = configOverride?.apiUrl || process.env.WHATSAPP_API_URL;
  const apiToken = configOverride?.apiToken || process.env.WHATSAPP_API_TOKEN || process.env.WHATSAPP_API_KEY;
  const instanceId = configOverride?.instanceId || process.env.WHATSAPP_API_INSTANCE_ID;
  const provider = (configOverride?.provider || process.env.WHATSAPP_API_PROVIDER || 'generic_http').toLowerCase();

  // If WhatsApp API is not configured or disabled in .env, log and return safely
  if (!apiUrl) {
    console.log(`[WhatsApp Service - Dry Run] Would send to ${phone}:\n${message}\n(Set WHATSAPP_API_URL in .env to send live messages)`);
    return { success: true };
  }

  try {
    let endpoint = apiUrl;
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    let payload: any = {};

    if (provider === 'ultramsg') {
      // UltraMsg REST format
      endpoint = apiUrl.includes('messages/chat') ? apiUrl : `${apiUrl.replace(/\/+$/, '')}/${instanceId}/messages/chat`;
      payload = {
        token: apiToken,
        to: phone,
        body: message,
      };
    } else if (provider === 'evolution') {
      // Evolution API / Baileys format
      headers['apikey'] = apiToken || '';
      payload = {
        number: phone,
        text: message,
        options: { delay: 1200, presence: 'composing' },
      };
    } else if (provider === 'greenapi') {
      // Green-API format
      endpoint = `${apiUrl.replace(/\/+$/, '')}/waInstance${instanceId}/sendMessage/${apiToken}`;
      payload = {
        chatId: `${phone}@c.us`,
        message: message,
      };
    } else {
      // Generic HTTP REST format (works with custom bridges, WPPConnect, Node WhatsApp gateways)
      if (apiToken) {
        headers['Authorization'] = `Bearer ${apiToken}`;
        headers['x-api-key'] = apiToken;
      }
      payload = {
        phone: phone,
        number: phone,
        to: phone,
        message: message,
        text: message,
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[WhatsApp Service Error] HTTP ${response.status} sending to ${phone}: ${errText}`);
      return { success: false, error: `HTTP ${response.status}: ${errText}` };
    }

    console.log(`[WhatsApp Service] Message successfully sent to ${phone}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[WhatsApp Service Exception] Failed to send message to ${phone}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Automatically notifies mentors/staff when an event is planned or updated
 */
export async function notifyMentorsForEvent(event: {
  title: string;
  category: string;
  event_for: string;
  target_roles?: string[] | string | null;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  message?: string;
}) {
  try {
    const { title, category, event_for, target_roles, start_date, end_date, start_time, end_time, message } = event;

    // Parse target roles if string
    let roles: string[] = [];
    if (Array.isArray(target_roles)) {
      roles = target_roles;
    } else if (typeof target_roles === 'string' && target_roles.trim()) {
      try {
        roles = JSON.parse(target_roles);
      } catch {
        roles = [target_roles];
      }
    }

    // Determine which staff members to notify
    let query = `
      SELECT id, name, phone, role 
      FROM staff 
      WHERE (is_active = true OR is_active IS NULL) 
        AND phone IS NOT NULL 
        AND TRIM(phone) != ''
    `;
    const params: any[] = [];

    if (event_for === 'Mentors' && roles.length > 0) {
      // Map UI role names to possible database role values
      const normalizedRoles = roles.map(r => r.toLowerCase());
      query += ` AND LOWER(role) = ANY($1)`;
      params.push(normalizedRoles);
    }

    const result = await db.query(query, params);
    const recipients = result.rows;

    if (recipients.length === 0) {
      console.log('[WhatsApp Notification] No active staff with phone numbers found for this event.');
      return;
    }

    // Format readable dates
    const startDateFormatted = new Date(start_date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const endDateFormatted = new Date(end_date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const dateRangeStr = start_date === end_date ? startDateFormatted : `${startDateFormatted} to ${endDateFormatted}`;
    const timeRangeStr = `${(start_time || '').substring(0, 5)} - ${(end_time || '').substring(0, 5)}`;

    // Build template message
    const waMessage = 
`📢 *New Institutional Event Planned*

🗓️ *Event:* ${title}
🏷️ *Category:* ${category}
📅 *Date:* ${dateRangeStr}
⏰ *Time:* ${timeRangeStr}
👥 *Audience:* ${event_for}
${message ? `\n📝 *Notes / Agenda:*\n${message}\n` : ''}
— *Ribat HQ Administration*`;

    console.log(`[WhatsApp Notification] Sending event notification to ${recipients.length} mentor(s)...`);

    // Send messages concurrently without blocking
    Promise.allSettled(
      recipients.map(staffMember => sendWhatsAppMessage(staffMember.phone, waMessage))
    ).then(results => {
      const succeeded = results.filter(r => r.status === 'fulfilled' && (r.value as any)?.success).length;
      console.log(`[WhatsApp Notification] Dispatched to ${succeeded}/${recipients.length} recipients.`);
    });
  } catch (error) {
    console.error('[WhatsApp Notification Error] Failed to process event mentor notification:', error);
  }
}
