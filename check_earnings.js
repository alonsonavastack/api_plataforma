import mongoose from 'mongoose';
import InstructorEarnings from './models/InstructorEarnings.js';
import Sale from './models/Sale.js';

async function run() {
    try {
        await mongoose.connect('mongodb+srv://agendador:123Alonso123@cluster0.uyzbe.mongodb.net/cursos');

        console.log("Connected. Fetching recent earnings (last 3)...");
        const earnings = await InstructorEarnings.find()
            .sort({ createdAt: -1 })
            .limit(3)
            .lean();

        for (const e of earnings) {
            console.log("----");
            console.log("ID:", e._id);
            console.log("Status:", e.status);
            console.log("Instructor:", e.instructor);
            console.log("Instructor Earning:", e.instructor_earning);
            console.log("Plat Comm:", e.platform_commission_amount);
            console.log("Is Referral?", e.is_referral);
            console.log("Sale ID:", e.sale);
        }

        console.log("----");
        const sales = await Sale.find().sort({ createdAt: -1 }).limit(2).lean();
        for (const s of sales) {
            console.log("Sale ID:", s._id, s.n_transaccion, "Total:", s.total, "Ref:", s.is_referral, "Coupon:", s.coupon_code);
            console.log("Wallet:", s.wallet_amount, "Remaining:", s.remaining_amount);
        }

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

run();
