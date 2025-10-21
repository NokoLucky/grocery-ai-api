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
  return `You are an autocomplete agent for a shopping list app in South Africa. Given the user's input, suggest 8 likely completions for the item they are typing.

Only return likely product names that are commonly found in South African grocery stores.

User Input: "${query}"

IMPORTANT: Return ONLY valid JSON in this exact format:
{
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3", ...]
}

Rules:
- Return exactly 8 suggestions
- Suggestions should be common grocery items in South Africa
- Keep suggestions relevant to the user's input
- Return empty array if input doesn't make sense for grocery items
- Suggestions should be complete product names, not just word completions
- Include variety (different brands, types, etc.)
- Examples for "mil": ["milk", "milk powder", "milkshake", "millet", "mild cheese", "milk tart", "milk bread", "milk chocolate"]
- Examples for "bre": ["bread", "bread rolls", "brown bread", "white bread", "bread flour", "bread crumbs", "bread machine", "bread knife"]`;
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