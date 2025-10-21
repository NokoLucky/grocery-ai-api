export default function Home() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <h1>Grocery AI API</h1>
      <p>API server is running. Use the following endpoints:</p>
      
      <div style={{ marginTop: '2rem' }}>
        <h2>API Endpoints:</h2>
        <ul>
          <li><strong>POST</strong> /api/ai/get-price-estimates - Get price comparisons</li>
          <li><strong>GET/POST</strong> /api/ai/suggest-item-completions - Get item suggestions</li>
          <li><strong>GET</strong> /api/ai/get-current-promotions - Get current promotions</li>
          <li><strong>POST</strong> /api/ai/generate-product-image - Generate product images</li>
          <li><strong>POST</strong> /api/ai/get-store-products - Get store products</li>
        </ul>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
        <h3>Quick Test:</h3>
        <p>Test the promotions endpoint: <a href="/api/ai/get-current-promotions" target="_blank">/api/ai/get-current-promotions</a></p>
      </div>
    </div>
  );
}