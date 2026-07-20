// graph.ts - Entry point for the conversation brain.
// Uses the hybrid slot-filling engine (see DESIGN.md).

import { runStateMachine } from './engine.ts'

export interface BrainState {
    status: string
    action: string
    response?: string | null
}

// Run the brain for a bucket
export async function runBrain(bucketId: number): Promise<BrainState> {
    console.log(`[Brain] Starting for bucket #${bucketId}`)

    try {
        const result = await runStateMachine(bucketId)
        console.log(`[Brain] Done. Status: ${result.status}, Action: ${result.action}`)
        return result as BrainState
    } catch (error) {
        console.error('[Brain] Error:', error)
        return { status: 'error', action: 'error' }
    }
}
