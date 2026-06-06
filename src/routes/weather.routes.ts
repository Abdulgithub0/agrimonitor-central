import { Router } from 'express';
import { WeatherController } from '../controllers/WeatherController';
import { upload } from '../middleware/multerConfig';

const weatherRouter = Router();
const controller = new WeatherController();

weatherRouter.get('/locations/weather', (req, res) => controller.getMultiLocationWeather(req, res));
weatherRouter.get('/geo-detect', (req, res) => controller.getGeoDetect(req, res));
weatherRouter.get('/usage', (req, res) => controller.getUsage(req, res));
weatherRouter.get('/trees/quota', (req, res) => controller.getTreeQuota(req, res));
weatherRouter.post('/trees/analyze', upload.single('image'), (req, res) => controller.analyzeTree(req, res));
weatherRouter.get('/trees/history', (req, res) => controller.getTreeHistory(req, res));

export { weatherRouter };
