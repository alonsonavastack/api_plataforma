/**
 * ROUTER: Open Graph Share
 * Sirve meta tags OG para que Facebook/WhatsApp lean imagen, título y descripción.
 *
 * URL que se comparte: https://api.devhubsharks.com/api/share/project/ID
 * El scraper de FB llama a esa URL → lee las <meta> → muestra imagen en el preview.
 * El usuario humano que hace clic → es redirigido a devhubsharks.com/#/project-detail/ID
 */

import express from 'express';
import Project from '../models/Project.js';
import Course from '../models/Course.js';

const router = express.Router();

const API_URL = 'https://api.devhubsharks.com';
const FRONTEND_URL = 'https://devhubsharks.com';
const SITE_NAME = 'Dev Hub Sharks';

// ── Resolver URL de imagen usando los endpoints existentes del API ─────────────
function resolveProjectImageUrl(imagen) {
    if (!imagen) return null;
    if (imagen.startsWith('http://') || imagen.startsWith('https://')) return imagen;
    // Las imágenes de proyectos se sirven desde /api/projects/imagen-project/:img
    return `${API_URL}/api/projects/imagen-project/${imagen}`;
}

function resolveCourseImageUrl(imagen) {
    if (!imagen) return null;
    if (imagen.startsWith('http://') || imagen.startsWith('https://')) return imagen;
    // Las imágenes de cursos se sirven desde /api/courses/imagen-course/:img
    return `${API_URL}/api/courses/imagen-course/${imagen}`;
}

// ── Generar HTML con meta OG ─────────────────────────────────────────────────
function buildOgHtml({ title, description, image, redirectUrl, shareUrl }) {
    const cleanDesc = (description || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200);

    const fullTitle = `${title} | ${SITE_NAME}`;

    // Usar HTTPS siempre para la imagen (requerido por Facebook)
    const safeImage = image || `${API_URL}/uploads/default.jpg`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${fullTitle}</title>

  <!-- Open Graph (Facebook, WhatsApp, LinkedIn) -->
  <meta property="og:type"         content="website">
  <meta property="og:title"        content="${fullTitle}">
  <meta property="og:description"  content="${cleanDesc}">
  <meta property="og:image"        content="${safeImage}">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url"          content="${shareUrl}">
  <meta property="og:site_name"    content="${SITE_NAME}">
  <meta property="og:locale"       content="es_MX">

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${fullTitle}">
  <meta name="twitter:description" content="${cleanDesc}">
  <meta name="twitter:image"       content="${safeImage}">

  <!-- Redirigir al usuario real al frontend Angular -->
  <meta http-equiv="refresh" content="0; url=${redirectUrl}">
</head>
<body>
  <p>Redirigiendo... <a href="${redirectUrl}">clic aquí si no redirige</a></p>
  <script>window.location.replace("${redirectUrl}");</script>
</body>
</html>`;
}

// ── GET /share/project/:id ────────────────────────────────────────────────────
router.get('/project/:id', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id)
            .select('title description imagen price_mxn isFree')
            .lean();

        if (!project) return res.redirect(`${FRONTEND_URL}/#/`);

        const image = resolveProjectImageUrl(project.imagen);
        const redirectUrl = `${FRONTEND_URL}/#/project-detail/${req.params.id}`;
        const shareUrl = `${API_URL}/api/share/project/${req.params.id}`;
        const price = project.isFree ? 'Gratis' : `$${parseFloat(project.price_mxn || 0).toFixed(2)} MXN`;
        const description = `${price} — ${project.description || ''}`;

        console.log(`[OgShare] project ${req.params.id} → imagen: ${image}`);

        const html = buildOgHtml({ title: project.title, description, image, redirectUrl, shareUrl });

        res.set('Cache-Control', 'no-cache'); // Sin cache para que FB siempre lea fresco
        res.set('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
    } catch (err) {
        console.error('[OgShare] /project/:id error:', err.message);
        return res.redirect(`${FRONTEND_URL}/#/`);
    }
});

// ── GET /share/course/:id ─────────────────────────────────────────────────────
router.get('/course/:id', async (req, res) => {
    try {
        const course = await Course.findById(req.params.id)
            .select('title description imagen price isFree')
            .lean();

        if (!course) return res.redirect(`${FRONTEND_URL}/#/`);

        const image = resolveCourseImageUrl(course.imagen);
        const redirectUrl = `${FRONTEND_URL}/#/course-detail/${req.params.id}`;
        const shareUrl = `${API_URL}/api/share/course/${req.params.id}`;
        const price = course.isFree ? 'Gratis' : `$${parseFloat(course.price || 0).toFixed(2)} MXN`;
        const description = `${price} — ${course.description || ''}`;

        console.log(`[OgShare] course ${req.params.id} → imagen: ${image}`);

        const html = buildOgHtml({ title: course.title, description, image, redirectUrl, shareUrl });

        res.set('Cache-Control', 'no-cache');
        res.set('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
    } catch (err) {
        console.error('[OgShare] /course/:id error:', err.message);
        return res.redirect(`${FRONTEND_URL}/#/`);
    }
});

export default router;
