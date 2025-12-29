import { z } from 'zod';

// ============================================================================
// Base Schema - Common to all domains
// Optimized for Groq/Llama with .describe() hints
// ============================================================================

export const BaseExtractionSchema = z.object({
    intent: z.enum(['log', 'recovery', 'status', 'unknown'])
        .describe('log = worker reporting completed work, recovery = reporting damage, status = asking about ticket, unknown = cannot determine'),
    summary: z.string()
        .describe('A 1-2 sentence summary of what work was done or what damage was found'),
    projectName: z.string().nullable()
        .describe('The project/job site name if mentioned. Use null if not specified'),
    clarityScore: z.number().min(0).max(1).default(0.5)
        .describe('0.0 = very unclear message, 1.0 = perfectly clear. Default 0.5 if unsure'),
});

// ============================================================================
// Construction Domain Schema
// ============================================================================

export const ConstructionExtractionSchema = BaseExtractionSchema.extend({
    domain: z.literal('construction'),
    workType: z.enum(['electrical', 'plumbing', 'hvac', 'carpentry', 'masonry', 'painting', 'general'])
        .describe('The primary type of construction work. Use "general" if unclear or mixed'),
    hoursWorked: z.number().positive()
        .describe('Number of hours worked. If "half day" = 4, "full day" = 8. Must be > 0'),
    workersCount: z.number().int().positive().default(1)
        .describe('Number of workers. Default to 1 if not mentioned'),
    materialsUsed: z.array(z.string()).default([])
        .describe('List of materials mentioned. Empty array [] if none mentioned'),
    location: z.string().optional()
        .describe('Specific location like "floor 3", "unit 5B", "lobby". Omit if not mentioned'),
});

export type ConstructionExtraction = z.infer<typeof ConstructionExtractionSchema>;

// ============================================================================
// Recovery Domain Schema
// ============================================================================

export const RecoveryExtractionSchema = BaseExtractionSchema.extend({
    domain: z.literal('recovery'),
    damageType: z.string()
        .describe('Type of damage: "water damage", "fire damage", "structural crack", etc.'),
    affectedArea: z.number().positive()
        .describe('Estimated square feet of affected area. If unknown, estimate from context'),
    urgency: z.enum(['low', 'medium', 'high'])
        .describe('low = no risk, medium = needs attention soon, high = safety hazard'),
    recoveryAction: z.enum(['repair', 'replace', 'inspect', 'emergency'])
        .describe('repair = fix it, replace = needs new parts, inspect = just assess, emergency = urgent action'),
    damageDescription: z.string().optional()
        .describe('Additional details about the damage. Omit if covered in summary'),
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
// Groq Auto-Repair Helper
// ============================================================================

/**
 * Attempts to repair invalid JSON by wrapping it or fixing common issues
 */
export function attemptJsonRepair(rawResponse: string): object | null {
    try {
        // Try direct parse first
        return JSON.parse(rawResponse);
    } catch {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1].trim());
            } catch { /* continue */ }
        }

        // Try to find JSON object in response
        const objectMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            try {
                return JSON.parse(objectMatch[0]);
            } catch { /* continue */ }
        }

        return null;
    }
}

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
