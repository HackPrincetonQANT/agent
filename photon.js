import { IMessageSDK } from '@photon-ai/imessage-kit'
import { GoogleGenerativeAI } from '@google/generative-ai'
import fs from 'fs/promises'
import dotenv from 'dotenv'

dotenv.config()

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const sdk = new IMessageSDK({
    debug: true,
    maxConcurrent: 5,
    watcher: {
        pollInterval: 3000,
        unreadOnly: false,
        excludeOwnMessages: true
    }
})

// FUNCTION 1: Send message
async function sendMessage(recipient, message) {
    try {
        await sdk.send(recipient, message)
        console.log(`[SEND] Message sent to ${recipient}`)
        return { success: true }
    } catch (error) {
        console.error(`[SEND ERROR] ${error.message}`)
        return { success: false, error: error.message }
    }
}

// FUNCTION 2: Parse receipt image
async function parseReceiptImage(imagePath) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" })
        const imageData = await fs.readFile(imagePath)
        const base64Image = imageData.toString('base64')

        const prompt = `Extract transaction data from this receipt. Return JSON only: {"store":"","location":"","items":[{"name":"","quantity":1,"price":10.99}],"total":10.99}`

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: base64Image, mimeType: 'image/jpeg' } }
        ])

        const text = result.response.text().trim().replace(/```json\n?/g, '').replace(/```\n?/g, '')
        const data = JSON.parse(text)

        console.log(`[PARSE] Success`)
        return { success: true, data }
    } catch (error) {
        console.error(`[PARSE ERROR] ${error.message}`)
        return { success: false, error: error.message }
    }
}

// FUNCTION 3: Search nearby places using Gemini with Google Search grounding
async function searchNearbyPlaces(query, location) {
    try {
        console.log(`[SEARCH] ${query} near ${location}`)

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp",
            tools: [{ googleSearch: {} }]
        })
        
        const prompt = `Find 3 cheap ${query} near ${location}. 

List them as:
1. [Name] - [Price] - [One sentence why]
2. [Name] - [Price] - [One sentence why]
3. [Name] - [Price] - [One sentence why]

Just the numbered list, nothing else.`

        const result = await model.generateContent(prompt)
        let responseText = result.response.text()
        
        // Remove markdown formatting
        responseText = responseText
            .replace(/\*\*/g, '')  // Remove bold **
            .replace(/\*/g, '')    // Remove italic *
            .replace(/#{1,6}\s/g, '')  // Remove headers
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')  // Remove links, keep text
        
        console.log(`[SEARCH] Cleaned result:`, responseText)

        // Parse the result - extract numbered lines
        const places = []
        const lines = responseText.split('\n')

        for (const line of lines) {
            const match = line.match(/^\s*(\d+)[\.\)]\s*(.+)/)
            if (match) {
                const rank = parseInt(match[1])
                const content = match[2].trim()
                
                places.push({
                    rank: rank,
                    name: content.split('-')[0]?.trim() || content.substring(0, 50),
                    description: content,
                    url: ''
                })
            }
        }

        if (places.length === 0) {
            // Fallback: return raw text
            return {
                success: true,
                places: [{
                    rank: 1,
                    name: `${query} near ${location}`,
                    description: responseText.replace(/\n+/g, ' ').substring(0, 200),
                    url: ''
                }]
            }
        }

        console.log(`[SEARCH] Found ${places.length} places`)
        return { success: true, places: places.slice(0, 3) }
    } catch (error) {
        console.error(`[SEARCH ERROR] ${error.message}`)
        return { success: false, error: error.message }
    }
}

// FUNCTION 4: Send recommendation
async function sendRecommendation(recipient, query, location) {
    try {
        console.log(`[RECOMMENDATION] Searching for ${query} near ${location}`)
        
        const result = await searchNearbyPlaces(query, location)
        
        if (result.success) {
            let message = `Affordable ${query} near ${location}:\n\n`
            result.places.forEach(p => {
                message += `${p.rank}. ${p.name}\n${p.description.trim()}\n\n`
            })
            await sendMessage(recipient, message)
            console.log(`[RECOMMENDATION] Sent to ${recipient}`)
            return { success: true }
        } else {
            await sendMessage(recipient, `Sorry, couldn't find ${query} near ${location}`)
            return { success: false, error: result.error }
        }
    } catch (error) {
        console.error(`[RECOMMENDATION ERROR] ${error.message}`)
        return { success: false, error: error.message }
    }
}

// Start bot
console.log('[START] Piggy bot initialized\n')

const TEST_NUMBER = process.env.TEST_NUMBER || '+15514049519'
await sendMessage(TEST_NUMBER, "Hi! I'm Piggy. I'm online!")

// Send recommendation for cheap coffee spots at Princeton
await sendRecommendation(TEST_NUMBER, 'coffee', 'Princeton University')

await sdk.startWatching({
    onNewMessage: async (msg) => {
        console.log(`\n[MSG] From: ${msg.sender}`)
        console.log(`[MSG] Attachments: ${msg.attachments?.length || 0}`)
        
        // Only handle images (receipts)
        if (msg.attachments?.length > 0) {
            for (const att of msg.attachments) {
                if (att.mimeType?.startsWith('image/')) {
                    console.log('[IMAGE] Processing receipt')
                    const result = await parseReceiptImage(att.path)
                    
                    if (result.success) {
                        const d = result.data
                        let resp = `Receipt Analysis\n\n`
                        if (d.store) resp += `Store: ${d.store}\n`
                        if (d.location) resp += `Location: ${d.location}\n\n`
                        if (d.items?.length > 0) {
                            resp += `Items:\n`
                            d.items.forEach((item, i) => {
                                resp += `${i + 1}. ${item.name} - Qty: ${item.quantity} x $${item.price.toFixed(2)}\n`
                            })
                            resp += `\nTotal: $${d.total.toFixed(2)}`
                        }
                        await sendMessage(msg.sender, resp)
                    }
                }
            }
        }
    },
    
    onError: (error) => {
        console.error('[ERROR]', error.message)
    }
})

process.on('SIGINT', async () => {
    console.log('\n[STOP] Shutting down')
    sdk.stopWatching()
    await sdk.close()
    process.exit(0)
})
