import { useEffect } from "react";
import NavBar from "./NavBar";
import { Footer } from "./layout/Footer";
import { UsageWarningToast } from "./subscription/UsageWarningToast";
import { supabase } from "@/utils/supabaseClient";
import { setUser } from "@/store/authSlice";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";

interface MainTemplateProps {
  children: React.ReactNode;
  /**
   * Lets the content use the whole window instead of the 1280px reading
   * column. For data tables, that cap is the thing forcing columns narrow
   * enough to clip their own headers — a wide monitor should show more
   * columns, not more empty margin.
   */
  wide?: boolean;
}

const MainTemplate = ({ children, wide = false }: MainTemplateProps) => {
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-900 flex flex-col">
      <NavBar wide={wide} />
      <div
        className={`flex-1 mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full ${
          wide ? 'max-w-none' : 'max-w-7xl'
        }`}
      >
        {children}
      </div>
      <Footer />
      <UsageWarningToast />
    </div>
  );
};

export default MainTemplate;