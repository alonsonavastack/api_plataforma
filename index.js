import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url';
import mongoose from 'mongoose'
import router from './router/index.js';

// CONEXION A LA BASE DE DATOS
mongoose.Promise = global.Promise
const dbUrl = process.env.MONGO_URI;
mongoose.connect(
    dbUrl, {
        useNewUrlParser: true,
        useUnifiedTopology:true,
    }
).then(mongoose => console.log("Conectado a la base de datos MongoDB."))
.catch(err => console.log(err));

const app = express();
app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.urlencoded({extended: true}))
app.use(express.static(path.join(__dirname,'public')))
app.use('/api/',router)

app.set('port', process.env.PUERTO || 3000);

app.listen(app.get('port'), () => {
    console.log(`EL SERVIDOR SE ESTA EJECUTANDO EN EL PUERTO ${app.get('port')}`)
})