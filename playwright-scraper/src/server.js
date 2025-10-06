import express from 'express';
import dotenv from 'dotenv';
import { router } from './routes.js';

dotenv.config();

const app = express();
app.use((req, _res, next) => {
  _res.setHeader('X-Powered-By', 'adapters-playwright');
  next();
});

app.use('/', router);

const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, () => console.log(`▶ listening on http://localhost:${PORT}`));
