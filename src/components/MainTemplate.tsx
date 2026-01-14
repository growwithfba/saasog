import { useEffect } from "react";
import NavBar from "./NavBar";
import { supabase } from "@/utils/supabaseClient";
import { setUser } from "@/store/authSlice";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";

const MainTemplate = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const dispatch = useDispatch();
  
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user: supabaseUser }, error: userError } = await supabase.auth.getUser();

      if (userError || !supabaseUser) {
        router.push('/login');
        return;
      }
      
      dispatch(setUser({
        id: supabaseUser.id,
        email: supabaseUser.email,
        name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'User',
        created_at: supabaseUser.created_at
      }));
    };

    checkUser();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-900">
      <NavBar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </div>
    </div>
  );
};

export default MainTemplate;