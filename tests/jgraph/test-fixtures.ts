/**
 * Test fixtures for jgraph unit tests
 * Centralized test data and factory functions
 */

import type { MockBucket, MockMember, MockProject } from './mocks'

/**
 * Sample extraction results
 */
export const sampleExtractions = {
    rebar_complete: {
        workType: 'rebar',
        hoursWorked: 3,
        summary: 'Tying rebar for foundation',
        materials: ['rebar', 'wire'],
        location: null,
        projectHint: null,
        isConsistent: true,
        inconsistencyReason: null,
        responseLanguage: 'en' as const,
        isWorkRelated: true,
    },
    electrical_complete: {
        workType: 'electrical',
        hoursWorked: 4,
        summary: 'Installed outlets and wiring',
        materials: ['wire', 'outlets'],
        location: null,
        projectHint: null,
        isConsistent: true,
        inconsistencyReason: null,
        responseLanguage: 'en' as const,
        isWorkRelated: true,
    },
    spanish_complete: {
        workType: 'rebar',
        hoursWorked: 2,
        summary: 'Tying del rebar para la cimentación',
        materials: ['steel'],
        location: null,
        projectHint: null,
        isConsistent: true,
        inconsistencyReason: null,
        responseLanguage: 'es' as const,
        isWorkRelated: true,
    },
    work_only: {
        workType: 'plumbing',
        hoursWorked: null,
        summary: null,
        materials: [],
        location: null,
        projectHint: null,
        isConsistent: true,
        inconsistencyReason: null,
        responseLanguage: 'en' as const,
        isWorkRelated: true,
    },
    hours_only: {
        workType: null,
        hoursWorked: 5,
        summary: null,
        materials: [],
        location: null,
        projectHint: null,
        isConsistent: true,
        inconsistencyReason: null,
        responseLanguage: 'en' as const,
        isWorkRelated: true,
    },
    inconsistent: {
        workType: 'electrical',
        hoursWorked: 2,
        summary: 'Electrical work',
        materials: ['wire'],
        location: null,
        projectHint: null,
        isConsistent: false,
        inconsistencyReason: 'Image shows plumbing work but text mentions electrical',
        responseLanguage: 'en' as const,
        isWorkRelated: true,
    },
}

/**
 * Sample members
 */
export const sampleMembers: Record<string, Partial<MockMember>> = {
    john_english: {
        phone_number: '+15551234567',
        node_id: 1,
        last_confirmed_project_id: 10,
        project_confirmed_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        language_preference: 'en',
    },
    maria_spanish: {
        phone_number: '+15559876543',
        node_id: 1,
        last_confirmed_project_id: 11,
        project_confirmed_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
        language_preference: 'es',
    },
    steve_no_project: {
        phone_number: '+15555555555',
        node_id: 1,
        last_confirmed_project_id: null,
        project_confirmed_at: null,
        language_preference: 'en',
    },
    old_confirmation: {
        phone_number: '+15554444444',
        node_id: 1,
        last_confirmed_project_id: 10,
        project_confirmed_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(), // 10 hours ago (stale)
        language_preference: 'en',
    },
}

/**
 * Sample projects
 */
export const sampleProjects: Record<string, Partial<MockProject>> = {
    residential_tower: {
        node_id: 1,
        name: 'Residential Tower A',
        is_active: true,
        is_inbox: false,
    },
    commercial_plaza: {
        node_id: 1,
        name: 'Commercial Plaza',
        is_active: true,
        is_inbox: false,
    },
    parking_structure: {
        node_id: 1,
        name: 'Parking Structure',
        is_active: true,
        is_inbox: false,
    },
    inbox: {
        node_id: 1,
        name: 'Inbox',
        is_active: true,
        is_inbox: true,
    },
}

/**
 * Sample buckets in different states
 */
export const sampleBuckets: Record<string, Partial<MockBucket>> = {
    initial_complete_data: {
        member_id: 1,
        node_id: 1,
        from_phone: '+15551234567',
        raw_text: 'I worked on rebar tying for 3 hours at Residential Tower',
        image_urls: '[]',
        audio_urls: '[]',
        transcripts: null,
        extracted_data: JSON.stringify(sampleExtractions.rebar_complete),
        conversation_state: 'initial',
        state_attempts: 0,
        ai_response: null,
        status: 'open',
        project_id: null,
    },
    initial_work_only: {
        member_id: 1,
        node_id: 1,
        from_phone: '+15551234567',
        raw_text: 'Plumbing work',
        image_urls: '[]',
        audio_urls: '[]',
        transcripts: null,
        extracted_data: JSON.stringify(sampleExtractions.work_only),
        conversation_state: 'initial',
        state_attempts: 0,
        ai_response: null,
        status: 'open',
        project_id: null,
    },
    collecting_hours: {
        member_id: 1,
        node_id: 1,
        from_phone: '+15551234567',
        raw_text: 'Plumbing work\n5 hours',
        image_urls: '[]',
        audio_urls: '[]',
        transcripts: null,
        extracted_data: JSON.stringify(sampleExtractions.work_only),
        conversation_state: 'collecting_hours',
        state_attempts: 1,
        ai_response: 'I see plumbing. How many hours?',
        status: 'open',
        project_id: null,
    },
    confirming_project: {
        member_id: 1,
        node_id: 1,
        from_phone: '+15551234567',
        raw_text: 'Electrical work for 4 hours\nY',
        image_urls: '[]',
        audio_urls: '[]',
        transcripts: null,
        extracted_data: JSON.stringify(sampleExtractions.electrical_complete),
        conversation_state: 'confirming_project',
        state_attempts: 1,
        ai_response: 'electrical for 4h. At Residential Tower A? (Y/N)',
        status: 'open',
        project_id: null,
    },
    selecting_project: {
        member_id: 1,
        node_id: 1,
        from_phone: '+15551234567',
        raw_text: 'Electrical work for 4 hours\nN\n2',
        image_urls: '[]',
        audio_urls: '[]',
        transcripts: null,
        extracted_data: JSON.stringify(sampleExtractions.electrical_complete),
        conversation_state: 'selecting_project',
        state_attempts: 1,
        ai_response: 'electrical for 4h.\n\n1. Residential Tower A\n2. Commercial Plaza\n3. Parking Structure\n\nWhich one?',
        status: 'open',
        project_id: null,
    },
    with_audio: {
        member_id: 1,
        node_id: 1,
        from_phone: '+15551234567',
        raw_text: '',
        image_urls: '[]',
        audio_urls: '["http://localhost:3000/test-fixtures/audio1.ogg"]',
        transcripts: '["I worked on rebar tying for 3 hours today"]',
        extracted_data: null,
        conversation_state: 'initial',
        state_attempts: 0,
        ai_response: null,
        status: 'open',
        project_id: null,
    },
    with_image: {
        member_id: 1,
        node_id: 1,
        from_phone: '+15551234567',
        raw_text: 'Rebar work done',
        image_urls: '["https://api.twilio.com/2010-04-01/Accounts/ACb4d2e407ffbe87b50e75ae7108b2d316/Messages/MM116b5c35e29c39769c68114aa23d0d29/Media/MEb9caa05615a2aca7c036807cf11ded63"]',
        audio_urls: '[]',
        transcripts: null,
        extracted_data: null,
        conversation_state: 'initial',
        state_attempts: 0,
        ai_response: null,
        status: 'open',
        project_id: null,
    },
    spanish_worker: {
        member_id: 2,
        node_id: 1,
        from_phone: '+15559876543',
        raw_text: 'Hice el tying del rebar para la cimentación hoy',
        image_urls: '[]',
        audio_urls: '[]',
        transcripts: null,
        extracted_data: JSON.stringify(sampleExtractions.spanish_complete),
        conversation_state: 'initial',
        state_attempts: 0,
        ai_response: null,
        status: 'open',
        project_id: null,
    },
}

/**
 * Factory function to create a bucket with custom overrides
 */
export function createTestBucket(overrides: Partial<MockBucket> = {}): Partial<MockBucket> {
    return {
        member_id: 1,
        node_id: 1,
        from_phone: '+15551234567',
        source: 'whatsapp',
        raw_text: '',
        image_urls: '[]',
        audio_urls: '[]',
        transcripts: null,
        extracted_data: null,
        conversation_state: 'initial',
        state_attempts: 0,
        ai_response: null,
        status: 'open',
        project_id: null,
        summary: null,
        created_at: new Date().toISOString(),
        ...overrides,
    }
}

/**
 * Factory function to create a member with custom overrides
 */
export function createTestMember(overrides: Partial<MockMember> = {}): Partial<MockMember> {
    return {
        phone_number: '+15551234567',
        node_id: 1,
        last_confirmed_project_id: null,
        project_confirmed_at: null,
        language_preference: 'en',
        ...overrides,
    }
}

/**
 * Factory function to create a project with custom overrides
 */
export function createTestProject(overrides: Partial<MockProject> = {}): Partial<MockProject> {
    return {
        node_id: 1,
        name: 'Test Project',
        is_active: true,
        is_inbox: false,
        ...overrides,
    }
}
