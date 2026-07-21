// match.ts — Pure fuzzy project matching. No I/O, so it's unit-testable. Tolerant of
// typos/misspellings ("City hall" → "City Mall"), extra words ("project to X"), and
// partial names ("the mall" → "City Mall").

import type { ProjectRef, Slot, TurnInterpretation } from './record.ts'

export interface ProjectOption { id: number; name: string }

// Filler words that carry no identifying signal for a project name.
const STOP = new Set([
    'project', 'the', 'job', 'site', 'to', 'for', 'a', 'an', 'at', 'on', 'in',
    'change', 'it', 'is', 'put', 'my', 'this', 'that', 'please', 'go', 'with',
])

function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function tokens(s: string): string[] {
    return normalize(s).split(' ').filter(t => t && !STOP.has(t))
}

// Levenshtein edit distance.
function levenshtein(a: string, b: string): number {
    if (a === b) return 0
    if (!a.length) return b.length
    if (!b.length) return a.length
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 0; i < a.length; i++) {
        const curr = [i + 1]
        for (let j = 0; j < b.length; j++) {
            const cost = a[i] === b[j] ? 0 : 1
            curr.push(Math.min(prev[j + 1] + 1, curr[j] + 1, prev[j] + cost))
        }
        prev = curr
    }
    return prev[b.length]
}

// Similarity of two words, 0..1.
function sim(a: string, b: string): number {
    const max = Math.max(a.length, b.length)
    return max ? 1 - levenshtein(a, b) / max : 1
}

// A substring counts as a strong signal only if it's long enough AND lands on a word
// boundary — so "n" or "no" can't match inside "Downtown Office Renovation", while
// "riverside" still matches "Riverside Apartments".
const MIN_SUBSTR = 3
function boundedIncludes(hay: string, needle: string): boolean {
    if (needle.length < MIN_SUBSTR) return false
    return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(hay)
}

// Score how well a hint matches a project name, 0..1.
function scoreMatch(hintNorm: string, hintTokens: string[], name: string): number {
    const pNorm = normalize(name)
    const pTokens = tokens(name)
    if (!pTokens.length || !hintTokens.length) return 0

    // Strong signal: one string meaningfully contains the other (length + word boundary).
    if (boundedIncludes(pNorm, hintNorm) || boundedIncludes(hintNorm, pNorm)) return 0.95

    // Otherwise: average best per-token similarity of hint tokens against project tokens.
    let sum = 0
    for (const ht of hintTokens) {
        let best = 0
        for (const pt of pTokens) best = Math.max(best, sim(ht, pt))
        sum += best
    }
    return sum / hintTokens.length
}

export const FUZZY_THRESHOLD = 0.6

export function fuzzyFindProject(hint: string, projects: ProjectOption[]): ProjectOption | null {
    const hintTokens = tokens(hint)
    if (!hintTokens.length) return null
    const hintNorm = normalize(hint)

    let best: ProjectOption | null = null
    let bestScore = 0
    for (const p of projects) {
        const score = scoreMatch(hintNorm, hintTokens, p.name)
        if (score > bestScore) { bestScore = score; best = p }
    }
    return bestScore >= FUZZY_THRESHOLD ? best : null
}

// A reply to the numbered project list is input to THAT question: a lone number picks by
// position, otherwise the text fuzzy-matches a name. Deterministic — no LLM, no
// hallucination. A PURE number only, so "5 hours" is never misread as project #5.
export function resolveProjectReply(reply: string, projects: ProjectOption[]): ProjectRef | null {
    const t = reply.trim()
    if (!t || !projects.length) return null

    const num = t.match(/^#?\s*(\d+)\s*$/)
    if (num) {
        const idx = parseInt(num[1], 10) - 1
        return idx >= 0 && idx < projects.length ? { id: projects[idx].id, name: projects[idx].name } : null
    }

    const best = fuzzyFindProject(t, projects)
    return best ? { id: best.id, name: best.name } : null
}

// The fix step asks "the work, the hours, or the project?" — a closed question whose answers
// we showed the user. Map a reply that just NAMES one of those fields (with filler like
// "change the ..."), deterministically. A reply carrying an actual new value ("6 hours",
// "plumbing", a project name) returns null → the caller extracts the value via the LLM.
export type FixField = 'work' | 'hours' | 'project'

const FIELD_WORDS: Record<string, FixField> = {
    project: 'project', job: 'project', site: 'project',
    hours: 'hours', hour: 'hours', time: 'hours',
    work: 'work', labor: 'work', labour: 'work', task: 'work', trade: 'work',
}

// Filler that may accompany a field name without turning it into a value.
const FIX_FILLER = new Set([
    'change', 'the', 'a', 'an', 'to', 'my', 'its', 'it', 'is', 'was', 'want', 'need',
    'fix', 'edit', 'update', 'wrong', 'incorrect', 'no', 'not', 'please', 'should', 'be',
])

export function detectFixFieldOnly(reply: string): FixField | null {
    const toks = normalize(reply).split(' ').filter(Boolean)
    if (!toks.length) return null
    const fields = new Set<FixField>()
    for (const t of toks) {
        const f = FIELD_WORDS[t]
        if (f) { fields.add(f); continue }
        if (FIX_FILLER.has(t)) continue
        return null   // a real other token → this reply carries a value, not just a field name
    }
    return fields.size === 1 ? [...fields][0] : null
}

// A reply to ASK_HOURS: pull the first plausible number (0<h<=24, halves ok). null when the
// reply carries no number (e.g. "six") → the caller falls back to the interpreter.
export function parseHoursReply(reply: string): number | null {
    const m = reply.match(/(\d+(?:\.\d+)?)/)
    if (!m) return null
    const h = parseFloat(m[1])
    return h > 0 && h <= 24 ? h : null
}

// Resolve projectHint (a name or a picked number) to a real project row.
// Numbers only count as a selection when we actually showed the numbered list.
export function resolveProjectRef(
    interp: TurnInterpretation,
    projects: ProjectOption[],
    lastAsked: Slot | null,
): ProjectRef | null {
    const hint = interp.projectHint?.trim()
    if (!hint || !projects.length) return null

    // Numeric pick from a shown list.
    const numMatch = hint.match(/^\s*#?(\d+)/)
    if (numMatch && lastAsked === 'project') {
        const idx = parseInt(numMatch[1], 10) - 1
        if (idx >= 0 && idx < projects.length) return { id: projects[idx].id, name: projects[idx].name }
    }

    const best = fuzzyFindProject(hint, projects)
    return best ? { id: best.id, name: best.name } : null
}
