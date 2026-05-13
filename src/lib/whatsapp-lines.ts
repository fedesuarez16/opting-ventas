export const ALLOWED_PHONE_FROM = ['+5491141872290', '+5491123312054'] as const;
export type AllowedPhoneFrom = typeof ALLOWED_PHONE_FROM[number];

export const LINE_LABELS: Record<AllowedPhoneFrom, string> = {
  '+5491141872290': 'Carnet',
  '+5491123312054': 'S&H',
};

export function isAllowedPhoneFrom(value: string | null | undefined): value is AllowedPhoneFrom {
  if (!value) return false;
  return (ALLOWED_PHONE_FROM as readonly string[]).includes(value);
}
