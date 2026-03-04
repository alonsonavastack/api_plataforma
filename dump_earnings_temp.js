import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.DB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log('Connected to DB');
        const db = mongoose.connection.db;
        const earnings = await db.collection('instructorearnings').find({}).sort({ createdAt: -1 }).limit(5).toArray();
        console.log(JSON.stringify(earnings, null, 2));
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
