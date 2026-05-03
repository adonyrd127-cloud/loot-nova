import { z } from 'zod';

export const EpicKeyImageSchema = z.object({
  type: z.string(),
  url: z.string(),
});

export const EpicPromoOfferSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  discountSetting: z.object({
    discountType: z.string().optional(),
    discountPercentage: z.number().optional(),
  }).passthrough().optional(),
}).passthrough();

export const EpicPromotionsSchema = z.object({
  promotionalOffers: z.array(z.object({
    promotionalOffers: z.array(EpicPromoOfferSchema).optional(),
  }).passthrough()).optional(),
  upcomingPromotionalOffers: z.array(z.object({
    promotionalOffers: z.array(EpicPromoOfferSchema).optional(),
  }).passthrough()).optional(),
}).passthrough();

export const EpicElementSchema = z.object({
  title: z.string(),
  id: z.string(),
  namespace: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  productSlug: z.string().nullable().optional(),
  urlSlug: z.string().nullable().optional(),
  keyImages: z.array(EpicKeyImageSchema).nullable().optional(),
  categories: z.array(z.object({ path: z.string() }).passthrough()).nullable().optional(),
  catalogNs: z.object({
    mappings: z.array(z.object({ pageSlug: z.string() }).passthrough()).nullable().optional(),
  }).passthrough().nullable().optional(),
  offerMappings: z.array(z.object({ pageSlug: z.string() }).passthrough()).nullable().optional(),
  price: z.object({
    totalPrice: z.object({
      discountPrice: z.number(),
      originalPrice: z.number().optional(),
    }).passthrough(),
  }).passthrough().nullable().optional(),
  promotions: EpicPromotionsSchema.nullable().optional(),
}).passthrough();

export const EpicSearchResponseSchema = z.object({
  data: z.object({
    Catalog: z.object({
      searchStore: z.object({
        elements: z.array(EpicElementSchema),
      }).passthrough(),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

export type EpicElementZod = z.infer<typeof EpicElementSchema>;
