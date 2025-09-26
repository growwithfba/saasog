# Supabase Email Template Setup Instructions

## 📧 How to Configure Email Templates in Supabase Cloud

### Step 1: Access Email Templates
1. Go to [supabase.com](https://supabase.com)
2. Sign in and select your project
3. Navigate to **Authentication** → **Email Templates**

### Step 2: Configure Password Recovery Template
1. Click on **"Reset Password"** template
2. Copy and paste the HTML from `supabase_cloud_templates/recovery_template.html`
3. Update the **Subject** to: `Reset your password - Grow With FBA AI`
4. Save the template

### Step 3: Configure Signup Confirmation Template
1. Click on **"Confirm Signup"** template
2. Copy and paste the HTML from `supabase_cloud_templates/confirmation_template.html`
3. Update the **Subject** to: `Welcome to Grow With FBA AI - Confirm your account`
4. Save the template

### Step 4: Configure URL Settings
Go to **Authentication** → **URL Configuration** and set:

**Site URL:**
```
http://localhost:3000
```

**Redirect URLs** (add these):
```
http://localhost:3000/reset-password
http://localhost:3000/dashboard
https://yourdomain.com/reset-password
https://yourdomain.com/dashboard
```

### Step 5: Test the Flow
1. Go to your app's forgot password page
2. Enter your email
3. Check your email - you should now see the styled template instead of raw text
4. Click the reset link to verify the flow works

## 🔧 Template Variables Available

The following variables are automatically populated by Supabase:

- `{{ .ConfirmationURL }}` - The confirmation/reset link
- `{{ .Email }}` - The user's email address
- `{{ .SiteURL }}` - Your configured site URL

## 🎨 Customization

You can modify the templates by:
- Changing colors in the CSS
- Adding your logo URL instead of the emoji
- Updating the company name and branding
- Adding additional content or links

## 🚀 Production Setup

For production, remember to:
1. Update the Site URL to your production domain
2. Add production redirect URLs
3. Configure SMTP settings if using custom email provider
4. Test all email flows in production environment
