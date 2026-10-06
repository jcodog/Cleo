import { NextResponse, type NextRequest } from "next/server"
import { legacyAppRedirect } from "@workspace/shared/appRoutes"
import { appOrigin } from "@/lib/siteMetadata"
import { landingEnv } from "@workspace/env/landing"

export default function proxy(request: NextRequest) {
  const destination = legacyAppRedirect(request.url, appOrigin())
  const response = destination
    ? NextResponse.redirect(destination, 308)
    : NextResponse.next()
  if (landingEnv.VERCEL_ENV === "preview") {
    response.headers.set("X-Robots-Tag", "noindex, nofollow")
  }
  return response
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)",
  ],
}
