# Amazon Recommendations API

## Overview

The Amazon Recommendations API provides intelligent product recommendations based on a seed product URL. It analyzes the seed product and returns similar/alternative products with detailed categorization.

## Endpoint

```
POST /recs/amazon
```

## Request Body

```json
{
  "url": "https://www.amazon.com/dp/B08N5WRWNW",
  "limit": 15
}
```

### Parameters

- `url` (required): Amazon product URL
- `limit` (optional): Maximum number of recommendations (default: 15)

## Response Format

```json
{
  "site": "amazon",
  "inputUrl": "https://www.amazon.com/dp/B08N5WRWNW",
  "seed": {
    "productName": "Echo Dot (4th Gen)",
    "brand": "Amazon",
    "price": 49.99,
    "rating": 4.5,
    "ratingCount": 125000,
    "features": ["voice control", "smart home", "alexa"],
    "productImage": "https://m.media-amazon.com/images/...",
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
      "productName": "Echo Dot (5th Gen)",
      "productUrl": "https://www.amazon.com/dp/B09B8V1LZ3",
      "productImage": "https://m.media-amazon.com/images/...",
      "price": 39.99,
      "rating": 4.6,
      "ratingCount": 89000,
      "asin": "B09B8V1LZ3"
    }
  ]
}
```

## Features

### Intelligent Scoring
- **Title Similarity (35%)**: Matches product names using tokenization
- **Feature Matching (20%)**: Compares product features and specifications
- **Rating Score (30%)**: Considers product ratings and review counts
- **Price Proximity (15%)**: Finds products in similar price ranges

### Categorization
- **Top Rated**: Products with rating ≥ 4.0 and ≥ 100 reviews
- **Feature Match**: Products with significant feature overlap
- **Budget**: Products priced ≤ 60% of seed price
- **Mid Range**: Products priced 60-140% of seed price
- **Premium**: Products priced ≥ 140% of seed price

### Anti-Bot Measures
- Random user agent rotation
- Random delays between requests (300-900ms)
- Stealth browser configuration
- Headless operation

## Usage Examples

### Basic Request
```bash
curl -X POST http://localhost:3000/recs/amazon \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.amazon.com/dp/B08N5WRWNW", "limit": 10}'
```

### With Different Amazon TLD
```bash
curl -X POST http://localhost:3000/recs/amazon \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.amazon.co.uk/dp/B08N5WRWNW", "limit": 5}'
```

## Error Handling

The API returns appropriate HTTP status codes and error messages:

- `400`: Missing or invalid URL
- `500`: Server error with details

```json
{
  "error": "Could not extract product name from seed URL",
  "detail": "Error details..."
}
```

## Technical Implementation

### Architecture
- **Anti-bot utilities**: User agent rotation, stealth measures
- **Text processing**: Tokenization, feature extraction, similarity scoring
- **Ranking system**: Multi-factor scoring with configurable weights
- **Price categorization**: Dynamic bucketing based on quantiles
- **Amazon selectors**: Comprehensive CSS selectors for product data extraction

### Supported Amazon Domains
- amazon.com
- amazon.co.uk
- amazon.de
- amazon.fr
- amazon.it
- amazon.es
- amazon.in

## Environment Variables

- `HEADLESS`: Set to `true` for headless browser operation (default: true)
- `PORT`: Server port (default: 5000)
- `CONCURRENCY`: Maximum concurrent operations (default: 3)
