import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FreeAIService } from '@/lib/free-ai-service';

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = GetPriceEstimatesInputSchema.parse(body);

    const result = await getPriceEstimatesFlow(input);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in price estimates:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.issues },
        { status: 400 }
      );
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
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

Retailers to consider:
- Checkers
- Shoprite
- Spar
- Woolworths
- Pick n Pay

For each item in the shopping list, provide a plausible price at each retailer. Sum these prices to get a total for each store.
Base your estimates on typical South African market prices. Woolworths is generally the most expensive, while Shoprite and Checkers are often cheaper.

Shopping List:
${shoppingList.map(item => `- ${item}`).join('\n')}

IMPORTANT: Return ONLY valid JSON in this exact format:
{
  "stores": [
    {
      "name": "Store Name",
      "distance": "1.2 km",
      "totalPrice": 123.45,
      "priceBreakdown": [
        {"item": "Item Name", "price": 12.34}
      ],
      "isCheapest": true/false
    }
  ]
}

Identify the store with the lowest total price and set its 'isCheapest' flag to true.
Generate a plausible 'distance' for each store (e.g., "1.2 km", "5.8 km").
If an item is unlikely to be found at a store, you can omit it from that store's priceBreakdown.
Return an empty array for stores where no items from the list are typically sold.`;
}

function parseAIResponse(text: string): any {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No JSON found in response');
  } catch (error) {
    console.error('Error parsing AI response:', error);
    throw new Error('Invalid response format from AI');
  }
}

function processStoresResult(result: any): z.infer<typeof GetPriceEstimatesOutputSchema> {
  if (!result.stores || !Array.isArray(result.stores)) {
    return { stores: [] };
  }

  const stores = result.stores.map((store: any) => {
    const totalPrice = store.priceBreakdown?.reduce((acc: number, item: any) => acc + (item.price || 0), 0) || 0;
    
    return {
      name: store.name || 'Unknown Store',
      distance: store.distance || 'Unknown distance',
      totalPrice,
      priceBreakdown: store.priceBreakdown || [],
      isCheapest: store.isCheapest || false
    };
  });

  if (stores.length > 0) {
    let minPrice = Infinity;
    let cheapestStoreIndex = -1;

    stores.forEach((store: any, index: number) => {
      if (store.totalPrice < minPrice) {
        minPrice = store.totalPrice;
        cheapestStoreIndex = index;
      }
    });

    stores.forEach((store: any) => {
      store.isCheapest = false;
    });
    
    if (cheapestStoreIndex !== -1) {
      stores[cheapestStoreIndex].isCheapest = true;
    }
    
    stores.sort((a: any, b: any) => a.totalPrice - b.totalPrice);
  }

  return { stores };
}