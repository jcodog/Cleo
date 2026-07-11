import assert from "node:assert/strict"
import { test } from "node:test"

import {
  isConvexJsonObject,
  isConvexJsonShallowObject,
  isConvexJsonShallowValue,
  isConvexJsonValue,
} from "./validators"

test("Convex JSON guards accept supported JSON values", () => {
  assert.equal(isConvexJsonValue(null), true)
  assert.equal(isConvexJsonValue({ nested: [true, 1, "value"] }), true)
  assert.equal(isConvexJsonObject({ nested: [true, 1, "value"] }), true)
})

test("Convex JSON guards reject unsupported values", () => {
  assert.equal(isConvexJsonValue(undefined), false)
  assert.equal(
    isConvexJsonValue(() => undefined),
    false
  )
  assert.equal(isConvexJsonObject([]), false)
})

test("Convex JSON guards enforce nesting depth", () => {
  assert.equal(isConvexJsonValue([[[[[[["too-deep"]]]]]]]), false)
  assert.equal(isConvexJsonShallowValue(["ok"]), true)
  assert.equal(isConvexJsonShallowValue({ value: "ok" }), true)
  assert.equal(isConvexJsonShallowValue([["too-deep"]]), false)
  assert.equal(isConvexJsonShallowValue({ value: ["too-deep"] }), false)
  assert.equal(isConvexJsonShallowObject({ value: ["ok"] }), true)
})
