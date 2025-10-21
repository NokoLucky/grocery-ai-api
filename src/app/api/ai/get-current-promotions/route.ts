import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FreeAIService } from '@/lib/free-ai-service';

// Reuse your existing schemas
const PromotionSchema = z.object({
  title: z.string().describe('The headline of the promotion.'),
  store: z.string().describe('The store offering the promotion.'),
  img: z.string().describe('A URL for a relevant image.'),
  dataAiHint: z
    .string()
    .describe('A 1-2 word hint for generating an image, e.g., "laundry detergent".'),
  category: z.string().describe('The product category, e.g., "Dairy".'),
  discountPercent: z
    .number()
    .optional()
    .describe('The percentage discount, if applicable.'),
  validUntil: z
    .string()
    .optional()
    .describe('The expiration date of the promotion in YYYY-MM-DD format.'),
});

const GetCurrentPromotionsOutputSchema = z.object({
  promotions: z
    .array(PromotionSchema)
    .describe('A list of 5 current promotions.'),
});

// Cache schema
const CachedPromotionsSchema = GetCurrentPromotionsOutputSchema.extend({
  cachedAt: z.string().datetime(),
});
type CachedPromotions = z.infer<typeof CachedPromotionsSchema>;



// Simple in-memory cache
let cache: any = null;
let lastCacheUpdate = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    // Check cache first
    const now = Date.now();
    if (cache && (now - lastCacheUpdate) < CACHE_DURATION) {
      console.log("✅ Returning cached promotions");
      return NextResponse.json({ promotions: cache.promotions });
    }

    console.log("🔄 Cache is stale or missing. Generating new promotions.");
    const result = await getCurrentPromotionsFlow();
    
    // Update cache
    cache = {
      promotions: result.promotions,
      cachedAt: new Date().toISOString()
    };
    lastCacheUpdate = now;

    console.log("✅ Returning new promotions:", result.promotions.length);
    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Error in get current promotions:', error);
    
    // If error but we have stale cache, return it
    if (cache) {
      console.log("🔄 Error occurred, returning stale cache");
      return NextResponse.json({ promotions: cache.promotions });
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: `Failed to get current promotions: ${errorMessage}` },
      { status: 500 }
    );
  }
}

async function getCurrentPromotionsFlow(): Promise<z.infer<typeof GetCurrentPromotionsOutputSchema>> {
  console.log('1️⃣ Starting getCurrentPromotionsFlow');
  
  const prompt = createPrompt();
  console.log('2️⃣ Prompt created');
  
  const systemPrompt = `You are a promotions manager for a South African grocery app. Return ONLY valid JSON.`;
  console.log('3️⃣ Calling FreeAIService.generateText');
  
  const response = await FreeAIService.generateText(prompt, systemPrompt);
  console.log('4️⃣ FreeAIService response received');
  
  const parsedResult = parseAIResponse(response);
  console.log('5️⃣ AI response parsed');
  
  const promotions = await processPromotionsWithImages(parsedResult.promotions || []);
  console.log('6️⃣ Promotions with images processed');
  
  return { promotions };
}

function createPrompt(): string {
  const currentDate = new Date().toLocaleDateString('en-CA');
  
  return `You are a promotions manager for a South African grocery app.
Generate a list of 5 realistic, appealing promotions currently available at major South African retailers.

Today's date is ${currentDate}. Ensure the 'validUntil' date for each promotion is within the next month from today.

For each promotion, provide:
- A catchy title that includes the discount if applicable
- The store name
- A 1-2 word hint for generating a relevant image (dataAiHint) - be specific
- A product category
- An optional discount percentage (make it realistic, e.g., 10-30%)
- A valid expiration date (validUntil) in YYYY-MM-DD format
- For the 'img' field, use a temporary placeholder like "image_to_be_generated"

IMPORTANT: Return ONLY valid JSON in this exact format:
{
  "promotions": [
    {
      "title": "Promotion Title",
      "store": "Store Name", 
      "img": "image_to_be_generated",
      "dataAiHint": "product hint",
      "category": "Product Category",
      "discountPercent": 15,
      "validUntil": "2024-12-31"
    }
  ]
}`;
}

function parseAIResponse(text: string): any {
  console.log('🔍 Parsing AI response:', text.substring(0, 200) + '...');
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No JSON found in response');
  } catch (error) {
    console.error('❌ Error parsing AI response:', error);
    throw new Error('Invalid response format from AI');
  }
}

async function processPromotionsWithImages(promotions: any[]): Promise<any[]> {
  console.log('🖼️ Processing images for', promotions.length, 'promotions');
  
  // Simple image processing - no API calls
  const promotionsWithImages = promotions.map((promotion, index) => {
    const category = promotion.category?.toLowerCase() || 'general';
    
    const imageMap: { [key: string]: string } = {
      dairy: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&h=300&fit=crop',
      meat: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&h=300&fit=crop',
      produce: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=300&fit=crop',
      bakery: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=300&fit=crop',
      beverages: 'https://images.unsplash.com/photo-1541692645473-2ce69a4c0654?w=400&h=300&fit=crop',
      household: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=300&fit=crop',
    };

    return {
      ...promotion,
      img: imageMap[category] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=300&fit=crop',
      title: promotion.title || `Special Offer ${index + 1}`,
      store: promotion.store || 'Supermarket',
      dataAiHint: promotion.dataAiHint || 'grocery item',
      category: promotion.category || 'General',
      discountPercent: promotion.discountPercent || undefined,
      validUntil: promotion.validUntil || getDefaultExpiryDate(),
    };
  });

  console.log('✅ Images processed for all promotions');
  return promotionsWithImages;
}

function getDefaultExpiryDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().split('T')[0];
}

// POST handler for cache refresh
export async function POST(request: NextRequest) {
  try {
    // Force cache refresh
    cache = null;
    lastCacheUpdate = 0;
    
    const result = await getCurrentPromotionsFlow();
    
    // Update cache
    cache = {
      promotions: result.promotions,
      cachedAt: new Date().toISOString()
    };
    lastCacheUpdate = Date.now();

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error refreshing promotions:', error);
    return NextResponse.json(
      { error: 'Failed to refresh promotions' },
      { status: 500 }
    );
  }
}