import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FreeAIService } from '@/lib/free-ai-service';
import { jsonWithCors, corsHeaders } from '@/lib/cors';

const GetStoreProductsInputSchema = z.object({
  storeName: z.string().describe('The name of the store.'),
  existingProducts: z
    .array(z.string())
    .optional()
    .describe('A list of product names already displayed to the user.'),
});

const ProductSchema = z.object({
  id: z.number().describe('A unique ID for the product.'),
  name: z.string().describe('The full name of the product.'),
  price: z.string().describe('The current price of the product.'),
  onSpecial: z.boolean().describe('Whether the product is currently on special.'),
  originalPrice: z
    .string()
    .optional()
    .describe('The original price if the product is on special.'),
  image: z.string().describe('A placeholder image URL for the product.'),
  dataAiHint: z
    .string()
    .describe('A 1-2 word hint for generating an image, e.g., "milk carton".'),
});

const GetStoreProductsOutputSchema = z.object({
  products: z
    .array(ProductSchema)
    .describe('A list of 10 products available at the store.'),
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
    const input = GetStoreProductsInputSchema.parse(body);

    console.log(`➡️ Starting product generation for store: "${input.storeName}"`);
    
    const result = await getStoreProductsFlow(input);
    
    return jsonWithCors(result);
  } catch (error) {
    console.error('Error in get store products:', error);
    
    if (error instanceof z.ZodError) {
      return jsonWithCors(
        { error: 'Invalid input data', details: error.issues },
        { status: 400 }
      );
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return jsonWithCors(
      { error: `Failed to get store products: ${errorMessage}` },
      { status: 500 }
    );
  }
}

async function getStoreProductsFlow(
  input: z.infer<typeof GetStoreProductsInputSchema>
): Promise<z.infer<typeof GetStoreProductsOutputSchema>> {
  const prompt = createPrompt(input.storeName, input.existingProducts || []);
  const systemPrompt = `You are a product database generator for a South African grocery store app. Return ONLY valid JSON.`;
  
  const response = await FreeAIService.generateText(prompt, systemPrompt);
  const parsedResult = parseAIResponse(response);
  const validatedProducts = validateProducts(parsedResult.products || []);
  
  console.log(`🤖 Generated ${validatedProducts.length} product suggestions. Now getting images...`);

  const productsWithImages = await generateProductImages(validatedProducts);
  
  console.log(`🖼️ Image generation complete for all products at "${input.storeName}".`);
  
  return { products: productsWithImages };
}

function createPrompt(storeName: string, existingProducts: string[]): string {
  const existingProductsText = existingProducts.length > 0 
    ? `\nEXISTING PRODUCTS TO AVOID REPEATING:\n${existingProducts.map(product => `- ${product}`).join('\n')}`
    : '';

  return `You are a product database generator for a South African grocery store app.
Generate a list of 10 realistic, branded grocery products available at ${storeName}.

STORE PROFILES:
- WOOLWORTHS: Premium quality, organic, free-range, higher prices. Brands: Woolworths, Nature's Choice
- CHECKERS: Good quality, competitive pricing, strong house brands. Brands: Checkers, Freshmark
- PICK N PAY: Balanced quality and price, good fresh sections. Brands: PnP, No Name
- SHOPRITE: Budget-friendly, value brands, weekly specials. Brands: Ritebrand, House of Coffees
- SPAR: Convenience focus, good fresh produce and bakery. Brands: Spar, Spar Let's Cook

REQUIREMENTS FOR ${storeName.toUpperCase()}:
- Include specific brand names and sizes (e.g., "Clover Full Cream Milk 2L", "Albany Superior Brown Bread 700g")
- Make 2-3 products "onSpecial" with realistic discount pricing
- Use accurate South African pricing in ZAR
- Include variety across categories: dairy, meat, produce, bakery, beverages, pantry, household
- Make dataAiHint specific and descriptive for image generation
- Ensure products are appropriate for ${storeName}'s typical inventory

PRICING GUIDELINES:
- Woolworths: 15-30% higher than average
- Pick n Pay: Average market prices
- Spar: Slightly above average (+5-15%)
- Shoprite: 5-20% below average
- Checkers: Competitive, often matches Shoprite

COMMON SOUTH AFRICAN BRANDS TO INCLUDE:
- Dairy: Clover, Parmalat, Lancewood, Danone, Woolworths
- Bread: Albany, Sasko, Blue Ribbon, Sunbake
- Meat: Rainbow, Eskort, Supreme, Farmer's Choice
- Pantry: Koo, All Gold, Tastic, Selati, Tiger Brands
- Beverages: Coca-Cola, Appletiser, Ceres, Liqui-Fruit${existingProductsText}

CRITICAL: Return ONLY valid JSON in this exact format:
{
  "products": [
    {
      "id": 1,
      "name": "Brand Product Name Size",
      "price": "R 45.99",
      "onSpecial": true,
      "originalPrice": "R 55.99",
      "image": "placeholder",
      "dataAiHint": "specific product type"
    }
  ]
}

EXAMPLES FOR WOOLWORTHS:
- "Woolworths Free Range Chicken Breast 1kg", price: "R 119.99", dataAiHint: "chicken breast"
- "Woolworths Organic Full Cream Milk 2L", price: "R 34.99", dataAiHint: "milk carton"
- "Woolworths Sourdough Bread 700g", price: "R 28.50", dataAiHint: "sourdough bread"

EXAMPLES FOR SHOPRITE:
- "Ritebrand Long Grain Rice 2kg", price: "R 39.99", dataAiHint: "rice bag"
- "Clover Mellow Cream Cheese 250g", price: "R 32.50", dataAiHint: "cream cheese"
- "Koo Baked Beans in Tomato Sauce 410g", price: "R 16.99", dataAiHint: "canned beans"

Now generate 10 products for ${storeName}:`;
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

function validateProducts(products: any[]): any[] {
  if (!Array.isArray(products)) {
    return [];
  }

  return products
    .filter((product: any) => {
      return product && 
             typeof product.name === 'string' &&
             typeof product.price === 'string' &&
             typeof product.dataAiHint === 'string';
    })
    .map((product: any, index: number) => ({
      id: typeof product.id === 'number' ? product.id : index + 1,
      name: product.name || `Product ${index + 1}`,
      price: product.price || 'R 0.00',
      onSpecial: Boolean(product.onSpecial),
      originalPrice: product.originalPrice || undefined,
      image: 'placeholder',
      dataAiHint: product.dataAiHint || 'grocery item',
    }))
    .slice(0, 10);
}

async function generateProductImages(products: any[]): Promise<any[]> {
  const imagePromises = products.map(async (product) => {
    try {
      // Use the FreeAIService directly for image generation
      const imageUrl = await FreeAIService.generateProductImage(product.dataAiHint);
      
      return {
        ...product,
        image: imageUrl,
      };
    } catch (error) {
      console.error(`Error generating image for ${product.name}:`, error);
      return {
        ...product,
        image: getFallbackProductImage(product.dataAiHint),
      };
    }
  });

  return await Promise.all(imagePromises);
}

function getFallbackProductImage(hint: string): string {
  const productImageMap: { [key: string]: string } = {
    // Dairy
    'milk': 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=200&h=200&fit=crop',
    'cheese': 'https://images.unsplash.com/photo-1552767059-ce182ead6c1b?w=200&h=200&fit=crop',
    'yogurt': 'https://images.unsplash.com/photo-1567336273898-ebbe52c60a84?w=200&h=200&fit=crop',
    'butter': 'https://images.unsplash.com/photo-1589985270824-415c14400784?w=200&h=200&fit=crop',
    
    // Meat
    'chicken': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200&h=200&fit=crop',
    'beef': 'https://images.unsplash.com/photo-1558036117-15e82a2c9a9a?w=200&h=200&fit=crop',
    'pork': 'https://images.unsplash.com/photo-1558036117-15e82a2c9a9a?w=200&h=200&fit=crop',
    'sausage': 'https://images.unsplash.com/photo-1558036117-15e82a2c9a9a?w=200&h=200&fit=crop',
    
    // Produce
    'apple': 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=200&h=200&fit=crop',
    'banana': 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=200&h=200&fit=crop',
    'tomato': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200&h=200&fit=crop',
    'potato': 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=200&h=200&fit=crop',
    
    // Bakery
    'bread': 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=200&h=200&fit=crop',
    'rolls': 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&h=200&fit=crop',
    'pastries': 'https://images.unsplash.com/photo-1555507038-44cf59c3d0ac?w=200&h=200&fit=crop',
    
    // Beverages
    'coffee': 'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=200&h=200&fit=crop',
    'juice': 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=200&h=200&fit=crop',
    'soda': 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200&h=200&fit=crop',
    
    // Pantry
    'rice': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=200&h=200&fit=crop',
    'pasta': 'https://images.unsplash.com/photo-1551462147-37885d31561a?w=200&h=200&fit=crop',
    'cereal': 'https://images.unsplash.com/photo-1627483262769-04d0a1401487?w=200&h=200&fit=crop',
  };

  const normalizedHint = hint.toLowerCase();
  
  for (const [key, imageUrl] of Object.entries(productImageMap)) {
    if (normalizedHint.includes(key)) {
      return imageUrl;
    }
  }

  return 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200&h=200&fit=crop';
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const storeName = searchParams.get('store');
  const existingProductsParam = searchParams.get('existingProducts');

  if (!storeName) {
    return jsonWithCors(
      { error: 'Query parameter "store" is required' },
      { status: 400 }
    );
  }

  try {
    const existingProducts = existingProductsParam 
      ? JSON.parse(existingProductsParam)
      : [];

    const input = GetStoreProductsInputSchema.parse({
      storeName,
      existingProducts,
    });

    const result = await getStoreProductsFlow(input);
    return jsonWithCors(result);
  } catch (error) {
    console.error('Error in GET store products:', error);
    return jsonWithCors(
      { error: 'Failed to get store products' },
      { status: 500 }
    );
  }
}