import { NextResponse, type NextRequest } from "next/server"
import { landingEnv } from "@workspace/env/landing"
import { resolveWebOrigin } from "@workspace/env/origins"
import { legacyAppRedirect } from "@workspace/shared/appRoutes"

export default function proxy(request: NextRequest) {
  const destination = legacyAppRedirect(
    request.url,
    resolveWebOrigin({
      configuredUrl: landingEnv.NEXT_PUBLIC_APP_URL,
      localOrigin: "https://localhost:3000",
    })
  )
  return destination
    ? NextResponse.redirect(destination, 308)
    : NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)",
  ],
}
