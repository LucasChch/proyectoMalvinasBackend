// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Configuración de multer para almacenar el archivo en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Endpoint para subir el archivo Excel y parsearlo
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    // Lee el archivo desde el buffer
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // Usamos la primera hoja
    const sheet = workbook.Sheets[sheetName];
    // Convierte la hoja a JSON; se puede configurar para tomar la primera fila como header
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    // Separa el header de los registros
    const headers = data[0];
    const records = data.slice(1).map((row) => {
      let record = {};
      headers.forEach((header, index) => {
        record[header] = row[index];
      });
      // Agregamos una propiedad para seleccionar el registro en el front-end
      record.selected = false;
      return record;
    });

    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint para enviar correos a los emails seleccionados
app.post('/send-email', upload.single('attachment'), async (req, res) => {
  let { emails, subject, message } = req.body;
  console.log(emails, subject, message);

  if (!emails || !emails.length) {
    return res.status(400).json({ success: false, error: 'No hay correos para enviar' });
  }

  try {
    // Configura el transporter. Cambia los datos de host, port, user y pass por los de tu SMTP.
    let transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
         user: process.env.SMTP_USER,
         pass: process.env.SMTP_PASS
      },
      logger: true,
      debug: false
    });
    
    let attachments = [];
    if (req.file) {
      attachments.push({
        filename: req.file.originalname,
        content: req.file.buffer,
        contentType: req.file.mimetype
      });
    }

     // Convertir emails a un array si viene como string
    try {
      if (typeof emails === 'string') {
        emails = JSON.parse(emails);
      }
    } catch (e) {
      return res.status(400).json({ success: false, error: 'El formato de emails no es válido' });
    }

    // Envía el correo a cada email de la lista
    // for (let email of emails) {
    //   console.log('---------- INICIO CORREO PARA:', email);
    //   await transporter.sendMail({
    //     from: process.env.SMTP_USER,
    //     to: email,
    //     subject: subject,
    //     text: message,
    //     attachments:attachments
    //     // También puedes enviar HTML:
    //     // html: `<p>${message}</p>`
    //   });
    //   console.log('---------- FIN CORREO PARA:', email);
    // }
    console.time('send-emails');
    const mailOptions = {
      from: process.env.SMTP_USER,
      subject: subject,
      text: message,
      attachments: attachments
    };
    await sendEmailsInBatches(transporter, emails, mailOptions, 20);
    console.timeEnd('send-emails');
    res.json({ success: true, message: 'Correos enviados' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function sendEmailsInBatches(transporter, emails, mailOptions, batchSize = 20) {
  for (let i = 0; i < emails.length; i += batchSize) {
    console.log('Enviando lote:', i, 'a', i + batchSize);
    const batch = emails.slice(i, i + batchSize);
    const batchPromises = batch.map(email => {
      console.log('Enviando correo a:', email);
      return transporter.sendMail({ ...mailOptions, to: email });
    });
    await Promise.all(batchPromises); // Espera a que termine el lote antes de continuar
  }
}

app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
