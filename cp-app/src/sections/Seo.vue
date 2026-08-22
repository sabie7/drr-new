<script setup>
import { reactive, watch } from 'vue';
import { Save, ExternalLink } from 'lucide-vue-next';
import { store, admin, refreshState } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';
import UField from '../components/UField.vue';
import UToggle from '../components/UToggle.vue';
import ImageTile from '../components/ImageTile.vue';

const f = reactive({
  siteName: '', siteTitle: '', siteDescription: '', siteKeywords: '',
  canonicalUrl: '', robotsMeta: 'index, follow', ogImage: '',
  twitterCard: 'summary_large_image', themeColor: '#794e4e',
  googleSiteVerification: '', sameAsText: '',
  enableSitemap: true, enableRobotsTxt: true, noindex: false
});

watch(() => store.seo, (s) => {
  s = s || {};
  f.siteName = s.siteName || ''; f.siteTitle = s.siteTitle || '';
  f.siteDescription = s.siteDescription || ''; f.siteKeywords = s.siteKeywords || '';
  f.canonicalUrl = s.canonicalUrl || ''; f.robotsMeta = s.robotsMeta || 'index, follow';
  f.ogImage = s.ogImage || ''; f.twitterCard = s.twitterCard || 'summary_large_image';
  f.themeColor = s.themeColor || '#794e4e'; f.googleSiteVerification = s.googleSiteVerification || '';
  f.sameAsText = (Array.isArray(s.sameAs) ? s.sameAs : []).join('\n');
  f.enableSitemap = s.enableSitemap !== false;
  f.enableRobotsTxt = s.enableRobotsTxt !== false;
  f.noindex = !!s.noindex;
}, { immediate: true, deep: true });

function save() {
  admin('save_seo', {
    siteName: f.siteName, siteTitle: f.siteTitle,
    siteDescription: f.siteDescription, siteKeywords: f.siteKeywords,
    canonicalUrl: f.canonicalUrl, robotsMeta: f.robotsMeta,
    ogImage: f.ogImage, twitterCard: f.twitterCard,
    themeColor: f.themeColor,
    enableSitemap: f.enableSitemap, enableRobotsTxt: f.enableRobotsTxt,
    noindex: f.noindex,
    googleSiteVerification: f.googleSiteVerification.trim(),
    sameAs: f.sameAsText.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
  });
}
</script>

<template>
  <div>
    <PageHead title="SEO وصور الموقع" sub="إعدادات محركات البحث المحدثة لجوجل، الفافيكون، البنر والصورة الافتراضية" @refresh="refreshState()" />

    <UCard title="الأساسيات (الأهم لجوجل)" class="mb-5">
      <p class="mb-4 text-[11px] text-ink-400">العنوان يظهر كأول سطر في نتائج جوجل (الأنسب: 50–60 حرفاً)، والوصف كسطر ثاني (الأنسب: 120–160 حرفاً).</p>
      <div class="grid gap-4 sm:grid-cols-2">
        <UField label="عنوان الصفحة H1 + جوجل (siteTitle)" hint="يظهر أيضاً كعنوان رئيسي في الصفحة الرئيسية">
          <input v-model="f.siteTitle" class="u-input">
        </UField>
        <UField label="اسم الموقع (siteName)" hint="اسم العلامة بدون كلمات إضافية">
          <input v-model="f.siteName" class="u-input">
        </UField>
      </div>
      <UField label="وصف الموقع (siteDescription) — Meta Description" class="mt-4 block">
        <textarea v-model="f.siteDescription" rows="3" maxlength="300" class="u-textarea"></textarea>
      </UField>
      <div class="mt-2 rounded-xl bg-brand-50/70 p-3 text-[11px] leading-relaxed text-brand-700" dir="rtl">
        معاينة نتيجة جوجل:
        <div class="mt-2 rounded-lg bg-white p-2.5 shadow-sm">
          <div class="text-[10px] text-emerald-700" dir="ltr">{{ f.canonicalUrl || 'https://drr-chat.bonto.run' }}</div>
          <div class="truncate text-sm font-bold text-blue-800">{{ f.siteTitle || 'عنوان الصفحة' }}</div>
          <div class="line-clamp-2 text-xs text-ink-500">{{ f.siteDescription || 'وصف الموقع سيظهر هنا كما سيراه المستخدم في نتائج البحث.' }}</div>
        </div>
      </div>
    </UCard>

    <UCard title="إعدادات متقدمة" class="mb-5">
      <div class="grid gap-4 sm:grid-cols-2">
        <UField label="الكلمات المفتاحية (siteKeywords)" hint="فاصلة بين كل كلمة — تأثيرها ضعيف اليوم لكنها مفيدة للسياق">
          <input v-model="f.siteKeywords" class="u-input">
        </UField>
        <UField label="الرابط الأساسي (canonicalUrl)" hint="يجب أن يطابق دومين الموقع الحقيقي">
          <input v-model="f.canonicalUrl" dir="ltr" placeholder="https://example.com" class="u-input">
        </UField>
        <UField label="توجيه الروبوتات (robotsMeta)">
          <select v-model="f.robotsMeta" class="u-select">
            <option value="index, follow">index, follow (فهرسة عادية)</option>
            <option value="noindex, follow">noindex, follow (لا تفهرس الصفحة)</option>
            <option value="index, nofollow">index, nofollow</option>
            <option value="noindex, nofollow">noindex, nofollow</option>
          </select>
        </UField>
        <UField label="صورة المشاركة og:image" hint="تظهر عند مشاركة الرابط في واتساب/تويتر — الأفضل 1200×630">
          <input v-model="f.ogImage" dir="ltr" placeholder="/uploads/site/..." class="u-input">
        </UField>
        <UField label="بطاقة تويتر (twitterCard)">
          <select v-model="f.twitterCard" class="u-select">
            <option value="summary">summary (مربعة صغيرة)</option>
            <option value="summary_large_image">summary_large_image (كبيرة — الأنسب)</option>
          </select>
        </UField>
        <UField label="لون المتصفح على الجوال (themeColor)">
          <input v-model="f.themeColor" type="color">
        </UField>
        <UField label="كود تحقق Google Search Console" hint="من Search Console اختر وسومة HTML ثم الصق الكود هنا فقط">
          <input v-model="f.googleSiteVerification" dir="ltr" placeholder="abc_XYZ123" class="u-input">
        </UField>
        <UField label="حسابات رسمية (sameAs) — رابط بكل سطر" hint="حسابات تويتر/انستغرام/يوتيوب الرسمية لتعزيز هوية الموقع في جوجل">
          <textarea v-model="f.sameAsText" rows="3" dir="ltr" class="u-textarea"></textarea>
        </UField>
      </div>
      <div class="mt-4 flex flex-wrap gap-6">
        <UToggle v-model="f.enableSitemap" label="تفعيل sitemap.xml" />
        <UToggle v-model="f.enableRobotsTxt" label="تفعيل robots.txt" />
        <UToggle v-model="f.noindex" label="منع الفهرسة مؤقتاً (صيانة)" />
      </div>
      <UBtn class="mt-5" :icon="Save" @click="save">حفظ SEO</UBtn>
    </UCard>

    <UCard title="صور الموقع" class="mb-5">
      <div class="grid grid-cols-3 gap-3">
        <ImageTile :src="store.seo.faviconUrl || ''" label="الفافيكون (256×256)" kind="favicon" />
        <ImageTile :src="store.seo.bannerUrl || ''" label="البنر" kind="banner" />
        <ImageTile :src="store.seo.defaultAvatarUrl || ''" label="الصورة الافتراضية للأعضاء" kind="pic" />
      </div>
    </UCard>

    <UCard title="أدوات جوجل">
      <div class="flex flex-wrap gap-2">
        <a href="/robots.txt" target="_blank"><UBtn variant="secondary" :icon="ExternalLink">فتح robots.txt</UBtn></a>
        <a href="/sitemap.xml" target="_blank"><UBtn variant="secondary" :icon="ExternalLink">فتح sitemap.xml</UBtn></a>
        <a href="https://search.google.com/test/rich-results?url=https://drr-chat.bonto.run" target="_blank"><UBtn variant="soft" :icon="ExternalLink">فحص النتائج الغنية</UBtn></a>
      </div>
      <p class="mt-3 text-[11px] text-ink-400">البيانات المنظمة (JSON-LD: WebSite + Organization + WebApplication) مفعّلة تلقائياً في صفحة الموقع وتُحدَّث من هذه الإعدادات.</p>
    </UCard>
  </div>
</template>
