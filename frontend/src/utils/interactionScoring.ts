// Mirrors the CASE statement inside calculate_engagement_scores() in Supabase.
// If you add a new interaction_type, update both places.
export const INTERACTION_TYPE_POINTS: Record<string, number> = {
    meeting: 15,
    coffee_chat: 15,
    sms_message: 8,
    email: 4,
  };
  
  export function pointsForInteractionType(type: string): number {
    return INTERACTION_TYPE_POINTS[type] ?? 0;
  }