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

// Score how well a hint matches a project name, 0..1.
function scoreMatch(hintNorm: string, hintTokens: string[], name: string): number {
    const pNorm = normalize(name)
    const pTokens = tokens(name)
    if (!pTokens.length || !hintTokens.length) return 0

    // Strong signal: one string contains the other.
    if (pNorm.includes(hintNorm) || hintNorm.includes(pNorm)) return 0.95

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
