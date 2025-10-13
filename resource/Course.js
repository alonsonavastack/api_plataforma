// Función interna para evitar la dependencia de `this` y asegurar la robustez.
function resource_course(course, discount_g = null, N_CLASES = 0, N_STUDENTS = 0, N_REVIEWS = 0, AVG_RATING = 0) {
    let final_price_usd = course.price_usd;
    let final_price_mxn = course.price_mxn;
    let discount_active = null;

    if (discount_g) {
        discount_active = {
            _id: discount_g._id,
            type_campaign: discount_g.type_campaign,
            type_discount: discount_g.type_discount,
            discount: discount_g.discount,
            end_date: discount_g.end_date,
        };
        if (discount_g.type_discount == 1) { // Porcentaje
            final_price_usd = parseFloat((final_price_usd - (final_price_usd * discount_g.discount * 0.01)).toFixed(2));
            final_price_mxn = parseFloat((final_price_mxn - (final_price_mxn * discount_g.discount * 0.01)).toFixed(2));
        } else { // Monto fijo
            final_price_usd = Math.max(0, parseFloat((final_price_usd - discount_g.discount).toFixed(2)));
            // Nota: El descuento fijo se aplica directamente. Si se necesita un tipo de cambio para MXN, se implementaría aquí.
            // Asumimos que el descuento fijo es en USD y se aplica de forma similar a MXN por simplicidad.
            final_price_mxn = Math.max(0, parseFloat((final_price_mxn - discount_g.discount).toFixed(2)));
        }
    }

    return {
        _id: course._id,
        title: course.title,
        slug: course.slug,
        subtitle: course.subtitle,
        imagen: course.imagen, // Devolvemos solo el nombre del archivo
        categorie: course.categorie ? { _id: course.categorie._id, title: course.categorie.title } : null,
        user: course.user ? {
            _id: course.user._id,
            name: course.user.name,
            surname: course.user.surname,
            avatar: course.user.avatar, // Devolvemos solo el nombre del archivo
        } : null,
        level: course.level,
        idioma: course.idioma,
        price_mxn: course.price_mxn,
        price_usd: course.price_usd,
        final_price_mxn: final_price_mxn,
        final_price_usd: final_price_usd,
        discount_active: discount_active,
        state: course.state,
        N_CLASES: N_CLASES,
        N_STUDENTS: N_STUDENTS,
        N_REVIEWS: N_REVIEWS,
        AVG_RATING: AVG_RATING,
    }
}

export default {
    api_resource_course: resource_course,
    // Para la página de detalle del curso
    api_resource_course_landing: (course, discount_g = null, MALLA_CURRICULAR, TIME_TOTAL_COURSE, FILES_TOTAL_SECTIONS, COUNT_COURSE_INSTRUCTOR, NUMERO_TOTAL_CLASES, N_STUDENTS, AVG_RATING, NUM_REVIEW, N_STUDENTS_SUM_TOTAL, NUM_REVIEW_SUM_TOTAL, AVG_RATING_INSTRUCTOR) => {
        let base_course = resource_course(course, discount_g, NUMERO_TOTAL_CLASES, N_STUDENTS, NUM_REVIEW, AVG_RATING);
        
        return {
            ...base_course,
            description: course.description,
            requirements: course.requirements,
            who_is_it_for: course.who_is_it_for,
            malla_curricular: MALLA_CURRICULAR,
            time_total_course: TIME_TOTAL_COURSE,
            files_total_sections: FILES_TOTAL_SECTIONS,
            instructor_info: {
                count_course_instructor: COUNT_COURSE_INSTRUCTOR,
                n_students_sum_total: N_STUDENTS_SUM_TOTAL,
                num_review_sum_total: NUM_REVIEW_SUM_TOTAL,
                avg_rating_instructor: AVG_RATING_INSTRUCTOR,
            }
        }
    }
}