# Amazon Recommendations API

## Endpoint

```
POST /recs/amazon
```

## Request Body

```json
{
  "url": "https://www.amazon.com/dp/B0XXXXXX",
  "limit": 15  // optional, defaults to 15
}
```

## Response Format

```json
{
  "site": "amazon",
  "inputUrl": "https://www.amazon.com/dp/B0XXXXXX",
  "seed": {
    "productName": "Product Name",
    "brand": "Brand Name",
    "price": 99.99,
    "rating": 4.5,
    "ratingCount": 1234,
    "features": ["Feature 1", "Feature 2"],
    "productImage": "https://...",
    "asin": "B0XXXXXX"
  },
  "groups": {
    "topRated": [/* top 5 by rating */],
    "featureMatch": [/* top 5 by feature similarity */],
    "budget": [/* lower price tier */],
    "midRange": [/* middle price tier */],
    "premium": [/* higher price tier */]
  },
  "flat": [
    {
      "productName": "Similar Product",
      "productUrl": "https://...",
      "productImage": "https://...",
      "price": 89.99,
      "rating": 4.3,
      "ratingCount": 567,
      "asin": "B0YYYYYY"
    }
    // ... up to limit items
  ]
}
```

## Example Usage

```bash
curl -X POST http://localhost:5000/recs/amazon \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.amazon.com/dp/B0BSHF7WHW",
    "limit": 10
  }'
```

## Features

- **Smart Ranking**: Uses weighted scoring based on:
  - Title/feature similarity: 55%
  - Rating quality: 30%
  - Price proximity: 15%

- **Multiple Search Queries**: Creates brand-based and token-based queries for comprehensive results

- **Enrichment**: Automatically fills missing data (price, rating, images) by visiting product pages

- **Price Bucketing**: Organizes products into budget/midRange/premium tiers based on percentiles

- **Anti-bot Measures**: Rotating user agents, random delays, proper headers

- **TLD Support**: Works with any Amazon TLD (.com, .in, .co.uk, etc.)
