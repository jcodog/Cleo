"use client"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import Link from "next/link"
const questions = [
  [
    "What are Linked Roles?",
    "Linked Roles show your verified connection to Cleo and independent communities, such as owning a community, managing one or supporting its Premium subscription. Roles can stack when you qualify for more than one.",
  ],
  [
    "How do I claim a role?",
    "Open the Cleo server in Discord, choose a Linked Role and complete verification when Discord asks. Sign in with the Discord account linked to Cleo.",
  ],
  [
    "Why hasn't my role appeared yet?",
    "Discord verification and role updates can take a little time. Check that you are using your linked account, that you meet the requirements and that you have claimed the role in Discord.",
  ],
  [
    "What do Community Owner and Community Manager mean?",
    "Community Owner means you own an independent server using Cleo. Community Manager means you have Administrator permission in an independent server using Cleo. Manage Server alone does not qualify. Premium versions also require that community's active Premium coverage.",
  ],
  [
    "Do these roles give me permissions in Cleo's server?",
    "No. Community Owner and Community Manager do not grant ownership, staff status or permissions in Cleo's official Discord server. They describe your relationship with independent communities.",
  ],
  [
    "What happens if I disconnect or lose eligibility?",
    "Disconnecting your Discord verification or losing the required installation, permissions, subscription or consent removes the corresponding eligibility. Other roles remain independent. Premium Supporter recognition is optional.",
  ],
] as const
export function AccountRoles() {
  return (
    <div className="max-w-2xl space-y-8">
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <Link
          href="/discord/linked-role"
          className="font-medium text-primary underline underline-offset-4"
        >
          Verify Discord Linked Roles
        </Link>
        <p>
          Show your connection to Cleo and the communities you support through
          Discord Linked Roles.
        </p>
        <p>
          Open the Cleo server in Discord, choose a Linked Role and complete
          verification when Discord asks.
        </p>
      </div>
      <section aria-labelledby="linked-roles-faq">
        <h2
          id="linked-roles-faq"
          className="mb-3 font-heading text-base font-medium"
        >
          Frequently asked questions
        </h2>
        <Accordion>
          {questions.map(([question, answer]) => (
            <AccordionItem key={question} value={question}>
              <AccordionTrigger className="gap-4 py-4">
                {question}
              </AccordionTrigger>
              <AccordionContent className="pr-6 pb-4 leading-relaxed text-muted-foreground">
                {answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  )
}
