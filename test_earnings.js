import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function printEarnings() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const InstructorEarnings = (await import('./models/InstructorEarnings.js')).default;
        
        const earnings = await InstructorEarnings.find({
            status: { $in: ['available', 'pending'] }
        }).sort({ createdAt: -1 }).limit(3);
        
        for (const e of earnings) {
            console.log(`ID: ${e._id}, Earned At: ${e.earned_at}, Available At: ${e.available_at}, Status: ${e.status}, Referral: ${e.is_referral}`);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
printEarnings();
