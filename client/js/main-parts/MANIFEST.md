# main-parts — خريطة صيانة كود الدردشة

> **القاعدة الذهبية:** الملفات مرتبة رقمياً وتُدمج بنفس الترتيب وقت البناء.
> ⚠️ **لا تعيد الترتيب ولا تغيّر الأرقام** — الترتيب جزء من السلوك.

## البناء والنشر
```bash
node build-chat.cjs          # يطبع VERSION_TOKEN
# ارفع الحزمة الجديدة ثم حدّث landing.js (?v= ورابط mainScript.src) و index.html
```
⚠️ عند أي تعديل: **ارفع دائماً رقم ?v= في landing.js** وإلا بقي المستخدمون على النسخة المخزنة شهراً كاملاً.

## الأجزاء
| # | الملف | المجال | أهم الدوال |
|---|-------|--------|------------|
| 01 | boot-imports | الاستيرادات، مفاتيح النسخ/اللصق، مزامنة الشاشة | togglePasswordVisibility, syncChatViewportHeight |
| 02 | dom-init-tasks | مهام إقلاع الصفحة | initDomContentLoadedTasks |
| 03 | sounds-effects | المؤثرات الصوتية والحركية | playEffectSound, renderAnimation |
| 04 | auth-api | التوكن ونداءات REST | getToken, apiFetch, getMeaningfulError |
| 05 | rooms-render | كروت الغرف والاختيار المضمّن | renderRoomCardHTML, renderInlineRoomSelection |
| 06 | music-admin-ads | بحث الموسيقى + شريط إعلانات الإدارة | handleMusicSearch, renderAdminAdsTicker |
| 07 | site-appearance | تطبيق ألوان وخطوط الموقع لحظياً | applySiteAppearance |
| 08 | reconnect-filter-permissions | شريط إعادة الاتصال، مراقب الفلتر، المتجاهلون، الصلاحيات | hasPermission, updateFilterMonitorVisibility |
| 09 | sidebar-core | تبويبات الشريط الجانبي وحالتها | openSidebarTab, toggleSidebar, closeSidebar |
| 10 | sidebar-members-search | بحث الأعضاء بالشريط | resetSidebarMemberSearch |
| 11 | sidebar-rooms | عرض الغرف بالشريط والإحصاء | renderRoomsInSidebar, findRoomData, loadRooms |
| 12 | room-form-events | أحداث إنشاء/تعديل الغرف | initializeRoomFormEvents |
| 13 | wall-render | رسم منشورات الجدار | renderPost, updateWallPostParts, getYoutubeId |
| 14 | wall-comments-timeago | التعليقات وتنسيق الوقت | renderComment, formatTimeAgo |
| 15 | users-render | بطاقات الأعضاء والحالات | renderUserObj, memberStateBadgeHtml, renderUsersInSidebar |
| 16 | honors-misc | نقاط الشرف ومتنوعات | formatWallHonorPoints |
| 17 | ui-for-user-login | ما بعد تسجيل الدخول (توجيه الغرف) | loginSuccess, completeChatLogin, loadLoginBehavior |
| 18 | text-shortcuts-placeholders | محرك الاختصارات والابتسامات | replaceShortcuts, replacePlaceholders |
| 19 | mentions | المنشن @ | setupMentions, replaceMentions |
| 20 | chat-send-room-ui | الإرسال، الرد، صلاحيات الكتابة | handleRealActivity, checkUserCanWriteInRoomChat |
| 21 | chat-ui-bots | واجهة الدردشة والبوتات | updateChatUI, initBotMessaging, toggleEmojiPicker(جزئي) |
| 22 | emoji-picker | منتقي الابتسامات (يتطلب type في البيانات) | loadEmojiPickerContent, insertEmojiShortcut |
| 23 | bubbles-welcome-presence | فقاعات التفاعل والترحيب اللقطي | createStarBubble, createAutomaticWelcomeElement |
| 24 | message-elements | بناء عناصر الرسائل (هنا replaceShortcuts للنص) | createMessageElement, createSystemMessageElement |
| 25 | message-batch-users-list | الدفعات، حد 50 رسالة، مزامنة القوائم | appendMessage, schedulePublicMessageRender, updateUsersList |
| 26 | user-visuals-profile-modal | حضور الأعضاء ونافذة الملف | updateUserVisuals, renderChangePasswordView |
| 27 | effects-copy-zajel | تأثيرات، حماية النسخ، شريط الزاجل | canCurrentUserSendEffects, renderZajelTicker, handleCopyBlock |
| 28 | quick-chat-final | الدردشة السريعة + الخواتم | requestQuickChatHistory, handleQuickChatUpload |

## وصفات حل مشاكل شائعة
- «الابتسامة لا تظهر في المنتقي» → تحقق أن العنصر فيه `type:'smiley'` (22)
- «الاختصار لا يتحول لصورة في الرسائل» → مسار العرض في (24) يجب أن يستدعي `replaceShortcuts`
- «إعداد من اللوحة لا يُطبَّق لحظياً» → هل للحدث مستمع قرب (01) نهاية؟ ابحث في gap-scan
- «زر التحديث الشامل» → حدث `reload_site` (مستمع في نهاية 01)
