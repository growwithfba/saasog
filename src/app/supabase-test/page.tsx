import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export default async function SupabaseTestPage() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  
  // Test query to fetch users
  const { data: users, error: usersError } = await supabase.from('users').select('*');
  
  // Test query to fetch submissions
  const { data: submissions, error: submissionsError } = await supabase.from('submissions').select('*');
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Supabase Test</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Users</h2>
        {usersError && (
          <div className="text-red-500">Error loading users: {usersError.message}</div>
        )}
        {users && users.length > 0 ? (
          <div className="grid gap-2">
            {users.map((user) => (
              <div key={user.id} className="p-3 border rounded">
                {JSON.stringify(user)}
              </div>
            ))}
          </div>
        ) : (
          <p>No users found.</p>
        )}
      </div>
      
      <div>
        <h2 className="text-xl font-semibold mb-3">Submissions</h2>
        {submissionsError && (
          <div className="text-red-500">Error loading submissions: {submissionsError.message}</div>
        )}
        {submissions && submissions.length > 0 ? (
          <div className="grid gap-2">
            {submissions.map((submission) => (
              <div key={submission.id} className="p-3 border rounded">
                {JSON.stringify(submission)}
              </div>
            ))}
          </div>
        ) : (
          <p>No submissions found.</p>
        )}
      </div>
    </div>
  );
} 