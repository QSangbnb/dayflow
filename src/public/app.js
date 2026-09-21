const form = document.querySelector('#dayflow-form')
const captureInput = document.querySelector('#capture-input')
const characterCount = document.querySelector('#character-count')
const languageInput = document.querySelector('#language-input')
const liveContextInput = document.querySelector('#live-context')
const accessCodeInput = document.querySelector('#access-code')
const organizeButton = document.querySelector('#organize-button')
const formError = document.querySelector('#form-error')
const attachButton = document.querySelector('#attach-button')
const fileInput = document.querySelector('#file-input')
const dropZone = document.querySelector('#drop-zone')
const attachmentList = document.querySelector('#attachment-list')
const voiceButton = document.querySelector('#voice-button')
const emptyState = document.querySelector('#empty-state')
const loadingState = document.querySelector('#loading-state')
const resultState = document.querySelector('#result-state')
const loadingTitle = document.querySelector('#loading-title')
const loadingCopy = document.querySelector('#loading-copy')
const planActions = document.querySelector('#plan-actions')
const planTitle = document.querySelector('#plan-title')
const planSummary = document.querySelector('#plan-summary')
const topPriority = document.querySelector('#top-priority')
const groundingBadge = document.querySelector('#grounding-badge')
const statsRow = document.querySelector('#stats-row')
const planSections = document.querySelector('#plan-sections')
const copyPlanButton = document.querySelector('#copy-plan')
const calendarPlanButton = document.querySelector('#calendar-plan')
const downloadPlanButton = document.querySelector('#download-plan')
const toast = document.querySelector('#toast')

const MAX_FILE_BYTES = 8 * 1024 * 1024
const ALLOWED_FILE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const LAST_PLAN_KEY = 'dayflow-last-plan-v1'
const ACCESS_CODE_KEY = 'dayflow-demo-code'

const samples = {
  en: {
    appointment:
      'Friday at 8:00 AM I have a doctor appointment at City Clinic. Bring my blood test results. Reply to Lan before lunch and ask her to move our coffee to 2:30 PM. Buy toothpaste on the way home.',
    'busy-day':
      'Tomorrow: finish the presentation before 10, call the landlord sometime in the morning, gym for 45 minutes, pick up the package before 6 PM, and remember to pay the internet bill.',
    trip:
      'Flight leaves Monday at 07:15. I need to check in the day before, charge my power bank, download the hotel booking, pack medicine and leave enough time to reach the airport.',
  },
  vi: {
    appointment:
      'Thứ Sáu lúc 8 giờ sáng tôi có lịch khám tại Phòng khám Thành phố. Nhớ mang kết quả xét nghiệm. Trả lời Lan trước buổi trưa và xin chuyển lịch cà phê sang 14:30. Mua kem đánh răng trên đường về.',
    'busy-day':
      'Ngày mai: hoàn thành bài thuyết trình trước 10 giờ, gọi chủ nhà vào buổi sáng, tập gym 45 phút, lấy bưu kiện trước 18 giờ và nhớ thanh toán tiền internet.',
    trip:
      'Chuyến bay khởi hành thứ Hai lúc 07:15. Tôi cần check-in từ hôm trước, sạc pin dự phòng, tải xác nhận khách sạn, chuẩn bị thuốc và chừa đủ thời gian đi sân bay.',
  },
}

const loadingMessages = [
  ['Reading the details...', 'Finding dates, commitments and the clearest next steps.'],
  ['Structuring your day...', 'Separating tasks, events, reminders and replies.'],
  ['Checking for missing details...', 'Keeping uncertainty visible instead of guessing.'],
]

let attachments = []
let currentResponse = null
let loadingTimer = null
let toastTimer = null
let speechRecognition = null

initialize()

function initialize() {
  const savedCode = sessionStorage.getItem(ACCESS_CODE_KEY)
  if (savedCode) accessCodeInput.value = savedCode
  updateCharacterCount()
  setupSpeechRecognition()
  restoreLastPlan()
}

captureInput.addEventListener('input', updateCharacterCount)
attachButton.addEventListener('click', () => fileInput.click())
dropZone.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', async () => {
  await addFiles(Array.from(fileInput.files || []))
  fileInput.value = ''
})

for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    dropZone.classList.add('dragging')
  })
}
for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    dropZone.classList.remove('dragging')
  })
}
dropZone.addEventListener('drop', async (event) => {
  await addFiles(Array.from(event.dataTransfer?.files || []))
})

for (const button of document.querySelectorAll('[data-sample]')) {
  button.addEventListener('click', () => {
    const language = languageInput.value === 'vi' ? 'vi' : 'en'
    captureInput.value = samples[language][button.dataset.sample] || ''
    updateCharacterCount()
    captureInput.focus()
  })
}

form.addEventListener('submit', handleSubmit)
copyPlanButton.addEventListener('click', copyCurrentPlan)
calendarPlanButton.addEventListener('click', downloadCalendar)
downloadPlanButton.addEventListener('click', downloadCurrentPlan)

async function handleSubmit(event) {
  event.preventDefault()
  const text = captureInput.value.trim()
  if (text.length < 2 && attachments.length === 0) {
    showFormError('Add a note, screenshot, or PDF first.')
    captureInput.focus()
    return
  }

  showFormError('')
  setView('loading')
  organizeButton.disabled = true
  startLoadingMessages()

  const accessCode = accessCodeInput.value.trim()
  if (accessCode) sessionStorage.setItem(ACCESS_CODE_KEY, accessCode)
  else sessionStorage.removeItem(ACCESS_CODE_KEY)

  try {
    const response = await fetch('/api/organize', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(accessCode ? { 'x-demo-access-code': accessCode } : {}),
      },
      body: JSON.stringify({
        text,
        language: languageInput.value,
        liveContext: liveContextInput.checked,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        localDateTime: new Date().toString(),
        attachments,
      }),
    })
    const body = await readJsonResponse(response)
    if (!response.ok) throw new Error(body.error || 'DayFlow could not organize this input.')

    currentResponse = body
    localStorage.setItem(LAST_PLAN_KEY, JSON.stringify(body))
    renderPlan(body)
    setView('result')
  } catch (error) {
    setView('empty')
    showFormError(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
  } finally {
    stopLoadingMessages()
    organizeButton.disabled = false
  }
}

async function addFiles(files) {
  showFormError('')
  const available = Math.max(0, 3 - attachments.length)
  if (available === 0) {
    showFormError('You can attach up to 3 files.')
    return
  }

  for (const file of files.slice(0, available)) {
    if (!ALLOWED_FILE_TYPES.has(file.type)) {
      showFormError(`${file.name} is not a supported image or PDF.`)
      continue
    }
    if (file.size > MAX_FILE_BYTES) {
      showFormError(`${file.name} is larger than 8 MB.`)
      continue
    }
    const data = await readFileAsDataUrl(file)
    attachments.push({ name: file.name.slice(0, 160), type: file.type, data })
  }
  renderAttachments()
}

function renderAttachments() {
  attachmentList.replaceChildren()
  attachments.forEach((file, index) => {
    const row = element('div', 'attachment-item')
    const label = element('span', '', `${file.type === 'application/pdf' ? 'PDF' : 'IMAGE'} · ${file.name}`)
    const remove = element('button', '', 'Remove')
    remove.type = 'button'
    remove.addEventListener('click', () => {
      attachments.splice(index, 1)
      renderAttachments()
    })
    row.append(label, remove)
    attachmentList.append(row)
  })
}

function setupSpeechRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Recognition) {
    voiceButton.disabled = true
    voiceButton.title = 'Voice dictation is not supported in this browser'
    return
  }

  speechRecognition = new Recognition()
  speechRecognition.continuous = false
  speechRecognition.interimResults = true
  speechRecognition.onstart = () => voiceButton.classList.add('listening')
  speechRecognition.onend = () => voiceButton.classList.remove('listening')
  speechRecognition.onerror = () => {
    voiceButton.classList.remove('listening')
    showFormError('Voice dictation could not start. Check browser microphone permission.')
  }
  speechRecognition.onresult = (event) => {
    const words = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ')
    if (words) {
      captureInput.value = `${captureInput.value.trim()} ${words}`.trim().slice(0, 8000)
      updateCharacterCount()
    }
  }

  voiceButton.addEventListener('click', () => {
    speechRecognition.lang = languageInput.value === 'vi' ? 'vi-VN' : 'en-US'
    if (voiceButton.classList.contains('listening')) speechRecognition.stop()
    else speechRecognition.start()
  })
}

function renderPlan(response) {
  const { plan, counts, meta } = response
  planTitle.textContent = plan.title
  planSummary.textContent = plan.summary
  topPriority.textContent = plan.topPriority
  groundingBadge.textContent = meta.grounded ? 'Live context used' : 'Input only'
  renderStats(counts)
  planSections.replaceChildren()

  addScheduleSection(plan.schedule)
  addTaskSection(plan.tasks)
  addEventSection(plan.events)
  addReminderSection(plan.reminders)
  addShoppingSection(plan.shoppingList)
  addReplySection(plan.draftReplies)
  addQuestionSection(plan.clarifyingQuestions)
  addSourceSection(plan.sourceLinks)
}

function renderStats(counts) {
  const stats = [
    [counts.tasks, 'Tasks'],
    [counts.events, 'Events'],
    [counts.reminders, 'Reminders'],
    [counts.shoppingItems, 'Items'],
    [counts.replies, 'Replies'],
  ]
  statsRow.replaceChildren()
  for (const [number, label] of stats) {
    const card = element('div', 'stat-card')
    card.append(element('b', '', String(number)), element('span', '', label))
    statsRow.append(card)
  }
}

function addScheduleSection(items) {
  addSection('Suggested flow', items, (item, index) => {
    const row = basePlanItem(String(index + 1).padStart(2, '0'))
    const main = element('div', 'plan-item-main')
    main.append(element('strong', '', item.label), element('p', '', labelForCategory(item.category)))
    row.append(main, element('span', 'plan-item-meta', formatRange(item.startAt, item.endAt)))
    return row
  })
}

function addTaskSection(items) {
  addSection('Tasks', items, (item) => {
    const row = element('div', 'plan-item')
    const check = element('button', 'plan-item-marker', '✓')
    check.type = 'button'
    check.title = 'Mark task complete'
    check.addEventListener('click', () => row.classList.toggle('done'))
    const main = element('div', 'plan-item-main')
    main.append(element('strong', '', item.title))
    if (item.details) main.append(element('p', '', item.details))
    const meta = element('span', `plan-item-meta priority-${item.priority}`, taskMeta(item))
    row.append(check, main, meta)
    return row
  })
}

function addEventSection(items) {
  addSection('Events', items, (item) => {
    const row = basePlanItem('EV')
    const main = element('div', 'plan-item-main')
    main.append(element('strong', '', item.title))
    const details = [item.location, item.preparation.length ? `Prepare: ${item.preparation.join(', ')}` : ''].filter(Boolean).join(' · ')
    if (details) main.append(element('p', '', details))
    row.append(main, element('span', 'plan-item-meta', formatRange(item.startAt, item.endAt)))
    return row
  })
}

function addReminderSection(items) {
  addSection('Reminders', items, (item) => {
    const row = basePlanItem('R')
    const main = element('div', 'plan-item-main')
    main.append(element('strong', '', item.title), element('p', '', item.reason))
    row.append(main, element('span', 'plan-item-meta', formatDate(item.remindAt)))
    return row
  })
}

function addShoppingSection(items) {
  addSection('Shopping list', items, (item) => {
    const row = basePlanItem('＋')
    const main = element('div', 'plan-item-main')
    main.append(element('strong', '', item.name))
    if (item.category) main.append(element('p', '', item.category))
    row.append(main, element('span', 'plan-item-meta', item.quantity || ''))
    return row
  })
}

function addReplySection(items) {
  addSection('Replies ready for review', items, (item) => {
    const row = basePlanItem('↗')
    const main = element('div', 'plan-item-main')
    main.append(element('strong', '', item.recipient ? `To ${item.recipient}` : 'Draft reply'), element('p', '', item.context))
    const reply = element('div', 'reply-box', item.message)
    const copy = element('button', 'plan-item-marker', '⧉')
    copy.type = 'button'
    copy.title = 'Copy this reply'
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(item.message)
      showToast('Reply copied')
    })
    row.replaceChildren(copy, main, reply)
    return row
  })
}

function addQuestionSection(items) {
  addSection('Check these details', items, (item, index) => {
    const row = basePlanItem('?')
    const main = element('div', 'plan-item-main')
    main.append(element('strong', '', item))
    row.append(main, element('span', 'plan-item-meta', `Question ${index + 1}`))
    return row
  })
}

function addSourceSection(items) {
  addSection('Live sources', items, (item) => {
    const row = basePlanItem('↗')
    const main = element('div', 'plan-item-main')
    const link = element('a', 'source-link', item.title || item.url)
    if (isSafeHttpUrl(item.url)) {
      link.href = item.url
      link.target = '_blank'
      link.rel = 'noreferrer noopener'
    }
    main.append(link, element('p', '', item.url))
    row.append(main)
    return row
  })
}

function addSection(title, items, renderItem) {
  if (!Array.isArray(items) || items.length === 0) return
  const section = element('section', 'plan-section')
  const header = element('div', 'plan-section-header')
  header.append(element('h4', '', title), element('span', '', `${items.length} ${items.length === 1 ? 'item' : 'items'}`))
  const list = element('div', 'plan-list')
  items.forEach((item, index) => list.append(renderItem(item, index)))
  section.append(header, list)
  planSections.append(section)
}

function basePlanItem(marker) {
  const row = element('div', 'plan-item')
  row.append(element('span', 'plan-item-marker', marker))
  return row
}

function setView(view) {
  emptyState.classList.toggle('hidden', view !== 'empty')
  loadingState.classList.toggle('hidden', view !== 'loading')
  resultState.classList.toggle('hidden', view !== 'result')
  planActions.classList.toggle('hidden', view !== 'result')
}

function startLoadingMessages() {
  let index = 0
  setLoadingMessage(index)
  loadingTimer = window.setInterval(() => {
    index = (index + 1) % loadingMessages.length
    setLoadingMessage(index)
  }, 2600)
}

function stopLoadingMessages() {
  if (loadingTimer) window.clearInterval(loadingTimer)
  loadingTimer = null
}

function setLoadingMessage(index) {
  const [title, copy] = loadingMessages[index]
  loadingTitle.textContent = title
  loadingCopy.textContent = copy
}

async function copyCurrentPlan() {
  if (!currentResponse) return
  await navigator.clipboard.writeText(planAsText(currentResponse.plan))
  showToast('Plan copied')
}

function downloadCurrentPlan() {
  if (!currentResponse) return
  downloadBlob(
    JSON.stringify(currentResponse, null, 2),
    `dayflow-${new Date().toISOString().slice(0, 10)}.json`,
    'application/json',
  )
  showToast('JSON downloaded')
}

function downloadCalendar() {
  if (!currentResponse) return
  const events = [...currentResponse.plan.events]
  for (const task of currentResponse.plan.tasks) {
    if (task.dueAt) {
      events.push({ title: task.title, startAt: task.dueAt, endAt: null, location: null, preparation: [] })
    }
  }
  const valid = events.filter((item) => toIcsDate(item.startAt))
  if (!valid.length) {
    showToast('No dated items to add yet')
    return
  }

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DayFlow//Personal Operations Agent//EN', 'CALSCALE:GREGORIAN']
  valid.forEach((item, index) => {
    const start = toIcsDate(item.startAt)
    const end = toIcsDate(item.endAt) || toIcsDate(new Date(new Date(item.startAt).getTime() + 30 * 60_000).toISOString())
    lines.push(
      'BEGIN:VEVENT',
      `UID:${Date.now()}-${index}@dayflow`,
      `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeIcs(item.title)}`,
      ...(item.location ? [`LOCATION:${escapeIcs(item.location)}`] : []),
      'END:VEVENT',
    )
  })
  lines.push('END:VCALENDAR')
  downloadBlob(lines.join('\r\n'), 'dayflow-plan.ics', 'text/calendar;charset=utf-8')
  showToast('Calendar file downloaded')
}

function restoreLastPlan() {
  try {
    const stored = JSON.parse(localStorage.getItem(LAST_PLAN_KEY) || 'null')
    if (!stored?.plan || !stored?.counts || !stored?.meta) return
    currentResponse = stored
    renderPlan(stored)
    setView('result')
  } catch {
    localStorage.removeItem(LAST_PLAN_KEY)
  }
}

function planAsText(plan) {
  const blocks = [`# ${plan.title}`, plan.summary, `\nDO THIS FIRST\n${plan.topPriority}`]
  if (plan.tasks.length) blocks.push(`\nTASKS\n${plan.tasks.map((item) => `- ${item.title}${item.dueAt ? ` — ${formatDate(item.dueAt)}` : ''}`).join('\n')}`)
  if (plan.events.length) blocks.push(`\nEVENTS\n${plan.events.map((item) => `- ${item.title} — ${formatRange(item.startAt, item.endAt)}`).join('\n')}`)
  if (plan.reminders.length) blocks.push(`\nREMINDERS\n${plan.reminders.map((item) => `- ${item.title}${item.remindAt ? ` — ${formatDate(item.remindAt)}` : ''}`).join('\n')}`)
  if (plan.shoppingList.length) blocks.push(`\nSHOPPING\n${plan.shoppingList.map((item) => `- ${item.name}${item.quantity ? ` (${item.quantity})` : ''}`).join('\n')}`)
  return blocks.join('\n')
}

function formatDate(value) {
  if (!value) return 'Time not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(languageInput.value === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function formatRange(start, end) {
  if (!start && !end) return 'Flexible'
  if (!end) return formatDate(start)
  return `${formatDate(start)} → ${new Intl.DateTimeFormat(languageInput.value === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date(end))}`
}

function taskMeta(task) {
  const parts = [task.priority]
  if (task.durationMinutes) parts.push(`${task.durationMinutes} min`)
  if (task.dueAt) parts.push(formatDate(task.dueAt))
  return parts.join(' · ')
}

function labelForCategory(category) {
  return ({ focus: 'Focus work', admin: 'Admin', errand: 'Errand', meeting: 'Meeting', personal: 'Personal', break: 'Recovery break' })[category] || category
}

function updateCharacterCount() {
  characterCount.textContent = `${captureInput.value.length.toLocaleString()} / 8,000`
}

function showFormError(message) {
  formError.textContent = message
}

function showToast(message) {
  toast.textContent = message
  toast.classList.add('visible')
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2200)
}

function element(tag, className = '', text = '') {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

async function readJsonResponse(response) {
  const text = await response.text()
  if (!text) throw new Error('The server returned an empty response.')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('The server returned an invalid response.')
  }
}

function isSafeHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function toIcsDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function escapeIcs(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}
