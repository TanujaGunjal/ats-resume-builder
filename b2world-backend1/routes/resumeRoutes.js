const express = require('express');
const router = express.Router();

const resumeController = require('../controllers/resumeController');
const authMiddleware = require('../middlewares/authMiddleware');
const { pdfDownloadLimiter } = require('../middlewares/rateLimitMiddleware');

router.use(authMiddleware);

// Create resume
router.post('/create', resumeController.createResume);

// Get all resumes (both endpoints work — / is alias for /my-resumes)
router.get('/', resumeController.getMyResumes);
router.get('/my-resumes', resumeController.getMyResumes);

// Download PDF (keep above /:id)
router.get('/download/pdf/:id', pdfDownloadLimiter, resumeController.downloadResumePDF);

// Update template only (fast endpoint for template changes)
router.patch('/:id/template', resumeController.updateTemplate);

// Update resume
router.put('/update/:id', resumeController.updateResume);

// Delete resume
router.delete('/delete/:id', resumeController.deleteResume);

// Get single resume (MUST be last)
router.get('/:id', resumeController.getResumeById);

module.exports = router;