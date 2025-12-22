import models from './models/index.js';
import TaxBreakdownService from './services/TaxBreakdownService.js';
import mongoose from 'mongoose';

// Mock models to avoid DB connection issues if not needed, or connect if possible.
// Since we imported models/index.js, it might try to connect. 
// We will just mock the arguments passed to calculateBreakdown.

async function verify() {
    console.log("🚀 Verifying Tax Calculations...");

    const sale = {
        _id: new mongoose.Types.ObjectId(),
    };

    const earning = {
        _id: new mongoose.Types.ObjectId(),
        instructor: new mongoose.Types.ObjectId(),
        sale_price: 110.00,
        gross_earning: 110.00 // This is not used in calculation as base, sale_price is.
    };

    // Mock DB create methods
    models.InstructorRetention.create = async (data) => {
        console.log("\n💾 [MOCK] Saving InstructorRetention:");
        console.log(JSON.stringify(data, null, 2));
        return data;
    };

    models.PlatformCommissionBreakdown.create = async (data) => {
        console.log("\n💾 [MOCK] Saving PlatformCommissionBreakdown:");
        console.log(JSON.stringify(data, null, 2));
        return data;
    };

    await TaxBreakdownService.calculateBreakdown(sale, earning);
}

verify();
