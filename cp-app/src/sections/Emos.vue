<script setup>
import { ref, computed } from 'vue';
import { Plus, X, Smile, Gift } from 'lucide-vue-next';
import { store, admin, toast, refreshState, ask } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';
import UField from '../components/UField.vue';
import ImageTile from '../components/ImageTile.vue';

const emShortcut = ref('');
const adType = ref('super_icon');
const adName = ref('');

const icons = computed(() => store.addons.filter(a => a.type !== 'gift'));
const gifts = computed(() => store.addons.filter(a => a.type === 'gift'));

function addEmoji() {
  const sc = emShortcut.value.trim();
  if (!sc) { toast('اكتب اختصار الابتسامة', 'err'); return; }
  if (!store.pendingEmojiUrl) { toast('ارفع صورة الابتسامة أولاً', 'err'); return; }
  admin('emo_item_add', { shortcut: sc, url: store.pendingEmojiUrl });
  store.pendingEmojiUrl = '';
  emShortcut.value = '';
}
function addAddon() {
  if (!store.pendingAddonUrl) { toast('ارفع صورة العنصر أولاً', 'err'); return; }
  admin('addon_add', { type: adType.value === 'gift' ? 'gift' : 'super_icon', name: adName.value.trim(), url: store.pendingAddonUrl });
  store.pendingAddonUrl = '';
  adName.value = '';
}
</script>

<template>
  <div>
    <PageHead title="الابتسامات والإهداءات" sub="ابتسامات الدردشة بالاختصارات، وأيقونات البنرات والهدايا — تُطبق على المتصلين فوراً" @refresh="admin('get_addons'); refreshState()" />

    <UCard :title="`الابتسامات (${store.emo.length})`" class="mb-5">
      <p class="mb-4 text-[11px] text-ink-400">عند كتابة الاختصار في الدردشة يتحول تلقائياً إلى الصورة. مثال: :) أو ه1</p>
      <div class="grid items-end gap-4 sm:grid-cols-3">
        <UField label="الاختصار (مثال: :) أو كلمة)">
          <input v-model="emShortcut" maxlength="12" placeholder="الاختصار" class="u-input" @keydown.enter="addEmoji">
        </UField>
        <ImageTile
          :src="store.pendingEmojiUrl || ''"
          label="صورة الابتسامة"
          kind="emoji"
        />
        <UBtn variant="success" :icon="Plus" @click="addEmoji">إضافة ابتسامة</UBtn>
      </div>
      <div class="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        <div v-for="e in store.emo" :key="e.shortcut + e.url" class="group relative flex flex-col items-center gap-1.5 rounded-xl border border-ink-200/70 bg-white p-2.5">
          <img :src="e.url" class="size-10 object-contain" alt="">
          <span class="max-w-full truncate text-[10px] font-bold text-ink-500" dir="ltr">{{ e.shortcut }}</span>
          <button
            class="absolute -top-1.5 -end-1.5 hidden size-5 place-items-center rounded-full bg-red-600 text-white shadow group-hover:grid"
            @click="ask(`حذف الابتسامة (${e.shortcut})؟`) && admin('emo_item_del', { shortcut: e.shortcut })"
          >
            <X :size="11" />
          </button>
        </div>
        <p v-if="!store.emo.length" class="col-span-full py-2 text-center text-xs text-ink-400"><Smile :size="14" class="me-1 inline" />لا ابتسامات بعد</p>
      </div>
    </UCard>

    <UCard :title="`بنرات وهدايا الأعضاء (${store.addons.length})`">
      <p class="mb-4 text-[11px] text-ink-400">الأيقونات الفائقة والهدايا التي يمنحها المشرفون من ملف العضو.</p>
      <div class="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UField label="النوع">
          <select v-model="adType" class="u-select">
            <option value="super_icon">أيقونة فائقة (بنر)</option>
            <option value="gift">هدية</option>
          </select>
        </UField>
        <UField label="الاسم"><input v-model="adName" maxlength="30" placeholder="اسم العنصر" class="u-input"></UField>
        <ImageTile
          :src="store.pendingAddonUrl || ''"
          label="صورة العنصر"
          :kind="adType === 'gift' ? 'addon_gift' : 'addon_icon'"
        />
        <UBtn variant="success" :icon="Plus" @click="addAddon">إضافة</UBtn>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h4 class="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-ink-600"><Gift :size="13" /> أيقونات فائقة ({{ icons.length }})</h4>
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
            <div v-for="a in icons" :key="a.url" class="group relative flex flex-col items-center gap-1.5 rounded-xl border border-ink-200/70 bg-white p-2.5">
              <img :src="a.url" class="size-10 object-contain" alt="">
              <span class="max-w-full truncate text-[10px] font-bold text-ink-500">{{ a.name }}</span>
              <button class="absolute -top-1.5 -end-1.5 hidden size-5 place-items-center rounded-full bg-red-600 text-white shadow group-hover:grid" @click="ask('حذف هذا العنصر نهائياً؟') && admin('addon_del', { url: a.url })">
                <X :size="11" />
              </button>
            </div>
          </div>
        </div>
        <div>
          <h4 class="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-ink-600"><Gift :size="13" /> هدايا ({{ gifts.length }})</h4>
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
            <div v-for="a in gifts" :key="a.url" class="group relative flex flex-col items-center gap-1.5 rounded-xl border border-ink-200/70 bg-white p-2.5">
              <img :src="a.url" class="size-10 object-contain" alt="">
              <span class="max-w-full truncate text-[10px] font-bold text-ink-500">{{ a.name }}</span>
              <button class="absolute -top-1.5 -end-1.5 hidden size-5 place-items-center rounded-full bg-red-600 text-white shadow group-hover:grid" @click="ask('حذف هذا العنصر نهائياً؟') && admin('addon_del', { url: a.url })">
                <X :size="11" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
