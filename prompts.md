TASK LIST FOR SAAS BETA V7
🔧 Core Functionality (Polish)

# BUTTONS ON RESULTS PAGE

- Reset/Close 
    - Results page should have a close button that goes back to the dashboard
- Share (generate link)  
    - We need to implement a share functionality. This should generate a link to the current submission, so any user with the link can see my submission results. The app needs to be prepared to navigate the user to the correct submission and retrieve that submission data in the database (Supabase). If there's any config needed for me to do in Supabase, let me know.
- Submit Validation (typeform submission)
    - We should add a submit validation button, that basically navigates to a typeform where it will pre-fill the current submission share link to the form. 

# Updates ON RESULTS PAGE (submission page)

- Adding Product Name
    - The product name should be shown in the screen. The page title (tab) should also have it.
- Score Breakdown as percentage (Dave)
    - Not sure what this means yet.
- Remove URL for Title Column
    - No need to display the product URL in the table.
- Remove Competitor Analysis Complete Container


- Fix Reset Calculation
    - Resetting the calculation should do the calculation (submission) again.

-  Allow users to save their current calculation and reset fields with a single button.
    - Basically add a "back" button to go to the dashboard. Everything should already be saved by default.


    
- Let users download a CSV of their saved product calculations.
    - This essentially will just download the original CSV that was uploaded.


# Product Validation Submission


- Allow up to 2 validations submitted via embedded Typeform or similar
    - Only 2 validations should be submitted per user. 


# 🔐 Authentication & User Management (Supabase)
- Secure Sign-Up/Login
- Enable email confirmation on signup
    - When registering, a numeric code should be sent to the user email to confirm. After confirming successfully, it should take the user to the dashboard.
- Add forgot password flow
    - User should be able to recover the account if they forgot the password.


# User Profile View Page
- We should add a profile view page. Feel free to add wherever is the best UX in the page. 
- Show email, plan type, account created date, logout button, etc.


-  Allow editing name and password 



# 🗃️ Database & User Data Handling (Supabase)
- Ensure user-scoped access to saved calculations via Row-Level Security (RLS)
- Enable proper linking between auth.user and profile table. Just make sure this is working fine.


- Track which products each user has submitted (via metadata or new table). This list should be showed in the dashboard. 
- The user should be able to delete any submitted products (calculations). 
- In the dashboard, each product should have an icon to open, share the link, and delete.



# 💳 Stripe Integration (Basic Tiering) Save for V8
Integrate Stripe for:


Free Trial - 7 Days


Paid Tier - $50


Billing history view (post-launch okay)


Basic cancel flow


Store Stripe Customer ID and plan details in user profile table


Optional: Set up Supabase Edge Function for Stripe webhooks



# 🧭 Onboarding & Support
- Add welcome pop-up or first login
- Create FAQ page or modal
- Add Support contact link (email)


# 🛠️ Admin Panel (Lightweight)
- Build a basic admin dashboard. Only specific users will be admin. To login to the dashboard it should be in a different URL than the regular login page. Admins should be able to:
    - View all users
    - See plan type (free, paid, mentorship)
    - View all products users submitted. 
    - Last login and basic usage stats by users.

# 🧼 UI Polish
- Add favicon
- Page title improvements
- Metadata polish. Improve SEO.




