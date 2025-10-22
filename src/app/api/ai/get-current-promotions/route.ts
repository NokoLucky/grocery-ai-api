import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FreeAIService } from '@/lib/free-ai-service';

// Updated schema to match real store promotions
const PromotionSchema = z.object({
  title: z.string().describe('The promotion title with specific item and offer.'),
  store: z.string().describe('The store offering the promotion.'),
  img: z.string().describe('A URL for a relevant image.'),
  dataAiHint: z.string().describe('A 1-2 word hint for generating an image.'),
  category: z.string().describe('The product category.'),
  discountPercent: z.number().optional().describe('The percentage discount if applicable.'),
  savingsAmount: z.string().optional().describe('The amount saved, e.g., "R10".'),
  originalPrice: z.string().optional().describe('The original price before discount.'),
  currentPrice: z.string().optional().describe('The current promotional price.'),
  promotionType: z.enum(['percentage_discount', 'multibuy', 'price_drop', 'bundle']).describe('The type of promotion.'),
  validUntil: z.string().describe('The expiration date in YYYY-MM-DD format.'),
});

const GetCurrentPromotionsOutputSchema = z.object({
  promotions: z.array(PromotionSchema).describe('A list of 12 current promotions.'),
});

// Cache setup (keep your existing cache logic)
let cache: any = null;
let lastCacheUpdate = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const now = Date.now();
    if (cache && (now - lastCacheUpdate) < CACHE_DURATION) {
      console.log("✅ Returning cached promotions");
      return NextResponse.json({ promotions: cache.promotions });
    }

    console.log("🔄 Cache is stale or missing. Generating new promotions.");
    const result = await getCurrentPromotionsFlow();
    
    cache = {
      promotions: result.promotions,
      cachedAt: new Date().toISOString()
    };
    lastCacheUpdate = now;

    console.log("✅ Returning new promotions:", result.promotions.length);
    return NextResponse.json(result);
  } catch (error) {
    console.error('❌ Error in get current promotions:', error);
    
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
  const prompt = createPrompt();
  const systemPrompt = `You are a promotions manager for a South African grocery app. Return ONLY valid JSON.`;
  
  const response = await FreeAIService.generateText(prompt, systemPrompt);
  const parsedResult = parseAIResponse(response);
  const promotions = await processPromotionsWithImages(parsedResult.promotions || []);
  
  return { promotions };
}

function createPrompt(): string {
  const currentDate = new Date();
  const currentMonth = currentDate.toLocaleDateString('en-US', { month: 'long' });
  const formattedDate = currentDate.toLocaleDateString('en-CA');
  
  return `You are a promotions manager for a South African grocery app.
Generate a list of 12 realistic, item-specific promotions currently running at major South African retailers.

PROMOTION STYLES TO MIMIC (based on real SA store websites):

1. PERCENTAGE DISCOUNTS:
   - "Kellogg's Corn Flakes Cereal 1kg - Save 15% - Now R75 (Was R88)"
   - "Nestle Ricoffy 750g - 20% Off - Only R89.99"

2. MULTIBUY OFFERS:
   - "Sir Fruit 100% Juice 1L - Buy 2 for R50 (Save R15)"
   - "Coca-Cola 2L - 2 for R40 (Save R8)"

3. PRICE DROPS:
   - "Tastic Long Grain Rice 2kg - Price Drop! Now R45 (Save R10)"
   - "Sunlight Liquid Dishwashing 750ml - Only R29.99 (Save R5)"

4. BUNDLE DEALS:
   - "Checkers Sixty60 Special: Bread + Milk + Eggs - R99 Combo"
   - "Weekend Braai Pack: Chicken + Sausages + Charcoal - R199"

STORE PROFILES:
- CHECKERS: Known for "Little Meals", Sixty60 deals, house brands
- SHOPRITE: Weekly specials, Ritebrand products, bulk deals  
- PICK N PAY: Smart Shopper deals, fresh produce specials
- WOOLWORTHS: Premium quality, organic, free-range products
- SPAR: Convenience deals, bakery specials, local promotions

REQUIREMENTS:
- Generate 12 promotions (2-3 per major retailer)
- Focus on specific branded products with sizes
- Include clear savings amounts (e.g., "Save R10", "20% Off")
- Show original price vs current price
- Use realistic South African pricing in ZAR
- Make validUntil dates within the next 1-3 weeks
- Include variety: dairy, meat, pantry, beverages, household, bakery

PRODUCT CATEGORIES & BRANDS TO COVER:
- Cereals: Kellogg's, Bokomo, Weet-Bix
- Beverages: Coca-Cola, Appletiser, Sir Fruit, Liqui-Fruit
- Dairy: Clover, Parmalat, Lancewood, Danone
- Meat: Rainbow, Eskort, Farmer's Choice
- Pantry: Koo, All Gold, Tastic, Selati, Tiger Brands
- Household: Sunlight, OMO, Handy Andy

CRITICAL: Return ONLY valid JSON in this exact format:
{
  "promotions": [
    {
      "title": "Specific Product Name with Clear Offer",
      "store": "Store Name",
      "img": "image_to_be_generated",
      "dataAiHint": "specific product type",
      "category": "Product Category",
      "discountPercent": 15,
      "savingsAmount": "R10",
      "originalPrice": "R88.00",
      "currentPrice": "R75.00",
      "promotionType": "percentage_discount",
      "validUntil": "2024-12-15"
    }
  ]
}

PROMOTION TYPE OPTIONS:
- "percentage_discount" - e.g., "20% Off"
- "multibuy" - e.g., "Buy 2 for R50"  
- "price_drop" - e.g., "Price Drop! Now R45"
- "bundle" - e.g., "Combo Deal: 3 items for R99"

Generate 12 realistic promotions for ${currentMonth} that South African shoppers would actually find valuable:`;
}

function parseAIResponse(text: string): any {
  try {
    const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
    
    try {
      return JSON.parse(cleanedText);
    } catch {
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
  const imageMap: { [key: string]: string } = {
    // Cereals
    'cereal': 'https://images.unsplash.com/photo-1627483262769-04d0a1401487?w=400&h=300&fit=crop',
    'corn flakes': 'https://images.unsplash.com/photo-1627483262769-04d0a1401487?w=400&h=300&fit=crop',
    'weet-bix': 'https://images.unsplash.com/photo-1627483262769-04d0a1401487?w=400&h=300&fit=crop',
    
    // Beverages
    'juice': 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400&h=300&fit=crop',
    'soda': 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&h=300&fit=crop',
    'coffee': 'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=400&h=300&fit=crop',
    
    // Dairy
    'milk': 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&h=300&fit=crop',
    'cheese': 'https://images.unsplash.com/photo-1552767059-ce182ead6c1b?w=400&h=300&fit=crop',
    'yogurt': 'https://images.unsplash.com/photo-1567336273898-ebbe52c60a84?w=400&h=300&fit=crop',
    
    // Meat
    'chicken': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&h=300&fit=crop',
    'beef': 'https://images.unsplash.com/photo-1558036117-15e82a2c9a9a?w=400&h=300&fit=crop',
    'sausages': 'https://images.unsplash.com/photo-1558036117-15e82a2c9a9a?w=400&h=300&fit=crop',
    
    // Pantry
    'rice': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=300&fit=crop',
    'pasta': 'https://images.unsplash.com/photo-1551462147-37885a5d218d?w=400&h=300&fit=crop',
    'canned': 'https://images.unsplash.com/photo-1594489573268-46b8d7674786?w=400&h=300&fit=crop',
    
    // Household
    'detergent': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=300&fit=crop',
    'cleaner': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=300&fit=crop',
  };

  const promotionsWithImages = promotions.map((promotion, index) => {
    const category = promotion.category?.toLowerCase() || 'general';
    const dataAiHint = promotion.dataAiHint?.toLowerCase() || 'grocery';
    
    let imageUrl = imageMap[dataAiHint] || imageMap[category] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=300&fit=crop';

    return {
      ...promotion,
      img: imageUrl,
      title: promotion.title || `Special Offer ${index + 1}`,
      store: promotion.store || 'Supermarket',
      dataAiHint: promotion.dataAiHint || category,
      category: promotion.category || 'General',
      discountPercent: promotion.discountPercent || undefined,
      savingsAmount: promotion.savingsAmount || undefined,
      originalPrice: promotion.originalPrice || undefined,
      currentPrice: promotion.currentPrice || undefined,
      promotionType: promotion.promotionType || 'percentage_discount',
      validUntil: promotion.validUntil || getDefaultExpiryDate(),
    };
  });

  return promotionsWithImages;
}

function getDefaultExpiryDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().split('T')[0];
}

export async function POST(request: NextRequest) {
  try {
    cache = null;
    lastCacheUpdate = 0;
    
    const result = await getCurrentPromotionsFlow();
    
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