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
  }).optional(),
});

export const EpicPromotionsSchema = z.object({
  promotionalOffers: z.array(z.object({
    promotionalOffers: z.array(EpicPromoOfferSchema).optional(),
  })).optional(),
  upcomingPromotionalOffers: z.array(z.object({
    promotionalOffers: z.array(EpicPromoOfferSchema).optional(),
  })).optional(),
});

export const EpicElementSchema = z.object({
  title: z.string(),
  id: z.string(),
  namespace: z.string().optional(),
  description: z.string().optional(),
  productSlug: z.string().nullable().optional(),
  urlSlug: z.string().nullable().optional(),
  keyImages: z.array(EpicKeyImageSchema).optional(),
  categories: z.array(z.object({ path: z.string() })).optional(),
  catalogNs: z.object({
    mappings: z.array(z.object({ pageSlug: z.string() })).optional(),
  }).optional(),
  offerMappings: z.array(z.object({ pageSlug: z.string() })).optional(),
  price: z.object({
    totalPrice: z.object({
      discountPrice: z.number(),
      originalPrice: z.number().optional(),
    }),
  }).optional(),
  promotions: EpicPromotionsSchema.optional().nullable(),
});

export const EpicSearchResponseSchema = z.object({
  data: z.object({
    Catalog: z.object({
      searchStore: z.object({
        elements: z.array(EpicElementSchema),
      }),
    }),
  }),
});

export type EpicElementZod = z.infer<typeof EpicElementSchema>;
