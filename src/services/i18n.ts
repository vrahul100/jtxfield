/**
 * Simple i18n translations for WhatsApp messages
 */

type MessageKey =
    | 'ticket_opened'
    | 'ticket_submitted'
    | 'ticket_review'
    | 'ticket_received'
    | 'send_photos'
    | 'send_details'
    | 'which_project'
    | 'reply_number'
    | 'logged_to'
    | 'admin_followup'
    | 'max_attachments'
    | 'invalid_selection'
    | 'welcome'
    | 'not_registered'
    | 'hours_question';

const translations: Record<string, Record<MessageKey, string>> = {
    en: {
        ticket_opened: '📋 Ticket #{id} opened.',
        ticket_submitted: '✅ Ticket #{id} submitted!',
        ticket_review: '📋 Ticket #{id} sent for review.',
        ticket_received: '📥 Ticket #{id}: Received!',
        send_photos: 'Send photos and details to complete it.',
        send_details: 'Send more details to complete.',
        which_project: 'Which project is this for?',
        reply_number: 'Reply with the number.',
        logged_to: 'Logged to: {project}',
        admin_followup: 'An admin will follow up.',
        max_attachments: '⚠️ Ticket #{id} has max 5 attachments. Send text details or wait for this ticket to close.',
        invalid_selection: 'Invalid selection. Reply with a number between 1 and {max}.',
        welcome: '✅ Welcome to JTX Field{name}!{team}\n\nYou\'re now activated. Start sending your work updates via text, photos, or voice notes.',
        not_registered: '👋 Hi! You\'re not registered. Please contact your admin.',
        hours_question: 'How many hours did this take?',
    },
    es: {
        ticket_opened: '📋 Ticket #{id} abierto.',
        ticket_submitted: '✅ ¡Ticket #{id} enviado!',
        ticket_review: '📋 Ticket #{id} enviado para revisión.',
        ticket_received: '📥 Ticket #{id}: ¡Recibido!',
        send_photos: 'Envía fotos y detalles para completarlo.',
        send_details: 'Envía más detalles para completar.',
        which_project: '¿Para qué proyecto es esto?',
        reply_number: 'Responde con el número.',
        logged_to: 'Registrado en: {project}',
        admin_followup: 'Un administrador dará seguimiento.',
        max_attachments: '⚠️ El ticket #{id} tiene máximo 5 archivos. Envía detalles en texto o espera a que se cierre.',
        invalid_selection: 'Selección inválida. Responde con un número entre 1 y {max}.',
        welcome: '✅ ¡Bienvenido a JTX Field{name}!{team}\n\nYa estás activado. Comienza a enviar tus reportes de trabajo por texto, fotos o notas de voz.',
        not_registered: '👋 ¡Hola! No estás registrado. Contacta a tu administrador.',
        hours_question: '¿Cuántas horas tomó esto?',
    },
};

/**
 * Get a translated message
 */
export function t(lang: string | null | undefined, key: MessageKey, params?: Record<string, string | number>): string {
    const language = lang === 'es' ? 'es' : 'en';
    let message = translations[language][key] || translations['en'][key];

    if (params) {
        for (const [k, v] of Object.entries(params)) {
            message = message.replace(`{${k}}`, String(v));
        }
    }

    return message;
}

/**
 * Get member's language preference
 */
export function getLang(member: { language_preference?: string | null }): string {
    return member.language_preference || 'en';
}
