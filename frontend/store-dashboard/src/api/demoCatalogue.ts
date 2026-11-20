// GENERATED from backend/scripts/demo_catalogue.py (same simulated demo data as the backend seed). Do not hand-edit.
export const DEMO_PRODUCTS = [
  {
    "id": "milk",
    "name": "Toned Milk",
    "category": "Dairy",
    "price": "30.00",
    "unit": "500 ml"
  },
  {
    "id": "curd",
    "name": "Fresh Curd",
    "category": "Dairy",
    "price": "40.00",
    "unit": "400 g"
  },
  {
    "id": "eggs",
    "name": "Farm Eggs",
    "category": "Dairy",
    "price": "60.00",
    "unit": "6 pcs"
  },
  {
    "id": "butter",
    "name": "Salted Butter",
    "category": "Dairy",
    "price": "58.00",
    "unit": "100 g"
  },
  {
    "id": "paneer",
    "name": "Fresh Paneer",
    "category": "Dairy",
    "price": "90.00",
    "unit": "200 g"
  },
  {
    "id": "cheese",
    "name": "Cheese Slices",
    "category": "Dairy",
    "price": "135.00",
    "unit": "200 g"
  },
  {
    "id": "bread",
    "name": "Brown Bread",
    "category": "Bakery",
    "price": "45.00",
    "unit": "400 g"
  },
  {
    "id": "pav",
    "name": "Pav Buns",
    "category": "Bakery",
    "price": "35.00",
    "unit": "6 pcs"
  },
  {
    "id": "rusk",
    "name": "Tea Rusk",
    "category": "Bakery",
    "price": "40.00",
    "unit": "200 g"
  },
  {
    "id": "cake",
    "name": "Plum Cake",
    "category": "Bakery",
    "price": "60.00",
    "unit": "200 g"
  },
  {
    "id": "banana",
    "name": "Bananas",
    "category": "Fruits & Veg",
    "price": "48.00",
    "unit": "6 pcs"
  },
  {
    "id": "tomato",
    "name": "Tomatoes",
    "category": "Fruits & Veg",
    "price": "32.00",
    "unit": "500 g"
  },
  {
    "id": "onion",
    "name": "Onions",
    "category": "Fruits & Veg",
    "price": "38.00",
    "unit": "1 kg"
  },
  {
    "id": "potato",
    "name": "Potatoes",
    "category": "Fruits & Veg",
    "price": "34.00",
    "unit": "1 kg"
  },
  {
    "id": "apple",
    "name": "Apples",
    "category": "Fruits & Veg",
    "price": "140.00",
    "unit": "4 pcs"
  },
  {
    "id": "coriander",
    "name": "Fresh Coriander",
    "category": "Fruits & Veg",
    "price": "15.00",
    "unit": "100 g"
  },
  {
    "id": "cucumber",
    "name": "Cucumber",
    "category": "Fruits & Veg",
    "price": "28.00",
    "unit": "500 g"
  },
  {
    "id": "lemon",
    "name": "Lemons",
    "category": "Fruits & Veg",
    "price": "25.00",
    "unit": "6 pcs"
  },
  {
    "id": "chips",
    "name": "Salted Chips",
    "category": "Snacks",
    "price": "20.00",
    "unit": "52 g"
  },
  {
    "id": "biscuit",
    "name": "Marie Biscuits",
    "category": "Snacks",
    "price": "25.00",
    "unit": "250 g"
  },
  {
    "id": "namkeen",
    "name": "Bhujia Sev",
    "category": "Snacks",
    "price": "55.00",
    "unit": "200 g"
  },
  {
    "id": "popcorn",
    "name": "Ready Popcorn",
    "category": "Snacks",
    "price": "45.00",
    "unit": "100 g"
  },
  {
    "id": "chocolate",
    "name": "Milk Chocolate",
    "category": "Snacks",
    "price": "50.00",
    "unit": "45 g"
  },
  {
    "id": "cola",
    "name": "Cola",
    "category": "Beverages",
    "price": "40.00",
    "unit": "750 ml"
  },
  {
    "id": "juice",
    "name": "Orange Juice",
    "category": "Beverages",
    "price": "99.00",
    "unit": "1 L"
  },
  {
    "id": "water",
    "name": "Packaged Water",
    "category": "Beverages",
    "price": "20.00",
    "unit": "1 L"
  },
  {
    "id": "tea",
    "name": "Tea Powder",
    "category": "Beverages",
    "price": "125.00",
    "unit": "250 g"
  },
  {
    "id": "coffee",
    "name": "Instant Coffee",
    "category": "Beverages",
    "price": "160.00",
    "unit": "100 g"
  },
  {
    "id": "rice",
    "name": "Basmati Rice",
    "category": "Staples",
    "price": "165.00",
    "unit": "1 kg"
  },
  {
    "id": "atta",
    "name": "Wheat Atta",
    "category": "Staples",
    "price": "55.00",
    "unit": "1 kg"
  },
  {
    "id": "dal",
    "name": "Toor Dal",
    "category": "Staples",
    "price": "160.00",
    "unit": "1 kg"
  },
  {
    "id": "oil",
    "name": "Sunflower Oil",
    "category": "Staples",
    "price": "150.00",
    "unit": "1 L"
  },
  {
    "id": "sugar",
    "name": "Sugar",
    "category": "Staples",
    "price": "48.00",
    "unit": "1 kg"
  },
  {
    "id": "salt",
    "name": "Iodised Salt",
    "category": "Staples",
    "price": "25.00",
    "unit": "1 kg"
  },
  {
    "id": "soap",
    "name": "Bathing Soap",
    "category": "Household",
    "price": "38.00",
    "unit": "100 g"
  }
] as const

/** Stock for the dashboard's own store (store-a, Satellite). */
export const DEMO_STOCK_STORE_A: Record<string, number> = {
  "curd": 23,
  "eggs": 11,
  "butter": 28,
  "paneer": 16,
  "cheese": 33,
  "bread": 21,
  "pav": 3,
  "rusk": 26,
  "cake": 14,
  "banana": 31,
  "tomato": 19,
  "potato": 24,
  "apple": 12,
  "coriander": 29,
  "cucumber": 17,
  "lemon": 34,
  "chips": 22,
  "biscuit": 4,
  "namkeen": 27,
  "popcorn": 15,
  "chocolate": 32,
  "cola": 20,
  "water": 25,
  "tea": 13,
  "coffee": 30,
  "rice": 18,
  "atta": 0,
  "dal": 23,
  "oil": 11,
  "sugar": 28,
  "salt": 16,
  "soap": 33
}
