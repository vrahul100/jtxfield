import { z } from 'zod';

// ============================================================================
// Base Schema - Common to all domains
// ============================================================================

export const BaseExtractionSchema = z.object({
    intent: z.enum(['log', 'recovery', 'status', 'unknown']),
    summary: z.string(),
    projectName: z.string().nullable(),
    clarityScore: z.number().min(0).max(1).default(0.5),
});

// ============================================================================
// Construction Domain Schema
// ============================================================================

export const ConstructionExtractionSchema = BaseExtractionSchema.extend({
    domain: z.literal('construction'),
    workType: z.enum(['electrical', 'plumbing', 'hvac', 'carpentry', 'masonry', 'painting', 'general']),
    hoursWorked: z.number().positive(),
    workersCount: z.number().int().positive().default(1),
    materialsUsed: z.array(z.string()).default([]),
    location: z.string().optional(), // e.g., "floor 3", "unit 5B"
});

export type ConstructionExtraction = z.infer<typeof ConstructionExtractionSchema>;

// ============================================================================
// Recovery Domain Schema
// ============================================================================

export const RecoveryExtractionSchema = BaseExtractionSchema.extend({
    domain: z.literal('recovery'),
    damageType: z.string(), // e.g., "water damage", "structural crack"
    affectedArea: z.number().positive(), // square feet
    urgency: z.enum(['low', 'medium', 'high']),
    recoveryAction: z.enum(['repair', 'replace', 'inspect', 'emergency']),
    damageDescription: z.string().optional(),
});

export type RecoveryExtraction = z.infer<typeof RecoveryExtractionSchema>;

// ============================================================================
// Union Type for All Domains
// ============================================================================

export type DomainExtraction = ConstructionExtraction | RecoveryExtraction;

// ============================================================================
// Field Mapping to Questions
// ============================================================================

export const FIELD_QUESTIONS: Record<string, string> = {
    // Construction
    workType: 'What type of work did you do? (electrical, plumbing, hvac, carpentry, etc.)',
    hoursWorked: 'How many hours did this take?',
    workersCount: 'How many workers were involved?',
    materialsUsed: 'What materials did you use?',
    location: 'Where specifically was this work done? (e.g., "floor 3", "room 5B")',

    // Recovery
    damageType: 'What type of damage occurred?',
    affectedArea: 'How large is the affected area (in square feet)?',
    urgency: 'How urgent is this? (low/medium/high)',
    recoveryAction: 'What action is needed? (repair/replace/inspect/emergency)',
    damageDescription: 'Can you describe the damage in more detail?',

    // Common
    projectName: 'Which project is this for?',
};

// ============================================================================
// Helper: Get schema for domain
// ============================================================================

export function getSchemaForDomain(domain: string) {
    switch (domain) {
        case 'construction':
            return ConstructionExtractionSchema;
        case 'recovery':
            return RecoveryExtractionSchema;
        default:
            return BaseExtractionSchema;
    }
}
