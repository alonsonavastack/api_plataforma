try {
    import('archiver').then(() => console.log('✅ Archiver loaded'));
    import('adm-zip').then(() => console.log('✅ Adm-Zip loaded'));
} catch (e) {
    console.error('❌ Error loading modules:', e);
}
