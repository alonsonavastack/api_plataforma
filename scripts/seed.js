import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import models from '../models/index.js';

const dbUrl = process.env.MONGO_URI;

const connectDB = async () => {
    try {
        await mongoose.connect(dbUrl, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB Conectado para el Seeding...');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

const clearData = async () => {
    try {
        console.log('Limpiando la base de datos...');
        // El orden no importa para deleteMany
        for (const modelName in models) {
            if (models.hasOwnProperty(modelName)) {
                await models[modelName].deleteMany();
            }
        }
        console.log('¡Datos destruidos!');
    } catch (error) {
        console.error(`Error al limpiar los datos: ${error}`);
        process.exit(1);
    }
};

const seedData = async () => {
    try {
        // 1. Limpiar datos antiguos
        await clearData();

        // 2. Crear Usuarios
        console.log('Creando usuarios...');
        const adminPassword = await bcrypt.hash('admin123', 10);
        const defaultPassword = await bcrypt.hash('user123', 10);
        const users = await models.User.insertMany([
            { 
                name: 'Admin', 
                surname: 'Principal', 
                email: 'admin@example.com', 
                password: adminPassword, 
                rol: 'admin',
                profession: 'Administrador de Plataforma',
                description: 'Encargado de la gestión y mantenimiento de NeoCourse.'
            },
            { 
                name: 'Juan', 
                surname: 'Perez', 
                email: 'juan.perez@example.com', 
                password: defaultPassword, 
                rol: 'instructor', 
                profession: 'Desarrollador Full-Stack',
                description: 'Apasionado por enseñar tecnologías web modernas y crear soluciones escalables.'
            },
            { 
                name: 'Maria', 
                surname: 'Gomez', 
                email: 'maria.gomez@example.com', 
                password: defaultPassword, 
                rol: 'instructor', 
                profession: 'Diseñadora UI/UX',
                description: 'Experta en crear experiencias de usuario intuitivas y atractivas.'
            },
            { name: 'Carlos', surname: 'Ruiz', email: 'carlos.ruiz@example.com', password: defaultPassword, rol: 'cliente', profession: 'Estudiante de Ingeniería', description: 'Buscando expandir mis habilidades en desarrollo web.' },
            { name: 'Ana', surname: 'Martinez', email: 'ana.martinez@example.com', password: defaultPassword, rol: 'cliente', profession: 'Emprendedora', description: 'Aprendiendo a diseñar para mi nuevo proyecto.' },
        ]);
        const instructorJuan = users[1];
        const instructorMaria = users[2];
        const clientCarlos = users[3];

        // 3. Crear Categorías
        console.log('Creando categorías...');
        const categories = await models.Categorie.insertMany([
            { title: 'Desarrollo Web', imagen: 'web.jpg' },
            { title: 'Diseño UI/UX', imagen: 'uiux.jpg' },
            { title: 'Marketing Digital', imagen: 'marketing.jpg' },
        ]);
        const webCategory = categories[0];
        const uiuxCategory = categories[1];

        // 4. Crear Cursos
        console.log('Creando cursos...');
        const courses = await models.Course.insertMany([
            {
                title: 'Curso Completo de React y Next.js',
                slug: 'curso-completo-de-react-y-next-js',
                subtitle: 'De cero a experto con proyectos reales',
                categorie: webCategory._id,
                user: instructorJuan._id,
                price_soles: 150,
                price_usd: 40,
                description: 'Aprende a construir aplicaciones web modernas y potentes con React, Next.js, TailwindCSS y mucho más.',
                imagen: 'react-next.jpg',
                level: 'Intermedio',
                idioma: 'Español',
                state: 2, // Publico
                requirements: ['Conocimientos de HTML, CSS y JavaScript', 'Bases de programación'],
                who_is_it_for: ['Desarrolladores que quieren aprender React', 'Programadores buscando actualizar sus habilidades']
            },
            {
                title: 'Diseño de Interfaces con Figma',
                slug: 'diseno-de-interfaces-con-figma',
                subtitle: 'Crea prototipos interactivos y profesionales',
                categorie: uiuxCategory._id,
                user: instructorMaria._id,
                price_soles: 120,
                price_usd: 30,
                description: 'Domina la herramienta líder en diseño de interfaces y colaboración en equipo. Aprende a crear sistemas de diseño.',
                imagen: 'figma.jpg',
                level: 'Basico',
                idioma: 'Español',
                state: 2, // Publico
                requirements: ['No se requieren conocimientos previos', 'Tener una computadora con acceso a internet'],
                who_is_it_for: ['Cualquier persona interesada en el diseño UI/UX', 'Emprendedores que quieren diseñar su propio producto']
            },
        ]);
        const reactCourse = courses[0];

        // 5. Crear Proyectos
        console.log('Creando proyectos...');
        const projects = await models.Project.insertMany([
            {
                title: 'Plantilla de E-commerce con MERN',
                subtitle: 'Solución completa para tu tienda online',
                categorie: webCategory._id,
                price_soles: 200,
                price_usd: 50,
                description: 'Código fuente completo de una tienda en línea construida con MongoDB, Express, React y Node.js.',
                imagen: 'project-mern.jpg',
                state: 2, // Publico
            }
        ]);
        const mernProject = projects[0];

        // 6. Crear Secciones y Clases para el curso de React
        console.log('Creando secciones y clases para el curso de React...');
        const reactSection1 = await models.CourseSection.create({ title: 'Introducción a React', course: reactCourse._id });
        await models.CourseClase.insertMany([
            { title: '¿Qué es React?', section: reactSection1._id, description: 'Conceptos básicos y filosofía de React.', time: 360 }, // 6 minutos
            { title: 'Componentes y Props', section: reactSection1._id, description: 'Entendiendo los bloques de construcción de React.', time: 600 }, // 10 minutos
        ]);

        const reactSection2 = await models.CourseSection.create({ title: 'Hooks Esenciales', course: reactCourse._id });
        await models.CourseClase.insertMany([
            { title: 'useState y useEffect', section: reactSection2._id, description: 'Manejo del estado y efectos secundarios.', time: 900 }, // 15 minutos
        ]);

        // 7. Crear Descuentos
        console.log('Creando descuentos...');
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        await models.Discount.insertMany([
            {
                type_campaign: 1,
                type_discount: 1,
                discount: 20,
                start_date: today,
                end_date: nextWeek,
                start_date_num: today.getTime(),
                end_date_num: nextWeek.getTime(),
                type_segment: 1,
                courses: [reactCourse._id],
            },
            {
                type_campaign: 2,
                type_discount: 2,
                discount: 5,
                start_date: today,
                end_date: tomorrow,
                start_date_num: today.getTime(),
                end_date_num: tomorrow.getTime(),
                type_segment: 2,
                categories: [uiuxCategory._id],
            }
        ]);

        // 8. Crear Cupones
        console.log('Creando cupones...');
        await models.Coupon.insertMany([
            {
                code: 'BIENVENIDO25',
                type_discount: 1,
                discount: 25,
                type_count: 1,
                num_use: 0,
                type_coupon: 1,
                courses: [reactCourse._id]
            },
            {
                code: 'PROYECTO10',
                type_discount: 2,
                discount: 10,
                type_count: 2,
                num_use: 100,
                type_coupon: 3,
                projects: [mernProject._id]
            }
        ]);

        // 9. Simular Actividad de Usuario (Ventas y Reseñas)
        console.log('Simulando actividad de usuario...');

        const saleForCarlos = await models.Sale.create({
            user: clientCarlos._id,
            method_payment: 'seeded_paypal',
            n_transaccion: 'seeded_transaction_id',
            currency_payment: 'USD',
            currency_total: 'USD',
            total: reactCourse.price_usd + mernProject.price_usd,
            price_dolar: 1.0,
        });

        const saleDetailCourse = await models.SaleDetail.create({
            sale: saleForCarlos._id,
            product_type: 'course',
            product: reactCourse._id,
            price_unit: reactCourse.price_usd,
            subtotal: reactCourse.price_usd,
            total: reactCourse.price_usd,
        });

        await models.SaleDetail.create({
            sale: saleForCarlos._id,
            product_type: 'project',
            product: mernProject._id,
            price_unit: mernProject.price_usd,
            subtotal: mernProject.price_usd,
            total: mernProject.price_usd,
        });

        await models.CourseStudent.create({ user: clientCarlos._id, course: reactCourse._id });

        await models.Review.create({
            product_type: 'course',
            product: reactCourse._id,
            user: clientCarlos._id,
            sale_detail: saleDetailCourse._id,
            rating: 5,
            description: '¡Excelente curso! Muy bien explicado y con ejemplos prácticos. Lo recomiendo al 100%.',
        });

        console.log('¡Datos insertados correctamente!');
        process.exit();
    } catch (error) {
        console.error(`Error al insertar los datos: ${error}`);
        process.exit(1);
    }
};

const run = async () => {
    await connectDB();

    if (process.argv[2] === '--import') {
        await seedData();
    } else if (process.argv[2] === '--destroy') {
        await clearData();
        process.exit();
    } else {
        console.log('Por favor, usa --import para poblar la base de datos o --destroy para limpiarla.');
        process.exit();
    }
};

run();
