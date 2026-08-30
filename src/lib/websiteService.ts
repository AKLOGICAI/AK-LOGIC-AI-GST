import { apiRequest } from './apiClient';
import { auth } from './services';

export interface WebsiteConfig {
  id: string;
  merchant_id: string;
  slug: string;
  custom_domain?: string;
  status: 'draft' | 'published';
  published_at?: number | null;

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

  created_at: number;
  updated_at: number;
}

export interface GalleryItem {
  id: string;
  merchant_id: string;
  image_url: string;
  caption: string;
  display_order: number;
  created_at: number;
}

export const websiteCache = {
  get(merchantId: string): { website: WebsiteConfig; gallery: GalleryItem[] } | null {
    if (!merchantId) return null;
    try {
      const raw = localStorage.getItem(`ak_cache_website_${merchantId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  save(merchantId: string, data: { website: WebsiteConfig; gallery?: GalleryItem[] }) {
    if (!merchantId || !data) return;
    try {
      const existing = websiteCache.get(merchantId);
      const toSave = {
        website: data.website || existing?.website,
        gallery: data.gallery !== undefined ? data.gallery : (existing?.gallery || [])
      };
      localStorage.setItem(`ak_cache_website_${merchantId}`, JSON.stringify(toSave));
    } catch {}
  }
};

export const websiteService = {
  async getFeatureFlag(): Promise<boolean> {
    const token = auth.merchantToken();
    if (!token) return true;
    try {
      const res = await apiRequest<{ merchant_website_enabled: boolean }>('/api/merchant/website-feature-flag', { token });
      return res.merchant_website_enabled !== false;
    } catch {
      return true;
    }
  },

  async getWebsiteConfig(): Promise<{ website: WebsiteConfig; gallery: GalleryItem[] }> {
    const token = auth.merchantToken();
    const mid = auth.merchantSession();
    if (!token) {
      if (mid) {
        const cached = websiteCache.get(mid);
        if (cached) return cached;
      }
      throw new Error('Your session has expired. Please log in again.');
    }
    try {
      const res = await apiRequest<{ website: WebsiteConfig; gallery: GalleryItem[] }>('/api/merchant/website', { token });
      if (mid && res.website) {
        websiteCache.save(mid, res);
      }
      return res;
    } catch (err) {
      if (mid) {
        const cached = websiteCache.get(mid);
        if (cached) return cached;
      }
      throw err;
    }
  },

  async updateWebsiteConfig(patch: Partial<WebsiteConfig>): Promise<{ website: WebsiteConfig; gallery: GalleryItem[] }> {
    const token = auth.merchantToken();
    const mid = auth.merchantSession();
    if (!token) throw new Error('Your session has expired. Please log in again.');
    const res = await apiRequest<{ website: WebsiteConfig; gallery: GalleryItem[] }>('/api/merchant/website', {
      method: 'PATCH',
      token,
      body: patch
    });
    if (mid && res.website) {
      websiteCache.save(mid, res);
    }
    return res;
  },

  async publishWebsite(): Promise<{ ok: boolean; website: WebsiteConfig }> {
    const token = auth.merchantToken();
    const mid = auth.merchantSession();
    if (!token) throw new Error('Your session has expired. Please log in again.');
    const res = await apiRequest<{ ok: boolean; website: WebsiteConfig }>('/api/merchant/website/publish', {
      method: 'POST',
      token
    });
    if (mid && res.website) {
      websiteCache.save(mid, { website: res.website });
    }
    return res;
  },

  async unpublishWebsite(): Promise<{ ok: boolean; website: WebsiteConfig }> {
    const token = auth.merchantToken();
    const mid = auth.merchantSession();
    if (!token) throw new Error('Your session has expired. Please log in again.');
    const res = await apiRequest<{ ok: boolean; website: WebsiteConfig }>('/api/merchant/website/unpublish', {
      method: 'POST',
      token
    });
    if (mid && res.website) {
      websiteCache.save(mid, { website: res.website });
    }
    return res;
  },

  async uploadWebsiteImage(imageType: 'hero' | 'about' | 'gallery', dataUrl: string, caption: string = ''): Promise<{ ok: boolean; imageUrl: string }> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Your session has expired. Please log in again.');
    return await apiRequest<{ ok: boolean; imageUrl: string }>('/api/merchant/website/upload-image', {
      method: 'POST',
      token,
      body: { imageType, dataUrl, caption }
    });
  },

  async getGalleryImages(): Promise<GalleryItem[]> {
    const token = auth.merchantToken();
    const mid = auth.merchantSession();
    if (!token) {
      if (mid) {
        const cached = websiteCache.get(mid);
        if (cached?.gallery) return cached.gallery;
      }
      return [];
    }
    try {
      const res = await apiRequest<{ gallery: GalleryItem[] }>('/api/merchant/website/gallery', { token });
      if (mid && res.gallery) {
        websiteCache.save(mid, { website: undefined as any, gallery: res.gallery });
      }
      return res.gallery || [];
    } catch {
      if (mid) {
        const cached = websiteCache.get(mid);
        if (cached?.gallery) return cached.gallery;
      }
      return [];
    }
  },

  async deleteGalleryImage(imageId: string): Promise<boolean> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Your session has expired. Please log in again.');
    const res = await apiRequest<{ ok: boolean }>(`/api/merchant/website/gallery/${imageId}`, {
      method: 'DELETE',
      token
    });
    return res.ok;
  }
};
