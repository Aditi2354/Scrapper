// Test script for Amazon recommendations

const SERVER_URL = 'http://localhost:5000';

// Test Amazon URLs
const testUrls = [
  'https://www.amazon.com/dp/B0C1SLD1HK', // A sample product
  'https://www.amazon.in/dp/B07HGJJ586'   // Another sample product
];

async function testRecommendations(url, limit = 10) {
  console.log(`\n📦 Testing recommendations for: ${url}`);
  console.log('⏱️  Making request...\n');
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${SERVER_URL}/recs/amazon`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url, limit })
    });
    
    const endTime = Date.now();
    console.log(`⏱️  Request completed in ${endTime - startTime}ms`);
    
    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Error:', error);
      return;
    }
    
    const result = await response.json();
    
    console.log('\n✅ Success! Results:');
    console.log('📊 Site:', result.site);
    console.log('🌱 Seed product:', {
      name: result.seed?.productName,
      price: result.seed?.price,
      rating: result.seed?.rating,
      asin: result.seed?.asin
    });
    
    console.log('\n📈 Groups:');
    console.log(`  🏆 Top Rated: ${result.groups?.topRated?.length || 0} items`);
    console.log(`  🎯 Feature Match: ${result.groups?.featureMatch?.length || 0} items`);
    console.log(`  💰 Budget: ${result.groups?.budget?.length || 0} items`);
    console.log(`  ⚖️  Mid Range: ${result.groups?.midRange?.length || 0} items`);
    console.log(`  💎 Premium: ${result.groups?.premium?.length || 0} items`);
    
    console.log(`\n📋 Flat list: ${result.flat?.length || 0} total items`);
    
    if (result.flat?.length > 0) {
      console.log('\n🔍 Sample products:');
      result.flat.slice(0, 3).forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.productName}`);
        console.log(`     💰 Price: ${product.price || 'N/A'}`);
        console.log(`     ⭐ Rating: ${product.rating || 'N/A'} (${product.ratingCount || 0} reviews)`);
        console.log(`     🔗 ${product.productUrl}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ Network error:', error.message);
  }
}

async function runTests() {
  console.log('🚀 Starting Amazon Recommendations Tests');
  console.log(`🌐 Server: ${SERVER_URL}`);
  
  // Test health endpoint first
  try {
    const healthResponse = await fetch(`${SERVER_URL}/health`);
    if (healthResponse.ok) {
      console.log('✅ Server is healthy');
    } else {
      console.log('⚠️  Server health check failed');
      return;
    }
  } catch (error) {
    console.error('❌ Cannot connect to server:', error.message);
    console.log('💡 Make sure to run: npm run dev');
    return;
  }
  
  // Test each URL
  for (const url of testUrls) {
    await testRecommendations(url, 12);
  }
  
  console.log('\n🏁 Tests completed');
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { testRecommendations };