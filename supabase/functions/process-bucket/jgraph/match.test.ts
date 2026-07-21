import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { detectFixFieldOnly, fuzzyFindProject, parseHoursReply, resolveProjectReply, resolveProjectRef, type ProjectOption } from './match.ts'
import type { TurnInterpretation } from './record.ts'

const PROJECTS: ProjectOption[] = [
    { id: 1, name: 'City Mall' },
    { id: 2, name: 'Riverside Apartments' },
    { id: 3, name: 'Downtown Office Tower' },
]

function hintInterp(projectHint: string): TurnInterpretation {
    return { language: 'en', isWorkRelated: true, intent: 'select', projectHint }
}

// The exact failure from the screenshot: "City hall" typo → "City Mall".
Deno.test('typo City hall resolves to City Mall', () => {
    assertEquals(fuzzyFindProject('City hall', PROJECTS)?.name, 'City Mall')
})

Deno.test('filler words are ignored: "project to city hall"', () => {
    assertEquals(resolveProjectRef(hintInterp('project to city hall'), PROJECTS, 'fix')?.id, 1)
})

Deno.test('partial name: "the mall" → City Mall', () => {
    assertEquals(fuzzyFindProject('the mall', PROJECTS)?.name, 'City Mall')
})

Deno.test('partial name: "riverside" → Riverside Apartments', () => {
    assertEquals(fuzzyFindProject('riverside', PROJECTS)?.name, 'Riverside Apartments')
})

Deno.test('unrelated text does not match anything', () => {
    assertEquals(fuzzyFindProject('electrical work', PROJECTS), null)
})

Deno.test('pure filler resolves to nothing', () => {
    assertEquals(fuzzyFindProject('the project', PROJECTS), null)
})

Deno.test('numeric pick only counts when we showed the list', () => {
    // lastAsked = 'project' → "2" selects Riverside
    assertEquals(resolveProjectRef(hintInterp('2'), PROJECTS, 'project')?.id, 2)
    // lastAsked = 'confirm' → a bare number is NOT a selection
    assertEquals(resolveProjectRef(hintInterp('2'), PROJECTS, 'confirm'), null)
})

Deno.test('exact name matches', () => {
    assertEquals(resolveProjectRef(hintInterp('Downtown Office Tower'), PROJECTS, 'fix')?.id, 3)
})

// --- The screenshot case: "change project to city mall" fuzzy-resolves off the raw text ---
Deno.test('raw text "change project to city mall" resolves via fuzzy', () => {
    assertEquals(fuzzyFindProject('change project to city mall', PROJECTS)?.id, 1)
})

// --- Regression: a bare rejection must NOT substring-match a project name ---
Deno.test('bare "n"/"no" do NOT fuzzy-match a project (was the confirm loop)', () => {
    const ps: ProjectOption[] = [{ id: 1, name: 'Downtown Office Renovation' }, { id: 2, name: 'High-Rise Tower A' }]
    assertEquals(fuzzyFindProject('n', ps), null)
    assertEquals(fuzzyFindProject('no', ps), null)
    assertEquals(fuzzyFindProject('NO', ps), null)
})

// --- But real partial names still match via the (now bounded) substring path ---
Deno.test('meaningful partial still matches after the substring tightening', () => {
    assertEquals(fuzzyFindProject('riverside', PROJECTS)?.name, 'Riverside Apartments')
    assertEquals(fuzzyFindProject('downtown', PROJECTS)?.name, 'Downtown Office Tower')
})

// --- resolveProjectReply: a bare number picks by position (the "1" that got ignored) ---
Deno.test('resolveProjectReply: bare "1" picks the first shown project', () => {
    assertEquals(resolveProjectReply('1', PROJECTS)?.id, 1)
    assertEquals(resolveProjectReply('2', PROJECTS)?.id, 2)
    assertEquals(resolveProjectReply(' #3 ', PROJECTS)?.id, 3)
})

Deno.test('resolveProjectReply: out-of-range number is not a pick', () => {
    assertEquals(resolveProjectReply('9', PROJECTS), null)
})

Deno.test('resolveProjectReply: a name still fuzzy-matches', () => {
    assertEquals(resolveProjectReply('city hall', PROJECTS)?.id, 1)
})

Deno.test('resolveProjectReply: "5 hours" is NOT read as project #5', () => {
    // not a pure number → falls to fuzzy, which finds nothing project-like here
    assertEquals(resolveProjectReply('5 hours', PROJECTS), null)
})

// --- detectFixFieldOnly: naming a field at the fix step (the "project" loop) ---
Deno.test('detectFixFieldOnly maps bare field names', () => {
    assertEquals(detectFixFieldOnly('project'), 'project')
    assertEquals(detectFixFieldOnly('change project'), 'project')
    assertEquals(detectFixFieldOnly('the project'), 'project')
    assertEquals(detectFixFieldOnly('wrong project'), 'project')
    assertEquals(detectFixFieldOnly('hours'), 'hours')
    assertEquals(detectFixFieldOnly('change the hours'), 'hours')
    assertEquals(detectFixFieldOnly('work'), 'work')
})

Deno.test('detectFixFieldOnly returns null when a value is present (goes to LLM)', () => {
    assertEquals(detectFixFieldOnly('6 hours'), null)       // has a number → value
    assertEquals(detectFixFieldOnly('it was plumbing'), null)
    assertEquals(detectFixFieldOnly('High-Rise Tower A'), null)
    assertEquals(detectFixFieldOnly('2'), null)
})

// --- parseHoursReply: the deterministic answer to ASK_HOURS ---
Deno.test('parseHoursReply parses numbers and rejects nonsense', () => {
    assertEquals(parseHoursReply('6'), 6)
    assertEquals(parseHoursReply('6 hours'), 6)
    assertEquals(parseHoursReply('4.5'), 4.5)
    assertEquals(parseHoursReply('0'), null)       // out of range
    assertEquals(parseHoursReply('99'), null)      // out of range
    assertEquals(parseHoursReply('six'), null)     // word → caller falls back to the LLM
})
