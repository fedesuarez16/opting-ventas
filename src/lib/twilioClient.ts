import twilio from 'twilio';

let client: ReturnType<typeof twilio> | null = null;

export function getTwilio() {
  if (client) return client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN faltantes');
  client = twilio(sid, token);
  return client;
}

export function getTwilioEnv() {
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const faltan = !fromNumber || !appUrl || !sid || !token;
  return { fromNumber, appUrl, faltan };
}
