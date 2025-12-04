import { describe, it, expect, vi } from 'vitest'
import { createApp } from '../src/app'

// Mock Groq SDK
const { mockCreate } = vi.hoisted(() => {
    return { mockCreate: vi.fn() }
})

vi.mock('groq-sdk', () => {
    return {
        default: class {
            chat = {
                completions: {
                    create: mockCreate
                }
            }
        }
    }
})

// Mock global fetch for image resolution
global.fetch = vi.fn().mockResolvedValue({
    url: 'https://s3.amazonaws.com/final-image.jpg'
})

describe('Integration Test', () => {
    it('should process webhook end-to-end', async () => {
        // Mock SQL
        const mockSql = ((strings: any) => {
            if (strings[0].includes('SELECT * FROM users')) {
                return [{
                    id: 1,
                    company_id: 10,
                    phone_number: '+15102198037',
                    full_name: 'Integration Tester'
                }]
            }
            if (strings[0].includes('SELECT default_hourly_rate')) {
                return [{ default_hourly_rate: '50.00' }]
            }
            if (strings[0].includes('INSERT INTO change_orders')) {
                return [{ id: 999 }]
            }
            return []
        }) as any

        // Setup Groq Mock Response
        mockCreate.mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        scope: 'Integration Test Scope',
                        workers: ['Tester'],
                        hours: 1,
                        materials: []
                    })
                }
            }]
        })

        const app = createApp(mockSql)

        const res = await app.request('/twilio-webhook', {
            method: 'POST',
            body: new URLSearchParams({
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
            })
        })

        expect(res.status).toBe(200)
        const text = await res.text()
        expect(text).toContain('Ticket #999 logged')
        expect(mockCreate).toHaveBeenCalled()
    })
})
