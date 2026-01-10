// jField State Schema for Adaptive Brain
// This defines the state that flows through the graph

import type { Bucket, Member } from './types.ts'

// Extraction result from LLM
export interface ExtractionResult {
    workType: string | null
    hoursWorked: number | null
    summary: string
    materials: string[]
    location: string | null
    projectHint: string | null  // Project name/hint from user's text
    isConsistent: boolean
    inconsistencyReason: string | null
    responseLanguage: 'en' | 'es'  // LLM detects user's language
    isWorkRelated: boolean  // False if message is spam/mischief/unrelated
}

// Validation result from deterministic checks
export interface ValidationResult {
    isValid: boolean
    missingFields: string[]
    invalidFields: string[]
    inconsistencyReason: string | null
}

// Main graph state
export interface BrainState {
    // Input
    bucketId: number

    // Context (loaded from DB)
    bucket: Bucket | null
    member: Member | null

    // Raw data
    rawText: string
    imageUrls: string[]
    audioUrls: string[]

    // Preprocessed data
    transcripts: string[]
    imageAnalysis: string

    // Extraction
    extraction: ExtractionResult | null

    // Validation
    validation: ValidationResult

    // Tracking
    attempts: number
    projectConfirmed: boolean  // True if user explicitly confirmed/provided project

    // Output
    status: 'processing' | 'open' | 'submitted' | 'flagged' | 'pending_review'
    response: string | null
    action: 'success' | 'ask_clarification' | 'ask_missing' | 'flagged' | 'error' | null
}

// Initial state factory
export function createInitialState(bucketId: number): BrainState {
    return {
        bucketId,
        bucket: null,
        member: null,
        rawText: '',
        imageUrls: [],
        audioUrls: [],
        transcripts: [],
        imageAnalysis: '',
        extraction: null,
        validation: {
            isValid: false,
            missingFields: [],
            invalidFields: [],
            inconsistencyReason: null,
        },
        attempts: 0,
        projectConfirmed: false,
        status: 'processing',
        response: null,
        action: null,
    }
}

// State annotation for jField
export const brainStateChannels = {
    bucketId: { value: (a: number, b: number) => b },
    bucket: { value: (a: Bucket | null, b: Bucket | null) => b },
    member: { value: (a: Member | null, b: Member | null) => b },
    rawText: { value: (a: string, b: string) => b },
    imageUrls: { value: (a: string[], b: string[]) => b },
    audioUrls: { value: (a: string[], b: string[]) => b },
    transcripts: { value: (a: string[], b: string[]) => [...a, ...b] }, // Append
    imageAnalysis: { value: (a: string, b: string) => b || a },
    extraction: { value: (a: ExtractionResult | null, b: ExtractionResult | null) => b },
    validation: { value: (a: ValidationResult, b: ValidationResult) => b },
    attempts: { value: (a: number, b: number) => b },
    status: { value: (a: string, b: string) => b },
    response: { value: (a: string | null, b: string | null) => b },
    action: { value: (a: string | null, b: string | null) => b },
}
