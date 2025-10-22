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
Generate a list of 10 realistic, item-specific promotions currently running at major South African retailers.

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

Generate 10 realistic promotions for ${currentMonth} that South African shoppers would actually find valuable:`;
}

  function parseAIResponse(text: string): any {
    try {
      // Try to extract whatever promotions we can get from the partial response
      const promotionsMatch = text.match(/"promotions"\s*:\s*\[[\s\S]*?\](?=\s*[}\]])/);
      if (promotionsMatch) {
        const partialJson = `{${promotionsMatch[0]}}`;
        try {
          const result = JSON.parse(partialJson);
          console.log(`✅ Extracted ${result.promotions?.length || 0} promotions from partial response`);
          return result;
        } catch (e) {
          // Continue to fallback
        }
      }
      
      // Fallback to original parsing
      const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleanedText);
    } catch (error) {
      console.error('❌ Error parsing AI response:', error);
      // Return empty promotions instead of throwing error
      return { promotions: [] };
    }
  }

  async function processPromotionsWithImages(promotions: any[]): Promise<any[]> {
  const imageMap: { [key: string]: string } = {
    // Cereals & Breakfast
    'corn flakes': 'https://images.pexels.com/photos/2119758/pexels-photo-2119758.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'kellogg': 'https://images.pexels.com/photos/2119758/pexels-photo-2119758.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'cereal': 'https://images.pexels.com/photos/2119758/pexels-photo-2119758.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    
    // Coffee & Tea
    'ricoffy': 'https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'coffee': 'https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'nescafe': 'https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    
    // Beverages
    'coca-cola': 'https://images.pexels.com/photos/50593/coca-cola-cold-drink-soft-drink-coke-50593.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'juice': 'https://images.pexels.com/photos/1304548/pexels-photo-1304548.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'sir fruit': 'https://images.pexels.com/photos/1304548/pexels-photo-1304548.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'beverage': 'https://images.pexels.com/photos/1304548/pexels-photo-1304548.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    
    // Rice & Grains
    'tastic': 'https://images.pexels.com/photos/2098135/pexels-photo-2098135.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'rice': 'https://images.pexels.com/photos/2098135/pexels-photo-2098135.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'maize meal': 'https://images.pexels.com/photos/2098135/pexels-photo-2098135.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'bokomo': 'https://images.pexels.com/photos/2098135/pexels-photo-2098135.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    
    // Dairy
    'milk': 'https://images.pexels.com/photos/248412/pexels-photo-248412.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'yogurt': 'https://images.pexels.com/photos/3734612/pexels-photo-3734612.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'greek yogurt': 'https://images.pexels.com/photos/3734612/pexels-photo-3734612.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'lancewood': 'https://images.pexels.com/photos/3734612/pexels-photo-3734612.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'butter': 'https://images.pexels.com/photos/3311336/pexels-photo-3311336.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'dairy': 'https://images.pexels.com/photos/248412/pexels-photo-248412.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    
    // Meat & Poultry
    'chicken': 'https://images.pexels.com/photos/65175/pexels-photo-65175.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'rainbow chicken': 'https://images.pexels.com/photos/65175/pexels-photo-65175.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'chicken breast': 'https://images.pexels.com/photos/65175/pexels-photo-65175.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'meat': 'https://images.pexels.com/photos/65175/pexels-photo-65175.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    
    // Household Cleaning
    'omo': 'https://images.pexels.com/photos/545014/pexels-photo-545014.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'detergent': 'https://images.pexels.com/photos/545014/pexels-photo-545014.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'powder': 'https://images.pexels.com/photos/545014/pexels-photo-545014.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'household': 'https://images.pexels.com/photos/545014/pexels-photo-545014.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    
    // Bread & Bakery
    'bread': 'https://images.pexels.com/photos/1775043/pexels-photo-1775043.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'bakery': 'https://images.pexels.com/photos/1775043/pexels-photo-1775043.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    
    // Eggs
    'eggs': 'https://images.pexels.com/photos/162712/egg-white-food-protein-162712.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    
    // Generic fallbacks
    'grocery': 'https://images.pexels.com/photos/3962286/pexels-photo-3962286.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    'pantry': 'https://images.pexels.com/photos/3962286/pexels-photo-3962286.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
  };

  const promotionsWithImages = promotions.map((promotion: any, index: number) => {
    const title: string = promotion.title?.toLowerCase() || '';
    const dataAiHint: string = promotion.dataAiHint?.toLowerCase() || '';
    const category: string = promotion.category?.toLowerCase() || '';
    
    console.log(`🖼️ Finding image for: "${promotion.title}"`);
    
    // Split title into words for exact matching
    const titleWords = title.split(/\s+/).filter(word => word.length > 3);
    const searchWords = [...titleWords, dataAiHint, category];
    
    let imageUrl: string | null = null;
    
    // Priority 1: Exact multi-word matches (most specific)
    const multiWordMatches = Object.entries(imageMap)
      .filter(([key]) => key.includes(' ') && title.includes(key))
      .sort(([a], [b]) => b[0].length - a[0].length);
    
    if (multiWordMatches.length > 0) {
      imageUrl = multiWordMatches[0][1];
      console.log(`✅ Multi-word match: "${multiWordMatches[0][0]}"`);
    }
    
    // Priority 2: Exact brand/product name matches
    if (!imageUrl) {
      const exactMatches = Object.entries(imageMap)
        .filter(([key]) => !key.includes(' ') && searchWords.some(word => word === key))
        .sort(([a], [b]) => b[0].length - a[0].length);
      
      if (exactMatches.length > 0) {
        imageUrl = exactMatches[0][1];
        console.log(`✅ Exact word match: "${exactMatches[0][0]}"`);
      }
    }
    
    // Priority 3: DataAiHint exact matches
    if (!imageUrl && dataAiHint) {
      const hintMatches = Object.entries(imageMap)
        .filter(([key]) => dataAiHint === key)
        .sort(([a], [b]) => b[0].length - a[0].length);
      
      if (hintMatches.length > 0) {
        imageUrl = hintMatches[0][1];
        console.log(`✅ DataAiHint exact match: "${hintMatches[0][0]}"`);
      }
    }
    
    // Priority 4: Category exact matches (avoid generic matches)
    if (!imageUrl && category) {
      const categoryMatches = Object.entries(imageMap)
        .filter(([key]) => category === key)
        .sort(([a], [b]) => b[0].length - a[0].length);
      
      if (categoryMatches.length > 0) {
        imageUrl = categoryMatches[0][1];
        console.log(`✅ Category exact match: "${categoryMatches[0][0]}"`);
      }
    }
    
    // Priority 5: Fallback to word contains (but only for specific cases)
    if (!imageUrl) {
      const containsMatches = Object.entries(imageMap)
        .filter(([key]) => {
          // Only use contains for very specific cases, not generic words
          const specificKeywords = ['chicken', 'milk', 'yogurt', 'butter', 'coffee', 'juice', 'cereal', 'rice', 'detergent', 'bread'];
          if (specificKeywords.includes(key)) {
            return title.includes(key);
          }
          return false;
        })
        .sort(([a], [b]) => b[0].length - a[0].length);
      
      if (containsMatches.length > 0) {
        imageUrl = containsMatches[0][1];
        console.log(`✅ Contains fallback: "${containsMatches[0][0]}"`);
      }
    }
    
    // Ultimate fallback
    if (!imageUrl) {
      imageUrl = 'https://images.pexels.com/photos/3962286/pexels-photo-3962286.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop';
      console.log(`❌ No good match found, using grocery fallback`);
    }
    
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

  console.log('✅ Images processed for all promotions');
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