// XState Guards for Conversation Flow
// These determine when state transitions should occur

import type { BrainState } from './state.ts'

// Guard: Has work information (workType AND hours)
export function hasWorkInfo(context: BrainState): boolean {
    const extraction = context.extraction
    if (!extraction) return false

    const hasWorkType = extraction.workType != null && extraction.workType !== ''
    const hasHours = typeof extraction.hoursWorked === 'number' && extraction.hoursWorked > 0

    console.log(`[Guard: hasWorkInfo] workType=${extraction.workType}, hours=${extraction.hoursWorked} → ${hasWorkType && hasHours}`)
    return hasWorkType && hasHours
}

// Guard: Project has been confirmed
export function hasProjectConfirmed(context: BrainState): boolean {
    const result = context.projectConfirmed === true
    console.log(`[Guard: hasProjectConfirmed] → ${result}`)
    return result
}

// Guard: User response indicates "no more" (nothing else to add)
export function userSaidNoMore(context: BrainState): boolean {
    const raw = (context.rawText || '').toLowerCase().trim()
    const firstWord = raw.split(/[\s.,!]/)[0]
    const result = ['no', 'n', 'nope', 'nah', 'done', 'that\'s it', 'thats it', 'nothing'].includes(firstWord)
    console.log(`[Guard: userSaidNoMore] raw="${raw.substring(0, 20)}" → ${result}`)
    return result
}

// Guard: User wants to add more info (opposite of noMore)
export function userWantsMore(context: BrainState): boolean {
    return !userSaidNoMore(context)
}

// Guard: Extraction detected spam/unrelated message
export function isSpamMessage(context: BrainState): boolean {
    const result = context.extraction?.isWorkRelated === false && context.attempts === 0
    console.log(`[Guard: isSpamMessage] → ${result}`)
    return result
}

// Guard: Has inconsistency that needs clarification
export function hasInconsistency(context: BrainState): boolean {
    const result = context.validation?.inconsistencyReason != null
    console.log(`[Guard: hasInconsistency] → ${result}`)
    return result
}

// Guard: All fields valid for transaction
export function isReadyToSubmit(context: BrainState): boolean {
    const result = hasWorkInfo(context) && hasProjectConfirmed(context)
    console.log(`[Guard: isReadyToSubmit] → ${result}`)
    return result
}
