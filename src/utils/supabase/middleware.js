import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function updateSession(request) {
  const { pathname } = request.nextUrl;
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/auth');
  const isApiRoute = pathname.startsWith('/api');
  const isSaasStudio = pathname.startsWith('/saas-studio');
  const isServerAction = request.headers.has('next-action');

  // Next.js 16 catch-all route Server Action dispatch fix:
  // In Next.js App Router, client components invoke Server Actions via POST to window.location.href
  // (e.g. /user_management_new?tab=user_manage or /attendance). Since CRM routes are handled by
  // the catch-all worker (app/[[...route]]/page), matching dynamic subpaths locally fails in Next 16
  // and attempts a broken forward to /[[...route]] which returns empty JSON {}.
  // Rewriting Server Action requests targeting catch-all CRM subpaths to '/' lets Next.js resolve
  // directly to app/[[...route]]/page without forwarding, returning valid text/x-component Flight responses.
  const isCatchAllCrmRoute = !isApiRoute && !isAuthPage && !isSaasStudio && pathname !== '/';
  const rewriteUrl = request.nextUrl.clone();
  if (isServerAction && isCatchAllCrmRoute) {
    rewriteUrl.pathname = '/';
  }

  const createInitialResponse = () => {
    return (isServerAction && isCatchAllCrmRoute)
      ? NextResponse.rewrite(rewriteUrl, { request })
      : NextResponse.next({ request });
  };

  let supabaseResponse = createInitialResponse();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = createInitialResponse();
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const isPublicPage = 
    pathname === '/chat' || 
    pathname === '/' || 
    pathname === '/manifest.json' || 
    pathname === '/sw.js' || 
    pathname.startsWith('/icon') ||
    pathname.startsWith('/apple-icon') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.json') ||
    pathname.endsWith('.webmanifest');

  // Bypass expensive auth server call for API routes, webhooks, and public assets
  if (isApiRoute || (isPublicPage && pathname !== '/login')) {
    return supabaseResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect all web routes (except auth pages, public pages and api endpoints)
  if (!user && !isAuthPage && !isApiRoute && !isPublicPage) {
    // For Server Actions, avoid HTTP 307 redirect from middleware to prevent unexpected response errors.
    // Let the rewritten request proceed to app/[[...route]]/page.js where native redirect('/login') issues an x-action-redirect.
    if (isServerAction) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    const nextPath = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = '/login';
    url.searchParams.set('next', nextPath);
    return NextResponse.redirect(url);
  }

  // If user is logged in, don't let them see the login page
  if (user && pathname === '/login') {
    const nextPath = request.nextUrl.searchParams.get('next') || '/';
    return NextResponse.redirect(new URL(nextPath, request.url));
  }

  return supabaseResponse;
}
