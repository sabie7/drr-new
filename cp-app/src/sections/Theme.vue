// CP Theme Section — colors + fonts, all controllable from the panel
// Vue component for the CP app

export default {
  name: 'ThemeSection',
  data() {
    return {
      form: {
        mainUiColor: '#4f46e5',
        landingBgColor: '#f1f5f9',
        chatInputBg: '#ffffff',
        unifiedBtnBg: '#4f46e5',
        unifiedBtnHoverBg: '#4338ca',
        micIconColor: '#4f46e5',
        micBtnBgColor: '#e2e8f0',
        lineIconColor: '#f59e0b',
        fontFamily: "'Tajawal', sans-serif",
        fontSize: '15',
        fontWeight: '700',
        siteName: 'دردشة كاز | Kaz Alwadi Chat'
      },
      saving: false,
      saved: false
    };
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      try {
        const r = await fetch('/api/settings/theme');
        if (r.ok) Object.assign(this.form, await r.json());
      } catch (e) {}
    },
    async save() {
      this.saving = true;
      try {
        const r = await fetch('/api/settings/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.form)
        });
        if (r.ok) { this.saved = true; setTimeout(() => this.saved = false, 2000); }
      } catch (e) {}
      this.saving = false;
    }
  },
  template: `
    <div class="cp-theme-section">
      <h5 class="mb-3">🎨 الثيم والألوان</h5>
      <div class="row g-3">
        <div class="col-md-4"><label class="form-label">لون الواجهة الرئيسي</label><input type="color" v-model="form.mainUiColor" class="form-control form-control-color w-100"></div>
        <div class="col-md-4"><label class="form-label">خلفية صفحة الدخول</label><input type="color" v-model="form.landingBgColor" class="form-control form-control-color w-100"></div>
        <div class="col-md-4"><label class="form-label">خلفية صندوق الكتابة</label><input type="color" v-model="form.chatInputBg" class="form-control form-control-color w-100"></div>
        <div class="col-md-4"><label class="form-label">لون الأزرار</label><input type="color" v-model="form.unifiedBtnBg" class="form-control form-control-color w-100"></div>
        <div class="col-md-4"><label class="form-label">لون الأزرار (تمرير)</label><input type="color" v-model="form.unifiedBtnHoverBg" class="form-control form-control-color w-100"></div>
        <div class="col-md-4"><label class="form-label">لون أيقونة المايك</label><input type="color" v-model="form.micIconColor" class="form-control form-control-color w-100"></div>
        <div class="col-md-4"><label class="form-label">خلفية زر المايك</label><input type="color" v-model="form.micBtnBgColor" class="form-control form-control-color w-100"></div>
        <div class="col-md-4"><label class="form-label">لون الأيقونات الثانوية</label><input type="color" v-model="form.lineIconColor" class="form-control form-control-color w-100"></div>
        <div class="col-md-4"><label class="form-label">اسم الموقع</label><input type="text" v-model="form.siteName" class="form-control"></div>
        <div class="col-md-4">
          <label class="form-label">الخط</label>
          <select v-model="form.fontFamily" class="form-select">
            <option value="'Tajawal', sans-serif">Tajawal</option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="'Segoe UI', sans-serif">Segoe UI</option>
            <option value="'Cairo', sans-serif">Cairo</option>
            <option value="Tahoma, sans-serif">Tahoma</option>
          </select>
        </div>
        <div class="col-md-2"><label class="form-label">حجم الخط</label><input type="number" v-model="form.fontSize" class="form-control" min="10" max="24"></div>
        <div class="col-md-2">
          <label class="form-label">وزن الخط</label>
          <select v-model="form.fontWeight" class="form-select">
            <option value="400">عادي</option><option value="500">متوسط</option>
            <option value="700">عريض</option><option value="800">ثقيل</option>
          </select>
        </div>
      </div>
      <div class="mt-3 d-flex align-items-center gap-2">
        <button class="btn btn-primary" @click="save" :disabled="saving">{{ saving ? 'جاري الحفظ...' : 'حفظ الثيم' }}</button>
        <span v-if="saved" class="text-success">✓ تم الحفظ</span>
      </div>
      <div class="mt-3 p-3 rounded" :style="{ background: form.landingBgColor }">
        <div class="p-2 rounded" :style="{ background: form.mainUiColor, color: '#fff' }">معاينة: {{ form.siteName }}</div>
        <div class="mt-2 p-2 rounded" :style="{ background: form.chatInputBg, border: '1px solid #ccc' }">
          <span :style="{ color: form.micIconColor }">🎤</span>
          <span class="mx-2">اكتب رسالتك هنا...</span>
          <button class="btn btn-sm" :style="{ background: form.unifiedBtnBg, color: '#fff' }">إرسال</button>
        </div>
      </div>
    </div>
  `
};
