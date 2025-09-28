import models from "../models/index.js";
import resource from "../resource/index.js";
import { ObjectId } from "mongodb";
import token from "../service/token.js";
import { N_CLASES_OF_COURSES, sumarTiempos } from "../utils/helpers.js";
function DISCOUNT_G_F(Campaing_Normal, PRODUCT, product_type = "course") {
  let DISCOUNT_G = null;
  if (!Campaing_Normal) {
    return null;
  }

  const productIdStr = PRODUCT._id.toString();
  const categoryIdStr = PRODUCT.categorie?._id.toString();

  if (
    Campaing_Normal.type_segment == 1 &&
    product_type === "course" &&
    Campaing_Normal.courses.some((c) => c.toString() === productIdStr)
  ) {
    DISCOUNT_G = Campaing_Normal;
  } else if (
    Campaing_Normal.type_segment == 2 &&
    categoryIdStr &&
    Campaing_Normal.categories.some((c) => c.toString() === categoryIdStr)
  ) {
    DISCOUNT_G = Campaing_Normal;
  } else if (
    Campaing_Normal.type_segment == 3 &&
    product_type === "project" &&
    Campaing_Normal.projects.some((p) => p.toString() === productIdStr)
  ) {
    DISCOUNT_G = Campaing_Normal;
  }
  return DISCOUNT_G;
}
async function COURSE_META_INFO(courseT) {
  let META_INFO = {};
  let N_STUDENTS = await models.CourseStudent.count({ course: courseT._id });
  let REVIEWS = await models.Review.find({
    product: courseT._id,
    product_type: "course",
  });
  let AVG_RATING =
    REVIEWS.length > 0
      ? (
          REVIEWS.reduce((sum, review) => sum + review.rating, 0) /
          REVIEWS.length
        ).toFixed(2)
      : 0;

  META_INFO.N_STUDENTS = N_STUDENTS;
  META_INFO.N_REVIEWS = REVIEWS.length;
  META_INFO.AVG_RATING = AVG_RATING;
  return META_INFO;
}
export default {
  list: async (req, res) => {
    try {
      // Asegura que TIME_NOW sea número
      const TIME_NOW = Number(req.query.TIME_NOW) || Date.now();

      // 1) Categorías con conteo
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

      // Campaña normal activa
      let Campaing_home = await models.Discount.findOne({
        type_campaign: 1,
        start_date_num: { $lte: TIME_NOW },
        end_date_num: { $gte: TIME_NOW },
      });

      // 2) Cursos TOPS — ahora incluye clases
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
        // 🔧 lookup para clases a partir de las sections:
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
            AVG_RATING: { $ifNull: [{ $avg: "$reviews.rating" }, 0] },
            N_CLASES: { $size: "$clases" },
          },
        },
      ]);

      const COURSES_TOPS = courses_tops.map((ct) => {
        const DISCOUNT_G = DISCOUNT_G_F(Campaing_home, ct);
        return resource.Course.api_resource_course(
          ct,
          DISCOUNT_G,
          // Orden de tu resource: pasa métricas ya calculadas
          ct.N_STUDENTS ?? 0, // si tu resource lo ocupa; o pon 0 si no lo tienes aquí
          ct.N_REVIEWS,
          Number(ct.AVG_RATING).toFixed(2),
          ct.N_CLASES
        );
      });

      // 3) Secciones por categorías (sample 5) — corrige variable y cursos
      const categories_sections_sample = await models.Categorie.aggregate([
        { $match: { state: 1 } },
        { $sample: { size: 5 } },
      ]);

      const categoryIds = categories_sections_sample.map((cat) => cat._id);

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
            AVG_RATING: { $ifNull: [{ $avg: "$reviews.rating" }, 0] },
            N_CLASES: { $size: "$clases" },
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
          const DISCOUNT_G = DISCOUNT_G_F(Campaing_home, c);
          return resource.Course.api_resource_course(
            c,
            DISCOUNT_G,
            c.N_STUDENTS,
            c.N_REVIEWS,
            Number(c.AVG_RATING).toFixed(2),
            c.N_CLASES
          );
        });
        return {
          _id: category._id,
          title: category.title,
          title_empty: category.title.replace(/\s+/g, ""),
          count_courses: courses.length,
          courses: COURSES_C,
        };
      });

      // 4) Helper seguro para campañas (ids pueden ser ObjectId o {_id})
      const getCampaignCourses = async (campaign) => {
        if (!campaign || !campaign.courses || campaign.courses.length === 0)
          return [];
        const courseIds = campaign.courses.map((c) => c?._id ?? c);
        const courses = await models.Course.aggregate([
          { $match: { _id: { $in: courseIds } } },
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
              AVG_RATING: { $ifNull: [{ $avg: "$reviews.rating" }, 0] },
              N_CLASES: { $size: "$clases" },
            },
          },
        ]);
        return courses.map((c) => {
          return resource.Course.api_resource_course(
            c,
            null,
            c.N_STUDENTS,
            c.N_REVIEWS,
            Number(c.AVG_RATING).toFixed(2),
            c.N_CLASES
          );
        });
      };

      // 5) Campañas banner y flash
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

      // 6) Respuesta
      res.status(200).json({
        categories: CATEGORIES_LIST,
        courses_top: COURSES_TOPS,
        categories_sections: CATEGORIES_SECTIONS,
        courses_banners: COURSES_BANNERS,
        campaing_banner: Campaing_banner,
        courses_flash: COURSES_FLASH,
        campaing_flash: Campaing_flash,
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "Ocurrio un error" });
    }
  },

  show_course: async (req, res) => {
    try {
      const user = req.headers.token
        ? await token.decode(req.headers.token).catch(() => null)
        : null;

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

      // ¿El usuario ya tiene el curso?
      let STUDENT_HAVE_COURSE = false;
      if (user) {
        const IS_HAVE_COURSE = await models.CourseStudent.findOne({
          course: COURSE._id,
          user: user._id,
        });
        STUDENT_HAVE_COURSE = !!IS_HAVE_COURSE;
      }

      // Secciones + clases + archivos (malla curricular)
      const SECTIONS = await models.CourseSection.find({ course: COURSE._id });
      const MALLA_CURRICULAR = [];
      let TIME_TOTAL_SECTIONS = [];
      let FILES_TOTAL_SECTIONS = 0;
      let NUMERO_TOTAL_CLASES = 0;

      // Cargar clases por sección en paralelo
      await Promise.all(
        SECTIONS.map(async (_sec) => {
          const SECTION = _sec.toObject();

          const CLASES_SECTION = await models.CourseClase.find({
            section: SECTION._id,
          }).sort({ createdAt: -1 });
          const CLASES_NEWS = [];
          let TIME_CLASES = [];

          // Cargar archivos por clase en paralelo
          await Promise.all(
            CLASES_SECTION.map(async (_cl) => {
              const CLASE = _cl.toObject();

              const ClaseFiles = await models.CourseClaseFile.find({
                clase: CLASE._id,
              });
              CLASE.files = ClaseFiles.map((cf) => ({
                _id: cf._id,
                file:
                  (process.env.URL_BACKEND || "") +
                  "/api/course_clase/file-clase/" +
                  cf.file,
                file_name: cf.file_name,
                size: cf.size,
                clase: cf.clase,
              }));

              FILES_TOTAL_SECTIONS += CLASE.files.length;

              CLASE.vimeo_id = CLASE.vimeo_id
                ? "https://player.vimeo.com/video/" + CLASE.vimeo_id
                : null;

              // Tiempos
              const time_clase = [CLASE.time].filter(Boolean);
              const tiempoTotal = time_clase.length
                ? sumarTiempos(...time_clase)
                : 0;
              CLASE.time_parse = tiempoTotal;

              TIME_CLASES.push(CLASE.time);
              TIME_TOTAL_SECTIONS.push(CLASE.time);

              CLASES_NEWS.push(CLASE);
            })
          );

          NUMERO_TOTAL_CLASES += CLASES_NEWS.length;
          SECTION.clases = CLASES_NEWS;
          SECTION.time_parse = TIME_CLASES.length
            ? sumarTiempos(...TIME_CLASES)
            : 0;

          MALLA_CURRICULAR.push(SECTION);
        })
      );

      const TIME_TOTAL_COURSE = TIME_TOTAL_SECTIONS.length
        ? sumarTiempos(...TIME_TOTAL_SECTIONS)
        : 0;

      // Cursos del mismo instructor (relacionados por instructor)
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

      // Cursos relacionados por categoría (mismo curso excluido)
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

      // Armar cards de relacionados (con descuento y meta)
      const [N_COURSE_INSTRUCTOR, N_COURSE_RELATEDS] = await Promise.all([
        Promise.all(
          COURSE_INSTRUCTOR.map(async (ci) => {
            const DISCOUNT_G = DISCOUNT_G_F(Campaing_Normal, ci);
            const meta = await COURSE_META_INFO(ci);
            const nClases = await N_CLASES_OF_COURSES(ci); // si tienes una versión agregada, cámbiala por performance
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

      // Reviews del curso
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

      // Promedio ponderado (sumatorio de ratings / total de reviews)
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

      // Descuento para el curso principal
      const DISCOUNT_G = DISCOUNT_G_F(Campaing_Normal, COURSE);

      return res.status(200).json({
        course: resource.Course.api_resource_course_landing(
          COURSE,
          DISCOUNT_G,
          MALLA_CURRICULAR,
          TIME_TOTAL_COURSE,
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
            full_name: `${review.user?.name || ""} ${
              review.user?.surname || ""
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
      console.log(error);
      return res.status(500).send({ message: "OCURRIO UN ERROR" });
    }
  },

  search_course: async (req, res) => {
    try {
      let TIME_NOW = req.query.TIME_NOW;
      // Compatible con 'q' (frontend) y 'search' (backend/postman)
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
            foreignField: "product", // Cambiado de 'course' a 'product'
            as: "reviews",
          },
        });
        filters.push({
          $addFields: {
            avgRanting: {
              $avg: "$reviews.rating",
            },
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
              { product_type: "course" }, // Aseguramos que solo sean reviews de cursos
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
      let Courses = await models.Course.aggregate(
        filters
        // [
        // {$match: { state: 2, title: new RegExp(search_course,'i')}},
        // {$match: { categorie: {$in: selected_categories } }},
        // ]
      );

      // CAMPAING NORMAL
      let Campaing_home = await models.Discount.findOne({
        type_campaign: 1,
        start_date_num: { $lte: TIME_NOW }, // TIME_NOW >= start_date_num 10
        end_date_num: { $gte: TIME_NOW }, // TIME_NOW <= end_date_num 20
      });

      let COURSES = [];
      for (const Course of Courses) {
        let DISCOUNT_G = DISCOUNT_G_F(Campaing_home, Course);
        // N_CLASES no se usa en esta versión del resource, así que se puede omitir la llamada
        COURSES.push(resource.Course.api_resource_course(Course, DISCOUNT_G));
      }

      res.status(200).json({
        courses: COURSES,
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN ERROR",
      });
    }
  },
  config_all: async (req, res) => {
    try {
      // OPTIMIZADO CON AGREGACIONES
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

      // OPTIMIZADO CON AGREGACIONES
      const N_LEVELS = await models.Course.aggregate([
        { $match: { level: { $in: levels } } },
        { $group: { _id: "$level", count_course: { $sum: 1 } } },
        { $project: { name: "$_id", count_course: 1, _id: 0 } },
      ]);

      let idiomas = ["Ingles", "Español", "Portugues", "Aleman"];

      // OPTIMIZADO CON AGREGACIONES
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
      console.log(error);
      res.status(500).send({
        message: "OCURRIO UN ERROR",
      });
    }
  },
};
