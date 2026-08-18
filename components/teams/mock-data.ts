/**
 * Fixture data for the /teams prototype. Everything here is in-memory only —
 * no database, no Gmail. The point is to pressure-test the interaction model
 * before committing to a schema.
 *
 * Message bodies are deliberately stored as the HTML a real mail client would
 * put on the wire — signature blocks, quoted history and all — so the reader
 * is exercised against the shape it will actually receive.
 */

import { htmlToText } from "@/components/email/html-frame"

export type MemberId = "priya" | "sam" | "alex" | "jordan"

export interface Member {
  id: MemberId
  name: string
  initials: string
  /** Tailwind classes for the avatar chip. */
  tint: string
  /** Cursor colour used by the collaborative editor. */
  color: string
  role: "owner" | "member"
  email: string
}

export const MEMBERS: Record<MemberId, Member> = {
  priya: {
    id: "priya",
    name: "Priya Mahey",
    initials: "PM",
    tint: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200",
    color: "#8b5cf6",
    role: "owner",
    email: "priya@loop.app",
  },
  sam: {
    id: "sam",
    name: "Sam Okafor",
    initials: "SO",
    tint: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200",
    color: "#0ea5e9",
    role: "member",
    email: "sam@loop.app",
  },
  alex: {
    id: "alex",
    name: "Alex Reyes",
    initials: "AR",
    tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
    color: "#10b981",
    role: "member",
    email: "alex@loop.app",
  },
  jordan: {
    id: "jordan",
    name: "Jordan Blake",
    initials: "JB",
    tint: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
    color: "#f59e0b",
    role: "member",
    email: "jordan@loop.app",
  },
}

export const MEMBER_LIST = Object.values(MEMBERS)

export interface Address {
  name: string
  email: string
}

export interface MessageAttachment {
  id: string
  filename: string
  mimeType: string
  size: number
}

export interface ThreadMessage {
  id: string
  from: Address & { external: boolean }
  to: Address[]
  cc?: Address[]
  sentAt: string
  /** The message as it arrived: HTML, signature and quoted history included. */
  bodyHtml: string
  attachments?: MessageAttachment[]
}

/** The message as prose — for previews, snippets and assistant context. */
export function messageText(message: ThreadMessage): string {
  return htmlToText(message.bodyHtml)
}

/** Every distinct address on a thread, in the order it first appears. */
export function threadParticipants(thread: SharedThread): Address[] {
  const seen = new Map<string, Address>()
  for (const message of thread.messages) {
    for (const address of [message.from, ...message.to, ...(message.cc ?? [])]) {
      if (!seen.has(address.email)) {
        seen.set(address.email, { name: address.name, email: address.email })
      }
    }
  }
  return [...seen.values()]
}

export interface ThreadComment {
  id: string
  author: MemberId
  body: string
  at: string
}

export type ThreadStatus = "open" | "waiting" | "closed"

export interface SharedThread {
  id: string
  subject: string
  /** The outside party this conversation is with. */
  counterparty: { name: string; company: string; email: string }
  sharedBy: MemberId
  sharedAt: string
  assignee: MemberId | null
  status: ThreadStatus
  /** Members watching without owning it. */
  watchers: MemberId[]
  labels: string[]
  messages: ThreadMessage[]
  comments: ThreadComment[]
  /** Members who have opened it — drives the per-person read indicator. */
  readBy: MemberId[]
  /** Seeds the collaborative draft the first time a room is opened. */
  draftSeed: string
}

export const THREADS: SharedThread[] = [
  {
    id: "renewal-northwind",
    subject: "Northwind renewal — pricing for the 40-seat tier",
    counterparty: {
      name: "Dana Whitfield",
      company: "Northwind",
      email: "dana@northwind.co",
    },
    sharedBy: "sam",
    sharedAt: "2026-08-06T09:12:00Z",
    assignee: "priya",
    status: "open",
    watchers: ["alex"],
    labels: ["renewal", "urgent"],
    readBy: ["sam", "priya"],
    messages: [
      {
        id: "m1",
        from: { name: "Dana Whitfield", email: "dana@northwind.co", external: true },
        to: [{ name: "Sam Okafor", email: "sam@loop.app" }],
        sentAt: "2026-08-05T16:40:00Z",
        bodyHtml: `<div dir="ltr"><p>Hi Sam,</p><p>Our renewal is coming up at the end of the month and we&#39;re planning to grow the team from 25 to about 40 people this quarter.</p><p>Two things we need before this can be signed off internally:</p><ol><li>A written breakdown of what the 40-seat tier costs us annually.</li><li>Confirmation that SSO is included at that tier rather than being a paid add-on.</li></ol><p>Our finance lead needs it by <strong>Friday</strong> to make the next approval cycle. Can you get something over?</p><p>Thanks,<br>Dana</p><table cellpadding="0" cellspacing="0" style="margin-top:18px"><tbody><tr><td style="padding-top:12px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280"><span style="font-weight:bold;color:#111827">Dana Whitfield</span><br>VP Operations &middot; Northwind<br><a href="mailto:dana@northwind.co">dana@northwind.co</a> &middot; +1 (415) 555-0142</td></tr></tbody></table></div>`,
      },
      {
        id: "m2",
        from: { name: "Sam Okafor", email: "sam@loop.app", external: false },
        to: [{ name: "Dana Whitfield", email: "dana@northwind.co" }],
        cc: [{ name: "Priya Mahey", email: "priya@loop.app" }],
        sentAt: "2026-08-05T18:02:00Z",
        bodyHtml: `<div dir="ltr"><p>Thanks Dana &mdash; got it.</p><p>Let me pull the exact numbers together and confirm the SSO question with the team. I&#39;ll have something with you well before Friday.</p><p>Best,<br>Sam</p></div><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Wed, 5 Aug 2026 at 16:40, Dana Whitfield &lt;<a href="mailto:dana@northwind.co">dana@northwind.co</a>&gt; wrote:<br></div><blockquote class="gmail_quote"><p>Hi Sam,</p><p>Our renewal is coming up at the end of the month and we&#39;re planning to grow the team from 25 to about 40 people this quarter.</p><p>Two things we need before this can be signed off internally: a written breakdown of what the 40-seat tier costs us annually, and confirmation that SSO is included at that tier rather than being a paid add-on.</p><p>Our finance lead needs it by Friday to make the next approval cycle.</p><p>Thanks,<br>Dana</p></blockquote></div>`,
      },
      {
        id: "m3",
        from: { name: "Dana Whitfield", email: "dana@northwind.co", external: true },
        to: [{ name: "Sam Okafor", email: "sam@loop.app" }],
        cc: [{ name: "Priya Mahey", email: "priya@loop.app" }],
        sentAt: "2026-08-06T08:55:00Z",
        attachments: [
          {
            id: "a1",
            filename: "Northwind-headcount-Q3.xlsx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            size: 41_233,
          },
        ],
        bodyHtml: `<div dir="ltr"><p>Appreciated. One more thing &mdash; if there&#39;s any flexibility on <strong>annual prepay</strong> we&#39;d be interested. We had budget approved for the year already.</p><p>I&#39;ve attached the headcount plan finance is working from so the seat count lines up with what you quote.</p><p>Dana</p></div><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Wed, 5 Aug 2026 at 18:02, Sam Okafor &lt;<a href="mailto:sam@loop.app">sam@loop.app</a>&gt; wrote:<br></div><blockquote class="gmail_quote"><p>Thanks Dana &mdash; got it. Let me pull the exact numbers together and confirm the SSO question with the team. I&#39;ll have something with you well before Friday.</p><p>Best,<br>Sam</p></blockquote></div>`,
      },
    ],
    comments: [
      {
        id: "c1",
        author: "sam",
        body: "Sharing this with the team — Dana needs numbers by Friday and I'm out Thursday. Priya can you own the reply?",
        at: "2026-08-06T09:13:00Z",
      },
      {
        id: "c2",
        author: "priya",
        body: "Taking it. SSO *is* included at 40 seats, I confirmed with Alex last week. The prepay discount is the open question.",
        at: "2026-08-06T09:41:00Z",
      },
      {
        id: "c3",
        author: "alex",
        body: "We can do 12% on annual prepay at that volume. Anything more needs sign-off. Don't put the ceiling in writing yet.",
        at: "2026-08-06T10:15:00Z",
      },
    ],
    draftSeed: `<p>Hi Dana,</p><p>Thanks for the detail, and for flagging the Friday deadline — here's everything your finance lead should need.</p><p><strong>40-seat tier:</strong> </p><p>SSO is included at this tier at no extra cost, so there's no add-on line item to account for.</p><p>On annual prepay — yes, there's room there. </p><p>Best,<br>Priya</p>`,
  },
  {
    id: "onboarding-lumen",
    subject: "Lumen Labs onboarding — kickoff scheduling + data migration",
    counterparty: {
      name: "Theo Barros",
      company: "Lumen Labs",
      email: "theo@lumenlabs.io",
    },
    sharedBy: "priya",
    sharedAt: "2026-08-05T14:05:00Z",
    assignee: null,
    status: "waiting",
    watchers: ["sam", "jordan"],
    labels: ["onboarding"],
    readBy: ["priya"],
    messages: [
      {
        id: "m1",
        from: { name: "Theo Barros", email: "theo@lumenlabs.io", external: true },
        to: [{ name: "Priya Mahey", email: "priya@loop.app" }],
        cc: [{ name: "Lumen Ops", email: "ops@lumenlabs.io" }],
        sentAt: "2026-08-05T13:20:00Z",
        bodyHtml: `<div dir="ltr"><p>Hi Priya,</p><p>Excited to get started. Before we book the kickoff, our ops team is asking how the data migration works in practice:</p><ul><li>How long does it usually take end to end?</li><li>Do we need to freeze writes while it runs?</li><li>Who from your side actually runs it &mdash; us, you, or both?</li></ul><p>Once we can answer those internally I can get the kickoff in the calendar.</p><p>Best,<br>Theo</p><table cellpadding="0" cellspacing="0" style="margin-top:18px"><tbody><tr><td style="padding-top:12px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280"><span style="font-weight:bold;color:#111827">Theo Barros</span><br>Head of Platform &middot; Lumen Labs<br><a href="https://lumenlabs.io">lumenlabs.io</a></td></tr></tbody></table></div>`,
      },
    ],
    comments: [
      {
        id: "c1",
        author: "priya",
        body: "Jordan — this is a migration question, can you take the technical half? I'll handle scheduling.",
        at: "2026-08-05T14:06:00Z",
      },
    ],
    draftSeed: `<p>Hi Theo,</p><p>Good questions — let me take these in order.</p><p></p><p>Happy to get the kickoff booked once you've had a chance to look this over.</p>`,
  },
  {
    id: "invoice-atlas",
    subject: "Atlas Freight — duplicate invoice on the July statement",
    counterparty: {
      name: "Marion Cole",
      company: "Atlas Freight",
      email: "ap@atlasfreight.com",
    },
    sharedBy: "jordan",
    sharedAt: "2026-08-04T11:30:00Z",
    assignee: "alex",
    status: "closed",
    watchers: [],
    labels: ["billing"],
    readBy: ["jordan", "alex", "priya", "sam"],
    messages: [
      {
        id: "m1",
        from: { name: "Marion Cole", email: "ap@atlasfreight.com", external: true },
        to: [{ name: "Loop Billing", email: "billing@loop.app" }],
        sentAt: "2026-08-04T10:58:00Z",
        attachments: [
          {
            id: "a1",
            filename: "Atlas-July-statement.pdf",
            mimeType: "application/pdf",
            size: 184_902,
          },
        ],
        bodyHtml: `<div dir="ltr"><p>Hello,</p><p>We&#39;ve been billed twice for July &mdash; these two lines on the statement look identical:</p><table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px;margin:12px 0"><thead><tr style="background:#f3f4f6"><th align="left" style="border:1px solid #e5e7eb">Invoice</th><th align="left" style="border:1px solid #e5e7eb">Issued</th><th align="right" style="border:1px solid #e5e7eb">Amount</th></tr></thead><tbody><tr><td style="border:1px solid #e5e7eb">#4471</td><td style="border:1px solid #e5e7eb">01 Jul 2026</td><td align="right" style="border:1px solid #e5e7eb">$4,180.00</td></tr><tr><td style="border:1px solid #e5e7eb">#4489</td><td style="border:1px solid #e5e7eb">03 Jul 2026</td><td align="right" style="border:1px solid #e5e7eb">$4,180.00</td></tr></tbody></table><p>Can someone check before we process payment? Full statement attached.</p><p>Regards,<br>Marion Cole<br>Accounts Payable, Atlas Freight</p></div>`,
      },
      {
        id: "m2",
        from: { name: "Alex Reyes", email: "alex@loop.app", external: false },
        to: [{ name: "Marion Cole", email: "ap@atlasfreight.com" }],
        cc: [{ name: "Loop Billing", email: "billing@loop.app" }],
        sentAt: "2026-08-04T12:15:00Z",
        bodyHtml: `<div dir="ltr"><p>Hi Marion,</p><p>You&#39;re right &mdash; <strong>#4489</strong> was issued in error and has now been voided. Nothing further is needed on your side: please process <strong>#4471</strong> only.</p><p>Apologies for the confusion.</p><p>Alex</p></div><div class="gmail_quote"><div dir="ltr" class="gmail_attr">On Tue, 4 Aug 2026 at 10:58, Marion Cole &lt;<a href="mailto:ap@atlasfreight.com">ap@atlasfreight.com</a>&gt; wrote:<br></div><blockquote class="gmail_quote"><p>We&#39;ve been billed twice for July &mdash; invoices #4471 and #4489 look identical. Can someone check before we process payment?</p><p>Regards,<br>Marion Cole</p></blockquote></div>`,
      },
    ],
    comments: [
      {
        id: "c1",
        author: "jordan",
        body: "Sharing so billing has a record. Alex sorted it same day.",
        at: "2026-08-04T12:20:00Z",
      },
    ],
    draftSeed: "<p></p>",
  },
]

export const STATUS_LABEL: Record<ThreadStatus, string> = {
  open: "Open",
  waiting: "Waiting",
  closed: "Closed",
}

export const STATUS_STYLE: Record<ThreadStatus, string> = {
  open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  waiting: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  closed: "bg-muted text-muted-foreground",
}
