// Helper function outside the class
function getFutureDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

export class FreeAIService {
  static async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    console.log('🤖 Generating AI response for prompt:', prompt.substring(0, 100) + '...');
    console.log('🔑 Groq API Key present:', !!process.env.GROQ_API_KEY);
    console.log('🔑 OpenRouter API Key present:', !!process.env.OPENROUTER_API_KEY);
    
    // Try multiple free providers in order
    try {
      // Method 1: Use Groq (fastest and most reliable)
      console.log('🔄 Trying Groq...');
      const result = await this.tryGroq(prompt, systemPrompt);
      if (result) {
        console.log('✅ Groq success');
        return result;
      }
    } catch (error) {
      console.log('❌ Groq failed:', error);
    }

    try {
      // Method 2: Use OpenRouter (free tier)
      console.log('🔄 Trying OpenRouter...');
      const result = await this.tryOpenRouter(prompt, systemPrompt);
      if (result) {
        console.log('✅ OpenRouter success');
        return result;
      }
    } catch (error) {
      console.log('❌ OpenRouter failed:', error);
    }

    // Method 3: Fallback to mock data
    console.log('🔄 Using mock data fallback');
    return this.generateMockResponse(prompt);
  }

  private static async tryGroq(prompt: string, systemPrompt?: string): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('Groq API key not found');
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
          { role: 'user', content: prompt },
        ],
        model: 'llama3-70b-8192',
        temperature: 0.7,
        max_tokens: 4000,
        top_p: 1,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  private static async tryOpenRouter(prompt: string, systemPrompt?: string): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OpenRouter API key not found');
    }

    // Try multiple free models
    const freeModels = [
      'google/gemma-7b-it:free',
      'huggingfaceh4/zephyr-7b-beta:free', 
      'meta-llama/llama-2-13b-chat:free',
    ];

    for (const model of freeModels) {
      try {
        console.log(`🔄 Trying OpenRouter model: ${model}`);
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
              { role: 'user', content: prompt },
            ],
            max_tokens: 2000,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices[0]?.message?.content;
          if (content && content.trim().length > 0) {
            console.log(`✅ OpenRouter success with model: ${model}`);
            return content;
          }
        }
      } catch (error) {
        console.log(`❌ OpenRouter model ${model} error:`, error);
      }
    }
    
    throw new Error('All OpenRouter models failed');
  }

  // Keep your existing generateMockResponse method for fallback
  private static generateMockResponse(prompt: string): string {
    // ... your existing mock response code ...
    return JSON.stringify({ 
      result: "Mock AI response", 
      message: "This is fallback mock data",
      prompt: prompt.substring(0, 100) 
    });
  }

  // Add this new method for image generation
  static async generateProductImage(productName: string): Promise<string> {
    console.log('🖼️ Generating product image for:', productName);
    
    // Method 1: Try Unsplash first (free and high quality)
    try {
      console.log('🔄 Trying Unsplash...');
      const unsplashUrl = await this.tryUnsplash(productName);
      if (unsplashUrl) {
        console.log('✅ Unsplash success');
        return unsplashUrl;
      }
    } catch (error) {
      console.log('❌ Unsplash failed:', error);
    }

    // Method 2: Fallback to placeholder with AI hint
    console.log('🔄 Using placeholder image');
    return `https://placehold.co/600x600/4A90E2/FFFFFF.png?text=${encodeURIComponent(productName)}&font=montserrat`;
  }

  private static async tryUnsplash(productName: string): Promise<string> {
    const apiKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!apiKey) {
      throw new Error('Unsplash API key not found');
    }

    // Clean up the product name for search
    const searchQuery = productName
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')[0]; // Use first word for better results

    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=1&orientation=squarish`,
      {
        headers: {
          'Authorization': `Client-ID ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Unsplash API error: ${response.status}`);
    }

    const data = await response.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].urls.regular;
    }

    throw new Error('No Unsplash images found');
  }
}