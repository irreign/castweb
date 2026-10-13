import type { Context } from 'hono';
import type { AppEnv } from '../env';
import { createSession } from '../auth';
import { first } from '../db';
import { acceptInvite } from '../services/tenants';
import { seedAvailabilityFromHours } from '../services/bookings';

export async function acceptInviteAndLogin(c: Context<AppEnv>, token: string, password: string) {
  const { userId, tenantId } = await acceptInvite(c.env.DB, token, password);
  // New team members become bookable straight away, using the agency's business hours as their default availability.
  const has = await first(c.env.DB, 'SELECT 1 AS x FROM consultant_availability WHERE tenant_id = ? AND user_id = ? LIMIT 1', tenantId, userId);
  if (!has) await seedAvailabilityFromHours(c.env.DB, tenantId, userId);
  await createSession(c, userId, tenantId);
}
