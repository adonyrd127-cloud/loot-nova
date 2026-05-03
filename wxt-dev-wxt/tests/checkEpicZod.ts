import { z } from 'zod';
import fetch from 'node-fetch';

const EpicKeyImageSchema = z.object({
  type: z.string(),
  url: z.string(),
}).passthrough();

const EpicElementSchema = z.object({
  title: z.string().optional(),
  id: z.string().optional(),
  namespace: z.string().optional(),
  description: z.string().optional(),
  productSlug: z.string().optional().nullable(),
  offerMappings: z.array(z.any()).optional(),
  catalogNs: z.any().optional(),
  keyImages: z.array(EpicKeyImageSchema).optional(),
  categories: z.array(z.any()).optional(),
  price: z.object({
    totalPrice: z.object({
      discountPrice: z.number().optional(),
      originalPrice: z.number().optional(),
    }).passthrough().optional()
  }).passthrough().optional(),
  promotions: z.object({
    promotionalOffers: z.array(z.any()).optional(),
    upcomingPromotionalOffers: z.array(z.any()).optional(),
  }).passthrough().optional().nullable(),
}).passthrough();

const EpicSearchResponseSchema = z.object({
  data: z.object({
    Catalog: z.object({
      searchStore: z.object({
        elements: z.array(EpicElementSchema)
      }).passthrough()
    }).passthrough()
  }).passthrough()
}).passthrough();

async function run() {
  const EPIC_API_URL = "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US";
  const response = await fetch(EPIC_API_URL);
  const rawData = await response.json();
  const parsed = EpicSearchResponseSchema.safeParse(rawData);
  if (!parsed.success) {
    console.error("ZOD VALIDATION FAILED:");
    console.error(parsed.error.errors);
  } else {
    console.log("ZOD VALIDATION SUCCESS");
  }
}
run();
