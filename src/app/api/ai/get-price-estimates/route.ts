import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FreeAIService } from '@/lib/free-ai-service';
import { jsonWithCors, corsHeaders } from '@/lib/cors';

// Reuse your existing schemas
const PriceBreakdownSchema = z.object({
  item: z.string().describe('The name of the shopping list item.'),
  price: z.number().describe('The estimated price of the item at this store in ZAR.'),
});

const StoreSchema = z.object({
  name: z.string().describe('The name of the store.'),
  distance: z.string().describe('The estimated distance to the nearest store from the user, if location is provided.'),
  totalPrice: z.number().describe('The total estimated price of all available items in the shopping list at this store.'),
  priceBreakdown: z.array(PriceBreakdownSchema).describe('An array of the prices for each item in the shopping list at this store.'),
  isCheapest: z.boolean().describe('Whether this store has the lowest total price.'),
});

const GetPriceEstimatesInputSchema = z.object({
  shoppingList: z.array(z.string()).describe("The user's shopping list."),
  latitude: z.number().optional().describe("The user's latitude."),
  longitude: z.number().optional().describe("The user's longitude."),
});

const GetPriceEstimatesOutputSchema = z.object({
  stores: z.array(StoreSchema).describe('A list of stores with price estimates.'),
});

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = GetPriceEstimatesInputSchema.parse(body);

    const result = await getPriceEstimatesFlow(input);
    return jsonWithCors(result);
  } catch (error) {
    console.error('Error in price estimates:', error);
    
    if (error instanceof z.ZodError) {
      return jsonWithCors(
        { error: 'Invalid input data', details: error.issues },
        { status: 400 }
      );
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return jsonWithCors(
      { error: `Failed to get price estimates: ${errorMessage}` },
      { status: 500 }
    );
  }
}

async function getPriceEstimatesFlow(
  input: z.infer<typeof GetPriceEstimatesInputSchema>
): Promise<z.infer<typeof GetPriceEstimatesOutputSchema>> {
  if (input.shoppingList.length === 0) {
    return { stores: [] };
  }

  const prompt = createPrompt(input.shoppingList);
  const systemPrompt = `You are a Price Estimator Agent for a South African shopping app. Return ONLY valid JSON.`;
  
  const response = await FreeAIService.generateText(prompt, systemPrompt);
  const parsedResult = parseAIResponse(response);
  
  return processStoresResult(parsedResult);
}

function createPrompt(shoppingList: string[]): string {
  return `You are a Price Estimator Agent for a South African shopping app.
Your task is to provide realistic price estimates for a given shopping list at major South African retailers.

SHOPPING LIST:
${shoppingList.map(item => `- ${item}`).join('\n')}

RETAILER PRICING PROFILES (based on typical South African market prices):

1. CHECKERS:
   - Generally competitive prices, good for bulk items
   - Strong house brands: Checkers Housebrand, Freshmark
   - Known for: Meat, dairy, pantry staples
   - Price positioning: Low to medium

2. SHOPRITE:
   - Often the cheapest for basic groceries
   - Strong house brands: Ritebrand, House of Coffees
   - Known for: Budget-friendly options, weekly specials
   - Price positioning: Low

3. SPAR:
   - Slightly higher than discount stores, convenient locations
   - Strong house brands: Spar Brand, Spar Let's Cook
   - Known for: Fresh produce, bakery, convenience
   - Price positioning: Medium

4. PICK N PAY:
   - Mid-range pricing, good quality
   - Strong house brands: PnP No Name, PnP Green
   - Known for: Balanced quality and price, good fresh sections
   - Price positioning: Medium

5. WOOLWORTHS:
   - Premium pricing, higher quality
   - Strong house brands: Woolworths Brand
   - Known for: Organic, free-range, premium products
   - Price positioning: High

PRICING GUIDELINES:
- Woolworths: 5-15% higher than average
- Pick n Pay: Average market prices  
- Spar: Slightly above average (+2-8%)
- Shoprite: 5-10% below average
- Checkers: Competitive, often matches Shoprite

ITEM-SPECIFIC PRICING (typical ZAR ranges):
- Milk (2L): R25-R35 (Shoprite/Checkers R25-R28, Woolworths R32-R38)
- Bread (700g): R18-R25 (Shoprite R18-R20, Woolworths R22-R28)
- Eggs (12 large): R40-R55 (Shoprite R40-R45, Woolworths R50-R65)
- Chicken breast (1kg): R85-R120 (Shoprite R85-R95, Woolworths R110-R140)
- Rice (2kg): R35-R50 (Shoprite R35-R40, Woolworths R45-R55)
- Pasta (500g): R15-R25 (Shoprite R15-R18, Woolworths R20-R28)

CRITICAL: Return ONLY valid JSON in this exact format:
{
  "stores": [
    {
      "name": "Store Name",
      "distance": "1.2 km",
      "totalPrice": 123.45,
      "priceBreakdown": [
        {"item": "Item Name", "price": 12.34}
      ],
      "isCheapest": true
    }
  ]
}

RULES:
- Include ALL 5 major retailers: Checkers, Shoprite, Spar, Woolworths, Pick n Pay
- Calculate realistic total prices based on item breakdown
- Set "isCheapest": true for the store with lowest totalPrice
- Generate plausible distances (0.5km - 8km range)
- All prices in ZAR, use realistic decimal values (e.g., R24.99, R15.50)
- If an item might not be available at a store, exclude it from that store's breakdown
- Ensure price breakdown sums correctly to totalPrice

Calculate estimates for: ${shoppingList.join(', ')}`;
}

function parseAIResponse(text: string): any {
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
    console.error('Error parsing AI response:', error);
    console.log('Raw AI response:', text);
    throw new Error('Invalid response format from AI');
  }
}

function processStoresResult(result: any): z.infer<typeof GetPriceEstimatesOutputSchema> {
  if (!result.stores || !Array.isArray(result.stores)) {
    return { stores: [] };
  }

  const stores = result.stores.map((store: any) => {
    const priceBreakdown = store.priceBreakdown || [];
    const totalPrice = priceBreakdown.reduce((acc: number, item: any) => acc + (item.price || 0), 0);
    
    return {
      name: store.name || 'Unknown Store',
      distance: store.distance || 'Unknown distance',
      totalPrice,
      priceBreakdown,
      isCheapest: store.isCheapest || false
    };
  });

  // Recalculate cheapest store to ensure accuracy
  if (stores.length > 0) {
    let minPrice = Infinity;
    let cheapestStoreIndex = -1;

    stores.forEach((store: any, index: number) => {
      if (store.totalPrice < minPrice) {
        minPrice = store.totalPrice;
        cheapestStoreIndex = index;
      }
    });

    // Reset all cheapest flags
    stores.forEach((store: any) => {
      store.isCheapest = false;
    });
    
    // Set the cheapest store
    if (cheapestStoreIndex !== -1) {
      stores[cheapestStoreIndex].isCheapest = true;
    }
    
    // Sort by price (cheapest first)
    stores.sort((a: any, b: any) => a.totalPrice - b.totalPrice);
  }

  return { stores };
}