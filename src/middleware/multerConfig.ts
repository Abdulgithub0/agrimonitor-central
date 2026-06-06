import multer from 'multer';

// Keep the file in memory so we can forward the raw buffer to the WeatherAI API
// without writing anything to disk.
export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, and WebP images are accepted.'));
        }
    }
});
