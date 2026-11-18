import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { Toaster } from "./sonner.js"

test("the Toaster does not emit server markup before hydration", () => {
  assert.equal(renderToString(createElement(Toaster)), "")
})
