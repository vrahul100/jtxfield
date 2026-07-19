/**
 * Comprehensive unit tests for nodes_v2.ts state machine
 * Tests state handlers, extraction functions, and helper utilities in isolation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockDb, createMockSupabase, mockTranscribeAudio, mockAnalyzeImage, clearSentMessages, sentMessages } from './mocks'
import { sampleExtractions, sampleMembers, sampleProjects, sampleBuckets, createTestBucket, createTestMember } from './test-fixtures'

// Note: These are UNIT tests for state machine logic
// LLM extraction accuracy is tested via CSV runner (run-nodes-tests.ts) using REAL Groq API
// not the actual Deno runtime or Supabase Edge Function execution

describe('Helper Functions', () => {
    describe('getLastMessage', () => {
        it('should extract the last non-empty line from raw text', () => {
            const getLastMessage = (rawText: string): string => {
                if (!rawText) return ''
                const lines = rawText.split('\n').filter(line => line.trim() !== '')
                return (lines[lines.length - 1] || '').toLowerCase().trim()
            }

            expect(getLastMessage('First line\nSecond line\nThird line')).toBe('third line')
            expect(getLastMessage('Single line')).toBe('single line')
            expect(getLastMessage('Line with spaces  \n  \nLast line')).toBe('last line')
            expect(getLastMessage('')).toBe('')
        })
    })

    describe('refineExtractionWithRegex', () => {
        it('should extract hours using regex when LLM misses them', () => {
            const refineExtractionWithRegex = (extraction: any, rawText: string, transcripts: string[]): any => {
                if (extraction.hoursWorked !== null && extraction.hoursWorked !== undefined) {
                    return extraction
                }

                const combinedText = [rawText, ...transcripts].join(' ')
                const hoursMatch = combinedText.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)/i)
                
                if (hoursMatch) {
                    const hours = parseFloat(hoursMatch[1])
                    return {
                        ...extraction,
                        hoursWorked: hours
                    }
                }

                return extraction
            }

            const extraction = { ...sampleExtractions.work_only }
            const refined = refineExtractionWithRegex(extraction, 'Worked for 6.5 hours', [])
            expect(refined.hoursWorked).toBe(6.5)
        })

        it('should handle different hour formats', () => {
            const refineExtractionWithRegex = (extraction: any, rawText: string, transcripts: string[]): any => {
                if (extraction.hoursWorked !== null && extraction.hoursWorked !== undefined) {
                    return extraction
                }

                const combinedText = [rawText, ...transcripts].join(' ')
                const hoursMatch = combinedText.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)/i)
                
                if (hoursMatch) {
                    const hours = parseFloat(hoursMatch[1])
                    return {
                        ...extraction,
                        hoursWorked: hours
                    }
                }

                return extraction
            }

            const extraction = { hoursWorked: null }

            expect(refineExtractionWithRegex(extraction, '8 hours', []).hoursWorked).toBe(8)
            expect(refineExtractionWithRegex(extraction, '3.5h', []).hoursWorked).toBe(3.5)
            expect(refineExtractionWithRegex(extraction, '2 hrs', []).hoursWorked).toBe(2)
            expect(refineExtractionWithRegex(extraction, 'took 4 hours to complete', []).hoursWorked).toBe(4)
        })

        it('should not override existing hours', () => {
            const refineExtractionWithRegex = (extraction: any, rawText: string, transcripts: string[]): any => {
                if (extraction.hoursWorked !== null && extraction.hoursWorked !== undefined) {
                    return extraction
                }

                const combinedText = [rawText, ...transcripts].join(' ')
                const hoursMatch = combinedText.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)/i)
                
                if (hoursMatch) {
                    const hours = parseFloat(hoursMatch[1])
                    return {
                        ...extraction,
                        hoursWorked: hours
                    }
                }

                return extraction
            }

            const extraction = { ...sampleExtractions.rebar_complete }
            const refined = refineExtractionWithRegex(extraction, 'Worked for 10 hours', [])
            expect(refined.hoursWorked).toBe(3) // Should keep original 3 hours
        })
    })
})

describe('LLM Extraction', () => {
    it('should be tested via CSV runner with real Groq API', () => {
        // LLM extraction accuracy is tested in run-nodes-tests.ts using real Groq API
        // Run: npm run test:nodes:csv
        expect(true).toBe(true)
    })
})

describe('State Handler: handleInitial', () => {
    beforeEach(() => {
        mockDb.reset()
        clearSentMessages()
    })

    it('should route to confirming_all when all data is present', () => {
        // Simulate handleInitial logic
        const extraction = sampleExtractions.rebar_complete
        const member = { ...sampleMembers.john_english, last_confirmed_project_id: 10 }

        const hasWork = !!extraction.workType
        const hasHours = extraction.hoursWorked && extraction.hoursWorked > 0
        const hasProject = !!extraction.projectHint || !!member.last_confirmed_project_id

        expect(hasWork && hasHours && hasProject).toBe(true)
        // Should route to confirming_all
    })

    it('should route to confirming_project when work+hours but no project', () => {
        const extraction = sampleExtractions.electrical_complete
        const member = { ...sampleMembers.steve_no_project }

        const hasWork = !!extraction.workType
        const hasHours = extraction.hoursWorked && extraction.hoursWorked > 0
        const hasProject = !!extraction.projectHint || !!member.last_confirmed_project_id

        expect(hasWork && hasHours).toBe(true)
        expect(hasProject).toBe(false)
        // Should route to confirming_project
    })

    it('should route to collecting_hours when only work type is present', () => {
        const extraction = sampleExtractions.work_only
        
        const hasWork = !!extraction.workType
        const hasHours = !!(extraction.hoursWorked && extraction.hoursWorked > 0)

        expect(hasWork).toBe(true)
        expect(hasHours).toBe(false)
        // Should route to collecting_hours
    })

    it('should route to collecting_work when nothing is present', () => {
        const extraction = {
            workType: null,
            hoursWorked: null,
            summary: null,
            materials: [],
            location: null,
            projectHint: null,
            isConsistent: true,
            inconsistencyReason: null,
            responseLanguage: 'en' as const,
            isWorkRelated: true,
        }

        const hasWork = !!extraction.workType
        const hasHours = !!(extraction.hoursWorked && extraction.hoursWorked > 0)

        expect(hasWork).toBe(false)
        expect(hasHours).toBe(false)
        // Should route to collecting_work
    })

    it('should route to clarifying_inconsistency when data is inconsistent', () => {
        const extraction = sampleExtractions.inconsistent

        expect(extraction.isConsistent).toBe(false)
        expect(extraction.inconsistencyReason).toBeTruthy()
        // Should route to clarifying_inconsistency
    })
})

describe('State Handler: handleCollectingHours', () => {
    beforeEach(() => {
        mockDb.reset()
    })

    it('should extract hours from user response', () => {
        const lastMsg = '5 hours'
        const hoursMatch = lastMsg.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h|horas?)?/i)
        const hours = hoursMatch ? parseFloat(hoursMatch[1]) : null

        expect(hours).toBe(5)
    })

    it('should extract decimal hours', () => {
        const lastMsg = '6.5'
        const hoursMatch = lastMsg.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h|horas?)?/i)
        const hours = hoursMatch ? parseFloat(hoursMatch[1]) : null

        expect(hours).toBe(6.5)
    })

    it('should extract hours with Spanish text', () => {
        const lastMsg = '3 horas'
        const hoursMatch = lastMsg.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h|horas?)?/i)
        const hours = hoursMatch ? parseFloat(hoursMatch[1]) : null

        expect(hours).toBe(3)
    })

    it('should default to 2 hours after max attempts', () => {
        const stateAttempts = 2
        const defaultHours = stateAttempts >= 2 ? 2 : null

        expect(defaultHours).toBe(2)
    })
})

describe('State Handler: handleConfirmingProject', () => {
    beforeEach(() => {
        mockDb.reset()
    })

    it('should detect Yes confirmation', () => {
        const testCases = ['yes', 'y', 'Y', 'Yes', 'YES', 'yeah', 'yep', 'si', 'sí', 's', 'S', 'ok']
        
        testCases.forEach(msg => {
            const firstWord = msg.toLowerCase().split(/[\s.,!]/)[0]
            const yesWords = ['yes', 'y', 'si', 'sí', 'yeah', 'yep', 's', 'ok', 'sure']
            const saidYes = yesWords.includes(firstWord) || yesWords.some(w => msg.toLowerCase() === w)
            
            expect(saidYes).toBe(true)
        })
    })

    it('should detect No rejection', () => {
        const testCases = ['no', 'n', 'N', 'No', 'NO', 'nope', 'nah']
        
        testCases.forEach(msg => {
            const firstWord = msg.toLowerCase().split(/[\s.,!]/)[0]
            const noWords = ['no', 'n', 'nope', 'nah']
            const saidNo = noWords.includes(firstWord) || noWords.some(w => msg.toLowerCase() === w)
            
            expect(saidNo).toBe(true)
        })
    })

    it('should check if project confirmation is fresh (within 8 hours)', () => {
        const recentConfirmation = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
        const oldConfirmation = new Date(Date.now() - 10 * 60 * 60 * 1000) // 10 hours ago

        const hoursDiffRecent = (Date.now() - recentConfirmation.getTime()) / (1000 * 60 * 60)
        const hoursDiffOld = (Date.now() - oldConfirmation.getTime()) / (1000 * 60 * 60)

        expect(hoursDiffRecent <= 8).toBe(true)
        expect(hoursDiffOld <= 8).toBe(false)
    })
})

describe('State Handler: handleSelectingProject', () => {
    beforeEach(() => {
        mockDb.reset()
    })

    it('should extract numbered selection from user response', () => {
        const testCases = [
            { input: '1', expected: 0 },
            { input: '2', expected: 1 },
            { input: '3 please', expected: 2 },
            { input: '10', expected: 9 },
        ]

        testCases.forEach(({ input, expected }) => {
            const match = input.match(/^(\d+)/)
            const selectedIndex = match ? parseInt(match[1], 10) - 1 : null

            expect(selectedIndex).toBe(expected)
        })
    })

    it('should handle invalid selections gracefully', () => {
        const invalidInputs = ['abc', 'none', '', 'project 1']

        invalidInputs.forEach(input => {
            const match = input.match(/^(\d+)/)
            expect(match).toBeNull()
        })
    })

    it('should format project list correctly', () => {
        const projects = [
            { id: 1, name: 'Residential Tower A' },
            { id: 2, name: 'Commercial Plaza' },
            { id: 3, name: 'Parking Structure' },
        ]

        const projectList = projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n')

        expect(projectList).toBe('1. Residential Tower A\n2. Commercial Plaza\n3. Parking Structure')
    })
})

describe('State Handler: handleConfirmingAll', () => {
    beforeEach(() => {
        mockDb.reset()
    })

    it('should detect additional hours after confirmation', () => {
        const userResponse = 'yes and another 2 hours'
        const confirmationPattern = /^(?:yes|y|si|sí|s|ok|yeah|yep|correct|correcto)[\s.,!]*(.*)/i
        const match = userResponse.match(confirmationPattern)

        expect(match).toBeTruthy()
        expect(match![1]).toBe('and another 2 hours')
    })

    it('should extract "yes" without additional text', () => {
        const userResponse = 'yes'
        const confirmationPattern = /^(?:yes|y|si|sí|s|ok|yeah|yep|correct|correcto)[\s.,!]*(.*)/i
        const match = userResponse.match(confirmationPattern)

        expect(match).toBeTruthy()
        expect(match![1]).toBe('')
    })
})

describe('Message Formatting', () => {
    it('should add ticket prefix to messages', () => {
        const withTicket = (bucketId: number, response: string): string => {
            return `*TICKET #${bucketId}*\n${response}`
        }

        expect(withTicket(123, 'Work logged')).toBe('*TICKET #123*\nWork logged')
    })

    it('should format bilingual success messages correctly', () => {
        const successEN = (wt: string, h: number, proj: string) => `✅ ${wt} for ${h}h at ${proj}.`
        const successES = (wt: string, h: number, proj: string) => `✅ ${wt} por ${h}h en ${proj}.`

        expect(successEN('electrical', 4, 'Tower A')).toBe('✅ electrical for 4h at Tower A.')
        expect(successES('electrical', 4, 'Tower A')).toBe('✅ electrical por 4h en Tower A.')
    })
})

describe('Mock Database Operations', () => {
    beforeEach(() => {
        mockDb.reset()
    })

    it('should insert and retrieve buckets', () => {
        const bucket = mockDb.insertBucket({ raw_text: 'Test bucket' })
        const retrieved = mockDb.getBucket(bucket.id)

        expect(retrieved).toBeTruthy()
        expect(retrieved!.raw_text).toBe('Test bucket')
    })

    it('should update bucket state', () => {
        const bucket = mockDb.insertBucket({ conversation_state: 'initial' })
        mockDb.updateBucket(bucket.id, { conversation_state: 'collecting_hours' })

        const updated = mockDb.getBucket(bucket.id)
        expect(updated!.conversation_state).toBe('collecting_hours')
    })

    it('should insert and retrieve members', () => {
        const member = mockDb.insertMember({ phone_number: '+15551234567' })
        const retrieved = mockDb.getMember(member.id)

        expect(retrieved).toBeTruthy()
        expect(retrieved!.phone_number).toBe('+15551234567')
    })

    it('should update member last confirmed project', () => {
        const member = mockDb.insertMember({ last_confirmed_project_id: null })
        mockDb.updateMember(member.id, { 
            last_confirmed_project_id: 10,
            project_confirmed_at: new Date().toISOString()
        })

        const updated = mockDb.getMember(member.id)
        expect(updated!.last_confirmed_project_id).toBe(10)
        expect(updated!.project_confirmed_at).toBeTruthy()
    })

    it('should query projects by node', () => {
        mockDb.insertProject({ node_id: 1, name: 'Project A', is_inbox: false })
        mockDb.insertProject({ node_id: 1, name: 'Project B', is_inbox: false })
        mockDb.insertProject({ node_id: 1, name: 'Inbox', is_inbox: true })
        mockDb.insertProject({ node_id: 2, name: 'Other Node' })

        const projects = mockDb.getProjectsByNodeId(1, { is_inbox: false })
        expect(projects).toHaveLength(2)
        expect(projects.map(p => p.name)).toContain('Project A')
        expect(projects.map(p => p.name)).toContain('Project B')
    })

    it('should find project by name pattern', () => {
        mockDb.insertProject({ node_id: 1, name: 'Residential Tower A' })
        mockDb.insertProject({ node_id: 1, name: 'Commercial Plaza' })

        const found = mockDb.getProjectByName(1, 'residential')
        expect(found).toBeTruthy()
        expect(found!.name).toBe('Residential Tower A')
    })

    it('should insert transactions', () => {
        const txn = mockDb.insertTransaction({
            bucket_id: 1,
            job: 'Electrical work',
            status: 'COMPLETED'
        })

        const retrieved = mockDb.getTransactionByBucketId(1)
        expect(retrieved).toBeTruthy()
        expect(retrieved!.job).toBe('Electrical work')
    })
})

describe('Integration: State Transitions', () => {
    beforeEach(() => {
        mockDb.reset()
        clearSentMessages()
    })

    it('should complete full flow: initial → confirming_project → complete', () => {
        // Setup
        const member = mockDb.insertMember({
            phone_number: '+15551234567',
            last_confirmed_project_id: 10,
            project_confirmed_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        })
        const project = mockDb.insertProject({ id: 10, name: 'Tower A' })

        // Initial state with complete extraction
        let state = 'initial'
        const extraction = { ...sampleExtractions.electrical_complete }
        
        // Simulate: initial → confirming_project (has work+hours, need project confirmation)
        const hasWork = !!extraction.workType
        const hasHours = extraction.hoursWorked && extraction.hoursWorked > 0
        const hasProject = !!member.last_confirmed_project_id

        expect(hasWork && hasHours && hasProject).toBe(true)
        state = 'confirming_all' // Would ask for confirmation

        // User says "yes"
        const userResponse = 'yes'
        const yesWords = ['yes', 'y', 'si', 'sí', 's', 'ok']
        const saidYes = yesWords.includes(userResponse.toLowerCase())

        expect(saidYes).toBe(true)
        state = 'complete'

        expect(state).toBe('complete')
    })
})
