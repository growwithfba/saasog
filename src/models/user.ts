export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
  subscription_status?: 'ACTIVE' | 'TRIALING' | 'CANCELED' | null;
  subscription_type?: 'MONTHLY' | 'YEARLY' | null;
  has_used_trial?: boolean;
  first_subscription_date?: string | null;
}