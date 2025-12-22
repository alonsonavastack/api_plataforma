
import mongoose from 'mongoose';
import PlatformCommissionBreakdown from './models/PlatformCommissionBreakdown.js';

const MONGO_URI = 'mongodb+srv://agendador:123Alonso123@cluster0.uyzbe.mongodb.net/cursos';

const recalculateProfits = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const records = await PlatformCommissionBreakdown.find({});
        console.log(`Found ${records.length} records to verify/update...`);

        for (const record of records) {
            // Recalculate Logic logic from Service
            // platformOperatingProfit = platformShare - paypalSendCommission
            const oldProfit = record.platform_operating_profit;

            // Only subtract the SEND commission (approx $5.61) because the receive commission ($8.40)
            // was already deducted before the 50/50 split.
            const platformOperatingProfit = record.platform_share - record.paypal_send_commission;

            // Taxes
            const platformISR = platformOperatingProfit * 0.10;
            const platformIVA = platformOperatingProfit * 0.16;
            const platformNetProfit = platformOperatingProfit - (platformISR + platformIVA);

            // Update
            record.platform_operating_profit = platformOperatingProfit;
            record.platform_isr = platformISR;
            record.platform_iva = platformIVA;
            record.platform_net_profit = platformNetProfit;

            await record.save();
            console.log(`Updated Record ${record._id}: Profit went from ${oldProfit.toFixed(2)} to ${platformOperatingProfit.toFixed(2)}`);
        }

        console.log('🎉 All records updated successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

recalculateProfits();
