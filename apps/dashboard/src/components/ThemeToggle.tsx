"use client"

import { IconMoonStars, IconSunHigh } from "@tabler/icons-react"

import { useTheme } from "@/components/providers/theme-provider"
import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={
              isDark ? "Switch to light theme" : "Switch to dark theme"
            }
            onClick={() => setTheme(isDark ? "light" : "dark")}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <IconMoonStars aria-hidden="true" className="dark:hidden" />
            <IconSunHigh aria-hidden="true" className="hidden dark:block" />
          </Button>
        }
      />
      <TooltipContent>Click or press D to change theme</TooltipContent>
    </Tooltip>
  )
}
