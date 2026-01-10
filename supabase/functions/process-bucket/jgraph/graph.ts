// XState Machine Definition for Adaptive Brain
// Defines the state machine with states and transitions

import { setup, createActor, assign, fromPromise } from 'xstate'
import {
    loadContextNode,
    preprocessMediaNode,
    extractDataNode,
    resolveProjectNode,
    validateNode,
    respondNode
} from './nodes.ts'
import type { BrainState } from './state.ts'
import { createInitialState } from './state.ts'

// Define the XState machine using v5 setup pattern with fromPromise actors
const brainMachine = setup({
    types: {} as {
        context: BrainState
        input: { bucketId: number }
    },
    actors: {
        loadContextActor: fromPromise(async ({ input }: { input: BrainState }) => {
            console.log('[XState] loadContextActor starting')
            const result = await loadContextNode(input)
            console.log('[XState] loadContextActor done')
            return result
        }),
        preprocessMediaActor: fromPromise(async ({ input }: { input: BrainState }) => {
            console.log('[XState] preprocessMediaActor starting')
            const result = await preprocessMediaNode(input)
            console.log('[XState] preprocessMediaActor done')
            return result
        }),
        extractDataActor: fromPromise(async ({ input }: { input: BrainState }) => {
            console.log('[XState] extractDataActor starting')
            const result = await extractDataNode(input)
            console.log('[XState] extractDataActor done')
            return result
        }),
        resolveProjectActor: fromPromise(async ({ input }: { input: BrainState }) => {
            console.log('[XState] resolveProjectActor starting')
            const result = await resolveProjectNode(input)
            console.log('[XState] resolveProjectActor done')
            return result
        }),
        validateActor: fromPromise(async ({ input }: { input: BrainState }) => {
            console.log('[XState] validateActor starting')
            const result = validateNode(input) // sync
            console.log('[XState] validateActor done')
            return result
        }),
        respondActor: fromPromise(async ({ input }: { input: BrainState }) => {
            console.log('[XState] respondActor starting')
            const result = await respondNode(input)
            console.log('[XState] respondActor done')
            return result
        }),
    },
}).createMachine({
    id: 'adaptiveBrain',
    initial: 'loadContext',
    context: ({ input }) => {
        console.log('[XState] Creating initial context for bucketId:', input.bucketId)
        return createInitialState(input.bucketId)
    },
    states: {
        loadContext: {
            invoke: {
                src: 'loadContextActor',
                input: ({ context }) => context,
                onDone: {
                    target: 'preprocessMedia',
                    actions: assign(({ event }) => {
                        console.log('[XState] loadContext done, output:', JSON.stringify(event.output).slice(0, 200))
                        return event.output
                    }),
                },
                onError: {
                    target: 'done',
                    actions: assign(({ event }) => {
                        console.error('[XState] loadContext error:', event.error)
                        return { action: 'error', status: 'pending_review' }
                    }),
                },
            },
        },
        preprocessMedia: {
            invoke: {
                src: 'preprocessMediaActor',
                input: ({ context }) => context,
                onDone: {
                    target: 'extractData',
                    actions: assign(({ event }) => {
                        console.log('[XState] preprocessMedia done')
                        return event.output || {}
                    }),
                },
                onError: {
                    target: 'extractData',
                    actions: () => console.log('[XState] preprocessMedia error, continuing'),
                },
            },
        },
        extractData: {
            invoke: {
                src: 'extractDataActor',
                input: ({ context }) => context,
                onDone: {
                    target: 'resolveProject',
                    actions: assign(({ event }) => {
                        console.log('[XState] extractData done')
                        return event.output
                    }),
                },
                onError: {
                    target: 'done',
                    actions: assign(({ event }) => {
                        console.error('[XState] extractData error:', event.error)
                        return { action: 'error', status: 'pending_review' }
                    }),
                },
            },
        },
        resolveProject: {
            invoke: {
                src: 'resolveProjectActor',
                input: ({ context }) => context,
                onDone: {
                    target: 'validate',
                    actions: assign(({ event }) => {
                        console.log('[XState] resolveProject done')
                        return event.output
                    }),
                },
            },
        },
        validate: {
            invoke: {
                src: 'validateActor',
                input: ({ context }) => context,
                onDone: {
                    target: 'respond',
                    actions: assign(({ event }) => {
                        console.log('[XState] validate done')
                        return event.output
                    }),
                },
            },
        },
        respond: {
            invoke: {
                src: 'respondActor',
                input: ({ context }) => context,
                onDone: {
                    target: 'done',
                    actions: assign(({ event }) => {
                        console.log('[XState] respond done, action:', event.output?.action)
                        return event.output
                    }),
                },
                onError: {
                    target: 'done',
                    actions: assign(({ event }) => {
                        console.error('[XState] respond error:', event.error)
                        return { action: 'error' }
                    }),
                },
            },
        },
        done: {
            type: 'final',
        },
    },
})

// Run the brain for a bucket with timeout
export async function runBrain(bucketId: number): Promise<BrainState> {
    console.log(`[Brain] Starting XState machine for bucket #${bucketId}`)

    return new Promise((resolve, reject) => {
        // Timeout after 30 seconds
        const timeout = setTimeout(() => {
            console.error('[Brain] XState timeout after 30s')
            reject(new Error('XState machine timeout'))
        }, 30000)

        const actor = createActor(brainMachine, {
            input: { bucketId },
        })

        actor.subscribe({
            next: (state) => {
                console.log(`[Brain] State transition: ${JSON.stringify(state.value)}`)
                if (state.matches('done')) {
                    clearTimeout(timeout)
                    console.log(`[Brain] Finished with action: ${state.context.action}`)
                    resolve(state.context)
                }
            },
            error: (err) => {
                clearTimeout(timeout)
                console.error('[Brain] Actor error:', err)
                reject(err)
            },
            complete: () => {
                clearTimeout(timeout)
                console.log('[Brain] Actor completed')
            },
        })

        console.log('[Brain] Starting actor...')
        actor.start()
        console.log('[Brain] Actor started')
    })
}
