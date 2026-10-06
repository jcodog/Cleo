import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { isProtectedAppPath } from "@workspace/shared/appRoutes"
import { signInPath } from "@/features/auth/applicationEntry"

export default clerkMiddleware(async (auth, request) => {
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`
  if (isProtectedAppPath(request.nextUrl.pathname)) {
    const { userId } = await auth()
    if (!userId) {
      const response = NextResponse.redirect(
        new URL(signInPath(returnTo), request.url)
      )
      response.headers.set("X-Robots-Tag", "noindex, nofollow")
      return response
    }
  }
  const headers = new Headers(request.headers)
  // Replace caller-supplied values so SSR only trusts the path observed here.
  headers.set("x-cleo-return-path", returnTo)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set("X-Robots-Tag", "noindex, nofollow")
  return response
})

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
}
