// Type definitions for the Adaptive Brain

export interface Bucket {
    id: number
    node_id: number
    member_id: number
    project_id: number | null
    from_phone: string
    source: 'whatsapp' | 'sms'
    status: string
    raw_text: string | null
    image_urls: string | null
    audio_urls: string | null
    transcripts: string | null
    ai_response: string | null
    extraction_json: string | null  // Stores extraction between turns
    validation_attempts: number
    created_at: string
    updated_at: string
}

export interface Member {
    id: number
    node_id: number
    full_name: string | null
    phone_number: string
    status: string
    language_preference: string | null  // 'en', 'es', etc.
    last_confirmed_project_id: number | null
    project_confirmed_at: string | null
}

export interface Transaction {
    id?: number
    bucket_id: number
    company_id: number
    user_id: number
    project_id: number | null
    job: string
    time: number | null
    labor: string | null
    material: string | null
    evidence: string | null
    scope_description: string | null
    status: string
}
