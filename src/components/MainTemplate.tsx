import { useEffect } from "react";
import NavBar from "./NavBar";
import { Footer } from "./layout/Footer";
import { UsageWarningToast } from "./subscription/UsageWarningToast";
import { supabase } from "@/utils/supabaseClient";
import { setUser } from "@/store/authSlice";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { PageAmbience } from '@/components/layout/PageAmbience';
import { PAGE_BG } from '@/components/ui/surfaces';

interface MainTemplateProps {
  children: React.ReactNode;
  /**
   * The content uses the whole window by default instead of a 1280px reading
   * column. For data tables, that cap is the thing forcing columns narrow
   * enough to clip their own headers — a wide monitor should show more
   * columns, not more empty margin. Pass `wide={false}` for a page that is
   * better read in a narrow column.
   */
  wide?: boolean;
}

const MainTemplate = ({ children, wide = true }: MainTemplateProps) => {
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

  // A focused number input treats the wheel as a spinner, so scrolling the page
  // with the cursor over one silently rewrites the value — and can push it past
  // its own min, which is how a Min field ended up reading -12. Blurring on
  // wheel drops the spinner behaviour and lets the page scroll instead.
  //
  // Done once here rather than per input: a dozen components carry number
  // fields, and anything added later gets this for free. Passive, so it never
  // delays a scroll.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === 'number' && el === e.target) {
        el.blur();
      }
    };
    document.addEventListener('wheel', onWheel, { passive: true });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className={`relative isolate min-h-screen ${PAGE_BG} flex flex-col`}>
      <PageAmbience />
      <NavBar wide={wide} />
      <div
        className={`flex-1 mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full ${
          wide ? 'max-w-none' : 'max-w-7xl'
        }`}
      >
        {children}
      </div>
      <Footer wide={wide} />
      <UsageWarningToast />
    </div>
  );
};

export default MainTemplate;