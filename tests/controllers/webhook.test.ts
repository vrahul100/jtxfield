import { describe, it, expect, vi } from 'vitest'
import { handleTwilioWebhook } from '../../src/controllers/webhook'
import * as aiService from '../../src/services/ai'
import * as transcribeService from '../../src/services/transcribe'

// Mock AI Service
vi.mock('../../src/services/ai', () => ({
    parseChangeOrder: vi.fn()
}))

// Mock Transcribe Service
vi.mock('../../src/services/transcribe', () => ({
    transcribeAudio: vi.fn()
}))

describe('Webhook Controller', () => {
    it('should handle a valid webhook request', async () => {
        // Mock Data
        const mockBody = {
            "ToCountry": "US",
            "ErrorUrl": "https://hierologic-kissingly-renae.ngrok-free.dev/twilio-webhook",
            "MediaContentType0": "image/jpeg",
            "ToState": "",
            "SmsMessageSid": "MM8ff0603ed4b66833c1fc12b019fd764a",
            "ErrorCode": "11200",
            "NumMedia": "1",
            "ToCity": "",
            "FromZip": "94610",
            "SmsSid": "MM8ff0603ed4b66833c1fc12b019fd764a",
            "FromState": "CA",
            "SmsStatus": "received",
            "FromCity": "OAKLAND",
            "Body": "Steve& i fixed these wires",
            "FromCountry": "US",
            "To": "+18445235461",
            "MessagingServiceSid": "MGee3d5e9c33e0ff6467e33c760f902eba",
            "ToZip": "",
            "NumSegments": "1",
            "MessageSid": "MM8ff0603ed4b66833c1fc12b019fd764a",
            "AccountSid": "ACmock_account_sid_12345",
            "From": "+15102198037",
            "MediaUrl0": "https://api.twilio.com/2010-04-01/Accounts/ACmock_account_sid_12345/Messages/MM8ff0603ed4b66833c1fc12b019fd764a/Media/ME4537de9e37f073d58fbe93e173671a64",
            "ApiVersion": "2010-04-01"
        }

        const mockUser = {
            id: 1,
            company_id: 10,
            phone_number: '+15102198037',
            full_name: 'Steve'
        }

        const mockRate = { default_hourly_rate: '100.00' }
        const mockTicket = { id: 123 }

        // Mock Context
        const c = {
            req: {
                method: 'POST',
                url: 'http://localhost/webhook',
                header: vi.fn().mockReturnValue('application/json'),
                json: vi.fn().mockResolvedValue(mockBody),
                parseBody: vi.fn()
            },
            text: vi.fn()
        } as any

        // Mock SQL
        const sql = vi.fn() as any
        // Mock chaining for SQL queries
        // 1. User lookup
        // 2. Rate lookup
        // 3. Insert ticket
        // This is a bit tricky with the tagged template literal style of postgres.js
        // We'll implement a simple mock that returns different values based on calls

        let callCount = 0
        const mockSql = ((strings: any, ...values: any[]) => {
            callCount++
            if (strings[0].includes('SELECT * FROM members')) {
                return [mockUser]
            }
            if (strings[0].includes('SELECT default_hourly_rate')) {
                return [mockRate]
            }
            if (strings[0].includes('INSERT INTO txns')) {
                return [mockTicket]
            }
            return []
        }) as any

        // Mock AI Result
        vi.mocked(aiService.parseChangeOrder).mockResolvedValue({
            scope: 'Fixed wires',
            workers: ['Steve'],
            hours: 2,
            materials: [],
        })

        await handleTwilioWebhook(c, mockSql)

        // Verify AI was called with correct args
        expect(aiService.parseChangeOrder).toHaveBeenCalledWith(
            mockBody.Body,
            mockUser.full_name,
            mockBody.MediaUrl0
        )

        // Verify Response
        expect(c.text).toHaveBeenCalledWith(
            expect.stringContaining('Ticket #123 logged')
        )
    })

    it('should return error for unknown user', async () => {
        const mockBody = {
            From: '+1000000000',
            Body: 'Who dis?',
        }

        const c = {
            req: {
                method: 'POST',
                url: 'http://localhost/webhook',
                header: vi.fn().mockReturnValue('application/json'),
                json: vi.fn().mockResolvedValue(mockBody),
                parseBody: vi.fn()
            },
            text: vi.fn()
        } as any

        const mockSql = ((strings: any) => {
            if (strings[0].includes('SELECT * FROM members')) {
                return [] // No user found
            }
            return []
        }) as any

        await handleTwilioWebhook(c, mockSql)

        expect(c.text).toHaveBeenCalledWith('User not recognized.')
    })
    it('should return 400 if From or Body is missing', async () => {
        const mockBody = {
            // Missing From and Body
        }

        const c = {
            req: {
                method: 'POST',
                url: 'http://localhost/webhook',
                header: vi.fn().mockReturnValue('application/json'),
                json: vi.fn().mockResolvedValue(mockBody),
                parseBody: vi.fn()
            },
            text: vi.fn()
        } as any

        const mockSql = vi.fn() as any

        await handleTwilioWebhook(c, mockSql)

        expect(c.text).toHaveBeenCalledWith('Missing From or Body', 400)
    })
    it('should handle audio transcription', async () => {
        const mockBody = {
            "From": "+15102198037",
            "Body": "",
            "NumMedia": "1",
            "MediaUrl0": "http://example.com/audio.mp3",
            "MediaContentType0": "audio/mpeg"
        }

        const mockUser = {
            id: 1,
            company_id: 10,
            phone_number: '+15102198037',
            full_name: 'Steve'
        }

        const mockRate = { default_hourly_rate: '100.00' }
        const mockTicket = { id: 124 }

        const c = {
            req: {
                method: 'POST',
                url: 'http://localhost/webhook',
                header: vi.fn().mockReturnValue('application/json'),
                json: vi.fn().mockResolvedValue(mockBody),
                parseBody: vi.fn()
            },
            text: vi.fn()
        } as any

        const mockSql = ((strings: any) => {
            if (strings[0].includes('SELECT * FROM members')) return [mockUser]
            if (strings[0].includes('SELECT default_hourly_rate')) return [mockRate]
            if (strings[0].includes('INSERT INTO txns')) return [mockTicket]
            return []
        }) as any

        vi.mocked(transcribeService.transcribeAudio).mockResolvedValue('Transcribed text')
        vi.mocked(aiService.parseChangeOrder).mockResolvedValue({
            scope: 'Transcribed scope',
            workers: ['Steve'],
            hours: 1,
            materials: []
        })

        await handleTwilioWebhook(c, mockSql)

        expect(transcribeService.transcribeAudio).toHaveBeenCalledWith(
            mockBody.MediaUrl0,
            mockBody.MediaContentType0
        )
        expect(aiService.parseChangeOrder).toHaveBeenCalledWith(
            expect.stringContaining('Transcribed text'),
            mockUser.full_name,
            null
        )
    })
    it('should handle both audio and image in the same request', async () => {
        const mockBody = {
            "From": "+15102198037",
            "Body": "Check this out",
            "NumMedia": "2",
            "MediaUrl0": "http://example.com/audio.mp3",
            "MediaContentType0": "audio/mpeg",
            "MediaUrl1": "http://example.com/image.jpg",
            "MediaContentType1": "image/jpeg"
        }

        const mockUser = {
            id: 1,
            company_id: 10,
            phone_number: '+15102198037',
            full_name: 'Steve'
        }

        const mockRate = { default_hourly_rate: '100.00' }
        const mockTicket = { id: 125 }

        const c = {
            req: {
                method: 'POST',
                url: 'http://localhost/webhook',
                header: vi.fn().mockReturnValue('application/json'),
                json: vi.fn().mockResolvedValue(mockBody),
                parseBody: vi.fn()
            },
            text: vi.fn()
        } as any

        const mockSql = ((strings: any) => {
            if (strings[0].includes('SELECT * FROM members')) return [mockUser]
            if (strings[0].includes('SELECT default_hourly_rate')) return [mockRate]
            if (strings[0].includes('INSERT INTO txns')) return [mockTicket]
            return []
        }) as any

        vi.mocked(transcribeService.transcribeAudio).mockResolvedValue('Audio content')
        vi.mocked(aiService.parseChangeOrder).mockResolvedValue({
            scope: 'Mixed media scope',
            workers: ['Steve'],
            hours: 1,
            materials: []
        })

        await handleTwilioWebhook(c, mockSql)

        expect(transcribeService.transcribeAudio).toHaveBeenCalledWith(
            mockBody.MediaUrl0,
            mockBody.MediaContentType0
        )
        expect(aiService.parseChangeOrder).toHaveBeenCalledWith(
            expect.stringContaining('Audio content'),
            mockUser.full_name,
            mockBody.MediaUrl1
        )
    })
})
