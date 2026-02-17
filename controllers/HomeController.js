import models from "../models/index.js";
import resource from "../resource/index.js";
import SettingController from "./SettingController.js"; // Importamos el controlador de ajustes
import { ObjectId } from "mongodb";
import token from "../service/token.js"; // Asegúrate que la ruta es correcta
import { N_CLASES_OF_COURSES, sumarTiempos } from "../utils/helpers.js"; // Asegúrate que la ruta es correcta

// Helper function para obtener usuario del token de Authorization
async function getUserFromAuthHeader(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;

  const tokenValue = authHeader.split(' ')[1];
  if (!tokenValue) return null;

  try {
    return await token.decode(tokenValue);
  } catch (error) {
    return null;
  }
}

// 🔥 HELPER: Obtener compras válidas del usuario (excluyendo reembolsos)
async function getValidUserPurchases(user_id) {
  let purchases = [];
  try {
    // 1. Obtener todas las ventas PAGADAS
    const sales = await models.Sale.find({ user: user_id, status: 'Pagado' }).select('detail.product');

    // 2. Obtener todos los reembolsos COMPLETADOS
    const refunds = await models.Refund.find({ user: user_id, status: 'completed' }).select('sale_detail_item.product');
    const refundedProductIds = refunds.map(r => r.sale_detail_item?.product?.toString());

    // 3. Filtrar
    sales.forEach(sale => {
      sale.detail.forEach(item => {
        const productId = item.product.toString();
        // Solo agregar si NO ha sido reembolsado
        if (!refundedProductIds.includes(productId)) {
          purchases.push(productId);
        }
      });
    });
  } catch (error) {
    console.error("Error obteniendo compras válidas:", error);
  }
  return purchases;
}

function DISCOUNT_G_F(Campaing_Normal, PRODUCT, product_type = "course") {
  let DISCOUNT_G = null;
  if (!Campaing_Normal) {
    return null;
  }

  const productIdStr = PRODUCT._id.toString();
  const categoryIdStr = PRODUCT.categorie?._id.toString();

  switch (Campaing_Normal.type_segment) {
    case 1: // Segmento por curso
      if (product_type === "course" && Campaing_Normal.courses.some((c) => c.toString() === productIdStr)) {
        DISCOUNT_G = Campaing_Normal;
      }
      break;
    case 2: // Segmento por categoría
      if (categoryIdStr && Campaing_Normal.categories.some((c) => c.toString() === categoryIdStr)) {
        DISCOUNT_G = Campaing_Normal;
      }
      break;
    case 3: // Segmento por proyecto
      if (product_type === "project" && Campaing_Normal.projects.some((p) => p.toString() === productIdStr)) {
        DISCOUNT_G = Campaing_Normal;
      }
      break;
    default:
      DISCOUNT_G = null;
  }
  return DISCOUNT_G;
}

async function COURSE_META_INFO(courseT) {
  let META_INFO = {};
  let N_STUDENTS = await models.CourseStudent.countDocuments({
    course: courseT._id,
  });
  let REVIEWS = await models.Review.find({
    product: courseT._id,
    product_type: "course",
  });
  let AVG_RATING =
    REVIEWS.length > 0
      ? Number(
        REVIEWS.reduce((sum, review) => sum + review.rating, 0) /
        REVIEWS.length
      ).toFixed(2)
      : "0.00";

  META_INFO.N_STUDENTS = N_STUDENTS;
  META_INFO.N_REVIEWS = REVIEWS.length;
  META_INFO.AVG_RATING = AVG_RATING;
  return META_INFO;
}
export default {
  list: async (req, res) => {
    try {
      // Asegura que TIME_NOW sea un número
      const TIME_NOW = Number(req.query.TIME_NOW) || Date.now();

      // INICIO DE LA CORRECCIÓN: Obtener compras del usuario si está logueado
      let user_purchases = [];
      const user = await getUserFromAuthHeader(req);
      if (user) {
        user_purchases = await getValidUserPurchases(user._id);
      }
      // FIN DE LA CORRECION

      // Obtener los ajustes de visibilidad
      const settings = await SettingController.getSettings();
      const showFeaturedCourses = settings['home_show_featured_courses'] !== false; // true por defecto
      const showFeaturedProjects = settings['home_show_featured_projects'] !== false; // true por defecto

      // 1. Categorías con conteo de cursos
      const CATEGORIES_LIST = await models.Categorie.aggregate([
        { $match: { state: 1 } },
        {
          $lookup: {
            from: "courses",
            localField: "_id",
            foreignField: "categorie",
            as: "courses",
          },
        },
        {
          $project: {
            _id: 1,
            title: 1,
            imagen: 1,
            count_courses: { $size: "$courses" },
          },
        },
      ]);

      // 2. Obtener TODAS las campañas de descuento activas (Normal, Flash, Banner)
      const ActiveCampaigns = await models.Discount.find({
        start_date_num: { $lte: TIME_NOW },
        end_date_num: { $gte: TIME_NOW },
        state: true,
      }).sort({ createdAt: -1 });


      // 3. Cursos TOP (aleatorios) con metadatos
      const courses_tops = await models.Course.aggregate([
        { $match: { state: 2 } },
        { $sample: { size: 3 } },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $lookup: {
            from: "categories",
            localField: "categorie",
            foreignField: "_id",
            as: "categorie",
          },
        },
        { $unwind: "$categorie" },
        {
          $lookup: {
            from: "course_sections",
            localField: "_id",
            foreignField: "course",
            as: "sections",
          },
        },
        {
          $lookup: {
            from: "reviews",
            localField: "_id",
            foreignField: "product",
            as: "reviews",
          },
        },
        // Lookup para clases a partir de las secciones
        {
          $lookup: {
            from: "course_clases",
            let: { section_ids: "$sections._id" },
            pipeline: [
              { $match: { $expr: { $in: ["$section", "$$section_ids"] } } },
            ],
            as: "clases",
          },
        },
        // Precalcula métricas para evitar reduce en JS
        {
          $addFields: {
            N_REVIEWS: { $size: "$reviews" },
            AVG_RATING: { $ifNull: [{ $avg: "$reviews.rating" }, 0.0] },
            N_CLASES: { $size: "$clases" },
            TIME_TOTAL: { $sum: "$clases.time" }, // Sumar la duración de todas las clases
          },
        },
      ]);

      const COURSES_TOPS = courses_tops.map((ct) => {
        const applicableCampaign = ActiveCampaigns.find(campaign =>
          DISCOUNT_G_F(campaign, ct, "course")
        );
        const DISCOUNT_G = applicableCampaign ? DISCOUNT_G_F(applicableCampaign, ct, "course") : null;
        const course_resource = resource.Course.api_resource_course(
          ct,
          DISCOUNT_G,
          // Pasa métricas ya calculadas al resource
          ct.N_STUDENTS ?? 0, // si tu resource lo ocupa; o pon 0 si no lo tienes aquí
          ct.N_REVIEWS,
          Number(ct.AVG_RATING).toFixed(2),
          ct.N_CLASES,
          ct.TIME_TOTAL
        );
        // CORRECCIÓN: Añadimos la marca si el estudiante ya tiene el curso
        course_resource.student_has_course = user_purchases.includes(ct._id.toString());
        return course_resource;
      });

      // 4. Secciones de cursos por categorías (5 categorías aleatorias)
      const categories_sections_sample = await models.Categorie.aggregate([
        { $match: { state: 1 } },
        { $sample: { size: 5 } },
      ]);

      const categoryIds = categories_sections_sample.map((cat) => cat._id);

      // Obtener todos los cursos para esas categorías de una sola vez
      const coursesForCategories = await models.Course.aggregate([
        { $match: { categorie: { $in: categoryIds }, state: 2 } },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $lookup: {
            from: "categories",
            localField: "categorie",
            foreignField: "_id",
            as: "categorie",
          },
        },
        { $unwind: "$categorie" },
        {
          $lookup: {
            from: "course_students",
            localField: "_id",
            foreignField: "course",
            as: "students",
          },
        },
        {
          $lookup: {
            from: "reviews",
            localField: "_id",
            foreignField: "product",
            as: "reviews",
          },
        },
        {
          $lookup: {
            from: "course_sections",
            localField: "_id",
            foreignField: "course",
            as: "sections",
          },
        },
        {
          $lookup: {
            from: "course_clases",
            let: { section_ids: "$sections._id" },
            pipeline: [
              { $match: { $expr: { $in: ["$section", "$$section_ids"] } } },
            ],
            as: "clases",
          },
        },
        {
          $project: {
            ...Object.keys(models.Course.schema.paths).reduce(
              (obj, key) => ({ ...obj, [key]: 1 }),
              {}
            ),
            N_STUDENTS: { $size: "$students" },
            N_REVIEWS: { $size: "$reviews" },
            AVG_RATING: { $ifNull: [{ $avg: "$reviews.rating" }, 0.0] },
            N_CLASES: { $size: "$clases" },
            TIME_TOTAL: { $sum: "$clases.time" },
          },
        },
      ]);

      const coursesByCategory = coursesForCategories.reduce((acc, course) => {
        const categoryId = course.categorie._id.toString();
        (acc[categoryId] ||= []).push(course);
        return acc;
      }, {});

      const CATEGORIES_SECTIONS = categories_sections_sample.map((category) => {
        const courses = coursesByCategory[category._id.toString()] || [];
        const COURSES_C = courses.map((c) => {
          const applicableCampaign = ActiveCampaigns.find(campaign =>
            DISCOUNT_G_F(campaign, c, "course")
          );
          const DISCOUNT_G = applicableCampaign ? DISCOUNT_G_F(applicableCampaign, c, "course") : null;
          const course_resource = resource.Course.api_resource_course(
            c,
            DISCOUNT_G,
            c.N_STUDENTS,
            c.N_REVIEWS,
            Number(c.AVG_RATING).toFixed(2),
            c.N_CLASES,
            c.TIME_TOTAL
          );
          // CORRECCIÓN: Añadimos la marca si el estudiante ya tiene el curso
          course_resource.student_has_course = user_purchases.includes(c._id.toString());
          return course_resource;
        });
        return {
          _id: category._id,
          title: category.title,
          title_empty: category.title.replace(/\s+/g, ""),
          count_courses: courses.length,
          courses: COURSES_C,
        };
      });

      // 5. Helper para obtener cursos de campañas (banner y flash)
      const getCampaignCourses = async (campaign) => {
        if (!campaign || !campaign.courses || campaign.courses.length === 0)
          return [];
        const courseIds = campaign.courses.map((c) => c?._id ?? c);
        const courses = await models.Course.aggregate([
          // CORRECCIÓN: Asegurarse de que los cursos de la campaña también estén públicos.
          { $match: { _id: { $in: courseIds }, state: 2 } },
          {
            $lookup: {
              from: "users",
              localField: "user",
              foreignField: "_id",
              as: "user",
            },
          },
          { $unwind: "$user" },
          {
            $lookup: {
              from: "categories",
              localField: "categorie",
              foreignField: "_id",
              as: "categorie",
            },
          },
          { $unwind: "$categorie" },
          {
            $lookup: {
              from: "course_students",
              localField: "_id",
              foreignField: "course",
              as: "students",
            },
          },
          {
            $lookup: {
              from: "reviews",
              localField: "_id",
              foreignField: "product",
              as: "reviews",
            },
          },
          {
            $lookup: {
              from: "course_sections",
              localField: "_id",
              foreignField: "course",
              as: "sections",
            },
          },
          {
            $lookup: {
              from: "course_clases",
              let: { section_ids: "$sections._id" },
              pipeline: [
                { $match: { $expr: { $in: ["$section", "$$section_ids"] } } },
              ],
              as: "clases",
            },
          },
          {
            $project: {
              ...Object.keys(models.Course.schema.paths).reduce(
                (obj, key) => ({ ...obj, [key]: 1 }),
                {}
              ),
              N_STUDENTS: { $size: "$students" },
              N_REVIEWS: { $size: "$reviews" },
              AVG_RATING: { $ifNull: [{ $avg: "$reviews.rating" }, 0.0] },
              N_CLASES: { $size: "$clases" },
              TIME_TOTAL: { $sum: "$clases.time" },
            },
          },
        ]);
        return courses.map((c) => {
          const course_resource = resource.Course.api_resource_course(
            c,
            null,
            c.N_STUDENTS,
            c.N_REVIEWS,
            Number(c.AVG_RATING).toFixed(2),
            c.N_CLASES,
            c.TIME_TOTAL
          );
          // CORRECCIÓN: Añadimos la marca si el estudiante ya tiene el curso
          course_resource.student_has_course = user_purchases.includes(c._id.toString());
          return course_resource;
        });
      };

      // 6. Obtener campañas banner y flash
      let Campaing_banner = await models.Discount.findOne({
        type_campaign: 3,
        start_date_num: { $lte: TIME_NOW },
        end_date_num: { $gte: TIME_NOW },
      });
      const COURSES_BANNERS = await getCampaignCourses(Campaing_banner);

      let Campaing_flash = await models.Discount.findOne({
        type_campaign: 2,
        start_date_num: { $lte: TIME_NOW },
        end_date_num: { $gte: TIME_NOW },
      });
      const COURSES_FLASH = await getCampaignCourses(Campaing_flash);
      if (Campaing_flash) Campaing_flash = Campaing_flash.toObject();

      let projects_featured_processed = [];
      if (showFeaturedProjects) {
        const projects_featured_raw = await models.Project.find({ state: 2, featured: true })
          .populate("categorie")
          .populate("user")
          .sort({ createdAt: -1 })
          .limit(3);

        // Aplicar descuentos a los proyectos destacados usando el resource
        projects_featured_processed = projects_featured_raw.map(project => {
          // Encontrar la campaña aplicable para este proyecto
          const applicableCampaign = ActiveCampaigns.find(campaign =>
            DISCOUNT_G_F(campaign, project, "project")
          );
          const DISCOUNT_G = applicableCampaign ? DISCOUNT_G_F(applicableCampaign, project, "project") : null;

          const project_resource = resource.Project.api_resource_project(project, DISCOUNT_G);
          // CORRECCIÓN: Añadimos la marca si el estudiante ya tiene el proyecto
          project_resource.student_has_project = user_purchases.includes(project._id.toString());
          return project_resource;
        });
        console.log('========== FIN DEBUG ==========\n');
      }

      // 7. Obtener cursos destacados (si está activado)
      let COURSES_FEATURED = [];
      if (showFeaturedCourses) {
        const featuredCourses = await models.Course.aggregate([
          // Solo cursos destacados (featured: true) y que estén públicos (state: 2)
          { $match: { featured: true, state: 2 } },
          {
            $lookup: {
              from: "users",
              localField: "user",
              foreignField: "_id",
              as: "user",
            },
          },
          { $unwind: "$user" },
          {
            $lookup: {
              from: "categories",
              localField: "categorie",
              foreignField: "_id",
              as: "categorie",
            },
          },
          { $unwind: "$categorie" },
          {
            $lookup: {
              from: "course_students",
              localField: "_id",
              foreignField: "course",
              as: "students",
            },
          },
          {
            $lookup: {
              from: "reviews",
              localField: "_id",
              foreignField: "product",
              as: "reviews",
            },
          },
          {
            $lookup: {
              from: "course_sections",
              localField: "_id",
              foreignField: "course",
              as: "sections",
            },
          },
          {
            $lookup: {
              from: "course_clases",
              let: { section_ids: "$sections._id" },
              pipeline: [
                { $match: { $expr: { $in: ["$section", "$$section_ids"] } } },
              ],
              as: "clases",
            },
          },
          {
            $project: {
              ...Object.keys(models.Course.schema.paths).reduce(
                (obj, key) => ({ ...obj, [key]: 1 }),
                {}
              ),
              N_STUDENTS: { $size: "$students" },
              N_REVIEWS: { $size: "$reviews" },
              AVG_RATING: { $ifNull: [{ $avg: "$reviews.rating" }, 0.0] },
              N_CLASES: { $size: "$clases" },
              TIME_TOTAL: { $sum: "$clases.time" },
            },
          },
        ]);

        COURSES_FEATURED = featuredCourses.map((c) => {
          const applicableCampaign = ActiveCampaigns.find(campaign =>
            DISCOUNT_G_F(campaign, c, "course")
          );
          const DISCOUNT_G = applicableCampaign ? DISCOUNT_G_F(applicableCampaign, c, "course") : null;
          const course_resource = resource.Course.api_resource_course(
            c,
            DISCOUNT_G,
            c.N_STUDENTS,
            c.N_REVIEWS,
            Number(c.AVG_RATING).toFixed(2),
            c.N_CLASES,
            c.TIME_TOTAL
          );
          // CORRECCIÓN: Añadimos la marca si el estudiante ya tiene el curso
          course_resource.student_has_course = user_purchases.includes(c._id.toString());
          return course_resource;
        });
      }

      // 8. Construir y enviar respuesta
      const responsePayload = {
        categories: CATEGORIES_LIST,
        courses_top: COURSES_TOPS,
        categories_sections: CATEGORIES_SECTIONS,
        courses_banners: COURSES_BANNERS,
        campaing_banner: Campaing_banner,
        courses_flash: COURSES_FLASH,
        campaing_flash: Campaing_flash
      };

      if (showFeaturedProjects) responsePayload.projects_featured = projects_featured_processed;
      if (showFeaturedCourses) responsePayload.courses_featured = COURSES_FEATURED;

      res.status(200).json(responsePayload);
    } catch (error) {
      console.error("Error en HomeController.list:", error);
      res.status(500).send({ message: "Ocurrio un error" });
    }
  },

  show_course: async (req, res) => {
    try {
      // Obtener usuario del token de Authorization
      const user = await getUserFromAuthHeader(req);

      // Parámetros
      const SLUG = (req.params.slug || "").toString().trim();
      const TIME_NOW = Number(req.query.TIME_NOW) || Date.now();
      const CAMPAING_SPECIAL = req.query.CAMPAING_SPECIAL || null;

      // Campaña activa (especial o normal)
      let Campaing_Normal = null;
      if (CAMPAING_SPECIAL) {
        Campaing_Normal = await models.Discount.findById(
          CAMPAING_SPECIAL
        ).catch(() => null);
      }
      if (!Campaing_Normal) {
        Campaing_Normal = await models.Discount.findOne({
          type_campaign: 1,
          start_date_num: { $lte: TIME_NOW },
          end_date_num: { $gte: TIME_NOW },
        });
      }

      // Curso principal
      const COURSE = await models.Course.findOne({ slug: SLUG }).populate([
        "categorie",
        "user",
      ]);

      if (!COURSE) {
        return res.status(200).json({
          message: 404,
          message_text: "EL CURSO NO EXISTE",
        });
      }

      // Verificar si el usuario ya posee el curso
      let STUDENT_HAVE_COURSE = false;
      if (user) {
        const IS_HAVE_COURSE = await models.CourseStudent.findOne({
          course: COURSE._id,
          user: user._id,
        });
        STUDENT_HAVE_COURSE = !!IS_HAVE_COURSE;
      }

      // Malla curricular: Secciones, clases y archivos
      const SECTIONS = await models.CourseSection.find({ course: COURSE._id });
      const MALLA_CURRICULAR = [];
      let TIME_TOTAL_SECTIONS = [];
      let time_total_course_seconds = 0;
      let FILES_TOTAL_SECTIONS = 0;
      let NUMERO_TOTAL_CLASES = 0;

      // Cargar clases por sección en paralelo
      await Promise.all(
        SECTIONS.map(async (_sec) => {
          const sectionObject = _sec.toObject();
          const clases = await models.CourseClase.find({
            section: _sec._id,
          }).sort({ order: 1 });

          let sectionTimeSeconds = 0;
          const clasesConArchivos = await Promise.all(
            clases.map(async (clase) => {
              const claseObject = clase.toObject();
              const files = await models.CourseClaseFile.find({
                clase: clase._id,
              });
              claseObject.files = files;
              sectionTimeSeconds += clase.time || 0;
              // Asegurarnos de que el vimeo_id se incluya para el reproductor
              claseObject.vimeo_id = clase.vimeo_id;
              return claseObject;
            })
          );

          sectionObject.clases = clasesConArchivos;
          sectionObject.time_parse = sectionTimeSeconds; // Duración total de la sección en segundos
          time_total_course_seconds += sectionTimeSeconds;
          NUMERO_TOTAL_CLASES += clases.length;

          MALLA_CURRICULAR.push(sectionObject);
        })
      );

      // Cursos relacionados: del mismo instructor
      const COURSE_INSTRUCTOR = await models.Course.aggregate([
        { $match: { state: 2, user: COURSE.user._id } },
        { $sample: { size: 2 } },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $lookup: {
            from: "categories",
            localField: "categorie",
            foreignField: "_id",
            as: "categorie",
          },
        },
        { $unwind: "$categorie" },
      ]);

      // Cursos relacionados: por categoría (excluyendo el actual)
      const COURSE_RELATEDS = await models.Course.aggregate([
        {
          $match: {
            state: 2,
            categorie: COURSE.categorie._id,
            _id: { $ne: COURSE._id },
          },
        },
        { $sample: { size: 4 } },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $lookup: {
            from: "categories",
            localField: "categorie",
            foreignField: "_id",
            as: "categorie",
          },
        },
        { $unwind: "$categorie" },
      ]);

      // Meta info del curso principal (estudiantes, reviews, rating)
      const META_INFO = await COURSE_META_INFO(COURSE);

      // Procesar cursos relacionados en paralelo
      const [N_COURSE_INSTRUCTOR, N_COURSE_RELATEDS] = await Promise.all([
        Promise.all(
          COURSE_INSTRUCTOR.map(async (ci) => {
            const DISCOUNT_G = DISCOUNT_G_F(Campaing_Normal, ci);
            const meta = await COURSE_META_INFO(ci);
            const nClases = await N_CLASES_OF_COURSES(ci); // Considerar optimizar si es lento
            return resource.Course.api_resource_course(
              ci,
              DISCOUNT_G,
              nClases,
              meta.N_STUDENTS,
              meta.N_REVIEWS,
              meta.AVG_RATING
            );
          })
        ),
        Promise.all(
          COURSE_RELATEDS.map(async (cr) => {
            const DISCOUNT_G = DISCOUNT_G_F(Campaing_Normal, cr);
            const meta = await COURSE_META_INFO(cr);
            const nClases = await N_CLASES_OF_COURSES(cr);
            return resource.Course.api_resource_course(
              cr,
              DISCOUNT_G,
              nClases,
              meta.N_STUDENTS,
              meta.N_REVIEWS,
              meta.AVG_RATING
            );
          })
        ),
      ]);

      // Obtener reseñas del curso
      const REVIEWS = await models.Review.find({
        product: COURSE._id,
        product_type: "course",
      }).populate("user");

      // Info del instructor (totales)
      const COURSES_INSTRUCTOR = await models.Course.find({
        user: COURSE.user,
        state: 2,
      });
      const COUNT_COURSE_INSTRUCTOR = COURSES_INSTRUCTOR.length;

      let N_STUDENTS_SUM_TOTAL = 0;
      let TOTAL_RATINGS_SUM = 0;
      let NUM_REVIEW_SUM_TOTAL = 0;

      // Calcular métricas agregadas del instructor
      await Promise.all(
        COURSES_INSTRUCTOR.map(async (ci) => {
          const nStudents = await models.CourseStudent.countDocuments({
            course: ci._id,
          });
          const reviews = await models.Review.find({
            product: ci._id,
            product_type: "course",
          });

          const sumRatings = reviews.reduce(
            (sum, r) => sum + (r.rating || 0),
            0
          );
          const numReviews = reviews.length;

          N_STUDENTS_SUM_TOTAL += nStudents;
          TOTAL_RATINGS_SUM += sumRatings;
          NUM_REVIEW_SUM_TOTAL += numReviews;
        })
      );

      const AVG_RATING_INSTRUCTOR =
        NUM_REVIEW_SUM_TOTAL > 0
          ? (TOTAL_RATINGS_SUM / NUM_REVIEW_SUM_TOTAL).toFixed(2)
          : "0.00";

      // Aplicar descuento al curso principal
      const DISCOUNT_G = DISCOUNT_G_F(Campaing_Normal, COURSE);

      return res.status(200).json({
        course: resource.Course.api_resource_course_landing(
          COURSE,
          DISCOUNT_G,
          MALLA_CURRICULAR,
          time_total_course_seconds, // Enviamos el total en segundos
          FILES_TOTAL_SECTIONS,
          COUNT_COURSE_INSTRUCTOR,
          NUMERO_TOTAL_CLASES,
          META_INFO.N_STUDENTS,
          META_INFO.AVG_RATING,
          META_INFO.N_REVIEWS,
          N_STUDENTS_SUM_TOTAL,
          NUM_REVIEW_SUM_TOTAL,
          AVG_RATING_INSTRUCTOR
        ),
        reviews: REVIEWS.map((review) => {
          review = review.toObject();
          review.user_info = {
            _id: review.user?._id,
            full_name: `${review.user?.name || ""} ${review.user?.surname || ""
              }`.trim(),
            avatar: review.user?.avatar
              ? (process.env.URL_BACKEND || "") +
              "/api/users/imagen-usuario/" +
              review.user.avatar
              : null,
          };
          review.user = null;
          return review;
        }),
        course_instructor: N_COURSE_INSTRUCTOR,
        course_relateds: N_COURSE_RELATEDS,
        student_have_course: STUDENT_HAVE_COURSE,
      });
    } catch (error) {
      console.error("Error en HomeController.show_course:", error);
      return res.status(500).send({ message: "OCURRIO UN ERROR" });
    }
  },

  show_project: async (req, res) => {
    try {
      const user = await getUserFromAuthHeader(req);
      const PROJECT_ID = req.params.id;
      const TIME_NOW = Number(req.query.TIME_NOW) || Date.now();

      if (!ObjectId.isValid(PROJECT_ID)) {
        return res.status(200).json({
          message: 404,
          message_text: "EL PROYECTO NO EXISTE",
        });
      }

      // Obtener campaña activa
      let Campaing_Normal = await models.Discount.findOne({
        type_campaign: 1,
        start_date_num: { $lte: TIME_NOW },
        end_date_num: { $gte: TIME_NOW },
      });

      const PROJECT = await models.Project.findOne({ _id: PROJECT_ID, state: 2 }).populate([
        "categorie",
        "user",
      ]);

      if (!PROJECT) {
        return res.status(200).json({
          message: 404,
          message_text: "EL PROYECTO NO EXISTE",
        });
      }

      // Verificar si el usuario ya posee el proyecto
      // Verificar si el usuario ya posee el proyecto
      let STUDENT_HAVE_PROJECT = false;
      if (user) {
        // 1. Buscar venta pagada
        const sale = await models.Sale.findOne({
          user: user._id,
          status: 'Pagado',
          "detail.product": PROJECT._id
        });

        if (sale) {
          // 2. 🔥 VERIFICAR QUE NO HAYA SIDO REEMBOLSADO
          const refund = await models.Refund.findOne({
            user: user._id,
            'sale_detail_item.product': PROJECT._id,
            status: 'completed'
          });

          if (!refund) {
            STUDENT_HAVE_PROJECT = true;
          }
        }
      }

      // Obtener reseñas del proyecto
      const REVIEWS = await models.Review.find({
        product: PROJECT._id,
        product_type: "project",
      }).populate("user");

      const AVG_RATING =
        REVIEWS.length > 0
          ? Number(
            REVIEWS.reduce((sum, review) => sum + review.rating, 0) /
            REVIEWS.length
          ).toFixed(2)
          : "0.00";

      // Proyectos relacionados (misma categoría)
      let RELATED_PROJECTS = await models.Project.find({
        categorie: PROJECT.categorie._id,
        state: 2,
        _id: { $ne: PROJECT._id }
      }).limit(4).populate("user");

      // Aplicar descuentos a relacionados
      RELATED_PROJECTS = RELATED_PROJECTS.map(p => {
        const discount = DISCOUNT_G_F(Campaing_Normal, p, "project");
        return resource.Project.api_resource_project(p, discount);
      });

      // Aplicar descuento al proyecto principal
      const DISCOUNT_G = DISCOUNT_G_F(Campaing_Normal, PROJECT, "project");

      return res.status(200).json({
        project: {
          ...resource.Project.api_resource_project(PROJECT, DISCOUNT_G),
          files: STUDENT_HAVE_PROJECT ? PROJECT.files : [], // Solo enviar archivos si lo compró
        },
        reviews: REVIEWS.map((review) => {
          review = review.toObject();
          review.user_info = {
            _id: review.user?._id,
            full_name: `${review.user?.name || ""} ${review.user?.surname || ""
              }`.trim(),
            avatar: review.user?.avatar
              ? (process.env.URL_BACKEND || "") +
              "/api/users/imagen-usuario/" +
              review.user.avatar
              : null,
          };
          review.user = null;
          return review;
        }),
        project_relateds: RELATED_PROJECTS,
        student_have_project: STUDENT_HAVE_PROJECT,
        metrics: {
          avg_rating: AVG_RATING,
          total_reviews: REVIEWS.length
        }
      });

    } catch (error) {
      console.error("Error en HomeController.show_project:", error);
      return res.status(500).send({ message: "OCURRIO UN ERROR" });
    }
  },

  search_course: async (req, res) => {
    try {
      let TIME_NOW = req.query.TIME_NOW;
      // Compatible con 'q' (frontend) y 'search' (backend)
      let search_course = req.body.q || req.body.search;
      let selected_categories = req.body.selected_categories;
      if (selected_categories) {
        selected_categories = selected_categories.map(
          (str) => new ObjectId(str)
        );
      }
      let selected_instructors = req.body.selected_instructors;
      if (selected_instructors) {
        selected_instructors = selected_instructors.map(
          (str) => new ObjectId(str)
        );
      }

      let selected_levels = req.body.selected_levels; //["Basico","Intermedio"]
      let selected_idiomas = req.body.selected_idiomas;

      let min_price = req.body.min_price;
      let max_price = req.body.max_price;
      let rating_selected = req.body.rating_selected; //2

      let filters = [{ $match: { state: 2 } }];
      if (search_course) {
        filters.push({ $match: { title: new RegExp(search_course, "i") } });
      }
      if (selected_categories && selected_categories.length > 0) {
        filters.push({ $match: { categorie: { $in: selected_categories } } });
      }
      if (selected_instructors && selected_instructors.length > 0) {
        filters.push({ $match: { user: { $in: selected_instructors } } });
      }
      if (selected_levels && selected_levels.length > 0) {
        filters.push({ $match: { level: { $in: selected_levels } } });
      }
      if (selected_idiomas && selected_idiomas.length > 0) {
        filters.push({ $match: { idioma: { $in: selected_idiomas } } });
      }
      if (min_price > 0 && max_price > 0) {
        filters.push({
          $match: { price_usd: { $gte: min_price, $lte: max_price } },
        });
      }
      if (rating_selected && rating_selected > 0) {
        filters.push({
          $lookup: {
            from: "reviews",
            localField: "_id",
            foreignField: "product",
            as: "reviews",
          },
        });
        filters.push({
          $addFields: {
            avgRanting: {
              $avg: "$reviews.rating",
            }, // Cuidado: avg de un array vacío es null
            // Asegurarse que el filtro no falle si no hay reviews
            product_type: {
              $cond: {
                if: { $isArray: "$reviews" },
                then: "course",
                else: "course",
              },
            },
          },
        });
        filters.push({
          $match: {
            $and: [
              {
                avgRanting: {
                  $gte: rating_selected - 1,
                  $lt: rating_selected + 1,
                },
              },
              { product_type: "course" }, // Asegura que solo sean reviews de cursos
            ],
          },
        });
      }
      filters.push({
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      });
      filters.push({
        $unwind: "$user",
      });
      filters.push({
        $lookup: {
          from: "categories",
          localField: "categorie",
          foreignField: "_id",
          as: "categorie",
        },
      });
      filters.push({
        $unwind: "$categorie",
      });
      let Courses = await models.Course.aggregate(filters);

      // CAMPAING NORMAL
      let Campaing_home = await models.Discount.findOne({
        type_campaign: 1,
        start_date_num: { $lte: TIME_NOW }, // TIME_NOW >= start_date_num 10
        end_date_num: { $gte: TIME_NOW }, // TIME_NOW <= end_date_num 20
      });

      let COURSES = [];
      for (const Course of Courses) {
        let DISCOUNT_G = DISCOUNT_G_F(Campaing_home, Course);
        // TODO: Obtener N_CLASES, N_STUDENTS, etc., si es necesario para el resource.
        COURSES.push(resource.Course.api_resource_course(Course, DISCOUNT_G));
      }

      res.status(200).json({
        courses: COURSES,
      });
    } catch (error) {
      console.error("Error en HomeController.search_course:", error);
      res.status(500).send({
        message: "OCURRIO UN ERROR",
      });
    }
  },
  config_all: async (req, res) => {
    try {
      // Optimizado con agregaciones para evitar múltiples consultas en bucle
      const categories = await models.Categorie.aggregate([
        { $match: { state: 1 } },
        {
          $lookup: {
            from: "courses",
            localField: "_id",
            foreignField: "categorie",
            as: "courses",
          },
        },
        { $project: { title: 1, count_course: { $size: "$courses" } } },
      ]);

      const instructores = await models.User.aggregate([
        { $match: { rol: "instructor", state: 1 } },
        {
          $lookup: {
            from: "courses",
            localField: "_id",
            foreignField: "user",
            as: "courses",
          },
        },
        {
          $project: {
            name: 1,
            surname: 1,
            count_course: { $size: "$courses" },
          },
        },
      ]);

      let levels = ["Basico", "Intermedio", "Avanzado"];

      // Conteo de cursos por nivel
      const N_LEVELS = await models.Course.aggregate([
        { $match: { level: { $in: levels } } },
        { $group: { _id: "$level", count_course: { $sum: 1 } } },
        { $project: { name: "$_id", count_course: 1, _id: 0 } },
      ]);

      let idiomas = ["Ingles", "Español", "Portugues", "Aleman"];

      // Conteo de cursos por idioma
      const N_IDIOMAS = await models.Course.aggregate([
        { $match: { idioma: { $in: idiomas } } },
        { $group: { _id: "$idioma", count_course: { $sum: 1 } } },
        { $project: { name: "$_id", count_course: 1, _id: 0 } },
      ]);

      res.status(200).json({
        categories: categories,
        instructores: instructores,
        levels: N_LEVELS,
        idiomas: N_IDIOMAS,
      });
    } catch (error) {
      console.error("Error en HomeController.config_all:", error);
      res.status(500).send({
        message: "OCURRIO UN ERROR",
      });
    }
  },

  get_all_courses: async (req, res) => {
    try {
      const TIME_NOW = Number(req.query.TIME_NOW) || Date.now();

      // INICIO DE LA CORRECCIÓN: Obtener compras del usuario si está logueado
      let user_purchases = [];
      const user = await getUserFromAuthHeader(req);
      if (user) {
        user_purchases = await getValidUserPurchases(user._id);
      }

      // Obtener TODAS las campañas de descuento activas (Normal, Flash, Banner)
      const ActiveCampaigns = await models.Discount.find({
        start_date_num: { $lte: TIME_NOW },
        end_date_num: { $gte: TIME_NOW },
        state: true,
      }).sort({ createdAt: -1 });

      const courses = await models.Course.find({ state: 2 })
        .populate('user', 'name surname avatar')
        .populate('categorie', 'title imagen')
        .sort({ createdAt: -1 });

      // Aplicar descuentos a cada curso
      const courses_with_discounts = courses.map(course => {
        // Encontrar la campaña aplicable para este curso
        const applicableCampaign = ActiveCampaigns.find(campaign =>
          DISCOUNT_G_F(campaign, course, "course")
        );
        const DISCOUNT_G = applicableCampaign ? DISCOUNT_G_F(applicableCampaign, course, "course") : null;
        const course_resource = resource.Course.api_resource_course(course, DISCOUNT_G);
        // CORRECCIÓN: Añadimos la marca si el estudiante ya tiene el curso
        course_resource.student_has_course = user_purchases.includes(course._id.toString());
        return course_resource;
      });

      // Enviar cursos con descuentos aplicados
      res.status(200).json({ courses: courses_with_discounts });

    } catch (error) {
      console.error("Error en HomeController.get_all_courses:", error);
      res.status(500).send({ message: "Ocurrió un error al obtener todos los cursos." });
    }
  },

  get_all_projects: async (req, res) => {
    try {
      const TIME_NOW = Number(req.query.TIME_NOW) || Date.now();

      // INICIO DE LA CORRECCIÓN: Obtener compras del usuario si está logueado
      let user_purchases = [];
      const user = await getUserFromAuthHeader(req);
      if (user) {
        user_purchases = await getValidUserPurchases(user._id);
      }

      // Obtener TODAS las campañas de descuento activas (Normal, Flash, Banner)
      const ActiveCampaigns = await models.Discount.find({
        start_date_num: { $lte: TIME_NOW },
        end_date_num: { $gte: TIME_NOW },
        state: true,
      }).sort({ createdAt: -1 });

      const projects = await models.Project.find({ state: 2 })
        .populate('user', 'name surname avatar')
        .populate('categorie', 'title imagen')
        .sort({ createdAt: -1 });

      console.log('\nProyectos públicos encontrados:', projects.length);

      // Aplicar descuentos a cada proyecto usando el resource
      const projects_with_discounts = projects.map(project => {
        // Encontrar la campaña aplicable para este proyecto
        const applicableCampaign = ActiveCampaigns.find(campaign =>
          DISCOUNT_G_F(campaign, project, "project")
        );
        const DISCOUNT_G = applicableCampaign ? DISCOUNT_G_F(applicableCampaign, project, "project") : null;
        const project_resource = resource.Project.api_resource_project(project, DISCOUNT_G);
        // CORRECCIÓN: Añadimos la marca si el estudiante ya tiene el proyecto
        project_resource.student_has_project = user_purchases.includes(project._id.toString());
        return project_resource;
      });

      res.status(200).json({ projects: projects_with_discounts });

    } catch (error) {
      console.error("Error en HomeController.get_all_projects:", error);
      res.status(500).send({ message: "Ocurrió un error al obtener todos los proyectos." });
    }
  },

  general_search: async (req, res) => {
    try {
      const TIME_NOW = Number(req.query.TIME_NOW) || Date.now();
      const searchTerm = req.query.q || '';
      const categoryId = req.query.categoryId || null;

      // 1. Obtener campañas de descuento activas
      const ActiveCampaigns = await models.Discount.find({
        start_date_num: { $lte: TIME_NOW },
        end_date_num: { $gte: TIME_NOW },
        state: true,
      }).sort({ createdAt: -1 });

      // 2. Construir la consulta base
      const queryConditions = [{ state: 2 }]; // Solo items públicos

      // Helper para escapar caracteres especiales de regex
      const escapeRegex = (string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      };

      // Helper para generar regex insensible a acentos
      const generateAccentInsensitiveRegex = (searchTerm) => {
        // 1. Normalizar: quitar acentos y caracteres diacríticos
        const normalizedTerm = searchTerm.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // 2. Escapar caracteres especiales
        const escapedTerm = escapeRegex(normalizedTerm);

        let regexStr = '';

        for (let char of escapedTerm) {
          switch (char.toLowerCase()) {
            case 'a': regexStr += '[aáàâä]'; break;
            case 'e': regexStr += '[eéèêë]'; break;
            case 'i': regexStr += '[iíìîï]'; break;
            case 'o': regexStr += '[oóòôö]'; break;
            case 'u': regexStr += '[uúùûü]'; break;
            case 'n': regexStr += '[nñ]'; break;
            default: regexStr += char;
          }
        }
        return new RegExp(regexStr, 'i');
      };

      if (searchTerm.trim()) {
        const searchRegex = generateAccentInsensitiveRegex(searchTerm.trim());
        queryConditions.push({
          $or: [
            { title: searchRegex },
            { subtitle: searchRegex },
            { description: searchRegex },
          ]
        });
      }

      // Solo añadir el filtro de categoría si categoryId es un ObjectId válido
      if (categoryId && ObjectId.isValid(categoryId)) {
        queryConditions.push({ categorie: new ObjectId(categoryId) });
      }
      const query = { $and: queryConditions };
      // 3. Buscar en paralelo en Cursos y Proyectos
      const [courses, projects] = await Promise.all([
        models.Course.find(query).populate('user', 'name surname').populate('categorie', 'title'),
        models.Project.find(query).populate('user', 'name surname').populate('categorie', 'title')
      ]);

      // 4. Procesar cursos con su resource y añadir tipo
      const processedCourses = courses.map(course => {
        const applicableCampaign = ActiveCampaigns.find(campaign => DISCOUNT_G_F(campaign, course, "course"));
        const DISCOUNT_G = applicableCampaign ? DISCOUNT_G_F(applicableCampaign, course, "course") : null;
        const courseResource = resource.Course.api_resource_course(course, DISCOUNT_G);
        return { ...courseResource, item_type: 'course' }; // Añadir tipo
      });

      // 5. Procesar proyectos con su resource y añadir tipo
      const processedProjects = projects.map(project => {
        const applicableCampaign = ActiveCampaigns.find(campaign => DISCOUNT_G_F(campaign, project, "project"));
        const DISCOUNT_G = applicableCampaign ? DISCOUNT_G_F(applicableCampaign, project, "project") : null;
        const projectResource = resource.Project.api_resource_project(project, DISCOUNT_G);
        return { ...projectResource, item_type: 'project' }; // Añadir tipo
      });

      // 6. Combinar resultados y ordenar (opcional, por fecha de creación)
      const results = [...processedCourses, ...processedProjects];
      results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      res.status(200).json({ results });

    } catch (error) {
      console.error("Error en HomeController.general_search:", error);
      res.status(500).send({ message: "Ocurrió un error durante la búsqueda." });
    }
  },
};
