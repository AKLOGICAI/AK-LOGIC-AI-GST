import { apiRequest } from './apiClient';

export interface PublicStoreData {
  slug: string;
  custom_domain?: string;
  status: string;
  theme_primary_color: string;
  theme_secondary_color: string;
  theme_font: string;
  theme_style: 'modern' | 'classic' | 'minimal';

  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;

  hero_enabled: boolean;
  hero_title?: string;
  hero_subtitle?: string;
  hero_image_url?: string;
  hero_cta_text?: string;
  hero_cta_link?: string;

  about_enabled: boolean;
  about_title?: string;
  about_description?: string;
  about_image_url?: string;

  products_enabled: boolean;
  products_title?: string;
  products_layout?: 'grid' | 'list';
  products_per_page?: number;

  categories_enabled: boolean;
  gallery_enabled: boolean;
  gallery_title?: string;

  contact_enabled: boolean;
  contact_show_phone: boolean;
  contact_show_email: boolean;
  contact_show_address: boolean;
  contact_show_map: boolean;

  footer_text?: string;
  footer_show_social: boolean;
  footer_facebook?: string;
  footer_instagram?: string;
  footer_twitter?: string;
  footer_whatsapp?: string;

  business_hours?: any[];
  section_order?: string[];

  // Merchant safe details
  merchant_id: string;
  shopName: string;
  ownerName: string;
  tradeName?: string;
  legalName?: string;
  brandName?: string;
  brandColor?: string;
  logoUrl?: string;
  hasCustomLogo?: boolean;
  email: string;
  phone: string;
  address: string;
  city?: string;
  state: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
}

export interface PublicProduct {
  id: string;
  product_name: string;
  description: string;
  hsn_code: string;
  gst_rate: number;
  selling_price: number;
  stock_quantity: number;
  unit: string;
  image_url?: string;
  featured: boolean;
  website_description?: string;
  display_order: number;
}

export const publicStoreService = {
  async getPublicStore(slug: string): Promise<{ store: PublicStoreData; gallery: any[] }> {
    return await apiRequest<{ store: PublicStoreData; gallery: any[] }>(`/api/public/store/${encodeURIComponent(slug)}`);
  },

  async getPublicStoreProducts(slug: string, limit: number = 50, offset: number = 0): Promise<PublicProduct[]> {
    const res = await apiRequest<{ products: PublicProduct[] }>(`/api/public/store/${encodeURIComponent(slug)}/products?limit=${limit}&offset=${offset}`);
    return res.products || [];
  },

  async placeStoreOrder(
    slug: string,
    payload: {
      customerName: string;
      customerPhone: string;
      items: { description: string; qty: number; rate: number; gstRate: number }[];
      notes?: string;
    }
  ): Promise<{ ok: boolean; requestId: string; message: string }> {
    return await apiRequest<{ ok: boolean; requestId: string; message: string }>(
      `/api/public/store/${encodeURIComponent(slug)}/order`,
      {
        method: 'POST',
        body: payload,
      }
    );
  }
};
