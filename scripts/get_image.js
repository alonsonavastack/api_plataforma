import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Project from '../models/Project.js';
dotenv.config({ path: '../.env' });

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        const p = await Project.findById('69960bcd91d9cc32a911bc74').lean();
        console.log("PROJECT DATA:", JSON.stringify(p, null, 2));
        const image = p.imagen ? `https://api.devhubsharks.com/api/projects/imagen-project/${p.imagen}` : null;
        console.log("OG:IMAGE LINK:", image);
        process.exit(0);
    });
