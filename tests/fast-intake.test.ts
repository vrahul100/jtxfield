import { describe, it, expect } from 'vitest';
import {
    formatTemplateA,
    formatTemplateB,
    formatTemplateC,
    formatTemplateD,
    formatTemplateProjectSelect,
    parseProjectSelection,
    parseHoursOnly
} from '../src/services/fastIntakeService.js';

describe('FastIntakeService - Meta Utility Templates (A, B, C, D)', () => {
    describe('Template A: ticket_logged_instant_ack', () => {
        it('formats English Template A correctly', () => {
            const result = formatTemplateA({
                task: 'Cableado segundo piso',
                durationHours: 4.5,
                projectName: 'City Mall Project',
                confirmationId: 1048,
                language: 'en',
            });
            expect(result).toContain('✅ Daily Work Log Updated.');
            expect(result).toContain('Task: Cableado segundo piso');
            expect(result).toContain('Duration: 4.5 hours');
            expect(result).toContain('Project: City Mall Project');
            expect(result).toContain('Confirmation ID: #1048');
            expect(result).toContain('Your submission has been recorded in the daily site report.');
        });

        it('formats Spanish Template A correctly', () => {
            const result = formatTemplateA({
                task: 'Cableado segundo piso',
                durationHours: 4.5,
                projectName: 'City Mall Project',
                confirmationId: 1048,
                language: 'es',
            });
            expect(result).toContain('✅ Registro de Trabajo Actualizado.');
            expect(result).toContain('Tarea: Cableado segundo piso');
            expect(result).toContain('Duración: 4.5 horas');
            expect(result).toContain('Proyecto: City Mall Project');
            expect(result).toContain('ID de Confirmación: #1048');
            expect(result).toContain('Tu reporte ha sido registrado en el informe diario de la obra.');
        });
    });

    describe('Template B: ticket_missing_hours_prompt', () => {
        it('formats English Template B correctly', () => {
            const result = formatTemplateB({
                projectName: 'City Mall Project',
                task: 'Instalación de tubería',
                language: 'en',
            });
            expect(result).toContain('📸 Work photo and details received for project: City Mall Project.');
            expect(result).toContain('Task logged: Instalación de tubería');
            expect(result).toContain('Please reply with the number of hours spent on this task to finalize the ticket.');
        });

        it('formats Spanish Template B correctly', () => {
            const result = formatTemplateB({
                projectName: 'City Mall Project',
                task: 'Instalación de tubería',
                language: 'es',
            });
            expect(result).toContain('📸 Foto y detalles de trabajo recibidos para el proyecto: City Mall Project.');
            expect(result).toContain('Tarea registrada: Instalación de tubería');
            expect(result).toContain('Por favor responde con el número de horas trabajadas para finalizar el ticket.');
        });
    });

    describe('Template C: ticket_silent_flag_ack', () => {
        it('formats English Template C correctly', () => {
            const result = formatTemplateC({
                projectName: 'City Mall Project',
                submissionId: 1049,
                language: 'en',
            });
            expect(result).toContain('✅ Field Update Received.');
            expect(result).toContain('Project: City Mall Project');
            expect(result).toContain('Submission ID: #1049');
            expect(result).toContain('Your photo and task notes have been securely uploaded to the supervisor dashboard.');
        });

        it('formats Spanish Template C correctly', () => {
            const result = formatTemplateC({
                projectName: 'City Mall Project',
                submissionId: 1049,
                language: 'es',
            });
            expect(result).toContain('✅ Actualización de Campo Recibida.');
            expect(result).toContain('Proyecto: City Mall Project');
            expect(result).toContain('ID de Envío: #1049');
            expect(result).toContain('Tu foto y notas de la tarea han sido enviadas al panel del supervisor.');
        });
    });

    describe('Template D: eod_daily_summary_wrap', () => {
        it('formats English Template D correctly', () => {
            const result = formatTemplateD({
                memberName: 'Mike Hernandez',
                totalTasks: 3,
                totalHours: 8.0,
                activeSite: 'City Mall Project',
                language: 'en',
            });
            expect(result).toContain('📊 Daily Shift Summary for Mike Hernandez.');
            expect(result).toContain('Total Tasks Logged: 3');
            expect(result).toContain('Total Hours: 8 hrs');
            expect(result).toContain('Active Site: City Mall Project');
            expect(result).toContain('Reply OK to confirm or reply with adjustments if anything is missing.');
        });

        it('formats Spanish Template D correctly', () => {
            const result = formatTemplateD({
                memberName: 'Mike Hernandez',
                totalTasks: 3,
                totalHours: 8.0,
                activeSite: 'City Mall Project',
                language: 'es',
            });
            expect(result).toContain('📊 Resumen Diario de Turno para Mike Hernandez.');
            expect(result).toContain('Total de Tareas Registradas: 3');
            expect(result).toContain('Horas Totales: 8 hrs');
            expect(result).toContain('Obra Activa: City Mall Project');
            expect(result).toContain('Responde OK para confirmar o envía los cambios si falta registrar algo.');
        });
    });

    describe('Template: Project Selection Prompt', () => {
        const sampleProjects = [
            { id: 1, name: 'Downtown Office Renovation' },
            { id: 2, name: 'City Mall Expansion' }
        ];

        it('formats English Project Selection template', () => {
            const result = formatTemplateProjectSelect({
                task: 'Plumbing — Drain installation',
                projects: sampleProjects,
                language: 'en',
            });
            expect(result).toContain('📌 *Select Project for Today\'s Work*');
            expect(result).toContain('Task: Plumbing — Drain installation');
            expect(result).toContain('1. Downtown Office Renovation');
            expect(result).toContain('2. City Mall Expansion');
            expect(result).toContain('Reply with the project number (1-2) to confirm.');
        });

        it('formats Spanish Project Selection template', () => {
            const result = formatTemplateProjectSelect({
                task: 'Plomería — Instalación de desagüe',
                projects: sampleProjects,
                language: 'es',
            });
            expect(result).toContain('📌 *Selecciona el Proyecto de Hoy*');
            expect(result).toContain('Tarea: Plomería — Instalación de desagüe');
            expect(result).toContain('1. Downtown Office Renovation');
            expect(result).toContain('2. City Mall Expansion');
            expect(result).toContain('Responde con el número de proyecto (1-2) para confirmar.');
        });
    });

    describe('parseProjectSelection Helper', () => {
        const sampleProjects = [
            { id: 10, name: 'Downtown Office Renovation' },
            { id: 20, name: 'City Mall Expansion' }
        ];

        it('matches numeric index', () => {
            expect(parseProjectSelection('1', sampleProjects)?.name).toBe('Downtown Office Renovation');
            expect(parseProjectSelection('2', sampleProjects)?.name).toBe('City Mall Expansion');
            expect(parseProjectSelection('#1', sampleProjects)?.name).toBe('Downtown Office Renovation');
            expect(parseProjectSelection('3', sampleProjects)).toBeNull();
        });

        it('matches project name fuzzy/substring', () => {
            expect(parseProjectSelection('downtown', sampleProjects)?.id).toBe(10);
            expect(parseProjectSelection('City Mall', sampleProjects)?.id).toBe(20);
        });
    });

    describe('parseHoursOnly Helper', () => {
        it('parses various hours strings', () => {
            expect(parseHoursOnly('6')).toBe(6);
            expect(parseHoursOnly('6.5')).toBe(6.5);
            expect(parseHoursOnly('6hrs')).toBe(6);
            expect(parseHoursOnly('6 hrs')).toBe(6);
            expect(parseHoursOnly('6 hours')).toBe(6);
            expect(parseHoursOnly('worked 4.5 hours')).toBe(4.5);
            expect(parseHoursOnly('trabajé 8 horas')).toBe(8);
            expect(parseHoursOnly('hello world')).toBeNull();
        });
    });
});
