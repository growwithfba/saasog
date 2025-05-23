import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export const createClient = (request: NextRequest) => {
  // Create an unmodified response
  let supabaseResponse = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set(name, value, options) {
          request.cookies.set(name, value);
          supabaseResponse.cookies.set(name, value, options);
        },
        remove(name, options) {
          request.cookies.delete(name);
          supabaseResponse.cookies.set(name, '', options);
        },
      },
    },
  );

  return { supabase, supabaseResponse };
}; 