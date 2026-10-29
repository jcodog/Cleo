import React, { useSyncExternalStore } from "react"

const subscribe = (callback: () => void) => {
  window.addEventListener("popstate", callback)
  return () => window.removeEventListener("popstate", callback)
}
export function usePathname() {
  return useSyncExternalStore(subscribe, () => location.pathname)
}
export function useRouter() {
  return {
    replace(href: string) {
      history.replaceState({}, "", href)
      window.dispatchEvent(new PopStateEvent("popstate"))
    },
    push(href: string) {
      history.pushState({}, "", href)
      window.dispatchEvent(new PopStateEvent("popstate"))
    },
  }
}
export default function Link({
  href,
  children,
  onClick,
  ...props
}: React.ComponentProps<"a"> & { href: string }) {
  const router = useRouter()
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) {
          event.preventDefault()
          router.push(href)
        }
      }}
    >
      {children}
    </a>
  )
}
