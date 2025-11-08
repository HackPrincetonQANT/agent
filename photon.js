import { IMessageSDK } from '@photon-ai/imessage-kit'

// Initialize SDK (works in both Node.js and Bun)
const sdk = new IMessageSDK({
    debug: true,
    maxConcurrent: 5
})

// Get unread messages
const unreadMessages = await sdk.getUnreadMessages()
for (const { sender, messages } of unreadMessages) {
    console.log(`${sender}: ${messages.length} unread messages`)
}

// Send messages (unified API)
// Note: Make sure the Messages app is open and running before sending
try {
    await sdk.send('+12533683150', 'Hello!')
    console.log('Message sent successfully!')
} catch (error) {
    if (error.code === 'SEND' && error.message.includes('Messages app is not running')) {
        console.error('Error: Please open the Messages app on your Mac before running this script.')
    } else {
        console.error('Error sending message:', error.message)
    }
}
// Always close when done
await sdk.close()