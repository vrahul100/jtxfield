// graph.ts - Simple State Machine Runner
// Uses nodes_v2 for clean state handling

import { runStateMachine } from './nodes_v2.ts'

export interface BrainState {
    status: string
    action: string
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
