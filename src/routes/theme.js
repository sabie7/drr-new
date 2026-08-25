// Server: /api/settings/theme endpoint — public read, CP write
// Add this route in modern-server.js after the settings routes

// GET public theme (no auth needed)
app.get('/api/settings/theme', (req, res) => {
  try {
    const s = db.settings.find({})[0] || {};
    const theme = {
      mainUiColor: s.mainUiColor || '#4f46e5',
      landingBgColor: s.landingBgColor || '#f1f5f9',
      chatInputBg: s.chatInputBg || '#ffffff',
      unifiedBtnBg: s.unifiedBtnBg || '#4f46e5',
      unifiedBtnHoverBg: s.unifiedBtnHoverBg || '#4338ca',
      micIconColor: s.micIconColor || '#4f46e5',
      micBtnBgColor: s.micBtnBgColor || '#e2e8f0',
      lineIconColor: s.lineIconColor || '#f59e0b',
      fontFamily: s.fontFamily || "'Tajawal', sans-serif",
      fontSize: s.fontSize || '15',
      fontWeight: s.fontWeight || '700',
      siteName: s.siteweb?.name || 'دردشة كاز | Kaz Alwadi Chat'
    };
    res.json(theme);
  } catch (e) {
    res.status(500).json({ success: false, message: 'خطأ في جلب الثيم' });
  }
});

// POST update theme (admin only)
app.post('/api/settings/theme', requireAdmin, (req, res) => {
  try {
    const allowed = ['mainUiColor','landingBgColor','chatInputBg','unifiedBtnBg','unifiedBtnHoverBg','micIconColor','micBtnBgColor','lineIconColor','fontFamily','fontSize','fontWeight','siteName'];
    const upd = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) upd[k] = String(req.body[k]).slice(0, 200);
    }
    if (Object.keys(upd).length === 0) return res.status(400).json({ success: false, message: 'لا توجد تغييرات' });
    const s = db.settings.find({})[0];
    if (!s) return res.status(404).json({ success: false, message: 'الإعدادات غير موجودة' });
    db.settings.updateOne({ id: s.id }, { $set: upd });
    io.emit('theme-updated', upd);
    res.json({ success: true, updated: Object.keys(upd) });
  } catch (e) {
    res.status(500).json({ success: false, message: 'خطأ في حفظ الثيم' });
  }
});
