import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Image, Switch, Alert, Linking, ActivityIndicator, Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Theme } from '../lib/theme';
import {
  Card, GradientButton, OutlineButton, FilledButton,
  TopAppBar, Snackbar, Divider, SearchBar,
} from '../components/DesignSystem';
import { useMerchant } from '../lib/MerchantContext';
import { api } from '../lib/apiClient';
import { getCache, setCache } from '../lib/offlineCache';

const { width: SW } = Dimensions.get('window');

export interface WebsiteConfig {
  id?: string;
  merchant_id?: string;
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
  products_enabled?: boolean;
  products_title?: string;
  products_layout?: 'grid' | 'list';
  products_per_page?: number;
  categories_enabled?: boolean;
  gallery_enabled?: boolean;
  gallery_title?: string;
  contact_enabled?: boolean;
  contact_show_phone: boolean;
  contact_show_email: boolean;
  contact_show_address: boolean;
  contact_show_map: boolean;
  footer_text?: string;
  footer_show_social?: boolean;
  footer_facebook?: string;
  footer_instagram?: string;
  footer_twitter?: string;
  footer_whatsapp?: string;
  business_hours?: any[];
  section_order?: string[];
  created_at?: number;
  updated_at?: number;
}

export interface GalleryItem {
  id: string;
  merchant_id?: string;
  image_url: string;
  caption?: string;
  display_order?: number;
  created_at?: number;
}

const PRESET_PALETTES = [
  { name: 'Indigo & Emerald', primary: '#4F46E5', secondary: '#10B981' },
  { name: 'Gold & Aqua', primary: '#e9c46a', secondary: '#38e0c8' },
  { name: 'Deep Cyan & Neon', primary: '#06b6d4', secondary: '#10b981' },
  { name: 'Rose & Amber', primary: '#f43f5e', secondary: '#f59e0b' },
  { name: 'Midnight Slate', primary: '#3b82f6', secondary: '#8b5cf6' },
];

const FONTS = ['Inter', 'Outfit', 'Roboto', 'Poppins', 'Playfair Display'];

type WebTab = 'overview' | 'design' | 'sections' | 'products' | 'settings' | 'gallery';

export default function WebsiteBuilderScreen({ navigation }: { navigation: any }) {
  const { merchant, token } = useMerchant();
  const [activeTab, setActiveTab] = useState<WebTab>('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [website, setWebsite] = useState<WebsiteConfig>({
    slug: merchant?.merchantCode?.toLowerCase() || 'store',
    status: 'draft',
    theme_primary_color: '#4F46E5',
    theme_secondary_color: '#10B981',
    theme_font: 'Inter',
    theme_style: 'modern',
    hero_enabled: true,
    hero_title: 'Welcome to our store',
    hero_subtitle: 'Best quality products delivered to you',
    about_enabled: true,
    about_title: 'About Us',
    about_description: 'Welcome to our official store! Browse our verified catalog and place orders directly on WhatsApp.',
    contact_show_phone: true,
    contact_show_email: true,
    contact_show_address: true,
    contact_show_map: true,
  });

  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [galleryCaption, setGalleryCaption] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');

  const notify = (msg: string) => {
    setSnackbarMsg(msg);
    setShowSnackbar(true);
    setTimeout(() => setShowSnackbar(false), 3000);
  };

  const mid = merchant?.id || '';

  useEffect(() => {
    async function loadData() {
      if (mid) {
        const cached = await getCache<any>(`ak_cache_website_${mid}`);
        if (cached?.website) {
          setWebsite(cached.website);
          if (cached.gallery) setGallery(cached.gallery);
          setLoading(false);
        }
      }
      const cachedInv = await getCache<any[]>('merchant_inventory');
      if (cachedInv) setInventory(cachedInv);
      if (!token) return;
      try {
        setLoading(true);
        const res = await api.get('/api/merchant/website', { token });
        if (res && res.website) {
          setWebsite(res.website);
          if (res.gallery) setGallery(res.gallery);
          if (mid) await setCache(`ak_cache_website_${mid}`, res);
        }
      } catch (err: any) {
      } finally {
        setLoading(false);
      }
      try {
        setLoadingInventory(true);
        const invRes = await api.get('/api/merchant/inventory', { token });
        if (invRes && invRes.items) {
          setInventory(invRes.items);
          await setCache('merchant_inventory', invRes.items);
        }
      } catch (err) {
      } finally {
        setLoadingInventory(false);
      }
    }
    loadData();
  }, [mid, token]);

  const handleSave = async (patch: Partial<WebsiteConfig>) => {
    if (!token) return;
    try {
      setSaving(true);
      const res = await api.patch('/api/merchant/website', patch, { token });
      if (res && res.website) {
        setWebsite(res.website);
        if (res.gallery) setGallery(res.gallery);
        if (mid) await setCache(`ak_cache_website_${mid}`, res);
      }
      notify('Website configuration saved successfully! 🌐');
    } catch (err: any) {
      notify(err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!token) return;
    try {
      setPublishing(true);
      const endpoint = website.status === 'published' ? '/api/merchant/website/unpublish' : '/api/merchant/website/publish';
      const res = await api.post(endpoint, {}, { token });
      if (res && res.website) {
        setWebsite(res.website);
        if (mid) await setCache(`ak_cache_website_${mid}`, { website: res.website, gallery });
        notify(website.status === 'published' ? 'Website unpublished.' : '🎉 Website published!');
      }
    } catch (err: any) {
      notify(err.message || 'Failed to update publish state.');
    } finally {
      setPublishing(false);
    }
  };

  const pickAndUploadImage = async (imageType: 'hero' | 'about' | 'gallery') => {
    if (!token) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, quality: 0.7, base64: true,
      });
      if (result.canceled || !result.assets) return;
      const asset = result.assets[0];
      const base64Data = asset.base64 ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` : asset.uri;
      setUploadingImage(true);
      const res = await api.post('/api/merchant/website/upload-image', { imageType, dataUrl: base64Data, caption: galleryCaption }, { token });
      if (res && res.imageUrl) {
        if (imageType === 'hero') setWebsite((prev) => ({ ...prev, hero_image_url: res.imageUrl }));
        else if (imageType === 'about') setWebsite((prev) => ({ ...prev, about_image_url: res.imageUrl }));
        else {
          const galRes = await api.get('/api/merchant/website/gallery', { token });
          if (galRes?.gallery) setGallery(galRes.gallery);
          setGalleryCaption('');
        }
        notify('Image updated!');
      }
    } catch (err: any) {
      notify('Image upload failed.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleToggleProductWebsite = async (item: any, isPublished: boolean) => {
    setInventory((prev) => prev.map((p) => p.id === item.id ? { ...p, isPublished, is_published: isPublished } : p));
    if (token) await api.put(`/api/merchant/inventory/${item.id}`, { isPublished }, { token });
  };

  const handleToggleProductFeatured = async (item: any, isFeatured: boolean) => {
    setInventory((prev) => prev.map((p) => p.id === item.id ? { ...p, featured: isFeatured } : p));
    if (token) await api.put(`/api/merchant/inventory/${item.id}`, { featured: isFeatured }, { token });
  };

  const handleDeleteGalleryImage = (imageId: string) => {
    Alert.alert('Delete', 'Delete this photo?', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          await api.delete(`/api/merchant/website/gallery/${imageId}`, { token });
          setGallery((prev) => prev.filter((g) => g.id !== imageId));
      }}
    ]);
  };

  const formatPublishedDate = (timestamp?: number | null) => {
    if (!timestamp) return '23/08/2026';
    const d = new Date(timestamp);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const liveStoreUrl = `https://gst.ak-logicai.in/store/${website.slug}`;
  const websiteDisplayName =
    merchant?.tradeName ||
    merchant?.shopName ||
    (merchant as any)?.brandName ||
    merchant?.legalName ||
    website.slug;
  const activeProductsCount = inventory.filter((p) => p.isPublished !== false).length;

  const tabs: { id: WebTab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: 'globe-outline' },
    { id: 'design', label: 'Design', icon: 'color-palette-outline' },
    { id: 'sections', label: 'Sections', icon: 'layers-outline' },
    { id: 'products', label: 'Products', icon: 'cube-outline' },
    { id: 'settings', label: 'Settings', icon: 'settings-outline' },
    { id: 'gallery', label: 'Gallery', icon: 'images-outline' },
  ];

  return (
    <View style={st.container}>
      <TopAppBar title="Storefront Builder" onBack={() => navigation?.goBack?.()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <Card style={st.headerCard}>
          <View style={st.headerTopRow}>
            <View>
              <Text style={st.headerTitle}>Website Builder</Text>
              <Text style={st.headerStoreName}>{websiteDisplayName}</Text>
            </View>
            <View style={[st.statusBadge, website.status === 'published' ? st.statusPublished : st.statusDraft]}>
              <View style={[st.statusDot, { backgroundColor: website.status === 'published' ? Theme.success : Theme.onSurfaceDisabled }]} />
              <Text style={st.statusBadgeText}>{website.status === 'published' ? 'Live' : 'Draft'}</Text>
            </View>
          </View>
          <View style={st.metaGrid}>
            <View style={st.metaCol}>
              <Text style={st.metaLabel}>SLUG URL</Text>
              <Text style={st.metaValue}>/{website.slug}</Text>
            </View>
            <View style={st.metaCol}>
              <Text style={st.metaLabel}>STATUS</Text>
              <Text style={st.metaValue}>{website.status === 'published' ? 'Published' : 'Draft'}</Text>
            </View>
          </View>
          <Divider style={{ marginVertical: 14 }} />
          <View style={st.headerActionsRow}>
            <OutlineButton title="Open" icon="open-outline" size="sm" style={{ flex: 1 }} onPress={() => Linking.openURL(liveStoreUrl)} />
            <FilledButton title={publishing ? '...' : website.status === 'published' ? 'Unpublish' : 'Publish'} color={website.status === 'published' ? 'error' : 'primary'} size="sm" style={{ flex: 1.2 }} onPress={handleTogglePublish} />
          </View>
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.tabBar}>
          {tabs.map((t) => (
            <Pressable key={t.id} onPress={() => setActiveTab(t.id)} style={[st.tabItem, activeTab === t.id && st.tabItemActive]}>
              <Ionicons name={t.icon as any} size={15} color={activeTab === t.id ? Theme.primary : Theme.onSurfaceVariant} style={{ marginRight: 6 }} />
              <Text style={[st.tabText, activeTab === t.id && st.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* 1. OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <View style={{ gap: 14 }}>
            <View style={st.statsGrid}>
              <Card style={st.statBox}>
                <Text style={st.statBoxLabel}>WEBSITE STATUS</Text>
                <Text style={[st.statBoxVal, { color: website.status === 'published' ? Theme.success : Theme.warning }]}>
                  {website.status === 'published' ? 'Live' : 'Draft'}
                </Text>
                <Text style={st.statBoxSub}>
                  {website.published_at ? `Since ${formatPublishedDate(website.published_at)}` : 'Ready to publish'}
                </Text>
              </Card>

              <Card style={st.statBox}>
                <Text style={st.statBoxLabel}>ACTIVE PRODUCTS</Text>
                <Text style={[st.statBoxVal, { color: Theme.primary }]}>
                  {activeProductsCount} / {inventory.length}
                </Text>
                <Text style={st.statBoxSub}>Synced from Inventory</Text>
              </Card>

              <Card style={st.statBox}>
                <Text style={st.statBoxLabel}>THEME STYLE</Text>
                <Text style={st.statBoxVal}>{(website.theme_style || 'modern').toUpperCase()}</Text>
                <Text style={st.statBoxSub} numberOfLines={1}>{website.theme_primary_color}</Text>
              </Card>
            </View>

            {/* Quick Action Ready Banner */}
            <Card style={st.readyBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <View style={st.readyIcon}>
                  <Ionicons name="sparkles" size={18} color={Theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.readyTitle}>Your Public Store is Ready</Text>
                  <Text style={st.readySub}>
                    Customers can visit your store URL, browse verified products, and order via WhatsApp.
                  </Text>
                </View>
              </View>

              <View style={st.liveUrlBox}>
                <Text style={st.liveUrlText} numberOfLines={1}>{liveStoreUrl}</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <OutlineButton
                  title="Open Store"
                  icon="open-outline"
                  size="sm"
                  style={{ flex: 1 }}
                  onPress={() => Linking.openURL(liveStoreUrl)}
                />
                <GradientButton
                  title="Customize Design"
                  icon="color-palette-outline"
                  size="sm"
                  style={{ flex: 1.2 }}
                  onPress={() => setActiveTab('design')}
                />
              </View>
            </Card>
          </View>
        )}

        {/* 2. DESIGN & THEME TAB */}
        {activeTab === 'design' && (
          <Card style={st.sectionCard}>
            <View style={st.sectionHead}>
              <Ionicons name="color-palette-outline" size={20} color={Theme.primary} />
              <Text style={st.sectionTitle}>Theme & Color Palette</Text>
            </View>

            <Text style={st.subHeading}>COLOR PRESETS</Text>
            <View style={st.paletteGrid}>
              {PRESET_PALETTES.map((preset) => {
                const isSelected = website.theme_primary_color === preset.primary;
                return (
                  <Pressable
                    key={preset.name}
                    style={[st.paletteCard, isSelected && st.paletteCardSelected]}
                    onPress={() => handleSave({ theme_primary_color: preset.primary, theme_secondary_color: preset.secondary })}
                  >
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                      <View style={[st.colorCircle, { backgroundColor: preset.primary }]} />
                      <View style={[st.colorCircle, { backgroundColor: preset.secondary }]} />
                    </View>
                    <Text style={st.paletteName} numberOfLines={1}>{preset.name}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Divider style={{ marginVertical: 16 }} />

            <Text style={st.subHeading}>CUSTOM HEX COLORS</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={st.inputMiniLabel}>Primary Color</Text>
                <View style={st.colorInputRow}>
                  <View style={[st.colorPreviewSquare, { backgroundColor: website.theme_primary_color || '#4F46E5' }]} />
                  <TextInput
                    style={st.colorTextInput}
                    value={website.theme_primary_color}
                    onChangeText={(t) => setWebsite((w) => ({ ...w, theme_primary_color: t }))}
                    placeholder="#4F46E5"
                    placeholderTextColor={Theme.onSurfaceDisabled}
                  />
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={st.inputMiniLabel}>Secondary Color</Text>
                <View style={st.colorInputRow}>
                  <View style={[st.colorPreviewSquare, { backgroundColor: website.theme_secondary_color || '#10B981' }]} />
                  <TextInput
                    style={st.colorTextInput}
                    value={website.theme_secondary_color}
                    onChangeText={(t) => setWebsite((w) => ({ ...w, theme_secondary_color: t }))}
                    placeholder="#10B981"
                    placeholderTextColor={Theme.onSurfaceDisabled}
                  />
                </View>
              </View>
            </View>

            <Divider style={{ marginVertical: 16 }} />

            <Text style={st.subHeading}>FONT FAMILY</Text>
            <View style={st.fontGrid}>
              {FONTS.map((font) => (
                <Pressable
                  key={font}
                  style={[st.fontPill, website.theme_font === font && st.fontPillActive]}
                  onPress={() => setWebsite((w) => ({ ...w, theme_font: font }))}
                >
                  <Text style={[st.fontText, website.theme_font === font && st.fontTextActive]}>{font}</Text>
                </Pressable>
              ))}
            </View>

            <Divider style={{ marginVertical: 16 }} />

            <Text style={st.subHeading}>STOREFRONT LAYOUT STYLE</Text>
            <View style={{ gap: 8 }}>
              {[
                { id: 'modern', label: 'Modern', sub: 'Dark glassmorphism with high-contrast accents' },
                { id: 'minimal', label: 'Minimal', sub: 'Clean, spacious and focused on photography' },
                { id: 'classic', label: 'Classic', sub: 'Traditional retail catalog layout' },
              ].map((style) => (
                <Pressable
                  key={style.id}
                  style={[st.styleOptionCard, website.theme_style === style.id && st.styleOptionSelected]}
                  onPress={() => setWebsite((w) => ({ ...w, theme_style: style.id as any }))}
                >
                  <Ionicons
                    name={website.theme_style === style.id ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={website.theme_style === style.id ? Theme.primary : Theme.onSurfaceDisabled}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={st.styleOptionTitle}>{style.label}</Text>
                    <Text style={st.styleOptionSub}>{style.sub}</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <GradientButton
              title={saving ? 'Saving...' : 'Save Design Settings'}
              icon="save-outline"
              style={{ marginTop: 20 }}
              disabled={saving}
              onPress={() => handleSave({
                theme_primary_color: website.theme_primary_color,
                theme_secondary_color: website.theme_secondary_color,
                theme_font: website.theme_font,
                theme_style: website.theme_style,
              })}
            />
          </Card>
        )}

        {/* 3. SECTIONS & PAGES TAB */}
        {activeTab === 'sections' && (
          <View style={{ gap: 14 }}>
            {/* Hero Section */}
            <Card style={st.sectionCard}>
              <View style={st.sectionHeadBetween}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="sparkles" size={18} color={Theme.tertiary} />
                  <Text style={st.sectionTitle}>Hero Banner Section</Text>
                </View>
                <Switch
                  value={website.hero_enabled}
                  onValueChange={(val) => setWebsite((w) => ({ ...w, hero_enabled: val }))}
                  trackColor={{ false: Theme.surface4, true: Theme.primary }}
                  thumbColor="#fff"
                />
              </View>

              {website.hero_enabled && (
                <View style={{ gap: 10, marginTop: 12 }}>
                  <View>
                    <Text style={st.inputMiniLabel}>Hero Headline</Text>
                    <TextInput
                      style={st.textInput}
                      value={website.hero_title}
                      onChangeText={(t) => setWebsite((w) => ({ ...w, hero_title: t }))}
                      placeholder="Welcome to our store"
                      placeholderTextColor={Theme.onSurfaceDisabled}
                    />
                  </View>

                  <View>
                    <Text style={st.inputMiniLabel}>Hero Subtitle</Text>
                    <TextInput
                      style={st.textInput}
                      value={website.hero_subtitle}
                      onChangeText={(t) => setWebsite((w) => ({ ...w, hero_subtitle: t }))}
                      placeholder="Best quality products delivered to you"
                      placeholderTextColor={Theme.onSurfaceDisabled}
                    />
                  </View>

                  <View>
                    <Text style={st.inputMiniLabel}>Banner Image</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                      {website.hero_image_url ? (
                        <Image source={{ uri: website.hero_image_url }} style={st.previewThumb} />
                      ) : (
                        <View style={st.previewPlaceholder}>
                          <Ionicons name="image-outline" size={24} color={Theme.onSurfaceDisabled} />
                        </View>
                      )}
                      <OutlineButton
                        title={uploadingImage ? 'Uploading...' : 'Upload Image'}
                        icon="cloud-upload-outline"
                        size="sm"
                        disabled={uploadingImage}
                        onPress={() => pickAndUploadImage('hero')}
                      />
                    </View>
                  </View>
                </View>
              )}
            </Card>

            {/* About Us Section */}
            <Card style={st.sectionCard}>
              <View style={st.sectionHeadBetween}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="information-circle-outline" size={18} color={Theme.primary} />
                  <Text style={st.sectionTitle}>About Us Section</Text>
                </View>
                <Switch
                  value={website.about_enabled}
                  onValueChange={(val) => setWebsite((w) => ({ ...w, about_enabled: val }))}
                  trackColor={{ false: Theme.surface4, true: Theme.primary }}
                  thumbColor="#fff"
                />
              </View>

              {website.about_enabled && (
                <View style={{ gap: 10, marginTop: 12 }}>
                  <View>
                    <Text style={st.inputMiniLabel}>Section Title</Text>
                    <TextInput
                      style={st.textInput}
                      value={website.about_title}
                      onChangeText={(t) => setWebsite((w) => ({ ...w, about_title: t }))}
                      placeholder="About Us"
                      placeholderTextColor={Theme.onSurfaceDisabled}
                    />
                  </View>

                  <View>
                    <Text style={st.inputMiniLabel}>About Description</Text>
                    <TextInput
                      style={[st.textInput, { height: 80, textAlignVertical: 'top' }]}
                      value={website.about_description}
                      onChangeText={(t) => setWebsite((w) => ({ ...w, about_description: t }))}
                      placeholder="Tell customers about your business..."
                      placeholderTextColor={Theme.onSurfaceDisabled}
                      multiline
                    />
                  </View>
                </View>
              )}
            </Card>

            {/* Contact Options */}
            <Card style={st.sectionCard}>
              <View style={st.sectionHead}>
                <Ionicons name="location-outline" size={18} color={Theme.error} />
                <Text style={st.sectionTitle}>Contact & Location Options</Text>
              </View>

              <View style={{ gap: 10, marginTop: 12 }}>
                <View style={st.switchRow}>
                  <Text style={st.switchLabel}>Show Phone ({merchant?.phone || 'Direct'})</Text>
                  <Switch
                    value={website.contact_show_phone}
                    onValueChange={(val) => setWebsite((w) => ({ ...w, contact_show_phone: val }))}
                    trackColor={{ false: Theme.surface4, true: Theme.primary }}
                    thumbColor="#fff"
                  />
                </View>

                <View style={st.switchRow}>
                  <Text style={st.switchLabel}>Show Email ({merchant?.email || 'Store Email'})</Text>
                  <Switch
                    value={website.contact_show_email}
                    onValueChange={(val) => setWebsite((w) => ({ ...w, contact_show_email: val }))}
                    trackColor={{ false: Theme.surface4, true: Theme.primary }}
                    thumbColor="#fff"
                  />
                </View>

                <View style={st.switchRow}>
                  <Text style={st.switchLabel}>Show Address ({merchant?.address || 'Store Location'})</Text>
                  <Switch
                    value={website.contact_show_address}
                    onValueChange={(val) => setWebsite((w) => ({ ...w, contact_show_address: val }))}
                    trackColor={{ false: Theme.surface4, true: Theme.primary }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            </Card>

            <GradientButton
              title={saving ? 'Saving...' : 'Save Section Settings'}
              icon="save-outline"
              disabled={saving}
              onPress={() => handleSave(website)}
            />
          </View>
        )}

        {/* 4. PRODUCTS CATALOG TAB */}
        {activeTab === 'products' && (
          <Card style={st.sectionCard}>
            <View style={st.sectionHead}>
              <Ionicons name="cube-outline" size={20} color={Theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={st.sectionTitle}>Website Products Visibility</Text>
                <Text style={st.sectionSub}>Directly synced with your Inventory as source of truth.</Text>
              </View>
            </View>

            <SearchBar
              value={productSearch}
              onChangeText={setProductSearch}
              placeholder="Search products..."
              style={{ marginVertical: 12 }}
            />

            {loadingInventory ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <ActivityIndicator color={Theme.primary} />
                <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 12, marginTop: 8 }}>Loading inventory catalog...</Text>
              </View>
            ) : inventory.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 13 }}>No products found in inventory.</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {inventory
                  .filter((it) => (it.product_name || it.name || '').toLowerCase().includes(productSearch.toLowerCase()))
                  .map((item) => {
                    const isPub = item.isPublished !== false && item.is_published !== false;
                    const isFeat = !!item.featured;
                    return (
                      <View key={item.id} style={st.productRow}>
                        <View style={st.productIcon}>
                          <Text style={{ fontSize: 16 }}>📦</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.productName} numberOfLines={1}>{item.product_name || item.name}</Text>
                          <Text style={st.productMeta}>
                            HSN: {item.hsn || '8528'} · ₹{item.selling_price || item.sellingPrice || item.rate || 0} · Stock: {item.stock_quantity ?? item.stock ?? 0}
                          </Text>
                        </View>

                        <Pressable
                          onPress={() => handleToggleProductFeatured(item, !isFeat)}
                          style={[st.featChip, isFeat && st.featChipActive]}
                        >
                          <Text style={[st.featChipText, isFeat && st.featChipTextActive]}>
                            {isFeat ? '★ Featured' : '☆ Normal'}
                          </Text>
                        </Pressable>

                        <Switch
                          value={isPub}
                          onValueChange={(val) => handleToggleProductWebsite(item, val)}
                          trackColor={{ false: Theme.surface4, true: Theme.primary }}
                          thumbColor="#fff"
                        />
                      </View>
                    );
                  })}
              </View>
            )}
          </Card>
        )}

        {/* 5. SETTINGS & SEO TAB */}
        {activeTab === 'settings' && (
          <View style={{ gap: 14 }}>
            <Card style={st.sectionCard}>
              <View style={st.sectionHead}>
                <Ionicons name="globe-outline" size={20} color={Theme.primary} />
                <Text style={st.sectionTitle}>Store URL & SEO Settings</Text>
              </View>

              <View style={{ gap: 12, marginTop: 12 }}>
                <View>
                  <Text style={st.inputMiniLabel}>Website URL Slug</Text>
                  <View style={st.slugBox}>
                    <Text style={st.slugPrefix}>gst.ak-logicai.in/store/</Text>
                    <TextInput
                      style={st.slugInput}
                      value={website.slug}
                      onChangeText={(t) => setWebsite((w) => ({ ...w, slug: t.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                      placeholder="myshop"
                      placeholderTextColor={Theme.onSurfaceDisabled}
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <View>
                  <Text style={st.inputMiniLabel}>Page SEO Title</Text>
                  <TextInput
                    style={st.textInput}
                    value={website.seo_title}
                    onChangeText={(t) => setWebsite((w) => ({ ...w, seo_title: t }))}
                    placeholder="Store Title for Search Engines"
                    placeholderTextColor={Theme.onSurfaceDisabled}
                  />
                </View>

                <View>
                  <Text style={st.inputMiniLabel}>Meta Description</Text>
                  <TextInput
                    style={[st.textInput, { height: 60, textAlignVertical: 'top' }]}
                    value={website.seo_description}
                    onChangeText={(t) => setWebsite((w) => ({ ...w, seo_description: t }))}
                    placeholder="Short description for Google search results..."
                    placeholderTextColor={Theme.onSurfaceDisabled}
                    multiline
                  />
                </View>
              </View>
            </Card>

            <Card style={st.sectionCard}>
              <View style={st.sectionHead}>
                <Ionicons name="share-social-outline" size={20} color={Theme.tertiary} />
                <Text style={st.sectionTitle}>Social & Direct Contact Links</Text>
              </View>

              <View style={{ gap: 12, marginTop: 12 }}>
                <View>
                  <Text style={st.inputMiniLabel}>WhatsApp Direct Order Number</Text>
                  <TextInput
                    style={st.textInput}
                    value={website.footer_whatsapp}
                    onChangeText={(t) => setWebsite((w) => ({ ...w, footer_whatsapp: t }))}
                    placeholder="+919876543210"
                    placeholderTextColor={Theme.onSurfaceDisabled}
                    keyboardType="phone-pad"
                  />
                </View>

                <View>
                  <Text style={st.inputMiniLabel}>Instagram Profile URL</Text>
                  <TextInput
                    style={st.textInput}
                    value={website.footer_instagram}
                    onChangeText={(t) => setWebsite((w) => ({ ...w, footer_instagram: t }))}
                    placeholder="https://instagram.com/yourshop"
                    placeholderTextColor={Theme.onSurfaceDisabled}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </Card>

            <Card style={st.sectionCard}>
              <View style={st.sectionHead}>
                <Ionicons name="link-outline" size={20} color={Theme.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={st.sectionTitle}>Custom Domain URL</Text>
                  <Text style={st.sectionSub}>Point your own domain (e.g. www.myshop.com) to your store.</Text>
                </View>
              </View>

              <View style={{ marginTop: 12 }}>
                <TextInput
                  style={[st.textInput, { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', color: Theme.primary }]}
                  value={website.custom_domain}
                  onChangeText={(t) => setWebsite((w) => ({ ...w, custom_domain: t.toLowerCase().trim() }))}
                  placeholder="www.mybrandstore.com"
                  placeholderTextColor={Theme.onSurfaceDisabled}
                  autoCapitalize="none"
                />
              </View>

              <View style={st.dnsGuideBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Ionicons name="information-circle" size={16} color="#38BDF8" />
                  <Text style={st.dnsGuideTitle}>DNS Configuration Guide:</Text>
                </View>
                <Text style={st.dnsGuideText}>In your Domain Registrar (GoDaddy, Hostinger), add a CNAME record:</Text>
                <View style={st.cnameSnippet}>
                  <Text style={st.cnameText}>Host: <Text style={{ color: Theme.success }}>@</Text> (or <Text style={{ color: Theme.success }}>www</Text>)  |  Target: <Text style={{ color: Theme.success }}>cname.aklogic.ai</Text></Text>
                </View>
              </View>
            </Card>

            <GradientButton
              title={saving ? 'Saving...' : 'Save Settings & SEO'}
              icon="save-outline"
              disabled={saving}
              onPress={() => handleSave(website)}
            />
          </View>
        )}

        {/* 6. GALLERY TAB */}
        {activeTab === 'gallery' && (
          <Card style={st.sectionCard}>
            <View style={st.sectionHead}>
              <Ionicons name="images-outline" size={20} color={Theme.primary} />
              <Text style={st.sectionTitle}>Store Gallery Photos</Text>
            </View>

            <View style={st.galleryUploadBox}>
              <TextInput
                style={[st.textInput, { flex: 1 }]}
                value={galleryCaption}
                onChangeText={setGalleryCaption}
                placeholder="Photo caption (optional)..."
                placeholderTextColor={Theme.onSurfaceDisabled}
              />
              <FilledButton
                title={uploadingImage ? '...' : 'Add Photo'}
                icon="cloud-upload-outline"
                size="sm"
                disabled={uploadingImage}
                onPress={() => pickAndUploadImage('gallery')}
              />
            </View>

            <View style={st.galleryGrid}>
              {gallery.map((img) => (
                <View key={img.id} style={st.galleryPhotoCard}>
                  <Image source={{ uri: img.image_url }} style={st.galleryPhoto} />
                  {img.caption ? (
                    <Text style={st.galleryPhotoCaption} numberOfLines={1}>{img.caption}</Text>
                  ) : null}
                  <Pressable
                    onPress={() => handleDeleteGalleryImage(img.id)}
                    style={st.galleryDeleteBtn}
                  >
                    <Ionicons name="trash-outline" size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}

              {gallery.length === 0 && (
                <View style={{ width: '100%', padding: 32, alignItems: 'center' }}>
                  <Ionicons name="images-outline" size={36} color={Theme.onSurfaceDisabled} />
                  <Text style={{ color: Theme.onSurfaceDisabled, fontSize: 12, marginTop: 8, textAlign: 'center' }}>
                    No gallery photos added yet. Upload photos to show off your shop or products.
                  </Text>
                </View>
              )}
            </View>
          </Card>
        )}
      </ScrollView>
      <Snackbar visible={showSnackbar} message={snackbarMsg} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.bg },
  headerCard: { padding: 16, backgroundColor: Theme.surface2, marginBottom: 14 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  headerTitle: { color: Theme.onSurface, fontSize: 18, fontWeight: '800' },
  headerStoreName: { color: Theme.onSurfaceVariant, fontSize: 13, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusPublished: { backgroundColor: 'rgba(16,185,129,0.15)' },
  statusDraft: { backgroundColor: Theme.surface3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  metaGrid: { flexDirection: 'row', gap: 12, marginTop: 12 },
  metaCol: { flex: 1 },
  metaLabel: { color: Theme.onSurfaceDisabled, fontSize: 9, fontWeight: '700' },
  metaValue: { color: Theme.onSurface, fontSize: 12, fontWeight: '600' },
  headerActionsRow: { flexDirection: 'row', gap: 8 },
  tabBar: { gap: 6, paddingBottom: 14 },
  tabItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: Theme.surface2, borderWidth: 1, borderColor: Theme.outlineVariant },
  tabItemActive: { backgroundColor: Theme.primaryContainer, borderColor: Theme.primary },
  tabText: { color: Theme.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: Theme.primary, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, padding: 12, backgroundColor: Theme.surface2 },
  statBoxLabel: { color: Theme.onSurfaceDisabled, fontSize: 9, fontWeight: '700' },
  statBoxVal: { color: Theme.onSurface, fontSize: 15, fontWeight: '800', marginTop: 4 },
  statBoxSub: { color: Theme.onSurfaceVariant, fontSize: 10, marginTop: 2 },
  readyBanner: { padding: 16, backgroundColor: Theme.surface2, borderWidth: 1, borderColor: 'rgba(0,212,170,0.3)' },
  readyIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Theme.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  readyTitle: { color: Theme.onSurface, fontSize: 15, fontWeight: '700' },
  readySub: { color: Theme.onSurfaceVariant, fontSize: 12, marginTop: 2 },
  liveUrlBox: { backgroundColor: Theme.surface3, padding: 10, borderRadius: 8, marginTop: 10 },
  liveUrlText: { color: Theme.primary, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: '600' },
  sectionCard: { padding: 16, backgroundColor: Theme.surface2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeadBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: Theme.onSurface, fontSize: 16, fontWeight: '700' },
  sectionSub: { color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 },
  subHeading: { color: Theme.onSurfaceDisabled, fontSize: 11, fontWeight: '700', marginBottom: 10 },
  inputMiniLabel: { color: Theme.onSurfaceVariant, fontSize: 11, fontWeight: '600', marginBottom: 6 },
  textInput: { backgroundColor: Theme.surface3, color: Theme.onSurface, borderRadius: Theme.shapeSm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, borderWidth: 1, borderColor: Theme.outlineVariant },
  paletteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paletteCard: { width: (SW - 64) / 2 - 4, padding: 10, borderRadius: 10, backgroundColor: Theme.surface3, borderWidth: 1, borderColor: Theme.outlineVariant },
  paletteCardSelected: { borderColor: Theme.primary, backgroundColor: Theme.primaryContainer },
  colorCircle: { width: 16, height: 16, borderRadius: 8 },
  paletteName: { color: Theme.onSurface, fontSize: 12, fontWeight: '600' },
  colorInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorPreviewSquare: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: Theme.outlineVariant },
  colorTextInput: { flex: 1, backgroundColor: Theme.surface3, color: Theme.onSurface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', borderWidth: 1, borderColor: Theme.outlineVariant },
  fontGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fontPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: Theme.surface3, borderWidth: 1, borderColor: Theme.outlineVariant },
  fontPillActive: { borderColor: Theme.primary, backgroundColor: Theme.primaryContainer },
  fontText: { color: Theme.onSurfaceVariant, fontSize: 12, fontWeight: '500' },
  fontTextActive: { color: Theme.primary, fontWeight: '700' },
  styleOptionCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, backgroundColor: Theme.surface3, borderWidth: 1, borderColor: Theme.outlineVariant },
  styleOptionSelected: { borderColor: Theme.primary, backgroundColor: Theme.primaryContainer },
  styleOptionTitle: { color: Theme.onSurface, fontSize: 13, fontWeight: '700' },
  styleOptionSub: { color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 },
  previewThumb: { width: 54, height: 44, borderRadius: 8 },
  previewPlaceholder: { width: 54, height: 44, borderRadius: 8, backgroundColor: Theme.surface3, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  switchLabel: { color: Theme.onSurface, fontSize: 12, fontWeight: '500' },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, backgroundColor: Theme.surface3, borderWidth: 1, borderColor: Theme.outlineVariant },
  productIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: Theme.surface4, alignItems: 'center', justifyContent: 'center' },
  productName: { color: Theme.onSurface, fontSize: 13, fontWeight: '700' },
  productMeta: { color: Theme.onSurfaceDisabled, fontSize: 11, marginTop: 2 },
  featChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: Theme.surface4 },
  featChipActive: { backgroundColor: 'rgba(245,158,11,0.2)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)' },
  featChipText: { color: Theme.onSurfaceDisabled, fontSize: 10, fontWeight: '600' },
  featChipTextActive: { color: Theme.warning, fontWeight: '700' },
  slugBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Theme.surface3, borderRadius: 8, borderWidth: 1, borderColor: Theme.outlineVariant },
  slugPrefix: { color: Theme.onSurfaceDisabled, fontSize: 11, paddingLeft: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  slugInput: { flex: 1, color: Theme.primary, paddingHorizontal: 6, paddingVertical: 8, fontSize: 12, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  dnsGuideBox: { backgroundColor: 'rgba(56,189,248,0.08)', borderRadius: 10, padding: 12, marginTop: 12, borderWidth: 1, borderColor: 'rgba(56,189,248,0.25)' },
  dnsGuideTitle: { color: '#38BDF8', fontSize: 12, fontWeight: '700' },
  dnsGuideText: { color: Theme.onSurfaceVariant, fontSize: 11, marginTop: 2 },
  cnameSnippet: { backgroundColor: Theme.surface4, borderRadius: 6, padding: 8, marginTop: 6, borderWidth: 1, borderColor: Theme.outlineVariant },
  cnameText: { color: Theme.onSurface, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  galleryUploadBox: { flexDirection: 'row', gap: 8, marginVertical: 14 },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  galleryPhotoCard: { width: (SW - 72) / 2, borderRadius: 10, overflow: 'hidden', backgroundColor: Theme.surface3, borderWidth: 1, borderColor: Theme.outlineVariant },
  galleryPhoto: { width: '100%', height: 110 },
  galleryPhotoCaption: { color: Theme.onSurfaceVariant, fontSize: 10, padding: 6 },
  galleryDeleteBtn: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(239,68,68,0.85)', alignItems: 'center', justifyContent: 'center' },
});
