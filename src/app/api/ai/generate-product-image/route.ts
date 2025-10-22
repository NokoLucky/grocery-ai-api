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
    // Try Pexels API first
    const imageUrl = await generateImageWithPexels(input.dataAiHint);
    
    // Cache the result
    imageCache[normalizedHint] = imageUrl;
    
    return { imageUrl };
  } catch (error) {
    console.error('Pexels API failed, using fallback:', error);
    
    // Fallback to our reliable image map
    const fallbackImage = getFallbackImage(input.dataAiHint);
    imageCache[normalizedHint] = fallbackImage;
    
    return { imageUrl: fallbackImage };
  }
}

async function generateImageWithPexels(hint: string): Promise<string> {
  const pexelsApiKey = process.env.PEXELS_API_KEY;
  
  if (!pexelsApiKey) {
    console.log('🔑 No Pexels API key, using fallback images');
    return getFallbackImage(hint);
  }

  try {
    // Clean up the hint for better search results
    const searchQuery = hint
      .toLowerCase()
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Add "product" to make searches more product-focused
    const enhancedQuery = `${searchQuery} product grocery shopping`;
    
    console.log(`🔍 Searching Pexels for: "${enhancedQuery}"`);
    
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(enhancedQuery)}&per_page=1&orientation=square`,
      {
        headers: {
          'Authorization': pexelsApiKey,
        },
      }
    );
    
    console.log(`📊 Pexels API response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Pexels API success, found photos:', data.photos?.length || 0);
      
      if (data.photos && data.photos.length > 0) {
        // Return the medium-sized image (good balance of quality and size)
        const imageUrl = data.photos[0].src.medium;
        console.log('🖼️ Selected Pexels image:', imageUrl);
        return imageUrl;
      } else {
        throw new Error('No Pexels images found');
      }
    } else {
      const errorText = await response.text();
      console.log('❌ Pexels API error response:', errorText);
      throw new Error(`Pexels API error: ${response.status}`);
    }
  } catch (error) {
    console.error('Pexels API failed:', error);
    throw error;
  }
}

function getFallbackImage(hint: string): string {
  console.log(`🎭 Using fallback image for: ${hint}`);
  
  // Enhanced fallback mapping with more specific categories
  const productImageMap: { [key: string]: string } = {
    // Cereals & Breakfast
    'cereal': 'https://images.pexels.com/photos/2119758/pexels-photo-2119758.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'corn flakes': 'https://images.pexels.com/photos/2119758/pexels-photo-2119758.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'breakfast': 'https://images.pexels.com/photos/2119758/pexels-photo-2119758.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    
    // Coffee & Tea
    'coffee': 'https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'ricoffy': 'https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    
    // Beverages
    'juice': 'https://images.pexels.com/photos/1304548/pexels-photo-1304548.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'beverage': 'https://images.pexels.com/photos/1304548/pexels-photo-1304548.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'soda': 'https://images.pexels.com/photos/50593/coca-cola-cold-drink-soft-drink-coke-50593.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'coca-cola': 'https://images.pexels.com/photos/50593/coca-cola-cold-drink-soft-drink-coke-50593.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    
    // Dairy
    'milk': 'https://images.pexels.com/photos/248412/pexels-photo-248412.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'yogurt': 'https://images.pexels.com/photos/3734612/pexels-photo-3734612.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'butter': 'https://images.pexels.com/photos/3311336/pexels-photo-3311336.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'dairy': 'https://images.pexels.com/photos/248412/pexels-photo-248412.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    
    // Meat & Poultry
    'chicken': 'https://images.pexels.com/photos/65175/pexels-photo-65175.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'meat': 'https://images.pexels.com/photos/65175/pexels-photo-65175.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'beef': 'https://images.pexels.com/photos/65175/pexels-photo-65175.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    
    // Rice & Grains
    'rice': 'https://images.pexels.com/photos/2098135/pexels-photo-2098135.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'tastic': 'https://images.pexels.com/photos/2098135/pexels-photo-2098135.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    
    // Household & Cleaning
    'detergent': 'https://images.pexels.com/photos/545014/pexels-photo-545014.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'sunlight': 'https://images.pexels.com/photos/545014/pexels-photo-545014.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'dishwashing': 'https://images.pexels.com/photos/545014/pexels-photo-545014.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'household': 'https://images.pexels.com/photos/545014/pexels-photo-545014.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'cleaning': 'https://images.pexels.com/photos/545014/pexels-photo-545014.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    
    // Bread & Bakery
    'bread': 'https://images.pexels.com/photos/1775043/pexels-photo-1775043.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'bakery': 'https://images.pexels.com/photos/1775043/pexels-photo-1775043.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    
    // Eggs
    'eggs': 'https://images.pexels.com/photos/162712/egg-white-food-protein-162712.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    
    // Pantry & Canned
    'pantry': 'https://images.pexels.com/photos/3962286/pexels-photo-3962286.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
    'canned': 'https://images.pexels.com/photos/3962286/pexels-photo-3962286.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
  };

  const normalizedHint = hint.toLowerCase();
  
  // Find matching image
  for (const [key, imageUrl] of Object.entries(productImageMap)) {
    if (normalizedHint.includes(key)) {
      console.log(`🖼️ Found matching fallback image for: ${key}`);
      return imageUrl;
    }
  }

  // Default generic grocery image from Pexels
  console.log('🖼️ Using default grocery fallback image');
  return 'https://images.pexels.com/photos/3962286/pexels-photo-3962286.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop';
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