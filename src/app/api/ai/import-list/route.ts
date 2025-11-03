import { NextRequest, NextResponse } from 'next/server';
import { FreeAIService } from '../../../../lib/free-ai-service';
import { jsonWithCors, corsHeaders } from '@/lib/cors';

// Input validation schema
const ImportListInputSchema = {
  text: {
    min: 1,
    max: 10000
  }
};

export async function POST(request: NextRequest) {
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { text } = body;

    // Basic validation
    if (!text || text.length < ImportListInputSchema.text.min) {
      return jsonWithCors(
        { 
          error: 'Invalid input', 
          details: 'Text cannot be empty' 
        },
        { status: 400 }
      );
    }

    if (text.length > ImportListInputSchema.text.max) {
      return jsonWithCors(
        { 
          error: 'Invalid input', 
          details: 'Text too long' 
        },
        { status: 400 }
      );
    }

    // Parse groceries using your existing FreeAIService
    const result = await parseGroceriesWithAI(text);
    
    return jsonWithCors(result);

  } catch (error) {
    console.error('Error parsing grocery list:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return jsonWithCors(
      { 
        error: 'Failed to parse grocery list',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

// Grocery parsing function using your FreeAIService
async function parseGroceriesWithAI(text: string) {
  const systemPrompt = `You are a grocery list parsing assistant. Extract grocery items from text and return ONLY valid JSON array.
  
Return format: [{"name": "Item Name", "quantity": "optional quantity", "category": "category"}]

Rules:
- Normalize names (e.g., "coke" → "Coca-Cola", "brown bread" → "Brown Bread")
- Extract quantities like "2 liters", "500g", "6 pack"
- Categorize: produce, dairy, meat, beverages, pantry, frozen, household, bakery, other
- Return only the JSON array, no other text`;

  const userPrompt = `Parse these grocery items: "${text}"`;

  try {
    const aiResponse = await FreeAIService.generateText(userPrompt, systemPrompt);
    
    // Parse the AI response
    let items;
    try {
      items = JSON.parse(aiResponse);
    } catch (parseError) {
      // If JSON parsing fails, try to extract JSON from the response
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        items = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback to simple parsing
        items = fallbackParse(text);
      }
    }

    // Validate and clean the items
    const validItems = Array.isArray(items) ? items.map(cleanItem).filter(item => item.name) : fallbackParse(text);

    return {
      items: validItems,
      confidence: calculateConfidence(validItems, text),
      originalText: text,
      parsedCount: validItems.length,
      suggestions: generateSuggestions(validItems),
    };

  } catch (error) {
    console.error('AI parsing failed, using fallback:', error);
    // Fallback to simple parsing
    const fallbackItems = fallbackParse(text);
    return {
      items: fallbackItems,
      confidence: 0.3,
      originalText: text,
      parsedCount: fallbackItems.length,
      suggestions: ['Used basic parsing - review items carefully'],
    };
  }
}

function cleanItem(item: any) {
  if (typeof item === 'string') {
    return {
      name: item.charAt(0).toUpperCase() + item.slice(1).trim(),
      quantity: '',
      category: categorizeItem(item)
    };
  }

  return {
    name: (item.name || '').toString().charAt(0).toUpperCase() + (item.name || '').toString().slice(1).trim(),
    quantity: (item.quantity || '').toString().trim(),
    category: (item.category || categorizeItem(item.name || '')).toLowerCase()
  };
}

function fallbackParse(text: string) {
  const lines = text.split(/[\n,;]+/).filter(line => line.trim().length > 0);
  
  return lines.map(line => {
    const cleanLine = line.trim().replace(/^[-•*\d\.\s]+/, '');
    return {
      name: cleanLine.charAt(0).toUpperCase() + cleanLine.slice(1),
      quantity: extractQuantity(cleanLine),
      category: categorizeItem(cleanLine),
    };
  }).filter(item => item.name.length > 1);
}

function extractQuantity(text: string): string {
  const quantityRegex = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l|pack|pcs?|liters?|ounces?|lbs?)\b/i;
  const match = text.match(quantityRegex);
  return match ? match[0] : '';
}

function categorizeItem(item: string): string {
  const lowerItem = item.toLowerCase();
  
  if (/(apple|banana|orange|vegetable|fruit|lettuce|tomato|avocado|berry)/i.test(lowerItem)) return 'produce';
  if (/(milk|cheese|yogurt|butter|cream|egg)/i.test(lowerItem)) return 'dairy';
  if (/(bread|pasta|rice|cereal|flour|mealie|meal)/i.test(lowerItem)) return 'pantry';
  if (/(coke|pepsi|juice|water|soda|beer|wine|coffee|tea)/i.test(lowerItem)) return 'beverages';
  if (/(chicken|beef|pork|fish|meat|steak|wors|boerewors)/i.test(lowerItem)) return 'meat';
  if (/(frozen|ice cream)/i.test(lowerItem)) return 'frozen';
  if (/(soap|detergent|cleaner|tissue|toilet paper)/i.test(lowerItem)) return 'household';
  
  return 'other';
}

function calculateConfidence(items: any[], originalText: string): number {
  if (items.length === 0) return 0;
  
  const wordCount = originalText.split(/\s+/).length;
  const itemCount = items.length;
  
  // Simple confidence based on parsing ratio
  if (itemCount >= wordCount * 0.7) return 0.9;
  if (itemCount >= wordCount * 0.4) return 0.7;
  if (itemCount >= wordCount * 0.2) return 0.5;
  return 0.3;
}

function generateSuggestions(items: any[]): string[] {
  const suggestions: string[] = [];
  
  if (items.length > 15) {
    suggestions.push('💡 Your list is quite long! Consider splitting into multiple shopping trips.');
  }
  
  const categories = new Set(items.map(item => item.category).filter(Boolean));
  if (categories.size > 5) {
    suggestions.push('🛒 You have items from multiple categories. Shop by store section to save time!');
  }

  const hasProduce = items.some(item => item.category === 'produce');
  const hasFrozen = items.some(item => item.category === 'frozen');
  
  if (hasProduce && hasFrozen) {
    suggestions.push('❄️ Remember to get frozen items last to keep them cold!');
  }
  
  return suggestions;
}