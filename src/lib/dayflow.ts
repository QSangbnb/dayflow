import { z } from 'zod'

export const SupportedAttachmentType = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

export const DayFlowAttachment = z.object({
  name: z.string().trim().min(1).max(160),
  type: SupportedAttachmentType,
  data: z.string().startsWith('data:').max(12_000_000),
})

export const DayFlowRequest = z
  .object({
    text: z.string().trim().max(8_000),
    language: z.enum(['en', 'vi']),
    liveContext: z.boolean(),
    timezone: z.string().trim().min(1).max(80),
    localDateTime: z.string().trim().min(1).max(80),
    attachments: z.array(DayFlowAttachment).max(3),
  })
  .refine((value) => value.text.length >= 2 || value.attachments.length > 0, {
    message: 'Add a note, screenshot, or PDF.',
  })

const PlanTask = z.object({
  title: z.string(),
  details: z.string().nullable(),
  dueAt: z.string().nullable(),
  durationMinutes: z.number().int().min(5).max(480).nullable(),
  priority: z.enum(['high', 'medium', 'low']),
})

const PlanEvent = z.object({
  title: z.string(),
  startAt: z.string(),
  endAt: z.string().nullable(),
  location: z.string().nullable(),
  preparation: z.array(z.string()),
})

const PlanReminder = z.object({
  title: z.string(),
  remindAt: z.string().nullable(),
  reason: z.string(),
})

const ScheduleBlock = z.object({
  label: z.string(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  category: z.enum(['focus', 'admin', 'errand', 'meeting', 'personal', 'break']),
})

const ShoppingItem = z.object({
  name: z.string(),
  quantity: z.string().nullable(),
  category: z.string().nullable(),
})

const DraftReply = z.object({
  recipient: z.string().nullable(),
  message: z.string(),
  context: z.string(),
})

const SourceLink = z.object({
  title: z.string(),
  url: z.url(),
})

export const DayFlowPlan = z.object({
  title: z.string(),
  summary: z.string(),
  topPriority: z.string(),
  tasks: z.array(PlanTask),
  events: z.array(PlanEvent),
  reminders: z.array(PlanReminder),
  schedule: z.array(ScheduleBlock),
  shoppingList: z.array(ShoppingItem),
  draftReplies: z.array(DraftReply),
  clarifyingQuestions: z.array(z.string()),
  sourceLinks: z.array(SourceLink),
})

export type DayFlowRequestData = z.infer<typeof DayFlowRequest>
export type DayFlowPlanData = z.infer<typeof DayFlowPlan>

export function isAllowedDataUrl(type: z.infer<typeof SupportedAttachmentType>, data: string) {
  return data.startsWith(`data:${type};base64,`) && data.length <= 12_000_000
}

export function attachmentContentParts(attachments: DayFlowRequestData['attachments']) {
  return attachments.map((attachment) => {
    if (attachment.type === 'application/pdf') {
      return {
        type: 'file' as const,
        file: { filename: attachment.name, file_data: attachment.data },
      }
    }

    return {
      type: 'image_url' as const,
      image_url: { url: attachment.data },
    }
  })
}

export function planCounts(plan: DayFlowPlanData) {
  return {
    tasks: plan.tasks.length,
    events: plan.events.length,
    reminders: plan.reminders.length,
    shoppingItems: plan.shoppingList.length,
    replies: plan.draftReplies.length,
  }
}
