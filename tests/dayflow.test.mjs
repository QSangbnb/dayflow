import assert from 'node:assert/strict'
import test from 'node:test'
import {
  attachmentContentParts,
  DayFlowPlan,
  DayFlowRequest,
  isAllowedDataUrl,
  planCounts,
} from '../dist/lib/dayflow.js'

const validRequest = {
  text: 'Doctor on Friday at 8. Bring the test results.',
  language: 'en',
  liveContext: false,
  timezone: 'Asia/Ho_Chi_Minh',
  localDateTime: '2026-09-20T08:00:00+07:00',
  attachments: [],
}

const validPlan = {
  title: 'Friday plan',
  summary: 'A short plan.',
  topPriority: 'Prepare test results.',
  tasks: [{ title: 'Pack results', details: null, dueAt: null, durationMinutes: 10, priority: 'high' }],
  events: [],
  reminders: [],
  schedule: [],
  shoppingList: [],
  draftReplies: [],
  clarifyingQuestions: [],
  sourceLinks: [],
}

test('request accepts text input without an attachment', () => {
  assert.equal(DayFlowRequest.parse(validRequest).text, validRequest.text)
})

test('request requires either text or an attachment', () => {
  assert.equal(DayFlowRequest.safeParse({ ...validRequest, text: '' }).success, false)
})

test('attachment MIME type must match the data URL', () => {
  assert.equal(isAllowedDataUrl('image/png', 'data:image/png;base64,AAAA'), true)
  assert.equal(isAllowedDataUrl('image/png', 'data:application/pdf;base64,AAAA'), false)
})

test('PDF attachments become file-parser content parts', () => {
  const parts = attachmentContentParts([
    { name: 'schedule.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,AAAA' },
  ])
  assert.equal(parts[0].type, 'file')
  assert.equal(parts[0].file.filename, 'schedule.pdf')
})

test('plan schema and count summary stay predictable', () => {
  const plan = DayFlowPlan.parse(validPlan)
  assert.deepEqual(planCounts(plan), { tasks: 1, events: 0, reminders: 0, shoppingItems: 0, replies: 0 })
})
