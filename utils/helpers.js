import models from '../models/index.js';

export async function N_CLASES_OF_COURSES(Course){
    // SON LAS SECCIONES QUE TIENE UN CURSO
    let SECTIONS = await models.CourseSection.find({course: Course._id});
    let N_CLASES = 0;
    for (const SECTION of SECTIONS) {
        let CLASES = await models.CourseClase.count({section: SECTION._id});
        N_CLASES += CLASES;
    }
    return N_CLASES;
}

export function sumarTiempos(...tiempos) {
    const totalSegundos = tiempos.reduce((acc, tiempo) => {
        return acc + (Number(tiempo) || 0);
    }, 0);

    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = Math.floor(totalSegundos % 60);

    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
}