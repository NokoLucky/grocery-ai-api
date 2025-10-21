import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Reuse your existing schemas
const GenerateProductImageInputSchema = z.object({
  dataAiHint: z.string().describe('A 1-2 word hint for the image content.'),
  width: z.number().optional().describe('The width of the image.'),
  height: z.number().optional().describe('The height of the image.'),
});

const GenerateProductImageOutputSchema = z.object({
  imageUrl: z.string().url().describe('The URL of the generated image.'),
});

// Simple in-memory cache
let imageCache: { [key: string]: string } = {};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = GenerateProductImageInputSchema.parse(body);

    // Validate input
    if (!input.dataAiHint || input.dataAiHint.trim().length === 0) {
      return NextResponse.json(
        { error: 'dataAiHint is required' },
        { status: 400 }
      );
    }

    const result = await generateProductImageFlow(input);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in generate product image:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.issues },
        { status: 400 }
      );
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: `Failed to generate product image: ${errorMessage}` },
      { status: 500 }
    );
  }
}

async function generateProductImageFlow(
  input: z.infer<typeof GenerateProductImageInputSchema>
): Promise<z.infer<typeof GenerateProductImageOutputSchema>> {
  const normalizedHint = input.dataAiHint.toLowerCase().replace(/\s+/g, '-');
  
  // Check cache first
  if (imageCache[normalizedHint]) {
    console.log(`✅ CACHE HIT: Returning cached image for hint: "${input.dataAiHint}"`);
    return { imageUrl: imageCache[normalizedHint] };
  }

  console.log(`⏳ CACHE MISS: Getting image for hint: "${input.dataAiHint}"`);

  try {
    // Try Unsplash API first
    const imageUrl = await generateImageWithUnsplash(input.dataAiHint);
    
    // Cache the result
    imageCache[normalizedHint] = imageUrl;
    
    return { imageUrl };
  } catch (error) {
    console.error('Image API failed, using fallback:', error);
    
    // Fallback to our reliable image map
    const fallbackImage = getFallbackImage(input.dataAiHint);
    imageCache[normalizedHint] = fallbackImage;
    
    return { imageUrl: fallbackImage };
  }
}

async function generateImageWithUnsplash(hint: string): Promise<string> {
  const unsplashAccessKey = process.env.UNSPLASH_ACCESS_KEY;
  
  if (!unsplashAccessKey) {
    console.log('🔑 No Unsplash access key, using fallback images');
    return getFallbackImage(hint);
  }

  try {
    const response = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(hint + ' product grocery')}&orientation=squarish&client_id=${unsplashAccessKey}`
    );
    
    console.log(`📊 Unsplash API response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Unsplash API success');
      return data.urls.regular;
    } else {
      throw new Error(`Unsplash API error: ${response.status}`);
    }
  } catch (error) {
    console.error('Unsplash API failed:', error);
    throw error;
  }
}

function getFallbackImage(hint: string): string {
  console.log(`🎭 Using fallback image for: ${hint}`);
  
  // Direct mapping to reliable Unsplash images
  const productImageMap: { [key: string]: string } = {
    // Dairy
    'milk': 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&h=400&fit=crop',
    'cheese': 'https://images.unsplash.com/photo-1552767059-ce182ead6c1b?w=400&h=400&fit=crop',
    'yogurt': 'https://images.unsplash.com/photo-1567336273898-ebbe52c60a84?w=400&h=400&fit=crop',
    'butter': 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400&h=400&fit=crop',
    
    // Meat
    'chicken': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&h=400&fit=crop',
    'beef': 'https://images.unsplash.com/photo-1558036117-15e82a2c9a9a?w=400&h=400&fit=crop',
    'fish': 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&h=400&fit=crop',
    'pork': 'https://images.unsplash.com/photo-1558036117-15e82a2c9a9a?w=400&h=400&fit=crop',
    
    // Produce
    'apple': 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=400&h=400&fit=crop',
    'banana': 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&h=400&fit=crop',
    'tomato': 'https://images.unsplash.com/photo-1546470427-e212b7d3107a?w=400&h=400&fit=crop',
    'potato': 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&h=400&fit=crop',
    'onion': 'https://images.unsplash.com/photo-1580201092677-5bdc9f1c1301?w=400&h=400&fit=crop',
    'carrot': 'https://images.unsplash.com/photo-1445282768818-728615cc910a?w=400&h=400&fit=crop',
    'lettuce': 'https://images.unsplash.com/photo-1622206151226-a67ef613b5f3?w=400&h=400&fit=crop',
    
    // Bakery
    'bread': 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=400&h=400&fit=crop',
    'croissant': 'https://images.unsplash.com/photo-1555507038-44d78bf15d6b?w=400&h=400&fit=crop',
    'cake': 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&h=400&fit=crop',
    
    // Beverages
    'coffee': 'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=400&h=400&fit=crop',
    'juice': 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400&h=400&fit=crop',
    'soda': 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&h=400&fit=crop',
    'tea': 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&h=400&fit=crop',
    
    // Household
    'detergent': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=400&fit=crop',
    'soap': 'https://images.unsplash.com/photo-1600857062243-1e120e53e5e4?w=400&h=400&fit=crop',
    'shampoo': 'https://images.unsplash.com/photo-1610548822785-7d17f6f6f7da?w=400&h=400&fit=crop',
    'toothpaste': 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&h=400&fit=crop',
    
    // Common grocery items
    'rice': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=400&fit=crop',
    'pasta': 'https://images.unsplash.com/photo-1551462147-37885a5d218d?w=400&h=400&fit=crop',
    'eggs': 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400&h=400&fit=crop',
    'flour': 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&h=400&fit=crop',
    'sugar': 'https://images.unsplash.com/photo-1611859266494-547a6d4f6f5c?w=400&h=400&fit=crop',
    'oil': 'https://images.unsplash.com/photo-1571115764595-644a1f56a55c?w=400&h=400&fit=crop',
  };

  const normalizedHint = hint.toLowerCase();
  
  // Find matching image
  for (const [key, imageUrl] of Object.entries(productImageMap)) {
    if (normalizedHint.includes(key)) {
      console.log(`🖼️ Found matching image for: ${key}`);
      return imageUrl;
    }
  }

  // Default generic grocery image
  console.log('🖼️ Using default grocery image');
  return 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=400&fit=crop';
}

// Optional: GET handler for direct image generation
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const hint = searchParams.get('hint');
  const width = searchParams.get('width');
  const height = searchParams.get('height');

  if (!hint) {
    return NextResponse.json(
      { error: 'Query parameter "hint" is required' },
      { status: 400 }
    );
  }

  try {
    const input = GenerateProductImageInputSchema.parse({
      dataAiHint: hint,
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
    });

    const result = await generateProductImageFlow(input);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in GET generate product image:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.issues },
        { status: 400 }
      );
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: `Failed to generate product image: ${errorMessage}` },
      { status: 500 }
    );
  }
}