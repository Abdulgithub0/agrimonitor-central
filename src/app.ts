import express from 'express';
import cors from 'cors';
import path from 'path';
import { weatherRouter } from './routes/weather.routes';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', weatherRouter);
app.use(express.static(path.join(__dirname, '../public')));

export { app };
