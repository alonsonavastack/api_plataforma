import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;

mongoose.connect(MONGO_URI).then(async () => {
    console.log('✅ Connected');
    
    // Using dynamic import or direct collection access
    const db = mongoose.connection.db;
    const settings = await db.collection('platform_commission_settings').findOne({});
    
    console.log('SETTINGS:', JSON.stringify(settings, null, 2));
    
    // Let's also fetch a recent referral earning to see its rate
    const recentEarning = await db.collection('instructor_earnings').find({ is_referral: true }).sort({_id: -1}).limit(1).toArray();
    console.log('RECENT REFERRAL EARNING:', JSON.stringify(recentEarning, null, 2));

    process.exit(0);
}).catch(console.error);
