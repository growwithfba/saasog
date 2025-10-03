# Supabase Auth Configuration Instructions

## 1. Email Authentication Settings

Go to your Supabase Dashboard → Authentication → Settings and configure:

### Email Settings:
- **Enable email confirmations**: Turn OFF (for now, to allow immediate login)
- **Email confirmation redirect URL**: `http://localhost:3000/dashboard` (development) or your production URL
- **Password reset redirect URL**: `http://localhost:3000/reset-password`

### Site URL Settings:
- **Site URL**: `http://localhost:3000` (development) or your production domain
- **Additional redirect URLs**: Add these URLs:
  - `http://localhost:3000/dashboard`
  - `http://localhost:3000/auth/callback`
  - Your production URLs if deploying

## 2. Email Templates (Optional)

Go to Authentication → Email Templates to customize:
- **Confirm signup** email
- **Reset password** email
- **Magic link** email

## 3. Auth Providers

In Authentication → Providers:
- **Email**: Should be enabled ✅
- **Phone**: Can be disabled for now
- **Third-party providers**: Add Google, GitHub, etc. if needed

## 4. JWT Settings

In Authentication → Settings → JWT Settings:
- **JWT expiry**: 3600 (1 hour) - default is fine
- **Refresh token expiry**: 604800 (7 days) - default is fine

## 5. Security Settings

In Authentication → Settings:
- **Enable phone confirmations**: OFF
- **Enable email confirmations**: OFF (for easier testing)
- **Enable secure email change**: ON
- **Double confirm email change**: OFF
- **Enable manual linking**: OFF

## 6. Rate Limiting

Default settings should be fine for development.

## 7. Database Policies

The migration has already set up the necessary RLS policies. If you need to verify them, run this in your SQL editor:

```sql
-- Check RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename IN ('profiles', 'submissions', 'validation_submissions')
ORDER BY tablename, policyname;
```

## 8. Test User Creation

After configuring, test by:
1. Creating a new account at `/register`
2. Logging in at `/login`
3. Uploading a CSV and creating a submission
4. Testing the "View Details" functionality

## Important Notes:

- With email confirmations OFF, users can login immediately after registration
- You can enable email confirmations later once you have email templates configured
- Make sure to update the Site URL when deploying to production
- The profiles table will automatically populate when users register (via trigger)
