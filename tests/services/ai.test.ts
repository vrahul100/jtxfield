import { describe, it, expect, vi } from 'vitest'
import { parseChangeOrder } from '../../src/services/ai'

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

// Mock global fetch
global.fetch = vi.fn().mockResolvedValue({
    url: 'https://s3.amazonaws.com/final-image.jpg'
})

describe('AI Service', () => {
    it('should parse change order text correctly', async () => {
        const mockResponse = {
            choices: [{
                message: {
                    content: JSON.stringify({
                        scope: 'Fixed wires',
                        workers: ['Steve'],
                        hours: 2,
                        materials: ['Wire']
                    })
                }
            }]
        }
        mockCreate.mockResolvedValue(mockResponse)

        const result = await parseChangeOrder('Steve fixed wires', 'Steve', 'http://example.com/image.jpg')

        expect(result).toEqual({
            scope: 'Fixed wires',
            workers: ['Steve'],
            hours: 2,
            materials: ['Wire']
        })
        expect(mockCreate).toHaveBeenCalledWith({
            messages: [
                {
                    role: "system",
                    content: expect.stringContaining('You are a Construction Admin')
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: 'Sender: Steve. Message: "Steve fixed wires"' },
                        { type: "image_url", image_url: { url: 'https://s3.amazonaws.com/final-image.jpg' } }
                    ]
                }
            ],
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            temperature: 0.1,
            response_format: { type: "json_object" }
        })
    })

    it('should handle empty response gracefully', async () => {
        mockCreate.mockResolvedValue({ choices: [] })
        const result = await parseChangeOrder('test', 'test', null)
        expect(result).toEqual({})
    })
})
