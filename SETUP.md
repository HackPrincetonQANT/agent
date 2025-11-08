# Receipt Reader Bot Setup Guide

This bot receives receipt images via iMessage, analyzes them using Google Gemini AI, and returns structured data about the items and total price.

## Prerequisites

1. **macOS** - Required for iMessage integration
2. **Messages app** - Must be open and running
3. **Node.js** - v18 or higher
4. **Gemini API Key** - Get one from [Google AI Studio](https://aistudio.google.com/app/apikey)

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your Gemini API key:

```
GEMINI_API_KEY=your_actual_api_key_here
```

### 3. Open Messages App

**Important:** The Messages app must be open for the bot to work!

Open the Messages app on your Mac before running the bot.

### 4. Run the Bot

```bash
node photon.js
```

You should see:
```
✅ Bot is running and listening for messages...
💡 Send a receipt image to process it!
```

## How to Use

1. Send a receipt image to your phone number via iMessage
2. The bot will automatically:
   - Detect the incoming image
   - Send it to Gemini for analysis
   - Extract items, quantities, prices, and total
   - Reply with formatted receipt data

## Response Format

The bot will reply with:
```
🧾 Receipt Analysis:

Items:
1. Coffee
   Qty: 2 × $4.50
2. Sandwich
   Qty: 1 × $8.99

💰 Total: $17.99
```

And log the JSON data:
```json
{
  "items": [
    {
      "name": "Coffee",
      "quantity": 2,
      "price": 4.50
    },
    {
      "name": "Sandwich",
      "quantity": 1,
      "price": 8.99
    }
  ],
  "total": 17.99
}
```

## Troubleshooting

### "Messages app is not running" error
- Open the Messages app on your Mac

### "Invalid API key" error
- Check that your `.env` file has the correct `GEMINI_API_KEY`
- Make sure there are no extra spaces or quotes

### Bot not responding
- Check that the bot is still running (`node photon.js`)
- Ensure Messages app is open
- Check the terminal for error logs

## Stopping the Bot

Press `Ctrl+C` to stop the bot gracefully.
