import { useEffect, useState } from "react";
import NavBar from "./NavBar";
import LearnModal from "./LearnModal";
import { supabase } from "@/utils/supabaseClient";
import { setUser } from "@/store/authSlice";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";

const MainTemplate = ({ children }: { children: React.ReactNode }) => {
  const [isLearnModalOpen, setIsLearnModalOpen] = useState(false);
  const handleLearnClick = () => setIsLearnModalOpen(true);
  const router = useRouter();
  const handleLearnModalClose = () => setIsLearnModalOpen(false);
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

  const handleLearnModalAction = () => {
    setIsLearnModalOpen(false);
    // setActiveTab('new');
    // Smooth scroll to the upload section after a short delay
    setTimeout(() => {
      const element = document.getElementById('keep-building-section');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  

  return (
    <div className="min-h-screen bg-[#d3d3d3] dark:bg-slate-900">
      <NavBar onLearnClick={handleLearnClick} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </div>
      {isLearnModalOpen && <LearnModal isOpen={isLearnModalOpen} onClose={handleLearnModalClose} onAction={handleLearnModalAction} />}
    </div>
  );
};

export default MainTemplate;