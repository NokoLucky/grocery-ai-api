import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FreeAIService } from '@/lib/free-ai-service';

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = GetStoreProductsInputSchema.parse(body);

    console.log(`➡️ Starting product generation for store: "${input.storeName}"`);
    
    const result = await getStoreProductsFlow(input);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in get store products:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.issues },
        { status: 400 }
      );
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
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
    ? existingProducts.map(product => `- ${product}`).join('\n')
    : 'None';

  return `You are a product database generator for a South African grocery store app.
Generate a list of 10 plausible, common grocery products sold at a store called ${storeName}.

Make about 20% of the items "onSpecial". If an item is on special, provide a realistic originalPrice.
For each product, provide a simple dataAiHint (1-2 words) for image generation.
Ensure the generated products are different from the provided list of existing products.

Store: ${storeName}
Existing Products to avoid:
${existingProductsText}

IMPORTANT: Return ONLY valid JSON in this exact format:
{
  "products": [
    {
      "id": 1,
      "name": "Product Name",
      "price": "R 45.99",
      "onSpecial": true,
      "originalPrice": "R 55.99",
      "image": "placeholder",
      "dataAiHint": "product hint"
    }
  ]
}

Guidelines:
- Use realistic South African prices in ZAR
- Include common grocery categories: dairy, meat, produce, bakery, beverages, household items
- Make dataAiHint specific and descriptive (e.g., "fresh milk", "whole chicken", "loaf of bread")
- Ensure IDs are unique numbers from 1 to 10
- Products should be appropriate for the store type (e.g., Woolworths = premium, Shoprite = value)`;
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
      const imageResponse = await fetch(`${getBaseUrl()}/api/ai/generate-product-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataAiHint: product.dataAiHint,
          width: 200,
          height: 200,
        }),
      });

      if (imageResponse.ok) {
        const imageData = await imageResponse.json();
        return {
          ...product,
          image: imageData.imageUrl,
        };
      } else {
        console.warn(`Failed to generate image for ${product.name}, using fallback`);
        return {
          ...product,
          image: getFallbackProductImage(product.dataAiHint),
        };
      }
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
    'milk': 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=200&h=200&fit=crop',
    'cheese': 'https://images.unsplash.com/photo-1552767059-ce182ead6c1b?w=200&h=200&fit=crop',
    'yogurt': 'https://images.unsplash.com/photo-1567336273898-ebbe52c60a84?w=200&h=200&fit=crop',
    'chicken': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200&h=200&fit=crop',
    'beef': 'https://images.unsplash.com/photo-1558036117-15e82a2c9a9a?w=200&h=200&fit=crop',
    'apple': 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=200&h=200&fit=crop',
    'bread': 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=200&h=200&fit=crop',
    'coffee': 'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=200&h=200&fit=crop',
  };

  const normalizedHint = hint.toLowerCase();
  
  for (const [key, imageUrl] of Object.entries(productImageMap)) {
    if (normalizedHint.includes(key)) {
      return imageUrl;
    }
  }

  return 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200&h=200&fit=crop';
}

function getBaseUrl(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  return 'http://localhost:3000';
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const storeName = searchParams.get('store');
  const existingProductsParam = searchParams.get('existingProducts');

  if (!storeName) {
    return NextResponse.json(
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
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in GET store products:', error);
    return NextResponse.json(
      { error: 'Failed to get store products' },
      { status: 500 }
    );
  }
}