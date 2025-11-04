// middlewares/cors.js
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

const allowed = [ 
  process.env.FRONTEND_URL, 
  process.env.BACKEND_URL,
  'http://localhost',
 // /\.ngrok-free\.app$/
].filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowed.some((rule) => 
        rule instanceof RegExp ? rule.test(origin) : rule === origin
      )) {
      console.log(`CORS allowed for origin: ${origin}`);
      callback(null, true);
    } else {
      console.warn(`CORS denied for origin: ${origin}`);
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS', 'UPDATE'],           // preflight methods
  allowedHeaders: ['Content-Type','Authorization', 'Access-Control-Allow-Origin', "X-CSRF-Token", 'Cache-Control', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host'],                
  credentials: true, 
};
const corsMiddleware = cors(corsOptions);
export default corsMiddleware;