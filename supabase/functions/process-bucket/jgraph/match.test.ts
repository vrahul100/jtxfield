import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { fuzzyFindProject, resolveProjectRef, type ProjectOption } from './match.ts'
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
