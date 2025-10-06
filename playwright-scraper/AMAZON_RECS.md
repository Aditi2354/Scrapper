# Amazon Recommendations Scraper

A comprehensive Amazon product recommendations scraper built with Node.js and Playwright.

## Features

- **Smart Product Analysis**: Extracts product details including name, brand, price, rating, and features
- **Intelligent Search**: Builds multiple search queries based on brand and product keywords
- **Advanced Ranking**: Uses weighted scoring based on title similarity (55%), rating (30%), and price proximity (15%)
- **Price Categorization**: Automatically groups products into budget, mid-range, and premium categories
- **Anti-Bot Protection**: Rotates user agents, random delays, and proper headers
- **Multi-TLD Support**: Works with different Amazon domains (.com, .co.uk, .de, etc.)

## API Endpoint

```
POST /recs/amazon
```

### Request Body
```json
{
  "url": "https://www.amazon.com/dp/B08N5WRWNW",
  "limit": 15
}
```

### Response Format
```json
{
  "site": "amazon",
  "inputUrl": "https://www.amazon.com/dp/B08N5WRWNW",
  "seed": {
    "productName": "Product Name",
    "brand": "Brand Name",
    "price": 99.99,
    "rating": 4.5,
    "ratingCount": 1234,
    "features": ["feature1", "feature2"],
    "productImage": "https://...",
    "asin": "B08N5WRWNW"
  },
  "groups": {
    "topRated": [...],
    "featureMatch": [...],
    "budget": [...],
    "midRange": [...],
    "premium": [...]
  },
  "flat": [
    {
      "productName": "Recommended Product",
      "productUrl": "https://amazon.com/dp/...",
      "productImage": "https://...",
      "price": 89.99,
      "rating": 4.3,
      "ratingCount": 567,
      "asin": "B08N5WRWNW"
    }
  ]
}
```

## Architecture

### Core Files

- `src/utils/recs/antibot.js` - Anti-bot utilities (UA rotation, delays, headers)
- `src/utils/recs/text-utils.js` - Text processing and parsing utilities
- `src/utils/recs/ranker.js` - Product ranking and scoring algorithms
- `src/utils/recs/price-buckets.js` - Price categorization logic
- `src/adapters/amazon/selectors.js` - CSS selectors for Amazon pages
- `src/adapters/amazon/recs.js` - Main Amazon recommendations provider
- `src/recommender.js` - Updated with new Amazon recommendations dispatcher
- `src/routes.js` - New `/recs/amazon` endpoint

### Workflow

1. **Seed Extraction**: Parse the input product page to extract product details
2. **Query Building**: Create search queries using brand + keywords and keywords only
3. **Search Collection**: Scrape search results from multiple queries
4. **Deduplication**: Remove duplicates and exclude the seed product
5. **Ranking**: Score candidates based on title similarity, rating, and price
6. **Enrichment**: Visit top candidates to fill missing data
7. **Categorization**: Group products by price ranges
8. **Response**: Format and return structured recommendations

## Usage

The scraper is designed to be robust and handle various Amazon page layouts. It includes fallbacks for missing data and uses JSON-LD structured data when available.

## Error Handling

Returns structured error responses with details for debugging:

```json
{
  "error": "Error message",
  "detail": "Stack trace"
}
```