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

// In suggest-item-completions/route.ts - add debugging
async function suggestItemCompletionsFlow(
  input: z.infer<typeof SuggestItemCompletionsInputSchema>
): Promise<z.infer<typeof SuggestItemCompletionsOutputSchema>> {
  console.log('🔍 Starting suggestItemCompletionsFlow with query:', input.query);
  
  const prompt = createPrompt(input.query);
  const systemPrompt = `You are an autocomplete agent for a shopping list app in South Africa. Return ONLY valid JSON.`;
  
  console.log('📝 Prompt:', prompt);
  
  const response = await FreeAIService.generateText(prompt, systemPrompt);
  console.log('🤖 Raw AI Response:', response);
  
  const parsedResult = parseAIResponse(response);
  console.log('📊 Parsed Result:', parsedResult);
  
  const finalResult = validateAndProcessSuggestions(parsedResult);
  console.log('✅ Final Result:', finalResult);
  
  return finalResult;
}

function createPrompt(query: string): string {
  return `Suggest 8 grocery item completions for "${query}" in South African stores.

Return ONLY this JSON format, nothing else:
{
  "suggestions": ["item1", "item2", "item3", "item4", "item5", "item6", "item7", "item8"]
}

Examples:
- For "mil": ["Milk", "Milk Powder", "Milkshake", "Millet", "Mild Cheese", "Milk Tart", "Milk Bread", "Milk Chocolate"]
- For "bre": ["Bread", "Bread Rolls", "Brown Bread", "White Bread", "Bread Flour", "Bread Crumbs", "Bread Machine", "Bread Knife"]

Now suggest for "${query}":`;
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