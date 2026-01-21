import mongoose from 'mongoose';
import models from './models/index.js';

// dotenv removed, we will use --env-file=.env

async function debug() {
    try {
        const dbUrl = process.env.MONGO_URI;
        if (!dbUrl) throw new Error("MONGO_URI not defined in env");

        await mongoose.connect(dbUrl);
        console.log('✅ Connected to MongoDB');

        // Check Commission Settings
        const settings = await models.PlatformCommissionSettings.findOne();
        console.log('📊 Commission Settings:');
        console.log(settings);

        const couponCode = 'REF-ALO-0V5DH';
        console.log(`🔍 Searching for coupon: ${couponCode}`);

        const coupon = await models.Coupon.findOne({ code: couponCode });

        if (!coupon) {
            console.log('❌ Coupon not found!');
        } else {
            console.log('✅ Coupon found:');
            console.log(`   _id: ${coupon._id}`);
            console.log(`   code: ${coupon.code}`);
            console.log(`   instructor (ID): ${coupon.instructor}`);
            console.log(`   type: ${coupon.type}`);
        }

        // Search for instructor "alo" or similar
        // Based on logs: 694316f05c102f674cc5c2b3 name: 'alo'
        const instructorIdValues = ['694316f05c102f674cc5c2b3'];

        if (coupon) instructorIdValues.push(coupon.instructor);

        for (const id of instructorIdValues) {
            const user = await models.User.findById(id);
            if (user) {
                console.log(`👤 User found for ID ${id}:`);
                console.log(`   Name: ${user.name} ${user.surname}`);
                console.log(`   Rol: ${user.rol}`);
                console.log(`   Email: ${user.email}`);
            } else {
                console.log(`❌ User NOT found for ID ${id}`);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

debug();
