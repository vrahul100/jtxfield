// reply.ts — Deterministic bilingual templates. No LLM calls: composing a reply is a
// pure function of the chosen action + record, so wording stays predictable and free.

import type { Action, WorkRecord } from './record.ts'
import { DEV_MODE, stripThinking } from './io.ts'

export interface ProjectOption { id: number; name: string }

const isGenericWork = (str: string) => {
    const s = (str || '').toLowerCase().trim()
    return !s || s === 'work' || s === 'your' || s === 'general' || s === 'site work' || s === 'site photo work' || s === 'trabajo'
}

const MESSAGES = {
    en: {
        greeting: '👋 Hello! Ready to log your work?\n\nSend a photo, voice note, or describe what you worked on.',
        collectWork: '🔧 *What kind of work did you do?*\n\nAlso tell me how many hours.\n(Example: "electrical for 6 hours")',
        askHours: (wt: string, proj: string) =>
            `📸 Work photo and details received for project: ${proj || 'General Project'}.\n\nTask logged: ${wt}\n\nPlease reply with the number of hours spent on this task to finalize the ticket.`,
        clarify: (proj: string, id: number | string) =>
            `✅ Field Update Received.\n\nProject: ${proj || 'General Project'}\nSubmission ID: #${id}\n\nYour photo and task notes have been securely uploaded to the supervisor dashboard.`,
        askFix: '🤔 What should I change?',
        confirm: (wt: string, h: number, proj: string) => `📝 ${wt}, ${h}h — ${proj}`,
        selectProject: (_wt: string, _h: number, list: string, _count: number) =>
            `📌 *SELECT PROJECT*\n\n${list}`,
        success: (wt: string, h: number, proj: string, id: number | string) => {
            const formattedHours = h % 1 === 0 ? `${h}` : h.toFixed(1)
            return `✅ Daily Work Log Updated.\n\nTask: ${wt}\nDuration: ${formattedHours} hours\nProject: ${proj || 'General Project'}\nConfirmation ID: #${id}\n\nYour submission has been recorded in the daily site report.`
        },
        flagged: (proj: string, id: number | string) =>
            `✅ Field Update Received.\n\nProject: ${proj || 'General Project'}\nSubmission ID: #${id}\n\nYour photo and task notes have been securely uploaded to the supervisor dashboard.`,
        noProjects: '❌ No projects available',
    },
    es: {
        greeting: '👋 ¡Hola! Envía una foto, nota de voz o describe tu trabajo.',
        collectWork: '🔧 Describe tu trabajo y horas.',
        askHours: (wt: string, proj: string) =>
            `📸 Foto y detalles de trabajo recibidos para el proyecto: ${proj || 'General Project'}.\n\nTarea registrada: ${wt}\n\nPor favor responde con el número de horas trabajadas para finalizar el ticket.`,
        clarify: (proj: string, id: number | string) =>
            `✅ Actualización de Campo Recibida.\n\nProyecto: ${proj || 'General Project'}\nID de Envío: #${id}\n\nTu foto y notas de la tarea han sido enviadas al panel del supervisor.`,
        askFix: '🤔 ¿Qué quieres cambiar?',
        confirm: (wt: string, h: number, proj: string) => `📝 ${wt}, ${h}h — ${proj}`,
        selectProject: (_wt: string, _h: number, list: string, _count: number) =>
            `📌 *SELECCIONA PROYECTO*\n\n${list}`,
        success: (wt: string, h: number, proj: string, id: number | string) => {
            const formattedHours = h % 1 === 0 ? `${h}` : h.toFixed(1)
            return `✅ Registro de Trabajo Actualizado.\n\nTarea: ${wt}\nDuración: ${formattedHours} horas\nProyecto: ${proj || 'General Project'}\nID de Confirmación: #${id}\n\nTu reporte ha sido registrado en el informe diario de la obra.`
        },
        flagged: (proj: string, id: number | string) =>
            `✅ Actualización de Campo Recibida.\n\nProyecto: ${proj || 'General Project'}\nID de Envío: #${id}\n\nTu foto y notas de la tarea han sido enviadas al panel del supervisor.`,
        noProjects: '❌ No hay proyectos disponibles',
    },
}

function numberHint(count: number, orWord: string): string {
    if (count <= 1) return '1'
    if (count === 2) return `1 ${orWord} 2`
    return Array.from({ length: count }, (_, i) => i + 1).join(', ').replace(/, ([^,]*)$/, `, ${orWord} $1`)
}

function formatTicketCode(bucketId: number, companyCode?: string): string {
    const prefix = (companyCode || 'ACE').trim().toUpperCase()
    return `${prefix}-${10000 + bucketId}`
}

function withTicket(_bucketId: number, response: string, _companyCode?: string): string {
    return response
}

function withDev(_bucketId: number, response: string, _action: Action, _rec: WorkRecord, _companyCode?: string, _elapsedMs?: number): string {
    return response
}

export interface ComposeExtras {
    bucketId: number
    companyCode?: string
    projects: ProjectOption[]
    imageAnalysis: string
    elapsedMs?: number
}

// Build the outgoing WhatsApp message for a non-terminal action.
export function composeReply(action: Action, rec: WorkRecord, extras: ComposeExtras): string {
    const m = MESSAGES[rec.language]
    const rawWt = stripThinking(rec.summary || rec.workType)
    const wt = isGenericWork(rawWt) ? 'Field Work' : rawWt
    const h = rec.hours || 0
    const proj = stripThinking(rec.projectName) || 'General Project'

    let body: string
    switch (action.type) {
        case 'GREET':
            body = m.greeting
            break
        case 'ASK_HOURS':
            body = m.askHours(wt, proj)
            break
        case 'CLARIFY_INCONSISTENCY':
            body = m.clarify(proj, extras.bucketId)
            break
        case 'ASK_FIX':
            body = m.askFix
            break
        case 'CONFIRM':
            body = m.confirm(wt, h, proj)
            break
        case 'SELECT_PROJECT': {
            const list = extras.projects.length
                ? extras.projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n')
                : m.noProjects
            body = m.selectProject(wt, h, list, extras.projects.length)
            break
        }
        case 'FLAG_FOR_REVIEW':
            body = m.flagged(proj, extras.bucketId)
            break
        default:
            body = m.askHours(wt, proj)
    }
    return withDev(extras.bucketId, body, action, rec, extras.companyCode, extras.elapsedMs)
}

// The final "logged!" confirmation after a successful submit (Template A).
export function composeSuccess(rec: WorkRecord, projectName: string, extras: ComposeExtras): string {
    const m = MESSAGES[rec.language]
    const rawWt = stripThinking(rec.summary || rec.workType)
    const wt = rawWt && !isGenericWork(rawWt) ? rawWt : (rawWt || 'Field Work')
    const proj = stripThinking(projectName) || 'General Project'
    const body = m.success(wt, rec.hours || 8, proj, extras.bucketId)
    return withDev(extras.bucketId, body, { type: 'SUBMIT' }, rec, extras.companyCode, extras.elapsedMs)
}

export function composeUpdated(rec: WorkRecord, projectName: string, extras: ComposeExtras): string {
    const rawWt = stripThinking(rec.summary || rec.workType)
    const wt = rawWt && !isGenericWork(rawWt) ? rawWt : (rawWt || 'Field Work')
    const proj = stripThinking(projectName) || 'General Project'
    const hours = rec.hours || 8
    const hoursStr = hours % 1 === 0 ? `${hours}` : hours.toFixed(1)

    const body = rec.language === 'es'
        ? `✅ Registro de Trabajo Actualizado.\n\nTarea: ${wt}\nDuración: ${hoursStr} horas\nProyecto: ${proj}\nID de Confirmación: #${extras.bucketId}\n\nTu reporte ha sido actualizado en el informe diario de la obra.`
        : `✅ Daily Work Log Updated.\n\nTask: ${wt}\nDuration: ${hoursStr} hours\nProject: ${proj}\nConfirmation ID: #${extras.bucketId}\n\nYour submission has been updated in the daily site report.`

    return withDev(extras.bucketId, body, { type: 'SUBMIT' }, rec, extras.companyCode, extras.elapsedMs)
}
