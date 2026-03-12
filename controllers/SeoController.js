import Project from '../models/Project.js';
import dotenv from 'dotenv';
dotenv.config();

const SeoController = {
    async renderProjectOgTags(req, res) {
        try {
            const { id } = req.params;

            // Find project
            const project = await Project.findById(id);

            if (!project) {
                return res.status(404).send('<!DOCTYPE html><html><head><title>Proyecto no encontrado</title></head><body></body></html>');
            }

            // Build dynamic metadata
            const baseUrl = 'https://devhubsharks.com';
            const apiUrl = process.env.URL_BACKEND || 'https://api.devhubsharks.com';

            const title = `${project.title} | Dev Hub Sharks`;
            const description = project.subtitle || project.description || 'Proyecto práctico en Dev Hub Sharks';

            // La URL que facebook lee (sin hash)
            const url = `${baseUrl}/project-detail/${project._id}`;
            // La URL a donde debemos redirigir a los humanos reales (con hash)
            const redirectUrl = `${baseUrl}/#/project-detail/${project._id}`;

            // Mongoose getter or building url
            const imageUrl = project.imagen ? `${apiUrl}/api/projects/uploads/projects/${project.imagen}` : `${baseUrl}/assets/logo.png`;

            const html = `<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>${title}</title>
    
    <!-- SEO Meta Tags -->
    <meta name="description" content="${description}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="article">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:site_name" content="Dev Hub Sharks">
    
    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${url}">
    <meta property="twitter:title" content="${title}">
    <meta property="twitter:description" content="${description}">
    <meta property="twitter:image" content="${imageUrl}">
    
    <!-- Redirect for normal users if they hit this endpoint by accident -->
    <script>
        window.location.href = "${redirectUrl}";
    </script>
</head>
<body>
    <h1>${title}</h1>
    <p>${description}</p>
    <img src="${imageUrl}" alt="${title}">
    <script>
        window.location.href = "${redirectUrl}";
    </script>
</body>
</html>`;

            res.setHeader('Content-Type', 'text/html');
            res.send(html);

        } catch (error) {
            console.error('Error generating Bot SEO tags:', error);
            res.status(500).send('<!DOCTYPE html><html><head><title>Error</title></head><body></body></html>');
        }
    }
};

export default SeoController;
