import assert from "node:assert/strict"
import { test } from "node:test"

import {
  normalizeSupportStaffRoleIds,
  normalizeSupportTargetId,
} from "./update"

const roleId = "123456789012345678"
const targetId = "234567890123456789"

test("guild support routing normalizes Discord IDs", () => {
  assert.deepEqual(normalizeSupportStaffRoleIds([` ${roleId} `, ""]), [roleId])
  assert.equal(normalizeSupportTargetId(` ${targetId} `), targetId)
  assert.equal(normalizeSupportTargetId("  "), undefined)
  assert.equal(normalizeSupportTargetId(null), undefined)
})

test("guild support routing rejects invalid or duplicate IDs", () => {
  assert.throws(() => normalizeSupportStaffRoleIds(["invalid"]))
  assert.throws(() => normalizeSupportStaffRoleIds([roleId, roleId]))
  assert.throws(() =>
    normalizeSupportStaffRoleIds(
      Array.from({ length: 21 }, (_, index) =>
        String(123_456_789_012_345_000n + BigInt(index))
      )
    )
  )
  assert.throws(() => normalizeSupportTargetId("invalid"))
})
