import { IMessageSDK } from '@photon-ai/imessage-kit'
import { GoogleGenerativeAI } from '@google/generative-ai'
import fs from 'fs/promises'
import path from 'path'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// Initialize SDK (works in both Node.js and Bun)
const sdk = new IMessageSDK({
    debug: true,
    maxConcurrent: 5,
    watcher: {
        pollInterval: 3000,        // Check every 3 seconds
        unreadOnly: false,         // Watch all messages
        excludeOwnMessages: true   // Exclude own messages
    }
})

// Function to analyze receipt image with Gemini
async function analyzeReceipt(imagePath) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" })
        
        // Read image file
        const imageData = await fs.readFile(imagePath)
        const base64Image = imageData.toString('base64')
        
        const prompt = `You are a receipt parser. Analyze this receipt image and extract the following information:
- Each item's name
- Each item's price
- Each item's quantity (default to 1 if not specified)
- The total price

Return ONLY a valid JSON object in this exact format (no markdown, no explanation):
{
  "items": [
    {
      "name": "Item Name",
      "quantity": 1,
      "price": 10.99
    }
  ],
  "total": 10.99
}

Make sure all prices are numbers (not strings). If you cannot read the receipt, return {"error": "Could not parse receipt"}.`

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Image,
                    mimeType: 'image/jpeg'
                }
            }
        ])
        
        const response = await result.response
        const text = response.text()
        
        // Try to parse JSON from response
        let jsonText = text.trim()
        // Remove markdown code blocks if present
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
        
        return JSON.parse(jsonText)
    } catch (error) {
        console.error('Error analyzing receipt:', error)
        return { error: 'Failed to analyze receipt: ' + error.message }
    }
}

// Function to process incoming messages
async function handleMessage(message) {
    const { sender, text, attachments } = message
    
    console.log(`\n📨 New message from ${sender}`)
    console.log(`Text: ${text || 'No text'}`)
    console.log(`Attachments: ${attachments?.length || 0}`)
    
    // Check if message has image attachments
    if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
            // Check if it's an image
            if (attachment.mimeType?.startsWith('image/')) {
                console.log(`\n🖼️  Processing receipt image: ${attachment.filename}`)
                
                try {
                    // Analyze the receipt
                    const receiptData = await analyzeReceipt(attachment.path)
                    
                    if (receiptData.error) {
                        await sdk.send(sender, `❌ Error: ${receiptData.error}`)
                    } else {
                        // Format the response
                        let response = '🧾 Receipt Analysis:\n\n'
                        
                        if (receiptData.items && receiptData.items.length > 0) {
                            response += 'Items:\n'
                            receiptData.items.forEach((item, index) => {
                                response += `${index + 1}. ${item.name}\n`
                                response += `   Qty: ${item.quantity} × $${item.price.toFixed(2)}\n`
                            })
                            response += `\n💰 Total: $${receiptData.total.toFixed(2)}`
                        } else {
                            response += 'No items found in receipt.'
                        }
                        
                        // Send formatted response
                        await sdk.send(sender, response)
                        
                        // Also log the JSON
                        console.log('\n📊 Receipt JSON:')
                        console.log(JSON.stringify(receiptData, null, 2))
                    }
                } catch (error) {
                    console.error('Error processing receipt:', error)
                    await sdk.send(sender, '❌ Sorry, I had trouble processing that receipt.')
                }
            }
        }
    } else if (text) {
        // Handle text-only messages
        await sdk.send(sender, '📸 Please send me a receipt image to analyze!')
    }
}

// Start watching for new messages
console.log('\n✅ Bot is running and listening for messages...')
console.log('💡 Send a receipt image to process it!\n')

await sdk.startWatching({
    onNewMessage: handleMessage,
    onError: (error) => {
        console.error('❌ Watcher error:', error)
    }
})

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n👋 Shutting down...')
    sdk.stopWatching()
    await sdk.close()
    process.exit(0)
})