// src/api/notificationsApi.ts
import { supabase } from '../lib/supabaseClient';
import type { Notification, NotificationType } from '../types/api';

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  member_id?: string | null;
  member_name?: string | null;
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    type: input.type,
    title: input.title,
    body: input.body,
    member_id: input.member_id ?? null,
    member_name: input.member_name ?? null,
  });
  // Notifications are a nice-to-have side effect — log but don't throw, so a
  // notification failure never blocks the actual action (signup, edit, etc.)
  if (error) console.error('Failed to create notification:', error.message);
}

export async function fetchNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(`Failed to fetch notifications: ${error.message}`);
  return data ?? [];
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw new Error(`Failed to mark notification as read: ${error.message}`);
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
  if (error) throw new Error(`Failed to mark all notifications as read: ${error.message}`);
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);
  if (error) return 0; // fail quietly — the bell badge just won't show a count
  return count ?? 0;
}