// Free AI service that uses multiple fallbacks

// Helper function outside the class
function getFutureDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

export class FreeAIService {
  static async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    // TEMPORARY: Force mock data for testing
    console.log('🎭 FORCING MOCK DATA (bypassing AI APIs)');
    return this.generateMockResponse(prompt);
    
    /*
    // Uncomment this when ready to use real AI:
    console.log('🤖 Generating AI response for prompt:', prompt.substring(0, 100) + '...');
    console.log('🔑 OpenRouter API Key present:', !!process.env.OPENROUTER_API_KEY);
    console.log('🔑 HuggingFace Token present:', !!process.env.HUGGINGFACE_TOKEN);
    
    // Try multiple free providers in order
    try {
      // Method 1: Use OpenRouter (free tier)
      console.log('🔄 Trying OpenRouter...');
      const result = await this.tryOpenRouter(prompt, systemPrompt);
      if (result) {
        console.log('✅ OpenRouter success');
        return result;
      }
    } catch (error) {
      console.log('❌ OpenRouter failed:', error);
    }

    try {
      // Method 2: Use Hugging Face (free)
      console.log('🔄 Trying Hugging Face...');
      const result = await this.tryHuggingFace(prompt);
      if (result) {
        console.log('✅ Hugging Face success');
        return result;
      }
    } catch (error) {
      console.log('❌ Hugging Face failed:', error);
    }

    // Method 3: Fallback to mock data
    console.log('🔄 Using mock data fallback');
    return this.generateMockResponse(prompt);
    */
  }

  private static async tryOpenRouter(prompt: string, systemPrompt?: string): Promise<string> {
    // Try multiple free models
    const freeModels = [
      'google/gemma-7b-it:free',
      'huggingfaceh4/zephyr-7b-beta:free', 
      'meta-llama/llama-2-13b-chat:free',
      'microsoft/dialoxt-large:free',
      'gryphe/mythomax-l2-13b:free'
    ];

    for (const model of freeModels) {
      try {
        console.log(`🔄 Trying OpenRouter model: ${model}`);
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY || 'free'}`,
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

        console.log(`📊 OpenRouter response status: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          const content = data.choices[0]?.message?.content;
          if (content && content.trim().length > 0) {
            console.log(`✅ OpenRouter success with model: ${model}`);
            return content;
          }
        } else {
          console.log(`❌ OpenRouter model ${model} failed: ${response.status}`);
          // Try next model
        }
      } catch (error) {
        console.log(`❌ OpenRouter model ${model} error:`, error);
      }
    }
    
    throw new Error('All OpenRouter models failed');
  }

  private static async tryHuggingFace(prompt: string): Promise<string> {
    try {
      // Using a free inference API - try a simple model first
      const response = await fetch(
        'https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.HUGGINGFACE_TOKEN || ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            inputs: prompt,
            parameters: {
              max_length: 1000,
              temperature: 0.7
            }
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Hugging Face HTTP error: ${response.status}`);
      }
      
      const result = await response.json();
      return result[0]?.generated_text || result.generated_text || 'No response';
    } catch (error) {
      throw new Error(`Hugging Face failed: ${error}`);
    }
  }

  private static generateMockResponse(prompt: string): string {
    console.log('🎭 Generating mock response for:', prompt.substring(0, 50) + '...');
    
    // Check if it's a suggestions request
    if (prompt.includes('suggest') || prompt.includes('completions') || prompt.includes('autocomplete') || prompt.includes('User Input: "')) {
      console.log('🎯 Detected suggestions request');
      
      // Extract the query from the prompt
      const queryMatch = prompt.match(/User Input: "([^"]+)"/);
      const query = queryMatch ? queryMatch[1].toLowerCase() : 'mil';
      
      let suggestions: string[] = [];
      
      if (query.includes('mil')) {
        suggestions = ["milk", "milk powder", "milkshake", "millet", "mild cheese", "milk tart", "milk bread", "milk chocolate"];
      } else if (query.includes('bre')) {
        suggestions = ["bread", "bread rolls", "brown bread", "white bread", "bread flour", "bread crumbs", "bread machine", "bread knife"];
      } else if (query.includes('egg')) {
        suggestions = ["eggs", "free range eggs", "large eggs", "extra large eggs", "egg carton", "egg whites", "egg yolk", "boiled eggs"];
      } else if (query.includes('chi')) {
        suggestions = ["chicken", "chicken breast", "chicken thighs", "chicken wings", "chicken fillets", "chicken pieces", "chicken stock", "chicken soup"];
      } else if (query.includes('ric')) {
        suggestions = ["rice", "basmati rice", "brown rice", "jasmine rice", "rice flour", "rice cakes", "rice milk", "rice pudding"];
      } else if (query.includes('pas')) {
        suggestions = ["pasta", "pasta spaghetti", "pasta penne", "pasta fusilli", "pasta sauce", "pasta machine", "pasta salad", "pasta bake"];
      } else {
        // Default suggestions for any query
        suggestions = ["milk", "bread", "eggs", "chicken", "rice", "pasta", "tomatoes", "potatoes"];
      }
      
      console.log(`🎭 Generated ${suggestions.length} suggestions for query: ${query}`);
      return JSON.stringify({ suggestions });
    }

    // Check if it's a store products request
    if (prompt.includes('products') || prompt.includes('store products') || prompt.includes('Store:')) {
      console.log('🎯 Detected store products request');
      
      // Extract store name from prompt
      const storeMatch = prompt.match(/Store: ([^\n]+)/);
      const storeName = storeMatch ? storeMatch[1] : 'Supermarket';
      
      const mockProducts = {
        products: [
          {
            id: 1,
            name: "Fresh Full Cream Milk 2L",
            price: "R 25.99",
            onSpecial: true,
            originalPrice: "R 29.99",
            image: "placeholder",
            dataAiHint: "milk carton"
          },
          {
            id: 2,
            name: "Brown Bread 700g",
            price: "R 18.50",
            onSpecial: false,
            image: "placeholder", 
            dataAiHint: "bread loaf"
          },
          {
            id: 3,
            name: "Free Range Eggs Large 12pk",
            price: "R 45.00",
            onSpecial: true,
            originalPrice: "R 52.00",
            image: "placeholder",
            dataAiHint: "eggs"
          },
          {
            id: 4,
            name: "Chicken Breast Fillets 1kg",
            price: "R 89.99", 
            onSpecial: false,
            image: "placeholder",
            dataAiHint: "chicken breast"
          },
          {
            id: 5,
            name: "Long Grain Rice 2kg",
            price: "R 42.50",
            onSpecial: true,
            originalPrice: "R 49.99",
            image: "placeholder",
            dataAiHint: "rice"
          },
          {
            id: 6,
            name: "Pasta Spaghetti 500g",
            price: "R 16.99",
            onSpecial: false,
            image: "placeholder",
            dataAiHint: "pasta"
          },
          {
            id: 7,
            name: "Fresh Tomatoes 1kg",
            price: "R 24.99",
            onSpecial: true,
            originalPrice: "R 29.99",
            image: "placeholder", 
            dataAiHint: "tomatoes"
          },
          {
            id: 8,
            name: "Potatoes 2.5kg",
            price: "R 35.00",
            onSpecial: false,
            image: "placeholder",
            dataAiHint: "potatoes"
          },
          {
            id: 9,
            name: "Cheddar Cheese 500g",
            price: "R 67.99",
            onSpecial: false,
            image: "placeholder",
            dataAiHint: "cheese"
          },
          {
            id: 10,
            name: "Orange Juice 2L",
            price: "R 32.50",
            onSpecial: true,
            originalPrice: "R 38.00",
            image: "placeholder",
            dataAiHint: "orange juice"
          }
        ]
      };
      
      console.log(`🎭 Generated products for store: ${storeName}`);
      return JSON.stringify(mockProducts);
    }

    // Check if it's a promotions request
    if (prompt.includes('promotions') || prompt.includes('promotion') || prompt.includes('South African grocery app')) {
      console.log('🎯 Detected promotions request');
      
      const mockPromotions = {
        promotions: [
          {
            title: "25% Off Fresh Dairy Products",
            store: "Checkers",
            img: "image_to_be_generated",
            dataAiHint: "milk carton",
            category: "Dairy",
            discountPercent: 25,
            validUntil: getFutureDate(7)
          },
          {
            title: "Weekly Meat Special - 30% Off",
            store: "Shoprite",
            img: "image_to_be_generated", 
            dataAiHint: "chicken breast",
            category: "Meat",
            discountPercent: 30,
            validUntil: getFutureDate(5)
          },
          {
            title: "Bakery Sale - Buy 1 Get 1 Free",
            store: "Pick n Pay",
            img: "image_to_be_generated",
            dataAiHint: "fresh bread",
            category: "Bakery",
            validUntil: getFutureDate(3)
          },
          {
            title: "Fresh Produce Special - 15% Off",
            store: "Spar",
            img: "image_to_be_generated",
            dataAiHint: "fresh apples",
            category: "Produce",
            discountPercent: 15,
            validUntil: getFutureDate(4)
          },
          {
            title: "Household Essentials Discount",
            store: "Woolworths",
            img: "image_to_be_generated",
            dataAiHint: "laundry detergent",
            category: "Household",
            discountPercent: 20,
            validUntil: getFutureDate(6)
          }
        ]
      };
      
      console.log('🎭 Generated promotions mock data');
      return JSON.stringify(mockPromotions);
    }

    // Check if it's a price estimates request
    if (prompt.includes('price estimates') || prompt.includes('shopping list') || prompt.includes('Store')) {
      console.log('🎯 Detected price estimates request');
      return JSON.stringify({
        stores: [
          {
            name: "Checkers",
            distance: "1.2 km",
            totalPrice: 245.50,
            priceBreakdown: [
              { item: "milk", price: 25.99 },
              { item: "bread", price: 18.50 },
              { item: "eggs", price: 45.00 },
              { item: "chicken", price: 156.00 }
            ],
            isCheapest: true
          },
          {
            name: "Pick n Pay", 
            distance: "2.1 km",
            totalPrice: 268.75,
            priceBreakdown: [
              { item: "milk", price: 28.50 },
              { item: "bread", price: 20.00 },
              { item: "eggs", price: 48.25 },
              { item: "chicken", price: 172.00 }
            ],
            isCheapest: false
          },
          {
            name: "Shoprite",
            distance: "0.8 km", 
            totalPrice: 238.90,
            priceBreakdown: [
              { item: "milk", price: 24.99 },
              { item: "bread", price: 17.50 },
              { item: "eggs", price: 42.00 },
              { item: "chicken", price: 154.40 }
            ],
            isCheapest: true
          }
        ]
      });
    }

    // Default mock response for unknown prompt types
    console.log('🎭 Using default mock response');
    return JSON.stringify({ 
      result: "Mock AI response", 
      message: "This is fallback mock data",
      prompt: prompt.substring(0, 100) 
    });
  }
}