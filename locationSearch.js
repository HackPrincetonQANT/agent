import { Dedalus } from 'dedalus-labs'
import dotenv from 'dotenv'

dotenv.config()

// Initialize Dedalus client
const dedalus = new Dedalus({
    apiKey: process.env.DEDALUS_API_KEY
})

/**
 * Natural language search for nearby places using Dedalus
 * Handles queries like "find coffee shops nearby" or "show me pizza places"
 * @param {string} userQuery - Natural language query from user
 * @param {string} userLocation - Optional user location context
 * @returns {Promise<Object>} Search results with recommended spots
 */
export async function searchNearbyPlaces(userQuery, userLocation = null) {
    try {
        console.log(`🔍 Processing query: "${userQuery}"`)
        
        // Enhance query with location if provided
        let searchQuery = userQuery
        if (userLocation) {
            searchQuery = `${userQuery} near ${userLocation}`
        }
        
        // Use Dedalus web search with natural language
        const searchResults = await dedalus.webSearch({
            query: searchQuery,
            maxResults: 10
        })
        
        if (!searchResults || searchResults.length === 0) {
            return {
                error: 'No results found for your query',
                spots: []
            }
        }
        
        // Process and extract top spots
        const spots = searchResults
            .slice(0, 3) // Get top 3 results
            .map((result, index) => ({
                rank: index + 1,
                name: result.title,
                description: result.snippet || result.description || 'No description available',
                url: result.url
            }))
        
        return {
            query: userQuery,
            location: userLocation,
            spots
        }
        
    } catch (error) {
        console.error('Error searching nearby places:', error)
        return {
            error: 'Failed to search: ' + error.message,
            spots: []
        }
    }
}

/**
 * AI-enhanced natural language search using Gemini + Dedalus
 * Provides better context and recommendations
 * @param {string} userQuery - Natural language query from user
 * @param {string} userLocation - Optional user location
 * @param {Object} genAI - GoogleGenerativeAI instance
 * @returns {Promise<Object>} AI-analyzed recommendations
 */
export async function searchNearbyPlacesWithAI(userQuery, userLocation, genAI) {
    try {
        // First, get raw search results from Dedalus
        const rawResults = await searchNearbyPlaces(userQuery, userLocation)
        
        if (rawResults.error || rawResults.spots.length === 0) {
            return rawResults
        }
        
        // Use Gemini to analyze and enhance the results
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" })
        
        const prompt = `You are a helpful local guide assistant. A user asked: "${userQuery}"${userLocation ? ` near ${userLocation}` : ''}.

Here are the search results:
${JSON.stringify(rawResults.spots, null, 2)}

Analyze these results and provide recommendations. Return a JSON object with enhanced information:
{
  "summary": "Brief summary of what you found",
  "spots": [
    {
      "name": "Place Name",
      "description": "Why this place is great",
      "highlights": "Key features or specialties",
      "url": "URL"
    }
  ]
}

Make the descriptions engaging and helpful. Focus on what makes each place special.`
        
        const result = await model.generateContent(prompt)
        const response = await result.response
        let text = response.text().trim()
        
        // Remove markdown code blocks if present
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '')
        
        const aiAnalysis = JSON.parse(text)
        
        return {
            query: userQuery,
            location: userLocation,
            summary: aiAnalysis.summary,
            spots: aiAnalysis.spots
        }
        
    } catch (error) {
        console.error('Error in AI-enhanced search:', error)
        // Fallback to basic results if AI fails
        return await searchNearbyPlaces(userQuery, userLocation)
    }
}

/**
 * Format natural language search results for user
 * @param {Object} results - Results from searchNearbyPlacesWithAI
 * @returns {string} Formatted text response
 */
export function formatSearchResponse(results) {
    if (results.error || results.spots.length === 0) {
        return `❌ ${results.error || 'No places found for your search'}`
    }
    
    let response = `🔍 Search Results${results.location ? ` near ${results.location}` : ''}:\n\n`
    
    if (results.summary) {
        response += `${results.summary}\n\n`
    }
    
    results.spots.forEach(spot => {
        response += `${spot.rank || '•'} ${spot.name}\n`
        response += `   📝 ${spot.description}\n`
        if (spot.highlights) {
            response += `   ✨ ${spot.highlights}\n`
        }
        response += `   🔗 ${spot.url}\n\n`
    })
    
    return response
}

/**
 * Find cheaper alternative spots near a given location
 * @param {string} query - The type of place to search for (e.g., "coffee shop", "grocery store", "restaurant")
 * @param {string} location - The location/address to search near
 * @returns {Promise<Array>} Array of 3 cheaper alternative spots with details
 */
export async function findCheaperNearbySpots(query, location) {
    try {
        console.log(`🔍 Searching for cheaper ${query} near ${location}...`)
        
        // Use Dedalus web search MCP to find cheaper alternatives
        const searchQuery = `cheapest budget affordable ${query} near ${location} with prices`
        
        const searchResults = await dedalus.webSearch({
            query: searchQuery,
            maxResults: 10
        })
        
        if (!searchResults || searchResults.length === 0) {
            return {
                error: 'No results found',
                alternatives: []
            }
        }
        
        // Process and rank results by affordability indicators
        const rankedSpots = searchResults
            .map(result => ({
                name: result.title,
                description: result.snippet || result.description,
                url: result.url,
                // Score based on keywords indicating affordability
                affordabilityScore: calculateAffordabilityScore(result)
            }))
            .sort((a, b) => b.affordabilityScore - a.affordabilityScore)
            .slice(0, 3) // Get top 3 cheapest options
        
        return {
            query,
            location,
            alternatives: rankedSpots.map((spot, index) => ({
                rank: index + 1,
                name: spot.name,
                description: spot.description,
                url: spot.url
            }))
        }
        
    } catch (error) {
        console.error('Error searching for cheaper spots:', error)
        return {
            error: 'Failed to search for alternatives: ' + error.message,
            alternatives: []
        }
    }
}

/**
 * Calculate affordability score based on keywords in search results
 * @param {Object} result - Search result object
 * @returns {number} Affordability score (higher = more affordable)
 */
function calculateAffordabilityScore(result) {
    const text = `${result.title} ${result.snippet || ''} ${result.description || ''}`.toLowerCase()
    
    let score = 0
    
    // Keywords indicating affordability
    const affordableKeywords = [
        'cheap', 'budget', 'affordable', 'discount', 'deal', 'save',
        'inexpensive', 'low price', 'bargain', 'value', 'economical',
        'free', 'sale', '$', 'under', 'less than'
    ]
    
    // Keywords indicating expense (negative score)
    const expensiveKeywords = [
        'luxury', 'premium', 'expensive', 'upscale', 'high-end',
        'exclusive', 'gourmet', 'fine dining'
    ]
    
    // Add points for affordable keywords
    affordableKeywords.forEach(keyword => {
        if (text.includes(keyword)) {
            score += 2
        }
    })
    
    // Subtract points for expensive keywords
    expensiveKeywords.forEach(keyword => {
        if (text.includes(keyword)) {
            score -= 3
        }
    })
    
    return score
}

/**
 * Format the results as a user-friendly response
 * @param {Object} results - Results from findCheaperNearbySpots
 * @returns {string} Formatted text response
 */
export function formatAlternativesResponse(results) {
    if (results.error || results.alternatives.length === 0) {
        return `❌ ${results.error || 'No cheaper alternatives found'}`
    }
    
    let response = `💰 Found ${results.alternatives.length} cheaper alternatives for "${results.query}" near ${results.location}:\n\n`
    
    results.alternatives.forEach(spot => {
        response += `${spot.rank}. ${spot.name}\n`
        response += `   📝 ${spot.description}\n`
        response += `   🔗 ${spot.url}\n\n`
    })
    
    return response
}

/**
 * Alternative implementation using Gemini to analyze and compare prices
 * @param {string} query - The type of place to search for
 * @param {string} location - The location to search near
 * @param {Object} genAI - GoogleGenerativeAI instance
 * @returns {Promise<Object>} Analyzed results with price comparisons
 */
export async function findCheaperSpotsWithAI(query, location, genAI) {
    try {
        const dedalusResults = await findCheaperNearbySpots(query, location)
        
        if (dedalusResults.error || dedalusResults.alternatives.length === 0) {
            return dedalusResults
        }
        
        // Use Gemini to analyze and provide better recommendations
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" })
        
        const prompt = `Based on these search results for cheap ${query} near ${location}, analyze and rank the top 3 best budget-friendly options:

${JSON.stringify(dedalusResults.alternatives, null, 2)}

Return a JSON object with the top 3 spots, including estimated price range and why they're good budget options:
{
  "spots": [
    {
      "name": "Spot Name",
      "reason": "Why this is a good budget option",
      "estimatedPrice": "Price range or indication",
      "url": "URL"
    }
  ]
}`
        
        const result = await model.generateContent(prompt)
        const response = await result.response
        let text = response.text().trim()
        
        // Remove markdown code blocks if present
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '')
        
        const aiAnalysis = JSON.parse(text)
        
        return {
            query,
            location,
            alternatives: aiAnalysis.spots
        }
        
    } catch (error) {
        console.error('Error in AI-powered search:', error)
        return {
            error: 'Failed to analyze alternatives: ' + error.message,
            alternatives: []
        }
    }
}
