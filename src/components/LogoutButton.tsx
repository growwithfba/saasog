'use client'

import { supabase } from '@/utils/supabaseClient'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <button
      onClick={handleLogout}
      className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded"
    >
      Logout
    </button>
  )
} 