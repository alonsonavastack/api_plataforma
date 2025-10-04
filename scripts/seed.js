import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import models from '../models/index.js';
import dotenv from 'dotenv';

dotenv.config();

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
        const deletePromises = Object.values(models).map(model => model.deleteMany());
        await Promise.all(deletePromises);
        // for (const modelName in models) {
        //     if (models.hasOwnProperty(modelName)) {
        //         await models[modelName].deleteMany();
        //     }
        // }
        console.log('¡Datos destruidos!');
    } catch (error) {
        console.error(`Error al limpiar los datos: ${error}`);
        process.exit(1);
    }
};

const getObjectId = (doc) => doc._id;

const seedUsers = async () => {
    console.log('Creando usuarios...');
    try {
        const adminPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
        const defaultPassword = await bcrypt.hash(process.env.DEFAULT_PASSWORD || 'user123', 10);
        
        return await models.User.insertMany([
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
    } catch (error) {
        console.error('Error al crear usuarios:', error);
        throw error;
    }
};

const seedCategories = async () => {
    console.log('Creando categorías...');
    try {
        return await models.Categorie.insertMany([
            { title: 'Desarrollo Web', imagen: 'web.jpg' },
            { title: 'Diseño UI/UX', imagen: 'uiux.jpg' },
            { title: 'Marketing Digital', imagen: 'marketing.jpg' },
        ]);
    } catch (error) {
        console.error('Error al crear categorías:', error);
        throw error;
    }
};

const seedCourses = async (users, categories) => {
    console.log('Creando cursos...');
    try {
        return await models.Course.insertMany([
            {
                title: 'Curso Completo de React y Next.js',
                slug: 'curso-completo-de-react-y-next-js',
                subtitle: 'De cero a experto con proyectos reales', // Corregido
                categorie: getObjectId(categories[0]), // Desarrollo Web
                user: getObjectId(users[1]), // Juan Perez
                price_mxn: 750,
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
                categorie: getObjectId(categories[1]), // Diseño UI/UX
                user: getObjectId(users[2]), // Maria Gomez
                price_mxn: 600,
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
    } catch (error) {
        console.error('Error al crear cursos:', error);
        throw error;
    }
};

const seedProjects = async (users, categories) => {
    console.log('Creando proyectos...');
    try {
        return await models.Project.insertMany([
            {
                title: 'Plantilla de E-commerce con MERN',
                subtitle: 'Solución completa para tu tienda online',
                categorie: getObjectId(categories[0]), // Desarrollo Web
                price_mxn: 950,
                price_usd: 50,
                description: 'Código fuente completo de una tienda en línea construida con MongoDB, Express, React y Node.js.',
                imagen: 'project-mern.jpg',
                state: 2, // Publico
                user: getObjectId(users[1]), // Juan Perez
            }
        ]);
    } catch (error) {
        console.error('Error al crear proyectos:', error);
        throw error;
    }
};

const seedCourseContent = async (course) => {
    console.log(`Creando contenido para el curso: ${course.title}`);
    try {
        const reactSection1 = await models.CourseSection.create({ title: 'Introducción a React', course: getObjectId(course) });
        await models.CourseClase.insertMany([
            { title: '¿Qué es React?', section: reactSection1._id, description: 'Conceptos básicos y filosofía de React.', time: 360 }, // 6 minutos
            { title: 'Componentes y Props', section: reactSection1._id, description: 'Entendiendo los bloques de construcción de React.', time: 600 }, // 10 minutos
        ]);

        const reactSection2 = await models.CourseSection.create({ title: 'Hooks Esenciales', course: getObjectId(course) });
        await models.CourseClase.insertMany([
            { title: 'useState y useEffect', section: reactSection2._id, description: 'Manejo del estado y efectos secundarios.', time: 900 }, // 15 minutos
        ]);
    } catch (error) {
        console.error(`Error al crear contenido para el curso ${course.title}:`, error);
        throw error;
    }
};

const seedDiscounts = async (courses, categories) => {
    console.log('Creando descuentos...');
    try {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        return await models.Discount.insertMany([
            {
                type_campaign: 1,
                type_discount: 1,
                discount: 20,
                start_date: today,
                end_date: nextWeek,
                type_segment: 1,
                courses: [getObjectId(courses[0])], // Curso de React
            },
            {
                type_campaign: 2,
                type_discount: 2,
                discount: 5,
                start_date: today,
                end_date: tomorrow,
                type_segment: 2,
                categories: [getObjectId(categories[1])], // Categoría UI/UX
            }
        ]);
    } catch (error) {
        console.error('Error al crear descuentos:', error);
        throw error;
    }
};

const seedCoupons = async (courses, projects) => {
    console.log('Creando cupones...');
    try {
        return await models.Coupon.insertMany([
            {
                code: 'BIENVENIDO25',
                type_discount: 1, // Porcentaje
                discount: 25,
                type_count: 1, // Ilimitado
                num_use: 0,
                type_coupon: 1, // Curso
                courses: [getObjectId(courses[0])] // Curso de React
            },
            {
                code: 'PROYECTO10',
                type_discount: 2, // Fijo
                discount: 10,
                type_count: 2, // Limitado
                num_use: 100,
                type_coupon: 3, // Proyecto
                projects: [getObjectId(projects[0])] // Proyecto MERN
            }
        ]);
    } catch (error) {
        console.error('Error al crear cupones:', error);
        throw error;
    }
};

const seedUserActivity = async (users, courses, projects) => {
    console.log('Simulando actividad de usuario...');
    try {
        const clientCarlos = users[3];
        const reactCourse = courses[0];
        const mernProject = projects[0];

        const saleForCarlos = await models.Sale.create({
            user: getObjectId(clientCarlos),
            method_payment: 'seeded_paypal',
            n_transaccion: 'seeded_transaction_id',
            currency_payment: 'USD',
            currency_total: 'USD',
            total: reactCourse.price_usd + mernProject.price_usd,
            price_dolar: 1.0,
        });

        const saleDetailCourse = await models.SaleDetail.create({
            sale: getObjectId(saleForCarlos),
            product_type: 'course',
            product: getObjectId(reactCourse),
            price_unit: reactCourse.price_usd,
            subtotal: reactCourse.price_usd,
            total: reactCourse.price_usd,
        });

        await models.SaleDetail.create({
            sale: getObjectId(saleForCarlos),
            product_type: 'project',
            product: getObjectId(mernProject),
            price_unit: mernProject.price_usd,
            subtotal: mernProject.price_usd,
            total: mernProject.price_usd,
        });

        await models.CourseStudent.create({ user: getObjectId(clientCarlos), course: getObjectId(reactCourse) });

        await models.Review.create({
            product_type: 'course',
            product: getObjectId(reactCourse),
            user: getObjectId(clientCarlos),
            sale_detail: getObjectId(saleDetailCourse),
            rating: 5,
            description: '¡Excelente curso! Muy bien explicado y con ejemplos prácticos. Lo recomiendo al 100%.',
        });
    } catch (error) {
        console.error('Error al simular actividad de usuario:', error);
        throw error;
    }
};

const seedData = async () => {
    try {
        // 1. Limpiar datos antiguos
        await clearData();

        // 2. Crear datos en secuencia
        const users = await seedUsers();
        const categories = await seedCategories();
        const courses = await seedCourses(users, categories);
        const projects = await seedProjects(users, categories);
        
        // 3. Crear contenido para cursos específicos
        await seedCourseContent(courses[0]); // Contenido para el curso de React

        // 4. Crear descuentos y cupones
        await seedDiscounts(courses, categories);
        await seedCoupons(courses, projects);

        // 5. Simular actividad de usuario
        await seedUserActivity(users, courses, projects);

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
