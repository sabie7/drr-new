# server-parts — خريطة صيانة السيرفر

> **القاعدة:** الأجزاء مرتبة رقمياً وتُجمَّع بنفس الترتيب عبر `build-server.cjs`
> ⚠️ لا تعِد الترتيب — الترتيب جزء من السلوك (ترتيب تسجيل الـmiddleware والمسارات حرِج).

## البناء والنشر
```bash
npm run build:server        # يطبع VERSION_TOKEN ويولّد dist-server/server.<ver>.js + .map
```
ثم ارفع: `dist-server/server.<ver>.js` (+ `.map`) إلى `/dist-server/` وحدّث
`package.json → scripts.start` بالاسم الجديد، وأعد التشغيل **--hard إجبارياً**
(الدرس المستفاد: nodemon بعد الرفع غير موثوق).

## الأجزاء (16)
| # | الملف | المجال |
|---|-------|--------|
| 01 | boot-deps-sanitizers | الاستيرادات، rate-limit، التعقيم، وسائط الأمان |
| 02 | http-static-cp-routes | صفحات الواجهة، robots/sitemap، مسارات اللوحة، الملفات الثابتة |
| 03 | stores-bans-global-limits | مخازن الذاكرة (جدار/قصص/زاجل)، الحظر البيئي، حدود الرسائل |
| 04 | rooms-presence-perms | مشرفو الغرف، الكتم، الفلاتر، الصلاحيات |
| 05 | gates-public-user | بوابات الإعجابات، publicUser |
| 06 | seo-appearance-features-tickers | إعدادات SEO/المظهر/الميزات/الشرائط |
| 07 | settings-badges-login | الأوسمة، سلوك الدخول |
| 08 | jsonld-seo-html-auth-helpers | JSON-LD، حقن SEO بالـHTML، التوكنات، حفظ الجدار/القصص، المايكات |
| 09 | auth-settings-rest | تسجيل/دخول/زائر، إعدادات GET العامة |
| 10 | cp-rest-legacy | نقاط اللوحة القديمة REST |
| 11 | private-threads-rooms-wall | الخاص، الغرف CRUD، جدار REST |
| 12 | users-media-uploads | إعدادات الأعضاء، ضغط الوسائط، كل رفع الملفات |
| 13 | stories-admin-visits-youtube | القصص كاملة، تغيير كلمة المرور، الزيارات، يوتيوب |
| 14 | admin-users-addons-rest | إدارة الأعضاء والأيقونات والهدايا REST |
| 15 | sockets-battle-music-pmcall-live | محرك السوكيت الضخم + المعارك + الموسيقى + مكالمات الخاص + البث |
| 16 | boot-final-listen | rehydrate + الإقلاع والاستماع |

⚠️ الجزء 15 ضخم (~3000 سطر) — مرشّح للتقسيم الداخلي لاحقاً عند أول إصلاح فيه.
