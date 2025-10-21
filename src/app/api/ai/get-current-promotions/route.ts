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
  const currentDate = new Date();
  const currentMonth = currentDate.toLocaleDateString('en-US', { month: 'long' });
  const formattedDate = currentDate.toLocaleDateString('en-CA');
  
  return `You are a promotions manager for a South African grocery app.
Generate a list of 5 realistic, appealing promotions currently available at major South African retailers.

CONTEXT:
- Current month: ${currentMonth} (consider seasonal products)
- Major retailers: Checkers, Shoprite, Pick n Pay, Woolworths, Spar
- Typical promotion types: Percentage discounts, "Buy X Get Y Free", Multi-buy deals, Weekend specials

RULES:
- Create promotions that are realistic for South African grocery stores
- Include specific brand names where appropriate (e.g., "Koo Baked Beans", "Clover Milk", "Albany Bread")
- Make discount percentages realistic (10-40% range)
- Ensure validUntil dates are within the next 2-4 weeks from ${formattedDate}
- Use catchy, compelling titles that include the offer
- Include variety across different product categories
- Distribute promotions across different retailers

PRODUCT CATEGORIES TO CONSIDER:
- Dairy & Eggs (milk, cheese, yogurt, butter)
- Meat & Poultry (chicken, beef, pork)
- Fresh Produce (fruits, vegetables)
- Bakery (bread, rolls, pastries) 
- Beverages (juice, soft drinks, water)
- Pantry Staples (rice, pasta, canned goods)
- Household (cleaning products, toiletries)

CRITICAL: Return ONLY valid JSON in this exact format:
{
  "promotions": [
    {
      "title": "Catchy Promotion Title with Specific Offer",
      "store": "Store Name",
      "img": "image_to_be_generated",
      "dataAiHint": "specific product type",
      "category": "Product Category",
      "discountPercent": 25,
      "validUntil": "2024-12-15"
    }
  ]
}

EXAMPLES OF REALISTIC PROMOTIONS:
- "25% Off All Clover Dairy Products This Weekend"
- "Buy 2 Get 1 Free on Koo Canned Vegetables" 
- "Weekend Meat Special: 30% Off Chicken & Beef"
- "Back to School: 20% Off All Lunchbox Essentials"
- "Fresh Bakery Sale - R10 Off All Bread Varieties"

Generate 5 current promotions for ${currentMonth}:`;
}

function parseAIResponse(text: string): any {
  console.log('🔍 Parsing AI response:', text.substring(0, 200) + '...');
  try {
    // Clean the response - remove any markdown code blocks
    const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
    
    // Try to parse the cleaned text directly first
    try {
      return JSON.parse(cleanedText);
    } catch {
      // If direct parse fails, try to extract JSON
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
    
    throw new Error('No valid JSON found in response');
  } catch (error) {
    console.error('❌ Error parsing AI response:', error);
    console.log('Raw AI response:', text);
    throw new Error('Invalid response format from AI');
  }
}

async function processPromotionsWithImages(promotions: any[]): Promise<any[]> {
  console.log('🖼️ Processing images for', promotions.length, 'promotions');
  
  // Enhanced image mapping with more specific categories
  const imageMap: { [key: string]: string } = {
    // Dairy
    'dairy': 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&h=300&fit=crop',
    'milk': 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&h=300&fit=crop',
    'cheese': 'https://images.unsplash.com/photo-1552767050-9b3bdf1c91a5?w=400&h=300&fit=crop',
    'yogurt': 'https://images.unsplash.com/photo-1488477181946-6428a0291770?w=400&h=300&fit=crop',
    
    // Meat
    'meat': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&h=300&fit=crop',
    'chicken': 'https://images.unsplash.com/photo-1604503468506-9de1a0fd5c79?w=400&h=300&fit=crop',
    'beef': 'https://images.unsplash.com/photo-1594046243099-7a5e0745f1a3?w=400&h=300&fit=crop',
    'poultry': 'https://images.unsplash.com/photo-1604503468506-9e1a0fd5c79?w=400&h=300&fit=crop',
    
    // Produce
    'produce': 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=300&fit=crop',
    'fruits': 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=400&h=300&fit=crop',
    'vegetables': 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?w=400&h=300&fit=crop',
    'fresh': 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=300&fit=crop',
    
    // Bakery
    'bakery': 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=300&fit=crop',
    'bread': 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=400&h=300&fit=crop',
    'pastries': 'https://images.unsplash.com/photo-1555507038-44cf59c3d0ac?w=400&h=300&fit=crop',
    
    // Beverages
    'beverages': 'https://images.unsplash.com/photo-1541692645473-2ce69a4c0654?w=400&h=300&fit=crop',
    'juice': 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=400&h=300&fit=crop',
    'drinks': 'https://images.unsplash.com/photo-1541692645473-2ce69a4c0654?w=400&h=300&fit=crop',
    
    // Pantry
    'pantry': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=300&fit=crop',
    'canned': 'https://images.unsplash.com/photo-1594489573268-46b8d7674786?w=400&h=300&fit=crop',
    'staples': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=300&fit=crop',
    
    // Household
    'household': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=300&fit=crop',
    'cleaning': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=300&fit=crop',
    'toiletries': 'https://images.unsplash.com/photo-1556228578-8c89e6d6acb7?w=400&h=300&fit=crop',
  };

  const promotionsWithImages = promotions.map((promotion, index) => {
    const category = promotion.category?.toLowerCase() || 'general';
    const dataAiHint = promotion.dataAiHint?.toLowerCase() || 'grocery';
    
    // Find the best matching image
    let imageUrl = imageMap[dataAiHint] || imageMap[category] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=300&fit=crop';

    return {
      ...promotion,
      img: imageUrl,
      title: promotion.title || `Special Offer ${index + 1}`,
      store: promotion.store || 'Supermarket',
      dataAiHint: promotion.dataAiHint || category,
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