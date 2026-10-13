import { z } from 'zod';
import { first, parseJson, run, type DB } from './db';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');
const dayWindow = z.object({ open: hhmm, close: hhmm }).refine((w) => w.close > w.open, 'Closing time must be after opening time');
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #0f766e');

export const profileSchema = z.object({
  contactEmail: z.string().email().max(200).nullable().default(null),
  contactPhone: z.string().max(40).nullable().default(null),
  address: z.string().max(300).nullable().default(null),
  website: z.string().url().max(300).nullable().default(null),
  licenceNo: z.string().max(60).nullable().default(null),   // EA licence number, shown to customers if set
  description: z.string().max(1000).nullable().default(null),
});

// Keys are weekday numbers 0 (Sun) .. 6 (Sat) in the tenant's timezone. null = closed.
export const hoursSchema = z.record(z.enum(['0', '1', '2', '3', '4', '5', '6']), dayWindow.nullable());

export const consultationSchema = z.object({
  durationMin: z.number().int().min(10).max(180).default(30),
  bufferMin: z.number().int().min(0).max(60).default(10),
  slotStepMin: z.number().int().min(10).max(120).default(30),
  minNoticeHours: z.number().int().min(0).max(168).default(2),
  maxDaysAhead: z.number().int().min(1).max(90).default(21),
  locationNote: z.string().max(300).nullable().default(null),
});

export const aiSchema = z.object({
  enabled: z.boolean().default(true),
  greeting: z.string().max(400).default('Hi! I\'m the agency\'s virtual assistant. How can I help you today?'),
  handoffMessage: z.string().max(400).default('Thanks — I\'ve passed this to one of our consultants, who will get back to you during office hours.'),
  escalationKeywords: z.array(z.string().min(2).max(40)).max(40)
    .default(['refund', 'complain', 'complaint', 'lawyer', 'police', 'abuse', 'runaway', 'harass', 'compensation', 'court', 'sue']),
  collectFields: z.array(z.enum(['household', 'helper_type', 'start_timing', 'budget_notes'])).default(['household', 'helper_type', 'start_timing']),
});

export const brandingSchema = z.object({
  displayName: z.string().max(80).nullable().default(null),
  primaryColor: colour.default('#0f766e'),
  welcomeMessage: z.string().max(400).nullable().default(null),
  suggestedPrompts: z.array(z.string().min(2).max(80)).max(5).default([]),
  privacyUrl: z.string().url().max(300).nullable().default(null),
  allowedOrigins: z.array(z.string().url().max(200)).max(20).default([]), // widget embeds allowed only from these origins (empty = any)
});

export const retentionSchema = z.object({
  conversationDays: z.number().int().min(30).max(1825).default(365),
  closedLeadDays: z.number().int().min(30).max(1825).default(730),
});

export const limitsSchema = z.object({
  aiCallsPerMonth: z.number().int().min(0).max(1_000_000).default(3000),
  messagesPerMonth: z.number().int().min(0).max(1_000_000).default(10000),
});

export const notificationsSchema = z.object({
  agencyEmail: z.string().email().max(200).nullable().default(null), // receives booking + handoff alerts
  emailCustomers: z.boolean().default(true),                         // booking confirmations to customers who gave an email
});

export const settingsSchema = z.object({
  profile: profileSchema.default({}),
  hours: hoursSchema.default({ 0: null, 1: { open: '09:00', close: '18:00' }, 2: { open: '09:00', close: '18:00' }, 3: { open: '09:00', close: '18:00' }, 4: { open: '09:00', close: '18:00' }, 5: { open: '09:00', close: '18:00' }, 6: { open: '09:00', close: '13:00' } }),
  consultation: consultationSchema.default({}),
  ai: aiSchema.default({}),
  branding: brandingSchema.default({}),
  retention: retentionSchema.default({}),
  limits: limitsSchema.default({}),
  notifications: notificationsSchema.default({}),
});

export type Settings = z.infer<typeof settingsSchema>;
export const sectionSchemas = {
  profile: profileSchema, hours: hoursSchema, consultation: consultationSchema, ai: aiSchema,
  branding: brandingSchema, retention: retentionSchema, limits: limitsSchema, notifications: notificationsSchema,
} as const;
export type SettingsSection = keyof typeof sectionSchemas;

export function normaliseSettings(json: string | null | undefined): Settings {
  const parsed = settingsSchema.safeParse(parseJson(json, {}));
  return parsed.success ? parsed.data : settingsSchema.parse({});
}

export async function getTenantSettings(db: DB, tenantId: string): Promise<{ settings: Settings; timezone: string; name: string }> {
  const t = await first<{ settings_json: string; timezone: string; name: string }>(db, 'SELECT settings_json, timezone, name FROM tenants WHERE id = ?', tenantId);
  if (!t) throw new Error('tenant missing');
  return { settings: normaliseSettings(t.settings_json), timezone: t.timezone, name: t.name };
}

export async function saveSettingsSection(db: DB, tenantId: string, section: SettingsSection, value: unknown): Promise<Settings> {
  const { settings } = await getTenantSettings(db, tenantId);
  const next = settingsSchema.parse({ ...settings, [section]: sectionSchemas[section].parse(value) });
  await run(db, 'UPDATE tenants SET settings_json = ? WHERE id = ?', JSON.stringify(next), tenantId);
  return next;
}
