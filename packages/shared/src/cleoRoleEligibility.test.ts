import assert from "node:assert/strict"
import { test } from "node:test"
import {
  resolveCleoRoleEligibility,
  cleoRoleMetadata,
  CLEO_COMMUNITY_ROLES,
  CLEO_ROLE_FAQ,
  type CleoRoleEvidence,
} from "./cleoRoleEligibility"
const base: CleoRoleEvidence = {
  now: 1000000,
  verifiedAccount: true,
  officialGuildId: "official",
  communities: [],
  twitchActive: false,
  paidSupporter: false,
}
test("roles separate owners from administrators and exclude the official guild", () => {
  const community = {
    id: "independent",
    installed: true,
    verifiedAt: base.now,
    owner: true,
    administrator: true,
    premium: true,
  }
  const owner = resolveCleoRoleEligibility({
    ...base,
    communities: [community, { ...community, id: "official" }],
  })
  assert.equal(owner.member, "eligible")
  assert.equal(owner.communityOwner, "eligible")
  assert.equal(owner.premiumCommunityOwner, "eligible")
  assert.equal(owner.communityManager, "notEligible")
  const stacked = resolveCleoRoleEligibility({
    ...base,
    communities: [community, { ...community, id: "another", owner: false }],
  })
  assert.equal(stacked.communityManager, "eligible")
  assert.equal(stacked.premiumCommunityManager, "eligible")
  const free = resolveCleoRoleEligibility({
    ...base,
    communities: [
      { ...community, premium: false },
      { ...community, id: "another", owner: false, premium: false },
    ],
  })
  assert.equal(free.communityOwner, "eligible")
  assert.equal(free.premiumCommunityOwner, "notEligible")
  assert.equal(free.communityManager, "eligible")
  assert.equal(free.premiumCommunityManager, "notEligible")
  for (const evidence of [
    { ...base, communities: [{ ...community, id: "official" }] },
    { ...base, communities: [{ ...community, installed: false }] },
    {
      ...base,
      communities: [{ ...community, owner: false, administrator: false }],
    },
    { ...base, communities: [{ ...community, verifiedAt: base.now + 1 }] },
  ])
    assert.equal(
      resolveCleoRoleEligibility(evidence).communityOwner,
      "notEligible"
    )
  const revoked = resolveCleoRoleEligibility({
    ...base,
    verifiedAccount: false,
    communities: [community],
  })
  assert.equal(revoked.member, "notEligible")
  assert.equal(revoked.communityOwner, "notEligible")
  assert.equal(revoked.discordBotUser, "notEligible")
  assert.equal(
    resolveCleoRoleEligibility({ ...base, officialGuildId: undefined })
      .communityOwner,
    "unavailable"
  )
  assert.equal(
    resolveCleoRoleEligibility({
      ...base,
      communities: [{ ...community, verifiedAt: base.now - 300000 }],
    }).communityOwner,
    "verificationNeeded"
  )
})
test("paid contracts, current installations and Twitch connections are independent", () => {
  const unavailable = resolveCleoRoleEligibility(base)
  assert.equal(unavailable.personalPremium, "unavailable")
  assert.equal(unavailable.creatorPro, "unavailable")
  assert.equal(unavailable.discordBotUser, "notEligible")
  for (const paid of [true, false]) {
    const roles = resolveCleoRoleEligibility({
      ...base,
      personalPaid: paid,
      creatorPaid: paid,
      paidSupporter: paid,
      twitchActive: paid,
    })
    assert.equal(roles.personalPremium, paid ? "eligible" : "notEligible")
    assert.equal(roles.creatorPro, paid ? "eligible" : "notEligible")
    assert.equal(roles.premiumSupporter, paid ? "eligible" : "notEligible")
    assert.equal(roles.twitchBotUser, paid ? "eligible" : "notEligible")
  }
  for (const state of ["active", "uncertain", "revoked"] as const)
    for (const expiresAt of [base.now, base.now + 1])
      assert.equal(
        resolveCleoRoleEligibility({
          ...base,
          installation: { state, expiresAt },
        }).discordBotUser,
        state === "active" && expiresAt > base.now
          ? "eligible"
          : state === "revoked"
            ? "notEligible"
            : "verificationNeeded"
      )
  for (const status of [
    "eligible",
    "notEligible",
    "verificationNeeded",
    "unavailable",
  ] as const) {
    const roles = Object.fromEntries(
      CLEO_COMMUNITY_ROLES.map((role) => [role, status])
    )
    const metadata = cleoRoleMetadata({ ...unavailable, ...roles })
    assert.equal(metadata.personal_premium, status === "eligible" ? "1" : "0")
    assert.equal(metadata.creator_pro, metadata.personal_premium)
    assert.equal(metadata.premium_supporter, metadata.personal_premium)
    assert.equal(
      metadata.community_owner_tier,
      status === "eligible" ? "2" : "0"
    )
    assert.equal(metadata.community_manager_tier, metadata.community_owner_tier)
  }
  const standard = cleoRoleMetadata({
    ...unavailable,
    communityOwner: "eligible",
    communityManager: "eligible",
  })
  assert.equal(standard.community_owner_tier, "1")
  assert.equal(standard.community_manager_tier, "1")
  assert.match(CLEO_ROLE_FAQ, /never give ownership/)
})
