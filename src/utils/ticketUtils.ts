/**
 * Utility functions for Ticket ID formatting and display codes
 * Spec requirement: [CompanyCode]-[Sequence starting at 10000] (e.g. ACE-10024)
 */

export function formatTicketCode(companyCode: string | null | undefined, id: number | string): string {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    if (isNaN(numericId)) return `#${id}`;

    const prefix = (companyCode || 'JTX').trim().toUpperCase();
    const seq = 10000 + numericId;
    return `${prefix}-${seq}`;
}
