import { type NextRequest, NextResponse } from "next/server";

import { signInPath } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/config";

/**
 * Runs before the dashboard pages render: a visitor with no sign-in cookie is
 * sent to the sign-in page straight away, instead of seeing the dashboard
 * flash and then disappear. Whether the cookie is still valid is checked by
 * the backend; an expired one gets a 401, which also leads to sign-in.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }
  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(new URL(signInPath(pathname + search), request.url));
}

export const config = {
  // Only the signed-in area. Invite links (/j/...) and meeting rooms work
  // without an account.
  matcher: ["/", "/meetings/:path*"],
};
