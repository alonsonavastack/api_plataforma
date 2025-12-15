(async ()=>{
  try{
    const m = await import('./controllers/SaleController.js');
    console.log('process_existing_sales exists:', !!m.default.process_existing_sales, 'type:', typeof m.default.process_existing_sales);
    console.log('recent_notifications exists:', !!m.default.recent_notifications, 'type:', typeof m.default.recent_notifications);
    console.log('mark_notifications_read exists:', !!m.default.mark_notifications_read, 'type:', typeof m.default.mark_notifications_read);
  }catch(e){ console.error(e.stack); process.exit(1); }
})();