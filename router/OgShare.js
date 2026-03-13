/**
 * ROUTER: Open Graph Share
 * Sirve meta tags OG para que Facebook/WhatsApp lean imagen, título y descripción.
 *
 * URL que se comparte: https://api.devhubsharks.com/share/project/ID
 * El scraper de FB llama a esa URL → lee las <meta> → muestra imagen en el preview.
 * El usuario humano que hace clic → es redirigido a devhubsharks.com/#/project-detail/ID
 */

import express from 'express';
import Project from '../models/Project.js';
import Course from '../models/Course.js';

const router = express.Router();

const API_URL      = 'https://api.devhubsharks.com';   // dominio de TU API
const FRONTEND_URL = 'https://devhubsharks.com';        // dominio del FRONTEND
const SITE_NAME    = 'Dev Hub Sharks';
const DEFAULT_IMG  = `${API_URL}/uploads/og-default.jpg`; // imagen fallback 1200×630px (opcional)

// ── Resolver URL de imagen ────────────────────────────────────────────────────
function resolveImageUrl(imagen) {
    if (!imagen) return DEFAULT_IMG;
    if (imagen.startsWith('http://') || imagen.startsWith('https://')) return imagen;
    // Ruta relativa guardada como "uploads/xxx.jpg" o "/uploads/xxx.jpg"
    const clean = imagen.startsWith('/') ? imagen : `/${imagen}`;
    return `${API_URL}${clean}`;
}

// ── Generar HTML con meta OG ─────────────────────────────────────────────────
function buildOgHtml({ title, description, image, redirectUrl }) {
    const cleanDesc = (description || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200);

    const fullTitle = `${title} | ${SITE_NAME}`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${fullTitle}</title>

  <!-- Open Graph (Facebook, WhatsApp, LinkedIn) -->
  <meta property="og:type"         content="website">
  <meta property="og:title"        content="${fullTitle}">
  <meta property="og:description"  content="${cleanDesc}">
  <meta property="og:image"        content="${image}">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:type"   content="image/jpeg">
  <meta property="og:url"          content="${redirectUrl}">
  <meta property="og:site_name"    content="${SITE_NAME}">
  <meta property="og:locale"       content="es_MX">

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${fullTitle}">
  <meta name="twitter:description" content="${cleanDesc}">
  <meta name="twitter:image"       content="${image}">

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

        const image       = resolveImageUrl(project.imagen);
        const redirectUrl = `${FRONTEND_URL}/#/project-detail/${req.params.id}`;
        const price       = project.isFree ? 'Gratis' : `$${parseFloat(project.price_mxn).toFixed(2)} MXN`;
        const description = `${price} — ${project.description || ''}`;

        const html = buildOgHtml({ title: project.title, description, image, redirectUrl });

        res.set('Cache-Control', 'public, max-age=3600');
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

        const image       = resolveImageUrl(course.imagen);
        const redirectUrl = `${FRONTEND_URL}/#/course-detail/${req.params.id}`;
        const price       = course.isFree ? 'Gratis' : `$${parseFloat(course.price).toFixed(2)} MXN`;
        const description = `${price} — ${course.description || ''}`;

        const html = buildOgHtml({ title: course.title, description, image, redirectUrl });

        res.set('Cache-Control', 'public, max-age=3600');
        res.set('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
    } catch (err) {
        console.error('[OgShare] /course/:id error:', err.message);
        return res.redirect(`${FRONTEND_URL}/#/`);
    }
});

export default router;
