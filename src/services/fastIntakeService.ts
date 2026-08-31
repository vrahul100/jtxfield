import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface FastIntakeResult {
    theme: string;
    hours: number | null;
    hasExplicitHours: boolean;
    language: 'en' | 'es';
    isMismatch: boolean;
    mismatchReason: string | null;
    confidence: 'high' | 'medium' | 'low';
    templateType: 'A' | 'B' | 'C';
    templatedReply: string;
}

// ============================================================================
// META UTILITY TEMPLATE DEFINITIONS (EN & ES)
// ============================================================================

/**
 * Template A: ticket_logged_instant_ack (Primary Fast-Path)
 * Triggered when hours and project context are successfully extracted or cached.
 */
export function formatTemplateA(options: {
    task: string;
    durationHours: number;
    projectName: string;
    confirmationId: string | number;
    language?: 'en' | 'es';
}): string {
    const { task, durationHours, projectName, confirmationId, language = 'en' } = options;
    const hoursStr = durationHours % 1 === 0 ? `${durationHours}` : durationHours.toFixed(1);
    const cleanProject = projectName || 'General Project';

    if (language === 'es') {
        return `✅ Registro de Trabajo Actualizado.\n\nTarea: ${task}\nDuración: ${hoursStr} horas\nProyecto: ${cleanProject}\nID de Confirmación: #${confirmationId}\n\nTu reporte ha sido registrado en el informe diario de la obra.`;
    }

    return `✅ Daily Work Log Updated.\n\nTask: ${task}\nDuration: ${hoursStr} hours\nProject: ${cleanProject}\nConfirmation ID: #${confirmationId}\n\nYour submission has been recorded in the daily site report.`;
}

/**
 * Template B: ticket_missing_hours_prompt (Clarification Path)
 * Triggered when project is known, but worker omitted hours in caption/voice.
 */
export function formatTemplateB(options: {
    projectName: string;
    task: string;
    language?: 'en' | 'es';
}): string {
    const { projectName, task, language = 'en' } = options;
    const cleanProject = projectName || 'General Project';

    if (language === 'es') {
        return `📸 Foto y detalles de trabajo recibidos para el proyecto: ${cleanProject}.\n\nTarea registrada: ${task}\n\nPor favor responde con el número de horas trabajadas para finalizar el ticket.`;
    }

    return `📸 Work photo and details received for project: ${cleanProject}.\n\nTask logged: ${task}\n\nPlease reply with the number of hours spent on this task to finalize the ticket.`;
}

/**
 * Template C: ticket_silent_flag_ack (Scope Mismatch Path)
 * Triggered when visual model detects discrepancy between photo and description.
 * Intake is confirmed without blocking worker; routed to manager queue.
 */
export function formatTemplateC(options: {
    projectName: string;
    submissionId: string | number;
    language?: 'en' | 'es';
}): string {
    const { projectName, submissionId, language = 'en' } = options;
    const cleanProject = projectName || 'General Project';

    if (language === 'es') {
        return `✅ Actualización de Campo Recibida.\n\nProyecto: ${cleanProject}\nID de Envío: #${submissionId}\n\nTu foto y notas de la tarea han sido enviadas al panel del supervisor.`;
    }

    return `✅ Field Update Received.\n\nProject: ${cleanProject}\nSubmission ID: #${submissionId}\n\nYour photo and task notes have been securely uploaded to the supervisor dashboard.`;
}

/**
 * Template D: eod_daily_summary_wrap (Shift Wrap-Up)
 * Triggered at end-of-shift (4:30 PM / 5:00 PM) to wrap up daily activity.
 */
export function formatTemplateD(options: {
    memberName: string;
    totalTasks: number;
    totalHours: number;
    activeSite: string;
    language?: 'en' | 'es';
}): string {
    const { memberName, totalTasks, totalHours, activeSite, language = 'en' } = options;
    const hoursStr = totalHours % 1 === 0 ? `${totalHours}` : totalHours.toFixed(1);
    const cleanSite = activeSite || 'General Project';

    if (language === 'es') {
        return `📊 Resumen Diario de Turno para ${memberName}.\n\nTotal de Tareas Registradas: ${totalTasks}\nHoras Totales: ${hoursStr} hrs\nObra Activa: ${cleanSite}\n\nResponde OK para confirmar o envía los cambios si falta registrar algo.`;
    }

    return `📊 Daily Shift Summary for ${memberName}.\n\nTotal Tasks Logged: ${totalTasks}\nTotal Hours: ${hoursStr} hrs\nActive Site: ${cleanSite}\n\nReply OK to confirm or reply with adjustments if anything is missing.`;
}

/**
 * Template: Project Selection Prompt
 * Triggered when a worker logs work without a fresh cached project (<6h) and did not state a project.
 */
export function formatTemplateProjectSelect(options: {
    task: string;
    projects: Array<{ id: number; name: string }>;
    language?: 'en' | 'es';
}): string {
    const { task, projects, language = 'en' } = options;
    const projectList = projects.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    const rangeHint = projects.length > 1 ? `1-${projects.length}` : '1';

    if (language === 'es') {
        return `📌 *Selecciona el Proyecto de Hoy*\n\nTarea: ${task}\n\n${projectList}\n\nResponde con el número de proyecto (${rangeHint}) para confirmar.`;
    }

    return `📌 *Select Project for Today's Work*\n\nTask: ${task}\n\n${projectList}\n\nReply with the project number (${rangeHint}) to confirm.`;
}

/**
 * Helper to parse project selection replies (e.g., "1", "2", "1.", "#1", or project name fuzzy match)
 */
export function parseProjectSelection(text: string, projects: Array<{ id: number; name: string }>): { id: number; name: string } | null {
    if (!text || !projects.length) return null;
    const clean = text.trim().toLowerCase();

    // Check direct number (1-indexed)
    const numMatch = clean.match(/^#?(\d+)\.?$/);
    if (numMatch && numMatch[1]) {
        const index = parseInt(numMatch[1], 10) - 1;
        if (index >= 0 && index < projects.length) {
            return projects[index];
        }
    }

    // Check direct or substring match against project names
    for (const proj of projects) {
        const pName = proj.name.toLowerCase();
        if (clean === pName || pName.includes(clean) || clean.includes(pName)) {
            return proj;
        }
    }

    return null;
}

// Backward compatibility alias for legacy callers
export const formatUtilityTemplate = (options: { theme: string; hours: number; projectName: string; language?: 'en' | 'es' }) =>
    formatTemplateA({
        task: options.theme,
        durationHours: options.hours,
        projectName: options.projectName,
        confirmationId: '1001',
        language: options.language,
    });

/**
 * Helper to parse isolated hours replies (e.g., "6hrs", "4.5", "5 horas", "worked 6 hours")
 */
export function parseHoursOnly(text: string): number | null {
    if (!text) return null;
    const clean = text.trim().toLowerCase();

    // Match patterns like "6", "6.5", "6hrs", "6 hrs", "6 hours", "6 horas", "6h", "6 h"
    const match = clean.match(/^(\d+(?:\.\d+)?)\s*(?:hrs?|hours?|horas?|h)?$/i) ||
                  clean.match(/(?:worked|trabaje|trabajé|hice)?\s*(\d+(?:\.\d+)?)\s*(?:hrs?|hours?|horas?|h)/i);

    if (match && match[1]) {
        const val = parseFloat(match[1]);
        if (!isNaN(val) && val > 0 && val <= 24) {
            return val;
        }
    }
    return null;
}

/**
 * Fast single-pass intake validation & theme extraction
 */
export async function fastIntakeValidation(params: {
    rawText?: string;
    transcript?: string;
    imageUrl?: string | null;
    projectName?: string;
    ticketId?: string | number;
    availableProjects?: Array<{ id: number; name: string }>;
}): Promise<FastIntakeResult> {
    const {
        rawText = '',
        transcript = '',
        imageUrl = null,
        projectName = 'General Project',
        ticketId = '1001',
        availableProjects = [],
    } = params;

    const userTextCombined = [rawText, transcript ? `[Voice] ${transcript}` : ''].filter(Boolean).join('\n').trim();

    // Default fallback in case of AI outage
    const defaultTheme = userTextCombined ? `Field Work — ${userTextCombined.substring(0, 40)}` : 'Site Inspection & Labor';
    const fallbackResult: FastIntakeResult = {
        theme: defaultTheme,
        hours: 8,
        hasExplicitHours: false,
        language: 'en',
        isMismatch: false,
        mismatchReason: null,
        confidence: 'medium',
        templateType: 'A',
        templatedReply: formatTemplateA({
            task: defaultTheme,
            durationHours: 8,
            projectName,
            confirmationId: ticketId,
            language: 'en',
        }),
        mentionedProjectId: null,
    };

    try {
        const userContent: any[] = [];

        if (userTextCombined) {
            userContent.push({ type: 'text', text: `User Text / Voice: "${userTextCombined}"` });
        } else {
            userContent.push({ type: 'text', text: '[No text provided — Photo only]' });
        }

        if (imageUrl) {
            try {
                const headResp = await fetch(imageUrl, { method: 'HEAD', redirect: 'follow' });
                const resolvedUrl = headResp.url || imageUrl;
                userContent.push({
                    type: 'image_url',
                    image_url: { url: resolvedUrl },
                });
            } catch {
                userContent.push({
                    type: 'image_url',
                    image_url: { url: imageUrl },
                });
            }
        }

        const model = imageUrl
            ? (process.env.VISION_MODEL || 'qwen/qwen3.6-27b')
            : (process.env.GENERAL_MODEL || 'openai/gpt-oss-20b');

        const projectListPrompt = availableProjects.length > 0
            ? `\nKNOWN PROJECTS: ${availableProjects.map(p => `"${p.name}" (id: ${p.id})`).join(', ')}`
            : '';

        const systemPrompt = `You are a high-speed construction intake analyzer for WhatsApp work logging.
Your job is to perform a fast, single-pass classification of the worker's upload into a clean specific theme, extract hours if stated, detect any mentioned project, and check for any trade mismatch between photo and text.${projectListPrompt}

OUTPUT RULES (Return valid JSON ONLY):
{
  "theme": "Trade — Specific Task / Scope", // e.g. "Rebar — Concrete reinforcement", "Carpentry — Parapet framing", "Electrical — Replaced panel", "Plumbing — Pipe installation". If photo only, extract directly from photo.
  "hours": 6.5, // Explicit hours stated by worker in text/voice, or null if worker did NOT mention hours.
  "hasExplicitHours": true, // true if hours were explicitly stated by worker, false if omitted
  "mentionedProjectId": 12, // Project ID if worker mentioned a known project in text/voice, otherwise null
  "language": "en" | "es", // "es" if Spanish detected
  "isMismatch": false, // true ONLY if photo clearly contradicts the text trade (e.g. photo is brick masonry but text says electrical wiring)
  "mismatchReason": "Photo shows brick masonry, but worker text states electrical", // or null
  "confidence": "high" | "medium" | "low"
}

IMPORTANT:
- Do NOT output generic single words like "carpentry". Combine trade and task ("Carpentry — Parapet railing").
- If worker did not mention hours (e.g. sent only photo or description without time), set "hours": null and "hasExplicitHours": false.
- If worker stated hours (e.g. "for 6 hours", "4.5h", "por 5 horas"), extract that number into "hours" and set "hasExplicitHours": true.
- If worker explicitly stated a project name or site, match it to one of the KNOWN PROJECTS and return its ID in "mentionedProjectId".
- If photo and text contradict, set isMismatch=true.`;

        const completion = await groq.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ],
            temperature: 0.1,
            max_tokens: 1200,
        });

        const rawContent = completion.choices[0]?.message?.content?.trim();
        if (!rawContent) return fallbackResult;

        // Strip <think>...</think> reasoning tags if emitted by reasoning models
        const cleanContent = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        // Robust JSON extraction
        let parsed: any = null;
        try {
            parsed = JSON.parse(cleanContent);
        } catch {
            const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    parsed = JSON.parse(jsonMatch[0]);
                } catch (e) {
                    console.warn('[FastIntake] JSON parse regex fallback failed:', e);
                }
            }
        }

        if (!parsed) {
            console.warn('[FastIntake] Could not parse AI response as JSON:', rawContent.substring(0, 150));
            return fallbackResult;
        }

        const theme = parsed.theme || fallbackResult.theme;
        const rawHoursNum = typeof parsed.hours === 'number'
            ? parsed.hours
            : (typeof parsed.hours === 'string' ? parseFloat(parsed.hours) : null);
        const validHours = rawHoursNum != null && !isNaN(rawHoursNum) && rawHoursNum > 0 && rawHoursNum <= 24
            ? rawHoursNum
            : null;
        const hasExplicitHours = Boolean(validHours != null && (parsed.hasExplicitHours !== false));
        const hours = validHours;
        const language = parsed.language === 'es' ? 'es' : 'en';
        const isMismatch = Boolean(parsed.isMismatch);
        const mismatchReason = parsed.mismatchReason || null;
        const confidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium';

        // Select the appropriate Meta Utility Template based on the routing rules
        let templateType: 'A' | 'B' | 'C' = 'A';
        let templatedReply = '';

        if (isMismatch) {
            // Scope Mismatch Path -> Template C (Silent Flag ACK)
            templateType = 'C';
            templatedReply = formatTemplateC({
                projectName,
                submissionId: ticketId,
                language,
            });
        } else if (!hasExplicitHours) {
            // Missing Hours Path -> Template B (Clarification Prompt)
            templateType = 'B';
            templatedReply = formatTemplateB({
                projectName,
                task: theme,
                language,
            });
        } else {
            // Complete Intake Path -> Template A (Instant ACK)
            templateType = 'A';
            templatedReply = formatTemplateA({
                task: theme,
                durationHours: hours || 8,
                projectName,
                confirmationId: ticketId,
                language,
            });
        }

        const mentionedProjectId = typeof parsed.mentionedProjectId === 'number' ? parsed.mentionedProjectId : null;

        return {
            theme,
            hours,
            hasExplicitHours,
            language,
            isMismatch,
            mismatchReason,
            confidence,
            templateType,
            templatedReply,
            mentionedProjectId,
        };
    } catch (err) {
        console.error('[FastIntake] Validation error:', err);
        return fallbackResult;
    }
}
