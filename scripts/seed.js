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
        console.log('✅ MongoDB Conectado para el Seeding...');
    } catch (err) {
        console.error('❌ Error de conexión:', err.message);
        process.exit(1);
    }
};

const clearData = async () => {
    try {
        console.log('🗑️  Limpiando la base de datos...');
        const deletePromises = Object.values(models).map(model => model.deleteMany());
        await Promise.all(deletePromises);
        console.log('✅ ¡Datos destruidos!');
    } catch (error) {
        console.error(`❌ Error al limpiar los datos: ${error}`);
        process.exit(1);
    }
};

const getObjectId = (doc) => doc._id;

const seedUsers = async () => {
    console.log('👥 Creando usuarios...');
    try {
        const adminPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
        const defaultPassword = await bcrypt.hash(process.env.DEFAULT_PASSWORD || 'user123', 10);
        
        const users = await models.User.insertMany([
            // ADMINISTRADORES
            { 
                name: 'Admin', 
                surname: 'Principal', 
                email: 'admin@example.com', 
                password: adminPassword, 
                rol: 'admin',
                profession: 'Administrador de Plataforma',
                description: 'Encargado de la gestión y mantenimiento de NeoCourse.',
                phone: '+52 55 1234 5678',
                state: 1
            },
            
            // INSTRUCTORES
            { 
                name: 'Juan Carlos', 
                surname: 'Pérez López', 
                email: 'juan.perez@example.com', 
                password: defaultPassword, 
                rol: 'instructor', 
                profession: 'Desarrollador Full-Stack Senior',
                description: 'Más de 8 años de experiencia en desarrollo web. Apasionado por enseñar tecnologías modernas como React, Node.js y Next.js.',
                phone: '+52 55 2345 6789',
                state: 1
            },
            { 
                name: 'María Elena', 
                surname: 'Gómez Martínez', 
                email: 'maria.gomez@example.com', 
                password: defaultPassword, 
                rol: 'instructor', 
                profession: 'Diseñadora UI/UX & Product Designer',
                description: 'Especialista en crear experiencias de usuario excepcionales. Certificada en Design Thinking y Accesibilidad Web.',
                phone: '+52 55 3456 7890',
                state: 1
            },
            { 
                name: 'Roberto', 
                surname: 'Sánchez García', 
                email: 'roberto.sanchez@example.com', 
                password: defaultPassword, 
                rol: 'instructor', 
                profession: 'Experto en Marketing Digital',
                description: 'Growth Hacker certificado con experiencia en SEO, SEM y Social Media.',
                phone: '+52 55 4567 8901',
                state: 1
            },
            { 
                name: 'Laura', 
                surname: 'Torres Ramírez', 
                email: 'laura.torres@example.com', 
                password: defaultPassword, 
                rol: 'instructor', 
                profession: 'Data Scientist & AI Specialist',
                description: 'PhD en Ciencias de la Computación. Experta en Machine Learning y análisis de datos.',
                phone: '+52 55 5678 9012',
                state: 1
            },
            
            // CLIENTES/ESTUDIANTES
            { 
                name: 'Carlos', 
                surname: 'Ruiz Hernández', 
                email: 'carlos.ruiz@example.com', 
                password: defaultPassword, 
                rol: 'cliente', 
                profession: 'Estudiante de Ingeniería en Sistemas',
                description: 'Buscando expandir mis habilidades en desarrollo web.',
                phone: '+52 55 6789 0123',
                state: 1
            },
            { 
                name: 'Ana Patricia', 
                surname: 'Martínez Silva', 
                email: 'ana.martinez@example.com', 
                password: defaultPassword, 
                rol: 'cliente', 
                profession: 'Emprendedora Digital',
                description: 'Aprendiendo diseño y desarrollo para mi startup.',
                phone: '+52 55 7890 1234',
                state: 1
            },
            { 
                name: 'Luis Fernando', 
                surname: 'González Díaz', 
                email: 'luis.gonzalez@example.com', 
                password: defaultPassword, 
                rol: 'cliente', 
                profession: 'Freelancer',
                description: 'Diseñador gráfico expandiendo habilidades en front-end.',
                phone: '+52 55 8901 2345',
                state: 1
            },
            { 
                name: 'Diana', 
                surname: 'Flores Morales', 
                email: 'diana.flores@example.com', 
                password: defaultPassword, 
                rol: 'cliente', 
                profession: 'Analista de Datos Junior',
                description: 'Mejorando habilidades en ciencia de datos.',
                phone: '+52 55 9012 3456',
                state: 1
            },
            { 
                name: 'Miguel Ángel', 
                surname: 'Castro Vargas', 
                email: 'miguel.castro@example.com', 
                password: defaultPassword, 
                rol: 'cliente', 
                profession: 'Desarrollador Backend',
                description: 'Aprendiendo tecnologías frontend modernas.',
                phone: '+52 55 0123 4567',
                state: 1
            },
        ]);
        
        console.log(`✅ ${users.length} usuarios creados`);
        return users;
    } catch (error) {
        console.error('❌ Error al crear usuarios:', error);
        throw error;
    }
};

const seedCategories = async () => {
    console.log('📂 Creando categorías...');
    try {
        const categories = await models.Categorie.insertMany([
            { title: 'Desarrollo Web', imagen: 'desarrollo-web.jpg', state: 1 },
            { title: 'Diseño UI/UX', imagen: 'diseno-uiux.jpg', state: 1 },
            { title: 'Marketing Digital', imagen: 'marketing-digital.jpg', state: 1 },
            { title: 'Ciencia de Datos', imagen: 'data-science.jpg', state: 1 },
            { title: 'Desarrollo Móvil', imagen: 'desarrollo-movil.jpg', state: 1 },
            { title: 'DevOps & Cloud', imagen: 'devops-cloud.jpg', state: 1 },
        ]);
        
        console.log(`✅ ${categories.length} categorías creadas`);
        return categories;
    } catch (error) {
        console.error('❌ Error al crear categorías:', error);
        throw error;
    }
};

const seedCourses = async (users, categories) => {
    console.log('📚 Creando cursos...');
    try {
        const courses = await models.Course.insertMany([
            {
                title: 'Curso Completo de React y Next.js',
                slug: 'curso-completo-de-react-y-next-js',
                subtitle: 'Domina React 18 y Next.js 14 con proyectos reales',
                categorie: getObjectId(categories[0]),
                user: getObjectId(users[1]),
                price_mxn: 899,
                price_usd: 49,
                description: 'Conviértete en un experto en React y Next.js. Este curso incluye Server Components, App Router, y 5 proyectos reales.',
                imagen: 'react-nextjs-completo.jpg',
                level: 'Intermedio',
                idioma: 'Español',
                state: 2,
                requirements: ['HTML, CSS y JavaScript básico', 'Node.js instalado'],
                who_is_it_for: ['Desarrolladores que quieren dominar React', 'Freelancers'],
                featured: true
            },
            {
                title: 'Node.js y Express: Backend Profesional',
                slug: 'nodejs-express-backend-profesional',
                subtitle: 'Construye APIs RESTful escalables',
                categorie: getObjectId(categories[0]),
                user: getObjectId(users[1]),
                price_mxn: 799,
                price_usd: 44,
                description: 'Aprende a crear backends robustos con Node.js, Express y MongoDB. Incluye JWT, testing y arquitectura.',
                imagen: 'nodejs-express-mongodb.jpg',
                level: 'Intermedio',
                idioma: 'Español',
                state: 2,
                requirements: ['JavaScript intermedio', 'APIs REST básicas'],
                who_is_it_for: ['Desarrolladores frontend', 'Estudiantes de ingeniería']
            },
            {
                title: 'Tailwind CSS: Diseño Moderno',
                slug: 'tailwind-css-diseno-moderno',
                subtitle: 'Crea interfaces hermosas con utility-first CSS',
                categorie: getObjectId(categories[0]),
                user: getObjectId(users[1]),
                price_mxn: 599,
                price_usd: 33,
                description: 'Domina Tailwind CSS y crea interfaces profesionales y responsive.',
                imagen: 'tailwind-css.jpg',
                level: 'Basico',
                idioma: 'Español',
                state: 2,
                requirements: ['HTML y CSS básico'],
                who_is_it_for: ['Desarrolladores', 'Diseñadores']
            },
            {
                title: 'Diseño UI/UX con Figma',
                slug: 'diseno-ui-ux-figma-completo',
                subtitle: 'Crea prototipos y sistemas de diseño',
                categorie: getObjectId(categories[1]),
                user: getObjectId(users[2]),
                price_mxn: 749,
                price_usd: 41,
                description: 'Aprende Figma desde cero y crea sistemas de diseño profesionales.',
                imagen: 'figma-uiux-completo.jpg',
                level: 'Basico',
                idioma: 'Español',
                state: 2,
                requirements: ['No se requieren conocimientos previos'],
                who_is_it_for: ['Aspirantes a diseñadores', 'Desarrolladores', 'Emprendedores'],
                featured: true
            },
            {
                title: 'Design System Escalables',
                slug: 'design-system-escalables',
                subtitle: 'Sistemas de diseño profesionales',
                categorie: getObjectId(categories[1]),
                user: getObjectId(users[2]),
                price_mxn: 899,
                price_usd: 49,
                description: 'Crea sistemas de diseño que escalan con tokens, componentes y documentación.',
                imagen: 'design-system.jpg',
                level: 'Avanzado',
                idioma: 'Español',
                state: 2,
                requirements: ['Experiencia con Figma', 'Diseño UI/UX'],
                who_is_it_for: ['Diseñadores con experiencia', 'Product Designers']
            },
            {
                title: 'Marketing Digital Completo',
                slug: 'marketing-digital-completo',
                subtitle: 'SEO, SEM y Social Media',
                categorie: getObjectId(categories[2]),
                user: getObjectId(users[3]),
                price_mxn: 849,
                price_usd: 46,
                description: 'Domina estrategias de marketing digital: SEO, Google Ads, Facebook Ads y analítica.',
                imagen: 'marketing-digital-completo.jpg',
                level: 'Intermedio',
                idioma: 'Español',
                state: 2,
                requirements: ['Marketing básico', 'Google Analytics'],
                who_is_it_for: ['Emprendedores', 'Community managers'],
                featured: true
            },
            {
                title: 'Python para Data Science',
                slug: 'python-data-science',
                subtitle: 'Análisis de datos con Pandas y NumPy',
                categorie: getObjectId(categories[3]),
                user: getObjectId(users[4]),
                price_mxn: 999,
                price_usd: 54,
                description: 'Aprende a analizar datos con Python, Pandas, NumPy y visualización.',
                imagen: 'python-data-science.jpg',
                level: 'Intermedio',
                idioma: 'Español',
                state: 2,
                requirements: ['Python básico', 'Estadística básica'],
                who_is_it_for: ['Aspirantes a Data Scientists', 'Analistas'],
                featured: true
            },
            {
                title: 'Machine Learning con Python',
                slug: 'machine-learning-python',
                subtitle: 'De teoría a producción',
                categorie: getObjectId(categories[3]),
                user: getObjectId(users[4]),
                price_mxn: 1199,
                price_usd: 65,
                description: 'Domina Machine Learning desde fundamentos hasta despliegue en producción.',
                imagen: 'machine-learning-python.jpg',
                level: 'Avanzado',
                idioma: 'Español',
                state: 2,
                requirements: ['Python intermedio', 'Matemáticas básicas'],
                who_is_it_for: ['Data Scientists', 'Ingenieros de ML']
            },
        ]);
        
        console.log(`✅ ${courses.length} cursos creados`);
        return courses;
    } catch (error) {
        console.error('❌ Error al crear cursos:', error);
        throw error;
    }
};

const seedProjects = async (users, categories) => {
    console.log('💼 Creando proyectos...');
    try {
        const projects = await models.Project.insertMany([
            {
                title: 'E-commerce MERN Stack',
                subtitle: 'Tienda online lista para producción',
                categorie: getObjectId(categories[0]),
                price_mxn: 1499,
                price_usd: 82,
                description: 'Código completo de e-commerce con carrito, pagos, panel admin. Stack: MongoDB, Express, React, Node.js.',
                imagen: 'project-ecommerce-mern.jpg',
                state: 2,
                user: getObjectId(users[1]),
                featured: true
            },
            {
                title: 'SaaS Dashboard Next.js',
                subtitle: 'Panel con suscripciones Stripe',
                categorie: getObjectId(categories[0]),
                price_mxn: 1799,
                price_usd: 98,
                description: 'Dashboard para SaaS con autenticación, suscripciones y analíticas. Next.js 14, TypeScript, Prisma.',
                imagen: 'project-saas-dashboard.jpg',
                state: 2,
                user: getObjectId(users[1]),
                featured: true
            },
            {
                title: 'Design System Figma',
                subtitle: 'Biblioteca de componentes UI',
                categorie: getObjectId(categories[1]),
                price_mxn: 899,
                price_usd: 49,
                description: 'Sistema de diseño con 200+ componentes, tokens y documentación.',
                imagen: 'project-design-system.jpg',
                state: 2,
                user: getObjectId(users[2])
            },
            {
                title: 'Landing Pages Pack',
                subtitle: '10 diseños convertidores',
                categorie: getObjectId(categories[1]),
                price_mxn: 699,
                price_usd: 38,
                description: '10 templates de landing pages en Figma y código HTML/CSS/JS.',
                imagen: 'project-landing-templates.jpg',
                state: 2,
                user: getObjectId(users[2])
            },
            {
                title: 'Python Notebooks Pack',
                subtitle: 'Análisis de datos reales',
                categorie: getObjectId(categories[3]),
                price_mxn: 799,
                price_usd: 44,
                description: '20+ notebooks Jupyter con análisis de ventas, marketing y finanzas.',
                imagen: 'project-python-notebooks.jpg',
                state: 2,
                user: getObjectId(users[4])
            },
        ]);
        
        console.log(`✅ ${projects.length} proyectos creados`);
        return projects;
    } catch (error) {
        console.error('❌ Error al crear proyectos:', error);
        throw error;
    }
};

const seedCourseContent = async (courses) => {
    console.log('📝 Creando contenido de cursos...');
    try {
        const reactCourse = courses[0];
        
        const section1 = await models.CourseSection.create({ 
            title: 'Fundamentos de React', 
            course: getObjectId(reactCourse) 
        });
        await models.CourseClase.insertMany([
            { title: 'Introducción a React', section: section1._id, description: 'Qué es React y configuración.', time: 900 },
            { title: 'Componentes y JSX', section: section1._id, description: 'Componentes funcionales y sintaxis JSX.', time: 1200 },
            { title: 'Estado y eventos', section: section1._id, description: 'useState y eventos del DOM.', time: 1500 },
        ]);

        const section2 = await models.CourseSection.create({ 
            title: 'Hooks Avanzados', 
            course: getObjectId(reactCourse) 
        });
        await models.CourseClase.insertMany([
            { title: 'useEffect y ciclo de vida', section: section2._id, description: 'Efectos secundarios y peticiones HTTP.', time: 1800 },
            { title: 'useContext para estado global', section: section2._id, description: 'Estado global sin Redux.', time: 1500 },
            { title: 'useReducer avanzado', section: section2._id, description: 'Estado complejo con useReducer.', time: 1800 },
        ]);

        const section3 = await models.CourseSection.create({ 
            title: 'Next.js 14', 
            course: getObjectId(reactCourse) 
        });
        await models.CourseClase.insertMany([
            { title: 'Introducción a Next.js', section: section3._id, description: 'SSR, SSG y App Router.', time: 1200 },
            { title: 'Server vs Client Components', section: section3._id, description: 'Arquitectura híbrida de Next.js.', time: 1500 },
            { title: 'Routing y navegación', section: section3._id, description: 'Sistema de archivos y rutas.', time: 1800 },
        ]);

        const figmaCourse = courses[3];
        const figmaSection1 = await models.CourseSection.create({ 
            title: 'Primeros pasos', 
            course: getObjectId(figmaCourse) 
        });
        await models.CourseClase.insertMany([
            { title: 'Interfaz de Figma', section: figmaSection1._id, description: 'Tour por la interfaz.', time: 900 },
            { title: 'Formas y texto', section: figmaSection1._id, description: 'Herramientas básicas.', time: 1200 },
        ]);
        
        console.log('✅ Contenido de cursos creado');
    } catch (error) {
        console.error('❌ Error al crear contenido:', error);
        throw error;
    }
};

const seedDiscounts = async (courses, categories) => {
    console.log('🎫 Creando descuentos...');
    try {
        const today = new Date();
        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const tomorrow = new Date(today.getTime() + 24*60*60*1000);

        const discounts = await models.Discount.insertMany([
            {
                type_campaign: 1,
                type_discount: 1,
                discount: 25,
                start_date: today,
                end_date: nextMonth,
                start_date_num: today.getTime(),
                end_date_num: nextMonth.getTime(),
                type_segment: 1,
                courses: [getObjectId(courses[0]), getObjectId(courses[1])],
                state: 1
            },
            {
                type_campaign: 2,
                type_discount: 1,
                discount: 40,
                start_date: today,
                end_date: tomorrow,
                start_date_num: today.getTime(),
                end_date_num: tomorrow.getTime(),
                type_segment: 2,
                categories: [getObjectId(categories[1])],
                state: 1
            },
        ]);
        
        console.log(`✅ ${discounts.length} descuentos creados`);
        return discounts;
    } catch (error) {
        console.error('❌ Error al crear descuentos:', error);
        throw error;
    }
};

const seedSalesAndActivity = async (users, courses, projects) => {
    console.log('🛒 Simulando ventas y actividad...');
    try {
        const carlos = users[5];
        const ana = users[6];
        const luis = users[7];

        // Venta 1: Carlos
        const sale1 = await models.Sale.create({
            user: getObjectId(carlos),
            method_payment: 'paypal',
            n_transaccion: 'TXN-' + Date.now() + '-001',
            currency_payment: 'USD',
            currency_total: 'USD',
            total: courses[0].price_usd + projects[0].price_usd,
            price_dolar: 1.0,
            status: 'Pagado',
            createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        });

        const saleDetail1Course = await models.SaleDetail.create({
            sale: getObjectId(sale1),
            product_type: 'course',
            product: getObjectId(courses[0]),
            price_unit: courses[0].price_usd,
            subtotal: courses[0].price_usd,
            total: courses[0].price_usd,
        });

        await models.SaleDetail.create({
            sale: getObjectId(sale1),
            product_type: 'project',
            product: getObjectId(projects[0]),
            price_unit: projects[0].price_usd,
            subtotal: projects[0].price_usd,
            total: projects[0].price_usd,
        });

        await models.CourseStudent.create({ 
            user: getObjectId(carlos), 
            course: getObjectId(courses[0]) 
        });

        await models.Review.create({
            product_type: 'course',
            product: getObjectId(courses[0]),
            user: getObjectId(carlos),
            sale_detail: getObjectId(saleDetail1Course),
            rating: 5,
            description: '¡Excelente curso! Muy bien explicado.',
        });

        // Venta 2: Ana
        const sale2 = await models.Sale.create({
            user: getObjectId(ana),
            method_payment: 'stripe',
            n_transaccion: 'TXN-' + Date.now() + '-002',
            currency_payment: 'USD',
            currency_total: 'USD',
            total: courses[3].price_usd,
            price_dolar: 1.0,
            status: 'Pagado',
            createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        });

        const saleDetail2 = await models.SaleDetail.create({
            sale: getObjectId(sale2),
            product_type: 'course',
            product: getObjectId(courses[3]),
            price_unit: courses[3].price_usd,
            subtotal: courses[3].price_usd,
            total: courses[3].price_usd,
        });

        await models.CourseStudent.create({ 
            user: getObjectId(ana), 
            course: getObjectId(courses[3]) 
        });

        await models.Review.create({
            product_type: 'course',
            product: getObjectId(courses[3]),
            user: getObjectId(ana),
            sale_detail: getObjectId(saleDetail2),
            rating: 5,
            description: 'Perfecto para aprender Figma desde cero.',
        });

        // Venta 3: Luis
        const sale3 = await models.Sale.create({
            user: getObjectId(luis),
            method_payment: 'mercadopago',
            n_transaccion: 'TXN-' + Date.now() + '-003',
            currency_payment: 'MXN',
            currency_total: 'MXN',
            total: courses[6].price_mxn,
            price_dolar: 3.66,
            status: 'Pagado',
            createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        });

        await models.SaleDetail.create({
            sale: getObjectId(sale3),
            product_type: 'course',
            product: getObjectId(courses[6]),
            price_unit: courses[6].price_usd,
            subtotal: courses[6].price_usd,
            total: courses[6].price_usd,
        });

        await models.CourseStudent.create({ 
            user: getObjectId(luis), 
            course: getObjectId(courses[6]) 
        });

        console.log('✅ Ventas y actividad simuladas');
    } catch (error) {
        console.error('❌ Error al simular ventas:', error);
        throw error;
    }
};

const seedSettings = async () => {
    console.log('⚙️  Creando configuraciones globales...');
    try {
        await models.Setting.insertMany([
            {
                name: 'Tasa de Comisión de la Plataforma (%)',
                key: 'platform_commission_rate',
                value: '20',
                type: 'number'
            },
            {
                name: 'Días para que las ganancias estén disponibles',
                key: 'days_until_available',
                value: '14',
                type: 'number'
            },
            {
                name: 'Umbral mínimo de pago (USD)',
                key: 'minimum_payment_threshold',
                value: '50',
                type: 'number'
            },
            {
                name: 'Tasa de cambio (USD a MXN)',
                key: 'exchange_rate_usd_to_mxn',
                value: '18.50',
                type: 'number'
            }
        ]);
        console.log('✅ Configuraciones creadas');
    } catch (error) {
        console.error('❌ Error al crear configuraciones:', error);
        throw error;
    }
};

const seedCommissionSettings = async () => {
    console.log('💰 Creando configuración de comisiones...');
    try {
        await models.PlatformCommissionSettings.create({
            default_rate: 20,
            days_until_available: 7,
            minimum_payout: 50,
        });
        console.log('✅ Configuración de comisiones creada');
    } catch (error) {
        console.error('❌ Error al crear configuración de comisiones:', error);
        throw error;
    }
};

const seedData = async () => {
    try {
        console.log('\n🚀 Iniciando seeding de la base de datos...\n');
        
        await clearData();
        
        const users = await seedUsers();
        const categories = await seedCategories();
        const courses = await seedCourses(users, categories);
        const projects = await seedProjects(users, categories);
        
        await seedCourseContent(courses);
        await seedDiscounts(courses, categories);
        await seedSalesAndActivity(users, courses, projects);
        await seedSettings();
        await seedCommissionSettings();

        console.log('\n✅ ¡Datos insertados correctamente!');
        console.log('\n📧 Credenciales de acceso:');
        console.log('   Admin: admin@example.com / admin123');
        console.log('   Instructor: juan.perez@example.com / user123');
        console.log('   Cliente: carlos.ruiz@example.com / user123\n');
        
        process.exit();
    } catch (error) {
        console.error(`\n❌ Error al insertar los datos: ${error}\n`);
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
        console.log('\n📖 Uso:');
        console.log('   node scripts/seed.js --import   (Poblar la base de datos)');
        console.log('   node scripts/seed.js --destroy  (Limpiar la base de datos)\n');
        process.exit();
    }
};

run();
