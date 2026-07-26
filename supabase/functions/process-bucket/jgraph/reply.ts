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
        askHours: (wt: string) => wt && !isGenericWork(wt)
            ? `⏱️ Got it: *${wt}*\n\nHow many hours did you work?\n(Example: 6.5 or "6 and a half")`
            : `⏱️ How many hours did you work?\n(Example: 6.5 or "6 and a half")`,
        clarify: (reason: string) => `⚠️ *NEEDS CLARIFICATION*\n\n${reason}\n\nCan you confirm what you actually worked on?`,
        askFix: '🤔 No problem — what should I change: the *work*, the *hours*, or the *project*?',
        confirm: (wt: string, h: number, proj: string, materials?: string, location?: string) => {
            let m = `📝 *CONFIRM YOUR WORK*\n\n🔧 *Work:* ${wt}\n⏱️ *Time:* ${h} hours\n📍 *Project:* ${proj}`
            if (materials) m += `\n🧰 *Materials:* ${materials}`
            if (location) m += `\n📌 *Location:* ${location}`
            return m + `\n\nIs this correct? Reply *Y* or *N*`
        },
        selectProject: (wt: string, h: number, list: string, count: number) =>
            `📌 *SELECT PROJECT*\n\n🔧 ${wt} • ${h}h\n\n${list}\n\nReply with number (${numberHint(count, 'or')})`,
        success: (wt: string, h: number, proj: string, materials?: string, location?: string, summary?: string) => {
            let m = `✅ *LOGGED*\n\n🔧 *Work:* ${wt}\n⏱️ *Time:* ${h} hours\n📍 *Project:* ${proj}`
            if (materials) m += `\n🧰 *Materials:* ${materials}`
            if (location) m += `\n📌 *Location:* ${location}`
            if (summary) m += `\n\n_"${summary}"_`
            m += `\n\n💡 _Need to adjust? Reply "change project to <Name>" or "change hours to 8"._`
            return m
        },
        flagged: '🙋 Thanks — I\'ve flagged this for your foreman to review. They\'ll follow up.',
        noProjects: '❌ No projects available',
    },
    es: {
        greeting: '👋 ¡Hola! ¿Listo para registrar tu trabajo?\n\nEnvía una foto, nota de voz, o describe lo que trabajaste.',
        collectWork: '🔧 *¿Qué tipo de trabajo hiciste?*\n\nTambién dime cuántas horas.\n(Ejemplo: "eléctrico por 6 horas")',
        askHours: (wt: string) => wt && !isGenericWork(wt)
            ? `⏱️ Entendido: *${wt}*\n\n¿Cuántas horas trabajaste?\n(Ejemplo: 6.5 o "6 y media")`
            : `⏱️ ¿Cuántas horas trabajaste?\n(Ejemplo: 6.5 o "6 y media")`,
        clarify: (reason: string) => `⚠️ *NECESITA ACLARACIÓN*\n\n${reason}\n\n¿Puedes confirmar qué trabajo hiciste realmente?`,
        askFix: '🤔 Sin problema — ¿qué quieres cambiar: el *trabajo*, las *horas*, o el *proyecto*?',
        confirm: (wt: string, h: number, proj: string, materials?: string, location?: string) => {
            let m = `📝 *CONFIRMA TU TRABAJO*\n\n🔧 *Trabajo:* ${wt}\n⏱️ *Tiempo:* ${h} horas\n📍 *Proyecto:* ${proj}`
            if (materials) m += `\n🧰 *Materiales:* ${materials}`
            if (location) m += `\n📌 *Ubicación:* ${location}`
            return m + `\n\n¿Es correcto? Responde *S* o *N*`
        },
        selectProject: (wt: string, h: number, list: string, count: number) =>
            `📌 *SELECCIONA PROYECTO*\n\n🔧 ${wt} • ${h}h\n\n${list}\n\nResponde con número (${numberHint(count, 'o')})`,
        success: (wt: string, h: number, proj: string, materials?: string, location?: string, summary?: string) => {
            let m = `✅ *REGISTRADO*\n\n🔧 *Trabajo:* ${wt}\n⏱️ *Tiempo:* ${h} horas\n📍 *Proyecto:* ${proj}`
            if (materials) m += `\n🧰 *Materiales:* ${materials}`
            if (location) m += `\n📌 *Ubicación:* ${location}`
            if (summary) m += `\n\n_"${summary}"_`
            m += `\n\n💡 _¿Necesitas ajustar? Responde "cambiar proyecto a <Nombre>" o "cambiar horas a 8"._`
            return m
        },
        flagged: '🙋 Gracias — lo he marcado para que tu supervisor lo revise. Te contactarán.',
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

function withTicket(bucketId: number, response: string, companyCode?: string): string {
    return `*TICKET ${formatTicketCode(bucketId, companyCode)}*\n${response}`
}

function withDev(bucketId: number, response: string, action: Action, rec: WorkRecord, companyCode?: string, elapsedMs?: number): string {
    let result = response.includes('*TICKET') ? response : withTicket(bucketId, response, companyCode)
    if (DEV_MODE) {
        let devStr = `[DEV: ${action.type} work:${stripThinking(rec.workType) || '-'} hrs:${rec.hours ?? '-'} proj:${stripThinking(rec.projectName) || '-'} asked:${rec.lastAsked ?? '-'}×${rec.askCount}`
        if (elapsedMs) {
            devStr += ` | ⚡ ${elapsedMs}ms`
        }
        devStr += `]`
        result += `\n\n_${devStr}_`
    }
    return result
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
    const wt = isGenericWork(rawWt) ? 'work' : rawWt
    const h = rec.hours || 0
    const materials = rec.materials.length ? rec.materials.map(mat => stripThinking(mat)).join(', ') : undefined
    const location = stripThinking(rec.location) || undefined
    const proj = stripThinking(rec.projectName) || 'your project'
    const cleanReason = action.type === 'CLARIFY_INCONSISTENCY' ? stripThinking(action.reason) : ''

    let body: string
    switch (action.type) {
        case 'GREET':
            body = m.greeting
            break
        case 'ASK_HOURS':
            body = m.askHours(wt)
            break
        case 'CLARIFY_INCONSISTENCY':
            body = m.clarify(cleanReason)
            break
        case 'ASK_FIX':
            body = m.askFix
            break
        case 'CONFIRM':
            body = m.confirm(wt, h, proj, materials, location)
            break
        case 'SELECT_PROJECT': {
            const list = extras.projects.length
                ? extras.projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n')
                : m.noProjects
            body = m.selectProject(wt, h, list, extras.projects.length)
            break
        }
        case 'FLAG_FOR_REVIEW':
            body = m.flagged
            break
        default:
            body = m.askHours(wt)
    }
    return withDev(extras.bucketId, body, action, rec, extras.companyCode, extras.elapsedMs)
}

// The final "logged!" confirmation after a successful submit.
export function composeSuccess(rec: WorkRecord, projectName: string, extras: ComposeExtras): string {
    const m = MESSAGES[rec.language]
    const rawWt = stripThinking(rec.summary || rec.workType)
    const wt = rawWt && !isGenericWork(rawWt) ? rawWt : (rawWt || 'Work')
    const proj = stripThinking(projectName) || 'your project'
    const summary = stripThinking(rec.summary) && !isGenericWork(rec.summary) ? stripThinking(rec.summary) : undefined
    const materials = rec.materials.length ? rec.materials.map(mat => stripThinking(mat)).join(', ') : undefined
    const body = m.success(wt, rec.hours || 0, proj, materials, stripThinking(rec.location) || undefined, summary)
    return withDev(extras.bucketId, body, { type: 'SUBMIT' }, rec, extras.companyCode, extras.elapsedMs)
}

export function composeUpdated(rec: WorkRecord, projectName: string, extras: ComposeExtras): string {
    const rawWt = stripThinking(rec.summary || rec.workType)
    const wt = rawWt && !isGenericWork(rawWt) ? rawWt : (rawWt || 'Work')
    const proj = stripThinking(projectName) || 'your project'
    const ticketNum = extras.bucketId > 10000 ? extras.bucketId : extras.bucketId + 10000
    const ticketId = `${extras.companyCode || 'ACE'}-${ticketNum}`

    const body = `*TICKET ${ticketId}*\n✏️ *UPDATED*\n\n🔧 *Work:* ${wt}\n⏱️ *Time:* ${rec.hours || 0} hours\n📍 *Project:* ${proj}\n\n💡 _Need to adjust? Reply "change project to <Name>" or "change hours to 8"._`
    return withDev(extras.bucketId, body, { type: 'SUBMIT' }, rec, extras.companyCode, extras.elapsedMs)
}
