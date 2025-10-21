import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FreeAIService } from '@/lib/free-ai-service';

const SuggestItemCompletionsInputSchema = z.object({
  query: z.string().describe('The beginning of a shopping list item name'),
});

const SuggestItemCompletionsOutputSchema = z.object({
  suggestions: z
    .array(z.string())
    .describe('A list of 8 suggestions for completing the shopping list item.'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = SuggestItemCompletionsInputSchema.parse(body);

    if (!input.query || input.query.trim().length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const result = await suggestItemCompletionsFlow(input);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in suggest item completions:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.issues },
        { status: 400 }
      );
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: `Failed to get item suggestions: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// In suggest-item-completions/route.ts - clean version
async function suggestItemCompletionsFlow(
  input: z.infer<typeof SuggestItemCompletionsInputSchema>
): Promise<z.infer<typeof SuggestItemCompletionsOutputSchema>> {
  const prompt = createPrompt(input.query);
  const systemPrompt = `You are an autocomplete agent for a shopping list app in South Africa. Return ONLY valid JSON.`;
  
  const response = await FreeAIService.generateText(prompt, systemPrompt);
  const parsedResult = parseAIResponse(response);
  return validateAndProcessSuggestions(parsedResult);
}


  function createPrompt(query: string): string {
    return `You are a South African grocery shopping assistant. Your goal is to provide specific product suggestions as a user types.

  Based on the user's input "${query}", return exactly 8 realistic and specific product suggestions that include:
  - Brand names (e.g., "Albany", "Sasko", "Clover", "Koo", "All Gold", "Lancewood", "Nestle", "Coca-Cola")
  - Relevant sizes or weights (e.g., 700g, 1L, 6-pack, 2kg, 500ml)
  - Specific product types and variants

  CRITICAL: Return ONLY valid JSON in this exact format, no other text:
  {
    "suggestions": ["Brand Product Name Size", "Brand Product Name Size", ...]
  }

  RULES:
  - Return exactly 8 suggestions
  - Include specific brand names and sizes
  - Do NOT include store names (Spar, Checkers, Pick n Pay, Shoprite, Woolworths)
  - Avoid store-exclusive brands (No Woolworths brand, No Checkers Sixty60, etc.)
  - Only products commonly available across multiple retailers
  - No generic/placeholder items - be specific
  - All items must be relevant to "${query}" and commonly found in SA grocery stores
  - Capitalize brand names properly

  Examples for "mil":
  - "Clover Full Cream Milk 2L"
  - "Lactose-free Milk 1L" 
  - "Nestle Nesquik Milkshake Mix 400g"
  - "Milo Chocolate Malt Drink 500g"
  - "Alpro Almond Milk 1L"
  - "First Choice Milk Powder 500g"
  - "Danone Yogurt Drink 125ml"
  - "Milk Tart 450g"

  Examples for "bre":
  - "Albany Superior Sliced Brown Bread 700g"
  - "Sasko White Bread 600g"
  - "Blue Ribbon Bread Rolls 6-pack"
  - "Sunbake Low GI Bread 700g"
  - "Bokomo Weet-Bix 750g"
  - "ProNutro Chocolate 400g"
  - "All Gold Tomato Sauce 500g"
  - "Lancewood Cheese Slices 12-pack"

  Now generate 8 specific branded products for "${query}":`;
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
    return { suggestions: [] };
  }
}

function validateAndProcessSuggestions(result: any): z.infer<typeof SuggestItemCompletionsOutputSchema> {
  if (!result.suggestions || !Array.isArray(result.suggestions)) {
    return { suggestions: [] };
  }

  const suggestions = result.suggestions
    .filter((suggestion: any) => typeof suggestion === 'string' && suggestion.trim().length > 0)
    .map((suggestion: string) => {
      // Capitalize first letter of each suggestion
      return suggestion.trim().charAt(0).toUpperCase() + suggestion.trim().slice(1);
    })
    .filter((suggestion: string, index: number, array: string[]) => 
      array.indexOf(suggestion) === index // Remove duplicates
    )
    .slice(0, 8);

  return { suggestions };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json(
      { error: 'Query parameter "q" is required' },
      { status: 400 }
    );
  }

  try {
    const input = SuggestItemCompletionsInputSchema.parse({ query });
    const result = await suggestItemCompletionsFlow(input);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in GET suggest item completions:', error);
    return NextResponse.json(
      { error: 'Failed to get item suggestions' },
      { status: 500 }
    );
  }
}