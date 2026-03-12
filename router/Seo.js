import express from 'express';
import SeoController from '../controllers/SeoController.js';

const router = express.Router();

// Bot proxy for Project
router.get('/project/:id', SeoController.renderProjectOgTags);

export default router;
