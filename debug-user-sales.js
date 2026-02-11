import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Configurar paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '.env') });

// Importar modelos (ajusta la ruta según tu estructura)
import models from './models/index.js';

async function debugUserSales() {
    try {
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            console.error('❌ MONGO_URI no definida');
            return;
        }

        console.log('🔌 Conectando a MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Conectado');

        const email = 'carlos.ruiz@example.com'; // Email del usuario reportado
        console.log(`🔍 Buscando usuario por email: ${email}`);

        let user = await models.User.findOne({ email: new RegExp(email, 'i') });

        if (!user) {
            console.log('⚠️ Usuario no encontrado por email exacto. Buscando por nombre "Ana belem"...');
            user = await models.User.findOne({ name: /Ana belem/i });
        }

        if (!user) {
            console.log('❌ Usuario no encontrado. Listando últimos 5 usuarios:');
            const lastUsers = await models.User.find().sort({ createdAt: -1 }).limit(5);
            lastUsers.forEach(u => console.log(` - ${u.name} ${u.surname} (${u.email})`));
            process.exit(0);
        }

        console.log(`👤 Usuario encontrado: ${user.name} ${user.surname} (${user._id})`);

        // Buscar ventas
        const sales = await models.Sale.find({ user: user._id });
        console.log(`📦 Ventas encontradas: ${sales.length}`);

        sales.forEach(sale => {
            console.log(`\n📄 Venta ID: ${sale._id}`);
            console.log(`   Estado: ${sale.status}`);
            console.log(`   Total: ${sale.total}`);
            console.log(`   Detalle:`);
            sale.detail.forEach((item, index) => {
                console.log(`     Item ${index + 1}:`);
                console.log(`       Tipo: ${item.product_type}`);
                console.log(`       Producto ID: ${item.product}`);
                console.log(`       Precio: ${item.price_unit}`);
            });
        });

        // Simular agregación del DashboardController
        console.log('\n📊 Simulando Agregación de Dashboard...');

        // Pipeline simplificado de listStudents
        const aggregation = await models.User.aggregate([
            { $match: { _id: user._id } },
            {
                $lookup: {
                    from: "sales",
                    let: { userId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$user", "$userId"] },
                                status: "Pagado",
                            }
                        },
                        { $unwind: "$detail" }
                    ],
                    as: "purchases"
                },
            },
            {
                $addFields: {
                    purchased_projects_count: {
                        $size: {
                            $filter: { input: "$purchases", as: "p", cond: { $eq: ["$p.detail.product_type", "project"] } }
                        }
                    }
                }
            },
            { $project: { name: 1, email: 1, purchased_projects_count: 1, purchases: 1 } }
        ]);

        if (aggregation.length > 0) {
            const result = aggregation[0];
            console.log(`   Count calculado por Backend: ${result.purchased_projects_count}`);
            console.log(`   Items considerados (purchases dump):`);
            result.purchases.forEach(p => {
                console.log(`     - ${p.detail.product_type} (${p.detail.product})`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Desconectado');
    }
}

debugUserSales();
