/**
 * Mock implementations of external dependencies for jgraph engine testing
 * Provides in-memory state management and configurable responses
 */

export interface MockBucket {
    id: number
    member_id: number
    node_id: number
    from_phone: string
    source: string
    raw_text: string
    image_urls: string
    audio_urls: string
    transcripts: string | null
    extracted_data: string | null
    conversation_state: string
    state_attempts: number
    ai_response: string | null
    status: string
    project_id: number | null
    summary: string | null
    created_at: string
}

export interface MockMember {
    id: number
    phone_number: string
    node_id: number
    last_confirmed_project_id: number | null
    project_confirmed_at: string | null
    language_preference: 'en' | 'es'
}

export interface MockProject {
    id: number
    node_id: number
    name: string
    is_active: boolean
    is_inbox: boolean
}

export interface MockTransaction {
    id: number
    bucket_id: number
    company_id: number
    user_id: number
    project_id: number | null
    job: string
    scope_description: string | null
    labor: string | null
    material: string | null
    location: string | null
    status: string
}

/**
 * In-memory mock database for testing
 */
class MockDatabase {
    buckets: Map<number, MockBucket> = new Map()
    members: Map<number, MockMember> = new Map()
    projects: Map<number, MockProject> = new Map()
    transactions: Map<number, MockTransaction> = new Map()
    
    nextBucketId = 1
    nextMemberId = 1
    nextProjectId = 1
    nextTransactionId = 1

    reset() {
        this.buckets.clear()
        this.members.clear()
        this.projects.clear()
        this.transactions.clear()
        this.nextBucketId = 1
        this.nextMemberId = 1
        this.nextProjectId = 1
        this.nextTransactionId = 1
    }

    // Bucket operations
    insertBucket(bucket: Partial<MockBucket>): MockBucket {
        const id = this.nextBucketId++
        const newBucket: MockBucket = {
            id,
            member_id: bucket.member_id || 1,
            node_id: bucket.node_id || 1,
            from_phone: bucket.from_phone || '+15551234567',
            source: bucket.source || 'whatsapp',
            raw_text: bucket.raw_text || '',
            image_urls: bucket.image_urls || '[]',
            audio_urls: bucket.audio_urls || '[]',
            transcripts: bucket.transcripts || null,
            extracted_data: bucket.extracted_data || null,
            conversation_state: bucket.conversation_state || 'initial',
            state_attempts: bucket.state_attempts || 0,
            ai_response: bucket.ai_response || null,
            status: bucket.status || 'open',
            project_id: bucket.project_id || null,
            summary: bucket.summary || null,
            created_at: bucket.created_at || new Date().toISOString(),
        }
        this.buckets.set(id, newBucket)
        return newBucket
    }

    updateBucket(id: number, updates: Partial<MockBucket>): MockBucket | null {
        const bucket = this.buckets.get(id)
        if (!bucket) return null
        const updated = { ...bucket, ...updates }
        this.buckets.set(id, updated)
        return updated
    }

    getBucket(id: number): MockBucket | null {
        return this.buckets.get(id) || null
    }

    // Member operations
    insertMember(member: Partial<MockMember>): MockMember {
        const id = this.nextMemberId++
        const newMember: MockMember = {
            id,
            phone_number: member.phone_number || '+15551234567',
            node_id: member.node_id || 1,
            last_confirmed_project_id: member.last_confirmed_project_id || null,
            project_confirmed_at: member.project_confirmed_at || null,
            language_preference: member.language_preference || 'en',
        }
        this.members.set(id, newMember)
        return newMember
    }

    updateMember(id: number, updates: Partial<MockMember>): MockMember | null {
        const member = this.members.get(id)
        if (!member) return null
        const updated = { ...member, ...updates }
        this.members.set(id, updated)
        return updated
    }

    getMember(id: number): MockMember | null {
        return this.members.get(id) || null
    }

    // Project operations
    insertProject(project: Partial<MockProject>): MockProject {
        const id = this.nextProjectId++
        const newProject: MockProject = {
            id,
            node_id: project.node_id || 1,
            name: project.name || 'Test Project',
            is_active: project.is_active !== undefined ? project.is_active : true,
            is_inbox: project.is_inbox !== undefined ? project.is_inbox : false,
        }
        this.projects.set(id, newProject)
        return newProject
    }

    getProjectsByNodeId(nodeId: number, filters?: { is_active?: boolean; is_inbox?: boolean }): MockProject[] {
        return Array.from(this.projects.values()).filter(p => {
            if (p.node_id !== nodeId) return false
            if (filters?.is_active !== undefined && p.is_active !== filters.is_active) return false
            if (filters?.is_inbox !== undefined && p.is_inbox !== filters.is_inbox) return false
            return true
        })
    }

    getProjectByName(nodeId: number, nameLike: string): MockProject | null {
        const normalized = nameLike.toLowerCase()
        return Array.from(this.projects.values()).find(p => 
            p.node_id === nodeId && p.name.toLowerCase().includes(normalized)
        ) || null
    }

    // Transaction operations
    insertTransaction(txn: Partial<MockTransaction>): MockTransaction {
        const id = this.nextTransactionId++
        const newTxn: MockTransaction = {
            id,
            bucket_id: txn.bucket_id || 0,
            company_id: txn.company_id || 1,
            user_id: txn.user_id || 1,
            project_id: txn.project_id || null,
            job: txn.job || '',
            scope_description: txn.scope_description || null,
            labor: txn.labor || null,
            material: txn.material || null,
            location: txn.location || null,
            status: txn.status || 'COMPLETED',
        }
        this.transactions.set(id, newTxn)
        return newTxn
    }

    getTransactionByBucketId(bucketId: number): MockTransaction | null {
        return Array.from(this.transactions.values()).find(t => t.bucket_id === bucketId) || null
    }
}

export const mockDb = new MockDatabase()

/**
 * Mock Supabase client for testing
 */
export function createMockSupabase() {
    return {
        from: (table: string) => {
            if (table === 'buckets') {
                return {
                    select: (columns: string) => ({
                        eq: (col: string, val: any) => ({
                            single: async () => {
                                const bucket = col === 'id' 
                                    ? mockDb.getBucket(val)
                                    : null
                                return { data: bucket, error: bucket ? null : new Error('Not found') }
                            },
                        }),
                    }),
                    update: (updates: any) => ({
                        eq: (col: string, val: any) => ({
                            then: async (resolve: any) => {
                                const updated = mockDb.updateBucket(val, updates)
                                resolve({ data: updated, error: updated ? null : new Error('Not found') })
                            }
                        }),
                    }),
                    insert: async (data: any) => {
                        const bucket = mockDb.insertBucket(data)
                        return { data: bucket, error: null }
                    },
                }
            } else if (table === 'members') {
                return {
                    select: (columns: string) => ({
                        eq: (col: string, val: any) => ({
                            single: async () => {
                                const member = col === 'id' 
                                    ? mockDb.getMember(val)
                                    : null
                                return { data: member, error: member ? null : new Error('Not found') }
                            },
                        }),
                    }),
                    update: (updates: any) => ({
                        eq: (col: string, val: any) => ({
                            then: async (resolve: any) => {
                                const updated = mockDb.updateMember(val, updates)
                                resolve({ data: updated, error: updated ? null : new Error('Not found') })
                            }
                        }),
                    }),
                }
            } else if (table === 'projects') {
                return {
                    select: (columns: string) => ({
                        eq: (col: string, val: any) => {
                            if (col === 'node_id') {
                                return {
                                    eq: (col2: string, val2: any) => ({
                                        limit: (n: number) => ({
                                            order: (orderBy: string) => ({
                                                then: async (resolve: any) => {
                                                    const projects = mockDb.getProjectsByNodeId(val, { [col2]: val2 })
                                                        .slice(0, n)
                                                    resolve({ data: projects, error: null })
                                                }
                                            })
                                        }),
                                        single: async () => {
                                            const projects = mockDb.getProjectsByNodeId(val, { [col2]: val2 })
                                            return { data: projects[0] || null, error: projects[0] ? null : new Error('Not found') }
                                        },
                                    }),
                                    ilike: (col2: string, pattern: string) => ({
                                        limit: (n: number) => ({
                                            single: async () => {
                                                const searchTerm = pattern.replace(/%/g, '')
                                                const project = mockDb.getProjectByName(val, searchTerm)
                                                return { data: project, error: project ? null : new Error('Not found') }
                                            }
                                        })
                                    }),
                                }
                            }
                            return {
                                single: async () => ({ data: null, error: new Error('Not found') })
                            }
                        },
                    }),
                }
            } else if (table === 'txns') {
                return {
                    insert: async (data: any) => {
                        const txn = mockDb.insertTransaction(data)
                        return { data: txn, error: null }
                    },
                }
            }
            return {}
        },
    }
}

/**
 * Note: Mock LLM has been removed. Tests now use real Groq API calls.
 * See run-nodes-tests.ts for actual LLM extraction implementation.
 */

/**
 * Mock Whisper transcription
 */
export const mockTranscriptions: Record<string, string> = {
    'audio1': 'I worked on rebar tying for 3 hours today',
    'audio2': 'Electrical work took me 4 hours',
    'audio_spanish': 'Hice el tying del rebar para la cimentación hoy. Estuve todo el día doblado con las pinzas amarrando el fierro',
}

export function mockTranscribeAudio(url: string): string | null {
    // Extract audio file name from URL
    if (url.includes('audio1') || url.includes('a1.ogg')) {
        return mockTranscriptions.audio1
    } else if (url.includes('audio2')) {
        return mockTranscriptions.audio2
    } else if (url.includes('audio_spanish')) {
        return mockTranscriptions.audio_spanish
    }
    return null
}

/**
 * Mock image analysis
 */
export function mockAnalyzeImage(url: string): string {
    if (url.includes('rebar') || url.includes('MEb9caa')) {
        return 'Image shows construction site with rebar work. Steel reinforcement bars are visible, being tied together for foundation work.'
    } else if (url.includes('electrical')) {
        return 'Image shows electrical installation work. Outlets and wiring visible on wall.'
    }
    return 'Construction work in progress'
}

/**
 * Mock message capture (instead of sending via Twilio)
 */
export const sentMessages: Array<{ phone: string; message: string; source: string }> = []

export function mockSendMessage(phone: string, message: string, source: string) {
    sentMessages.push({ phone, message, source })
    console.log(`[MockTwilio] Would send to ${phone}: ${message}`)
}

export function clearSentMessages() {
    sentMessages.length = 0
}
