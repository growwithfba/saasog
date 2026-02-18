export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
  subscription_status?: 'ACTIVE' | 'TRIALING' | 'CANCELED' | 'FREE' | null;
  subscription_type?: 'MONTHLY' | 'YEARLY' | 'FREE' | null;
  has_used_trial?: boolean;
  first_subscription_date?: string | null;
}