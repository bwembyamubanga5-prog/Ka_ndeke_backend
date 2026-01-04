// at top of file (after you create router)
router.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});
